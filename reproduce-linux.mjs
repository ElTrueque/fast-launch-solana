// Candidate Linux reproduction. No RPC, wallets, publication, signing, or deployment.
// A successful build is not enough: this exits nonzero unless the COMPLETE ELF matches.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join,delimiter} from 'node:path';
import assert from 'node:assert/strict';
assert(process.argv[2]&&process.argv[3],'Usage: node reproduce-linux.mjs SOURCE_ROOT PLATFORM_TOOLS_ROOT [--inspect]');
const root=resolve(process.argv[2]),platform=resolve(process.argv[3]),inspect=process.argv.includes('--inspect');
assert(inspect||process.platform==='linux','This candidate needs Linux x86_64.');
assert(inspect||process.arch==='x64','Use the pinned Linux x86_64 toolchain.');
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const [name,h] of Object.entries(manifest.files))assert.equal(sha(await readFile(join(root,name))),h,'Changed source/artifact: '+name);
const originalRoot=manifest.embeddedSourceRoot;
const unixRoot=root.replaceAll('\\','/'),flags=['-C','panic=abort','-C','target-cpu=v3'];
const rules=[];
for(const name of Object.keys(manifest.files).filter(n=>n.endsWith('.rs'))){
 if(name.startsWith('program/')){
  const rel=name.slice('program/'.length),windows=rel.replaceAll('/','\\');
  rules.push([rel,windows],[unixRoot+'/program/'+rel,windows]);
 }else if(name.startsWith('vendor/')){
  const windows=originalRoot+'\\program\\..\\'+name.replaceAll('/','\\');
  rules.push([unixRoot+'/'+name,windows],[unixRoot+'/program/../'+name,windows]);
 }
}
for(const [from,to] of rules)flags.push('--remap-path-prefix='+from+'='+to);
if(inspect){
 console.log(JSON.stringify({scope:'candidate arguments only; Linux build NOT executed',sourceFilesChecked:Object.keys(manifest.files).length,pathRemapRules:rules.length,target:'sbpfv3-solana-solana',expectedSHA256:manifest.program.sha256,rules},null,2));
}else{
 const cargo=join(platform,'rust/bin/cargo'),rustc=join(platform,'rust/bin/rustc');
 const env={...process.env,RUSTC:rustc};env.PATH=join(platform,'rust/bin')+delimiter+join(platform,'llvm/bin')+delimiter+env.PATH;
 const versions={};for(const [name,exe] of [['rustc',rustc],['cargo',cargo]]){
  const r=spawnSync(exe,['--version'],{env,encoding:'utf8'});assert.equal(r.status,0,name+' does not run');versions[name]=r.stdout.trim();assert.equal(versions[name],manifest.toolchain[name],'Tool version mismatch');
 }
 const run=join(root,'.repro','linux-'+new Date().toISOString().replaceAll(/[:.]/g,'-'));
 await mkdir(run,{recursive:true});env.CARGO_HOME=join(run,'cargo-home');env.CARGO_TARGET_DIR=join(run,'target');env.CARGO_ENCODED_RUSTFLAGS=flags.join('\x1f');
 const args=['build','--offline','--release','--target','sbpfv3-solana-solana','--locked'];
 const r=spawnSync(cargo,args,{cwd:join(root,'program'),env,encoding:'utf8',maxBuffer:16*1024*1024});
 await writeFile(join(run,'build.log'),(r.stdout||'')+(r.stderr||'')+(r.error?.message||''));
 await writeFile(join(run,'path-remap-rules.json'),JSON.stringify(rules,null,2)+'\n');
 let result={scope:'candidate Linux clean reproduction; no transactions',at:new Date().toISOString(),versions,command:['cargo',...args],exitCode:r.status,pathRemapRules:rules.length,expectedSHA256:manifest.program.sha256,expectedBytes:manifest.program.bytes};
 if(r.status===0){
  const elf=await readFile(join(run,'target/sbpfv3-solana-solana/release/el_trueque_fast_solana.so'));
  const expected=await readFile(join(root,'artifacts/el_trueque_fast_solana.so'));
  let firstDifferentByte=null;for(let i=0;i<Math.max(elf.length,expected.length);i++)if(elf[i]!==expected[i]){firstDifferentByte=i;break;}
  const sourceStrings=b=>(b.toString('latin1').match(/[ -~]{6,}/g)||[]).filter(s=>s.includes('.rs'));
  result={...result,actualSHA256:sha(elf),actualBytes:elf.length,exactMatch:elf.equals(expected),firstDifferentByte,actualSourcePathStrings:sourceStrings(elf),expectedSourcePathStrings:sourceStrings(expected)};
  await writeFile(join(run,'el_trueque_fast_solana.so'),elf);
 }
 await writeFile(join(run,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 if(r.status!==0||!result.exactMatch)process.exitCode=1;
}
