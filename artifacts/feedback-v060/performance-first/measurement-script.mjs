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
  buildSourceManifest: buildMetadata.sourceManifest, measurementScriptSha256: hash(measurementSource), driverSourceManifest,
  method: 'Local Chrome headless, offline file entry, real DOM inputs and read-only game snapshots. Real beacon draft acquisition; source actors retained. Frame observer writes only its own separate measurement object. No forced GC. Not a human or native foreground-device test.',
  status: 'running', errors: [], requests: [], samples: [], maxActors: 0, maxCells: 0, cellHits: 0 };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const frames = { standard: [], low: [] };
let page;
const save = () => writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
const clear = async () => { await page.mouse.up(); for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) await page.keyboard.up(key); };
const repair = async s => {
  await clear(); await walk(page, { x: s.tissue.x - 110, y: s.tissue.y + 50 });
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
    if (Math.hypot(target.x - s.player.x, target.y - s.player.y) > 310) {
      await clear(); await walk(page, { x: target.x - 130, y: target.y + 120 }, 45); continue;
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
    if (Date.now() - began > 900000) throw Error('Ten active minutes exceeded the wall-clock budget');
    const s = await readState(page), active = s.elapsed - initial.elapsed;
    report.activeSimulationSeconds = active;
    if (active >= 600) break;
    if (s.phase === 'result') throw Error(`Pressure run ended: ${s.result.reason}`);
    if (s.growth.draft) { await clear(); await page.locator('[data-action="draft-discard"]').click(); continue; }
    if (!low && active >= 300) {
      await clear(); await page.keyboard.press('Escape'); await page.locator('[data-action="effects"]').click();
      await page.evaluate(() => { window.__viFeedbackPerf.mode = 'low'; });
      await page.locator('[data-action="continue"]').click(); low = true;
    }
    await page.keyboard.press('Digit3'); await aim(page, s.tissue); await page.mouse.down();
    if (s.elapsed - lastScan > 3.1) { await page.keyboard.press('KeyQ'); lastScan = s.elapsed; }
    const alive = s.targets.filter(t => t.hp > 0).length, cells = s.growth.cells.length;
    report.maxActors = Math.max(report.maxActors, alive); report.maxCells = Math.max(report.maxCells, cells);
    for (const event of s.events) if (event.type === 'PROTOCOL_BEACON_HIT') observedHits.add(`${event.tick}:${event.data.cellId}:${event.data.id}`);
    report.cellHits = observedHits.size;
    if (s.targets.filter(t => t.role === 'source' && t.hp > 0).length !== 2) throw Error('A source was cleared during pressure measurement');
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
    && !report.errors.length && !report.requests.length && report.sourceUnchanged;
  report.passScope = 'Frame budget in each quality, 24 live actors reached, real three-cell squad with actual hits, two live sources, no fatal errors/network. Sampled V8 heap trend requires separate review; not a leak-proof or native-device guarantee.';
  report.status = report.pass ? 'passed' : 'failed';
  await writeFile(`${folder}/frame-times.json`, JSON.stringify(frames));
  console.log(JSON.stringify({ status: report.status, metrics: report.metrics, maxActors: report.maxActors, maxCells: report.maxCells, cellHits: report.cellHits }));
  if (!report.pass) process.exitCode = 1;
} catch (error) {
  report.status = 'failed'; report.error = error.stack ?? String(error); process.exitCode = 1;
  if (page && !page.isClosed()) { try { report.failureState = await readState(page); await page.screenshot({ path: `${folder}/failed.png` }); } catch {} }
  console.error(report.error);
} finally { await save(); if (page && !page.isClosed()) await clear().catch(() => {}); await browser.close(); }
