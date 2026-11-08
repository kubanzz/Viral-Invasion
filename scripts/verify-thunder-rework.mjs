import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Standalone supplied-state harness. It never writes a production entry or save.
const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const output = resolve(option('--out') ?? 'artifacts/thunder-rework-v025');
const seconds = Number(option('--seconds') ?? 15);
const prepareOnly = process.argv.includes('--prepare-only');
const benchmarkOnly = process.argv.includes('--benchmark-only');
const skipBenchmark = process.argv.includes('--skip-benchmark');
const modes = (option('--modes') ?? 'standard,low').split(',');
assert(Number.isFinite(seconds) && seconds >= 10 && seconds <= 120);
assert(modes.every(mode => ['standard', 'low'].includes(mode)));
await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = async paths => Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(path))])));
const summarize = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length * .5)] ?? null,
    p95Ms: sorted[Math.floor(sorted.length * .95)] ?? null, maximumMs: sorted.at(-1) ?? null };
};

const fixtureSource = String.raw`
import { Renderer } from './src/render/phaserRenderer';
import { GameSession } from './src/game/session';
import { FixedClock } from './src/core/clock';
import { createWeaponCombat, weaponSkillViews } from './src/game/weaponSkills';
import { fillWeaponUltimate, weaponUltimateView } from './src/game/weaponUltimates';
import { playerProjectilePopulation } from './src/game/playerProjectiles';
import { Controller } from './src/input/controller';
import { TouchControls } from './src/input/touchControls';
import { mobileHudMarkup, updateMobileHud } from './src/ui/mobileHud';
import './src/style.css';
import './src/ui/mobile.css';
import './src/ui/weaponSkills.css';

(async () => {
  document.getElementById('controls').innerHTML = mobileHudMarkup;
  const canvas = document.getElementById('game');
  const renderer = new Renderer(canvas); await renderer.ready;
  let session, run, touchMode = false;
  const clock = new FixedClock();
  const input = new Controller(canvas, () => {}, () => {}, () => !!run && !run.stopped, () => session.state);
  const touch = new TouchControls({ root: document.getElementById('mobile-controls'), canvas, input,
    getState: () => session.state, screenToWorld: p => renderer.camera.screenToWorld(p),
    canAccept: () => !!run && !run.stopped, enabled: () => touchMode });
  const own = p => ({ x: p.x, y: p.y });
  const population = s => ({ living: s.targets.filter(t => t.hp > 0 && t.role !== 'event').length,
    projectiles: playerProjectilePopulation(s), effects: s.effects.length,
    pendingActions: s.weaponCombat.pendingActions?.length ?? 0 });
  function snapshot() {
    const s = session.state;
    return { elapsed: s.elapsed, phase: s.phase, player: own(s.player), population: population(s),
      damage: run.damage, eventCounts: { ...run.eventCounts }, ultimate: weaponUltimateView(s),
      skills: weaponSkillViews(s), runtime: structuredClone(s.weaponCombat), lastInput: run.lastInput,
      travelled: run.travelled, concurrentMoveHeldFrames: run.concurrentMoveHeldFrames,
      concurrentMoveHeldSkillFrames: run.concurrentMoveHeldSkillFrames };
  }
  function setup(low, mobile) {
    if (session) input.clear(); touchMode = mobile;
    document.body.classList.toggle('touch-mode', mobile);
    document.body.classList.add('endless-mode');
    session = new GameSession(250071, { mode: 'endless', territory: true }); session.start();
    const s = session.state;
    s.world = { width: 2400, height: 1600, bounds: { left: 65, right: 2335, top: 80, bottom: 1535 },
      obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    Object.assign(s.player, { x: 1200, y: 800, hp: 1e8, facing: 0 });
    Object.assign(s.tissue, { x: 1100, y: 1050, hp: 1e8, maxHp: 1e8 });
    s.weaponCombat = createWeaponCombat({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 });
    s.expedition.loadout = { ...s.weaponCombat.loadout };
    for (const node of s.territory.nodes) Object.assign(node, { owner: 'healthy', infectionProgress: 0, purificationProgress: 0 });
    for (const value of Object.values(s.territory.sources)) Object.assign(value, { destroyed: true, spawned: true });
    s.territory.stage = 'guard';
    Object.assign(s.endless, { wave: 8, clearedWaves: 7, phase: 'combat', phaseStartedAt: 0,
      remainingToSpawn: 0, nextSpawnAt: Infinity, batchSchedule: [], batchIndex: 0, batchMemberIndex: 0, pendingChildren: 0,
      territoryTasks: { wave: 8, reservedSlots: [], squads: [] }, smartSupport: { wave: 8, reservedSlots: [], plans: [] } });
    s.targets = Array.from({ length: 48 }, (_, i) => {
      const angle = i * 2.3999632297, radius = 95 + (i % 7) * 24;
      return { id: 'thunder-pressure:' + i, x: 1200 + Math.cos(angle) * radius, y: 800 + Math.sin(angle) * radius,
        hp: 1e8, maxHp: 1e8, radius: 18, kind: 'single', role: 'virus', traits: [], hitUntil: 0, scanned: false,
        waveId: 8, blocksWaveClear: true, facing: Math.PI, born: 0, attackReady: .6, sourceId: 'pressure:finite' };
    });
    s.effects = []; s.events = []; s.playerProjectiles = []; fillWeaponUltimate(s);
    run = { low, mobile, startedAt: performance.now(), stopped: false, frames: [], updates: [], renders: [],
      damage: 0, eventCounts: {}, events: [], samples: [], maximum: {}, minimum: {}, travelled: 0,
      concurrentMoveHeldFrames: 0, concurrentMoveHeldSkillFrames: 0, lastFrame: 0, lastSample: -1, discontinuities: 0 };
    session.bus.on('event', event => {
      if (event.type === 'TARGET_HIT') run.damage += Number(event.data.damage);
      run.eventCounts[event.type] = (run.eventCounts[event.type] ?? 0) + 1;
      if (/^THUNDER_|^WEAPON_SKILL_CAST$|^WEAPON_ULTIMATE_CAST$|^WEAPON_ULTIMATE_PULSE$/.test(event.type)) run.events.push(structuredClone(event));
    });
    input.setTerritoryMode(true); renderer.resize(); renderer.prepareCamera(s, { snap: true });
    updateMobileHud(s); clock.reset(performance.now()); draw(); return snapshot();
  }
  function draw() {
    const s = session.state;
    renderer.prepareCamera(s);
    renderer.render(s, input.getAim(s, p => renderer.camera.screenToWorld(p)), { cameraPrepared: true, lowEffects: run.low });
    updateMobileHud(s);
  }
  function loop(now) {
    if (!run || run.stopped) return;
    try {
      if (run.lastFrame) run.frames.push(now - run.lastFrame); run.lastFrame = now;
      const before = performance.now();
      clock.advance(now, dt => {
        const s = session.state, previous = own(s.player), aim = input.getAim(s, p => renderer.camera.screenToWorld(p));
        const frame = input.frame(aim); run.lastInput = structuredClone(frame);
        const held = frame.primaryHeld ?? frame.fire;
        if (held && (frame.moveX || frame.moveY)) {
          run.concurrentMoveHeldFrames++;
          if (frame.weaponSkill || frame.weaponUltimate) run.concurrentMoveHeldSkillFrames++;
        }
        session.step(frame, dt); renderer.witnessSimulation(s);
        run.travelled += Math.hypot(s.player.x - previous.x, s.player.y - previous.y);
      }, true);
      if (clock.discontinuity) run.discontinuities++;
      const middle = performance.now(); draw(); run.updates.push(middle - before); run.renders.push(performance.now() - middle);
      const p = population(session.state);
      for (const [key, value] of Object.entries(p)) {
        run.maximum[key] = Math.max(run.maximum[key] ?? 0, value);
        run.minimum[key] = Math.min(run.minimum[key] ?? Infinity, value);
      }
      const elapsed = (now - run.startedAt) / 1000;
      if (elapsed - run.lastSample >= .5) {
        run.lastSample = elapsed;
        const diagnostic = renderer.diagnostics(session.state);
        const living = new Set(session.state.targets.filter(t => t.hp > 0).map(t => t.id));
        const visible = new Set((diagnostic.art.actorFrames ?? []).filter(f => f.visible && f.native && !f.fallback && living.has(f.entityId)).map(f => f.entityId)).size;
        run.samples.push({ wallSeconds: elapsed, simulationSeconds: session.state.elapsed, ...p, visibleEnemyBodies: visible,
          heapBytes: performance.memory?.usedJSHeapSize ?? null, ultimate: weaponUltimateView(session.state),
          player: own(session.state.player) });
      }
      if (session.state.phase !== 'playing') throw Error('fixture left playing: ' + session.state.phase);
      if (p.living > 48 || p.projectiles > 192) throw Error('production entity cap exceeded');
    } catch (error) { run.error = String(error); run.stopped = true; }
  }
  renderer.startFrameLoop(loop);
  window.thunderFixture = { setup, snapshot,
    screen(point) { return renderer.camera.worldToScreen(point); },
    diagnostics() { return renderer.diagnostics(session.state); },
    finish() {
      run.stopped = true; input.clear();
      return { ...run, seconds: (performance.now() - run.startedAt) / 1000, simulationSeconds: session.state.elapsed,
        final: snapshot(), diagnostics: renderer.diagnostics(session.state) };
    } };
  window.thunderReady = true;
})().catch(error => { window.thunderBootError = String(error); throw error; });
`;

