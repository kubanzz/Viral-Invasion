import { distance, isLegalPosition, normalized, rayCircle, wallHit } from '../actors/collision';
import { BALANCE, type Target, type Vec, type WorldGeometry } from './types';

export const STANDOFF_BALANCE = { inner: 560, outer: 600, attackRange: 620, speed: 80 } as const;

const EPSILON = 1e-7;
const RAY_RADIUS = 18;
const still = (): Vec => ({ x: 0, y: 0 });

function segmentDistance(point: Vec, from: Vec, to: Vec): number {
  const dx = to.x - from.x, dy = to.y - from.y, lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - from.x - dx * fraction, point.y - from.y - dy * fraction);
}

/** Match the thick thin-ray lane without importing its planner back into this module. */
function clearAttackLane(from: Vec, player: Vec & { radius?: number }, world: WorldGeometry): boolean {
  const gap = distance(from, player), direction = normalized(player.x - from.x, player.y - from.y);
  const bodyRadius = player.radius ?? 19;
  const centerHit = wallHit(from, direction, gap, world);
  if (centerHit !== null && centerHit < gap - bodyRadius) return false;
  let length = gap;
  if (direction.x > 0) length = Math.min(length, (world.bounds.right - RAY_RADIUS - from.x) / direction.x);
  if (direction.x < 0) length = Math.min(length, (world.bounds.left + RAY_RADIUS - from.x) / direction.x);
  if (direction.y > 0) length = Math.min(length, (world.bounds.bottom - RAY_RADIUS - from.y) / direction.y);
  if (direction.y < 0) length = Math.min(length, (world.bounds.top + RAY_RADIUS - from.y) / direction.y);
  for (const obstacle of world.obstacles) {
    const hit = rayCircle(from, direction, obstacle, obstacle.radius + RAY_RADIUS, Math.max(0, length));
    if (hit !== null) length = Math.min(length, Math.max(0, hit - .5));
  }
  return gap - Math.max(0, length) <= RAY_RADIUS + bodyRadius;
}

/**
 * A fixed-step world displacement, applied once by the host's crowd movement.
 * Zero means wait; undefined leaves unsupported actors or blocked approaches
 * to ordinary navigation. Retreat never slides around a wall or a fold.
 */
export function standoffMotion(target: Target, player: Vec & { radius?: number }, geometry: WorldGeometry): Vec | undefined {
  if (target.tacticPosture !== 'standoff' || target.tactic !== 'thin-ray' || target.hp <= 0) return;
  if (target.attackAt !== undefined || target.attackPlan !== undefined || target.charge !== undefined || target.recoverUntil !== undefined) return still();
  if (!isLegalPosition(target, target.radius, geometry)) return still();
  const gap = distance(target, player);
  if (gap >= STANDOFF_BALANCE.inner && gap <= STANDOFF_BALANCE.outer) return still();
  if (gap <= EPSILON) return still();
  const retreat = gap < STANDOFF_BALANCE.inner;
  if (!retreat && !clearAttackLane(target, player, geometry)) return;
  const direction = normalized(player.x - target.x, player.y - target.y);
  const length = Math.min(STANDOFF_BALANCE.speed * BALANCE.step,
    retreat ? STANDOFF_BALANCE.inner - gap : gap - STANDOFF_BALANCE.outer);
  const sign = retreat ? -1 : 1;
  const delta = { x: direction.x === 0 ? 0 : direction.x * length * sign,
    y: direction.y === 0 ? 0 : direction.y * length * sign };
  const end = { x: target.x + delta.x, y: target.y + delta.y };
  const clearStep = isLegalPosition(end, target.radius, geometry)
    && geometry.obstacles.every(obstacle => segmentDistance(obstacle, target, end) >= target.radius + obstacle.radius - EPSILON);
  if (!clearStep) return retreat ? still() : undefined;
  return delta;
}
