import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createWeaponCombat } from '../../src/game/weaponSkills';
import { BLADE_TECHNIQUES } from '../../src/game/bladeTechniques';
import type { GameEvent } from '../../src/game/types';
import type { BladeTraceState } from '../../src/game/weaponSkillsTypes';
import { BLADE_TRACE_VFX_BUDGET, bladeTracePreviewWidth, bladeTraceRouteWindow, bladeTraceVfxEvents,
  drawBladeTraceEffects, drawBladeTraceMarkers } from '../../src/render/bladeUltimateVfx';
import { drawBladeTechniqueEffects } from '../../src/render/weaponUltimateVisuals';

interface DrawCall { method: string; args: unknown[]; lineWidth: number; globalAlpha: number; strokeStyle: string }
function canvasFixture() {
  const calls: DrawCall[] = [], stack: Record<string, unknown>[] = [];
  const style: Record<string, unknown> = { lineWidth: 1, globalAlpha: 1, strokeStyle: '' };
  const ctx = new Proxy(style, { get(target, key) {
    if (key in target) return target[String(key)];
    return (...args: unknown[]) => {
      if (key === 'save') stack.push({ ...target });
      if (key === 'restore') Object.assign(target, stack.pop());
      calls.push({ method: String(key), args, lineWidth: Number(target.lineWidth), globalAlpha: Number(target.globalAlpha), strokeStyle: String(target.strokeStyle) });
    };
  } }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}
function fixture(phase: BladeTraceState['phase'] = 'drawing') {
  const game = new GameSession(22022, { mode: 'endless' }); game.start(); const state = game.state;
  state.elapsed = 1; state.tick = 60; state.visualTime = 1; state.events = [];
  state.weaponCombat = createWeaponCombat({ weaponId: 'redblade', rarity: 'gold', upgrade: 0 });
  const route = [{ x: 300, y: 400 }, { x: 700, y: 400 }, { x: 700, y: 700 }, { x: 300, y: 700 }];
  state.weaponCombat.bladeTrace = { castId: 'trace-1', phase, startedAt: 0, deadline: 3, until: 2,
    damage: 100, marks: route.map((p, id) => ({ ...p, id, targetId: `virus-${id}`, connected: phase !== 'drawing', resolved: false })),
    path: route, route, routeIndex: 2, lastAt: 1, manual: false, hitIds: [], elapsedDistance: 650, speed: 1800 };
  return { state, trace: state.weaponCombat.bladeTrace };
}
function event(type: string, mark = 0, tick = 57, castId = 'trace-1'): GameEvent {
  return { type, tick, data: { castId, mark, x: 700, y: 400, radius: BLADE_TECHNIQUES.trace.impactRadius, manual: true } };
}
afterEach(() => vi.unstubAllGlobals());

describe('four-point blade presentation', () => {
  it('paints the actual swept diameter from gameplay constants for automatic and manually connected routes', () => {
    for (const manual of [false, true]) {
      const { state, trace } = fixture(); trace.manual = manual;
      const { ctx, calls } = canvasFixture(); drawBladeTraceEffects(ctx, state, false, false);
      const width = 2 * (manual ? BLADE_TECHNIQUES.trace.manualWidth : BLADE_TECHNIQUES.trace.width);
      expect(bladeTracePreviewWidth(manual)).toBe(width);
      expect(calls.some(call => call.method === 'stroke' && call.lineWidth === width && call.globalAlpha < .15)).toBe(true);
      expect(calls.filter(call => call.method === 'fillText').map(call => call.args[0])).toEqual(['1', '2', '3', '4']);
    }
  });
  it('follows collision corners when sampling a continuous travelled trail', () => {
    expect(bladeTraceRouteWindow([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 75, 125))
      .toEqual([{ x: 75, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 25 }]);
  });
  it('keeps windup route and marks static, then draws a bounded swordsman trail without mutating gameplay', () => {
    const { state, trace } = fixture('windup'), texture = {} as CanvasImageSource;
    let draw = canvasFixture(); drawBladeTechniqueEffects(draw.ctx, state, false, false, () => texture);
    expect(draw.calls.filter(call => call.method === 'drawImage')).toHaveLength(0);
    const first = draw.calls;
    state.visualTime = 1.1; draw = canvasFixture(); drawBladeTechniqueEffects(draw.ctx, state, false, false, () => texture);
    expect(draw.calls).toEqual(first);
    trace.phase = 'executing'; const before = structuredClone(state);
    draw = canvasFixture(); drawBladeTraceEffects(draw.ctx, state, false, false, () => texture);
    expect(draw.calls.filter(call => call.method === 'drawImage').length).toBeGreaterThan(0);
    expect(draw.calls.filter(call => call.method === 'drawImage').length).toBeLessThanOrEqual(BLADE_TRACE_VFX_BUDGET.afterimages / 2);
    expect(state).toEqual(before);
  });
  it.each(['low', 'reduced'] as const)('retains route, numbered targets and impact information with %s effects', mode => {
    if (mode === 'reduced') vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { state } = fixture('executing'); state.events = [event('BLADE_TRACE_IMPACT')];
    const { ctx, calls } = canvasFixture(); drawBladeTraceEffects(ctx, state, mode === 'low', false, () => ({} as CanvasImageSource));
    expect(calls.filter(call => call.method === 'drawImage')).toHaveLength(0);
    expect(calls.filter(call => call.method === 'fillText')).toHaveLength(4);
    expect(calls.some(call => call.method === 'stroke' && call.lineWidth === bladeTracePreviewWidth(false))).toBe(true);
    expect(calls.some(call => call.method === 'arc' && Number(call.args[2]) > 30)).toBe(true);
    expect(calls.some(call => call.method === 'moveTo' && Number(call.args[0]) === -24)).toBe(true);
  });
  it('deduplicates landmarks by cast and mark and ignores movement spam with fixed frame budgets', () => {
    const { state } = fixture('executing');
    state.events = [ ...Array.from({ length: 300 }, () => event('BLADE_TRACE_SEGMENT')),
      ...Array.from({ length: 12 }, (_, n) => event('BLADE_TRACE_IMPACT', n % 4)),
      ...Array.from({ length: 12 }, (_, n) => event('BLADE_TRACE_MARK_CONNECTED', n % 4)),
      ...Array.from({ length: 12 }, () => event('BLADE_TRACE_FINISHED')) ];
    const selected = bladeTraceVfxEvents(state);
    expect(selected.filter(e => e.type === 'BLADE_TRACE_IMPACT')).toHaveLength(4);
    expect(selected.filter(e => e.type === 'BLADE_TRACE_MARK_CONNECTED')).toHaveLength(4);
    expect(selected.filter(e => e.type === 'BLADE_TRACE_FINISHED')).toHaveLength(1);
    const normal = canvasFixture(); drawBladeTraceEffects(normal.ctx, state);
    state.events = selected;
    const deduplicated = canvasFixture(); drawBladeTraceEffects(deduplicated.ctx, state);
    expect(normal.calls).toEqual(deduplicated.calls);
    state.events = Array.from({ length: 3000 }, (_, n) => event('BLADE_TRACE_IMPACT', n, 57, `cast-${n}`));
    expect(bladeTraceVfxEvents(state)).toHaveLength(4);
  });
  it('rejects old, future and invalid events and freezes ages on pause', () => {
    const { state } = fixture();
    state.events = [event('BLADE_TRACE_IMPACT', 0, 0), event('BLADE_TRACE_IMPACT', 1, 61), event('BLADE_TRACE_IMPACT', 2)];
    state.events.push({ type: 'BLADE_TRACE_FINISHED', tick: 59, data: { x: NaN, y: 400 } });
    expect(bladeTraceVfxEvents(state)).toHaveLength(1);
    state.phase = 'paused'; state.visualTime = 25;
    expect(bladeTraceVfxEvents(state)).toHaveLength(1);
  });
  it('preserves deferred markers and their screen-space scale without redrawing them below labels', () => {
    const { state } = fixture(); const draw = canvasFixture();
    drawBladeTraceEffects(draw.ctx, state, true, false, undefined, { x: 1.5, y: .75, deferTraceMarkers: true });
    expect(draw.calls.filter(call => call.method === 'fillText')).toHaveLength(0);
    drawBladeTraceMarkers(draw.ctx, state, true, false, { x: 1.5, y: .75 });
    expect(draw.calls.filter(call => call.method === 'fillText')).toHaveLength(4);
    expect(draw.calls.filter(call => call.method === 'scale').every(call => call.args[0] === 1 / 1.5 && call.args[1] === 1 / .75)).toBe(true);
  });
  it('splits the final blade scar after the impact pause and preserves a short scar on low effects', () => {
    const { state } = fixture('recovery'); state.events = [event('BLADE_TRACE_FINISHED', 0, 48)];
    let draw = canvasFixture(); drawBladeTraceEffects(draw.ctx, state, false, false);
    expect(draw.calls.some(call => call.method === 'moveTo' && call.args[0] === -265 && Number(call.args[1]) !== 0)).toBe(true);
    draw = canvasFixture(); drawBladeTraceEffects(draw.ctx, state, true, false);
    expect(draw.calls.some(call => call.method === 'moveTo' && call.args[0] === -160)).toBe(true);
  });
});
