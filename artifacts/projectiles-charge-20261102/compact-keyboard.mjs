import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({channel:'chrome',headless:true});
const report = { viewport:{width:1100,height:560}, input:'keyboard/mouse', offline:true, errors:[] };
try {
 const context=await browser.newContext({viewport:report.viewport,hasTouch:false}); await context.setOffline(true);
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?seed=71'); await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
 await page.locator('[data-action="endless-start"]').click();
 const read=()=>page.evaluate(()=>window.__viral.snapshot());
 await expect.poll(async()=>(await read()).endless.phase).toBe('combat');
 await page.mouse.move(600,240);await page.keyboard.down('Space');await page.waitForTimeout(1400);await page.keyboard.up('Space');
 await expect.poll(async()=>(await read()).events.filter(e=>e.type==='PLAYER_CHARGE_RELEASED').length).toBe(1);
 await page.keyboard.press('Digit2');await page.mouse.down();await page.waitForTimeout(2200);await page.mouse.up();
 const state=await read();report.charge=state.events.find(e=>e.type==='PLAYER_CHARGE_RELEASED');report.cannon=state.events.filter(e=>e.type==='PLAYER_PROJECTILE_LAUNCHED'&&e.data.kind==='cannon').length;
 report.actualLayout=await page.evaluate(()=>document.body.classList.contains('touch-mode')?'compact-touch-HUD':'desktop-HUD');
 expect(report.charge.data.count).toBe(5); expect(report.cannon).toBeGreaterThanOrEqual(2);expect(report.errors).toEqual([]);report.pass=true;
 await page.screenshot({path:resolve('artifacts/projectiles-charge-20261102/compact-keyboard-1100x560.png')}); await context.close();
} catch(error) {report.pass=false;report.failure=String(error);process.exitCode=1;}
finally {await browser.close();await writeFile('artifacts/projectiles-charge-20261102/compact-keyboard-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
