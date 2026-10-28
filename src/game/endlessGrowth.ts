import { SeedRng } from '../core/rng';
import type { EndlessCombatStats, EndlessGrowthState, EndlessUpgradeId, EndlessUpgradeOption } from './endlessGrowthTypes';
import { BALANCE } from './types';
import { IMMUNE_GUARD_BALANCE } from './immuneFocus';

export type * from './endlessGrowthTypes';

export const ENDLESS_UPGRADE_IDS: readonly EndlessUpgradeId[] = ['power', 'multishot', 'pierce', 'nova', 'dash', 'scan', 'vitality', 'haste', 'immune', 'catalysis'];
export const CATALYSIS_UPGRADE_BALANCE = {
  minimumChoice: 6, maxTargets: 3, duration: 4, radius: 110, damageMultiplier: 1.25, primerDamageCap: 8,
} as const;
const PRIMARY_BASE_TICKS = Math.ceil(BALANCE.cooldowns[1] / BALANCE.step);
// The old .09s floor already fired every six 60Hz ticks. Keep that real floor,
// and use one fewer tick per rank so no accepted haste rank is a dead choice.
const PRIMARY_MIN_TICKS = 6;

export const ENDLESS_UPGRADES: Record<EndlessUpgradeId, { title: string; maxRank?: number; newMechanic: boolean }> = {
  power: { title: '净化突破', newMechanic: false },
  multishot: { title: '扇形抗体', maxRank: 2, newMechanic: true },
  pierce: { title: '贯穿净化', maxRank: 3, newMechanic: true },
  nova: { title: '裂解新星', maxRank: 6, newMechanic: false },
  dash: { title: '冲刺斩', newMechanic: true },
  scan: { title: '扫描爆发', newMechanic: true },
  vitality: { title: '生命扩容', newMechanic: false },
  haste: { title: '急速净化', maxRank: PRIMARY_BASE_TICKS - PRIMARY_MIN_TICKS, newMechanic: false },
  immune: { title: '免疫军团', newMechanic: false },
  catalysis: { title: '催化裂解', maxRank: 1, newMechanic: true },
};

const MAX_COUNT = Number.MAX_SAFE_INTEGER;
const count = (value: number | undefined): number => Number.isSafeInteger(value) && value! >= 0 ? value! : 0;
const rank = (growth: EndlessGrowthState, id: EndlessUpgradeId): number => count(growth.ranks[id]);
const effectiveRank = (growth: EndlessGrowthState, id: EndlessUpgradeId): number => Math.min(rank(growth, id), ENDLESS_UPGRADES[id].maxRank ?? MAX_COUNT);
const knownId = (id: string): id is EndlessUpgradeId => ENDLESS_UPGRADE_IDS.some(candidate => candidate === id);

export function createEndlessGrowth(seed: number): EndlessGrowthState {
  return { seed: seed >>> 0, ranks: {}, level: 0, draft: null, offeredThroughWave: 0, history: [] };
}

/** Pure parameter projection. It never changes HP, clocks, enemies or equipment. */
export function endlessCombatStats(growth: EndlessGrowthState): EndlessCombatStats {
  const power = rank(growth, 'power'), multishot = effectiveRank(growth, 'multishot'), pierce = effectiveRank(growth, 'pierce');
  const nova = effectiveRank(growth, 'nova'), dash = rank(growth, 'dash'), scan = rank(growth, 'scan');
  const vitality = rank(growth, 'vitality'), haste = effectiveRank(growth, 'haste'), immune = rank(growth, 'immune');
  const damageMultiplier = 1 + power * .18, areaDamageMultiplier = 1 + nova * .15;
  return {
    damageMultiplier,
    shotRays: 1 + multishot * 2,
    pierceCount: pierce,
    areaRadius: 94 + nova * 14,
    areaDamageMultiplier,
    primaryCooldown: haste === 0 ? BALANCE.cooldowns[1] : Math.max(PRIMARY_MIN_TICKS, PRIMARY_BASE_TICKS - haste) * BALANCE.step,
    areaCooldown: Math.max(.6, Number((1.2 - nova * .1).toFixed(6))),
    dashDamage: dash * 40,
    scanDamage: scan * 30,
    maxHp: 100 + vitality * 20,
    cellDamageMultiplier: 1 + immune * .2,
    scanCooldown: Math.max(1.5, 3 / (1 + immune * .12)),
    cellDurationBonus: Math.min(8, immune * 1.25),
    cellCooldownMultiplier: Math.max(.5, 1 / (1 + immune * .15)),
    catalysisDamage: effectiveRank(growth, 'catalysis') > 0
      ? BALANCE.damage[2] * damageMultiplier * areaDamageMultiplier * CATALYSIS_UPGRADE_BALANCE.damageMultiplier : 0,
  };
}

