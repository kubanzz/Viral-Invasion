import { describe, expect, it } from 'vitest';
import { aimedPaintedTool, paintedToolMuzzle, type AimedPaintedTool, type SourceRegisteredSpriteAsset } from '../../src/render/spriteGeometry';
import { fixturePaintedToolAsset, PAINTED_TOOL_FIXTURE_GRIP } from '../fixtures/paintedToolAsset';

function worldPoint(tool: AimedPaintedTool, asset: SourceRegisteredSpriteAsset, source: { x: number; y: number }) {
  const b = asset.sourceBounds!, v = asset.visibleBounds, layout = tool.layout;
  const x = v.x + (source.x - b.x!) * v.width / b.width!, rawY = v.y + (source.y - b.y!) * v.height / b.height;
  const originY = tool.flipY ? 1 - layout.originY : layout.originY;
  const px = (x / asset.width - layout.originX) * layout.width;
  const py = ((tool.flipY ? asset.height - rawY : rawY) / asset.height - originY) * layout.height;
  return { x: tool.grip.x + px * Math.cos(tool.angle) - py * Math.sin(tool.angle),
    y: tool.grip.y + px * Math.sin(tool.angle) + py * Math.cos(tool.angle) };
}

describe('independently aimed painted tool geometry', () => {
  it.each([0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4, Math.PI, -Math.PI * 3 / 4, -Math.PI / 2, -Math.PI / 4])
  ('keeps the same grip and +X barrel axis for facing %s without upside-down left aiming', facing => {
    const asset = fixturePaintedToolAsset(), before = JSON.stringify(asset), point = { x: 500, y: 400 }, tool = aimedPaintedTool(asset, point, facing, -1)!;
    expect(tool).toBeDefined(); expect(tool.sourceGrip).toEqual(PAINTED_TOOL_FIXTURE_GRIP);
    expect(tool.angle).toBeCloseTo(Math.atan2(Math.sin(facing) * .72, Math.cos(facing)), 10);
    expect(tool.flipY).toBe(Math.cos(facing) < 0);
    const grip = worldPoint(tool, asset, PAINTED_TOOL_FIXTURE_GRIP);
    expect(grip.x).toBeCloseTo(tool.grip.x, 10); expect(grip.y).toBeCloseTo(tool.grip.y, 10);
    const forward = worldPoint(tool, asset, { x: PAINTED_TOOL_FIXTURE_GRIP.x + 100, y: PAINTED_TOOL_FIXTURE_GRIP.y });
    expect(Math.atan2(forward.y - grip.y, forward.x - grip.x)).toBeCloseTo(tool.angle, 10);
    const top = worldPoint(tool, asset, { x: PAINTED_TOOL_FIXTURE_GRIP.x, y: PAINTED_TOOL_FIXTURE_GRIP.y - 30 });
    expect(top.y - grip.y).toBeLessThanOrEqual(1e-9);
    const muzzle = paintedToolMuzzle(asset, tool)!;
    const drawnMuzzle = worldPoint(tool, asset, asset.sourceMuzzle!);
    expect(muzzle.x).toBeCloseTo(drawnMuzzle.x, 10); expect(muzzle.y).toBeCloseTo(drawnMuzzle.y, 10);
    // The handle offset does not pre-rotate the +X barrel to the diagonal grip-to-muzzle vector.
    expect(tool.angle).toBeCloseTo(Math.atan2(Math.sin(facing) * .72, Math.cos(facing)), 10);
    expect(Math.hypot(tool.grip.x - point.x, tool.grip.y - (point.y * .72 - 31))).toBeCloseTo(20);
    const b = asset.sourceBounds!;
    const corners = [b.x!, b.x! + b.width!].flatMap(x => [b.y!, b.y! + b.height].map(y => worldPoint(tool, asset, { x, y })));
    expect(tool.bounds.left).toBeLessThanOrEqual(Math.min(...corners.map(p => p.x)));
    expect(tool.bounds.right).toBeGreaterThanOrEqual(Math.max(...corners.map(p => p.x)));
    expect(tool.bounds.top).toBeLessThanOrEqual(Math.min(...corners.map(p => p.y)));
    expect(tool.bounds.bottom).toBeGreaterThanOrEqual(Math.max(...corners.map(p => p.y)));
    expect(JSON.stringify(asset)).toBe(before);
  });

  it('refuses incomplete source geometry or a grip outside the real source canvas', () => {
    for (const mutate of [
      (asset: SourceRegisteredSpriteAsset) => { delete asset.sourceBounds; },
      (asset: SourceRegisteredSpriteAsset) => { delete asset.sourceBounds!.width; },
      (asset: SourceRegisteredSpriteAsset) => { asset.sourceSize!.width = 0; },
      (asset: SourceRegisteredSpriteAsset) => { asset.pivot.x = -5; },
      (asset: SourceRegisteredSpriteAsset) => { asset.visibleBounds.width = 0; },
    ]) {
      const asset = fixturePaintedToolAsset(); mutate(asset);
      expect(aimedPaintedTool(asset, { x: 500, y: 400 }, .5)).toBeUndefined();
    }
  });

  it('leaves muzzle registration unavailable for missing, nonfinite or out-of-canvas source points', () => {
    for (const muzzle of [undefined, { x: NaN, y: 180 }, { x: -1, y: 180 }, { x: 1025, y: 180 }, { x: 810, y: 513 }]) {
      const asset = fixturePaintedToolAsset(), tool = aimedPaintedTool(asset, { x: 500, y: 400 }, .5)!;
      asset.sourceMuzzle = muzzle; expect(paintedToolMuzzle(asset, tool)).toBeUndefined();
    }
  });
});
