import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target } from '../../src/game/types';
import { TERRITORY_BALANCE } from '../../src/game/territory';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { TerritoryProfileStore } from '../../src/meta/endlessProfile';
import { supplyTerritoryDefense } from '../fixtures/territoryDefense';

const idle = (game: GameSession, extra: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0,
  fire: false, aim: { x: game.state.player.x + 100, y: game.state.player.y }, ...extra });
const step = (game: GameSession, frames = 1, extra: Partial<InputFrame> = {}) => {
  for (let frame = 0; frame < frames; frame++) game.step(idle(game, extra));
};
function run(wave = 1, recordId?: string) {
  const game = new GameSession(71, { mode: 'endless', territory: true, ...(recordId ? { recordId } : {}) }); game.start();
  // Isolate accepted rule transactions from the ordinary finite spawn schedule.
  Object.assign(game.state.endless!, { wave, phase: wave >= 3 ? 'combat' : 'warning', phaseUntil: Infinity, remainingToSpawn: wave >= 3 ? 1 : 0,
    batchSchedule: [], batchIndex: 0, batchMemberIndex: 0, nextSpawnAt: Infinity });
  return game;
}
/** The actual session damage transaction emits accepted hits/deaths, without fabricated events. */
function damage(game: GameSession, target: Target, amount = target.maxHp) {
  return (game as unknown as { damage(target: Target, amount: number): number }).damage(target, amount);
}
function sources(game: GameSession) {
  return ['source-west', 'source-east'].map(id => game.state.targets.find(target => target.territorySourceId === id && target.role === 'source')!);
}
/** Supply already-reclaimed lanes only for tests of later death/settlement transactions. */
function openSourceLanes(game: GameSession) {
  for (const node of game.state.territory!.nodes) if (node.kind === 'front' || node.kind === 'healing') {
    node.owner = 'healthy'; node.infectionProgress = 0; node.purificationProgress = 100;
  }
  supplyTerritoryDefense(game.state);
}
function infectedSpring(game: GameSession) {
  const node = game.state.territory!.nodes.find(item => item.id === 'heart-healing-2')!;
  node.owner = 'infected'; node.infectionProgress = 100; node.purificationProgress = 0;
  return node;
}
function choose(game: GameSession) {
  const state = game.state, draft = state.endlessGrowth!.draft!;
  const option = draft.options.find(item => item.id !== 'vitality') ?? draft.options[0];
  expect(game.chooseCombatUpgrade(draft.id, option.id, state.growth!.runId)).toBe(true);
  if (state.growth!.draft) game.discardDraft(state.growth!.draft.id);
}
function bossFixture(recordId?: string) {
  const game = run(3, recordId); step(game);
  openSourceLanes(game);
  for (const source of sources(game)) damage(game, source);
  game.state.endless!.phase = 'combat'; step(game);
  expect(game.state.endlessGrowth!.draft).not.toBeNull(); choose(game); step(game);
  expect(game.state.territory!.stage).toBe('boss');
  return game;
}
function defeatBoss(game: GameSession) {
  const state = game.state, boss = state.targets.find(target => target.id === state.territory!.bossId)!;
  // Supply the completed membrane state as a fixture; the final hit still uses real damage/death.
  state.territory!.bossCombat!.membrane.remaining = 0;
  state.territory!.bossCombat!.seenTraits = [...state.territory!.bossCombat!.traits];
  damage(game, boss, boss.maxHp * 10);
}

