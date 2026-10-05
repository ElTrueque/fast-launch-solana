// Offline compilation only. Does not read wallets or submit transactions.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

assert.equal(process.platform,'win32','Use the pinned Windows platform-tools distribution.');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const platform=resolve(process.argv[2]||'');
assert(process.argv[2],'Usage: node scripts/reproduce-windows.mjs PATH_TO_PLATFORM_TOOLS [--original-paths]');
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const [name,expected] of Object.entries(manifest.files))assert.equal(sha(await readFile(join(root,name))),expected,'Changed input: '+name);
const cargo=join(platform,'rust/bin/cargo.exe'),rustc=join(platform,'rust/bin/rustc.exe');
for(const [name,expected] of Object.entries(manifest.toolchain.executables))assert.equal(sha(await readFile(join(platform,name))),expected,'Changed tool: '+name);
const run=resolve(root,'.repro',new Date().toISOString().replaceAll(/[:.]/g,'-'));
await mkdir(run,{recursive:true});
const rustflags=['-C','panic=abort','-C','target-cpu=v3'];
// The deployed ELF contains original Windows source paths. Restore those debug/panic
// path strings when compiling from another checkout; the sources stay untouched.
if(process.argv.includes('--original-paths'))rustflags.push('--remap-path-prefix='+root+'='+manifest.embeddedSourceRoot);
const env={...process.env,CARGO_HOME:join(run,'cargo-home'),CARGO_TARGET_DIR:join(run,'target'),RUSTC:rustc,CARGO_ENCODED_RUSTFLAGS:rustflags.join('\x1f')};
env.PATH=join(platform,'rust/bin')+delimiter+join(platform,'llvm/bin')+delimiter+env.PATH;
const args=['build','--offline','--release','--target','sbpfv3-solana-solana','--locked'];
const r=spawnSync(cargo,args,{cwd:join(root,'program'),env,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
await writeFile(join(run,'build.log'),(r.stdout||'')+(r.stderr||'')+(r.error?.message||''));
let result={scope:'offline clean rebuild; no network reads or transaction submission',at:new Date().toISOString(),command:['cargo',...args],originalSourcePathsRemapped:process.argv.includes('--original-paths'),exitCode:r.status,expectedSHA256:manifest.program.sha256,expectedBytes:manifest.program.bytes};
if(r.status===0){
 const elf=await readFile(join(run,'target/sbpfv3-solana-solana/release/el_trueque_fast_solana.so'));
 result={...result,actualSHA256:sha(elf),actualBytes:elf.length,exactMatch:sha(elf)===manifest.program.sha256};
 await writeFile(join(run,'el_trueque_fast_solana.so'),elf);
}
await writeFile(join(run,'result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,evidenceDirectory:run},null,2));
if(r.status!==0||!result.exactMatch)process.exitCode=1;
