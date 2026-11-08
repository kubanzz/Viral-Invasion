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
const effectImages = new Map<string, HTMLCanvasElement>();

function atlasImage(atlas: Atlas): HTMLImageElement | undefined {
  let image = images.get(atlas.key);
  if (!image) { image = new Image(); image.src = atlas.dataUri; images.set(atlas.key, image); }
  return image.complete && image.naturalWidth > 0 ? image : undefined;
}

/** Decode a registered frame once so trial effects share the battlefield PNGs. */
export function campWeaponEffectImage(id: string): CanvasImageSource | undefined {
  const cached = effectImages.get(id); if (cached) return cached;
  const asset = runtime.assets[id], atlas = asset && runtime.atlases.find(item => item.key === asset.atlas);
  const frame = atlas?.data.frames[asset.frame]?.frame;
  if (!atlas || !frame) return;
  const image = atlasImage(atlas); if (!image) return;
  const canvas = document.createElement('canvas'); canvas.width = frame.w; canvas.height = frame.h;
  const context = canvas.getContext('2d'); if (!context) return;
  context.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  effectImages.set(id, canvas); return canvas;
}

/** Reuses the selected held PNG and its real grip, rather than a generic range gun. */
export function drawCampWeaponArt(ctx: CanvasRenderingContext2D, weaponId: WeaponId, grip: Vec): Vec | undefined {
  const definition = HELD_WEAPON_ART[weaponId], asset = runtime.assets[definition.id];
  const registration = asset && actorRegistration(asset as ActorAsset);
  const atlas = asset && runtime.atlases.find(item => item.key === asset.atlas), frame = atlas?.data.frames[asset.frame]?.frame;
  if (!registration?.grip || !registration.muzzle || asset.animation?.approved !== true || !atlas || !frame) return;
  const image = atlasImage(atlas); if (!image) return;
  const scale = definition.canvasHeight / registration.canvas.height * registration.commonCanvasScale;
  const layout = sourceRegisteredSpriteLayout(asset, registration.canvas, registration.grip, scale);
  if (!layout) return;
  ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, grip.x - layout.originX * layout.width,
    grip.y - layout.originY * layout.height, layout.width, layout.height);
  const sourceMuzzle = asset.sourceMuzzle ?? registration.muzzle;
  return { x: grip.x + (sourceMuzzle.x - registration.grip.x) * scale,
    y: grip.y + (sourceMuzzle.y - registration.grip.y) * scale };
}
