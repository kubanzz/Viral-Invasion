import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Fresh cases use real production controls and read-only diagnostics throughout.
// Legacy/economy cases install an explicitly labelled profile only before load.
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const entry = option('--entry') ? pathToFileURL(resolve(option('--entry'))).href : option('--url') ?? 'http://127.0.0.1:4173';
const output = resolve(option('--out') ?? 'artifacts/camp-building-20261106/acceptance');
const configs = [{ name: 'desktop-1366x768', width: 1366, height: 768, touch: false },
  { name: 'touch-844x390', width: 844, height: 390, touch: true }, { name: 'touch-667x320', width: 667, height: 320, touch: true }]
  .filter(config => !option('--case') || config.name === option('--case'));
assert.ok(configs.length, 'Known --case');
await mkdir(output, { recursive: true });
const sourcePaths = ['src/main.ts', 'src/meta/campProfile.ts', 'src/game/types.ts', 'src/game/campProgression.ts', 'src/game/campLayout.ts',
  'src/game/campScene.ts', 'src/game/campAttention.ts', 'src/render/campMarkers.ts', 'src/render/campCamera.ts', 'src/render/campVisuals.ts',
  'src/render/canvasScene.ts', 'src/render/phaserRenderer.ts', 'src/render/sceneLabels.ts', 'src/render/campArt.ts', 'src/render/artPresentation.ts', 'src/ui/campHud.ts', 'src/ui/camp.css'];
const hashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const runtimeEntryPath = new URL(entry).protocol === 'file:' ? fileURLToPath(new URL(entry)) : undefined;
const runtimePaths = runtimeEntryPath ? [runtimeEntryPath, join(dirname(runtimeEntryPath), 'game.js'), join(dirname(runtimeEntryPath), 'game.css')] : [];
const runtimeHashes = async () => Object.fromEntries(await Promise.all(runtimePaths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const report = { startedAt: new Date().toISOString(), entry, pass: false, cases: [], fixtures: [], sourceAtStart: await hashes(),
  passBasis: runtimeEntryPath ? 'Frozen runtime artifact hashes; workspace source hashes are informational.' : 'Live source hashes remain unchanged throughout execution.',
  ...(runtimeEntryPath ? { runtimeAtStart: await runtimeHashes() } : {}),
  scope: 'Fresh arrival, five individually confirmed constructions, mid-construction reload, all-side building/marker input, and isolated legacy/economy marker fixtures. No combat completion is claimed.',
  constraints: { freshStorageFixtures: false, simulationWrites: false, clockAcceleration: false, teleportation: false, fixtureWrites: 'Initial context storage only; separately labelled cases.' } };
const helper = await build({ stdin: { contents: "export {emptyCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout,isCampPositionLegal} from './src/game/campLayout';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function makeCase(config, kind, fixture) {
  const result = { ...config, kind, scope: fixture ? 'Explicit initial storage fixture; actual production DOM input after load.' : 'Fresh context, natural controls; no storage or simulation writes.', walks: [], observations: [], screenshots: [], errors: [], pass: false };
  (fixture ? report.fixtures : report.cases).push(result);
  const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, hasTouch: config.touch, isMobile: config.touch, deviceScaleFactor: 1 });
  if (fixture) await context.addInitScript(({ key, json }) => { if (sessionStorage.getItem('camp-acceptance-fixture') !== 'installed') { localStorage.setItem(key, json); sessionStorage.setItem('camp-acceptance-fixture', 'installed'); } }, { key: model.CAMP_PROFILE_STORAGE_KEY, json: JSON.stringify(fixture) });
  const page = await context.newPage(), cdp = await context.newCDPSession(page), held = new Set(); let touching = false;
  page.on('pageerror', error => result.errors.push(error.message));
  const snapshot = () => page.evaluate(() => window.__viral.snapshot());
  const profile = () => page.evaluate(() => window.__viral.campProfile().data);
  const diagnostics = () => page.evaluate(() => window.__viral.diagnostics());
  async function move(dx, dy) {
    const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    if (!config.touch) {
      const next = new Set([...(dx < -.2 ? ['a'] : dx > .2 ? ['d'] : []), ...(dy < -.2 ? ['w'] : dy > .2 ? ['s'] : [])]);
      for (const key of held) if (!next.has(key)) { await page.keyboard.up(key); held.delete(key); }
      for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
      return;
    }
    const box = await page.locator('[data-stick="move"]').boundingBox(); assert.ok(box, 'Production touch movement stick');
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (!touching) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...center, radiusX: 4, radiusY: 4, force: 1 }] }); touching = true; }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: center.x + dx * 36, y: center.y + dy * 36, radiusX: 4, radiusY: 4, force: 1 }] });
  }
  async function release() {
    for (const key of held) await page.keyboard.up(key); held.clear();
    if (touching) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); touching = false; }
  }
  async function activate(selector) {
    const node = page.locator(selector).filter({ visible: true }).first(); await node.waitFor({ state: 'visible', timeout: 8000 });
    if (config.touch) await node.tap(); else await node.click();
  }
  async function load() {
    const url = new URL(entry); url.searchParams.set('seed', '20261106'); if (config.touch) url.searchParams.set('mobile', '1');
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__viral && !document.getElementById('app').inert, undefined, { timeout: 60000 }); await page.bringToFront();
  }
  async function enterCamp() {
    const unlocked = page.locator('[data-action="camp-open"]').filter({ visible: true });
    if (await unlocked.count()) await activate('[data-action="camp-open"]'); else await activate('[data-action="endless-start"]');
    await page.waitForFunction(() => !!window.__viral.snapshot().camp && window.__viral.snapshot().phase === 'playing');
  }
  async function capture(name) { const file = `${config.name}-${kind}-${name}.png`; await page.screenshot({ path: join(output, file) }); result.screenshots.push(file); }
  async function walkRelative(points, tolerance = 9) {
    const origin = model.campLayout(await snapshot()).origin;
    for (const point of points) {
      const target = { x: origin.x + point.x, y: origin.y + point.y }, started = Date.now(); let state = await snapshot(), still = 0, steps = 0, recaptures = 0;
      while (distance(state.player, target) > tolerance) {
        assert.ok(Date.now() - started < 16000, `Natural walking deadline ${JSON.stringify({ point, player: state.player })}`);
        assert.equal(state.phase, 'playing'); assert.ok(state.camp);
        const dx = target.x - state.player.x, dy = target.y - state.player.y;
        await move(Math.abs(dx) > 4 ? dx : 0, Math.abs(dy) > 4 ? dy : 0);
        await page.waitForTimeout(Math.min(100, Math.max(30, (distance(state.player, target) - 5) / 235 * 1000)));
        const next = await snapshot(); still = distance(state.player, next.player) < .2 ? still + 1 : 0;
        if (config.touch && still >= 3 && recaptures < 2) {
          const capture = await page.evaluate(() => ({ held: document.querySelector('#mobile-controls')?.dataset.pointerHeld,
            active: document.querySelector('[data-stick="move"]')?.dataset.active, knob: document.querySelector('[data-stick="move"] .stick-knob')?.style.translate,
            focused: document.hasFocus() }));
          if (capture.held === 'false' || capture.active === 'false') {
            await release(); recaptures++; still = 0;
            result.observations.push({ action: 'lift-and-repress-reset-touch-stick', point, capture });
          }
        }
        assert.ok(still < 12, `Natural movement blocked ${JSON.stringify({ point, player: next.player })}`);
        assert.ok(model.isCampPositionLegal(next.player, next.player.radius, model.campLayout(next)), 'Player remains in legal production geometry');
        state = next; steps++;
      }
      await release(); await page.waitForTimeout(35); result.walks.push({ point, steps, player: (await snapshot()).player });
    }
    await page.waitForTimeout(180);
  }
  async function target(id) {
    await page.waitForFunction(id => window.__viral.diagnostics().campTargets?.some(target => target.id === id), id, { timeout: 10000 });
    return (await diagnostics()).campTargets.find(target => target.id === id);
  }
  const rect = value => value?.rect ?? value?.bounds ?? value;
  async function clickTarget(id, part = 'label') {
    const item = await target(id); assert.ok(item.eligible, `Near enough to interact with ${id}`);
    const labels = Array.isArray(item.labels) ? item.labels : item.label ? [item.label] : [];
    const body = rect(item.body), candidates = part === 'label' ? labels.map(rect) : [];
    if (body) candidates.push(part === 'roof' ? { left: body.left + (body.right - body.left) * .35, right: body.right - (body.right - body.left) * .35, top: body.top + 8, bottom: body.top + Math.min(30, (body.bottom - body.top) * .25) } : body);
    let selected;
    for (const box of candidates) {
      if (!box || !Number.isFinite(box.left) || !Number.isFinite(box.top)) continue;
      const point = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
      if (point.x < 5 || point.x > config.width - 5 || point.y < 5 || point.y > config.height - 5) continue;
      const canvas = await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.tagName === 'CANVAS', point);
      if (canvas) { selected = point; break; }
    }
    assert.ok(selected, `Visible ${part} canvas target for ${id}: ${JSON.stringify(item)}`);
    if (config.touch) await page.touchscreen.tap(selected.x, selected.y); else await page.mouse.click(selected.x, selected.y);
    result.observations.push({ action: 'real-target-click', id, part, selected, target: item });
  }
  async function close() { await activate('[data-action="camp-close"]'); await page.waitForFunction(() => window.__viral.snapshot().phase === 'playing'); }
  async function openBuilt(id, part = 'label') {
    await clickTarget(id, part); const section = id === 'departure' ? 'missions' : id;
    await page.locator(`.camp-nav [data-section="${section}"][aria-current="page"]`).waitFor({ timeout: 6000 });
    assert.equal((await snapshot()).phase, 'paused');
  }
  async function construct(id, options = {}) {
    const before = await profile(), wallet = data => ({ coins: data.coins, materials: data.materials, cores: data.cores, fragments: data.fragments });
    if (options.keyboard) await page.keyboard.press('e'); else await clickTarget(id);
    if ((await snapshot()).camp.activeConstruction !== id) {
      await page.locator(`[data-build-site="${id}"]`).waitFor({ timeout: 6000 });
      await activate(`[data-action="camp-build"][data-station="${id}"]`);
    }
    await page.waitForFunction(id => window.__viral.snapshot().camp?.activeConstruction === id, id);
    if (options.reload) {
      const before = await profile(); assert.equal(before.builtFacilities.length, 2); assert.equal(before.activeConstruction, id);
      await capture('mid-third-construction'); await release(); await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__viral && !document.getElementById('app').inert, undefined, { timeout: 60000 });
      const restored = await profile(); assert.deepEqual(restored.builtFacilities, before.builtFacilities); assert.equal(restored.activeConstruction, id);
      await enterCamp(); await activate('[data-action="camp-skip-construction"]');
      result.observations.push({ action: 'refresh-restored-two-completed-and-active-third', before: before.builtFacilities, after: restored.builtFacilities, active: restored.activeConstruction });
    }
    await page.waitForFunction(id => window.__viral.snapshot().camp?.builtFacilities?.includes(id) && !window.__viral.snapshot().camp?.activeConstruction, id, { timeout: 10000 });
    assert.deepEqual(wallet(await profile()), wallet(before), 'Intro construction does not consume the initial wallet');
    await capture(`built-${id}`);
  }
  async function finish() { assert.deepEqual(result.errors, []); result.pass = true; }
  async function dispose() { await release(); await context.close(); await writeFile(join(output, `${config.name}-${kind}.json`), JSON.stringify(result, null, 2)); }
  return { result, page, snapshot, profile, diagnostics, load, enterCamp, activate, capture, walkRelative, target, clickTarget, close, openBuilt, construct, finish, dispose };
}

