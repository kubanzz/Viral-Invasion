import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = new URL('./presentation-final/', import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const event of ['MEDICATION','SMOKE']) for (const viewport of [{width:1366,height:768},{width:1100,height:560},{width:480,height:600}]) {
    const page = await browser.newPage({viewport});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${new URL('../../dist/index.html',import.meta.url).href}?seed=71&hostEvent=${event}${event==='SMOKE'?'&hostEventOrgan=lung':''}`);
    await page.locator('[data-action="start"]').click();
    await page.locator('#host-event-card:not([hidden])').waitFor();
    for (const stage of ['opening','side']) {
      await page.waitForTimeout(stage==='opening'?500:2100);
      const result = await page.evaluate(() => {
        const card=document.getElementById('host-event-card'),description=document.getElementById('host-event-description');
        const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        const rect=box(card), panels=[...document.querySelectorAll('.battle-objective,.battle-telemetry,.growth-panel,.organ-overview,.dock-wrap')].map(node=>({name:node.className,box:box(node)}));
        return {card:rect,description:box(description),scroll:card.scrollHeight,client:card.clientHeight,
          panels, overlaps:panels.filter(({box:r})=>Math.min(r.right,rect.right)-Math.max(r.left,rect.left)>.1&&Math.min(r.bottom,rect.bottom)-Math.max(r.top,rect.top)>.1).map(p=>p.name),
          descriptionText:description.textContent,cardText:card.textContent,state:{phase:window.__viral.snapshot().phase,elapsed:window.__viral.snapshot().elapsed},scale:card.style.getPropertyValue('--host-card-scale')};
      });
      Object.assign(result,{event,viewport,stage,errors:[...errors]}); results.push(result);
      await page.screenshot({path:new URL(`${event}-${viewport.width}x${viewport.height}-${stage}.png`,output).pathname.replace(/^\//,'')});
    }
    await page.close();
  }
} finally {await browser.close();}
await writeFile(new URL('results.json',output),JSON.stringify(results,null,2));
const issues=results.filter(r=>r.scroll>r.client+1||r.overlaps.length||r.errors.length);
console.log(JSON.stringify({samples:results.length,issues,summary:results.map(r=>({event:r.event,viewport:r.viewport,stage:r.stage,card:r.card,scroll:r.scroll,client:r.client,scale:r.scale}))}));
process.exitCode=issues.length?1:0;
