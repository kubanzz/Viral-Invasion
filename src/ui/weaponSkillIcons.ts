import type { WeaponSkillId } from '../game/weaponSkillsTypes';

/** Six small native silhouettes; identity follows the skill, never its key slot. */
const shapes: Record<WeaponSkillId, string> = {
  'steady-burst': '<path d="M2 4Q11 4 17 11M2 12h17M2 20Q11 20 17 13m-1-5 4 4-4 4"/><circle cx="20" cy="12" r="2"/>',
  'steady-repulse': '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m-2-1 2-2 2 2M12 22v-3m-2 1 2 2 2-2M2 12h3m-1-2-2 2 2 2m18-2h-3m1-2 2 2-2 2"/>',
  'steady-overdrive': '<path d="m7 3 5 3v6l-5 3-5-3V6zm10 6 5 3v6l-5 3-5-3v-6zM13 2v5m-2-2 2 2 2-2M5 18v4m-2-2h4"/>',
  'piercing-heavy': '<path d="m2 12 17-6-4 6 4 6zM8 12h14m-3-3 3 3-3 3"/><path d="M5 4v3m0 10v3"/>',
  'piercing-gather': '<circle cx="12" cy="12" r="3"/><path d="M3 3l4 4m-3 0h3V4m14-1-4 4m0-3v3h3M3 21l4-4m-3 0h3v3m14 1-4-4m0 3v-3h3"/>',
  'piercing-fan': '<path d="M16 3Q6 11 16 17Q2 13 8 3M20 8Q15 13 20 17Q11 15 15 8M19 20H4m3-3-3 3 3 3"/>',
};

export function weaponSkillIconMarkup(id: WeaponSkillId): string {
  return `<span class="weapon-skill-icon" data-weapon-skill-icon="${id}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">${shapes[id]}</svg></span>`;
}
