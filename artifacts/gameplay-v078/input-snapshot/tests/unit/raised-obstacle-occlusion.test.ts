import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { GameState, Target } from '../../src/game/types';
import type { ImmuneCellState } from '../../src/game/immuneCells';
import { immuneCellBody } from '../../src/render/immuneVisuals';
import { Renderer } from '../../src/render/renderer';
import { drawLungObstacle } from '../../src/render/lungVisuals';
import { boundsOverlap, drawRaisedBodyLayers, localUpperSilhouette, raisedObstacleCurves, upperSilhouetteOverlapsBounds } from '../../src/render/raisedObstacleGeometry';
import { getRaisedActorBodies, getRaisedObstacleOcclusion, PLAYER_HEAD_SHAPE, playerBodyPose, projectedRaisedObstacle, RAISED_OBSTACLE_FADED_OPACITY, SPRITE_Y_SCALE } from '../../src/render/raisedObstacleOcclusion';
import { raisedObstacleEndpoints } from '../fixtures/raisedObstacleEndpoints';

const fold = { id: 'fold-b', x: 1630, y: 1190, radius: 90 };
function state(organ: 'heart' | 'lung' = 'heart'): GameState {
  const state = new GameSession(13, { campaign: true, milestone: 'G3' }).snapshot();
  state.elapsed = 8; state.tick = 480; state.battle!.organId = organ;
  state.world = { ...state.world!, obstacles: [fold] };
  state.player.x = 300; state.player.y = 300; state.targets = []; state.growth!.cells = [];
  return state;
}
function cell(changes: Partial<ImmuneCellState> = {}): ImmuneCellState {
  return { id: 'cell', beaconId: 'squad', organId: 'heart', born: 7, until: 13, x: 1630, y: 1080,
    radius: 15, facing: 0, damage: 8, interval: .8, updatedAt: 8, attackReadyAt: 8.5, attackUntil: 0,
    targetId: null, activity: 'seeking', navigationAt: 8.5, waypoint: null, ...changes };
}
function target(changes: Partial<Target> = {}): Target {
  return { id: 'target', x: 1630, y: 1100, radius: 24, hp: 30, maxHp: 30, kind: 'single', hitUntil: 0, scanned: false, ...changes };
}

type Paint = { method: string; args: unknown[]; alpha: number; clip: number[] | null };
function canvas() {
  const paints: Paint[] = [], stack: { alpha: number; clip: number[] | null }[] = [];
  let alpha = 1, clip: number[] | null = null, rect: number[] | null = null;
  const ctx = new Proxy({}, {
    get: (_target, method) => {
      if (method === 'globalAlpha') return alpha;
      if (method === 'save') return () => stack.push({ alpha, clip });
      if (method === 'restore') return () => { const saved = stack.pop()!; alpha = saved.alpha; clip = saved.clip; };
      if (method === 'rect') return (...args: number[]) => { rect = args; };
      if (method === 'clip') return () => { clip = rect; };
      if (String(method).startsWith('create')) return () => ({ addColorStop() {} });
      return (...args: unknown[]) => { paints.push({ method: String(method), args, alpha, clip }); };
    },
    set: (_target, method, value) => { if (method === 'globalAlpha') alpha = value; return true; },
  }) as CanvasRenderingContext2D;
  return { ctx, paints };
}

