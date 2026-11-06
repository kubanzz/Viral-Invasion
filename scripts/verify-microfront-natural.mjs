import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

// A fresh browser, normal DOM inputs, and read-only production diagnostics.
// No storage fixtures, clock changes, actor writes, teleports or forced damage.
const option = name => process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const baseUrl = option('--url') ?? 'http://127.0.0.1:4173';
const output = resolve(option('--out') ?? 'artifacts/microfront-20261106/natural');
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), baseUrl, pass: false, pageErrors: [], screenshots: [], observations: [],
  scope: 'Fresh desktop Chrome: arrival, establishment, natural first assignment, success receipt, camp crafting, module equipment and next departure. Automated skilled input is not a five-to-eight-minute novice playtest.',
  constraints: { freshContext: true, storageFixtures: false, simulationWrites: false, clockAcceleration: false } };
const sources = ['src/main.ts', 'src/game/session.ts', 'src/game/endless.ts', 'src/game/missionCombat.ts', 'src/meta/campProfile.ts',
  'src/game/campLayout.ts', 'src/game/campScene.ts', 'src/game/campProgression.ts', 'src/game/campAttention.ts', 'src/render/campMarkers.ts'];
report.sources = Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const bundle = await build({ stdin: { contents: "export {waypoint} from './tests/helpers/g3Driver';export {campLayout,isCampPositionLegal} from './src/game/campLayout';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { waypoint, campLayout, isCampPositionLegal } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const direction = (x, y) => { const length = Math.hypot(x, y) || 1; return { x: x / length, y: y / length }; };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', error => report.pageErrors.push(error.message));
const snapshot = () => page.evaluate(() => window.__viral.snapshot());
const profile = () => page.evaluate(() => window.__viral.campProfile().data);
const held = new Set(); let firing = false;
async function movement(dx, dy) {
  const next = new Set([...(dx < -.2 ? ['a'] : dx > .2 ? ['d'] : []), ...(dy < -.2 ? ['w'] : dy > .2 ? ['s'] : [])]);
  for (const key of held) if (!next.has(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}
async function release() { await movement(0, 0); if (firing) { await page.mouse.up(); firing = false; } }
async function click(selector) { await page.locator(selector).filter({ visible: true }).first().click({ timeout: 12000 }); }
async function screenshot(name) { const file = `${name}.png`; await page.screenshot({ path: join(output, file) }); report.screenshots.push(file); }
async function save() { await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); }
async function campWalk(points) {
  const origin = campLayout(await snapshot()).origin;
  report.campWalks ??= [];
  for (const point of points) {
    const goal = { x: origin.x + point.x, y: origin.y + point.y }, started = Date.now(); let state = await snapshot(), still = 0;
    while (distance(state.player, goal) > 9) {
      assert.ok(Date.now() - started < 16000, `Natural camp walking deadline ${JSON.stringify({ point, player: state.player })}`);
      assert.ok(state.camp); assert.equal(state.phase, 'playing');
      const dx = goal.x - state.player.x, dy = goal.y - state.player.y, heading = direction(Math.abs(dx) > 4 ? dx : 0, Math.abs(dy) > 4 ? dy : 0);
      await movement(heading.x, heading.y);
      await page.waitForTimeout(Math.min(100, Math.max(30, (distance(state.player, goal) - 5) / 235 * 1000)));
      const next = await snapshot(); still = distance(state.player, next.player) < .2 ? still + 1 : 0;
      assert.ok(still < 12, `Production camp movement blocked ${JSON.stringify({ point, player: next.player })}`);
      assert.ok(isCampPositionLegal(next.player, next.player.radius, campLayout(next))); state = next;
    }
    await release(); await page.waitForTimeout(35); report.campWalks.push({ point, player: (await snapshot()).player });
  }
  await page.waitForTimeout(180);
}
async function campInteract(id, buildSite = false) {
  const target = await page.evaluate(id => window.__viral.diagnostics().campTargets.find(target => target.id === id), id);
  assert.ok(target?.eligible, `Actual player is close enough to ${id}`);
  await page.keyboard.press('e');
  if (buildSite) {
    await page.waitForFunction(id => window.__viral.snapshot().camp?.activeConstruction === id, id);
    await page.waitForFunction(id => window.__viral.snapshot().camp?.builtFacilities?.includes(id) && !window.__viral.snapshot().camp?.activeConstruction, id, { timeout: 10000 });
    await screenshot(`01-built-${id}`);
  } else await page.locator(`.camp-nav [data-section="${id === 'departure' ? 'missions' : id}"][aria-current="page"]`).waitFor({ timeout: 8000 });
}
async function closeCampPanel() { await click('[data-action="camp-close"]'); await page.waitForFunction(() => window.__viral.snapshot().phase === 'playing'); }

try {
  const url = new URL(baseUrl); url.searchParams.set('seed', String(20261105 - 7919));
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__viral && !document.getElementById('app').inert, undefined, { timeout: 60000 });
  await page.bringToFront();
  assert.equal((await profile()).victories, 0);
  await click('[data-action="endless-start"]');
  await page.waitForFunction(() => window.__viral.snapshot().camp?.prologue === 'arrival');
  const initial = await snapshot(); report.initial = { seed: initial.seed, camp: initial.camp, player: initial.player, escorts: initial.growth.cells.length };
  const anchor = initial.territory.nodes.find(node => node.id === 'core');
  const arrivalDeadline = Date.now() + 15000;
  while (true) {
    const state = await snapshot(), goal = { x: anchor.x, y: anchor.y + 110 };
    if (distance(state.player, goal) < 50) break;
    assert.ok(Date.now() < arrivalDeadline, 'walked to the camp establishment marker');
    await movement(goal.x - state.player.x, goal.y - state.player.y); await page.waitForTimeout(80);
  }
  await release(); await page.keyboard.press('e');
  await page.waitForFunction(() => window.__viral.snapshot().camp?.prologue === 'building');
  await screenshot('01-building');
  await campWalk([{ x: -200, y: 100 }, { x: -200, y: -20 }, { x: -386, y: -20 }]); await campInteract('warehouse', true);
  await campWalk([{ x: -205, y: -20 }, { x: -205, y: 222 }, { x: -350, y: 222 }]); await campInteract('forge', true);
  await campWalk([{ x: -205, y: 222 }, { x: -205, y: 100 }, { x: 100, y: 100 }, { x: 100, y: -40 }, { x: 220, y: -40 }, { x: 250, y: 0 }, { x: 335, y: 0 }]); await campInteract('shop', true);
  await campWalk([{ x: 250, y: 0 }, { x: 220, y: -40 }, { x: 220, y: -85 }]); await campInteract('summon', true);
  await campWalk([{ x: 220, y: -40 }, { x: 100, y: -40 }, { x: 100, y: 250 }, { x: 205, y: 250 }, { x: 205, y: 340 }, { x: 335, y: 340 }]); await campInteract('departure', true);
  const built = await snapshot(); assert.equal(built.camp.builtFacilities.length, 5); assert.equal(built.camp.attention.departure.kind, 'mission');
  await screenshot('01-first-mission-marker'); await campInteract('departure');
  await page.locator('[data-mission-card="membrane"]').waitFor();
  await screenshot('02-intelligence');
  await click('[data-action="camp-deploy"]');
  await page.waitForFunction(() => window.__viral.snapshot().expedition?.missionId === 'membrane' && !window.__viral.snapshot().camp);
  let state = await snapshot(); assert.equal(state.seed, 20261105); assert.equal(state.expedition.loadout.rarity, 'white');
  assert.deepEqual(state.growth.equipped, []);
  const started = Date.now(), deadline = started + 360000, loggedEvents = new Set();
  const retainEvents = state => {
    for (const event of state.events) if (['ACTOR_SPAWNED', 'TARGET_CLEARED', 'ENDLESS_WAVE_CLEARED', 'MISSION_LOOT_COLLECTED', 'TERRITORY_PURIFIED', 'TERRITORY_SOURCE_DESTROYED'].includes(event.type))
      loggedEvents.add(JSON.stringify(event));
  };
  let lastQ = -Infinity, lastF = -Infinity, lastSkill = -Infinity, lastOverdrive = -Infinity, lastAntibody = -Infinity, lastObservation = -Infinity, lastWave = 0;
  let observations = 0, maximumHaul = 0;
  while (state.phase === 'playing' && Date.now() < deadline) {
    assert.equal(state.growth.draft, null); assert.equal(state.growth.pendingResearch, null); assert.equal(state.endlessGrowth.draft, null);
    const now = Date.now(), front = state.territory.nodes.find(node => node.id === 'front-north');
    const live = state.targets.filter(target => target.hp > 0);
    const mobile = live.filter(target => target.role !== 'source').sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
    const source = live.find(target => target.role === 'source');
    const target = mobile && distance(mobile, state.player) < 450 ? mobile : source ?? mobile;
    const fountain = state.territory.nodes.find(node => node.id === 'heart-healing-1');
    const destination = state.player.hp < 45 ? fountain : front.owner !== 'healthy' ? front : source ?? target ?? fountain;
    const stopRange = destination === front || destination === fountain ? 70 : 300;
    const next = waypoint(state, destination), go = distance(state.player, destination) > stopRange;
    let move = go ? direction(next.x - state.player.x, next.y - state.player.y) : { x: 0, y: 0 };
    if (mobile && distance(mobile, state.player) < 125 && !(front.owner === 'infected' && distance(front, state.player) < 120))
      move = direction(state.player.x - mobile.x, state.player.y - mobile.y);
    const warning = live.find(actor => actor.attackAt !== undefined && actor.attackAim && actor.attackTarget === 'player'
      && actor.attackAt > state.elapsed && actor.attackAt - state.elapsed < .4
      && distance(state.player, actor.attackAim) < (actor.attackRadius ?? 58) + state.player.radius + 15);
    if (warning) move = direction(state.player.x - warning.attackAim.x || 1, state.player.y - warning.attackAim.y);
    await movement(move.x, move.y);
    if (warning && state.player.dashReady <= state.elapsed && warning.attackAt - state.elapsed < .2) await page.keyboard.press('Space');
    if (target) {
      const point = await page.evaluate(target => window.__viral.toScreen(target), target);
      const box = await page.locator('#game').boundingBox();
      if (box && point.x > 10 && point.x < box.width - 10 && point.y > 90 && point.y < box.height - 70) {
        await page.mouse.move(box.x + point.x, box.y + point.y);
        // Reassert the real pointer each observation; a previous capture can
        // legitimately end on a HUD transition or keyboard focus change.
        if (firing) await page.mouse.up();
        await page.mouse.down(); firing = true;
      } else if (firing) { await page.mouse.up(); firing = false; }
      if (now - lastOverdrive > 12000) { await page.keyboard.press('3'); lastOverdrive = now; }
      else if (now - lastSkill > 240) { await page.keyboard.press(mobile && distance(mobile, state.player) < 155 ? '2' : '1'); lastSkill = now; }
    } else if (firing) { await page.mouse.up(); firing = false; }
    if (now - lastQ > 3000) { await page.keyboard.press('q'); lastQ = now; }
    if (state.player.hp < 75 && state.growth.cells.length && state.growth.antibodyCharges > 0 && now - lastAntibody > 3000) {
      await page.keyboard.press('r'); lastAntibody = now;
    }
    if (now - lastF > 180) { await page.keyboard.press('f'); lastF = now; }
    if (state.endless.wave !== lastWave) { lastWave = state.endless.wave; await screenshot(`03-wave-${lastWave}`); }
    retainEvents(state);
    if (now - lastObservation > 4000) {
      const note = { elapsed: state.elapsed, wallSeconds: (now - started) / 1000, hp: state.player.hp, core: state.tissue.hp, wave: state.endless.wave,
        cleared: state.endless.clearedWaves, front: front.owner, position: { x: state.player.x, y: state.player.y }, live: live.length,
        shots: state.shots, hits: state.hits, haul: state.expedition.haul, sourceHp: source?.hp };
      report.observations.push(note); console.log(JSON.stringify({ progress: note })); lastObservation = now; await save();
    }
    observations++; maximumHaul = Math.max(maximumHaul, state.expedition.haul.coins);
    await page.waitForTimeout(65); state = await snapshot();
  }
  await release();
  retainEvents(state);
  report.combat = { observations, maximumHaul, wallSeconds: (Date.now() - started) / 1000, simulatedSeconds: state.elapsed,
    result: state.result, playerHp: state.player.hp, coreHp: state.tissue.hp, wave: state.endless.wave, clearedWaves: state.endless.clearedWaves,
    haul: state.expedition.haul, events: [...loggedEvents].map(text => JSON.parse(text)) };
  await screenshot('04-mission-result');
  assert.equal(state.result?.success, true, `natural mission success; phase=${state.phase}, hp=${state.player.hp}, wave=${state.endless.wave}`);
  const births = report.combat.events.filter(event => event.type === 'ACTOR_SPAWNED' && event.data.missionBaseBudget === true);
  const deaths = new Set(report.combat.events.filter(event => event.type === 'TARGET_CLEARED').map(event => event.data.id));
  report.combat.actualBaseBirths = births.length;
  report.combat.actualBaseDeaths = births.filter(event => deaths.has(event.data.id)).length;
  report.combat.baseBirthsByWave = [1, 2, 3].map(wave => births.filter(event => event.data.wave === wave).length);
  assert.deepEqual(report.combat.baseBirthsByWave, [60, 80, 100]);
  assert.equal(report.combat.actualBaseDeaths, 240);
  await page.locator('.microfront-result').waitFor();
  const earned = await profile(); report.earned = earned;
  assert.ok(earned.coins >= 200); assert.ok(earned.completedMissions.includes('membrane'));
  assert.ok((earned.fragments.PULSE_BREAK ?? 0) >= 5); assert.ok(earned.materials >= 10);
  await click('[data-action="camp-open-forge"]');
  await page.waitForFunction(() => !!window.__viral.snapshot().camp && window.__viral.snapshot().phase === 'playing');
  await campWalk([{ x: 0, y: 100 }, { x: -205, y: 100 }, { x: -205, y: 222 }, { x: -350, y: 222 }]); await campInteract('forge');
  await page.locator('[data-action="camp-craft"][data-template="PULSE_BREAK"][data-rarity="blue"]').waitFor();
  await screenshot('05-earned-forge');
  await click('[data-action="camp-craft"][data-template="PULSE_BREAK"][data-rarity="blue"]');
  let camp = await profile();
  assert.ok(camp.inventory.some(item => item.templateId === 'PULSE_BREAK' && item.rarity === 'blue' && item.repaired));
  await closeCampPanel(); await campWalk([{ x: -205, y: 222 }, { x: -205, y: -20 }, { x: -386, y: -20 }]); await campInteract('warehouse');
  await click('[data-action="camp-module"][data-module="PULSE_BREAK"]');
  camp = await profile(); assert.ok(camp.equippedModules.includes('PULSE_BREAK'));
  await screenshot('06-equipped-module');
  await closeCampPanel();
  await campWalk([{ x: -205, y: -20 }, { x: -205, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 250 }, { x: 205, y: 250 }, { x: 205, y: 340 }, { x: 335, y: 340 }]); await campInteract('departure');
  await click('[data-action="camp-mission"][data-mission="corridor"]');
  await click('[data-action="camp-deploy"]');
  await page.waitForFunction(() => !window.__viral.snapshot().camp && window.__viral.snapshot().phase === 'playing');
  state = await snapshot();
  assert.equal(state.expedition.missionId, 'corridor');
  assert.ok(state.growth.equipped.some(module => module.id === 'PULSE_BREAK' && module.rank === 1));
  report.secondDeparture = { seed: state.seed, missionId: state.expedition.missionId, modules: state.expedition.modules,
    equipped: state.growth.equipped, loadout: state.expedition.loadout };
  await screenshot('07-second-departure');
  assert.deepEqual(report.pageErrors, []); report.pass = true;
} catch (error) {
  report.error = error.stack ?? String(error);
  try { report.finalSnapshot = await snapshot(); report.finalProfile = await profile(); await screenshot('failure'); } catch {}
  console.error(report.error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.sourcesAfter = Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
  report.inputsUnchanged = Object.entries(report.sources).every(([path, hash]) => report.sourcesAfter[path] === hash);
  if (!report.inputsUnchanged) { report.pass = false; report.driftNote = 'Source changed during this route; preserve the result as process evidence.'; process.exitCode = 1; }
  await save(); await browser.close(); console.log(JSON.stringify({ pass: report.pass, report: join(output, 'report.json') }));
}
