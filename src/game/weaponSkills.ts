import { normalized } from '../actors/collision';
import { createEndlessGrowth, endlessCombatStats } from './endlessGrowth';
import type { EndlessCombatStats } from './endlessGrowthTypes';
import { DEFAULT_EXPEDITION_LOADOUT, weaponCombatProfile, type ExpeditionLoadout, type WeaponId } from './expedition';
import type { DamageOrigin } from './growthTypes';
import { launchWeaponVolley, reservePlayerProjectiles, resolveWeaponPulse, type PlayerProjectileHost } from './playerProjectiles';
import { BALANCE, type GameState, type Vec } from './types';
import type { WeaponCombatState, WeaponSkillId, WeaponSkillSlot, WeaponSkillView } from './weaponSkillsTypes';

export type * from './weaponSkillsTypes';
export const WEAPON_SKILL_BALANCE = {
  burst: { count: 5, interval: .08, damageFactor: .65, range: 600, spread: .16, turnRate: 6, turnBudget: .75, cooldown: 6 },
  repulse: { damageFactor: 2, radius: 155, displacement: 70, cooldown: 10 },
  overdrive: { duration: 4, intervalFactor: .75, minimumTicks: 5, cooldown: 18 },
  heavy: { prepare: .45, speed: 1200, radius: 20, range: 700, damageFactor: 4, targets: 6, perTarget: .12, maximumBonus: .36, cooldown: 7 },
  gather: { delay: 1, damageFactor: 1.5, radius: 150, displacement: 80, cooldown: 10 },
  fan: { count: 3, spread: Math.PI / 10, speed: 800, radius: 25, range: 450, damageFactor: 2, returnDamageFactor: .5, cooldown: 16 },
  capsule: { speed: 900, radius: 12, range: 420, busy: .15 },
} as const;
const ids = {
  steady: ['steady-burst', 'steady-repulse', 'steady-overdrive'],
  piercing: ['piercing-heavy', 'piercing-gather', 'piercing-fan'],
} as const;
const names: Record<WeaponSkillId, string> = {
  'steady-burst': '蜂群追针', 'steady-repulse': '排异震环', 'steady-overdrive': '蜂巢超载',
  'piercing-heavy': '蓄势穿心', 'piercing-gather': '束脉锚', 'piercing-fan': '回缝风暴',
};
const descriptions: Record<WeaponSkillId, string> = {
  'steady-burst': '0.32秒散射五根蜂针，有限转向追击前方可见目标；逐针读取瞄准，不能穿越组织。',
  'steady-repulse': '脚下瞬发排斥震环，击退可移动病毒并拦截弹体；无法移动建筑、母巢或已开始攻击的敌人。',
  'steady-overdrive': '4秒内提升普攻射速，每次普攻额外发射左右两根35%伤害侧针；不加速技能、不刷新冷却。',
  'piercing-heavy': '锁定初始方向，准备0.45秒后从实际位置发射骨刃，最多贯穿六体；每穿过一体，后续伤害提高12%，最多36%。',
  'piercing-gather': '点投针锚，落地后持续牵引附近病毒1秒再爆破，适合接蓄势穿心。',
  'piercing-fan': '三片大月牙去程2倍、回程1倍伤害，向当前位置回收；每体每程最多命中一次，横移改变回收路线。',
};

