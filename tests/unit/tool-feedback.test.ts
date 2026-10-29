import { describe, expect, it } from 'vitest';
import { BALANCE, type GameEvent, type GameState } from '../../src/game/types';
import { toolFeedback } from '../../src/render/toolFeedback';

const fired = (tick: number, tool: number): GameEvent => ({ type: 'TOOL_FIRED', tick, data: { tool } });
const sample = (tick: number, events: GameEvent[], tool: 1 | 2 | 3 = 1) => ({
  tick, elapsed: tick * BALANCE.step, events, tool,
} as Pick<GameState, 'events' | 'elapsed' | 'tick' | 'tool'>);

describe('tool presentation feedback', () => {
  it('fades between simulation ticks while showing an accepted shot immediately', () => {
    const state = sample(63, [fired(60, 1)]), before = structuredClone(state);
    const first = toolFeedback({ ...state, visualTime: 1.035 })!.strength;
    const next = toolFeedback({ ...state, visualTime: 1.04 })!.strength;
    expect(first).toBeGreaterThan(next);
    expect(first - next).toBeCloseTo(.005 / .12);
    expect(toolFeedback({ ...sample(60, [fired(60, 1)]), visualTime: .99 })!.strength).toBe(1);
    expect(toolFeedback({ ...sample(59, [fired(60, 1)]), visualTime: 1 })).toBeUndefined();
    expect(state).toEqual(before);
  });

  it('follows accepted simulation events, fades, and does not flash on rejected uses or tool switch', () => {
    const event = fired(60, 1);
    expect(toolFeedback(sample(60, [event]))).toEqual({ strength: 1, tool: 1 });
    expect(toolFeedback(sample(63, [event]))!.strength).toBeGreaterThan(0);
    expect(toolFeedback(sample(68, [event]))).toBeUndefined();
    expect(toolFeedback(sample(60, [event], 2))).toBeUndefined();
    expect(toolFeedback(sample(60, [{ type: 'TOOL_REJECTED', tick: 60, data: { tool: 1 } }]))).toBeUndefined();
  });
});
