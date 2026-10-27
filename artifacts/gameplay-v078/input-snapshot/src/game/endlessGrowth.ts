import { SeedRng } from '../core/rng';
import type { EndlessCombatStats, EndlessGrowthState, EndlessUpgradeId, EndlessUpgradeOption } from './endlessGrowthTypes';

export type * from './endlessGrowthTypes';

export const ENDLESS_UPGRADE_IDS: readonly EndlessUpgradeId[] = ['power', 'multishot', 'pierce', 'nova', 'dash', 'scan', 'vitality', 'haste', 'immune'];

export const ENDLESS_UPGRADES: Record<EndlessUpgradeId, { title: string; maxRank?: number; newMechanic: boolean }> = {
  power: { title: '净化突破', newMechanic: false },
  multishot: { title: '扇形抗体', maxRank: 2, newMechanic: true },
  pierce: { title: '贯穿净化', maxRank: 3, newMechanic: true },
  nova: { title: '裂解新星', maxRank: 6, newMechanic: true },
  dash: { title: '冲刺斩', newMechanic: true },
  scan: { title: '扫描爆发', newMechanic: true },
  vitality: { title: '生命扩容', newMechanic: false },
  haste: { title: '急速净化', maxRank: 7, newMechanic: false },
  immune: { title: '免疫军团', newMechanic: true },
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
  return {
    damageMultiplier: 1 + power * .18,
    shotRays: 1 + multishot * 2,
    pierceCount: pierce,
    areaRadius: 94 + nova * 14,
    areaDamageMultiplier: 1 + nova * .15,
    primaryCooldown: Math.max(.09, .18 * .9 ** haste),
    areaCooldown: Math.max(.6, Number((1.2 - nova * .1).toFixed(6))),
    dashDamage: dash * 40,
    scanDamage: scan * 30,
    maxHp: 100 + vitality * 20,
    cellDamageMultiplier: 1 + immune * .2,
    scanCooldown: Math.max(1.5, 3 / (1 + immune * .12)),
    cellDurationBonus: Math.min(8, immune * 1.25),
    cellCooldownMultiplier: Math.max(.5, 1 / (1 + immune * .15)),
  };
}

const display = (value: number): string => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
function optionFor(growth: EndlessGrowthState, id: EndlessUpgradeId): EndlessUpgradeOption {
  const currentRank = rank(growth, id), nextRank = currentRank + 1;
  const before = endlessCombatStats(growth), after = endlessCombatStats({ ...growth, ranks: { ...growth.ranks, [id]: nextRank } });
  const change = (a: number, b: number) => `${display(a)} → ${display(b)}`;
  const description: Record<EndlessUpgradeId, string> = {
    power: `基础净化伤害倍率 ×${display(before.damageMultiplier)} → ×${display(after.damageMultiplier)}；强化现有攻击。`,
    multishot: `精准净化 ${change(before.shotRays, after.shotRays)} 束；向左右同时发射更多抗体。`,
    pierce: `每束精准射线额外贯穿 ${change(before.pierceCount, after.pierceCount)} 个敌体，遵循组织碰撞。`,
    nova: `范围裂解半径 ${change(before.areaRadius, after.areaRadius)}，伤害倍率 ${change(before.areaDamageMultiplier, after.areaDamageMultiplier)}，冷却 ${change(before.areaCooldown, after.areaCooldown)} 秒。`,
    dash: `Space 沿实际冲刺路径斩击周围敌人，基础伤害 ${change(before.dashDamage, after.dashDamage)}，判定半径 64。`,
    scan: `Q 扫描同时引爆身边 260 范围，基础伤害 ${change(before.scanDamage, after.scanDamage)}；扫描显形继续生效。`,
    vitality: `最大耐久 ${change(before.maxHp, after.maxHp)}；本次补给按新的耐久上限结算。`,
    haste: `精准净化冷却 ${change(before.primaryCooldown, after.primaryCooldown)} 秒；整组扇射共用一次冷却。`,
    immune: `免疫细胞伤害倍率 ${change(before.cellDamageMultiplier, after.cellDamageMultiplier)}，额外寿命 ${change(before.cellDurationBonus, after.cellDurationBonus)} 秒；Q 冷却 ${change(before.scanCooldown, after.scanCooldown)} 秒，小队独立冷却倍率 ${change(before.cellCooldownMultiplier, after.cellCooldownMultiplier)}。`,
  };
  return { id, title: ENDLESS_UPGRADES[id].title, description: description[id], currentRank, nextRank };
}

function available(growth: EndlessGrowthState, id: EndlessUpgradeId): boolean {
  const current = rank(growth, id);
  if (current >= (ENDLESS_UPGRADES[id].maxRank ?? MAX_COUNT)) return false;
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
    options: shuffled(selected, rng).map(id => optionFor(growth, id)) as [EndlessUpgradeOption, EndlessUpgradeOption, EndlessUpgradeOption] };
  growth.offeredThroughWave = wave;
}

/** Commit only an offered current option. Repeated/stale choices have no effect. */
export function chooseEndlessUpgrade(growth: EndlessGrowthState, draftId: string, upgradeId: EndlessUpgradeId): boolean {
  const draft = growth.draft;
  if (!draft || draft.id !== draftId || !knownId(upgradeId) || count(growth.level) >= MAX_COUNT) return false;
  const option = draft.options.find(item => item.id === upgradeId);
  if (!option || option.currentRank !== rank(growth, upgradeId) || option.nextRank !== option.currentRank + 1 || !available(growth, upgradeId)) return false;
  // Descriptions are regenerated from the actual parameters at commit time;
  // mutable display text is never the authority for the applied upgrade.
  const actual = optionFor(growth, upgradeId);
  growth.ranks[upgradeId] = actual.nextRank;
  growth.level++;
  growth.lastChoice = { upgradeId, title: actual.title, description: actual.description };
  growth.history.push({ ...growth.lastChoice, wave: draft.wave, level: growth.level, rank: actual.nextRank });
  if (growth.history.length > 20) growth.history.splice(0, growth.history.length - 20);
  growth.draft = null;
  return true;
}
