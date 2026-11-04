import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = process.env.VI_TERRITORY_URL ?? pathToFileURL(resolve('dist/index.html')).href;
const output = resolve(process.env.VI_TERRITORY_PERF_OUTPUT ?? 'artifacts/territory-20261103/performance');
const SAMPLE_SECONDS = 15, SETUP_DEADLINE_SECONDS = 120, GATHER_DEADLINE_SECONDS = 45;
const MINIMUM_DENSITY = 40, TARGET_DENSITY = 48, REQUIRED_HIGH_DENSITY_SECONDS = 12;
const cases = [{ name: 'desktop-standard', width: 1366, height: 768, low: false, touch: false },
  { name: 'desktop-low', width: 1366, height: 768, low: true, touch: false },
  { name: 'touch-layout-standard', width: 844, height: 390, low: false, touch: true },
  { name: 'touch-layout-low', width: 844, height: 390, low: true, touch: true }];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = ['src/game/territory.ts', 'src/game/session.ts', 'src/game/endless.ts', 'src/game/battle.ts',
  'src/render/phaserRenderer.ts', 'src/render/phaserHost.ts', 'src/render/canvasScene.ts', 'src/render/fantasyLandscape.ts',
  'src/ui/territoryHud.ts', 'src/ui/territory.css', 'asserts/art-selection.json'];