describe('raised obstacle upper-body occlusion', () => {
  it.each(raisedObstacleEndpoints)('protects the actual third cell at $browser $endpoint tick $tick', endpoint => {
    const sample = state(); sample.tick = endpoint.tick; sample.elapsed = endpoint.elapsed;
    sample.growth!.cells = structuredClone(endpoint.cells);
    const original = JSON.stringify(sample), bodies = getRaisedActorBodies(sample);
    const result = getRaisedObstacleOcclusion(sample, fold, bodies);
    expect(result.upperOpacity).toBe(RAISED_OBSTACLE_FADED_OPACITY);
    expect(result.occludedActors.some(actor => actor.id === endpoint.cells[2].id && actor.kind === 'immune')).toBe(true);
    expect(JSON.stringify(sample)).toBe(original);
  });

  it.each(['heart', 'lung'] as const)('uses the real %s silhouette and a legal cell behind its collision footprint', organ => {
    const sample = state(organ); sample.growth!.cells = [cell({ organId: organ })];
    expect(Math.hypot(1630 - fold.x, 1080 - fold.y) - fold.radius - 15).toBe(5);
    const shape = projectedRaisedObstacle(fold, organ);
    expect(shape.upperBounds.top).toBeLessThan(fold.y * SPRITE_Y_SCALE - fold.radius * 1.38);
    expect(getRaisedObstacleOcclusion(sample, fold).upperOpacity).toBe(.22);
    sample.growth!.cells![0].y = 980;
    expect(getRaisedObstacleOcclusion(sample, fold).upperOpacity).toBe(1);
    sample.growth!.cells![0].y = fold.y + 30;
    expect(getRaisedObstacleOcclusion(sample, fold).upperOpacity).toBe(1);
    sample.growth!.cells![0].x = 600; sample.growth!.cells![0].y = 1080;
    expect(getRaisedObstacleOcclusion(sample, fold).upperOpacity).toBe(1);
  });

  it('tests the filled silhouette rather than fading every occupied obstacle bounding-box corner', () => {
    const sample = state(), shape = projectedRaisedObstacle(fold, 'heart');
    const emptyCorner = { left: fold.x - 91, right: fold.x - 87, top: fold.y * .72 - 113, bottom: fold.y * .72 - 109 };
    expect(boundsOverlap(emptyCorner, shape.upperBounds)).toBe(true);
    expect(getRaisedObstacleOcclusion(sample, fold, [{ id: 'corner', kind: 'immune', groundY: 1000, bodyBounds: emptyCorner }]).upperOpacity).toBe(1);
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    // Neither polygon vertices nor rectangle corners lie inside the other.
    expect(upperSilhouetteOverlapsBounds(square, { left: -10, right: 20, top: 4, bottom: 6 })).toBe(true);
  });

  it('ignores dead, expired, other-organ and fully transparent newborn actors; includes stable same-Y order', () => {
    const sample = state(); sample.player.hp = 0; sample.targets = [target({ hp: 0 })];
    sample.growth!.cells = [cell({ until: 8 }), cell({ organId: 'lung' }), cell({ born: 8 }), cell({ born: 9 })];
    expect(getRaisedActorBodies(sample)).toEqual([]);
    expect(getRaisedObstacleOcclusion(sample, fold).upperOpacity).toBe(1);
    sample.growth!.cells = [cell({ id: 'same-y', y: fold.y })];
    expect(getRaisedObstacleOcclusion(sample, fold).occludedActors.map(actor => actor.id)).toContain('same-y');
  });

  it('protects actual player/head and live target body envelopes, not just ground points', () => {
    const sample = state(); sample.player.x = fold.x; sample.player.y = 1100;
    sample.player.moving = true; sample.player.facing = Math.PI / 2;
    sample.targets = [target(), target({ id: 'crown', role: 'elite', traits: ['CARAPACE'] })];
    const bodies = getRaisedActorBodies(sample), player = bodies.find(body => body.kind === 'player')!;
    const pose = playerBodyPose(sample);
    expect(player.bodyBounds.top).toBeCloseTo(sample.player.y * .72 - pose.bob + PLAYER_HEAD_SHAPE.y - PLAYER_HEAD_SHAPE.ry - 1, 8);
    expect(getRaisedObstacleOcclusion(sample, fold, bodies).occludedActors.map(actor => actor.id)).toEqual(expect.arrayContaining(['player', 'target', 'crown']));
    expect(bodies.find(body => body.id === 'crown')!.bodyBounds.top).toBeLessThan(bodies.find(body => body.id === 'target')!.bodyBounds.top);
  });

  it('shares the curved drawing path and invalidates its finite object cache when geometry changes', () => {
    const sample = { ...fold }, before = projectedRaisedObstacle(sample, 'heart');
    expect(projectedRaisedObstacle(sample, 'heart')).toBe(before);
    expect(raisedObstacleCurves(90, 'heart')[0][3].x).toBe(3);
    expect(localUpperSilhouette(90, 'heart').length).toBeGreaterThan(20);
    sample.x += 20;
    expect(projectedRaisedObstacle(sample, 'heart').upperBounds.left).toBeCloseTo(before.upperBounds.left + 20);
    expect(projectedRaisedObstacle(sample, 'lung').upperBounds.top).not.toBe(before.upperBounds.top);
  });

  it('uses the identical 37-vertex animated cell outline for visible bodies', () => {
    const sample = state(), actor = cell({ facing: 1.2, attackUntil: 8.2 }); sample.growth!.cells = [actor];
    const body = immuneCellBody(actor, sample.elapsed), measured = getRaisedActorBodies(sample)[0].bodyBounds;
    expect(body.outline).toHaveLength(37); expect(body.biting).toBe(true);
    for (const p of body.outline) {
      const x = actor.x + p.x * Math.cos(body.rotation) - p.y * Math.sin(body.rotation);
      const y = actor.y * .72 - 13 + p.x * Math.sin(body.rotation) + p.y * Math.cos(body.rotation);
      expect(x).toBeGreaterThanOrEqual(measured.left); expect(x).toBeLessThanOrEqual(measured.right);
      expect(y).toBeGreaterThanOrEqual(measured.top); expect(y).toBeLessThanOrEqual(measured.bottom);
    }
  });

  it('fades only the upper body while retaining inherited alpha for the lower base and collision footprint', () => {
    const { ctx, paints } = canvas(); ctx.globalAlpha = .8;
    drawRaisedBodyLayers(ctx, 90, .22, () => { ctx.fill(); });
    const fills = paints.filter(paint => paint.method === 'fill');
    expect(fills.map(paint => paint.alpha)).toEqual([.8 * .22, .8]);
    expect(fills[0].clip![1]).toBe(-180); expect(fills[1].clip![1]).toBe(0);
    expect(paints.find(paint => paint.method === 'ellipse')!.args.slice(0, 4)).toEqual([0, 0, 90, 90 * .72]);
    expect(paints.at(-1)!.alpha).toBe(.8); expect(ctx.globalAlpha).toBe(.8);
  });

  it('runs real heart/lung draw callbacks with opaque shadows and leaves complete simulation state unchanged', () => {
    const sample = state(), original = JSON.stringify(sample), { ctx, paints } = canvas();
    const renderer = Object.create(Renderer.prototype) as { drawObstacle(ctx: CanvasRenderingContext2D, obstacle: typeof fold, opacity: number): void; drawShadows(ctx: CanvasRenderingContext2D, state: GameState): void };
    renderer.drawShadows(ctx, sample);
    const shadowEnd = paints.length;
    renderer.drawObstacle(ctx, fold, .22); drawLungObstacle(ctx, fold, .22);
    expect(paints.slice(0, shadowEnd).filter(paint => paint.method === 'fill').every(paint => paint.alpha === 1)).toBe(true);
    expect(paints.slice(shadowEnd).filter(paint => paint.method === 'fill' && paint.clip?.[1] === -180).every(paint => paint.alpha === .22)).toBe(true);
    expect(paints.slice(shadowEnd).filter(paint => paint.method === 'fill' && paint.clip?.[1] === 0).every(paint => paint.alpha === 1)).toBe(true);
    expect(JSON.stringify(sample)).toBe(original);
  });
});
