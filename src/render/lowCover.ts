import type { Vec } from '../game/types';
import type { TerritoryNode } from '../game/territoryTypes';
import { boundsOverlap, type VisualBounds } from './raisedObstacleGeometry';
import type { RaisedActorBody } from './raisedObstacleOcclusion';

export function lowPropBounds(p: Vec, radius: number, front = false): VisualBounds {
  return { left: p.x - radius, right: p.x + radius, top: p.y * .72 - (front ? 40 : 24), bottom: p.y * .72 + radius * .72 };
}
export function lowPropOpacity(p: Vec, radius: number, bodies: readonly RaisedActorBody[], front = false): number {
  const bounds = lowPropBounds(p, radius, front);
  return bodies.some(body => body.groundY <= p.y && boundsOverlap(body.bodyBounds, bounds)) ? .22 : 1;
}
/** Circular collision disk with a low raised rim, shared by both renderers. */
export function drawLowCover(ctx: CanvasRenderingContext2D, p: Vec, radius: number, owner: TerritoryNode['owner'], opacity: number): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 1 / .72);
  const healthy = owner === 'healthy', ry = radius * .72;
  ctx.fillStyle = '#51494b25'; ctx.beginPath(); ctx.ellipse(0, 3, radius + 3, ry + 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha *= opacity;
  ctx.fillStyle = healthy ? '#bfaaa0' : '#8f778c'; ctx.strokeStyle = healthy ? '#8d7f76' : '#655165'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 0, radius, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = healthy ? '#e6d2b8' : '#b69eaf';
  ctx.beginPath(); ctx.ellipse(0, -10, radius * .91, ry * .85, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = healthy ? '#a7b69c' : '#86617c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-radius * .55, -10); ctx.quadraticCurveTo(0, -20, radius * .55, -11); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(-4, -3); ctx.stroke(); ctx.restore();
}
export function drawFrontPlatform(ctx: CanvasRenderingContext2D, node: TerritoryNode, opacity: number): void {
  ctx.save(); ctx.translate(node.x, node.y); ctx.scale(1, 1 / .72); ctx.globalAlpha *= opacity;
  const healthy = node.owner === 'healthy';
  ctx.fillStyle = '#54465025'; ctx.beginPath(); ctx.ellipse(0, 3, 36, 20, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = healthy ? '#b2c5ae' : '#ab8a98'; ctx.strokeStyle = healthy ? '#547a69' : '#895766'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, -3, 32, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(-5, -39); ctx.stroke();
  ctx.fillStyle = healthy ? '#d8edc5' : '#e5a6ad'; ctx.beginPath(); ctx.moveTo(-4, -39); ctx.lineTo(19, -33); ctx.lineTo(-4, -26); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