async function freshCase(config) {
  const c = await makeCase(config, 'fresh');
  try {
    await c.load(); assert.equal((await c.profile()).campUnlocked, false); await c.enterCamp();
    assert.equal((await c.snapshot()).camp.prologue, 'arrival'); await c.capture('arrival');
    await c.walkRelative([{ x: 0, y: 145 }]); await c.activate('[data-action="camp-establish"]');
    await c.page.waitForFunction(() => window.__viral.snapshot().camp?.prologue === 'building');
    assert.deepEqual((await c.snapshot()).camp.builtFacilities, []);
    await c.walkRelative([{ x: -200, y: 100 }, { x: -200, y: -20 }, { x: -386, y: -20 }]); await c.construct('warehouse');
    await c.walkRelative([{ x: -205, y: -20 }, { x: -205, y: 222 }, { x: -350, y: 222 }]); await c.construct('forge', { keyboard: !config.touch });
    await c.walkRelative([{ x: -205, y: 222 }, { x: -205, y: 100 }, { x: -95, y: 100 }, { x: 100, y: 100 }, { x: 100, y: -40 }, { x: 220, y: -40 }, { x: 250, y: 0 }, { x: 335, y: 0 }]);
    await c.construct('shop', { reload: true });
    await c.walkRelative([{ x: 100, y: 270 }, { x: 100, y: -40 }, { x: 220, y: -40 }, { x: 220, y: -85 }]); await c.construct('summon');
    await c.walkRelative([{ x: 220, y: -40 }, { x: 100, y: -40 }, { x: 100, y: 250 }, { x: 205, y: 250 }, { x: 205, y: 340 }, { x: 335, y: 340 }]); await c.construct('departure');
    await c.page.waitForFunction(() => window.__viral.snapshot().camp?.prologue === 'ready');
    const ready = await c.snapshot(), profile = await c.profile(); assert.equal(ready.camp.builtFacilities.length, 5);
    assert.equal(ready.camp.attention?.departure?.kind, 'mission'); assert.ok(!profile.seenMissionIds.includes('membrane'));
    await c.capture('ready-new-intelligence');
    await c.openBuilt('departure', 'label'); await c.close();
    assert.equal((await c.snapshot()).camp.attention?.departure, undefined, 'Viewing new intelligence clears its unread marker');
    await c.walkRelative([{ x: 205, y: 340 }, { x: 205, y: 250 }, { x: 100, y: 250 }, { x: 100, y: 100 }, { x: -205, y: 100 }, { x: -205, y: -110 }, { x: -220, y: -110 }]);
    await c.openBuilt('warehouse', 'roof'); await c.capture('warehouse-side-roof-open'); await c.close();
    await c.walkRelative([{ x: -205, y: -110 }, { x: -205, y: -190 }, { x: -350, y: -190 }]);
    await c.openBuilt('warehouse', 'roof'); await c.capture('warehouse-rear-roof-open');
    const paused = await c.snapshot(); await c.page.keyboard.down('d'); await c.page.waitForTimeout(220); await c.page.keyboard.up('d'); const held = await c.snapshot();
    assert.equal(held.elapsed, paused.elapsed); assert.equal(distance(held.player, paused.player), 0); await c.close();
    await c.finish(); console.log(JSON.stringify({ kind: 'fresh', case: config.name, pass: true }));
  } catch (error) { c.result.failure = error.stack ?? String(error); await c.capture('failure').catch(() => {}); throw error; }
  finally { await c.dispose(); }
}

