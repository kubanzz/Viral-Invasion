/** Offline presentation smoke. Real DOM inputs and read-only production diagnostics only. */
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = {
  entry: process.env.VI_ENTRY ?? 'dist/index.html', output: 'artifacts/art-v080/browser',
  channel: 'all', dpr: 'all', width: 1366, height: 768,
};
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/check-art-presentation.mjs [--entry dist/index.html] [--output artifacts/art-v080/browser] [--channel all|chrome|msedge] [--dpr all|1|2] [--width 1366] [--height 768]\n'
    + 'Offline Chrome/Edge smoke with public DOM inputs, PNG pixel checks, cold/warm loads, both game modes, pause, resize and real scan animation frames. Not a performance or human playtest.');
  process.exit(0);
}
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]?.replace(/^--/, '');
  if (!args[index]?.startsWith('--') || !Object.hasOwn(options, key) || args[index + 1] === undefined) throw Error(`Invalid option: ${args[index]}`);
  options[key] = ['width', 'height'].includes(key) ? Number(args[index + 1]) : args[index + 1];
}
if (!['all', 'chrome', 'msedge'].includes(options.channel) || !['all', '1', '2'].includes(options.dpr)) throw Error('Invalid channel or DPR. Use --help.');
for (const dimension of ['width', 'height']) if (!Number.isSafeInteger(options[dimension]) || options[dimension] <= 0) throw Error(`${dimension} must be a positive integer.`);
const entry = resolve(root, options.entry), output = resolve(root, options.output);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = async path => sha256(await readFile(path));
const ensure = (condition, message) => { if (!condition) throw Error(message); };
const measurementScript = await readFile(fileURLToPath(import.meta.url));
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), complete: false, pass: false,
  measurementScriptSha256: sha256(measurementScript),
  measurementScript: { path: join(output, 'measurement-script.mjs'), bytes: measurementScript.length },
  scope: 'Offline file entry in installed Chrome/Edge; actual DOM keyboard/mouse inputs, read-only __viral snapshots/diagnostics and browser PNG screenshots. No simulation, profile, time, health or position writes. Not complete gameplay, performance, physical OS focus or human readability acceptance.',
  options, entry, cases: [],
};
await mkdir(output, { recursive: true });
await writeFile(join(output, 'measurement-script.mjs'), measurementScript);

