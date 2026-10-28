import { distance, moveWithCollision, normalized, wallHit } from '../actors/collision';
import { activeWorld, BALANCE, type GameState, type Target, type Vec } from './types';
import type { EndlessCombatStats } from './endlessGrowthTypes';
import type { TractionAdvance, TractionCast, TractionDisplacement } from './tractionTypes';

export type * from './tractionTypes';

export const TRACTION_BALANCE = {
  range: 420, gatherRadius: 130, fuse: .30, cooldown: 2,
  displacementBudget: 70, heavyFactor: .35,
  guideMinimumRank: 3, guideThreshold: .18, guideDuration: .85,
  guideSpeed: 220, guideOffset: 100, guidePullSpeed: 100, guideMoveMultiplier: .75,
} as const;

const point = (position: Vec): Vec => ({ x: position.x, y: position.y });
const finitePoint = (position: Vec): boolean => Number.isFinite(position.x) && Number.isFinite(position.y);

export function beginTraction(state: GameState, id: string, center: Vec, stats?: EndlessCombatStats): TractionCast {
  const guideUnlocked = (stats?.areaGuideDuration ?? 0) > 0;
  const cast: TractionCast = {
    id, organId: state.battle?.organId ?? 'heart', stage: guideUnlocked ? 'aiming' : 'fuse',
    center: point(center), initialCenter: point(center), startedAt: state.elapsed,
    resolveAt: state.elapsed + TRACTION_BALANCE.fuse,
    guideUntil: state.elapsed + TRACTION_BALANCE.guideDuration,
    radius: stats?.areaRadius ?? BALANCE.areaRadius,
    gatherRadius: stats?.areaGatherRadius ?? TRACTION_BALANCE.gatherRadius,
    damageSnapshot: BALANCE.damage[2] * (stats?.damageMultiplier ?? 1) * (stats?.areaDamageMultiplier ?? 1),
    catalysisDamageSnapshot: stats?.catalysisDamage ?? 0,
    guideUnlocked, gathered: false, movedByTargetId: {},
  };
  state.traction = cast;
  return cast;
}

/** Committed attacks keep their frozen warning and body position. No plan is cancelled. */
function displacementFactor(target: Target, elapsed: number): number {
  if (!Number.isFinite(target.hp) || target.hp <= 0 || !Number.isFinite(target.radius) || target.radius <= 0
    || target.role === 'source' || target.role === 'core' || target.role === 'capsule'
    || target.attackPlan || target.charge || (target.recoverUntil ?? 0) > elapsed
    || target.attackAt !== undefined && target.attackAt >= elapsed) return 0;
  return target.role === 'elite' || target.traits?.includes('CARAPACE') ? TRACTION_BALANCE.heavyFactor : 1;
}

function gather(state: GameState, cast: TractionCast, maximumStep: number): TractionDisplacement[] {
  const moved: TractionDisplacement[] = [], world = activeWorld(state);
  for (const target of state.targets) {
    const factor = displacementFactor(target, state.elapsed);
    if (!factor || !finitePoint(target)) continue;
    const gap = distance(cast.center, target);
    if (gap > cast.gatherRadius + target.radius) continue;
    const direction = normalized(cast.center.x - target.x, cast.center.y - target.y);
    const wall = wallHit(cast.center, { x: -direction.x, y: -direction.y }, gap, world);
    if (wall !== null && wall < gap - target.radius) continue;
    const previous = cast.movedByTargetId[target.id] ?? 0;
    const step = Math.min(TRACTION_BALANCE.displacementBudget * factor - previous,
      maximumStep * factor, Math.max(0, gap - target.radius - 12));
    if (step <= 1e-9) continue;
    const after = moveWithCollision(target, { x: direction.x * step, y: direction.y * step }, target.radius, world);
    const actual = distance(target, after);
    if (actual <= 1e-9) continue;
    target.x = after.x; target.y = after.y;
    cast.movedByTargetId[target.id] = previous + actual;
    moved.push({ targetId: target.id, distance: actual, total: previous + actual, x: after.x, y: after.y });
  }
  return moved;
}

function guideCenter(state: GameState, cast: TractionCast, aim: Vec, dt: number): void {
  if (!finitePoint(aim)) return;
  const offset = normalized(aim.x - cast.initialCenter.x, aim.y - cast.initialCenter.y);
  const offsetLength = Math.min(distance(aim, cast.initialCenter), TRACTION_BALANCE.guideOffset);
  const desired = { x: cast.initialCenter.x + offset.x * offsetLength, y: cast.initialCenter.y + offset.y * offsetLength };
  const fromPlayer = normalized(desired.x - state.player.x, desired.y - state.player.y);
  const playerGap = distance(state.player, desired);
  if (playerGap > TRACTION_BALANCE.range) return;
  const wall = wallHit(state.player, fromPlayer, playerGap, activeWorld(state));
  if (wall !== null && wall < playerGap - 1) return;
  const direction = normalized(desired.x - cast.center.x, desired.y - cast.center.y);
  const step = Math.min(distance(cast.center, desired), TRACTION_BALANCE.guideSpeed * dt);
  cast.center = moveWithCollision(cast.center, { x: direction.x * step, y: direction.y * step }, 1, activeWorld(state));
}

/** Mutates only the cast and collision-checked positions; the host owns all damage receipts. */
export function advanceTraction(state: GameState, holding: boolean, aim: Vec, dt: number): TractionAdvance {
  const result: TractionAdvance = { guidingStarted: false, released: false, ready: false, moved: [] };
  const cast = state.traction;
  if (!cast || state.phase !== 'playing' || cast.organId !== (state.battle?.organId ?? 'heart')) return result;
  if (cast.stage === 'aiming' && holding && state.elapsed + 1e-9 >= cast.startedAt + TRACTION_BALANCE.guideThreshold) {
    cast.stage = 'guiding'; result.guidingStarted = true;
  }
  if (cast.stage === 'guiding') {
    guideCenter(state, cast, aim, dt);
    result.moved.push(...gather(state, cast, TRACTION_BALANCE.guidePullSpeed * dt));
  }
  if (cast.stage !== 'fuse' && (!holding || state.elapsed + 1e-9 >= cast.guideUntil)) {
    const quick = cast.stage === 'aiming';
    cast.stage = 'fuse';
    cast.resolveAt = quick ? Math.max(state.elapsed, cast.startedAt + TRACTION_BALANCE.fuse) : state.elapsed + TRACTION_BALANCE.fuse;
    result.released = true;
  }
  if (cast.stage === 'fuse' && !cast.gathered) {
    result.moved.push(...gather(state, cast, TRACTION_BALANCE.displacementBudget));
    cast.gathered = true;
  }
  result.ready = cast.stage === 'fuse' && state.elapsed + 1e-9 >= cast.resolveAt;
  return result;
}

export function tractionMoveMultiplier(state: GameState): number {
  return state.traction?.stage === 'guiding' ? TRACTION_BALANCE.guideMoveMultiplier : 1;
}

export function tractionBlastTargets(state: GameState, cast: TractionCast): Target[] {
  return state.targets.filter(target => {
    if (!Number.isFinite(target.hp) || target.hp <= 0 || !Number.isFinite(target.radius) || target.radius <= 0 || !finitePoint(target)) return false;
    const gap = distance(cast.center, target);
    if (gap > cast.radius + target.radius) return false;
    const wall = wallHit(cast.center, normalized(target.x - cast.center.x, target.y - cast.center.y), gap, activeWorld(state));
    return wall === null || wall >= gap - target.radius;
  });
}
