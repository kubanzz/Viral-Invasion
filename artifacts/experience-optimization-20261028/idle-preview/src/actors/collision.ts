import { WORLD, type Vec, type WorldGeometry } from '../game/types';

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

export function wallHit(origin: Vec, direction: Vec, range: number, world: WorldGeometry = WORLD): number | null {
  let nearest: number | null = null;
  for (const obstacle of world.obstacles) {
    const hit = rayCircle(origin, direction, obstacle, obstacle.radius, range);
    if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
  }
  return nearest;
}

const COLLISION_EPSILON = 1e-7;
/** A body's complete footprint must satisfy the boundary and every fold together. */
export function isLegalPosition(point: Vec, radius: number, world: WorldGeometry = WORLD): boolean {
  if (point.x < world.bounds.left + radius - COLLISION_EPSILON || point.x > world.bounds.right - radius + COLLISION_EPSILON
    || point.y < world.bounds.top + radius - COLLISION_EPSILON || point.y > world.bounds.bottom - radius + COLLISION_EPSILON) return false;
  return world.obstacles.every(obstacle => {
    const minimum = radius + obstacle.radius - COLLISION_EPSILON;
    return (point.x - obstacle.x) ** 2 + (point.y - obstacle.y) ** 2 >= minimum * minimum;
  });
}

/** Bounded recovery for a newly supplied invalid spawn, never for a legal moving body. */
function projectInvalidPosition(point: Vec, radius: number, world: WorldGeometry): Vec {
  const left = world.bounds.left + radius, right = world.bounds.right - radius;
  const top = world.bounds.top + radius, bottom = world.bounds.bottom - radius;
  const clipped = { x: clamp(point.x, left, right), y: clamp(point.y, top, bottom) };
  const candidates: Vec[] = [clipped];
  const add = (x: number, y: number) => candidates.push({ x, y });
  for (const obstacle of world.obstacles) {
    const extent = radius + obstacle.radius;
    const direction = normalized(point.x - obstacle.x, point.y - obstacle.y);
    add(obstacle.x + (direction.x || direction.y ? direction.x : 1) * extent, obstacle.y + direction.y * extent);
    // Boundary/circle intersections resolve folds which meet the chamber edge.
    for (const x of [left, right]) {
      const square = extent * extent - (x - obstacle.x) ** 2;
      if (square >= 0) { const dy = Math.sqrt(square); add(x, obstacle.y - dy); add(x, obstacle.y + dy); }
    }
    for (const y of [top, bottom]) {
      const square = extent * extent - (y - obstacle.y) ** 2;
      if (square >= 0) { const dx = Math.sqrt(square); add(obstacle.x - dx, y); add(obstacle.x + dx, y); }
    }
    for (let sample = 0; sample < 16; sample++) {
      const angle = sample * Math.PI / 8; add(obstacle.x + Math.cos(angle) * extent, obstacle.y + Math.sin(angle) * extent);
    }
  }
  for (const x of [left, right]) for (const y of [top, bottom]) add(x, y);
  let best: Vec | undefined, bestDistance = Infinity;
  for (const candidate of candidates) if (isLegalPosition(candidate, radius, world)) {
    const square = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (square < bestDistance) { best = candidate; bestDistance = square; }
  }
  // A completely filled/impossible chamber has no legal recovery candidate.
  return best ?? clipped;
}

/** Substeps prevent dash tunnelling. Only visible ground footprints block movement. */
export function moveWithCollision(position: Vec, delta: Vec, radius: number, world: WorldGeometry = WORLD): Vec {
  const count = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / Math.max(4, radius * .5)));
  const result = { ...position };
  if (!isLegalPosition(result, radius, world)) Object.assign(result, projectInvalidPosition(result, radius, world));
  for (let i = 0; i < count; i++) {
    const previousX = result.x, previousY = result.y;
    result.x += delta.x / count;
    result.y += delta.y / count;
    for (const obstacle of world.obstacles) {
      const gap = distance(result, obstacle);
      const minimum = radius + obstacle.radius;
      if (gap < minimum) {
        const normal = gap > 1e-8 ? normalized(result.x - obstacle.x, result.y - obstacle.y) : { x: 1, y: 0 };
        result.x = obstacle.x + normal.x * minimum;
        result.y = obstacle.y + normal.y * minimum;
      }
    }
    result.x = clamp(result.x, world.bounds.left + radius, world.bounds.right - radius);
    result.y = clamp(result.y, world.bounds.top + radius, world.bounds.bottom - radius);
    // A clamp can undo a circle projection at a boundary. Keep the last legal
    // substep instead of embedding or relocating an already legal moving body.
    if (!isLegalPosition(result, radius, world)) { result.x = previousX; result.y = previousY; break; }
  }
  return result;
}
