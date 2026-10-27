import { describe, expect, it } from 'vitest';
import { createEndlessGrowth, offerEndlessUpgrade, chooseEndlessUpgrade, endlessCombatStats, ENDLESS_UPGRADE_IDS, ENDLESS_UPGRADES } from '../../src/game/endlessGrowth';
import type { EndlessGrowthState, EndlessUpgradeId } from '../../src/game/endlessGrowthTypes';

const commit = (growth: EndlessGrowthState, wave: number, pick?: EndlessUpgradeId) => {
  offerEndlessUpgrade(growth, wave);
  const draft = growth.draft!;
  expect(draft).not.toBeNull();
  const option = pick ? draft.options.find(candidate => candidate.id === pick) : draft.options[0];
  expect(option).toBeDefined();
  expect(chooseEndlessUpgrade(growth, draft.id, option!.id)).toBe(true);
};

describe('continuous endless upgrades', () => {
  it('preserves the nine-route opening pool and first-wave multishot/immune showcase', () => {
    const seen = new Set<EndlessUpgradeId>();
    for (let seed = 0; seed < 160; seed++) {
      const growth = createEndlessGrowth(seed); offerEndlessUpgrade(growth, 1);
      const options = growth.draft!.options;
      expect(options).toHaveLength(3);
      expect(new Set(options.map(option => option.id)).size).toBe(3);
      expect(options.map(option => option.id)).toContain('multishot');
      expect(options.map(option => option.id)).toContain('immune');
      expect(options.map(option => option.id)).not.toContain('catalysis');
      for (const option of options) {
        seen.add(option.id); expect(option.description).toContain('→');
        expect(option.nextRank).toBe(option.currentRank + 1);
      }
    }
    expect([...seen].sort()).toEqual(ENDLESS_UPGRADE_IDS.filter(id => id !== 'catalysis').sort());
  });

  it('is deterministic across serialized restores and ignores unrelated history truncation', () => {
    const first = createEndlessGrowth(91), second = createEndlessGrowth(91);
    for (let wave = 1; wave <= 60; wave++) {
      offerEndlessUpgrade(first, wave); offerEndlessUpgrade(second, wave);
      expect(first.draft).toEqual(second.draft);
      const id = first.draft!.options[wave % 3].id, draftId = first.draft!.id;
      expect(chooseEndlessUpgrade(first, draftId, id)).toBe(true);
      expect(chooseEndlessUpgrade(second, draftId, id)).toBe(true);
      const restored = JSON.parse(JSON.stringify(second)) as EndlessGrowthState;
      restored.history = []; Object.assign(second, restored);
      expect(endlessCombatStats(second)).toEqual(endlessCombatStats(first));
    }
    expect(first.level).toBe(60); expect(first.history).toHaveLength(20);
  });

  it('rejects stale, duplicate, unoffered or tampered choices without consuming a legitimate draft', () => {
    const growth = createEndlessGrowth(7); offerEndlessUpgrade(growth, 1);
    const original = structuredClone(growth), draft = growth.draft!;
    const unavailable = ENDLESS_UPGRADE_IDS.find(id => !draft.options.some(option => option.id === id))!;
    expect(chooseEndlessUpgrade(growth, 'old-draft', draft.options[0].id)).toBe(false);
    expect(chooseEndlessUpgrade(growth, draft.id, unavailable)).toBe(false);
    expect(chooseEndlessUpgrade(growth, draft.id, 'constructor' as EndlessUpgradeId)).toBe(false);
    expect(growth).toEqual(original);
    const option = draft.options[0]; option.nextRank += 10;
    expect(chooseEndlessUpgrade(growth, draft.id, option.id)).toBe(false);
    option.nextRank -= 10;
    expect(chooseEndlessUpgrade(growth, draft.id, option.id)).toBe(true);
    const accepted = structuredClone(growth);
    expect(chooseEndlessUpgrade(growth, draft.id, option.id)).toBe(false);
    offerEndlessUpgrade(growth, 1);
    expect(growth).toEqual(accepted);
  });

  it('keeps pending offers intact and permits the next wave after its actual choice', () => {
    const growth = createEndlessGrowth(11); offerEndlessUpgrade(growth, 1);
    const first = structuredClone(growth.draft);
    offerEndlessUpgrade(growth, 2); expect(growth.draft).toEqual(first);
    expect(growth.offeredThroughWave).toBe(1);
    expect(chooseEndlessUpgrade(growth, first!.id, first!.options[0].id)).toBe(true);
    offerEndlessUpgrade(growth, 2); expect(growth.draft?.wave).toBe(2);
    const pending = structuredClone(growth);
    for (const wave of [0, -1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) offerEndlessUpgrade(growth, wave);
    expect(growth).toEqual(pending);
  });

  it('keeps learning new mechanics possible after acquiring a starting route', () => {
    const growth = createEndlessGrowth(28); commit(growth, 1, 'multishot');
    for (let wave = 2; wave <= 4; wave++) {
      offerEndlessUpgrade(growth, wave);
      expect(growth.draft!.options.some(option => ENDLESS_UPGRADES[option.id].newMechanic && !growth.ranks[option.id])).toBe(true);
      const learned = growth.draft!.options.find(option => ENDLESS_UPGRADES[option.id].newMechanic && !growth.ranks[option.id])!;
      expect(chooseEndlessUpgrade(growth, growth.draft!.id, learned.id)).toBe(true);
    }
  });

  it('projects distinct attack, movement, Q, immune and capacity changes with explicit bounded mechanics', () => {
    const growth = createEndlessGrowth(1), base = endlessCombatStats(growth);
    expect(base).toMatchObject({ damageMultiplier: 1, shotRays: 1, pierceCount: 0, areaRadius: 94, primaryCooldown: .18,
      areaCooldown: 1.2, dashDamage: 0, scanDamage: 0, maxHp: 100, cellDamageMultiplier: 1, scanCooldown: 3, cellDurationBonus: 0, cellCooldownMultiplier: 1, catalysisDamage: 0 });
    growth.ranks = { power: 2, multishot: 2, pierce: 3, nova: 6, dash: 1, scan: 1, vitality: 3, haste: 7, immune: 2 };
    const upgraded = endlessCombatStats(growth);
    expect(upgraded).toMatchObject({ shotRays: 5, pierceCount: 3, areaRadius: 178, areaCooldown: .6, primaryCooldown: .1,
      dashDamage: 40, scanDamage: 30, maxHp: 160, cellDurationBonus: 2.5 });
    expect(upgraded.damageMultiplier).toBeCloseTo(1.36);
    expect(upgraded.areaDamageMultiplier).toBeCloseTo(1.9);
    expect(upgraded.cellDamageMultiplier).toBeCloseTo(1.4);
    expect(upgraded.scanCooldown).toBeLessThan(base.scanCooldown);
    expect(upgraded.cellCooldownMultiplier).toBeLessThan(base.cellCooldownMultiplier);
    const snapshot = structuredClone(growth); endlessCombatStats(growth); expect(growth).toEqual(snapshot);
  });

  it('filters every mechanically capped card while continuing real upgrades well past campaign level five', () => {
    const growth = createEndlessGrowth(2026);
    growth.ranks = { multishot: 2, pierce: 3, nova: 6, haste: 7 };
    for (let wave = 1; wave <= 320; wave++) {
      offerEndlessUpgrade(growth, wave);
      expect(growth.draft).not.toBeNull();
      for (const option of growth.draft!.options) {
        expect(['multishot', 'pierce', 'nova', 'haste']).not.toContain(option.id);
        const projected = { ...growth, ranks: { ...growth.ranks, [option.id]: option.nextRank } };
        expect(endlessCombatStats(projected)).not.toEqual(endlessCombatStats(growth));
      }
      const before = endlessCombatStats(growth); commit(growth, wave);
      expect(endlessCombatStats(growth)).not.toEqual(before);
    }
    expect(growth.level).toBe(320); expect(growth.history).toHaveLength(20);
    expect(growth.offeredThroughWave).toBe(320);
    expect(growth.lastChoice?.description).toContain('→');
  });

  it('keeps projected values finite at extreme representable ranks and respects cooldown floors', () => {
    const growth = createEndlessGrowth(0);
    for (const id of ENDLESS_UPGRADE_IDS) growth.ranks[id] = Number.MAX_SAFE_INTEGER;
    const stats = endlessCombatStats(growth);
    expect(Object.values(stats).every(Number.isFinite)).toBe(true);
    expect(stats.primaryCooldown).toBeGreaterThanOrEqual(.1);
    expect(stats.areaCooldown).toBeGreaterThanOrEqual(.6);
    expect(stats.scanCooldown).toBeGreaterThanOrEqual(1.5);
    expect(stats.cellCooldownMultiplier).toBeGreaterThanOrEqual(.5);
    expect(stats.cellDurationBonus).toBeLessThanOrEqual(8);
    expect(stats.shotRays).toBe(5); expect(stats.pierceCount).toBe(3);
    const noInvalidOffer = structuredClone(growth); offerEndlessUpgrade(growth, 1);
    expect(growth).toEqual(noInvalidOffer);
    growth.ranks.power = Infinity; growth.ranks.vitality = NaN;
    expect(Object.values(endlessCombatStats(growth)).every(Number.isFinite)).toBe(true);
  });
});
