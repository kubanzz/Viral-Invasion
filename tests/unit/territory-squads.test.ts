import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { cancelTerritoryAssaults, ENDLESS_BALANCE, EndlessDirector, planTerritoryAssaults } from '../../src/game/endless';
import type { EndlessHost, EndlessSpawnRole } from '../../src/game/endlessTypes';
import { GameSession } from '../../src/game/session';
import { TERRITORY_BALANCE as T, territoryInvasionOrigin } from '../../src/game/territory';
import type { GameEvent, Target } from '../../src/game/types';

function fixture(wave = 3, budget = 16) {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  const state = game.state, e = state.endless!, events: GameEvent[] = [], completed: number[] = [];
  state.targets = []; state.world = { ...state.world!, obstacles: [] };
  const roles: EndlessSpawnRole[] = Array.from({ length: budget }, () => 'ordinary');
  Object.assign(e, { wave, phase: 'combat', phaseStartedAt: 0, phaseUntil: 0, remainingToSpawn: budget, totalToSpawn: budget,
    canceledToSpawn: 0, batchIndex: 0, batchMemberIndex: 0, spawnSerial: 0, spawnedIds: [], nextSpawnAt: Infinity,
    traits: [], supportRemaining: 0, eliteRemaining: 0, eliteWave: false,
    batchSchedule: Array.from({ length: Math.ceil(budget / 3) }, (_, index) => ({ at: index * .1, sector: index % 8, spread: .3, roles: roles.slice(index * 3, index * 3 + 3) })),
    territoryTasks: planTerritoryAssaults(wave, roles) });
  let director: EndlessDirector;
  const host: EndlessHost = { state,
    emit(type, data) { const event = { type, tick: state.tick, data }; events.push(event); director.recordEvent(event); },
    effect() {}, message() {}, completeWave(value) { completed.push(value); } };
  director = new EndlessDirector(host);
  const at = (seconds: number) => { state.elapsed = seconds; state.tick++; director.beforeInput(); director.afterInput(); };
  const members = () => state.targets.filter(target => target.territoryTask?.squadId);
  const live = () => state.targets.filter(target => target.hp > 0);
  return { state, e, director, events, completed, at, members, live };
}
function body(id: number, overrides: Partial<Target> = {}): Target {
  return { id: `existing-${id}`, x: 1200, y: 900, kind: 'single', role: 'virus', hp: 68, maxHp: 68, radius: 22,
    hitUntil: 0, scanned: false, sourceId: 'endless:wave:3', waveId: 3, blocksWaveClear: true, ...overrides };
}

