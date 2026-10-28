import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition, normalized, wallHit } from '../../src/actors/collision';
import { GameSession } from '../../src/game/session';
import { IMMUNE_CELL_BALANCE } from '../../src/game/immuneCells';
import type { InputFrame, Target, Vec, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 85, right: 2315, top: 145, bottom: 1415 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const idle = (changes: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim: { x: 1200, y: 900 }, ...changes });

/** A bounded wave-boundary fixture, not a natural strategy or balance sample. */
function enterSourceWave(session: GameSession, wave: number) {
  const state = session.state, e = state.endless!;
  Object.assign(e, { wave: wave - 1, clearedWaves: wave - 1, phase: 'intermission', phaseUntil: state.elapsed,
    remainingToSpawn: 0, pendingChildren: 0 });
  session.step(idle());
  expect(e.wave).toBe(wave); expect(e.phase).toBe('warning'); expect(e.source?.status).toBe('active');
  const announcedAt = state.tick;
  while (e.phase === 'warning' && state.tick < announcedAt + 500) session.step(idle());
  expect(e.phase).toBe('combat');
  const source = state.targets.find(target => target.id === e.source!.id)!;
  expect(source?.role).toBe('source');
  return source;
}

function fixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  session.state.world = structuredClone(world);
  return { session, source: enterSourceWave(session, 6) };
}

function legalApproach(source: Target, range: number): Vec {
  for (let index = 0; index < 24; index++) {
    const angle = index * Math.PI / 12, point = { x: source.x + Math.cos(angle) * range, y: source.y + Math.sin(angle) * range };
    if (isLegalPosition(point, 19, world)) return point;
  }
  throw Error('Fixture source has no legal approach');
}

/** Isolate the initial target; the director may still accelerate the future queue. */
function isolate(session: GameSession, source: Target, range: number) {
  session.state.targets = [source];
  Object.assign(session.state.player, legalApproach(source, range));
  session.state.endless!.nextSpawnAt = session.state.elapsed + 60;
}

const receipts = (session: GameSession, id: string) => session.state.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === id);