async function legacyCase(config) {
  const fixture = model.emptyCampProfile(); Object.assign(fixture, { schemaVersion: 2, campUnlocked: true, campIntroSeen: true, prologue: 'ready', legacyMigrationChecked: true, materials: 17, coins: 321 });
  for (const key of ['builtFacilities', 'activeConstruction', 'seenMissionIds', 'seenEquipmentQuality']) delete fixture[key];
  const c = await makeCase(config, 'legacy-v2-fixture', fixture);
  try {
    await c.load(); await c.enterCamp(); const restored = await c.profile(), state = await c.snapshot();
    assert.equal(restored.schemaVersion, 3); assert.equal(restored.builtFacilities.length, 5); assert.equal(restored.materials, 17); assert.equal(restored.coins, 321);
    assert.equal(state.camp.prologue, 'ready'); assert.equal(state.camp.attention?.departure, undefined); assert.equal(state.camp.attention?.warehouse, undefined);
    assert.ok((await c.diagnostics()).campTargets.every(target => target.built)); await c.capture('existing-camp-preserved'); await c.finish();
    console.log(JSON.stringify({ kind: 'legacy-v2-fixture', case: config.name, pass: true }));
  } catch (error) { c.result.failure = error.stack ?? String(error); throw error; } finally { await c.dispose(); }
}

