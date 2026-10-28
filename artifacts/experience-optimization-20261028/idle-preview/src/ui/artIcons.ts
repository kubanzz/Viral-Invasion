import artRuntime from '../../.art-generated/art-runtime.json';

export type ArtIconName = 'dash' | 'scan' | 'heal' | 'chain';
const iconNames: readonly ArtIconName[] = ['dash', 'scan', 'heal', 'chain'];
interface IconRuntime {
  assets: Record<string, { atlas: string; frame: string }>;
  atlases: { key: string; dataUri: string; data: { meta: { size: { w: number; h: number } }; frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> } }[];
}

/** Cosmetic only: nearby visible labels and keyboard hints retain all meaning. */
export function artIconMarkup(name: ArtIconName): string {
  return `<span class="art-icon" data-art-icon="${name}" aria-hidden="true"></span>`;
}

/** Register each existing inline atlas once; CSS crops scale with the icon box. */
export function installArtIcons(document: Document): void {
  if (document.getElementById('viral-art-icon-styles')) return;
  const art = artRuntime as unknown as IconRuntime;
  const atlasRules = new Map<string, { dataUri: string; selectors: string[] }>();
  const variables: string[] = [];
  for (const name of iconNames) {
    const asset = art.assets[`icon.${name}`];
    const atlas = asset && art.atlases.find(atlas => atlas.key === asset.atlas);
    const frame = atlas?.data.frames[asset.frame]?.frame;
    if (!atlas || !frame || !atlas.dataUri.startsWith('data:image/')) continue;
    let atlasRule = atlasRules.get(atlas.key);
    if (!atlasRule) { atlasRule = { dataUri: atlas.dataUri, selectors: [] }; atlasRules.set(atlas.key, atlasRule); }
    if (name === 'chain') atlasRule.selectors.push('#app .protocol-slot[data-protocol="PURIFY_CHAIN"] > span:first-child::before',
      '#app .growth-detail-card[data-protocol="PURIFY_CHAIN"] h3::before');
    else atlasRule.selectors.push(`#app .art-icon[data-art-icon="${name}"]`);
    const size = atlas.data.meta.size;
    const x = size.w === frame.w ? 0 : frame.x / (size.w - frame.w) * 100;
    const y = size.h === frame.h ? 0 : frame.y / (size.h - frame.h) * 100;
    variables.push(`--vi-icon-${name}-size:${size.w / frame.w * 100}% ${size.h / frame.h * 100}%`,
      `--vi-icon-${name}-position:${x}% ${y}%`);
  }
  const style = document.createElement('style');
  style.id = 'viral-art-icon-styles';
  // Large data URIs must be direct declaration values: custom-property expansion
  // in Chromium rejects the multi-megabyte atlas even though the image itself loads.
  style.textContent = `:root{${variables.join(';')}}` + [...atlasRules.values()].map(rule =>
    `${rule.selectors.join(',')}{background-image:url("${rule.dataUri}")}`).join('');
  document.head.append(style);
}