describe('optional finite source through actual tool and squad input', () => {
  it('clears the source with the basic tool and cancels only its unborn ordinary quota, with one real kill', () => {
    const { session, source } = fixture(), state = session.state, e = state.endless!;
    isolate(session, source, 300);
    const quota = structuredClone(e.source!), before = { hp: source.hp, kills: e.kills, combo: e.combo, xp: state.growth!.xp,
      remaining: e.remainingToSpawn, canceled: e.canceledToSpawn, spawned: e.spawnSerial };
    const unborn = quota.quotaSlots.filter(slot => !quota.bornQuotaSlots.includes(slot));
    expect(unborn.length).toBeGreaterThan(0); expect(unborn.length).toBeLessThanOrEqual(6);
    const started = state.tick;
    while (source.hp > 0 && state.phase === 'playing' && state.tick - started < 240) session.step(idle({ tool: 1, fire: true, aim: source }));
    expect(source.hp).toBe(0); expect(e.source!.status).toBe('destroyed');
    expect(e.source!.canceledSlots).toEqual(unborn);
    expect(e.remainingToSpawn).toBe(before.remaining - unborn.length - (e.spawnSerial - before.spawned));
    expect(e.spawnSerial + e.canceledToSpawn + e.remainingToSpawn).toBe(e.totalToSpawn);
    expect(e.canceledToSpawn).toBe(before.canceled + unborn.length);
    expect(e.kills).toBe(before.kills + 1); expect(e.combo).toBe(before.combo + 1);
    expect(state.growth!.xp).toBe(before.xp);
    expect(receipts(session, source.id).reduce((sum, hit) => sum + Number(hit.data.damage), 0)).toBeCloseTo(before.hp);
    expect(state.events.filter(event => event.type === 'TARGET_CLEARED' && event.data.id === source.id)).toHaveLength(1);
    const cutoff = state.events.filter(event => event.type === 'ENDLESS_SOURCE_CUT_OFF' && event.data.id === source.id);
    expect(cutoff).toHaveLength(1); expect(cutoff[0].data.canceled).toBe(unborn.length);
    expect(state.message).toContain(`截断 ${cutoff[0].data.canceled} 个`);
    expect(state.message).toContain(`截断 ${unborn.length} 个尚未入场普通体`);
    for (let frame = 0; frame < 30; frame++) session.step(idle());
    expect(e.kills).toBe(before.kills + 1); expect(e.canceledToSpawn).toBe(before.canceled + unborn.length);
    expect(state.growth!.xp).toBe(before.xp);
  });

  it('accepts a Q command at 650, then records actual cell contact and positive source damage', () => {
    const { session, source } = fixture(), state = session.state;
    isolate(session, source, 650);
    const before = source.hp;
    session.step(idle({ scan: true, aim: source }));
    const beacon = state.growth!.beacon!;
    expect(beacon.focus?.targetId).toBe(source.id); expect(source.hp).toBe(before);
    expect(state.growth!.cells).toHaveLength(3);
    expect(distance(state.player, beacon)).toBeCloseTo(420);
    const initialIds = state.growth!.cells!.map(cell => cell.id), startTick = state.tick;
    let positiveBites = 0;
    while (state.tick - startTick < 120 && source.hp > 0 && state.phase === 'playing') {
      session.step(idle({ scan: true, aim: source }));
      for (const event of state.events.filter(event => event.tick === state.tick && event.type === 'PROTOCOL_BEACON_HIT' && event.data.targetId === source.id)) {
        const cell = state.growth!.cells!.find(unit => unit.id === event.data.cellId)!;
        expect(cell).toBeTruthy(); expect(event.data.prioritizedFocus).toBe(true);
        const gap = distance(cell, source), blocked = wallHit(cell, normalized(source.x - cell.x, source.y - cell.y), gap, world);
        expect(gap).toBeLessThanOrEqual(cell.radius + source.radius + IMMUNE_CELL_BALANCE.biteReach + 1e-7);
        expect(blocked === null || blocked >= gap - source.radius).toBe(true); positiveBites++;
      }
    }
    const hits = receipts(session, source.id).filter(hit => hit.data.protocolId === 'IMMUNE_BEACON');
    expect(positiveBites).toBeGreaterThan(0); expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(hit => Number(hit.data.damage) > 0 && hit.tick > startTick)).toBe(true);
    expect(source.hp).toBeCloseTo(before - hits.reduce((sum, hit) => sum + Number(hit.data.damage), 0));
    expect(state.scans).toBe(1); expect(state.growth!.cells!.map(cell => cell.id)).toEqual(initialIds);
  });

  it('cuts off a positive quota with a plausible wave-six immune build through the unchanged live queue', () => {
    const { session, source } = fixture(), state = session.state, e = state.endless!;
    // Four ordinary ranks fit the five earned clears before this wave. This
    // isolates a legal build; it does not claim those choices were drafted here.
    state.endlessGrowth!.ranks = { immune: 2, power: 2 };
    Object.assign(state.player, legalApproach(source, 650));
    const sourceHp = source.hp, originalSlots = [...e.source!.quotaSlots], bornBefore = [...e.source!.bornQuotaSlots], started = state.tick;
    expect(e.nextSpawnAt - state.elapsed).toBeLessThan(10);
    session.step(idle({ scan: true, aim: source }));
    expect(source.hp).toBe(sourceHp); expect(state.growth!.beacon!.focus?.targetId).toBe(source.id);
    let checkedContact = 0;
    while (e.source!.status === 'active' && state.phase === 'playing' && state.tick - started < 600) {
      session.step(idle({ scan: true, aim: source }));
      for (const event of state.events.filter(event => event.tick === state.tick && event.type === 'PROTOCOL_BEACON_HIT' && event.data.targetId === source.id)) {
        const cell = state.growth!.cells!.find(unit => unit.id === event.data.cellId)!;
        const gap = distance(cell, source), blocked = wallHit(cell, normalized(source.x - cell.x, source.y - cell.y), gap, world);
        expect(gap).toBeLessThanOrEqual(cell.radius + source.radius + IMMUNE_CELL_BALANCE.biteReach + 1e-7);
        expect(blocked === null || blocked >= gap - source.radius).toBe(true); checkedContact++;
      }
    }
    expect(state.phase).toBe('playing'); expect(e.source!.status).toBe('destroyed'); expect(source.hp).toBe(0);
    expect(checkedContact).toBeGreaterThan(0); expect(state.shots).toBe(0);
    expect(e.source!.quotaSlots).toEqual(originalSlots);
    expect(e.source!.canceledSlots.length).toBeGreaterThan(0);
    expect(e.source!.canceledSlots.every(slot => originalSlots.includes(slot) && !e.source!.bornQuotaSlots.includes(slot))).toBe(true);
    expect(e.source!.bornQuotaSlots.length).toBeGreaterThanOrEqual(bornBefore.length);
    const sourceHits = receipts(session, source.id);
    expect(sourceHits.every(hit => hit.data.protocolId === 'IMMUNE_BEACON')).toBe(true);
    expect(sourceHits.reduce((sum, hit) => sum + Number(hit.data.damage), 0)).toBeCloseTo(sourceHp);
    const cutoff = state.events.find(event => event.type === 'ENDLESS_SOURCE_CUT_OFF' && event.data.id === source.id && Number(event.data.canceled) > 0);
    expect(cutoff).toBeTruthy(); expect(state.message).toContain(`截断 ${cutoff!.data.canceled} 个`);
    expect(state.message).toContain(`截断 ${e.source!.canceledSlots.length} 个尚未入场普通体`);
    expect(state.tick - started).toBeLessThan(600);
  });

  it('keeps the marked source ahead of a newly present unmarked body when Q is an area deployment', () => {
    const { session, source } = fixture(), state = session.state;
    isolate(session, source, 600);
    state.growth!.equipped.push({ id: 'EXPOSE_TRACE', tuning: 'balanced' });
    const toward = normalized(source.x - state.player.x, source.y - state.player.y);
    const aim = { x: source.x - toward.x * 120, y: source.y - toward.y * 120 };
    session.step(idle({ scan: true, aim }));
    expect(state.growth!.beacon!.focus).toBeUndefined();
    expect(state.growth!.marks.some(mark => mark.targetId === source.id)).toBe(true);
    const cell = state.growth!.cells![0];
    const ordinary: Target = { id: 'new-unmarked', x: cell.x, y: cell.y, radius: 22, role: 'virus', kind: 'single', hp: 1000, maxHp: 1000,
      hitUntil: 0, scanned: false, born: state.elapsed, attackReady: state.elapsed + 100 };
    state.targets.push(ordinary);
    const began = state.tick;
    while (state.tick - began < 80 && state.phase === 'playing' && source.hp > 0) session.step(idle());
    const bites = state.events.filter(event => event.type === 'TARGET_HIT' && event.data.protocolId === 'IMMUNE_BEACON');
    expect(bites.length).toBeGreaterThan(0); expect(bites.every(hit => hit.data.id === source.id)).toBe(true);
    expect(ordinary.hp).toBe(1000);
    expect(state.events.some(event => event.type === 'PROTOCOL_SYNERGY' && event.data.pair === 'EXPOSE_TRACE+IMMUNE_BEACON'
      && bites.some(hit => hit.data.rootId === event.data.rootId))).toBe(true);
  });

  it('lets the finite quota exhaust without manufacturing source damage, kills, XP or combo', () => {
    const { session, source } = fixture(), state = session.state, e = state.endless!;
    const before = { kills: e.kills, combo: e.combo, xp: state.growth!.xp }, started = state.tick;
    while (e.source!.status === 'active' && state.phase === 'playing' && state.tick - started < 600) session.step(idle());
    expect(state.phase).toBe('playing'); expect(e.source!.status).toBe('exhausted');
    expect(source.hp).toBe(0); expect(e.source!.bornQuotaSlots).toEqual(e.source!.quotaSlots);
    expect(e.source!.canceledSlots).toEqual([]); expect(e.canceledToSpawn).toBe(0);
    expect(receipts(session, source.id)).toEqual([]);
    expect(state.events.some(event => event.type === 'TARGET_CLEARED' && event.data.id === source.id)).toBe(false);
    expect(state.events.filter(event => event.type === 'ENDLESS_SOURCE_EXHAUSTED' && event.data.id === source.id)).toHaveLength(1);
    expect(e.kills).toBe(before.kills); expect(e.combo).toBe(before.combo); expect(state.growth!.xp).toBe(before.xp);
    expect(state.targets.some(target => target.role === 'source' && target.hp > 0)).toBe(false);
    expect(state.targets.filter(target => target.role !== 'source' && target.hp > 0).length).toBeGreaterThan(0);
  });

  it('replaces old source bodies and graph nodes at later pressure boundaries rather than accumulating them', () => {
    const { session } = fixture(), state = session.state;
    let previousId = state.endless!.source!.id;
    for (const wave of [11, 16]) {
      // Boundary fixtures deliberately skip unrelated waves, checking cleanup
      // rather than claiming a natural multi-wave victory or survival sample.
      state.targets = state.targets.filter(target => target.role === 'source');
      const next = enterSourceWave(session, wave);
      expect(next.id).not.toBe(previousId);
      expect(state.targets.some(target => target.id === previousId)).toBe(false);
      expect(state.battle!.graph.nodes.some(node => node.id === previousId)).toBe(false);
      expect(state.targets.filter(target => target.role === 'source')).toHaveLength(1);
      expect(state.battle!.graph.nodes.filter(node => node.kind === 'source')).toHaveLength(1);
      expect(state.endless!.source!.quotaSlots.length).toBeLessThanOrEqual(6);
      previousId = next.id;
    }
  });
});