async function economyCase(config) {
  const fixture = model.emptyCampProfile(); Object.assign(fixture, { campUnlocked: true, campIntroSeen: true, prologue: 'ready', legacyMigrationChecked: true,
    builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure'], materials: 10, fragments: { steady: 5 } });
  fixture.inventory.push({ id: 'fixture:new-piercing', templateId: 'piercing', kind: 'weapon', rarity: 'blue', repaired: true }); fixture.weapons.piercing.repaired = 'blue';
  const c = await makeCase(config, 'economy-fixture', fixture);
  try {
    await c.load(); await c.enterCamp(); let state = await c.snapshot();
    assert.equal(state.camp.attention.forge.kind, 'craft'); assert.equal(state.camp.attention.warehouse.kind, 'equipment'); assert.equal(state.camp.attention.departure.kind, 'mission');
    await c.capture('three-actionable-markers');
    await c.walkRelative([{ x: 0, y: 100 }, { x: -205, y: 100 }, { x: -205, y: 222 }, { x: -350, y: 222 }]);
    await c.openBuilt('forge'); await c.close(); assert.equal((await c.snapshot()).camp.attention.forge.kind, 'craft', 'Viewing an affordable recipe does not dismiss its action marker');
    await c.openBuilt('forge'); await c.activate('[data-action="camp-craft"][data-template="steady"][data-rarity="blue"]'); await c.close();
    state = await c.snapshot(); assert.equal(state.camp.attention.forge, undefined, 'Craft marker disappears when materials are consumed'); assert.equal(state.camp.attention.warehouse.kind, 'equipment');
    await c.walkRelative([{ x: -205, y: 222 }, { x: -205, y: -20 }, { x: -386, y: -20 }]);
    await c.openBuilt('warehouse'); await c.close(); assert.equal((await c.snapshot()).camp.attention.warehouse, undefined, 'Viewing new equipment clears its unread marker');
    await c.capture('action-markers-updated'); await c.finish(); console.log(JSON.stringify({ kind: 'economy-fixture', case: config.name, pass: true }));
  } catch (error) { c.result.failure = error.stack ?? String(error); await c.capture('failure').catch(() => {}); throw error; } finally { await c.dispose(); }
}

try {
  const kinds = { fresh: freshCase, 'legacy-v2-fixture': legacyCase, 'economy-fixture': economyCase };
  if (option('--kind')) assert.ok(kinds[option('--kind')], 'Known --kind');
  for (const config of configs) for (const [kind, run] of Object.entries(kinds)) if (!option('--kind') || kind === option('--kind')) await run(config);
  report.sourceAtEnd = await hashes(); report.sourcesStable = JSON.stringify(report.sourceAtStart) === JSON.stringify(report.sourceAtEnd);
  if (runtimeEntryPath) {
    report.runtimeAtEnd = await runtimeHashes(); report.runtimeStable = JSON.stringify(report.runtimeAtStart) === JSON.stringify(report.runtimeAtEnd);
    assert.ok(report.runtimeStable, 'Exact file-entry runtime artifacts remain unchanged throughout execution');
    if (!report.sourcesStable) report.sourceDriftNote = 'Workspace source changed while testing the frozen file-entry runtime. Passing cases apply to the recorded runtime bytes; they do not attest to the changed workspace source.';
  } else assert.ok(report.sourcesStable, 'Acceptance source files remain unchanged throughout execution');
  report.pass = true;
} catch (error) { report.failure = error.stack ?? String(error); console.error(report.failure); process.exitCode = 1; }
finally {
  await browser.close(); report.sourceAtEnd ??= await hashes();
  report.sourcesStable = JSON.stringify(report.sourceAtStart) === JSON.stringify(report.sourceAtEnd);
  if (runtimeEntryPath) { report.runtimeAtEnd ??= await runtimeHashes(); report.runtimeStable = JSON.stringify(report.runtimeAtStart) === JSON.stringify(report.runtimeAtEnd); }
  report.completedAt = new Date().toISOString(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, pass: report.pass, cases: report.cases.length, fixtures: report.fixtures.length }));
}
