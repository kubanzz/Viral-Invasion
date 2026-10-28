import { describe, expect, it } from 'vitest';
import { drawImmuneCell, drawImmuneCellAccents, immuneCellBody } from '../../src/render/immuneVisuals';
import type { ImmuneCellState } from '../../src/game/immuneCells';

interface Paint { method: 'fill' | 'stroke'; color: string; alpha: number; path: { method: string; args: number[] }[] }
function recorder() {
  const paints: Paint[] = [], stack: { alpha: number; fill: string; stroke: string }[] = [];
  let path: Paint['path'] = [];
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() { stack.push({ alpha: this.globalAlpha, fill: this.fillStyle, stroke: this.strokeStyle }); },
    restore() { const previous = stack.pop()!; this.globalAlpha = previous.alpha; this.fillStyle = previous.fill; this.strokeStyle = previous.stroke; },
    translate() {}, scale() {}, rotate() {},
    beginPath() { path = []; }, closePath() { path.push({ method: 'closePath', args: [] }); },
    moveTo(...args: number[]) { path.push({ method: 'moveTo', args }); },
    lineTo(...args: number[]) { path.push({ method: 'lineTo', args }); },
    ellipse(...args: number[]) { path.push({ method: 'ellipse', args }); },
    arc(...args: number[]) { path.push({ method: 'arc', args }); },
    fill() { paints.push({ method: 'fill', color: this.fillStyle, alpha: this.globalAlpha, path: structuredClone(path) }); },
    stroke() { paints.push({ method: 'stroke', color: this.strokeStyle, alpha: this.globalAlpha, path: structuredClone(path) }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, paints, stack };
}
const cell = (): ImmuneCellState => ({ id: 'cell-1', beaconId: 'beacon-1', organId: 'heart', x: 500, y: 600,
  born: 0, until: 5, radius: 15, facing: .7, damage: 8, interval: .8, updatedAt: 1, attackReadyAt: 2,
  attackUntil: 1.2, targetId: 'enemy-1', activity: 'seeking', navigationAt: 1, waypoint: { x: 550, y: 650 } });

describe('native immune body procedural feedback', () => {
  it('keeps real bite and lifetime feedback in both qualities without drawing a duplicate body, nucleus or cross', () => {
    const actor = cell(), before = JSON.stringify(actor);
    for (const low of [false, true]) {
      const result = recorder(); drawImmuneCellAccents(result.ctx, actor, 1, low);
      expect(result.paints.filter(p => p.method === 'fill').map(p => p.color)).toEqual(['#45685d35']);
      expect(result.paints.some(p => p.color === '#e3ffba' && p.path.some(command => command.method === 'arc'))).toBe(true);
      const bar = result.paints.find(p => p.color === '#c7efb5')!;
      expect(bar.path).toEqual([{ method: 'moveTo', args: [-10, 8] }, { method: 'lineTo', args: [6, 8] }]);
      expect(result.paints.filter(p => p.color === '#b1e3ceaa')).toHaveLength(low ? 0 : 2);
      expect(result.paints.some(p => ['#cdebd7', '#ecffe4', '#689c9c', '#f4ffdd'].includes(p.color))).toBe(false);
      expect(result.stack).toHaveLength(0);
    }
    const afterBite = recorder(); drawImmuneCellAccents(afterBite.ctx, actor, 1.3);
    expect(afterBite.paints.some(p => p.color === '#e3ffba')).toBe(false);
    expect(JSON.stringify(actor)).toBe(before);
  });

  it('offers separate ground/overlay layers with shared born/until alpha and no drawing after expiry', () => {
    const actor = cell();
    for (const elapsed of [.1, 4.825]) {
      const ground = recorder(), overlay = recorder(), all = recorder();
      drawImmuneCellAccents(ground.ctx, actor, elapsed, false, 'ground');
      drawImmuneCellAccents(overlay.ctx, actor, elapsed, false, 'overlay');
      drawImmuneCellAccents(all.ctx, actor, elapsed);
      expect(ground.paints).toHaveLength(1); expect(ground.paints[0].method).toBe('fill');
      expect(ground.paints[0].color).toBe('#45685d35');
      expect(ground.paints[0].path).toEqual([{ method: 'ellipse', args: [0, 3, 13.5, 4.32, 0, 0, Math.PI * 2] }]);
      expect(overlay.paints.every(p => p.method === 'stroke')).toBe(true);
      expect(all.paints).toEqual([...ground.paints, ...overlay.paints]);
      expect(all.paints.every(p => Math.abs(p.alpha - immuneCellBody(actor, elapsed).alpha) < 1e-8)).toBe(true);
      expect(all.paints[0].alpha).toBeCloseTo(.5);
    }
    const expired = recorder(); drawImmuneCellAccents(expired.ctx, actor, actor.until);
    expect(expired.paints).toEqual([]);
  });

  it('retains the complete procedural fallback body alongside the same essential feedback', () => {
    const result = recorder(); drawImmuneCell(result.ctx, cell(), 1, true);
    expect(result.paints.filter(p => p.method === 'fill').map(p => p.color)).toEqual(['#0c252d77', '#ecffe4', '#689c9c']);
    expect(result.paints[0].path).toEqual([{ method: 'ellipse', args: [0, 3, 19, 19 * .46, 0, 0, Math.PI * 2] }]);
    expect(result.paints.filter(p => p.color === '#f4ffdd')).toHaveLength(2);
    expect(result.paints.some(p => p.color === '#e3ffba')).toBe(true);
    expect(result.paints.some(p => p.color === '#c7efb5')).toBe(true);
    expect(result.stack).toHaveLength(0);
  });
});
