import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition, moveWithCollision, normalized, rayCircle, wallHit } from '../../src/actors/collision';
import { WORLD } from '../../src/game/types';
import { LUNG_WORLD } from '../../src/game/organConfig';

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

  it('never embeds a legal body where the lower lung fold meets the boundary', () => {
    let position = { x: 550, y: 1393 };
    expect(isLegalPosition(position, 22, LUNG_WORLD)).toBe(true);
    for (let tick = 0; tick < 600; tick++) {
      const next = moveWithCollision(position, { x: 64 / 60, y: 0 }, 22, LUNG_WORLD);
      expect(isLegalPosition(next, 22, LUNG_WORLD)).toBe(true);
      expect(distance(position, next)).toBeLessThanOrEqual(64 / 60 + 1e-7);
      position = next;
    }
    expect(position.x).toBeLessThan(587);
    expect(position.y).toBe(1393);
  });

  it('recovers a supplied invalid spawn to the nearest legal boundary-circle candidate', () => {
    const start = { x: 650, y: 1400 };
    const resolved = moveWithCollision(start, { x: 0, y: 0 }, 22, LUNG_WORLD);
    expect(isLegalPosition(resolved, 22, LUNG_WORLD)).toBe(true);
    expect(resolved.y).toBe(1393);
    expect(Math.abs(resolved.x - 650)).toBeCloseTo(Math.sqrt(90 ** 2 - 63 ** 2));
    expect(start).toEqual({ x: 650, y: 1400 });
  });

  it('checks circle and boundary constraints after long substepped pushes without wall escape jumps', () => {
    const start = { x: 550, y: 1393 };
    const resolved = moveWithCollision(start, { x: 2000, y: 0 }, 22, LUNG_WORLD);
    expect(isLegalPosition(resolved, 22, LUNG_WORLD)).toBe(true);
    expect(resolved.x).toBeLessThan(587);
    expect(resolved.y).toBe(1393);
    expect(distance(start, resolved)).toBeLessThan(40);
  });

  it('recovers central overlapping spawn footprints with bounded candidate projection', () => {
    const world = { ...WORLD, obstacles: [{ id: 'a', x: 600, y: 400, radius: 60 }, { id: 'b', x: 650, y: 400, radius: 60 }] };
    const resolved = moveWithCollision({ x: 625, y: 400 }, { x: 0, y: 0 }, 22, world);
    expect(isLegalPosition(resolved, 22, world)).toBe(true);
    expect(distance(resolved, { x: 625, y: 400 })).toBeLessThan(110);
  });
});
