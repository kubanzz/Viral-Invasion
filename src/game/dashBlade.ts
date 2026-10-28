import { distance, normalized, wallHit } from '../actors/collision';
import type { Target, Vec, WorldGeometry } from './types';

export const DASH_BLADE_BALANCE = {
  damagePerRank: 55, baseRadius: 150, radiusPerRank: 10, maximumRadius: 240,
  baseHalfAngle: Math.PI * .6, circularRank: 3, returnRank: 6,
  returnDelay: .28, returnDamageFactor: .65, effectSeconds: .24,
} as const;

export function dashBladeProfile(rank: number) {
  const safeRank = Number.isSafeInteger(rank) && rank > 0 ? rank : 0;
  return {
    radius: Math.min(DASH_BLADE_BALANCE.maximumRadius, DASH_BLADE_BALANCE.baseRadius + safeRank * DASH_BLADE_BALANCE.radiusPerRank),
    halfAngle: safeRank >= DASH_BLADE_BALANCE.circularRank ? Math.PI : DASH_BLADE_BALANCE.baseHalfAngle,
    returnSlash: safeRank >= DASH_BLADE_BALANCE.returnRank,
  };
}

/** A visible fan, with body-radius tolerance and the same local cover as tools. */
export function dashBladeHits(center: Vec, direction: Vec, target: Target, radius: number, halfAngle: number, geometry: WorldGeometry): boolean {
  const gap = distance(center, target);
  if (target.hp <= 0 || gap > radius + target.radius) return false;
  const toward = normalized(target.x - center.x, target.y - center.y);
  const facing = Math.atan2(direction.y, direction.x), angle = Math.atan2(toward.y, toward.x);
  const delta = Math.abs(Math.atan2(Math.sin(angle - facing), Math.cos(angle - facing)));
  const tolerance = gap <= target.radius ? Math.PI : Math.asin(Math.min(1, target.radius / gap));
  if (delta > halfAngle + tolerance + 1e-9) return false;
  const block = wallHit(center, toward, gap, geometry);
  return block === null || block >= gap - target.radius;
}
