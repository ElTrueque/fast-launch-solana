// Read-only RPC simulation. No wallet, private key, signature, or submission API.
// node simulate-metadata.mjs [unsigned-pda.json] [simulation-proof.json]
// node simulate-metadata.mjs --self-test unsigned-pda.json reference-program.so
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateExportDocument,validateTransaction,EXPECTED} from './validate-unsigned-pda.mjs';
import {MAINNET_GENESIS,OTTER_PROGRAM,snapshotAddresses,validateProgramAccounts,validateSimulationPostAccounts,validateSimulationInnerInstructions} from './otter-rpc-validation.mjs';
const ALLOWED=new Set(['getGenesisHash','getMultipleAccounts','getLatestBlockhash','getFeeForMessage','getMinimumBalanceForRentExemption','simulateTransaction']);
const sha=b=>createHash('sha256').update(b).digest('hex');
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encode58(bytes){let n=0n;for(const b of bytes)n=(n<<8n)|BigInt(b);let s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const b of bytes){if(b)break;s='1'+s;}return s;}
function decode32(s){
 assert(typeof s==='string'&&s.length>=32&&s.length<=44,'Invalid 32-byte base58 value');let n=0n;
 for(const c of s){const v=alphabet.indexOf(c);assert(v>=0,'Invalid base58 character');n=n*58n+BigInt(v);}
 const a=[];while(n){a.unshift(Number(n&255n));n>>=8n;}for(const c of s){if(c!=='1')break;a.unshift(0);}
 const b=Buffer.from(a);assert.equal(b.length,32);assert.equal(encode58(b),s);return b;
}
function slot(response,min=0){const n=response?.context?.slot;assert(Number.isSafeInteger(n)&&n>=min,'Missing or stale RPC context');return n;}
function natural(n,name){assert(Number.isSafeInteger(n)&&n>=0,'Invalid '+name);return n;}
export function patchBlockhash(doc,blockhash){
 validateExportDocument(doc);const hash=decode32(blockhash);assert(hash.some(b=>b!==0),'Fresh blockhash must not be zero');
 const wire=Buffer.from(doc.unsignedTransactionBase64,'base64');
 // Strict validation fixes one shortvec signature byte, 64 signature bytes,
 // three header bytes, one key-count byte, and six 32-byte keys: offset 261.
 assert.equal(wire[0],1);assert.deepEqual([...wire.subarray(65,69)],[1,0,4,6]);assert(wire.subarray(261,293).every(b=>b===0));
 hash.copy(wire,261);validateTransaction(wire.toString('base64'),doc,{signed:false,allowFreshBlockhash:true});return wire;
}
export function createReadOnlyRpc(url,fetchImpl=fetch){
 const parsed=new URL(url);assert(parsed.protocol==='https:'||(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)),'RPC must use HTTPS or loopback HTTP');
 let id=0;return async(method,params=[])=>{
  assert(ALLOWED.has(method),'RPC method is not read-only allowlisted');
  for(let attempt=0;attempt<3;attempt++){
   try{
    const requestId=++id,response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(20000)});
    assert(response.ok,method+' HTTP '+response.status);const json=await response.json();assert.equal(json.id,requestId,'RPC response id mismatch');assert.equal(json.jsonrpc,'2.0');
    if(json.error)throw new Error(method+' RPC error '+String(json.error.code));assert(Object.hasOwn(json,'result'),'RPC response has no result');return json.result;
   }catch(error){if(attempt===2)throw new Error(method+' failed ('+(error.name||'Error')+'); RPC endpoint omitted');await new Promise(r=>setTimeout(r,1000));}
  }
 };
}
export async function runSimulation(doc,rpc){
 validateExportDocument(doc);const proof={format:'fast-solana-otter-simulation-v1',createdAt:new Date().toISOString(),status:'in-progress',neverSigned:true,submitted:false,simulationPerformed:false,
  unsignedTransactionSHA256:doc.transactionSHA256,program:doc.program,programSHA256:doc.programSHA256,programBytes:doc.programBytes,authority:doc.authority,metadataPda:doc.metadataPda,
  sourceCommit:doc.sourceCommit,imageDigest:doc.imageDigest,operation:doc.operation,commitment:'finalized',rpcMethods:[]};
 const call=async(method,params=[])=>{assert(ALLOWED.has(method),'Non-read-only RPC method');proof.rpcMethods.push(method);return rpc(method,params);};
 try{
  const genesis=await call('getGenesisHash');assert.equal(genesis,MAINNET_GENESIS,'RPC is not Solana mainnet');proof.genesisHash=genesis;
  const snapshot=await call('getMultipleAccounts',[snapshotAddresses(doc),{encoding:'base64',commitment:'finalized',minContextSlot:Number(doc.finalizedSlot)}]);
  slot(snapshot,Number(doc.finalizedSlot));const before=validateProgramAccounts(snapshot,doc);proof.before=before;
  const latest=await call('getLatestBlockhash',[{commitment:'finalized',minContextSlot:before.slot}]);slot(latest,before.slot);natural(latest.value?.lastValidBlockHeight,'last valid block height');
  const wire=patchBlockhash(doc,latest.value.blockhash);proof.requestBlockhash=latest.value;proof.simulationTransactionSHA256=sha(wire);
  const config={encoding:'base64',commitment:'finalized',sigVerify:false,replaceRecentBlockhash:true,innerInstructions:true,minContextSlot:latest.context.slot,accounts:{encoding:'base64',addresses:[doc.metadataPda,doc.authority]}};
  proof.simulationConfig=config;
  const simulation=await call('simulateTransaction',[wire.toString('base64'),config]);proof.simulationPerformed=true;proof.simulation=simulation;
  const simulatedSlot=slot(simulation,latest.context.slot);assert.equal(simulation.value?.err,null,'Simulation returned an execution error');
  assert(Array.isArray(simulation.value.logs)&&simulation.value.logs.every(s=>typeof s==='string'),'Missing simulation logs');
  natural(simulation.value.unitsConsumed,'compute units consumed');
  const replacement=simulation.value.replacementBlockhash;assert(replacement&&typeof replacement==='object','RPC did not return its replacement blockhash');natural(replacement.lastValidBlockHeight,'replacement block height');
  const feeWire=patchBlockhash(doc,replacement.blockhash),message=feeWire.subarray(65);proof.feeMessageSHA256=sha(message);
  const fee=await call('getFeeForMessage',[message.toString('base64'),{commitment:'finalized',minContextSlot:simulatedSlot}]);slot(fee,simulatedSlot);natural(fee.value,'current fee');assert(fee.value>0,'Fee must be available and positive');
  if(simulation.value.fee!==undefined&&simulation.value.fee!==null)assert.equal(simulation.value.fee,fee.value,'Simulation fee differs from exact-message fee');proof.feeRPC=fee;
  const rent=await call('getMinimumBalanceForRentExemption',[doc.newMetadataBytes,{commitment:'finalized'}]);natural(rent,'current rent minimum');assert.equal(rent,doc.newMetadataRentExemptMinimumLamports,'Rent minimum changed since export');proof.currentRentExemptMinimumLamports=rent;
  proof.validation=validateSimulationPostAccounts(simulation,doc,before,fee.value);
  if(Array.isArray(simulation.value.preBalances)&&simulation.value.preBalances.length){
   const keys=validateExportDocument(doc).accounts.map(a=>a.address),pre=simulation.value.preBalances,post=simulation.value.postBalances;
   assert.equal(pre.length,keys.length);assert.equal(post?.length,keys.length);pre.forEach(n=>natural(n,'pre-balance'));post.forEach(n=>natural(n,'post-balance'));
   const p=keys.indexOf(doc.metadataPda);assert.equal(pre[0],before.authorityLamports);assert.equal(pre[p],before.metadataAccount?.lamports||0);
   assert.equal(post[0],simulation.value.accounts[1].lamports);assert.equal(post[p],simulation.value.accounts[0].lamports);
   for(let i=0;i<keys.length;i++)if(i!==0&&i!==p)assert.equal(post[i],pre[i],'Readonly account balance changed');
  }
  const afterSnapshot=await call('getMultipleAccounts',[snapshotAddresses(doc),{encoding:'base64',commitment:'finalized',minContextSlot:Math.max(simulatedSlot,fee.context.slot)}]);
  slot(afterSnapshot,Math.max(simulatedSlot,fee.context.slot));const after=validateProgramAccounts(afterSnapshot,doc);
  assert.equal(after.programDataSHA256,before.programDataSHA256,'Program changed during simulation');assert.equal(after.authorityLamports,before.authorityLamports,'Authority balance changed during evidence collection');proof.after=after;
  proof.status='passed';proof.scope='Read-only mainnet simulation with zero signatures; no metadata was submitted. Refresh all checks before a future wallet signature.';return proof;
 }catch(error){proof.status='failed';proof.validationError=error.message;error.simulationProof=proof;throw error;}
}

