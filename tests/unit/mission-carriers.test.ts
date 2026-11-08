import { describe, expect, it } from 'vitest';
import { cancelTerritoryAssaults, ENDLESS_BALANCE, EndlessDirector } from '../../src/game/endless';
import type { EndlessHost } from '../../src/game/endlessTypes';
import { GameSession } from '../../src/game/session';
import { MISSION_COMBAT } from '../../src/game/missionCombat';
import type { MissionId } from '../../src/game/microfront';
import type { GameEvent, Target } from '../../src/game/types';

function fixture(missionId: MissionId = 'membrane', wave = 2, sourcesDestroyed = true) {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  game.configureExpedition({ runId: 'carrier-fixture', seed: 71, missionId,
    loadout: { weaponId: 'steady', rarity: 'white', upgrade: 0 }, blueprints: [], extraAntibodies: 0, firstClear: false });
  const state = game.state, e = state.endless!;
  state.targets = []; state.world = { ...state.world!, obstacles: [] };
  for (const source of Object.values(state.territory!.sources)) Object.assign(source, { destroyed: sourcesDestroyed, spawned: true });
  for (const node of state.territory!.nodes) Object.assign(node, { owner: 'healthy', infectionProgress: 0, purificationProgress: 0 });
  Object.assign(e, { wave: wave - 1, phase: 'intermission', phaseUntil: 0,
    territoryTasks: { wave: wave - 1, reservedSlots: [], squads: [] } });
  const events: GameEvent[] = [];
  let director: EndlessDirector;
  const host: EndlessHost = { state, emit(type, data) { const event = { type, data, tick: state.tick }; events.push(event); director.recordEvent(event); },
    effect() {}, message() {}, completeWave() {} };
  director = new EndlessDirector(host);
  const at = (seconds: number) => { state.elapsed = seconds; state.tick = Math.round(seconds * 60); director.beforeInput(); director.afterInput(); };
  director.beforeInput();
  const members = () => state.targets.filter(target => target.territoryTask?.squadKind === 'carrier');
  return { game, state, e, director, events, at, members, start: e.phaseUntil };
}

