import { wallHit } from '../actors/collision';
import { BATTLE_BALANCE } from '../game/battleConfig';
import { WORLD, type Vec, type WorldGeometry } from '../game/types';

/** The preview and active effect share the simulation's angle, range and walls. */
export function pulsePreviewPolygon(origin: Vec, angle: number, radius: number = BATTLE_BALANCE.pulseRange, world: WorldGeometry = WORLD): Vec[] {
  const points: Vec[] = [{ ...origin }];
  for (let i = 0; i <= 64; i++) {
    const direction = angle - BATTLE_BALANCE.pulseHalfAngle + i / 64 * BATTLE_BALANCE.pulseHalfAngle * 2;
    const vector = { x: Math.cos(direction), y: Math.sin(direction) };
    const distance = Math.min(radius, wallHit(origin, vector, radius, world) ?? radius);
    points.push({ x: origin.x + vector.x * distance, y: origin.y + vector.y * distance });
  }
  return points;
}
