import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { enemyRayEnd } from '../../src/game/enemyTactics';
import { activeWorld, type GameState, type Target } from '../../src/game/types';
import { drawNativeEnemyAccents, drawNativeMimicAccents, nativeEnemyRuleGeometry } from '../../src/render/battleVisuals';

type Call = { method: string; args: unknown[]; color: string; width: number; dash: number[] };
function recorder() {
  const calls: Call[] = [], stack: { color: string; fill: string; width: number; dash: number[] }[] = [];
  let color = '', fill = '', width = 1, dash: number[] = [];
  const ctx = new Proxy({}, {
    get: (_, method) => {
      if (method === 'save') return () => stack.push({ color, fill, width, dash: [...dash] });
      if (method === 'restore') return () => { ({ color, fill, width, dash } = stack.pop()!); };
      if (method === 'setLineDash') return (value: number[]) => { dash = [...value]; };
      return (...args: unknown[]) => calls.push({ method: String(method), args, color: method === 'fill' ? fill : color, width, dash: [...dash] });
    },
    set: (_, name, value) => { if (name === 'strokeStyle') color = String(value); if (name === 'fillStyle') fill = String(value); if (name === 'lineWidth') width = Number(value); return true; },
  }) as CanvasRenderingContext2D;
  return { ctx, calls, balanced: () => stack.length === 0 };
}
function fixture(): GameState {
  const game = new GameSession(71, { mode: 'endless' }); game.start();
  const state = game.state; state.phase = 'playing'; state.elapsed = 5; state.tick = 300;
  state.world = { width: 1200, height: 1000, bounds: { left: 0, top: 0, right: 1200, bottom: 1000 },
    obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  return state;
}
const target = (changes: Partial<Target> = {}): Target => ({ id: 'native', role: 'virus', kind: 'single', x: 500, y: 500,
  radius: 18, hp: 34, maxHp: 34, hitUntil: 0, scanned: false, facing: 0, ...changes });
const angles = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4);
function freeze(value: unknown): void { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } }

