import { cpSync,mkdirSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
const out='artifacts/ricochet-v086',read=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),check=(ok,why)=>{if(!ok)throw Error(why);};
const rules=read(`${out}/regression/nonseed-results.json`),seeds=read(`${out}/regression/full-system-seeds.json`),meta=read('dist/build-meta.json');
const release=read('artifacts/releases/v0.8.6/release-package.json'),inspection=read(`${out}/release/inspection-1/inspection.json`),offline=read(`${out}/release/offline-smoke-1/report.json`);
const baseline=read(`${out}/regression/baseline-raw-receipts.json`),candidate=read(`${out}/regression/candidate-raw-receipts.json`),implementation=read(`${out}/regression/implementation-report.json`);
check(meta.version==='0.8.6'&&meta.stage==='G4','Unexpected build');
check(!readFileSync('Docs/ViralInvasion_RicochetReceipts_v0.8.6.md','utf8').includes('_PENDING'),'Document unfinished');
check(rules.numPassedTests===851&&rules.numFailedTests===0&&rules.testResults.length===94,'Rules incomplete');
check(read(`${out}/regression/rules-commands.json`).checks.every(c=>c.exitCode===0),'Rule command failed');
check(seeds.complete&&seeds.completedSeeds===1000&&seeds.runs.length===1000&&seeds.runs.every(r=>r.outcome==='win')
  &&seeds.replay.equal&&seeds.preparedReplay.equal&&seeds.simulationSourceUnchanged,'Campaign incomplete');
for(const[p,h]of Object.entries(seeds.simulationSourceManifest))check(sha(p)===h,`Campaign input changed: ${p}`);
check(baseline.result.actualBDamage===140&&candidate.result.actualBDamage===140&&baseline.result.ricochetHits===1&&candidate.result.ricochetHits===2,'Receipt proof differs');
const removeRoot=events=>events.map(e=>{const data={...e.data};delete data.rootId;return{...e,data};});
check(isDeepStrictEqual(removeRoot(baseline.result.events),removeRoot(candidate.result.events)),'Fixture event behavior changed beyond root IDs');
for(const field of['aHp','bHp'])check(baseline.result[field]===candidate.result[field],`HP changed: ${field}`);
for(const field of['chainCharge','budgetUsed','skippedCommands'])check(baseline.result.growth[field]===candidate.result.growth[field],`Control changed: ${field}`);
check(isDeepStrictEqual(baseline.result.growth.activations,candidate.result.growth.activations),'Activation budget changed');
check(sha(`${out}/regression/baseline-growth.ts`)==='8608e6fc8c02de77e2ca190b571ef0ba6be920ffdda43219daa82f5a6ac4956b','Baseline source differs');
const isolated=read('.tools/ricochet-v086-source/isolation-manifest.json'),owned=read(`${out}/integration/frozen-owned-source.json`);
for(const row of owned.rows)check(sha(row.path)===row.sha256,`Owned input changed: ${row.path}`);
const preservedPaths=['src/game/runMetrics.ts','src/ui/growthHud.ts','src/game/protocols.ts','src/game/session.ts','src/game/growthTypes.ts'];
const unchanged=preservedPaths.map(path=>{const original=isolated.files.find(r=>r.path===path);check(original&&sha(path)===original.sha256,`Unintended shared change: ${path}`);return{path,sha256:original.sha256};});
for(const[p,h]of Object.entries(meta.sourceManifest))check(sha(p)===h,`Delivery source changed: ${p}`);
check(meta.sourceManifest['src/game/growth.ts']===sha('src/game/growth.ts'),'Modified growth absent from production build');
check(inspection.pass&&offline.pass&&sha('dist/game.js')===inspection.expectedGameSha256&&sha(release.zip)===release.sha256,'Release incomplete');
const browser=read(`${out}/browser-attempt-1/summary.json`);check(browser.checks.length===2&&browser.checks.every(r=>r.exitCode===0),'Browser incomplete');
const browsers=[];
for(const project of['chrome','edge']){
  const files=[];const walk=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())walk(p);else if(e.name==='natural-ricochet.json')files.push(p);}};walk(`${out}/browser-attempt-1/${project}/output`);
  check(files.length===1,`Ambiguous browser raw: ${project}`);const raw=read(files[0]),qualified=raw.observations.find(o=>o.qualified)?.qualified;
  check(raw.reached&&raw.receipts.length>=3&&!raw.collectionGaps.length&&!raw.errors.length&&!raw.remote.length&&qualified,'Natural browser not qualified');
  check(qualified.runMetrics.summary.control.ricochetHits===raw.receipts.length,'Browser actual/summary mismatch');
  check(new Set(raw.receipts.map(r=>r.log.data.rootId)).size===raw.receipts.length,'Browser roots collide');
  const history=qualified.growth.protocolHistory.filter(e=>e.type==='PROTOCOL_RICOCHET_HIT');check(history.length===raw.receipts.length,'Browser history mismatch');
  browsers.push({project,raw:files[0],viewport:raw.viewport,wave:qualified.endless.wave,elapsed:qualified.elapsed,
    chainRank:qualified.growth.equipped.find(p=>p.id==='PURIFY_CHAIN')?.rank??1,actualRicochetHits:raw.receipts.length,
    actualRicochetDamage:raw.receipts.reduce((sum,r)=>sum+Number(r.hit.data.damage),0),uniqueRoots:raw.receipts.length,
    sameTickSameVictimGroups:raw.sameTickSameVictimGroups,historyEntries:history.length,pass:true});
}
writeFileSync(`${out}/browser-attempt-1/actual-receipts-review.json`,JSON.stringify({pass:true,scope:'Read-only derivation of original browser runs; fixture collision coverage is separate.',results:browsers},null,2),{flag:'wx'});
writeFileSync(`${out}/integration/final-source-lineage.json`,JSON.stringify({pass:true,version:'0.8.6',parentCommit:'6d979c9',
  baselineGrowthSha256:sha(`${out}/regression/baseline-growth.ts`),candidateGrowthSha256:sha('src/game/growth.ts'),modifiedRuntimeBuildSha256:meta.sourceManifest['src/game/growth.ts'],
  preservedSharedInputs:unchanged,ownedInputs:owned.rows,deliveryInputs:Object.keys(meta.sourceManifest).length,
  proof:{scope:'One explicitly configured post-growth public step, not a global balance equivalence proof.',sameDamage:140,oldCount:1,newCount:2,eventsEqualAfterRemovingOnlyRootIds:true}},null,2),{flag:'wx'});
