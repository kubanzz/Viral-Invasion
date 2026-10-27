import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder='artifacts/completion-v073/system';
const rawFiles=['pre-run.json','execution.json','unit.json','full-system-seeds.json'];
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const rawInputs={},data={};
for(const name of rawFiles){const raw=await readFile(`${folder}/${name}`);rawInputs[name]={path:`${folder}/${name}`,sha256:sha(raw),bytes:raw.length};data[name]=JSON.parse(raw.toString('utf8'));}
const pre=data['pre-run.json'],execution=data['execution.json'],unit=data['unit.json'],batch=data['full-system-seeds.json'];
const runs=batch.runs,plans=['field','PULSE_BREAK','PURIFY_CHAIN','IMMUNE_BEACON','EXPOSE_TRACE'],variants=['guided','adaptive'],routes=['pursue','block','ignore'],traits=['CARAPACE','FISSION','MIMIC'];
const sum=(rows,read)=>rows.reduce((total,row)=>total+read(row),0);
const tally=(rows,key)=>Object.fromEntries([...new Set(rows.map(key))].sort().map(value=>[value,rows.filter(row=>key(row)===value).length]));
const finiteNumbers=value=>typeof value==='number'?Number.isFinite(value)&&value>=0:!value||typeof value!=='object'||Object.values(value).every(finiteNumbers);
const close=(a,b)=>Math.abs(a-b)<=Math.max(1,Math.abs(a),Math.abs(b))*1e-9;
const enumArray=(values,allowed)=>Array.isArray(values)&&new Set(values).size===values.length&&values.every(value=>allowed.includes(value));
const controlCounts=['chainTriggers','chainHops','ricochetHits','resonanceHits','beaconBites','patrolBites','synergyPulseChain','synergyTraceBeacon','scans','pulseUses','crystalExposures','corePulseHits','airwayCloses','airwayOpens','crisisPulseInterrupts','crisisAirwayInterrupts','coreScanInterrupts'];
function metricProblems(run){
  const m=run.metrics,problems=[];
  if(!m)return ['missing summary'];
  if(m.schemaVersion!==1||m.limited!==false||!finiteNumbers(m))problems.push('invalid version, limited flag or numeric value');
  const c=m.care,s=m.control;
  if(!c||!s||!c.organs?.heart||!c.organs?.lung)return [...problems,'missing care/control/organ data'];
  for(const key of controlCounts)if(!Number.isSafeInteger(s[key])||s[key]<0)problems.push(`invalid counter ${key}`);
  for(const key of ['repairActions','repaired','organLoss','organCost','playerDamage'])if(!Number.isFinite(c[key])||c[key]<0)problems.push(`invalid care ${key}`);
  for(const [total,key] of [['repairActions','repairActions'],['repaired','repaired'],['organLoss','loss'],['organCost','cost']])if(!close(c[total],c.organs.heart[key]+c.organs.lung[key]))problems.push(`organ sum differs: ${total}`);
  for(const organ of ['heart','lung'])if(c.organs[organ].cost>c.organs[organ].loss)problems.push(`${organ} cost exceeds loss`);
  if(c.organCost>c.organLoss||s.chainTriggers>s.chainHops||s.synergyPulseChain>s.chainTriggers||s.synergyTraceBeacon>s.beaconBites||s.corePulseHits>s.pulseUses)problems.push('counter/cost consistency violation');
  if(!enumArray(s.diagnosedTraits,traits)||!enumArray(s.coreMembranes,traits)||s.migrationChoice!==run.choice||s.coreCleared!==true)problems.push('final control facts inconsistent with run');
  return problems;
}
const metricFailures=runs.flatMap(run=>metricProblems(run).map(problem=>({seed:run.seed,problem})));
const simulationSources=await Promise.all(Object.entries(batch.simulationSourceManifest).map(async([path,expected])=>{
  const current=sha(await readFile(path));return{path,expectedSha256:expected,currentSha256:current,matches:expected===current,preRunSha256:pre.sourceManifest[path]??null,preRunMatches:pre.sourceManifest[path]===expected};
}));
const fullExecutionSources=await Promise.all(Object.entries(pre.sourceManifest).map(async([path,expected])=>{
  const current=sha(await readFile(path));return{path,sha256:expected,matchesCurrent:expected===current,matchesExecution:execution.sourceManifest[path]===expected};
}));
const buildRaw=await readFile('dist/build-meta.json'),build=JSON.parse(buildRaw.toString('utf8')),bundleSha256=sha(await readFile('dist/game.js'));
const buildSources=await Promise.all(Object.entries(build.sourceManifest).map(async([path,expected])=>({path,sha256:expected,matchesCurrent:sha(await readFile(path))===expected})));
const outcomes={wins:runs.filter(run=>run.outcome==='win').length,losses:runs.filter(run=>run.outcome==='loss').length,publicMenuExits:runs.filter(run=>run.outcome==='exit').length,invariantFailures:runs.filter(run=>run.outcome==='invariant-failure').length};
const preparationCoverage=Object.fromEntries(plans.map(plan=>{
  const selected=runs.filter(run=>run.preparation===plan);
  return[plan,{total:selected.length,base:selected.filter(run=>run.mode==='base').length,protocols:selected.filter(run=>run.mode==='protocols').length,wins:selected.filter(run=>run.outcome==='win').length,initiallyPrepaid:selected.filter(run=>run.initialStarterDebt===1).length,remainingStarterDebt:sum(selected,run=>run.starterDebt)}];
}));
const variantCoverage=Object.fromEntries(variants.map(variant=>{
  const selected=runs.filter(run=>run.guideVariant===variant);
  return[variant,{total:selected.length,wins:selected.filter(run=>run.outcome==='win').length,actualCounterHits:selected.filter(run=>run.firstCounter.counterHit!==null).length,completedGuideEvents:sum(selected,run=>run.events.COUNTER_GUIDE_COMPLETED??0)}];
}));
const preparationVariantRouteCoverage=Object.fromEntries(plans.map(plan=>[plan,Object.fromEntries(variants.map(variant=>{
  const selected=runs.filter(run=>run.mode==='protocols'&&run.preparation===plan&&run.guideVariant===variant);
  return[variant,{total:selected.length,wins:selected.filter(run=>run.outcome==='win').length,routes:tally(selected,run=>run.choice)}];
}))]));
const allEventNames=[...new Set(runs.flatMap(run=>Object.keys(run.events)))].sort();
const eventTotals=Object.fromEntries(allEventNames.map(type=>[type,sum(runs,run=>run.events[type]??0)]));
const eventRunCoverage=Object.fromEntries(allEventNames.map(type=>[type,runs.filter(run=>(run.events[type]??0)>0).length]));
const stages=['I','II','III','IV','V'];
const stageCoverage=Object.fromEntries(stages.map(id=>[id,{entered:runs.filter(run=>Number.isFinite(run.stages.stages[id].enteredAt)).length,completed:runs.filter(run=>Number.isFinite(run.stages.stages[id].completedAt)).length,
  orderedWithinRun:runs.filter(run=>{const s=run.stages.stages[id];return Number.isFinite(s.enteredAt)&&Number.isFinite(s.completedAt)&&s.completedAt>=s.enteredAt&&s.completedAt<=run.elapsed+1e-8;}).length}]));
