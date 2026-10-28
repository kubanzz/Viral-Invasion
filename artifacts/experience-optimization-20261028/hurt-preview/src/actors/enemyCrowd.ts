import { distance, moveWithCollision, normalized } from './collision';
import type { Target, Vec, WorldGeometry } from '../game/types';

/** XY body spacing, independent of camera, effects quality and damage rules. */
export const ENEMY_CROWD = { gap: 4, separationSpeedFactor: 1.25 } as const;
const EPSILON = 1e-7;
const byId = (a: Target, b: Target) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

/** Antisymmetric even for exact coincident centers; never consumes gameplay RNG. */
function away(a: Target, b: Target): Vec {
  if (distance(a, b) > EPSILON) return normalized(a.x - b.x, a.y - b.y);
  const first = a.id < b.id, angle = hash(first ? `${a.id}|${b.id}` : `${b.id}|${a.id}`) / 0x100000000 * Math.PI * 2;
  const sign = first ? 1 : -1;
  return { x: Math.cos(angle) * sign, y: Math.sin(angle) * sign };
}

function legal(point: Vec, radius: number, world: WorldGeometry): boolean {
  return point.x >= world.bounds.left + radius - EPSILON && point.x <= world.bounds.right - radius + EPSILON
    && point.y >= world.bounds.top + radius - EPSILON && point.y <= world.bounds.bottom - radius + EPSILON
    && world.obstacles.every(obstacle => distance(point, obstacle) >= radius + obstacle.radius - EPSILON);
}

function rotated(vector: Vec, angle: number): Vec {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

export interface EnemySpacingOptions {
  /** Actual trait/slow-adjusted movement budget for this simulation tick. */
  maxStep: (target: Target) => number;
  isMigrating?: (target: Target) => boolean;
}

/**
 * Simultaneous soft relaxation from one immutable live-body snapshot. A windup
 * is a committed pose, including its resolve tick; only other bodies yield.
 * This returns positions only, leaving application and combat order to host.
 */
export function planEnemySpacing(targets: readonly Target[], world: WorldGeometry, options: EnemySpacingOptions): ReadonlyMap<string, Vec> {
  const live = targets.filter(target => target.hp > 0 && target.role !== 'capsule').slice().sort(byId);
  const fixed = (target: Target) => target.role === 'source' || target.role === 'core'
    || target.attackAt !== undefined || target.charge !== undefined || target.recoverUntil !== undefined || !!options.isMigrating?.(target);
  const result = new Map<string, Vec>();
  for (const target of live) {
    if (fixed(target)) continue;
    const budget = options.maxStep(target);
    if (!Number.isFinite(budget) || budget <= 0) continue;
    let x = 0, y = 0, overlap = false;
    for (const other of live) {
      if (other.id === target.id) continue;
      const penetration = target.radius + other.radius + ENEMY_CROWD.gap - distance(target, other);
      if (penetration <= EPSILON) continue;
      const direction = away(target, other), share = fixed(other) ? 1 : .5;
      x += direction.x * penetration * share; y += direction.y * penetration * share; overlap = true;
    }
    if (!overlap) continue;
    let magnitude = Math.hypot(x, y);
    if (magnitude < EPSILON) {
      const angle = hash(target.id) / 0x100000000 * Math.PI * 2;
      x = Math.cos(angle); y = Math.sin(angle); magnitude = 1;
    }
    const length = Math.min(budget, magnitude), desired = { x: x / magnitude * length, y: y / magnitude * length };
    const energy = (point: Vec) => {
      let value = 0;
      for (const other of live) if (other.id !== target.id) {
        const penetration = Math.max(0, target.radius + other.radius + ENEMY_CROWD.gap - distance(point, other));
        value += penetration * penetration;
      }
      return value;
    };
    const before = energy(target), side = hash(target.id) & 1 ? 1 : -1;
    let best = before, chosen: Vec | undefined;
    // Tangential candidates let exact stacks unfold at a boundary/fold, while
    // the collision projection and displacement cap forbid wall escape jumps.
    for (const angle of [0, side * Math.PI / 4, -side * Math.PI / 4, side * Math.PI / 2, -side * Math.PI / 2]) {
      const point = moveWithCollision(target, rotated(desired, angle), target.radius, world);
      if (!legal(point, target.radius, world) || distance(target, point) > budget + EPSILON) continue;
      const candidate = energy(point);
      if (candidate < best - EPSILON) { best = candidate; chosen = point; }
    }
    if (chosen) result.set(target.id, chosen);
  }
  return result;
}

/**
 * Keep normal pursuit from walking straight back into a newly opened body gap.
 * Queued units take a deterministic shallow tangent or wait; no neighbor means
 * the exact existing static-collision trajectory is returned.
 */
export function moveEnemyThroughCrowd(target: Target, delta: Vec, targets: readonly Target[], world: WorldGeometry): Vec {
  const live = targets.filter(other => other.hp > 0 && other.role !== 'capsule' && other.id !== target.id).slice().sort(byId);
  const allowed = (point: Vec) => live.every(other => {
    const minimum = Math.min(target.radius + other.radius + ENEMY_CROWD.gap, distance(target, other));
    return distance(point, other) >= minimum - EPSILON;
  });
  const forward = moveWithCollision(target, delta, target.radius, world);
  if (allowed(forward)) return forward;
  const side = hash(target.id) & 1 ? 1 : -1;
  for (const angle of [side * Math.PI / 6, -side * Math.PI / 6, side * Math.PI / 3, -side * Math.PI / 3, side * Math.PI / 2, -side * Math.PI / 2]) {
    const point = moveWithCollision(target, rotated(delta, angle), target.radius, world);
    if (legal(point, target.radius, world) && distance(target, point) <= Math.hypot(delta.x, delta.y) + EPSILON && allowed(point)) return point;
  }
  return { x: target.x, y: target.y };
}