const display = (value: number): string => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
export const isEndlessBreakthrough = (wave: number): boolean => Number.isSafeInteger(wave) && wave >= 5 && wave % 5 === 0;

function optionFor(growth: EndlessGrowthState, id: EndlessUpgradeId, wave: number): EndlessUpgradeOption {
  const currentRank = rank(growth, id);
  const nextRank = Math.min(currentRank + (isEndlessBreakthrough(wave) ? 2 : 1), ENDLESS_UPGRADES[id].maxRank ?? MAX_COUNT);
  const before = endlessCombatStats(growth), after = endlessCombatStats({ ...growth, ranks: { ...growth.ranks, [id]: nextRank } });
  const beforeShotTicks = Math.ceil(before.primaryCooldown / BALANCE.step - 1e-9), afterShotTicks = Math.ceil(after.primaryCooldown / BALANCE.step - 1e-9);
  const change = (a: number, b: number) => `${display(a)} → ${display(b)}`;
  const areaDamage = BALANCE.damage[2] * before.damageMultiplier * before.areaDamageMultiplier;
  const description: Record<EndlessUpgradeId, string> = {
    power: `基础净化伤害倍率 ×${display(before.damageMultiplier)} → ×${display(after.damageMultiplier)}；强化现有攻击。`,
    multishot: `精准净化 ${change(before.shotRays, after.shotRays)} 束；向左右同时发射更多抗体。`,
    pierce: `每束精准射线额外贯穿 ${change(before.pierceCount, after.pierceCount)} 个敌体，遵循组织碰撞。`,
    nova: `范围裂解半径 ${change(before.areaRadius, after.areaRadius)}，伤害倍率 ${change(before.areaDamageMultiplier, after.areaDamageMultiplier)}，冷却 ${change(before.areaCooldown, after.areaCooldown)} 秒。`,
    dash: `Space 沿实际冲刺路径斩击周围敌人，基础伤害 ${change(before.dashDamage, after.dashDamage)}，判定半径 64。`,
    scan: `Q 扫描同时引爆身边 260 范围，基础伤害 ${change(before.scanDamage, after.scanDamage)}；扫描显形继续生效。`,
    vitality: `最大耐久 ${change(before.maxHp, after.maxHp)}；本次补给按新的耐久上限结算。`,
    haste: `精准净化间隔约 ${change(beforeShotTicks * BALANCE.step, afterShotTicks * BALANCE.step)} 秒；射速约 ${change(1 / (beforeShotTicks * BALANCE.step), 1 / (afterShotTicks * BALANCE.step))} 发/秒；整组扇射共用一次间隔。`,
    immune: `免疫细胞伤害倍率 ${change(before.cellDamageMultiplier, after.cellDamageMultiplier)}，额外寿命 ${change(before.cellDurationBonus, after.cellDurationBonus)} 秒；Q 冷却 ${change(before.scanCooldown, after.scanCooldown)} 秒，小队独立冷却倍率 ${change(before.cellCooldownMultiplier, after.cellCooldownMultiplier)}。${nextRank >= IMMUNE_GUARD_BALANCE.minimumRank
      ? `${currentRank < IMMUNE_GUARD_BALANCE.minimumRank ? '新操作：' : ''}组织驻防已解锁：${IMMUNE_GUARD_BALANCE.commandRange} 范围内 Q 瞄准十字组织，小队守备 ${IMMUNE_GUARD_BALANCE.radius} 范围并优先拦截袭击者；你可离开，细胞仍须真实到达和接触。Q 指敌或空地改令，不续命、不重置咬击。`
      : `${IMMUNE_GUARD_BALANCE.minimumRank} 阶解锁新操作：Q 点组织驻防，优先拦截袭击组织者。`}`,
    catalysis: `改变工具 2：直伤 ${change(areaDamage, Math.min(CATALYSIS_UPGRADE_BALANCE.primerDamageCap, areaDamage))}，取消击退。最多 ${CATALYSIS_UPGRADE_BALANCE.maxTargets} 个实际受击存活目标铺标 ${CATALYSIS_UPGRADE_BALANCE.duration} 秒；随后用 1 正伤命中或真实细胞接触咬击，整批引爆一次。爆发半径 ${CATALYSIS_UPGRADE_BALANCE.radius}、最多 ${CATALYSIS_UPGRADE_BALANCE.maxTargets} 体，每体伤害 ${display(after.catalysisDamage)}（原工具 2 完整成长伤害 ×${CATALYSIS_UPGRADE_BALANCE.damageMultiplier}，按本次铺标捕获）。再次 2 的有效铺标覆盖旧批，不叠加。`,
  };
  return { id, title: ENDLESS_UPGRADES[id].title, description: description[id], currentRank, nextRank };
}

