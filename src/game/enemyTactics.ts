import { clamp, distance, moveWithCollision, normalized, rayCircle, wallHit } from '../actors/collision';
import { activeWorld, type GameState, type Target, type Vec, type WorldGeometry } from './types';
import type { EnemyAttackPlan, EnemyTactic } from './enemyTacticsTypes';
import { STANDOFF_BALANCE } from './enemyPositioning';
export type { EnemyAttackPlan, EnemyCharge, EnemyTactic } from './enemyTacticsTypes';

const point = (position: Vec): Vec => ({ x: position.x, y: position.y });
const clearLine = (origin: Vec, destination: Vec, bodyRadius: number, world: WorldGeometry): boolean => {
  const length = distance(origin, destination);
  const hit = wallHit(origin, normalized(destination.x - origin.x, destination.y - origin.y), length, world);
  return hit === null || hit >= length - bodyRadius;
};

export function segmentDistance(position: Vec, from: Vec, to: Vec): number {
  const dx = to.x - from.x, dy = to.y - from.y, squared = dx * dx + dy * dy;
  const fraction = squared > 0 ? clamp(((position.x - from.x) * dx + (position.y - from.y) * dy) / squared, 0, 1) : 0;
  return Math.hypot(position.x - from.x - fraction * dx, position.y - from.y - fraction * dy);
}

/** Clip against radius-inflated circles and inset bounds; never project a sliding path as a straight charge. */
export function clipChargeEnd(from: Vec, toward: Vec, requestedDistance: number, radius: number, world: WorldGeometry): Vec {
  const direction = normalized(toward.x - from.x, toward.y - from.y);
  if ((!direction.x && !direction.y) || requestedDistance <= 0) return point(from);
  let length = requestedDistance;
  if (direction.x > 0) length = Math.min(length, (world.bounds.right - radius - from.x) / direction.x);
  if (direction.x < 0) length = Math.min(length, (world.bounds.left + radius - from.x) / direction.x);
  if (direction.y > 0) length = Math.min(length, (world.bounds.bottom - radius - from.y) / direction.y);
  if (direction.y < 0) length = Math.min(length, (world.bounds.top + radius - from.y) / direction.y);
  for (const obstacle of world.obstacles) {
    const hit = rayCircle(from, direction, obstacle, obstacle.radius + radius, Math.max(0, length));
    if (hit !== null) length = Math.min(length, Math.max(0, hit - .5));
  }
  length = Math.max(0, length);
  return { x: from.x + direction.x * length, y: from.y + direction.y * length };
}

/** Shared render/hit endpoint; a thin ray stops before a wall even beyond its frozen aim point. */
export function enemyRayEnd(plan: EnemyAttackPlan, world: WorldGeometry): Vec {
  return clipChargeEnd(plan.origin, plan.aim, plan.range, plan.radius, world);
}

