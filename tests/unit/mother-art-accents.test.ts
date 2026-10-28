import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { MotherCoreController, MOTHER_CORE_BALANCE } from '../../src/game/motherCore';
import type { TraitId } from '../../src/game/battleTypes';
import type { Target } from '../../src/game/types';
import { drawBattleTarget, drawMotherCoreAccents } from '../../src/render/battleVisuals';

type Matrix = [number, number, number, number, number, number];
type Command = { method: string; args: number[] };
interface Paint {
  method: string; color: unknown; width: number; alpha: number;
  dash: number[]; matrix: Matrix; path: Command[]; text?: string;
}
function recorder() {
  let values: Record<string, unknown> = { globalAlpha: .8, lineWidth: 1, fillStyle: '', strokeStyle: '' };
  let matrix: Matrix = [1, 0, 0, 1, 0, 0], dash: number[] = [], path: Command[] = [];
  const stack: Array<{ values: Record<string, unknown>; matrix: Matrix; dash: number[] }> = [];
  const paints: Paint[] = [];
  let gradients = 0;
  const multiply = ([g, h, i, j, k, l]: Matrix) => {
    const [a, b, c, d, e, f] = matrix;
    matrix = [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
  };
  const ctx = new Proxy({}, {
    get: (_target, key) => {
      if (key in values) return values[String(key)];
      if (key === 'save') return () => stack.push({ values: { ...values }, matrix: [...matrix], dash: [...dash] });
      if (key === 'restore') return () => { const saved = stack.pop(); if (!saved) throw new Error('Unbalanced restore'); ({ values, matrix, dash } = saved); };
      if (key === 'translate') return (x: number, y: number) => multiply([1, 0, 0, 1, x, y]);
      if (key === 'scale') return (x: number, y: number) => multiply([x, 0, 0, y, 0, 0]);
      if (key === 'setLineDash') return (next: number[]) => { dash = [...next]; };
      if (key === 'beginPath') return () => { path = []; };
      if (key === 'createLinearGradient') return () => { gradients++; return { addColorStop() {} }; };
      if (key === 'fill' || key === 'stroke' || key === 'fillText') return (text?: string) => paints.push({
        method: String(key), color: key === 'stroke' ? values.strokeStyle : values.fillStyle,
        width: Number(values.lineWidth), alpha: Number(values.globalAlpha), dash: [...dash], matrix: [...matrix], path: structuredClone(path),
        ...(key === 'fillText' ? { text } : {}),
      });
      return (...args: number[]) => { path.push({ method: String(key), args }); };
    },
    set: (_target, key, value) => { values[String(key)] = value; return true; },
  }) as CanvasRenderingContext2D;
  return { ctx, paints, gradients: () => gradients, balanced: () => stack.length === 0,
    state: () => ({ values: { ...values }, matrix: [...matrix], dash: [...dash] }) };
}

function fixture(traits: TraitId[] = ['CARAPACE', 'FISSION'], elapsed = 2) {
  const session = new GameSession(91, { campaign: true, milestone: 'G3' });
  session.start();
  const state = session.state;
  state.elapsed = elapsed;
  const target: Target = { id: 'mother-core', role: 'core', x: 700, y: 390, radius: 50,
    hp: 600, maxHp: 600, kind: 'single', traits: [...traits], facing: -.4, hitUntil: 0, scanned: false };
  const combat = new MotherCoreController({ coreId: target.id, organId: 'heart', traits, tick: state.tick, elapsed: 0 }).state;
  combat.facing = .7;
  state.targets = [target];
  state.campaign!.core.combat = combat;
  return { target, combat, state };
}
const commands = (paint: Paint, method: string) => paint.path.filter(command => command.method === method);
const ripple = (paints: Paint[]) => paints.filter(paint => paint.method === 'stroke' && ['#d1efe1', '#376b688f'].includes(String(paint.color)));
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value); for (const child of Object.values(value)) freeze(child);
}

