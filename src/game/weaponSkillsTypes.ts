import type { ExpeditionLoadout, WeaponId } from './expedition';
import type { Vec } from './types';

export type WeaponSkillSlot = 1 | 2 | 3;
export type WeaponSkillId = 'steady-burst' | 'steady-repulse' | 'steady-overdrive'
  | 'piercing-heavy' | 'piercing-gather' | 'piercing-fan';
export type WeaponDamageCategory = 'precision' | 'area';
export type WeaponArmorResponse = 'needle' | 'heavy';
export interface WeaponCombatState {
  loadout: ExpeditionLoadout;
  serial: number;
  cooldowns: Record<WeaponSkillSlot, number>;
  primaryBlockedUntil: number;
  overdriveUntil: number;
  /** Includes every committed future burst/preparation body in the shared cap. */
  reservedProjectiles: number;
  burst?: { castId: string; nextAt: number; remaining: number; damage: number };
  preparation?: { castId: string; firesAt: number; direction: Vec; damage: number };
}
export interface WeaponSkillView {
  slot: WeaponSkillSlot; id: WeaponSkillId; weaponId: WeaponId; name: string;
  cooldown: number; remaining: number; ready: boolean; range: number; radius: number;
  aim: 'direction' | 'point' | 'self'; description: string;
}