mkdirSync(`${out}/tools`,{recursive:true});
const scripts=['init-ricochet-v086.mjs','integrate-ricochet-v086.mjs','run-ricochet-v086-checks.mjs','run-ricochet-v086-browser.mjs',
  'prepare-delivery-v086.mjs','inspect-v086-release.mjs','verify-offline-v086.mjs','finalize-evidence-v086.mjs'];
for(const name of scripts)cpSync(`.tools/${name}`,`${out}/tools/${name}`);
cpSync('.tools/ricochet-v086-source/isolation-manifest.json',`${out}/integration/isolation-baseline.json`);
const references=['Docs/ViralInvasion_RicochetReceipts_v0.8.6.md','Docs/ViralInvasion_Playtest.md',`${out}/regression/implementation-report.json`,
  `${out}/regression/baseline-raw-receipts.json`,`${out}/regression/candidate-raw-receipts.json`,`${out}/regression/baseline-vitest.json`,
  `${out}/regression/nonseed-results.json`,`${out}/regression/full-system-seeds.json`,`${out}/browser-attempt-1/summary.json`,
  `${out}/browser-attempt-1/actual-receipts-review.json`,`${out}/integration/final-source-lineage.json`,`${out}/release/inspection-1/inspection.json`,
  `${out}/release/offline-smoke-1/report.json`,'artifacts/releases/v0.8.6/release-package.json','dist/game.js','dist/build-meta.json'];
const report={schemaVersion:1,version:'0.8.6',at:new Date().toISOString(),technicalCandidate:true,
  change:'Give each independent budget-accepted ricochet a unique transaction identity; keep actual damage and strict metrics/history deduplication.',
  regression:{files:94,passed:851,strictTypecheckExitCode:0,completeCampaignSessions:1000,campaignWins:1000,campaignReplayPairsEqual:2},
  fixture:{publicSteps:1,actualDamageBoth:140,oldReportedHits:1,newReportedHits:2,oldHistoryDamage:70,newHistoryDamage:140,eventsEqualExceptRootId:true,
    scope:'Explicit preset fixture using real available elite HP/radius; does not claim natural acquisition.'},
  source:{pass:true,deliveryInputs:Object.keys(meta.sourceManifest).length,preservedSharedInputs:unchanged.length},
  browser:{testsPassed:2,results:browsers,offlineModeGroups:4,visualReview:'Two original screenshots inspected; count labels readable in1366x768 and1100x560. Long equipment descriptions use the existing scroll region.'},
  release:{zip:release.zip,bytes:release.bytes,sha256:release.sha256,gameSha256:inspection.expectedGameSha256,independentCrc32Pass:true,files:5},
  humanBlindPlaytests:{completed:0,required:5},preservedFailures:['Initial targeted baseline regression expected2 distinct roots but observed1; actual damage140/old history70 preserved.',
    'First main-worktree runner refused an existing isolated output path withEEXIST. Renamed main streams and added preflight; no source or assertion change.'],
  limitations:['No natural same-tick same-victim collision claim unless present in original browser groups.','No new performance, human fun, first-session duration, replay-intent or incubation-value validation.',
    'No retrospective repair of already saved historical metrics.','Late dual-tactic elite proposal is planning only, not an implemented feature.'],
  scripts:scripts.map(name=>({path:`${out}/tools/${name}`,sha256:sha(`${out}/tools/${name}`)})),references:references.map(path=>({path,sha256:sha(path)}))};
writeFileSync(`${out}/verification-summary.json`,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({technicalPass:true,rules:851,campaignWins:1000,browsers,release:report.release}));
