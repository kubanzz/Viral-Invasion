import { BALANCE, type GameState } from '../game/types';
import type { WeaponId } from '../game/expedition';

/** The two held silhouettes use independent inspected source grips and muzzles. */
export const HELD_WEAPON_ART = {
  steady: { id: 'fantasy.weapon.steady.held', identity: 'weapon.steady', canvasHeight: 64,
    ink: '#285b59', accent: '#53c9b3', light: '#fffbed' },
  piercing: { id: 'fantasy.weapon.piercing.held', identity: 'weapon.piercing', canvasHeight: 80,
    ink: '#704c30', accent: '#d98b35', light: '#ffe9b3' },
} as const satisfies Record<WeaponId, { id: string; identity: string; canvasHeight: number; ink: string; accent: string; light: string }>;

export function heldWeaponPresentation(state: Pick<GameState, 'phase' | 'weaponCombat' | 'expedition' | 'territory' | 'camp'>) {
  if (state.phase === 'menu' || !state.weaponCombat && !state.territory && !state.camp) return;
  const id = state.weaponCombat?.loadout.weaponId ?? state.expedition?.loadout.weaponId;
  return id ? { weaponId: id, ...HELD_WEAPON_ART[id] } : undefined;
}

export function isHeldWeaponAsset(id: string): boolean {
  return Object.values(HELD_WEAPON_ART).some(weapon => weapon.id === id);
}

/** Charging locks the painted weapon to the same direction as the committed
 * projectile. Its birth tick keeps that direction after preparation is removed. */
export function heldWeaponFacing(state: Pick<GameState, 'player' | 'weaponCombat' | 'events' | 'tick'>): number {
  const preparation = state.weaponCombat?.preparation;
  if (preparation) return Math.atan2(preparation.direction.y, preparation.direction.x);
  if (state.weaponCombat?.loadout.weaponId !== 'piercing') return state.player.facing;
  for (let i = state.events.length - 1; i >= 0; i--) {
    const event = state.events[i];
    if (event.tick !== state.tick || event.type !== 'PLAYER_PROJECTILE_LAUNCHED' || event.data.weaponId !== 'piercing' || event.data.skillId !== 'piercing-heavy') continue;
    const { x, y, aimX, aimY } = event.data;
    if ([x, y, aimX, aimY].every(value => typeof value === 'number' && Number.isFinite(value))
      && Math.hypot(Number(aimX) - Number(x), Number(aimY) - Number(y)) > 1e-8) {
      return Math.atan2(Number(aimY) - Number(y), Number(aimX) - Number(x));
    }
  }
  return state.player.facing;
}

/** Accepted launch receipts drive a small held recoil; overlapping primary and
 * skill receipts choose the strongest response rather than adding two kicks. */
export function heldWeaponRecoilStrength(state: Pick<GameState, 'phase' | 'weaponCombat' | 'expedition' | 'territory' | 'camp' | 'events' | 'tick' | 'elapsed' | 'visualTime'>,
  primaryStrength = 0): number {
  let strength = Math.max(0, Math.min(1, primaryStrength));
  const weapon = heldWeaponPresentation(state); if (!weapon) return strength;
  const sampled = state.phase === 'playing' ? state.visualTime ?? state.elapsed : state.elapsed;
  for (let i = state.events.length - 1; i >= 0; i--) {
    const event = state.events[i];
    if (event.type !== 'PLAYER_PROJECTILE_LAUNCHED' || event.tick > state.tick || event.data.weaponId !== weapon.weaponId || !event.data.skillId) continue;
    const born = event.tick * BALANCE.step;
    if (born > state.elapsed + 1e-8) continue;
    const heavy = event.data.skillId === 'piercing-heavy', burst = event.data.skillId === 'steady-burst';
    const duration = heavy ? .16 : .1, age = Math.max(0, sampled - born);
    const maximum = heavy ? 1.35 : burst ? .6 : .8;
    strength = Math.max(strength, maximum * Math.max(0, 1 - age / duration));
  }
  return strength;
}
