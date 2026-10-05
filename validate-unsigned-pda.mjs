// Offline validation only. This module has no RPC, wallet, signing, or sending code.
// Usage: node validate-unsigned-pda.mjs --self-test
//        node validate-unsigned-pda.mjs TRANSACTION_BASE64_FILE EXPECTED_JSON_FILE
// expected = {commit, imageDigest, deployedSlot, pda?, operation: 'initialize'|'init'|'update'}
// deployedSlot may be a decimal string, bigint, or safe integer. imageDigest is a full
// immutable image reference (registry/repository@sha256:...). No expected value is
// inferred from transaction content. The pinned authority still needs a fresh chain check.
import assert from 'node:assert/strict';
import {createHash,verify as cryptoVerify} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const EXPECTED = Object.freeze({
  authority:'8x7MM5maL2vQPpqeiLWBiPKk6VK4BRZ9qG5jqoP9eta1',
  program:'BtFP1XpKdZgAiivKJQ6pFr1fuHpeNTHhjyskDbSUtHqj',
  programData:'22DKa13W514H2Yt9oc54wKtyyxYwQRQmN6Xb4wKYMNfh',
  programSHA256:'7db37174011a0a5736cae8558ddc81ae48dfdb0f58ce62ef0dff182064ed659d',
  programBytes:87160,
  otter:'verifycLy8mB96wd9wqq3WDXQwM4oU6r42Th37Db9fC',
  system:'11111111111111111111111111111111',
  computeBudget:'ComputeBudget111111111111111111111111111111',
  // Derived independently using PublicKey.findProgramAddressSync and seeds
  // [UTF8('otter_verify'), authority bytes, target program bytes], Otter program.
  pda:'DCULQHBJbx3PssnPFYTcqZmKJcezmou2yMqhcH9D5VyW',
  bump:255,
  version:'0.5.1',
  gitUrl:'https://github.com/ElTrueque/fast-launch-solana',
});
const DISCRIMINATORS = Object.freeze({initialize:'afaf6d1f0d989bed',update:'dbc858b09e3ffd7f'});
const ACCOUNT_DISCRIMINATOR = createHash('sha256').update('account:BuildParams').digest().subarray(0,8);
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
function verifyEd25519(message,signature,publicKey){
  return cryptoVerify(null,message,{key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),publicKey]),format:'der',type:'spki'},signature);
}
function check(condition,message){if(!condition)throw new Error(message);}
function base58(bytes){
  let n=0n;for(const b of bytes)n=(n<<8n)|BigInt(b);
  let s='';while(n){s=ALPHABET[Number(n%58n)]+s;n/=58n;}
  for(const b of bytes){if(b!==0)break;s='1'+s;}return s;
}
function keyBytes(value){
  check(typeof value==='string'&&value.length>=32&&value.length<=44,'Invalid public key');
  let n=0n;for(const c of value){const d=ALPHABET.indexOf(c);check(d>=0,'Invalid base58 character');n=n*58n+BigInt(d);}
  const a=[];while(n){a.unshift(Number(n&255n));n>>=8n;}
  for(const c of value){if(c!=='1')break;a.unshift(0);}
  const b=Buffer.from(a);check(b.length===32&&base58(b)===value,'Noncanonical 32-byte public key');return b;
}
function decodeBase64(value,maxBytes){
  check(typeof value==='string','Base64 must be a string');const s=value.trim();
  check(s.length>0&&s.length<=4*Math.ceil(maxBytes/3),'Invalid base64 size');
  check(s.length%4===0&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s),'Invalid canonical base64');
  const b=Buffer.from(s,'base64');check(b.length<=maxBytes&&b.toString('base64')===s,'Noncanonical base64');return b;
}
class Reader{
  constructor(bytes){this.b=bytes;this.p=0;}
  get remaining(){return this.b.length-this.p;}
  bytes(n){check(Number.isSafeInteger(n)&&n>=0&&n<=this.remaining,'Truncated binary data');const b=this.b.subarray(this.p,this.p+n);this.p+=n;return b;}
  u8(){return this.bytes(1)[0];}
  u32(){return this.bytes(4).readUInt32LE();}
  u64(){return this.bytes(8).readBigUInt64LE().toString();}
  shortvec(){
    let n=0;for(let i=0;i<3;i++){
      const b=this.u8();check(i<2||(b&0xfc)===0,'Shortvec exceeds u16');n|=(b&127)<<(i*7);
      if(!(b&128)){check(i===0||(b&127)!==0,'Noncanonical shortvec');return n;}
    }throw new Error('Unterminated shortvec');
  }
  string(){const n=this.u32();check(n<=4096,'Oversized Borsh string');return utf8.decode(this.bytes(n));}
  end(){check(this.remaining===0,'Unexpected trailing bytes');}
}
function readMetadata(r){
  const version=r.string(),gitUrl=r.string(),commit=r.string(),count=r.u32();
  check(count<=64,'Oversized Borsh argument vector');const args=[];
  for(let i=0;i<count;i++)args.push(r.string());
  return {version,gitUrl,commit,args,deployedSlot:r.u64()};
}
function asU64(value){
  if(typeof value==='number')check(Number.isSafeInteger(value)&&value>=0,'Expected slot must be a safe unsigned integer');
  check(['string','bigint','number'].includes(typeof value)&&/^(0|[1-9][0-9]*)$/.test(String(value)),'Expected slot must be canonical decimal');
  const n=BigInt(value);check(n<=0xffffffffffffffffn,'Expected slot exceeds u64');return n.toString();
}
function normalizeExpected(e,{requireOperation=true}={}){
  check(e&&typeof e==='object'&&!Array.isArray(e),'Explicit expected metadata is required');
  check(typeof e.commit==='string'&&/^[a-f0-9]{40}$/.test(e.commit),'Expected commit must be 40 lowercase hex characters');
  check(typeof e.imageDigest==='string'&&/^[a-z0-9][a-z0-9._/:\-]*@sha256:[a-f0-9]{64}$/.test(e.imageDigest),'Expected image must be an immutable full SHA256 image reference');
  const pda=e.pda??EXPECTED.pda;keyBytes(pda);check(pda===EXPECTED.pda,'Expected PDA differs from independently derived PDA');
  const operation=e.operation==='init'?'initialize':e.operation;
  if(requireOperation)check(Object.hasOwn(DISCRIMINATORS,operation),'Expected operation must be initialize/init or update');
  return {commit:e.commit,imageDigest:e.imageDigest,deployedSlot:asU64(e.deployedSlot),pda,operation};
}
function expectedArgs(imageDigest){return ['--mount-path','source','--workspace-path','source/program','--library-name','el_trueque_fast_solana','--base-image',imageDigest,'--arch','v3'];}
function compareMetadata(m,e){
  check(m.version===EXPECTED.version,'Unexpected verifier version');check(m.gitUrl===EXPECTED.gitUrl,'Unexpected repository URL');
  check(m.commit===e.commit,'Unexpected source commit');
  check(JSON.stringify(m.args)===JSON.stringify(expectedArgs(e.imageDigest)),'Unexpected build arguments');
  check(m.deployedSlot===e.deployedSlot,'Unexpected deployed slot');
}

