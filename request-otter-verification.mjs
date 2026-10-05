// Queues one official Otter build job after fresh finalized mainnet checks.
// No key, wallet, signed transaction, signing API or transaction submission API.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateExportDocument} from './validate-unsigned-pda.mjs';
import {MAINNET_GENESIS,snapshotAddresses,validateProgramAccounts} from './otter-rpc-validation.mjs';

const API='https://verify.osec.io';
export const PIN={planSHA256:'01220f4d189c842ea36c146f4e4f6709d6661201c982301a77dc66bbd27f1576',
 sourceCommit:'ae52f73dcf854cc1e7c7e2c1ffa2ae714ad0ccc4',
 imageDigest:'ghcr.io/eltrueque/fast-launch-solana-builder@sha256:9a2afd0a1a847179919bf0ab484f54cda08bf537d88bf18d9ea8204feaf38a8f',
 metadataSHA256:'82ef3e996cc3f6faac73eeb1a0efbdf9f4a3450a75a3b3d626d1079046bd5588',
 signature:'52DgKepzJxyxe2ky7dtGnma85Tmqa7E7b9XjVd945wUMNPNSyZBwNFZVCvUPz1rKbuQBfSVu83kEFGaRChHQnDFx',
 finalizedSlot:453557597,normalizedProgramSHA256:'d05bae619e04ee166de5a6b7ba6d58c6b85efb988291f8ad67e5f245ca5e4c1b'};
