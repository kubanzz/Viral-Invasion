import { distance, moveWithCollision, normalized, wallHit } from '../actors/collision';
import { dashBladeHits } from './dashBlade';
import { weaponCombatProfile } from './expedition';
import type { DamageOrigin } from './growthTypes';
import type { EndlessCombatStats } from './endlessGrowthTypes';
import type { PlayerProjectileHost } from './playerProjectiles';
import { ritualProjectileTargets } from './ritual';
import { activeWorld, type GameState, type Target, type Vec } from './types';
import type { WeaponSkillId } from './weaponSkillsTypes';

export const REDBLADE_PRIMARY = { factors: [1.3, 1.43, 2.43], radii: [110, 120, 145],
  halfAngles: [Math.PI * 4 / 9, Math.PI * 4 / 9, Math.PI * 2 / 3], ticks: [11, 11, 20], reset: .8 } as const;

export function weaponCombatAvailable(state: GameState): boolean {
  return !!state.weaponCombat && state.phase === 'playing' && state.player.hp > 0 && state.tissue.hp > 0
    && !(state.playerFlight && state.elapsed < state.playerFlight.landsAt);
}
export function weaponAimDirection(state: GameState, aim: Vec): Vec {
  const direction = normalized(aim.x - state.player.x, aim.y - state.player.y);
  return direction.x || direction.y ? direction : { x: Math.cos(state.player.facing), y: Math.sin(state.player.facing) };
}
export function weaponOrigin(state: GameState, skillId: WeaponSkillId, castId: string): DamageOrigin {
  const ultimate = skillId.endsWith('-ultimate');
  return { cause: 'ability', weaponId: state.weaponCombat!.loadout.weaponId, skillId, castId, rootId: castId,
    damageCategory: 'area', armorResponse: 'heavy', ...(ultimate ? { ultimateId: skillId as import('./weaponSkillsTypes').WeaponUltimateId } : {}) };
}
export function playerIncomingDamage(state: GameState, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (state.weaponCombat?.thunder?.dash && state.elapsed <= state.weaponCombat.thunder.dash.until + 1e-8) return 0;
  if (['windup', 'executing'].includes(state.weaponCombat?.bladeTrace?.phase ?? '')) return 0;
  const reductions = state.weaponCombat?.mitigations ?? [];
  return amount * Math.min(state.weaponCombat?.bladeTrace?.phase === 'drawing' ? .3 : 1, ...reductions.filter(item => state.elapsed + 1e-8 < item.until)
    .map(item => Math.max(0, Math.min(1, item.multiplier))));
}
export function setWeaponMitigation(state: GameState, until: number, multiplier: number): void {
  const runtime = state.weaponCombat!;
  runtime.mitigations = [...(runtime.mitigations ?? []).filter(item => item.until > state.elapsed), { until, multiplier }];
}
/** Shared battle/trial kill payoff; this function never grants ultimate energy. */
export function creditWeaponExecutionKill(state: GameState, target: Target, origin: DamageOrigin): boolean {
  const runtime = state.weaponCombat, refund = runtime?.executionRefund;
  if (!runtime || !refund || refund.used || state.phase !== 'playing' || target.hp > 0 || !state.targets.includes(target)
    || !['virus', 'elite', 'source', 'nest', 'core'].includes(target.role ?? '') || origin.ability === 'host-event'
    || state.elapsed > refund.until || runtime.loadout.weaponId !== 'redblade'
    || origin.castId !== refund.castId || origin.skillId !== 'redblade-execute') return false;
  refund.used = true;
  runtime.cooldowns[1] = Math.min(runtime.cooldowns[1], state.elapsed);
  return true;
}
export function visibleWeaponTargets(state: GameState, center: Vec, radius: number): Target[] {
  const world = activeWorld(state);
  return [...state.targets, ...ritualProjectileTargets(state)].filter(target => {
    const gap = distance(center, target);
    if (target.hp <= 0 || gap > radius + target.radius) return false;
    const block = wallHit(center, normalized(target.x - center.x, target.y - center.y), gap, world);
    return block === null || block >= gap - target.radius - 1e-7;
  }).sort((a, b) => distance(center, a) - distance(center, b) || a.id.localeCompare(b.id));
}
export function pullWeaponTargets(state: GameState, center: Vec, radius: number, maximum: number): void {
  for (const target of visibleWeaponTargets(state, center, radius)) {
    if (target.role !== 'virus' && target.role !== 'elite' || target.profession === 'ritual-mother' || target.profession === 'ritual-priest'
      || target.attackPlan || target.charge || (target.recoverUntil ?? 0) > state.elapsed || target.attackAt !== undefined && target.attackAt >= state.elapsed) continue;
    const direction = normalized(center.x - target.x, center.y - target.y);
    const factor = target.role === 'elite' || target.traits?.includes('CARAPACE') ? .35 : 1;
    const amount = Math.min(maximum * factor, Math.max(0, distance(center, target) - target.radius - 12));
    Object.assign(target, moveWithCollision(target, { x: direction.x * amount, y: direction.y * amount }, target.radius, activeWorld(state)));
  }
}
export function weaponRadialDamage(host: PlayerProjectileHost, center: Vec, radius: number, damage: number, origin: DamageOrigin): number {
  const state = host.state;
  let hits = 0;
  host.effect('burst', center, center, radius, .3);
  for (const target of visibleWeaponTargets(state, center, radius)) {
    if (host.state !== state || state.phase !== 'playing') break;
    const actual = host.damage(target, damage, origin);
    if (actual > 0) hits++;
  }
  host.emit('WEAPON_AREA_RESOLVED', { castId: origin.castId ?? '', skillId: origin.skillId ?? '', weaponId: origin.weaponId ?? '',
    x: center.x, y: center.y, radius, damage, hits });
  return hits;
}
export function weaponSweep(host: PlayerProjectileHost, center: Vec, direction: Vec, radius: number, halfAngle: number,
  damage: number, origin: DamageOrigin, hitIds?: string[]): number {
  const state = host.state;
  const effect = host.effect('slash', center, { x: center.x + direction.x * radius, y: center.y + direction.y * radius }, radius, .22);
  effect.arcHalfAngle = halfAngle;
  host.emit('WEAPON_MELEE_SWEEP', { weaponId: origin.weaponId ?? '', skillId: origin.skillId ?? '', castId: origin.castId ?? '',
    x: center.x, y: center.y, aimX: center.x + direction.x * radius, aimY: center.y + direction.y * radius,
    radius, arcHalfAngle: halfAngle, damage });
  let hits = 0;
  for (const target of [...state.targets, ...ritualProjectileTargets(state)]) {
    if (host.state !== state || state.phase !== 'playing') break;
    if (hitIds?.includes(target.id) || !dashBladeHits(center, direction, target, radius, halfAngle, activeWorld(state))) continue;
    // Claim before a synchronous damage callback can invoke this sweep again.
    hitIds?.push(target.id);
    const actual = host.damage(target, damage, origin);
    if (actual > 0) {
      hits++;
      host.emit('WEAPON_MELEE_HIT', { castId: origin.castId ?? '', skillId: origin.skillId ?? '', weaponId: origin.weaponId ?? '',
        targetId: target.id, damage: actual, killed: target.hp <= 0, x: target.x, y: target.y });
    }
  }
  return hits;
}
export function launchRedbladePrimary(host: PlayerProjectileHost, aim: Vec, stats: EndlessCombatStats, castId: string): boolean {
  const state = host.state, runtime = state.weaponCombat;
  if (!runtime || runtime.loadout.weaponId !== 'redblade' || !weaponCombatAvailable(state) || state.elapsed < runtime.primaryBlockedUntil) return false;
  const index = runtime.meleeCombo && state.elapsed <= runtime.meleeCombo.expiresAt ? runtime.meleeCombo.index % 3 : 0;
  const direction = weaponAimDirection(state, aim), damage = weaponCombatProfile(runtime.loadout, stats.damageMultiplier).primaryDamage;
  runtime.meleeCombo = { index: index + 1, expiresAt: state.elapsed + REDBLADE_PRIMARY.reset };
  state.player.actionUntil = state.elapsed + .18;
  host.emit('WEAPON_MELEE_SWING', { weaponId: 'redblade', castId, combo: index + 1, x: state.player.x, y: state.player.y,
    aimX: aim.x, aimY: aim.y, radius: REDBLADE_PRIMARY.radii[index] });
  weaponSweep(host, { ...state.player }, direction, REDBLADE_PRIMARY.radii[index], REDBLADE_PRIMARY.halfAngles[index],
    damage * REDBLADE_PRIMARY.factors[index], { cause: 'basic', basicTool: 1, weaponId: 'redblade', castId, rootId: castId,
      damageCategory: 'precision', armorResponse: 'heavy' });
  return true;
}
export function advanceWeaponMelee(host: PlayerProjectileHost, dt: number): void {
  const state = host.state, runtime = state.weaponCombat, dash = runtime?.meleeDash;
  if (!runtime || !dash || !weaponCombatAvailable(state)) return;
  // The skill is accepted after this tick's ordinary movement. Its birth tick
  // must not also consume a full future step of the promised 0.18-second travel.
  const through = Math.min(state.elapsed, dash.until);
  const duration = Math.max(0, through - dash.lastAt);
  dash.lastAt = Math.max(dash.lastAt, through);
  const before = { ...state.player };
  const after = moveWithCollision(state.player, { x: dash.direction.x * dash.speed * duration,
    y: dash.direction.y * dash.speed * duration }, state.player.radius, activeWorld(state));
  Object.assign(state.player, after);
  const traveled = distance(before, after), samples = Math.max(1, Math.ceil(traveled / 35));
  for (let sample = 0; sample <= samples; sample++) {
    if (host.state !== state || runtime.meleeDash !== dash || !weaponCombatAvailable(state)) return;
    const center = { x: before.x + (after.x - before.x) * sample / samples, y: before.y + (after.y - before.y) * sample / samples };
    weaponSweep(host, center, dash.direction, 90, Math.PI / 2, dash.damage, weaponOrigin(state, 'redblade-dash', dash.castId), dash.hitIds);
  }
  host.emit('WEAPON_DASH_ADVANCED', { castId: dash.castId, weaponId: 'redblade', fromX: before.x, fromY: before.y,
    x: after.x, y: after.y });
  if (state.elapsed + 1e-8 >= dash.until) delete runtime.meleeDash;
}
