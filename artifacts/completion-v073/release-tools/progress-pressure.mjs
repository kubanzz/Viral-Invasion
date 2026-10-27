import {readFile} from 'node:fs/promises';
const folder=process.env.VI_PERF_OUTPUT??'artifacts/completion-v073/performance/attempt-1';
try{
  const report=JSON.parse(await readFile(`${folder}/report.json`,'utf8'));
  console.log(JSON.stringify({status:report.status,activeSeconds:report.activeSimulationSeconds??null,latestMode:report.samples.at(-1)?.mode??null,
    naturalSamples:report.samples.length,maxActors:report.maxActors,maxCells:report.maxCells,denseStandard:!!report.dense_standard,denseLow:!!report.dense_low,
    metricSnapshots:report.runMetrics.observedSnapshots,maxObservedMetricFrameEntries:report.runMetrics.maxFrameEntries,latestAcceptedBites:report.samples.at(-1)?.runMetrics?.summary?.control?.beaconBites??null,
    errors:report.errors.length,requests:report.requests.length,pass:report.pass??null}));
}catch(error){if(error.code==='ENOENT')console.log(JSON.stringify({status:'setup-before-first-saved-phase',reportExists:false}));else console.log(JSON.stringify({status:'report-read-unavailable',error:error.message}));}
