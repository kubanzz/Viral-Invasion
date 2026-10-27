import { readFile,writeFile } from 'node:fs/promises';
import { hash,assertAbsent,EXPECTED_GAME } from './contract.mjs';
const folder=process.env.VI_PERF_OUTPUT??'artifacts/completion-v073/performance/attempt-1';
const raw=await readFile(`${folder}/report.json`),report=JSON.parse(raw.toString('utf8'));
const execution=JSON.parse(await readFile(`${folder}/execution.json`,'utf8'));
if(report.status!=='passed'||report.pass!==true||execution.pass!==true||report.releaseGameJsSha256!==EXPECTED_GAME)throw Error('Wait for a complete passing frozen v0.7.3 pressure attempt before generating the memory review.');
await assertAbsent([`${folder}/memory-window-audit.json`,`${folder}/memory-review.json`]);
const natural=report.samples.filter(sample=>sample.forcedGc===false);
if(natural.length!==report.samples.length||natural.length<2)throw Error('Natural/frame sample arrays contain forced-GC entries or too few samples.');
const stats=values=>{
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return{count:sorted.length,min:sorted[0],median:sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2,max:sorted.at(-1),first:values[0],last:values.at(-1)};
};
const describe=samples=>({samples:samples.length,usedBytes:stats(samples.map(sample=>sample.heap.usedSize)),allocatedCapacityBytes:stats(samples.map(sample=>sample.heap.totalSize)),
  embedderUsedBytes:stats(samples.map(sample=>sample.heap.embedderHeapUsedSize)),backingStorageBytes:stats(samples.map(sample=>sample.heap.backingStorageSize)),
  domNodes:stats(samples.map(sample=>sample.dom.nodes)),listeners:stats(samples.map(sample=>sample.dom.jsEventListeners)),documents:[...new Set(samples.map(sample=>sample.dom.documents))]});
const windows=Array.from({length:10},(_,index)=>{
  const samples=natural.filter(sample=>Math.min(9,Math.floor(sample.activeSimulationSeconds/60))===index);
  return{start:index*60,end:index===9?report.activeSimulationSeconds:(index+1)*60,...describe(samples)};
});
const checkpoints=report.postMeasurementMemory.checkpoints,menus=checkpoints.filter(checkpoint=>checkpoint.phase==='menu');
if(checkpoints.length!==4||menus.length!==3||checkpoints.some(checkpoint=>checkpoint.forcedGc!==true))throw Error('Expected separate pressure/menu/5-restart/10-restart forced-GC checkpoints.');
const delta=menus.at(-1).collected.usedSize-menus[0].collected.usedSize;
const source={path:`${folder}/report.json`,sha256:hash(raw),executionPath:`${folder}/execution.json`,executionSha256:hash(await readFile(`${folder}/execution.json`)),scriptSha256:hash(await readFile(new URL(import.meta.url))),releaseGameJsSha256:report.releaseGameJsSha256};
const windowReport={schemaVersion:1,generatedAt:new Date().toISOString(),...source,
  method:'Derived from completed natural-CDP samples only, in bytes. No new game execution. Last fixed minute bucket includes the terminal sample slightly after600 active seconds; separate first/last60-second windows are explicitly filtered.',
  activeSimulationSeconds:report.activeSimulationSeconds,naturalSamples:natural.length,observedActiveRange:[natural[0].activeSimulationSeconds,natural.at(-1).activeSimulationSeconds],
  overall:describe(natural),windows,first60Seconds:describe(natural.filter(sample=>sample.activeSimulationSeconds<60)),last60Seconds:describe(natural.filter(sample=>sample.activeSimulationSeconds>=report.activeSimulationSeconds-60)),
  sampledHeapFalls:natural.slice(1).filter((sample,index)=>sample.heap.usedSize<natural[index].heap.usedSize).length,
  scope:'Natural V8 used/allocated/embedder/backing and CDP DOM counters; no process RSS/GPU measurement and no proof of absence of leaks. Forced GC belongs only to post-measurement checkpoints below.'};
