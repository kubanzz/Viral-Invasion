import { distance, isLegalPosition, normalized, rayCircle } from '../actors/collision';
import { SeedRng } from '../core/rng';
import type { EndlessSourcePlan, EndlessSpawnRole } from './endlessTypes';
import { activeWorld, type GameState, type Vec } from './types';

export const ENDLESS_SOURCE_BALANCE = {
  minimumWave: 6, warningSeconds: 8, quota: 6, radius: 34, healthInOrdinaryBodies: 2.5,
  minimumTissueDistance: 684, minimumArrivalDistance: 340, maximumArrivalDistance: 600,
} as const;

export const sourcePlanEligible = (wave: number): boolean => Number.isSafeInteger(wave)
  && wave >= ENDLESS_SOURCE_BALANCE.minimumWave && (wave - 1) % 5 === 0;

export const sourceQuotaRemaining = (source: EndlessSourcePlan): number => Math.max(0,
  source.quotaSlots.length - source.bornQuotaSlots.length - source.canceledSlots.length);

/** Freeze one visible, reachable far-side point before the eight-second warning. */
export function planEndlessSource(state: GameState, wave: number, roles: readonly EndlessSpawnRole[]): EndlessSourcePlan | undefined {
  if (!sourcePlanEligible(wave) || roles[0] !== 'ordinary') return;
  // Tail slots leave a real choice window after the first nearby threats arrive.
  // Keep the original schedule: no empty waiting period is added for the source.
  const quotaSlots = roles.flatMap((role, slot) => slot > 0 && role === 'ordinary' ? [slot] : []).slice(-ENDLESS_SOURCE_BALANCE.quota);
  if (!quotaSlots.length) return;
  const world = activeWorld(state), rng = new SeedRng((state.seed ^ Math.imul(wave, 0x53524345)) >>> 0);
  const rotation = rng.next() * Math.PI * 2;
  for (const radius of [720, 800, 880, 960]) for (let attempt = 0; attempt < 32; attempt++) {
    const angle = rotation + attempt * Math.PI / 16;
    const position = { x: state.tissue.x + Math.cos(angle) * radius, y: state.tissue.y + Math.sin(angle) * radius };
    if (!isLegalPosition(position, ENDLESS_SOURCE_BALANCE.radius, world)
      || distance(position, state.tissue) < ENDLESS_SOURCE_BALANCE.minimumTissueDistance) continue;
    const direction = normalized(position.x - state.tissue.x, position.y - state.tissue.y);
    // Reserve a real walking/shooting approach from the tissue, not a sealed pocket.
    if (world.obstacles.some(obstacle => rayCircle(state.tissue, direction, obstacle,
      obstacle.radius + state.player.radius + 2, radius) !== null)) continue;
    return { id: `endless-source:${state.seed}:${wave}`, slot: 0, position, status: 'active', bornAt: null,
      quotaSlots, bornQuotaSlots: [], canceledSlots: [], fallbackBirths: 0 };
  }
  // A custom sealed fixture must not permanently block the finite wave queue.
  return;
}

/** A finite quota arrives along its source approach; all ordinary spawn safety remains. */
export function sourceQuotaPosition(state: GameState, source: EndlessSourcePlan, slot: number, radius: number): Vec | undefined {
  const world = activeWorld(state), rng = new SeedRng((state.seed ^ Math.imul(slot + 1, 0x85ebca6b) ^ Math.imul(state.endless!.wave, 0x9e3779b1)) >>> 0);
  const toward = Math.atan2(state.player.y - source.position.y, state.player.x - source.position.x);
  for (const travel of [80, 140, 200, 260, 320, 380, 440]) for (let attempt = 0; attempt < 12; attempt++) {
    const angle = toward + (attempt - 5.5) * .045 + (rng.next() - .5) * .025;
    const position = { x: source.position.x + Math.cos(angle) * travel, y: source.position.y + Math.sin(angle) * travel };
    const playerDistance = distance(position, state.player);
    if (playerDistance < ENDLESS_SOURCE_BALANCE.minimumArrivalDistance || playerDistance > ENDLESS_SOURCE_BALANCE.maximumArrivalDistance
      || !isLegalPosition(position, radius + 2, world)
      || distance(position, state.tissue) < radius + state.tissue.radius + 40
      || state.targets.some(target => target.hp > 0 && distance(position, target) < target.radius + radius + 12)) continue;
    return position;
  }
  return;
}

export function isEndlessSourceId(id: string): boolean { return id.startsWith('endless-source:'); }
