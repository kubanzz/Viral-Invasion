import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const folder='artifacts/visual-quality-20261029/motion-preview';
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(pathToFileURL(resolve('artifacts/visual-quality-20261029/motion-preview-build/index.html')).href+'?scenario=training&seed=71');
await page.locator('[data-action="start"]').click();await page.waitForTimeout(300);
const frames=[];
for(const [name,angle] of [['right',0],['down',Math.PI/2],['left',Math.PI],['up',-Math.PI/2]]){
 const p=await page.evaluate(()=>window.__viral.toScreen(window.__viral.snapshot().player));
 await page.mouse.move(p.x+Math.cos(angle)*250,p.y+Math.sin(angle)*150);await page.waitForTimeout(130);
 const foot=await page.evaluate(()=>window.__viral.toScreen(window.__viral.snapshot().player));
 await page.screenshot({path:`${folder}/idle-${name}.png`,clip:{x:Math.max(0,foot.x-90),y:Math.max(0,foot.y-125),width:180,height:155}});
 frames.push(await page.evaluate(()=>window.__viral.diagnostics()));
}
await page.keyboard.down('KeyD');
for(let i=0;i<6;i++){
 await page.waitForTimeout(65);const foot=await page.evaluate(()=>window.__viral.toScreen(window.__viral.snapshot().player));
 await page.screenshot({path:`${folder}/walk-${i}.png`,clip:{x:Math.max(0,foot.x-90),y:Math.max(0,foot.y-125),width:180,height:155}});
 frames.push(await page.evaluate(()=>window.__viral.diagnostics()));
}
await page.keyboard.up('KeyD');
await page.screenshot({path:`${folder}/scene.png`});
await writeFile(`${folder}/report.json`,JSON.stringify({errors,frames},null,2));
await browser.close();console.log(JSON.stringify({errors,meshes:frames[0]?.phaser?.articulatedMeshes}));
