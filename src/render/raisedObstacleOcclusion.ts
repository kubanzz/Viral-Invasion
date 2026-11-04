import { immuneLegions } from '../game/immuneLegions';
import { activeWorld, type GameState, type Target, type Vec } from '../game/types';
import type { TraitId } from '../game/battleTypes';
import { traceVirusOutline } from './battleVisuals';
import { territoryPlayerFlightHeight } from '../game/territoryCannon';
import { immuneCellBody, IMMUNE_BODY_LIFT } from './immuneVisuals';
import type { ImmuneCellState } from '../game/immuneCells';
import { boundsOf, boundsOverlap, localUpperSilhouette, RAISED_OBSTACLE_FADED_OPACITY, SPRITE_Y_SCALE, upperSilhouetteOverlapsBounds,
  type ObstacleOrgan, type RaisedObstacle, type VisualBounds } from './raisedObstacleGeometry';
export { RAISED_OBSTACLE_FADED_OPACITY, SPRITE_Y_SCALE } from './raisedObstacleGeometry';
export type { VisualBounds } from './raisedObstacleGeometry';

export interface RaisedActorBody { id: string; kind: 'player' | 'target' | 'immune' | 'beacon'; groundY: number; bodyBounds: VisualBounds }
export const PLAYER_HEAD_SHAPE = { x: 0, y: -48, rx: 22, ry: 21 } as const;
export function playerBodyPose(state: GameState) {
  const p = state.player, time = state.elapsed;
  const walk = p.moving ? Math.sin(time * 19) : Math.sin(time * 3) * .2;
  return { walk, bob: p.moving ? Math.abs(walk) * 2.2 : Math.sin(time * 2.5) * .8,
    direction: Math.atan2(Math.sin(p.facing) * SPRITE_Y_SCALE, Math.cos(p.facing)) };
}

const obstacleShapes = new WeakMap<RaisedObstacle, { organ: ObstacleOrgan; x: number; y: number; radius: number; upperSilhouette: readonly Vec[]; upperBounds: VisualBounds }>();
export function projectedRaisedObstacle(obstacle: RaisedObstacle, organ: ObstacleOrgan) {
  const cached = obstacleShapes.get(obstacle);
  if (cached && cached.organ === organ && cached.x === obstacle.x && cached.y === obstacle.y && cached.radius === obstacle.radius) return cached;
  const upperSilhouette = localUpperSilhouette(obstacle.radius, organ).map(p => ({ x: obstacle.x + p.x, y: obstacle.y * SPRITE_Y_SCALE + p.y }));
  const result = { organ, x: obstacle.x, y: obstacle.y, radius: obstacle.radius, upperSilhouette, upperBounds: boundsOf(upperSilhouette, 1.25) };
  obstacleShapes.set(obstacle, result); return result;
}

function projectBounds(local: VisualBounds, x: number, y: number, lift = 0): VisualBounds {
  return { left: x + local.left, right: x + local.right, top: y * SPRITE_Y_SCALE + lift + local.top, bottom: y * SPRITE_Y_SCALE + lift + local.bottom };
}
export function playerVisualBounds(state: GameState): VisualBounds {
  const { bob, direction } = playerBodyPose(state), head = PLAYER_HEAD_SHAPE;
  // Shared helmet plus conservative extents of the drawn backpack/suit/boots
  // and the actual rotated tool/tether. Excludes labels, orbit icons and VFX.
  const points: Vec[] = [{ x: -25, y: -44 }, { x: 25, y: 6 },
    { x: head.x - head.rx - 1, y: head.y - head.ry - 1 }, { x: head.x + head.rx + 1, y: head.y + head.ry + 1 }];
  const cos = Math.cos(direction), sin = Math.sin(direction), mx = cos * 24, my = sin * 24;
  // Includes the chunky upper reservoir and the forward nozzle, not the old
  // thin emitter. These are presentation extents; the collider stays untouched.
  for (const [x, y] of [[-12, -14], [21, -14], [21, 8], [-12, 8]]) points.push({ x: mx + x * cos - y * sin, y: my + x * sin + y * cos });
  for (const [x, y] of [[12, -25], [24, -15], [mx - 4, my - 5], [mx, my]]) {
    points.push({ x: x - 4, y: y - 4 }, { x: x + 4, y: y + 4 });
  }
  return projectBounds(boundsOf(points), state.player.x, state.player.y, -bob-territoryPlayerFlightHeight(state));
}

