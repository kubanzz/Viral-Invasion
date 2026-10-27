import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Separate retention diagnostic: explicit GC and pauses invalidate FPS claims.
// All combat/progression uses actual DOM inputs. No game state or clock writes.
const output = process.env.VI_MEMORY_OUTPUT ?? 'artifacts/memory-v062-baseline';
const duration = Number(process.env.VI_MEMORY_SECONDS ?? 360);
if (!Number.isFinite(duration) || duration < 240 || duration > 1800) throw Error('Duration must be 240–1800 active seconds.');
await mkdir(output, { recursive: true });
const sha = v => createHash('sha256').update(v).digest('hex');
const source = await readFile(new URL(import.meta.url));
await writeFile(`${output}/diagnostic-script.mjs`, source);
const bundle = await build({ entryPoints: ['tests/e2e/campaignDriver.ts'], bundle: true, format: 'esm', platform: 'node', write: false, metafile: true });
const driverSourceManifest = Object.fromEntries(await Promise.all(Object.keys(bundle.metafile.inputs).map(async p => [p, sha(await readFile(p))])));
const { walk, aim, readState, chooseDraftInput } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const metadata = JSON.parse(await readFile('dist/build-meta.json', 'utf8')), gameSha256 = sha(await readFile('dist/game.js'));
const report = { version: metadata.version, gameSha256, buildSourceManifest: metadata.sourceManifest, driverSourceManifest,
  scriptSha256: sha(source), startedAt: new Date().toISOString(), durationTarget: duration, status: 'running',
  scope: 'Separate Chrome headless retained-heap diagnostic with explicit UI pauses, one-second audio settling and three CDP GCs per checkpoint. Not a throughput test, natural-GC memory guarantee, first-player session or universal leak proof. Loaded dist is frozen; source working tree may contain separately identified later UI edits.',
  errors: [], requests: [], samples: [], checkpoints: [], audio: { created: 0, destroyed: 0, byType: {}, activeAtEnd: 0 }, maxActors: 0, maxCells: 0 };
const save = () => writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let page, cdp, lastScan = -10;
const audio = new Map();
const clear = async () => { await page.mouse.up(); for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) await page.keyboard.up(k); };
const counts = s => ({ tick: s.tick, elapsed: s.elapsed, phase: s.phase, actors: s.targets.filter(t => t.hp > 0).length,
  retainedActors: s.targets.length, cells: s.growth?.cells.length, events: s.events.length, effects: s.effects.length,
  hp: s.player.hp, tissue: s.tissue.hp, sourceHp: s.targets.filter(t => t.role === 'source' && t.hp > 0).map(t => t.hp) });
