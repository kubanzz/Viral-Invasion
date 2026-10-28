import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition, normalized, rayCircle, wallHit } from '../../src/actors/collision';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { EndlessDirector } from '../../src/game/endless';
import { endlessPacing } from '../../src/game/endlessPacing';
import { endlessStrikeDamage } from '../../src/game/endlessStrikeBalance';
import { endlessAssaultSlots } from '../../src/game/endlessAssault';
import type { EndlessHost } from '../../src/game/endlessTypes';
import { GameSession } from '../../src/game/session';
import { activeWorld, BALANCE, type GameEvent, type Target } from '../../src/game/types';

type AssaultTarget = Target & { assaultObjective?: 'tissue' };
const idle = { moveX: 0, moveY: 0, aim: { x: 1000, y: 900 }, fire: false };

/** Isolated director fixtures inspect original finite slots without combat kills. */
function fixture(wave = 6, seed = 71) {
  const session = new GameSession(seed, { mode: 'endless' }); session.start();
  const state = session.state, e = state.endless!;
  state.targets = []; state.elapsed = 10; state.tick = 600;
  Object.assign(e, { wave: wave - 1, clearedWaves: wave - 1, phase: 'intermission', phaseUntil: 0, remainingToSpawn: 0 });
  const events: GameEvent[] = [];
  let director: EndlessDirector;
  const host: EndlessHost = { state, emit(type, data) {
    const event = { type, data, tick: state.tick }; events.push(event); director.recordEvent(event);
  }, message() {}, effect() {}, completeWave() {} };
  director = new EndlessDirector(host); director.beforeInput();
  const advance = (seconds: number) => {
    state.elapsed += seconds; state.tick = Math.round(state.elapsed * 60); director.beforeInput(); director.afterInput();
  };
  const enter = () => advance(e.warningSeconds);
  const drain = () => {
    for (let index = 0; index < 50 && e.remainingToSpawn > 0; index++) {
      for (const actor of state.targets) if (actor.role !== 'source') { actor.hp = 0; delete actor.splitAt; delete actor.splitPositions; }
      advance(Math.max(0, e.nextSpawnAt - state.elapsed));
      expect(e.spawnSerial + e.canceledToSpawn + e.remainingToSpawn).toBe(e.totalToSpawn);
    }
    expect(e.remainingToSpawn).toBe(0);
  };
  return { session, state, e, events, director, advance, enter, drain };
}

/** A normal pressure-wave body, isolated for real movement/tool/attack rules. */
function combatFixture(objective = true) {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const state = session.state, e = state.endless!;
  state.world = { ...activeWorld(state), obstacles: [] };
  Object.assign(state.player, { x: 1900, y: 900 }); Object.assign(state.tissue, { x: 1200, y: 900, hp: 100 });
  Object.assign(e, { wave: 6, phase: 'combat', remainingToSpawn: 1, nextSpawnAt: Infinity });
  const target: AssaultTarget = { id: 'assault-fixture', sourceId: 'endless:wave:6', role: 'virus', kind: 'single',
    x: 1390, y: 900, radius: 22, hp: 200, maxHp: 200, hitUntil: 0, scanned: false,
    traits: [], generation: 0, tactic: 'melee', attackReady: Infinity, ...(objective ? { assaultObjective: 'tissue' as const } : {}) };
  state.targets = [target];
  return { session, state, e, target };
}

