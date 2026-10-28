import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/game/types';
import { CATALYSIS_UPGRADE_BALANCE, ENDLESS_UPGRADES, ENDLESS_UPGRADE_IDS, chooseEndlessUpgrade,
  createEndlessGrowth, endlessCombatStats, offerEndlessUpgrade } from '../../src/game/endlessGrowth';
import type { EndlessGrowthState } from '../../src/game/endlessGrowthTypes';

function eligible(seed: number, prerequisite: 'nova' | 'immune' = 'immune'): EndlessGrowthState {
  const growth = createEndlessGrowth(seed);
  growth.level = 5;
  growth.ranks = { multishot: 1, pierce: 1, dash: 1, scan: 1, [prerequisite]: 1 };
  return growth;
}

function offeredCatalysis(growth: EndlessGrowthState, wave = 6) {
  offerEndlessUpgrade(growth, wave);
  const draft = growth.draft!;
  expect(draft.options).toHaveLength(3);
  expect(new Set(draft.options.map(option => option.id)).size).toBe(3);
  const option = draft.options.find(candidate => candidate.id === 'catalysis');
  expect(option).toBeDefined();
  return { draft, option: option! };
}

describe('catalysis as an optional combat-growth branch', () => {
  it('cannot appear before the sixth accepted growth even if a later wave or prerequisite is present', () => {
    for (let seed = 0; seed < 96; seed++) for (const level of [0, 1, 4]) {
      const growth = eligible(seed); growth.level = level;
      offerEndlessUpgrade(growth, 100);
      expect(growth.draft!.options.some(option => option.id === 'catalysis')).toBe(false);
    }
  });

  it('requires a learned nova or immune route, not merely enough waves or growth levels', () => {
    for (let seed = 0; seed < 96; seed++) {
      const growth = createEndlessGrowth(seed);
      growth.level = 5;
      growth.ranks = { multishot: 2, pierce: 1, dash: 1, scan: 1 };
      offerEndlessUpgrade(growth, 6);
      expect(growth.draft!.options.some(option => option.id === 'catalysis')).toBe(false);
    }
  });

  it('can be the guaranteed real mechanism at choice six through either prerequisite and after higher ranks', () => {
    for (let seed = 0; seed < 96; seed++) for (const prerequisite of ['nova', 'immune'] as const) {
      const growth = eligible(seed, prerequisite);
      offeredCatalysis(growth);
      const later = eligible(seed, prerequisite);
      later.level = 12; later.ranks[prerequisite] = prerequisite === 'nova' ? 6 : 9;
      offeredCatalysis(later, 13);
    }
  });

  it('classifies strengthening existing area/cell rules separately from actual new mechanics', () => {
    expect(ENDLESS_UPGRADES.nova.newMechanic).toBe(false);
    expect(ENDLESS_UPGRADES.immune.newMechanic).toBe(false);
    expect(ENDLESS_UPGRADES.catalysis).toMatchObject({ title: '催化裂解', maxRank: 1, newMechanic: true });
    const growth = createEndlessGrowth(7);
    growth.level = 4; growth.ranks = { multishot: 1, pierce: 1, nova: 1, immune: 1 };
    offerEndlessUpgrade(growth, 5);
    expect(growth.draft!.options.some(option => option.id === 'dash' || option.id === 'scan')).toBe(true);
    expect(growth.draft!.options.some(option => option.id === 'catalysis')).toBe(false);
  });

  it('explains the normal-blast conversion, retained collection and captured one-batch damage', () => {
    const growth = eligible(71, 'nova'); growth.ranks.power = 2;
    const { option } = offeredCatalysis(growth);
    const damage = BALANCE.damage[2] * 1.36 * 1.15 * 1.25;
    expect(option.title).toBe('催化裂解');
    expect(option).toMatchObject({ currentRank: 0, nextRank: 1 });
    expect(option.description).toContain(`${Number((BALANCE.damage[2] * 1.36 * 1.15).toFixed(3))} → 8`);
    expect(option.description).toContain('保留牵引与已解锁导流，取消普通爆发');
    expect(option.description).toContain('存活目标铺标 4 秒');
    expect(option.description).toContain('1 正伤命中或真实细胞接触咬击');
    expect(option.description).toContain('整批引爆一次');
    expect(option.description).toContain('半径 110、最多 3 体');
    expect(option.description).toContain(String(Number(damage.toFixed(3))));
    expect(option.description).toContain('按施法捕获');
    expect(option.description).toContain('有效铺标覆盖旧批，不叠加');
  });

  it('rechecks prerequisites at commit and does not create a batch merely by choosing the card', () => {
    const growth = eligible(19);
    const { draft } = offeredCatalysis(growth);
    growth.ranks.immune = 0;
    const invalid = structuredClone(growth);
    expect(chooseEndlessUpgrade(growth, draft.id, 'catalysis')).toBe(false);
    expect(growth).toEqual(invalid);
    growth.ranks.immune = 1;
    expect(chooseEndlessUpgrade(growth, draft.id, 'catalysis')).toBe(true);
    expect(growth.ranks.catalysis).toBe(1);
    expect(growth.level).toBe(6);
    expect(growth.pendingCatalysis).toBeUndefined();
    const accepted = structuredClone(growth);
    expect(chooseEndlessUpgrade(growth, draft.id, 'catalysis')).toBe(false);
    expect(growth).toEqual(accepted);
    for (let wave = 7; wave <= 20; wave++) {
      offerEndlessUpgrade(growth, wave);
      expect(growth.draft!.options.some(option => option.id === 'catalysis')).toBe(false);
      expect(chooseEndlessUpgrade(growth, growth.draft!.id, growth.draft!.options[0].id)).toBe(true);
    }
  });

  it('adds one fully scaled damage projection while preserving every existing combat parameter', () => {
    const growth = eligible(7, 'nova');
    growth.ranks = { ...growth.ranks, power: 3, nova: 2, immune: 4, haste: 3, vitality: 2 };
    const before = endlessCombatStats(growth);
    const withCard = { ...growth, ranks: { ...growth.ranks, catalysis: 1 } };
    const after = endlessCombatStats(withCard);
    expect(before.catalysisDamage).toBe(0);
    expect(after.catalysisDamage).toBeCloseTo(BALANCE.damage[2] * 1.54 * 1.3 * 1.25);
    const { catalysisDamage: _beforeCatalysis, ...oldBefore } = before;
    const { catalysisDamage: _afterCatalysis, ...oldAfter } = after;
    expect(oldAfter).toEqual(oldBefore);
    const snapshot = structuredClone(withCard);
    endlessCombatStats(withCard);
    expect(withCard).toEqual(snapshot);
  });

  it('keeps all numeric projections finite for old, capped, invalid and extreme rank records', () => {
    const growth = createEndlessGrowth(0);
    expect(endlessCombatStats(growth).catalysisDamage).toBe(0);
    for (const id of ENDLESS_UPGRADE_IDS) growth.ranks[id] = Number.MAX_SAFE_INTEGER;
    const extreme = endlessCombatStats(growth);
    expect(Object.values(extreme).every(Number.isFinite)).toBe(true);
    expect(extreme.catalysisDamage).toBeGreaterThan(0);
    growth.ranks.catalysis = Infinity;
    expect(endlessCombatStats(growth).catalysisDamage).toBe(0);
    growth.ranks.catalysis = NaN;
    expect(endlessCombatStats(growth).catalysisDamage).toBe(0);
  });

  it('replays eligible serialized offers identically without using pending batch state or history as RNG', () => {
    const first = eligible(113, 'nova');
    const second = JSON.parse(JSON.stringify(first)) as EndlessGrowthState;
    second.history = [];
    second.pendingCatalysis = { id: 'host-owned-batch', organId: 'heart', createdAt: 10, until: 14,
      targetIds: ['a', 'b', 'c'], damage: 123 };
    const pending = structuredClone(second.pendingCatalysis);
    const a = offeredCatalysis(first), b = offeredCatalysis(second);
    expect(a.draft).toEqual(b.draft);
    expect(chooseEndlessUpgrade(first, a.draft.id, 'catalysis')).toBe(true);
    expect(chooseEndlessUpgrade(second, b.draft.id, 'catalysis')).toBe(true);
    expect(endlessCombatStats(first)).toEqual(endlessCombatStats(second));
    expect(second.pendingCatalysis).toEqual(pending);
    expect(CATALYSIS_UPGRADE_BALANCE).toMatchObject({ minimumChoice: 6, maxTargets: 3, duration: 4, radius: 110 });
  });
});