/** Checks reach and geometry only; cooldown, concurrency, commitment and state mutation belong to the host. */
export function enemyAttackPlan(target: Target, state: GameState): EnemyAttackPlan | undefined {
  const tactic = (target as Target & { tactic?: EnemyTactic }).tactic;
  if (!tactic || tactic === 'melee' || target.hp <= 0) return;
  const world = activeWorld(state), wave = state.endless?.wave ?? 1;
  const goal = tactic === 'mimic-corrosion' ? state.tissue : state.player;
  const range = tactic === 'thin-ray' ? target.tacticPosture === 'standoff' ? STANDOFF_BALANCE.attackRange : 530 : tactic === 'mimic-corrosion' ? 650 : 500;
  if (distance(target, goal) > range + 1e-7 || !clearLine(target, goal, goal.radius, world)) return;
  const plan: EnemyAttackPlan = {
    kind: tactic, origin: point(target), aim: point(goal), range,
    windup: tactic === 'thin-ray' ? 1.05 : tactic === 'mimic-corrosion' ? 1.8 : tactic === 'fission-burst' ? 1.25 : 1.2,
    interval: tactic === 'thin-ray' ? 3.2 : tactic === 'mimic-corrosion' ? 5.2 : 3.8,
    radius: tactic === 'thin-ray' ? 18 : tactic === 'fission-burst' ? 62 : tactic === 'mimic-corrosion' ? state.tissue.radius + 10 : 34,
    landings: [], playerDamage: tactic === 'mimic-corrosion' ? 0 : 7 + Math.floor((wave - 1) / 4) + (target.role === 'elite' ? 5 : 0),
    tissueDamage: tactic === 'mimic-corrosion' ? 6 + Math.floor((wave - 1) / 8) : 0,
    recoveryExposure: tactic === 'thin-ray' ? 0 : tactic === 'crystal-charge' ? 2 : 1.5,
  };
  // Center LOS alone can skim a fold that clips the real thick lane short of
  // the body. Keep navigating until the same geometry used to resolve can hit.
  if (tactic === 'thin-ray' && !enemyAttackHits(plan, state.player, state.player.radius, world)) return;
  if (tactic === 'crystal-charge') {
    plan.chargeEnd = clipChargeEnd(target, goal, Math.min(550, distance(target, goal) + 90), target.radius, world);
    if (distance(target, plan.chargeEnd) < 30) {
      if (distance(target, goal) > target.radius + goal.radius + 16) return;
      // A previous rush can end on the target's center. Commit a visible short
      // escape lane instead of asking a zero-length navigator to move forever.
      const baseAngle = distance(target, goal) > 1e-7
        ? Math.atan2(goal.y - target.y, goal.x - target.x) : target.facing ?? 0;
      let end: Vec | undefined;
      for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, Math.PI * .75, -Math.PI * .75]) {
        const angle = baseAngle + offset;
        const candidate = clipChargeEnd(target, { x: target.x + Math.cos(angle), y: target.y + Math.sin(angle) }, 170, target.radius, world);
        if (distance(target, candidate) >= 30) { end = candidate; break; }
      }
      if (!end) return;
      plan.chargeEnd = end; plan.aim = point(end);
    }
    plan.chargeSpeed = 520;
  } else if (tactic === 'fission-burst') {
    const line = normalized(goal.x - target.x, goal.y - target.y);
    const perpendicular = { x: -line.y, y: line.x };
    // One circle threatens the old player point; the other closes one side, leaving the opposite side open.
    for (const offset of [176, 208, 240]) {
      const side = wave % 2 ? 1 : -1;
      const landings = [0, 1].map(index => moveWithCollision({ x: goal.x + perpendicular.x * offset * side * index,
        y: goal.y + perpendicular.y * offset * side * index }, { x: 0, y: 0 }, plan.radius, world));
      const legal = landings.every(landing => world.obstacles.every(obstacle => distance(landing, obstacle) >= obstacle.radius + plan.radius - 1e-7));
      if (legal && distance(landings[0], landings[1]) > plan.radius * 2 + 20) { plan.landings = landings; break; }
    }
    if (plan.landings.length !== 2) return;
  }
  return plan;
}

/** Boolean union of footprints: overlapping circles never double-hit one body. Charges use actual host movement segments instead. */
export function enemyAttackHits(plan: EnemyAttackPlan, position: Vec, bodyRadius: number, world: WorldGeometry): boolean {
  if (plan.kind === 'crystal-charge') return false;
  if (plan.kind === 'thin-ray') {
    const end = enemyRayEnd(plan, world);
    return segmentDistance(position, plan.origin, end) <= plan.radius + bodyRadius
      && clearLine(plan.origin, position, bodyRadius, world);
  }
  const centers = plan.kind === 'fission-burst' ? plan.landings : [plan.aim];
  return centers.some(center => distance(position, center) <= plan.radius + bodyRadius && clearLine(center, position, bodyRadius, world));
}
