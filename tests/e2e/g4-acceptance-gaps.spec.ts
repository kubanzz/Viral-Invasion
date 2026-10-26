import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aim, readState, walk } from './campaignDriver';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld, BALANCE, type GameEvent, type GameState, type Target, type Tool, type Vec } from '../../src/game/types';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { waypoint } from '../helpers/g3Driver';

test.use({ trace: 'off', video: 'off' });
const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
const seed = 130026;
type InputRecord = { tick: number; description: string; tool?: Tool; aim?: Vec; keys?: string[]; durationMs?: number };

/** Existing G1 product fixture, entered by URL; this is not the full two-organ campaign. */
async function openFixture(page: Page, context: BrowserContext, trait: 'FISSION' | 'CARAPACE') {
  const errors: string[] = [], remote: string[] = [], events = new Map<string, GameEvent>(), inputs: InputRecord[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await context.setOffline(true);
  await context.route(/^https?:/i, async route => { remote.push(route.request().url()); await route.abort('internetdisconnected'); });
  const url = `${entry}?fixture=G1&seed=${seed}&trait=${trait}`;
  await page.goto(url);
  await page.locator('[data-action="start"]').click();
  const snapshot = async () => {
    const state = await readState(page);
    for (const event of state.events) events.set(JSON.stringify(event), event);
    return state;
  };
  const initial = await snapshot();
  expect(initial.battle?.milestone).toBe('G1');
  expect(initial.campaign).toBeUndefined();
  expect(initial.growth).toBeUndefined();
  const metadata = { url, seed, fixture: 'Existing G1 heart regression slice in the real release; not the full G3/G4 campaign.',
    method: 'Real DOM keyboard/mouse only; window.__viral is read-only. No game time, HP, targets, equipment or progress are written.',
    scope: 'Range clearing/critical recovery mechanics only. Not human comprehension, standard-session pacing, or a full campaign victory.' };
  return { errors, remote, events, inputs, snapshot, initial, metadata };
}

async function move(page: Page, state: GameState, destination: Vec, inputs: InputRecord[], durationMs = 150) {
  const point = waypoint(state, destination), direction = normalized(point.x - state.player.x, point.y - state.player.y);
  const keys = [Math.abs(direction.x) > .383 ? direction.x > 0 ? 'KeyD' : 'KeyA' : '',
    Math.abs(direction.y) > .383 ? direction.y > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
  inputs.push({ tick: state.tick, description: 'Move around actual collision footprints', keys, durationMs });
  for (const key of keys) await page.keyboard.down(key);
  try { await page.waitForTimeout(durationMs); }
  finally { for (const key of keys) await page.keyboard.up(key); }
}

async function fireFor(page: Page, state: GameState, tool: Tool, target: Vec, inputs: InputRecord[], durationMs = 100) {
  await page.mouse.up();
  if (state.tool !== tool) await page.keyboard.press(`Digit${tool}`);
  await aim(page, target);
  inputs.push({ tick: state.tick, description: 'Use a normal tool through real mouse input', tool, aim: { x: target.x, y: target.y }, durationMs });
  await page.mouse.down();
  try { await page.waitForTimeout(durationMs); }
  finally { await page.mouse.up(); }
}

const targetVisible = (state: GameState, target: Target) => {
  const length = distance(state.player, target);
  const wall = wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), length, activeWorld(state));
  return length <= 420 && (wall === null || wall >= length - target.radius);
};
function save(info: TestInfo, filename: string, evidence: unknown) {
  writeFileSync(info.outputPath(filename), JSON.stringify(evidence, null, 2));
}