const actualCareAggregate=Object.fromEntries(['repairActions','repaired','organLoss','organCost','playerDamage'].map(key=>[key,sum(runs,run=>run.metrics?.care[key]??0)]));
const actualControlAggregate=Object.fromEntries(controlCounts.map(key=>[key,sum(runs,run=>run.metrics?.control[key]??0)]));
const actualHitRunCoverage=Object.fromEntries(controlCounts.map(key=>[key,runs.filter(run=>(run.metrics?.control[key]??0)>0).length]));
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{minimum:sorted[0],median:sorted[Math.floor(sorted.length/2)],maximum:sorted.at(-1),mean:values.reduce((a,b)=>a+b,0)/values.length};};
const replays=[batch.replay,batch.preparedReplay].map(record=>({
  ...record,pairHashesEqual:record.first===record.second,reportedEqualAgrees:record.equal===(record.first===record.second),
  matchesCorrespondingBatchRun:runs.find(run=>run.seed===record.seed&&run.preparation===record.preparation)?.finalStateSha256===record.first,
  scope:'Read-only verification of two previously executed replay hashes and the corresponding batch summary; this audit does not execute replay.'
}));
const testSource=await readFile('tests/unit/full-system-seeds.test.ts','utf8'),metricSource=await readFile('src/game/runMetrics.ts','utf8');
const proofLimit=Number(metricSource.match(/RUN_METRICS_FRAME_LIMIT\s*=\s*(\d+)/)?.[1]);
const metricBoundSourceGuard=testSource.includes('metrics.frame.entries.length <= RUN_METRICS_FRAME_LIMIT');
const researchNames=['RESEARCH_REQUESTED','RESEARCH_CONFIRMED','RESEARCH_SPENT','RESEARCH_CANCELLED'];
const researchEvents=Object.fromEntries(researchNames.map(type=>[type,{events:eventTotals[type]??0,runs:eventRunCoverage[type]??0}]));
const tests=unit.testResults.flatMap(file=>file.assertionResults.map(assertion=>({file:file.name,name:assertion.fullName,status:assertion.status})));
const batchTests=tests.filter(row=>row.file.replaceAll('\\','/').endsWith('/tests/unit/full-system-seeds.test.ts'));
const sourceChecks={simulation31Current:simulationSources.length===31&&simulationSources.every(row=>row.matches),simulation31InPreRun:simulationSources.every(row=>row.preRunMatches),
  allRecordedExecutionSourcesCurrent:fullExecutionSources.every(row=>row.matchesCurrent&&row.matchesExecution),
  simulationReportedUnchanged:batch.simulationSourceUnchanged===true,simulationManifestFingerprintMatches:sha(Buffer.from(JSON.stringify(batch.simulationSourceManifest)))===batch.simulationSourceSha256,
  executionReportedUnchanged:execution.sourceUnchanged===true,buildInputsMatchCurrent:buildSources.every(row=>row.matchesCurrent)};
