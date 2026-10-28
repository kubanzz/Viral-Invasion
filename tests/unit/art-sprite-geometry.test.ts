import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { Camera } from '../../src/render/camera';
import { heroArtPose, spriteBodyBounds, type SpriteGeometryAsset } from '../../src/render/spriteGeometry';

const runtime = JSON.parse(readFileSync(new URL('../../.art-generated/art-runtime.json', import.meta.url), 'utf8')) as {
  assets: Record<string, SpriteGeometryAsset>;
};

describe('native atlas body geometry', () => {
  it.each([1, 2, 3] as const)('keeps a clean body for tool %i throughout horizontal/vertical fire and movement', tool => {
    const state = new GameSession(17).state;
    state.elapsed = 5;
    state.player.actionUntil = 6;
    state.tool = tool;
    for (const facing of [0, Math.PI, .3, Math.PI / 2, -Math.PI / 2]) {
      state.player.facing = facing;
      for (const moving of [false, true]) {
        state.player.moving = moving;
        const before = JSON.stringify(state);
        expect(heroArtPose(state)).toEqual({ id: moving ? 'hero.walk' : 'hero.idle', flipX: Math.cos(facing) < 0 });
        expect(JSON.stringify(state)).toBe(before);
      }
    }
    state.player.actionUntil = state.elapsed;
    state.player.moving = false;
    expect(heroArtPose(state).id).toBe('hero.idle');
  });

  it('reflects an asymmetric candidate frame around its feet without reusing idle bounds', () => {
    const point = { x: 330, y: 440 }, shot = runtime.assets['hero.shot'];
    const right = spriteBodyBounds(shot, point, 86);
    const left = spriteBodyBounds(shot, point, 86, true);
    const idle = spriteBodyBounds(runtime.assets['hero.idle'], point, 86);
    expect(right.right - point.x).toBeGreaterThan(point.x - right.left);
    expect(right.right - point.x).toBeGreaterThan(idle.right - point.x + 15);
    expect(point.x - left.left).toBeCloseTo(right.right - point.x, 9);
    expect(left.right - point.x).toBeCloseTo(point.x - right.left, 9);
    expect(left.top).toBe(right.top);
    expect(left.bottom).toBe(right.bottom);
  });

  it.each([
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1100, height: 560 },
  ])('encloses all displayed alpha corners at $width×$height using the same feet anchor as the camera', viewport => {
    const camera = new Camera(viewport.width, viewport.height), point = { x: 330, y: 440 };
    for (const id of ['hero.idle', 'hero.walk', 'hero.shot', 'hero.heal', 'enemy.carapace']) {
      const asset = runtime.assets[id], visible = asset.visibleBounds, height = 86;
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
        const anchorOffsetX = feet.x - point.x * camera.scale;
        const anchorOffsetY = feet.y - point.y * camera.yScale * camera.scale;
        expect(body.left * camera.scale + anchorOffsetX).toBeLessThanOrEqual(Math.min(...displayXs));
        expect(body.right * camera.scale + anchorOffsetX).toBeGreaterThanOrEqual(Math.max(...displayXs));
        expect(body.top * camera.scale + anchorOffsetY).toBeLessThanOrEqual(Math.min(...displayYs));
        expect(body.bottom * camera.scale + anchorOffsetY).toBeGreaterThanOrEqual(Math.max(...displayYs));
        expect(body.bottom - body.top).toBeCloseTo(height + 4, 9);
      }
    }
  });

  it('reads atlas and state metadata without modifying simulation positions, timers, or asset anchors', () => {
    const state = new GameSession(33).state, asset = runtime.assets['hero.shot'];
    const beforeState = JSON.stringify(state), beforeAsset = JSON.stringify(asset);
    for (let i = 0; i < 12; i++) {
      const pose = heroArtPose(state);
      spriteBodyBounds(asset, state.player, 86, pose.flipX);
    }
    expect(JSON.stringify(state)).toBe(beforeState);
    expect(JSON.stringify(asset)).toBe(beforeAsset);
  });
});
