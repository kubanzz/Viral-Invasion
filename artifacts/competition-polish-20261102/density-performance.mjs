import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run separately from builds and other browser jobs. Only read-only diagnostics
// and real DOM mouse/keyboard inputs interact with the game.
const directory = resolve('artifacts/competition-polish-20261102');
const entry = pathToFileURL(resolve('dist/index.html')).href;
const reportPath = resolve(directory, 'density-performance-report.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = page => page.evaluate(() => window.__viral.snapshot());
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const specs = [
  { name: 'density-desktop-1366x768', width: 1366, height: 768, touch: false },
  { name: 'density-touch-layout-844x390', width: 844, height: 390, touch: true },
];

class Movement {
  held = new Set();
  constructor(page) { this.page = page; }
  async move(dx, dy) {
    const length = Math.hypot(dx, dy) || 1;
    const desired = [Math.abs(dx / length) > .383 ? dx > 0 ? 'KeyD' : 'KeyA' : '',
      Math.abs(dy / length) > .383 ? dy > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const key of this.held) if (!desired.includes(key)) { await this.page.keyboard.up(key); this.held.delete(key); }
    for (const key of desired) if (!this.held.has(key)) { await this.page.keyboard.down(key); this.held.add(key); }
  }
  async release() { for (const key of this.held) await this.page.keyboard.up(key); this.held.clear(); }
}

function clearSegment(a, b, world) {
  const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
  return world.obstacles.every(obstacle => {
    const t = Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / (squared || 1)));
    return Math.hypot(a.x + dx * t - obstacle.x, a.y + dy * t - obstacle.y) > obstacle.radius + 38;
  });
}
function route(from, goal, world) {
  if (clearSegment(from, goal, world)) return goal;
  const candidates = world.obstacles.flatMap(obstacle => Array.from({ length: 12 }, (_, index) => {
    const angle = index / 12 * Math.PI * 2;
    return { x: obstacle.x + Math.cos(angle) * (obstacle.radius + 65), y: obstacle.y + Math.sin(angle) * (obstacle.radius + 65) };
  })).filter(point => point.x > world.bounds.left + 40 && point.x < world.bounds.right - 40
    && point.y > world.bounds.top + 40 && point.y < world.bounds.bottom - 40 && clearSegment(from, point, world));
  return candidates.sort((a, b) => distance(from, a) + distance(a, goal) - distance(from, b) - distance(b, goal))[0] ?? goal;
}

class CentralCircle {
  index;
  constructor(state) {
    const centre = { x: state.tissue.x, y: state.tissue.y - 40 };
    this.points = Array.from({ length: 20 }, (_, index) => {
      const angle = index / 20 * Math.PI * 2;
      return { x: centre.x + Math.cos(angle) * 230, y: centre.y + Math.sin(angle) * 230 };
    });
    if (!this.points.every(point => point.x > state.world.bounds.left + 40 && point.x < state.world.bounds.right - 40
      && point.y > state.world.bounds.top + 40 && point.y < state.world.bounds.bottom - 40
      && state.world.obstacles.every(obstacle => distance(point, obstacle) > obstacle.radius + state.player.radius + 15))) {
      throw new Error('The read-only central-circle planner found an unsafe waypoint; no world/player state was modified.');
    }
    this.index = this.points.reduce((best, point, index) => distance(state.player, point) < distance(state.player, this.points[best]) ? index : best, 0);
  }
  async move(state, movement) {
    if (distance(state.player, this.points[this.index]) < 38) this.index = (this.index + 1) % this.points.length;
    const goal = route(state.player, this.points[this.index], state.world);
    await movement.move(goal.x - state.player.x, goal.y - state.player.y);
  }
}

async function aim(page, target) {
  const point = await page.evaluate(target => {
    const player = window.__viral.toScreen(window.__viral.snapshot().player), screen = window.__viral.toScreen(target);
    const dx = screen.x - player.x, dy = screen.y - player.y;
    const fit = Math.min(1, dx > 0 ? (innerWidth - 20 - player.x) / dx : dx < 0 ? (20 - player.x) / dx : 1,
      dy > 0 ? (innerHeight - 25 - player.y) / dy : dy < 0 ? (70 - player.y) / dy : 1);
    return { x: player.x + dx * Math.max(.05, fit), y: player.y + dy * Math.max(.05, fit) };
  }, target);
  await page.mouse.move(point.x, point.y);
}