test('RUN04 gap: G1 fixture real FISSION mother -> two finite children -> one basic area clear, no grandchildren', async ({ page, context }, info) => {
  test.setTimeout(110000);
  const audit = await openFixture(page, context, 'FISSION');
  const checkpoints: Record<string, GameState> = {};
  let parentId = '', childIds: string[] = [];
  try {
    // Clear sources and the initial ordinary wave before the first trait applies.
    // This isolates lineage without deleting actors or changing their HP in diagnostics.
    await walk(page, { x: 640, y: 500 }, 30);
    const deadline = Date.now() + 45000;
    let preludeCleared = false;
    while (Date.now() < deadline) {
      const state = await audit.snapshot();
      expect(state.phase).toBe('playing');
      expect(state.battle!.traits, 'Initial cleanup must finish before actual FISSION evolution.').toEqual([]);
      const live = state.targets.filter(target => target.hp > 0);
      if (!live.length) { preludeCleared = true; checkpoints.preludeCleared = state; break; }
      const target = live.slice().sort((a, b) => Number(b.role === 'source') - Number(a.role === 'source') || distance(state.player, a) - distance(state.player, b))[0];
      if (!targetVisible(state, target)) await move(page, state, target, audit.inputs);
      else await fireFor(page, state, 1, target, audit.inputs);
    }
    expect(preludeCleared, 'Two live sources and the initial wave must be removed by legal precision shots.').toBe(true);
    expect(checkpoints.preludeCleared.battle!.stats.sourceClears).toBe(2);
    await page.screenshot({ path: info.outputPath('run04-sources-cleared.png') });
    await expect.poll(async () => (await audit.snapshot()).targets.some(target => target.hp > 0 && target.role === 'elite' && target.traits?.includes('FISSION')), { timeout: 35000 }).toBe(true);
    checkpoints.motherAlive = await audit.snapshot();
    const parent = checkpoints.motherAlive.targets.find(target => target.hp > 0 && target.role === 'elite' && target.traits?.includes('FISSION'))!;
    parentId = parent.id;
    expect(parent.generation).toBe(0);
    expect(checkpoints.motherAlive.targets.filter(target => target.hp > 0)).toHaveLength(1);
    await page.screenshot({ path: info.outputPath('run04-mother.png') });
    const killDeadline = Date.now() + 15000;
    while (Date.now() < killDeadline) {
      const state = await audit.snapshot(), current = state.targets.find(target => target.id === parentId);
      expect(state.phase).toBe('playing');
      if (!current || current.hp <= 0) { checkpoints.motherKilled = state; break; }
      if (!targetVisible(state, current)) await move(page, state, current, audit.inputs);
      else await fireFor(page, state, 1, current, audit.inputs, 80);
    }
    expect(checkpoints.motherKilled, 'The identified mother must actually die from basic tool input.').toBeDefined();
    const splitWarning = [...audit.events.values()].find(event => event.type === 'FISSION_WARNING' && event.data.parentId === parentId)!;
    expect(splitWarning).toBeDefined();
    expect(splitWarning.data.children).toBe(2);
    await expect.poll(async () => {
      await audit.snapshot();
      return [...audit.events.values()].some(event => event.type === 'FISSION_SPAWNED' && event.data.parentId === parentId);
    }, { timeout: 4000 }).toBe(true);
    checkpoints.childrenAlive = await audit.snapshot();
    const split = [...audit.events.values()].find(event => event.type === 'FISSION_SPAWNED' && event.data.parentId === parentId)!;
    expect(split.data).toMatchObject({ children: 2, generation: 1 });
    expect(split.tick - splitWarning.tick).toBeGreaterThanOrEqual(Math.round(BATTLE_BALANCE.fissionDelay / BALANCE.step) - 1);
    childIds = [...audit.events.values()].filter(event => event.type === 'ACTOR_SPAWNED' && event.tick === split.tick && event.data.generation === 1).map(event => String(event.data.id));
    expect(childIds).toHaveLength(2);
    const children = checkpoints.childrenAlive.targets.filter(target => childIds.includes(target.id));
    expect(children).toHaveLength(2);
    expect(children.every(target => target.hp === BATTLE_BALANCE.childHp && target.maxHp === BATTLE_BALANCE.childHp && target.generation === 1)).toBe(true);
    expect(checkpoints.childrenAlive.targets.filter(target => target.hp > 0).map(target => target.id).sort()).toEqual([...childIds].sort());
    await page.screenshot({ path: info.outputPath('run04-finite-children.png') });
    const center = { x: (children[0].x + children[1].x) / 2, y: (children[0].y + children[1].y) / 2 };
    expect(children.every(target => distance(center, target) < BALANCE.areaRadius)).toBe(true);
    await fireFor(page, checkpoints.childrenAlive, 2, center, audit.inputs, 100);
    await expect.poll(async () => (await audit.snapshot()).targets.filter(target => target.hp > 0 && childIds.includes(target.id)).length, { timeout: 3000 }).toBe(0);
    checkpoints.areaClear = await audit.snapshot();
    const childHits = [...audit.events.values()].filter(event => event.type === 'TARGET_HIT' && childIds.includes(String(event.data.id)));
    expect(childHits).toHaveLength(2);
    expect(childHits.every(event => event.data.tool === 2 && event.data.cause === 'basic' && event.data.remainingHp === 0 && event.data.damage === BATTLE_BALANCE.childHp)).toBe(true);
    expect(new Set(childHits.map(event => event.tick)).size, 'One legal area burst must clear both children in the same simulation tick.').toBe(1);
    const observedUntil = checkpoints.areaClear.elapsed + BATTLE_BALANCE.fissionDelay + 1.6;
    await expect.poll(async () => (await audit.snapshot()).elapsed, { timeout: 4500 }).toBeGreaterThanOrEqual(observedUntil);
    checkpoints.noGrandchildren = await audit.snapshot();
    expect(checkpoints.noGrandchildren.targets.filter(target => target.hp > 0)).toHaveLength(0);
    expect([...audit.events.values()].filter(event => event.type === 'FISSION_SPAWNED')).toHaveLength(1);
    expect([...audit.events.values()].some(event => event.type === 'FISSION_WARNING' && childIds.includes(String(event.data.parentId)))).toBe(false);
    expect([...audit.events.values()].some(event => event.type === 'ACTOR_SPAWNED' && Number(event.data.generation) > 1)).toBe(false);
    expect(checkpoints.noGrandchildren.result).toBeNull();
    await page.screenshot({ path: info.outputPath('run04-area-clear.png') });
    expect(audit.errors).toEqual([]); expect(audit.remote).toEqual([]);
  } finally {
    await page.mouse.up();
    save(info, 'run04-lineage.json', { ...audit.metadata, parentId, childIds, checkpoints, inputs: audit.inputs, events: [...audit.events.values()], errors: audit.errors, remote: audit.remote, final: await audit.snapshot() });
  }
});