describe('production territory session transactions', () => {
  it('initializes seven authoritative regions and allows immediate Q deployment to guard core without changing legacy fixtures', () => {
    const game = run(), state = game.state;
    expect(state.territory!.nodes).toHaveLength(7); expect(state.territory!.nodes.filter(node => node.owner === 'healthy')).toHaveLength(3);
    expect(state.territory!.stage).toBe('rescue'); expect(state.playerInfection).toBeNull();
    step(game, 1, { scan: true, aim: state.tissue });
    expect(state.growth!.beacons?.some(beacon => beacon.guard?.kind === 'territory' && beacon.guard.regionId === 'core')).toBe(true);
    expect(state.growth!.cells?.length).toBeGreaterThan(0);
    const legacy = new GameSession(71, { mode: 'endless' }); legacy.start(); expect(legacy.state.territory).toBeUndefined();
  });

  it('recovers gradually at a healthy fountain, clears infection after contact and freezes while paused', () => {
    const game = run(), state = game.state, fountain = state.territory!.nodes.find(node => node.kind === 'healing' && node.owner === 'healthy')!;
    Object.assign(state.player, { x: fountain.x, y: fountain.y, hp: 50 });
    state.playerInfection = { until: 8, nextTickAt: 4 };
    step(game, 30); expect(state.player.hp).toBeCloseTo(51.5, 6); expect(state.playerInfection).not.toBeNull();
    step(game, 30); expect(state.player.hp).toBeCloseTo(53, 6); expect(state.playerInfection).toBeNull();
    game.pause(); const before = game.snapshot(); step(game, 120); expect(game.snapshot()).toEqual(before);
    game.resume(); Object.assign(state.player, { x: 900, y: 900 }); const hp = state.player.hp; step(game, 60); expect(state.player.hp).toBe(hp);
  });

  it('tool 3 starts a timed purification instead of applying an instant heal', () => {
    const game = run(), state = game.state, node = infectedSpring(game);
    Object.assign(state.player, { x: node.x, y: node.y, hp: 50 });
    step(game, 1, { tool: 3, fire: true, aim: node });
    expect(state.player.hp).toBe(50); expect(state.territory!.purification?.nodeId).toBe(node.id); expect(node.owner).toBe('infected');
    expect(node.purificationProgress).toBeCloseTo(100 / (TERRITORY_BALANCE.purificationSeconds * 60), 6);
    step(game, 59); expect(node.purificationProgress).toBeCloseTo(100 / TERRITORY_BALANCE.purificationSeconds, 6);
    step(game, 119); expect(node.owner).toBe('infected'); expect(node.purificationProgress).toBeLessThan(100);
    step(game, 1);
    expect(node.owner).toBe('healthy'); expect(state.endless!.score).toBe(100);
    step(game, 120, { tool: 3, fire: true, aim: node }); expect(state.endless!.score).toBe(100);
  });

  it('tool 3 still repairs the heart core without healing the rescue body', () => {
    const game = run(), state = game.state;
    Object.assign(state.player, { x: state.tissue.x - 90, y: state.tissue.y, hp: 50 }); state.tissue.hp = 43;
    step(game, 1, { tool: 3, fire: true, aim: state.tissue });
    expect(state.tissue.hp).toBe(68); expect(state.player.hp).toBe(50);
    expect(state.events.some(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'repair')).toBe(true);
  });

  it('keeps earned purification progress when the player leaves then resumes on return', () => {
    const game = run(), state = game.state, node = infectedSpring(game);
    Object.assign(state.player, { x: node.x, y: node.y }); step(game, 1, { tool: 3, fire: true, aim: node }); step(game, 60);
    const progress = node.purificationProgress; Object.assign(state.player, { x: 900, y: 900 }); step(game, 60);
    expect(node.purificationProgress).toBe(progress); Object.assign(state.player, { x: node.x, y: node.y }); step(game, 120);
    expect(node.owner).toBe('healthy');
  });

  it('clear-wave choices give no automatic player or core supply and wave five has no old rescue exit', () => {
    const game = run(5), state = game.state; state.player.hp = 43; state.tissue.hp = 61;
    state.endless!.clearedWaves = 5; game.completeWave(5);
    expect(state.endless!.stageCheckpoint).toBeUndefined(); choose(game);
    expect(state.player.hp).toBe(43); expect(state.tissue.hp).toBe(61);
    expect(game.finishEndlessStage()).toBe(false); expect(game.continueEndlessStage()).toBe(false);
    expect(state.territory!.stage).toBe('rescue');
  });

  it('only activates persistent sources from wave three and rewards a real source death once', () => {
    const game = run(2); step(game); expect(sources(game).filter(Boolean)).toHaveLength(0);
    Object.assign(game.state.endless!, { wave: 3, phase: 'combat', remainingToSpawn: 1 }); step(game); const [source] = sources(game);
    expect(source).toMatchObject({ role: 'source', blocksWaveClear: false, hp: 1200 });
    openSourceLanes(game);
    const before = game.state.endless!.score; damage(game, source);
    expect(game.state.territory!.sources['source-west'].destroyed).toBe(true);
    expect(game.state.endless!.score - before).toBe(600); // 500 source + first territory purification 100.
    const score = game.state.endless!.score; expect(damage(game, source)).toBe(0); step(game);
    expect(game.state.endless!.score).toBe(score);
    expect(game.state.territory!.nodes.find(node => node.id === 'source-west')).toMatchObject({ permanent: true, owner: 'healthy' });
  });

  it('keeps both sources dormant throughout the real wave-three warning and activates them only in combat', () => {
    const game = run(3), state = game.state;
    Object.assign(state.endless!, { phase: 'warning', phaseUntil: 8 });
    const west = state.territory!.nodes.find(node => node.id === 'source-west')!;
    step(game, 479, { tool: 1, fire: true, aim: west });
    expect(state.endless!.phase).toBe('warning'); expect(sources(game).filter(Boolean)).toHaveLength(0);
    expect(Object.values(state.territory!.sources).every(source => !source.spawned && !source.unlocked && !source.destroyed)).toBe(true);
    expect(state.endless!.score).toBe(0);
    step(game);
    expect(state.endless!.phase).toBe('combat'); expect(sources(game).filter(Boolean)).toHaveLength(2);
    expect(Object.values(state.territory!.sources).every(source => source.spawned && source.unlocked)).toBe(true);
    expect(state.events.filter(event => event.type === 'TERRITORY_SOURCE_ACTIVATED')).toHaveLength(2);
  });

  it('keeps source death scoring idempotent under a reentrant accepted-death subscriber', () => {
    const game = run(3); step(game); const [source] = sources(game);
    openSourceLanes(game);
    let nestedDamage = -1;
    game.bus.on('event', event => {
      if (event.type === 'TERRITORY_SOURCE_DESTROYED' && event.data.sourceId === 'source-west') nestedDamage = damage(game, source);
    });
    damage(game, source);
    expect(nestedDamage).toBe(0); expect(game.state.endless!.score).toBe(600);
    expect(game.state.events.filter(event => event.type === 'TERRITORY_SOURCE_DESTROYED')).toHaveLength(1);
  });

  it('reserves pending fission before admitting persistent sources under the shared 48 body cap', () => {
    const game = run(3), state = game.state;
    state.targets = Array.from({ length: 46 }, (_, index) => ({ id: `cap-${index}`, role: 'virus' as const, kind: 'single' as const,
      x: 200 + index % 10 * 45, y: 200 + Math.floor(index / 10) * 45, radius: 22, hp: 68, maxHp: 68,
      hitUntil: 0, scanned: false, traits: [], born: 0, sourceId: 'endless:wave:3' }));
    state.targets.push({ id: 'reserved-parent', role: 'virus', kind: 'cluster', x: 850, y: 550, radius: 22,
      hp: 0, maxHp: 68, hitUntil: 0, scanned: false, traits: ['FISSION'], generation: 0, sourceId: 'endless:wave:3',
      splitAt: .5, splitPositions: [{ x: 825, y: 550 }, { x: 875, y: 550 }] });
    step(game); expect(sources(game).filter(Boolean)).toHaveLength(0); expect(state.endless!.pendingChildren).toBe(2);
    step(game, 31); expect(state.targets.filter(target => target.hp > 0)).toHaveLength(48);
    expect(sources(game).filter(Boolean)).toHaveLength(0);
    const child = state.targets.find(target => target.hp > 0 && target.generation === 1)!; damage(game, child); step(game);
    expect(sources(game).filter(Boolean)).toHaveLength(1); expect(state.targets.filter(target => target.hp > 0)).toHaveLength(48);
  });

  it('cuts only the unspawned finite queue after both sources die, then offers the earned wave choice before boss', () => {
    const game = run(3), state = game.state; step(game);
    openSourceLanes(game);
    Object.assign(state.endless!, { remainingToSpawn: 17, batchSchedule: [{ at: 999, sector: 0, spread: .2, roles: ['ordinary'] }] });
    for (const source of sources(game)) damage(game, source);
    // Private damage injection bypasses the fixed-step tail; explicitly finish
    // that objective transaction before inspecting the canceled birth queue.
    (game as unknown as {advanceTerritoryGoal():void}).advanceTerritoryGoal();
    expect(state.territory!.stage).toBe('bossPending'); expect(state.endless!.remainingToSpawn).toBe(0); expect(state.endless!.canceledToSpawn).toBe(17);
    state.endless!.phase = 'combat'; step(game);
    expect(state.phase).toBe('paused'); expect(state.endlessGrowth!.draft).not.toBeNull(); expect(state.territory!.stage).toBe('bossPending');
    choose(game); step(game); expect(state.territory!.stage).toBe('boss');
    expect(state.targets.filter(target => target.role === 'core' && target.hp > 0)).toHaveLength(1);
    expect(state.territory!.bossCombat?.traits).toHaveLength(1);
  });

  it('does not score genuine fission children but still requires them to be cleared', () => {
    const game = run(), state = game.state;
    const child: Target = { id: 'territory-child', kind: 'single', role: 'virus', generation: 1, x: 600, y: 600,
      radius: 14, hp: 22, maxHp: 22, hitUntil: 0, scanned: false, traits: [], sourceId: 'endless:wave:1', waveId: 1, blocksWaveClear: true };
    state.targets.push(child); state.endless!.phase = 'combat';
    step(game); expect(state.endless!.clearedWaves).toBe(0);
    const before = state.endless!.score; damage(game, child); expect(state.endless!.score).toBe(before);
    step(game); expect(state.endless!.clearedWaves).toBe(1); expect(state.endlessGrowth!.draft).not.toBeNull();
  });

  it('holds bossPending through promised fission births and their actual cleanup', () => {
    const game = run(3), state = game.state; step(game);
    openSourceLanes(game);
    const parent: Target = { id: 'pending-parent', kind: 'cluster', role: 'virus', traits: ['FISSION'], generation: 0,
      sourceId: 'endless:wave:3', waveId: 3, blocksWaveClear: true, x: 800, y: 600, radius: 22,
      hp: 68, maxHp: 68, hitUntil: 0, scanned: false };
    state.targets.push(parent); damage(game, parent); for (const source of sources(game)) damage(game, source);
    state.endless!.phase = 'combat'; step(game);
    expect(state.territory!.stage).toBe('bossPending'); expect(state.endless!.pendingChildren).toBe(2);
    expect(state.endlessGrowth!.draft).toBeNull();
    step(game, Math.ceil((BATTLE_BALANCE.fissionDelay + .1) * 60));
    const children = state.targets.filter(target => target.hp > 0 && target.generation === 1);
    expect(children).toHaveLength(2); expect(state.territory!.stage).toBe('bossPending'); expect(state.endlessGrowth!.draft).toBeNull();
    for (const child of children) damage(game, child); step(game); choose(game); step(game);
    expect(state.territory!.stage).toBe('boss');
  });

  it('writes the victory checkpoint before result and preserves it through guard failure in the same run', () => {
    const game = bossFixture(), state = game.state, store = new TerritoryProfileStore(null), runId = state.growth!.runId;
    game.bus.on('event', event => { if (event.type === 'TERRITORY_RESCUE_COMPLETED' || event.type === 'RUN_ENDED') store.checkpoint(game.state); });
    defeatBoss(game); step(game);
    expect(state.phase).toBe('paused'); expect(state.result).toBeNull(); expect(state.territory!.stage).toBe('victory');
    expect(store.data).toMatchObject({ runs: 1, rescues: 1 }); const saved = structuredClone(state.territory!.rescueSnapshot);
    game.resume(); expect(state.phase).toBe('paused');
    expect(game.continueTerritoryGuard()).toBe(true); expect(state.phase).toBe('playing'); expect(state.growth!.runId).toBe(runId);
    store.checkpoint(state); state.player.hp = 0; step(game);
    expect(state.result?.success).toBe(false); expect(state.territory!.rescueSnapshot).toEqual(saved);
    expect(store.data).toMatchObject({ runs: 1, rescues: 1 }); expect(store.data.recentRuns[0].guard.ended).toBe(true);
    expect(game.finishTerritoryRescue()).toBe(false);
  });

  it('keeps an infected spring after mother death and only saves after real final purification', () => {
    const game = bossFixture(), state = game.state, spring = infectedSpring(game);
    defeatBoss(game); step(game);
    expect(state.phase).toBe('playing'); expect(state.territory!.stage).toBe('cleanup');
    expect(spring.owner).toBe('infected'); expect(state.territory!.rescueSnapshot).toBeUndefined();
    Object.assign(state.player, { x: spring.x, y: spring.y });
    step(game, 1, { territoryAction: true }); step(game, 181);
    expect(spring.owner).toBe('healthy'); expect(state.territory!.stage).toBe('victory');
    expect(state.territory!.rescueSnapshot).toBeDefined();
  });

  it('retains living invaders and ordinary enemies in final cleanup instead of silently erasing them', () => {
    const game = bossFixture(), state = game.state;
    const enemy: Target = { id: 'cleanup-enemy', kind: 'single', role: 'virus', x: 500, y: 500, radius: 20,
      hp: 50, maxHp: 50, hitUntil: 0, scanned: false, traits: [] };
    state.targets.push(enemy); defeatBoss(game); step(game);
    expect(state.territory!.stage).toBe('cleanup'); expect(enemy.hp).toBe(50);
    expect(state.targets).toContain(enemy); expect(state.territory!.rescueSnapshot).toBeUndefined();
    damage(game, enemy); step(game);
    expect(state.territory!.stage).toBe('victory');
  });

  it('counts independent same-seed sessions across reloads while keeping each record callback and guard idempotent', () => {
    const items = new Map<string, string>(), storage = { getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } };
    const first = bossFixture('record-A'), firstStore = new TerritoryProfileStore(storage), simulationId = first.state.growth!.runId;
    defeatBoss(first); step(first);
    expect(first.state.territory!.rescueSnapshot!.runId).toBe('record-A');
    expect(first.state.growth!.runId).toBe(simulationId);
    expect(firstStore.checkpoint(first.state, 'record-A')).toMatchObject({ kind: 'recorded', persisted: true });
    const original = first.snapshot();
    expect(firstStore.checkpoint(first.state, 'record-A').kind).toBe('duplicate');
    expect(first.continueTerritoryGuard()).toBe(true); firstStore.checkpoint(first.state, 'record-A');
    first.state.player.hp = 0; step(first); firstStore.recordRun(first.state, 'record-A');
    firstStore.checkpoint(original, 'record-A');
    expect(firstStore.data).toMatchObject({ runs: 1, rescues: 1 });
    expect(firstStore.data.recentRuns[0]).toMatchObject({ ended: true, guard: { started: true, ended: true } });

    // Fresh GameSession and Store simulate a reload. Simulation IDs repeat by
    // design; the separately supplied record identity must not collide.
    const second = bossFixture('record-B'), reloadedStore = new TerritoryProfileStore(storage);
    expect(second.state.growth!.runId).toBe(simulationId);
    defeatBoss(second); step(second);
    expect(second.state.territory!.rescueSnapshot!.runId).toBe('record-B');
    expect(reloadedStore.checkpoint(second.state, 'record-B')).toMatchObject({ kind: 'recorded', persisted: true });
    expect(reloadedStore.checkpoint(second.state, 'record-B').kind).toBe('duplicate');
    expect(new TerritoryProfileStore(storage).data).toMatchObject({ runs: 2, rescues: 2 });
    expect(new TerritoryProfileStore(storage).data.recentRunIds).toEqual(['record-A', 'record-B']);
  });

  it('uses the independent record identity for failed sessions without a rescue snapshot', () => {
    const store = new TerritoryProfileStore(null), first = run(1, 'failed-A'), second = run(1, 'failed-B');
    expect(first.state.growth!.runId).toBe(second.state.growth!.runId);
    for (const game of [first, second]) { game.state.player.hp = 0; step(game); expect(store.recordRun(game.state).kind).toBe('recorded'); }
    expect(store.data).toMatchObject({ runs: 2, rescues: 0 }); expect(store.data.recentRunIds).toEqual(['failed-A', 'failed-B']);
    expect(store.recordRun(first.state).kind).toBe('duplicate'); expect(store.data.runs).toBe(2);
  });

  it('settles latest guard metrics before returning to menu without counting a second rescue or run', () => {
    const items = new Map<string, string>(), storage = { getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } };
    const game = bossFixture('guard-menu-record'), store = new TerritoryProfileStore(storage);
    game.bus.on('event', event => {
      if (event.type === 'TERRITORY_RESCUE_COMPLETED' || event.type === 'RUN_ENDED') store.checkpoint(game.state, 'guard-menu-record');
    });
    defeatBoss(game); step(game); const receipt = structuredClone(game.state.territory!.rescueSnapshot);
    expect(game.continueTerritoryGuard()).toBe(true); store.checkpoint(game.state, 'guard-menu-record');
    const baselineScore = store.data.recentRuns[0].score;
    const body: Target = { id: 'guard-menu-body', kind: 'single', role: 'virus', generation: 0, sourceId: `endless:wave:${game.state.endless!.wave}`,
      x: 800, y: 500, hp: 34, maxHp: 34, radius: 22, hitUntil: 0, scanned: false, traits: [] };
    game.state.targets.push(body); damage(game, body); step(game, 30); game.pause();
    const finalScore = game.state.endless!.score, finalElapsed = game.state.elapsed;
    expect(finalScore).toBeGreaterThan(baselineScore);
    // The public menu action uses this existing finish event before menu resets
    // the session, so its subscriber sees the final live guard metrics.
    game.finish(true, '守卫结束：返回菜单，已完成的救援成果保留。'); game.menu();
    expect(game.state.phase).toBe('menu'); expect(store.data).toMatchObject({ runs: 1, rescues: 1, bestScore: finalScore });
    expect(store.data.recentRuns[0]).toMatchObject({ ended: true, score: finalScore, durationSeconds: finalElapsed,
      guard: { started: true, ended: true, score: finalScore }, rescue: { success: true, snapshot: receipt } });
    expect(new TerritoryProfileStore(storage).data).toEqual(store.data);
    game.menu(); expect(store.data).toMatchObject({ runs: 1, rescues: 1 });
  });

  it('finishes rescue explicitly once and gives a retry a fresh run identity', () => {
    const game = bossFixture(); defeatBoss(game); step(game); const runId = game.state.growth!.runId;
    expect(game.finishTerritoryRescue()).toBe(true); expect(game.state.result?.success).toBe(true);
    expect(game.finishTerritoryRescue()).toBe(false); expect(game.continueTerritoryGuard()).toBe(false);
    game.restart(); expect(game.state.growth!.runId).not.toBe(runId); expect(game.state.territory!.rescueSnapshot).toBeUndefined();
  });

  it.each(['player', 'core'] as const)('prioritizes same-step %s death over a defeated boss', fatal => {
    const game = bossFixture(); defeatBoss(game);
    if (fatal === 'player') game.state.player.hp = 0; else game.state.tissue.hp = 0;
    step(game); expect(game.state.phase).toBe('result'); expect(game.state.result?.success).toBe(false);
    expect(game.state.territory!.rescueSnapshot).toBeUndefined();
    expect(game.state.events.some(event => event.type === 'TERRITORY_RESCUE_COMPLETED')).toBe(false);
  });
  it('resolves an already scheduled infection tick before saving a defeated-mother rescue',()=>{
    const game=bossFixture();defeatBoss(game);game.state.player.hp=1;
    game.state.playerInfection={until:game.state.elapsed+8,nextTickAt:game.state.elapsed+1/60};
    step(game);expect(game.state.phase).toBe('result');expect(game.state.result?.success).toBe(false);
    expect(game.state.territory!.rescueSnapshot).toBeUndefined();
    expect(game.state.events.some(event=>event.type==='TERRITORY_RESCUE_COMPLETED')).toBe(false);
  });
});
