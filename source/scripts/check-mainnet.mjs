// Read-only RPC methods only. No wallet, signing, or transaction submission.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const expected=manifest.program;
const elf=await readFile(new URL('artifacts/el_trueque_fast_solana.so',root));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(elf),expected.sha256,'Reference ELF changed');
const loader='BPFLoaderUpgradeab1e11111111111111111111111';
function base58(s){
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;
 for(const c of s){const v=alphabet.indexOf(c);assert(v>=0,'Invalid base58');n=n*58n+BigInt(v);}
 const tail=n===0n?Buffer.alloc(0):Buffer.from(n.toString(16).padStart(Math.ceil(n.toString(16).length/2)*2,'0'),'hex');
 const b=Buffer.concat([Buffer.alloc(s.match(/^1*/)[0].length),tail]);assert.equal(b.length,32,'Wrong pubkey size');return b;
}
function checkAccounts(snapshot){
 assert(snapshot?.context&&Number.isSafeInteger(snapshot.context.slot),'Missing slot');
 assert.equal(snapshot.value?.length,2,'Missing program accounts');
 const [p,pd]=snapshot.value;
 for(const a of [p,pd]){assert(a&&a.owner===loader,'Wrong loader owner');assert(Array.isArray(a.data)&&a.data[1]==='base64','Wrong account encoding');}
 const program=Buffer.from(p.data[0],'base64'),data=Buffer.from(pd.data[0],'base64');
 assert.equal(p.executable,true,'Program not executable');assert.equal(program.length,36);assert.equal(program.readUInt32LE(0),2);
 assert(program.subarray(4).equals(base58(expected.programData)),'Wrong program-data account');
 assert.equal(pd.executable,false,'ProgramData must not be executable');assert(data.length>=45+expected.bytes,'Truncated ProgramData');assert.equal(data.readUInt32LE(0),3);assert.equal(data[12],1,'Upgrade authority missing');
 assert(data.subarray(13,45).equals(base58(expected.upgradeAuthority)),'Upgrade authority changed');
 const executable=data.subarray(45,45+expected.bytes),padding=data.subarray(45+expected.bytes);
 assert(padding.every(b=>b===0),'Nonzero ProgramData padding');
 assert.equal(sha(executable),expected.sha256,'Mainnet executable changed');assert(executable.equals(elf),'Mainnet ELF differs');
 return {programId:expected.id,programData:expected.programData,authority:expected.upgradeAuthority,verifiedSlot:snapshot.context.slot,deploymentSlot:data.readBigUInt64LE(4).toString(),programSHA256:sha(executable),bytes:executable.length,zeroPaddingBytes:padding.length,runtimeChecked:true,commitment:'finalized'};
}
if(process.argv.includes('--self-test')){
 const p=Buffer.alloc(36);p.writeUInt32LE(2);base58(expected.programData).copy(p,4);
 const pd=Buffer.alloc(45+elf.length);pd.writeUInt32LE(3);pd[12]=1;base58(expected.upgradeAuthority).copy(pd,13);elf.copy(pd,45);
 const fixture=()=>({context:{slot:1},value:[{owner:loader,executable:true,data:[p.toString('base64'),'base64']},{owner:loader,executable:false,data:[pd.toString('base64'),'base64']}]});
 assert.equal(checkAccounts(fixture()).runtimeChecked,true);
 const badOwner=fixture();badOwner.value[0].owner='bad';assert.throws(()=>checkAccounts(badOwner),/Wrong loader owner/);
 const badCode=fixture(),altered=Buffer.from(pd);altered[45]^=1;badCode.value[1].data[0]=altered.toString('base64');assert.throws(()=>checkAccounts(badCode),/Mainnet executable changed/);
 const badAuthority=fixture(),changed=Buffer.from(pd);changed[13]^=1;badAuthority.value[1].data[0]=changed.toString('base64');assert.throws(()=>checkAccounts(badAuthority),/Upgrade authority changed/);
 const malformed=fixture();malformed.value[0].data[0]=p.subarray(0,30).toString('base64');assert.throws(()=>checkAccounts(malformed));
 const substituted=fixture(),wrongProgram=Buffer.from(p);wrongProgram[4]^=1;substituted.value[0].data[0]=wrongProgram.toString('base64');assert.throws(()=>checkAccounts(substituted),/Wrong program-data account/);
 const padded=fixture();padded.value[1].data[0]=Buffer.concat([pd,Buffer.alloc(64)]).toString('base64');assert.equal(checkAccounts(padded).zeroPaddingBytes,64);
 const badPadding=fixture();badPadding.value[1].data[0]=Buffer.concat([pd,Buffer.from([1])]).toString('base64');assert.throws(()=>checkAccounts(badPadding),/Nonzero ProgramData padding/);
 const executableData=fixture();executableData.value[1].executable=true;assert.throws(()=>checkAccounts(executableData),/ProgramData must not be executable/);
 console.log(JSON.stringify({offlineChecks:9,passed:9,networkRequests:0}));
}else{
 const endpoint=process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
 async function rpc(method,params=[]){
  assert(['getGenesisHash','getMultipleAccounts'].includes(method),'Unsupported RPC method');
  for(let i=0;i<3;i++)try{
   const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});
   assert(r.ok,'RPC HTTP '+r.status);const value=await r.json();assert(!value.error,'RPC error '+JSON.stringify(value.error));return value.result;
  }catch(e){if(i===2)throw e;await new Promise(resolve=>setTimeout(resolve,1000*(i+1)));}
 }
 try{
  assert.equal(await rpc('getGenesisHash'),'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','Wrong Solana network');
  const result={...checkAccounts(await rpc('getMultipleAccounts',[[expected.id,expected.programData],{encoding:'base64',commitment:'finalized'}])),verifiedAt:new Date().toISOString(),sourcePublicationOrOtterBadgeConfirmed:false};
  await writeFile(new URL('evidence/runtime-finalized.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }catch(e){console.error('Read-only mainnet verification failed: '+e.message);process.exitCode=1;}
}
