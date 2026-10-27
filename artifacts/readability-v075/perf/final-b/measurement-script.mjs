import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

// Real public-input pressure run for the expanded campaign and moving cells.
// No game state, HP, clock, targets, equipment or phase is written by this host.
const folder = process.env.VI_PERF_OUTPUT ?? 'artifacts/feedback-v060/performance';
const activeTargetSeconds = Number(process.env.VI_PERF_ACTIVE_SECONDS ?? 600);
if (!Number.isFinite(activeTargetSeconds) || activeTargetSeconds < 60) throw Error('VI_PERF_ACTIVE_SECONDS must be at least 60. The default acceptance run is 600 seconds.');
await mkdir(folder, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const measurementSource = await readFile(new URL(import.meta.url));
await writeFile(`${folder}/measurement-script.mjs`, measurementSource);
const driver = await build({ entryPoints: ['tests/e2e/campaignDriver.ts'], bundle: true,
  format: 'esm', platform: 'node', write: false, metafile: true });
const driverSourceManifest = {};
for (const name of Object.keys(driver.metafile.inputs).sort()) driverSourceManifest[name] = hash(await readFile(name));
await writeFile(`${folder}/driver-helper.mjs`, driver.outputFiles[0].contents);
const { walk, aim, readState, chooseDraftInput } = await import(`data:text/javascript;base64,${Buffer.from(driver.outputFiles[0].contents).toString('base64')}`);
const buildMetadata = JSON.parse(await readFile('dist/build-meta.json', 'utf8'));
const gameHash = hash(await readFile('dist/game.js'));
const report = { version: buildMetadata.version, releaseGameJsSha256: gameHash,
  activeTargetSeconds, acceptanceTenMinuteRun: activeTargetSeconds >= 600,
  buildSourceManifest: buildMetadata.sourceManifest, measurementScriptSha256: hash(measurementSource), driverSourceManifest,
  method: 'Local Chrome headless, offline file entry, real DOM inputs and read-only game snapshots. Real beacon draft acquisition; source actors retained. Frame observer writes only its own separate measurement object. No forced GC. Not a human or native foreground-device test.',
  cellHitCountScope: 'Lower bound of unique recent hit events observed at five-second snapshots; not an exact cumulative damage or hit total.',
  status: 'running', errors: [], requests: [], samples: [], maxActors: 0, maxCells: 0, cellHits: 0 };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const frames = { standard: [], low: [] };
let page;
const save = () => writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
const clear = async () => { await page.mouse.up(); for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) await page.keyboard.up(key); };
function firingPosition(state, target) {
  const world = state.world, margin = state.player.radius + 30;
  const candidates = [state.player, ...[160, 240, 310].flatMap(radius => Array.from({ length: 24 }, (_, index) => ({
    x: target.x + Math.cos(index / 24 * Math.PI * 2) * radius,
    y: target.y + Math.sin(index / 24 * Math.PI * 2) * radius,
  })))];
  const segmentGap = (point, obstacle) => {
    const dx = target.x - point.x, dy = target.y - point.y, length = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((obstacle.x - point.x) * dx + (obstacle.y - point.y) * dy) / (length || 1)));
    return Math.hypot(point.x + dx * t - obstacle.x, point.y + dy * t - obstacle.y);
  };
  return candidates.filter(point => point.x >= world.bounds.left + margin && point.x <= world.bounds.right - margin
    && point.y >= world.bounds.top + margin && point.y <= world.bounds.bottom - margin
    && Math.hypot(point.x - target.x, point.y - target.y) <= 310
    && world.obstacles.every(obstacle => Math.hypot(point.x - obstacle.x, point.y - obstacle.y) > obstacle.radius + margin
      && segmentGap(point, obstacle) > obstacle.radius + 2))
    .sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
}
const repair = async s => {
  await clear(); await walk(page, { x: s.tissue.x - 420, y: s.tissue.y + 145 });
  await page.keyboard.press('Digit3'); await aim(page, s.tissue); await page.mouse.down();
  await page.waitForTimeout(800); await page.mouse.up();
};
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, offline: true });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) report.requests.push(request.url()); });
  const cdp = await context.newCDPSession(page);
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=130026&trait=CARAPACE`);
  await page.locator('[data-action="start"]').click();
  const setupDeadline = Date.now() + 100000;
  let lastScan = -10;
  while (true) {
    if (Date.now() > setupDeadline) throw Error('Legal beacon acquisition exceeded the setup budget');
    const s = await readState(page);
    if (s.growth?.draft) {
      await clear(); await chooseDraftInput(page, ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK']); continue;
    }
    if (s.phase !== 'playing') throw Error(`Acquisition stopped: ${s.phase}`);
    if (s.growth.equipped.some(p => p.id === 'IMMUNE_BEACON')) { report.acquired = s; break; }
    if (s.tissue.hp < 65) { await repair(s); continue; }
    if (s.elapsed - lastScan > 3.2) { await page.keyboard.press('KeyQ'); lastScan = s.elapsed; }
    const target = s.targets.filter(t => t.hp > 0 && t.role === 'virus').sort((a, b) =>
      Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
    if (!target) { await page.waitForTimeout(200); continue; }
    const position = firingPosition(s, target);
    if (!position) { await clear(); await page.waitForTimeout(100); continue; }
    if (Math.hypot(position.x - s.player.x, position.y - s.player.y) > 35) {
      report.acquisitionWaypoints ??= [];
      report.acquisitionWaypoints.push({ tick: s.tick, targetId: target.id, target: { x: target.x, y: target.y }, position });
      await clear(); await walk(page, position, 35); continue;
    }
    await page.keyboard.press('Digit1'); await aim(page, target); await page.mouse.down();
    await page.waitForTimeout(180); await page.mouse.up();
  }
  await repair(await readState(page));
  const initial = await readState(page);
  if (initial.targets.filter(t => t.role === 'source' && t.hp > 0).length !== 2) throw Error('Pressure setup lost a source');
  await page.evaluate(() => {
    const probe = { segments: { standard: [], low: [] }, mode: 'standard', last: 0, wasPlaying: false };
    Object.defineProperty(window, '__viFeedbackPerf', { value: probe });
    const overlay = document.getElementById('overlay-host');
    const measure = now => {
      const playing = overlay.childElementCount === 0;
      if (playing && probe.wasPlaying) probe.segments[probe.mode].push(now - probe.last);
      probe.wasPlaying = playing; probe.last = now; requestAnimationFrame(measure);
    }; requestAnimationFrame(measure);
  });
  const drain = async () => {
    const part = await page.evaluate(() => { const p = window.__viFeedbackPerf, result = p.segments; p.segments = { standard: [], low: [] }; return result; });
    for (const mode of ['standard', 'low']) frames[mode].push(...part[mode]);
  };
  const began = Date.now(); let low = false;
  const observedHits = new Set();
  for (;;) {
    if (Date.now() - began > Math.max(180000, activeTargetSeconds * 1500)) throw Error('Active measurement exceeded the wall-clock budget');
    const s = await readState(page), active = s.elapsed - initial.elapsed;
    report.activeSimulationSeconds = active;
    if (s.phase === 'result') throw Error(`Pressure run ended: ${s.result.reason}`);
    if (s.targets.filter(t => t.role === 'source' && t.hp > 0).length !== 2) throw Error('A source was cleared during pressure measurement');
    if (active >= activeTargetSeconds) { report.finalState = s; break; }
    if (s.growth.draft) { await clear(); await page.locator('[data-action="draft-discard"]').click(); continue; }
    if (s.phase === 'paused' && await page.locator('[data-action="close-migration-guide"]').isVisible()) {
      await clear(); await page.locator('[data-action="close-migration-guide"]').click(); continue;
    }
    if (s.phase !== 'playing') throw Error(`Unexpected pressure phase: ${s.phase}`);
    if (!low && active >= activeTargetSeconds / 2) {
      await clear(); await page.keyboard.press('Escape'); await page.locator('[data-action="effects"]').click();
      await page.evaluate(() => { window.__viFeedbackPerf.mode = 'low'; });
      await page.locator('[data-action="continue"]').click(); low = true;
    }
    await page.keyboard.press('Digit3'); await aim(page, s.tissue); await page.mouse.down();
    if (s.elapsed - lastScan > 3.1) { await page.keyboard.press('KeyQ'); lastScan = s.elapsed; }
    const alive = s.targets.filter(t => t.hp > 0).length, cells = s.growth.cells.length;
    report.maxActors = Math.max(report.maxActors, alive); report.maxCells = Math.max(report.maxCells, cells);
    for (const event of s.events) if (event.type === 'PROTOCOL_BEACON_HIT') observedHits.add(`${event.tick}:${event.data.cellId}:${event.data.targetId}`);
    report.cellHits = observedHits.size;
    const heap = await cdp.send('Runtime.getHeapUsage');
    report.samples.push({ wallSeconds: (Date.now() - began) / 1000, activeSimulationSeconds: active,
      tick: s.tick, alive, cells, hp: s.player.hp, tissue: s.tissue.hp, retainedActors: s.targets.length,
      events: s.events.length, effects: s.effects.length, mode: low ? 'low' : 'standard', heap });
    const mode = low ? 'low' : 'standard';
    if (alive === 24 && !report[`dense_${mode}`]) {
      report[`dense_${mode}`] = { tick: s.tick, cells, activeSimulationSeconds: active };
      await page.screenshot({ path: `${folder}/dense-${mode}.png` });
      await writeFile(`${folder}/dense-${mode}-state.json`, JSON.stringify(s));
    }
    if (alive === 24 && cells === 3 && !report.dense_cells) {
      report.dense_cells = { tick: s.tick, mode, activeSimulationSeconds: active };
      await page.screenshot({ path: `${folder}/dense-cells.png` });
      await writeFile(`${folder}/dense-cells-state.json`, JSON.stringify(s));
    }
    await drain(); await save();
    if (report.samples.length % 6 === 0) console.log(JSON.stringify(report.samples.at(-1)));
    await page.waitForTimeout(5000);
  }
  await clear(); await drain();
  const summarize = times => { const sorted = times.slice().sort((a, b) => a - b), sum = times.reduce((a, b) => a + b, 0);
    return { frames: times.length, activeDurationMs: sum, averageFps: times.length * 1000 / sum, p95Ms: sorted[Math.floor((times.length - 1) * .95)], maxMs: sorted.at(-1) }; };
  report.metrics = Object.fromEntries(Object.entries(frames).map(([mode, times]) => [mode, summarize(times)]));
  report.device = { os: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
    memoryBytes: os.totalmem(), browser: browser.version(), mode: 'headless' };
  report.wallDurationMs = Date.now() - began;
  report.sourceUnchanged = gameHash === hash(await readFile('dist/game.js'));
  report.pass = Object.values(report.metrics).every(m => m.averageFps >= 50 && m.p95Ms <= 33)
    && report.maxActors === 24 && report.maxCells === 3 && report.cellHits > 0
    && !!report.dense_standard && !!report.dense_low && !!report.dense_cells
    && !report.errors.length && !report.requests.length && report.sourceUnchanged;
  report.passScope = `${activeTargetSeconds} active-second ${activeTargetSeconds >= 600 ? 'ten-minute-or-longer acceptance-duration' : 'targeted regression; not a ten-minute acceptance'} run. Frame budget and 24 live actors reached in each quality; a real three-cell squad coexists with 24 actors in a captured snapshot and has observed hit events; two sources remain alive including terminal state; no fatal errors/network. Sampled V8 heap trend requires separate review; not a leak-proof or native-device guarantee.`;
  report.status = report.pass ? 'passed' : 'failed';
  // Explicitly separate forced-GC/restart diagnostics from the completed frame
  // measurement above. These later UI actions never enter frames or metrics.
  if (process.env.VI_PERF_POST_MEMORY === '1') {
    report.postMeasurementMemory = { scope: `After the finished ${activeTargetSeconds}-second frame measurement only: real pause/menu/restart inputs, 1.1s settling, three explicit GCs. Not natural-GC throughput or an independent ten-minute run.`, checkpoints: [] };
    const collect = async name => {
      const state = await readState(page);
      if (state.growth?.draft) await page.locator('[data-action="draft-discard"]').click();
      if (await page.locator('[data-action="close-migration-guide"]').isVisible()) await page.locator('[data-action="close-migration-guide"]').click();
      if ((await readState(page)).phase === 'playing') await page.keyboard.press('Escape');
      const frozen = await readState(page), natural = await cdp.send('Runtime.getHeapUsage');
      await page.waitForTimeout(1100);
      for (let n = 0; n < 3; n++) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(60); }
      const collected = await cdp.send('Runtime.getHeapUsage'), dom = await cdp.send('Memory.getDOMCounters');
      const after = await readState(page);
      if (after.tick !== frozen.tick) throw Error('Post-measurement pause did not freeze simulation');
      report.postMeasurementMemory.checkpoints.push({ name, phase: after.phase, tick: after.tick, natural, collected, dom });
    };
    await collect('finished-pressure-paused');
    await page.locator('[data-action="menu"]').click(); await collect('returned-menu');
    for (let n = 1; n <= 10; n++) {
      await page.locator('[data-action="start"]').click(); await page.waitForTimeout(160); await page.keyboard.press('KeyQ');
      const state = await readState(page);
      if (state.growth?.draft) await page.locator('[data-action="draft-discard"]').click();
      if ((await readState(page)).phase === 'playing') await page.keyboard.press('Escape');
      await page.locator('[data-action="menu"]').click();
      if (n === 5 || n === 10) await collect(`menu-after-${n}-restarts`);
    }
  }
  await writeFile(`${folder}/frame-times.json`, JSON.stringify(frames));
  console.log(JSON.stringify({ status: report.status, metrics: report.metrics, maxActors: report.maxActors, maxCells: report.maxCells, cellHits: report.cellHits }));
  if (!report.pass) process.exitCode = 1;
} catch (error) {
  report.status = 'failed'; report.error = error.stack ?? String(error); process.exitCode = 1;
  if (page && !page.isClosed()) { try { report.failureState = await readState(page); await page.screenshot({ path: `${folder}/failed.png` }); } catch {} }
  console.error(report.error);
} finally { await save(); if (page && !page.isClosed()) await clear().catch(() => {}); await browser.close(); }
