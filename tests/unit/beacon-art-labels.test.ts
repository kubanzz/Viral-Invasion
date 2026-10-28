import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { ImmuneCellState } from '../../src/game/immuneCells';
import { CanvasScene } from '../../src/render/canvasScene';
import { GrowthVisuals } from '../../src/render/growthVisuals';
import { Camera } from '../../src/render/camera';
import type { LabelRect, SceneLabel } from '../../src/render/sceneLabels';

function fixture() {
  const state = new GameSession(71, { campaign: true, milestone: 'G3' }).snapshot();
  state.phase = 'playing'; state.elapsed = 1; state.targets = [];
  state.growth!.beacon = { id: 'beacon', organId: 'heart', x: 420, y: 400, born: 0, until: 5,
    radius: 160, damage: 12, interval: .8, nextAttackAt: 2, tuning: 'balanced', mode: 'protocol' };
  const cell = (id: string, changes: Partial<ImmuneCellState> = {}): ImmuneCellState => ({ id, beaconId: 'beacon', organId: 'heart',
    x: 420, y: 400, born: 0, until: 5, radius: 15, facing: 0, damage: 4, interval: .8, updatedAt: 1, attackReadyAt: 2,
    attackUntil: 0, targetId: null, activity: 'guarding', navigationAt: 1, waypoint: null, ...changes });
  state.growth!.cells = [cell('one'), cell('two'), cell('expired', { until: 1 }), cell('away', { organId: 'lung' }), cell('other-squad', { beaconId: 'other' })];
  const labels: SceneLabel[] = [], reservations: LabelRect[] = [];
  const sink = { add: (value: SceneLabel) => labels.push(value), reserveScreen: (rect: LabelRect) => reservations.push(rect) };
  const calls: { method: string; args: unknown[] }[] = [];
  const ctx: Record<string, unknown> = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1 };
  for (const method of ['save', 'restore', 'translate', 'scale', 'beginPath', 'closePath', 'setLineDash', 'ellipse', 'arc', 'moveTo', 'lineTo', 'roundRect', 'fill', 'stroke', 'fillText', 'strokeText']) {
    ctx[method] = (...args: unknown[]) => calls.push({ method, args });
  }
  return { state, labels, reservations, sink, calls, ctx: ctx as unknown as CanvasRenderingContext2D };
}

describe('native beacon body-free information', () => {
  it('reports real active squad membership and remaining lifetime without issuing body drawing operations', () => {
    const f = fixture(), before = JSON.stringify(f.state), visuals = new GrowthVisuals();
    visuals.drawBeaconLabel(f.ctx, f.state, f.state.growth, f.sink);
    expect(f.labels).toHaveLength(1);
    expect(f.labels[0]).toMatchObject({ id: 'squad:beacon', anchor: { x: 420, y: 400 }, offset: { x: 0, y: -59 },
      lines: [{ text: '✚ 灯塔小队 ×2 · 4.0s' }] });
    expect(f.calls).toEqual([]); expect(f.ctx.globalAlpha).toBe(1); expect(JSON.stringify(f.state)).toBe(before);
  });

  it('maps the actual beacon anchor in CanvasScene and reserves only the PNG body, with no invisible fallback rendering', () => {
    const f = fixture(), scene = Object.create(CanvasScene.prototype) as CanvasScene;
    Object.assign(scene, { camera: new Camera(1440, 900), labels: f.sink, growthVisuals: new GrowthVisuals() });
    const before = JSON.stringify(f.state);
    scene.annotateArtEntity(f.ctx, { id: 'beacon', kind: 'beacon' }, f.state, 34, 59);
    expect(f.labels[0].anchor).toBe(f.state.growth!.beacon);
    expect(f.reservations).toEqual([{ left: 506, right: 574, top: 379, bottom: 450 }]);
    expect(f.calls).toEqual([]); expect(f.ctx.globalAlpha).toBe(1); expect(JSON.stringify(f.state)).toBe(before);
    f.labels.length = 0; f.reservations.length = 0; f.state.growth!.beacon!.mode = 'patrol';
    scene.annotateArtEntity(f.ctx, { id: 'beacon', kind: 'beacon' }, f.state, 34, 59);
    expect(f.labels[0].lines[0].text).toBe('✚ 免疫侦巡 ×2 · 4.0s');
    expect(f.reservations).toEqual([]); expect(f.calls).toEqual([]);
  });

  it('keeps the procedural fallback device and omits devices for patrols, expired beacons and other organs', () => {
    const f = fixture(), visuals = new GrowthVisuals(), before = JSON.stringify(f.state);
    visuals.drawBeacon(f.ctx, f.state, f.state.growth, f.sink);
    expect(f.labels).toHaveLength(1); expect(f.calls.some(call => call.method === 'roundRect')).toBe(true);
    expect(JSON.stringify(f.state)).toBe(before);
    f.state.growth!.beacon!.mode = 'patrol'; f.calls.length = 0; f.labels.length = 0;
    visuals.drawBeacon(f.ctx, f.state, f.state.growth, f.sink);
    expect(f.labels).toHaveLength(1); expect(f.calls).toEqual([]);
    for (const change of [{ until: 1 }, { until: 5, organId: 'lung' }] as const) {
      Object.assign(f.state.growth!.beacon!, change); f.calls.length = 0; f.labels.length = 0;
      visuals.drawBeaconLabel(f.ctx, f.state, f.state.growth, f.sink);
      visuals.drawBeacon(f.ctx, f.state, f.state.growth, f.sink);
      expect(f.labels).toEqual([]); expect(f.calls).toEqual([]);
    }
  });

  it.each([false, true])('preserves the serialized radius and lifetime ground arc in lowEffects=%s', low => {
    const f = fixture(), before = JSON.stringify(f.state), visuals = new GrowthVisuals();
    visuals.drawGround(f.ctx, f.state, f.state.growth, low);
    expect(f.calls.filter(call => call.method === 'ellipse').map(call => call.args.slice(0, 4))).toEqual([
      [420, 400, 160, 160], [420, 400, 28, 28],
    ]);
    expect(f.calls.find(call => call.method === 'arc')!.args).toEqual([420, 400, 33, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * .8]);
    expect(JSON.stringify(f.state)).toBe(before);
  });
});