export function validateUnsigned(base64Transaction,expected){
  const e=normalizeExpected(expected),wire=decodeBase64(base64Transaction,1232),r=new Reader(wire);
  check(r.shortvec()===1,'Exactly one signature slot is required');
  check(r.bytes(64).every(b=>b===0),'Transaction must have an all-zero unsigned signature');
  const messageOffset=r.p,requiredSignatures=r.u8();check((requiredSignatures&128)===0,'Only legacy messages are accepted');
  const readonlySigned=r.u8(),readonlyUnsigned=r.u8();
  check(requiredSignatures===1&&readonlySigned===0&&readonlyUnsigned===4,'Unexpected signer or writable account header');
  const count=r.shortvec();check(count===6,'Exactly six account keys are required');
  const accountKeys=[];for(let i=0;i<count;i++)accountKeys.push(base58(r.bytes(32)));
  check(new Set(accountKeys).size===6,'Duplicate account keys');check(accountKeys[0]===EXPECTED.authority,'Payer must be the expected sole authority');
  const allowed=[EXPECTED.authority,e.pda,EXPECTED.program,EXPECTED.system,EXPECTED.computeBudget,EXPECTED.otter];
  check(accountKeys.every(k=>allowed.includes(k)),'Unexpected account key');
  const accounts=accountKeys.map((address,i)=>({address,signer:i<requiredSignatures,writable:i<requiredSignatures?i<requiredSignatures-readonlySigned:i<count-readonlyUnsigned}));
  for(const a of accounts){
    check(a.signer===(a.address===EXPECTED.authority),'Unexpected account signer privilege');
    check(a.writable===(a.address===EXPECTED.authority||a.address===e.pda),'Unexpected account writable privilege');
  }
  check(r.bytes(32).every(b=>b===0),'Export must have an all-zero recent blockhash');
  check(r.shortvec()===2,'Exactly two instructions are required');const instructions=[];
  for(let i=0;i<2;i++){
    const programIndex=r.u8();check(programIndex<count,'Instruction program index is out of range');
    const n=r.shortvec();check(n<=6,'Unexpected instruction account count');const indices=[...r.bytes(n)];
    check(indices.every(j=>j<count),'Instruction account index is out of range');
    const data=r.bytes(r.shortvec());instructions.push({program:accountKeys[programIndex],accounts:indices.map(j=>accountKeys[j]),data});
  }
  r.end();const [price,otter]=instructions;
  check(price.program===EXPECTED.computeBudget&&price.accounts.length===0,'First instruction must set compute-unit price without accounts');
  check(price.data.length===9&&price.data[0]===3&&price.data.readBigUInt64LE(1)===100000n,'Unexpected compute-unit price instruction');
  check(otter.program===EXPECTED.otter,'Second instruction must invoke Otter verification');
  check(JSON.stringify(otter.accounts)===JSON.stringify([e.pda,EXPECTED.authority,EXPECTED.program,EXPECTED.system]),'Unexpected Otter account order');
  const payload=new Reader(otter.data),discriminator=payload.bytes(8).toString('hex');
  check(discriminator===DISCRIMINATORS[e.operation],'Unexpected Otter instruction discriminator');
  const metadata=readMetadata(payload);payload.end();compareMetadata(metadata,e);
  return {valid:true,kind:'unsigned-legacy-verification-metadata',operation:e.operation,wireBytes:wire.length,wireSHA256:sha(wire),messageSHA256:sha(wire.subarray(messageOffset)),
    payer:EXPECTED.authority,pda:e.pda,targetProgram:EXPECTED.program,accounts,signatureCount:1,signaturesAllZero:true,recentBlockhashAllZero:true,
    computeUnitPriceMicroLamports:'100000',metadata,
    instructions:instructions.map(i=>({program:i.program,accounts:i.accounts,dataHex:i.data.toString('hex')})),
    scope:'Offline structure and expected-value validation only; no chain-state, simulation, fee, signature, or submission claim.'};
}

