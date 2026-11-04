import { describe, expect, it } from 'vitest';
import { Camera, CAMERA_PLAYER_FRAME, COMPACT_COMBAT_MINIMUM_SCALE } from '../../src/render/camera';
import { HEART_WORLD, LUNG_WORLD } from '../../src/game/organConfig';
import { WORLD } from '../../src/game/types';

describe('compact actor readability camera', () => {
  it('gives the real actor silhouettes useful screen pixels without changing pointer coordinates or world geometry', () => {
    for (const world of [HEART_WORLD, LUNG_WORLD, WORLD]) for (const [width, height] of [[667, 320], [844, 390]]) {
      const before = JSON.stringify(world), camera = new Camera(width, height);
      const point = { x: world.width * .5, y: world.height * .6 };
      camera.follow(point, world, { minimumScale: COMPACT_COMBAT_MINIMUM_SCALE, snap: true });
      expect(86 * camera.scale).toBeGreaterThanOrEqual(48);
      expect(18 * 2.05 * camera.scale).toBeGreaterThanOrEqual(22);
      const target = { x: 550, y: 440 }, restored = camera.screenToWorld(camera.worldToScreen(target));
      expect(restored.x).toBeCloseTo(target.x, 9); expect(restored.y).toBeCloseTo(target.y, 9);
      expect(JSON.stringify(world)).toBe(before);
    }
  });

  it('temporarily fits a real650-unit preview, then smoothly restores readable combat size', () => {
    const camera = new Camera(667, 320), point = { x: 1200, y: 750 }, aim = { x: point.x, y: point.y + 650 };
    const viewport = { left: 90, top: 70, right: 480, bottom: 280 };
    const normal = { minimumScale: COMPACT_COMBAT_MINIMUM_SCALE, deltaSeconds: 1 / 60 };
    camera.follow(point, HEART_WORLD, { ...normal, snap: true });
    const base = camera.scale;
    for (let index = 0; index < 150; index++) camera.follow(point, HEART_WORLD, { ...normal, aim, viewport });
    expect(camera.scale).toBeLessThan(base);
    const player = camera.worldToScreen(point), target = camera.worldToScreen(aim);
    expect(player.y + CAMERA_PLAYER_FRAME.top * camera.scale).toBeGreaterThanOrEqual(viewport.top + 20 - .001);
    expect(target.y).toBeLessThanOrEqual(viewport.bottom - 20 + .001);
    for (let index = 0; index < 150; index++) camera.follow(point, HEART_WORLD, normal);
    expect(camera.scale).toBeCloseTo(base, 6);
  });

  it('preserves desktop and historical projection unless readability is requested', () => {
    for (const [width, height] of [[1366, 768], [1920, 1080]]) {
      const ordinary = new Camera(width, height), optIn = new Camera(width, height), point = { x: 1200, y: 750 };
      ordinary.follow(point, HEART_WORLD, { snap: true });
      optIn.follow(point, HEART_WORLD, { minimumScale: COMPACT_COMBAT_MINIMUM_SCALE, snap: true });
      expect(optIn.scale).toBe(ordinary.scale); expect(optIn.worldToScreen(point)).toEqual(ordinary.worldToScreen(point));
    }
    const training = new Camera(1440, 900);
    training.follow({ x: 330, y: 440 }, WORLD);
    expect(training.scale).toBe(1); expect(training.worldToScreen({ x: 0, y: 0 })).toEqual({ x: 120, y: 150 });
  });
});
