import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { GameState, Vec } from '../../src/game/types';
import { CanvasScene } from '../../src/render/canvasScene';

function cast(where: 'empty' | 'tissue', hp: number) {
  const game = new GameSession(31); game.start();
  game.state.player.x = 650; game.state.player.y = 600; game.state.tissue.hp = hp;
  const aim = where === 'tissue' ? { x: game.state.tissue.x, y: game.state.tissue.y } : { x: 650, y: 500 };
  game.step({ moveX: 0, moveY: 0, tool: 3, fire: true, aim });
  return { game, aim, effect: game.state.effects.find(effect => effect.kind === 'heal')! };
}

function draw(state: GameState, low: boolean) {
  const ellipses: number[] = [], strokes: { color: string; from: Vec; to: Vec }[] = [];
  let from = { x: 0, y: 0 }, to = { x: 0, y: 0 };
  const ctx = { globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1,
    save() {}, restore() {}, beginPath() {}, fill() {},
    ellipse(_x: number, _y: number, rx: number) { ellipses.push(rx); },
    moveTo(x: number, y: number) { from = { x, y }; }, lineTo(x: number, y: number) { to = { x, y }; },
    stroke(this: { strokeStyle: string }) { strokes.push({ color: this.strokeStyle, from: { ...from }, to: { ...to } }); },
  } as unknown as CanvasRenderingContext2D;
  const scene = Object.create(CanvasScene.prototype) as CanvasScene;
  (scene as unknown as { drawEffects(ctx: CanvasRenderingContext2D, state: GameState, low: boolean): void }).drawEffects(ctx, state, low);
  return { ellipses, crossStrokes: strokes.filter(stroke => stroke.color === '#d8ffcf') };
}

describe('repair presentation uses the outcome of the same accepted cast', () => {
  it.each([
    ['empty', 25, false], ['tissue', 100, false], ['tissue', 25, true],
  ] as const)('renders %s at integrity %s in both quality modes', (where, hp, success) => {
    const { game, effect } = cast(where, hp);
    expect(effect).toBeDefined();
    expect(game.state.tissue.hp).toBe(success ? hp + 25 : hp);
    expect(Boolean(effect.repairSucceeded)).toBe(success);
    expect(game.state.events.some(event => event.type === 'TOOL_FIRED' && event.data.tool === 3)).toBe(true);
    const repair = game.state.events.find(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'repair');
    if (where === 'empty') expect(repair).toBeUndefined();
    else expect(repair?.data).toMatchObject({ before: hp, after: success ? hp + 25 : hp });
    // Presentation is pinned to the effect itself, even when the bounded event
    // log is evicted or contains unrelated successful repairs.
    game.state.events = [{ type: 'ORGAN_INTEGRITY_CHANGED', tick: game.state.tick, data: { reason: 'repair', before: 1, after: 2 } }];
    const before = JSON.stringify(game.state);
    for (const low of [false, true]) {
      const result = draw(game.state, low);
      expect(result.ellipses).toHaveLength(1);
      expect(result.ellipses[0]).toBe(success ? 44 : 10);
      expect(result.crossStrokes).toHaveLength(success ? 2 : 0);
    }
    expect(JSON.stringify(game.state)).toBe(before);
  });

  it('keeps a successful result through pause and independent subsequent attempts', () => {
    const { game, effect } = cast('tissue', 25);
    game.pause(); game.state.events = [];
    expect(draw(game.state, true).crossStrokes).toHaveLength(2);
    game.resume(); game.state.cooldowns[3] = 0; game.state.tissue.hp = game.state.tissue.maxHp;
    game.step({ moveX: 0, moveY: 0, tool: 3, fire: true, aim: { x: 650, y: 500 } });
    const casts = game.state.effects.filter(item => item.kind === 'heal');
    expect(casts).toHaveLength(2);
    expect(casts[0]).toBe(effect);
    expect(casts.map(item => Boolean(item.repairSucceeded))).toEqual([true, false]);
    expect(draw(game.state, true).crossStrokes).toHaveLength(2);
  });

  it.each([
    ['range', { x: 1200, y: 600 }], ['blocked', { x: 1080, y: 575 }],
  ] as const)('shows no cast or success for a %s rejection', (reason, aim) => {
    const game = new GameSession(31); game.start(); game.state.player.x = 650; game.state.player.y = 600;
    const before = game.state.tissue.hp;
    game.step({ moveX: 0, moveY: 0, tool: 3, fire: true, aim });
    expect(game.state.tissue.hp).toBe(before);
    expect(game.state.effects.filter(effect => effect.kind === 'heal')).toEqual([]);
    expect(game.state.events.some(event => event.type === 'TOOL_REJECTED' && event.data.reason === reason)).toBe(true);
  });
});
