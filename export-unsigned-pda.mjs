// Read-only RPC + official unsigned transaction export. No keys/sign/send calls.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateUnsigned,decodeMetadataAccount} from './validate-unsigned-pda.mjs';

const commit=process.env.PROVEN_SOURCE_COMMIT,imageDigest=process.env.PUBLIC_IMAGE_DIGEST;
assert(/^[a-f0-9]{40}$/.test(commit||''),'Full proven source commit required');
assert(/^ghcr\.io\/eltrueque\/fast-launch-solana-builder@sha256:[a-f0-9]{64}$/.test(imageDigest||''),'Pinned public builder image required');
const source=resolve(process.env.PROVEN_SOURCE_DIRECTORY||'proven-source/source'),out=resolve(process.env.UNSIGNED_OUTPUT_DIRECTORY||'unsigned-pda-evidence');
const cli=process.env.SOLANA_VERIFY_BIN;assert(cli,'Official verifier path required');
const rpcURL=process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
const program='BtFP1XpKdZgAiivKJQ6pFr1fuHpeNTHhjyskDbSUtHqj',programData='22DKa13W514H2Yt9oc54wKtyyxYwQRQmN6Xb4wKYMNfh';
const authority='8x7MM5maL2vQPpqeiLWBiPKk6VK4BRZ9qG5jqoP9eta1',pda='DCULQHBJbx3PssnPFYTcqZmKJcezmou2yMqhcH9D5VyW';
const verifyProgram='verifycLy8mB96wd9wqq3WDXQwM4oU6r42Th37Db9fC',system='11111111111111111111111111111111',loader='BPFLoaderUpgradeab1e11111111111111111111111';
const repo='https://github.com/ElTrueque/fast-launch-solana',expectedSHA='7db37174011a0a5736cae8558ddc81ae48dfdb0f58ce62ef0dff182064ed659d';
const sha=b=>createHash('sha256').update(b).digest('hex');
const decode58=s=>{let n=0n;for(const c of s){const v='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.indexOf(c);assert(v>=0);n=n*58n+BigInt(v);}const h=n.toString(16),tail=n?Buffer.from(h.padStart(Math.ceil(h.length/2)*2,'0'),'hex'):Buffer.alloc(0);const b=Buffer.concat([Buffer.alloc(s.match(/^1*/)[0].length),tail]);assert.equal(b.length,32);return b;};
const data=a=>{assert(a&&Array.isArray(a.data)&&a.data[1]==='base64','Malformed account encoding');return Buffer.from(a.data[0],'base64');};
async function rpc(method,params=[]){
 assert(['getGenesisHash','getMultipleAccounts','getMinimumBalanceForRentExemption'].includes(method),'Non-read-only RPC method');
 for(let attempt=0;attempt<3;attempt++)try{const r=await fetch(rpcURL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});assert(r.ok,'RPC HTTP '+r.status);const j=await r.json();assert(!j.error,'RPC '+JSON.stringify(j.error));return j.result;}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
}
const reference=await readFile(join(source,'artifacts/el_trueque_fast_solana.so'));assert.equal(reference.length,87160);assert.equal(sha(reference),expectedSHA);
await mkdir(out,{recursive:true});
assert.equal(await rpc('getGenesisHash'),'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','Wrong network');
async function snapshot(){
 const result=await rpc('getMultipleAccounts',[[program,programData,pda,authority,verifyProgram],{encoding:'base64',commitment:'finalized'}]);
 assert(Number.isSafeInteger(result?.context?.slot));assert.equal(result.value?.length,5);
 const [p,pd,metadata,wallet,otter]=result.value,pb=data(p),db=data(pd);
 assert.equal(p.owner,loader);assert.equal(p.executable,true);assert.equal(pb.length,36);assert.equal(pb.readUInt32LE(),2);assert(pb.subarray(4).equals(decode58(programData)));
 assert.equal(pd.owner,loader);assert.equal(pd.executable,false);assert.equal(db.readUInt32LE(),3);assert(db.length>=45+87160);assert.equal(db[12],1);assert(db.subarray(13,45).equals(decode58(authority)),'Authority changed');
 assert(db.subarray(45,45+87160).equals(reference),'Deployed ELF changed');assert(db.subarray(45+87160).every(x=>x===0),'Nonzero deployed padding');
 assert(wallet&&wallet.owner===system&&wallet.executable===false,'Authority is not the expected system wallet');assert.equal(data(wallet).length,0);
 assert(otter&&otter.executable===true&&otter.owner===loader,'Unexpected verifier program account');
 let existing=null,operation='initialize';
 if(metadata&&data(metadata).length){existing=decodeMetadataAccount(metadata);operation='update';}
 else if(metadata){assert.equal(metadata.owner,system);assert.equal(metadata.executable,false);}
 return {slot:result.context.slot,deployedSlot:db.readBigUInt64LE(4).toString(),operation,existing,metadataAccount:metadata,authorityLamports:wallet.lamports,programDataSHA256:sha(db)};
}
const before=await snapshot();
const args=['--url',rpcURL,'--compute-unit-price','100000','export-pda-tx',repo,'--program-id',program,'--uploader',authority,'--commit-hash',commit,'--mount-path','source','--workspace-path','source/program','--library-name','el_trueque_fast_solana','--base-image',imageDigest,'--arch','v3','--encoding','base64'];
const exported=spawnSync(cli,args,{encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
const redact=s=>(s||'').replaceAll(rpcURL,'[RPC endpoint]');
await writeFile(join(out,'official-export.log'),redact(exported.stdout)+redact(exported.stderr));
assert.equal(exported.status,0,'Official unsigned export failed; see redacted log');
const accepted=[];
for(const line of (exported.stdout||'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s.length>200&&/^[A-Za-z0-9+/]+={0,2}$/.test(s))){
 try{const decoded=validateUnsigned(line,{commit,imageDigest,deployedSlot:before.deployedSlot,pda,operation:before.operation});accepted.push({base64:line,decoded});}catch{}
}
assert.equal(accepted.length,1,'Export must contain exactly one strictly valid expected unsigned transaction');
const after=await snapshot();assert.equal(after.deployedSlot,before.deployedSlot);assert.equal(after.programDataSHA256,before.programDataSHA256);assert.equal(after.operation,before.operation);assert.deepEqual(after.metadataAccount,before.metadataAccount,'Metadata PDA changed during export; retry and review');
const exactArgs=['--mount-path','source','--workspace-path','source/program','--library-name','el_trueque_fast_solana','--base-image',imageDigest,'--arch','v3'];
const space=97+Buffer.byteLength('0.5.1')+Buffer.byteLength(repo)+Buffer.byteLength(commit)+exactArgs.reduce((n,s)=>n+4+Buffer.byteLength(s),0);
const minimumRent=await rpc('getMinimumBalanceForRentExemption',[space,{commitment:'finalized'}]);
const tx=accepted[0],result={format:'fast-solana-otter-unsigned-v1',createdAt:new Date().toISOString(),unsignedTransactionBase64:tx.base64,transactionSHA256:sha(Buffer.from(tx.base64,'base64')),neverSigned:true,submitted:false,simulationPerformed:false,program,programData,programSHA256:expectedSHA,programBytes:87160,authority,metadataPda:pda,metadataPdaBump:255,operation:after.operation,repository:repo,sourceCommit:commit,imageDigest,buildArguments:exactArgs,cliVersion:'0.5.1',cliAssetSHA256:'b101230b26d5f75d17d931e5056d1a6253904f65649abe7bedb7b81dd38df114',finalizedSlot:after.slot,deploymentSlot:after.deployedSlot,existingMetadata:after.existing,existingMetadataAccount:after.metadataAccount,authorityBalanceLamports:after.authorityLamports,newMetadataBytes:space,newMetadataRentExemptMinimumLamports:minimumRent,feeEstimateLamports:null,strictValidation:tx.decoded,requiresBeforeSigning:['Recheck program ELF, authority and PDA','Simulate and inspect resulting metadata, balances and inner instructions','Set a fresh blockhash and show RPC fee plus rent delta','Connect Phantom account equal to the recorded authority; review exact instructions'],buildProof:{workflowRunURL:process.env.GITHUB_SERVER_URL&&process.env.GITHUB_REPOSITORY&&process.env.GITHUB_RUN_ID?`${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null,scope:'Workflow must reproduce this public image and source commit before running this exporter'}};
await writeFile(join(out,'unsigned-pda.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({artifact:'unsigned-pda.json',transactionSHA256:result.transactionSHA256,authority,pda,operation:after.operation,finalizedSlot:after.slot,sourceCommit:commit,imageDigest,neverSigned:true,submitted:false},null,2));
// Public unsigned metadata only: allows recovery from GitHub raw logs.
console.log('FAST_UNSIGNED_METADATA_JSON_BEGIN');
console.log(JSON.stringify(result,null,2));
console.log('FAST_UNSIGNED_METADATA_JSON_END');
