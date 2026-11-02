import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const output = resolve(process.env.VI_INPUT_OUTPUT ?? 'artifacts/projectile-polish-20261102');
const entry = process.env.VI_INPUT_URL ?? 'http://127.0.0.1:5173/';
const identity = {};
if (entry.startsWith('file:')) {
  const path = fileURLToPath(entry);
  identity.html = { path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') };
  try { identity.javascript = { path: resolve(dirname(path), 'game.js'), sha256: createHash('sha256').update(await readFile(resolve(dirname(path), 'game.js'))).digest('hex') }; } catch { /* The mobile entry embeds its script. */ }
}
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const reports = [];
const read = page => page.evaluate(() => window.__viral.snapshot());
const events = (state, type) => state.events.filter(event => event.type === type);
const center = async locator => { const box = await locator.boundingBox(); expect(box).not.toBeNull(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
const touch = (cdp, type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [] });
try {
  for (const [width, height] of [[1366, 768], [1100, 560], [844, 390], [667, 320]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1366 });
    if (entry.startsWith('file:')) await context.setOffline(true);
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    const report = { viewport: { width, height }, entry, offline: entry.startsWith('file:'), method: 'Real keyboard/mouse or Chromium CDP touch contacts. Read-only snapshot/diagnostics; no state, clock or equipment injection. This is browser emulation, not physical-phone validation.', errors: [] };
    reports.push(report); page.on('pageerror', error => report.errors.push(error.message));
    try {
      const url = new URL(entry); url.searchParams.set('seed', '71');
      await page.goto(url.href);
      await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
      await page.locator('[data-action="endless-start"]').click();
      await expect.poll(async () => (await read(page)).endless?.phase).toBe('combat');
      const touchMode = await page.evaluate(() => document.body.classList.contains('touch-mode'));
      report.touchLayout = touchMode;
      if (!touchMode) {
        await page.mouse.move(width * .64, height * .48);
        const dashes = (await read(page)).dashes;
        await page.keyboard.press('Space', { delay: 70 });
        await page.waitForTimeout(100);
        expect((await read(page)).dashes).toBe(dashes + 1);
        expect(events(await read(page), 'PLAYER_CHARGE_RELEASED')).toHaveLength(0);
        await page.keyboard.down('Space'); await page.waitForTimeout(1400);
        await expect.poll(async () => events(await read(page), 'PLAYER_CHARGE_FULL').length).toBe(1);
        await page.screenshot({ path: resolve(output, `charged-${width}x${height}.png`) });
        await page.keyboard.up('Space');
        await expect.poll(async () => events(await read(page), 'PLAYER_CHARGE_RELEASED').length).toBe(1);
        expect(events(await read(page), 'PLAYER_CHARGE_RELEASED')[0].data.count).toBe(5);
        await page.keyboard.press('Digit2'); await page.mouse.down(); await page.waitForTimeout(2250); await page.mouse.up();
        const cannon = events(await read(page), 'PLAYER_PROJECTILE_LAUNCHED').filter(event => event.data.kind === 'cannon');
        expect(cannon.length).toBeGreaterThanOrEqual(2); report.cannonLaunches = cannon.length;
      } else {
        const dash = page.locator('[data-touch-action="dash"]'), dashPoint = await center(dash);
        await touch(cdp, 'touchStart', dashPoint); await page.waitForTimeout(1400);
        await touch(cdp, 'touchMove', { x: dashPoint.x + 28, y: dashPoint.y - 18 });
        await expect(page.locator('[data-touch-cancel]')).toBeVisible();
        await expect(dash).toHaveAttribute('data-charge-full', 'true');
        const label = await page.locator('.mobile-preview-label').boundingBox(), cancel = await page.locator('[data-touch-cancel]').boundingBox();
        expect(label).not.toBeNull(); expect(cancel).not.toBeNull();
        expect(label.x + label.width <= cancel.x || label.x >= cancel.x + cancel.width || label.y + label.height <= cancel.y || label.y >= cancel.y + cancel.height).toBe(true);
        report.previewLabel = label;
        report.previewCancel = cancel;
        await page.screenshot({ path: resolve(output, `charged-${width}x${height}.png`) });
        await touch(cdp, 'touchEnd');
        await expect.poll(async () => events(await read(page), 'PLAYER_CHARGE_RELEASED').length).toBe(1);
        expect(events(await read(page), 'PLAYER_CHARGE_RELEASED')[0].data.count).toBe(5);
        const area = await center(page.locator('[data-touch-skill="2"]'));
        await touch(cdp, 'touchStart', area); await touch(cdp, 'touchMove', { x: area.x + 24, y: area.y - 12 });
        await expect(page.locator('[data-touch-guide]')).toBeHidden();
        await touch(cdp, 'touchEnd');
        await expect.poll(async () => events(await read(page), 'PLAYER_PROJECTILE_LAUNCHED').filter(event => event.data.kind === 'cannon').length).toBe(1);
        report.cannonLaunches = 1;
      }
      await page.waitForTimeout(150);
      const state = await read(page); report.release = events(state, 'PLAYER_CHARGE_RELEASED')[0]; report.dashes = state.dashes;
      report.layout = await page.evaluate(() => {
        const selector = document.body.classList.contains('touch-mode') ? '#mobile-controls [data-touch-action],#mobile-controls [data-touch-skill],#mobile-controls [data-stick=attack]' : '.dock-wrap';
        const boxes = [...document.querySelectorAll(selector)].map(node => { const box = node.getBoundingClientRect(); return { name: node.getAttribute('aria-label'), x: box.x, y: box.y, right: box.right, bottom: box.bottom }; });
        return { documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, boxes };
      });
      expect(report.layout.documentWidth).toBeLessThanOrEqual(width); expect(report.layout.documentHeight).toBeLessThanOrEqual(height);
      for (const box of report.layout.boxes) { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width + 1); expect(box.bottom).toBeLessThanOrEqual(height + 1); }
      await page.screenshot({ path: resolve(output, `combat-${width}x${height}.png`) });
      expect(report.errors).toEqual([]); report.pass = true;
    } catch (error) { report.pass = false; report.failure = error.stack ?? String(error); await page.screenshot({ path: resolve(output, `failure-${width}x${height}.png`) }).catch(() => {}); }
    await context.close();
    await writeFile(resolve(output, 'input-layout-report.json'), JSON.stringify({ scope: 'browser-input-layout', identity, reports }, null, 2));
    console.log(JSON.stringify({ viewport: report.viewport, pass: report.pass, failure: report.failure }));
  }
} finally { await browser.close(); }
if (reports.some(report => !report.pass)) process.exitCode = 1;
