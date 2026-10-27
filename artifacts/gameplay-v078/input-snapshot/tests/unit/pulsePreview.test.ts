import { describe, expect, it } from 'vitest';
import { pulsePreviewPolygon } from '../../src/render/pulsePreview';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { WORLD } from '../../src/game/types';

describe('pulse preview matches combat space', () => {
  it('uses the valve anchor and the actual configured sector edges', () => {
    const origin = { x: 730, y: 230 }, angle = -.6;
    const polygon = pulsePreviewPolygon(origin, angle);
    expect(polygon[0]).toEqual(origin);
    const first = polygon[1], last = polygon.at(-1)!;
    expect(Math.atan2(first.y - origin.y, first.x - origin.x)).toBeCloseTo(angle - BATTLE_BALANCE.pulseHalfAngle, 10);
    expect(Math.atan2(last.y - origin.y, last.x - origin.x)).toBeCloseTo(angle + BATTLE_BALANCE.pulseHalfAngle, 10);
    for (const point of polygon.slice(1)) expect(Math.hypot(point.x - origin.x, point.y - origin.y)).toBeCloseTo(BATTLE_BALANCE.pulseRange, 8);
  });

  it('clips the visible cone at the fold instead of promising effects through it', () => {
    const origin = { x: 730, y: 230 }, obstacle = WORLD.obstacles[0];
    const angle = Math.atan2(obstacle.y - origin.y, obstacle.x - origin.x);
    const polygon = pulsePreviewPolygon(origin, angle);
    const center = polygon[33];
    const expected = Math.hypot(obstacle.x - origin.x, obstacle.y - origin.y) - obstacle.radius;
    expect(Math.hypot(center.x - origin.x, center.y - origin.y)).toBeCloseTo(expected, 8);
    for (const point of polygon.slice(1)) {
      expect(Math.hypot(point.x - obstacle.x, point.y - obstacle.y)).toBeGreaterThanOrEqual(obstacle.radius - 1e-7);
      expect(Math.hypot(point.x - origin.x, point.y - origin.y)).toBeLessThanOrEqual(BATTLE_BALANCE.pulseRange + 1e-7);
    }
  });
});
