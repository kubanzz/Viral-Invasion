import { WORLD, type Vec } from '../game/types';

/** Decorative foreground has no collision; fade before it hides the head. */
export function isForegroundOccluded(point: Vec): boolean {
  const area = WORLD.foreground;
  return point.x >= area.x - 22 && point.x <= area.x + area.width + 22 && point.y >= area.y - 40 && point.y <= area.y + area.height + 36;
}
export function foregroundOpacity(point: Vec): number { return isForegroundOccluded(point) ? .23 : .94; }
