import { distance, normalized, wallHit } from '../actors/collision';
import { CATALYSIS_UPGRADE_BALANCE } from './endlessGrowth';
import type { PendingCatalysisBatch } from './endlessGrowthTypes';
import { activeWorld, type GameState, type Target, type Vec } from './types';

export const CATALYSIS_BALANCE = {
  directDamageCap: CATALYSIS_UPGRADE_BALANCE.primerDamageCap,
  duration: CATALYSIS_UPGRADE_BALANCE.duration,
  maximumTargets: CATALYSIS_UPGRADE_BALANCE.maxTargets,
  radius: CATALYSIS_UPGRADE_BALANCE.radius,
  damageMultiplier: CATALYSIS_UPGRADE_BALANCE.damageMultiplier,
} as const;

const usable = (target: Target): boolean => target.role !== 'core' && Number.isFinite(target.hp) && target.hp > 0
  && Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.radius) && target.radius > 0;
const nearest = (center: Vec) => (a: Target, b: Target) => distance(center, a) - distance(center, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A still-valid transaction may be claimed by the positive hit that just killed its final member. */
export function activeCatalysisBatch(state: GameState): PendingCatalysisBatch | undefined {
  const growth = state.endlessGrowth, batch = growth?.pendingCatalysis;
  if (!state.endless || !growth || !growth.ranks.catalysis || !batch || !state.battle
    || state.phase !== 'playing' && state.phase !== 'paused' || state.player.hp <= 0 || state.tissue.hp <= 0
    || batch.organId !== state.battle.organId || !Number.isFinite(batch.until) || batch.until <= state.elapsed
    || !Number.isFinite(batch.damage) || batch.damage <= 0) return;
  return batch;
}

/** Pure presentation query: expired/dead marks do not need a render-driven cleanup. */
export function activeCatalysisTargets(state: GameState): Target[] {
  const batch = activeCatalysisBatch(state);
  if (!batch) return [];
  const ids = new Set(batch.targetIds.slice(0, CATALYSIS_BALANCE.maximumTargets));
  return state.targets.filter(target => ids.has(target.id) && usable(target));
}

/** Only the host's actual positive primer receipts may supply these candidate IDs. */
export function makeCatalysisBatch(state: GameState, id: string, hitIds: readonly string[], center: Vec, damage: number): PendingCatalysisBatch | undefined {
  if (!state.endless || !state.endlessGrowth?.ranks.catalysis || !state.battle || state.phase !== 'playing'
    || !Number.isFinite(damage) || damage <= 0) return;
  const ids = new Set(hitIds);
  const targetIds = state.targets.filter(target => ids.has(target.id) && usable(target)).sort(nearest(center))
    .slice(0, CATALYSIS_BALANCE.maximumTargets).map(target => target.id);
  if (!targetIds.length) return;
  return { id, organId: state.battle.organId, createdAt: state.elapsed,
    until: state.elapsed + CATALYSIS_BALANCE.duration, targetIds, damage };
}

/** One finite blast; each body's line of sight is checked before stable truncation. */
export function catalysisBurstTargets(state: GameState, center: Vec): Target[] {
  return state.targets.filter(target => {
    if (!usable(target)) return false;
    const gap = distance(center, target);
    if (gap > CATALYSIS_BALANCE.radius + target.radius + 1e-7) return false;
    const wall = wallHit(center, normalized(target.x - center.x, target.y - center.y), gap, activeWorld(state));
    return wall === null || wall >= gap - target.radius;
  }).sort(nearest(center)).slice(0, CATALYSIS_BALANCE.maximumTargets);
}
