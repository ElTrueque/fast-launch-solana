#!/usr/bin/env node
// Transparent adapter: compile mounted sources; preserve the fresh complete ELF.
// Reference artifact is used only by reproduction validation, never as output.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,basename,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

export function parseInvocation(argv,cwd){
 const args=[...argv];assert.equal(args.shift(),'build-sbf','This adapter implements cargo build-sbf only');
 let arch=null,manifestPath=null,locked=false;
 while(args.length){
  const arg=args.shift();
  if(arg==='--')continue;
  if(arg==='--arch'){arch=args.shift();continue;}
  if(arg==='--manifest-path'){manifestPath=resolve(cwd,args.shift());continue;}
  if(arg==='--config'){assert.equal(args.shift(),'registries.crates-io.protocol="sparse"');continue;}
  if(arg==='--locked'){locked=true;continue;}
  throw new Error('Unsupported argument: '+arg);
 }
 assert.equal(arch,'v3','Expected SBPF v3');assert(locked,'Expected locked inputs');
 assert(manifestPath,'Expected manifest path');assert.equal(basename(manifestPath),'Cargo.toml');
 const program=dirname(manifestPath);assert.equal(basename(program),'program');
 return {program,root:dirname(program),manifestPath};
}

if(process.argv.includes('--self-test')){
 const cwd=resolve('adapter-test'),args=['build-sbf','--arch','v3','--','--config','registries.crates-io.protocol="sparse"','--locked','--manifest-path',join(cwd,'program','Cargo.toml')];
 assert.equal(parseInvocation(args,cwd).root,cwd);
 assert.throws(()=>parseInvocation(args.map(x=>x==='v3'?'v2':x),cwd));
 assert.throws(()=>parseInvocation([...args,'--skip-build'],cwd));
 assert.throws(()=>parseInvocation(args.filter(x=>x!=='--locked'),cwd));
 console.log(JSON.stringify({scope:'adapter argument tests; no build',testsPassed:4}));
}else{
 const invocation=parseInvocation(process.argv.slice(2),process.cwd());
 const {root,program}=invocation,runDirectory=join(root,'.repro');
 const before=new Set(await readdir(runDirectory).catch(e=>{if(e.code==='ENOENT')return [];throw e;}));
 const run=spawnSync(process.execPath,['/opt/fast/reproduce-linux.mjs',root,'/opt/platform','--original-target-sysroot'],{stdio:'inherit',env:process.env});
 assert.equal(run.status,0,'Fresh source build or exact whole-ELF validation failed');
 const added=(await readdir(runDirectory)).filter(x=>!before.has(x)&&x.startsWith('linux-'));
 assert.equal(added.length,1,'Expected one fresh build result');
 const build=join(runDirectory,added[0]),result=JSON.parse(await readFile(join(build,'result.json'),'utf8'));
 assert.equal(result.exactMatch,true);assert.equal(result.differentBytes,0);
 assert.equal(result.actualBytes,87160);assert.equal(result.actualSHA256,'7db37174011a0a5736cae8558ddc81ae48dfdb0f58ce62ef0dff182064ed659d');
 const generated=join(build,'el_trueque_fast_solana.so'),bytes=await readFile(generated);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),result.actualSHA256);
 const output=join(program,'target/deploy');await mkdir(output,{recursive:true});
 await copyFile(generated,join(output,'el_trueque_fast_solana.so'));
 await writeFile(join(output,'reproduction-receipt.json'),JSON.stringify({invocation,result,copiedFrom:generated,outputProcessing:'copy only; no stripping or ELF rewriting'},null,2)+'\n');
 console.log('Copied fresh exact ELF to '+join(output,'el_trueque_fast_solana.so'));
}