describe('native mother body state accents', () => {
  it('uses the real active carapace facing and frontal protection width, including a mixed-trait mother', () => {
    for (const facing of [-2.7, 0, .7, Math.PI / 2]) {
      const f = fixture(), draw = recorder(); f.combat.facing = facing;
      drawMotherCoreAccents(draw.ctx, f.target, f.state, f.combat);
      const armour = draw.paints.find(paint => commands(paint, 'arc').length)!;
      expect(armour.method).toBe('stroke'); expect(armour.width).toBe(3); expect(armour.dash).toEqual([]);
      const arc = commands(armour, 'arc')[0].args;
      expect(arc.slice(0, 3)).toEqual([0, 0, f.target.radius + 9]);
      expect((arc[3] + arc[4]) / 2).toBeCloseTo(facing);
      expect(Math.cos((arc[4] - arc[3]) / 2)).toBeCloseTo(.2);
      for (const [index, expected] of [1, 0, 0, 1, f.target.x, f.target.y].entries()) expect(armour.matrix[index]).toBeCloseTo(expected, 10);
      expect(draw.paints.find(paint => paint.method === 'fillText')?.text).toBe('◇晶壳 / ⋈裂殖');
      expect(draw.balanced()).toBe(true);
    }
    const dormant = fixture(), draw = recorder(); dormant.combat.activeTrait = 'FISSION';
    drawMotherCoreAccents(draw.ctx, dormant.target, dormant.state, dormant.combat);
    expect(draw.paints.some(paint => commands(paint, 'arc').length)).toBe(false);
  });

  it('opens the protection cue and marks exposure only while a real target or controller deadline is active', () => {
    for (const owner of ['target', 'combat'] as const) {
      const f = fixture(); f[owner].exposedUntil = f.state.elapsed + .2;
      const exposed = recorder(); drawMotherCoreAccents(exposed.ctx, f.target, f.state, f.combat);
      const armour = exposed.paints.find(paint => commands(paint, 'arc').length)!;
      expect(armour.width).toBe(1); expect(armour.dash).toEqual([5, 10]);
      expect(exposed.paints.some(paint => paint.text === '◇')).toBe(true);
      f.state.elapsed += .2;
      const expired = recorder(); drawMotherCoreAccents(expired.ctx, f.target, f.state, f.combat);
      expect(expired.paints.find(paint => commands(paint, 'arc').length)?.width).toBe(3);
      expect(expired.paints.some(paint => paint.text === '◇')).toBe(false);
    }
  });

  it('shows a mimic cue only for its real disturbance, revelation or exposure, without painting its disguise', () => {
    const f = fixture(['MIMIC', 'FISSION'], MOTHER_CORE_BALANCE.mimicDisturbance / 2);
    const disturbed = recorder(); drawMotherCoreAccents(disturbed.ctx, f.target, f.state, f.combat);
    expect(ripple(disturbed.paints)).toHaveLength(1);
    f.state.elapsed = MOTHER_CORE_BALANCE.mimicDisturbance + .2;
    const hidden = recorder(); drawMotherCoreAccents(hidden.ctx, f.target, f.state, f.combat);
    expect(ripple(hidden.paints)).toHaveLength(0);
    f.combat.revealedUntil = f.state.elapsed + .2;
    const revealed = recorder(); drawMotherCoreAccents(revealed.ctx, f.target, f.state, f.combat);
    expect(ripple(revealed.paints)).toHaveLength(1);
    f.combat.revealedUntil = 0; f.target.exposedUntil = f.state.elapsed + .2;
    const exposed = recorder(); drawMotherCoreAccents(exposed.ctx, f.target, f.state, f.combat);
    expect(ripple(exposed.paints)).toHaveLength(1);
    expect(exposed.paints.some(paint => paint.text === '◇')).toBe(true);
    f.combat.activeTrait = 'FISSION';
    const inactive = recorder(); drawMotherCoreAccents(inactive.ctx, f.target, f.state, f.combat);
    expect(ripple(inactive.paints)).toHaveLength(0);
    for (const drawn of [disturbed, hidden, revealed, exposed, inactive]) {
      expect(drawn.gradients()).toBe(0);
      expect(drawn.paints.some(paint => commands(paint, 'bezierCurveTo').length || commands(paint, 'quadraticCurveTo').length)).toBe(false);
      expect(drawn.paints.filter(paint => paint.method === 'fill' && paint.color !== '#00000000')
        .every(paint => commands(paint, 'ellipse').every(command => command.args[2] <= 14 && command.args[3] <= 5))).toBe(true);
    }
  });

  it('uses the hit deadline for a small acknowledgement, then restores the exposed cue without modifying the complete state', () => {
    const f = fixture(); f.target.hitUntil = f.state.elapsed + .1; f.combat.exposedUntil = f.state.elapsed + 1;
    const before = JSON.stringify(f.state); freeze(f.state);
    const hit = recorder(), priorCanvas = hit.state();
    drawMotherCoreAccents(hit.ctx, f.target, f.state, f.combat);
    expect(hit.paints.filter(paint => paint.method === 'stroke' && paint.color === '#fff4b7')).toHaveLength(2);
    expect(hit.paints.some(paint => paint.text === '◇')).toBe(false);
    expect(hit.state()).toEqual(priorCanvas); expect(hit.balanced()).toBe(true);
    expect(JSON.stringify(f.state)).toBe(before);
    const after = fixture(); after.combat.exposedUntil = after.state.elapsed + 1;
    const draw = recorder(); drawMotherCoreAccents(draw.ctx, after.target, after.state, after.combat);
    expect(draw.paints.some(paint => paint.color === '#fff4b7')).toBe(false);
    expect(draw.paints.some(paint => paint.text === '◇')).toBe(true);
  });

  it('places native hit and revealed-mimic cues at the supplied registered core and body without changing fallback geometry', () => {
    const f = fixture(['MIMIC', 'FISSION'], .6), draw = recorder();
    f.target.hitUntil = f.state.elapsed + .1;
    const geometry = { coreOffset: { x: 3, y: -66 }, bodyBounds: { left: -81, right: 90, top: -144, bottom: 3 } };
    const before = JSON.stringify(f.state); freeze(f.state); freeze(geometry);
    drawMotherCoreAccents(draw.ctx, f.target, f.state, f.combat, geometry);
    const hits = draw.paints.filter(paint => paint.method === 'stroke' && paint.color === '#245d65');
    expect(hits.map(paint => paint.path)).toEqual([
      [{ method: 'moveTo', args: [-4, -66] }, { method: 'lineTo', args: [10, -66] }],
      [{ method: 'moveTo', args: [3, -73] }, { method: 'lineTo', args: [3, -59] }],
    ]);
    const reveal = ripple(draw.paints)[0];
    expect(commands(reveal, 'ellipse')[0].args.slice(0, 4)).toEqual([4.5, -70.5, 89.5, 77.5]);
    expect(reveal.matrix[4]).toBe(f.target.x); expect(reveal.matrix[5]).toBe(f.target.y);
    expect(draw.balanced()).toBe(true); expect(JSON.stringify(f.state)).toBe(before);
  });

  it('adds only the clearance label after actual defeat, leaving a purified body to the image or fallback', () => {
    const f = fixture(); f.target.hp = 0; f.target.hitUntil = f.state.elapsed + 1; f.combat.exposedUntil = f.state.elapsed + 1;
    const draw = recorder(); drawMotherCoreAccents(draw.ctx, f.target, f.state, f.combat);
    expect(draw.paints.map(paint => ({ method: paint.method, text: paint.text }))).toEqual([{ method: 'fillText', text: '✓ 母巢核心已清除' }]);
    expect(draw.gradients()).toBe(0); expect(draw.balanced()).toBe(true);
    const fallback = recorder(); drawBattleTarget(fallback.ctx, f.target, f.state);
    expect(fallback.paints.filter(paint => paint.method === 'fill')).toHaveLength(1);
    expect(fallback.paints.some(paint => paint.text === '✓ 母巢核心已清除')).toBe(true);
  });

  it('retains the complete procedural fallback construction and its original shared status cues', () => {
    for (const traits of [['CARAPACE', 'FISSION'], ['MIMIC', 'FISSION']] as TraitId[][]) {
      const f = fixture(traits, .5); f.target.hitUntil = 1; f.combat.exposedUntil = 1;
      const before = JSON.stringify(f.state), draw = recorder(); freeze(f.state);
      drawBattleTarget(draw.ctx, f.target, f.state);
      expect(draw.gradients()).toBeGreaterThan(0);
      expect(draw.paints.some(paint => commands(paint, 'bezierCurveTo').length)).toBe(true);
      expect(draw.paints.some(paint => paint.method === 'fillText' && paint.text?.includes(' / '))).toBe(true);
      expect(draw.paints.some(paint => paint.text === '◇' || paint.color === '#fff4b7')).toBe(false);
      const ground = draw.paints.find(paint => paint.method === 'stroke' && paint.color === '#fff1ba')!;
      expect(ground.width).toBe(3);
      expect(draw.balanced()).toBe(true); expect(JSON.stringify(f.state)).toBe(before);
    }
  });
});