export function createWeaponCombat(loadout: ExpeditionLoadout = DEFAULT_EXPEDITION_LOADOUT): WeaponCombatState {
  return { loadout: { ...loadout }, serial: 0, cooldowns: { 1: 0, 2: 0, 3: 0 },
    primaryBlockedUntil: 0, overdriveUntil: 0, reservedProjectiles: 0 };
}
export function weaponSkillsEnabled(state: GameState): boolean { return !!state.territory || !!state.weaponCombat; }
function combat(state: GameState): WeaponCombatState | undefined {
  if (!weaponSkillsEnabled(state)) return;
  return state.weaponCombat ??= createWeaponCombat(state.expedition?.loadout ?? DEFAULT_EXPEDITION_LOADOUT);
}
function stats(state: GameState): EndlessCombatStats { return endlessCombatStats(state.endlessGrowth ?? createEndlessGrowth(0)); }
function available(state: GameState): boolean {
  return weaponSkillsEnabled(state) && state.phase === 'playing' && state.player.hp > 0 && state.tissue.hp > 0
    && !(state.playerFlight && state.elapsed < state.playerFlight.landsAt);
}
export function weaponBlocksPrimary(state: GameState): boolean {
  return weaponSkillsEnabled(state) && state.elapsed + 1e-8 < (state.weaponCombat?.primaryBlockedUntil ?? 0);
}
export function weaponPrimaryCooldown(state: GameState, profile: EndlessCombatStats): number {
  if (state.weaponCombat?.loadout.weaponId === 'piercing') return Math.ceil(profile.primaryCooldown * 1.6 / BALANCE.step - 1e-8) * BALANCE.step;
  if (!state.weaponCombat || state.elapsed + 1e-8 >= state.weaponCombat.overdriveUntil) return profile.primaryCooldown;
  return Math.max(WEAPON_SKILL_BALANCE.overdrive.minimumTicks,
    Math.ceil(profile.primaryCooldown * WEAPON_SKILL_BALANCE.overdrive.intervalFactor / BALANCE.step - 1e-8)) * BALANCE.step;
}
export function weaponSkillDefinitions(weaponId: WeaponId): Omit<WeaponSkillView, 'remaining' | 'ready'>[] {
  const b = WEAPON_SKILL_BALANCE;
  return ([1, 2, 3] as const).map(slot => {
    const id = ids[weaponId][slot - 1], config = slot === 1 ? weaponId === 'steady' ? b.burst : b.heavy
      : slot === 2 ? weaponId === 'steady' ? b.repulse : b.gather : weaponId === 'steady' ? b.overdrive : b.fan;
    return { slot, id, weaponId, name: names[id], cooldown: config.cooldown,
      range: slot === 2 ? weaponId === 'steady' ? 0 : b.capsule.range : slot === 1 ? weaponId === 'steady' ? b.burst.range : b.heavy.range
        : weaponId === 'steady' ? 0 : b.fan.range,
      radius: slot === 2 ? (weaponId === 'steady' ? b.repulse.radius : b.gather.radius)
        : id === 'piercing-heavy' ? b.heavy.radius : id === 'piercing-fan' ? b.fan.radius : 6,
      aim: id === 'steady-overdrive' || id === 'steady-repulse' ? 'self' as const : slot === 2 ? 'point' as const : 'direction' as const,
      description: descriptions[id] };
  });
}
export function weaponSkillViews(state: GameState): WeaponSkillView[] {
  if (!weaponSkillsEnabled(state)) return [];
  const runtime = state.weaponCombat, weaponId = runtime?.loadout.weaponId ?? state.expedition?.loadout.weaponId ?? 'steady';
  const growth = stats(state);
  return weaponSkillDefinitions(weaponId).map(definition => {
    const remaining = Math.max(0, (runtime?.cooldowns[definition.slot] ?? 0) - state.elapsed);
    return { ...definition, remaining, radius: definition.radius + (definition.slot === 2 ? growth.areaRadius - BALANCE.areaRadius : 0),
      ready: remaining <= 1e-8 && available(state) && !weaponBlocksPrimary(state) };
  });
}
function origin(runtime: WeaponCombatState, id: WeaponSkillId, castId: string): DamageOrigin {
  return { cause: 'ability', weaponId: runtime.loadout.weaponId, skillId: id, castId, rootId: castId,
    damageCategory: id === 'steady-burst' || id === 'piercing-heavy' ? 'precision' : 'area',
    armorResponse: id === 'steady-burst' ? 'needle' : 'heavy' };
}
function launched(host: PlayerProjectileHost, id: WeaponSkillId, castId: string, aim: Vec, kind: string, count = 1): void {
  host.state.player.actionUntil = host.state.elapsed + .15;
  host.emit('PLAYER_PROJECTILE_LAUNCHED', { kind, castId, count, weaponId: host.state.weaponCombat!.loadout.weaponId,
    skillId: id, x: host.state.player.x, y: host.state.player.y, aimX: aim.x, aimY: aim.y });
}
function advanceAction(host: PlayerProjectileHost, aim: Vec): void {
  const state = host.state, runtime = state.weaponCombat; if (!runtime || !available(state)) return;
  const burst = runtime.burst;
  // Fixed-step scheduling catches every committed needle without depending on render frames.
  while (burst && runtime.burst === burst && burst.remaining > 0 && state.elapsed + 1e-8 >= burst.nextAt && host.state === state && available(state)) {
    runtime.reservedProjectiles--;
    const ordinal = WEAPON_SKILL_BALANCE.burst.count - burst.remaining;
    const config = WEAPON_SKILL_BALANCE.burst, base = normalized(aim.x - state.player.x, aim.y - state.player.y);
    const facing = base.x || base.y ? Math.atan2(base.y, base.x) : state.player.facing;
    const angle = facing + (ordinal - (config.count - 1) / 2) * config.spread;
    const admitted = launchWeaponVolley(state, aim, { castId: `${burst.castId}:${ordinal}`, kind: 'primary',
      damage: burst.damage, origin: origin(runtime, 'steady-burst', burst.castId), range: config.range,
      direction: { x: Math.cos(angle), y: Math.sin(angle) }, speed: 1100, visual: 'swarm-needle',
      homing: { turnRate: config.turnRate, remainingTurn: config.turnBudget, range: config.range, acquireCos: Math.cos(.7), delay: .045 } });
    if (!admitted) { runtime.reservedProjectiles++; break; }
    burst.remaining--; burst.nextAt += WEAPON_SKILL_BALANCE.burst.interval;
    launched(host, 'steady-burst', `${burst.castId}:${ordinal}`, aim, 'primary');
    if (host.state !== state || state.weaponCombat !== runtime) return;
  }
  if (burst?.remaining === 0) delete runtime.burst;
  const preparation = runtime.preparation;
  if (preparation && state.elapsed + 1e-8 >= preparation.firesAt) {
    runtime.reservedProjectiles--;
    const b = WEAPON_SKILL_BALANCE.heavy;
    const admitted = launchWeaponVolley(state, aim, { castId: preparation.castId, kind: 'primary', damage: preparation.damage,
      origin: origin(runtime, 'piercing-heavy', preparation.castId), direction: preparation.direction,
      speed: b.speed, radius: b.radius, range: b.range, hitsRemaining: b.targets, visual: 'heavy-blade',
      penetration: { perTarget: b.perTarget, maximum: b.maximumBonus } });
    if (!admitted) { runtime.reservedProjectiles++; return; }
    delete runtime.preparation;
    launched(host, 'piercing-heavy', preparation.castId,
      { x: state.player.x + preparation.direction.x * b.range, y: state.player.y + preparation.direction.y * b.range }, 'primary');
  }
}
export function castWeaponSkill(host: PlayerProjectileHost, slot: WeaponSkillSlot, aim: Vec): boolean {
  const state = host.state;
  if (![1, 2, 3].includes(slot) || !available(state) || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return false;
  const runtime = combat(state)!;
  const view = weaponSkillViews(state)[slot - 1]; if (!view.ready) return false;
  const profile = stats(state), damage = weaponCombatProfile(runtime.loadout, profile.damageMultiplier).primaryDamage;
  const id = view.id, castId = `weapon:${runtime.loadout.weaponId}:${++runtime.serial}`, b = WEAPON_SKILL_BALANCE;
  let accepted = false;
  if (id === 'steady-burst') {
    if (!reservePlayerProjectiles(state, b.burst.count)) return false;
    runtime.burst = { castId, nextAt: state.elapsed, remaining: b.burst.count, damage: damage * b.burst.damageFactor };
    runtime.primaryBlockedUntil = state.elapsed + b.burst.interval * (b.burst.count - 1);
    accepted = true;
  } else if (id === 'piercing-heavy') {
    if (!reservePlayerProjectiles(state, 1)) return false;
    let direction = normalized(aim.x - state.player.x, aim.y - state.player.y);
    if (!direction.x && !direction.y) direction = { x: Math.cos(state.player.facing), y: Math.sin(state.player.facing) };
    runtime.preparation = { castId, firesAt: state.elapsed + b.heavy.prepare, direction, damage: damage * b.heavy.damageFactor };
    runtime.primaryBlockedUntil = state.elapsed + b.heavy.prepare; accepted = true;
  } else if (id === 'steady-overdrive') {
    runtime.overdriveUntil = state.elapsed + b.overdrive.duration; accepted = true;
  } else if (id === 'steady-repulse' || id === 'piercing-gather') {
    const gather = id === 'piercing-gather', config = gather ? b.gather : b.repulse;
    accepted = launchWeaponVolley(state, gather ? aim : state.player, { castId, kind: 'cannon', origin: origin(runtime, id, castId),
      speed: b.capsule.speed, radius: b.capsule.radius, range: gather ? b.capsule.range : 0,
      damage: damage * config.damageFactor * profile.areaDamageMultiplier, explosionRadius: view.radius,
      impactDelay: gather ? b.gather.delay : 0, aftershock: profile.catalysisDamage > 0,
      displacement: { kind: gather ? 'pull' : 'push', maximum: config.displacement }, visual: gather ? 'anchor' : 'pulse-ring' });
    if (accepted) runtime.primaryBlockedUntil = state.elapsed + b.capsule.busy;
  } else {
    accepted = launchWeaponVolley(state, aim, { castId, kind: 'sword', origin: origin(runtime, id, castId),
      damage: damage * b.fan.damageFactor, count: b.fan.count, spread: b.fan.spread, speed: b.fan.speed,
      radius: b.fan.radius, range: b.fan.range, hitsRemaining: Number.MAX_SAFE_INTEGER, shareHits: true, visual: 'storm-crescent',
      returnFlight: { damageFactor: b.fan.returnDamageFactor, range: 1100, lifetime: 2.4 } });
    if (accepted) runtime.primaryBlockedUntil = state.elapsed + b.capsule.busy;
  }
  if (!accepted) return false;
  runtime.cooldowns[slot] = state.elapsed + view.cooldown;
  host.emit('WEAPON_SKILL_CAST', { weaponId: runtime.loadout.weaponId, skillId: id, slot, castId,
    x: state.player.x, y: state.player.y, aimX: aim.x, aimY: aim.y, readyAt: runtime.cooldowns[slot] });
  if (host.state !== state || state.phase !== 'playing' || state.weaponCombat !== runtime) return true;
  if (id === 'steady-burst') advanceAction(host, aim);
  else if (id === 'steady-repulse') resolveWeaponPulse(host, castId);
  else if (id !== 'steady-overdrive' && id !== 'piercing-heavy') launched(host, id, castId, aim, id === 'piercing-fan' ? 'sword' : 'cannon', id === 'piercing-fan' ? 3 : 1);
  return true;
}
export function advanceWeaponSkills(host: PlayerProjectileHost, aim: Vec, dt: number = BALANCE.step): void {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return;
  advanceAction(host, aim);
}
/** Cancelling commitments never refunds a cooldown or rewinds already-fired bodies. */
export function cancelWeaponAction(state: GameState): void {
  const runtime = state.weaponCombat; if (!runtime) return;
  delete runtime.burst; delete runtime.preparation; runtime.reservedProjectiles = 0;
  runtime.primaryBlockedUntil = Math.min(runtime.primaryBlockedUntil, state.elapsed);
}
