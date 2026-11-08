import type { ExpeditionLoadout, WeaponId } from './expedition';
import type { Vec } from './types';

export type WeaponSkillSlot = 1 | 2 | 3;
export type WeaponSkillId = 'steady-burst' | 'steady-repulse' | 'steady-overdrive'
  | 'piercing-heavy' | 'piercing-gather' | 'piercing-fan'
  | 'thunder-spear' | 'thunder-cage' | 'thunder-overdrive'
  | 'redblade-dash' | 'redblade-gather' | 'redblade-execute' | 'redblade-parry' | 'redblade-domain' | WeaponUltimateId;
export type WeaponUltimateId = 'steady-ultimate' | 'piercing-ultimate' | 'thunder-ultimate' | 'redblade-ultimate';
export type WeaponDamageCategory = 'precision' | 'area';
export type WeaponArmorResponse = 'needle' | 'heavy';
export interface ThunderLink { targetId: string; from: Vec; to: Vec; main: boolean; fromTargetId?: string }
export interface ThunderCombatState {
  nextPrimaryAt?: number;
  channel?: { castId: string; startedAt: number; nextAt: number; links: ThunderLink[] };
  marks: { targetId: string; until: number }[];
  rod?: Vec & { castId: string; startedAt: number; until: number; powered: boolean; radius: number;
    pullUntil: number; nextPullAt: number; damage: number; aftershockAt?: number; aftershockDamage?: number; moved: Record<string, number> };
  dash?: { castId: string; from: Vec; to: Vec; startedAt: number; until: number; lastAt: number; direction: Vec;
    damage: number; hitIds: string[]; path: Vec[] };
  trails: { castId: string; from: Vec; to: Vec; startedAt: number; until: number; nextAt: number; damage: number }[];
  storm?: { castId: string; phase: 'storm' | 'collapse'; startedAt: number; until: number; nextAt: number;
    collapseAt?: number; duration?: number; damage: number; center: Vec };
}
export interface WeaponCombatState {
  loadout: ExpeditionLoadout;
  serial: number;
  cooldowns: Record<WeaponSkillSlot, number>;
  primaryBlockedUntil: number;
  overdriveUntil: number;
  /** Includes every committed future burst/preparation body in the shared cap. */
  reservedProjectiles: number;
  burst?: { castId: string; nextAt: number; remaining: number; damage: number;
    skillId?: 'steady-burst' | 'thunder-spear'; count?: number; interval?: number };
  preparation?: { castId: string; firesAt: number; direction: Vec; damage: number };
  ultimateEnergy?: number;
  creditedKillIds?: string[];
  ultimate?: { id: WeaponUltimateId; castId: string; startedAt: number; until: number; nextAt: number;
    index: number; reserved: number; damage: number; aim: Vec; direction: Vec };
  pendingActions?: { at: number; castId: string; skillId: WeaponSkillId; damage: number; radius: number;
    center?: Vec; direction?: Vec; halfAngle?: number; pull?: number }[];
  meleeCombo?: { index: number; expiresAt: number };
  meleeDash?: { castId: string; until: number; lastAt: number; direction: Vec; speed: number; damage: number; hitIds: string[] };
  mitigations?: { until: number; multiplier: number }[];
  executionRefund?: { castId: string; until: number; used: boolean };
  bladeParry?: { castId: string; startedAt: number; until: number; direction: Vec; damage: number; resolved: boolean };
  bladeDomain?: { castId: string; startedAt: number; until: number; next: number; damage: number };
  bladeTrace?: BladeTraceState;
  thunder?: ThunderCombatState;
}
export interface BladeTraceMark extends Vec { id: number; targetId: string; connected: boolean; resolved: boolean; offset?: Vec }
export interface BladeTraceState {
  castId: string; phase: 'drawing' | 'windup' | 'executing' | 'recovery'; startedAt: number; deadline: number; until: number;
  damage: number; marks: BladeTraceMark[]; path: Vec[]; route: Vec[]; routeIndex: number;
  lastAt: number; manual: boolean; hitIds: string[]; elapsedDistance: number; speed: number;
  executionStartedAt?: number;
  windupStartedAt?: number;
  executionDuration?: number;
}
export interface WeaponSkillView {
  slot: WeaponSkillSlot; id: WeaponSkillId; weaponId: WeaponId; name: string;
  cooldown: number; remaining: number; ready: boolean; range: number; radius: number;
  aim: 'direction' | 'point' | 'self'; description: string;
}
export interface WeaponUltimateView {
  id: WeaponUltimateId; weaponId: WeaponId; name: string; energy: number; required: number;
  ready: boolean; active: boolean; remaining: number; range: number; radius: number;
  aim: 'direction' | 'point' | 'self'; description: string;
  canRecast?: boolean;
}
