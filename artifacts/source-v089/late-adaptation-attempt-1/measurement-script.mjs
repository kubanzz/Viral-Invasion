import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
const prior=resolve(root,'artifacts/source-v089/measurement-attempt-1'),output=resolve(root,'artifacts/source-v089/late-adaptation-attempt-1');
const plan={schemaVersion:1,scope:'Two fixed public-input start-to26 runs qualifying the interaction between post20 adaptive generations and finite sources at21/26. Not a replacement for the original13 cases or a new full35 matrix.',
 cases:[{seed:71,build:'shooting',route:'rush'},{seed:71,build:'immune',route:'rush'}],goalClearedWaves:26,simulationSeconds:900,perWaveSimulationSeconds:120,retries:0,
 start:'Actual new GameSession.start followed by normal public steps/choices from wave1; no injection or direct jump to21.',
 original:prior,onlyDriverChange:'Goal16 to26 and corresponding truthful stop label; restore those exact literals and the entire driver must equal the original bytes.',
 checks:['Original frozen bundle, all50 candidate inputs, source/cycle observers, policy and public transactions unchanged.',
 '20 and25 adaptive warning/apply receipts retain at least8 seconds, legal unique trait pairs and exact main; real source-wave21/26 warnings/starts inherit the applied generation.',
 'Source21/26 announcement-to-birth>=8 seconds, real positive hits/clears or explicit exhaustion, quota birth/cancel accounting; original live/reserved/concurrency/fission/geometry/duplicate assertions retained.',
 'Deaths, timeouts, missing coverage and observer errors retained; exactly two cases, no rerun, replacement seed or additional long measurement.']};
if(process.argv.length!==3||process.argv[2]!=='--run'){console.log(JSON.stringify({preparedOnly:true,compilation:false,runs:0,plan},null,2));process.exit(process.argv.length===2?0:1);}
if(process.env.VI_SOURCE_LATE_AUTH!=='root-approved-fixed-2')throw Error('Await coordinator authorization for exactly two fixed late-interaction cases.');
const sha=data=>createHash('sha256').update(data).digest('hex'),read=async path=>JSON.parse(await readFile(path,'utf8'));
const write=async(path,data)=>{const f=await open(path,'wx');try{await f.writeFile(data);}finally{await f.close();}};
const json=(name,data)=>write(resolve(output,name),JSON.stringify(data,null,2)+'\n');
const originalReport=await read(resolve(prior,'report.json')),originBytes=await readFile(resolve(prior,'frozen-origin.json')),origin=JSON.parse(originBytes);
const frozenRoot=resolve(here,'frozen-candidate');
if(sha(originBytes)!==originalReport.frozenOriginSha256||Object.keys(origin.files).length!==50)throw Error('Original complete frozen origin differs.');
for(const [path,entry]of Object.entries(origin.files))if(sha(await readFile(resolve(frozenRoot,path)))!==entry.sha256)throw Error(`Frozen source differs before late qualification: ${path}`);
const copied={};for(const name of ['simulation-bundle.mjs','public-input-driver.mjs','source-observer.mjs','cycle-observer-v088.mjs'])copied[name]=await readFile(resolve(prior,name));
if(sha(copied['simulation-bundle.mjs'])!==originalReport.bundleSha256||sha(copied['source-observer.mjs'])!==originalReport.compatibility.sourceObserverSha256
 ||sha(copied['cycle-observer-v088.mjs'])!==originalReport.compatibility.retainedCycleObserverSha256)throw Error('Prior runtime or observer identity differs.');
