// Candidate Linux reproduction. No RPC, wallets, publication, signing, or deployment.
// A successful build is not enough: this exits nonzero unless the COMPLETE ELF matches.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join,delimiter} from 'node:path';
import assert from 'node:assert/strict';
assert(process.argv[2]&&process.argv[3],'Usage: node reproduce-linux.mjs SOURCE_ROOT PLATFORM_TOOLS_ROOT [--inspect] [--original-target-sysroot]');
const selfTest=process.argv.includes('--diagnostics-self-test');
const root=resolve(process.argv[2]),platform=resolve(process.argv[3]),inspect=process.argv.includes('--inspect')||selfTest,originalTargetSysroot=process.argv.includes('--original-target-sysroot');
// Generated from the ORIGINAL Anza v1.57 Windows archive target libraries.
// These contain SBPF target code, not Windows host executables.
const originalTargetFiles = {
  "libaddr2line-82a20b11f71a772a.rlib": {
    "bytes": 25078,
    "sha256": "03c1ae5cc25937ef546108d020a5a2cafc61f1a526753f3f09115ec19310649f"
  },
  "libaddr2line-82a20b11f71a772a.rmeta": {
    "bytes": 488008,
    "sha256": "43eb6f037fd4ca78363eb542dd4f8ccb048e2a70c31726fb9335c2498e6b3e73"
  },
  "libadler2-98cbf2afae003bc0.rlib": {
    "bytes": 9184,
    "sha256": "4f44a68528efaea7288b98a2c84f65f3d48a6229dd9ab63415f7685e1ceb8204"
  },
  "libadler2-98cbf2afae003bc0.rmeta": {
    "bytes": 20741,
    "sha256": "afe8557cc6f854726ff9e438f5d8d4a02d1c21fd6d1c0fb25d63f5a536831dba"
  },
  "liballoc-dfb769e0b332cc60.rlib": {
    "bytes": 250440,
    "sha256": "d7f0555cc944d2c3e6009f2ce3cd8126a086b5c0463635bc7e9e8b35f4c6ecd5"
  },
  "liballoc-dfb769e0b332cc60.rmeta": {
    "bytes": 7322043,
    "sha256": "5d816b64b4550c09c6b05123519769263ea46e551f94a456b0457a273f74c912"
  },
  "libcfg_if-9b84132404305b83.rlib": {
    "bytes": 3646,
    "sha256": "42244538b157a332ced7d867617832144685beab4ca6a695c9ae0cc2f5e64c2f"
  },
  "libcfg_if-9b84132404305b83.rmeta": {
    "bytes": 5692,
    "sha256": "5e4208d77d92ab3625bbd0238044beef2da8724a840def00f53db9b681a2fadd"
  },
  "libcompiler_builtins-962e71416b6502a9.rlib": {
    "bytes": 2122720,
    "sha256": "fa3854e3965ffbeb6b50c64c429c67883d8596c96c52be235f65dcc1096990f3"
  },
  "libcompiler_builtins-962e71416b6502a9.rmeta": {
    "bytes": 2009139,
    "sha256": "3a18be85cf120615c8b91b22c0c475d10b7f5d9670275939fca83c9b1e38844f"
  },
  "libcore-05b9b4dd8c39b0d7.rlib": {
    "bytes": 1254958,
    "sha256": "a2b9e6074a8d6cadae149ab6d64235910c8055816493a0329f80e585d2b1db16"
  },
  "libcore-05b9b4dd8c39b0d7.rmeta": {
    "bytes": 40251135,
    "sha256": "523ab524bb4c92dc765f49f37e410affb14c93b3780131c32a5eb37b9417075e"
  },
  "libgetopts-725f49de98d83d9c.rlib": {
    "bytes": 168230,
    "sha256": "120eac3cda472e0898e45804a449567d4a1652f51ca65a8c5c6ca98de6cab1eb"
  },
  "libgetopts-725f49de98d83d9c.rmeta": {
    "bytes": 224224,
    "sha256": "1ca3daa666f0999e59c6272e11aed73c319a1354bdc111317fccf58028cc2a28"
  },
  "libgimli-7f5e53b83c06cf48.rlib": {
    "bytes": 808920,
    "sha256": "bbdebfd832577cfc21199e4f35b5da42b372ee20b20f1493093667eaf493203a"
  },
  "libgimli-7f5e53b83c06cf48.rmeta": {
    "bytes": 5311677,
    "sha256": "6ae03e5d7d4548262094eb4c3409c7c1270fddebce0bee031f85490891af774c"
  },
  "libhashbrown-bafa1acc77cb7b40.rlib": {
    "bytes": 13598,
    "sha256": "83013ae3f3a8fc884e6b73f9ff318328da7c6d846b9c1c1948b8bc146d794edc"
  },
  "libhashbrown-bafa1acc77cb7b40.rmeta": {
    "bytes": 1640995,
    "sha256": "1efe0f3854cbd2a79ba4994a09b314a422fb96c628a250da7e6e996abb6478a6"
  },
  "liblibc-7ea744d115e10322.rlib": {
    "bytes": 3634,
    "sha256": "3c67821bc2bbf8ee6c59c690c171310a820167eaf114a0b2d7aa50c09b6cc668"
  },
  "liblibc-7ea744d115e10322.rmeta": {
    "bytes": 29001,
    "sha256": "879f9436f8e3ff271f1c74b5e6b2ff095dbbdd48a601d8d42e788e4d7ae1bcb6"
  },
  "libmemchr-fe369a78938baf93.rlib": {
    "bytes": 66470,
    "sha256": "b891c564da79087bd2e4643977668c723febeda4d07e8e2804fac858caf45a68"
  },
  "libmemchr-fe369a78938baf93.rmeta": {
    "bytes": 605195,
    "sha256": "6ef68f3c14956258338c7f19d643b7b5101db7988f682623479ad932f5235fff"
  },
  "libminiz_oxide-b4504fa7f48641ab.rlib": {
    "bytes": 101422,
    "sha256": "48d6e55b99322819ce677ef61e5546f66b0b49d31ab98cfc12e908669842cfa4"
  },
  "libminiz_oxide-b4504fa7f48641ab.rmeta": {
    "bytes": 126547,
    "sha256": "f2ec33dbb6cc20a03f1d80b0078c75ce260e6e92d9333f9e7f05a0672e85e316"
  },
  "libobject-60c1b73f37c77d7a.rlib": {
    "bytes": 171754,
    "sha256": "ec3f6b59fd047183636803b55851629139b430223814e8a1edee5de807102333"
  },
  "libobject-60c1b73f37c77d7a.rmeta": {
    "bytes": 8538036,
    "sha256": "b8eac33d845adfe03d40ce5ee9983a74b601e89f280e069f408298b346235115"
  },
  "libpanic_abort-6a29bd0a119d50c8.rlib": {
    "bytes": 6616,
    "sha256": "414a61441cbf8e47f748adcf7fa23794007ce4d26ce2e72e03be450aa5baab80"
  },
  "libpanic_abort-6a29bd0a119d50c8.rmeta": {
    "bytes": 2859,
    "sha256": "e8428c87d699d89b1945b9d9b9ebfa1da8c4cc9500d78d489fcefdc7a9a5f487"
  },
  "libpanic_unwind-616b3fe20ca075a4.rlib": {
    "bytes": 5258,
    "sha256": "1281de4e738fe9eb45c1d0d083bd7dfccaf72f08960c05aac01f99af23504002"
  },
  "libpanic_unwind-616b3fe20ca075a4.rmeta": {
    "bytes": 4630,
    "sha256": "6225768b9f68fb2c4e3c8120dbfc80b76ff11ab78766698b61030b1a13e3fa68"
  },
  "libproc_macro-36c797bc1c70b122.rlib": {
    "bytes": 999782,
    "sha256": "83ee41e9f29501a4abe517413b66f153bbc65db5524faa961501886b0c1e0e55"
  },
  "libproc_macro-36c797bc1c70b122.rmeta": {
    "bytes": 1035710,
    "sha256": "9776141f295eb90ff05729495664bbf7935abb81f47ede4280da14d77bb5c12b"
  },
  "librustc_literal_escaper-47b0c601a89d97aa.rlib": {
    "bytes": 3732,
    "sha256": "fa4dbbc20ad0468d78b16600441ae989c7d30a400d7bdd68d966973f345025ad"
  },
  "librustc_literal_escaper-47b0c601a89d97aa.rmeta": {
    "bytes": 121856,
    "sha256": "971b749df7a4d82e42f600f4ac2f094e0e8868d677f6cdd63db5676fb1ab0cab"
  },
  "librustc_std_workspace_alloc-c06fc4e061a090c0.rlib": {
    "bytes": 3764,
    "sha256": "0f9abfdc235bb5de1c9d8bc7c35d9b401baa9f06342c44be7df38e83d690f8e4"
  },
  "librustc_std_workspace_alloc-c06fc4e061a090c0.rmeta": {
    "bytes": 2103,
    "sha256": "405a7c0c0581318ae9aef5139e099ea2faad93a33079f523fd5193158e7d199c"
  },
  "librustc_std_workspace_core-65d1cb60d1847b40.rlib": {
    "bytes": 3770,
    "sha256": "1bf391a0152be8c41727eb9321054433c9de731415579d1b6cccba76512a2858"
  },
  "librustc_std_workspace_core-65d1cb60d1847b40.rmeta": {
    "bytes": 5757,
    "sha256": "77fbefd25557ea2374a04bcc6badd294a33c07f7290921ac2b179d4802376a20"
  },
  "librustc_std_workspace_std-6312cb604999ebff.rlib": {
    "bytes": 3752,
    "sha256": "0fe635e254f8917231dac63d53642fde06ff28a850f109133ea54fee8675a861"
  },
  "librustc_std_workspace_std-6312cb604999ebff.rmeta": {
    "bytes": 6476,
    "sha256": "7dcd995452f1074e08d9440754f847738f708c569f3fbdb3a10bcd5844857fd1"
  },
  "libstd_detect-8f2332e2cecf50d8.rlib": {
    "bytes": 3678,
    "sha256": "c5bc7bdfadf06caae32f134891401b4f6980f6a56eae0629f28091609c8fea3f"
  },
  "libstd_detect-8f2332e2cecf50d8.rmeta": {
    "bytes": 220892,
    "sha256": "aa7bace5f41ab69542bbfbb7c8491ee7555bcb424627b249a685623b1b6762d9"
  },
  "libstd-7ae51ceda2fca0c7.rlib": {
    "bytes": 626946,
    "sha256": "4b8ed3e60c9062de49530304ce6869ed5c16c78e03082c3acec8b623e48dee19"
  },
  "libstd-7ae51ceda2fca0c7.rmeta": {
    "bytes": 6391473,
    "sha256": "3e6c04176dad12738680a5223017e00835efc10504ca93a048349ff53cc3bacf"
  },
  "libsysroot-303c5a3a4bfc3b57.rlib": {
    "bytes": 3656,
    "sha256": "7f983bf4dd300751ac8915c54b57cbb2bfad1aed07e51f025c2ba9c013d1f617"
  },
  "libsysroot-303c5a3a4bfc3b57.rmeta": {
    "bytes": 1747,
    "sha256": "221f1cc9310da68d8bb77df0d346daef1bac86336c581525247a356cdd38c127"
  },
  "libtest-df9dd913773d475f.rlib": {
    "bytes": 1251228,
    "sha256": "1b368b0bd8db7aa511f6b7036bba382be490f635a96b889ca0dba70f5820538c"
  },
  "libtest-df9dd913773d475f.rmeta": {
    "bytes": 978697,
    "sha256": "63ebd4dec3fa07f0278b1e83b8c2087580cf0b09198c5c91044de024027672f7"
  },
  "libunwind-e5fe2f16a391016f.rlib": {
    "bytes": 3646,
    "sha256": "25b851bc9e0b61f7e8de51baf9dc62a0037a1c03c55500c63a26076ccf48735e"
  },
  "libunwind-e5fe2f16a391016f.rmeta": {
    "bytes": 1754,
    "sha256": "d616e21d0ea75fe98a3864320b4c74661eefe8604a3c9c8e517f4b68dd7ba4a3"
  }
};
assert(inspect||process.platform==='linux','This candidate needs Linux x86_64.');
assert(inspect||process.arch==='x64','Use the pinned Linux x86_64 toolchain.');
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const [name,h] of Object.entries(manifest.files))assert.equal(sha(await readFile(join(root,name))),h,'Changed source/artifact: '+name);
async function listFiles(dir,prefix=''){
 const found=[];for(const entry of await readdir(join(dir,prefix),{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())found.push(...await listFiles(dir,name+'/'));else{assert(entry.isFile(),'Unexpected non-file in target sysroot: '+name);found.push(name);}}return found.sort();
}
let sysrootCheck={mode:'native Linux target sysroot',filesChecked:0};
if(originalTargetSysroot){
 const dir=join(platform,'rust/lib/rustlib/sbpfv3-solana-solana/lib');
 const names=await listFiles(dir);assert.deepEqual(names,Object.keys(originalTargetFiles).sort(),'Unexpected target library names');
 for(const [name,expected] of Object.entries(originalTargetFiles)){const file=await readFile(join(dir,name));assert.equal(file.length,expected.bytes,'Target library size: '+name);assert.equal(sha(file),expected.sha256,'Target library digest: '+name);}
 sysrootCheck={mode:'original Windows distribution sbpfv3 target libraries; Linux host executables',filesChecked:names.length,files:originalTargetFiles};
}
const readString=(b,at)=>{let end=at;while(end<b.length&&b[end]!==0)end++;return b.subarray(at,end).toString('utf8');};
function sections(b){
 assert.equal(b.subarray(0,4).toString('hex'),'7f454c46');assert.equal(b[4],2);assert.equal(b[5],1);
 const start=Number(b.readBigUInt64LE(40)),size=b.readUInt16LE(58),count=b.readUInt16LE(60),namesIdx=b.readUInt16LE(62);
 const namesOffset=Number(b.readBigUInt64LE(start+size*namesIdx+24));
 return Array.from({length:count},(_,i)=>{const pos=start+size*i,offset=Number(b.readBigUInt64LE(pos+24)),length=Number(b.readBigUInt64LE(pos+32));return {index:i,name:readString(b,namesOffset+b.readUInt32LE(pos)),offset,bytes:length,sha256:sha(b.subarray(offset,offset+length))};});
}
function compareELF(actual,expected){
 const ranges=[];let differentBytes=0,current=null;
 for(let i=0;i<Math.max(actual.length,expected.length);i++){
  if(actual[i]!==expected[i]){differentBytes++;if(current&&current.endExclusive===i)current.endExclusive++;else{current={start:i,endExclusive:i+1};ranges.push(current);}}
 }
 const expectedSections=sections(expected),actualSections=sections(actual);
 return {differentBytes,differenceRangeCount:ranges.length,firstDifferentByte:ranges[0]?.start??null,
  differenceRanges:ranges.slice(0,32).map(range=>{const from=Math.max(0,range.start-48),to=Math.min(Math.max(actual.length,expected.length),range.endExclusive+48);return {...range,section:expectedSections.find(s=>range.start>=s.offset&&range.start<s.offset+s.bytes)?.name??'ELF headers/padding',contextFrom:from,actualHex:actual.subarray(from,to).toString('hex'),expectedHex:expected.subarray(from,to).toString('hex'),actualText:actual.subarray(from,to).toString('latin1'),expectedText:expected.subarray(from,to).toString('latin1')};}),
  expectedSections,actualSections,sectionComparisons:expectedSections.map((s,i)=>({name:s.name,sameMetadata:JSON.stringify({...s,sha256:null})===JSON.stringify({...actualSections[i],sha256:null}),sameBytes:s.sha256===actualSections[i]?.sha256}))};
}
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
if(selfTest){
 const expected=await readFile(join(root,'artifacts/el_trueque_fast_solana.so'));
 assert.equal(compareELF(expected,expected).differentBytes,0);
 const changedString=Buffer.from(expected);changedString[86714]^=1;const stringDiff=compareELF(changedString,expected);assert.equal(stringDiff.differentBytes,1);assert.equal(stringDiff.firstDifferentByte,86714);assert.equal(stringDiff.differenceRanges[0].section,'.strtab');
 const textOffset=sections(expected).find(s=>s.name==='.text').offset,changedText=Buffer.from(expected);changedText[textOffset]^=1;assert.equal(compareELF(changedText,expected).differenceRanges[0].section,'.text');
 changedText[textOffset+1]^=1;changedText[textOffset+3]^=1;const ranges=compareELF(changedText,expected);assert.equal(ranges.differentBytes,3);assert.equal(ranges.differenceRangeCount,2);
 console.log(JSON.stringify({scope:'offline diagnostic tests',testsPassed:4,sourceFilesChecked:Object.keys(manifest.files).length,sysrootFilesChecked:sysrootCheck.filesChecked},null,2));
}else if(inspect){
 console.log(JSON.stringify({scope:'candidate arguments only; Linux build NOT executed',sourceFilesChecked:Object.keys(manifest.files).length,sysrootCheck,pathRemapRules:rules.length,target:'sbpfv3-solana-solana',expectedSHA256:manifest.program.sha256,rules},null,2));
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
 let result={scope:'candidate Linux clean reproduction; no transactions',at:new Date().toISOString(),versions,sysrootCheck,command:['cargo',...args],exitCode:r.status,pathRemapRules:rules.length,expectedSHA256:manifest.program.sha256,expectedBytes:manifest.program.bytes};
 if(r.status===0){
  const elf=await readFile(join(run,'target/sbpfv3-solana-solana/release/el_trueque_fast_solana.so'));
  const expected=await readFile(join(root,'artifacts/el_trueque_fast_solana.so'));
  const sourceStrings=b=>(b.toString('latin1').match(/[ -~]{6,}/g)||[]).filter(s=>s.includes('.rs'));
  result={...result,actualSHA256:sha(elf),actualBytes:elf.length,exactMatch:elf.equals(expected),...compareELF(elf,expected),actualSourcePathStrings:sourceStrings(elf),expectedSourcePathStrings:sourceStrings(expected)};
  await writeFile(join(run,'el_trueque_fast_solana.so'),elf);
 }
 await writeFile(join(run,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 if(r.status!==0||!result.exactMatch)process.exitCode=1;
}
