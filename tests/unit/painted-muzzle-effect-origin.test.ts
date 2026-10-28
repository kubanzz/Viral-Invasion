import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { Effect, GameState, Vec } from '../../src/game/types';
import { CanvasScene } from '../../src/render/canvasScene';

interface Line { color: string; from: Vec; to: Vec }
function fixture(origin?: Vec) {
  const state = new GameSession(31).snapshot(); state.phase = 'paused'; state.elapsed = 2;
  state.effects = [{ id: 1, kind: 'beam', from: { x: 330, y: 440 }, to: { x: 700, y: 440 }, born: 1.95, duration: .14, radius: 0 }];
  const lines: Line[] = [], antibodies: { position: Vec; angle: number }[] = [];
  const requests: { effect: Effect; state: GameState }[] = []; let from = { x: 0, y: 0 }, to = { x: 0, y: 0 };
  const ctx = { globalAlpha: 1, strokeStyle: '', lineWidth: 1, save() {}, restore() {}, beginPath() {},
    moveTo(x: number, y: number) { from = { x, y }; }, lineTo(x: number, y: number) { to = { x, y }; },
    stroke(this: { strokeStyle: string }) { lines.push({ color: this.strokeStyle, from: { ...from }, to: { ...to } }); } } as unknown as CanvasRenderingContext2D;
  const scene = Object.create(CanvasScene.prototype) as CanvasScene;
  Object.assign(scene, { art: origin ? { effectOrigin: (effect: Effect, sample: GameState) => { requests.push({ effect, state: sample }); return origin; } } : undefined,
    drawAntibody: (_ctx: CanvasRenderingContext2D, position: Vec, angle: number) => antibodies.push({ position, angle }) });
  const draw = (low = false) => (scene as unknown as { drawEffects(ctx: CanvasRenderingContext2D, state: GameState, low: boolean): void }).drawEffects(ctx, state, low);
  return { state, lines, antibodies, requests, draw };
}

describe('painted muzzle drawing-only bridge in actual CanvasScene beam rendering', () => {
  it.each([false, true])('uses only the supplied beam origin while preserving the true endpoint/progress in lowEffects=%s', low => {
    const origin = { x: 370, y: 398 }, f = fixture(origin), before = JSON.stringify(f.state); f.draw(low);
    expect(f.requests).toEqual([{ effect: f.state.effects[0], state: f.state }]);
    expect(f.lines).toEqual([{ color: '#8bece455', from: origin, to: { x: 700, y: 440 } }, { color: '#e8fff1', from: origin, to: { x: 700, y: 440 } }]);
    const progress = (f.state.elapsed - f.state.effects[0].born) / f.state.effects[0].duration;
    expect(f.antibodies[0].position.x).toBeCloseTo(origin.x + (700 - origin.x) * Math.min(1, progress * 2));
    expect(f.antibodies[0].position.y).toBeCloseTo(origin.y + (440 - origin.y) * Math.min(1, progress * 2));
    expect(f.antibodies[0].angle).toBeCloseTo(Math.atan2(440 - origin.y, 700 - origin.x));
    expect(JSON.stringify(f.state)).toBe(before);
  });

  it('keeps serialized origins when no art bridge can prove the emission and never requests an override for chain effects', () => {
    const f = fixture(), before = JSON.stringify(f.state); f.draw();
    expect(f.lines.every(line => line.from.x === 330 && line.from.y === 440)).toBe(true); expect(JSON.stringify(f.state)).toBe(before);
    const chain = fixture({ x: 370, y: 398 }); chain.state.effects[0].kind = 'chain'; chain.draw();
    expect(chain.requests).toEqual([]); expect(chain.lines.every(line => line.from.x === 330 && line.from.y === 440)).toBe(true);
  });
});
