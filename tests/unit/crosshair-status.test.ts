import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BALANCE } from '../../src/game/types';
import { TRACTION_BALANCE } from '../../src/game/traction';
import { crosshairStatus } from '../../src/render/crosshairStatus';

describe('tool aiming geometry feedback', () => {
  it('uses the real tool-specific range including the exact boundary', () => {
    const game = new GameSession(71); game.start();
    const state = game.state;
    state.world = { ...state.world!, obstacles: [] };
    for (const tool of [1, 2, 3] as const) {
      state.tool = tool;
      const range = tool === 2 ? TRACTION_BALANCE.range : BALANCE.range;
      expect(crosshairStatus(state, { x: state.player.x + range, y: state.player.y })).toBe('in-range');
      expect(crosshairStatus(state, { x: state.player.x + range + .01, y: state.player.y })).toBe('out-of-range');
    }
  });
  it('warns for an occluded 2/3 target but does not claim precision cannot hit a target before a fold', () => {
    const game = new GameSession(71); game.start();
    const state = game.state, p = state.player;
    state.world = { ...state.world!, obstacles: [{ id: 'fold-test', x: p.x + 100, y: p.y, radius: 20 }] };
    const behind = { x: p.x + 200, y: p.y }, before = { x: p.x + 70, y: p.y };
    for (const tool of [2, 3] as const) {
      state.tool = tool;
      expect(crosshairStatus(state, behind)).toBe('blocked');
      expect(crosshairStatus(state, before)).toBe('in-range');
    }
    state.tool = 1;
    expect(crosshairStatus(state, behind)).toBe('in-range');
  });
  it('uses the authoritative player location at range edges instead of an interpolated location', () => {
    const game = new GameSession(71); game.start();
    const state = game.state; state.world = { ...state.world!, obstacles: [] }; state.tool = 2;
    const aim = { x: state.player.x + TRACTION_BALANCE.range + 1, y: state.player.y };
    const interpolated = { ...state, player: { ...state.player, x: state.player.x + 2 } };
    expect(crosshairStatus(interpolated, aim)).toBe('in-range');
    expect(crosshairStatus(state, aim)).toBe('out-of-range');
  });
});
