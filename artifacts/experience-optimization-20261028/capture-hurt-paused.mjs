import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('artifacts/experience-optimization-20261028/hurt-preview-evidence-v3'); await mkdir(output);
const browser = await chromium.launch({ channel:'chrome', headless:true });
const page = await browser.newPage({ viewport:{width:1280,height:720} });
let target = 0, pending = false;
await page.exposeFunction('pauseAtHurt', async index => { if (!pending && index === target) { pending=true; await page.keyboard.press('Escape'); } });
const read = () => page.evaluate(() => { const s=window.__viral.snapshot(),d=window.__viral.diagnostics(); return {tick:s.tick,phase:s.phase,hp:s.player.hp,frame:d.art.heroAnimation.frame,player:d.phaser.nativeSprites.find(v=>v.id==='player'),tool:d.phaser.nativeSprites.find(v=>v.id==='player:tool')}; });
const result={scope:'Real training damage with browser-generated Escape; screenshot suppresses pause overlay only while preserving paused game state.',cases:[]};
try {
 await page.goto('http://127.0.0.1:4185/?scenario=training&seed=71'); await page.locator('[data-action="start"]').click();
 for (const [side,x] of [['right',1000],['left',350]]) for (const index of [0,1]) {
  target=index; pending=false; await page.mouse.move(x,360); await page.waitForTimeout(180);
  await page.locator('[data-action="help"]').first().click();
  await page.evaluate(() => { const watch=()=>{ const f=window.__viral.diagnostics().art.heroAnimation.frame; if(f?.clip==='hurt')window.pauseAtHurt(f.index); if(window.__viral.snapshot().phase!=='paused'||window.__viral.diagnostics().art.heroAnimation.frame?.clip!=='hurt')requestAnimationFrame(watch); }; requestAnimationFrame(watch); });
  await page.locator('[data-action="practice-hit"]').click(); await page.waitForTimeout(200);
  const before=await read(); if(before.phase!=='paused'||before.frame?.clip!=='hurt'||before.frame.index!==index||before.frame.flipX!==(side==='left')) throw Error(`${side} frame ${index} failed to pause: ${JSON.stringify(before)}`);
  const style=await page.addStyleTag({content:'#overlay-host{visibility:hidden!important}'}); const path=`${output}/${side}-${index}.png`; await page.screenshot({path}); await style.evaluate(node=>node.remove());
  await page.waitForTimeout(100); const after=await read(); if(before.tick!==after.tick||JSON.stringify(before.frame)!==JSON.stringify(after.frame))throw Error('Paused state changed');
  result.cases.push({side,index,before,after,path}); await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(600);
 }
 result.pass=true;
}catch(e){result.pass=false;result.error=String(e.stack??e);process.exitCode=1;}finally{await writeFile(`${output}/report.json`,JSON.stringify(result,null,2));await browser.close();}
console.log(JSON.stringify(result));