const benchmarkSource = String.raw`
import { GameSession } from './src/game/session';
import { CampWeaponTrial } from './src/game/campWeaponTrial';
import { weaponSkillViews, createWeaponCombat } from './src/game/weaponSkills';
import { weaponUltimateView } from './src/game/weaponUltimates';
import { measureBoss, BOSS_MEASUREMENT_PILOT } from './scripts/simulate-heart-boss';
export { BOSS_MEASUREMENT_PILOT };
export function campTrial() {
  const trial = new CampWeaponTrial({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 });
  trial.layout('melee');
  trial.setPrimaryHeld(true);
  const frames = [];
  for (let n = 0; n < 60; n++) {
    trial.advance(1 / 60);
    if (n % 15 === 0) frames.push(trial.view);
  }
  const primary = trial.view;
  trial.reset(); trial.layout('single'); trial.setPrimaryHeld(true);
  for (let n = 0; n < 30; n++) trial.advance(1 / 60);
  trial.setPrimaryHeld(false); const releasedDamage = trial.view.totalDamage;
  for (let n = 0; n < 30; n++) trial.advance(1 / 60);
  const release = { damageAtRelease: releasedDamage, damageAfterHalfSecond: trial.view.totalDamage,
    primaryHeld: trial.view.primaryHeld };
  const skills = [1, 2, 3].map(slot => {
    trial.reset(); trial.layout('melee'); trial.setPrimaryHeld(true);
    for (let n = 0; n < 35; n++) trial.advance(1 / 60);
    const accepted = trial.skill(slot);
    for (let n = 0; n < 45; n++) trial.advance(1 / 60);
    return { slot, accepted, view: trial.view };
  });
  trial.reset(); trial.fillUltimate(); const accepted = trial.ultimate();
  for (let n = 0; n < 50; n++) trial.advance(1 / 60);
  const active = trial.view, recastAccepted = trial.ultimate();
  for (let n = 0; n < 90; n++) trial.advance(1 / 60);
  return { scope: 'Production isolated CampWeaponTrial public methods; targets reset/stand up under its normal training rules.',
    frames, primary, release, skills, ultimate: { accepted, active, recastAccepted, final: trial.view } };
}
function setup(id, population, hp, seed) {
  const game = new GameSession(seed, { mode: 'endless', territory: true }); game.start(); const s = game.state;
  game.configureExpedition({ runId: 'thunder-rework:' + id, seed, loadout: { weaponId: id,
    rarity: id === 'thunder' || id === 'redblade' ? 'gold' : 'purple', upgrade: 0 },
    blueprints: [], extraAntibodies: 0, firstClear: true, missionId: 'boundary', modules: [], legions: [] });
  s.world = { width: 2400, height: 1600, bounds: { left: 65, right: 2335, top: 80, bottom: 1535 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(s.player, { x: 1200, y: 800, hp: 1e8, facing: 0 }); Object.assign(s.tissue, { x: 1150, y: 1050, hp: 1e8, maxHp: 1e8 });
  for (const node of s.territory.nodes) Object.assign(node, { owner: 'healthy', infectionProgress: 0, purificationProgress: 0 });
  for (const value of Object.values(s.territory.sources)) Object.assign(value, { destroyed: true, spawned: true });
  s.territory.stage = 'guard';
  Object.assign(s.endless, { wave: 8, clearedWaves: 7, phase: 'combat', phaseStartedAt: 0,
    remainingToSpawn: 1, nextSpawnAt: Infinity, batchSchedule: [], batchIndex: 0, batchMemberIndex: 0, pendingChildren: 0,
    territoryTasks: { wave: 8, reservedSlots: [], squads: [] }, smartSupport: { wave: 8, reservedSlots: [], plans: [] } });
  let serial = 0;
  const body = index => ({ id: 'measure:' + (++serial), x: 1310 + index % 4 * 26, y: 768 + Math.floor(index / 4) * 32,
    hp, maxHp: hp, radius: population === 1 ? 26 : 16, kind: 'single', role: 'virus', traits: [], hitUntil: 0,
    scanned: false, waveId: 8, blocksWaveClear: true, facing: Math.PI, born: s.elapsed, attackReady: Infinity, sourceId: 'measure:finite' });
  s.targets = Array.from({ length: population }, (_, index) => body(index)); s.weaponCombat.ultimateEnergy = 0;
  s.events = []; s.effects = []; s.playerProjectiles = [];
  return { game, body };
}
export function contact(id, population, hp, seconds, useSkills = true, useUltimate = true) {
  const { game, body } = setup(id, population, hp, 250071), s = game.state;
  let damage = 0, kills = 0, replenished = 0;
  const damageByOrigin = {}, skillCasts = {}, pending = [], samples = [];
  game.bus.on('event', event => {
    if (event.type === 'TARGET_HIT') {
      damage += Number(event.data.damage); const key = String(event.data.skillId ?? event.data.cause);
      damageByOrigin[key] = (damageByOrigin[key] ?? 0) + Number(event.data.damage);
    }
    if (event.type === 'TARGET_CLEARED' && String(event.data.id).startsWith('measure:')) {
      kills++; pending.push({ at: s.elapsed + .5, index: replenished++ % population });
    }
    if (event.type === 'WEAPON_SKILL_CAST' || event.type === 'WEAPON_ULTIMATE_CAST') {
      const key = String(event.data.skillId ?? event.data.ultimateId ?? event.type); skillCasts[key] = (skillCasts[key] ?? 0) + 1;
    }
  });
  for (let n = 0; n < seconds * 60 && s.phase === 'playing'; n++) {
    while (pending[0]?.at <= s.elapsed) {
      const item = pending.shift(); s.targets.push(body(item.index));
    }
    const living = s.targets.filter(t => t.hp > 0), target = living.sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
    const aim = target ? { x: target.x, y: target.y } : { x: s.player.x + 150, y: s.player.y };
    const frame = { moveX: 0, moveY: 0, aim, fire: true, primaryHeld: true };
    if (useUltimate && weaponUltimateView(s)?.ready) frame.weaponUltimate = { aim };
    else if (useSkills) {
      // Deliberately excludes each actual displacement skill in this contact
      // fixture: thunder3 and redblade1. Domain3 remains available to the blade.
      const eligible = id === 'thunder' ? [2, 1] : id === 'redblade' ? [3, 2] : [3, 2, 1];
      const views = weaponSkillViews(s), slot = eligible.find(slot => views.find(view => view.slot === slot)?.ready);
      if (slot) frame.weaponSkill = { slot, aim };
    }
    game.step(frame);
    if (n % 120 === 0) samples.push({ time: s.elapsed, damage, kills, population: living.length, energy: s.weaponCombat.ultimateEnergy });
  }
  return { id, population, hp, seconds, useSkills, useUltimate, actualSeconds: s.elapsed, phase: s.phase,
    damage, kills, damageByOrigin, skillCasts, replenishments: replenished, samples,
    finalPlayer: { x: s.player.x, y: s.player.y },
    limitation: 'Supplied high-durability player and fixed initial pack, actual AI and GameSession damage. Finite group targets replenish .5s after real death; this is injected contact throughput, not natural play. Thunder displacement skill3 and redblade displacement skill1 are excluded from skill-enabled rows to preserve stationary contact. Other skills, including redblade domain3, remain available.' };
}
export function boss(id, initialEnergy) { return measureBoss(id, 71, initialEnergy, 180); }
`;