const oldGoal="s.endless.clearedWaves >= 16) { stop = 'sixteen-waves-cleared'",newGoal="s.endless.clearedWaves >= 26) { stop = 'twenty-six-waves-cleared'";
const oldDriver=copied['public-input-driver.mjs'].toString('utf8');
if(oldDriver.indexOf(oldGoal)<0||oldDriver.indexOf(oldGoal)!==oldDriver.lastIndexOf(oldGoal))throw Error('Original single run-goal literal is ambiguous.');
const driver=oldDriver.replace(oldGoal,newGoal);
if(driver.replace(newGoal,oldGoal)!==oldDriver||!driver.includes("(buildName === 'noncounter' ? 180 : 900) * 60")||!driver.includes('s.elapsed - waveEnteredAt > 120'))throw Error('Unapproved budget or policy difference');
await mkdir(output);await json('plan.json',plan);await write(resolve(output,'measurement-script.mjs'),await readFile(fileURLToPath(import.meta.url)));
for(const [name,bytes]of Object.entries(copied))await write(resolve(output,name==='public-input-driver.mjs'?'original13-public-input-driver.mjs':name),bytes);
await write(resolve(output,'public-input-driver.mjs'),driver);await write(resolve(output,'frozen-origin.json'),originBytes);
const binding={bundleSha256:sha(copied['simulation-bundle.mjs']),original13DriverSha256:sha(copied['public-input-driver.mjs']),lateDriverSha256:sha(driver),
 normalizedLateDriverEqualsOriginal13:true,sourceObserverSha256:sha(copied['source-observer.mjs']),cycleObserverSha256:sha(copied['cycle-observer-v088.mjs']),
 completeOriginSha256:sha(originBytes),frozenInputCount:50,onlyChanges:[oldGoal+' -> '+newGoal,'Independent new output and fixed2 case list.'],
 retainedObserverScope:'Both observers are copied verbatim. Their old missing-source list covers only6/11/16; this new report independently requires21/26 and does not relabel that old field.'};
