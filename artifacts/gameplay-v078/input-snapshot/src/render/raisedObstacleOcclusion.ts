import { activeWorld, type GameState, type Target, type Vec } from '../game/types';
import type { TraitId } from '../game/battleTypes';
import { traceVirusOutline } from './battleVisuals';
import { immuneCellBody, IMMUNE_BODY_LIFT } from './immuneVisuals';
import { boundsOf, boundsOverlap, localUpperSilhouette, RAISED_OBSTACLE_FADED_OPACITY, SPRITE_Y_SCALE, upperSilhouetteOverlapsBounds,
  type ObstacleOrgan, type RaisedObstacle, type VisualBounds } from './raisedObstacleGeometry';
export { RAISED_OBSTACLE_FADED_OPACITY, SPRITE_Y_SCALE } from './raisedObstacleGeometry';
export type { VisualBounds } from './raisedObstacleGeometry';

export interface RaisedActorBody { id: string; kind: 'player' | 'target' | 'immune'; groundY: number; bodyBounds: VisualBounds }
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
  for (const [x, y] of [[-11, -6], [18, -6], [18, 6], [-11, 6]]) points.push({ x: mx + x * cos - y * sin, y: my + x * sin + y * cos });
  for (const [x, y] of [[12, -25], [24, -15], [mx - 4, my - 5], [mx, my]]) {
    points.push({ x: x - 4, y: y - 4 }, { x: x + 4, y: y + 4 });
  }
  return projectBounds(boundsOf(points), state.player.x, state.player.y, -bob);
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
  const r = target.radius, t = state.elapsed, source = target.role === 'source', core = state.campaign?.core.combat;
  if (!state.battle) {
    const appendage = r * .93 * 1.28 + (target.kind === 'cluster' ? 6 : 5);
    return projectBounds({ left: -appendage, right: appendage, top: -appendage, bottom: appendage }, target.x, target.y, -r * .7 + Math.sin(t * 3.2 + target.x) * 2);
  }
  if (target.role === 'core' && core?.coreId === target.id) {
    const lift = core.phase === 'windup' ? -3 : core.phase === 'recovery' ? 3 : Math.sin(t * 2.8) * 1.4;
    // Control-point envelope of the actual body and present traits, plus the
    // grounded root feet. Absent mantle/crown traits do not inflate the bounds.
    let width = r * 1.12 + 1.5, top = -r * 1.4 - 1.5, bottom = r * 1.05 + 1.5;
    if (core.traits.includes('MIMIC')) { width = Math.max(width, r * 1.6 + .75); top = Math.min(top, -r * 1.7 - .75); }
    if (core.traits.includes('FISSION')) width = Math.max(width, r * 1.11 + 1);
    if (core.traits.includes('CARAPACE')) {
      const spread = Math.max(core.exposedUntil, target.exposedUntil ?? 0) > t ? 1.3 : 1;
      width = Math.max(width, r * .9 * spread + 12.75); top = Math.min(top, -r * .92 * spread - r * .18 - 22.75);
    }
    const local = { left: -width, right: width, top, bottom };
    const result = projectBounds(local, target.x, target.y, -r * .96 + lift);
    result.left = Math.min(result.left, target.x - r * 1.52 - 1);
    result.right = Math.max(result.right, target.x + r * 1.52 + 1);
    result.bottom = Math.max(result.bottom, target.y * SPRITE_Y_SCALE + 11); return result;
  }
  const trait = target.traits?.[0], b = outlineBounds(trait), bob = source ? Math.sin(t * 2) * 1.2 : Math.sin(t * 5 + target.x) * 2;
  const local = { left: b.left * r - 1.25, right: b.right * r + 1.25, top: b.top * r - 1.25, bottom: b.bottom * r + 1.25 };
  if (trait === 'CARAPACE') { local.left = Math.min(local.left, -r * 1.16 - 1); local.right = Math.max(local.right, r * 1.16 + 1); local.bottom = Math.max(local.bottom, r * 1.16 + 1); }
  if (target.role === 'elite' || target.role === 'core') local.top = Math.min(local.top, -r * 1.08 - 19);
  const result = projectBounds(local, target.x, target.y, -r * .8 + bob);
  if (source) { result.left = Math.min(result.left, target.x - r * 1.1 - 9); result.right = Math.max(result.right, target.x + r * 1.1 + 9); result.bottom = Math.max(result.bottom, target.y * SPRITE_Y_SCALE + r * .4 + 8); }
  return result;
}

/** Compute each nearby actor once per rendered frame, rather than per obstacle. */
export function getRaisedActorBodies(state: GameState): RaisedActorBody[] {
  const organ = state.battle?.organId === 'lung' ? 'lung' : 'heart';
  const obstacles = activeWorld(state).obstacles.map(obstacle => ({ obstacle, ...projectedRaisedObstacle(obstacle, organ) }));
  const relevant = (groundY: number, bounds: VisualBounds) => obstacles.some(shape => groundY <= shape.obstacle.y && boundsOverlap(bounds, shape.upperBounds));
  const result: RaisedActorBody[] = [];
  if (state.player.hp > 0) { const bodyBounds = playerVisualBounds(state); if (relevant(state.player.y, bodyBounds)) result.push({ id: 'player', kind: 'player', groundY: state.player.y, bodyBounds }); }
  for (const target of state.targets) if (target.hp > 0) { const bodyBounds = targetVisualBounds(target, state); if (relevant(target.y, bodyBounds)) result.push({ id: target.id, kind: 'target', groundY: target.y, bodyBounds }); }
  for (const cell of state.growth?.cells ?? []) {
    if (cell.organId !== state.battle?.organId || cell.until <= state.elapsed || cell.born >= state.elapsed) continue;
    const extent = Math.hypot(cell.radius + 3, (cell.radius + 3) * .88) * 1.12 + 1;
    const broad = { left: cell.x - extent, right: cell.x + extent, top: cell.y * SPRITE_Y_SCALE + IMMUNE_BODY_LIFT - extent, bottom: cell.y * SPRITE_Y_SCALE + IMMUNE_BODY_LIFT + extent };
    if (!relevant(cell.y, broad)) continue;
    const body = immuneCellBody(cell, state.elapsed); if (body.alpha <= 0) continue;
    const cos = Math.cos(body.rotation), sin = Math.sin(body.rotation);
    const bodyBounds = boundsOf(body.outline.map(p => ({ x: cell.x + p.x * cos - p.y * sin, y: cell.y * SPRITE_Y_SCALE + IMMUNE_BODY_LIFT + p.x * sin + p.y * cos })), 1);
    result.push({ id: cell.id, kind: 'immune', groundY: cell.y, bodyBounds });
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
