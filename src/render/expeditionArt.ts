import artRuntime from '../../.art-generated/art-runtime.json';
import { sourceRegisteredSpriteLayout, type RegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from './spriteGeometry';

export const EXPEDITION_ART_PREFIX = 'fantasy.expedition.';
export const EXPEDITION_ART_SPECS = {
  basePod: { width: 128, directional: false, clips: { construction: 3, ready: 2, load: 2, fire: 3 } },
  rapidPod: { width: 128, directional: false, clips: { construction: 3, ready: 2, load: 2, fire: 3 } },
  ritualMatron: { width: 148, directional: false, clips: { idle: 2, channel: 2, windup: 2, cast: 2, defeated: 2 } },
  ritualPriest: { width: 104, directional: true, clips: { idle: 2, channel: 2, windup: 2, cast: 2, defeated: 2 } },
  heartDevourer: { width: 224, directional: false, clips: { idle: 2, windup: 2, recovery: 2, phase2: 2 } },
  campTentWarehouse: { width: 144, directional: false, clips: { construction: 1, ready: 1 } },
  campForge: { width: 128, directional: false, clips: { construction: 1, ready: 1 } },
  campSupply: { width: 112, directional: false, clips: { construction: 1, ready: 1 } },
  campSortie: { width: 144, directional: false, clips: { construction: 1, ready: 1 } },
} as const;
export type ExpeditionArtIdentity = keyof typeof EXPEDITION_ART_SPECS;
export type ExpeditionArtDirection = 'fixed' | 'front_right' | 'back_right' | 'front_left' | 'back_left';
export interface ExpeditionSpriteAsset extends SourceRegisteredSpriteAsset {
  atlas?: string; frame?: string;
  animation?: { group: string; index: number; frameCount: number; fps: number; approved?: boolean };
  actorRegistration?: { canvas: { width: number; height: number }; foot: { x: number; y: number }; commonCanvasScale: number };
}
export interface ExpeditionFrameOptions {
  facing?: number; direction?: ExpeditionArtDirection; progress?: number; logicalWidth?: number;
  /** Only for an explicitly labelled source/render review fixture. */
  allowUnreviewed?: boolean;
}
export interface ExpeditionArtFrame {
  id: string; layout: RegisteredSpriteLayout; flipX: boolean; index: number; identity: ExpeditionArtIdentity; action: string; logicalWidth: number;
}
const oneShot = new Set(['construction', 'fire', 'windup', 'cast', 'defeated', 'recovery']);
/** No alpha-fit scaling: all frames share the registered 512 canvas and sole. */
export function sourceRegisteredSpriteFrame(assets: Readonly<Record<string, SourceRegisteredSpriteAsset>>, identity: ExpeditionArtIdentity,
  action: string, elapsed = 0, options: ExpeditionFrameOptions = {}): ExpeditionArtFrame | undefined {
  const definition = EXPEDITION_ART_SPECS[identity]; if (!definition) return;
  const registeredAssets = assets as Readonly<Record<string, ExpeditionSpriteAsset>>;
  const count = (definition.clips as Readonly<Record<string, number>>)[action]; if (!count) return;
  const facing = options.facing ?? 0;
  if (!Number.isFinite(facing) || options.progress !== undefined && !Number.isFinite(options.progress)) return;
  const requestedDirection = options.direction ?? (Math.sin(facing) < -.25 ? 'back_right' : 'front_right');
  const authored = definition.directional ? requestedDirection.replace('_left', '_right') : 'fixed';
  if (definition.directional && authored !== 'front_right' && authored !== 'back_right') return;
  const flipX = definition.directional && (requestedDirection.endsWith('_left') || options.direction === undefined && Math.cos(facing) < 0);
  const group = `${EXPEDITION_ART_PREFIX}${identity}.${authored}.${action}`;
  let fps: number | undefined;
  for (let i = 0; i < count; i++) {
    const id = `${group}.${String(i).padStart(2, '0')}`, asset = registeredAssets[id], animation = asset?.animation, registration = asset?.actorRegistration;
    if (!asset || !animation || animation.group !== group || animation.index !== i || animation.frameCount !== count
      || !Number.isFinite(animation.fps) || animation.fps <= 0 || fps !== undefined && animation.fps !== fps
      || !options.allowUnreviewed && animation.approved !== true
      || asset.sourceSize?.width !== 512 || asset.sourceSize.height !== 512
      || !registration || registration.canvas?.width !== 512 || registration.canvas?.height !== 512
      || !Number.isFinite(registration.foot?.x) || !Number.isFinite(registration.foot?.y)
      || Math.abs(registration.foot.x - 256) > 1e-6 || Math.abs(registration.foot.y - 435.2) > 1e-6 || registration.commonCanvasScale !== 1
      || !sourceRegisteredSpriteLayout(asset, { width: 512, height: 512 }, { x: 256, y: 435.2 }, 1)) return;
    fps = animation.fps;
  }
  const phase = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) * fps!;
  const index = options.progress !== undefined ? Math.max(0, Math.min(count - 1, Math.floor(Math.max(0, Math.min(1, options.progress)) * count)))
    : oneShot.has(action) ? Math.min(count - 1, Math.floor(phase)) : Math.floor(phase) % count;
  const id = `${group}.${String(index).padStart(2, '0')}`, asset = registeredAssets[id], logicalWidth = options.logicalWidth ?? definition.width;
  const layout = sourceRegisteredSpriteLayout(asset, { width: 512, height: 512 }, { x: 256, y: 435.2 }, logicalWidth / 512);
  return layout ? { id, layout, flipX, index, identity, action, logicalWidth } : undefined;
}

