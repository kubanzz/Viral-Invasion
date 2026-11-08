import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { composeMobileHtml, readVerifiedMobileBuild } from './package-mobile.mjs';

const directory = resolve('artifacts/world-prologue-v3');
await mkdir(directory, { recursive: true });
const buildDirectory = process.env.VI_PROLOGUE_DIST ?? 'dist';
const verified = await readVerifiedMobileBuild({ distDirectory: buildDirectory });
const html = composeMobileHtml(verified.outputs.get('index.html').toString(), verified.outputs.get('game.js').toString());
const mobilePath = join(directory, 'Viral-Invasion-Prologue-Mobile.html');
await writeFile(mobilePath, html);
const cases = [
  { name: 'desktop-chrome', channel: 'chrome', viewport: { width: 1366, height: 768 }, entry: resolve(buildDirectory, 'index.html'), touch: false },
  { name: 'mobile-edge', channel: 'msedge', viewport: { width: 667, height: 320 }, entry: mobilePath, touch: true },
];
const report = { entrySha256: createHash('sha256').update(verified.outputs.get('game.js')).digest('hex'),
  playback: 'Natural 33-second runtime with real click and keyboard/touch input; no seek or state mutation.',
  mobileDevice: 'Desktop browser touch emulation, not a physical phone.', cases: [] };

for (const item of cases) {
  const browser = await chromium.launch({ channel: item.channel, headless: true });
  const context = await browser.newContext({ viewport: item.viewport, hasTouch: item.touch, isMobile: item.touch,
    deviceScaleFactor: 1, serviceWorkers: 'block', recordVideo: { dir: join(directory, item.name), size: item.viewport } });
  const page = await context.newPage(), errors = [], remoteRequests = [], unexpectedFiles = [];
  page.on('pageerror', error => errors.push(String(error)));
  const allowedFiles = new Set([pathToFileURL(item.entry).href, ...(!item.touch ? [pathToFileURL(resolve(buildDirectory, 'game.js')).href] : [])]);
  page.on('request', request => { if (request.url().startsWith('file:') && !allowedFiles.has(request.url())) unexpectedFiles.push(request.url()); });
  await context.route(/^https?:\/\//, route => { remoteRequests.push(route.request().url()); return route.abort(); });
  const result = { name: item.name, viewport: item.viewport, screenshots: [], errors, remoteRequests, unexpectedFiles, shots: [] };
  try {
    await page.goto(pathToFileURL(item.entry).href);
    await page.locator('[data-action="endless-start"]').waitFor({ state: 'visible', timeout: 25000 });
    await page.locator('[data-action="endless-start"]').click();
    const root = page.locator('#world-prologue');
    await page.waitForFunction(() => document.querySelector('#world-prologue')?.getAttribute('data-ready') === 'true', null, { timeout: 25000 });
    if (item.touch) {
      await page.locator('[data-prologue-action="pause"]').tap();
      await page.waitForFunction(() => document.querySelector('#world-prologue')?.getAttribute('data-paused') === 'true');
      const elapsed = await root.getAttribute('data-elapsed');
      await page.waitForTimeout(350);
      assert.equal(await root.getAttribute('data-elapsed'), elapsed);
      await page.locator('[data-prologue-action="sound"]').tap();
      await page.locator('[data-prologue-action="pause"]').tap();
    }
    for (const shot of ['body', 'lung', 'heart', 'orders', 'transit', 'arrival']) {
      await page.waitForFunction(id => {
        const root = document.querySelector('#world-prologue');
        return root?.getAttribute('data-shot') === id;
      }, shot, { timeout: 18000 });
      await page.waitForTimeout(shot === 'arrival' ? 2400 : 1100);
      const data = await root.evaluate(element => ({ ...element.dataset }));
      assert.equal(data.loadErrors, '0', `${item.name}/${shot}: all background and animation assets must load`);
      assert.equal(data.media, 'video');
      assert(Number(data.videoWidth) >= 1280 && Number(data.videoHeight) >= 720, 'The actual Blender film must be decoded');
      assert(Number(data.decodedFrames) > 0, 'The player must display decoded video frames');
      const snapshot = await page.evaluate(() => window.__viral.snapshot());
      if (shot !== 'arrival') assert.equal(snapshot.phase, 'menu', `${item.name}/${shot}: gameplay must stay frozen`);
      else { assert.equal(snapshot.camp.prologue, 'arrival'); assert.equal(snapshot.elapsed, 0); assert.equal(snapshot.tick, 0); }
      const screenshot = join(directory, item.name + '-' + shot + '.png');
      await page.screenshot({ path: screenshot }); result.screenshots.push(screenshot);
      const controls = await page.locator('.world-prologue-controls button').evaluateAll(buttons => buttons.map(button => {
        const r = button.getBoundingClientRect(); return { text: button.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }));
      assert(controls.every(button => button.left >= 0 && button.right <= item.viewport.width && button.top >= 0 && button.bottom <= item.viewport.height));
      result.shots.push({ ...data, gameTick: snapshot.tick, gameElapsed: snapshot.elapsed, controls });
    }
    await root.waitFor({ state: 'detached', timeout: 10000 });
    await page.screenshot({ path: join(directory, item.name + '-camp.png') });
    assert.equal(await page.evaluate(() => localStorage.getItem('vi-world-prologue-v3')), 'seen');
    assert.equal(await page.locator('#app').evaluate(element => element.inert), false);
    const before = await page.evaluate(() => window.__viral.snapshot());
    if (!item.touch) {
      await page.keyboard.down('d'); await page.waitForTimeout(350); await page.keyboard.up('d');
      const after = await page.evaluate(() => window.__viral.snapshot());
      assert(after.player.x > before.player.x + 10, 'Player must regain movement after the film');
    } else {
      const stick = await page.locator('.mobile-stick[data-stick="move"]').boundingBox();
      assert(stick, 'The movement stick must be visible after the film');
      const client = await context.newCDPSession(page), x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 38, y, id: 1 }] });
      await page.waitForTimeout(400);
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const after = await page.evaluate(() => window.__viral.snapshot());
      assert(after.player.x > before.player.x + 10, 'The player must regain real touch movement after the film');
      await page.waitForTimeout(150);
      const stopped = await page.evaluate(() => window.__viral.snapshot());
      await page.waitForTimeout(250);
      const resting = await page.evaluate(() => window.__viral.snapshot());
      assert.equal(resting.player.x, stopped.player.x, 'Touch release must stop movement');
      assert.equal(resting.player.y, stopped.player.y, 'Touch release must stop movement');
      await client.detach();
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(remoteRequests.length, 0, 'Offline prologue must never fetch external media');
    assert.equal(unexpectedFiles.length, 0, 'The opening must not load any additional loose files');
    result.passed = true;
  } catch (error) {
    result.passed = false; result.error = String(error);
    await page.screenshot({ path: join(directory, item.name + '-failure.png') }).catch(() => {});
  } finally {
    const video = page.video(); await context.close();
    result.video = await video?.path(); await browser.close();
  }
  report.cases.push(result);
  await writeFile(join(directory, 'natural-playback-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ name: result.name, passed: result.passed, shots: result.shots.map(shot => shot.shot), error: result.error }));
}
if (!report.cases.every(item => item.passed)) process.exitCode = 1;
