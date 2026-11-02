import { chromium,expect } from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildIdentity} from './build-identity.mjs';
const out=resolve('artifacts/competition-polish-20261102');await mkdir(out,{recursive:true});
const mobilePackage=process.argv.includes('--mobile-package'),prefix=mobilePackage?'final-mobile-':'';
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1366,height:768}});
await context.setOffline(true);const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];page.on('pageerror',e=>errors.push(e.message));
const report={identity:await buildIdentity(),entry:mobilePackage?'releases/Viral-Invasion-Mobile.html':'dist/index.html',method:'Natural first wave through real keyboard/mouse; responsive reward inspection and a real CDP touch selection. No fixture or game state writes. Packaged mobile checks do not constitute physical-phone or touch-combat full-run evidence.',homeLayouts:[],layouts:[],errors};
try{
  await page.goto(`${pathToFileURL(resolve(report.entry)).href}?seed=71`);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
  if(mobilePackage){
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    for(const [width,height]of [[844,390],[667,320]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(120);await expect(page.locator('#overlay-host button')).toHaveCount(1);
      const home=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,text:document.querySelector('[data-action="endless-start"]').textContent}));
      expect(home.text).toContain('开始挑战');expect(home.scrollWidth).toBeLessThanOrEqual(width);expect(home.scrollHeight).toBeLessThanOrEqual(height);report.homeLayouts.push(home);
      await page.screenshot({path:resolve(out,`${prefix}home-${width}x${height}.png`)});
    }
    const b=await page.locator('[data-action="endless-start"]').boundingBox(),p={x:b.x+b.width/2,y:b.y+b.height/2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1,radiusX:4,radiusY:4,force:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.setViewportSize({width:1366,height:768});
  }else await page.locator('[data-action="endless-start"]').click();
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){
    const s=await page.evaluate(()=>window.__viral.snapshot());if(s.endlessGrowth.draft)break;
    if(s.phase==='result')throw new Error(`First-wave run failed: ${s.result.reason}`);
    if(s.phase==='paused'){await page.locator('[data-action="continue"]').click();continue;}
    const target=s.targets.filter(t=>t.hp>0).sort((a,b)=>Math.hypot(a.x-s.player.x,a.y-s.player.y)-Math.hypot(b.x-s.player.x,b.y-s.player.y))[0];
    if(target){
      const p=await page.evaluate(t=>window.__viral.toScreen(t),target);await page.mouse.move(Math.max(255,Math.min(1115,p.x)),Math.max(85,Math.min(630,p.y)));
      await page.keyboard.press('Digit1');await page.mouse.down();if(s.scanReady<=s.elapsed)await page.keyboard.press('KeyQ');
      const close=Math.hypot(target.x-s.player.x,target.y-s.player.y)<120;
      if(close)await page.keyboard.press('Space');
    }
    await page.waitForTimeout(80);
  }
  await page.mouse.move(10,10);await page.mouse.up();await expect(page.locator('[data-action="endless-upgrade"]')).toHaveCount(3);
  const sizes=mobilePackage?[['reward-touch-844x390',844,390],['reward-touch-667x320',667,320]]:[['reward-desktop-1366x768',1366,768],['reward-compact-1100x560',1100,560],['reward-touch-844x390',844,390],['reward-touch-667x320',667,320]];
  for(const [name,width,height]of sizes){
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:width<1000,maxTouchPoints:5});await page.setViewportSize({width,height});await page.waitForTimeout(120);
    const layout=await page.evaluate(()=>{
      const modal=document.querySelector('#overlay-host [role="dialog"]'),r=modal.getBoundingClientRect();
      return{width:innerWidth,height:innerHeight,touch:document.body.classList.contains('touch-mode'),documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(width);expect(layout.documentHeight).toBeLessThanOrEqual(height);expect(layout.left).toBeGreaterThanOrEqual(0);expect(layout.right).toBeLessThanOrEqual(width+1);
    for(const button of await page.locator('[data-action="endless-upgrade"]').all()){await button.scrollIntoViewIfNeeded();const b=await button.boundingBox();expect(b.width).toBeGreaterThanOrEqual(44);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width+1);}
    await page.locator('[data-action="endless-upgrade"]').first().scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`${prefix}${name}.png`)});report.layouts.push(layout);
  }
  const choice=page.locator('[data-action="endless-upgrade"][data-upgrade="multishot"]');await choice.scrollIntoViewIfNeeded();const b=await choice.boundingBox(),p={x:b.x+b.width/2,y:b.y+b.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1,radiusX:4,radiusY:4,force:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>page.evaluate(()=>window.__viral.snapshot().endlessGrowth.ranks.multishot)).toBe(1);
  report.pass=true;report.after=await page.evaluate(()=>{const s=window.__viral.snapshot();return{phase:s.phase,wave:s.endless.wave,ranks:s.endlessGrowth.ranks};});expect(errors).toEqual([]);
}catch(e){report.pass=false;report.failure=e.stack??String(e);await page.screenshot({path:resolve(out,'reward-layout-failure.png')}).catch(()=>{});throw e;}
finally{report.finalIdentity=await buildIdentity();expect(report.finalIdentity).toEqual(report.identity);await writeFile(resolve(out,`${prefix}reward-layout-report.json`),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report));
