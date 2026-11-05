import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Explicit supplied-state visual fixture. This does not run the main menu,
// inject into the production game, or claim a natural-input playthrough.
const output = resolve(process.env.VI_WEAPON_CAPTURE_OUT ?? 'artifacts/weapon-identity/world-fixture');
const runtime = JSON.parse(await readFile('.art-generated/art-runtime.json', 'utf8'));
for (const id of ['fantasy.weapon.steady.held', 'fantasy.weapon.piercing.held']) assert(runtime.assets[id], `Run art sync after selecting ${id}`);
await mkdir(output, { recursive: true });
const source = `
import { Renderer } from './src/render/phaserRenderer';
import { GameSession } from './src/game/session';
import { createWeaponCombat } from './src/game/weaponSkills';
const renderer = new Renderer(document.querySelector('canvas'));
await renderer.ready;
window.__weaponFixture = {
  async show(weaponId, facing) {
    const session = new GameSession(71, { mode: 'endless', territory: true }); session.start();
    const state = session.state;
    state.weaponCombat = createWeaponCombat({ weaponId, rarity: 'white', upgrade: 0 });
    state.expedition.loadout = { weaponId, rarity: 'white', upgrade: 0 };
    state.elapsed = 1.2; state.tick = 72; state.targets = []; state.events = []; state.effects = [];
    state.playerProjectiles = []; state.playerFlight = undefined;
    Object.assign(state.player, { x: 1200, y: 750, facing, moving: false, hurtUntil: 0, dashUntil: 0, actionUntil: 0 });
    if (state.growth) { state.growth.cells = []; state.growth.beacons = []; state.growth.beacon = null; state.growth.marks = []; }
    const aim = { x: state.player.x + Math.cos(facing) * 220, y: state.player.y + Math.sin(facing) * 220 };
    renderer.prepareCamera(state, { snap: true }); renderer.render(state, aim, { cameraPrepared: true });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { diagnostics: renderer.diagnostics(state), foot: renderer.camera.worldToScreen(state.player), cameraScale: renderer.camera.scale };
  }
};
window.__weaponFixtureReady = true;
`;
await writeFile(join(output, 'fixture-source.ts'), source);
const imports = source.split('\n').filter(line => line.startsWith('import ')).join('\n');
const body = source.split('\n').filter(line => !line.startsWith('import ')).join('\n');
await build({ stdin: { contents: `${imports}\n(async()=>{${body}})().catch(error=>{window.__weaponFixtureError=String(error);throw error;});`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'iife', platform: 'browser', target: ['chrome110'], outfile: join(output, 'fixture.js'), minify: true, legalComments: 'none' });
await writeFile(join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Weapon identity supplied-state fixture</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f4eddb}#game{display:block;width:100vw;height:100vh}#label{position:fixed;left:20px;top:16px;padding:10px 14px;background:#fff9e9e8;color:#35594e;font:16px sans-serif;border-radius:8px;z-index:10;pointer-events:none}</style>
<div id="app"><canvas id="game"></canvas><div id="label">Supplied-state fixture · same camera / same pose</div></div><script src="fixture.js"></script>`);
const errors = [], browser = await chromium.launch({ headless: true, channel: process.env.VI_WEAPON_CAPTURE_CHANNEL ?? 'chrome', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(String(error)));
const entries = [];
try {
  await page.goto(pathToFileURL(join(output, 'index.html')).href);
  await page.waitForFunction(() => window.__weaponFixtureReady || window.__weaponFixtureError, null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.__weaponFixtureError ?? null), null);
  for (const weaponId of ['steady', 'piercing']) for (const [view, facing] of [['right', 0], ['front-right', Math.PI / 4], ['left', Math.PI], ['back-right', -Math.PI / 4]]) {
    await page.locator('#label').evaluate((label, value) => { label.textContent = value; }, `${weaponId} · ${view} · supplied-state production Renderer fixture`);
    const result = await page.evaluate(([weaponId, facing]) => window.__weaponFixture.show(weaponId, facing), [weaponId, facing]);
    const selected = result.diagnostics.art.weapon;
    assert.equal(selected.assetId, `fantasy.weapon.${weaponId}.held`); assert.equal(selected.requestedAssetId, selected.assetId);
    const tool = result.diagnostics.art.actorFrames.find(actor => actor.actorId === 'player:tool');
    assert.equal(tool.native, true); assert.equal(tool.fallback, false); assert(tool.grip && tool.muzzle);
    const name = `${weaponId}-${view}`;
    await page.screenshot({ path: join(output, `${name}-world.png`) });
    const clip = { x: Math.max(0, result.foot.x - 110), y: Math.max(0, result.foot.y - 185), width: 220, height: 230 };
    await page.screenshot({ path: join(output, `${name}-player.png`), clip });
    entries.push({ weaponId, view, facing, selected, tool, foot: result.foot, cameraScale: result.cameraScale,
      screenshots: [`${name}-world.png`, `${name}-player.png`] });
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
const sourcePaths = ['src/render/phaserRenderer.ts', 'src/render/actorAnimation.ts', 'src/render/weaponPresentation.ts', 'src/render/playerProjectileVisuals.ts', 'asserts/art-selection.json'];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const report = { pass: true, method: 'Explicit supplied states through the actual production Renderer, fixed camera and player pose; no natural-input or difficulty claim.',
  artInputSignature: runtime.inputSignature, sourceHashes, errors, entries };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: true, captures: entries.length, output }));
