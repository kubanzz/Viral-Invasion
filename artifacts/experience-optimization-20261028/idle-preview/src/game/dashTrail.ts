import { distance, normalized, rayCircle } from '../actors/collision';
import type { Vec, WorldGeometry } from './types';

/** Omit a visual chord that cuts through a fold; this never affects movement. */
export function dashTrailVisible(from: Vec, to: Vec, world: WorldGeometry): boolean {
  const length = distance(from, to);
  if (length <= .01) return false;
  const direction = normalized(to.x - from.x, to.y - from.y);
  // Allow for the maximum half-width of the fading trail stroke.
  return world.obstacles.every(obstacle => rayCircle(from, direction, obstacle, obstacle.radius + 3, length) === null);
}