function available(growth: EndlessGrowthState, id: EndlessUpgradeId): boolean {
  const current = rank(growth, id);
  if (current >= (ENDLESS_UPGRADES[id].maxRank ?? MAX_COUNT)) return false;
  if (id === 'catalysis' && (count(growth.level) < CATALYSIS_UPGRADE_BALANCE.minimumChoice - 1
    || rank(growth, 'nova') < 1 && rank(growth, 'immune') < 1)) return false;
  const before = endlessCombatStats(growth), after = endlessCombatStats({ ...growth, ranks: { ...growth.ranks, [id]: current + 1 } });
  // Even at the finite representation limit, never offer an upgrade whose
  // actual projected parameters would be unchanged by floating-point rounding.
  return (Object.keys(before) as (keyof EndlessCombatStats)[]).some(key => after[key] !== before[key]);
}

function shuffled<T>(items: readonly T[], rng: SeedRng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(0, i); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** One pending offer at a time; completed/older waves cannot be farmed again. */
export function offerEndlessUpgrade(growth: EndlessGrowthState, wave: number): void {
  if (!Number.isSafeInteger(wave) || wave < 1 || growth.draft || wave <= count(growth.offeredThroughWave) || count(growth.level) >= MAX_COUNT) return;
  const pool = ENDLESS_UPGRADE_IDS.filter(id => available(growth, id));
  if (pool.length < 3) return;
  // Choices depend on logical seed, wave and accepted level, never wall time,
  // rendering, another controller's RNG or the bounded presentation history.
  const rng = new SeedRng((growth.seed ^ Math.imul(wave, 0x9e3779b1) ^ Math.imul(growth.level + 1, 0x85ebca6b)) >>> 0);
  let selected: EndlessUpgradeId[];
  if (growth.level === 0 && rank(growth, 'multishot') === 0 && rank(growth, 'immune') === 0) {
    selected = ['multishot', 'immune', shuffled(pool.filter(id => id !== 'multishot' && id !== 'immune'), rng)[0]];
  } else {
    const unlearned = pool.filter(id => ENDLESS_UPGRADES[id].newMechanic && rank(growth, id) === 0);
    const guaranteed = unlearned.length ? [shuffled(unlearned, rng)[0]] : [];
    selected = [...guaranteed, ...shuffled(pool.filter(id => !guaranteed.includes(id)), rng)].slice(0, 3);
  }
  growth.draft = { id: `endless:${growth.seed}:wave:${wave}:level:${growth.level + 1}`, wave,
    ...(isEndlessBreakthrough(wave) ? { breakthrough: true } : {}),
    options: shuffled(selected, rng).map(id => optionFor(growth, id, wave)) as [EndlessUpgradeOption, EndlessUpgradeOption, EndlessUpgradeOption] };
  growth.offeredThroughWave = wave;
}

/** Commit only an offered current option. Repeated/stale choices have no effect. */
export function chooseEndlessUpgrade(growth: EndlessGrowthState, draftId: string, upgradeId: EndlessUpgradeId): boolean {
  const draft = growth.draft;
  if (!draft || draft.id !== draftId || !knownId(upgradeId) || count(growth.level) >= MAX_COUNT) return false;
  if (draft.wave !== growth.offeredThroughWave || draft.id !== `endless:${growth.seed}:wave:${draft.wave}:level:${growth.level + 1}`) return false;
  const option = draft.options.find(item => item.id === upgradeId);
  if (!option || option.currentRank !== rank(growth, upgradeId) || !available(growth, upgradeId)) return false;
  // Descriptions are regenerated from the actual parameters at commit time;
  // mutable display text is never the authority for the applied upgrade.
  const actual = optionFor(growth, upgradeId, draft.wave);
  if (option.nextRank !== actual.nextRank) return false;
  growth.ranks[upgradeId] = actual.nextRank;
  growth.level++;
  growth.lastChoice = { upgradeId, title: actual.title, description: actual.description };
  growth.history.push({ ...growth.lastChoice, wave: draft.wave, level: growth.level, rank: actual.nextRank });
  if (growth.history.length > 20) growth.history.splice(0, growth.history.length - 20);
  growth.draft = null;
  return true;
}
