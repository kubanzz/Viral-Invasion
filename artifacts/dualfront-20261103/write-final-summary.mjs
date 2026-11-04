import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base='artifacts/dualfront-20261103';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const build=await json('dist/build-meta.json'),unit=await json(`${base}/unit-c4-final.json`);
const e2e=await json(`${base}/e2e-final-verification.json`),visual=await json(`${base}/visual-review-c4/report.json`);
const route=await json(`${base}/natural-final-area-2/browser-report.json`),perf=await json(`${base}/performance-final/performance-report.json`);
const offline=await json(`${base}/final-offline-smoke.json`),desktop=await json('artifacts/releases/v0.12.0/release-package.json');
const mobile=await json('artifacts/mobile-release/package-report.json'),testedMobile=await json(`${base}/mobile-candidate-4-package.json`);
for(const[p,h]of Object.entries(build.sourceManifest))assert.equal(await sha(p),h,p);
for(const[p,h]of Object.entries(build.outputManifest))assert.equal(await sha('dist/'+p),h,p);
assert.equal(build.version,'0.12.0');
assert.equal(await sha('dist/game.js'),'b33bee84c74e5bd7a6b42ea8113eb2b0d4db51d73db8fe7f9daa3ce6c7e4855d');
assert.equal(unit.numPassedTests,1663);assert.equal(unit.numFailedTests+unit.numPendingTests,0);
assert.equal(e2e.totalPassed,17);assert.equal(e2e.totalFailed+e2e.totalSkipped,0);assert.equal(e2e.hashMatch,true);
for(const[name,r]of Object.entries({visual,route,perf,offline}))assert.equal(r.pass,true,name);
assert.equal(visual.visualAcceptance,true);
for(const r of [route,perf]){assert.equal(r.sourcesUnchanged,true);assert.equal(r.outputsUnchanged,true);}
assert.equal(route.selectedEvolution.trait,'FISSION');assert.equal(route.savedAfterGuard.runs,1);assert.equal(route.savedAfterGuard.rescues,1);
assert.equal(route.membraneProbe.hp,1200);assert.equal(route.membraneProbe.hpAfter,1200);
for(const id of ['heart-healing-1','heart-healing-2'])assert.ok(route.guardPresenceByNode[id]?.cells.length);
for(const id of ['source-west','source-east'])assert.ok(Math.abs(route.events.filter(e=>e.type==='TARGET_HIT'&&e.data.id==='territory:'+id).reduce((n,e)=>n+e.data.damage,0)-1200)<1e-6);
assert.equal(await sha(desktop.zip),desktop.sha256);assert.equal(await sha(mobile.html),mobile.htmlSha256);assert.equal(await sha(mobile.zip),mobile.zipSha256);
assert.equal(mobile.htmlSha256,testedMobile.htmlSha256);
for(const[name,h]of [['Viral-Invasion-Mobile.html',mobile.htmlSha256],['Viral-Invasion-Mobile.zip',mobile.zipSha256]])assert.equal(await sha('releases/Viral-Invasion-Mobile-v0.12.0/'+name),h);
assert.equal(await sha('asserts/ViralInvasion_Fantasy_v1/references/territory-style-approved-v1.png'),'8caaa9cabe4a229f6a091360f642436bc021cf03aafed4111e173760aafdfabe');
for(const p of ['releases/Viral-Invasion-G4-v0.11.0.zip','releases/Viral-Invasion-Mobile-v0.11.0/Viral-Invasion-Mobile.html'])assert.ok((await stat(p)).size>0);
const summary={version:'0.12.0',completedAt:new Date().toISOString(),pass:true,
  gameJsSha256:await sha('dist/game.js'),attestedSourceCount:Object.keys(build.sourceManifest).length,sourcesAndOutputsMatch:true,
  reports:{unit:`${base}/unit-c4-final.json`,systemSixSeed:`${base}/system-six-seed-c4-final.json`,e2e:`${base}/e2e-final-verification.json`,
    visual:`${base}/visual-review-c4/report.json`,naturalFinal:`${base}/natural-final-area-2/browser-report.json`,
    earlierPrecision:`${base}/natural-c3-first/browser-report.json`,pressure:`${base}/pressure-core-defense/pressure-report.json`,
    performance:`${base}/performance-final/performance-report.json`,offline:`${base}/final-offline-smoke.json`,
    desktopPackage:'artifacts/releases/v0.12.0/release-package.json',mobilePackage:'artifacts/mobile-release/package-report.json'},
  unit:{passed:1663,failed:0,skipped:0,systemSeedCount:6},e2e:{passed:17,failed:0,skipped:0,scope:e2e.scope},
  visual:{suppliedScenes:visual.derived.length,naturalEntries:visual.natural.length,pass:visual.visualAcceptance,
    scope:visual.visualAcceptanceScope,renderSourceDrift:visual.renderSourceDrift,selectedBuildDrift:visual.selectedBuildDrift},
  natural:{method:route.method,trait:route.selectedEvolution.trait,victory:route.victory.snapshot,guardEnd:route.guardEnd,
    membraneProbe:route.membraneProbe,sourceHitDamage:{west:1200,east:1200},savedRuns:route.savedAfterGuard.runs,savedRescues:route.savedAfterGuard.rescues,
    maxAlive:route.maxAlive,maxReserved:route.maxReserved,errors:route.errors,scriptSha256:await sha('scripts/verify-dualfront.mjs')},
  performance:{scope:perf.scope,cases:perf.cases.map(c=>({name:c.name,averageFps:c.sample.averageFps,p95Ms:c.sample.p95Ms,maxMs:c.sample.maxMs,
    durationSeconds:c.sample.durationSeconds,minAlive:c.sample.minAlive,maxAlive:c.sample.maxAlive,maxReserved:c.sample.maxReserved,
    visibleRange:[c.sample.minVisible,c.sample.maxVisible],errors:c.errors}))},
  desktop:{path:desktop.zip,bytes:desktop.bytes,sha256:desktop.sha256},
  mobile:{html:mobile.html,htmlBytes:mobile.htmlBytes,htmlSha256:mobile.htmlSha256,zip:mobile.zip,zipBytes:mobile.zipBytes,zipSha256:mobile.zipSha256,testedCandidateMatches:true},
  runtimeArtBytes:build.art.runtimeBytes,
  limitations:[
    'Physical phone and five-player clarity/5–8-minute playtest remain pending; trusted Chrome touch events run on Windows.',
    'Final skilled natural bot rescue takes about134simulationseconds; do not claim5–8minutes measured for new players.',
    'Final natural FISSION route uses candidate4. Earlier CARAPACE full route uses candidate3 and is marked separately.',
    'Visual supplied states and occlusion checks are actual Renderer fixtures, not natural full gameplay or human preference evidence.',
    'Four48-population performance samples last about15seconds each on this Windows Chrome; not long-term or physical-phone performance.',
    'Old failed harness/CPU-timeout reports are retained; only explicit final reports above constitute final acceptance.',
  ]};
await writeFile(`${base}/verification-summary.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({pass:true,version:summary.version,sourceCount:summary.attestedSourceCount,unit:1663,e2e:17,report:`${base}/verification-summary.json`}));