const report = { scope: 'Independent supplied-state verification of current source. Browser cases run the actual GameSession, Renderer, Controller, TouchControls and mobile HUD. Initial 48 durable enemies, durable player/tissue and one full ultimate are injected per case. All browser combat after setup uses trusted keyboard/mouse or CDP touchscreen input. This is browser touch emulation, not physical-phone or human fun validation.',
  startedAt: new Date().toISOString(), cases: [], errors: [], benchmarks: {}, pass: false,
  limitations: ['No pre-rework baseline is inferred from this run.', 'The contact fixture and boss-ready encounter are injected and reported separately from normal acquisition/progression.', 'Browser software-rendered timings describe this machine and fixture only; no physical device performance claim.'] };
await writeFile(join(output, 'harness.mjs'), await readFile(new URL(import.meta.url)));
await writeFile(join(output, 'fixture.ts'), fixtureSource);
await writeFile(join(output, 'benchmark.ts'), benchmarkSource);
const browserBundle = await build({ stdin: { contents: fixtureSource, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'iife', minify: true, outfile: join(output, 'fixture.js'), loader: { '.glb': 'dataurl' },
  target: ['chrome110'], metafile: true });
const nodeBundle = await build({ stdin: { contents: benchmarkSource, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: join(output, 'benchmark.mjs'), target: 'node22', metafile: true });
const inputs = [...new Set([...Object.keys(browserBundle.metafile.inputs), ...Object.keys(nodeBundle.metafile.inputs)])]
  .filter(path => path !== '<stdin>' && !path.startsWith('node_modules/')).sort();
report.sourceBefore = await fingerprint(inputs);
report.bundleSha256 = hash(await readFile(join(output, 'fixture.js')));
await writeFile(join(output, 'index.html'), '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>裁决铳受控验证</title><link rel="stylesheet" href="fixture.css"><style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}#game{width:100vw;height:100vh;display:block;pointer-events:auto}#controls{position:absolute;inset:0;pointer-events:none}</style><body><canvas id="game"></canvas><main id="app"><div id="controls"></div></main><script src="fixture.js"></script></body></html>');
if (prepareOnly) {
  report.preparedOnly = true; await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ prepared: true, output, inputs: inputs.length })); process.exit(0);
}

