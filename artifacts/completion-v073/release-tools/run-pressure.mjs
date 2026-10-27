import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { execFileSync,spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { EXPECTED_GAME,VERSION,hash,hashFile,assertAbsent,verifyFrozenInputs } from './contract.mjs';

const folder=process.env.VI_PERF_OUTPUT??'artifacts/completion-v073/performance/attempt-1';
const script='scripts/measure-campaign-performance.mjs';
const frozen=await verifyFrozenInputs(),scriptSha256=await hashFile(script);
await assertAbsent([folder]);
const environment={...process.env,VI_PERF_OUTPUT:folder,VI_PERF_POST_MEMORY:'1'};
if(!process.argv.includes('--run')){
  const checked=JSON.parse(execFileSync(process.execPath,[script,'--check'],{env:environment,encoding:'utf8',maxBuffer:1024*1024}));
  if(checked.browserStarted!==false||checked.version!==VERSION||checked.gameHash!==EXPECTED_GAME||checked.measurementScriptSha256!==scriptSha256)throw Error('Pressure readiness fingerprint differs.');
  console.log(JSON.stringify({ready:true,browserStarted:false,executed:false,folder,postMeasurementMemory:true,checked,sourceRevision:frozen.sourceRevision,
    launchCondition:'Use --run only after the root confirms every functional/simulation browser process is terminal and authorizes exclusive pressure.'}));
  process.exit(0);
}
await mkdir(folder,{recursive:true});
const launch={startedAt:new Date().toISOString(),command:[process.execPath,script],cwd:resolve('.'),node:process.version,
  environment:{VI_PERF_OUTPUT:folder,VI_PERF_POST_MEMORY:'1'},version:VERSION,gameSha256:EXPECTED_GAME,sourceRevision:frozen.sourceRevision,
  packagingHead:frozen.packagingHead,scriptSha256,scope:'Exclusive real DOM pressure driver. Raw output preserves its original FPS/density gates; post-GC/ten restarts occur only after frame/natural measurement.'};
await writeFile(`${folder}/launch.json`,JSON.stringify(launch,null,2),{flag:'wx'});
const consoleLog=createWriteStream(`${folder}/console.log`,{flags:'wx'}),started=Date.now();
const child=spawn(process.execPath,[script],{env:environment,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',chunk=>{process.stdout.write(chunk);consoleLog.write(chunk);});
child.stderr.on('data',chunk=>{process.stderr.write(chunk);consoleLog.write(chunk);});
let exitCode,signal,error;
try{({exitCode,signal}=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(exitCode,signal)=>resolve({exitCode,signal}));}));}
catch(caught){error=caught.stack??String(caught);}
await new Promise((resolve,reject)=>{consoleLog.on('error',reject);consoleLog.end(resolve);});
const execution={...launch,finishedAt:new Date().toISOString(),outerWallDurationMs:Date.now()-started,exitCode:exitCode??null,signal:signal??null,error:error??null,pass:false};
try{
  const report=JSON.parse(await readFile(`${folder}/report.json`,'utf8'));
  const post=await verifyFrozenInputs(),currentScriptHash=await hashFile(script);
  const driverSourceChecks=await Promise.all(Object.entries(report.driverSourceManifest).map(async([path,expected])=>({path,expected,matches:(await hashFile(path))===expected})));
  execution.rawReportSha256=await hashFile(`${folder}/report.json`);execution.sourceStillFrozen=post.gameHash===EXPECTED_GAME&&currentScriptHash===scriptSha256&&driverSourceChecks.every(row=>row.matches);
  execution.driverSourceChecks=driverSourceChecks;
  execution.acceptedCaseBeaconBites=report.runMetrics?.finalSummary?.control?.beaconBites??null;
  execution.pollingLogCount=report.cellHits;
  execution.countScope='pollingLogCount is deduplicated PROTOCOL_BEACON_HIT telemetry, without matching each poll to accepted TARGET_HIT. Use acceptedCaseBeaconBites for actual positive damage; that cumulative total includes setup/warmup. Do not relabel polling logs as a guaranteed accepted-hit lower bound.';
  execution.wallScope='outerWallDurationMs includes child startup, setup/warmup, frame measurement and post-measurement GC/restarts. Raw wallDurationMs is assigned before post-memory checks and excludes those checks.';
  execution.pass=exitCode===0&&report.pass===true&&report.version===VERSION&&report.releaseGameJsSha256===EXPECTED_GAME&&execution.sourceStillFrozen&&execution.acceptedCaseBeaconBites>0;
}catch(caught){execution.reviewError=caught.stack??String(caught);}
await writeFile(`${folder}/execution.json`,JSON.stringify(execution,null,2),{flag:'wx'});
console.log(JSON.stringify({wrapperPass:execution.pass,rawExitCode:execution.exitCode,folder,sourceStillFrozen:execution.sourceStillFrozen,acceptedCaseBeaconBites:execution.acceptedCaseBeaconBites}));
if(!execution.pass)process.exitCode=1;