// Decode a fetched BuildParams account for a preview. Caller must supply its RPC owner.
// Optional expected validates the desired metadata; without it, existing metadata is
// reported as-is. Any unused account allocation must contain only zero padding.
export function decodeMetadataAccount(base64Account,{owner,expected}={}){
  if(base64Account&&typeof base64Account==='object'&&!ArrayBuffer.isView(base64Account)){
    const rpc=base64Account;check(rpc.executable===false,'BuildParams account must not be executable');
    check(Array.isArray(rpc.data)&&rpc.data.length===2&&rpc.data[1]==='base64','RPC account data must use base64 encoding');
    if(owner!==undefined)check(owner===rpc.owner,'Conflicting account owners');
    owner=rpc.owner;base64Account=rpc.data[0];
  }
  check(owner===EXPECTED.otter,'BuildParams account must be owned by the Otter program');
  const data=decodeBase64(base64Account,65536),r=new Reader(data);
  check(r.bytes(8).equals(ACCOUNT_DISCRIMINATOR),'Unexpected BuildParams account discriminator');
  const targetProgram=base58(r.bytes(32)),signer=base58(r.bytes(32));
  check(targetProgram===EXPECTED.program,'Unexpected BuildParams target program');check(signer===EXPECTED.authority,'Unexpected BuildParams signer');
  const metadata=readMetadata(r),bump=r.u8();check(bump===EXPECTED.bump,'Unexpected BuildParams PDA bump');
  const paddingBytes=r.remaining;check(r.bytes(paddingBytes).every(b=>b===0),'Nonzero trailing BuildParams bytes');r.end();
  if(expected)compareMetadata(metadata,normalizeExpected(expected,{requireOperation:false}));
  return {owner,pda:EXPECTED.pda,targetProgram,signer,bump,metadata,accountBytes:data.length,paddingBytes,accountSHA256:sha(data),
    scope:'Decoded bytes only; caller must establish the fetched account address and finalized chain state.'};
}

