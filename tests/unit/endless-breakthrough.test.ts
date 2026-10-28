import { describe, expect, it } from 'vitest';
import { chooseEndlessUpgrade, createEndlessGrowth, endlessCombatStats, ENDLESS_UPGRADES, offerEndlessUpgrade } from '../../src/game/endlessGrowth';

describe('earned elite-wave breakthroughs', () => {
  it('offers exact two-rank results at elite milestones and applies them once', () => {
    let observed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const growth = createEndlessGrowth(seed);
      offerEndlessUpgrade(growth, 5);
      const draft = growth.draft!;
      expect(draft.breakthrough).toBe(true);
      for (const option of draft.options) {
        expect(option.nextRank).toBe(Math.min(2, ENDLESS_UPGRADES[option.id].maxRank ?? 2));
      }
      const power = draft.options.find(option => option.id === 'power');
      if (!power) continue;
      observed++;
      const before = endlessCombatStats(growth).damageMultiplier;
      expect(chooseEndlessUpgrade(growth, draft.id, power.id)).toBe(true);
      expect(growth.ranks.power).toBe(2);
      expect(endlessCombatStats(growth).damageMultiplier - before).toBeCloseTo(.36);
      expect(growth.level).toBe(1);
      expect(chooseEndlessUpgrade(growth, draft.id, power.id)).toBe(false);
      expect(growth.ranks.power).toBe(2);
    }
    expect(observed).toBeGreaterThan(0);
  });

  it('preserves normal-wave gains and clamps a breakthrough to the real mechanism cap', () => {
    for (const wave of [1, 2, 4, 6]) {
      const growth = createEndlessGrowth(7);
      offerEndlessUpgrade(growth, wave);
      expect(growth.draft!.breakthrough).not.toBe(true);
      expect(growth.draft!.options.every(option => option.nextRank === option.currentRank + 1)).toBe(true);
    }
    let observed = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const growth = createEndlessGrowth(seed);
      growth.ranks.multishot = 1;
      offerEndlessUpgrade(growth, 10);
      const draft = growth.draft!, option = draft.options.find(option => option.id === 'multishot');
      if (!option) continue;
      observed++;
      expect(option.nextRank).toBe(2);
      expect(chooseEndlessUpgrade(growth, draft.id, option.id)).toBe(true);
      expect(endlessCombatStats(growth).shotRays).toBe(5);
    }
    expect(observed).toBeGreaterThan(0);
  });

  it('rejects changing a normal draft into an elite reward or inflating its displayed gain', () => {
    const growth = createEndlessGrowth(91);
    offerEndlessUpgrade(growth, 1);
    const draft = growth.draft!, id = draft.options[0].id;
    draft.wave = 5;
    expect(chooseEndlessUpgrade(growth, draft.id, id)).toBe(false);
    draft.wave = 1;
    draft.options[0].nextRank += 1;
    expect(chooseEndlessUpgrade(growth, draft.id, id)).toBe(false);
    expect(growth.level).toBe(0);
    expect(growth.ranks).toEqual({});
  });
});
