import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition, wallHit } from '../../src/actors/collision';
import { ENEMY_CROWD, moveEnemyThroughCrowd } from '../../src/actors/enemyCrowd';
import { STANDOFF_BALANCE, standoffMotion } from '../../src/game/enemyPositioning';
import { BALANCE, type Target, type Vec, type WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1800, bounds: { left: 20, right: 2380, top: 20, bottom: 1780 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (patch: Partial<Target> = {}): Target => ({ id: 'ranged', x: 1000, y: 800, radius: 22,
  hp: 68, maxHp: 68, kind: 'single', role: 'virus', hitUntil: 0, scanned: false,
  tactic: 'thin-ray', tacticPosture: 'standoff', ...patch });
const player = (x: number, y = 800) => ({ x, y, radius: 19 });
const shifted = (point: Vec, delta: Vec) => ({ x: point.x + delta.x, y: point.y + delta.y });
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) freezeDeep(nested);
    Object.freeze(value);
  }
  return value;
}

describe('finite thin-ray standoff positioning', () => {
  it('only handles living thin-ray actors with the selected posture', () => {
    for (const target of [actor({ tacticPosture: undefined }), actor({ tactic: 'crystal-charge' }), actor({ hp: 0 })]) {
      expect(standoffMotion(target, player(1400), world)).toBeUndefined();
    }
    expect(STANDOFF_BALANCE).toEqual({ inner: 560, outer: 600, attackRange: 620, speed: 80 });
  });

  it.each([560, 580, 600])('holds the inclusive distance band at %s units', gap => {
    expect(standoffMotion(actor(), player(1000 + gap), world)).toEqual({ x: 0, y: 0 });
  });

  it('retreats and approaches with one 80-speed step and stops exactly at each band edge', () => {
    const target = actor(), budget = STANDOFF_BALANCE.speed * BALANCE.step;
    expect(standoffMotion(target, player(1400), world)).toEqual({ x: -budget, y: 0 });
    expect(standoffMotion(target, player(1700), world)).toEqual({ x: budget, y: 0 });
    const inner = standoffMotion(target, player(1559.5), world)!;
    const outer = standoffMotion(target, player(1600.5), world)!;
    expect(inner).toEqual({ x: -.5, y: 0 }); expect(outer).toEqual({ x: .5, y: 0 });
    expect(distance(shifted(target, inner), player(1559.5))).toBe(560);
    expect(distance(shifted(target, outer), player(1600.5))).toBe(600);
    for (const goal of [player(1300, 1100), player(1700, 1000)]) {
      const delta = standoffMotion(target, goal, world)!;
      expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(budget + 1e-7);
    }
  });

  it('does not mutate frozen inputs or committed aim, charge endpoints or recovery fields, including zero deadlines', () => {
    const plan = { kind: 'thin-ray' as const, origin: { x: 1000, y: 800 }, aim: { x: 1400, y: 800 }, range: 620,
      radius: 18, windup: 1.05, interval: 3.2, landings: [], playerDamage: 7, tissueDamage: 0, recoveryExposure: 0 };
    const charge = { from: { x: 1000, y: 800 }, to: { x: 1400, y: 800 }, startedAt: 0, endsAt: 1,
      speed: 520, radius: 22, hitPlayer: false, hitTissue: false, playerDamage: 7, tissueDamage: 0, recoveryExposure: 2, interval: 3.8 };
    const geometry = freezeDeep(structuredClone(world)), goal = freezeDeep(player(1400));
    for (const patch of [{ attackAt: 0 }, { attackPlan: plan }, { charge }, { recoverUntil: 0 }]) {
      const target = freezeDeep(actor(patch)), before = structuredClone(target);
      expect(standoffMotion(target, goal, geometry)).toEqual({ x: 0, y: 0 });
      expect(target).toEqual(before);
    }
    const target = freezeDeep(actor()), before = structuredClone({ target, goal, geometry });
    expect(standoffMotion(target, goal, geometry)?.x).toBeLessThan(0);
    expect({ target, goal, geometry }).toEqual(before);
  });

  it('stops at a wall and a corner without a tangential escape', () => {
    const wall = actor({ x: world.bounds.left + 22 });
    expect(standoffMotion(wall, player(wall.x + 400), world)).toEqual({ x: 0, y: 0 });
    const corner = actor({ x: world.bounds.left + 22, y: world.bounds.top + 22 });
    expect(standoffMotion(corner, player(corner.x + 200, corner.y + 200), world)).toEqual({ x: 0, y: 0 });
  });

  it('waits rather than projecting an invalid spawn into a new location', () => {
    expect(standoffMotion(actor({ x: world.bounds.left }), player(400), world)).toEqual({ x: 0, y: 0 });
    expect(standoffMotion(actor(), player(1000), world)).toEqual({ x: 0, y: 0 });
  });

  it('stops for a fold behind a retreat and permits a straight step away from a touching fold', () => {
    const target = actor();
    const blocked: WorldGeometry = { ...world, obstacles: [{ id: 'rear-fold', x: 918, y: 800, radius: 60 }] };
    expect(isLegalPosition(target, target.radius, blocked)).toBe(true);
    expect(standoffMotion(target, player(1400), blocked)).toEqual({ x: 0, y: 0 });
    const away: WorldGeometry = { ...world, obstacles: [{ id: 'front-fold', x: 1082, y: 800, radius: 60 }] };
    const delta = standoffMotion(target, player(1400), away)!;
    expect(delta.x).toBeLessThan(0); expect(delta.y).toBe(0);
    expect(isLegalPosition(shifted(target, delta), target.radius, away)).toBe(true);
  });

  it('returns to route navigation when an approach has no usable firing lane', () => {
    const blocked: WorldGeometry = { ...world, obstacles: [{ id: 'middle', x: 1350, y: 800, radius: 60 }] };
    expect(standoffMotion(actor(), player(1700), blocked)).toBeUndefined();
    const skim: WorldGeometry = { ...world, obstacles: [{ id: 'skimming', x: 1350, y: 867, radius: 60 }] };
    expect(wallHit(actor(), { x: 1, y: 0 }, 700, skim)).toBeNull();
    expect(standoffMotion(actor(), player(1700), skim)).toBeUndefined();
  });

  it('keeps a legal unoccluded approach inside terrain and bounds', () => {
    const target = actor(), goal = player(1700, 1050);
    const geometry: WorldGeometry = { ...world, obstacles: [{ id: 'clear-fold', x: 1250, y: 1000, radius: 40 }] };
    const delta = standoffMotion(target, goal, geometry)!;
    expect(delta).toBeDefined(); expect(delta.x).toBeGreaterThan(0);
    expect(isLegalPosition(shifted(target, delta), target.radius, geometry)).toBe(true);
    expect(distance(shifted(target, delta), goal)).toBeLessThan(distance(target, goal));
  });

  it('applies one step through the shared crowd solver without entering a blocking body', () => {
    const target = actor(), peer = actor({ id: 'peer', x: target.x - target.radius * 2 - ENEMY_CROWD.gap });
    const delta = standoffMotion(target, player(1400), world)!;
    const point = moveEnemyThroughCrowd(target, delta, [target, peer], world);
    expect(distance(point, peer)).toBeGreaterThanOrEqual(target.radius + peer.radius + ENEMY_CROWD.gap - 1e-7);
    expect(distance(point, target)).toBeLessThanOrEqual(STANDOFF_BALANCE.speed * BALANCE.step + 1e-7);
    expect(isLegalPosition(point, target.radius, world)).toBe(true);
  });

  it('lets the 235-speed player close into primary range against an 80-speed retreat in an open unit fixture', () => {
    const target = actor(), goal = player(1590), budget = STANDOFF_BALANCE.speed * BALANCE.step;
    let ticks = 0;
    while (distance(target, goal) > BALANCE.range && ticks < 120) {
      const delta = standoffMotion(target, goal, world)!;
      expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(budget + 1e-7);
      Object.assign(target, moveEnemyThroughCrowd(target, delta, [target], world));
      goal.x -= BALANCE.speed * BALANCE.step; ticks++;
    }
    expect(BALANCE.speed).toBeGreaterThan(STANDOFF_BALANCE.speed);
    expect(distance(target, goal)).toBeLessThanOrEqual(BALANCE.range);
    expect(ticks).toBeLessThan(120);
  });
});