// Bounds derive from the same exported outline tracer used by actual enemies.
// The four normalized shapes are static; no target/state history is retained.
const virusBounds = new Map<string, VisualBounds>();
function outlineBounds(trait: TraitId | undefined): VisualBounds {
  const key = trait ?? 'ordinary', cached = virusBounds.get(key); if (cached) return cached;
  const points: Vec[] = [], add = (...values: number[]) => { for (let i = 0; i < values.length; i += 2) points.push({ x: values[i], y: values[i + 1] }); };
  const recorder = { beginPath() {}, closePath() {}, moveTo: add, lineTo: add, bezierCurveTo: add } as unknown as CanvasRenderingContext2D;
  traceVirusOutline(recorder, trait, 1);
  const bounds = boundsOf(points); virusBounds.set(key, bounds); return bounds;
}
export function targetVisualBounds(target: Target, state: GameState): VisualBounds {
  const r = target.radius, t = state.elapsed, source = target.role === 'source', core = (state.endless && state.battle?.organId === 'heart' ? state.territory?.bossCombat : undefined) ?? state.campaign?.core.combat;
  if (target.role === 'core' && core?.coreId === target.id) {
    const lift = core.phase === 'windup' ? -3 : core.phase === 'recovery' ? 3 : Math.sin(t * 2.8) * 1.4;
    // The same round fallback outline, side brood pods and short shell plates.
    // There is no old translucent mantle or long crystal crown to reserve.
    const outline = outlineBounds(undefined);
    let left = outline.left * r - 1.5, right = outline.right * r + 1.5;
    let top = outline.top * r - 1.5, bottom = outline.bottom * r + 1.5;
    if (core.traits.includes('FISSION')) {
      const radius = core.activeTrait === 'FISSION' ? r * .3 : r * .24;
      left = Math.min(left, -r * .8 - radius - 1); right = Math.max(right, r * .8 + radius + 1);
      bottom = Math.max(bottom, r * .2 + radius * 1.05 + 1);
    }
    if (core.traits.includes('CARAPACE')) {
      const spread = Math.max(core.exposedUntil, target.exposedUntil ?? 0) > t ? 1.3 : 1;
      const rx = r * .3, ry = r * .47;
      const ex = Math.hypot(rx * Math.cos(.55), ry * Math.sin(.55));
      const ey = Math.hypot(rx * Math.sin(.55), ry * Math.cos(.55));
      left = Math.min(left, -r * .57 * spread - ex - 1); right = Math.max(right, r * .57 * spread + ex + 1);
      top = Math.min(top, -r * .48 - ey - 1);
    }
    const local = { left, right, top, bottom };
    const result = projectBounds(local, target.x, target.y, -r * .96 + lift);
    result.left = Math.min(result.left, target.x - r * 1.38 - 1);
    result.right = Math.max(result.right, target.x + r * 1.38 + 1);
    result.bottom = Math.max(result.bottom, target.y * SPRITE_Y_SCALE + 11); return result;
  }
  const trait = target.traits?.[0] ?? (!state.battle && target.kind === 'cluster' ? 'FISSION' : undefined), b = outlineBounds(trait), bob = source ? Math.sin(t * 2) * 1.2 : Math.sin(t * 5 + target.x) * 2;
  const local = { left: b.left * r - 1.25, right: b.right * r + 1.25, top: b.top * r - 1.25, bottom: b.bottom * r + 1.25 };
  if (trait === 'CARAPACE') { local.left = Math.min(local.left, -r * 1.16 - 1); local.right = Math.max(local.right, r * 1.16 + 1); local.bottom = Math.max(local.bottom, r * 1.16 + 1); }
  if (target.role === 'elite' || target.role === 'core') local.top = Math.min(local.top, -r * 1.08 - 19);
  const result = projectBounds(local, target.x, target.y, -r * .8 + bob);
  if (source) { result.left = Math.min(result.left, target.x - r * 1.1 - 9); result.right = Math.max(result.right, target.x + r * 1.1 + 9); result.bottom = Math.max(result.bottom, target.y * SPRITE_Y_SCALE + r * .4 + 8); }
  return result;
}

