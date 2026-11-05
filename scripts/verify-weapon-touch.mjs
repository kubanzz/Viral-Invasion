import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServedCandidate } from './served-candidate.mjs';

// Production browser input only. evaluate() reads snapshots/geometry; it never
// writes actors, clocks, inventory, save data or a diagnostic action channel.
const out = resolve(process.env.VI_WEAPON_TOUCH_OUTPUT ?? 'artifacts/weapon-v016/touch');
await mkdir(out, { recursive: true });
const report = { pass: false, version: '0.16.0', scope: 'Natural opening combat inputs and browser viewport recovery, not complete rescue or physical phone validation', errors: [], cases: [] };
let browser, served;
const read = page => page.evaluate(() => window.__viral.snapshot());
const diag = page => page.evaluate(() => window.__viral.diagnostics());
async function until(run, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await run()) return; await new Promise(done => setTimeout(done, 45)); }
  throw Error(`Timed out: ${label}`);
}
async function center(page, selector) {
  const target = page.locator(selector).filter({ visible: true }).first();
  await target.waitFor({ state: 'visible' }); const b = await target.boundingBox();
  assert.ok(b && b.width > 0 && b.height > 0, `Missing control ${selector}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width, height: b.height };
}
const direction = (a, b) => { const x = a.x - b.x, y = a.y - b.y, n = Math.hypot(x, y); return { x: x / n, y: y / n }; };

try {
  served = await startServedCandidate({ metadataPath: process.env.VI_BUILD_META, mobileHtml: process.env.VI_WEAPON_MOBILE_HTML, expectedVersion: '0.16.0' });
  report.candidate = served.snapshot(); report.beforeHashes = await served.diskHashes();
  browser = await chromium.launch({ channel: process.env.VI_BROWSER_CHANNEL ?? 'chrome', headless: true });
  for (const [width, height] of [[667, 320], [844, 390], [915, 412]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
      recordVideo: { dir: out, size: { width, height } } });
    const page = await context.newPage(), cdp = await context.newCDPSession(page), touches = new Map();
    const item = { width, height, pass: false, pageErrors: [], assertions: [], screenshots: [] }; report.cases.push(item);
    page.on('pageerror', error => item.pageErrors.push(String(error)));
    async function touch(type, id, point) {
      if (type === 'touchEnd') {
        const end = touches.get(id); if (!end) return;
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [end] }); touches.delete(id);
      } else if (type === 'touchCancel') {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [] }); touches.clear();
      } else {
        touches.set(id, { id, x: point.x, y: point.y, radiusX: 3, radiusY: 3, force: 1 });
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.values()] });
      }
    }
    const tap = async selector => { const p = await center(page, selector); await touch('touchStart', 9, p); await touch('touchEnd', 9); };
    const screenshot = async name => { const path = resolve(out, `${width}-${name}.png`); await page.screenshot({ path }); item.screenshots.push(path); };
    try {
      await page.goto(`${served.entry}?mobile=1&seed=130026`, { waitUntil: 'load' });
      await tap('[data-action="endless-start"]');
      await until(async () => (await read(page)).phase === 'playing', 'normal challenge start');
      await page.locator('#mobile-controls[data-weapon-mode="true"]').waitFor();
      const selectors = ['[data-stick="move"]', '[data-touch-action="scan"]', '[data-touch-action="territory"]', '[data-stick="attack"]',
        '[data-weapon-skill="1"]', '[data-weapon-skill="2"]', '[data-weapon-skill="3"]', '[data-touch-action="dash"]'];
      const boxes = await Promise.all(selectors.map(selector => center(page, `#mobile-controls ${selector}`)));
      boxes.forEach((b, i) => { assert.ok(b.width >= 48 && b.height >= 48, `${selectors[i]} minimum hit area`); assert.ok(b.x >= b.width / 2 && b.x + b.width / 2 <= width && b.y >= b.height / 2 && b.y + b.height / 2 <= height, `${selectors[i]} inside viewport`); });
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
        const dx = Math.max(0, Math.abs(boxes[a].x - boxes[b].x) - (boxes[a].width + boxes[b].width) / 2);
        const dy = Math.max(0, Math.abs(boxes[a].y - boxes[b].y) - (boxes[a].height + boxes[b].height) / 2);
        assert.ok(Math.hypot(dx, dy) >= 7.9, `Controls ${selectors[a]} and ${selectors[b]} need 8px gap`);
      }
      if (width === 667) {
        const expected = [[64, 256], [152, 256], [208, 256], [611, 264], [529, 278], [533, 210], [605, 178], [467, 280]];
        boxes.forEach((b, i) => assert.ok(Math.abs(b.x - expected[i][0]) < 1 && Math.abs(b.y - expected[i][1]) < 1, `Planned control center ${selectors[i]}`));
      }
      assert.ok(await page.locator('#mobile-controls [data-touch-action="territory"]').isVisible());
      assert.ok(!await page.locator('#mobile-controls [data-touch-skill="3"]').isVisible());
      item.layout = boxes; item.assertions.push('fixed geometry, 48px hit areas, 8px gaps and independent visible purification');
      await screenshot('layout');

      const move = boxes[0], attack = boxes[3], one = boxes[4];
      await touch('touchStart', 1, { x: move.x + 28, y: move.y });
      await touch('touchStart', 2, attack);
      await touch('touchMove', 2, { x: attack.x + 24, y: attack.y - 8 });
      await until(async () => (await read(page)).shots >= 2, 'held primary');
      const before = await read(page), aimBefore = direction((await diag(page)).touch.aim, before.player);
      await touch('touchStart', 3, one);
      await until(async () => (await diag(page)).touch.preview?.kind === 'weapon', 'weapon preview');
      await touch('touchMove', 3, { x: one.x + 30, y: one.y - 12 });
      const withPreview = await diag(page), preview = withPreview.touch.preview;
      assert.equal(preview.weaponSlot, 1);
      const current = await read(page), primaryDuring = direction(withPreview.touch.aim, current.player);
      assert.ok(Math.hypot(primaryDuring.x - aimBefore.x, primaryDuring.y - aimBefore.y) < .02, 'Skill preview must preserve primary direction');
      await touch('touchEnd', 3);
      await until(async () => (await read(page)).weaponCombat.cooldowns[1] > 0, 'weapon 1 accepted');
      await page.waitForTimeout(600);
      const after = await read(page);
      assert.ok(after.shots > before.shots && Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y) > 10, 'Movement and primary resume with original fingers');
      assert.equal(after.events.filter(e => e.type === 'WEAPON_SKILL_CAST' && e.data.slot === 1).length, 1);
      assert.equal(await page.locator('#mobile-controls').getAttribute('data-pointer-held'), 'true');
      item.assertions.push('trusted three-pointer movement, skill 1, separate aim and held-fire continuation');
      await screenshot('skill1');

      const two = boxes[5]; await touch('touchStart', 3, two);
      await until(async () => (await diag(page)).touch.preview?.weaponSlot === 2, 'skill 2 preview');
      const cancel = await center(page, '#mobile-controls [data-touch-cancel]');
      await touch('touchMove', 3, cancel); await touch('touchEnd', 3);
      assert.equal((await read(page)).weaponCombat.cooldowns[2], 0, 'Cancelled skill consumes no cooldown');
      await touch('touchStart', 3, two); await touch('touchEnd', 3);
      await until(async () => (await read(page)).weaponCombat.cooldowns[2] > 0, 'weapon 2 accepted');
      await page.waitForTimeout(250);
      const three = boxes[6]; await touch('touchStart', 3, three);
      await until(async () => (await read(page)).weaponCombat.cooldowns[3] > 0, 'self skill accepted on press');
      assert.equal((await diag(page)).touch.preview, undefined, 'Self skill has no ground preview');
      await touch('touchEnd', 3); await screenshot('overdrive');
      item.assertions.push('skill 2 cancellation without cooldown, direct skill 2 and self skill 3');

      await touch('touchEnd', 2); await touch('touchEnd', 1);
      await page.keyboard.press('Escape'); await until(async () => (await read(page)).phase === 'paused', 'pause');
      const paused = await read(page); await page.waitForTimeout(250);
      const frozen = await read(page); assert.equal(frozen.tick, paused.tick); assert.deepEqual(frozen.weaponCombat, paused.weaponCombat);
      await page.keyboard.press('Escape'); await until(async () => (await read(page)).phase === 'playing', 'resume');
      const resume = await read(page); await page.waitForTimeout(180); const idle = await read(page);
      assert.equal(idle.shots, resume.shots, 'Resume must not retain stale fire');
      await page.setViewportSize({ width: height, height: width });
      await until(async () => (await read(page)).phase === 'paused', 'portrait freeze');
      const rotated = await read(page); await page.waitForTimeout(200); assert.equal((await read(page)).tick, rotated.tick);
      await page.setViewportSize({ width, height });
      assert.equal((await read(page)).phase, 'paused', 'Rotation back waits for explicit resume');
      await screenshot('rotation-return');
      item.assertions.push('pause freezes cast clocks, resume clears stale fire, portrait rotation freezes simulation');
      item.final = { elapsed: (await read(page)).elapsed, hp: (await read(page)).player.hp, skillCooldowns: (await read(page)).weaponCombat.cooldowns };
      assert.deepEqual(item.pageErrors, []); item.pass = true;
    } catch (error) {
      item.error = String(error.stack ?? error); report.errors.push(`${width}x${height}: ${item.error}`);
      try { await screenshot('failure'); item.finalState = await read(page); } catch { /* Keep original failure. */ }
    } finally {
      try { await touch('touchCancel', 0); } catch { /* Context may be closed. */ }
      const video = page.video(); await context.close(); if (video) item.video = await video.path();
      await writeFile(resolve(out, `${width}-report.json`), JSON.stringify(item, null, 2));
    }
  }
  report.afterHashes = await served.diskHashes(); assert.deepEqual(report.afterHashes, report.beforeHashes);
  report.pass = report.cases.every(item => item.pass) && report.errors.length === 0;
} catch (error) { report.errors.push(String(error.stack ?? error)); }
finally {
  await browser?.close(); if (served) { report.transport = served.snapshot(); await served.close(); }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.map(item => ({ width: item.width, pass: item.pass })), errors: report.errors }));
if (!report.pass) process.exitCode = 1;
