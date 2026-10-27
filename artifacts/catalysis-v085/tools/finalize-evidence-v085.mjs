import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const out='artifacts/catalysis-v085',read=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const check=(ok,why)=>{if(!ok)throw Error(why);};
const meta=read('dist/build-meta.json'),release=read('artifacts/releases/v0.8.5/release-package.json');
check(!readFileSync('Docs/ViralInvasion_Catalysis_v0.8.5.md','utf8').includes('_PENDING'),'Delivery document unfinished');
const rules=read(`${out}/regression/main-nonseed-results.json`),seeds=read(`${out}/regression/full-system-seeds.json`);
const comparison=read(`${out}/comparison-attempt-1/report.json`),derived=read(`${out}/comparison-attempt-1/derived-review.json`);
const browser=read(`${out}/browser-attempt-1/summary.json`),inspection=read(`${out}/release/inspection-1/inspection.json`),offline=read(`${out}/release/offline-smoke-1/report.json`);
check(meta.version==='0.8.5'&&meta.stage==='G4','Build differs');
check(rules.numPassedTests===842&&rules.numFailedTests===0&&rules.testResults.length===93,'Rules incomplete');
check(read(`${out}/regression/rules-commands.json`).rows.every(r=>r.exitCode===0),'Typecheck/rules command failed');
check(seeds.complete&&seeds.completedSeeds===1000&&seeds.runs.length===1000&&seeds.runs.every(r=>r.outcome==='win')&&seeds.replay.equal&&seeds.preparedReplay.equal&&seeds.simulationSourceUnchanged,'Campaign incomplete');
for(const[p,h]of Object.entries(seeds.simulationSourceManifest))check(sha(p)===h,`Campaign source changed: ${p}`);
check(comparison.completedRuns===7&&comparison.sourceCheck.unchanged&&comparison.results.every(r=>!r.measurementError&&r.observerViolationKinds===0)&&comparison.replayCheck.exactRawResultsEqual,'Comparison incomplete');
check(derived.sourceLineage.allMainMatch&&derived.sourceLineage.allFrozenMatch&&derived.measurementScript.unchanged,'Derived lineage differs');
check(derived.aggregate.accept.armed===216&&derived.aggregate.accept.consumed===215&&derived.aggregate.accept.zeroBlastBatches===50&&derived.aggregate.accept.realCellPath===8&&derived.aggregate.accept.cellPositiveBlastBatches===5,'Natural coverage differs');
check(browser.checks.length===2&&browser.checks.every(r=>r.exitCode===0)&&inspection.pass&&offline.pass,'Browser/release incomplete');
check(sha('dist/game.js')===inspection.expectedGameSha256&&sha('releases/Viral-Invasion-G4-v0.8.5.zip')===release.sha256,'Release bytes differ');
for(const[p,h]of Object.entries(meta.sourceManifest))check(sha(p)===h,`Build input changed: ${p}`);
for(const row of read(`${out}/integration/frozen-owned-source.json`).rows)check(sha(row.path)===row.sha256,`Owned file changed: ${row.path}`);
const emitted=new Set(comparison.runtimeOutputInputs),rows=comparison.fingerprints.map(input=>{
  const primarySha256=sha(input.path),productionRuntimeOutput=emitted.has(input.path)&&input.path.startsWith('src/');
  check(primarySha256===input.sha256,`Measured input differs: ${input.path}`);
  if(productionRuntimeOutput)check(meta.sourceManifest[input.path]===primarySha256,`Runtime input differs: ${input.path}`);
  return{...input,primarySha256,productionRuntimeOutput,deliveredManifestSha256:meta.sourceManifest[input.path]??null,pass:true};
});
writeFileSync(`${out}/integration/final-source-lineage.json`,JSON.stringify({version:'0.8.5',pass:true,measuredInputCount:rows.length,
  productionRuntimeOutputCount:rows.filter(r=>r.productionRuntimeOutput).length,deliveryInputCount:Object.keys(meta.sourceManifest).length,
  scope:'Measured inputs equal primary; emitted production inputs equal delivery manifest. Navigation test helper and tree-shaken input files are not claimed as production outputs.',rows},null,2),{flag:'wx'});
