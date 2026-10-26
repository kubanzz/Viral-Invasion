import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

const folder=process.env.VI_PERF_OUTPUT??'artifacts/G4/performance';await mkdir(folder,{recursive:true});
const measurementSource=await readFile(new URL(import.meta.url));
const measurementScriptSha256=createHash('sha256').update(measurementSource).digest('hex');
await writeFile(`${folder}/measurement-script.mjs`,measurementSource);
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],requests=[],samples=[],frameTimes={standard:[],low:[]};
const drainFrames=async page=>{
  const chunk=await page.evaluate(()=>{const probe=window.__viPerf,chunk=probe.segments;probe.segments={standard:[],low:[]};return chunk;});
  for(const [mode,times]of Object.entries(chunk))frameTimes[mode].push(...times);
};
try{
  const context=await browser.newContext({viewport:{width:1366,height:768},offline:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/i.test(r.url()))requests.push(r.url());});
  const diagnostics=await context.newCDPSession(page);
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=130026&trait=CARAPACE`);
  await page.evaluate(()=>{
    const probe={segments:{standard:[],low:[]},mode:'standard',last:0,wasPlaying:false};
    Object.defineProperty(window,'__viPerf',{value:probe});
    const overlay=document.getElementById('overlay-host');
    const measure=now=>{const playing=overlay.childElementCount===0;if(playing&&probe.wasPlaying)probe.segments[probe.mode].push(now-probe.last);probe.wasPlaying=playing;probe.last=now;requestAnimationFrame(measure);};
    requestAnimationFrame(measure);
  });
  await page.locator('[data-action="start"]').click();
  await page.keyboard.down('KeyA');await page.waitForTimeout(215);await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyS');await page.waitForTimeout(675);await page.keyboard.up('KeyS');
  await page.keyboard.press('Digit3');
  const began=Date.now(),initialGameElapsed=await page.evaluate(()=>window.__viral.snapshot().elapsed);let low=false,lastScan=-10,maxActors=0,activeSeconds=0;
  while(activeSeconds<600){
    if(Date.now()-began>900000)throw new Error('Could not accumulate ten active simulation minutes within the wall-clock budget');
    const s=await page.evaluate(()=>window.__viral.snapshot());
    activeSeconds=s.elapsed-initialGameElapsed;if(activeSeconds>=600)break;
    if(s.phase==='result')throw new Error(`Pressure run ended: ${s.result.reason}`);
    if(s.growth?.draft){await page.mouse.up();await page.locator('[data-action="draft-discard"]').click();continue;}
    if(!low&&activeSeconds>=300){
      await page.mouse.up();await page.keyboard.press('Escape');await page.locator('[data-action="effects"]').click();
      await page.evaluate(()=>{window.__viPerf.mode='low';});await page.locator('[data-action="continue"]').click();low=true;
    }
    if(s.elapsed-lastScan>3.1){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
    const p=await page.evaluate(t=>window.__viral.toScreen(t),s.tissue);await page.mouse.move(p.x,p.y);await page.mouse.down();
    const alive=s.targets.filter(t=>t.hp>0).length;maxActors=Math.max(maxActors,alive);
    // Keep the growing measurement history in the Node harness, outside the measured page heap.
    await drainFrames(page);
    const webMemory=await page.evaluate(()=>performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null);
    // CDP returns actual V8 heap usage; performance.memory may expose a fixed privacy-rounded value.
    // This is read-only diagnostics, without forced GC or gameplay-state/time injection.
    const heap=await diagnostics.send('Runtime.getHeapUsage');
    const memory={used:heap.usedSize,total:heap.totalSize,embedderHeapUsed:heap.embedderHeapUsedSize??null,backingStorage:heap.backingStorageSize??null,webMemory};
    samples.push({wallSeconds:(Date.now()-began)/1000,elapsed:s.elapsed,phase:s.phase,alive,retainedActors:s.targets.length,hp:s.player.hp,tissue:s.tissue.hp,events:s.events.length,tacticalRecords:s.tacticalRecords?.length??0,effects:s.effects.length,mode:low?'low':'standard',memory});
    if(alive===24&&!samples.slice(0,-1).some(item=>item.alive===24)){
      await page.screenshot({path:`${folder}/dense-standard.png`});
      await writeFile(`${folder}/dense-state.json`,JSON.stringify(s));
    }
    if(low&&!samples.slice(0,-1).some(item=>item.mode==='low'))await page.screenshot({path:`${folder}/dense-low.png`});
    if(samples.length%6===0)console.log(JSON.stringify(samples.at(-1)));
    await page.waitForTimeout(5000);
  }
  await page.mouse.up();
  await drainFrames(page);
  const summarize=times=>{const sorted=times.slice().sort((a,b)=>a-b),total=times.reduce((a,b)=>a+b,0);return{frames:times.length,activeDurationMs:total,averageFps:1000*times.length/total,p95Ms:sorted[Math.floor((sorted.length-1)*.95)],maxMs:sorted.at(-1)};};
  const device={os:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),browser:await browser.version(),mode:'Chrome headless on the local Windows device, real offline file entry and DOM keyboard/mouse; this is not a manual foreground-device test.'};
  const metrics=Object.fromEntries(Object.entries(frameTimes).map(([mode,times])=>[mode,summarize(times)]));
  const heapFloor=rows=>rows.length?Math.min(...rows.map(row=>row.memory.used)):null;
  const firstHeap=heapFloor(samples.filter(row=>row.wallSeconds>=120&&row.wallSeconds<180&&row.memory));
  const lastHeap=heapFloor(samples.filter(row=>row.wallSeconds>=540&&row.memory));
  const memory={available:firstHeap!==null&&lastHeap!==null,method:'Read-only CDP Runtime.getHeapUsage sampled every five seconds without forced garbage collection; privacy-rounded performance.memory is retained separately in samples.',steadyEarlyFloorBytes:firstHeap,finalMinuteFloorBytes:lastHeap,floorIncreaseBytes:firstHeap!==null&&lastHeap!==null?lastHeap-firstHeap:null,
    observerFrameSamples:Object.values(frameTimes).reduce((sum,rows)=>sum+rows.length,0),note:'Frame samples are drained approximately every five seconds and retained in the Node harness, outside the measured page heap. Page heap floors are observations, not a leak-proof guarantee. The pass flag checks frame budget, density and fatal errors; memory trend requires separate review.'};
  const pass=Object.values(metrics).every(m=>m.averageFps>=50&&m.p95Ms<=33)&&maxActors===24&&!errors.length&&!requests.length;
  const releaseGameJsSha256=createHash('sha256').update(await readFile('dist/game.js')).digest('hex');
  await writeFile(`${folder}/report.json`,JSON.stringify({device,releaseGameJsSha256,measurementScriptSha256,wallDurationMs:Date.now()-began,activeSimulationSeconds:activeSeconds,metrics,memory,maxActors,pass,passScope:'Frame budget, 24 live actors, no page errors and no remote requests. Heap trend is separately reviewed from precise CDP samples; this flag is not a memory-leak guarantee.',errors,requests,samples},null,2));
  await writeFile(`${folder}/frame-times.json`,JSON.stringify(frameTimes));
  console.log(JSON.stringify({pass,metrics,maxActors,errors,requests}));
  if(!pass)process.exitCode=1;
}finally{await browser.close();}
