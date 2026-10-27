import type { Vec, WorldGeometry } from '../game/types';

export const SPRITE_Y_SCALE = .72;
export const RAISED_OBSTACLE_FADED_OPACITY = .22;
export interface VisualBounds { left: number; top: number; right: number; bottom: number }
export type RaisedObstacle = WorldGeometry['obstacles'][number];
export type ObstacleOrgan = 'heart' | 'lung';
type Cubic = readonly [Vec, Vec, Vec, Vec];
const FLATNESS = .25, OUTLINE_HALF_WIDTH = 1;

/** Local drawing coordinates, before the sprite's inverse Y scale. */
export function raisedObstacleCurves(radius: number, organ: ObstacleOrgan): readonly [Cubic, Cubic] {
  const r = radius, left = { x: -r, y: 0 }, right = { x: r, y: 0 };
  const top = organ === 'lung' ? { x: -r * .1, y: -r * 1.37 } : { x: 3, y: -r * 1.38 };
  return organ === 'lung'
    ? [[left, { x: -r * 1.25, y: -r * .45 }, { x: -r * .9, y: -r * 1.32 }, top],
      [top, { x: r * .7, y: -r * 1.5 }, { x: r * 1.24, y: -r * .6 }, right]]
    : [[left, { x: -r * 1.2, y: -r * .5 }, { x: -r * .25, y: -r * 1.6 }, top],
      [top, { x: r * .6, y: -r * 1.4 }, { x: r * 1.1, y: -r * .6 }, right]];
}

export function traceRaisedObstacle(ctx: CanvasRenderingContext2D, radius: number, organ: ObstacleOrgan): void {
  const curves = raisedObstacleCurves(radius, organ);
  ctx.beginPath(); ctx.moveTo(curves[0][0].x, curves[0][0].y);
  for (const [, a, b, end] of curves) ctx.bezierCurveTo(a.x, a.y, b.x, b.y, end.x, end.y);
  ctx.quadraticCurveTo(0, radius * (organ === 'lung' ? .32 : .35), -radius, 0);
}

function flatten(curve: Cubic, points: Vec[], depth = 0): void {
  const [a, b, c, d] = curve, dx = d.x - a.x, dy = d.y - a.y, length = Math.hypot(dx, dy);
  const deviation = (p: Vec) => length ? Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / length : Math.hypot(p.x - a.x, p.y - a.y);
  if (depth >= 8 || Math.max(deviation(b), deviation(c)) <= FLATNESS) { points.push(d); return; }
  const mid = (p: Vec, q: Vec): Vec => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d), abc = mid(ab, bc), bcd = mid(bc, cd), center = mid(abc, bcd);
  flatten([a, ab, abc, center], points, depth + 1); flatten([center, bcd, cd, d], points, depth + 1);
}

// Only radius and organ affect the static path; this finite cache never stores
// per-tick actors, states or world objects. The game has a small fixed radius set.
const silhouettes = new Map<string, readonly Vec[]>();
export function localUpperSilhouette(radius: number, organ: ObstacleOrgan): readonly Vec[] {
  const key = `${organ}:${radius}`, cached = silhouettes.get(key); if (cached) return cached;
  const curves = raisedObstacleCurves(radius, organ), points = [curves[0][0]];
  for (const curve of curves) flatten(curve, points);
  // Keep even adversarial custom-world radii from growing the cache indefinitely.
  if (silhouettes.size >= 32) silhouettes.delete(silhouettes.keys().next().value!);
  silhouettes.set(key, points); return points;
}

export function boundsOf(points: readonly Vec[], pad = 0): VisualBounds {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const p of points) { left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); bottom = Math.max(bottom, p.y); }
  return { left: left - pad, top: top - pad, right: right + pad, bottom: bottom + pad };
}
export function boundsOverlap(a: VisualBounds, b: VisualBounds): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}
function inside(point: Vec, polygon: readonly Vec[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
/** Closed filled upper silhouette versus a conservative visible body rectangle. */
export function upperSilhouetteOverlapsBounds(polygon: readonly Vec[], bounds: VisualBounds): boolean {
  // Covers the adaptive chord error and the actual 2px obstacle outline. Only
  // this narrow boundary can conservatively fade before a pixel is covered.
  const pad = FLATNESS + OUTLINE_HALF_WIDTH;
  const box = { left: bounds.left - pad, right: bounds.right + pad, top: bounds.top - pad, bottom: bounds.bottom + pad };
  if (!boundsOverlap(boundsOf(polygon), box)) return false;
  const inBox = (p: Vec) => p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom;
  if (polygon.some(inBox) || [{ x: box.left, y: box.top }, { x: box.right, y: box.top }, { x: box.left, y: box.bottom }, { x: box.right, y: box.bottom }].some(p => inside(p, polygon))) return true;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], dx = b.x - a.x, dy = b.y - a.y;
    let start = 0, end = 1;
    for (const [p, q] of [[-dx, a.x - box.left], [dx, box.right - a.x], [-dy, a.y - box.top], [dy, box.bottom - a.y]]) {
      if (p === 0) { if (q < 0) { start = 2; break; } }
      else if (p < 0) start = Math.max(start, q / p); else end = Math.min(end, q / p);
    }
    if (start <= end) return true;
  }
  return false;
}

/** Draw only the upper half at reduced alpha; retain the original opaque base. */
export function drawRaisedBodyLayers(ctx: CanvasRenderingContext2D, radius: number, opacity: number, draw: () => void): void {
  if (opacity >= 1) { draw(); return; }
  ctx.save(); ctx.beginPath(); ctx.rect(-radius * 2, -radius * 2, radius * 4, radius * 2); ctx.clip(); ctx.globalAlpha *= opacity; draw(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(-radius * 2, 0, radius * 4, radius * 2); ctx.clip(); draw(); ctx.restore();
  // This ellipse is the real circular collision footprint under the current
  // inverse-Y sprite transform, distinct from the raised body's visual base.
  ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * SPRITE_Y_SCALE, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#d6b29da6'; ctx.lineWidth = 1.5; ctx.stroke();
}
