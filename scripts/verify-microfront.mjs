import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Production entry + real inputs. Supplied economy saves are explicitly isolated
// from the fresh-player route. No live simulation, clock or actor writes occur.
const option = name => process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
let baseUrl = option('--url') ?? 'http://127.0.0.1:4173';
const output = resolve(option('--out') ?? 'artifacts/microfront-20261106');
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), baseUrl,
  scope: 'Fresh arrival/building/assignment/real combat withdrawal, plus separately supplied schema2 economy fixtures. Native sprite, ground draw and UI image observations verify actual installed assets; root visual approval remains separate. Natural full mission victory is outside this browser run.',
  artAcceptance: false, cases: [], pageErrors: [], pass: false };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const runtime = JSON.parse(await readFile('.art-generated/art-runtime.json', 'utf8'));
const intakePath = 'artifacts/microfront-20261106/art-intake.json', intakeBytes = await readFile(intakePath), intake = JSON.parse(intakeBytes);
const sourceAssets = [];
assert.equal(intake.assets.length, 19, 'the installed intake contains nineteen supplied sources');
for (const asset of intake.assets) {
  assert.equal(sha(await readFile(join('asserts', asset.path))), asset.sha256, `source file matches intake: ${asset.key}`);
  const runtimeIds = asset.runtimeIds.filter(id => runtime.assets[id] || runtime.environments[id]);
  assert.ok(runtimeIds.length > 0, `intake source has runtime bindings: ${asset.key}`);
  for (const id of runtimeIds) {
    const selected = runtime.assets[id] ?? runtime.environments[id];
    assert.equal(selected.source, asset.path, `runtime source binding: ${id}`); assert.equal(selected.sourceSha256, asset.sha256, `runtime source digest: ${id}`);
  }
  sourceAssets.push({ key: asset.key, path: asset.path, sha256: asset.sha256, runtimeIds });
}
report.artSourceInventory = { intakePath, intakeSha256: sha(intakeBytes), count: sourceAssets.length, runtimeSignature: runtime.inputSignature, sources: sourceAssets, rootApprovalPending: true };
const groundIds = ['fantasy.camp.ground.workshop', 'fantasy.camp.ground.supply', 'fantasy.camp.ground.departure'];
const groundImages = groundIds.map(id => { assert.ok(runtime.environments[id]?.dataUri, `selected courtyard ground: ${id}`); return { id, uri: runtime.environments[id].dataUri }; });
const selectedSource = id => { const asset = runtime.assets[id] ?? runtime.environments[id]; return { id, source: asset.source, sourceSha256: asset.sourceSha256 }; };
async function installGroundObservation(context) {
  await context.addInitScript(images => {
    const ids = new Map(images.map(image => [image.uri, image.id])), cache = new WeakMap(), seen = {};
    window.__microfrontGroundObservations = seen;
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      const returned = Reflect.apply(original, this, [image, ...args]);
      try {
        let id = cache.get(image); if (id === undefined) { id = ids.get(image.currentSrc || image.src) || null; cache.set(image, id); }
        if (id && args.length === 4) { const record = seen[id] ??= { count: 0, width: image.naturalWidth, height: image.naturalHeight, calls: [] }; record.count++; if (record.calls.length < 3) record.calls.push(args); }
      } catch { /* Observing a draw never changes its inputs or result. */ }
      return returned;
    };
  }, groundImages);
}
const helper = await build({ stdin: { contents: "export {emptyCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {TEMPLATE_IDS,MODULE_IDS} from './src/game/microfront';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const fixture = model.emptyCampProfile();
Object.assign(fixture, { prologue: 'ready', campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true,
  coins: 20000, materials: 500, cores: 8, fragments: Object.fromEntries(model.TEMPLATE_IDS.map(id => [id, 80])),
  completedMissions: ['membrane', 'corridor', 'boundary'] });
await writeFile(join(output, 'economy-fixture.json'), JSON.stringify({ scope: 'Explicit supplied schema2 economy resources. No earned mission victory or normal progression is claimed.', profile: fixture }, null, 2));
report.sources = Object.fromEntries(await Promise.all(['src/main.ts', 'src/game/campScene.ts', 'src/game/microfront.ts', 'src/meta/campProfile.ts', 'src/ui/campHud.ts'].map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
if (process.argv.includes('--snapshot')) {
  const directory = join(output, 'current-build'); await mkdir(directory, { recursive: true });
  await build({ entryPoints: ['src/main.ts'], bundle: true, outdir: directory, entryNames: 'game', format: 'iife', target: 'chrome110', minify: true, legalComments: 'none' });
  const css = await readFile(join(directory, 'game.css'), 'utf8');
  const html = (await readFile('index.html', 'utf8')).replace('<!-- STYLES -->', `<style>${css}</style>`).replace('<script type="module" src="/src/main.ts"></script>', '<script src="./game.js"></script>');
  const entry = join(directory, 'index.html'); await writeFile(entry, html); baseUrl = pathToFileURL(entry).href;
  report.baseUrl = baseUrl; report.frozenProductionEntry = true;
}
if (baseUrl.startsWith('file:')) {
  const path = fileURLToPath(new URL(baseUrl)), html = await readFile(path);
  report.productionEntry = { path, bytes: html.length, sha256: sha(html), scripts: [] };
  for (const match of html.toString('utf8').matchAll(/<script[^>]*src="([^"]+)"/g)) {
    const url = new URL(match[1], baseUrl); assert.equal(url.protocol, 'file:');
    const bytes = await readFile(fileURLToPath(url)); report.productionEntry.scripts.push({ path: fileURLToPath(url), bytes: bytes.length, sha256: sha(bytes) });
  }
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const configurations = [{ name: 'desktop-1366x768', width: 1366, height: 768, touch: false },
  { name: 'touch-844x390', width: 844, height: 390, touch: true }, { name: 'touch-667x320', width: 667, height: 320, touch: true }]
  .filter(config => !option('--case') || config.name === option('--case'));

const snapshot = page => page.evaluate(() => window.__viral.snapshot());
const profile = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), model.CAMP_PROFILE_STORAGE_KEY);
async function activate(page, touch, selector) {
  const target = page.locator(selector).filter({ visible: true }).first();
  await target.waitFor({ state: 'visible', timeout: 10000 });
  if (touch) await target.tap(); else await target.click();
}
async function loaded(page, config) {
  const url = new URL(baseUrl); url.searchParams.set('seed', '20261105');
  if (config.touch) url.searchParams.set('mobile', '1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__viral && !document.getElementById('app').inert, { timeout: 60000 });
  await page.bringToFront();
}
async function screenshot(page, name, record) {
  const file = `${record.name}-${record.scope}-${name}.png`;
  await page.screenshot({ path: join(output, file) }); record.screenshots.push(file);
}
async function panelLayout(page, record, section) {
  const measurements = await page.evaluate(() => {
    const rect = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null; };
    const content = document.querySelector('.camp-content');
    return { panel: rect('.camp-panel'), footer: rect('.camp-footer'), content: rect('.camp-content'), width: innerWidth, height: innerHeight,
      scrollHeight: content?.scrollHeight, clientHeight: content?.clientHeight, bodyWidth: document.documentElement.scrollWidth };
  });
  assert.ok(measurements.content?.height > 20, `${section}: panel retains a usable scroll area`);
  assert.ok(measurements.panel.left >= -1 && measurements.panel.right <= measurements.width + 1, `${section}: horizontal panel bounds`);
  assert.ok(measurements.footer.bottom <= measurements.height + 1, `${section}: footer remains reachable`);
  assert.ok(measurements.bodyWidth <= measurements.width + 1, `${section}: no document horizontal overflow`);
  record.layouts.push({ section, ...measurements });
}
async function observeCampArt(page, record, point) {
  await page.waitForTimeout(180);
  const observed = await page.evaluate(() => {
    const d = window.__viral.diagnostics();
    return { version: window.__viral.version, artSignature: d.art.signature, nativeSprites: d.phaser.nativeSprites.filter(sprite => sprite.id.startsWith('camp:') || sprite.id === 'tissue'),
      actorSources: d.art.actorFrames.filter(frame => String(frame.entityId).startsWith('camp:')).map(frame => ({ entityId: frame.entityId, frame: frame.frame, native: frame.native, fallback: frame.fallback, visible: frame.visible, source: frame.source })),
      fantasyGround: d.art.fantasyGround, nativeTerrain: d.phaser.rasterDimensions.find(layer => layer.id === 'fantasy-terrain'),
      courtyardDraws: window.__microfrontGroundObservations };
  });
  assert.equal(observed.artSignature, runtime.inputSignature, 'production entry embeds this verified runtime art signature');
  for (const id of ['warehouse', 'forge', 'shop', 'departure', 'summon']) {
    const sprite = observed.nativeSprites.find(sprite => sprite.id === `camp:${id}`);
    assert.equal(sprite?.frame, `microfront.camp.${id}`, `production camp uses actual ${id} source`);
    assert.equal(sprite.visible, true, `native ${id} sprite is visible`);
  }
  const tissue = observed.nativeSprites.find(sprite => sprite.id === 'tissue'); assert.equal(tissue?.frame, 'fantasy.core.healthy'); assert.equal(tissue.visible, true);
  assert.equal(observed.nativeTerrain?.visible, true);
  for (const id of groundIds) assert.ok(observed.courtyardDraws[id]?.count > 0, `actual drawImage calls use new ${id} texture`);
  assert.ok(observed.fantasyGround.imageIds.includes('fantasy.floor.healthy'));
  observed.sources = [...observed.nativeSprites.map(sprite => selectedSource(sprite.frame)), ...observed.fantasyGround.imageIds.map(selectedSource), ...groundIds.map(selectedSource)];
  assert.ok(observed.sources.every(asset => asset.source.startsWith('ViralInvasion_Microfront_v1/')));
  record.artObservations.push({ point, ...observed, nativeAssetsVerified: true });
}
async function observeUiArt(page, record, ids, point) {
  await page.waitForFunction(ids => ids.every(id => {
    const element = document.querySelector(`[data-camp-art="${id}"]`);
    return element && element.getBoundingClientRect().width > 0 && getComputedStyle(element).backgroundImage.includes('data:image/png;base64,');
  }), ids, { timeout: 10000 });
  const images = await page.evaluate(async ids => {
    const result = [];
    for (const id of ids) {
      const element = document.querySelector(`[data-camp-art="${id}"]`), style = element && getComputedStyle(element), background = style?.backgroundImage ?? '';
      const match = /data:image\/png;base64,([^"')\s]+)/.exec(background);
      let imageSha256;
      if (match) { const bytes = Uint8Array.from(atob(match[1]), char => char.charCodeAt(0)); imageSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join(''); }
      const bounds = element?.getBoundingClientRect();
      result.push({ id, pngDataImage: !!match, imageSha256, imageBytes: match ? Math.floor(match[1].length * .75) : 0,
        backgroundPosition: style?.backgroundPosition, backgroundSize: style?.backgroundSize, width: bounds?.width, height: bounds?.height });
    }
    return result;
  }, ids);
  const runtimeIds = { 'gold-antibody': 'microfront.gold-antibody', 'model-fragment': 'microfront.fragment', 'forge-core': 'microfront.forge-core' };
  for (const image of images) {
    assert.ok(image.pngDataImage && image.width > 0 && image.height > 0, `actual PNG background is installed for ${image.id}`);
    image.source = selectedSource(runtimeIds[image.id]);
    const asset = runtime.assets[runtimeIds[image.id]], atlas = runtime.atlases.find(atlas => atlas.key === asset.atlas);
    const atlasDigest = sha(Buffer.from(atlas.dataUri.split(',')[1], 'base64'));
    assert.equal(image.imageSha256, atlasDigest, `UI ${image.id} uses its selected runtime atlas`); image.runtimeAtlasVerified = true;
  }
  record.artObservations.push({ point, uiImages: images, nativeAssetsVerified: true });
}
function movement(page, config, cdp) {
  const held = new Set(); let contact = false;
  return {
    async move(dx, dy) {
      const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
      if (!config.touch) {
        const next = new Set([...(dx < -.2 ? ['a'] : dx > .2 ? ['d'] : []), ...(dy < -.2 ? ['w'] : dy > .2 ? ['s'] : [])]);
        for (const key of held) if (!next.has(key)) { await page.keyboard.up(key); held.delete(key); }
        for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
        return;
      }
      const bounds = await page.locator('[data-stick="move"]').boundingBox(); assert.ok(bounds, 'actual move stick exists');
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      if (!contact) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...center, radiusX: 4, radiusY: 4, force: 1 }] }); contact = true; }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: center.x + dx * 36, y: center.y + dy * 36, radiusX: 4, radiusY: 4, force: 1 }] });
    },
    async release() {
      for (const key of held) await page.keyboard.up(key); held.clear();
      if (contact) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); contact = false; }
    },
  };
}