const checks={
  complete1000:batch.complete===true&&batch.expectedSeeds===1000&&batch.completedSeeds===1000&&runs.length===1000,
  seeds1Through1000:runs.every((run,index)=>run.seed===index+1),outcomesMatchRaw:JSON.stringify(outcomes)===JSON.stringify(batch.outcomes),all1000Win:outcomes.wins===1000&&outcomes.losses===0&&outcomes.publicMenuExits===0&&outcomes.invariantFailures===0,
  unit369Passed:unit.success===true&&unit.numTotalTests===369&&unit.numPassedTests===369&&unit.numFailedTests===0&&tests.every(row=>row.status==='passed'),unit44Files:unit.testResults.length===44,oneBatchTest:batchTests.length===1,
  base500Empty:runs.filter(run=>run.mode==='base').length===500&&runs.filter(run=>run.mode==='base').every(run=>run.preparation==='field'&&run.initialEquipped.length===0&&run.equipped.length===0&&run.initialStarterDebt===0&&run.starterDebt===0),
  protocolsFivePlans100Each:plans.every(plan=>preparationCoverage[plan].protocols===100),
  initialPlanEquipmentExact:runs.every(run=>run.preparation==='field'?run.initialEquipped.length===0&&run.initialStarterDebt===0:run.initialEquipped.length===1&&run.initialEquipped[0]===`${run.preparation}:balanced`&&run.initialStarterDebt===1),
  eachPlanVariant50AndAllRoutes:plans.every(plan=>variants.every(variant=>{const group=preparationVariantRouteCoverage[plan][variant];return group.total===50&&group.wins===50&&routes.every(route=>group.routes[route]>0);})),
  bothGuideVariants500:variants.every(variant=>variantCoverage[variant].total===500&&variantCoverage[variant].wins===500),
  routes334333333:routes.every((route,index)=>runs.filter(run=>run.choice===route).length===(index===0?334:333)),
  actualMetricsFiniteCompleteConsistent:metricFailures.length===0,perStepMetricBoundGuardPresent:metricBoundSourceGuard&&proofLimit===256,
  finalStarterDebtZero:runs.every(run=>run.starterDebt===0),allFiveStagesActual:stages.every(id=>stageCoverage[id].entered===1000&&stageCoverage[id].completed===1000&&stageCoverage[id].orderedWithinRun===1000)&&runs.every(run=>run.events.CAMPAIGN_STAGE_ENTERED===5&&run.events.CAMPAIGN_STAGE_COMPLETED===5),
  allFormal:runs.every(run=>run.configId==='campaign-1'&&run.stages.configId==='campaign-1'&&run.stages.stage==='V'),
  realCrisisCleared1000:runs.every(run=>run.stages.crisis.status==='cleared'&&run.events.ORGAN_CRISIS_CLEARED===1),
  guidedActualCounters500:runs.filter(run=>run.guideVariant==='guided').every(run=>run.firstCounter.counterHit!==null&&run.events.COUNTER_GUIDE_COMPLETED===1)&&variantCoverage.guided.actualCounterHits===500,
  allCoreAndRetestWins:runs.every(run=>run.core==='cleared'&&run.demonstratedCoreTraits.length===2&&run.events.RUN_ENDED===1&&run.events.RETEST_COMPLETED===1&&run.organs.every(organ=>!organ.activated||organ.integrity>=50)&&run.infection<35&&run.playerHp>0&&run.vitality>0),
  sixTraitOrders:Object.keys(tally(runs,run=>run.traits.join('>'))).length===6,
  base91Replay:replays[0]?.seed===91&&replays[0].preparation==='field'&&replays[0].pairHashesEqual&&replays[0].reportedEqualAgrees&&replays[0].matchesCorrespondingBatchRun,
  prepared4Replay:replays[1]?.seed===4&&replays[1].preparation==='PULSE_BREAK'&&replays[1].pairHashesEqual&&replays[1].reportedEqualAgrees&&replays[1].matchesCorrespondingBatchRun,
  executionTerminal:execution.exitCode===0&&execution.status==='passed',...sourceChecks,
};
const report={
  schemaVersion:1,generatedAt:new Date().toISOString(),auditMode:'Read-only derived review of completed v0.7.3 unit/system raw output; no new simulation, browser, test, build or production change.',
  version:'0.7.3',bundleSha256,buildMetadata:{path:'dist/build-meta.json',sha256:sha(buildRaw),version:build.version,sourceInputCount:buildSources.length,scope:'Build exists separately; completed unit command did not produce the bundle. Simulations directly execute TypeScript, not game.js.'},
  rawInputs,checks,allChecksPassed:Object.values(checks).every(Boolean),
  testTotals:{actualFiles:unit.testResults.length,total:unit.numTotalTests,passed:unit.numPassedTests,failed:unit.numFailedTests,nonBatchTests:tests.length-batchTests.length,batchTests:batchTests.length,batchSessions:1000,scope:'One Vitest batch test contains 1000 sessions plus four replay executions. Sessions are not 1000 individual Vitest or browser cases.'},
  outcomes,routeDistribution:tally(runs,run=>run.choice),modeCoverage:tally(runs,run=>run.mode),preparationCoverage,variantCoverage,preparationVariantRouteCoverage,traitSequenceCoverage:tally(runs,run=>run.traits.join('>')),
  actualCareAggregate,actualControlAggregate,actualHitRunCoverage,metricFailures,
  metricBounds:{frameEntryLimit:proofLimit,sourceGuardPresent:metricBoundSourceGuard,observedFrameMaximum:null,
    basis:'Frozen validate() checks proof-cache <=256, complete finite nonnegative metrics and ending consistency after each driver action; no run reports an invariant failure. Final serialized summaries independently checked here.',
    rawLimitation:'The per-run output does not export runtime frame entries or their maxima. This is not 1000 direct exported maximum-value observations. Actual root/target hit joins are implemented by the source reducer and separately unit tested; final aggregates alone cannot reconstruct all individual accepted joins.'},
  stageCoverage,firstCounter:{resolved:runs.filter(run=>run.firstCounter.status==='resolved').length,guided500ActualCounterHits:variantCoverage.guided.actualCounterHits,actualCounterMethods:tally(runs.filter(run=>run.firstCounter.counterHit),run=>run.firstCounter.counterHit.method)},
  crisisCoverage:{status:tally(runs,run=>run.stages.crisis.status),organs:tally(runs,run=>run.stages.crisis.organId),impacts:sum(runs,run=>run.stages.crisis.impacts),guardsRequestedRuns:runs.filter(run=>run.stages.crisis.guardsRequested).length,interruptedRuns:runs.filter(run=>run.stages.crisis.interruptions>0).length,interruptions:sum(runs,run=>run.stages.crisis.interruptions),scope:'Actual stage IV targets are cleared; a fast zero-impact route does not cover impact damage, support guards or environmental interruption branches merely by visiting the stage.'},
  researchEvents,eventTotals,eventRunCoverage,
  elapsedSeconds:stats(runs.map(run=>run.elapsed)),peakActivePerOrgan:stats(runs.map(run=>run.peakActive)),peakStoredPerOrgan:stats(runs.map(run=>run.peakStored)),
  replays,simulationSourceSha256:batch.simulationSourceSha256,simulationSources,fullExecutionSources,buildSources,
  limitations:[
    '1000 complete formal TypeScript sessions are neither 1000 real browser games nor new-player evidence. Fast strategy times do not validate the 10–15 minute first-play target or fun/retention.',
    'Fixed start options enter through public GameSession.start. The 1000 cases do not independently unlock or validate archive eligibility 1000 times.',
    'The frozen raw summary does not export carriedProtocols. Do not claim 1000 direct carried-array assertions or preservation-after-log-eviction observations.',
    'Research counts are explicitly derived above. If all four are zero, this batch provides no actual research transaction coverage; separate unit/browser evidence is required.',
    'Events are aggregate telemetry and some describe planned effects. Only metrics.control is used for actual accepted-hit aggregates; raw event counts must not be relabeled as actual damage counts.',
    'baseCountersAvailable is a configuration/availability flag, not proof that every basic counter was used against every trait in every run.',
    'No frame-rate, long-session memory, native OS, Ctrl zoom, human-blind-test or publishing conclusion is drawn.',
  ],
};
await writeFile(`${folder}/audit.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({allChecksPassed:report.allChecksPassed,failedChecks:Object.entries(checks).filter(([,pass])=>!pass).map(([name])=>name),bundleSha256,testTotals:report.testTotals,outcomes,routeDistribution:report.routeDistribution,actualControlAggregate,researchEvents,crisisCoverage:report.crisisCoverage}));
if(!report.allChecksPassed)process.exitCode=1;
