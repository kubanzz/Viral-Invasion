import { BATTLE_BALANCE } from './battleConfig';
import type { GameState } from './types';

export const ENDLESS_POPULATION_LIMIT = 48;

/** Spawn queues, fission reservations and detached payloads share one mode limit. */
export function combatPopulationLimit(state: Pick<GameState, 'endless'>): number {
  return state.endless ? ENDLESS_POPULATION_LIMIT : BATTLE_BALANCE.maxActors;
}

/** Every producer consults the same live + already promised population ledger. */
export function combatPopulation(state: Pick<GameState, 'targets' | 'endless'>) {
  let reserved = 0, parents = 0, pending = 0;
  for (const target of state.targets) {
    if (target.role === 'event') continue;
    const current = target.sourceId === `endless:wave:${state.endless?.wave}`;
    if (target.hp > 0) {
      const parent = target.role !== 'source' && target.role !== 'core' && target.role !== 'nest'
        && target.traits?.includes('FISSION') && (target.generation ?? 0) === 0;
      reserved += parent ? 2 : 1;
      if (parent) parents++;
    } else if (target.splitAt !== undefined) {
      const count = target.splitPositions?.length ?? 2;
      reserved += count; if (current) pending += count;
    }
  }
  let broodReserved = 0;
  for (const plan of state.endless?.smartSupport?.plans ?? []) if (plan.status === 'active')
    broodReserved += plan.slots.filter(slot => !plan.bornSlots.includes(slot) && !plan.canceledSlots.includes(slot)).length;
  return { reserved: reserved + broodReserved, parents, pending, broodReserved };
}