async function freshPlayer(page, config, cdp, record) {
  await loaded(page, config);
  assert.equal((await page.locator('[data-action="endless-start"]').innerText()).replace(/\s/g, ''), '带队抵达↗');
  await activate(page, config.touch, '[data-action="endless-start"]');
  await page.waitForFunction(() => window.__viral.snapshot().camp?.prologue === 'arrival');
  const initial = await snapshot(page); record.initial = { camp: initial.camp, player: initial.player, escorts: initial.growth.cells.map(cell => cell.id) };
  assert.equal(initial.growth.cells.length, 6); assert.ok(initial.growth.cells.every(cell => cell.id.startsWith('camp-escort:')));
  await page.waitForTimeout(1100);
  assert.equal((await snapshot(page)).camp.prologue, 'arrival', 'time alone never builds the camp');
  if (!config.touch) {
    await page.keyboard.press('e'); await page.waitForTimeout(100);
    assert.equal((await snapshot(page)).camp.prologue, 'arrival', 'E away from the anchor cannot establish');
  }
  await screenshot(page, 'arrival', record);
  const mover = movement(page, config, cdp), origin = initial.territory.nodes.find(node => node.id === 'core');
  let current = initial; const started = Date.now();
  while (Math.hypot(current.player.x - origin.x, current.player.y - (origin.y + 110)) > 60) {
    assert.ok(Date.now() - started < 10000, 'escort route reaches the real establishment position');
    await mover.move(origin.x - current.player.x, origin.y + 110 - current.player.y); await page.waitForTimeout(90); current = await snapshot(page);
  }
  await mover.release(); record.anchor = { player: current.player, origin };
  if (config.touch) await activate(page, true, '[data-action="camp-establish"]'); else await page.keyboard.press('e');
  await page.waitForFunction(() => window.__viral.snapshot().camp?.prologue === 'building');
  await screenshot(page, 'building', record);
  if (config.name === 'desktop-1366x768') await page.waitForFunction(() => window.__viral.snapshot().camp?.prologue === 'ready', { timeout: 12000 });
  else await activate(page, config.touch, '[data-action="camp-skip-intro"]');
  await page.waitForFunction(() => window.__viral.snapshot().camp?.prologue === 'ready');
  await page.locator('[data-mission-card="membrane"]').waitFor();
  await panelLayout(page, record, 'first-intelligence'); await screenshot(page, 'first-intelligence', record);
  const established = await profile(page); assert.equal(established.victories, 0); assert.equal(established.coins, 0);
  await activate(page, config.touch, '.camp-close'); await observeCampArt(page, record, 'fresh-after-establishment'); await screenshot(page, 'camp-world', record);
  await activate(page, config.touch, '#camp-toolbar [data-section="missions"]');
  await activate(page, config.touch, '[data-action="camp-deploy"]');
  await page.waitForFunction(() => window.__viral.snapshot().expedition?.missionId === 'membrane' && !window.__viral.snapshot().camp);
  assert.equal((await snapshot(page)).phase, 'playing');
  // Real production bullets collect actual accepted death drops. Neither the
  // actor positions nor damage/result state are supplied by this verifier.
  const combatStart = Date.now(); let observations = 0, maxCoins = 0;
  while (Date.now() - combatStart < 16000) {
    const state = await snapshot(page);
    assert.equal(state.growth.draft, null); assert.equal(state.growth.pendingResearch, null); assert.equal(state.endlessGrowth.draft, null);
    observations++; maxCoins = Math.max(maxCoins, state.expedition.haul.coins);
    if (state.phase !== 'playing' || maxCoins >= 6) break;
    const target = state.targets.filter(target => target.hp > 0 && !['source', 'core', 'tissue'].includes(target.role))
      .sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
    if (target) {
      if (config.touch) {
        const bounds = await page.locator('[data-stick="attack"]').boundingBox(); assert.ok(bounds);
        const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, dx = target.x - state.player.x, dy = (target.y - state.player.y) * .72, length = Math.hypot(dx, dy) || 1;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 2, ...center, radiusX: 4, radiusY: 4, force: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 2, x: center.x + dx / length * 32, y: center.y + dy / length * 32, radiusX: 4, radiusY: 4, force: 1 }] });
        await page.waitForTimeout(160); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        const point = await page.evaluate(target => window.__viral.toScreen(target), target);
        if (point.x >= 10 && point.x < config.width - 10 && point.y >= 10 && point.y < config.height - 10) { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
      }
    }
    await page.waitForTimeout(100);
  }
  await page.mouse.up();
  const before = await snapshot(page); assert.equal(before.phase, 'playing', 'natural first sample remains active');
  assert.ok(maxCoins > 0, 'natural bullets earned real loot before withdrawal');
  record.combat = { observations, before: { elapsed: before.elapsed, wave: before.endless.wave, haul: before.expedition.haul, playerHp: before.player.hp } };
  await screenshot(page, 'natural-combat', record);
  if (config.touch) await activate(page, true, '.mobile-top-actions [data-action="pause"]'); else await page.keyboard.press('Escape');
  const paused = await snapshot(page); record.combat.haulAtWithdrawal = paused.expedition.haul;
  await activate(page, config.touch, '[data-action="endless-extract"]');
  await page.locator('.microfront-result').waitFor();
  const withdrawn = await profile(page), transaction = withdrawn.transactions.find(transaction => transaction.kind === 'mission');
  assert.equal(transaction.receipt.outcome, 'withdrawn'); assert.equal(withdrawn.completedMissions.length, 0); assert.equal(withdrawn.inventory.length, 1);
  assert.equal(withdrawn.coins, Math.floor(paused.expedition.haul.coins / 2));
  assert.equal(withdrawn.materials, Math.floor(paused.expedition.haul.materials / 2));
  for (const [id, count] of Object.entries(paused.expedition.haul.fragments)) assert.equal(withdrawn.fragments[id] ?? 0, Math.floor(count / 2));
  record.withdrawal = transaction.receipt; await screenshot(page, 'withdrawal', record);
  await activate(page, config.touch, '[data-action="camp-open"]');
  await page.waitForFunction(() => window.__viral.snapshot().camp?.prologue === 'ready');
  assert.equal((await profile(page)).transactions.filter(transaction => transaction.kind === 'mission').length, 1);
}