const until = async (read, accept, label, timeout = 10000) => {
  const start = Date.now(); let value;
  while (Date.now() - start < timeout) {
    value = await read(); if (accept(value)) return value;
    await new Promise(done => setTimeout(done, 20));
  }
  throw Error(label + ': ' + JSON.stringify(value).slice(0, 1200));
};
let browser;
try {
  if (!skipBenchmark) {
    const model = await import(pathToFileURL(join(output, 'benchmark.mjs')).href + '?run=' + Date.now());
    report.benchmarks.campTrial = model.campTrial();
    const trial = report.benchmarks.campTrial;
    assert(trial.primary.totalDamage > 0, 'isolated training primary deals damage');
    assert.equal(trial.release.damageAtRelease, trial.release.damageAfterHalfSecond, 'training primary physically releases without lingering channel damage');
    assert.equal(trial.release.primaryHeld, false);
    assert(trial.skills.every(item => item.accepted), 'all three training skills accepted');
    assert(trial.ultimate.accepted && trial.ultimate.recastAccepted, 'training ultimate supports early convergence');
    report.benchmarks.contact = [];
    for (const id of ['steady', 'piercing', 'thunder', 'redblade']) {
      report.benchmarks.contact.push(model.contact(id, 1, 1e8, 30, false, false));
      report.benchmarks.contact.push(model.contact(id, 1, 1e8, 30, true, false));
      for (const hp of [34, 51, 68]) report.benchmarks.contact.push(model.contact(id, 12, hp, 60, true, true));
    }
    report.benchmarks.boss = [0, 100].map(initial => model.boss('thunder', initial));
    report.benchmarks.bossPolicy = { name: model.BOSS_MEASUREMENT_PILOT,
      limitation: 'Unchanged shared boss pilot uses 330 preferred ranged distance and treats ready3 as a generic buff. It does not optimize the new short-range channel/directional traversal and cannot alone establish thunder strength or a player win-rate claim.' };
    await writeFile(join(output, 'benchmarks.json'), JSON.stringify(report.benchmarks, null, 2));
    assert(report.benchmarks.contact.every(item => item.phase === 'playing' && Math.abs(item.actualSeconds - item.seconds) < 1e-6), 'contact measurements run their full promised simulation duration');
  }
  if (!benchmarkOnly) {
    browser = await chromium.launch({ channel: option('--channel') ?? 'chrome', headless: true, args: ['--allow-file-access-from-files'] });
    report.browserVersion = browser.version();
    for (const [width, height, touch] of [[1366, 768, false], [667, 320, true]]) for (const mode of modes) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
      const page = await context.newPage(), cdp = await context.newCDPSession(page), touches = new Map();
      const item = { width, height, touch, mode, pass: false, screenshots: [], checkpoints: [], pageErrors: [] }; report.cases.push(item);
      page.on('pageerror', error => item.pageErrors.push(String(error)));
      await page.goto(pathToFileURL(join(output, 'index.html')).href, { waitUntil: 'load' }); await page.bringToFront();
      await page.waitForFunction(() => window.thunderReady || window.thunderBootError, null, { timeout: 60000 });
      assert.equal(await page.evaluate(() => window.thunderBootError ?? null), null);
      const snapshot = () => page.evaluate(() => window.thunderFixture.snapshot());
      const capture = async label => {
        const name = width + '-' + mode + '-' + label + '.png';
        await page.screenshot({ path: join(output, name) }); item.screenshots.push(name);
        item.checkpoints.push({ label, ...await snapshot() });
      };
      const point = async selector => {
        const box = await page.locator(selector).boundingBox(); assert(box, 'visible control ' + selector);
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      };
      const touchEvent = async (type, id, p) => {
        // CDP touchEnd takes the contact being ended, not the contacts that
        // remain. Keeping the other fingers here would release attack/move.
        if (type === 'touchEnd') {
          const ending = touches.get(id); if (!ending) return;
          await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [ending] }); touches.delete(id); return;
        }
        if (type === 'touchCancel') touches.clear();
        else touches.set(id, { id, ...p, radiusX: 3, radiusY: 3, force: 1 });
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.values()] });
      };
      const skill = async slot => {
        if (!touch) { await page.keyboard.press(String(slot)); return; }
        const selector = slot === 4 ? '[data-weapon-ultimate]' : '[data-weapon-skill="' + slot + '"]';
        const p = await point(selector); await touchEvent('touchStart', 3, p); await page.waitForTimeout(45); await touchEvent('touchEnd', 3);
      };
      const hold = async () => {
        if (touch) await touchEvent('touchStart', 2, await point('[data-stick="attack"]'));
        else { await page.mouse.move(width / 2 + 90, height / 2); await page.mouse.down(); }
      };
      const releasePrimary = async () => {
        if (touch) await touchEvent('touchEnd', 2); else await page.mouse.up();
      };
      const move = async direction => {
        if (touch) {
          const p = await point('[data-stick="move"]');
          await touchEvent(touches.has(1) ? 'touchMove' : 'touchStart', 1, { x: p.x + direction * 35, y: p.y });
        } else {
          await page.keyboard.up(direction > 0 ? 'a' : 'd'); await page.keyboard.down(direction > 0 ? 'd' : 'a');
        }
      };
      await page.evaluate(({ low, touch }) => window.thunderFixture.setup(low, touch), { low: mode === 'low', touch });
      const began = Date.now(); await hold(); await page.waitForTimeout(800); await capture('primary');
      assert((await snapshot()).damage > 0, 'held primary deals damage');
      await releasePrimary(); await page.waitForTimeout(200); const released = await snapshot();
      await page.waitForTimeout(250); const afterRelease = await snapshot();
      item.releaseCheck = { before: released.damage, after: afterRelease.damage, intervalMs: 250 };
      assert.equal(afterRelease.damage, released.damage, 'primary stops after physical release without a skill active');
      await hold(); await move(-1); await skill(2); await page.waitForTimeout(500); await capture('electrode');
      await skill(1); await page.waitForTimeout(250); await move(1); await skill(3); await page.waitForTimeout(150); await capture('traversal');
      await skill(4); const active = await until(snapshot, value => value.ultimate?.active, 'storm starts');
      assert.equal(active.ultimate.energy, 0, 'storm initial cast spends exactly the full initial charge');
      await page.waitForTimeout(750); await capture('storm');
      assert((await snapshot()).ultimate.canRecast, 'active storm exposes convergence after its initial guard');
      if (touch) assert.equal(await page.locator('[data-weapon-ultimate]').isDisabled(), false, 'touch convergence remains enabled at zero energy');
      await skill(4);
      await until(snapshot, value => !value.ultimate?.active, 'storm manually converges'); await capture('manual-convergence');
      const remaining = seconds * 1000 - (Date.now() - began);
      for (let elapsed = 0; elapsed < remaining; elapsed += 650) { await move(elapsed % 1300 ? -1 : 1); await page.waitForTimeout(Math.min(650, remaining - elapsed)); }
      await releasePrimary(); if (touch) await touchEvent('touchCancel', 0); else { await page.keyboard.up('a'); await page.keyboard.up('d'); }
      const raw = await page.evaluate(() => window.thunderFixture.finish());
      item.rawPressureEvidence = width + '-' + mode + '-pressure-raw.json';
      await writeFile(join(output, item.rawPressureEvidence), JSON.stringify(raw));
      item.pressure = { ...raw, frames: summarize(raw.frames), updates: summarize(raw.updates), renders: summarize(raw.renders) };
      assert.equal(raw.error ?? null, null); assert.equal(raw.minimum.living, 48); assert.equal(raw.maximum.living, 48);
      assert(raw.maximum.projectiles <= 192); assert(raw.damage > 0); assert(raw.travelled > 30);
      assert(raw.concurrentMoveHeldFrames > 10); assert(raw.concurrentMoveHeldSkillFrames >= 3, 'movement and held primary survive skill/ultimate inputs');
      const castIds = raw.events.filter(e => e.type === 'WEAPON_SKILL_CAST').map(e => e.data.skillId);
      assert(new Set(castIds).size >= 3, 'actual production accepts all three skills');
      assert.equal(raw.events.filter(e => e.type === 'WEAPON_ULTIMATE_PULSE' && e.data.final).length, 1, 'manual convergence has exactly one final damage transaction');
      assert.equal(raw.diagnostics.art.player3D?.weapon3D?.id, 'thunder');
      assert.equal(raw.diagnostics.art.player3D?.ready, true);
      // A fresh independent fixture tests natural timeout without recharging a live run.
      await page.evaluate(({ low, touch }) => window.thunderFixture.setup(low, touch), { low: mode === 'low', touch });
      await skill(4); const automaticStart = await until(snapshot, value => value.ultimate?.active, 'timeout storm starts');
      await until(snapshot, value => !value.ultimate?.active, 'timeout storm automatically converges', 10000);
      const automaticEnd = await snapshot(); item.automaticConvergence = { startedAt: automaticStart.elapsed, endedAt: automaticEnd.elapsed,
        duration: automaticEnd.elapsed - automaticStart.elapsed, final: automaticEnd };
      assert(item.automaticConvergence.duration >= 5.7 && item.automaticConvergence.duration <= 6.4, 'storm lasts six simulated seconds');
      await capture('automatic-convergence'); await page.evaluate(() => window.thunderFixture.finish());
      assert.deepEqual(item.pageErrors, []); item.pass = true;
      await context.close();
      console.log(JSON.stringify({ width, height, mode, pass: true, p95Ms: item.pressure.frames.p95Ms, output }));
      await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
    }
  }
  report.pass = true;
} catch (error) {
  report.failure = String(error); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  report.sourceAfter = await fingerprint(inputs);
  report.changedSources = inputs.filter(path => report.sourceBefore[path] !== report.sourceAfter[path]);
  report.sourcesUnchanged = report.changedSources.length === 0;
  if (!report.sourcesUnchanged) { report.pass = false; process.exitCode = 1; }
  report.bundleUnchanged = report.bundleSha256 === hash(await readFile(join(output, 'fixture.js')));
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ pass: report.pass, failure: report.failure, sourcesUnchanged: report.sourcesUnchanged, changedSources: report.changedSources, cases: report.cases.length, output }));
