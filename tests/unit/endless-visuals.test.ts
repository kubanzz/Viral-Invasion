import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { GameEvent, GameState, Target } from '../../src/game/types';
import { combatReceiptFeedback, drawCombatReceiptFeedback, drawEndlessRestoration, endlessDeathPose, endlessRestoration } from '../../src/render/endlessVisuals';

function challenge(): GameState {
  const game = new GameSession(71, { mode: 'endless' }); game.start();
  game.state.elapsed = 2; game.state.tick = 120;
  game.state.targets = []; game.state.events = [];
  return game.state;
}
function actor(id: string, x: number, hp = 34): Target {
  return { id, role: 'virus', kind: 'single', x, y: 500, radius: 18, hp, maxHp: 34, hitUntil: 0, scanned: false, ...(hp === 0 ? { deadAt: 2 } : {}) };
}
function drawing() {
  const calls: string[] = [];
  const ctx = new Proxy({}, {
    get: (_, name) => name === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => calls.push(String(name)),
    set: () => true,
  }) as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('challenge restoration and accepted combat feedback', () => {
  it('derives bounded revival from clear progress independently of real tissue damage', () => {
    const state = challenge(); state.tissue.hp = 25;
    expect(endlessRestoration(state)).toMatchObject({ progress: 0, tissueRatio: .25, tint: 0xcfc3cb });
    for (let wave = 1; wave <= 5; wave++) {
      state.endless!.clearedWaves = wave;
      expect(endlessRestoration(state)?.progress).toBe(wave / 5);
    }
    state.endless!.clearedWaves = 500;
    expect(endlessRestoration(state)).toEqual({ progress: 1, tissueRatio: .25, tint: 0xffffff });
    expect(state.tissue.hp).toBe(25);
    state.phase = 'paused'; expect(endlessRestoration(state)?.progress).toBe(1);
    state.phase = 'menu'; expect(endlessRestoration(state)).toBeNull();
    state.phase = 'result'; expect(endlessRestoration(state)).toBeNull();
    const campaign = new GameSession(71, { campaign: true, milestone: 'G3' }); campaign.start();
    expect(endlessRestoration(campaign.state)).toBeNull();
  });

  it('keeps the low-effects restoration readable without blood particles or completion decoration', () => {
    const state = challenge(); state.endless!.clearedWaves = 5;
    state.events.push({ type: 'ENDLESS_WAVE_CLEARED', tick: 120, data: { wave: 5 } });
    const before = JSON.stringify(state), full = drawing(), low = drawing();
    drawEndlessRestoration(full.ctx, state, false); drawEndlessRestoration(low.ctx, state, true);
    expect(full.calls.filter(call => call === 'ellipse')).toHaveLength(19);
    expect(low.calls).not.toContain('ellipse');
    expect(low.calls.filter(call => call === 'bezierCurveTo')).toHaveLength(3);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('does not turn firing, zero damage, old receipts or mismatching deaths into hit feedback', () => {
    const state = challenge(); state.targets = [actor('live', 500), actor('dead', 700, 0)];
    state.events = [
      { type: 'TOOL_FIRED', tick: 120, data: { id: 'live', hit: true } },
      { type: 'TARGET_HIT', tick: 120, data: { id: 'live', damage: 0 } },
      { type: 'TARGET_HIT', tick: 90, data: { id: 'dead', damage: 34 } },
      { type: 'TARGET_HIT', tick: 120, data: { id: 'missing', damage: 34 } },
      { type: 'TARGET_CLEARED', tick: 120, data: { id: 'live' } },
    ];
    expect(combatReceiptFeedback(state)).toEqual({ hits: [], kills: [] });
    state.events.push({ type: 'TARGET_HIT', tick: 120, data: { id: 'live', damage: 34 } });
    state.events.push({ type: 'TARGET_CLEARED', tick: 120, data: { id: 'dead' } });
    expect(combatReceiptFeedback(state).hits).toMatchObject([{ x: 500, count: 1, strength: 1 }]);
    expect(combatReceiptFeedback(state).kills).toMatchObject([{ x: 700, count: 1, strength: 1 }]);
  });

  it('merges neighbouring actual targets and bounds simultaneous horde receipts', () => {
    const state = challenge();
    state.targets = Array.from({ length: 48 }, (_, index) => actor(`horde-${index}`, 100 + index * 100, 0));
    state.events = state.targets.flatMap((target): GameEvent[] => [
      { type: 'TARGET_HIT', tick: 120, data: { id: target.id, damage: 34 } },
      { type: 'TARGET_CLEARED', tick: 120, data: { id: target.id } },
    ]);
    expect(combatReceiptFeedback(state).hits).toHaveLength(12);
    expect(combatReceiptFeedback(state).kills).toHaveLength(6);
    expect(combatReceiptFeedback(state, true).hits).toHaveLength(4);
    expect(combatReceiptFeedback(state, true).kills).toEqual([]);
    state.targets[46].x = state.targets[47].x + 1;
    expect(combatReceiptFeedback(state).hits[0].count).toBe(2);
    const before = JSON.stringify(state), low = drawing();
    drawCombatReceiptFeedback(low.ctx, state, true);
    expect(low.calls.filter(call => call === 'stroke')).toHaveLength(4);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('removes a genuinely dead sprite briefly and disables ornamental removal in low effects', () => {
    const state = challenge(), target = actor('dead', 500, 0);
    expect(endlessDeathPose(target, state, false)).toEqual({ scale: 1, alpha: .75 });
    state.elapsed = 2.09;
    expect(endlessDeathPose(target, state, false)?.alpha).toBeCloseTo(.375);
    expect(endlessDeathPose(target, state, true)?.alpha).toBe(0);
    state.elapsed = 2.3; expect(endlessDeathPose(target, state, false)?.alpha).toBe(0);
    target.hp = 1; expect(endlessDeathPose(target, state, false)).toBeNull();
  });
});
