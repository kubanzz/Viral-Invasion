import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
const kind=process.argv[2],attempt=process.argv[3]??'1';
if(!['targeted','full'].includes(kind)||!/^\d+$/.test(attempt))throw Error('Expected targeted|full and numeric attempt.');
const folder=`artifacts/completion-v073/browser/${kind}-${attempt}`;
if(existsSync(folder))throw Error('Preserve prior browser attempt.');
mkdirSync(folder,{recursive:true});
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const files=directory=>readdirSync(directory).sort().flatMap(name=>{
 const path=directory+'/'+name;return statSync(path).isDirectory()?files(path):[path];
});
const paths=[...files('src'),...files('tests'),'index.html','playwright.config.ts','package.json','package-lock.json','scripts/build-offline.mjs'];
const sourceManifest=Object.fromEntries(paths.map(path=>[path,hash(path)]));
const build=JSON.parse(readFileSync('dist/build-meta.json'));
if(build.version!=='0.7.3')throw Error('Expected new corrected build.');
const args=['node_modules/@playwright/test/cli.js','test'];
if(kind==='targeted')args.push('tests/e2e/feedback-v060.spec.ts','tests/e2e/feedback-v064-obstacle-visibility.spec.ts','tests/e2e/g4-ui-regressions.spec.ts','tests/e2e/g4.spec.ts',
 '--grep','spacious arena|visible advanced build|behind a raised fold|old two-trait archive|complete browser seed 1,');
args.push(kind==='full'?'--workers=4':'--workers=3','--fully-parallel');
const metadata={startedAt:new Date().toISOString(),kind,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 method:'Installed Chrome and Edge, actual local file build, real DOM input with read-only game snapshots. Explicit storage fault/old profile fixtures remain labeled. Headless focus observations do not prove native OS focus. Functional concurrency makes no FPS claim.',
 command:['node',...args],bundleSha256:hash('dist/game.js'),htmlSha256:hash('dist/index.html'),buildMetadataSha256:hash('dist/build-meta.json'),sourceManifest,status:'running'};
writeFileSync(folder+'/pre-run.json',JSON.stringify(metadata,null,2));
let log='';const child=spawn(process.execPath,args,{env:{...process.env,VI_E2E_REPORT:folder+'/report.json',VI_E2E_OUTPUT:folder+'/output',VI_E2E_HTML:folder+'/report-html',VI_E2E_LEAN:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{const value=bytes.toString();log+=value;process.stdout.write(value);});
const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
writeFileSync(folder+'/command.log',log);
const mismatches=Object.entries(sourceManifest).filter(([path,expected])=>hash(path)!==expected).map(([path])=>path);
const result={...metadata,finishedAt:new Date().toISOString(),status:exitCode===0?'passed':'failed',exitCode,sourceUnchanged:mismatches.length===0,mismatches,
 bundleUnchanged:hash('dist/game.js')===metadata.bundleSha256&&hash('dist/index.html')===metadata.htmlSha256&&hash('dist/build-meta.json')===metadata.buildMetadataSha256,
 report:folder+'/report.json',scope:'The raw report determines actual passed/failed/skipped allocations. No prior attempt is relabeled as this build or merged into its measured time.'};
writeFileSync(folder+'/execution.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({exitCode,sourceUnchanged:result.sourceUnchanged,bundleUnchanged:result.bundleUnchanged}));
process.exitCode=exitCode||(!result.sourceUnchanged||!result.bundleUnchanged?1:0);
