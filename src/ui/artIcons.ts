export type ArtIconName = 'dash' | 'scan' | 'heal' | 'chain';
const iconNames: readonly ArtIconName[] = ['dash', 'scan', 'heal', 'chain'];
// Native 24-unit paths stay legible in the existing 16/18px boxes. Their
// meaning is also carried by visible text and keyboard hints beside each icon.
const paths: Record<ArtIconName, string> = {
  dash: '<path d="M3 8h7M2 12h5M3 16h7M12 5l8 7-8 7 3-7z"/>',
  scan: '<circle cx="12" cy="12" r="8"/><path d="M12 12l5-5M12 4v3M4 12h3M12 17v3M17 12h3"/><circle cx="12" cy="12" r="1.5" fill="#8eae91"/>',
  heal: '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z" fill="#bdd0ad"/>',
  chain: '<path d="M7 8l5 8 5-8"/><circle cx="6" cy="6" r="3" fill="#bdd0ad"/><circle cx="18" cy="6" r="3" fill="#bdd0ad"/><circle cx="12" cy="18" r="3" fill="#bdd0ad"/>',
};
const iconUri = (name: ArtIconName): string => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3c665b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`);

/** Cosmetic only: nearby visible labels and keyboard hints retain all meaning. */
export function artIconMarkup(name: ArtIconName): string {
  return `<span class="art-icon" data-art-icon="${name}" aria-hidden="true"></span>`;
}

/** Register code-native glyphs once; there is no dependency on an older art atlas. */
export function installArtIcons(document: Document): void {
  if (document.getElementById('viral-art-icon-styles')) return;
  const rules: string[] = [], variables: string[] = [];
  for (const name of iconNames) {
    const selectors = [`#app .art-icon[data-art-icon="${name}"]`];
    if (name === 'chain') selectors.push('#app .protocol-slot[data-protocol="PURIFY_CHAIN"] > span:first-child::before',
      '#app .growth-detail-card[data-protocol="PURIFY_CHAIN"] h3::before');
    variables.push(`--vi-icon-${name}-size:100% 100%`, `--vi-icon-${name}-position:center`);
    rules.push(`${selectors.join(',')}{background-image:url("${iconUri(name)}")}`);
  }
  const style = document.createElement('style');
  style.id = 'viral-art-icon-styles';
  style.textContent = `:root{${variables.join(';')}}${rules.join('')}`;
  document.head.append(style);
}
