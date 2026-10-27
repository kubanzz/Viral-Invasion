import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
const root='artifacts/gameplay-v078', sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const build=await read('dist/build-meta.json');
if(build.version!=='0.7.8')throw Error('Wrong release version');
const snapshotPaths=Object.keys(build.sourceManifest);
for(const [path,expected] of Object.entries(build.sourceManifest))if(sha(await readFile(path))!==expected)throw Error(`Stale browser build: ${path}`);
const unit=await read(`${root}/unit-final.json`), presentation=await read(`${root}/presentation-final.json`);
if(!unit.success||unit.numFailedTests||!presentation.success||presentation.numFailedTests)throw Error('Unit failure');
const browser=[];
for(const name of ['chrome-final','edge-final','chrome-mode-final','edge-mode-final']){
  const path=`${root}/${name}-report.json`, report=await read(path);
  if(report.stats.expected!==1||report.stats.unexpected||report.stats.skipped)throw Error(`Browser failure: ${name}`);
  browser.push({path,sha256:sha(await readFile(path)),...report.stats});
}
const release=await read(`${root}/release-package.json`), smoke=await read(`${root}/release-smoke/report.json`);
if(!release.staticPass||!smoke.pass||sha(await readFile(release.zip))!==release.sha256)throw Error('Release mismatch');
const sourceMap=await read(`${root}/build-comparison/attempt-1/source-map.json`);
for(const item of sourceMap.sources)if(!item.matches||sha(await readFile(item.path))!==item.naturalBuildSha256)throw Error(`Stale simulation: ${item.path}`);
const methods=['.tools/endless-pressure-baseline.mjs','.tools/endless-pressure-after.mjs','.tools/endless-pressure-ray-fix.mjs','.tools/endless-pressure-final.mjs',
  '.tools/navigation-audit-v078.mjs','.tools/navigation-boundary-audit-v078.mjs','.tools/navigation-performance-v078.mjs',
  '.tools/run-v078-browser.cjs','.tools/package-v078.mjs','.tools/seal-v078.mjs'];
for(const path of methods){const to=`${root}/methods/${path.split('/').at(-1)}`;await mkdir(dirname(to),{recursive:true});await writeFile(to,await readFile(path),{flag:'wx'});}
const supplemental=['scripts/package-release.mjs','scripts/verify-release.mjs','playwright.config.ts',
  ...((await readdir('tests/unit')).filter(path=>path.endsWith('.test.ts')).map(path=>`tests/unit/${path}`)),
  'tests/e2e/gameplay-v078.spec.ts','tests/e2e/endless-v077.spec.ts','tests/e2e/campaignDriver.ts','tests/e2e/heldMovement.ts'];
const saved={};
for(const path of [...new Set([...snapshotPaths,...supplemental])].sort()){
  const bytes=await readFile(path), to=`${root}/input-snapshot/${path}`;
  await mkdir(dirname(to),{recursive:true});await writeFile(to,bytes,{flag:'wx'}); saved[path]=sha(bytes);
}
await writeFile(`${root}/build-meta.json`,await readFile('dist/build-meta.json'),{flag:'wx'});
await writeFile(`${root}/input-manifest.json`,JSON.stringify(saved,null,2)+'\n',{flag:'wx'});
const comparison=await read(`${root}/build-comparison/attempt-1/report.json`), pressure=await read(`${root}/pressure-final.json`);
const summary={version:'0.7.8',candidate:'formations-continuous-synergy',generatedAt:new Date().toISOString(),baselineCommit:'ac3341ef728e1d57fe2ed92bb38721aa419a4ef9',
  design:'DesignDoc_v1.3/ViralInvasion_GDD_v1.3.md',
  build:{sourcePaths:snapshotPaths.length,savedInputPaths:Object.keys(saved).length,savedSourcesMatch:true,
    gameSha256:sha(await readFile('dist/game.js')),indexSha256:sha(await readFile('dist/index.html')),metadataSha256:sha(await readFile('dist/build-meta.json'))},
  typecheck:{command:'node node_modules/typescript/bin/tsc --noEmit',exitCode:0},
  unit:{path:`${root}/unit-final.json`,files:unit.testResults.length,passed:unit.numPassedTests,failed:unit.numFailedTests,
    excluded:['tests/unit/full-system-seeds.test.ts'],scope:'Ordinary suite includes campaign branches, failures, growth, migration and 72000-tick battle; old 1000-session full-system strategy audit not repeated.'},
  finalPresentation:{path:`${root}/presentation-final.json`,passed:presentation.numPassedTests,changeAfterFullSuite:'Only move new special-tactic captions beside the frozen warning lane; no simulation changes.'},
  browser,browserScope:['Offline file entry, real DOM inputs and read-only snapshots','Five natural clears per browser; same-ID squad redirect, real bites, upgrades and fifth-wave protocol reward',
    'Real support/elite tell visibility and paused tick freeze','Campaign/challenge isolation and 1100x560 panels'],
  navigation:{path:`${root}/navigation-integration-final-v3.json`,scope:'Explicitly adjusted GameSession fixtures; not natural survival or human difficulty proof.'},
  naturalBuilds:{path:`${root}/build-comparison/attempt-1/report.json`,runs:comparison.results.length,
    scope:'Public fixed-step actions and all choice transactions; no simulation state injection; all six strategies clear12 with zero player damage. Natural population6–10, not24-body performance.'},
  stationary:{path:`${root}/pressure-final.json`,runs:pressure.results.length,scope:'No mobility, squad or area tools. Nearest-visible exact aim1 and public upgrade/discard transactions. One seed remains untouched; one suffers38 accepted damage; neither fails.'},
  release:{path:`${root}/release-package.json`,zip:release.zip,bytes:release.bytes,sha256:release.sha256,smoke:`${root}/release-smoke/report.json`,pass:smoke.pass},
  retainedFailures:[
    {path:`${root}/navigation-integration.json`,reason:'Thin ray center LOS could commit while the real thick lane was clipped short; fixed using shared hit geometry.'},
    {path:`${root}/navigation-integration-final-v2.json`,reason:'Earlier valid charge run exposed a later zero-distance idle; fixed using a legal, telegraphed close-range charge direction.'},
    {path:`${root}/unit-first.json`,reason:'Four previous director timing/formation assertions required updating to deliberate new schedules; all other549-suite cases retained.'},
    {path:`${root}/host-first.json`,reason:'Old simultaneous-elite fixture timing and a test assuming Q has no documented tissue cost; corrected test expectations.'},
    {path:`${root}/chrome-first-report.json`,reason:'Test read the beacon before queued Q reached the next fixed step; waits for actual acceptance.'},
    {path:`${root}/edge-first-report.json`,reason:'Same input-acceptance timing issue.'}],
  limits:['Human fun, first-play comprehension, retention and incubation value remain unvalidated; user deferred human tests.',
    'Accurate automated strategies can suppress early threats; no claim that idle shooting is impossible or difficulty is balanced.',
    'No new browser FPS/memory, native focus/minimize or real zoom qualification.',
    'Phaser/Krita visual migration is coordinated separately and not marked complete. User assets and unrelated design-document changes preserved.']};
await writeFile(`${root}/verification-summary.json`,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({build:summary.build,unit:summary.unit,finalPresentation:summary.finalPresentation,naturalRuns:summary.naturalBuilds.runs,browser:browser.map(r=>r.path),release:summary.release}));
