import { readFile, writeFile } from 'node:fs/promises';
import { buildIdentity } from '../competition-polish-20261102/build-identity.mjs';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const unit=await json('artifacts/projectiles-charge-20261102/unit-release.json');
const stage=await json('artifacts/projectiles-charge-20261102/stage-flow/browser-report.json');
const desktop=await json('artifacts/projectile-polish-20261102/release-desktop-input/input-layout-report.json');
const mobile=await json('artifacts/projectile-polish-20261102/release-mobile-input/input-layout-report.json');
const event=await json('artifacts/projectiles-charge-20261102/event-browser-report.json');
const perf=await json('artifacts/projectiles-charge-20261102/performance-report.json');
const identity=await buildIdentity();
const report={date:'2026-11-02',build:identity,unit:{passed:unit.numPassedTests,failed:unit.numFailedTests,excluded:['tests/unit/full-system-seeds.test.ts: 1000 hidden-campaign runs']},
 stage:stage.reports.map(r=>({name:r.name,pass:r.pass,checkpoint:r.checkpoint,continued:r.continued})),
 offlineInput:{desktop:desktop.reports.map(r=>({viewport:r.viewport,pass:r.pass,errors:r.errors})),mobile:mobile.reports.map(r=>({viewport:r.viewport,pass:r.pass,errors:r.errors}))},
 announcements:event.results.map(r=>({viewport:{width:r.width,height:r.height},pass:r.passed})),
 performance:{pass:perf.pass,sourcesUnchanged:perf.sourcesUnchanged,seconds:perf.frames.sampledWallSeconds,fps:perf.frames.fpsFromMean,p95Ms:perf.frames.p95Ms,population:perf.populationRange,exact48WithAllThreeKinds:perf.exact48WithAllThreeKinds},
 pending:['Real phone natural complete run','Human play-feel and five-new-player validation']};
report.pass=report.unit.failed===0&&report.stage.every(r=>r.pass)&&[...report.offlineInput.desktop,...report.offlineInput.mobile,...report.announcements].every(r=>r.pass)&&report.performance.pass;
if(JSON.stringify(identity)!==JSON.stringify(stage.finalIdentity))throw new Error('Final build differs from stage browser-tested build');
await writeFile('artifacts/projectiles-charge-20261102/final-validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,unit:report.unit,sourceCount:identity.sourceCount,offlineCases:8,stages:report.stage.map(x=>x.pass),fps:report.performance.fps,pending:report.pending}));
if(!report.pass)process.exitCode=1;