export const EXPEDITION_ICON_IDS: Readonly<Record<string, string>> = {
  warehouse: `${EXPEDITION_ART_PREFIX}campTentWarehouse.fixed.ready.00`,
  forge: `${EXPEDITION_ART_PREFIX}campForge.fixed.ready.00`,
  shop: `${EXPEDITION_ART_PREFIX}campSupply.fixed.ready.00`,
  supply: `${EXPEDITION_ART_PREFIX}campSupply.fixed.ready.00`,
  departure: `${EXPEDITION_ART_PREFIX}campSortie.fixed.ready.00`,
  deploy: `${EXPEDITION_ART_PREFIX}campSortie.fixed.ready.00`,
  'weapon-steady': 'fantasy.weapon.steady.held',
  'weapon-steady-broken': 'fantasy.weapon.steady.held',
  'weapon-piercing': 'fantasy.weapon.piercing.held',
  'weapon-piercing-broken': 'fantasy.weapon.piercing.held',
  'blueprint-launch-pod': `${EXPEDITION_ART_PREFIX}blueprintBasePod.fixed.ready.00`,
  'blueprint-rapid-launch-pod': `${EXPEDITION_ART_PREFIX}blueprintRapidPod.fixed.ready.00`,
  biomass: `${EXPEDITION_ART_PREFIX}repairBiomass.fixed.ready.00`,
  loot: `${EXPEDITION_ART_PREFIX}lootBag.fixed.ready.00`,
};
interface AtlasFrame { frame: { x: number; y: number; w: number; h: number } }
export interface ExpeditionIconRuntime {
  inputSignature?: string;
  assets: Readonly<Record<string, { atlas?: string; frame?: string; animation?: { approved?: boolean } }>>;
  atlases: readonly { key: string; dataUri: string; data: { frames?: Record<string, AtlasFrame>; meta?: { size?: { w: number; h: number } } } }[];
}
/** Reuses actual generated atlas bytes. Missing/unreviewed art retains the code-native glyph. */
export function expeditionIconStyles(runtime: ExpeditionIconRuntime): { css: string; installed: string[] } {
  const rules: string[] = [], installed: string[] = [];
  const atlasRules = new Map<string, { uri: string; selectors: string[] }>();
  for (const [name, id] of Object.entries(EXPEDITION_ICON_IDS)) {
    const asset = runtime.assets[id]; if (!asset?.atlas || asset.animation?.approved !== true) continue;
    const atlas = runtime.atlases.find(a => a.key === asset.atlas), frame = atlas?.data.frames?.[asset.frame ?? id]?.frame, size = atlas?.data.meta?.size;
    if (!atlas?.dataUri.startsWith('data:image/png;base64,') || !frame || !size || ![frame.x, frame.y, frame.w, frame.h, size.w, size.h].every(Number.isFinite)
      || frame.w <= 0 || frame.h <= 0 || frame.x < 0 || frame.y < 0 || frame.x + frame.w > size.w || frame.y + frame.h > size.h) continue;
    const selector = `#app [data-camp-art="${name}"]`;
    const x = size.w > frame.w ? frame.x / (size.w - frame.w) * 100 : 0, y = size.h > frame.h ? frame.y / (size.h - frame.h) * 100 : 0;
    const grouped = atlasRules.get(atlas.key) ?? { uri: atlas.dataUri, selectors: [] }; grouped.selectors.push(selector); atlasRules.set(atlas.key, grouped);
    rules.push(`${selector}{background-color:transparent;background-size:${size.w / frame.w * 100}% ${size.h / frame.h * 100}%;background-position:${x}% ${y}%;background-repeat:no-repeat;border:0;box-shadow:none;transform:none}${selector}::before,${selector}::after{display:none}`);
    installed.push(name);
  }
  const images = [...atlasRules.values()].map(group => `${group.selectors.join(',')}{background-image:url("${group.uri}")}`);
  return { css: [...images, ...rules].join('\n'), installed };
}
export function installExpeditionArtIcons(document: Document, runtime: ExpeditionIconRuntime = artRuntime as unknown as ExpeditionIconRuntime): string[] {
  const { css, installed } = expeditionIconStyles(runtime);
  if (!installed.length) return [];
  let style = document.getElementById('viral-expedition-art-icon-styles') as HTMLStyleElement | null;
  if (!style) { style = document.createElement('style'); style.id = 'viral-expedition-art-icon-styles'; document.head.append(style); }
  style.textContent = css; return installed;
}