describe('finite two-lane territory squads', () => {
  it('replaces exactly four ordinary slots per scheduled squad and preserves early lesson slots', () => {
    const roles: EndlessSpawnRole[] = Array.from({ length: 40 }, () => 'ordinary'); roles[0] = 'elite'; roles[2] = 'support';
    for (const [wave, count] of [[1, 1], [2, 2], [3, 4], [10, 4]]) {
      const plan = planTerritoryAssaults(wave, roles);
      expect(plan.squads).toHaveLength(count); expect(plan.reservedSlots).toHaveLength(count * 4);
      expect(new Set(plan.reservedSlots).size).toBe(count * 4);
      expect(plan.reservedSlots.every(slot => roles[slot] === 'ordinary' && slot >= 24)).toBe(true);
      expect(plan.squads.flatMap(squad => squad.slots)).toEqual(plan.reservedSlots);
      expect(plan.squads.map(squad => squad.laneId)).toEqual(['north', 'south', 'north', 'south'].slice(0, count));
      expect(plan.squads.map(squad => squad.departureOffset)).toEqual([4, 14, 24, 34].slice(0, count));
    }
    for (const budget of [0, 1, 2, 3]) {
      const plan = planTerritoryAssaults(3, Array.from({ length: budget }, () => 'ordinary'));
      expect(plan.squads).toEqual([]); expect(plan.reservedSlots).toEqual([]);
    }
  });

  it('provides a real four-second warning and atomically creates one leader with three linked escorts', () => {
    const f = fixture(1, 4); f.at(0);
    expect(f.e.territoryTasks!.squads[0]).toMatchObject({ status: 'warning', warnedAt: 0 });
    expect(f.events.filter(event => event.type === 'TERRITORY_SQUAD_WARNING')).toHaveLength(1);
    f.at(3.99); expect(f.members()).toHaveLength(0); expect(f.e.remainingToSpawn).toBe(4);
    f.at(4); const squad = f.e.territoryTasks!.squads[0], members = f.members();
    expect(members).toHaveLength(4); expect(f.e.remainingToSpawn).toBe(0); expect(f.e.spawnSerial).toBe(4);
    expect(squad.memberIds).toEqual(members.map(target => target.id)); expect(squad.status).toBe('active');
    expect(members.filter(target => target.territoryTask!.kind === 'invade')).toHaveLength(1);
    expect(members.slice(1).every(target => target.territoryTask!.kind === 'escort' && target.territoryTask!.leaderId === members[0].id)).toBe(true);
    expect(members.every(target => target.territoryTask!.squadId === squad.id && target.blocksWaveClear && target.waveId === 1
      && target.sourceId === 'endless:wave:1' && target.attackReady === 4 + ENDLESS_BALANCE.spawnGrace)).toBe(true);
  });

  it('keeps at least ten seconds between actual departures, including after a delayed departure', () => {
    const f = fixture(); f.at(0); f.at(10); // first squad was not ticked at its nominal deadline
    expect(f.e.territoryTasks!.squads[0].bornAt).toBe(10);
    f.at(16); expect(f.e.territoryTasks!.squads[1]).toMatchObject({ status: 'warning', warnedAt: 16 });
    f.at(19.99); expect(f.members()).toHaveLength(4);
    f.at(20); expect(f.members()).toHaveLength(8); expect(f.e.territoryTasks!.squads[1].bornAt).toBe(20);
  });

  it('keeps a lane busy until its last escort dies and never reuses that lane early', () => {
    const f = fixture(); f.at(0); f.at(4); f.at(10); f.at(14); f.at(20); f.at(24);
    const first = f.e.territoryTasks!.squads[0], third = f.e.territoryTasks!.squads[2];
    expect(third).toMatchObject({ status: 'warning', blocked: 'lane-busy' });
    f.state.targets.find(target => target.id === first.memberIds[0])!.hp = 0; f.at(24.25);
    expect(third.status).toBe('warning'); expect(f.members()).toHaveLength(8);
    for (const id of first.memberIds) f.state.targets.find(target => target.id === id)!.hp = 0;
    f.at(24.5); expect(first.status).toBe('complete'); expect(third).toMatchObject({ status: 'active', bornAt: 24.5 });
    expect(f.live().filter(target => target.territorySourceId === 'source-west')).toHaveLength(4);
  });

  it('can depart while the player camps the advertised origin, with warning and safe attack grace', () => {
    const f = fixture(1, 4), origin = territoryInvasionOrigin(f.state, 'source-west')!;
    Object.assign(f.state.player, origin); f.at(0); f.at(3.99); expect(f.members()).toHaveLength(0); f.at(4);
    expect(f.members()).toHaveLength(4);
    for (const target of f.members()) {
      expect(distance(target, f.state.player)).toBeGreaterThanOrEqual(T.assaultMinimumPlayerDistance);
      expect(distance(target, origin)).toBeLessThanOrEqual(T.assaultSpawnRingOuter + 1e-6);
      expect(target.attackReady).toBe(5.5);
    }
    f.members().forEach(target => { target.hp = 0; }); f.at(4.25);
    expect(f.e.phase).toBe('intermission'); expect(f.completed).toEqual([1]);
  });

  it('reserves four population slots per waiting line so ordinary cohorts cannot occupy all 48', () => {
    const f = fixture(2, 100); f.e.nextSpawnAt = 0;
    for (let step = 0; step < 60; step++) { f.e.nextSpawnAt = 0; f.at(0); }
    expect(f.live()).toHaveLength(40); expect(f.members()).toHaveLength(0);
    f.at(4); expect(f.members()).toHaveLength(4); expect(f.live()).toHaveLength(44);
    for (let step = 0; step < 10; step++) { f.e.nextSpawnAt = 0; f.at(4); }
    expect(f.live()).toHaveLength(44);
    f.at(10); f.at(14); expect(f.members()).toHaveLength(8); expect(f.live()).toHaveLength(48);
  });

  it('retains a lane reservation as its active escort members die while another squad awaits that lane', () => {
    const f = fixture(3, 100); f.at(0); f.at(4);
    const first = f.members(); first.slice(0, 3).forEach(target => { target.hp = 0; });
    for (let step = 0; step < 80; step++) { f.e.nextSpawnAt = 0; f.at(4); }
    // One north escort + 40 ordinary bodies; 3 north and 4 south slots remain reserved.
    expect(f.live()).toHaveLength(41);
    first[3].hp = 0; f.at(10); f.at(14); f.at(20); f.at(24);
    expect(f.e.territoryTasks!.squads[2].status).toBe('active');
    expect(f.live().length).toBeLessThanOrEqual(48);
  });

  it('counts pending fission children against the 48 cap and never partially births a squad', () => {
    const f = fixture(1, 4); f.state.targets = Array.from({ length: 44 }, (_, index) => body(index));
    f.state.targets.push(body(100, { hp: 0, sourceId: 'endless:wave:1', splitAt: 5, splitPositions: [{ x: 1000, y: 800 }, { x: 1050, y: 800 }] }));
    f.at(0); f.at(4);
    expect(f.e.territoryTasks!.squads[0]).toMatchObject({ status: 'warning', blocked: 'population' });
    expect(f.members()).toHaveLength(0); expect(f.e.remainingToSpawn).toBe(4); expect(f.e.pendingChildren).toBe(2);
    f.state.targets[0].hp = f.state.targets[1].hp = 0; f.at(4.25);
    expect(f.members()).toHaveLength(4); expect(f.live()).toHaveLength(46); expect(f.e.pendingChildren).toBe(2);
  });

  it('retries blocked positions without spending budget or falling back to ordinary bodies', () => {
    const f = fixture(1, 4), origin = territoryInvasionOrigin(f.state, 'source-west')!;
    f.state.world!.obstacles = [{ id: 'blocked-invasion-ring', ...origin, radius: 450 }]; f.at(0); f.at(4);
    expect(f.e.territoryTasks!.squads[0]).toMatchObject({ status: 'warning', blocked: 'position' });
    expect(f.e.remainingToSpawn).toBe(4); expect(f.e.spawnSerial).toBe(0); expect(f.state.targets).toEqual([]);
    f.state.world!.obstacles = []; f.at(4.25);
    expect(f.members()).toHaveLength(4); expect(f.e.remainingToSpawn).toBe(0);
  });

  it('recomputes both origin and first healthy goal when territory changes after the warning', () => {
    const f = fixture(1, 4); f.at(0);
    const squad = f.e.territoryTasks!.squads[0]; expect(squad.nodeId).toBe('heart-healing-1');
    f.state.territory!.nodes.find(node => node.id === 'front-north')!.owner = 'healthy'; f.at(4);
    expect(squad.origin).toEqual({ x: 450, y: 600 }); expect(squad.nodeId).toBe('front-north');
    expect(f.members().every(target => target.territoryTask!.nodeId === 'front-north' && distance(target, squad.origin!) <= 320 + 1e-6)).toBe(true);
  });

  it('cancels only unborn tasks once, preserving live members and finite accounting', () => {
    const f = fixture(); f.at(0); f.at(4); const liveIds = f.members().map(target => target.id);
    expect(cancelTerritoryAssaults(f.state, 'source-west')).toBe(4);
    expect(cancelTerritoryAssaults(f.state, 'source-west')).toBe(0);
    expect(f.e.remainingToSpawn).toBe(8); expect(f.e.canceledToSpawn).toBe(4);
    expect(cancelTerritoryAssaults(f.state, 'source-east')).toBe(8);
    expect(f.e.remainingToSpawn).toBe(0); expect(f.e.canceledToSpawn).toBe(12);
    expect(f.members().map(target => target.id)).toEqual(liveIds); expect(f.e.phase).toBe('combat');
    f.members().forEach(target => { target.hp = 0; }); f.at(4.25); expect(f.e.phase).toBe('intermission');
  });

  it('does not debit a second time when the host already canceled the whole remaining queue', () => {
    const f = fixture(); f.at(0); f.at(4); f.e.canceledToSpawn += f.e.remainingToSpawn; f.e.remainingToSpawn = 0;
    expect(cancelTerritoryAssaults(f.state, undefined, true)).toBe(12);
    expect(f.e.remainingToSpawn).toBe(0); expect(f.e.canceledToSpawn).toBe(12);
    expect(f.e.territoryTasks!.squads[0].status).toBe('active');
  });

  it('reacts synchronously to source destruction and guard ignores destroyed source flags at the edges', () => {
    const f = fixture(2, 8); f.at(0);
    f.director.recordEvent({ type: 'TERRITORY_SOURCE_DESTROYED', tick: f.state.tick, data: { sourceId: 'source-west' } });
    expect(f.e.territoryTasks!.squads[0].status).toBe('canceled'); expect(f.e.canceledToSpawn).toBe(4);
    const g = fixture(2, 8); g.state.territory!.stage = 'guard';
    for (const source of Object.values(g.state.territory!.sources)) source.destroyed = true;
    for (const node of g.state.territory!.nodes) node.owner = 'healthy';
    g.at(0); g.at(4); g.at(10); g.at(14);
    expect(g.members()).toHaveLength(8); expect(g.state.targets.some(target => target.role === 'source')).toBe(false);
    expect(g.e.territoryTasks!.squads[0].origin!.x).toBe(g.state.world!.bounds.left + 70);
    expect(g.e.territoryTasks!.squads[1].origin!.x).toBe(g.state.world!.bounds.right - 70);
  });

  it('keeps wave clear waiting for unborn tasks, survivors, and actual pending fission obligations', () => {
    const f = fixture(1, 4); f.at(0); expect(f.e.phase).toBe('combat');
    f.at(4); f.members().slice(0, 3).forEach(target => { target.hp = 0; }); f.at(4.25); expect(f.e.phase).toBe('combat');
    f.members()[3].hp = 0; f.members()[3].splitAt = 5;
    f.members()[3].splitPositions = [{ x: 1000, y: 800 }, { x: 1050, y: 800 }];
    f.at(4.5); expect(f.e.phase).toBe('combat'); expect(f.e.pendingChildren).toBe(2);
    f.members()[3].splitAt = undefined; f.at(5); expect(f.e.phase).toBe('intermission');
  });

  it('allows custom budgets smaller than a squad to finish using every ordinary slot', () => {
    const f = fixture(1, 3); f.e.nextSpawnAt = 0; f.at(0);
    expect(f.live()).toHaveLength(3); expect(f.e.remainingToSpawn).toBe(0); expect(f.members()).toEqual([]);
    f.live().forEach(target => { target.hp = 0; }); f.at(.25);
    expect(f.e.phase).toBe('intermission');
  });
});
