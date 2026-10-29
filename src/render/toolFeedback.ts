import { BALANCE, type GameState } from '../game/types';

/** Presentation only: a short response to an accepted use, never a cooldown or a rejected action. */
export function toolFeedback(state: Pick<GameState, 'events' | 'elapsed' | 'tick' | 'tool' | 'visualTime'>): { strength: number; tool: number } | undefined {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const event = state.events[i];
    if (event.type !== 'TOOL_FIRED' || event.tick > state.tick) continue;
    const born = event.tick * BALANCE.step, age = state.elapsed - born;
    const visualAge = Math.max(0, (state.visualTime ?? state.elapsed) - born);
    if (age < -1e-8 || visualAge >= .12 || event.data.tool !== state.tool) return;
    return { strength: Math.max(0, 1 - visualAge / .12), tool: state.tool };
  }
}
