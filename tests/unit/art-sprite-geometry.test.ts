import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { Camera } from '../../src/render/camera';
import { spriteBodyBounds, type SpriteGeometryAsset } from '../../src/render/spriteGeometry';

// Deliberately independent geometry descriptions. They are neither production
// actor IDs nor an assertion that any PNG/group has passed art review. Actual
// production registration is covered by camera-skill-framing/native acceptance.
const fixtures: Record<string, SpriteGeometryAsset> = {
  rest: { width: 240, height: 320, pivot: { x: .375, y: .875 }, visibleBounds: { x: 44, y: 48, width: 128, height: 232 } },
  reaching: { width: 300, height: 360, pivot: { x: .32, y: .9 }, visibleBounds: { x: 60, y: 38, width: 208, height: 286 } },
  lowerOverhang: { width: 256, height: 288, pivot: { x: .61, y: .83 }, visibleBounds: { x: 28, y: 14, width: 166, height: 250 } },
};
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value); for (const child of Object.values(value)) freeze(child);
}
freeze(fixtures);

describe('spriteBodyBounds independent registered geometry', () => {
  it.each([32, 86, 144])('preserves upright alpha height and fixed world padding at height %i', height => {
    const point = { x: 330, y: 440 };
    for (const asset of Object.values(fixtures)) for (const flipX of [false, true]) {
      const body = spriteBodyBounds(asset, point, height, flipX), twice = spriteBodyBounds(asset, point, height * 2, flipX);
      expect(body.bottom - body.top).toBeCloseTo(height + 4, 9);
      expect((twice.right - twice.left - 4) / (body.right - body.left - 4)).toBeCloseTo(2, 9);
      expect((twice.bottom - twice.top - 4) / (body.bottom - body.top - 4)).toBeCloseTo(2, 9);
      expect(body.left).toBeLessThanOrEqual(point.x); expect(body.right).toBeGreaterThanOrEqual(point.x);
      expect(body.top).toBeLessThanOrEqual(point.y * .72); expect(body.bottom).toBeGreaterThanOrEqual(point.y * .72);
    }
  });

  it('reflects a deliberately asymmetric alpha envelope around its registered feet without reusing another pose', () => {
    const point = { x: 330, y: 440 }, right = spriteBodyBounds(fixtures.reaching, point, 86);
    const left = spriteBodyBounds(fixtures.reaching, point, 86, true), rest = spriteBodyBounds(fixtures.rest, point, 86);
    // The reaching fixture has foot=(96,324), alpha=(60,38)..(268,324).
    // Its literal source distances are 36 left,172 right,286 above and0 below.
    expect(right.left).toBeCloseTo(330 - 36 * 86 / 286 - 2, 9);
    expect(right.right).toBeCloseTo(330 + 172 * 86 / 286 + 2, 9);
    expect(right.top).toBeCloseTo(440 * .72 - 86 - 2, 9);
    expect(right.bottom).toBeCloseTo(440 * .72 + 2, 9);
    expect(right.right - point.x).toBeGreaterThan(point.x - right.left);
    expect(right.right - point.x).toBeGreaterThan(rest.right - point.x + 15);
    expect(point.x - left.left).toBeCloseTo(right.right - point.x, 9);
    expect(left.right - point.x).toBeCloseTo(point.x - right.left, 9);
    expect(left.top).toBe(right.top);
    expect(left.bottom).toBe(right.bottom);
  });

  it('keeps lower alpha overhang below the declared foot instead of recentering or fitting it to the alpha bottom', () => {
    const point = { x: 330, y: 440 }, asset = fixtures.lowerOverhang;
    const right = spriteBodyBounds(asset, point, 86), left = spriteBodyBounds(asset, point, 86, true);
    // FootY=.83*288=239.04; the alpha bottom264 remains24.96 source pixels below it.
    expect(right.bottom - point.y * .72).toBeCloseTo(24.96 * 86 / 250 + 2, 9);
    expect(left.bottom).toBe(right.bottom);
    expect(point.x - right.left).toBeGreaterThan(right.right - point.x);
    expect(point.x - left.left).toBeCloseTo(right.right - point.x, 9);
  });

  it.each([
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1100, height: 560 },
  ])('encloses all displayed alpha corners at $width×$height using the same feet anchor as the camera', viewport => {
    const camera = new Camera(viewport.width, viewport.height), point = { x: 330, y: 440 };
    for (const asset of Object.values(fixtures)) {
      const visible = asset.visibleBounds, height = 86;
      const factor = height / visible.height, feet = camera.worldToScreen(point);
      for (const flipX of [false, true]) {
        const body = spriteBodyBounds(asset, point, height, flipX);
        // Reconstruct sprite vertices from its displayed canvas and pivot, independently
        // of the alpha-envelope helper. Sprite reflection preserves the same ground foot.
        const originX = flipX ? 1 - asset.pivot.x : asset.pivot.x;
        const sourceXs = [visible.x, visible.x + visible.width].map(x => flipX ? asset.width - x : x);
        const sourceYs = [visible.y, visible.y + visible.height];
        const displayXs = sourceXs.map(x => feet.x + (x - originX * asset.width) * factor * camera.scale);
        const displayYs = sourceYs.map(y => feet.y + (y - asset.pivot.y * asset.height) * factor * camera.scale);
        const footSourceX = flipX ? asset.width - asset.pivot.x * asset.width : asset.pivot.x * asset.width;
        const displayedFoot = { x: feet.x + (footSourceX - originX * asset.width) * factor * camera.scale,
          y: feet.y + (asset.pivot.y * asset.height - asset.pivot.y * asset.height) * factor * camera.scale };
        expect(displayedFoot.x).toBeCloseTo(feet.x, 9); expect(displayedFoot.y).toBeCloseTo(feet.y, 9);
        const anchorOffsetX = feet.x - point.x * camera.scale;
        const anchorOffsetY = feet.y - point.y * camera.yScale * camera.scale;
        expect(body.left * camera.scale + anchorOffsetX).toBeLessThanOrEqual(Math.min(...displayXs));
        expect(body.right * camera.scale + anchorOffsetX).toBeGreaterThanOrEqual(Math.max(...displayXs));
        expect(body.top * camera.scale + anchorOffsetY).toBeLessThanOrEqual(Math.min(...displayYs));
        expect(body.bottom * camera.scale + anchorOffsetY).toBeGreaterThanOrEqual(Math.max(...displayYs));
        expect(Math.min(...displayXs) - (body.left * camera.scale + anchorOffsetX)).toBeCloseTo(2 * camera.scale, 9);
        expect(body.right * camera.scale + anchorOffsetX - Math.max(...displayXs)).toBeCloseTo(2 * camera.scale, 9);
        expect(Math.min(...displayYs) - (body.top * camera.scale + anchorOffsetY)).toBeCloseTo(2 * camera.scale, 9);
        expect(body.bottom * camera.scale + anchorOffsetY - Math.max(...displayYs)).toBeCloseTo(2 * camera.scale, 9);
        expect(body.bottom - body.top).toBeCloseTo(height + 4, 9);
      }
    }
  });

  it('reads frozen geometry and the real state player reference without modifying the complete simulation or any source anchors', () => {
    const state = new GameSession(33).state;
    state.elapsed = 5; state.player.actionUntil = 6;
    const beforeState = JSON.stringify(state), beforeAssets = JSON.stringify(fixtures);
    freeze(state);
    for (const asset of Object.values(fixtures)) for (const height of [32, 86, 144]) for (const flipX of [false, true]) spriteBodyBounds(asset, state.player, height, flipX);
    expect(JSON.stringify(state)).toBe(beforeState);
    expect(JSON.stringify(fixtures)).toBe(beforeAssets);
  });
});