describe('native enemy rule direction accents', () => {
  it.each(angles)('draws the true carapace protection sector at facing %s without filling a false hit area', angle => {
    const state = fixture(), actor = target({ traits: ['CARAPACE'], facing: angle }), before = JSON.stringify([actor, state]);
    freeze(state); freeze(actor); const drawing = recorder();
    const [receipt] = drawNativeEnemyAccents(drawing.ctx, actor, state);
    const half = Math.acos(.2);
    expect(receipt).toMatchObject({ actorId: actor.id, type: 'carapace', angle, sectorHalfAngle: half, exposed: false, visible: true });
    expect(receipt.projectedAngle).toBeCloseTo(Math.atan2(Math.sin(angle) * .72, Math.cos(angle)));
    const arcs = drawing.calls.filter(call => call.method === 'arc');
    expect(arcs.map(call => call.args)).toEqual([[0, 0, 26, angle - half, angle + half], [0, 0, 26, angle - half, angle + half]]);
    expect(drawing.calls.filter(call => call.method === 'stroke').slice(0, 2).map(call => ({ width: call.width, dash: call.dash })))
      .toEqual([{ width: 7, dash: [] }, { width: 3.8, dash: [] }]);
    // A small closed shield sits at the true forward point, independent of the
    // static PNG's painted face. Its outline is upright in the .72 projection.
    expect(drawing.calls.filter(call => call.method === 'translate').map(call => call.args)).toEqual([
      [actor.x, actor.y], [receipt.displayEnd.x - actor.x, receipt.displayEnd.y - actor.y],
    ]);
    expect(drawing.calls.filter(call => call.method === 'scale').map(call => call.args)).toEqual([[1, 1 / .72]]);
    expect(drawing.calls.filter(call => call.method === 'closePath')).toHaveLength(2);
    expect(Math.cos(half - .001)).toBeGreaterThan(.2); expect(Math.cos(half + .001)).toBeLessThan(.2);
    expect(drawing.calls.some(call => call.method === 'fill' || call.method === 'fillText')).toBe(false);
    expect(drawing.balanced()).toBe(true); expect(JSON.stringify([actor, state])).toBe(before);
  });

  it.each(angles)('marks only actual exposure at %s with a physically open front and split shield; recovery alone never removes armour', angle => {
    const state = fixture(), actor = target({ traits: ['CARAPACE'], facing: angle, recoverUntil: 8 });
    expect(nativeEnemyRuleGeometry(actor, state)[0].exposed).toBe(false);
    actor.exposedUntil = 5.01;
    const drawn = recorder(), [receipt] = drawNativeEnemyAccents(drawn.ctx, actor, state);
    expect(receipt.exposed).toBe(true);
    expect(drawn.calls.some(call => call.method === 'stroke' && call.dash.join() === '3,6')).toBe(true);
    expect(drawn.calls.some(call => call.method === 'stroke' && call.color === '#664457')).toBe(false);
    const half = Math.acos(.2), fragments = [[0, 0, 26, angle - half, angle - .3], [0, 0, 26, angle + .3, angle + half]];
    expect(drawn.calls.filter(call => call.method === 'arc').map(call => call.args)).toEqual([...fragments, ...fragments]);
    expect(drawn.calls.some(call => call.method === 'closePath' || call.method === 'fill' || call.method === 'fillText')).toBe(false);
    expect(drawn.calls.filter(call => call.method === 'translate').map(call => call.args)).toEqual([
      [actor.x, actor.y], [receipt.displayEnd.x - actor.x, receipt.displayEnd.y - actor.y],
    ]);
    const openHalves = drawn.calls.filter(call => call.method === 'moveTo').slice(-4).map(call => call.args);
    expect(openHalves).toEqual([[-3, -6], [3, -4], [-3, -6], [3, -4]]);
    actor.exposedUntil = state.elapsed;
    expect(nativeEnemyRuleGeometry(actor, state)[0].exposed).toBe(false);
    actor.role = 'core'; expect(drawNativeEnemyAccents(recorder().ctx, actor, state)).toEqual([]);
  });

  it.each(angles)('uses the committed thin-ray plan at %s instead of the painted face or later facing', angle => {
    const state = fixture(), origin = { x: 500, y: 500 };
    const actor = target({ tactic: 'thin-ray', facing: angle + Math.PI / 2, x: 510, y: 530, attackAt: 5.8,
      attackPlan: { kind: 'thin-ray', origin, aim: { x: origin.x + Math.cos(angle) * 100, y: origin.y + Math.sin(angle) * 100 },
        range: 530, windup: 1.05, interval: 3.2, radius: 18, landings: [], playerDamage: 9, tissueDamage: 0, recoveryExposure: 0 } });
    const before = JSON.stringify([actor, state]); freeze(state); freeze(actor);
    const drawn = recorder(), [receipt] = drawNativeEnemyAccents(drawn.ctx, actor, state);
    expect(receipt.type).toBe('thin-ray'); expect(receipt.committed).toBe(true); expect(receipt.origin).toEqual(origin);
    expect(receipt.angle).toBeCloseTo(Math.atan2(Math.sin(angle), Math.cos(angle)));
    expect(receipt.end).toEqual(enemyRayEnd(actor.attackPlan!, activeWorld(state)));
    expect(drawn.calls.filter(call => call.method === 'moveTo').slice(0, 2).map(call => call.args))
      .toEqual([[receipt.displayOrigin.x, receipt.displayOrigin.y], [receipt.displayOrigin.x, receipt.displayOrigin.y]]);
    expect(drawn.calls.filter(call => call.method === 'lineTo').slice(0, 2).map(call => call.args))
      .toEqual([[receipt.displayEnd.x, receipt.displayEnd.y], [receipt.displayEnd.x, receipt.displayEnd.y]]);
    expect(drawn.calls.some(call => call.method === 'arc' || call.method === 'ellipse' || call.method === 'fillText')).toBe(false);
    expect(drawn.balanced()).toBe(true); expect(JSON.stringify([actor, state])).toBe(before);
  });

  it('clips the committed direction cue to the real wall endpoint and never promises a zero-length blocked ray', () => {
    const state = fixture(); state.world!.obstacles = [{ id: 'fold', x: 590, y: 500, radius: 20 }];
    const actor = target({ tactic: 'thin-ray', facing: Math.PI, attackAt: 5.8,
      attackPlan: { kind: 'thin-ray', origin: { x: 500, y: 500 }, aim: { x: 800, y: 500 }, range: 530, windup: 1.05,
        interval: 3.2, radius: 18, landings: [], playerDamage: 9, tissueDamage: 0, recoveryExposure: 0 } });
    const receipt = drawNativeEnemyAccents(recorder().ctx, actor, state)[0];
    expect(receipt.end.x).toBeCloseTo(551.5); expect(receipt.displayEnd.x).toBeLessThanOrEqual(receipt.end.x);
    state.world!.obstacles[0].x = 520;
    expect(drawNativeEnemyAccents(recorder().ctx, actor, state)).toEqual([]);
    actor.attackAt = state.elapsed;
    const fallback = drawNativeEnemyAccents(recorder().ctx, actor, state)[0];
    expect(fallback.committed).toBe(false); expect(fallback.angle).toBeCloseTo(Math.PI);
    actor.hp = 0; expect(drawNativeEnemyAccents(recorder().ctx, actor, state)).toEqual([]);
  });

  it('restores only the actual born-relative mimic disturbance window as a small shape cue', () => {
    const state = fixture(), actor = target({ traits: ['MIMIC'], born: 2 });
    const beforeActor = JSON.stringify(actor);
    for (const [elapsed, visible] of [[2.2, true], [3.21, false], [5, false], [8.2, true], [1.99, false]] as const) {
      state.elapsed = elapsed; const before = JSON.stringify(state), drawn = recorder();
      const receipt = drawNativeMimicAccents(drawn.ctx, actor, state);
      expect(!!receipt).toBe(visible);
      if (receipt) {
        expect(receipt.reason).toBe('disturbance');
        expect(drawn.calls.filter(call => call.method === 'quadraticCurveTo')).toHaveLength(8);
        expect(drawn.calls.some(call => ['ellipse', 'arc', 'fill', 'fillText'].includes(call.method))).toBe(false);
      } else expect(drawn.calls).toEqual([]);
      expect(drawn.balanced()).toBe(true); expect(JSON.stringify(state)).toBe(before);
    }
    expect(JSON.stringify(actor)).toBe(beforeActor);
  });

  it('keeps scan, trace, true reveal and true exposure visible outside the disturbance window without revealing game state', () => {
    const state = fixture(), actor = target({ traits: ['MIMIC'], born: 2 });
    actor.revealedUntil = 6; expect(drawNativeMimicAccents(recorder().ctx, actor, state)?.reason).toBe('revealed');
    actor.revealedUntil = 5; expect(drawNativeMimicAccents(recorder().ctx, actor, state)).toBeUndefined();
    state.scanUntil = 6; expect(drawNativeMimicAccents(recorder().ctx, actor, state)?.reason).toBe('scan');
    state.scanUntil = 0; state.growth!.marks = [{ targetId: actor.id, organId: state.battle!.organId, until: 6, slowUntil: 6, factor: .6 }];
    expect(drawNativeMimicAccents(recorder().ctx, actor, state)?.reason).toBe('trace');
    actor.exposedUntil = 6; expect(drawNativeMimicAccents(recorder().ctx, actor, state)?.reason).toBe('exposed');
    const before = JSON.stringify([actor, state]); freeze(actor); freeze(state);
    const draw = recorder(); expect(drawNativeEnemyAccents(draw.ctx, actor, state)).toEqual([]);
    expect(draw.calls.some(call => call.method === 'stroke' && call.color === '#477565')).toBe(true);
    expect(JSON.stringify([actor, state])).toBe(before);
  });
});
