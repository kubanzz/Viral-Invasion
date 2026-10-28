import type { GameState, Vec } from '../game/types';
import { SPRITE_Y_SCALE, type VisualBounds } from './raisedObstacleGeometry';

/** Minimum atlas metadata needed for geometry, independent of Phaser or image loading. */
export interface SpriteGeometryAsset {
  width: number;
  height: number;
  pivot: { x: number; y: number };
  visibleBounds: { x: number; y: number; width: number; height: number };
}

export interface SourceRegisteredSpriteAsset extends SpriteGeometryAsset {
  sourceSize?: { width: number; height: number };
  sourceBounds?: { x?: number; y?: number; width?: number; height: number };
  sourceMuzzle?: Vec;
}
export interface RegisteredSpriteLayout {
  width: number; height: number; originX: number; originY: number;
  /** Upright local envelope around the shared source anchor, before live lift. */
  bounds: VisualBounds;
}
export interface AimedPaintedTool {
  layout: RegisteredSpriteLayout; angle: number; flipY: boolean;
  /** Grip and bounds use projected world coordinates; Y is already multiplied by SPRITE_Y_SCALE. */
  grip: Vec; bounds: VisualBounds; sourceGrip: Vec; sourceScale: number;
}

/**
 * Restores an authored shared canvas after independent atlas trims/resizes.
 * Source X/Y scales undo integer resize rounding; the common anchor supplies
 * exact subpixel registration instead of re-centring each layer on its alpha.
 */
export function sourceRegisteredSpriteLayout(asset: SourceRegisteredSpriteAsset, canvas: { width: number; height: number },
  anchor: Vec, sourceScale: number): RegisteredSpriteLayout | undefined {
  const source = asset.sourceBounds, visible = asset.visibleBounds;
  if (!asset.sourceSize || asset.sourceSize.width !== canvas.width || asset.sourceSize.height !== canvas.height || !source) return;
  const { x, y, width, height } = source;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number') return;
  if (![x, y, width, height, asset.width, asset.height, visible.x, visible.y, visible.width, visible.height,
    asset.pivot.x, asset.pivot.y, anchor.x, anchor.y, sourceScale].every(Number.isFinite)
    || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > canvas.width || y + height > canvas.height
    || visible.width <= 0 || visible.height <= 0 || asset.width <= 0 || asset.height <= 0 || sourceScale <= 0) return;
  const sourcePerX = width / visible.width, sourcePerY = height / visible.height;
  const inferredX = x + (asset.pivot.x * asset.width - visible.x) * sourcePerX;
  const inferredY = y + (asset.pivot.y * asset.height - visible.y) * sourcePerY;
  // art-sync rounds its content offset to an atlas pixel. Permit that known
  // quantization only; a different authored foot anchor cannot silently align.
  if (Math.abs(inferredX - anchor.x) > sourcePerX * .51 + 1e-6 || Math.abs(inferredY - anchor.y) > sourcePerY * .51 + 1e-6) return;
  const padding = 2;
  return {
    width: asset.width * sourcePerX * sourceScale, height: asset.height * sourcePerY * sourceScale,
    originX: (visible.x + (anchor.x - x) / sourcePerX) / asset.width,
    originY: (visible.y + (anchor.y - y) / sourcePerY) / asset.height,
    bounds: { left: (x - anchor.x) * sourceScale - padding, right: (x + width - anchor.x) * sourceScale + padding,
      top: (y - anchor.y) * sourceScale - padding, bottom: (y + height - anchor.y) * sourceScale + padding },
  };
}

/** The same registered frame envelope used by native sprites, including reflection and live lift. */
export function registeredSpriteBodyBounds(layout: RegisteredSpriteLayout, point: Vec, flipX = false, lift = 0): VisualBounds {
  const b = layout.bounds;
  return { left: point.x + (flipX ? -b.right : b.left), right: point.x + (flipX ? -b.left : b.right),
    top: point.y * SPRITE_Y_SCALE + b.top + lift, bottom: point.y * SPRITE_Y_SCALE + b.bottom + lift };
}