describe('finite pressure-wave tissue assault', () => {
  it('never repurposes a support, elite or source-owned slot in a supplied finite plan', () => {
    const f = fixture(), roles = f.e.batchSchedule.flatMap(batch => batch.roles);
    expect(endlessAssaultSlots(6, roles, f.e.source)).toEqual([1, 4]);
    roles[1] = 'support';
    expect(endlessAssaultSlots(6, roles, f.e.source)).toEqual([4]);
    expect(endlessAssaultSlots(6, roles, { ...f.e.source!, quotaSlots: [4] })).toEqual([]);
    roles[1] = 'ordinary'; roles[4] = 'elite';
    expect(endlessAssaultSlots(6, roles, f.e.source)).toEqual([1]);
    for (const wave of [NaN, Infinity, -1, 6.5]) expect(endlessAssaultSlots(wave, roles, f.e.source)).toEqual([]);
  });

  it('announces exactly ordinary slots1/4 on pressure waves from6, retaining source ownership and finite budgets', () => {
    for (const wave of [6, 8, 11, 13, 16, 18, 31, 33]) {
      const f = fixture(wave), sourceSlots = [...(f.e.source?.quotaSlots ?? [])];
      const warning = f.events.find(event => event.type === 'ENDLESS_WAVE_WARNING')!;
      expect(warning.data.assaultSlots).toBe('1,4'); expect(warning.data.assaultObjective).toBe('tissue');
      for (const slot of [1, 4]) {
        expect(f.e.batchSchedule[Math.floor(slot / 3)].roles[slot % 3]).toBe('ordinary');
        expect(sourceSlots).not.toContain(slot);
      }
      f.enter(); f.drain();
      const births = f.events.filter(event => event.type === 'ACTOR_SPAWNED');
      const assault = births.filter(event => event.data.assaultObjective === 'tissue');
      expect(assault.map(event => event.data.slot)).toEqual([1, 4]);
      expect(births).toHaveLength(f.e.totalToSpawn);
      expect(f.e.source?.quotaSlots ?? []).toEqual(sourceSlots);
      for (const receipt of assault) {
        const actor = f.state.targets.find(actor => actor.id === receipt.data.id)!;
        expect(actor.role).toBe('virus'); expect(actor.maxHp).toBe(Math.round(68 * endlessPacing(wave).healthMultiplier));
        expect(actor.traits).toEqual([f.e.traits[Number(receipt.data.slot) % f.e.traits.length]]);
        expect(receipt.data.tactic).toBe('melee');
      }
    }
  });

  it('leaves early, release and elite waves without assault identities or slots', () => {
    for (const wave of [2, 3, 4, 5, 7, 9, 10, 12, 14, 15, 17, 19, 20]) {
      const f = fixture(wave); f.enter(); f.drain();
      expect(f.events.some(event => event.type === 'ACTOR_SPAWNED' && event.data.assaultObjective)).toBe(false);
      expect(f.events.find(event => event.type === 'ENDLESS_WAVE_WARNING')!.data.assaultSlots ?? '').toBe('');
    }
  });

  it('uses deterministic legal tissue flanks while keeping the original player/body clearance', () => {
    for (const seed of [7, 71, 19]) {
      const a = fixture(6, seed), b = fixture(6, seed); a.enter(); b.enter();
      const first = a.state.targets.find(actor => (actor as AssaultTarget).assaultObjective === 'tissue')!;
      const replay = b.state.targets.find(actor => (actor as AssaultTarget).assaultObjective === 'tissue')!;
      expect(first).toBeDefined(); expect({ x: first.x, y: first.y }).toEqual({ x: replay.x, y: replay.y });
      expect(distance(first, a.state.tissue)).toBeGreaterThanOrEqual(240 - 1e-7);
      expect(distance(first, a.state.tissue)).toBeLessThanOrEqual(340 + 1e-7);
      expect(distance(first, a.state.player)).toBeGreaterThanOrEqual(340 - 1e-7);
      expect(isLegalPosition(first, first.radius, activeWorld(a.state))).toBe(true);
      const world = activeWorld(a.state), toward = normalized(first.x - a.state.tissue.x, first.y - a.state.tissue.y);
      for (const obstacle of world.obstacles) expect(rayCircle(a.state.tissue, toward, obstacle,
        obstacle.radius + first.radius + 2, distance(first, a.state.tissue))).toBeNull();
      const playerGap = distance(first, a.state.player);
      const block = wallHit(a.state.player, normalized(first.x - a.state.player.x, first.y - a.state.player.y), playerGap, world);
      expect(block === null || block >= playerGap - first.radius).toBe(true);
      for (const body of a.state.targets.filter(actor => actor.id !== first.id && actor.hp > 0)) {
        expect(distance(first, body)).toBeGreaterThanOrEqual(first.radius + body.radius + 12 - 1e-7);
      }
    }
  });

  it('falls back to the original safe arrival when the preferred tissue ring is sealed, without holding the queue', () => {
    const f = fixture();
    Object.assign(f.state.player, { x: 1900, y: 900 });
    f.state.world = { ...activeWorld(f.state), obstacles: Array.from({ length: 24 }, (_, index) => {
      const angle = index * Math.PI / 12;
      return { id: `sealed-${index}`, x: f.state.tissue.x + Math.cos(angle) * 285,
        y: f.state.tissue.y + Math.sin(angle) * 285, radius: 78 };
    }) };
    f.enter(); f.drain();
    const assault = f.events.filter(event => event.type === 'ACTOR_SPAWNED' && event.data.assaultObjective === 'tissue');
    expect(assault).toHaveLength(2); expect(assault.every(event => event.data.assaultFallback === true)).toBe(true);
    for (const receipt of assault) {
      const actor = f.state.targets.find(actor => actor.id === receipt.data.id)!;
      expect(isLegalPosition(actor, actor.radius, activeWorld(f.state))).toBe(true);
      expect(distance(actor, f.state.player)).toBeGreaterThanOrEqual(340 - 1e-7);
    }
  });

  it('walks toward tissue while the same unmarked ordinary body continues toward the player', () => {
    const assault = combatFixture(), ordinary = combatFixture(false);
    assault.session.step(idle); ordinary.session.step(idle);
    expect(assault.target.x).toBeLessThan(1390); expect(ordinary.target.x).toBeGreaterThan(1390);
    expect(assault.target.hp).toBe(200); expect(assault.state.tissue.hp).toBe(100);
  });

  it('uses the real melee warning and ordinary tissue damage, with no guaranteed or immediate hit', () => {
    const f = combatFixture(); Object.assign(f.target, { x: 1275, attackReady: 0 });
    f.session.step(idle);
    expect(f.target.attackTarget).toBe('tissue');
    expect(f.target.attackAt! - f.state.elapsed).toBeCloseTo(BATTLE_BALANCE.attackWindup);
    expect(f.state.tissue.hp).toBe(100);
    for (let frame = 0; frame < 40; frame++) f.session.step(idle);
    expect(f.state.tissue.hp).toBe(100);
    for (let frame = 0; frame < 5; frame++) f.session.step(idle);
    expect(f.state.tissue.hp).toBe(100 - endlessStrikeDamage(f.e.wave).tissue);
    const hits = f.state.events.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'enemy-attack');
    expect(hits).toHaveLength(1); expect(hits[0].data.actorId).toBe(f.target.id);
  });

  it('delays area damage and preserves a committed tissue warning instead of granting a universal interrupt', () => {
    const f = combatFixture(); Object.assign(f.target, { x: 1275, attackReady: 0 }); Object.assign(f.state.player, { x: 1650 });
    f.session.step(idle); expect(f.target.attackTarget).toBe('tissue');
    const deadline = f.target.attackAt;
    f.session.step({ ...idle, aim: { x: 1250, y: 900 }, fire: true, tool: 2 });
    expect(f.target.hp).toBe(200); expect(f.target.x).toBe(1275);
    expect(f.target.attackAt).toBe(deadline); expect(f.target.attackTarget).toBe('tissue');
    for (let frame = 0; frame < 18; frame++) f.session.step(idle);
    expect(f.target.hp).toBe(200 - BALANCE.damage[2]);
    expect(f.target.attackAt).toBe(deadline);
    for (let frame = 0; frame < 27; frame++) f.session.step(idle);
    expect(f.state.tissue.hp).toBe(100 - endlessStrikeDamage(f.e.wave).tissue);
  });

  it('allows ordinary precision damage to kill a committed attacker before it harms tissue', () => {
    const f = combatFixture(); Object.assign(f.target, { x: 1275, hp: BALANCE.damage[1], maxHp: BALANCE.damage[1], attackReady: 0 });
    Object.assign(f.state.player, { x: 1650 }); f.session.step(idle);
    expect(f.target.attackTarget).toBe('tissue');
    f.session.step({ ...idle, aim: f.target, fire: true, tool: 1 });
    expect(f.target.hp).toBe(0);
    for (let frame = 0; frame < 50; frame++) f.session.step(idle);
    expect(f.state.tissue.hp).toBe(100);
    expect(f.state.events.some(event => event.type === 'TARGET_CLEARED' && event.data.id === f.target.id)).toBe(true);
  });
});
