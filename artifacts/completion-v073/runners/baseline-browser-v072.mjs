import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
const folder = 'artifacts/completion-v072/browser/attempt-1';
if (existsSync(folder)) throw Error('Preserve prior browser attempt.');
mkdirSync(folder, {recursive:true});
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const files = directory => readdirSync(directory).sort().flatMap(name => {
  const path = directory + '/' + name; return statSync(path).isDirectory() ? files(path) : [path];
});
const paths = [...files('src'), ...files('tests'), 'index.html', 'playwright.config.ts', 'package.json', 'package-lock.json', 'scripts/build-offline.mjs'];
const sourceManifest = Object.fromEntries(paths.map(path=>[path,hash(path)]));
const gameHash = hash('dist/game.js');
if (gameHash !== '6b5396f6b09c123dd2cbe5f6feacff1641f0f7c41a92b6ac1e55883dd8d1d9e3') throw Error('Unexpected game build.');
const metadata = { startedAt: new Date().toISOString(), revision: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  method: 'Complete current Playwright suite on installed Chrome and Edge; real DOM inputs, read-only game snapshots. Explicitly named storage-fault fixtures are isolated. Headless focus fallback is synthetic and does not close native OS focus. Concurrent functional runs provide no FPS conclusion.',
  command: ['node','node_modules/@playwright/test/cli.js','test','--workers=3','--fully-parallel'],
  bundleSha256: gameHash, htmlSha256:hash('dist/index.html'), buildMetadataSha256: hash('dist/build-meta.json'), sourceManifest, status:'running' };
writeFileSync(folder+'/pre-run.json',JSON.stringify(metadata,null,2));
let log='';
const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','--workers=3','--fully-parallel'],{
  env:{...process.env,VI_E2E_REPORT:folder+'/report.json',VI_E2E_OUTPUT:folder+'/output',VI_E2E_HTML:folder+'/report-html',VI_E2E_LEAN:'1'},
  stdio:['ignore','pipe','pipe'],windowsHide:true,
});
for(const stream of [child.stdout,child.stderr]) stream.on('data',bytes=>{const value=bytes.toString();log+=value;process.stdout.write(value);});
const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
writeFileSync(folder+'/command.log',log);
const mismatches=Object.entries(sourceManifest).filter(([path,expected])=>hash(path)!==expected).map(([path])=>path);
const result={...metadata,finishedAt:new Date().toISOString(),status:exitCode===0?'passed':'failed',exitCode,
  sourceUnchanged:mismatches.length===0,mismatches,bundleUnchanged:hash('dist/game.js')===gameHash&&hash('dist/index.html')===metadata.htmlSha256&&hash('dist/build-meta.json')===metadata.buildMetadataSha256,
  report:folder+'/report.json',scope:'Actual report stats determine passed/failed/skipped allocations; skipped cases never count as passes. Failed attempts remain preserved.'};
writeFileSync(folder+'/execution.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({exitCode,sourceUnchanged:result.sourceUnchanged,bundleUnchanged:result.bundleUnchanged}));
process.exitCode=exitCode || (mismatches.length ? 1 : 0);