const naturalBrowsers=[];
for(const project of['chrome','edge']){
  const folder=`${out}/browser-attempt-1/${project}/output`,files=[];
  const walk=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())walk(p);else if(e.name==='natural-catalysis.json')files.push(p);}};walk(folder);
  check(files.length===1,`Natural result ambiguous: ${project}`);const raw=read(files[0]);
  check(raw.acquired&&raw.precision&&raw.cellular&&raw.prepared&&!raw.errors.length&&!raw.remote.length,`Natural browser incomplete: ${project}`);
  const demonstrations=raw.observations.filter(o=>o.actualDetonation).map(o=>({trigger:o.trigger,batchId:o.batchId,
    actualTriggerDamage:o.receipt.data.damage,actualBlastHits:o.hits.length,actualBlastDamage:o.hits.reduce((sum,e)=>sum+e.data.damage,0)}));
  naturalBrowsers.push({project,raw:files[0],viewport:project==='edge'?'1100x560':'1366x768',demonstrations,
    opportunityLosses:raw.observations.filter(o=>o.demonstrationOpportunityLost).length,errors:raw.errors,remote:raw.remote});
}
writeFileSync(`${out}/browser-attempt-1/actual-path-review.json`,JSON.stringify({pass:true,scope:'Read-only summary of original natural browser receipts; zero extra burst hits are legal and remain visible.',results:naturalBrowsers},null,2),{flag:'wx'});
mkdirSync(`${out}/tools`,{recursive:true});
const scripts=['init-catalysis-v085.mjs','integrate-catalysis-v085.mjs','compare-catalysis-v085.mjs','run-catalysis-v085-checks.mjs',
  'run-catalysis-v085-browser.mjs','prepare-delivery-v085.mjs','inspect-v085-release.mjs','verify-offline-v085.mjs','finalize-evidence-v085.mjs'];
for(const name of scripts)cpSync(`.tools/${name}`,`${out}/tools/${name}`);
cpSync('.tools/catalysis-v085-source/isolation-manifest.json',`${out}/integration/isolation-baseline.json`);
for(const name of['catalysis-ui-initial-results.json','catalysis-core-160-20261028-immune-326468e9.json'])cpSync(`.tools/catalysis-v085-source/artifacts/${name}`,`${out}/regression/${name}`);
writeFileSync(`${out}/integration/pre-freeze-notes.json`,JSON.stringify({scope:'Retrospective note, not a recreated raw tool log.',
  resolvedBeforeFreeze:['An initial whole-isolation TypeScript check found a test-only ES2023 findLastIndex under the ES2022 project target. The test was rewritten with compatible indexing; frozen strict checks passed.',
    'Browser driver review found separate Q and summon cooldown requirements, missing primer line-of-sight filtering, and ambiguous trigger-only assertions. These were repaired before its first run. Actual trigger receipts, RESOLVED totals and legitimate zero-hit outcomes are now checked.'],
  frozenFailures:[],naturalLimitations:['50 of215 natural consumed batches had zero extra blast hits; retained.','One natural overwrite and zero natural expiry cases.','Accept strategy slower in all three pairs; no retries or tuning after outcomes.']},null,2),{flag:'wx'});
const references=['Docs/ViralInvasion_Catalysis_v0.8.5.md','Docs/ViralInvasion_Playtest.md',`${out}/regression/main-nonseed-results.json`,`${out}/regression/full-system-seeds.json`,
  `${out}/comparison-attempt-1/report.json`,`${out}/comparison-attempt-1/derived-review.json`,`${out}/integration/final-source-lineage.json`,`${out}/browser-attempt-1/summary.json`,
  `${out}/browser-attempt-1/actual-path-review.json`,`${out}/release/inspection-1/inspection.json`,`${out}/release/offline-smoke-1/report.json`,'artifacts/releases/v0.8.5/release-package.json','dist/game.js','dist/build-meta.json'];
const report={schemaVersion:1,version:'0.8.5',at:new Date().toISOString(),technicalCandidate:true,
  regression:{files:93,passed:842,strictTypecheckExitCode:0,completeCampaignSessions:1000,campaignWins:1000,campaignReplayPairsEqual:2},
  source:{pass:true,measuredInputs:rows.length,emittedProductionInputs:rows.filter(r=>r.productionRuntimeOutput).length,deliveryInputs:Object.keys(meta.sourceManifest).length},
  comparison:{uniqueRuns:6,predeterminedReplays:1,bothStrategies15WaveClears:3,accept:derived.aggregate.accept,decline:derived.aggregate.decline,replayEqual:true},
  browser:{installed:['chrome','edge'],realInputTestsPassed:2,results:naturalBrowsers,independentlyDecodedOfflineModeGroups:4,
    visualReview:'Four original screenshots inspected. Actual choice cards and paused summaries fit1366x768 and1100x560. Prepared screenshots contain pause overlay; they do not independently establish unobstructed in-battle marker readability.'},
  release:{zip:'releases/Viral-Invasion-G4-v0.8.5.zip',bytes:release.bytes,sha256:release.sha256,gameSha256:inspection.expectedGameSha256,independentZipCrc32Pass:true,decodedFiles:5},
  humanBlindPlaytests:{completed:0,required:5},limitations:derived.limitations.concat(['No new600-second browser performance or memory claim.','Human fun, comprehension, replay intent and incubation value remain unverified.']),
  scripts:scripts.map(name=>({path:`${out}/tools/${name}`,sha256:sha(`${out}/tools/${name}`)})),references:references.map(path=>({path,sha256:sha(path)}))};
writeFileSync(`${out}/verification-summary.json`,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({technicalPass:true,rules:842,campaignWins:1000,source:report.source,browserPaths:naturalBrowsers,release:report.release}));
