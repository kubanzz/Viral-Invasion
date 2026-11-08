import { createEndlessGrowth, endlessCombatStats } from './endlessGrowth';
import type { EndlessCombatStats } from './endlessGrowthTypes';
import { DEFAULT_EXPEDITION_LOADOUT, weaponCombatProfile, type ExpeditionLoadout, type WeaponId } from './expedition';
import { launchPrimary, launchWeaponVolley, reservePlayerProjectiles, resolveWeaponPulse, type PlayerProjectileHost } from './playerProjectiles';
import { advanceWeaponMelee, launchRedbladePrimary, REDBLADE_PRIMARY, pullWeaponTargets, setWeaponMitigation,
  weaponAimDirection, weaponCombatAvailable, weaponOrigin, weaponRadialDamage, weaponSweep } from './weaponMelee';
import { advanceWeaponUltimates } from './weaponUltimates';
import { advanceBladeTechniques, BLADE_TECHNIQUES } from './bladeTechniques';
import { advanceThunderCombat, castThunderSkill, clearThunderCombat, startThunderPrimary, stopThunderPrimary, THUNDER_BALANCE } from './thunderCombat';
import { BALANCE, type GameState, type Vec } from './types';
import type { WeaponCombatState, WeaponSkillSlot, WeaponSkillView } from './weaponSkillsTypes';

export type * from './weaponSkillsTypes';
export { playerIncomingDamage } from './weaponMelee';
export const WEAPON_SKILL_BALANCE = {
  burst: { count: 8, interval: .06, damageFactor: .6, range: 600, spread: .12, turnRate: 7, turnBudget: 1.05, cooldown: 5 },
  repulse: { damageFactor: 2, radius: 190, displacement: 80, cooldown: 9 },
  overdrive: { duration: 5, intervalFactor: .75, minimumTicks: 5, cooldown: 18 },
  heavy: { prepare: .25, speed: 1200, radius: 24, range: 720, damageFactor: 5, targets: 8, perTarget: .12, maximumBonus: .36, cooldown: 6 },
  gather: { delay: .8, damageFactor: 2.5, radius: 190, displacement: 110, cooldown: 9 },
  fan: { count: 5, spread: Math.PI / 12, speed: 800, radius: 27, range: 500, damageFactor: 2, returnDamageFactor: .5, cooldown: 14 },
  capsule: { speed: 900, radius: 12, range: 450, busy: .15 },
  spear: { count: 3, interval: .08, damageFactor: 1.6, range: 700, targets: 6, cooldown: 5 },
  cage: { delay: .8, damageFactor: 3, radius: 220, displacement: 120, cooldown: 9 },
  bladeDash: { range: 220, duration: .18, damageFactor: 3.64, cooldown: 6 },
  bladeGather: { delay: .4, damageFactor: 3.9, radius: 160, displacement: 90, cooldown: 9 },
  bladeExecute: { duration: .45, count: 3, damageFactor: 1.82, radius: 140, cooldown: 12 },
} as const;
type Definition = Omit<WeaponSkillView, 'remaining' | 'ready'>;
const kits: Record<WeaponId, readonly Omit<Definition, 'weaponId'>[]> = {
  steady: [
    { slot: 1, id: 'steady-burst', name: '猎群追针', cooldown: 5, range: 600, radius: 6, aim: 'direction', description: '0.42秒连发八根追踪蜂针，每根0.6倍伤害，追猎前方可见病毒。' },
    { slot: 2, id: 'steady-repulse', name: '排异双震', cooldown: 9, range: 0, radius: 190, aim: 'self', description: '近身2倍震环击退病毒，0.25秒后在原地追加1倍震爆；拦截弹体。' },
    { slot: 3, id: 'steady-overdrive', name: '蜂巢暴走', cooldown: 18, range: 0, radius: 0, aim: 'self', description: '5秒内射击间隔缩短25%，普攻额外两根各45%伤害侧针。' },
  ],
  piercing: [
    { slot: 1, id: 'piercing-heavy', name: '裂脉重刃', cooldown: 6, range: 720, radius: 24, aim: 'direction', description: '蓄势0.25秒发射5倍骨刃，最多贯穿八体，贯穿后继续强化后续伤害。' },
    { slot: 2, id: 'piercing-gather', name: '束脉涡锚', cooldown: 9, range: 450, radius: 190, aim: 'point', description: '针锚牵引190范围病毒0.8秒，再造成2.5倍爆破；精英位移衰减。' },
    { slot: 3, id: 'piercing-fan', name: '回缝刃潮', cooldown: 14, range: 500, radius: 27, aim: 'direction', description: '五片月牙去程2倍、回程1倍伤害；每体每程最多被两片命中，横移控制回收路线。' },
  ],
  thunder: [
    { slot: 1, id: 'thunder-spear', name: '断罪连爆', cooldown: 5, range: 0, radius: 300, aim: 'self', description: '引爆周身300范围及当前通电磁极覆盖区：感电目标受到4倍伤害并清除感电，其余受到1倍伤害，每体只结算一次。' },
    { slot: 2, id: 'thunder-cage', name: '引雷磁极', cooldown: 9, range: 450, radius: 200, aim: 'point', description: '立下持续4秒的磁极，落地1.5倍爆发并牵引0.4秒；按住普攻且与磁极450内通视时供电，与玩家共享电击目标预算。' },
    { slot: 3, id: 'thunder-overdrive', name: '雷遁穿场', cooldown: 10, range: 280, radius: 40, aim: 'direction', description: '化雷穿行280距离，0.18秒无敌并沿途造成一次2.5倍伤害；留下宽80、持续2.5秒的雷痕，每0.25秒造成0.25倍伤害并附加感电。' },
  ],
  redblade: [
    { slot: 1, id: 'redblade-dash', name: '破阵疾斩', cooldown: 6, range: 220, radius: 90, aim: 'direction', description: '0.18秒突进220距离，沿途每体受到一次3.64倍斩击；期间减伤70%，遇障碍截停。' },
    { slot: 2, id: 'redblade-parry', name: '逆鳞返刃', cooldown: 8, range: 320, radius: 70, aim: 'direction', description: '架刀0.45秒，前0.18秒完美弹反正面攻击并以6倍反击削韧；晚挡减伤75%接3.5倍反击，未受击收势2倍。' },
    { slot: 3, id: 'redblade-domain', name: '赤曜剑域', cooldown: 14, range: 0, radius: 220, aim: 'self', description: '随身剑域持续1.8秒，三次1.2倍环斩后接2.4倍收刀斩；期间减伤20%，可移动和普攻。' },
  ],
};
export function createWeaponCombat(loadout: ExpeditionLoadout = DEFAULT_EXPEDITION_LOADOUT): WeaponCombatState {
  return { loadout: { ...loadout }, serial: 0, cooldowns: { 1: 0, 2: 0, 3: 0 }, primaryBlockedUntil: 0,
    overdriveUntil: 0, reservedProjectiles: 0, ultimateEnergy: 0, creditedKillIds: [] };
}
export function weaponSkillsEnabled(state: GameState): boolean { return !!state.territory || !!state.weaponCombat; }
function combat(state: GameState): WeaponCombatState | undefined {
  if (!weaponSkillsEnabled(state)) return;
  return state.weaponCombat ??= createWeaponCombat(state.expedition?.loadout ?? DEFAULT_EXPEDITION_LOADOUT);
}
function stats(state: GameState): EndlessCombatStats { return endlessCombatStats(state.endlessGrowth ?? createEndlessGrowth(0)); }
function available(state: GameState): boolean { return weaponSkillsEnabled(state) && state.phase === 'playing' && state.player.hp > 0 && state.tissue.hp > 0
  && !(state.playerFlight && state.elapsed < state.playerFlight.landsAt); }
