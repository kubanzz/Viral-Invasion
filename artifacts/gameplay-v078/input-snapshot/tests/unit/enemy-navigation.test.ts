import { describe, expect, it } from 'vitest';
import { EnemyNavigator } from '../../src/actors/enemyNavigation';
import { distance, isLegalPosition, moveWithCollision, normalized, wallHit } from '../../src/actors/collision';
import { moveEnemyThroughCrowd } from '../../src/actors/enemyCrowd';
import { HEART_WORLD, LUNG_WORLD } from '../../src/game/organConfig';
import type { Target, Vec, WorldGeometry } from '../../src/game/types';

const actor = (id: string, patch: Partial<Target> = {}): Target => ({ id, x: 400, y: 650, radius: 22, hp: 68, maxHp: 68,
  kind: 'single', role: 'virus', traits: [], scanned: false, hitUntil: 0, attackReady: 0, ...patch });
const lineClear = (from: Vec, to: Vec, world: WorldGeometry) => {
  const length = distance(from, to), hit = wallHit(from, normalized(to.x - from.x, to.y - from.y), length, world);
  return hit === null || hit >= length - 20;
};
const fields = ({ x: _x, y: _y, ...target }: Target) => target;
function follow(target: Target, goal: Vec, world: WorldGeometry, reach = 69, seconds = 35) {
  const navigator = new EnemyNavigator(), history: Vec[] = [];
  let reached = false, travelled = 0;
  for (let tick = 0; tick < seconds * 60; tick++) {
    if (distance(target, goal) <= reach && lineClear(target, goal, world)) { reached = true; break; }
    const waypoint = navigator.waypoint(target, goal, world, tick / 60);
    const direction = normalized(waypoint.x - target.x, waypoint.y - target.y);
    const step = Math.min(64 / 60, distance(target, waypoint));
    const next = moveEnemyThroughCrowd(target, { x: direction.x * step, y: direction.y * step }, [target], world);
    expect(isLegalPosition(next, target.radius, world)).toBe(true);
    expect(distance(target, next)).toBeLessThanOrEqual(64 / 60 + 1e-7);
    travelled += distance(target, next); Object.assign(target, { x: next.x, y: next.y });
    if (tick % 30 === 0) history.push({ x: target.x, y: target.y });
  }
  return { reached, travelled, history, navigator };
}

