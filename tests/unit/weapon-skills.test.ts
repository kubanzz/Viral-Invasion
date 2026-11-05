import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createEndlessGrowth, endlessCombatStats } from '../../src/game/endlessGrowth';
import { advancePlayerProjectiles, launchPrimary, playerProjectilePopulation, type PlayerProjectileHost } from '../../src/game/playerProjectiles';
import { advanceWeaponSkills, cancelWeaponAction, castWeaponSkill, createWeaponCombat,
  weaponBlocksPrimary, weaponPrimaryCooldown, weaponSkillViews } from '../../src/game/weaponSkills';
import { BALANCE, type GameEvent, type Target, type Vec } from '../../src/game/types';
import type { DamageOrigin } from '../../src/game/growthTypes';
import type { WeaponId } from '../../src/game/expedition';

function fixture(weaponId: WeaponId = 'steady') {
  const game = new GameSession(1600, { mode: 'endless' }); game.start();
  const state = game.state;
  state.elapsed = 0; state.tick = 0; state.targets = []; state.playerProjectiles = []; state.events = [];
  state.endlessGrowth = createEndlessGrowth(1600);
  state.weaponCombat = createWeaponCombat({ weaponId, rarity: 'white', upgrade: 0 });
  state.world = { width: 2000, height: 1500, bounds: { left: 0, right: 2000, top: 0, bottom: 1500 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(state.player, { x: 100, y: 300, facing: 0 });
  const receipts: { id: string; amount: number; origin: DamageOrigin }[] = [], events: GameEvent[] = [];
  const host: PlayerProjectileHost = { state,
    damage(target, amount, origin) { const actual = Math.min(target.hp, amount); target.hp -= actual;
      receipts.push({ id: target.id, amount: actual, origin }); return actual; },
    emit(type, data) { events.push({ type, data, tick: state.tick }); },
    effect(kind, from, to, radius, duration) { return { id: 0, kind, from, to, radius, duration, born: state.elapsed }; } };
  const add = (id: string, x = 300, y = 300, extra: Partial<Target> = {}): Target => {
    const target: Target = { id, x, y, radius: 12, hp: 100000, maxHp: 100000, kind: 'single', role: 'virus', hitUntil: 0, scanned: false, ...extra };
    state.targets.push(target); return target;
  };
  const aim = { x: 900, y: 300 };
  const step = (frames = 1, direction: Vec = aim) => {
    for (let n = 0; n < frames; n++) {
      if (state.phase === 'playing') { state.tick++; state.elapsed = state.tick * BALANCE.step; }
      advanceWeaponSkills(host, direction, BALANCE.step); advancePlayerProjectiles(host, BALANCE.step);
    }
  };
  const stats = () => endlessCombatStats(state.endlessGrowth!);
  return { state, host, receipts, events, add, aim, step, stats };
}

describe('weapon skill commitments and real projectile receipts', () => {
  it('keeps legacy modes disabled unless a weapon sandbox explicitly opts in', () => {
    const f = fixture(); delete f.state.weaponCombat;
    expect(castWeaponSkill(f.host, 1, f.aim)).toBe(false); expect(weaponSkillViews(f.state)).toEqual([]);
    expect(f.state.playerProjectiles).toEqual([]);
  });
  it('fires five timed needles, reads current aim for each, and snapshots damage/metadata at cast', () => {
    const f = fixture(), right = f.add('right', 350, 300, { radius: 22 }), down = f.add('down', 100, 650, { radius: 22 });
    expect(castWeaponSkill(f.host, 1, f.aim)).toBe(true);
    expect(f.state.playerProjectiles).toHaveLength(1); expect(f.state.weaponCombat!.reservedProjectiles).toBe(4);
    expect(castWeaponSkill(f.host, 3, f.aim)).toBe(false);
    expect(f.state.weaponCombat!.cooldowns[3]).toBe(0);
    expect(launchPrimary(f.state, f.aim, f.stats(), 'forbidden')).toBe(false);
    f.state.endlessGrowth!.ranks.power = 10;
    f.step(55, { x: 100, y: 900 });
    expect(right.hp).toBeCloseTo(100000 - 22.1); expect(down.hp).toBeCloseTo(100000 - 4 * 22.1);
    expect(f.receipts).toHaveLength(5);
    expect(f.receipts.every(hit => hit.origin.cause === 'ability' && hit.origin.skillId === 'steady-burst'
      && hit.origin.damageCategory === 'precision' && hit.origin.armorResponse === 'needle')).toBe(true);
    expect(new Set(f.receipts.map(hit => hit.origin.rootId)).size).toBe(1);
    expect(f.state.weaponCombat!.reservedProjectiles).toBe(0); expect(weaponBlocksPrimary(f.state)).toBe(false);
  });
  it('prepares the heavy needle automatically, locks direction and launches from the actual position', () => {
    const f = fixture('piercing'); f.add('old-line', 350); const actual = f.add('new-line', 450, 360);
    expect(castWeaponSkill(f.host, 1, f.aim)).toBe(true);
    f.step(20); expect(f.state.playerProjectiles).toEqual([]); expect(f.receipts).toEqual([]);
    Object.assign(f.state.player, { x: 200, y: 360 }); f.step(25, { x: 200, y: 900 });
    expect(actual.hp).toBe(100000 - 112); expect(f.state.targets[0].hp).toBe(100000);
    expect(f.receipts[0].origin).toMatchObject({ weaponId: 'piercing', skillId: 'piercing-heavy', damageCategory: 'precision', armorResponse: 'heavy' });
  });
  it('limits heavy penetration to six bodies and leaves multishot/pierce upgrades to the primary', () => {
    const f = fixture('piercing'); f.state.endlessGrowth!.ranks = { multishot: 2, pierce: 3 };
    for (let n = 0; n < 8; n++) f.add(`line:${n}`, 220 + n * 65);
    castWeaponSkill(f.host, 1, f.aim); f.step(60);
    expect(f.receipts).toHaveLength(6); expect(f.events.filter(e => e.type === 'PLAYER_PROJECTILE_LAUNCHED')).toHaveLength(1);
  });
  it('shares one fan receipt per leg even when a wide boss overlaps all three blades', () => {
    const f = fixture('piercing'), boss = f.add('boss', 280, 300, { radius: 100, role: 'core' });
    f.add('behind', 470, 300, { radius: 70 }); castWeaponSkill(f.host, 3, f.aim); f.step(50);
    expect(f.receipts.map(hit => hit.id).sort()).toEqual(['behind', 'behind', 'boss', 'boss']); expect(boss.hp).toBe(100000 - 84);
    expect(f.receipts.every(hit => hit.origin.damageCategory === 'area' && hit.origin.armorResponse === 'heavy')).toBe(true);
  });
  it('applies permanent and local damage exactly once, while nova changes only skill 2', () => {
    const f = fixture(); f.state.weaponCombat = createWeaponCombat({ weaponId: 'steady', rarity: 'gold', upgrade: 3 });
    f.state.endlessGrowth!.ranks = { power: 1, nova: 2, multishot: 2, pierce: 3 };
    const target = f.add('blast', 250); castWeaponSkill(f.host, 2, f.aim); f.step(20);
    expect(100000 - target.hp).toBeCloseTo(34 * 1.18 * 1.18 * 2 * 1.3);
    expect(f.events.find(e => e.type === 'PLAYER_CANNON_EXPLODED')!.data.radius).toBe(183);
    expect(f.receipts).toHaveLength(1);
  });
  it('gathers gradually over one second before the blast and schedules one harmless-to-control aftershock', () => {
    const f = fixture('piercing'); f.state.endlessGrowth!.ranks = { catalysis: 1, nova: 1 };
    const victim = f.add('pull', 280, 350); castWeaponSkill(f.host, 2, { x: 250, y: 300 });
    f.step(10); expect(f.receipts).toEqual([]);
    const before = { x: victim.x, y: victim.y }; f.step(5);
    const midpointTravel = Math.hypot(victim.x - before.x, victim.y - before.y);
    expect(midpointTravel).toBeGreaterThan(0); expect(midpointTravel).toBeLessThan(50); expect(f.receipts).toEqual([]);
    f.step(58); expect(f.receipts).toHaveLength(1);
    const after = { x: victim.x, y: victim.y };
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThanOrEqual(80.000001);
    expect(Math.hypot(after.x - 250, after.y - 300)).toBeLessThan(Math.hypot(before.x - 250, before.y - 300));
    f.step(25); expect(f.receipts).toHaveLength(2); expect({ x: victim.x, y: victim.y }).toEqual(after);
    expect(f.receipts[1].amount).toBeCloseTo(f.receipts[0].amount * .4);
    expect(f.receipts[1].origin.allowChain).toBe(false);
    expect(f.events.filter(e => e.type === 'PLAYER_CANNON_AFTERSHOCK')).toHaveLength(1);
  });
  it('pushes at most seventy from the player, gives heavy bodies .35 displacement and respects committed/fixed actors', () => {
    const f = fixture();
    const ordinary = f.add('ordinary', 235, 325), heavy = f.add('heavy', 235, 275, { traits: ['CARAPACE'] });
    const fixed = f.add('fixed', 240, 340, { profession: 'ritual-priest' });
    const windup = f.add('windup', 240, 260, { attackAt: 10 });
    const starts = f.state.targets.map(t => ({ x: t.x, y: t.y }));
    castWeaponSkill(f.host, 2, { x: 230, y: 300 }); f.step(20);
    expect(Math.hypot(ordinary.x - starts[0].x, ordinary.y - starts[0].y)).toBeCloseTo(70);
    expect(Math.hypot(heavy.x - starts[1].x, heavy.y - starts[1].y)).toBeCloseTo(24.5);
    expect({ x: fixed.x, y: fixed.y }).toEqual(starts[2]); expect({ x: windup.x, y: windup.y }).toEqual(starts[3]);
  });
  it('keeps shared reservations under 192 and never spends a cooldown for a rejected burst', () => {
    const f = fixture();
    for (let n = 0; n < 188; n++) expect(launchPrimary(f.state, f.aim, f.stats(), `fill:${n}`)).toBe(true);
    expect(castWeaponSkill(f.host, 1, f.aim)).toBe(false); expect(f.state.weaponCombat!.cooldowns[1]).toBe(0);
    f.state.playerProjectiles!.pop(); expect(castWeaponSkill(f.host, 1, f.aim)).toBe(true);
    expect(playerProjectilePopulation(f.state)).toBe(192); expect(f.state.playerProjectiles).toHaveLength(188);
    expect(castWeaponSkill(f.host, 2, f.aim)).toBe(false); expect(f.state.weaponCombat!.cooldowns[2]).toBe(0);
    cancelWeaponAction(f.state); expect(playerProjectilePopulation(f.state)).toBe(188);
    expect(f.state.weaponCombat!.cooldowns[1]).toBe(6);
  });
  it('freezes actions during pause and cancels future needles without refunding the accepted cast', () => {
    const f = fixture(); castWeaponSkill(f.host, 1, f.aim); f.step(5);
    f.state.phase = 'paused'; const before = structuredClone(f.state.weaponCombat), shots = structuredClone(f.state.playerProjectiles);
    f.step(300); expect(f.state.weaponCombat).toEqual(before); expect(f.state.playerProjectiles).toEqual(shots);
    cancelWeaponAction(f.state); expect(f.state.weaponCombat!.reservedProjectiles).toBe(0);
    f.state.phase = 'playing'; f.step(60);
    expect(f.events.filter(e => e.type === 'PLAYER_PROJECTILE_LAUNCHED')).toHaveLength(2);
    expect(f.state.weaponCombat!.cooldowns[1]).toBe(6);
  });
  it('does not resurrect cancelled burst reservations after reentrant event handling', () => {
    const f = fixture(); castWeaponSkill(f.host, 1, f.aim);
    f.host.emit = (type, data) => {
      f.events.push({ type, data, tick: f.state.tick });
      if (type === 'PLAYER_PROJECTILE_LAUNCHED') cancelWeaponAction(f.state);
    };
    // Deliberately advance the simulation clock before one action drain.
    f.state.elapsed = .4; advanceWeaponSkills(f.host, f.aim);
    expect(f.state.weaponCombat!.reservedProjectiles).toBe(0);
    expect(f.events.filter(e => e.type === 'PLAYER_PROJECTILE_LAUNCHED')).toHaveLength(2);
    expect(f.state.weaponCombat!.burst).toBeUndefined();
  });
  it('computes overdrive in integer simulation ticks with a five-tick floor and no cooldown refresh', () => {
    const f = fixture(); castWeaponSkill(f.host, 3, f.aim);
    expect(weaponBlocksPrimary(f.state)).toBe(false);
    expect(weaponPrimaryCooldown(f.state, f.stats())).toBe(9 * BALANCE.step);
    f.state.endlessGrowth!.ranks.haste = 100;
    expect(weaponPrimaryCooldown(f.state, f.stats())).toBe(5 * BALANCE.step);
    expect(castWeaponSkill(f.host, 3, f.aim)).toBe(false); f.step(240);
    expect(weaponPrimaryCooldown(f.state, f.stats())).toBe(6 * BALANCE.step);
    expect(f.state.weaponCombat!.cooldowns[3]).toBe(18);
  });
  it('uses swept walls for weapon skills and never displaces or damages a target through a fold', () => {
    const f = fixture(); f.state.world!.obstacles = [{ id: 'fold', x: 210, y: 300, radius: 30 }];
    const covered = f.add('covered', 260); castWeaponSkill(f.host, 2, f.aim); f.step(40);
    expect(covered.hp).toBe(100000); expect(covered.x).toBe(260);
  });
});

/** Stationary durable event targets remove movement/displacement variance.
 * Both kits use the same aim, normal attack uptime and greedy 1→2→3 policy.
 * This isolates combat identity; it is not a natural-play clear-time claim. */
export function measureWeaponKit(weaponId: WeaponId, count: 1 | 5): number {
  const f = fixture(weaponId);
  for (let n = 0; n < count; n++) f.add(`durable:${n}`, 250 + n * 75, 300, { role: 'event', hp: 1000000, maxHp: 1000000 });
  let readyAt = 0, serial = 0;
  for (let tick = 0; tick < 30 / BALANCE.step; tick++) {
    for (const slot of [1, 2, 3] as const) if (weaponSkillViews(f.state)[slot - 1].ready) castWeaponSkill(f.host, slot, f.aim);
    if (!weaponBlocksPrimary(f.state) && f.state.elapsed + 1e-8 >= readyAt
      && launchPrimary(f.state, f.aim, f.stats(), `measured:${++serial}`)) readyAt = f.state.elapsed + weaponPrimaryCooldown(f.state, f.stats());
    f.step();
  }
  return f.receipts.reduce((sum, hit) => sum + hit.amount, 0);
}

describe('thirty-second white-weapon zero-growth identity baseline', () => {
  it('keeps steady at least 15% ahead against one durable target', () => {
    const steady = measureWeaponKit('steady', 1), piercing = measureWeaponKit('piercing', 1);
    console.info(JSON.stringify({ condition: '30s-single', steady, piercing, ratio: steady / piercing }));
    expect(steady / piercing).toBeGreaterThanOrEqual(1.15);
  });
  it('keeps piercing at least 30% ahead against five collinear durable targets', () => {
    const steady = measureWeaponKit('steady', 5), piercing = measureWeaponKit('piercing', 5);
    console.info(JSON.stringify({ condition: '30s-five-line', steady, piercing, ratio: piercing / steady }));
    expect(piercing / steady).toBeGreaterThanOrEqual(1.30);
  });
});
