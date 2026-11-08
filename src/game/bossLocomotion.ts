import { distance, isLegalPosition, moveWithCollision, normalized, rayCircle } from '../actors/collision';
import { BALANCE, type Vec, type WorldGeometry } from './types';
import type { MotherCoreContext, MotherCoreLocomotion } from './motherCoreTypes';

export const BOSS_LOCOMOTION = {
  pursuitSpeed: [125, 145, 165], strafeSpeed: [75, 90, 105], approachDistance: [215, 205, 190],
  recoveryHold: .32, routeSeconds: .4, routeGoalChange: 32, maximumRoutePoints: 162,
  legacySpeed: 70, legacyLeash: 120,
  lunge: { windup: [.95, .85, .75], range: [310, 350, 390], speed: [700, 780, 850], damage: [20, 24, 28],
    recovery: .8, minimumDistance: 100, overshoot: 60 },
} as const;
const copy = (value: Vec): Vec => ({ x: value.x, y: value.y });
export function bossSegmentPoint(point: Vec, from: Vec, to: Vec): Vec {
  const dx = to.x - from.x, dy = to.y - from.y, square = dx * dx + dy * dy;
  const t = square ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / square)) : 0;
  return { x: from.x + dx * t, y: from.y + dy * t };
}
function clear(from: Vec, to: Vec, radius: number, world: WorldGeometry): boolean {
  return isLegalPosition(from, radius, world) && isLegalPosition(to, radius, world)
    && world.obstacles.every(obstacle => distance(obstacle, bossSegmentPoint(obstacle, from, to)) >= obstacle.radius + radius - 1e-7);
}
/** Bounded, deterministic swept-circle visibility graph. Its chosen corners are
 * stored in the boss state, so JSON restore does not alter a cached pursuit. */
function route(from: Vec, goal: Vec, radius: number, world: WorldGeometry): Vec[] {
  const to = moveWithCollision(goal, { x: 0, y: 0 }, radius, world);
  if (clear(from, to, radius, world)) return [copy(to)];
  if (!isLegalPosition(from, radius, world) || !isLegalPosition(to, radius, world)) return [];
  const nodes = [copy(from), to];
  for (const obstacle of world.obstacles) {
    const extent = (obstacle.radius + radius + 1) / Math.cos(Math.PI / 16);
    for (let n = 0; n < 16 && nodes.length < BOSS_LOCOMOTION.maximumRoutePoints; n++) {
      const angle = n * Math.PI / 8, point = { x: obstacle.x + Math.cos(angle) * extent, y: obstacle.y + Math.sin(angle) * extent };
      if (isLegalPosition(point, radius, world)) nodes.push(point);
    }
  }
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>(); costs[0] = 0;
  for (let n = 0; n < nodes.length; n++) {
    let current = -1;
    for (let k = 0; k < nodes.length; k++) if (!visited.has(k) && Number.isFinite(costs[k]) && (current < 0 || costs[k] < costs[current])) current = k;
    if (current < 0 || current === 1) break;
    visited.add(current);
    for (let k = 1; k < nodes.length; k++) if (!visited.has(k) && clear(nodes[current], nodes[k], radius, world)) {
      const cost = costs[current] + distance(nodes[current], nodes[k]);
      if (cost < costs[k]) { costs[k] = cost; previous[k] = current; }
    }
  }
  if (!Number.isFinite(costs[1])) return [];
  const result: Vec[] = []; for (let k = 1; k > 0; k = previous[k]) result.push(copy(nodes[k]));
  return result.reverse();
}
export function createBossLocomotion(core: Vec): MotherCoreLocomotion {
  return { mode: 'idle', moving: false, velocity: { x: 0, y: 0 }, anchor: copy(core), route: [], replanAt: 0, holdUntil: 0 };
}
export function stopBossLocomotion(motion: MotherCoreLocomotion, clearRoute = false): void {
  motion.mode = 'idle'; motion.moving = false; motion.velocity = { x: 0, y: 0 };
  if (clearRoute) { motion.route = []; delete motion.routeGoal; motion.replanAt = 0; }
}
/** A charge advertises and follows this exact straight corridor. It never slides
 * around a fold into unadvertised space or teleports out of an invalid spawn. */
