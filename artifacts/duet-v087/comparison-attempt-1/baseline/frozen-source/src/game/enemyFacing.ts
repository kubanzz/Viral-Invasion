import type { Target } from './types';

// About 69 degrees/second. At radius 100 the player's normal 235-unit/s
// movement can outpace this turn and leave the existing 78.46-degree front
// half-cone; a stationary player still stays in the unchanged resistance cone.
export const CARAPACE_TURN_RATE = 1.2;

/** Update only free-facing bodies. Attack snapshots and recovery keep their pose. */
export function updateEnemyFacing(target: Target, desiredFacing: number, deltaSeconds: number): void {
  if (target.attackAt !== undefined || target.attackPlan !== undefined || target.charge !== undefined || target.recoverUntil !== undefined) return;
  if (!Number.isFinite(desiredFacing)) return;
  if (!target.traits?.includes('CARAPACE') || !Number.isFinite(target.facing)) {
    target.facing = desiredFacing;
    return;
  }
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  const current = target.facing!;
  const difference = Math.atan2(Math.sin(desiredFacing - current), Math.cos(desiredFacing - current));
  const limit = CARAPACE_TURN_RATE * deltaSeconds;
  const next = current + Math.max(-limit, Math.min(limit, difference));
  target.facing = Math.atan2(Math.sin(next), Math.cos(next));
}
