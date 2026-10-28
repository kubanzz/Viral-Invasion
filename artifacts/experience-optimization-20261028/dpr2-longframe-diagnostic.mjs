// Focused instrumented reproduction, not a replacement for the dense run.
// Real offline game, real inputs, DPR 2; screenshot IPC is the only treatment.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const out = 'artifacts/experience-optimization-20261028/dpr2-longframe-diagnostic';
const game = 'artifacts/experience-optimization-20261028/dpr-final-build';
await mkdir(out, {recursive:true});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch({channel:'chrome',headless:true});
let report = {method:'Actual offline game at 1366x768 DPR2, initial sparse battle. Four screenshot treatments interleaved with four idle controls. Probe retains browser rAF timestamps and both host and browser clocks; screenshot remains part of measured intervals. Not a dense 10-minute or GPU trace.',gameSha256:sha(await readFile(`${game}/game.js`)), browser:browser.version(), errors:[], windows:[]};
try {
  const context = await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:2,offline:true});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto(`${pathToFileURL(resolve(game,'index.html')).href}?seed=130026`);
  await page.locator('[data-action="start"]').click();
  await page.evaluate(()=>{
    const trace={frames:[], last:null}; window.__longFrameTrace=trace;
    const record=t=>{if(trace.last!==null)trace.frames.push({start:trace.last,end:t,dt:t-trace.last});trace.last=t;requestAnimationFrame(record)};
    requestAnimationFrame(record);
  });
  await page.waitForTimeout(2000);
  for (let i=0;i<4;i++) {
    const pre=await page.evaluate(()=>({t:performance.now(), wall:Date.now()}));
    const hostStart=Date.now();
    await page.screenshot({path:`${out}/screenshot-${i}.png`});
    const hostEnd=Date.now();
    const post=await page.evaluate(()=>({t:performance.now(),wall:Date.now()}));
    report.windows.push({kind:'screenshot',i,pre,post,hostStart,hostEnd});
    await page.waitForTimeout(2500);
    const idleStart=await page.evaluate(()=>({t:performance.now(),wall:Date.now()}));
    await page.waitForTimeout(600);
    const idleEnd=await page.evaluate(()=>({t:performance.now(),wall:Date.now()}));
    report.windows.push({kind:'control',i,pre:idleStart,post:idleEnd});
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1000);
  const frames=await page.evaluate(()=>window.__longFrameTrace.frames);
  for(const w of report.windows){w.overlapping=frames.filter(f=>f.end>=w.pre.t && f.start<=w.post.t); w.maxMs=Math.max(0,...w.overlapping.map(f=>f.dt));}
  report.frames=frames; report.longFrames=frames.filter(f=>f.dt>100); report.total=frames.length;
  report.status='completed';
} catch(error){report.status='failed'; report.error=error.stack??String(error);process.exitCode=1;}
finally {await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({status:report.status,total:report.total,longFrames:report.longFrames,windows:report.windows.map(({kind,i,maxMs,pre,post})=>({kind,i,maxMs,duration:post.t-pre.t}))}));
