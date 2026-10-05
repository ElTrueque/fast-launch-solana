// Pure read-only validation helpers for the local review server.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeMetadataAccount,validateExportDocument,validatePda} from './validate-unsigned-pda.mjs';
export const OTTER_PROGRAM='verifycLy8mB96wd9wqq3WDXQwM4oU6r42Th37Db9fC';
export const MAINNET_GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const MAX_TOTAL_LAMPORTS=50000000;
const loader='BPFLoaderUpgradeab1e11111111111111111111111',system='11111111111111111111111111111111';
const sha=b=>createHash('sha256').update(b).digest('hex');
function pubkey(s){let n=0n;for(const c of s){const v='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.indexOf(c);assert(v>=0);n=n*58n+BigInt(v);}const h=n.toString(16),b=Buffer.concat([Buffer.alloc(s.match(/^1*/)[0].length),n?Buffer.from(h.padStart(Math.ceil(h.length/2)*2,'0'),'hex'):Buffer.alloc(0)]);assert.equal(b.length,32);return b;}
function data(a){assert(a&&Array.isArray(a.data)&&a.data[1]==='base64');return Buffer.from(a.data[0],'base64');}
function wallet(a){assert(a&&a.owner===system&&a.executable===false);assert.equal(data(a).length,0);assert(Number.isSafeInteger(a.lamports)&&a.lamports>=0);}
export function snapshotAddresses(doc){return [doc.program,doc.programData,doc.metadataPda,doc.authority,OTTER_PROGRAM];}
function instructionBytes(s){assert(typeof s==='string'&&s.length>0&&s.length<=128);let n=0n;for(const c of s){const v='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.indexOf(c);assert(v>=0);n=n*58n+BigInt(v);}const h=n.toString(16);return Buffer.concat([Buffer.alloc(s.match(/^1*/)[0].length),n?Buffer.from(h.padStart(Math.ceil(h.length/2)*2,'0'),'hex'):Buffer.alloc(0)]);}
function amount(value){assert(Number.isSafeInteger(value)&&value>=0,'Invalid parsed lamport/space amount');return BigInt(value);}
function parsedSystem(ix,doc){
 assert.equal(ix.programId,system,'Unexpected parsed inner program');assert.equal(ix.program,'system');
 assert(!Object.hasOwn(ix,'data')&&!Object.hasOwn(ix,'programIdIndex'),'Ambiguous parsed inner instruction');
 const {type,info}=ix.parsed||{};assert(info&&typeof info==='object'&&!Array.isArray(info));
 const exactKeys=names=>assert.deepEqual(Object.keys(info).sort(),names.sort(),'Unexpected parsed System fields');
 if(type==='createAccount'){
  exactKeys(['source','newAccount','lamports','space','owner']);assert.equal(info.source,doc.authority);assert.equal(info.newAccount,doc.metadataPda);
  assert.equal(info.owner,OTTER_PROGRAM);assert.equal(amount(info.space),BigInt(doc.newMetadataBytes));assert(amount(info.lamports)<=BigInt(MAX_TOTAL_LAMPORTS));
  return {opcode:0,accounts:[info.source,info.newAccount],lamports:info.lamports};
 }
 if(type==='transfer'){
  exactKeys(['source','destination','lamports']);assert.equal(info.source,doc.authority);assert.equal(info.destination,doc.metadataPda);assert(amount(info.lamports)<=BigInt(MAX_TOTAL_LAMPORTS));
  return {opcode:2,accounts:[info.source,info.destination],lamports:info.lamports};
 }
 if(type==='allocate'){
  exactKeys(['account','space']);assert.equal(info.account,doc.metadataPda);assert.equal(amount(info.space),BigInt(doc.newMetadataBytes));return {opcode:8,accounts:[info.account]};
 }
 if(type==='assign'){
  exactKeys(['account','owner']);assert.equal(info.account,doc.metadataPda);assert.equal(info.owner,OTTER_PROGRAM);return {opcode:1,accounts:[info.account]};
 }
 throw new Error('Unexpected parsed System Program instruction '+type);
}
export function validateSimulationInnerInstructions(simulation,doc){
 const keys=validateExportDocument(doc).accounts.map(a=>a.address),groups=simulation?.value?.innerInstructions;
 assert(Array.isArray(groups),'Simulation must include requested inner instructions');
 const reviewed=[],seenGroups=new Set();let totalTransferred=0;
 for(const group of groups){
  assert.equal(group.index,1,'Unexpected CPI outside the Otter instruction');assert(!seenGroups.has(group.index),'Duplicate inner instruction group');seenGroups.add(group.index);assert(Array.isArray(group.instructions));
  for(const ix of group.instructions){
   if(ix.stackHeight!==undefined&&ix.stackHeight!==null)assert.equal(ix.stackHeight,2,'Unexpected nested CPI depth');
   if(ix.parsed!==undefined){const parsed=parsedSystem(ix,doc);totalTransferred+=parsed.lamports||0;assert(totalTransferred<=MAX_TOTAL_LAMPORTS,'Total System transfers exceed cap');reviewed.push({program:system,...parsed});continue;}
   assert(Array.isArray(ix.accounts));let accounts;
   if(Object.hasOwn(ix,'programIdIndex')){
    assert(!Object.hasOwn(ix,'programId'),'Ambiguous compiled inner instruction');assert(Number.isInteger(ix.programIdIndex)&&ix.programIdIndex>=0&&ix.programIdIndex<keys.length);assert.equal(keys[ix.programIdIndex],system,'Unexpected inner program');
    accounts=ix.accounts.map(i=>{assert(Number.isInteger(i)&&i>=0&&i<keys.length);return keys[i];});
   }else{assert.equal(ix.programId,system,'Unexpected partially decoded inner program');accounts=ix.accounts;assert(accounts.every(a=>typeof a==='string'&&keys.includes(a)));}
   const b=instructionBytes(ix.data);assert(b.length>=4);
   const opcode=b.readUInt32LE();
   if(opcode===0){assert.equal(b.length,52);assert.deepEqual(accounts,[doc.authority,doc.metadataPda]);assert.equal(b.readBigUInt64LE(12),BigInt(doc.newMetadataBytes));assert(b.subarray(20).equals(pubkey(OTTER_PROGRAM)));assert(b.readBigUInt64LE(4)<=BigInt(MAX_TOTAL_LAMPORTS));}
   else if(opcode===2){assert.equal(b.length,12);assert.deepEqual(accounts,[doc.authority,doc.metadataPda]);assert(b.readBigUInt64LE(4)<=BigInt(MAX_TOTAL_LAMPORTS));}
   else if(opcode===8){assert.equal(b.length,12);assert.deepEqual(accounts,[doc.metadataPda]);assert.equal(b.readBigUInt64LE(4),BigInt(doc.newMetadataBytes));}
   else if(opcode===1){assert.equal(b.length,36);assert.deepEqual(accounts,[doc.metadataPda]);assert(b.subarray(4).equals(pubkey(OTTER_PROGRAM)));}
   else throw new Error('Unexpected System Program instruction '+opcode);
   const lamports=opcode===0||opcode===2?Number(b.readBigUInt64LE(4)):0;totalTransferred+=lamports;assert(totalTransferred<=MAX_TOTAL_LAMPORTS,'Total System transfers exceed cap');
   reviewed.push({program:system,opcode,accounts,...(lamports?{lamports}:{})});
  }
 }
 return reviewed;
}
export function validateProgramAccounts(snapshot,doc,{allowExpectedNewMetadata=false}={}){
 assert.equal(typeof allowExpectedNewMetadata,'boolean');
 validateExportDocument(doc);
 assert(Number.isSafeInteger(snapshot?.context?.slot)&&snapshot.context.slot>=0,'Missing finalized context');
 assert(BigInt(snapshot.context.slot)>=BigInt(doc.finalizedSlot),'Finalized snapshot predates export');assert.equal(snapshot.value?.length,5);
 const [program,pd,metadata,authority,otter]=snapshot.value,p=data(program),d=data(pd);
 assert.equal(program.owner,loader);assert.equal(program.executable,true);assert.equal(p.length,36);assert.equal(p.readUInt32LE(),2);assert(p.subarray(4).equals(pubkey(doc.programData)));
 assert.equal(pd.owner,loader);assert.equal(pd.executable,false);assert(d.length>=45+doc.programBytes);assert.equal(d.readUInt32LE(),3);assert.equal(d[12],1);assert(d.subarray(13,45).equals(pubkey(doc.authority)),'Upgrade authority changed');
 assert.equal(d.readBigUInt64LE(4).toString(),String(doc.deploymentSlot),'Deployment changed');
 assert.equal(sha(d.subarray(45,45+doc.programBytes)),doc.programSHA256,'Deployed ELF changed');assert(d.subarray(45+doc.programBytes).every(x=>x===0),'Unexpected program padding');
 wallet(authority);assert(otter&&otter.owner===loader&&otter.executable===true,'Wrong Otter executable account');
 let operation='initialize',existing=null;
 if(metadata&&data(metadata).length){existing=decodeMetadataAccount(metadata);operation='update';}
 else if(metadata){assert.equal(metadata.owner,system);assert.equal(metadata.executable,false);}
 if(allowExpectedNewMetadata){existing=validatePda(metadata,doc);operation='expected-new-metadata';}
 else{assert.equal(operation,doc.operation,'Metadata operation changed');assert.deepEqual(metadata,doc.existingMetadataAccount,'Existing metadata account changed since export');}
 return {slot:snapshot.context.slot,operation,existingMetadata:existing,metadataAccount:metadata,authorityLamports:authority.lamports,programDataSHA256:sha(d),commitment:'finalized',expectedNewMetadataValidated:allowExpectedNewMetadata};
}
export function validateSimulationPostAccounts(simulation,doc,before,feeLamports){
 validateExportDocument(doc);assert(Number.isSafeInteger(simulation?.context?.slot)&&simulation.context.slot>=before.slot,'Stale simulation');
 const result=simulation.value;assert.equal(result?.err,null,'Simulation failed');assert.equal(result.accounts?.length,2,'Request PDA and authority simulated accounts');
 const innerInstructions=validateSimulationInnerInstructions(simulation,doc);
 assert(Number.isSafeInteger(feeLamports)&&feeLamports>=0,'Current fee estimate required');
 const [metadata,authority]=result.accounts;wallet(authority);const decoded=decodeMetadataAccount(metadata);
 // The codec returns the same InputParams fields decoded from the instruction/account.
 const params=decoded.metadata||decoded.params||decoded;
 assert.equal(params.version,doc.cliVersion);assert.equal(params.git_url??params.gitUrl??params.repository,doc.repository);
 assert.equal(params.commit,doc.sourceCommit);assert.deepEqual(params.args,doc.buildArguments);
 assert.equal(String(params.deployed_slot??params.deployedSlot??params.deploy_slot),String(doc.deploymentSlot));
 const oldRent=before.metadataAccount?.lamports||0,newRent=metadata.lamports;
 assert(Number.isSafeInteger(newRent)&&newRent>=0);const rentDelta=newRent-oldRent,totalLamports=feeLamports+Math.max(0,rentDelta);
 assert(totalLamports<=MAX_TOTAL_LAMPORTS,'Metadata total exceeds the 0.05 SOL hard cap');
 assert(before.authorityLamports-authority.lamports<=MAX_TOTAL_LAMPORTS,'Unexpected simulated authority debit');
 assert(before.authorityLamports-authority.lamports<=totalLamports,'Simulated authority debit exceeds fee plus rent');
 assert.equal(BigInt(before.authorityLamports)-BigInt(authority.lamports),BigInt(feeLamports)+BigInt(rentDelta),'Simulated authority/PDA balances do not conserve fee plus rent');
 assert(newRent>=doc.newMetadataRentExemptMinimumLamports,'Metadata is below the recorded rent minimum');
 return {metadata:decoded,innerInstructions,feeLamports,rentDeltaLamports:rentDelta,maximumExpectedDebitLamports:totalLamports,authorityBalanceAfterLamports:authority.lamports,totalCapLamports:MAX_TOTAL_LAMPORTS};
}