async function sourceHashes() {
  const result = {};
  for (const path of sourcePaths) try { result[path] = sha256(await readFile(path)); } catch { /* Optional renderer module names may change. */ }
  return result;
}
async function outputIdentity() {
  if (!entry.startsWith('file:')) return { entry, hashes: {}, build: null, scope: 'HTTP entry; no local-binary identity inferred.' };
  const filename = fileURLToPath(new URL(entry)), folder = dirname(filename), hashes = {};
  let build = null;
  for (const path of [filename, resolve(folder, 'game.js'), resolve(folder, 'build-meta.json')]) {
    try {
      const bytes = await readFile(path); hashes[path] = sha256(bytes);
      if (path.endsWith('build-meta.json')) build = JSON.parse(bytes.toString('utf8'));
    } catch { /* Single-HTML entries can be measured without sibling files. */ }
  }
  return { entry, hashes, build };
}
const sourceBefore = await sourceHashes(), before = await outputIdentity();
const scriptSha256 = sha256(await readFile(new URL(import.meta.url)));
const report = {
  entry, scriptSha256, sourceBefore, before, startedAt: new Date().toISOString(),
  method: 'Chrome headless, real production entry and held mouse/keyboard only. Clear first wave naturally; choose a real upgrade; cease firing and kite during wave 2. rAF sampling reads __viral.snapshot()/toScreen() only. No actor, HP, time, inventory, seed or storage writes.',
  scope: 'Desktop Windows browser and a touch HUD layout driven by keyboard/mouse; not phone hardware or a natural touch full run. Snapshot polling, navigation inputs and rAF observation overhead are included in measured frame times. No forced GC.',
  settings: { source: 'Actual pause-menu effects button', sampleSeconds: SAMPLE_SECONDS, setupDeadlineSeconds: SETUP_DEADLINE_SECONDS,
    gatherDeadlineSeconds: GATHER_DEADLINE_SECONDS, targetDensity: TARGET_DENSITY, minimumDensity: MINIMUM_DENSITY,
    requiredHighDensitySeconds: REQUIRED_HIGH_DENSITY_SECONDS, dpr: 1 },
  cases: [], pass: false,
};
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ checked: true, browserStarted: false, entry, output, scriptSha256, settings: report.settings, cases }));
  process.exit(0);
}
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'measurement-script.mjs'), await readFile(new URL(import.meta.url)));
const save = async () => writeFile(resolve(output, 'performance-report.json'), JSON.stringify(report, null, 2));
const read = page => page.evaluate(() => window.__viral.snapshot());
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const live = state => state.targets.filter(target => target.hp > 0 && target.role !== 'event').length;
class Movement {
  held = new Set();
  constructor(page) { this.page = page; }
  async move(x, y) {
    const length = Math.hypot(x, y) || 1;
    const keys = [Math.abs(x / length) > .383 ? x > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(y / length) > .383 ? y > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const key of this.held) if (!keys.includes(key)) { await this.page.keyboard.up(key); this.held.delete(key); }
    for (const key of keys) if (!this.held.has(key)) { await this.page.keyboard.down(key); this.held.add(key); }
  }
  async release() { for (const key of this.held) await this.page.keyboard.up(key); this.held.clear(); }
}
function clearSegment(a, b, world) {
  const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
  return world.obstacles.every(obstacle => {
    const t = Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / (squared || 1)));
    return Math.hypot(a.x + dx * t - obstacle.x, a.y + dy * t - obstacle.y) >= obstacle.radius + 38;
  });
}
function waypoint(from, goal, world) {
  if (clearSegment(from, goal, world)) return goal;
  return world.obstacles.flatMap(obstacle => Array.from({ length: 16 }, (_, index) => ({
    x: obstacle.x + Math.cos(index / 16 * Math.PI * 2) * (obstacle.radius + 65),
    y: obstacle.y + Math.sin(index / 16 * Math.PI * 2) * (obstacle.radius + 65),
  }))).filter(point => point.x > world.bounds.left + 35 && point.x < world.bounds.right - 35
    && point.y > world.bounds.top + 35 && point.y < world.bounds.bottom - 35 && clearSegment(from, point, world))
    .sort((a, b) => distance(from, a) + distance(a, goal) - distance(from, b) - distance(b, goal))[0] ?? goal;
}
async function orbit(state, movement) {
  const center = { x: state.tissue.x, y: state.tissue.y - 40 }, radius = 230;
  const angle = Math.atan2(state.player.y - center.y, state.player.x - center.x);
  const goal = { x: center.x + Math.cos(angle + .4) * radius, y: center.y + Math.sin(angle + .4) * radius };
  const point = waypoint(state.player, goal, state.world);
  await movement.move(point.x - state.player.x, point.y - state.player.y);
}
async function aim(page, target) {
  const point = await page.evaluate(target => {
    const player = window.__viral.toScreen(window.__viral.snapshot().player), to = window.__viral.toScreen(target), dx = to.x - player.x, dy = to.y - player.y;
    const compact = innerWidth <= 1024 || innerHeight <= 600;
    const left = compact ? 145 : 285, right = innerWidth - (compact ? 140 : 255), top = compact ? 95 : 100, bottom = innerHeight - (compact ? 95 : 145);
    const factor = Math.min(1, dx > 0 ? (right - player.x) / dx : dx < 0 ? (left - player.x) / dx : 1,
      dy > 0 ? (bottom - player.y) / dy : dy < 0 ? (top - player.y) / dy : 1);
    return { x: player.x + dx * Math.max(.04, factor), y: player.y + dy * Math.max(.04, factor) };
  }, target);
  await page.mouse.move(point.x, point.y);
}
async function sampleFrames(page) {
  return page.evaluate(async settings => {
    const started = performance.now(), frames = []; let last;
    await new Promise(resolve => {
      const frame = now => {
        const state = window.__viral.snapshot(), alive = state.targets.filter(target => target.hp > 0 && target.role !== 'event');
        const reserved = state.targets.reduce((sum, target) => sum + (target.hp > 0
          ? target.role !== 'source' && target.role !== 'core' && target.role !== 'capsule' && target.traits?.includes('FISSION') && (target.generation ?? 0) === 0 ? 2 : 1
          : target.splitAt !== undefined ? target.splitPositions?.length ?? 2 : 0), 0);
        const visible = alive.filter(target => { const point = window.__viral.toScreen(target); return point.x >= -target.radius && point.x <= innerWidth + target.radius
          && point.y >= -100 && point.y <= innerHeight + target.radius; }).length;
        if (last !== undefined) frames.push({ dt: now - last, elapsed: state.elapsed, phase: state.phase, wave: state.endless?.wave,
          alive: alive.length, reserved, visible, hp: state.player.hp, coreHp: state.tissue.hp, hidden: document.hidden });
        last = now;
        if (now - started >= settings.sampleSeconds * 1000) resolve(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const intervals = frames.map(frame => frame.dt).sort((a, b) => a - b), total = frames.reduce((sum, frame) => sum + frame.dt, 0);
    const percentile = p => intervals[Math.max(0, Math.ceil(intervals.length * p) - 1)] ?? null;
    const densityFrames = frames.filter(frame => frame.alive >= settings.minimumDensity && frame.phase === 'playing' && frame.wave === 2);
    const densityDuration = densityFrames.reduce((sum, frame) => sum + frame.dt, 0);
    return { frames, count: frames.length, durationSeconds: total / 1000,
      simulationSeconds: frames.length > 1 ? frames.at(-1).elapsed - frames[0].elapsed : 0,
      averageFps: total > 0 ? frames.length * 1000 / total : null, meanMs: frames.length ? total / frames.length : null,
      p95Ms: percentile(.95), maxMs: intervals.at(-1) ?? null,
      minAlive: Math.min(...frames.map(frame => frame.alive)), maxAlive: Math.max(...frames.map(frame => frame.alive)),
      minVisible: Math.min(...frames.map(frame => frame.visible)), maxVisible: Math.max(...frames.map(frame => frame.visible)),
      maxReserved: Math.max(...frames.map(frame => frame.reserved)),
      highDensitySeconds: densityDuration / 1000, highDensityFps: densityDuration > 0 ? densityFrames.length * 1000 / densityDuration : null,
      at48Seconds: frames.filter(frame => frame.alive === 48).reduce((sum, frame) => sum + frame.dt, 0) / 1000,
      allCombatWave2: frames.every(frame => frame.phase === 'playing' && frame.wave === 2), hiddenFrames: frames.filter(frame => frame.hidden).length };
  }, { sampleSeconds: SAMPLE_SECONDS, minimumDensity: MINIMUM_DENSITY });
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
report.browserVersion = browser.version();
try {
  for (const configuration of cases) {
    const own = { ...configuration, errors: [], setupEvents: [], setupSamples: [], pass: false, status: 'setup' };
    report.cases.push(own); await save(); console.log(JSON.stringify({ name: own.name, status: 'setup' }));
    const context = await browser.newContext({ viewport: { width: own.width, height: own.height }, deviceScaleFactor: 1, hasTouch: own.touch });
    if (entry.startsWith('file:')) await context.setOffline(true);
    const page = await context.newPage(), movement = new Movement(page), seen = new Set();
    let mouseHeld = false, lastSample = -Infinity;
    page.on('pageerror', error => own.errors.push(error.message));
    const started = Date.now(), stopFire = async () => { if (mouseHeld) { await page.mouse.move(10, 10); await page.mouse.up(); mouseHeld = false; } };
    const observe = state => {
      for (const event of state.events) {
        if (!['ENDLESS_WAVE_CLEARED', 'COMBAT_UPGRADE_COMMITTED', 'RUN_STARTED', 'RUN_ENDED'].includes(event.type)) continue;
        const key = JSON.stringify(event); if (!seen.has(key)) { seen.add(key); own.setupEvents.push(event); }
      }
      if (state.elapsed - lastSample >= 2) { lastSample = state.elapsed; own.setupSamples.push({ tick: state.tick, elapsed: state.elapsed,
        wave: state.endless.wave, phase: state.phase, alive: live(state), hp: state.player.hp, coreHp: state.tissue.hp }); }
    };
    try {
      const url = new URL(entry); url.searchParams.set('seed', '71'); await page.goto(url.href);
      await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true'); await page.locator('[data-action="endless-start"]').click();
      expect((await read(page)).territory).toBeTruthy();
      await page.keyboard.press('Escape'); await expect.poll(async () => (await read(page)).phase).toBe('paused');
      const button = page.locator('[data-action="effects"]:visible').first(); await expect(button).toBeVisible();
      const wasLow = (await button.innerText()).includes('低'); if (wasLow !== own.low) await button.click();
      await expect(page.locator('[data-action="effects"]:visible').first()).toContainText(own.low ? '低' : '标准');
      own.effectsButton = await page.locator('[data-action="effects"]:visible').first().innerText();
      expect(own.effectsButton.includes('低')).toBe(own.low);
      await page.locator('[data-action="continue"]:visible').click();
      await page.screenshot({ path: resolve(output, `${own.name}-opening.png`) });
      while (Date.now() - started < SETUP_DEADLINE_SECONDS * 1000) {
        const state = await read(page); observe(state);
        if (state.phase === 'result') throw Error(`Natural first-wave setup failed: ${state.result?.reason}`);
        if (state.endlessGrowth?.draft) {
          await stopFire(); await movement.release();
          const selected = state.endlessGrowth.draft.options.find(option => option.id === 'multishot') ?? state.endlessGrowth.draft.options[0];
          own.upgrade = { wave: state.endlessGrowth.draft.wave, id: selected.id };
          await page.locator(`[data-action="endless-upgrade"][data-upgrade="${selected.id}"]`).click();
          break;
        }
        await orbit(state, movement);
        const target = state.targets.filter(target => target.hp > 0 && target.role !== 'event').sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
        if (target) { await aim(page, target); if (!mouseHeld) { await page.mouse.down(); mouseHeld = true; } }
        else await stopFire();
        await page.waitForTimeout(85);
      }
      expect(own.upgrade?.wave, 'Must clear first wave naturally before the pressure sample').toBe(1);
      await stopFire(); own.status = 'gathering'; const gatherStarted = Date.now(); let best = 0;
      while (Date.now() - gatherStarted < GATHER_DEADLINE_SECONDS * 1000) {
        const state = await read(page); observe(state);
        if (state.phase !== 'playing' || state.endless.wave > 2) throw Error(`Natural density gathering stopped: phase=${state.phase}, wave=${state.endless.wave}`);
        best = Math.max(best, live(state));
        if (state.endless.wave === 2 && live(state) >= TARGET_DENSITY) { own.densityStart = { elapsed: state.elapsed, wave: 2, alive: live(state), hp: state.player.hp, coreHp: state.tissue.hp }; break; }
        await orbit(state, movement); await page.waitForTimeout(85);
      }
      const densityState = await read(page); own.bestGatherAlive = best;
      if (!own.densityStart) own.densityStart = { elapsed: densityState.elapsed, wave: densityState.endless.wave, alive: live(densityState), hp: densityState.player.hp, coreHp: densityState.tissue.hp };
      expect(own.densityStart.wave).toBe(2); expect(own.densityStart.alive, 'Did not naturally reach minimum high density; deadline was not extended').toBeGreaterThanOrEqual(MINIMUM_DENSITY);
      await page.screenshot({ path: resolve(output, `${own.name}-density-before.png`) });
      own.status = 'sampling'; await save(); console.log(JSON.stringify({ name: own.name, status: 'sampling', density: own.densityStart }));
      let samplingDone = false;
      const sampling = sampleFrames(page).finally(() => { samplingDone = true; });
      while (!samplingDone) {
        const state = await read(page); await orbit(state, movement); await page.waitForTimeout(85);
      }
      own.sample = await sampling; own.finalState = await read(page);
      await page.screenshot({ path: resolve(output, `${own.name}-density-after.png`) });
      expect(own.sample.count).toBeGreaterThan(0); expect(own.sample.durationSeconds).toBeGreaterThanOrEqual(SAMPLE_SECONDS - .5);
      expect(own.sample.simulationSeconds, 'The actual simulation must advance throughout the sample').toBeGreaterThanOrEqual(SAMPLE_SECONDS - 1);
      expect(own.sample.allCombatWave2).toBe(true); expect(own.sample.hiddenFrames).toBe(0);
      expect(own.sample.highDensitySeconds, 'Minimum 40-body density was not maintained for the stated target').toBeGreaterThanOrEqual(REQUIRED_HIGH_DENSITY_SECONDS);
      expect(own.sample.maxAlive).toBeLessThanOrEqual(48); expect(own.sample.maxReserved).toBeLessThanOrEqual(48); expect(own.errors).toEqual([]);
      own.pass = true; own.status = 'complete';
    } catch (error) {
      own.status = 'failed'; own.failure = error.stack ?? String(error); own.finalState = await read(page).catch(() => null);
      await page.screenshot({ path: resolve(output, `${own.name}-failure.png`) }).catch(() => {});
    } finally {
      await stopFire().catch(() => {}); await movement.release().catch(() => {}); own.wallSeconds = (Date.now() - started) / 1000;
      await context.close(); await save();
      console.log(JSON.stringify({ name: own.name, pass: own.pass, status: own.status, wallSeconds: own.wallSeconds,
        fps: own.sample?.averageFps, p95Ms: own.sample?.p95Ms, maxMs: own.sample?.maxMs,
        highDensitySeconds: own.sample?.highDensitySeconds, at48Seconds: own.sample?.at48Seconds, failure: own.failure }));
    }
  }
} finally {
  report.sourceAfter = await sourceHashes(); report.sourcesUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(report.sourceAfter);
  report.after = await outputIdentity(); report.outputsUnchanged = JSON.stringify(before.hashes) === JSON.stringify(report.after.hashes);
  report.finishedAt = new Date().toISOString(); report.pass = report.cases.length === cases.length && report.cases.every(own => own.pass) && report.outputsUnchanged;
  await save(); await browser.close();
}
console.log(JSON.stringify({ pass: report.pass, output, cases: report.cases.map(own => ({ name: own.name, pass: own.pass,
  fps: own.sample?.averageFps, p95Ms: own.sample?.p95Ms, maxMs: own.sample?.maxMs, minAlive: own.sample?.minAlive,
  maxAlive: own.sample?.maxAlive, highDensitySeconds: own.sample?.highDensitySeconds, at48Seconds: own.sample?.at48Seconds })),
  sourcesUnchanged: report.sourcesUnchanged, outputsUnchanged: report.outputsUnchanged }));
if (!report.pass) process.exitCode = 1;
