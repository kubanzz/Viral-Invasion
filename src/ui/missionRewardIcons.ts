import type { TemplateId } from '../game/microfront';
import { isWeaponId } from '../game/expedition';

const glyph = (paths: string, className = ''): string => `<svg class="mission-reward-glyph ${className}" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${paths}</svg>`;

const modulePaths: Record<string, string> = {
  PULSE_BREAK: '<path d="M40 8 65 22 69 49 49 70 21 61 11 35Z" fill="#75cbb2" fill-opacity=".16" stroke="#83d9bd" stroke-width="2"/><path d="m40 19 17 10v21L40 61 23 50V29Z" fill="#254f50" stroke="#b4f0cd" stroke-width="2"/><path d="m40 25-6 13 9 2-7 16 15-20-10-1 5-10" fill="#e2f7c9"/><path d="m13 22 8 7m40 24 7 7M12 51l10-3m38-23 8-5" stroke="#a6e8d1" stroke-width="2" stroke-linecap="round"/>',
  PURIFY_CHAIN: '<path d="M40 9 65 24v31L40 70 15 55V24Z" fill="#75cbb2" fill-opacity=".12" stroke="#83d9bd" stroke-width="2"/><path d="m29 31 22 18M29 49l22-18" stroke="#d0f4dd" stroke-width="5"/><circle cx="26" cy="28" r="10" fill="#376d68" stroke="#b8efd4" stroke-width="2"/><circle cx="54" cy="52" r="10" fill="#376d68" stroke="#b8efd4" stroke-width="2"/><circle cx="26" cy="52" r="7" fill="#98d5bd"/><circle cx="54" cy="28" r="7" fill="#98d5bd"/><circle cx="26" cy="28" r="3" fill="#f2f5cf"/><circle cx="54" cy="52" r="3" fill="#f2f5cf"/>',
  IMMUNE_BEACON: '<path d="M40 8 65 23v27L40 71 15 50V23Z" fill="#75cbb2" fill-opacity=".14" stroke="#83d9bd" stroke-width="2"/><path d="m40 17 17 9v19c0 9-17 17-17 17S23 54 23 45V26Z" fill="#2b5e5a" stroke="#b6eccc" stroke-width="2"/><path d="M36 28h8v9h9v8h-9v9h-8v-9h-9v-8h9Z" fill="#d5f3c2"/>',
  EXPOSE_TRACE: '<path d="M40 9 65 24v31L40 70 15 55V24Z" fill="#75cbb2" fill-opacity=".12" stroke="#83d9bd" stroke-width="2"/><circle cx="40" cy="40" r="21" fill="#275955" stroke="#b2ebcf" stroke-width="2"/><path d="M20 40s8-12 20-12 20 12 20 12-8 12-20 12-20-12-20-12Z" fill="#76bca9" stroke="#d6f4cf" stroke-width="2"/><circle cx="40" cy="40" r="7" fill="#e5f5c8"/><path d="M40 13v8m0 38v8M13 40h8m38 0h8" stroke="#daf3cf" stroke-width="2" stroke-linecap="round"/>',
};

/** Selected PNGs share the existing atlas installer; each module retains a distinct fallback. */
export function missionTemplateIcon(id: TemplateId): string {
  if (isWeaponId(id)) return `<span class="mission-reward-art" data-camp-art="weapon-${id}" aria-hidden="true"></span>`;
  return `<span class="mission-reward-art" data-camp-art="module-${id}" aria-hidden="true">${glyph(modulePaths[id] ?? modulePaths.PULSE_BREAK)}</span>`;
}

export const missionCoinIcon = (): string => glyph('<ellipse cx="40" cy="49" rx="25" ry="17" fill="#976126" stroke="#f3ce79" stroke-width="2"/><path d="M15 39v10m50-10v10M24 49v11m32-11v11" stroke="#e9b55c" stroke-width="3"/><ellipse cx="40" cy="38" rx="25" ry="18" fill="#e7b85d" stroke="#ffe4a0" stroke-width="2"/><ellipse cx="40" cy="38" rx="18" ry="12" fill="#c59142" stroke="#f7d78a" stroke-width="2"/><path d="m40 29 6 9-6 9-6-9Z" fill="#fff0b7"/>');
export const missionFragmentIcon = (): string => glyph('<path d="m22 14 24 2-5 22-24 8Z" fill="#d1efe4" stroke="#f0fff7" stroke-width="2"/><path d="m50 29 15 13-17 21-8-21Z" fill="#76bcae" stroke="#d1f1e4" stroke-width="2"/><path d="m17 55 14-5 5 15-17-1Z" fill="#a3d8c8" stroke="#e5fff3" stroke-width="2"/>');
export const missionSealIcon = (success: boolean): string => glyph(success
  ? '<path d="m40 5 9 7 12 1 3 12 10 8-5 12 1 12-12 5-8 10-11-5-13 1-5-12L10 48l5-11-1-12 12-5 7-10Z" fill="currentColor" fill-opacity=".1"/><circle cx="40" cy="40" r="24" stroke="currentColor" stroke-width="1.5"/><path d="m29 40 8 8 15-17" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
  : '<circle cx="40" cy="40" r="29" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-opacity=".4"/><path d="M55 40H25m12-12L25 40l12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