test('RUN09 gap: G1 fixture real infection 100 -> legal repair cancels countdown -> fresh same-seed real HP death', async ({ page, context }, info) => {
  test.setTimeout(400000);
  const audit = await openFixture(page, context, 'CARAPACE');
  const checkpoints: Record<string, GameState> = {}, samples: unknown[] = [];
  try {
    // Preserve both real sources. Kiting is normal WASD movement, not an idle invulnerability fixture.
    // Occasional effective repair protects the organ; we never award relief from an undamaged tissue.
    const corners = [{ x: 620, y: 480 }, { x: 850, y: 480 }, { x: 850, y: 700 }, { x: 620, y: 700 }];
    await walk(page, corners[0], 30);
    let corner = 1, nextSample = 0;
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      const state = await audit.snapshot();
      expect(state.phase, `Legal kiting must stay alive until infection reaches 100; infection=${state.battle!.pressure.infection}, reason=${state.result?.reason}`).toBe('playing');
      expect(state.battle!.stats.sourceClears).toBe(0);
      expect(state.battle!.stats.kills).toBe(0);
      if (state.elapsed >= nextSample) {
        samples.push({ tick: state.tick, elapsed: state.elapsed, infection: state.battle!.pressure.infection,
          hp: state.player.hp, tissue: state.tissue.hp, vitality: state.battle!.pressure.vitality, alive: state.targets.filter(target => target.hp > 0).length });
        nextSample = state.elapsed + 5;
      }
      if (state.battle!.pressure.infection === 100 && state.battle!.pressure.criticalSince !== null) {
        checkpoints.critical = state; break;
      }
      const repairNeeded = state.tissue.hp < 40 || state.player.hp < 70 && state.tissue.hp < 95
        || state.battle!.pressure.vitality < 25 && state.tissue.hp < 70;
      if (repairNeeded && state.cooldowns[3] <= state.elapsed) await fireFor(page, state, 3, state.tissue, audit.inputs, 80);
      if (distance(state.player, corners[corner]) < 30) corner = (corner + 1) % corners.length;
      await move(page, await audit.snapshot(), corners[corner], audit.inputs, 150);
    }
    expect(checkpoints.critical, 'No state injection: real source growth must actually reach 100 within the legal-input budget.').toBeDefined();
    expect(checkpoints.critical.battle!.pressure.infection).toBe(100);
    expect(checkpoints.critical.player.hp).toBeGreaterThan(0);
    expect(checkpoints.critical.battle!.pressure.vitality).toBeGreaterThan(0);
    const started = [...audit.events.values()].reverse().find(event => event.type === 'INFECTION_CRISIS_STARTED')!;
    expect(started).toBeDefined();
    expect(Number(started.data.deadline) - started.tick * BALANCE.step).toBeCloseTo(BATTLE_BALANCE.crisisDuration, 5);
    await expect(page.locator('#crisis-label')).toContainText('感染失控');
    await page.screenshot({ path: info.outputPath('run09-infection-100.png') });
    await expect.poll(async () => { const state = await audit.snapshot(); return state.cooldowns[3] <= state.elapsed; }, { timeout: 1800 }).toBe(true);
    const beforeRepair = await audit.snapshot();
    expect(beforeRepair.tissue.hp, 'Recovery requires actually damaged tissue, not a full-HP no-op.').toBeLessThan(100);
    await fireFor(page, beforeRepair, 3, beforeRepair.tissue, audit.inputs, 120);
    await expect.poll(async () => {
      const state = await audit.snapshot();
      return state.battle!.pressure.criticalSince === null && state.battle!.pressure.infection < 100;
    }, { timeout: 3000 }).toBe(true);
    checkpoints.recovered = await audit.snapshot();
    const repair = [...audit.events.values()].find(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.tick > beforeRepair.tick && event.data.reason === 'repair' && Number(event.data.after) > Number(event.data.before));
    const relief = [...audit.events.values()].find(event => event.type === 'PRESSURE_RELIEVED' && event.tick > beforeRepair.tick && event.data.reason === 'repair');
    const recovered = [...audit.events.values()].find(event => event.type === 'INFECTION_CRISIS_RECOVERED' && event.tick > beforeRepair.tick);
    expect(repair).toBeDefined(); expect(relief).toBeDefined(); expect(recovered).toBeDefined();
    expect(recovered!.tick).toBe(repair!.tick);
    expect(checkpoints.recovered.battle!.stats.kills).toBe(beforeRepair.battle!.stats.kills);
    expect(checkpoints.recovered.battle!.stats.sourceClears).toBe(0);
    expect(checkpoints.recovered.phase).toBe('playing');
    expect(checkpoints.recovered.result).toBeNull();
    expect(Number(started.data.deadline)).toBeGreaterThan(checkpoints.recovered.elapsed);
    await page.screenshot({ path: info.outputPath('run09-repair-recovered.png') });
    // RUN09 also requires a separate genuine failure. Restart via the actual pause UI,
    // then stand near the initial attackers without firing/healing until their HP damage is terminal.
    await page.keyboard.press('Escape');
    await page.locator('[data-action="retry"]').click();
    checkpoints.retry = await audit.snapshot();
    expect(checkpoints.retry.seed).toBe(seed); expect(checkpoints.retry.player.hp).toBe(100);
    expect(checkpoints.retry.battle!.pressure.criticalSince).toBeNull();
    await walk(page, { x: 610, y: 420 }, 25);
    await expect.poll(async () => (await audit.snapshot()).phase, { timeout: 65000, intervals: [200] }).toBe('result');
    checkpoints.realFailure = await audit.snapshot();
    expect(checkpoints.realFailure.player.hp).toBe(0);
    expect(checkpoints.realFailure.result).toMatchObject({ success: false });
    expect(checkpoints.realFailure.result!.reason).toContain('耐久耗尽');
    expect(checkpoints.realFailure.events.filter(event => event.type === 'RUN_ENDED')).toHaveLength(1);
    await page.screenshot({ path: info.outputPath('run09-real-hp-failure.png') });
    expect(audit.errors).toEqual([]); expect(audit.remote).toEqual([]);
  } finally {
    await page.mouse.up();
    save(info, 'run09-recovery.json', { ...audit.metadata, checkpoints, samples, inputs: audit.inputs, events: [...audit.events.values()], errors: audit.errors, remote: audit.remote, final: await audit.snapshot() });
  }
});