async function startFire(page) {
  // Begin capture on the canvas near the hero, away from HUD/control buttons.
  const point = await page.evaluate(() => window.__viral.toScreen(window.__viral.snapshot().player));
  await page.mouse.move(point.x + 12, point.y - 8); await page.mouse.down();
}

async function reachSecondWave(page, report, movement) {
  const deadline = Date.now() + 150000;
  let firing = false, circle;
  try {
    while (Date.now() < deadline) {
      const state = await read(page);
      if (!circle) circle = new CentralCircle(state);
      if (state.phase === 'result') throw new Error(`First-wave run ended: ${state.result?.reason}`);
      if (state.endless.wave === 2) {
        report.waveOne = { cleared: state.endless.clearedWaves, elapsed: state.elapsed, kills: state.endless.kills,
          hp: state.player.hp, tissue: state.tissue.hp, chosen: state.endlessGrowth.ranks };
        expect(state.endless.clearedWaves).toBe(1);
        expect(state.endlessGrowth.ranks.multishot).toBe(1);
        expect(state.growth.cells?.filter(cell => (cell.hp ?? 1) > 0).length ?? 0).toBe(0);
        return circle;
      }
      if (state.endlessGrowth?.draft) {
        await page.mouse.up(); firing = false; await movement.release();
        const choice = state.endlessGrowth.draft.options.find(option => option.id === 'multishot');
        if (!choice) throw new Error('First-wave multishot was not offered.');
        await page.locator('[data-action="endless-upgrade"][data-upgrade="multishot"]').click();
        continue;
      }
      if (state.phase !== 'playing') throw new Error(`Unexpected first-wave phase: ${state.phase}`);
      const alive = state.targets.filter(target => target.hp > 0 && target.role !== 'event');
      const target = alive.sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
      if (target) {
        await page.keyboard.press('Digit1');
        if (!firing) { await startFire(page); firing = true; }
        await aim(page, target);
      } else if (firing) { await page.mouse.up(); firing = false; }
      await circle.move(state, movement);
      await page.waitForTimeout(90);
    }
    throw new Error('Natural first wave did not complete within 150 seconds wall time.');
  } finally { await page.mouse.up(); }
}

async function beginFrameProbe(page) {
  await page.evaluate(() => {
    const probe = { active: true, started: performance.now(), last: null, frames: [], handle: 0 };
    window.__densityFrameProbe = probe;
    const frame = now => {
      if (!probe.active) return;
      if (probe.last !== null) probe.frames.push(now - probe.last);
      probe.last = now; probe.handle = requestAnimationFrame(frame);
    };
    probe.handle = requestAnimationFrame(frame);
  });
}

async function finishFrameProbe(page) {
  return page.evaluate(() => {
    const probe = window.__densityFrameProbe;
    if (!probe) return null;
    probe.active = false; cancelAnimationFrame(probe.handle);
    return { wallSeconds: (performance.now() - probe.started) / 1000, frames: probe.frames };
  });
}