/** A +X authored tool rotates at its inspected grip, with upright art on both aim half-planes. */
export function aimedPaintedTool(asset: SourceRegisteredSpriteAsset, point: Vec, facing: number, lift = 0): AimedPaintedTool | undefined {
  const source = asset.sourceBounds, canvas = asset.sourceSize, v = asset.visibleBounds;
  if (!source || !canvas || typeof source.x !== 'number' || typeof source.y !== 'number' || typeof source.width !== 'number'
    || ![canvas.width, canvas.height, source.width, source.height, facing, lift].every(Number.isFinite)
    || canvas.width <= 0 || canvas.height <= 0 || source.width <= 0 || source.height <= 0 || v.width <= 0 || v.height <= 0) return;
  // Source pivotSource was the human-inspected grip. Recover its atlas anchor;
  // any remaining source-pixel rounding is checked again with the final image.
  const sourceGrip = { x: source.x + (asset.pivot.x * asset.width - v.x) * source.width / v.width,
    y: source.y + (asset.pivot.y * asset.height - v.y) * source.height / v.height };
  if (![sourceGrip.x, sourceGrip.y].every(Number.isFinite) || sourceGrip.x < 0 || sourceGrip.x > canvas.width || sourceGrip.y < 0 || sourceGrip.y > canvas.height) return;
  const sourceScale = 36 / source.width;
  const layout = sourceRegisteredSpriteLayout(asset, canvas, sourceGrip, sourceScale); if (!layout) return;
  const angle = Math.atan2(Math.sin(facing) * SPRITE_Y_SCALE, Math.cos(facing)), cos = Math.cos(angle), sin = Math.sin(angle), flipY = Math.cos(facing) < 0;
  const grip = { x: point.x + cos * 20, y: point.y * SPRITE_Y_SCALE - 30 + lift + sin * 20 }, b = layout.bounds;
  const corners = [b.left, b.right].flatMap(x => [b.top, b.bottom].map(rawY => {
    const y = flipY ? -rawY : rawY;
    return { x: grip.x + x * cos - y * sin, y: grip.y + x * sin + y * cos };
  }));
  return { layout, angle, flipY, grip, sourceGrip, sourceScale,
    bounds: { left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)),
      top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)) } };
}

/** The same pose decision must drive the displayed sprite and its occlusion envelope. */
export function heroArtPose(state: Pick<GameState, 'player' | 'elapsed' | 'tool'>): { id: string; flipX: boolean } {
  const player = state.player;
  // The action candidates contain a second, elevated weapon/beam. Keep the
  // clean body with the sole independently aimed tool and real hit feedback.
  return { id: player.moving ? 'hero.walk' : 'hero.idle', flipX: Math.cos(player.facing) < 0 };
}

/** Alpha envelope in projected world space. Upright art itself is never Y-compressed. */
export function spriteBodyBounds(asset: SpriteGeometryAsset, point: Vec, height: number, flipX = false): VisualBounds {
  const visible = asset.visibleBounds, factor = height / visible.height;
  const rawLeft = (visible.x - asset.pivot.x * asset.width) * factor;
  const rawRight = (visible.x + visible.width - asset.pivot.x * asset.width) * factor;
  const padding = 2;
  return {
    left: point.x + (flipX ? -rawRight : rawLeft) - padding,
    right: point.x + (flipX ? -rawLeft : rawRight) + padding,
    top: point.y * SPRITE_Y_SCALE + (visible.y - asset.pivot.y * asset.height) * factor - padding,
    bottom: point.y * SPRITE_Y_SCALE + (visible.y + visible.height - asset.pivot.y * asset.height) * factor + padding,
  };
}

/** The inspected source point follows exactly the same grip, flip and rotation as the native tool. */
export function paintedToolMuzzle(asset: SourceRegisteredSpriteAsset, tool: AimedPaintedTool): Vec | undefined {
  const muzzle = asset.sourceMuzzle, canvas = asset.sourceSize;
  if (!muzzle || !canvas || ![muzzle.x, muzzle.y].every(Number.isFinite) || muzzle.x < 0 || muzzle.x > canvas.width || muzzle.y < 0 || muzzle.y > canvas.height) return;
  const x = (muzzle.x - tool.sourceGrip.x) * tool.sourceScale;
  const y = (muzzle.y - tool.sourceGrip.y) * tool.sourceScale * (tool.flipY ? -1 : 1);
  return { x: tool.grip.x + x * Math.cos(tool.angle) - y * Math.sin(tool.angle),
    y: tool.grip.y + x * Math.sin(tool.angle) + y * Math.cos(tool.angle) };
}
