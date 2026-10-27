import {readFileSync,writeFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='artifacts/completion-v073',revision='4da30026696c99b6ad936a9fcd60911cc4f59770';
const gameHash='71615abc92b3f5878f8b199ed0d5bd319d7f9dfe0e1f21d8baf595783b65ca54';
const read=p=>JSON.parse(readFileSync(p,'utf8')),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const requireTrue=(v,message)=>{if(!v)throw Error(message);};
requireTrue(!existsSync(root+'/verification-summary.json'),'Preserve previous finalization.');
const build=read('dist/build-meta.json');requireTrue(build.version==='0.7.3'&&hash('dist/game.js')===gameHash,'Wrong frozen build.');
const verifyManifest=(manifest,gitRevision)=>Object.entries(manifest).map(([path,sha256])=>{
 const current=hash(path);requireTrue(current===sha256,'Changed input: '+path);
 const committed=gitRevision?createHash('sha256').update(execFileSync('git',['show',gitRevision+':'+path],{maxBuffer:16*1024*1024,windowsHide:true})).digest('hex'):null;
 requireTrue(!gitRevision||committed===sha256,'Source commit mismatch: '+path);
 return{path,sha256,currentMatches:true,...gitRevision?{committed,commitMatches:true}:{}};
});
const buildInputs=verifyManifest(build.sourceManifest,revision);requireTrue(buildInputs.length===60,'Unexpected build input count.');
const unit=read(root+'/system/unit.json'),systemExecution=read(root+'/system/execution.json'),systemAudit=read(root+'/system/audit.json');
requireTrue(unit.success&&unit.numPassedTests===369&&unit.numFailedTests===0&&unit.testResults.length===44,'Unit/system suite incomplete.');
requireTrue(systemExecution.exitCode===0&&systemExecution.sourceUnchanged&&systemAudit.allChecksPassed,'System source proof incomplete.');
verifyManifest(systemExecution.sourceManifest,revision);
const sessions=read(root+'/system/full-system-seeds.json');requireTrue(sessions.complete&&sessions.completedSeeds===1000&&sessions.outcomes.wins===1000&&sessions.outcomes.losses===0&&sessions.outcomes.publicMenuExits===0&&sessions.outcomes.invariantFailures===0,'Incomplete1000 sessions.');
const simulationInputs=verifyManifest(sessions.simulationSourceManifest,revision);
function browserAttempt(kind){
 const folder=root+'/browser/'+kind,report=read(folder+'/report.json'),execution=read(folder+'/execution.json');
 requireTrue(execution.exitCode===0&&execution.sourceUnchanged&&execution.bundleUnchanged&&execution.bundleSha256===gameHash,'Browser attempt incomplete: '+kind);
 verifyManifest(execution.sourceManifest,revision);
 let passed=0,skipped=0;const cases=[];
 function visit(suites){for(const suite of suites){for(const spec of suite.specs??[])for(const test of spec.tests??[]){
  const result=test.results.at(-1);requireTrue(!!result,'Missing test result');
  if(result.status==='skipped'){skipped++;continue;}
  requireTrue(result.status==='passed'&&test.results.length===1,'Failed/retried current test: '+spec.title);
  passed++;cases.push({title:spec.title,project:test.projectName,status:result.status,report:folder+'/report.json'});
 }visit(suite.suites??[]);}}
 visit(report.suites);requireTrue(report.stats.unexpected===0&&report.stats.flaky===0&&report.errors.length===0,'Unexpected browser report status.');
 return{report:folder+'/report.json',sha256:hash(folder+'/report.json'),execution:folder+'/execution.json',startedAt:execution.startedAt,finishedAt:execution.finishedAt,startedAtRevision:execution.revision,stats:report.stats,passed,skipped,cases};
}
const targeted=browserAttempt('targeted-1'),full=browserAttempt('full-1');
requireTrue(targeted.passed===10&&targeted.skipped===4&&full.passed===84&&full.skipped===26,'Unexpected browser allocation counts.');
const clean=read(root+'/clean/summary.json');requireTrue(clean.allChecksPassed&&clean.revision===revision,'Fresh clone qualification incomplete.');
const layout=read(root+'/result-layout/report.json');requireTrue(layout.pass,'Result layout probe incomplete.');
const pressurePath=root+'/performance/attempt-1/report.json',pressure=read(pressurePath);
requireTrue(pressure.status==='passed'&&pressure.pass&&pressure.activeSimulationSeconds>=600&&pressure.releaseGameJsSha256===gameHash&&pressure.sourceUnchanged,'Current pressure incomplete.');
const pressureExecution=read(root+'/performance/attempt-1/execution.json');
requireTrue(pressureExecution.pass&&pressureExecution.exitCode===0&&pressureExecution.sourceStillFrozen,'Pressure wrapper incomplete.');
const exclusiveAfter=[{name:'full-browser',finishedAt:full.finishedAt},{name:'targeted-browser',finishedAt:targeted.finishedAt},{name:'unit-system',finishedAt:systemExecution.finishedAt},{name:'result-layout',finishedAt:layout.finishedAt},{name:'offline-smoke',finishedAt:read(root+'/release-smoke/execution.json').finishedAt}];
requireTrue(exclusiveAfter.every(item=>Date.parse(pressureExecution.startedAt)>=Date.parse(item.finishedAt)),'Pressure overlapped functional qualification.');
requireTrue(pressure.runMetrics.frameLimit===256&&pressure.runMetrics.maxFrameEntries<=256&&pressure.runMetrics.finalSummary.control.beaconBites>0,'Pressure metric bounds/actual bites failed.');
requireTrue(pressure.measurementScriptSha256===hash('scripts/measure-campaign-performance.mjs'),'Pressure measurement changed.');
requireTrue(pressure.measurementScriptSha256===hash(root+'/performance/attempt-1/measurement-script.mjs'),'Preserved pressure measurement mismatch.');
verifyManifest(pressure.driverSourceManifest,revision);
const memoryPath=root+'/performance/attempt-1/memory-window-audit.json';requireTrue(existsSync(memoryPath),'Missing memory review.');
const release=read(root+'/release-files.json'),smokePath=root+'/release-smoke/report.json',smoke=read(smokePath);
requireTrue(release.gameHash===gameHash&&release.revision===revision&&smoke.pass&&smoke.browsers.length===2,'Release qualification incomplete.');
for(const [path,sha]of Object.entries(release.files))requireTrue(hash(release.folder+'/'+path)===sha&&hash('.tools/release-v073-verify/'+path)===sha,'Five-file release mismatch: '+path);
const visualPath=root+'/visual-review.json';requireTrue(existsSync(visualPath),'Missing manual visual review.');
requireTrue(existsSync(root+'/requirements-closure.json'),'Missing requirement addendum.');
requireTrue(existsSync(root+'/requirements-terminal-closure.json'),'Missing terminal full-suite requirement addendum.');
execFileSync('git',['diff','--exit-code','0bc48b4','--','DesignDoc_v1.3'],{windowsHide:true});
mkdirSync(root+'/runners',{recursive:true});
const runnerCopies=[['.tools/qualify-v073.mjs','browser.mjs'],['.tools/unit-v073.mjs','unit-system.mjs'],['.tools/finalize-v073.mjs','finalize.mjs'],['.tools/visual-v073.mjs','visual.mjs'],['.tools/inventory-v073.mjs','inventory.mjs'],['.tools/close-clean-v073.mjs','clean-closure.mjs'],['.tools/result-layout-v073.ts','result-layout.ts'],['.tools/build-result-layout-v073.mjs','build-result-layout.mjs'],['.tools/result-layout-v073.mjs','result-layout.mjs'],['.tools/result-layout-v073-meta.json','result-layout-meta.json'],['.tools/completion-browser-run.mjs','baseline-browser-v072.mjs'],['.tools/pulse-counter-fixture.mjs','baseline-pulse-fixture.mjs']];
for(const [input,name]of runnerCopies)writeFileSync(root+'/runners/'+name,readFileSync(input));
const provenance={method:'Read-only final hash audit of completed independent executions. No new gameplay or amended raw report.',sourceRevision:revision,gameJsSha256:gameHash,buildInputs,simulationInputs,
 browserStartRevisions:{targeted:targeted.startedAtRevision,full:full.startedAtRevision},
 revisionNote:'Browser executions began before the source commit. Their frozen manifests are independently checked against every current/committed input; start revision is preserved, not relabeled.',
 originalDesignUnchangedFrom:'0bc48b4',systemExecution:root+'/system/execution.json',clean:root+'/clean/summary.json',release:root+'/release-files.json',runnerCopies:runnerCopies.map(([original,name])=>({original,preserved:root+'/runners/'+name,sha256:hash(original),preservedMatches:hash(original)===hash(root+'/runners/'+name)}))};
writeFileSync(root+'/provenance-final.json',JSON.stringify(provenance,null,2));
const zip='releases/Viral-Invasion-G4-v0.7.3.zip';
const summary={generatedAt:new Date().toISOString(),version:'0.7.3',sourceRevision:revision,
 game:{path:'dist/game.js',sha256:gameHash,bytes:statSync('dist/game.js').size,inputCount:60},
 units:{report:root+'/system/unit.json',files:44,passed:369,failed:0,nonBatch:368,batchTests:1,scope:'One batch test contains1000 TypeScript formal sessions; neither1000 tests nor1000 browser or human runs.'},
 sessions:{report:root+'/system/full-system-seeds.json',audit:root+'/system/audit.json',completed:1000,outcomes:sessions.outcomes,replay:sessions.replay,preparedReplay:sessions.preparedReplay,scope:'Public simulation inputs; research API and crisis impacts not exercised by this batch, covered separately where reported.'},
 browser:{full,targeted,scope:'Full84 passed plus26 deliberate browser assignment skips. Targeted10 are overlapping requalification, never added as94 unique full tests. Functional concurrency has no FPS claim.'},
 clean:{summary:root+'/clean/summary.json',scope:'Independent fresh npm ci/build/full test; three build files byte-identical. Separate1000 batch is reproducibility evidence, not additional unique coverage.'},
 resultLayout:{report:root+'/result-layout/report.json',scope:'Real normal victory then viewport/DOM scrolling checks; physical Ctrl zoom and human recognition remain separate.'},
 performance:{report:pressurePath,execution:root+'/performance/attempt-1/execution.json',sha256:hash(pressurePath),metrics:pressure.metrics,activeSimulationSeconds:pressure.activeSimulationSeconds,coverage:pressure.coverage,cellHits:pressure.cellHits,runMetrics:pressure.runMetrics,memoryReview:memoryPath,scope:pressure.passScope,exclusiveAfter,outerWallDurationMs:pressureExecution.outerWallDurationMs,
 countScopes:{polling:'cellHits deduplicates PROTOCOL_BEACON_HIT logs during measurement without joining each positive TARGET_HIT. It is not strictly an accepted-damage lower bound.',acceptedMetric:'runMetrics.finalSummary.control.beaconBites uses the actual accepted-damage accumulator across the whole case including setup and warmup, not only the600 measured seconds.',frames:'maxFrameEntries is observed across read snapshots, not every-tick occupancy.',wallTime:'The original wallDurationMs stops before post-measurement memory checks; wrapper execution.outerWallDurationMs includes the entire subprocess.'}},
 release:{zip,bytes:statSync(zip).size,sha256:hash(zip),manifest:root+'/release-files.json',smoke:smokePath},
 visualReview:visualPath,requirements:root+'/requirements-terminal-closure.json',preFullRequirements:root+'/requirements-closure.json',provenance:root+'/provenance-final.json',
 preservedHistory:{baselineFull:'artifacts/completion-v072/browser/attempt-1/report.json',baselineFullResult:{passed:77,failed:7,skipped:26},pulseCounterexample:'artifacts/completion-v072/pulse-fixture/before-fix.json',baselineClean:'artifacts/completion-v072/clean/summary.json',scope:'CandidateC baseline is historical evidence; its actual failures and build identity are retained. Current results do not rewrite it.'},
 limitations:['Five-player standardized blind testing0/5; user feedback remains a separate real record.','Scripted routes do not prove first-play timing, comprehension, fun, voluntary replay or incubation/commercial value.','Finite local headless performance and memory observations do not prove all-device performance or no leaks.','Native OS focus/minimize and physical Ctrl zoom remain unverified.','No configured Git remote: focused local dev-zbj commits remain unpushed.']};
writeFileSync(root+'/verification-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({version:summary.version,revision,gameHash,units:369,simulations:1000,browser:{full:84,skips:26,targeted:10},performance:pressure.metrics,release:summary.release}));