// Local tests use the real exported public metadata and original ELF; RPC is mocked.
export async function selfTest(doc,elf){
 validateExportDocument(doc);assert.equal(sha(elf),doc.programSHA256);assert.equal(elf.length,doc.programBytes);
 let passed=0;const test=async(name,fn)=>{try{await fn();passed++;}catch(error){throw new Error('Simulation self-test failed: '+name,{cause:error});}};
 const b64=b=>[b.toString('base64'),'base64'],clone=v=>structuredClone(v),sys=EXPECTED.system;
 const original=Buffer.from(doc.unsignedTransactionBase64,'base64'),decoded=validateExportDocument(doc);
 const params=Buffer.from(decoded.instructions[1].dataHex,'hex').subarray(8);
 const accountBytes=Buffer.concat([createHash('sha256').update('account:BuildParams').digest().subarray(0,8),decode32(doc.program),decode32(doc.authority),params,Buffer.from([255])]);
 const rent=doc.newMetadataRentExemptMinimumLamports,fee=25000,oldRent=doc.existingMetadataAccount?.lamports||0;
 const authority={owner:sys,executable:false,data:b64(Buffer.alloc(0)),lamports:doc.authorityBalanceLamports};
 const pd=Buffer.alloc(45+elf.length);pd.writeUInt32LE(3);pd.writeBigUInt64LE(BigInt(doc.deploymentSlot),4);pd[12]=1;decode32(doc.authority).copy(pd,13);elf.copy(pd,45);
 const program=Buffer.alloc(36);program.writeUInt32LE(2);decode32(doc.programData).copy(program,4);
 const baseSlot=Number(doc.finalizedSlot)+10;
 const snapshot={context:{slot:baseSlot},value:[{owner:'BPFLoaderUpgradeab1e11111111111111111111111',executable:true,data:b64(program)},
  {owner:'BPFLoaderUpgradeab1e11111111111111111111111',executable:false,data:b64(pd)},doc.existingMetadataAccount,authority,
  {owner:'BPFLoaderUpgradeab1e11111111111111111111111',executable:true,data:b64(Buffer.alloc(0))}]};
 const create={program:'system',programId:sys,stackHeight:2,parsed:{type:'createAccount',info:{source:doc.authority,newAccount:doc.metadataPda,lamports:rent,space:doc.newMetadataBytes,owner:OTTER_PROGRAM}}};
 const simulation={context:{slot:baseSlot+1},value:{err:null,logs:['Synthetic test only'],unitsConsumed:10000,fee,
  replacementBlockhash:{blockhash:encode58(Buffer.alloc(32,8)),lastValidBlockHeight:1000},innerInstructions:doc.operation==='initialize'?[{index:1,instructions:[create]}]:[],
  accounts:[{owner:OTTER_PROGRAM,executable:false,data:b64(accountBytes),lamports:rent},{...authority,lamports:authority.lamports-fee-(rent-oldRent)}]}};
 const mock=(changes={})=>async(method,params)=>{
  assert(ALLOWED.has(method));if(Object.hasOwn(changes,method))return clone(changes[method]);
  if(method==='getGenesisHash')return MAINNET_GENESIS;
  if(method==='getMultipleAccounts'){const s=clone(snapshot);s.context.slot=Math.max(baseSlot,params[1].minContextSlot);return s;}
  if(method==='getLatestBlockhash')return {context:{slot:baseSlot},value:{blockhash:encode58(Buffer.alloc(32,7)),lastValidBlockHeight:999}};
  if(method==='simulateTransaction'){validateTransaction(params[0],doc,{allowFreshBlockhash:true});assert.equal(params[1].sigVerify,false);assert.equal(params[1].innerInstructions,true);return clone(simulation);}
  if(method==='getFeeForMessage')return {context:{slot:baseSlot+1},value:fee};
  if(method==='getMinimumBalanceForRentExemption')return rent;
  throw new Error('Unexpected test RPC');
 };
 await test('blockhash patch changes only permitted bytes',()=>{const b=patchBlockhash(doc,encode58(Buffer.alloc(32,7)));assert(b.subarray(0,261).equals(original.subarray(0,261)));assert(b.subarray(293).equals(original.subarray(293)));});
 await test('zero blockhash rejected',()=>assert.throws(()=>patchBlockhash(doc,sys)));
 await test('invalid base58 rejected',()=>assert.throws(()=>patchBlockhash(doc,'0'.repeat(44))));
 await test('full mocked simulation succeeds',async()=>assert.equal((await runSimulation(doc,mock())).status,'passed'));
 await test('wrong network rejected',()=>assert.rejects(()=>runSimulation(doc,mock({getGenesisHash:'wrong'}))));
 await test('execution error preserved',async()=>{const s=clone(simulation);s.value.err={InstructionError:[1,'InvalidArgument']};await assert.rejects(()=>runSimulation(doc,mock({simulateTransaction:s})),e=>e.simulationProof.simulation.value.err!==null);});
 await test('stale simulation rejected',()=>{const s=clone(simulation);s.context.slot=0;return assert.rejects(()=>runSimulation(doc,mock({simulateTransaction:s})));});
 await test('fee mismatch rejected',()=>assert.rejects(()=>runSimulation(doc,mock({getFeeForMessage:{context:{slot:baseSlot+1},value:fee+1}}))));
 await test('null fee rejected',()=>assert.rejects(()=>runSimulation(doc,mock({getFeeForMessage:{context:{slot:baseSlot+1},value:null}}))));
 await test('changed rent rejected',()=>assert.rejects(()=>runSimulation(doc,mock({getMinimumBalanceForRentExemption:rent+1}))));
 await test('wrong poststate metadata rejected',()=>{const s=clone(simulation);const b=Buffer.from(accountBytes);b[80]^=1;s.value.accounts[0].data=b64(b);return assert.rejects(()=>runSimulation(doc,mock({simulateTransaction:s})));});
 await test('unexpected authority debit rejected',()=>{const s=clone(simulation);s.value.accounts[1].lamports--;return assert.rejects(()=>runSimulation(doc,mock({simulateTransaction:s})));});
 await test('forbidden RPC rejected without transport',async()=>{let touched=false;const rpc=createReadOnlyRpc('https://example.invalid',()=>{touched=true;});await assert.rejects(()=>rpc('sendTransaction',[]));assert.equal(touched,false);});
 const bytes=Buffer.alloc(52);bytes.writeUInt32LE(0);bytes.writeBigUInt64LE(BigInt(rent),4);bytes.writeBigUInt64LE(BigInt(doc.newMetadataBytes),12);decode32(OTTER_PROGRAM).copy(bytes,20);
 const keys=decoded.accounts.map(a=>a.address),compiled={programIdIndex:keys.indexOf(sys),accounts:[keys.indexOf(doc.authority),keys.indexOf(doc.metadataPda)],data:encode58(bytes),stackHeight:2};
 const inner=ix=>({value:{innerInstructions:[{index:1,instructions:[ix]}]}});
 await test('parsed System create accepted',()=>assert.equal(validateSimulationInnerInstructions(inner(create),doc)[0].opcode,0));
 await test('compiled System create accepted',()=>assert.equal(validateSimulationInnerInstructions(inner(compiled),doc)[0].opcode,0));
 await test('partially decoded System create accepted',()=>assert.equal(validateSimulationInnerInstructions(inner({programId:sys,accounts:[doc.authority,doc.metadataPda],data:encode58(bytes)}),doc)[0].opcode,0));
 for(const [field,value] of Object.entries({source:doc.program,newAccount:doc.program,owner:sys,space:doc.newMetadataBytes+1,lamports:50000001}))await test('parsed create rejects '+field,()=>{const ix=clone(create);ix.parsed.info[field]=value;assert.throws(()=>validateSimulationInnerInstructions(inner(ix),doc));});
 await test('parsed unknown instruction rejected',()=>{const ix=clone(create);ix.parsed.type='transferWithSeed';assert.throws(()=>validateSimulationInnerInstructions(inner(ix),doc));});
 await test('CPI to wrong program rejected',()=>{const ix=clone(create);ix.programId=OTTER_PROGRAM;assert.throws(()=>validateSimulationInnerInstructions(inner(ix),doc));});
 await test('post-finalization mode checks expected new metadata',()=>{const s=clone(snapshot);s.value[2]=clone(simulation.value.accounts[0]);assert.equal(validateProgramAccounts(s,doc,{allowExpectedNewMetadata:true}).expectedNewMetadataValidated,true);assert.throws(()=>validateProgramAccounts(s,doc));});
 await test('post-finalization mode still rejects modified ELF',()=>{const s=clone(snapshot);s.value[2]=clone(simulation.value.accounts[0]);const b=Buffer.from(pd);b[45]^=1;s.value[1].data=b64(b);assert.throws(()=>validateProgramAccounts(s,doc,{allowExpectedNewMetadata:true}));});
  await test('post-finalization mode still rejects changed authority',()=>{const s=clone(snapshot);s.value[2]=clone(simulation.value.accounts[0]);const b=Buffer.from(pd);b[13]^=1;s.value[1].data=b64(b);assert.throws(()=>validateProgramAccounts(s,doc,{allowExpectedNewMetadata:true}));});
  await test('snapshot older than export rejected in both modes',()=>{const s=clone(snapshot);s.context.slot=Number(doc.finalizedSlot)-1;assert.throws(()=>validateProgramAccounts(s,doc),/predates export/);s.value[2]=clone(simulation.value.accounts[0]);assert.throws(()=>validateProgramAccounts(s,doc,{allowExpectedNewMetadata:true}),/predates export/);});
 return {passed,scope:'Offline fixtures and mocked RPC; no real network, signatures or submissions.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const testing=process.argv[2]==='--self-test';let proof,out;
 try{
  if(testing){assert(process.argv.length===5,'--self-test requires export JSON and original ELF paths');console.log(JSON.stringify(await selfTest(JSON.parse(await readFile(process.argv[3],'utf8')),await readFile(process.argv[4])),null,2));}
  else{
   assert(process.argv.length<=4,'Usage: node simulate-metadata.mjs [unsigned-pda.json] [simulation-proof.json]');
   const input=resolve(process.argv[2]||'unsigned-pda-evidence/unsigned-pda.json');out=resolve(process.argv[3]||'unsigned-pda-evidence/simulation-proof.json');assert.notEqual(input,out,'Simulation output must not replace export');
   const raw=await readFile(input),doc=JSON.parse(raw);proof=await runSimulation(doc,createReadOnlyRpc(process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com'));
   assert((await readFile(input)).equals(raw),'Original export changed during simulation');proof.exportDocumentSHA256=sha(raw);
   await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(proof,null,2)+'\n');
   console.log('SIMULATION_PROOF_JSON_BEGIN\n'+JSON.stringify(proof,null,2)+'\nSIMULATION_PROOF_JSON_END');
  }
 }catch(error){
  proof=error.simulationProof||proof;
  if(!testing&&proof&&out){proof.status='failed';proof.validationError=error.message;await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(proof,null,2)+'\n');console.log('SIMULATION_PROOF_JSON_BEGIN\n'+JSON.stringify(proof,null,2)+'\nSIMULATION_PROOF_JSON_END');}
  console.error('Simulation failed: '+error.message);if(error.cause)console.error(error.cause.message);process.exitCode=1;
 }
}
