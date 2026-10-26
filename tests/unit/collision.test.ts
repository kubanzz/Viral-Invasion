import { describe, expect, it } from 'vitest';
import { distance, moveWithCollision, normalized, rayCircle, wallHit } from '../../src/actors/collision';
import { WORLD } from '../../src/game/types';

describe('2D collisions and rays', () => {
  it('normalizes diagonal movement and handles stationary input', () => {
    expect(Math.hypot(...Object.values(normalized(1, 1)))).toBeCloseTo(1);
    expect(normalized(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('intersects near surfaces, ignores behind/range misses and handles inside origins', () => {
    expect(rayCircle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 100, y: 0 }, 10, 200)).toBe(90);
    expect(rayCircle({ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 100, y: 0 }, 10, 200)).toBeNull();
    expect(rayCircle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 100, y: 0 }, 10, 80)).toBeNull();
    expect(rayCircle({ x: 100, y: 0 }, { x: 1, y: 0 }, { x: 100, y: 0 }, 10, 200)).toBe(0);
  });

  it('keeps dashes outside walls and arena boundaries without tunnelling', () => {
    const obstacle = WORLD.obstacles[0];
    const blocked = moveWithCollision({ x: obstacle.x - 120, y: obstacle.y }, { x: 250, y: 0 }, 19);
    expect(blocked.x).toBeCloseTo(obstacle.x - obstacle.radius - 19);
    expect(distance(blocked, obstacle)).toBeGreaterThanOrEqual(obstacle.radius + 19 - 1e-6);
    const boundary = moveWithCollision({ x: 330, y: 440 }, { x: -3000, y: 3000 }, 19);
    expect(boundary.x).toBe(WORLD.bounds.left + 19);
    expect(boundary.y).toBe(WORLD.bounds.bottom - 19);
  });

  it('uses the same obstacle footprints for movement and firing', () => {
    expect(wallHit({ x: 300, y: 295 }, { x: 1, y: 0 }, 300)).toBe(93);
    expect(wallHit({ x: 330, y: 440 }, normalized(590 - 330, 330 - 440), 530)).toBeNull();
  });
});