export function weaponBlocksPrimary(state: GameState): boolean {
  return weaponSkillsEnabled(state) && state.elapsed + 1e-8 < (state.weaponCombat?.primaryBlockedUntil ?? 0);
}
export function weaponPrimaryCooldown(state: GameState, profile: EndlessCombatStats): number {
  const runtime = state.weaponCombat;
  if (runtime?.loadout.weaponId === 'thunder') return THUNDER_BALANCE.primary.interval;
  if (runtime?.loadout.weaponId === 'piercing') return Math.ceil(profile.primaryCooldown * 1.6 / BALANCE.step - 1e-8) * BALANCE.step;
  if (runtime?.loadout.weaponId === 'redblade') {
    const last = runtime.meleeCombo ? (runtime.meleeCombo.index + 2) % 3 : 0;
    return Math.max(6, Math.ceil(REDBLADE_PRIMARY.ticks[last] * profile.primaryCooldown / BALANCE.cooldowns[1] - 1e-8)) * BALANCE.step;
  }
  if (!runtime || state.elapsed + 1e-8 >= runtime.overdriveUntil) return profile.primaryCooldown;
  return Math.max(WEAPON_SKILL_BALANCE.overdrive.minimumTicks,
    Math.ceil(profile.primaryCooldown * WEAPON_SKILL_BALANCE.overdrive.intervalFactor / BALANCE.step - 1e-8)) * BALANCE.step;
}
/** All production hosts, including the isolated camp trial, share this primary dispatch. */
export function launchWeaponPrimary(host: PlayerProjectileHost, aim: Vec, profile: EndlessCombatStats, castId: string): boolean {
  if (!Number.isFinite(aim.x) || !Number.isFinite(aim.y) || !weaponCombatAvailable(host.state) || weaponBlocksPrimary(host.state)) return false;
  if (host.state.weaponCombat?.loadout.weaponId === 'thunder') return startThunderPrimary(host, aim, profile, castId);
  return host.state.weaponCombat?.loadout.weaponId === 'redblade' ? launchRedbladePrimary(host, aim, profile, castId)
    : launchPrimary(host.state, aim, profile, castId);
}
export function weaponSkillDefinitions(weaponId: WeaponId): Definition[] { return kits[weaponId].map(definition => ({ ...definition, weaponId })); }
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
function launched(host: PlayerProjectileHost, id: import('./weaponSkillsTypes').WeaponSkillId, castId: string, aim: Vec, kind: string, count = 1): void {
  host.state.player.actionUntil = host.state.elapsed + .15;
  host.emit('PLAYER_PROJECTILE_LAUNCHED', { kind, castId, count, weaponId: host.state.weaponCombat!.loadout.weaponId,
    skillId: id, x: host.state.player.x, y: host.state.player.y, aimX: aim.x, aimY: aim.y });
}
function advanceAction(host: PlayerProjectileHost, aim: Vec): void {
  const state = host.state, runtime = state.weaponCombat; if (!runtime || !available(state)) return;
  const burst = runtime.burst;
  while (burst && runtime.burst === burst && burst.remaining > 0 && state.elapsed + 1e-8 >= burst.nextAt && host.state === state && available(state)) {
    runtime.reservedProjectiles--;
    const spear = burst.skillId === 'thunder-spear', id = spear ? 'thunder-spear' : 'steady-burst';
    const ordinal = (burst.count ?? WEAPON_SKILL_BALANCE.burst.count) - burst.remaining, b = WEAPON_SKILL_BALANCE.burst;
    const base = weaponAimDirection(state, aim), angle = Math.atan2(base.y, base.x) + (spear ? 0 : (ordinal - (b.count - 1) / 2) * b.spread);
    if (!launchWeaponVolley(state, aim, { castId: `${burst.castId}:${ordinal}`, kind: 'primary', damage: burst.damage,
      origin: { ...weaponOrigin(state, id, burst.castId), damageCategory: 'precision', armorResponse: spear ? 'heavy' : 'needle' },
      range: spear ? WEAPON_SKILL_BALANCE.spear.range : b.range, direction: { x: Math.cos(angle), y: Math.sin(angle) },
      speed: spear ? 1600 : 1100, radius: spear ? 14 : 6, hitsRemaining: spear ? WEAPON_SKILL_BALANCE.spear.targets : 1,
      visual: spear ? 'thunder-spear' : 'swarm-needle',
      ...(spear ? {} : { homing: { turnRate: b.turnRate, remainingTurn: b.turnBudget, range: b.range, acquireCos: Math.cos(.85), delay: .045 } }) })) {
      runtime.reservedProjectiles++; break;
    }
    burst.remaining--; burst.nextAt += burst.interval ?? b.interval;
    launched(host, id, `${burst.castId}:${ordinal}`, aim, 'primary');
    if (host.state !== state || state.weaponCombat !== runtime) return;
  }
  if (burst?.remaining === 0) delete runtime.burst;
  const preparation = runtime.preparation;
  if (preparation && state.elapsed + 1e-8 >= preparation.firesAt) {
    runtime.reservedProjectiles--;
    const b = WEAPON_SKILL_BALANCE.heavy;
    if (!launchWeaponVolley(state, aim, { castId: preparation.castId, kind: 'primary', damage: preparation.damage,
      origin: { ...weaponOrigin(state, 'piercing-heavy', preparation.castId), damageCategory: 'precision' }, direction: preparation.direction,
      speed: b.speed, radius: b.radius, range: b.range, hitsRemaining: b.targets, visual: 'heavy-blade',
      penetration: { perTarget: b.perTarget, maximum: b.maximumBonus } })) { runtime.reservedProjectiles++; return; }
    delete runtime.preparation;
    launched(host, 'piercing-heavy', preparation.castId,
      { x: state.player.x + preparation.direction.x * b.range, y: state.player.y + preparation.direction.y * b.range }, 'primary');
  }
  for (const action of [...(runtime.pendingActions ?? [])]) {
    if (host.state !== state || state.weaponCombat !== runtime || !available(state)) return;
    if (state.elapsed + 1e-8 < action.at || !runtime.pendingActions?.includes(action)) continue;
    runtime.pendingActions.splice(runtime.pendingActions.indexOf(action), 1); runtime.reservedProjectiles = Math.max(0, runtime.reservedProjectiles - 1);
    const center = action.center ?? { x: state.player.x, y: state.player.y }, origin = weaponOrigin(state, action.skillId, action.castId);
    if (action.pull) pullWeaponTargets(state, center, action.radius, action.pull);
    if (action.direction) weaponSweep(host, center, action.direction, action.radius, action.halfAngle ?? Math.PI, action.damage, origin);
    else weaponRadialDamage(host, center, action.radius, action.damage, origin);
  }
}
export function castWeaponSkill(host: PlayerProjectileHost, slot: WeaponSkillSlot, aim: Vec): boolean {
  const state = host.state;
  if (![1, 2, 3].includes(slot) || !available(state) || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return false;
  const runtime = combat(state)!, view = weaponSkillViews(state)[slot - 1]; if (!view.ready) return false;
  const profile = stats(state), damage = weaponCombatProfile(runtime.loadout, profile.damageMultiplier).primaryDamage;
  const id = view.id, castId = `weapon:${runtime.loadout.weaponId}:${++runtime.serial}`, b = WEAPON_SKILL_BALANCE;
  let accepted = false;
  if (runtime.loadout.weaponId === 'thunder') {
    accepted = castThunderSkill(host, slot, aim, castId);
  } else if (id === 'steady-burst') {
    if (!reservePlayerProjectiles(state, b.burst.count)) return false;
    runtime.burst = { castId, nextAt: state.elapsed, remaining: b.burst.count, damage: damage * b.burst.damageFactor };
    runtime.primaryBlockedUntil = state.elapsed + b.burst.interval * (b.burst.count - 1); accepted = true;
  } else if (id === 'piercing-heavy') {
    if (!reservePlayerProjectiles(state, 1)) return false;
    runtime.preparation = { castId, firesAt: state.elapsed + b.heavy.prepare, direction: weaponAimDirection(state, aim), damage: damage * b.heavy.damageFactor };
    runtime.primaryBlockedUntil = state.elapsed + b.heavy.prepare; accepted = true;
  } else if (id === 'steady-overdrive') {
    runtime.overdriveUntil = state.elapsed + b.overdrive.duration; accepted = true;
  } else if (id === 'steady-repulse' || id === 'piercing-gather' || id === 'redblade-gather') {
    const self = id === 'steady-repulse' || id === 'redblade-gather';
    const config = id === 'steady-repulse' ? b.repulse : id === 'piercing-gather' ? b.gather : b.bladeGather;
    const extra = id === 'steady-repulse' ? 1 : 0;
    if (extra && !reservePlayerProjectiles(state, extra)) return false;
    accepted = launchWeaponVolley(state, self ? state.player : aim, { castId, kind: 'cannon', origin: weaponOrigin(state, id, castId),
      speed: b.capsule.speed, radius: b.capsule.radius, range: self ? 0 : b.capsule.range,
      damage: damage * config.damageFactor * profile.areaDamageMultiplier, explosionRadius: view.radius,
      impactDelay: id === 'steady-repulse' ? 0 : (config as { delay: number }).delay, aftershock: profile.catalysisDamage > 0,
      displacement: { kind: id === 'steady-repulse' ? 'push' : 'pull', maximum: config.displacement },
      visual: id === 'steady-repulse' ? 'pulse-ring' : 'anchor' });
    if (!accepted && extra) runtime.reservedProjectiles -= extra;
    if (accepted) {
      runtime.primaryBlockedUntil = state.elapsed + b.capsule.busy;
      if (id === 'steady-repulse') (runtime.pendingActions ??= []).push({ at: state.elapsed + .25, castId,
        skillId: id, damage: damage * profile.areaDamageMultiplier, radius: view.radius, center: { x: state.player.x, y: state.player.y } });
    }
  } else if (id === 'piercing-fan') {
    accepted = launchWeaponVolley(state, aim, { castId, kind: 'sword', origin: weaponOrigin(state, id, castId),
      damage: damage * b.fan.damageFactor, count: b.fan.count, spread: b.fan.spread, speed: b.fan.speed,
      radius: b.fan.radius, range: b.fan.range, hitsRemaining: Number.MAX_SAFE_INTEGER, shareHits: true, sharedHitLimit: 2,
      visual: 'storm-crescent', returnFlight: { damageFactor: b.fan.returnDamageFactor, range: 1100, lifetime: 2.8 } });
    if (accepted) runtime.primaryBlockedUntil = state.elapsed + b.capsule.busy;
  } else if (id === 'redblade-dash') {
    runtime.meleeDash = { castId, until: state.elapsed + b.bladeDash.duration, lastAt: state.elapsed, direction: weaponAimDirection(state, aim),
      speed: b.bladeDash.range / b.bladeDash.duration, damage: damage * b.bladeDash.damageFactor, hitIds: [] };
    runtime.primaryBlockedUntil = runtime.meleeDash.until; setWeaponMitigation(state, runtime.meleeDash.until, .3); accepted = true;
  } else if (id === 'redblade-parry') {
    runtime.bladeParry = { castId, startedAt: state.elapsed, until: state.elapsed + BLADE_TECHNIQUES.parry.duration,
      direction: weaponAimDirection(state, aim), damage, resolved: false };
    runtime.primaryBlockedUntil = runtime.bladeParry.until; accepted = true;
  } else if (id === 'redblade-domain') {
    runtime.bladeDomain = { castId, startedAt: state.elapsed, until: state.elapsed + 1.8, next: 0, damage };
    setWeaponMitigation(state, state.elapsed + 1.8, .8); accepted = true;
  } else if (id === 'redblade-execute') {
    if (!reservePlayerProjectiles(state, 3)) return false;
    const direction = weaponAimDirection(state, aim);
    for (let n = 0; n < 3; n++) (runtime.pendingActions ??= []).push({ at: state.elapsed + n * .225, castId, skillId: id,
      damage: damage * b.bladeExecute.damageFactor, radius: b.bladeExecute.radius, direction, halfAngle: Math.PI * .7 });
    runtime.executionRefund = { castId, until: state.elapsed + .45, used: false };
    runtime.primaryBlockedUntil = state.elapsed + .45; setWeaponMitigation(state, state.elapsed + .45, .65); accepted = true;
  }
  if (!accepted) return false;
  runtime.cooldowns[slot] = state.elapsed + view.cooldown;
  host.emit('WEAPON_SKILL_CAST', { weaponId: runtime.loadout.weaponId, skillId: id, slot, castId,
    x: state.player.x, y: state.player.y, aimX: aim.x, aimY: aim.y, readyAt: runtime.cooldowns[slot] });
  if (host.state !== state || state.phase !== 'playing' || state.weaponCombat !== runtime) return true;
  if (runtime.loadout.weaponId === 'thunder') return true;
  if (id === 'steady-burst' || id === 'redblade-execute') advanceAction(host, aim);
  else if (id === 'steady-repulse') resolveWeaponPulse(host, castId);
  else if (!id.endsWith('overdrive') && !['piercing-heavy', 'redblade-dash', 'redblade-parry', 'redblade-domain'].includes(id))
    launched(host, id, castId, aim, id === 'piercing-fan' ? 'sword' : 'cannon', id === 'piercing-fan' ? 5 : 1);
  return true;
}
export function advanceWeaponSkills(host: PlayerProjectileHost, aim: Vec, dt: number = BALANCE.step, primaryHeld?: boolean): void {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return;
  advanceWeaponMelee(host, dt);
  advanceAction(host, aim);
  advanceBladeTechniques(host);
  advanceThunderCombat(host, aim, dt, primaryHeld ?? false);
  advanceWeaponUltimates(host);
}
/** Dash cancels unlaunched ordinary commitments. Clear/end cancels active fields too. */
export function cancelWeaponAction(state: GameState, clearActive = false): void {
  const runtime = state.weaponCombat; if (!runtime) return;
  const traceBlockedUntil = runtime.bladeTrace ? runtime.primaryBlockedUntil : 0;
  delete runtime.burst; delete runtime.preparation; delete runtime.pendingActions; delete runtime.meleeDash;
  delete runtime.executionRefund; delete runtime.meleeCombo;
  delete runtime.bladeParry;
  stopThunderPrimary(state); if (runtime.thunder) delete runtime.thunder.dash;
  runtime.primaryBlockedUntil = Math.min(runtime.primaryBlockedUntil, state.elapsed);
  if (clearActive) { clearThunderCombat(state); delete runtime.ultimate; delete runtime.bladeTrace; delete runtime.bladeDomain; delete runtime.mitigations; runtime.overdriveUntil = state.elapsed; }
  else if (runtime.bladeTrace) runtime.primaryBlockedUntil = Math.max(runtime.primaryBlockedUntil, runtime.bladeTrace.until, traceBlockedUntil);
  runtime.reservedProjectiles = runtime.ultimate?.reserved ?? 0;
}
