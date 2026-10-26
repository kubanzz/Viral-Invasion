import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

const folder='artifacts/G4/performance';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],requests=[],samples=[];
try{
  const context=await browser.newContext({viewport:{width:1366,height:768},offline:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/i.test(r.url()))requests.push(r.url());});
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
  const began=Date.now();let low=false,lastScan=-10,maxActors=0;
  while(Date.now()-began<600000){
    const s=await page.evaluate(()=>window.__viral.snapshot());
    if(s.phase==='result')throw new Error(`Pressure run ended: ${s.result.reason}`);
    if(s.growth?.draft){await page.mouse.up();await page.locator('[data-action="draft-discard"]').click();continue;}
    if(!low&&Date.now()-began>=300000){
      await page.mouse.up();await page.keyboard.press('Escape');await page.locator('[data-action="effects"]').click();
      await page.evaluate(()=>{window.__viPerf.mode='low';});await page.locator('[data-action="continue"]').click();low=true;
    }
    if(s.elapsed-lastScan>3.1){await page.keyboard.press('KeyQ');lastScan=s.elapsed;}
    const p=await page.evaluate(t=>window.__viral.toScreen(t),s.tissue);await page.mouse.move(p.x,p.y);await page.mouse.down();
    const alive=s.targets.filter(t=>t.hp>0).length;maxActors=Math.max(maxActors,alive);
    const memory=await page.evaluate(()=>performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null);
    samples.push({wallSeconds:(Date.now()-began)/1000,elapsed:s.elapsed,phase:s.phase,alive,hp:s.player.hp,tissue:s.tissue.hp,events:s.events.length,effects:s.effects.length,mode:low?'low':'standard',memory});
    if(alive===24&&!samples.slice(0,-1).some(item=>item.alive===24))await page.screenshot({path:`${folder}/dense-standard.png`});
    if(low&&!samples.slice(0,-1).some(item=>item.mode==='low'))await page.screenshot({path:`${folder}/dense-low.png`});
    if(samples.length%6===0)console.log(JSON.stringify(samples.at(-1)));
    await page.waitForTimeout(5000);
  }
  await page.mouse.up();
  const frameTimes=await page.evaluate(()=>window.__viPerf.segments);
  const summarize=times=>{const sorted=times.slice().sort((a,b)=>a-b),total=times.reduce((a,b)=>a+b,0);return{frames:times.length,activeDurationMs:total,averageFps:1000*times.length/total,p95Ms:sorted[Math.floor((sorted.length-1)*.95)],maxMs:sorted.at(-1)};};
  const device={os:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),browser:await browser.version(),mode:'Chrome headless on the local Windows device, real offline file entry and DOM keyboard/mouse; this is not a manual foreground-device test.'};
  const metrics=Object.fromEntries(Object.entries(frameTimes).map(([mode,times])=>[mode,summarize(times)]));
  const heapFloor=rows=>rows.length?Math.min(...rows.map(row=>row.memory.used)):null;
  const firstHeap=heapFloor(samples.filter(row=>row.wallSeconds>=120&&row.wallSeconds<180&&row.memory));
  const lastHeap=heapFloor(samples.filter(row=>row.wallSeconds>=540&&row.memory));
  const memory={available:firstHeap!==null&&lastHeap!==null,steadyEarlyFloorBytes:firstHeap,finalMinuteFloorBytes:lastHeap,floorIncreaseBytes:firstHeap!==null&&lastHeap!==null?lastHeap-firstHeap:null,
    observerFrameSamples:Object.values(frameTimes).reduce((sum,rows)=>sum+rows.length,0),note:'Raw frame arrays are retained by the measurement observer. Heap floors are observations, not a leak-proof guarantee.'};
  const pass=Object.values(metrics).every(m=>m.averageFps>=50&&m.p95Ms<=33)&&maxActors===24&&!errors.length&&!requests.length;
  const releaseGameJsSha256=createHash('sha256').update(await readFile('dist/game.js')).digest('hex');
  await writeFile(`${folder}/report.json`,JSON.stringify({device,releaseGameJsSha256,wallDurationMs:Date.now()-began,metrics,memory,maxActors,pass,errors,requests,samples},null,2));
  await writeFile(`${folder}/frame-times.json`,JSON.stringify(frameTimes));
  console.log(JSON.stringify({pass,metrics,maxActors,errors,requests}));
  if(!pass)process.exitCode=1;
}finally{await browser.close();}