const sha=b=>createHash('sha256').update(b).digest('hex');
export function validateReceipt(result){
 assert.equal(result?.value?.length,1);const receipt=result.value[0];assert(receipt,'Metadata signature absent from history');
 assert.equal(receipt.confirmationStatus,'finalized');assert.equal(receipt.err,null);assert.equal(receipt.slot,PIN.finalizedSlot);return receipt;
}
export function validateRemoteJob(job,doc){
 const state=String(job?.status||'').toLowerCase().replace(/[_\s-]/g,'');
 if(state==='completed'){
  assert(job.repo_url===doc.repository||job.repo_url===doc.repository+'/tree/'+PIN.sourceCommit,'Remote job repository differs');
  assert.equal(job.executable_hash,PIN.normalizedProgramSHA256,'Remote executable hash differs');
  assert.equal(job.on_chain_hash,PIN.normalizedProgramSHA256,'Remote on-chain hash differs');
  if(job.commit_hash!==undefined)assert.equal(job.commit_hash,PIN.sourceCommit);
  return {terminal:true,remoteJobVerified:true};
 }
 if(state==='failed')return {terminal:true,remoteJobVerified:false};
 return {terminal:false,remoteJobVerified:false};
}
export async function submitOnce(send,checkpoint,body){
 await checkpoint({submissionStage:'intent-saved',submissionBody:body,postAttempts:0});
 try{const result=await send(body);await checkpoint({submissionStage:'response-saved',postAttempts:1,submissionResponse:result});return result;}
 catch(error){await checkpoint({submissionStage:'outcome-unknown-or-rejected',postAttempts:1,submissionError:error.message});throw error;}
}
async function main(){
 const mode=process.argv[2]||'status';assert(['status','submit','--self-test'].includes(mode),'Mode must be status or submit');
 const path=resolve(process.env.OTTER_PLAN_PATH||'remote-verification-plan.json'),raw=await readFile(path),doc=JSON.parse(raw);
 assert.equal(sha(raw),PIN.planSHA256,'Public unsigned export changed');validateExportDocument(doc);assert.equal(doc.sourceCommit,PIN.sourceCommit);assert.equal(doc.imageDigest,PIN.imageDigest);
 if(mode==='--self-test'){await selfTest(doc);return;}
 const output=resolve(process.env.OTTER_EVIDENCE_PATH||'otter-remote-evidence/remote-verification.json');
 const proof={format:'fast-solana-otter-remote-v1',createdAt:new Date().toISOString(),mode,program:doc.program,authority:doc.authority,metadataPda:doc.metadataPda,
  sourceCommit:doc.sourceCommit,imageDigest:doc.imageDigest,planSHA256:PIN.planSHA256,fullELFSHA256:doc.programSHA256,normalizedProgramSHA256:PIN.normalizedProgramSHA256,
  metadataReceipt:{signature:PIN.signature,finalizedSlot:PIN.finalizedSlot},neverSigned:true,chainTransactionsSubmitted:false,postAttempts:0,remoteJobVerified:false,polls:[]};
 const save=async update=>{Object.assign(proof,update);await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(proof,null,2)+'\n');};
 const emit=()=>console.log('OTTER_REMOTE_PROOF_JSON_BEGIN\n'+JSON.stringify(proof,null,2)+'\nOTTER_REMOTE_PROOF_JSON_END');
 let rpcId=0;
 const rpc=async(method,params=[])=>{
  assert(['getGenesisHash','getSignatureStatuses','getMultipleAccounts'].includes(method),'Forbidden chain RPC');
  const id=++rpcId,response=await fetch(process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(25000)});
  assert(response.ok,method+' unavailable');const json=await response.json();assert.equal(json.id,id);assert(!json.error,method+' rejected');return json.result;
 };
 const chain=async()=>{
  assert.equal(await rpc('getGenesisHash'),MAINNET_GENESIS);
  const receipt=validateReceipt(await rpc('getSignatureStatuses',[[PIN.signature],{searchTransactionHistory:true}]));
  const accounts=await rpc('getMultipleAccounts',[snapshotAddresses(doc),{encoding:'base64',commitment:'finalized',minContextSlot:PIN.finalizedSlot}]);
  assert(accounts?.context?.slot>=PIN.finalizedSlot);const checked=validateProgramAccounts(accounts,doc,{allowExpectedNewMetadata:true});
  assert.equal(checked.existingMetadata.accountSHA256,PIN.metadataSHA256,'Finalized metadata changed');return {receipt,snapshot:checked,genesisHash:MAINNET_GENESIS};
 };
 const request=async(path,body)=>{
  assert(/^\/(verify-with-signer|status-all\/[1-9A-HJ-NP-Za-km-z]+|status\/[1-9A-HJ-NP-Za-km-z]+|job\/[a-zA-Z0-9-]+|logs\/[a-zA-Z0-9-]+)$/.test(path),'Unexpected Otter route');
  const response=await fetch(API+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  const text=await response.text();assert(text.length<2000000,'Oversized Otter response');let json=null;try{json=JSON.parse(text);}catch{}
  return {url:API+path,httpStatus:response.status,ok:response.ok,json,rawText:json===null?text:undefined};
 };
 try{
  // Refuse reusing a local evidence file for another POST after an uncertain result.
  if(mode==='submit'){try{const previous=JSON.parse(await readFile(output,'utf8'));assert(!previous.submissionStage,'Existing submission evidence: use status mode to avoid a duplicate request');}catch(error){if(error.code!=='ENOENT')throw error;}}
  await save({before:await chain(),phase:'finalized-metadata-confirmed'});
  await save({statusBefore:await request('/status/'+doc.program),statusAllBefore:await request('/status-all/'+doc.program)});
  let jobId=process.env.OTTER_JOB_ID||'';assert(!jobId||/^[a-zA-Z0-9-]{1,128}$/.test(jobId),'Invalid job id');
  if(mode==='submit'){
   assert.equal(jobId,'','Do not submit when an existing job id is supplied');
   const body={program_id:doc.program,signer:doc.authority,repository:'',commit_hash:''};
   // Reconfirm after preceding HTTP queries so the POST follows fresh metadata.
   await save({immediatelyBeforeSubmit:await chain()});
   const response=await submitOnce(b=>request('/verify-with-signer',b),save,body);
   if(!response.ok){await save({phase:response.httpStatus===409?'existing-job-or-conflict':'submission-rejected'});throw new Error('Otter submission HTTP '+response.httpStatus+'; inspect preserved response, do not automatically resubmit');}
   jobId=response.json?.request_id;assert(typeof jobId==='string'&&/^[a-zA-Z0-9-]{1,128}$/.test(jobId),'Otter did not return a valid request id');
   await save({jobId,jobURL:API+'/job/'+jobId,logsURL:API+'/logs/'+jobId,phase:'queued'});
   console.log('OTTER_REQUEST_ID='+jobId);
  }
  if(jobId){
   await save({jobId,jobURL:API+'/job/'+jobId,logsURL:API+'/logs/'+jobId});
   const limit=Number(process.env.OTTER_MAX_POLLS||12);assert(Number.isInteger(limit)&&limit>=1&&limit<=16);
   const pollDeadline=Date.now()+8*60*1000;
   for(let i=0;i<limit&&Date.now()<pollDeadline;i++){
    const response=await request('/job/'+jobId);proof.polls.push({at:new Date().toISOString(),response});await save({phase:'polling'});
    if(response.ok&&response.json){const result=validateRemoteJob(response.json,doc);if(result.terminal){await save({...result,phase:result.remoteJobVerified?'remote-job-verified':'remote-job-failed'});break;}}
    if(i+1<limit)await new Promise(r=>setTimeout(r,45000));
   }
   if(proof.phase==='polling')await save({phase:'pending-after-bounded-poll'});
   await save({logs:await request('/logs/'+jobId)});
  }
  await save({statusAfter:await request('/status/'+doc.program),statusAllAfter:await request('/status-all/'+doc.program),after:await chain(),completedAt:new Date().toISOString()});
  emit();if(proof.phase==='remote-job-failed')process.exitCode=1;
 }catch(error){await save({error:error.message,stoppedAt:new Date().toISOString()});emit();process.exitCode=1;}
}
async function selfTest(doc){
 let passed=0;const test=async(fn)=>{await fn();passed++;};
 const receipt={value:[{confirmationStatus:'finalized',err:null,slot:PIN.finalizedSlot}]};
 await test(()=>assert.equal(validateReceipt(receipt).slot,PIN.finalizedSlot));
 for(const change of [{confirmationStatus:'confirmed'},{err:'failed'},{slot:PIN.finalizedSlot-1}])await test(()=>assert.throws(()=>validateReceipt({value:[{...receipt.value[0],...change}]})));
 await test(()=>assert.throws(()=>validateReceipt({value:[null]})));
 const job={status:'completed',repo_url:doc.repository,executable_hash:PIN.normalizedProgramSHA256,on_chain_hash:PIN.normalizedProgramSHA256};
 await test(()=>assert.equal(validateRemoteJob(job,doc).remoteJobVerified,true));
 await test(()=>assert.equal(validateRemoteJob({...job,repo_url:doc.repository+'/tree/'+PIN.sourceCommit},doc).remoteJobVerified,true));
 for(const repo_url of [doc.repository+'/tree/'+'0'.repeat(40),doc.repository+'/tree/'+PIN.sourceCommit+'?ref=other',doc.repository+'?ref='+PIN.sourceCommit,doc.repository+'/tree/'+PIN.sourceCommit+'#other',doc.repository+'/tree/'+PIN.sourceCommit+'/',doc.repository.replace('ElTrueque','Foreign')+'/tree/'+PIN.sourceCommit])await test(()=>assert.throws(()=>validateRemoteJob({...job,repo_url},doc)));
 for(const change of [{repo_url:'wrong'},{executable_hash:doc.programSHA256},{on_chain_hash:'0'.repeat(64)},{commit_hash:'0'.repeat(40)}])await test(()=>assert.throws(()=>validateRemoteJob({...job,...change},doc)));
 await test(()=>assert.equal(validateRemoteJob({status:'in_progress'},doc).terminal,false));
 await test(()=>assert.deepEqual(validateRemoteJob({status:'failed'},doc),{terminal:true,remoteJobVerified:false}));
 await test(async()=>{let sends=0;const checkpoints=[];await assert.rejects(()=>submitOnce(async()=>{sends++;throw new Error('uncertain');},async s=>checkpoints.push(s),{}));assert.equal(sends,1);assert.equal(checkpoints[0].submissionStage,'intent-saved');assert.equal(checkpoints[1].submissionStage,'outcome-unknown-or-rejected');});
 await test(async()=>{let sends=0;await assert.rejects(()=>submitOnce(async()=>{sends++;},async()=>{throw new Error('disk failed');},{}));assert.equal(sends,0);});
 console.log(JSON.stringify({passed,scope:'Offline plan, receipt, normalized-hash and request-once tests; no HTTP or chain writes'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
