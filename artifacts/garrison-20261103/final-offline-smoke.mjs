import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const output = resolve('artifacts/garrison-20261103');
const desktopPackage = JSON.parse(await readFile('artifacts/releases/v0.13.0/release-package.json', 'utf8'));
const mobilePackage = JSON.parse(await readFile('artifacts/mobile-release/package-report.json', 'utf8'));
const mobileCandidate = JSON.parse(await readFile('artifacts/garrison-20261103/mobile-candidate-6-package.json', 'utf8'));
const report = { version: '0.13.0', method: 'Independent ZIP-decoded desktop entry and final single HTML; offline Chrome with public DOM inputs and read-only diagnostics.', cases: [], pass: false };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const config of [
    { name: 'desktop-decoded', path: resolve(desktopPackage.verifiedFolder, 'index.html'), viewport: { width: 1366, height: 768 } },
    { name: 'mobile-final', path: mobilePackage.html, viewport: { width: 844, height: 390 } },
    { name: 'mobile-915-final', path: mobilePackage.html, viewport: { width: 915, height: 412 } },
  ]) {
    const context = await browser.newContext({ viewport: config.viewport, offline: true });
    const page = await context.newPage(), errors = [], remoteRequests = [];
    const own = { name: config.name, path: config.path, sha256: createHash('sha256').update(await readFile(config.path)).digest('hex'), errors, remoteRequests, pass: false };
    report.cases.push(own);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/i.test(request.url())) remoteRequests.push(request.url()); });
    await page.goto(pathToFileURL(config.path).href);
    await page.waitForFunction(() => window.__viral?.diagnostics().phaser.ready && document.querySelector('#app')?.getAttribute('aria-busy') !== 'true');
    assert.equal(await page.evaluate(() => window.__viral.version), '0.13.0-garrison');
    own.menu = await page.evaluate(() => {
      const d = window.__viral.diagnostics();
      return { phase: window.__viral.snapshot().phase, contract: d.art.actorContract, actors: d.art.actorFrames.filter(a => a.actorId.startsWith('menu:')) };
    });
    assert.equal(own.menu.phase, 'menu');
    assert.equal(own.menu.contract.ready, true);
    assert.deepEqual(own.menu.contract.oldSourceIds, []);
    assert.equal(own.menu.actors.length, 2);
    assert.ok(own.menu.actors.every(a => a.native && !a.fallback && a.source.path.includes('ViralInvasion_Fantasy_Actors_v2/')));
    await page.screenshot({ path: resolve(output, `${config.name}-menu.png`) });
    await page.locator('[data-action="endless-start"]').click();
    await page.waitForFunction(() => window.__viral.snapshot().phase === 'playing' && window.__viral.snapshot().tick >= 2);
    const before = await page.evaluate(() => window.__viral.snapshot().player);
    await page.keyboard.down('KeyD');
    await page.waitForFunction(x => window.__viral.snapshot().player.x > x + 8, before.x);
    await page.keyboard.up('KeyD');
    own.play = await page.evaluate(() => {
      const s = window.__viral.snapshot(), d = window.__viral.diagnostics();
      return { phase: s.phase, tick: s.tick, stage: s.territory.stage, nodeCount: s.territory.nodes.length,
        actors: d.art.actorFrames.filter(a => ['player', 'player:tool'].includes(a.actorId)) };
    });
    assert.equal(own.play.stage, 'rescue');
    assert.equal(own.play.nodeCount, 7);
    if(config.name==='mobile-915-final') {
      own.controls=await page.evaluate(()=>Array.from(document.querySelectorAll('.mobile-stick,.mobile-skill,.mobile-aux')).filter(e=>{
        const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0;
      }).map(e=>{const r=e.getBoundingClientRect();return {id:e.getAttribute('aria-label'),left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
      assert.ok(own.controls.length>=5);
      for(const r of own.controls){assert.ok(r.width>=48&&r.height>=48);assert.ok(r.left>=0&&r.top>=0&&r.right<=915&&r.bottom<=412);}
      for(let i=0;i<own.controls.length;i++)for(let j=i+1;j<own.controls.length;j++){
        const a=own.controls[i],b=own.controls[j],gap=Math.max(b.left-a.right,a.left-b.right,b.top-a.bottom,a.top-b.bottom);assert.ok(gap>=8-0.1,JSON.stringify({a,b,gap}));
      }
    }
    assert.equal(own.play.actors.length, 2);
    assert.ok(own.play.actors.every(a => a.native && !a.fallback && a.source.path.includes('ViralInvasion_Fantasy_Actors_v2/')));
    await page.screenshot({ path: resolve(output, `${config.name}-playing.png`) });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__viral.snapshot().phase === 'paused');
    await page.locator('[data-action="menu"]:visible').click();
    await page.waitForFunction(() => window.__viral.snapshot().phase === 'menu');
    assert.deepEqual(errors, []);
    assert.deepEqual(remoteRequests, []);
    own.pass = true;
    await context.close();
  }
  assert.equal(report.cases[1].sha256, mobileCandidate.htmlSha256);
  report.pass = report.cases.length === 3 && report.cases.every(c => c.pass);
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(resolve(output, 'final-offline-smoke.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.map(c => ({ name: c.name, pass: c.pass, errors: c.errors, remoteRequests: c.remoteRequests })), failure: report.failure }));