const review={schemaVersion:1,generatedAt:new Date().toISOString(),...source,
  scope:'Independent finite observation of completed local Chrome headless pressure. Frame/natural measurement precedes every forced GC; later checkpoints use three forced GCs each and real UI restarts. This is not natural-GC throughput or an all-device memory qualification.',
  natural:{samples:natural.length,forcedGcDuringMeasurement:false,overall:windowReport.overall,first60Seconds:windowReport.first60Seconds,last60Seconds:windowReport.last60Seconds,sampledHeapFalls:windowReport.sampledHeapFalls},
  postMeasurement:{scope:report.postMeasurementMemory.scope,checkpoints:checkpoints.map(checkpoint=>({name:checkpoint.name,phase:checkpoint.phase,tick:checkpoint.tick,
    usedBytesAfterThreeGc:checkpoint.collected.usedSize,allocatedCapacityBytesAfterThreeGc:checkpoint.collected.totalSize,embedderUsedBytesAfterThreeGc:checkpoint.collected.embedderHeapUsedSize,backingStorageBytesAfterThreeGc:checkpoint.collected.backingStorageSize,dom:checkpoint.dom})),
    menuTenRestartsDeltaBytes:delta,menuTenRestartsDeltaPercent:delta/menus[0].collected.usedSize*100,
    menuNodeCounts:menus.map(checkpoint=>checkpoint.dom.nodes),menuListenerCounts:menus.map(checkpoint=>checkpoint.dom.jsEventListeners),
    interpretation:'Finite retained-size differences and transient DOM variation are reported as observations. They neither establish a leak nor prove no leak; do not claim identical nodes unless these actual checkpoint values agree.'},
  runMetrics:{observedSnapshots:report.runMetrics.observedSnapshots,maxObservedFrameEntries:report.runMetrics.maxFrameEntries,frameEntryLimit:report.runMetrics.frameLimit,limited:report.runMetrics.finalSummary.limited,
    finalAcceptedCaseBeaconBites:report.runMetrics.finalSummary.control.beaconBites,finalAcceptedCasePatrolBites:report.runMetrics.finalSummary.control.patrolBites,
    betweenFirstAndLastNaturalSampleAcceptedBeaconIncrease:natural.at(-1).runMetrics.summary.control.beaconBites-natural[0].runMetrics.summary.control.beaconBites,
    pollingTelemetryLogCount:report.cellHits,
    countScope:execution.countScope,
    frameScope:'Maximum frame occupancy is from read-only polling, not direct observation of every tick. This long pressure strategy mainly exercises immune combat; other metric branches require their separate evidence.'},
  timing:{measuredActiveSeconds:report.activeSimulationSeconds,frameMetrics:report.metrics,rawMeasurementWallDurationMs:report.measurementWallDurationMs,rawWallDurationMsBeforePostMemory:report.wallDurationMs,outerWallDurationMsIncludingPostMemory:execution.outerWallDurationMs,scope:execution.wallScope},
  limitations:['One headless Chrome run does not close full M16 memory/native-device qualification.','Natural and forced-GC checkpoints must stay separate; allocated-capacity expansion is retained rather than declared a leak or ignored.','Two quality images correspond to different live states.24 active actors plus3 cells in sampled state do not mean every actor is visible or density is continuously maximal.','No new browser, simulation, gameplay input or test is executed by this review. Human blind testing remains separate.']};
await writeFile(`${folder}/memory-window-audit.json`,JSON.stringify(windowReport,null,2),{flag:'wx'});
await writeFile(`${folder}/memory-review.json`,JSON.stringify(review,null,2),{flag:'wx'});
console.log(JSON.stringify({sourceSha256:source.sha256,naturalSamples:natural.length,first60UsedMedian:windowReport.first60Seconds.usedBytes.median,last60UsedMedian:windowReport.last60Seconds.usedBytes.median,first60CapacityMedian:windowReport.first60Seconds.allocatedCapacityBytes.median,last60CapacityMedian:windowReport.last60Seconds.allocatedCapacityBytes.median,
  menuDeltaBytes:delta,menuDeltaPercent:review.postMeasurement.menuTenRestartsDeltaPercent,menuNodes:review.postMeasurement.menuNodeCounts,menuListeners:review.postMeasurement.menuListenerCounts,finalAcceptedBeaconBites:review.runMetrics.finalAcceptedCaseBeaconBites,maxObservedFrameEntries:report.runMetrics.maxFrameEntries}));
