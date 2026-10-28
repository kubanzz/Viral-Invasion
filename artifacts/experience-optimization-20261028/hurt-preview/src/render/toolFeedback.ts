import { BALANCE, type GameState } from '../game/types';

/** Presentation only: a short response to an accepted use, never a cooldown or a rejected action. */
export function toolFeedback(state: Pick<GameState, 'events' | 'elapsed' | 'tick' | 'tool'>): { strength: number; tool: number } | undefined {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const event = state.events[i];
    if (event.type !== 'TOOL_FIRED' || event.tick > state.tick) continue;
    const age = state.elapsed - event.tick * BALANCE.step;
    if (age < -1e-8 || age >= .12 || event.data.tool !== state.tool) return;
    return { strength: Math.max(0, 1 - age / .12), tool: state.tool };
  }
}