// Validate the immutable export document before using any of its values in a UI.
// This checks internal consistency, not whether its RPC observations are still fresh
// or whether the source commit/image was actually reproduced by a trusted CI run.
export function validateExportDocument(doc){
  check(doc&&typeof doc==='object'&&!Array.isArray(doc),'Export document must be an object');
  check(doc.format==='fast-solana-otter-unsigned-v1','Unexpected export document format');
  check(doc.neverSigned===true&&doc.submitted===false&&doc.simulationPerformed===false,'Export document must describe an unsigned, unsent, unsimulated export');
  for(const field of ['program','programData','programSHA256','programBytes','authority'])check(doc[field]===EXPECTED[field],'Unexpected document '+field);
  check(doc.metadataPda===EXPECTED.pda&&doc.metadataPdaBump===EXPECTED.bump,'Unexpected document metadata PDA');
  check(doc.repository===EXPECTED.gitUrl&&doc.cliVersion===EXPECTED.version,'Unexpected document repository or CLI version');
  check(/^ghcr\.io\/eltrueque\/fast-launch-solana-builder@sha256:[a-f0-9]{64}$/.test(doc.imageDigest??''),'Unexpected document builder image repository');
  const expected=normalizeExpected({commit:doc.sourceCommit,imageDigest:doc.imageDigest,deployedSlot:doc.deploymentSlot,pda:doc.metadataPda,operation:doc.operation});
  check(JSON.stringify(doc.buildArguments)===JSON.stringify(expectedArgs(expected.imageDigest)),'Unexpected document build arguments');
  const wire=decodeBase64(doc.unsignedTransactionBase64,1232);
  check(doc.transactionSHA256===sha(wire),'Export transaction SHA256 mismatch');
  const transaction=validateUnsigned(doc.unsignedTransactionBase64,expected);
  const finalizedSlot=asU64(doc.finalizedSlot);check(BigInt(finalizedSlot)>=BigInt(expected.deployedSlot),'Finalized snapshot predates the deployment');
  asU64(doc.authorityBalanceLamports);asU64(doc.newMetadataRentExemptMinimumLamports);
  const newMetadataBytes=97+Buffer.byteLength(EXPECTED.version)+Buffer.byteLength(EXPECTED.gitUrl)+Buffer.byteLength(expected.commit)+expectedArgs(expected.imageDigest).reduce((sum,s)=>sum+4+Buffer.byteLength(s),0);
  check(doc.newMetadataBytes===newMetadataBytes,'Unexpected metadata account allocation size');
  check(doc.feeEstimateLamports===null,'Unsigned export must not claim a transaction fee estimate');
  if(doc.cliAssetSHA256!==undefined)check(doc.cliAssetSHA256==='b101230b26d5f75d17d931e5056d1a6253904f65649abe7bedb7b81dd38df114','Unexpected official CLI asset SHA256');
  if(expected.operation==='update'){
    const existing=decodeMetadataAccount(doc.existingMetadataAccount);
    check(doc.existingMetadata&&JSON.stringify(doc.existingMetadata.metadata)===JSON.stringify(existing.metadata),'Existing metadata preview does not match account bytes');
  }else{
    check(doc.existingMetadata===null,'Initialize export must not contain existing metadata');
    if(doc.existingMetadataAccount!==null){
      const a=doc.existingMetadataAccount;check(a&&a.owner===EXPECTED.system&&a.executable===false,'Unexpected uninitialized metadata account');
      check(Array.isArray(a.data)&&a.data.length===2&&a.data[1]==='base64'&&a.data[0]==='','Uninitialized metadata account must have no data');
    }
  }
  check(doc.strictValidation&&typeof doc.strictValidation==='object','Missing strict transaction validation preview');
  assert.deepEqual(doc.strictValidation,transaction,'Saved transaction preview differs from decoded transaction');
  return {...transaction,expected,documentFormat:doc.format,finalizedSlot,newMetadataBytes,
    scope:'Export structure and consistency validated offline; chain freshness, successful builds, simulation, fees and signature authenticity require independent checks.'};
}

// signed:true accepts a nonzero signature and blockhash, and NOTHING ELSE changed.
// Ed25519 is verified against the pinned authority and the exact message bytes.
// signed:false accepts exactly the export bytes unless allowFreshBlockhash:true;
// that option still requires an all-zero signature and changes only the blockhash.
export function validateTransaction(base64Transaction,doc,{signed=false,allowFreshBlockhash=false}={}){
  check(typeof signed==='boolean'&&typeof allowFreshBlockhash==='boolean','Transaction validation options must be boolean');const exported=validateExportDocument(doc);
  const wire=decodeBase64(base64Transaction,1232),original=decodeBase64(doc.unsignedTransactionBase64,1232);
  if(!signed&&!allowFreshBlockhash){
    check(wire.equals(original),'Unsigned transaction differs from the validated export');
    return validateUnsigned(base64Transaction,exported.expected);
  }
  check(wire.length===original.length,'Transaction length differs from export');
  const r=new Reader(wire);check(r.shortvec()===1,'Transaction must have one signature slot');
  const signatureOffset=r.p,signature=r.bytes(64);
  check(signed?signature.some(b=>b!==0):signature.every(b=>b===0),signed?'Signed transaction signature is still zero':'Unsigned transaction signature is nonzero');
  const messageOffset=r.p;r.bytes(3);const keyCount=r.shortvec();check(keyCount===6,'Transaction account count changed');r.bytes(keyCount*32);
  const blockhashOffset=r.p,blockhash=r.bytes(32);if(signed)check(blockhash.some(b=>b!==0),'Signed transaction blockhash is still zero');
  const normalized=Buffer.from(wire);normalized.fill(0,signatureOffset,signatureOffset+64);normalized.fill(0,blockhashOffset,blockhashOffset+32);
  check(normalized.equals(original),'Transaction changed the message beyond its recent blockhash');
  const preview=validateUnsigned(normalized.toString('base64'),exported.expected);
  if(!signed)return {...preview,kind:'unsigned-legacy-verification-metadata',wireSHA256:sha(wire),messageSHA256:sha(wire.subarray(messageOffset)),
    recentBlockhashAllZero:blockhash.every(b=>b===0),recentBlockhash:base58(blockhash),messageMatchesExportExceptBlockhash:true,
    scope:'Unsigned message matches export except permitted recent blockhash; blockhash validity and current chain state require independent checks.'};
  check(verifyEd25519(wire.subarray(messageOffset),signature,keyBytes(EXPECTED.authority)),'Invalid Ed25519 authority signature');
  return {...preview,kind:'signed-legacy-verification-metadata',wireSHA256:sha(wire),messageSHA256:sha(wire.subarray(messageOffset)),
    signaturesAllZero:false,recentBlockhashAllZero:false,signature:base58(signature),recentBlockhash:base58(blockhash),
    signatureCryptographicallyVerified:true,messageMatchesExportExceptBlockhash:true,
    scope:'Message and authority signature verified offline; current chain state, blockhash validity, simulation and submission are not established.'};
}

