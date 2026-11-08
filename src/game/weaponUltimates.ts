import { distance, normalized, wallHit } from '../actors/collision';
import { createEndlessGrowth, endlessCombatStats } from './endlessGrowth';
import { weaponCombatProfile, type WeaponId } from './expedition';
import type { DamageOrigin } from './growthTypes';
import { launchWeaponVolley, reservePlayerProjectiles, type PlayerProjectileHost } from './playerProjectiles';
import { activeWorld, type GameState, type Target, type Vec } from './types';
import { creditWeaponExecutionKill, setWeaponMitigation, visibleWeaponTargets, weaponAimDirection, weaponCombatAvailable, weaponOrigin, weaponRadialDamage } from './weaponMelee';
import type { WeaponUltimateId, WeaponUltimateView } from './weaponSkillsTypes';
import { beginBladeTrace, BLADE_TECHNIQUES } from './bladeTechniques';
import { beginThunderStorm, canRecastThunder, recastThunderStorm, THUNDER_BALANCE } from './thunderCombat';

export const WEAPON_ULTIMATE_BALANCE = { energy: 100, ordinaryEnergy: 2, eliteEnergy: 12, bossDamageEnergy: 200,
  hive: { duration: 3.6, waves: 4, count: 6, interval: .9, needleFactor: .5, finalFactor: 2, radius: 180, range: 650 },
  wheel: { range: 780, radius: 70, damageFactor: 6, finalFactor: 4, finalRadius: 230 },
  thunder: { duration: THUNDER_BALANCE.storm.duration, pulses: 12, interval: THUNDER_BALANCE.storm.interval,
    pulseFactor: THUNDER_BALANCE.storm.factor, finalFactor: THUNDER_BALANCE.storm.finalFactor,
    radius: THUNDER_BALANCE.storm.radius, range: 0 },
  blade: { duration: 3, pulses: 6, interval: .5, pulseFactor: 1.69, finalFactor: 6.5, radius: 280 },
} as const;
type Definition = Omit<WeaponUltimateView, 'energy' | 'ready' | 'active' | 'remaining'>;
const definitions: Record<WeaponId, Definition> = {
  steady: { id: 'steady-ultimate', weaponId: 'steady', name: '蜂后歼灭阵', required: 100, range: 650, radius: 180, aim: 'self',
    description: '展开蜂后枪阵，四轮共24根追踪蜂针猎杀可见病毒，3.6秒后以近身震爆收尾。' },
  piercing: { id: 'piercing-ultimate', weaponId: 'piercing', name: '贯脉天轮', required: 100, range: 780, radius: 70, aim: 'direction',
    description: '投出巨型天轮，去回各造成6倍伤害；实际收回时追加4倍圆斩，受组织和护膜阻挡。' },
  thunder: { id: 'thunder-ultimate', weaponId: 'thunder', name: '天穹裁决·万雷归一', required: 100, range: 0, radius: 360, aim: 'self',
    description: '随身雷暴最多6秒，每0.5秒最多轰击12体，各0.5倍伤害；0.35秒后再按4可主动收束，0.25秒后终审造成4倍伤害，感电目标按积蓄时长额外受到最多4倍伤害并清除感电。' },
  redblade: { id: 'redblade-ultimate', weaponId: 'redblade', name: '四曜穿心', required: 100,
    range: BLADE_TECHNIQUES.trace.range, radius: BLADE_TECHNIQUES.trace.width, aim: 'self',
    description: '3秒内拖线连起四个亮点，短暂凝神拔刀后沿路线闪切；超时自动补线。宽幅穿刺与落点冲击造成12倍伤害，普通标记处决，每点重创精英18倍、母巢10倍并削韧；手绘范围更大、伤害提高35%。' },
};
export function weaponUltimateDefinition(weaponId: WeaponId): Definition { return { ...definitions[weaponId] }; }
export function weaponUltimateView(state: GameState): WeaponUltimateView | undefined {
  const runtime = state.weaponCombat;
  if (!runtime) return;
  const active = !!runtime.bladeTrace || !!runtime.ultimate && state.elapsed < runtime.ultimate.until + 1e-8;
  return { ...weaponUltimateDefinition(runtime.loadout.weaponId), energy: Math.min(100, Math.max(0, runtime.ultimateEnergy ?? 0)), active,
    remaining: Math.max(0, (runtime.bladeTrace ? runtime.bladeTrace.phase === 'drawing' ? runtime.bladeTrace.deadline : runtime.bladeTrace.until : runtime.ultimate?.until ?? 0) - state.elapsed),
    canRecast: runtime.loadout.weaponId === 'thunder' && canRecastThunder(state),
    ready: weaponCombatAvailable(state) && !active && (runtime.ultimateEnergy ?? 0) >= 100 && state.elapsed >= runtime.primaryBlockedUntil };
}
export function fillWeaponUltimate(state: GameState): void { if (state.weaponCombat) state.weaponCombat.ultimateEnergy = 100; }

function ultimateDamage(origin: DamageOrigin): boolean {
  return !!(origin.ultimateId || origin.skillId?.endsWith('-ultimate') || origin.rootId?.includes(':ultimate:'));
}