async function holdDensity(page, report, movement, circle) {
  await page.mouse.up(); await page.keyboard.press('Digit1');
  const deadline = Date.now() + 90000;
  let collecting = false, collectionStart = 0;
  report.populationSamples = []; report.maximumAlive = 0;
  while (Date.now() < deadline) {
    const state = await read(page);
    const alive = state.targets.filter(target => target.hp > 0 && target.role !== 'event').length;
    report.maximumAlive = Math.max(report.maximumAlive, alive);
    if (state.phase !== 'playing' || state.endless.wave !== 2) throw new Error(`Density run left wave 2: phase=${state.phase}, wave=${state.endless.wave}, reason=${state.result?.reason ?? ''}`);
    if (alive > 48) throw new Error(`Population exceeded 48: ${alive}`);
    await circle.move(state, movement);
    if (!collecting && alive === 48) {
      report.densityStart = { tick: state.tick, elapsed: state.elapsed, alive, hp: state.player.hp, tissue: state.tissue.hp };
      report.screenshot = resolve(directory, `${report.name}-48-alive.png`);
      await page.screenshot({ path: report.screenshot });
      // The screenshot operation is excluded from the frame-measurement window.
      await beginFrameProbe(page); collectionStart = Date.now(); collecting = true;
    }
    if (collecting) {
      report.populationSamples.push({ elapsed: state.elapsed, alive, hp: state.player.hp, tissue: state.tissue.hp });
      if (Date.now() - collectionStart >= 12000) {
        const probe = await finishFrameProbe(page), frames = probe.frames, sorted = [...frames].sort((a, b) => a - b);
        const sum = frames.reduce((total, value) => total + value, 0);
        report.frames = { count: frames.length, sampledWallSeconds: probe.wallSeconds, accumulatedFrameSeconds: sum / 1000,
          meanMs: sum / frames.length, p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)], maxMs: sorted.at(-1),
          fpsFromMean: 1000 * frames.length / sum, rawFrameIntervalsMs: frames };
        report.populationRange = { min: Math.min(...report.populationSamples.map(sample => sample.alive)), max: Math.max(...report.populationSamples.map(sample => sample.alive)) };
        expect(report.frames.accumulatedFrameSeconds).toBeGreaterThanOrEqual(10);
        expect(report.populationRange.min).toBe(48); expect(report.populationRange.max).toBe(48);
        return;
      }
    }
    await page.waitForTimeout(120);
  }
  throw new Error(`Could not naturally reach and observe 48 bodies; maximum=${report.maximumAlive}.`);
}

await mkdir(directory, { recursive: true });
const gameJsSha256 = hash(await readFile(resolve('dist/game.js')));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const reports = [];
try {
  for (const spec of specs) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.touch, deviceScaleFactor: 1 });
    await context.setOffline(true);
    const page = await context.newPage(), movement = new Movement(page);
    const report = { ...spec, gameJsSha256, method: 'Natural first-wave shooting; choose multishot; cease all firing and circle using real held WASD during wave 2. No unit, HP, position, equipment or clock injection.',
      limits: 'Windows Chrome headless only. Touch case verifies the rendered touch layout under keyboard/mouse drive; it is not mobile hardware, thermal or multitouch evidence.', errors: [] };
    reports.push(report);
    page.on('pageerror', error => report.errors.push(error.message));
    const started = Date.now();
    try {
      await page.goto(`${entry}?seed=71${spec.touch ? '&mobile=1' : ''}`);
      await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
      report.layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, touch: document.body.classList.contains('touch-mode'), dpr: devicePixelRatio }));
      expect(report.layout.touch).toBe(spec.touch);
      await page.locator('[data-action="endless-start"]').click();
      const circle = await reachSecondWave(page, report, movement);
      await holdDensity(page, report, movement, circle);
      expect(report.errors).toEqual([]);
      report.pass = true;
    } catch (error) {
      report.pass = false; report.failure = error.stack ?? String(error);
      report.partialFrames = await finishFrameProbe(page).catch(() => null);
      await page.screenshot({ path: resolve(directory, `${spec.name}-failure.png`) }).catch(() => {});
    } finally {
      report.wallSeconds = (Date.now() - started) / 1000;
      await movement.release(); await page.mouse.up().catch(() => {});
      await context.close();
      await writeFile(reportPath, JSON.stringify({ gameJsSha256, reports }, null, 2));
      console.log(JSON.stringify({ name: report.name, pass: report.pass, maximumAlive: report.maximumAlive,
        populationRange: report.populationRange, frames: report.frames ? { ...report.frames, rawFrameIntervalsMs: undefined } : undefined, failure: report.failure }));
    }
  }
} finally {
  await browser.close();
  const finalGameJsSha256 = hash(await readFile(resolve('dist/game.js')));
  await writeFile(reportPath, JSON.stringify({ gameJsSha256, finalGameJsSha256, buildUnchanged: finalGameJsSha256 === gameJsSha256, reports }, null, 2));
  if (finalGameJsSha256 !== gameJsSha256 || reports.some(report => !report.pass)) process.exitCode = 1;
}
