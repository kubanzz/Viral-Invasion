import { WORLD, type Vec } from '../game/types';

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalized(x: number, y: number): Vec {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Earliest point on a ray intersecting a circle, in world distance units. */
export function rayCircle(origin: Vec, direction: Vec, center: Vec, radius: number, range: number): number | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const b = ox * direction.x + oy * direction.y;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const t = -b - Math.sqrt(discriminant);
  return t >= 0 && t <= range ? t : null;
}

export function wallHit(origin: Vec, direction: Vec, range: number): number | null {
  let nearest: number | null = null;
  for (const obstacle of WORLD.obstacles) {
    const hit = rayCircle(origin, direction, obstacle, obstacle.radius, range);
    if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
  }
  return nearest;
}

/** Substeps prevent dash tunnelling. Only visible ground footprints block movement. */
export function moveWithCollision(position: Vec, delta: Vec, radius: number): Vec {
  const count = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / Math.max(4, radius * .5)));
  const result = { ...position };
  for (let i = 0; i < count; i++) {
    result.x += delta.x / count;
    result.y += delta.y / count;
    for (const obstacle of WORLD.obstacles) {
      const gap = distance(result, obstacle);
      const minimum = radius + obstacle.radius;
      if (gap < minimum) {
        const normal = gap > 1e-8 ? normalized(result.x - obstacle.x, result.y - obstacle.y) : { x: 1, y: 0 };
        result.x = obstacle.x + normal.x * minimum;
        result.y = obstacle.y + normal.y * minimum;
      }
    }
    result.x = clamp(result.x, WORLD.bounds.left + radius, WORLD.bounds.right - radius);
    result.y = clamp(result.y, WORLD.bounds.top + radius, WORLD.bounds.bottom - radius);
  }
  return result;
}
