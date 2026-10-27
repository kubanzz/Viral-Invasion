import { describe, expect, it } from 'vitest';
import { capSelectionProbabilities, chooseEvolution, EVOLUTION_BALANCE, recordBehavior, summarizeBehavior } from '../../src/game/evolution';
import type { BehaviorBin, EvolutionContext, EvolutionDecision } from '../../src/game/evolutionTypes';
import type { TraitId } from '../../src/game/battleTypes';
import { TRAITS } from '../../src/game/battleConfig';

const traits: TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
const context = (overrides: Partial<EvolutionContext> = {}): EvolutionContext => ({
  seed: 130026, evolutionIndex: 0, tick: 6000, organId: 'heart', integrity: 62,
  seen: [], counterAvailable: { CARAPACE: true, FISSION: true, MIMIC: true }, history: [], ...overrides,
});
function warned(decision: EvolutionDecision): Extract<EvolutionDecision, { kind: 'warn' }> {
  expect(decision.kind).toBe('warn');
  if (decision.kind !== 'warn') throw new Error('Expected a legal warning decision');
  return decision;
}
const probability = (decision: ReturnType<typeof warned>, trait: TraitId) => decision.candidates.find(item => item.trait === trait)?.probability ?? 0;

describe('G2 deterministic evolution director', () => {
  it('coalesces accepted events by fixed tick without mutating serializable history', () => {
    const previous: BehaviorBin[] = [{ tick: 120, precisionDamage: 34, areaDamage: 0, scans: 0, isolations: 0, repaired: 0 }];
    const original = structuredClone(previous);
    const first = recordBehavior(previous, { tick: 120, kind: 'precisionDamage', amount: 20 });
    const second = recordBehavior(first, { tick: 120, kind: 'areaDamage', amount: 65 });
    const third = recordBehavior(second, { tick: 120, kind: 'scan' });
    const fourth = recordBehavior(third, { tick: 120, kind: 'isolate' });
    const result = recordBehavior(fourth, { tick: 121, kind: 'repair', amount: 25 });
    expect(previous).toEqual(original);
    expect(first[0].precisionDamage).toBe(54);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ precisionDamage: 54, areaDamage: 65, scans: 1, isolations: 1 });
    expect(result[1].repaired).toBe(25);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    const chosen = chooseEvolution(context({ history: result, tick: 200 }));
    expect(chooseEvolution(JSON.parse(JSON.stringify(context({ history: result, tick: 200 }))))).toEqual(chosen);
  });

  it('keeps exactly the latest 90 seconds and expires idle history even without a new action', () => {
    let history: BehaviorBin[] = [];
    history = recordBehavior(history, { tick: 0, kind: 'precisionDamage', amount: 500 });
    history = recordBehavior(history, { tick: 5399, kind: 'areaDamage', amount: 100 });
    history = recordBehavior(history, { tick: 5400, kind: 'scan' });
    expect(history.map(bin => bin.tick)).toEqual([0, 5399, 5400]);
    history = recordBehavior(history, { tick: 5401, kind: 'scan' });
    expect(history.map(bin => bin.tick)).toEqual([5399, 5400, 5401]);
    const old = [{ tick: 600, precisionDamage: 10000, areaDamage: 0, scans: 0, isolations: 0, repaired: 0 }];
    expect(summarizeBehavior(old, 6000).precisionDamage).toBe(10000);
    expect(summarizeBehavior(old, 6001).precisionDamage).toBe(0);
    expect(warned(chooseEvolution(context({ history: old, tick: 6001 }))).candidates)
      .toEqual(warned(chooseEvolution(context({ history: [], tick: 6001 }))).candidates);
    const allTicks = Array.from({ length: 5600 }, (_, tick) => ({ tick, precisionDamage: 1, areaDamage: 0, scans: 0, isolations: 0, repaired: 0 }));
    expect(recordBehavior(allTicks, { tick: 5600, kind: 'scan' })).toHaveLength(EVOLUTION_BALANCE.windowTicks + 1);
  });

  it('ignores misses, rejected actions and non-finite damage, pruning future or malformed bins', () => {
    let history: BehaviorBin[] = [];
    for (const amount of [0, -1, NaN, Infinity]) history = recordBehavior(history, { tick: 30, kind: 'precisionDamage', amount });
    expect(history).toEqual([]);
    history = recordBehavior(history, { tick: 60, kind: 'repair', amount: 0 });
    expect(history).toEqual([]);
    expect(recordBehavior(history, { tick: 120, kind: 'scan' }, 100)).toEqual([]);
    expect(recordBehavior(history, { tick: -1, kind: 'scan' }, 100)).toEqual([]);
    expect(recordBehavior([{ tick: Infinity, precisionDamage: 99, areaDamage: 0, scans: 0, isolations: 0, repaired: 0 }], { tick: 100, kind: 'scan' })).toEqual([
      { tick: 100, precisionDamage: 0, areaDamage: 0, scans: 1, isolations: 0, repaired: 0 },
    ]);
  });

  it('changes partial candidate probabilities softly rather than forcing a response', () => {
    const precise = recordBehavior([], { tick: 5950, kind: 'precisionDamage', amount: 5000 });
    const area = recordBehavior([], { tick: 5950, kind: 'areaDamage', amount: 5000 });
    const none = warned(chooseEvolution(context()));
    const single = warned(chooseEvolution(context({ history: precise })));
    const crowd = warned(chooseEvolution(context({ history: area })));
    expect(probability(single, 'CARAPACE')).toBeGreaterThan(probability(none, 'CARAPACE'));
    expect(probability(crowd, 'MIMIC')).toBeGreaterThan(probability(none, 'MIMIC'));
    for (const choice of [none, single, crowd]) {
      expect(choice.candidates.every(candidate => candidate.probability > 0 && candidate.probability <= .55)).toBe(true);
      expect(choice.candidates.reduce((sum, candidate) => sum + candidate.probability, 0)).toBeCloseTo(1, 12);
      expect(choice.warningSeconds).toBe(8);
      expect(TRAITS[choice.trait].ability).toBeTruthy();
      expect(TRAITS[choice.trait].cost).toBeTruthy();
      expect(TRAITS[choice.trait].counter).toBeTruthy();
    }
  });

  it('redistributes capped probability without cap-breaking renormalization', () => {
    expect(capSelectionProbabilities([100, 1])).toEqual([.55, .44999999999999996]);
    const triple = capSelectionProbabilities([100, 0, 0]);
    expect(triple[0]).toBe(.55);
    expect(triple[1]).toBeCloseTo(.225, 12);
    expect(triple[2]).toBeCloseTo(.225, 12);
    expect(capSelectionProbabilities([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3]);
    const extreme = capSelectionProbabilities([1e308, 1e307, 1]);
    expect(extreme.every(value => Number.isFinite(value) && value >= 0 && value <= .55 + 1e-12)).toBe(true);
    expect(extreme.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(capSelectionProbabilities([NaN, Infinity, -1])).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(() => capSelectionProbabilities([1], .55)).toThrow(RangeError);
    expect(capSelectionProbabilities([])).toEqual([]);
    // Independent input coverage exercises multiple rounds of redistribution.
    for (let index = 1; index <= 1000; index++) {
      const weights = [index ** 3, (index % 17) ** 2, index % 3 ? 1 : 0];
      const probabilities = capSelectionProbabilities(weights);
      expect(probabilities.every(value => value >= 0 && value <= .55 + 1e-12)).toBe(true);
      expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    }
  });

  it('filters unavailable base counters, prevents repeats and stops at two main traits', () => {
    const first = warned(chooseEvolution(context()));
    const second = warned(chooseEvolution(context({ evolutionIndex: 1, seen: [first.trait] })));
    expect(second.trait).not.toBe(first.trait);
    expect(second.candidates).toHaveLength(2);
    expect(second.candidates.every(candidate => candidate.probability >= .45 - 1e-12 && candidate.probability <= .55)).toBe(true);
    expect(chooseEvolution(context({ evolutionIndex: 2, seen: [first.trait, second.trait] }))).toEqual({ kind: 'stop', reason: 'trait-cap' });
    const restricted = warned(chooseEvolution(context({ counterAvailable: { CARAPACE: true, FISSION: true, MIMIC: false } })));
    expect(restricted.candidates.map(candidate => candidate.trait)).toEqual(['CARAPACE', 'FISSION']);
    expect(chooseEvolution(context({ counterAvailable: { CARAPACE: false, FISSION: false, MIMIC: false } }))).toEqual({ kind: 'defer', reason: 'no-candidates' });
    expect(chooseEvolution(context({ eligibleTraits: ['CARAPACE'] }))).toEqual({ kind: 'defer', reason: 'insufficient-diversity' });
    expect(chooseEvolution(context({ eligibleTraits: [] }))).toEqual({ kind: 'defer', reason: 'no-candidates' });
  });

  it('uses an independent seeded choice unaffected by unrelated RNG consumers or input object order', () => {
    const base = context({ seed: 0xffffffff, evolutionIndex: 1, seen: ['MIMIC'] });
    const choice = chooseEvolution(base);
    const reordered: EvolutionContext = { history: [], counterAvailable: { MIMIC: true, FISSION: true, CARAPACE: true }, integrity: 62, organId: 'heart', tick: 6000, evolutionIndex: 1, seed: 0xffffffff, seen: ['MIMIC'] };
    expect(chooseEvolution(reordered)).toEqual(choice);
    for (let index = 0; index < 100; index++) chooseEvolution(context({ seed: index, evolutionIndex: 0 }));
    expect(chooseEvolution(base)).toEqual(choice);
    expect(base).toEqual(context({ seed: 0xffffffff, evolutionIndex: 1, seen: ['MIMIC'] }));
  });

  it('actually audits 1000 seeds, both stages, alternate strategies, legal counters and reproducible warnings', () => {
    const preciseHistory = recordBehavior([], { tick: 5900, kind: 'precisionDamage', amount: 5000 });
    const areaHistory = recordBehavior([], { tick: 5900, kind: 'areaDamage', amount: 5000 });
    const counts: Record<TraitId, number> = { CARAPACE: 0, FISSION: 0, MIMIC: 0 };
    const sequences = new Set<string>();
    let changedByStrategy = 0; let maximumObservedProbability = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const base = context({ seed, history: preciseHistory, organId: seed % 2 ? 'heart' : 'lung' });
      const first = warned(chooseEvolution(base));
      const next = { ...base, tick: base.tick + 600, evolutionIndex: 1, seen: [first.trait] };
      const second = warned(chooseEvolution(next));
      expect(chooseEvolution(JSON.parse(JSON.stringify(base)))).toEqual(first);
      expect(chooseEvolution(JSON.parse(JSON.stringify(next)))).toEqual(second);
      const otherStrategy = warned(chooseEvolution({ ...base, history: areaHistory }));
      if (first.trait !== otherStrategy.trait) changedByStrategy++;
      counts[first.trait]++;
      sequences.add(`${first.trait}>${second.trait}`);
      expect(new Set([first.trait, second.trait]).size).toBe(2);
      expect(chooseEvolution({ ...next, evolutionIndex: 2, seen: [first.trait, second.trait] }).kind).toBe('stop');
      for (const decision of [first, second, otherStrategy]) {
        expect(traits.includes(decision.trait)).toBe(true);
        expect(base.counterAvailable[decision.trait]).toBe(true);
        expect(decision.warningSeconds).toBeGreaterThanOrEqual(8);
        expect(decision.candidates.reduce((sum, candidate) => sum + candidate.probability, 0)).toBeCloseTo(1, 12);
        for (const candidate of decision.candidates) {
          maximumObservedProbability = Math.max(maximumObservedProbability, candidate.probability);
          expect(candidate.probability).toBeLessThanOrEqual(.55 + 1e-12);
        }
      }
    }
    expect(traits.every(trait => counts[trait] > 0)).toBe(true);
    expect(sequences.size).toBe(6);
    expect(changedByStrategy).toBeGreaterThan(0);
    expect(changedByStrategy).toBeLessThan(1000);
    console.info('EVOLUTION_SEED_AUDIT', JSON.stringify({ seeds: 1000, stagesPerSeed: 2, firstTraitCounts: counts, distinctSequences: sequences.size, strategyChangedFirstChoice: changedByStrategy, maximumObservedProbability, warningSeconds: 8 }));
  });
});