const read = page => page.evaluate(() => {
  const api = window.__viral, state = api.snapshot();
  return { state, diagnostics: api.diagnostics(), playerScreen: api.toScreen(state.player) };
});
const nextPaint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function boot(page) {
  await page.waitForFunction(() => window.__viral?.diagnostics().phaser?.ready === true, undefined, { timeout: 25_000 });
  await page.locator('[data-action="start"]').waitFor({ state: 'visible' });
  await nextPaint(page);
  const result = await read(page);
  ensure(result.diagnostics.phaser.activeSprites >= 2, 'Player and environment native sprites are missing.');
  ensure(result.diagnostics.phaser.nativeSprites.some(sprite => ['player', 'menu:hero'].includes(sprite.id) && sprite.visible)
    && result.diagnostics.phaser.nativeSprites.some(sprite => sprite.id.startsWith('environment:') && sprite.visible), 'Actual native player/environment sprites are missing.');
  return result;
}
async function waitPhase(page, phase) { await page.waitForFunction(value => window.__viral.snapshot().phase === value, phase); }
async function screenshot(page, folder, name, bareCanvas = false) {
  const path = join(folder, `${name}.png`);
  const bytes = bareCanvas
    ? await page.locator('#game').screenshot({ path, style: '#app { visibility: hidden !important; }' })
    : await page.screenshot({ path });
  const metadata = await sharp(bytes).metadata();
  const result = { file: path, bytes: bytes.length, sha256: sha256(bytes), width: metadata.width, height: metadata.height };
  if (bareCanvas) {
    // Read the browser's actual composited WebGL image; never request a 2D context from #game.
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = new Set(); let sampled = 0, nonClear = 0, opaque = 0;
    for (let pixel = 0; pixel < info.width * info.height; pixel += 13) {
      const index = pixel * info.channels, r = data[index], g = data[index + 1], b = data[index + 2], a = data[index + 3];
      sampled++; if (a > 245) opaque++;
      if (Math.abs(r - 18) + Math.abs(g - 13) + Math.abs(b - 27) > 24) nonClear++;
      colors.add((r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3));
    }
    result.pixels = { sampled, quantizedColors: colors.size, opaqueFraction: opaque / sampled, nonClearFraction: nonClear / sampled,
      method: 'Sample every 13th decoded browser PNG pixel; compare with renderer clear RGB(18,13,27); HUD hidden only for screenshot.' };
    ensure(colors.size >= 32 && nonClear / sampled >= .1 && opaque / sampled >= .99, `${name}: WebGL canvas appears blank or unpainted.`);
  }
  return result;
}
async function hud(page, mode) {
  const selectors = mode === 'campaign' ? ['.battle-objective', '.battle-telemetry', '.dock-wrap'] : ['.endless-wave-panel', '.endless-vitals', '.dock-wrap'];
  // Simulation mode changes synchronously; the batched DOM HUD follows on its UI update.
  for (const selector of selectors) await page.locator(selector).waitFor({ state: 'visible' });
  await nextPaint(page);
  const boxes = await page.evaluate(selectors => selectors.map(selector => {
    const element = document.querySelector(selector), rect = element?.getBoundingClientRect();
    return { selector, visible: !!element && !element.hidden && getComputedStyle(element).display !== 'none' && !!rect?.width && !!rect?.height,
      left: rect?.left, right: rect?.right, top: rect?.top, bottom: rect?.bottom };
  }), selectors);
  for (const box of boxes) ensure(box.visible && box.left >= -1 && box.top >= -1 && box.right <= page.viewportSize().width + 1 && box.bottom <= page.viewportSize().height + 1, `HUD absent or outside viewport: ${box.selector}`);
  return boxes;
}
async function projection(page, dpr) {
  const result = await page.evaluate(() => {
    const api = window.__viral, player = api.snapshot().player;
    const points = [{ x: player.x, y: player.y }, { x: player.x + 100, y: player.y - 75 }].map(world => {
      const screen = api.toScreen(world), roundTrip = api.toWorld(screen);
      return { world, screen, roundTrip, error: Math.hypot(world.x - roundTrip.x, world.y - roundTrip.y) };
    });
    const canvas = document.querySelector('#game'), box = canvas.getBoundingClientRect();
    return { points, phaser: api.diagnostics().phaser, canvas: { width: canvas.width, height: canvas.height, cssWidth: box.width, cssHeight: box.height } };
  });
  ensure(result.points.every(point => point.error < 1e-7), 'World/CSS projection round-trip changed.');
  ensure(result.phaser.dpr === dpr && Math.abs(result.canvas.width - result.canvas.cssWidth * dpr) <= 1 && Math.abs(result.canvas.height - result.canvas.cssHeight * dpr) <= 1, 'WebGL backing store does not match the requested DPR.');
  return result;
}
async function move(page) {
  const before = await read(page);
  await page.keyboard.down('KeyD');
  try { await page.waitForTimeout(240); } finally { await page.keyboard.up('KeyD'); }
  await nextPaint(page);
  const after = await read(page);
  ensure(after.state.phase === 'playing' && after.state.player.x > before.state.player.x + 5 && after.state.tick > before.state.tick, 'Real keyboard movement did not advance the player.');
  for (const observation of [before, after]) {
    const sprite = observation.diagnostics.phaser.nativeSprites.find(sprite => sprite.id === 'player');
    ensure(sprite && Math.hypot(sprite.x - observation.playerScreen.x, sprite.y - observation.playerScreen.y) < 4, 'Native player sprite lost its projected gameplay position.');
  }
  return { before, after };
}
async function pauseAndResume(page, withAnimation = false) {
  if (withAnimation) {
    await page.keyboard.press('KeyQ');
    await page.waitForFunction(() => window.__viral.diagnostics().phaser.animations.some(animation => animation.key === 'art-scan' && animation.isPlaying));
  }
  await page.keyboard.press('Escape'); await waitPhase(page, 'paused'); await nextPaint(page);
  const before = await read(page); await page.waitForTimeout(280); const after = await read(page);
  ensure(after.state.tick === before.state.tick && after.state.elapsed === before.state.elapsed && JSON.stringify(after.state.player) === JSON.stringify(before.state.player), 'Pause did not freeze simulation.');
  if (withAnimation) {
    const active = before.diagnostics.phaser.animations.filter(animation => animation.key === 'art-scan' && animation.id.startsWith('effect:'));
    ensure(active.length > 0 && active.every(animation => animation.isPaused), 'Pause did not pause the native scan animation.');
    ensure(active.every(animation => after.diagnostics.phaser.animations.some(next => next.id === animation.id && next.frame === animation.frame && next.isPaused)), 'Native scan frames advanced while simulation was paused.');
  }
  await page.locator('[data-action="continue"]').click(); await waitPhase(page, 'playing');
  await page.waitForFunction(tick => window.__viral.snapshot().tick > tick, before.state.tick);
  return { before, after, resumed: await read(page) };
}
async function returnMenu(page) {
  if ((await read(page)).state.phase === 'playing') await page.keyboard.press('Escape');
  await page.locator('[data-action="menu"]').click(); await waitPhase(page, 'menu');
  await page.locator('[data-action="start"]').waitFor({ state: 'visible' });
}
async function scanFrames(page, folder) {
  const before = await read(page), images = [];
  // Screenshot encoding can exceed an entire short animation. Observe actual displayed
  // frames inside the browser while Playwright captures PNGs, without advancing rules.
  const recording = page.evaluate(async () => {
    const samples = [], began = performance.now();
    while (performance.now() - began < 900) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const state = window.__viral.snapshot(), diagnostics = window.__viral.diagnostics();
      samples.push({ tick: state.tick, scans: state.scans, animations: diagnostics.phaser.animations });
    }
    return samples;
  });
  await page.keyboard.press('KeyQ');
  for (let index = 0; index < 3; index++) {
    await nextPaint(page);
    images.push(await screenshot(page, folder, `scan-${index}`, true));
  }
  const samples = await recording;
  const scanObserved = samples.some(sample => sample.scans > before.state.scans);
  const frames = new Set(), framesBySprite = new Map();
  for (const sample of samples) for (const animation of sample.animations ?? []) {
    if (!animation.isPlaying || !/scan|pulse/i.test(String(animation.key ?? animation.animation ?? ''))) continue;
    const frame = String(animation.frame ?? animation.frameName ?? animation.currentFrame);
    frames.add(frame);
    const identity = `${animation.id}:${animation.key}`, displayed = framesBySprite.get(identity) ?? new Set();
    displayed.add(frame); framesBySprite.set(identity, displayed);
  }
  const playingFramesObserved = [...framesBySprite.values()].some(displayed => displayed.size >= 2);
  return { pass: scanObserved && playingFramesObserved, scanObserved, playingFramesObserved, beforeTick: before.state.tick, samples, distinctFrames: [...frames], displayedBySprite: Object.fromEntries([...framesBySprite].map(([id, displayed]) => [id, [...displayed]])), images };
}

