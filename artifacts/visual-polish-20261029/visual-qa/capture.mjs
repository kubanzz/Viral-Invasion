import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const root = resolve('artifacts/visual-polish-20261029/visual-qa');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ offline: true });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(resolve(root,'fixture.html')).href);
await page.waitForFunction(()=>window.__visualFixture);
const observations=[];
for(const viewport of [{width:1366,height:768},{width:800,height:600},{width:390,height:844}]) {
  await page.setViewportSize(viewport);
  for(const organ of ['heart','lung']) for(const low of [false,true]) {
    await page.evaluate(({organ,low})=>window.__visualFixture.draw(organ,low),{organ,low});
    await page.waitForTimeout(200);
    const file=`${organ}-${viewport.width}-${low?'low':'standard'}.png`;
    await page.screenshot({path:resolve(root,file)});
    const observed=await page.evaluate(()=>window.__visualFixture.diagnostics());
    const labels=observed.diagnostics.labels.placements.filter(p=>p.id.startsWith('enemy-tactic:'));
    if(!observed.immutable)throw Error('Renderer fixture state changed');
    if(labels.length!==5)throw Error(`${file}: expected five warning labels, got ${labels.length}`);
    if(labels.some(p=>p.rect.left<0||p.rect.top<0||p.rect.right>viewport.width||p.rect.bottom>viewport.height))throw Error(`${file}: warning clipped`);
    observations.push({file,viewport,...observed,warningLabels:labels});
  }
}
await browser.close();
await writeFile(resolve(root,'report.json'),JSON.stringify({scope:'Offline Chrome, frozen production Renderer visual fixture. Simultaneous plans were assembled for visual QA; no playable-route or performance claim.',errors,observations},null,2));
if(errors.length)throw Error(errors.join('\n'));
console.log(`Saved ${observations.length} visual samples; all five warning labels visible, in bounds; state unchanged.`);
