import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts/g1-visual',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const context=await browser.newContext({viewport:{width:1366,height:768},offline:true,recordVideo:{dir:'artifacts/g1-visual',size:{width:1366,height:768}}});
  const page=await context.newPage(), errors=[],remote=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/i.test(r.url()))remote.push(r.url());});
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=130026&trait=CARAPACE`);
  await page.locator('[data-action="start"]').click();
  await page.keyboard.down('KeyA');await page.waitForTimeout(215);await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyS');await page.waitForTimeout(675);await page.keyboard.up('KeyS');
  const target=await page.evaluate(()=>window.__viral.toScreen(window.__viral.snapshot().tissue));
  await page.keyboard.press('Digit3');await page.mouse.move(target.x,target.y);await page.mouse.down();
  const samples=[];
  for(let i=0;i<16;i++) {
    await page.waitForTimeout(5000);
    const state=await page.evaluate(()=>window.__viral.snapshot());
    samples.push({elapsed:state.elapsed,phase:state.phase,hp:state.player.hp,tissue:state.tissue.hp,alive:state.targets.filter(t=>t.hp>0).length});
    if(i%2===0)console.log(JSON.stringify(samples.at(-1)));
    if(state.phase!=='playing')throw new Error(`Density fixture ended: ${JSON.stringify(state.result)}`);
    if(state.targets.filter(t=>t.hp>0).length>=24)break;
  }
  await page.mouse.up();
  await page.keyboard.press('KeyQ');
  await page.screenshot({path:'artifacts/g1-visual/dense-standard.png'});
  const normal=await page.evaluate(()=>window.__viral.snapshot());
  await page.keyboard.press('Escape');await page.locator('[data-action="effects"]').click();await page.locator('[data-action="continue"]').click();
  await page.screenshot({path:'artifacts/g1-visual/dense-low.png'});
  const low=await page.evaluate(()=>window.__viral.snapshot());
  if(normal.targets.filter(t=>t.hp>0).length!==24)throw new Error('The live actor cap was not reached');
  if(errors.length||remote.length)throw new Error(JSON.stringify({errors,remote}));
  await writeFile('artifacts/g1-visual/density-evidence.json',JSON.stringify({provenance:'Real offline Chrome file://, real movement, held repair and Q. No state or clock injection. Same ongoing scenario switched to low effects via pause UI.',samples,normal,low,errors,remote},null,2));
  console.log('Density screenshots and legal-input evidence saved.');
  const video=page.video();await context.close();if(video)await video.saveAs('artifacts/g1-visual/density.webm');
} finally {await browser.close();}
