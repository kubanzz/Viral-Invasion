import { distance, isLegalPosition, normalized, rayCircle, wallHit } from '../actors/collision';
import { SeedRng } from '../core/rng';
import { endlessPacing } from './endlessPacing';
import type { EndlessSourcePlan, EndlessSpawnRole } from './endlessTypes';
import { activeWorld, type GameState, type Vec } from './types';

export const ENDLESS_ASSAULT_BALANCE = {
  minimumWave: 6, slots: [1, 4] as readonly number[],
  minimumTissueDistance: 240, maximumTissueDistance: 340, minimumPlayerDistance: 340,
} as const;

/** Two existing ordinary slots change their objective; no additional bodies. */
export function endlessAssaultSlots(wave: number, roles: readonly EndlessSpawnRole[], source?: EndlessSourcePlan): number[] {
  if (!Number.isSafeInteger(wave) || wave < ENDLESS_ASSAULT_BALANCE.minimumWave || endlessPacing(wave).role !== 'pressure') return [];
  return ENDLESS_ASSAULT_BALANCE.slots.filter(slot => roles[slot] === 'ordinary' && !source?.quotaSlots.includes(slot));
}

/** A bounded legal flank with a real walking approach to the defended tissue. */
export function endlessAssaultPosition(state: GameState, slot: number, radius: number): Vec | undefined {
  const geometry = activeWorld(state), wave = state.endless!.wave;
  const rng = new SeedRng((state.seed ^ Math.imul(wave, 0x41535354) ^ Math.imul(slot + 1, 0x85ebca6b)) >>> 0);
  const rotation = rng.next() * Math.PI * 2;
  for (const range of [240, 290, 340]) for (let bearing = 0; bearing < 32; bearing++) {
    const angle = rotation + bearing * Math.PI / 16;
    const candidate = { x: state.tissue.x + Math.cos(angle) * range, y: state.tissue.y + Math.sin(angle) * range };
    const playerDistance = distance(candidate, state.player);
    if (playerDistance < ENDLESS_ASSAULT_BALANCE.minimumPlayerDistance - 1e-7 || !isLegalPosition(candidate, radius, geometry)
      || geometry.obstacles.some(obstacle => distance(candidate, obstacle) < radius + obstacle.radius + 2)
      || distance(candidate, state.tissue) < radius + state.tissue.radius + 40
      || state.targets.some(actor => actor.hp > 0 && distance(candidate, actor) < actor.radius + radius + 12)) continue;
    const tissueDirection = normalized(candidate.x - state.tissue.x, candidate.y - state.tissue.y);
    if (geometry.obstacles.some(obstacle => rayCircle(state.tissue, tissueDirection, obstacle,
      obstacle.radius + radius + 2, range) !== null)) continue;
    const playerBlock = wallHit(state.player, normalized(candidate.x - state.player.x, candidate.y - state.player.y), playerDistance, geometry);
    if (playerBlock !== null && playerBlock < playerDistance - radius) continue;
    return candidate;
  }
  // Existing ordinary spawning remains the fallback; never hold its queue slot
  // merely because this optional nearer tissue approach is unavailable.
  return;
}