// Raw bytes do not carry owner/address evidence; an RPC account object is preferable.
// In either form this validates the NEW metadata against the export, unlike the
// generic decoder used to preview old metadata before an update.
export function validatePda(accountBytes,doc){
  const exported=validateExportDocument(doc);
  if(accountBytes&&typeof accountBytes==='object'&&!ArrayBuffer.isView(accountBytes)){
    return {...decodeMetadataAccount(accountBytes,{expected:exported.expected}),ownerChecked:true};
  }
  const base64Account=typeof accountBytes==='string'?accountBytes:Buffer.from(accountBytes).toString('base64');
  return {...decodeMetadataAccount(base64Account,{owner:EXPECTED.otter,expected:exported.expected}),ownerChecked:false,
    scope:'Raw PDA data matches expected new metadata; account address, owner and finalized chain state must be checked by the caller.'};
}

// Synthetic fixtures exercise rejection paths. They are never written or submitted.
export function selfTest(){
  const e={commit:'a'.repeat(40),imageDigest:'ghcr.io/eltrueque/fast-launch-solana-builder@sha256:'+'b'.repeat(64),deployedSlot:'453222359',pda:EXPECTED.pda,operation:'initialize'};
  const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
  const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
  const sv=n=>{const a=[];do{let b=n&127;n>>>=7;if(n)b|=128;a.push(b);}while(n);return Buffer.from(a);};
  const str=s=>{const b=Buffer.from(s);return Buffer.concat([u32(b.length),b]);};
  const metadata=(changes={})=>{
    const m={version:EXPECTED.version,gitUrl:EXPECTED.gitUrl,commit:e.commit,args:expectedArgs(e.imageDigest),deployedSlot:e.deployedSlot,...changes};
    return Buffer.concat([str(m.version),str(m.gitUrl),str(m.commit),u32(m.args.length),...m.args.map(str),u64(m.deployedSlot)]);
  };
  const keys=[EXPECTED.authority,EXPECTED.pda,EXPECTED.program,EXPECTED.system,EXPECTED.computeBudget,EXPECTED.otter];
  const fixture=(o={})=>{
    const k=o.keys??keys,ix=(program,accounts,data)=>Buffer.concat([Buffer.from([program]),sv(accounts.length),Buffer.from(accounts),sv(data.length),data]);
    const price=o.price??Buffer.concat([Buffer.from([3]),u64(100000)]);
    const payload=o.payload??Buffer.concat([Buffer.from(DISCRIMINATORS[o.operation??'initialize'],'hex'),metadata(o.metadata)]);
    const instr=o.instructions??[ix(k.indexOf(EXPECTED.computeBudget),[],price),ix(k.indexOf(EXPECTED.otter),[EXPECTED.pda,EXPECTED.authority,EXPECTED.program,EXPECTED.system].map(a=>k.indexOf(a)),payload)];
    return Buffer.concat([o.sigPrefix??sv(1),o.signature??Buffer.alloc(64),o.header??Buffer.from([1,0,4]),o.keyPrefix??sv(k.length),...k.map(keyBytes),o.blockhash??Buffer.alloc(32),sv(instr.length),...instr,o.trailing??Buffer.alloc(0)]);
  };
  let passed=0;const test=(name,fn)=>{try{fn();passed++;}catch(error){throw new Error('Self-test failed: '+name,{cause:error});}};
  const good=fixture(),validate=(b,ex=e)=>validateUnsigned(b.toString('base64'),ex);
  const reject=(name,b,ex=e)=>test(name,()=>assert.throws(()=>validate(b,ex)));
  test('valid initialize',()=>assert.equal(validate(good).operation,'initialize'));
  test('valid init alias',()=>assert.equal(validate(good,{...e,operation:'init'}).operation,'initialize'));
  test('valid update',()=>assert.equal(validate(fixture({operation:'update'}),{...e,operation:'update'}).operation,'update'));
  test('readonly key ordering is flexible',()=>assert.equal(validate(fixture({keys:[...keys.slice(0,2),keys[5],keys[4],keys[3],keys[2]]})).valid,true));
  test('exact slot above Number precision',()=>assert.equal(validate(fixture({metadata:{deployedSlot:'9007199254740993'}}),{...e,deployedSlot:'9007199254740993'}).metadata.deployedSlot,'9007199254740993'));
  reject('signed transaction',fixture({signature:Buffer.alloc(64,1)}));
  reject('wrong signature count',fixture({sigPrefix:sv(2)}));
  reject('noncanonical signature shortvec',fixture({sigPrefix:Buffer.from([0x81,0])}));
  reject('oversized signature shortvec',fixture({sigPrefix:Buffer.from([0x81,0x80,4])}));
  reject('versioned message',fixture({header:Buffer.from([0x80,0,4])}));
  reject('additional signer',fixture({header:Buffer.from([2,0,4])}));
  reject('readonly authority',fixture({header:Buffer.from([1,1,4])}));
  reject('extra writable key',fixture({header:Buffer.from([1,0,3])}));
  reject('readonly PDA',fixture({header:Buffer.from([1,0,5])}));
  reject('nonzero blockhash',fixture({blockhash:Buffer.alloc(32,1)}));
  reject('unexpected key',fixture({keys:keys.map((k,i)=>i===2?base58(Buffer.alloc(32,7)):k)}));
  reject('duplicate key',fixture({keys:keys.map((k,i)=>i===2?keys[3]:k)}));
  reject('payer replaced',fixture({keys:[keys[1],keys[0],...keys.slice(2)]}));
  reject('writable PDA moved',fixture({keys:[keys[0],keys[2],keys[1],...keys.slice(3)]}));
  reject('extra account',fixture({keys:[...keys,base58(Buffer.alloc(32,7))]}));
  reject('noncanonical account shortvec',fixture({keyPrefix:Buffer.from([0x86,0])}));
  reject('unexpected discriminator',fixture({payload:Buffer.concat([Buffer.alloc(8),metadata()])}));
  reject('unexpected operation',fixture({operation:'update'}));
  reject('wrong price',fixture({price:Buffer.concat([Buffer.from([3]),u64(1)])}));
  reject('price trailing data',fixture({price:Buffer.concat([Buffer.from([3]),u64(100000),Buffer.from([0])])}));
  reject('compute limit instruction',fixture({price:Buffer.concat([Buffer.from([2]),u32(100000)])}));
  for(const [field,value] of Object.entries({version:'0.5.2',gitUrl:EXPECTED.gitUrl+'/',commit:'c'.repeat(40),deployedSlot:'453222360',args:[...expectedArgs(e.imageDigest),'--skip-build']}))reject('metadata '+field,fixture({metadata:{[field]:value}}));
  reject('mutable image argument',fixture({metadata:{args:expectedArgs('ghcr.io/eltrueque/fast-launch-solana-builder:latest')}}));
  reject('metadata trailing bytes',fixture({payload:Buffer.concat([Buffer.from(DISCRIMINATORS.initialize,'hex'),metadata(),Buffer.from([0])])}));
  reject('wire trailing bytes',fixture({trailing:Buffer.from([0])}));
  reject('missing instruction',fixture({instructions:[]}));
  const transfer=Buffer.concat([Buffer.from([3,2,0,1,12]),u32(2),u64(1)]);
  reject('system transfer',fixture({instructions:[transfer,transfer]}));
  reject('out of range program',fixture({instructions:[Buffer.from([6,0,0]),transfer]}));
  reject('out of range account',fixture({instructions:[Buffer.from([4,1,6,0]),transfer]}));
  reject('wrong Otter account order',fixture({instructions:[Buffer.concat([Buffer.from([4,0,9,3]),u64(100000)]),Buffer.concat([Buffer.from([5,4,0,1,2,3]),sv(8+metadata().length),Buffer.from(DISCRIMINATORS.initialize,'hex'),metadata()])]}));
  reject('unsafe expected slot',good,{...e,deployedSlot:9007199254740992});
  reject('expected u64 overflow',good,{...e,deployedSlot:'18446744073709551616'});
  reject('unfixed expected image',good,{...e,imageDigest:'builder:latest'});
  reject('caller substituted PDA',good,{...e,pda:base58(Buffer.alloc(32,7))});
  reject('missing operation',good,{...e,operation:undefined});
  test('all truncated wire prefixes rejected',()=>{for(let i=0;i<good.length;i++)assert.throws(()=>validate(good.subarray(0,i)));});
  test('invalid base64 rejected',()=>{for(const bad of [good.toString('base64')+'!', '!!!!', 'AAAA\nAAAA','AB=='])assert.throws(()=>validateUnsigned(bad,e));});
  const invalidUtf8=metadata();invalidUtf8[4]=0xff;
  reject('invalid UTF8 metadata',fixture({payload:Buffer.concat([Buffer.from(DISCRIMINATORS.initialize,'hex'),invalidUtf8])}));
  reject('oversized Borsh string',fixture({payload:Buffer.concat([Buffer.from(DISCRIMINATORS.initialize,'hex'),u32(0xffffffff)])}));
  reject('oversized Borsh argument count',fixture({payload:Buffer.concat([Buffer.from(DISCRIMINATORS.initialize,'hex'),str(EXPECTED.version),str(EXPECTED.gitUrl),str(e.commit),u32(0xffffffff)])}));
  const account=Buffer.concat([ACCOUNT_DISCRIMINATOR,keyBytes(EXPECTED.program),keyBytes(EXPECTED.authority),metadata(),Buffer.from([255])]);
  const decode=b=>decodeMetadataAccount(b.toString('base64'),{owner:EXPECTED.otter,expected:e});
  test('valid metadata account',()=>assert.equal(decode(account).metadata.commit,e.commit));
  test('zero account padding',()=>assert.equal(decode(Buffer.concat([account,Buffer.alloc(9)])).paddingBytes,9));
  test('account owner required',()=>assert.throws(()=>decodeMetadataAccount(account.toString('base64'))));
  test('wrong account owner rejected',()=>assert.throws(()=>decodeMetadataAccount(account.toString('base64'),{owner:EXPECTED.system})));
  for(const [name,offset] of [['discriminator',0],['target',8],['signer',40],['bump',account.length-1]])test('wrong account '+name,()=>{const b=Buffer.from(account);b[offset]^=1;assert.throws(()=>decode(b));});
  test('nonzero account padding rejected',()=>assert.throws(()=>decode(Buffer.concat([account,Buffer.from([1])]))));
  test('all truncated account prefixes rejected',()=>{for(let i=0;i<account.length;i++)assert.throws(()=>decode(account.subarray(0,i)));});
  const rpcAccount={owner:EXPECTED.otter,executable:false,data:[account.toString('base64'),'base64'],lamports:1};
  test('RPC account overload',()=>assert.equal(decodeMetadataAccount(rpcAccount).metadata.commit,e.commit));
  test('RPC executable account rejected',()=>assert.throws(()=>decodeMetadataAccount({...rpcAccount,executable:true})));
  test('RPC wrong encoding rejected',()=>assert.throws(()=>decodeMetadataAccount({...rpcAccount,data:[rpcAccount.data[0],'base58']})));
  const doc={format:'fast-solana-otter-unsigned-v1',unsignedTransactionBase64:good.toString('base64'),transactionSHA256:sha(good),neverSigned:true,submitted:false,simulationPerformed:false,
    program:EXPECTED.program,programData:EXPECTED.programData,programSHA256:EXPECTED.programSHA256,programBytes:EXPECTED.programBytes,authority:EXPECTED.authority,
    metadataPda:EXPECTED.pda,metadataPdaBump:EXPECTED.bump,operation:'initialize',repository:EXPECTED.gitUrl,sourceCommit:e.commit,imageDigest:e.imageDigest,buildArguments:expectedArgs(e.imageDigest),cliVersion:EXPECTED.version,
    finalizedSlot:453222360,deploymentSlot:e.deployedSlot,existingMetadata:null,existingMetadataAccount:null,authorityBalanceLamports:100000000,
    newMetadataBytes:account.length,newMetadataRentExemptMinimumLamports:1000000,feeEstimateLamports:null,strictValidation:validate(good)};
  test('valid export document',()=>assert.equal(validateExportDocument(doc).valid,true));
  test('valid unsigned transaction helper',()=>assert.equal(validateTransaction(doc.unsignedTransactionBase64,doc,{signed:false}).valid,true));
  test('raw PDA helper',()=>assert.equal(validatePda(account,doc).ownerChecked,false));
  test('RPC PDA helper',()=>assert.equal(validatePda(rpcAccount,doc).ownerChecked,true));
  for(const [field,value] of Object.entries({format:'wrong',program:EXPECTED.system,programData:EXPECTED.system,programSHA256:'0'.repeat(64),programBytes:1,authority:EXPECTED.system,metadataPda:EXPECTED.system,metadataPdaBump:254,repository:EXPECTED.gitUrl+'/',sourceCommit:'c'.repeat(40),imageDigest:e.imageDigest.replace('eltrueque','other'),buildArguments:[],cliVersion:'1.0',transactionSHA256:'0'.repeat(64),neverSigned:false,submitted:true,simulationPerformed:true,finalizedSlot:1,deploymentSlot:'1',newMetadataBytes:1,newMetadataRentExemptMinimumLamports:-1,authorityBalanceLamports:-1,feeEstimateLamports:5000,strictValidation:{valid:true},existingMetadata:{}}))test('document rejects changed '+field,()=>assert.throws(()=>validateExportDocument({...doc,[field]:value})));
  const updateWire=fixture({operation:'update'}),updateDoc={...doc,operation:'update',unsignedTransactionBase64:updateWire.toString('base64'),transactionSHA256:sha(updateWire),strictValidation:validate(updateWire,{...e,operation:'update'}),existingMetadataAccount:rpcAccount,existingMetadata:decodeMetadataAccount(rpcAccount)};
  test('valid update document',()=>assert.equal(validateExportDocument(updateDoc).operation,'update'));
  test('update document rejects fake old preview',()=>assert.throws(()=>validateExportDocument({...updateDoc,existingMetadata:{metadata:{}}})));
  const nonzeroWire=fixture({signature:Buffer.alloc(64,1),blockhash:Buffer.alloc(32,2)});
  test('unsigned helper rejects signed bytes',()=>assert.throws(()=>validateTransaction(nonzeroWire.toString('base64'),doc,{signed:false})));
  test('signed helper rejects zero signature',()=>assert.throws(()=>validateTransaction(good.toString('base64'),doc,{signed:true})));
  test('signed helper rejects zero blockhash',()=>assert.throws(()=>validateTransaction(fixture({signature:Buffer.alloc(64,1)}).toString('base64'),doc,{signed:true})));
  test('signed helper rejects fake signature',()=>assert.throws(()=>validateTransaction(nonzeroWire.toString('base64'),doc,{signed:true}),/Ed25519/));
  test('signed helper rejects changed metadata',()=>assert.throws(()=>validateTransaction(fixture({signature:Buffer.alloc(64,1),blockhash:Buffer.alloc(32,2),metadata:{commit:'c'.repeat(40)}}).toString('base64'),doc,{signed:true}),/beyond/));
  test('signed helper rejects changed header',()=>{const b=Buffer.from(nonzeroWire);b[65]=2;assert.throws(()=>validateTransaction(b.toString('base64'),doc,{signed:true}),/beyond/);});
  test('signed helper rejects additional bytes',()=>assert.throws(()=>validateTransaction(Buffer.concat([nonzeroWire,Buffer.from([0])]).toString('base64'),doc,{signed:true})));
  test('unsigned helper accepts fresh blockhash only when allowed',()=>{
    const fresh=fixture({blockhash:Buffer.alloc(32,2)}).toString('base64');
    assert.throws(()=>validateTransaction(fresh,doc));
    assert.equal(validateTransaction(fresh,doc,{signed:false,allowFreshBlockhash:true}).recentBlockhashAllZero,false);
  });
  test('fresh blockhash option still rejects nonzero signature',()=>assert.throws(()=>validateTransaction(nonzeroWire.toString('base64'),doc,{signed:false,allowFreshBlockhash:true})));
  test('fresh blockhash option still rejects changed metadata',()=>assert.throws(()=>validateTransaction(fixture({blockhash:Buffer.alloc(32,2),metadata:{commit:'c'.repeat(40)}}).toString('base64'),doc,{allowFreshBlockhash:true})));
  // RFC 8032 section 7.1, public verification vector for an empty message; no secret key.
  test('Ed25519 verifier RFC 8032 positive and mutation',()=>{
    const publicKey=Buffer.from('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a','hex');
    const signature=Buffer.from('e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b','hex');
    assert.equal(verifyEd25519(Buffer.alloc(0),signature,publicKey),true);signature[0]^=1;
    assert.equal(verifyEd25519(Buffer.alloc(0),signature,publicKey),false);
  });
  return {passed,scope:'Offline synthetic validation tests; no network, signature, or transaction submission.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length===3&&process.argv[2]==='--self-test')console.log(JSON.stringify(selfTest(),null,2));
    else{
      check(process.argv.length===4,'Usage: node validate-unsigned-pda.mjs --self-test | TRANSACTION_BASE64_FILE EXPECTED_JSON_FILE');
      const [wire,expected]=await Promise.all([readFile(process.argv[2],'utf8'),readFile(process.argv[3],'utf8')]);
      console.log(JSON.stringify(validateUnsigned(wire,JSON.parse(expected)),null,2));
    }
  }catch(error){console.error('Validation failed: '+error.message);if(error.cause)console.error(error.cause.message);process.exitCode=1;}
}
