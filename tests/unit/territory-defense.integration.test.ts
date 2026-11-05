import { describe, expect, it } from 'vitest';
import { measureGarrisonCombat } from '../fixtures/garrisonCombat';

describe('real production garrison combat without catalysis', () => {
  it('physically deploys and intercepts a finite invasion squad without a mandatory handoff', () => {
    const result = measureGarrisonCombat(19, 3);
    expect(result.catalysisRank).toBe(0);
    expect(result.squadCount).toBe(1);
    expect(result.handoffStarted).toBe(false);
    expect(result.realBites).toBeGreaterThan(0);
    expect(result.held).toBe(true);
    expect(result.handoff).toBe(false);
    expect(result.garrisonDamage).toBeGreaterThan(0);
    expect(result.phantomEscortAttacks).toBe(0);
  });
  it('routes later finite squads around their source, without followers attacking an empty formation point', () => {
    const result = measureGarrisonCombat(71, 3, 3, 90);
    expect(result.held).toBe(true);
    expect(result.finishedSquads).toBe(3);
    expect(result.phantomEscortAttacks).toBe(0);
    expect(result.realBites).toBeGreaterThan(80);
  });
});