async function economy(page, config, record) {
  await loaded(page, config); await activate(page, config.touch, '[data-action="endless-start"]');
  await page.waitForFunction(() => window.__viral.snapshot().camp?.prologue === 'ready');
  await observeCampArt(page, record, 'fixture-established-world'); await screenshot(page, 'camp-world', record);
  await activate(page, config.touch, '#camp-toolbar [data-action="camp-section"][data-section="overview"]');
  await activate(page, config.touch, '[data-action="camp-section"][data-section="warehouse"]');
  await panelLayout(page, record, 'warehouse'); await screenshot(page, 'warehouse', record);
  await activate(page, config.touch, '[data-action="camp-section"][data-section="forge"]');
  await observeUiArt(page, record, ['model-fragment', 'forge-core'], 'forge-resource-icons');
  const beforeCraft = await profile(page);
  await activate(page, config.touch, '[data-action="camp-craft"][data-template="PULSE_BREAK"][data-rarity="gold"]');
  let after = await profile(page); assert.equal(after.cores, beforeCraft.cores - 1); assert.equal(after.fragments.PULSE_BREAK, beforeCraft.fragments.PULSE_BREAK - 20); assert.equal(after.materials, beforeCraft.materials - 40);
  assert.ok(after.inventory.some(item => item.templateId === 'PULSE_BREAK' && item.rarity === 'gold'));
  await panelLayout(page, record, 'forge'); await screenshot(page, 'forge', record);
  await activate(page, config.touch, '[data-action="camp-section"][data-section="warehouse"]');
  await activate(page, config.touch, '[data-action="camp-module"][data-module="PULSE_BREAK"]');
  after = await profile(page); assert.deepEqual(after.equippedModules, ['PULSE_BREAK']);
  // Craft a spare item, then recycle it through the real inventory action.
  await activate(page, config.touch, '[data-action="camp-section"][data-section="forge"]');
  await activate(page, config.touch, '[data-action="camp-craft"][data-template="PURIFY_CHAIN"][data-rarity="blue"]');
  const spare = (await profile(page)).inventory.find(item => item.templateId === 'PURIFY_CHAIN'); assert.ok(spare);
  await activate(page, config.touch, '[data-action="camp-section"][data-section="warehouse"]');
  const beforeRecycle = await profile(page);
  await activate(page, config.touch, `[data-action="camp-decompose"][data-item="${spare.id}"]`);
  after = await profile(page); assert.ok(!after.inventory.some(item => item.id === spare.id)); assert.equal(after.fragments.PURIFY_CHAIN, (beforeRecycle.fragments.PURIFY_CHAIN ?? 0) + 2);
  await activate(page, config.touch, '[data-action="camp-section"][data-section="summon"]');
  const beforeSingle = await profile(page); await activate(page, config.touch, '[data-action="camp-draw"][data-count="1"]');
  await page.waitForFunction(() => document.querySelectorAll('.camp-draw-result').length === 1);
  after = await profile(page); assert.equal(after.coins, beforeSingle.coins - 100); assert.equal(after.transactions.filter(transaction => transaction.kind === 'draw').length, 1);
  const beforeTen = after; await page.waitForTimeout(450);
  await activate(page, config.touch, '[data-action="camp-draw"][data-count="10"]');
  await page.waitForFunction(() => document.querySelectorAll('.camp-draw-result').length === 10);
  after = await profile(page); const ten = after.transactions.filter(transaction => transaction.kind === 'draw').at(-1).receipt;
  assert.equal(after.coins, beforeTen.coins - 1000); assert.equal(ten.results.length, 10); assert.ok(ten.results.some(result => result.rarity === 'gold'));
  assert.equal(await page.locator('.camp-draw-result').count(), 10);
  await observeUiArt(page, record, ['gold-antibody'], 'actual-ten-gold-result');
  await panelLayout(page, record, 'ten-draw-results');
  await page.waitForTimeout(550);
  if (config.height <= 450) {
    record.firstScreenGold = await page.evaluate(() => {
      const content = document.querySelector('.camp-content'), summary = document.querySelector('.camp-gold-summary'), gold = document.querySelector('.camp-draw-result[data-rarity="gold"]');
      const c = content.getBoundingClientRect(), s = summary.getBoundingClientRect(), g = gold.getBoundingClientRect();
      return { text: summary.textContent, scrollTop: content.scrollTop, content: { top: c.top, bottom: c.bottom }, summary: { top: s.top, bottom: s.bottom }, gold: { top: g.top, bottom: g.bottom }, footerActionsVisible: getComputedStyle(document.querySelector('.camp-footer-actions')).display !== 'none' };
    });
    assert.equal(record.firstScreenGold.scrollTop, 0, 'actual gold summary is visible before any scrolling');
    assert.ok(record.firstScreenGold.summary.top >= record.firstScreenGold.content.top && record.firstScreenGold.summary.bottom <= record.firstScreenGold.content.bottom, 'complete gold summary fits on the first small-screen viewport');
    assert.equal(record.firstScreenGold.footerActionsVisible, false, 'small result view reserves footer space for the actual rewards');
    await screenshot(page, 'ten-draw-first-screen-gold', record);
  }
  await page.locator('.camp-draw-result').first().scrollIntoViewIfNeeded();
  await screenshot(page, 'ten-draw-results', record);
  await page.locator('.camp-draw-result[data-rarity="gold"]').first().scrollIntoViewIfNeeded();
  record.resultScrollTop = await page.locator('.camp-content').evaluate(element => element.scrollTop);
  await screenshot(page, 'ten-draw-gold', record);
  await page.waitForTimeout(450); const beforeDouble = await profile(page);
  await page.locator('[data-action="camp-draw"][data-count="10"]').dblclick({ delay: 45 });
  await page.waitForTimeout(200); after = await profile(page);
  assert.equal(after.coins, beforeDouble.coins - 1000, 'rapid double activation spends once');
  assert.equal(after.transactions.filter(transaction => transaction.kind === 'draw').length, 3, 'one single, one ten and one guarded double');
  const persisted = structuredClone(after); await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__viral && !document.getElementById('app').inert, { timeout: 60000 });
  assert.equal((await profile(page)).pity, persisted.pity); assert.equal((await profile(page)).coins, persisted.coins);
  await activate(page, config.touch, '[data-action="endless-start"]');
  await activate(page, config.touch, '#camp-toolbar [data-action="camp-section"][data-section="overview"]');
  await activate(page, config.touch, '[data-action="camp-section"][data-section="summon"]');
  assert.ok((await page.locator('.camp-pity').innerText()).includes(`${persisted.pity} / 9`));
  record.economy = { single: after.transactions.find(transaction => transaction.kind === 'draw').receipt, ten, afterReload: { coins: persisted.coins, pity: persisted.pity, drawCount: persisted.drawCount, transactionCount: persisted.transactions.length }, equippedModules: persisted.equippedModules };
}