/** Called once after the shared damage transaction has applied the actual HP loss. */
export function creditWeaponBossDamage(state: GameState, target: Target, actual: number, origin: DamageOrigin): number {
  const runtime = state.weaponCombat;
  if (!runtime || state.phase !== 'playing' || target.role !== 'core' || !state.targets.includes(target)
    || !Number.isFinite(actual) || actual <= 0 || !Number.isFinite(target.maxHp) || target.maxHp <= 0
    || origin.ability === 'host-event' || ultimateDamage(origin)) return 0;
  const before = runtime.ultimateEnergy ?? 0;
  const next = Math.min(WEAPON_ULTIMATE_BALANCE.energy,
    before + Math.min(actual, target.maxHp) / target.maxHp * WEAPON_ULTIMATE_BALANCE.bossDamageEnergy);
  runtime.ultimateEnergy = next >= WEAPON_ULTIMATE_BALANCE.energy - 1e-9 ? WEAPON_ULTIMATE_BALANCE.energy : next;
  return runtime.ultimateEnergy - before;
}

/** Called from the authoritative positive-to-zero damage transaction, before callbacks. */
export function creditWeaponKill(state: GameState, target: Target, origin: DamageOrigin): number {
  const runtime = state.weaponCombat;
  if (!runtime || state.phase !== 'playing' || target.hp > 0 || !state.targets.includes(target)
    || !['virus', 'elite', 'source', 'nest', 'core'].includes(target.role ?? '') || origin.ability === 'host-event') return 0;
  // Only retained bodies can be presented to this transaction again. Keeping
  // removed actor IDs forever would grow an endless run's weapon state without bound.
  const presentIds = new Set(state.targets.map(body => body.id));
  const credited = runtime.creditedKillIds = (runtime.creditedKillIds ?? []).filter(id => presentIds.has(id));
  if (credited.includes(target.id)) return 0;
  credited.push(target.id);
  creditWeaponExecutionKill(state, target, origin);
  // The provenance flag and root marker also cover delayed or protocol descendants.
  // Cores already award their energy per actual HP lost, including the final hit.
  if (target.role === 'core' || ultimateDamage(origin)) return 0;
  const before = runtime.ultimateEnergy ?? 0;
  const award = target.role === 'source' || target.role === 'nest' ? 20
    : target.role === 'elite' ? 12 : (target.generation ?? 0) > 0 ? 1 : 2;
  runtime.ultimateEnergy = Math.min(100, before + award);
  return runtime.ultimateEnergy - before;
}
function boundedPoint(state: GameState, aim: Vec, range: number): Vec {
  const direction = weaponAimDirection(state, aim), gap = Math.min(range, distance(state.player, aim));
  const block = wallHit(state.player, direction, gap, activeWorld(state));
  const length = block === null ? gap : Math.max(0, block - 2);
  return { x: state.player.x + direction.x * length, y: state.player.y + direction.y * length };
}
export function castWeaponUltimate(host: PlayerProjectileHost, aim: Vec): boolean {
  const state = host.state, runtime = state.weaponCombat, view = weaponUltimateView(state);
  if (runtime && view?.canRecast) return recastThunderStorm(host);
  if (!runtime || !view?.ready || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return false;
  if (view.id === 'thunder-ultimate') {
    const growth = endlessCombatStats(state.endlessGrowth ?? createEndlessGrowth(0));
    const base = weaponCombatProfile(runtime.loadout, growth.damageMultiplier).primaryDamage;
    const castId = `weapon:thunder:ultimate:${++runtime.serial}`;
    beginThunderStorm(host, castId, base);
    runtime.ultimate = { id: view.id, castId, startedAt: state.elapsed, until: state.elapsed + THUNDER_BALANCE.storm.duration,
      nextAt: state.elapsed + THUNDER_BALANCE.storm.interval, index: 0, reserved: 0, damage: base, aim: { ...state.player }, direction: weaponAimDirection(state, aim) };
    runtime.ultimateEnergy = 0;
    host.emit('WEAPON_ULTIMATE_CAST', { weaponId: 'thunder', ultimateId: view.id, skillId: view.id, castId,
      x: state.player.x, y: state.player.y, aimX: state.player.x, aimY: state.player.y, radius: THUNDER_BALANCE.storm.radius, until: runtime.ultimate.until });
    return true;
  }
  if (view.id === 'redblade-ultimate') {
    const castId = `weapon:redblade:ultimate:${runtime.serial + 1}`;
    if (!beginBladeTrace(host, castId)) return false;
    const trace = runtime.bladeTrace!;
    runtime.serial++; runtime.ultimateEnergy = 0;
    runtime.ultimate = { id: view.id, castId, startedAt: state.elapsed, until: trace.until, nextAt: state.elapsed,
      index: 0, reserved: 0, damage: trace.damage, aim: { ...aim }, direction: weaponAimDirection(state, aim) };
    host.emit('WEAPON_ULTIMATE_CAST', { weaponId: 'redblade', ultimateId: view.id, skillId: view.id, castId,
      x: state.player.x, y: state.player.y, aimX: aim.x, aimY: aim.y, radius: 650, until: trace.deadline });
    if (host.state === state && state.phase === 'playing' && runtime.bladeTrace === trace)
      host.emit('BLADE_TRACE_STARTED', { castId, x: state.player.x, y: state.player.y, until: trace.deadline, marks: 4 });
    return true;
  }
  const id = view.id, reservation = id === 'steady-ultimate' ? 25 : id === 'piercing-ultimate' ? 1 : 7;
  if (!reservePlayerProjectiles(state, reservation)) return false;
  const growth = endlessCombatStats(state.endlessGrowth ?? createEndlessGrowth(0));
  const damage = weaponCombatProfile(runtime.loadout, growth.damageMultiplier).primaryDamage;
  const castId = `weapon:${runtime.loadout.weaponId}:ultimate:${++runtime.serial}`;
  const duration = id === 'steady-ultimate' ? 3.6 : id === 'piercing-ultimate' ? 4 : 3;
  runtime.ultimate = { id, castId, startedAt: state.elapsed, until: state.elapsed + duration, nextAt: state.elapsed,
    index: 0, reserved: reservation, damage, aim: boundedPoint(state, aim, view.range), direction: weaponAimDirection(state, aim) };
  runtime.ultimateEnergy = 0;
  host.emit('WEAPON_ULTIMATE_CAST', { weaponId: runtime.loadout.weaponId, ultimateId: id, skillId: id, castId,
    x: state.player.x, y: state.player.y, aimX: runtime.ultimate.aim.x, aimY: runtime.ultimate.aim.y,
    radius: view.radius, until: runtime.ultimate.until });
  if (host.state === state && state.weaponCombat === runtime && weaponCombatAvailable(state)) advanceWeaponUltimates(host);
  return true;
}
export function advanceWeaponUltimates(host: PlayerProjectileHost): void {
  const state = host.state, runtime = state.weaponCombat, action = runtime?.ultimate;
  if (!runtime || !action || !weaponCombatAvailable(state)) return;
  if (action.id === 'redblade-ultimate' || action.id === 'thunder-ultimate') return;
  const valid = () => host.state === state && state.weaponCombat === runtime && runtime.ultimate === action && weaponCombatAvailable(state);
  const spendReservation = (count: number) => { action.reserved -= count; runtime.reservedProjectiles = Math.max(0, runtime.reservedProjectiles - count); };
  if (action.id === 'piercing-ultimate') {
    if (action.index === 0) {
      spendReservation(1); action.index = 1;
      launchWeaponVolley(state, action.aim, { castId: action.castId, kind: 'sword', origin: weaponOrigin(state, action.id, action.castId),
        damage: action.damage * 6, speed: 900, radius: 70, range: 780, direction: action.direction,
        hitsRemaining: Number.MAX_SAFE_INTEGER, visual: 'ultimate-wheel',
        returnFlight: { damageFactor: 1, range: 1400, lifetime: 4 }, returnPulse: { damage: action.damage * 4, radius: 230 } });
    }
    if (state.elapsed + 1e-8 >= action.until) delete runtime.ultimate;
    return;
  }
  while (valid() && state.elapsed + 1e-8 >= action.nextAt && action.reserved > 0) {
    if (action.id === 'steady-ultimate' && action.index < 4) {
      spendReservation(6);
      const targets = visibleWeaponTargets(state, state.player, 650).filter(target => target.role !== 'event' && target.role !== 'capsule');
      for (let n = 0; n < 6; n++) {
        const target = targets[(action.index * 6 + n) % Math.max(1, targets.length)];
        const angle = state.player.facing + (n - 2.5) * .3;
        const direction = target ? normalized(target.x - state.player.x, target.y - state.player.y) : { x: Math.cos(angle), y: Math.sin(angle) };
        launchWeaponVolley(state, target ?? action.aim, { castId: `${action.castId}:${action.index}:${n}`, kind: 'primary',
          damage: action.damage * .5, direction, range: 650, speed: 1100, visual: 'ultimate-needle',
          origin: weaponOrigin(state, action.id, action.castId),
          homing: { targetId: target?.id, turnRate: 8, remainingTurn: 1.2, range: 650, acquireCos: -1, delay: 0 } });
      }
      action.index++; action.nextAt = action.startedAt + action.index * .9;
    } else {
      spendReservation(1);
      const hive = action.id === 'steady-ultimate', final = hive || action.index >= 6;
      const center = { x: state.player.x, y: state.player.y };
      const radius = hive ? 180 : 280;
      const factor = final ? hive ? 2 : 5 : 1.69;
      const origin = weaponOrigin(state, action.id, action.castId);
      action.index++; action.nextAt = action.startedAt + Math.min(action.index, 6) * .5;
      host.emit('WEAPON_ULTIMATE_PULSE', { weaponId: runtime.loadout.weaponId, ultimateId: action.id,
        skillId: action.id, castId: action.castId, x: center.x, y: center.y, radius, final, index: action.index });
      if (!valid()) return;
      weaponRadialDamage(host, center, radius, action.damage * factor, origin);
      if (final && valid()) { delete runtime.ultimate; break; }
    }
  }
}