try {
  const metadataPath = join(dirname(entry), 'build-meta.json'), gamePath = join(dirname(entry), 'game.js');
  const metadataBytes = await readFile(metadataPath), metadata = JSON.parse(metadataBytes.toString('utf8'));
  report.build = { version: metadata.version, stage: metadata.stage, metadataSha256: sha256(metadataBytes), gameSha256: await hash(gamePath) };
  for (const channel of options.channel === 'all' ? ['chrome', 'msedge'] : [options.channel]) {
    for (const dpr of options.dpr === 'all' ? [1, 2] : [Number(options.dpr)]) {
      const item = { channel, dpr, pass: false, errors: [], consoleErrors: [], failedRequests: [], remoteRequests: [], screenshots: [] };
      report.cases.push(item);
      const folder = join(output, `${channel}-dpr${dpr}`); await mkdir(folder, { recursive: true });
      let browser, context, page;
      try {
        browser = await chromium.launch({ channel, headless: true });
        item.browserVersion = browser.version();
        context = await browser.newContext({ offline: true, viewport: { width: options.width, height: options.height }, deviceScaleFactor: dpr });
        page = await context.newPage();
        page.on('pageerror', error => item.errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') item.consoleErrors.push(message.text()); });
        page.on('requestfailed', request => item.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
        page.on('request', request => { if (/^https?:/i.test(request.url())) item.remoteRequests.push(request.url()); });
        let began = Date.now();
        await page.goto(`${pathToFileURL(entry).href}?seed=7`); item.coldMenu = await boot(page); item.coldBootMs = Date.now() - began;
        item.screenshots.push(await screenshot(page, folder, 'menu'));
        began = Date.now(); await page.reload(); item.warmMenu = await boot(page); item.warmBootMs = Date.now() - began;
        item.menuProjection = await projection(page, dpr);
        await page.locator('[data-action="start"]').click(); await waitPhase(page, 'playing');
        ensure(!!(await read(page)).state.campaign, 'Campaign entry started the wrong mode.');
        item.campaignMovement = await move(page); item.campaignProjection = await projection(page, dpr); item.campaignHud = await hud(page, 'campaign');
        item.screenshots.push(await screenshot(page, folder, 'campaign-playing'), await screenshot(page, folder, 'campaign-canvas', true));
        item.campaignPause = await pauseAndResume(page);
        item.scan = await scanFrames(page, folder);
        ensure(item.scan.pass, 'Real Q must scan and one playing scan sprite must expose at least two displayed animation frames.');
        // A real browser tab transition is observed separately from an OS focus claim.
        const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront(); await page.waitForTimeout(120);
        item.browserTab = await page.evaluate(() => ({ hidden: document.hidden, focused: document.hasFocus(), state: window.__viral.snapshot() }));
        await other.close(); await page.bringToFront();
        if ((await read(page)).state.phase === 'paused') await page.locator('[data-action="continue"]').click();
        ensure((await read(page)).state.phase === 'playing', 'Returning from browser tab left gameplay inaccessible.');
        await returnMenu(page);
        await page.locator('[data-action="endless-start"]').click(); await waitPhase(page, 'playing');
        const endless = await read(page); ensure(!!endless.state.endless && !endless.state.campaign, 'Endless entry leaked campaign state.');
        item.endlessMovement = await move(page); item.endlessHud = await hud(page, 'endless');
        item.screenshots.push(await screenshot(page, folder, 'endless-playing'), await screenshot(page, folder, 'endless-canvas', true));
        await page.setViewportSize({ width: 1100, height: 560 });
        await page.waitForFunction(() => window.__viral.diagnostics().phaser.widthCSS === 1100 && window.__viral.diagnostics().phaser.heightCSS === 560);
        item.compactProjection = await projection(page, dpr); item.compactHud = await hud(page, 'endless');
        item.screenshots.push(await screenshot(page, folder, 'endless-compact'));
        item.endlessPause = await pauseAndResume(page, true); await returnMenu(page);
        await page.locator('[data-action="start"]').click(); await waitPhase(page, 'playing');
        item.returnedCampaignHud = await hud(page, 'campaign');
        ensure(!(await page.locator('.endless-wave-panel').isVisible()), 'Endless HUD remained visible in campaign.');
        item.final = await read(page);
        ensure(!item.errors.length && !item.consoleErrors.length && !item.failedRequests.length && !item.remoteRequests.length, 'Browser reported errors, missing local files or network requests.');
        item.pass = true;
      } catch (error) {
        item.error = error.stack ?? String(error);
        if (page && !page.isClosed()) {
          item.failureState = await read(page).catch(() => null);
          item.screenshots.push(await screenshot(page, folder, 'failure').catch(() => null));
        }
      } finally { if (browser) await browser.close(); }
      await writeFile(join(folder, 'report.json'), JSON.stringify(item, null, 2));
      console.log(JSON.stringify({ channel, dpr, pass: item.pass, error: item.error }));
    }
  }
  report.buildUnchanged = await hash(gamePath) === report.build.gameSha256 && await hash(metadataPath) === report.build.metadataSha256;
  report.dprProjectionChecks = [];
  for (const channel of ['chrome', 'msedge']) {
    const cases = report.cases.filter(item => item.channel === channel && item.menuProjection);
    if (cases.length < 2) continue;
    const first = cases.find(item => item.dpr === 1), second = cases.find(item => item.dpr === 2);
    const errors = first.menuProjection.points.map((point, index) => Math.hypot(point.screen.x - second.menuProjection.points[index].screen.x, point.screen.y - second.menuProjection.points[index].screen.y));
    report.dprProjectionChecks.push({ channel, errors, pass: errors.every(error => error < 1e-7) });
  }
  report.complete = true;
  report.pass = report.cases.length > 0 && report.cases.every(item => item.pass) && report.buildUnchanged && report.dprProjectionChecks.every(item => item.pass);
} catch (error) { report.error = error.stack ?? String(error); }
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, output, error: report.error }));
if (!report.pass) process.exitCode = 1;