try {
  for (const config of configurations) {
    for (const scope of ['fresh', 'economy']) {
      if (option('--scope') && option('--scope') !== scope) continue;
      const record = { ...config, scope, screenshots: [], layouts: [], artObservations: [], remoteRequests: [], errors: [], pass: false }; report.cases.push(record);
      const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, hasTouch: config.touch, isMobile: config.touch, deviceScaleFactor: 1 });
      await installGroundObservation(context); if (baseUrl.startsWith('file:')) await context.setOffline(true);
      if (scope === 'economy') await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: model.CAMP_PROFILE_STORAGE_KEY, value: JSON.stringify(fixture) });
      const page = await context.newPage(), cdp = await context.newCDPSession(page);
      page.on('pageerror', error => { record.errors.push(error.message); report.pageErrors.push({ name: config.name, scope, error: error.message }); });
      page.on('request', request => { if (/^https?:/i.test(request.url())) record.remoteRequests.push(request.url()); });
      try {
        if (scope === 'fresh') await freshPlayer(page, config, cdp, record); else await economy(page, config, record);
        assert.equal(record.errors.length, 0); if (baseUrl.startsWith('file:')) assert.equal(record.remoteRequests.length, 0, 'offline production file makes no HTTP(S) requests'); record.pass = true;
      } catch (error) { record.failure = error.stack ?? String(error); await screenshot(page, 'failure', record).catch(() => {}); console.error(record.failure); }
      finally { await context.close(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); }
      console.log(JSON.stringify({ name: record.name, scope, pass: record.pass, errors: record.errors.length }));
    }
  }
  report.pass = report.cases.length > 0 && report.cases.every(record => record.pass) && report.pageErrors.length === 0;
  if (report.productionEntry) {
    report.productionBytesStable = sha(await readFile(report.productionEntry.path)) === report.productionEntry.sha256;
    for (const script of report.productionEntry.scripts) report.productionBytesStable &&= sha(await readFile(script.path)) === script.sha256;
    report.pass &&= report.productionBytesStable;
  }
  report.nativeAssetsVerified = report.pass && sourceAssets.length === 19 && report.cases.every(record => record.artObservations.length > 0 && record.artObservations.every(observation => observation.nativeAssetsVerified));
} finally {
  await browser.close(); report.completedAt = new Date().toISOString();
  report.wallSeconds = (Date.parse(report.completedAt) - Date.parse(report.startedAt)) / 1000;
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, pass: report.pass, cases: report.cases.length, artAcceptance: report.artAcceptance }));
  if (!report.pass) process.exitCode = 1;
}
