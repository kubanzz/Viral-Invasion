import { describe, expect, it } from 'vitest';
import type { DrawReceipt } from '../../src/game/microfront';
import { CampSummonSequence, SUMMON_TIMING } from '../../src/ui/campSummonSequence';

const receipt = (): DrawReceipt => ({ id: 'confirmed-draw', count: 10, cost: 1000, pityBefore: 8, pityAfter: 0,
  results: [
    { kind: 'materials', rarity: 'white', quantity: 2 },
    { kind: 'weapon', rarity: 'gold', templateId: 'piercing', itemId: 'already-saved', quantity: 1 },
    { kind: 'module', rarity: 'blue', templateId: 'PULSE_BREAK', quantity: 1 },
    { kind: 'fragments', rarity: 'gold', templateId: 'steady', quantity: 4 },
  ] });

describe('saved summon receipt presentation', () => {
  it('copies and freezes the confirmed receipt while keeping its original result order', () => {
    const sequence = new CampSummonSequence(), actual = receipt(), before = structuredClone(actual);
    sequence.start(actual, 0);
    expect(actual).toEqual(before);
    expect(sequence.view?.receipt).toEqual(before);
    expect(sequence.view?.receipt).not.toBe(actual);
    expect(sequence.view?.receipt.results).not.toBe(actual.results);
    expect(Object.isFrozen(sequence.view)).toBe(true);
    expect(Object.isFrozen(sequence.view?.receipt)).toBe(true);
    expect(Object.isFrozen(sequence.view?.receipt.results)).toBe(true);
    expect(Object.isFrozen(sequence.view?.receipt.results[0])).toBe(true);
    actual.results[1].quantity = 99;
    actual.results.reverse();
    expect(sequence.view?.receipt).toEqual(before);
  });

  it('completes one full charge and highest-quality bloom before revealing the entire saved batch', () => {
    const sequence = new CampSummonSequence(); sequence.start(receipt(), 100);
    const rarityAt = 100 + SUMMON_TIMING.charge, revealAt = rarityAt + SUMMON_TIMING.rarity;
    expect(SUMMON_TIMING).toEqual({ charge: 1400, rarity: 1100 });
    expect(sequence.active).toBe(true);
    expect(sequence.view).toMatchObject({ phase: 'charge', phaseDuration: SUMMON_TIMING.charge, resultCount: 4, index: 1, position: 0, highestRarity: 'gold', currentRarity: 'gold', revealedIndices: [] });
    expect(sequence.update(rarityAt - 1)).toBe(false);
    expect(sequence.update(rarityAt)).toBe(true);
    expect(sequence.view).toMatchObject({ phase: 'rarity', phaseDuration: SUMMON_TIMING.rarity, index: 1, revealedIndices: [] });
    expect(sequence.update(revealAt - 1)).toBe(false);
    expect(sequence.update(revealAt)).toBe(true);
    expect(sequence.view).toMatchObject({ phase: 'item', phaseDuration: 0, resultCount: 4, index: 1, position: 0, currentRarity: 'gold', revealedIndices: [0, 1, 2, 3] });
    expect(sequence.view?.receipt.results[sequence.view.index].itemId).toBe('already-saved');
  });

  it('catches up delayed frames without silently advancing past an item reveal', () => {
    const sequence = new CampSummonSequence(); sequence.start(receipt(), 0);
    expect(sequence.update(10000)).toBe(true);
    expect(sequence.view).toMatchObject({ phase: 'item', phaseDuration: 0, index: 1, position: 0, revealedIndices: [0, 1, 2, 3] });
    expect(sequence.update(20000)).toBe(false);
    expect(sequence.view?.position).toBe(0);
  });

  it('allows an early batch reveal and completes on the first confirmation without another tease', () => {
    const sequence = new CampSummonSequence(); sequence.start(receipt(), 0);
    sequence.reveal(); sequence.next();
    expect(sequence.view?.phase).toBe('charge');
    sequence.update(SUMMON_TIMING.charge); sequence.reveal();
    expect(sequence.view).toMatchObject({ phase: 'item', phaseDuration: 0, resultCount: 4, revealedIndices: [0, 1, 2, 3] });
    sequence.next();
    expect(sequence.view).toMatchObject({ phase: 'complete', phaseDuration: 0, index: 1, position: 0, currentRarity: 'gold', revealedIndices: [0, 1, 2, 3] });
    expect(sequence.active).toBe(false);
    const complete = sequence.view;
    sequence.reveal(); sequence.next(); expect(sequence.update(99999)).toBe(false);
    expect(sequence.view).toBe(complete);
  });

  it('skips presentation only, retaining every original quantity, identity, cost and pity value', () => {
    const actual = receipt(), before = structuredClone(actual), sequence = new CampSummonSequence();
    sequence.start(actual, 0); sequence.skip();
    expect(sequence.view).toMatchObject({ phase: 'complete', phaseDuration: 0, revealedIndices: [0, 1, 2, 3] });
    expect(sequence.active).toBe(false);
    expect(sequence.view?.receipt).toEqual(before);
    expect(actual).toEqual(before);
    const key = sequence.view?.key;
    sequence.skip(); sequence.reveal(); sequence.next();
    expect(sequence.update(99999)).toBe(false);
    expect(sequence.view?.key).toBe(key);
  });

  it('finishes immediately for reduced effects without introducing a wait', () => {
    const sequence = new CampSummonSequence(); sequence.start(receipt(), 0, true);
    expect(sequence.view).toMatchObject({ phase: 'complete', phaseDuration: 0, resultCount: 4, reduced: true, revealedIndices: [0, 1, 2, 3] });
    expect(sequence.active).toBe(false);
    expect(sequence.update(5000)).toBe(false);
  });

  it('handles missing or empty receipts and clearing without manufacturing a result', () => {
    const sequence = new CampSummonSequence();
    sequence.reveal(); sequence.next(); sequence.skip(); sequence.clear();
    sequence.start(undefined, 0);
    expect(sequence.view).toBeUndefined();
    expect(sequence.active).toBe(false);
    sequence.start({ ...receipt(), results: [] }, 0);
    expect(sequence.view).toMatchObject({ phase: 'complete', phaseDuration: 0, resultCount: 0, highestRarity: 'white', revealedIndices: [] });
    expect(sequence.active).toBe(false);
    sequence.clear();
    expect(sequence.update(10000)).toBe(false);
    expect(sequence.view).toBeUndefined();
  });

  it('changes the render key at transitions and ignores invalid or backward wall-clock values', () => {
    const sequence = new CampSummonSequence(); sequence.start(receipt(), 0);
    const start = sequence.view!.key;
    expect(sequence.update(NaN)).toBe(false);
    expect(sequence.update(SUMMON_TIMING.charge)).toBe(true);
    expect(sequence.view!.key).toBeGreaterThan(start);
    const rarity = sequence.view;
    expect(sequence.update(1000)).toBe(false); expect(sequence.view).toBe(rarity);
    expect(sequence.update(SUMMON_TIMING.charge + SUMMON_TIMING.rarity - 1)).toBe(false);
    expect(sequence.update(SUMMON_TIMING.charge + SUMMON_TIMING.rarity)).toBe(true);
    const after = sequence.view!.key;
    sequence.clear(); sequence.start(receipt(), 0);
    expect(sequence.view!.key).toBeGreaterThan(after);
  });
  it.each([1, 5, 10, 20])('uses the same one-shot timeline for %i actual presentation results', resultCount => {
    const actual: DrawReceipt = { ...receipt(), count: resultCount === 1 ? 1 : 10,
      results: Array.from({ length: resultCount }, (_, index) => index === resultCount - 1
        ? { kind: 'core', rarity: 'gold', quantity: 1 }
        : { kind: 'materials', rarity: 'white', quantity: index + 1 }) };
    const before = structuredClone(actual), sequence = new CampSummonSequence(); sequence.start(actual, 0);
    expect(sequence.view).toMatchObject({ phase: 'charge', phaseDuration: SUMMON_TIMING.charge, resultCount,
      index: resultCount - 1, position: 0, highestRarity: 'gold', currentRarity: 'gold', revealedIndices: [] });
    const phases = [sequence.view!.phase];
    expect(sequence.update(SUMMON_TIMING.charge)).toBe(true); phases.push(sequence.view!.phase);
    expect(sequence.view).toMatchObject({ phase: 'rarity', phaseDuration: SUMMON_TIMING.rarity,
      index: resultCount - 1, position: 0, currentRarity: 'gold', revealedIndices: [] });
    expect(sequence.update(SUMMON_TIMING.charge + SUMMON_TIMING.rarity)).toBe(true); phases.push(sequence.view!.phase);
    expect(sequence.view).toMatchObject({ phase: 'item', phaseDuration: 0, resultCount,
      index: resultCount - 1, position: 0, currentRarity: 'gold', revealedIndices: Array.from({ length: resultCount }, (_, index) => index) });
    expect(sequence.update(99999)).toBe(false);
    sequence.next(); phases.push(sequence.view!.phase);
    expect(phases).toEqual(['charge', 'rarity', 'item', 'complete']);
    expect(sequence.active).toBe(false); expect(sequence.view?.receipt).toEqual(before); expect(actual).toEqual(before);
  });
  it('uses only the actual batch to choose the shared rarity, with the first saved tie as its reference', () => {
    const actual = receipt(); actual.results = [
      { kind: 'materials', rarity: 'white', quantity: 5 },
      { kind: 'module', rarity: 'purple', templateId: 'PULSE_BREAK', quantity: 1 },
      { kind: 'module', rarity: 'purple', templateId: 'PURIFY_CHAIN', quantity: 1 },
    ];
    const sequence = new CampSummonSequence(); sequence.start(actual, 0);
    expect(sequence.view).toMatchObject({ resultCount: 3, index: 1, highestRarity: 'purple', currentRarity: 'purple' });
    sequence.update(10000);
    expect(sequence.view).toMatchObject({ phase: 'item', currentRarity: 'purple', index: 1, revealedIndices: [0, 1, 2] });
    expect(Object.isFrozen(sequence.view?.revealedIndices)).toBe(true);
  });
  it('keeps the same presentation and duration through intermediate frames and debounce-sized updates', () => {
    const sequence = new CampSummonSequence(); sequence.start(receipt(), 0);
    const initial = sequence.view;
    for (const now of [100, 500, 700, SUMMON_TIMING.charge - 1]) {
      expect(sequence.update(now)).toBe(false); expect(sequence.view).toBe(initial);
    }
    expect(sequence.update(SUMMON_TIMING.charge)).toBe(true);
    const rarity = sequence.view;
    expect(rarity?.phaseDuration).toBe(SUMMON_TIMING.rarity);
    expect(sequence.update(SUMMON_TIMING.charge + 500)).toBe(false); expect(sequence.view).toBe(rarity);
  });
});
