import { describe, expect, it } from 'vitest';
import { Camera } from '../../src/render/camera';
import { depthSort } from '../../src/render/depthSort';
import { foregroundOpacity, isForegroundOccluded } from '../../src/render/occlusion';
import { WORLD } from '../../src/game/types';

describe('render coordinates and depth contracts', () => {
  it.each([
    { width: 1366, height: 768, dpr: 1 },
    { width: 1920, height: 1080, dpr: 2 },
    { width: 1024, height: 768, dpr: 2 },
    { width: 1093, height: 614, dpr: 1.25 },
  ])('round-trips CSS pointer positions at $width×$height DPR $dpr', ({ width, height, dpr }) => {
    const camera = new Camera(width, height);
    const points = [{ x: 65, y: 110 }, { x: 330, y: 440 }, { x: 590, y: 330 }, { x: 780, y: 610 }, { x: 1135, y: 735 }];
    for (const point of points) {
      const screen = camera.worldToScreen(point);
      expect(screen.x).toBeGreaterThanOrEqual(0);
      expect(screen.x).toBeLessThanOrEqual(width);
      expect(screen.y).toBeGreaterThanOrEqual(0);
      expect(screen.y).toBeLessThanOrEqual(height);
      const recovered = camera.screenToWorld(screen);
      expect(recovered.x).toBeCloseTo(point.x, 9);
      expect(recovered.y).toBeCloseTo(point.y, 9);
      // Backing pixels scale with DPR; DOM pointers and camera remain CSS pixels.
      const backing = { x: screen.x * dpr, y: screen.y * dpr };
      const pointer = camera.screenToWorld({ x: backing.x / dpr, y: backing.y / dpr });
      expect(pointer.x).toBeCloseTo(point.x, 9);
      expect(pointer.y).toBeCloseTo(point.y, 9);
    }
  });

  it('projects the same ground plane after resize and applies that projection to canvas', () => {
    const camera = new Camera(1440, 900);
    expect(camera.worldToScreen({ x: 0, y: 0 })).toEqual({ x: 120, y: 150 });
    const horizontal = camera.worldToScreen({ x: 100, y: 0 });
    const vertical = camera.worldToScreen({ x: 0, y: 100 });
    expect(horizontal.x - 120).toBe(100);
    expect(vertical.y - 150).toBe(72);
    camera.resize(1920, 1080);
    const calls: unknown[][] = [];
    const ctx = {
      translate: (x: number, y: number) => calls.push(['translate', x, y]),
      scale: (x: number, y: number) => calls.push(['scale', x, y]),
    } as unknown as CanvasRenderingContext2D;
    camera.apply(ctx);
    const origin = camera.worldToScreen({ x: 0, y: 0 });
    expect(calls).toEqual([['translate', origin.x, origin.y], ['scale', camera.scale, camera.scale * .72]]);
    const point = camera.screenToWorld(camera.worldToScreen({ x: 400, y: 300 }));
    expect(point.x).toBeCloseTo(400);
    expect(point.y).toBeCloseTo(300);
  });

  it('sorts by foot anchors, preserves ties and leaves input unchanged', () => {
    const entities = [
      { id: 'front-player', y: 440, visualTop: 370 },
      { id: 'back-target', y: 410, visualTop: 385 },
      { id: 'same-y-first', y: 430, visualTop: 100 },
      { id: 'same-y-second', y: 430, visualTop: 420 },
    ];
    const original = entities.map(entity => entity.id);
    expect(depthSort(entities).map(entity => entity.id)).toEqual(['back-target', 'same-y-first', 'same-y-second', 'front-player']);
    expect(entities.map(entity => entity.id)).toEqual(original);
    expect(depthSort([])).toEqual([]);
    entities[0].y = 400;
    expect(depthSort(entities)[0].id).toBe('front-player');
  });

  it('fades decorative foreground at inclusive head/foot safety boundaries', () => {
    const foreground = WORLD.foreground;
    const left = foreground.x - 22;
    const right = foreground.x + foreground.width + 22;
    const top = foreground.y - 40;
    const bottom = foreground.y + foreground.height + 36;
    for (const point of [{ x: left, y: top }, { x: right, y: bottom }, { x: 250, y: 610 }]) {
      expect(isForegroundOccluded(point)).toBe(true);
      expect(foregroundOpacity(point)).toBe(.23);
    }
    for (const point of [{ x: left - .01, y: 610 }, { x: right + .01, y: 610 }, { x: 250, y: top - .01 }, { x: 250, y: bottom + .01 }]) {
      expect(isForegroundOccluded(point)).toBe(false);
      expect(foregroundOpacity(point)).toBe(.94);
    }
  });
});