export function bossStraightEnd(from: Vec, direction: Vec, range: number, radius: number, world: WorldGeometry): Vec {
  if (!isLegalPosition(from, radius, world)) return copy(from);
  let length = Math.max(0, range);
  if (direction.x > 0) length = Math.min(length, (world.bounds.right - radius - from.x) / direction.x);
  if (direction.x < 0) length = Math.min(length, (world.bounds.left + radius - from.x) / direction.x);
  if (direction.y > 0) length = Math.min(length, (world.bounds.bottom - radius - from.y) / direction.y);
  if (direction.y < 0) length = Math.min(length, (world.bounds.top + radius - from.y) / direction.y);
  for (const obstacle of world.obstacles) {
    const separation = { x: from.x - obstacle.x, y: from.y - obstacle.y };
    if (distance(from, obstacle) <= obstacle.radius + radius + 1e-6
      && separation.x * direction.x + separation.y * direction.y >= 0) continue;
    const hit = rayCircle(from, direction, obstacle, obstacle.radius + radius, length);
    if (hit !== null) length = Math.min(length, Math.max(0, hit - .5));
  }
  return { x: from.x + direction.x * Math.max(0, length), y: from.y + direction.y * Math.max(0, length) };
}
export function recordBossMovement(motion: MotherCoreLocomotion, from: Vec, to: Vec, elapsed: number): Vec {
  const delta = { x: to.x - from.x, y: to.y - from.y };
  motion.velocity = { x: delta.x / BALANCE.step, y: delta.y / BALANCE.step }; motion.moving = distance(from, to) > 1e-6;
  if (motion.moving) motion.trail = { from: copy(from), to: copy(to), at: elapsed };
  return delta;
}
/** Recovery-only hunting; windups, pulse travel and stun never call this. */
export function advanceBossWalk(context: MotherCoreContext, motion: MotherCoreLocomotion, stage?: 1 | 2 | 3, cycle = 0): Vec | undefined {
  const factor = Math.max(0, Math.min(1, context.movementFactor ?? 1));
  if (!factor || context.elapsed < motion.holdUntil || !isLegalPosition(context.core, context.core.radius, context.geometry)) {
    stopBossLocomotion(motion); return;
  }
  const gap = distance(context.core, context.player), index = (stage ?? 1) - 1;
  let goal: Vec, speed: number;
  if (stage) {
    const toward = normalized(context.player.x - context.core.x, context.player.y - context.core.y);
    const preferred = BOSS_LOCOMOTION.approachDistance[index], side = Math.floor(cycle / 2) % 2 ? -1 : 1;
    motion.mode = gap > preferred + 65 ? 'pursuit' : 'strafe';
    goal = motion.mode === 'pursuit'
      ? { x: context.player.x - toward.x * preferred, y: context.player.y - toward.y * preferred }
      : { x: context.player.x - toward.x * preferred - toward.y * 95 * side, y: context.player.y - toward.y * preferred + toward.x * 95 * side };
    speed = motion.mode === 'pursuit' ? BOSS_LOCOMOTION.pursuitSpeed[index] : BOSS_LOCOMOTION.strafeSpeed[index];
  } else {
    const toward = normalized(context.player.x - motion.anchor.x, context.player.y - motion.anchor.y);
    const side = cycle % 2 ? -1 : 1;
    goal = { x: motion.anchor.x + toward.x * BOSS_LOCOMOTION.legacyLeash * .5 - toward.y * BOSS_LOCOMOTION.legacyLeash * .6 * side,
      y: motion.anchor.y + toward.y * BOSS_LOCOMOTION.legacyLeash * .5 + toward.x * BOSS_LOCOMOTION.legacyLeash * .6 * side };
    speed = BOSS_LOCOMOTION.legacySpeed; motion.mode = 'pursuit';
  }
  if (distance(context.core, goal) < 8) { stopBossLocomotion(motion); return; }
  if (!motion.routeGoal || distance(motion.routeGoal, goal) > BOSS_LOCOMOTION.routeGoalChange || context.elapsed >= motion.replanAt) {
    motion.route = route(context.core, goal, context.core.radius, context.geometry); motion.routeGoal = copy(goal);
    motion.replanAt = context.elapsed + BOSS_LOCOMOTION.routeSeconds;
  }
  while (motion.route.length && distance(context.core, motion.route[0]) < 3) motion.route.shift();
  const waypoint = motion.route[0];
  if (!waypoint || !clear(context.core, waypoint, context.core.radius, context.geometry)) { stopBossLocomotion(motion, true); return; }
  const direction = normalized(waypoint.x - context.core.x, waypoint.y - context.core.y);
  const travel = Math.min(distance(context.core, waypoint), speed * factor * BALANCE.step);
  const next = moveWithCollision(context.core, { x: direction.x * travel, y: direction.y * travel }, context.core.radius, context.geometry);
  if (!stage && distance(next, motion.anchor) > BOSS_LOCOMOTION.legacyLeash) { stopBossLocomotion(motion, true); return; }
  const delta = recordBossMovement(motion, context.core, next, context.elapsed);
  return motion.moving ? delta : undefined;
}
