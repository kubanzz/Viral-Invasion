import type { SourceRegisteredSpriteAsset } from '../../src/render/spriteGeometry';

export const PAINTED_TOOL_FIXTURE_GRIP = { x: 360, y: 320 } as const;
export function fixturePaintedToolAsset(): SourceRegisteredSpriteAsset & { atlas: string; frame: string; flags: string[]; status: string; aliasOf?: string } {
  return { atlas: 'painted-tool-test-atlas', frame: 'weapon.emitter.painted', width: 256, height: 128,
    visibleBounds: { x: 12, y: 11, width: 195, height: 78 },
    pivot: { x: 60 / 256, y: 71 / 128 },
    sourceSize: { width: 1024, height: 512 }, sourceBounds: { x: 200, y: 120, width: 650, height: 260 }, sourceMuzzle: { x: 810, y: 180 },
    flags: ['synthetic-test-geometry'], status: 'test-only' };
}
