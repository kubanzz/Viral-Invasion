import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createWeaponCombat, castWeaponSkill, advanceWeaponSkills, cancelWeaponAction, launchWeaponPrimary } from '../../src/game/weaponSkills';
import { castWeaponUltimate, fillWeaponUltimate, creditWeaponKill } from '../../src/game/weaponUltimates';
import { applyBladeTraceInput, bladeControlsLocked, bladeEnemyMovementFactor, bladeRouteBetween, BLADE_TECHNIQUES, resolveBladeIncomingDamage } from '../../src/game/bladeTechniques';
import { playerIncomingDamage } from '../../src/game/weaponMelee';
import { createEndlessGrowth, endlessCombatStats } from '../../src/game/endlessGrowth';
import { BALANCE, type Target, type GameEvent } from '../../src/game/types';
import { isLegalPosition } from '../../src/actors/collision';
import type { PlayerProjectileHost } from '../../src/game/playerProjectiles';
import type { DamageOrigin } from '../../src/game/growthTypes';

function fixture() {
  const game = new GameSession(12020, { mode: 'endless' }); game.start(); const state = game.state;
  Object.assign(state, { tick: 0, elapsed: 0, targets: [], events: [], effects: [], playerProjectiles: [],
    weaponCombat: createWeaponCombat({ weaponId: 'redblade', rarity: 'gold', upgrade: 0 }), endlessGrowth: createEndlessGrowth(0) });
  Object.assign(state.player, { x: 600, y: 700, hp: 100, radius: 19, facing: 0 });
  state.world = { width: 2200, height: 1600, bounds: { left: 0, right: 2200, top: 0, bottom: 1600 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  const hits: { id: string; amount: number; origin: DamageOrigin }[] = [];
  const host: PlayerProjectileHost = { state, damage(target, amount, origin) {
    const actual = Math.min(target.hp, amount); target.hp -= actual;
    hits.push({ id: target.id, amount: actual, origin });
    if (target.hp === 0) creditWeaponKill(state, target, origin); return actual;
  }, emit(type, data) { state.events.push({ type, data, tick: state.tick }); }, effect(kind, from, to, radius, duration) {
    const effect = { id: state.effects.length, kind, from: { ...from }, to: { ...to }, radius, duration, born: state.elapsed }; state.effects.push(effect); return effect;
  } };
  const add = (id: string, x = 780, y = 700, hp = 100000, role: Target['role'] = 'virus') => {
    const body: Target = { id, x, y, radius: 20, hp, maxHp: hp, role, kind: 'single', hitUntil: 0, scanned: false };
    state.targets.push(body); return body;
  };
  const step = (seconds: number) => { for (let n = 0; n < Math.ceil(seconds * 60); n++) {
    if (state.phase === 'playing') { state.tick++; state.elapsed = state.tick * BALANCE.step; }
    advanceWeaponSkills(host, { x: 1000, y: 700 });
  } };
  return { state, host, add, step, hits, events: state.events as GameEvent[] };
}
const base = 42 * 1.09;

describe('redblade counter and compact domain', () => {
  it('perfectly parries only the front first hit and commits a real heavy counter with toughness', () => {
    const f = fixture(), front = f.add('front'), rear = { x: 300, y: 700 };
    expect(castWeaponSkill(f.host, 2, front)).toBe(true);
    expect(resolveBladeIncomingDamage(f.host, 20, { source: rear, id: 'rear' })).toBe(20);
    expect(f.hits).toHaveLength(0);
    expect(resolveBladeIncomingDamage(f.host, 20, { source: front, id: 'front' })).toBe(0);
    expect(f.hits[0].amount).toBeCloseTo(base * 6);
    expect(f.hits[0].origin).toMatchObject({ skillId: 'redblade-parry', toughnessDamage: 40 });
    expect(resolveBladeIncomingDamage(f.host, 20, { source: front, id: 'second' })).toBe(20);
    expect(f.hits).toHaveLength(1);
  });
  it('late guard reduces damage by 75%, while an empty guard releases a weaker actual strike', () => {
    const f = fixture(), target = f.add('front'); castWeaponSkill(f.host, 2, target); f.step(.25);
    expect(resolveBladeIncomingDamage(f.host, 20, { source: target })).toBe(5);
    expect(f.hits[0].amount).toBeCloseTo(base * 3.5); expect(f.hits[0].origin.toughnessDamage).toBe(20);
    const missed = fixture(); missed.add('front'); castWeaponSkill(missed.host, 2, { x: 900, y: 700 }); missed.step(.6);
    expect(missed.hits[0].amount).toBeCloseTo(base * 2);
  });
  it('never parries source-free infection damage and really destroys intercepted flight projectiles', () => {
    const f = fixture(); const target = f.add('front'); castWeaponSkill(f.host, 2, target);
    expect(resolveBladeIncomingDamage(f.host, 20, { id: 'infection-tick' })).toBe(20);
    expect(f.hits).toHaveLength(0);
    f.state.smartViruses = { serial: 0, slime: [], ritual: { serial: 1, encounters: [], projectiles: [{
      id: 'orb', actorId: 'priest', encounterId: 'ritual', wave: 1, x: 670, y: 700, hp: 20, radius: 12,
      angle: Math.PI, phase: 'flight', born: 0, firesAt: 0, expiresAt: 4, aim: { x: 600, y: 700 }, tracking: false,
    }] } };
    f.step(1 / 60);
    expect(f.state.smartViruses.ritual!.projectiles).toHaveLength(0);
    expect(f.events.some(event => event.type === 'RITUAL_PROJECTILE_INTERCEPTED')).toBe(true);
    expect(f.events.some(event => event.type === 'BLADE_PARRIED' && event.data.reflected)).toBe(true);
  });
  it('replaces the old third skill with four moving domain pulses totaling six base attacks', () => {
    const f = fixture(); f.add('durable');
    expect(castWeaponSkill(f.host, 3, { x: 1000, y: 700 })).toBe(true);
    expect(launchWeaponPrimary(f.host, { x: 1000, y: 700 }, endlessCombatStats(f.state.endlessGrowth!), 'ordinary')).toBe(true);
    f.step(2);
    const hits = f.hits.filter(hit => hit.origin.skillId === 'redblade-domain');
    expect(hits).toHaveLength(4); expect(hits.reduce((sum, hit) => sum + hit.amount, 0)).toBeCloseTo(base * 6);
    expect(f.state.weaponCombat!.bladeDomain).toBeUndefined();
  });
});

describe('four-point traced execution', () => {
  it('does not spend energy without reachable biological targets', () => {
    const f = fixture(); fillWeaponUltimate(f.state);
    expect(castWeaponUltimate(f.host, f.state.player)).toBe(false); expect(f.state.weaponCombat!.ultimateEnergy).toBe(100);
  });
  it('manual points drive real swept movement and four ordinary executions without recharging the ultimate', () => {
    const f = fixture(); const targets = [f.add('a', 780, 600, 1000), f.add('b', 980, 600, 1000), f.add('c', 980, 850, 1000), f.add('d', 760, 850, 1000)];
    fillWeaponUltimate(f.state); expect(castWeaponUltimate(f.host, targets[0])).toBe(true);
    const trace = f.state.weaponCombat!.bladeTrace!;
    expect(new Set(trace.marks.map(mark => mark.targetId)).size).toBe(4);
    expect(bladeEnemyMovementFactor(f.state, targets[0])).toBe(.2);
    applyBladeTraceInput(f.state, { points: trace.marks.map(mark => ({ x: mark.x, y: mark.y })), tolerance: 15 });
    expect(trace.phase).toBe('windup'); expect(trace.manual).toBe(true); expect(playerIncomingDamage(f.state, 50)).toBe(0);
    f.step(2.3); expect(targets.every(target => target.hp === 0)).toBe(true);
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(0); expect(f.state.weaponCombat!.bladeTrace).toBeUndefined();
    expect(f.events.filter(event => event.type === 'BLADE_TRACE_HIT')).toHaveLength(4);
  });
  it('auto-connects remaining marks after exactly three seconds and cannot one-shot a boss', () => {
    const f = fixture(), boss = f.add('boss', 820, 700, 10000, 'core'); fillWeaponUltimate(f.state); castWeaponUltimate(f.host, boss);
    expect(f.state.weaponCombat!.bladeTrace!.marks).toHaveLength(4);
    f.step(2.98); expect(f.hits).toHaveLength(0); expect(f.state.weaponCombat!.bladeTrace!.phase).toBe('drawing');
    f.step(2); expect(boss.hp).toBeCloseTo(10000 - base * 40);
    expect(f.hits.every(hit => hit.origin.toughnessDamage === 25 && hit.origin.ultimateId === 'redblade-ultimate')).toBe(true);
    expect(f.events.find(event => event.type === 'BLADE_TRACE_FINISHED')?.data.manual).toBe(false);
  });
  it('gives a manual non-execution damage bonus and never replaces dead marked targets with newly spawned enemies', () => {
    const f = fixture(), elite = f.add('elite', 800, 700, 10000, 'elite'); fillWeaponUltimate(f.state); castWeaponUltimate(f.host, elite);
    const trace = f.state.weaponCombat!.bladeTrace!; applyBladeTraceInput(f.state, { points: trace.marks.map(mark => ({ x: mark.x, y: mark.y })), tolerance: 12 });
    f.step(2.3); expect(elite.hp).toBeCloseTo(10000 - base * 72 * 1.35);
    const dead = fixture(), target = dead.add('old', 800, 700, 1000); fillWeaponUltimate(dead.state); castWeaponUltimate(dead.host, target);
    target.hp = 0; dead.add('new', 1200, 1200, 1000); dead.step(5);
    expect(dead.hits).toHaveLength(0);
  });
  it('routes each leg around solid folds with a full player footprint', () => {
    const f = fixture(); f.state.world!.obstacles = [{ id: 'fold', x: 800, y: 700, radius: 75 }];
    const route = bladeRouteBetween(f.state.player, { x: 1000, y: 700 }, 19, f.state.world!);
    expect(route.length).toBeGreaterThan(1);
    let from: { x: number; y: number } = { x: f.state.player.x, y: f.state.player.y };
    for (const to of route) {
      for (let n = 0; n <= 100; n++) expect(isLegalPosition({ x: from.x + (to.x - from.x) * n / 100, y: from.y + (to.y - from.y) * n / 100 }, 19, f.state.world!)).toBe(true);
      from = to;
    }
  });
  it('keeps the three-second draw window separate from the frozen .65-second cinematic and bounded execution', () => {
    const f = fixture(), boss = f.add('boss', 900, 700, 100000, 'core');
    fillWeaponUltimate(f.state); castWeaponUltimate(f.host, boss);
    const trace = f.state.weaponCombat!.bladeTrace!;
    expect(trace.deadline).toBe(3); expect(playerIncomingDamage(f.state, 50)).toBe(15);
    expect(bladeControlsLocked(f.state)).toBe(false);
    f.step(3); expect(trace.phase).toBe('windup'); expect(f.hits).toHaveLength(0);
    expect(trace.windupStartedAt).toBe(3); expect(trace.until).toBeCloseTo(3.65);
    expect(bladeControlsLocked(f.state)).toBe(true); expect(resolveBladeIncomingDamage(f.host, 50)).toBe(0);
    const frozen = { x: f.state.player.x, y: f.state.player.y };
    f.step(.633); expect(trace.phase).toBe('windup'); expect(f.state.player).toMatchObject(frozen);
    expect(f.hits).toHaveLength(0); expect(trace.executionDuration).toBeGreaterThanOrEqual(.72);
    expect(trace.executionDuration).toBeLessThanOrEqual(1.2);
    f.step(1 / 60); expect(trace.phase).toBe('executing'); expect(trace.executionStartedAt).toBeCloseTo(3.65);
    expect(f.events.filter(event => event.type === 'BLADE_TRACE_COMMITTED')).toHaveLength(1);
    expect(f.events.filter(event => event.type === 'BLADE_TRACE_RELEASED')).toHaveLength(1);
    f.step(1.6); expect(f.events.filter(event => event.type === 'BLADE_TRACE_FINISHED')).toHaveLength(1);
    expect(f.events.filter(event => event.type === 'BLADE_TRACE_IMPACT')).toHaveLength(4);
    expect(f.state.weaponCombat!.bladeTrace).toBeUndefined();
  });
  it.each([false, true])('uses the widened swept corridor and one collateral receipt across all impacts (manual=%s)', manual => {
    const f = fixture(), boss = f.add('boss', 900, 700, 100000, 'core');
    const swept = f.add('swept', 700, 790, 100000, 'source');
    const impact = f.add('impact', 900, 840, 100000, 'source');
    const manualEdge = f.add('manual-edge', 700, 822, 100000, 'source');
    const outside = f.add('outside', 900, 950, 100000, 'source');
    fillWeaponUltimate(f.state); castWeaponUltimate(f.host, boss);
    const trace = f.state.weaponCombat!.bladeTrace!;
    if (manual) applyBladeTraceInput(f.state, { points: trace.marks.map(mark => ({ x: mark.x, y: mark.y })), tolerance: 12 });
    f.step(5.5);
    const factor = manual ? 1.35 : 1;
    for (const body of [swept, impact]) {
      expect(f.hits.filter(hit => hit.id === body.id)).toHaveLength(1);
      expect(100000 - body.hp).toBeCloseTo(base * 12 * factor);
    }
    expect(f.hits.filter(hit => hit.id === 'manual-edge')).toHaveLength(manual ? 1 : 0);
    expect(outside.hp).toBe(100000);
    expect(f.hits.filter(hit => hit.id === boss.id)).toHaveLength(4);
    expect(100000 - boss.hp).toBeCloseTo(base * 40 * factor);
    expect(f.state.weaponCombat!.ultimateEnergy).toBe(0);
  });
  it.each([1, 2, 3])('distributes four distinct impact anchors over %s reachable targets', count => {
    const f = fixture();
    const bodies = Array.from({ length: count }, (_, n) => f.add(`body:${n}`, 800 + n * 120, 700, 10000, 'elite'));
    fillWeaponUltimate(f.state); castWeaponUltimate(f.host, bodies[0]);
    const trace = f.state.weaponCombat!.bladeTrace!;
    expect(trace.marks).toHaveLength(4); expect(new Set(trace.marks.map(mark => mark.targetId)).size).toBe(count);
    expect(new Set(trace.marks.map(mark => `${mark.x},${mark.y}`)).size).toBe(4);
    f.step(5.5);
    expect(f.hits).toHaveLength(4);
    expect(f.hits.reduce((sum, hit) => sum + hit.amount, 0)).toBeCloseTo(base * 72);
    expect(f.events.filter(event => event.type === 'BLADE_TRACE_IMPACT')).toHaveLength(4);
  });
  it('never applies broad corridor or impact damage through an actual solid fold', () => {
    const f = fixture(), boss = f.add('boss', 900, 700, 100000, 'core');
    const blocked = f.add('blocked', 900, 825, 10000, 'source');
    f.state.world!.obstacles = [{ id: 'cover', x: 900, y: 780, radius: 28 }];
    fillWeaponUltimate(f.state); castWeaponUltimate(f.host, boss);
    f.step(5.5); expect(blocked.hp).toBe(10000); expect(boss.hp).toBeLessThan(100000);
    expect(isLegalPosition(f.state.player, f.state.player.radius, f.state.world!)).toBe(true);
  });
  it('bounds the true path and route without deleting obstacle corners', () => {
    const f = fixture(); f.add('body', 1100, 700); fillWeaponUltimate(f.state); castWeaponUltimate(f.host, f.state.player);
    const trace = f.state.weaponCombat!.bladeTrace!;
    applyBladeTraceInput(f.state, { points: Array.from({ length: 128 }, (_, n) => ({ x: 600 + n % 2 * 200, y: 700 + n * 2 })) });
    expect(trace.path.length).toBeLessThanOrEqual(BLADE_TECHNIQUES.trace.maximumPathPoints);
    f.step(3); expect(trace.route.length).toBeLessThanOrEqual(BLADE_TECHNIQUES.trace.maximumRoutePoints);
  });
  it('retains the full cinematic, execution and recovery attack lock after an ordinary action cancellation', () => {
    const f = fixture(); f.add('body'); fillWeaponUltimate(f.state); castWeaponUltimate(f.host, f.state.player);
    const trace = f.state.weaponCombat!.bladeTrace!;
    applyBladeTraceInput(f.state, { points: trace.marks.map(mark => ({ x: mark.x, y: mark.y })), tolerance: 12 });
    const blockedUntil = f.state.weaponCombat!.primaryBlockedUntil;
    expect(blockedUntil).toBeCloseTo(trace.until + trace.executionDuration! + .3);
    cancelWeaponAction(f.state);
    expect(f.state.weaponCombat!.primaryBlockedUntil).toBe(blockedUntil);
    f.step(.64);
    expect(launchWeaponPrimary(f.host, { x: 1000, y: 700 }, endlessCombatStats(f.state.endlessGrowth!), 'during-cinematic')).toBe(false);
  });
  it.each(['drawing', 'windup', 'executing', 'recovery'] as const)('clears %s commitments on death and freezes them on pause', phase => {
    const f = fixture(); f.add('a'); fillWeaponUltimate(f.state); castWeaponUltimate(f.host, f.state.player);
    f.state.weaponCombat!.bladeTrace!.phase = phase;
    const snapshot = structuredClone(f.state.weaponCombat); f.state.phase = 'paused'; f.step(10);
    expect(f.state.weaponCombat).toEqual(snapshot);
    f.state.phase = 'playing'; f.state.player.hp = 0; f.step(1 / 60);
    expect(f.state.weaponCombat!.bladeTrace).toBeUndefined(); expect(f.state.weaponCombat!.ultimate).toBeUndefined();
    expect(f.hits).toHaveLength(0);
  });
  it('freezes on pause and clears all input-independent commitments when the battle ends', () => {
    const f = fixture(); f.add('a'); fillWeaponUltimate(f.state); castWeaponUltimate(f.host, f.state.player);
    const snapshot = structuredClone(f.state.weaponCombat); f.state.phase = 'paused'; f.step(10);
    expect(f.state.weaponCombat).toEqual(snapshot);
    f.state.phase = 'playing'; cancelWeaponAction(f.state, true);
    expect(f.state.weaponCombat!.bladeTrace).toBeUndefined(); expect(f.state.weaponCombat!.ultimate).toBeUndefined();
  });
});
