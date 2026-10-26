import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const stage = process.argv[2];
if (!/^G[1-4]$/.test(stage ?? '')) throw new Error('Usage: node scripts/collect-stage-evidence.mjs G1|G2|G3|G4');
const destination = join('artifacts', stage);
await mkdir(join(destination, 'screenshots'), { recursive: true });
const report = JSON.parse(await readFile('artifacts/e2e-report.json', 'utf8'));
const rerunPaths=process.argv.slice(3);
const reports=[report,...await Promise.all(rerunPaths.map(async path=>JSON.parse(await readFile(path,'utf8'))))];
const unit = JSON.parse(await readFile('artifacts/unit-results.json', 'utf8'));
const resolvedCases = new Map();
function visit(suites, reportIndex, parents=[]) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) {
      const result = test.results.at(-1);
      const id=[...parents,suite.title,spec.title,test.projectName].join(' > ');
      const previous=resolvedCases.get(id);
      resolvedCases.set(id,{ id, name: spec.title, browser: test.projectName, status: result.status, durationMs: result.duration, reportIndex,
        previousResults:previous?[...(previous.previousResults??[]),{status:previous.status,durationMs:previous.durationMs,reportIndex:previous.reportIndex}]:[],
        annotations: test.annotations, evidence: Object.fromEntries(result.attachments.filter(a=>a.body&&a.contentType==='application/json').map(a=>[a.name,JSON.parse(Buffer.from(a.body,'base64').toString('utf8'))])) });
    }
    visit(suite.suites,reportIndex,[...parents,suite.title]);
  }
}
reports.forEach((item,index)=>visit(item.suites,index));
const cases=[...resolvedCases.values()];
async function files(directory) {
  const list=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if(entry.isDirectory()) list.push(...await files(path)); else list.push(path);
  }
  return list;
}
const buildMeta=JSON.parse(await readFile('dist/build-meta.json','utf8'));
const sourcePaths = [...await files('src'),'package.json','package-lock.json','scripts/build-offline.mjs'].sort();
const sourceManifest = buildMeta.sourceManifest ?? Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path.replaceAll('\\','/'),createHash('sha256').update(await readFile(path)).digest('hex')])));
const screenshots=[];
for (const directory of await readdir('artifacts/e2e-results', { withFileTypes: true })) {
  if (!directory.isDirectory() || !directory.name.toLowerCase().startsWith(stage.toLowerCase())) continue;
  for (const name of await readdir(join('artifacts/e2e-results', directory.name))) if(name.endsWith('.png')) {
    const output=join(destination,'screenshots',`${directory.name}-${name}`);
    await copyFile(join('artifacts/e2e-results',directory.name,name),output); screenshots.push(relative('.',output).replaceAll('\\','/'));
  }
}
const summary={stage,version:JSON.parse(await readFile('package.json','utf8')).version,collectedAt:new Date().toISOString(),
  gitHeadAtCollection:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  worktreeStatusAtCollection:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(),
  sourceTreeSha256:createHash('sha256').update(JSON.stringify(sourceManifest)).digest('hex'),sourceManifest,sourceManifestScope:buildMeta.sourceManifest?'Bundled entry inputs, CSS, HTML, package manifests and build script recorded at build time.':'All source files recorded at evidence collection time (legacy build metadata).',
  releaseGameJsSha256:createHash('sha256').update(await readFile('dist/game.js')).digest('hex'),
  unit:{total:unit.numTotalTests,passed:unit.numPassedTests,failed:unit.numFailedTests},
  browser:{expected:cases.filter(c=>c.status==='passed').length,unexpected:cases.filter(c=>c.status!=='passed'&&c.status!=='skipped').length,skipped:cases.filter(c=>c.status==='skipped').length,cases,
    executions:reports.map((item,index)=>({reportIndex:index,path:index?rerunPaths[index-1]:'artifacts/e2e-report.json',stats:item.stats})),resolution:'Latest result for each complete suite/title/browser identity; earlier results retained in previousResults and raw reports.'},screenshots,
  provenance:'Browser cases use actual keyboard and mouse inputs with read-only diagnostics. Unit fixtures are separate system tests. Human playtests have not been performed.',
  limitations:['Physical OS blur/minimize and real browser Ctrl+/- zoom remain unverified.','No claim of human comprehension, enjoyment, or retention is made.']};
await writeFile(join(destination,'verification-summary.json'),JSON.stringify(summary,null,2));
await copyFile('artifacts/e2e-report.json',join(destination,'e2e-report.json'));
for(let index=0;index<rerunPaths.length;index++)await copyFile(rerunPaths[index],join(destination,`e2e-rerun-${index+1}.json`));
await copyFile('artifacts/unit-results.json',join(destination,'unit-results.json'));
console.log(JSON.stringify({stage,unit:summary.unit,browser:summary.browser.cases.map(({name,browser,status})=>({name,browser,status})),screenshots},null,2));
