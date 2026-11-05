import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
const base='artifacts/camp-entry-v0152',candidate='artifacts/readability-v0153/candidate-final-2';
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const result={version:'0.15.3',scope:'Camp access and explicit failed/withdrawn/saved outcomes in the jointly frozen readability build; not a new claim of all visual/performance coverage.',checks:[],pass:false};
async function check(name,fn){try{await fn();result.checks.push({name,pass:true});}catch(error){result.checks.push({name,pass:false,error:String(error.stack??error)});}}
const meta=await json(`${candidate}/build-meta.json`);
await check('joint-final-source-and-output-identity',async()=>{
 assert.equal(meta.version,'0.15.3');assert.equal(await sha(`${candidate}/build-meta.json`),'41dde24eb5621c06880bf3a23b0f213b1c24280d67e85770ed0dbc5d8d421640');
 for(const [path,hash]of Object.entries(meta.sourceManifest))assert.equal(await sha(path),hash,path);
 for(const [path,hash]of Object.entries(meta.outputManifest))assert.equal(await sha(`${candidate}/${path}`),hash,path);
 result.sourceInputs=Object.keys(meta.sourceManifest).length;result.gameSha256=meta.outputManifest['game.js'];
});
let report;
await check('actual-http-natural-entry-run',async()=>{
 report=await json(`${base}/${process.env.VI_ENTRY_FINAL_RUN??'natural-final-v0153-2'}/browser-report.json`);
 assert.equal(report.pass,true);assert.equal(report.pilot,false);assert.equal(report.gameplayAssertionsPassed,true);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.remoteRequests,[]);
 for(const name of ['sourcesUnchanged','outputsUnchanged','candidateUnchanged'])assert.equal(report[name],true,name);
 assert.equal(report.runtime,'0.15.3-readability');assert.equal(report.candidateBefore.version,'0.15.3');assert.deepEqual(report.candidateBefore.currentSourceMismatches,[]);
 assert.deepEqual(report.candidateBefore.outputManifest,meta.outputManifest);assert.equal(report.candidateBefore.productionInputCount,Object.keys(meta.sourceManifest).length);
 assert.deepEqual(report.sourceBefore,report.sourceAfter);assert.deepEqual(report.outputBefore,report.outputAfter);
 assert.equal(resolve(report.servedCandidate.candidateRoot),resolve(candidate));assert.equal(report.servedCandidate.transport,'immutable-allowlisted-loopback-http');
 assert.equal(report.responseHashes['game.js'],meta.outputManifest['game.js']);assert.equal(report.responseHashes['index.html'],meta.outputManifest['index.html']);
});
await check('saved-guard-result-can-enter-camp',async()=>{
 assert.ok(report.victory.snapshot);assert.equal(report.resultCampEntered,true);
 assert.equal(report.guardResult.state.territory.rescueSnapshot.runId,report.victory.snapshot.runId);
 assert.ok(report.guardResult.buttons.includes('camp-open'));assert.match(report.guardResult.text,/救援成果仍在/);
});
await check('separate-menu-camp-and-challenge',async()=>{
 assert.equal(report.menuCampEntered,true);for(const action of ['camp-open','endless-start'])assert.ok(report.menuCamp.actions.some(item=>item.action===action&&!item.disabled));
});
await check('unfinished-withdrawal-preserves-only-previous-camp',async()=>{
 assert.equal(report.priorCampReturn,true);assert.equal(report.unfinishedResult.state.territory.rescueSnapshot,undefined);
 assert.match(report.unfinishedResult.text,/已撤离/);assert.doesNotMatch(report.unfinishedResult.text,/本次救援成功/);
 assert.equal(report.unfinishedResult.profile.victories,1);assert.equal(report.unfinishedResult.profile.claimedRewardIds.length,1);
});
await check('fresh-real-death-is-clearly-failure-and-grants-nothing',async()=>{
 const failure=report.freshFailure;assert.equal(failure.pass,true);assert.ok(failure.state.player.hp<=0||failure.state.tissue.hp<=0);
 assert.match(failure.text,/救援失败/);assert.doesNotMatch(failure.text,/救援成果已保存|继续守卫不会撤销成功/);
 assert.equal(failure.camp.campUnlocked,false);assert.equal(failure.camp.materials,0);assert.equal(failure.camp.victories,0);
 assert.ok(failure.state.territory&&!failure.state.territory.rescueSnapshot);
});
await check('unmodified-complete-evidence-videos',async()=>{
 assert.equal(report.videoComplete,true);assert.equal(await sha(report.video),report.videoMetadata.sha256);
 assert.equal(await sha(report.freshFailureVideo.path),report.freshFailureVideo.sha256);
});
await check('current-targeted-regressions',async()=>{
 const unit=await json(`${base}/unit-final-entry.json`);assert.equal(unit.success,true);assert.equal(unit.numFailedTests,0);assert.ok(unit.numPassedTests>=74);
 result.targetedAssertions=unit.numPassedTests;
});
result.pass=result.checks.every(item=>item.pass);result.finishedAt=new Date().toISOString();
result.manualPending=['Physical-phone and new-player comprehension checks'];
result.boundaries=['Local immutable HTTP test, no fresh file-protocol runtime claim.','Earlier source-drifted v0.15.2 attempts remain historical and are not final passes.'];
await writeFile(`${base}/verification-final-v0153.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({pass:result.pass,checks:result.checks.length,failed:result.checks.filter(item=>!item.pass).map(item=>item.name)}));if(!result.pass)process.exitCode=1;