/** Procedural fallback body only; excludes shadow, bite arc, lifetime bar and labels. */
export function immuneVisualBounds(cell: ImmuneCellState, elapsed: number): VisualBounds {
  const body = immuneCellBody(cell, elapsed), cos = Math.cos(body.rotation), sin = Math.sin(body.rotation);
  return boundsOf(body.outline.map(p => ({ x: cell.x + p.x * cos - p.y * sin,
    y: cell.y * SPRITE_Y_SCALE + IMMUNE_BODY_LIFT + p.x * sin + p.y * cos })), 1);
}

/** Compute each nearby actor once per rendered frame, rather than per obstacle. */
export function getRaisedActorBodies(state: GameState, art?: { player?: VisualBounds; targets?: ReadonlyMap<string, VisualBounds>; immune?: ReadonlyMap<string, VisualBounds>; beacon?: VisualBounds; beacons?: ReadonlyMap<string, VisualBounds> }): RaisedActorBody[] {
  const organ = state.battle?.organId === 'lung' ? 'lung' : 'heart';
  const obstacles = activeWorld(state).obstacles.map(obstacle => ({ obstacle, ...projectedRaisedObstacle(obstacle, organ) }));
  const relevant = (groundY: number, bounds: VisualBounds) => obstacles.some(shape => groundY <= shape.obstacle.y && boundsOverlap(bounds, shape.upperBounds));
  const result: RaisedActorBody[] = [];
  if (state.player.hp > 0) { const bodyBounds = art?.player ?? playerVisualBounds(state); if (relevant(state.player.y, bodyBounds)) result.push({ id: 'player', kind: 'player', groundY: state.player.y, bodyBounds }); }
  for (const target of state.targets) if (target.hp > 0 || art?.targets?.has(target.id)) { const bodyBounds = art?.targets?.get(target.id) ?? targetVisualBounds(target, state); if (relevant(target.y, bodyBounds)) result.push({ id: target.id, kind: 'target', groundY: target.y, bodyBounds }); }
  for (const cell of state.growth?.cells ?? []) {
    if (cell.organId !== state.battle?.organId || cell.until <= state.elapsed || cell.born >= state.elapsed || (cell.hp ?? 1) <= 0) continue;
    const nativeBounds = art?.immune?.get(cell.id);
    if (nativeBounds) {
      if (relevant(cell.y, nativeBounds)) result.push({ id: cell.id, kind: 'immune', groundY: cell.y, bodyBounds: nativeBounds });
      continue;
    }
    const extent = Math.hypot(cell.radius + 3, (cell.radius + 3) * .88) * 1.12 + 1;
    const broad = { left: cell.x - extent, right: cell.x + extent, top: cell.y * SPRITE_Y_SCALE + IMMUNE_BODY_LIFT - extent, bottom: cell.y * SPRITE_Y_SCALE + IMMUNE_BODY_LIFT + extent };
    if (!relevant(cell.y, broad)) continue;
    const body = immuneCellBody(cell, state.elapsed); if (body.alpha <= 0) continue;
    const bodyBounds = immuneVisualBounds(cell, state.elapsed);
    result.push({ id: cell.id, kind: 'immune', groundY: cell.y, bodyBounds });
  }
  for (const beacon of immuneLegions(state.growth)) {
    const bounds = art?.beacons?.get(beacon.id) ?? (beacon.id === state.growth?.beacon?.id ? art?.beacon : undefined);
    if (bounds && beacon.mode !== 'patrol' && beacon.organId === state.battle?.organId && beacon.until > state.elapsed
      && relevant(beacon.y, bounds)) result.push({ id: beacon.id, kind: 'beacon', groundY: beacon.y, bodyBounds: bounds });
  }
  return result;
}

export function getRaisedObstacleOcclusion(state: GameState, obstacle: RaisedObstacle, bodies = getRaisedActorBodies(state)) {
  const shape = projectedRaisedObstacle(obstacle, state.battle?.organId === 'lung' ? 'lung' : 'heart');
  // Stable Y sorting draws same-Y actors before obstacles, too.
  const occludedActors = bodies.filter(body => body.groundY <= obstacle.y && boundsOverlap(body.bodyBounds, shape.upperBounds)
    && upperSilhouetteOverlapsBounds(shape.upperSilhouette, body.bodyBounds));
  return { upperOpacity: occludedActors.length ? RAISED_OBSTACLE_FADED_OPACITY : 1, upperSilhouette: shape.upperSilhouette, upperBounds: shape.upperBounds, occludedActors };
}