describe('bounded static enemy navigation', () => {
  it('routes the exact elite barrier reproduction until both range and line of sight are valid', () => {
    const target = actor('elite-2', { role: 'elite', radius: 30 }), goal = { x: 850, y: 650 }, before = fields(target);
    const result = follow(target, goal, HEART_WORLD, 250);
    expect(result.reached).toBe(true); expect(lineClear(target, goal, HEART_WORLD)).toBe(true);
    expect(result.history.some(point => Math.abs(point.y - 650) > 40)).toBe(true);
    expect(fields(target)).toEqual(before); expect(goal).toEqual({ x: 850, y: 650 });
  });

  it('routes around the lower lung fold from two legal boundary positions', () => {
    const target = actor('virus-2', { x: 550, y: 1393 }), goal = { x: 750, y: 1393 };
    const result = follow(target, goal, LUNG_WORLD);
    expect(result.reached).toBe(true);
    expect(result.history.some(point => point.y < 1250)).toBe(true);
    expect(result.travelled).toBeLessThan(700);
  });

  it.each([14, 22, 30])('keeps radius %i bodies clear along opposite sides of every chamber fold', radius => {
    for (const world of [HEART_WORLD, LUNG_WORLD]) for (const obstacle of world.obstacles) {
      const start = { x: obstacle.x - obstacle.radius - radius - 120, y: obstacle.y };
      const goal = { x: obstacle.x + obstacle.radius + radius + 120, y: obstacle.y };
      if (!isLegalPosition(start, radius, world) || !isLegalPosition(goal, radius, world)) continue;
      const target = actor(`${obstacle.id}-${radius}`, { ...start, radius });
      expect(follow(target, goal, world).reached).toBe(true);
    }
  });

  it('leaves an unobstructed direct trajectory identical to the original collision movement', () => {
    const navigator = new EnemyNavigator(), target = actor('straight', { x: 120, y: 300 }), goal = { x: 400, y: 300 };
    let original: Vec = { x: target.x, y: target.y };
    for (let tick = 0; tick < 180; tick++) {
      const waypoint = navigator.waypoint(target, goal, HEART_WORLD, tick / 60);
      expect(waypoint).toEqual(goal);
      const direction = normalized(goal.x - original.x, goal.y - original.y), delta = { x: direction.x, y: direction.y };
      original = moveWithCollision(original, delta, 22, HEART_WORLD);
      const moved = moveWithCollision(target, delta, 22, HEART_WORLD);
      target.x = moved.x; target.y = moved.y;
      expect({ x: target.x, y: target.y }).toEqual(original);
    }
  });

  it('recomputes when the goal or world changes and does not mix actors', () => {
    const navigator = new EnemyNavigator(), first = actor('first'), second = actor('second', { x: 1050, y: 650 });
    const firstWaypoint = navigator.waypoint(first, { x: 850, y: 650 }, HEART_WORLD, 0);
    expect(firstWaypoint).not.toEqual({ x: 850, y: 650 });
    navigator.waypoint(first, { x: 850, y: 690 }, HEART_WORLD, .01);
    expect((navigator as unknown as { routes: Map<string, { plannedAt: number }> }).routes.get(first.id)!.plannedAt).toBe(.01);
    expect(navigator.waypoint(first, { x: 200, y: 650 }, HEART_WORLD, .01)).toEqual({ x: 200, y: 650 });
    const secondWaypoint = navigator.waypoint(second, { x: 400, y: 650 }, HEART_WORLD, .01);
    expect(secondWaypoint).not.toEqual(firstWaypoint);
    const empty = { ...HEART_WORLD, obstacles: [] };
    expect(navigator.waypoint(first, { x: 850, y: 650 }, empty, .02)).toEqual({ x: 850, y: 650 });
  });

  it('expires actor plans within .4 seconds, caps retained actors, and prunes dead runs', () => {
    const navigator = new EnemyNavigator();
    // Inspect only resource bounds and expiry, not path internals or node order.
    const cache = navigator as unknown as { routes: Map<string, { plannedAt: number }> };
    const targets = Array.from({ length: 24 }, (_, index) => actor(`live-${index}`));
    for (const target of targets) navigator.waypoint(target, { x: 850, y: 650 }, HEART_WORLD, 0);
    expect(cache.routes.size).toBe(24);
    navigator.waypoint(targets[0], { x: 850, y: 650 }, HEART_WORLD, .39);
    expect(cache.routes.get(targets[0].id)!.plannedAt).toBe(0);
    navigator.waypoint(targets[0], { x: 850, y: 650 }, HEART_WORLD, .4);
    expect(cache.routes.get(targets[0].id)!.plannedAt).toBe(.4);
    for (let i = 0; i < 100; i++) navigator.waypoint(actor(`expired-${i}`), { x: 850, y: 650 }, HEART_WORLD, .5);
    expect(cache.routes.size).toBeLessThanOrEqual(24);
    navigator.prune(targets); expect(cache.routes.size).toBe(0);
    navigator.waypoint(targets[0], { x: 850, y: 650 }, HEART_WORLD, 1);
    targets[0].hp = 0; navigator.prune(targets); expect(cache.routes.size).toBe(0);
    navigator.waypoint(targets[1], { x: 850, y: 650 }, HEART_WORLD, 1);
    navigator.clear(); expect(cache.routes.size).toBe(0);
  });

  it('shares blocked plans for 24 actors across small moving-goal changes instead of replanning each frame', () => {
    const navigator = new EnemyNavigator(), targets = Array.from({ length: 24 }, (_, index) => actor(`moving-${index}`));
    const cache = navigator as unknown as { routes: Map<string, { plannedAt: number }> };
    const previousPlans = new Map<string, number>();
    let replans = 0;
    for (let tick = 0; tick < 240; tick++) {
      const goal = { x: 850, y: 650 + ((tick % 8) - 4) * 4 };
      for (const target of targets) {
        const waypoint = navigator.waypoint(target, goal, HEART_WORLD, tick / 60);
        expect(isLegalPosition(waypoint, target.radius, HEART_WORLD)).toBe(true);
        const plan = cache.routes.get(target.id)!.plannedAt;
        if (previousPlans.get(target.id) !== plan) { replans++; previousPlans.set(target.id, plan); }
      }
    }
    expect(replans).toBeLessThanOrEqual(24 * 11);
    expect(replans).toBeGreaterThanOrEqual(24 * 9);
    const previous = cache.routes.get(targets[0].id)!.plannedAt;
    navigator.waypoint(targets[0], { x: 850, y: 750 }, HEART_WORLD, 4);
    expect(cache.routes.get(targets[0].id)!.plannedAt).toBeGreaterThan(previous);
  });

  it('caps radius graphs per world and clears them between encounters', () => {
    const navigator = new EnemyNavigator(), world = { ...HEART_WORLD };
    const cache = navigator as unknown as { graphs: WeakMap<WorldGeometry, Map<number, unknown>> };
    for (let radius = 10; radius <= 40; radius++) navigator.waypoint(actor(`r-${radius}`, { radius }), { x: 950, y: 650 }, world, 0);
    expect(cache.graphs.get(world)!.size).toBeLessThanOrEqual(8);
    navigator.clear(); expect(cache.graphs.get(world)).toBeUndefined();
  });

  it('preserves committed attacks, fixed/dead actors, goal state and all combat fields', () => {
    const navigator = new EnemyNavigator(), goal = { x: 850, y: 650 };
    const targets = [actor('windup', { attackAt: 2, attackAim: { ...goal }, attackTarget: 'player' }), actor('dead', { hp: 0 }), actor('source', { role: 'source' }), actor('core', { role: 'core' }), actor('recovering', { recoverUntil: 1 }),
      actor('charging', { charge: { from: { x: 400, y: 650 }, to: { x: 800, y: 650 }, startedAt: 0, endsAt: 1, speed: 400, radius: 24, hitPlayer: false, hitTissue: false, playerDamage: 12, tissueDamage: 0, recoveryExposure: 2, interval: 3.8 } })];
    const before = structuredClone(targets);
    for (const target of targets) expect(navigator.waypoint(target, goal, HEART_WORLD, 0)).toEqual({ x: target.x, y: target.y });
    expect(targets).toEqual(before); expect(goal).toEqual({ x: 850, y: 650 });
  });

  it('does not invent a path through an impassable obstacle or outside the chamber', () => {
    const world: WorldGeometry = { width: 500, height: 500, bounds: { left: 0, right: 500, top: 0, bottom: 500 }, obstacles: [{ id: 'seal', x: 250, y: 250, radius: 251 }], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    const target = actor('sealed', { x: 30, y: 30 }), goal = { x: 470, y: 470 };
    expect(isLegalPosition(target, target.radius, world)).toBe(true);
    expect(new EnemyNavigator().waypoint(target, goal, world, 0)).toEqual({ x: target.x, y: target.y });
  });

  it('approaches a smaller target near the boundary without returning an illegal endpoint', () => {
    const world = { ...HEART_WORLD, obstacles: [] }, target = actor('large', { x: 400, y: 300, radius: 30 });
    const waypoint = new EnemyNavigator().waypoint(target, { x: 104, y: 170 }, world, 0);
    expect(isLegalPosition(waypoint, target.radius, world)).toBe(true);
    expect(distance(waypoint, { x: 104, y: 170 })).toBeLessThan(20);
  });
});
