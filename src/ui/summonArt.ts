import artRuntime from '../../.art-generated/art-runtime.json';
import { EXPEDITION_ICON_IDS } from '../render/expeditionArt';

export interface SummonArtAsset {
  width?: number;
  height?: number;
  visibleBounds?: { x: number; y: number; width: number; height: number };
}
export interface SummonArtFit {
  width: number; height: number; left: number; top: number; fitted: boolean;
}

/** Percentages inside a square viewport, preserving the full frame's aspect. */
export function fitSummonArtBounds(asset?: SummonArtAsset | null): SummonArtFit {
  const frameWidth = asset?.width, frameHeight = asset?.height, bounds = asset?.visibleBounds;
  if (typeof frameWidth !== 'number' || typeof frameHeight !== 'number' || !bounds
    || ![frameWidth, frameHeight, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || frameWidth <= 0 || frameHeight <= 0 || bounds.width <= 0 || bounds.height <= 0
    || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > frameWidth || bounds.y + bounds.height > frameHeight)
    return { width: 100, height: 100, left: 0, top: 0, fitted: false };
  const scale = 100 / Math.max(bounds.width, bounds.height);
  const fit = { width: frameWidth * scale, height: frameHeight * scale,
    left: 50 - (bounds.x + bounds.width / 2) * scale,
    top: 50 - (bounds.y + bounds.height / 2) * scale, fitted: true };
  return [fit.width, fit.height, fit.left, fit.top].every(Number.isFinite) ? fit
    : { width: 100, height: 100, left: 0, top: 0, fitted: false };
}

const runtime = artRuntime as unknown as { assets: Record<string, SummonArtAsset> };
const escape = (value: string): string => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const percent = (value: number): string => `${Number(value.toFixed(5))}%`;

/** Fit selected visible pixels through frame sizing; the atlas and pixels stay intact. */
export function summonArtMarkup(name: string, className = ''): string {
  const heroName = `summon-hero-${name}`, hero = runtime.assets[EXPEDITION_ICON_IDS[heroName]];
  const selectedName = hero ? heroName : name;
  const fit = fitSummonArtBounds(hero ?? runtime.assets[EXPEDITION_ICON_IDS[name]]);
  return `<span class="summon-fitted-art${className ? ' ' + escape(className) : ''}" aria-hidden="true"><span data-camp-art="${escape(selectedName)}" style="position:absolute;width:${percent(fit.width)};height:${percent(fit.height)};left:${percent(fit.left)};top:${percent(fit.top)}"></span></span>`;
}