async function checkpoint(name, activeSeconds) {
  await clear();
  const before = await readState(page);
  if (before.phase === 'playing') await page.keyboard.press('Escape');
  const paused = await readState(page);
  const natural = await cdp.send('Runtime.getHeapUsage');
  await page.waitForTimeout(1100);
  for (let n = 0; n < 3; n++) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(60); }
  const collected = await cdp.send('Runtime.getHeapUsage'), dom = await cdp.send('Memory.getDOMCounters');
  const state = await readState(page);
  if (state.tick !== paused.tick) throw Error('Diagnostic pause did not freeze gameplay.');
  const row = { name, activeSeconds, state: counts(state), natural, collected, dom,
    audio: { active: audio.size, types: Object.fromEntries([...new Set(audio.values())].map(type => [type, [...audio.values()].filter(t => t === type).length])) } };
  report.checkpoints.push(row); await save(); console.log(JSON.stringify({ checkpoint: name, activeSeconds, usedAfterGC: collected.usedSize, totalAfterGC: collected.totalSize, dom, audioActive: audio.size }));
  if (before.phase === 'playing') await page.locator('[data-action="continue"]').click();
}
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, offline: true });
  page = await context.newPage(); cdp = await context.newCDPSession(page);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('request', r => { if (/^https?:/i.test(r.url())) report.requests.push(r.url()); });
  try {
    cdp.on('WebAudio.audioNodeCreated', e => { audio.set(e.node.nodeId, e.node.nodeType); report.audio.created++; report.audio.byType[e.node.nodeType] = (report.audio.byType[e.node.nodeType] ?? 0) + 1; });
    cdp.on('WebAudio.audioNodeWillBeDestroyed', e => { audio.delete(e.nodeId); report.audio.destroyed++; });
    await cdp.send('WebAudio.enable'); report.audio.available = true;
  } catch (e) { report.audio.available = false; report.audio.error = String(e); }
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=130026&trait=CARAPACE`);
  await checkpoint('fresh-menu', 0);
  await page.locator('[data-action="start"]').click();
  const repair = async s => {
    await clear(); await walk(page, { x: s.tissue.x - 420, y: s.tissue.y + 145 });
    await page.keyboard.press('Digit3'); await aim(page, s.tissue); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  };
  const setupDeadline = Date.now() + 100000;
  while (true) {
    if (Date.now() > setupDeadline) throw Error('Legal beacon acquisition exceeded setup budget');
    const s = await readState(page);
    if (s.growth?.draft) { await clear(); await chooseDraftInput(page, ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK']); continue; }
    if (s.phase !== 'playing') throw Error(`Acquisition stopped: ${s.phase}`);
    if (s.growth.equipped.some(p => p.id === 'IMMUNE_BEACON')) break;
    if (s.tissue.hp < 65) { await repair(s); continue; }
    if (s.elapsed - lastScan > 3.2) { await page.keyboard.press('KeyQ'); lastScan = s.elapsed; }
    const target = s.targets.filter(t => t.hp > 0 && t.role === 'virus').sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
    if (!target) { await page.waitForTimeout(200); continue; }
    if (Math.hypot(target.x - s.player.x, target.y - s.player.y) > 310) { await clear(); await walk(page, { x: target.x - 130, y: target.y + 120 }, 45); continue; }
    await page.keyboard.press('Digit1'); await aim(page, target); await page.mouse.down(); await page.waitForTimeout(180); await page.mouse.up();
  }
  await repair(await readState(page));
  const initial = await readState(page), began = Date.now(); let next = 120;
  if (counts(initial).sourceHp.length !== 2) throw Error('A source was lost during setup');
  report.initial = counts(initial);
  while (true) {
    if (Date.now() - began > (duration + 200) * 1000) throw Error('Active diagnostic exceeded wall budget');
    const s = await readState(page), active = s.elapsed - initial.elapsed;
    if (s.phase === 'result') throw Error(`Pressure ended: ${s.result.reason}`);
    if (counts(s).sourceHp.length !== 2) throw Error('Pressure lost a source');
    if (s.growth.draft) { await clear(); await page.locator('[data-action="draft-discard"]').click(); continue; }
    if (s.phase === 'paused' && await page.locator('[data-action="close-migration-guide"]').isVisible()) { await clear(); await page.locator('[data-action="close-migration-guide"]').click(); continue; }
    if (s.phase !== 'playing') throw Error(`Unexpected pressure phase: ${s.phase}`);
    const c = counts(s); report.maxActors = Math.max(report.maxActors, c.actors); report.maxCells = Math.max(report.maxCells, c.cells);
    report.samples.push({ activeSeconds: active, ...c, heap: await cdp.send('Runtime.getHeapUsage'), audioActive: audio.size });
    if (active >= next && ((c.actors === 24 && c.cells === 3) || active >= next + 35)) {
      await checkpoint(`pressure-${next}`, active); next += 120;
    }
    if (active >= duration && next > duration) { report.final = c; break; }
    await page.keyboard.press('Digit3'); await aim(page, s.tissue); await page.mouse.down();
    if (s.elapsed - lastScan > 3.1) { await page.keyboard.press('KeyQ'); lastScan = s.elapsed; }
    await save(); await page.waitForTimeout(5000);
  }
  await clear(); await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
  await checkpoint('returned-menu', duration);
  for (let n = 1; n <= 10; n++) {
    await page.locator('[data-action="start"]').click(); await page.waitForTimeout(160); await page.keyboard.press('KeyQ');
    await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
    if (n === 5 || n === 10) await checkpoint(`menu-after-${n}-restarts`, duration);
  }
  report.audio.activeAtEnd = audio.size;
  report.sourceUnchanged = gameSha256 === sha(await readFile('dist/game.js'));
  report.status = report.sourceUnchanged && report.maxActors === 24 && report.maxCells === 3 && !report.errors.length && !report.requests.length ? 'completed' : 'failed';
  report.acceptance = 'Measurement completion only. Interpret retained heap, audio nodes and DOM counters separately; no automatic leak-free or full M16-04 pass.';
  if (report.status !== 'completed') process.exitCode = 1;
} catch (e) { report.status = 'failed'; report.error = e.stack ?? String(e); console.error(report.error); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await save(); await browser.close(); }
console.log(JSON.stringify({ status: report.status, version: report.version, output, checkpoints: report.checkpoints.length, audio: report.audio }));