describe('finite mission carrier squads', () => {
  it('replaces exactly four baseline ordinary slots from wave2 without growing any mission budget', () => {
    for (const missionId of ['membrane', 'corridor', 'boundary'] as const) {
      for (let wave = 1; wave <= MISSION_COMBAT[missionId].waves.length; wave++) {
        const f = fixture(missionId, wave), plan = f.e.territoryTasks!, budget = MISSION_COMBAT[missionId].waves[wave - 1];
        const carriers = plan.squads.filter(squad => squad.kind === 'carrier');
        expect(f.e.totalToSpawn).toBe(budget); expect(f.e.batchSchedule.flatMap(batch => batch.roles)).toHaveLength(budget);
        expect(carriers).toHaveLength(wave >= 2 ? 1 : 0);
        if (wave >= 2) {
          expect(carriers[0].slots).toEqual([budget - 4, budget - 3, budget - 2, budget - 1]);
          expect(carriers[0].slots.every(slot => f.e.batchSchedule.flatMap(batch => batch.roles)[slot] === 'ordinary')).toBe(true);
          expect(carriers[0].laneId).toBe(missionId === 'membrane' || wave % 2 === 0 ? 'north' : 'south');
          expect(plan.reservedSlots).toEqual(carriers[0].slots);
        }
      }
    }
  });

  it('keeps carrier reservations when sources die and debits all-unborn cancellation exactly once', () => {
    const f = fixture('corridor', 2, false), carrier = f.e.territoryTasks!.squads.find(squad => squad.kind === 'carrier')!;
    expect(f.e.totalToSpawn).toBe(98); expect(new Set(f.e.territoryTasks!.reservedSlots).size).toBe(12);
    expect(cancelTerritoryAssaults(f.state, 'source-west')).toBe(4);
    expect(cancelTerritoryAssaults(f.state, 'source-west')).toBe(0);
    expect(cancelTerritoryAssaults(f.state, 'source-east')).toBe(4);
    expect(carrier.status).toBe('pending'); expect(f.e.remainingToSpawn).toBe(90); expect(f.e.canceledToSpawn).toBe(8);
    expect(cancelTerritoryAssaults(f.state)).toBe(4);
    expect(cancelTerritoryAssaults(f.state)).toBe(0);
    expect(f.e.remainingToSpawn).toBe(86); expect(f.e.canceledToSpawn).toBe(12);
    const g = fixture('corridor', 2, false);
    g.e.canceledToSpawn = g.e.remainingToSpawn; g.e.remainingToSpawn = 0;
    expect(cancelTerritoryAssaults(g.state, undefined, true)).toBe(12);
    expect(g.e.remainingToSpawn).toBe(0); expect(g.e.canceledToSpawn).toBe(98);
  });

  it('gives a full warning, births four real baseline members after source destruction and never replenishes them', () => {
    const f = fixture(), carrier = f.e.territoryTasks!.squads.find(squad => squad.kind === 'carrier')!;
    f.at(f.start); expect(carrier.status).toBe('warning');
    f.at(f.start + 3.99); expect(f.members()).toHaveLength(0);
    f.at(f.start + 4); expect(f.members()).toHaveLength(4); expect(carrier.status).toBe('active');
    expect(f.members().filter(target => target.territoryTask?.kind === 'invade')).toHaveLength(1);
    expect(f.members().filter(target => target.territoryTask?.kind === 'escort')).toHaveLength(3);
    const births = f.events.filter(event => event.type === 'ACTOR_SPAWNED' && event.data.carrier);
    expect(births).toHaveLength(4); expect(births.every(event => event.data.kind === 'carrier' && event.data.missionBaseBudget === true)).toBe(true);
    expect(births.map(event => event.data.slot)).toEqual(carrier.slots);
    const warning = f.events.find(event => event.type === 'TERRITORY_SQUAD_WARNING' && event.data.carrier)!;
    const spawned = f.events.find(event => event.type === 'TERRITORY_SQUAD_SPAWNED' && event.data.carrier)!;
    expect(warning.data.duration).toBe(4); expect(warning.data.x).toBe(f.state.world!.bounds.left + 70);
    expect(spawned.data.x).toBe(warning.data.x); expect(spawned.data.y).toBe(warning.data.y);
    expect(f.e.spawnSerial + f.e.remainingToSpawn + f.e.canceledToSpawn).toBe(f.e.totalToSpawn);
    f.members().forEach(target => { target.hp = 0; }); f.at(f.start + 4.25); f.at(f.start + 100);
    expect(carrier.status).toBe('complete'); expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED' && event.data.carrier)).toHaveLength(4);
  });

  it('sequences source reinforcements first and waits for every same-lane escort before departing', () => {
    const f = fixture('corridor', 2, false), plan = f.e.territoryTasks!;
    f.at(f.start); f.at(f.start + 4); f.at(f.start + 10); f.at(f.start + 14);
    f.at(f.start + 20); f.at(f.start + 24);
    const carrier = plan.squads.find(squad => squad.kind === 'carrier')!;
    expect(carrier).toMatchObject({ status: 'warning', blocked: 'lane-busy' }); expect(f.members()).toHaveLength(0);
    const north = plan.squads.find(squad => squad.laneId === 'north' && !squad.kind)!;
    for (const id of north.memberIds.slice(0, 3)) f.state.targets.find(target => target.id === id)!.hp = 0;
    f.at(f.start + 24.25); expect(f.members()).toHaveLength(0);
    f.state.targets.find(target => target.id === north.memberIds[3])!.hp = 0;
    f.at(f.start + 24.5); expect(f.members()).toHaveLength(4);
    expect(carrier.bornAt! - Math.max(...plan.squads.filter(squad => !squad.kind).map(squad => squad.bornAt!))).toBeGreaterThanOrEqual(10);
  });

  it('reserves four places under the shared population cap and creates no new squad during Boss or cleanup', () => {
    const f = fixture('corridor', 2); f.at(f.start);
    for (let i = 0; i < 50; i++) { f.e.nextSpawnAt = 0; f.at(f.start); }
    expect(f.state.targets.filter(target => target.hp > 0)).toHaveLength(44);
    f.at(f.start + 4); expect(f.members()).toHaveLength(4);
    expect(f.state.targets.filter(target => target.hp > 0)).toHaveLength(48);
    for (const stage of ['boss', 'cleanup'] as const) {
      const g = fixture(); g.at(g.start); g.state.territory!.stage = stage; g.at(g.start + 100);
      expect(g.members()).toHaveLength(0); expect(g.events.some(event => event.type === 'TERRITORY_SQUAD_SPAWNED')).toBe(false);
    }
  });

  it('walks to and reinfects a healthy frontline through production steps with both sources gone', () => {
    const f = fixture('corridor', 2), s = f.state;
    // Supplied carrier-only wave isolates route/capture behavior. The plan and
    // four slots come from the real mission planner; subsequent births, movement
    // and infection are exclusively GameSession.step transactions.
    s.elapsed = 0; s.tick = 0;
    s.endless!.batchIndex = s.endless!.batchSchedule.length; s.endless!.remainingToSpawn = 4;
    s.endless!.totalToSpawn = 4; s.endless!.nextSpawnAt = Infinity;
    const front = s.territory!.nodes.find(node => node.id === 'front-north')!;
    const events: GameEvent[] = []; f.game.bus.on('event', event => events.push(structuredClone(event)));
    let born: { x: number; y: number } | undefined;
    for (let frame = 0; frame < 60 * 35 && front.owner !== 'infected' && s.phase === 'playing'; frame++) {
      f.game.step({ moveX: 0, moveY: 0, aim: s.player, fire: false, primaryHeld: false });
      const leader = s.targets.find(target => target.territoryTask?.squadKind === 'carrier' && target.territoryTask.kind === 'invade');
      if (leader) born ??= { x: leader.x, y: leader.y };
    }
    expect(front.owner).toBe('infected'); expect(s.phase).toBe('playing');
    expect(events.filter(event => event.type === 'ACTOR_SPAWNED' && event.data.carrier)).toHaveLength(4);
    expect(s.targets.some(target => target.territoryTask?.squadKind === 'carrier' && target.territoryTask.kind === 'invade'
      && born && Math.hypot(target.x - born.x, target.y - born.y) > 20)).toBe(true);
    expect(Object.values(s.territory!.sources).every(source => source.destroyed)).toBe(true);
  });
});

