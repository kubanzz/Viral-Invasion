import { BATTLE_BALANCE } from './battleConfig';
import type { GameState } from './types';

export const ENDLESS_POPULATION_LIMIT = 48;

/** Spawn queues, fission reservations and detached payloads share one mode limit. */
export function combatPopulationLimit(state: Pick<GameState, 'endless'>): number {
  return state.endless ? ENDLESS_POPULATION_LIMIT : BATTLE_BALANCE.maxActors;
}
