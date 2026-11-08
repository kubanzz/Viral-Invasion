import type { WeaponSkillId, WeaponUltimateId } from '../game/weaponSkillsTypes';

/** Small native silhouettes; identity follows the skill, never its key slot. */
const shapes: Record<WeaponSkillId, string> = {
  'steady-burst': '<path d="M2 4Q11 4 17 11M2 12h17M2 20Q11 20 17 13m-1-5 4 4-4 4"/><circle cx="20" cy="12" r="2"/>',
  'steady-repulse': '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m-2-1 2-2 2 2M12 22v-3m-2 1 2 2 2-2M2 12h3m-1-2-2 2 2 2m18-2h-3m1-2 2 2-2 2"/>',
  'steady-overdrive': '<path d="m7 3 5 3v6l-5 3-5-3V6zm10 6 5 3v6l-5 3-5-3v-6zM13 2v5m-2-2 2 2 2-2M5 18v4m-2-2h4"/>',
  'piercing-heavy': '<path d="m2 12 17-6-4 6 4 6zM8 12h14m-3-3 3 3-3 3"/><path d="M5 4v3m0 10v3"/>',
  'piercing-gather': '<circle cx="12" cy="12" r="3"/><path d="M3 3l4 4m-3 0h3V4m14-1-4 4m0-3v3h3M3 21l4-4m-3 0h3v3m14 1-4-4m0 3v-3h3"/>',
  'piercing-fan': '<path d="M16 3Q6 11 16 17Q2 13 8 3M20 8Q15 13 20 17Q11 15 15 8M19 20H4m3-3-3 3 3 3"/>',
  'thunder-spear': '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="11" cy="19" r="2"/><path d="m7 6 4 2-3 3 9-3M18 10l-2 4-3-1-1 4M3 13l3-1m15 4-2-2M10 2l1 3"/>',
  'thunder-cage': '<path d="M12 3v13m-4-8 4-5 4 5M8 19h8M5 22h14M2 8l4 3-4 3m20-6-4 3 4 3M6 11h2m8 0h2"/>',
  'thunder-overdrive': '<path d="M2 8h7L6 3l15 9-9 1 4 8-14-9h8M2 19h5m-3 3h7M15 3h7"/>',
  'redblade-dash': '<path d="M3 20 18 3l3-1-1 4L7 20zM2 6h7M2 10h4M6 17l3 3"/>',
  'redblade-gather': '<path d="M20 7A9 9 0 1 0 21 16M20 3v5h-5M7 18l8-12 2-1-1 4-7 10z"/>',
  'redblade-execute': '<path d="m4 3 16 17m-3-1 3-3M20 3 4 20m0-4 3 3M11 3h2m-1 17v2"/>',
  'redblade-parry': '<path d="M4 5v7q1 7 8 10 7-3 8-10V5l-8-3zM6 17 18 5m-3 0h3v3"/>',
  'redblade-domain': '<circle cx="12" cy="12" r="10"/><path d="M5 16 17 4l3-1-1 4L8 19zm-1-3 7 7M3 10h4m10 4h4"/>',
  'steady-ultimate': '<path d="m12 2 5 3v6l-5 3-5-3V5zM4 10l-3 5 4 5 5-2m10-8 3 5-4 5-5-2M12 14v8m-3-3 3 3 3-3"/>',
  'piercing-ultimate': '<circle cx="12" cy="12" r="8"/><path d="M12 1Q3 9 12 12Q1 11 5 3M23 12Q15 3 12 12Q13 1 21 5M12 23Q21 15 12 12Q23 13 19 21M1 12Q9 21 12 12Q11 23 3 19"/>',
  'thunder-ultimate': '<path d="m13 1-8 12h6l-1 10 10-14h-7zM2 7h3m15 10h2M3 20l3-3M19 4l2-2"/>',
  'redblade-ultimate': '<path d="m4 4 16 5-13 11 13-2"/><circle cx="4" cy="4" r="2"/><circle cx="20" cy="9" r="2"/><circle cx="7" cy="20" r="2"/><circle cx="20" cy="18" r="2"/>',
};

export function weaponSkillIconMarkup(id: WeaponSkillId): string {
  return `<span class="weapon-skill-icon" data-weapon-skill-icon="${id}" data-camp-art="skill-${id}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">${shapes[id]}</svg></span>`;
}

export function weaponUltimateIconMarkup(id: WeaponUltimateId): string { return weaponSkillIconMarkup(id); }