describe('mission empty-field queue acceleration', () => {
  it('preserves the initial warning, advances every subsequent empty batch and ignores stationary sources', () => {
    const f = fixture('membrane', 1), e = f.e;
    const source: Target = { id: 'stationary-source', x: 400, y: 400, hp: 238, maxHp: 238, radius: 34,
      role: 'source', kind: 'single', hitUntil: 0, scanned: false, blocksWaveClear: false };
    f.state.targets.push(source); f.at(f.start - .01);
    expect(e.spawnSerial).toBe(0); expect(f.events.some(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toBe(false);
    f.at(f.start);
    for (let batch = 0; batch < 4; batch++) {
      const before = e.spawnSerial;
      f.state.targets.filter(target => target.role === 'virus').forEach(target => { target.hp = 0; });
      f.at(f.state.elapsed + .01);
      const deadline = e.nextSpawnAt;
      expect(deadline - f.state.elapsed).toBeCloseTo(ENDLESS_BALANCE.missionEmptyBatchDelay);
      f.at(f.state.elapsed + .1); expect(e.nextSpawnAt).toBe(deadline);
      f.at(deadline); expect(e.spawnSerial).toBe(before + 3);
    }
    expect(f.events.filter(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toHaveLength(4);
    expect(source.hp).toBe(238); expect(e.spawnSerial + e.remainingToSpawn + e.canceledToSpawn).toBe(e.totalToSpawn);
  });

  it('retains normal pacing for a surviving virus or elite, never postpones an earlier deadline and preserves fission promises', () => {
    for (const role of ['virus', 'elite'] as const) {
      const f = fixture('membrane', 1); f.at(f.start);
      f.state.targets[0].role = role; const deadline = f.e.nextSpawnAt; f.at(f.start + .1);
      expect(f.e.nextSpawnAt).toBe(deadline); expect(f.events.some(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toBe(false);
    }
    const f = fixture('membrane', 1); f.at(f.start);
    for (const target of f.state.targets) target.hp = 0;
    const parent = f.state.targets[0]; parent.splitAt = f.state.elapsed + .8;
    parent.splitPositions = [{ x: 600, y: 600 }, { x: 650, y: 600 }];
    f.e.nextSpawnAt = f.state.elapsed + .2; f.at(f.state.elapsed + .01);
    expect(f.e.nextSpawnAt).toBeCloseTo(f.start + .2); expect(f.e.pendingChildren).toBe(2);
    expect(parent.splitAt).toBeCloseTo(f.start + .8); expect(parent.splitPositions).toHaveLength(2);
  });
});
