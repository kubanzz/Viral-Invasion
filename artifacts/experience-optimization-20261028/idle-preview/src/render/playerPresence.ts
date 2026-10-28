import { activeWorld, type GameState, type Vec } from '../game/types';
import { BATTLE_BALANCE } from '../game/battleConfig';
import { isForegroundOccluded } from './occlusion';
import { boundsOverlap, SPRITE_Y_SCALE, type VisualBounds } from './raisedObstacleGeometry';
import { getRaisedObstacleOcclusion, PLAYER_HEAD_SHAPE, playerBodyPose, playerVisualBounds, targetVisualBounds, type RaisedActorBody } from './raisedObstacleOcclusion';

export interface PlayerPresence {
  active: boolean;
  /** Conservative drawn body envelopes, not a pixel-occlusion measurement. */
  potentialBodyOccluders: string[];
  raisedOccluders: string[];
  foreground: boolean;
  pendingRoundDangers: string[];
  bodyBounds: VisualBounds;
  groundAnchor: Vec;
}

function diskOverlapsBody(center: Vec, radius: number, body: VisualBounds): boolean {
  const y = center.y * SPRITE_Y_SCALE;
  const dx = Math.max(body.left - center.x, 0, center.x - body.right);
  const dy = Math.max(body.top - y, 0, y - body.bottom) / SPRITE_Y_SCALE;
  return dx * dx + dy * dy <= (radius + 5) ** 2;
}

/** Derivation only: does not move actors, consume RNG or hide danger contours. */
export function playerPresence(state: GameState, raisedBodies?: readonly RaisedActorBody[]): PlayerPresence {
  const p = state.player, bodyBounds = playerVisualBounds(state);
  const result: PlayerPresence = { active: false, potentialBodyOccluders: [], raisedOccluders: [], foreground: false,
    pendingRoundDangers: [], bodyBounds, groundAnchor: { x: p.x, y: p.y } };
  if (p.hp <= 0 || !['playing', 'paused'].includes(state.phase)) return result;
  for (const target of state.targets) {
    // The player is first among same-Y world entities, so those bodies draw later.
    if (target.hp > 0 && target.y >= p.y && boundsOverlap(bodyBounds, targetVisualBounds(target, state))) result.potentialBodyOccluders.push(target.id);
    const isCore = target.id === state.campaign?.core.combat?.coreId;
    if (!isCore && target.hp > 0 && target.attackAim && (target.attackAt ?? 0) > state.elapsed
      && diskOverlapsBody(target.attackAim, target.attackRadius ?? BATTLE_BALANCE.attackRadius, bodyBounds)) result.pendingRoundDangers.push(target.id);
    if ((target.splitAt ?? 0) > state.elapsed && target.splitPositions?.some(point => diskOverlapsBody(point, 18, bodyBounds))) result.pendingRoundDangers.push(`split:${target.id}`);
  }
  const attack = state.campaign?.core.combat?.attack;
  if (attack && attack.resolveAt > state.elapsed && state.campaign?.core.combat?.organId === state.battle?.organId && attack.kind !== 'crystal-sweep') {
    const centers = attack.kind === 'brood' ? attack.landings : [attack.aim];
    if (centers.some(point => diskOverlapsBody(point, attack.radius, bodyBounds))) result.pendingRoundDangers.push(attack.id);
  }
  const world = activeWorld(state);
  const bodies: RaisedActorBody[] = raisedBodies ? [...raisedBodies] : [{ id: 'player', kind: 'player', groundY: p.y, bodyBounds }];
  for (const obstacle of world.obstacles) if (getRaisedObstacleOcclusion(state, obstacle, bodies).occludedActors.some(actor => actor.id === 'player')) result.raisedOccluders.push(obstacle.id);
  result.foreground = isForegroundOccluded(p, world);
  result.active = result.potentialBodyOccluders.length > 0 || result.raisedOccluders.length > 0 || result.foreground || result.pendingRoundDangers.length > 0;
  return result;
}

/** Thin informational contour only. Normal body remains in the Y-sorted pass. */
export function drawPlayerPresence(ctx: CanvasRenderingContext2D, state: GameState, presence: PlayerPresence): void {
  if (!presence.active) return;
  const p = state.player, { walk, bob, direction } = playerBodyPose(state), head = PLAYER_HEAD_SHAPE;
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 1 / SPRITE_Y_SCALE);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
  const trace = () => {
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - bob, head.rx + 1, head.ry + 1, 0, 0, Math.PI * 2);
    ctx.roundRect(-18, -44 - bob, 36, 34, 12);
    ctx.moveTo(-1, -3 + walk * 2 - bob); ctx.ellipse(-11, -3 + walk * 2 - bob, 10, 7, 0, 0, Math.PI * 2);
    ctx.moveTo(21, -3 - walk * 2 - bob); ctx.ellipse(11, -3 - walk * 2 - bob, 10, 7, 0, 0, Math.PI * 2);
  };
  // No opaque body, glow, fill, or radius-sized mask: only a narrow double line.
  for (const [width, color] of [[4.5, '#102b3bf0'], [1.7, '#b9fff4']] as const) {
    trace(); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 2, 24, 9, 0, .15, Math.PI - .15);
    ctx.moveTo(-24 * Math.cos(.15), 2 - 9 * Math.sin(.15));
    ctx.ellipse(0, 2, 24, 9, 0, Math.PI + .15, Math.PI * 2 - .15);
    const x = Math.cos(direction) * 30, y = Math.sin(direction) * 30;
    const dx = Math.cos(direction), dy = Math.sin(direction);
    ctx.moveTo(x - dx * 7 - dy * 4, y - dy * 7 + dx * 4); ctx.lineTo(x, y); ctx.lineTo(x - dx * 7 + dy * 4, y - dy * 7 - dx * 4);
    ctx.stroke();
  }
  ctx.restore();
}
