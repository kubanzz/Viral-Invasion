import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = new URL('./presentation-layout/', import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
for (const viewport of [{width:1366,height:768},{width:1100,height:560},{width:480,height:600}]) {
  const page = await browser.newPage({viewport});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${new URL('../../dist/index.html',import.meta.url).href}?seed=71&hostEvent=MEDICATION`);
  await page.locator('[data-action="start"]').click();
  await page.locator('#host-event-card:not([hidden])').waitFor();
  await page.waitForTimeout(2600);
  const result = await page.evaluate(() => {
    const card=document.getElementById('host-event-card'),description=document.getElementById('host-event-description');
    const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    return { card:box(card),description:box(description),scroll:card.scrollHeight,client:card.clientHeight,
      panels:[...document.querySelectorAll('.battle-objective,.battle-telemetry,.growth-panel,.organ-overview,.dock-wrap')].map(node=>({name:node.className,box:box(node)})),
      descriptionText:description.textContent, cardText:card.textContent, phase:window.__viral.snapshot().phase };
  });
  result.viewport=viewport; result.errors=errors;
  results.push(result);
  await page.screenshot({path:new URL(`${viewport.width}x${viewport.height}.png`,output).pathname.replace(/^\//,'')});
  await page.close();
}
await browser.close();
await writeFile(new URL('results.json',output),JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
