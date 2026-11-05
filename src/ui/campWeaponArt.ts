import artRuntime from '../../.art-generated/art-runtime.json';
import type { WeaponId } from '../game/expedition';
import type { Vec } from '../game/types';
import { HELD_WEAPON_ART } from '../render/weaponPresentation';
import { sourceRegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from '../render/spriteGeometry';
import { actorRegistration, type ActorAsset } from '../render/actorAnimation';

interface HeldAsset extends SourceRegisteredSpriteAsset {
  atlas: string; frame: string;
  actorRegistration: { canvas: { width: number; height: number }; foot: Vec; grip: Vec; muzzle: Vec; commonCanvasScale: number };
  animation?: { approved?: boolean };
}
interface Atlas { key: string; dataUri: string; data: { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> } }
const runtime = artRuntime as unknown as { assets: Record<string, HeldAsset>; atlases: Atlas[] };
const images = new Map<string, HTMLImageElement>();

/** Reuses the selected held PNG and its real grip, rather than a generic range gun. */
export function drawCampWeaponArt(ctx: CanvasRenderingContext2D, weaponId: WeaponId, grip: Vec): Vec | undefined {
  const definition = HELD_WEAPON_ART[weaponId], asset = runtime.assets[definition.id];
  const registration = asset && actorRegistration(asset as ActorAsset);
  const atlas = asset && runtime.atlases.find(item => item.key === asset.atlas), frame = atlas?.data.frames[asset.frame]?.frame;
  if (!registration?.grip || !registration.muzzle || asset.animation?.approved !== true || !atlas || !frame) return;
  let image = images.get(atlas.key);
  if (!image) { image = new Image(); image.src = atlas.dataUri; images.set(atlas.key, image); }
  if (!image.complete || image.naturalWidth === 0) return;
  const scale = definition.canvasHeight / registration.canvas.height * registration.commonCanvasScale;
  const layout = sourceRegisteredSpriteLayout(asset, registration.canvas, registration.grip, scale);
  if (!layout) return;
  ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, grip.x - layout.originX * layout.width,
    grip.y - layout.originY * layout.height, layout.width, layout.height);
  const sourceMuzzle = asset.sourceMuzzle ?? registration.muzzle;
  return { x: grip.x + (sourceMuzzle.x - registration.grip.x) * scale,
    y: grip.y + (sourceMuzzle.y - registration.grip.y) * scale };
}