await json('binding.before.json',binding);
const {runObserved}=await import(pathToFileURL(resolve(output,'public-input-driver.mjs')).href),results=[];
const legal=new Set(['CARAPACE','FISSION','MIMIC']),traits=value=>typeof value==='string'?value.split('+').filter(Boolean):[];
for(const task of plan.cases){
 const raw=runObserved(task.seed,task.build,task.route),encoded=JSON.stringify(raw,null,2)+'\n',file=`seed-${task.seed}-${task.build}-rush.json`;
 await write(resolve(output,file),encoded);
 const cycle=raw.cycleObservation,source=raw.sourceObservation,checks=[];
 const record=(kind,passed,detail)=>checks.push({kind,passed,detail});
 if(cycle&&source){
  for(const wave of [20,25]){
   const warn=cycle.eventTrail.filter(e=>e.type==='ENDLESS_EVOLUTION_WARNING'&&e.wave===wave),apply=cycle.eventTrail.filter(e=>e.type==='ENDLESS_EVOLUTION_APPLIED'&&e.wave===wave);
   const w=warn[0],a=apply[0],set=w?traits(w.data.traits):[];
   record(`generation-${wave}-single-warning-apply`,warn.length===1&&apply.length===1,{warning:w??null,applied:a??null});
   record(`generation-${wave}-legal-eight-second-transition`,!!w&&!!a&&a.at-w.at>=8-1e-7&&set.length===2&&new Set(set).size===2&&set.every(t=>legal.has(t))&&set.includes(w.data.trait)
    &&a.data.trait===w.data.trait&&a.data.traits===w.data.traits&&w.data.generation===Math.floor(wave/5)&&a.data.generation===w.data.generation,
    {warningSeconds:w&&a?a.at-w.at:null,traits:set,main:w?.data.trait??null});
   const firstBirth=source.events.find(e=>e.type==='ACTOR_SPAWNED'&&e.wave===wave);
   record(`generation-${wave}-apply-before-birth`,!!a&&!!firstBirth&&(firstBirth.at>a.at-1e-7&&firstBirth.sequence>a.sequence),{applySequence:a?.sequence??null,firstBirthSequence:firstBirth?.sequence??null});
   const next=wave+1,nextWarning=cycle.eventTrail.find(e=>e.type==='ENDLESS_WAVE_WARNING'&&e.wave===next),nextPlan=cycle.waves.find(e=>e.wave===next)?.plan;
   record(`source-${next}-inherits-applied-generation`,!!a&&!!nextWarning&&nextWarning.data.traits===a.data.traits&&JSON.stringify(nextPlan?.traits)===JSON.stringify(traits(a.data.traits)),
    {appliedTraits:a?.data.traits??null,sourceWarningTraits:nextWarning?.data.traits??null,actualCombatTraits:nextPlan?.traits??null});
   const r=source.sources.find(e=>e.wave===next);
   record(`source-${next}-announced-and-removed`,!!r&&r.actualAnnouncementToBirth>=8-1e-7&&(r.actualKill||r.naturalExhaustion),r?{id:r.id,warning:r.actualAnnouncementToBirth,kill:r.actualKill,exhausted:r.naturalExhaustion,
    canceled:r.canceled,bornQuota:r.quotaBorn,actualSourceDamage:r.actualSourceDamage,actualSourceCellDamage:r.actualSourceCellDamage,sourceBudgetAtRemoval:r.removal?.budget??null}:null);
   const births=cycle.actors.filter(actor=>actor.wave===next);
   record(`source-${next}-body-traits-legal`,!!a&&births.every(actor=>actor.traits.every(t=>traits(a.data.traits).includes(t))),births.map(actor=>({id:actor.id,role:actor.role,traits:actor.traits,generation:actor.generation})));
  }
  const oldCase=originalReport.cases.find(e=>e.seed===task.seed&&e.build===task.build&&e.route===task.route&&!e.replay),oldRaw=await read(resolve(prior,oldCase.file));
  const prefix=r=>({hits:r.cycleObservation.acceptedDamageReceipts.filter(e=>e.wave<=16),events:r.sourceObservation.events.filter(e=>e.wave<=16)});
  record('original13-through16-accepted-prefix-unchanged',sha(JSON.stringify(prefix(raw)))===sha(JSON.stringify(prefix(oldRaw))),{original13File:oldCase.file,originalPrefixSha256:sha(JSON.stringify(prefix(oldRaw))),latePrefixSha256:sha(JSON.stringify(prefix(raw)))});
 }
 const row={...task,file,rawSha256:sha(encoded),stop:raw.stop,error:raw.error??null,elapsed:raw.elapsed??null,clearedWaves:raw.clearedWaves??null,
  actualFailure:cycle?.terminal.actualDefeat??null,failureReason:raw.result?.reason??null,cycleProblems:cycle?.issues??null,sourceProblems:source?.problems??null,
  maxLive:cycle?Math.max(...cycle.waves.map(w=>w.maxLive)):null,maxReserved:cycle?Math.max(...cycle.waves.map(w=>w.maxReserved)):null,maxCommitted:cycle?Math.max(...cycle.waves.map(w=>w.maxConcurrent)):null,
  lateSources:source?.sources.filter(s=>[21,26].includes(s.wave))??null,checks,
  qualified:raw.clearedWaves===26&&raw.error===null&&cycle?.issues.length===0&&source?.problems.length===0&&checks.every(c=>c.passed)};
 results.push(row);await json(`seed-${task.seed}-${task.build}-qualification.json`,row);
 console.log(JSON.stringify({seed:task.seed,build:task.build,stop:row.stop,elapsed:row.elapsed,clearedWaves:row.clearedWaves,cycleProblems:row.cycleProblems?.length,sourceProblems:row.sourceProblems?.length,
  qualified:row.qualified,failedChecks:checks.filter(c=>!c.passed),lateSources:row.lateSources?.map(s=>({wave:s.wave,kill:s.actualKill,exhausted:s.naturalExhaustion,canceled:s.canceled,born:s.quotaBorn,damage:s.actualSourceDamage,cellDamage:s.actualSourceCellDamage}))}));
}
const sourceChecks=[];for(const[path,entry]of Object.entries(origin.files))sourceChecks.push({path,expectedSha256:entry.sha256,afterSha256:sha(await readFile(resolve(frozenRoot,path)))});
await json('binding.after.json',{...binding,sourceChecks,sourcesUnchanged:sourceChecks.every(r=>r.expectedSha256===r.afterSha256)});
const summary={plan,binding,sourceUnchanged:sourceChecks.every(r=>r.expectedSha256===r.afterSha256),cases:results,qualified:sourceChecks.every(r=>r.expectedSha256===r.afterSha256)&&results.every(r=>r.qualified),
 scope:'Exactly two bounded new cases on the already-executed source/runtime/policy/observers. Original13 records remain unchanged. No extra run, browser, GPU performance, all35 qualification or human fun/retention claim.'};
await json('report.json',summary);console.log(JSON.stringify({output,qualified:summary.qualified,cases:results.map(r=>({build:r.build,clearedWaves:r.clearedWaves,elapsed:r.elapsed,stop:r.stop,qualified:r.qualified}))}));
if(!summary.qualified)process.exitCode=1;
