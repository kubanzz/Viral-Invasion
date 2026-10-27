import { describe, expect, it } from 'vitest';
import type { TraitId } from '../../src/game/battleTypes';
import { TRAITS } from '../../src/game/battleConfig';
import { chooseEvolution, EVOLUTION_BALANCE, recordBehavior } from '../../src/game/evolution';
import { chooseEndlessEvolution, ENDLESS_EVOLUTION_BALANCE as B, ENDLESS_EVOLUTION_TACTICS } from '../../src/game/endlessEvolution';
import type { EndlessEvolutionContext, EndlessEvolutionDecision } from '../../src/game/endlessEvolutionTypes';
import { enemyAttackPlan } from '../../src/game/enemyTactics';
import { GameSession } from '../../src/game/session';

const ids: TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
const context = (overrides: Partial<EndlessEvolutionContext> = {}): EndlessEvolutionContext => ({
  seed: 71, generation: 4, tick: 6000, organId: 'heart', integrity: 65, history: [],
  previousTraits: ['MIMIC', 'FISSION'], recentPrimaries: [], counterAvailable: { CARAPACE: true, FISSION: true, MIMIC: true }, ...overrides,
});
function warned(value: EndlessEvolutionDecision) {
  expect(value.kind).toBe('warn'); if (value.kind !== 'warn') throw Error(`Expected warn, got ${value.reason}`); return value;
}
const chance = (value: ReturnType<typeof warned>, trait: TraitId) => value.candidates.find(candidate => candidate.trait === trait)!.probability;

describe('bounded endless generation evolution', () => {
  it('reuses base behavior weights/summary and a dedicated roll without the campaign seen cap', () => {
    const ctx = context({ history: recordBehavior([], { tick: 5980, kind: 'precisionDamage', amount: 5000 }) });
    const choice = warned(chooseEndlessEvolution(ctx));
    const base = chooseEvolution({ seed: (ctx.seed ^ B.seedSalt) >>> 0, evolutionIndex: ctx.generation,
      tick: ctx.tick, organId: ctx.organId, integrity: ctx.integrity, history: ctx.history, seen: [], counterAvailable: ctx.counterAvailable });
    expect(base.kind).toBe('warn'); if (base.kind !== 'warn') throw Error('Expected base warning');
    expect(choice.roll).toBe(base.roll); expect(choice.summary).toEqual(base.summary);
    expect(choice.main).toBe(base.trait); expect(choice.warningSeconds).toBe(8);
    expect(choice.candidates.map(candidate => candidate.rawWeight)).toEqual(base.candidates.map(candidate => candidate.rawWeight));
    expect(chooseEvolution({ seed: ctx.seed, evolutionIndex: 4, tick: ctx.tick, organId: ctx.organId, integrity: ctx.integrity,
      history: [], seen: [...ctx.previousTraits], counterAvailable: ctx.counterAvailable })).toEqual({ kind: 'stop', reason: 'trait-cap' });
  });

  it('softly discounts only the latest three mains without excluding or repeatedly compounding them', () => {
    const plain = warned(chooseEndlessEvolution(context()));
    const recent = warned(chooseEndlessEvolution(context({ recentPrimaries: ['MIMIC', 'FISSION', 'CARAPACE'] })));
    const multipliers = { CARAPACE: .65, FISSION: .85, MIMIC: .85 };
    for (const candidate of recent.candidates) {
      expect(candidate.varietyMultiplier).toBe(multipliers[candidate.trait]);
      expect(candidate.baseWeight).toBe(plain.candidates.find(item => item.trait === candidate.trait)!.rawWeight);
      expect(candidate.rawWeight).toBeCloseTo(candidate.baseWeight * multipliers[candidate.trait]);
      expect(candidate.probability).toBeGreaterThan(0);
    }
    expect(chance(recent, 'CARAPACE')).toBeLessThan(chance(plain, 'CARAPACE'));
    expect(chooseEndlessEvolution(context({ recentPrimaries: ['CARAPACE', 'MIMIC', 'FISSION', 'CARAPACE'] }))).toEqual(recent);
    const repeats = warned(chooseEndlessEvolution(context({ recentPrimaries: ['CARAPACE', 'CARAPACE', 'CARAPACE'] })));
    expect(repeats.candidates).toHaveLength(3);
    expect(repeats.candidates.find(item => item.trait === 'CARAPACE')!.varietyMultiplier).toBe(.65);
    expect(chance(repeats, 'CARAPACE')).toBeGreaterThan(0);
  });

  it('selects the returned main against the final probabilities rather than only changing display weights', () => {
    let changedMain = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const plain = warned(chooseEndlessEvolution(context({ seed })));
      const discounted = warned(chooseEndlessEvolution(context({ seed, recentPrimaries: ['CARAPACE'] })));
      let cumulative = 0;
      const actual = discounted.candidates.find(candidate => { cumulative += candidate.probability; return discounted.roll < cumulative; })!.trait;
      expect(discounted.main).toBe(actual); expect(discounted.traits[0]).toBe(actual);
      expect(discounted.roll).toBe(plain.roll);
      if (plain.main !== discounted.main) changedMain++;
    }
    expect(changedMain).toBeGreaterThan(0); expect(changedMain).toBeLessThan(1000);
  });

  it('actually caps a skewed two-legal-main draw at 55% and redistributes the remainder', () => {
    const choice = warned(chooseEndlessEvolution(context({
      history: recordBehavior([], { tick: 5900, kind: 'precisionDamage', amount: 5000 }), recentPrimaries: ['MIMIC'],
      counterAvailable: { CARAPACE: true, FISSION: false, MIMIC: true },
    })));
    expect(choice.candidates).toHaveLength(2);
    const crystal = choice.candidates.find(candidate => candidate.trait === 'CARAPACE')!;
    expect(crystal.rawWeight / choice.candidates.reduce((sum, candidate) => sum + candidate.rawWeight, 0)).toBeGreaterThan(.55);
    expect(chance(choice, 'CARAPACE')).toBe(.55); expect(chance(choice, 'MIMIC')).toBeCloseTo(.45, 12);
  });

  it('retains the previous main first, otherwise the previous companion, and filters unavailable companions', () => {
    for (let seed = 1; seed <= 64; seed++) {
      const previous: TraitId[] = ['CARAPACE', 'FISSION'];
      const choice = warned(chooseEndlessEvolution(context({ seed, previousTraits: previous })));
      expect(choice.traits).toEqual([choice.main, choice.main === previous[0] ? previous[1] : previous[0]]);
      const limited = warned(chooseEndlessEvolution(context({ seed, previousTraits: ['MIMIC', 'CARAPACE'],
        counterAvailable: { CARAPACE: true, FISSION: true, MIMIC: false } })));
      expect(limited.traits).toHaveLength(2); expect(limited.traits).not.toContain('MIMIC');
      expect(new Set(limited.traits).size).toBe(2);
      const empty = warned(chooseEndlessEvolution(context({ seed, previousTraits: [] })));
      expect(empty.traits).toHaveLength(2); expect(new Set(empty.traits).size).toBe(2);
    }
  });

  it('expires 90-second history without a new action and never reads future behavior', () => {
    const history = recordBehavior([], { tick: 600, kind: 'precisionDamage', amount: 5000 });
    const boundary = warned(chooseEndlessEvolution(context({ tick: 6000, history })));
    expect(boundary.summary.precisionDamage).toBe(5000);
    const expired = warned(chooseEndlessEvolution(context({ tick: 6001, history })));
    const empty = warned(chooseEndlessEvolution(context({ tick: 6001 })));
    expect(expired).toEqual(empty);
    const future = recordBehavior([], { tick: 7000, kind: 'areaDamage', amount: 5000 });
    expect(chooseEndlessEvolution(context({ tick: 6001, history: future }))).toEqual(empty);
  });

  it('returns defer for malformed contexts, no candidates and an impossible one-candidate 55% cap', () => {
    expect(chooseEndlessEvolution(context({ counterAvailable: { CARAPACE: false, FISSION: false, MIMIC: false } })))
      .toEqual({ kind: 'defer', reason: 'no-candidates' });
    expect(chooseEndlessEvolution(context({ counterAvailable: { CARAPACE: true, FISSION: false, MIMIC: false } })))
      .toEqual({ kind: 'defer', reason: 'insufficient-diversity' });
    const malformed: unknown[] = [null, { seed: -1 }, { seed: 2 ** 32 }, { generation: NaN }, { generation: -1 }, { tick: 1.5 },
      { integrity: Infinity }, { integrity: -1 }, { integrity: 101 }, { organId: 'brain' }, { history: null },
      { previousTraits: ['CARAPACE', 'FISSION', 'MIMIC'] }, { previousTraits: ['UNKNOWN'] }, { recentPrimaries: ['UNKNOWN'] },
      { counterAvailable: { CARAPACE: true } }, { history: [{ tick: 0, precisionDamage: -1, areaDamage: 0, scans: 0, isolations: 0, repaired: 0 }] },
      { history: Array.from({ length: EVOLUTION_BALANCE.windowTicks + 2 }, (_, tick) => ({ tick, precisionDamage: 0, areaDamage: 0, scans: 0, isolations: 0, repaired: 0 })) }];
    for (const patch of malformed) {
      const ctx = patch === null ? null : { ...context(), ...(patch as object) };
      expect(chooseEndlessEvolution(ctx as EndlessEvolutionContext)).toEqual({ kind: 'defer', reason: 'invalid-context' });
    }
  });

  it('does not mutate contexts and replays independently of other generation choices and JSON key order', () => {
    const ctx = context({ recentPrimaries: ['CARAPACE', 'FISSION'], history: recordBehavior([], { tick: 5980, kind: 'scan' }) });
    const before = structuredClone(ctx), choice = chooseEndlessEvolution(ctx);
    for (let seed = 0; seed < 100; seed++) chooseEndlessEvolution(context({ seed, generation: seed }));
    expect(ctx).toEqual(before); expect(chooseEndlessEvolution(JSON.parse(JSON.stringify(ctx)))).toEqual(choice);
    expect(chooseEndlessEvolution({ ...ctx, counterAvailable: { MIMIC: true, FISSION: true, CARAPACE: true } })).toEqual(choice);
    expect(chooseEndlessEvolution(context({ seed: 0, generation: 0 })).kind).toBe('warn');
    expect(chooseEndlessEvolution(context({ seed: 0xffffffff })).kind).toBe('warn');
  });

  it('maps each selected main to an existing real attack plan and keeps existing ability/weakness descriptions', () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start();
    session.state.world = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    session.state.player.x = 1100; session.state.player.y = 700; session.state.tissue.x = 1100; session.state.tissue.y = 800;
    const seen = new Set<TraitId>();
    for (let seed = 1; seed <= 64; seed++) {
      const choice = warned(chooseEndlessEvolution(context({ seed }))), tactic = ENDLESS_EVOLUTION_TACTICS[choice.main];
      const plan = enemyAttackPlan({ id: 'mapping-fixture', x: 700, y: 700, hp: 170, maxHp: 170, radius: 30,
        kind: 'single', role: 'elite', traits: [choice.main], tactic, hitUntil: 0, scanned: false }, session.state);
      expect(plan?.kind).toBe(tactic); expect(plan!.windup).toBeGreaterThan(0);
      expect(TRAITS[choice.main].ability).toBeTruthy(); expect(TRAITS[choice.main].cost).toBeTruthy(); expect(TRAITS[choice.main].counter).toBeTruthy();
      if (choice.main === 'FISSION') expect(plan!.landings).toHaveLength(2);
      if (choice.main === 'CARAPACE') expect(plan!.chargeEnd).toBeDefined();
      if (choice.main === 'MIMIC') expect(plan!.tissueDamage).toBeGreaterThan(0);
      seen.add(choice.main);
    }
    expect(seen.size).toBe(3);
    // Mapping fixture only; the host owns pending warning and actual birth integration.
  });

  it('audits 1000 seeds over eight generations with real trait outputs, soft behavior changes and bounded candidates', () => {
    const precise = recordBehavior([], { tick: 5900, kind: 'precisionDamage', amount: 5000 });
    const area = recordBehavior([], { tick: 5900, kind: 'areaDamage', amount: 5000 });
    const counts: Record<TraitId, number> = { CARAPACE: 0, FISSION: 0, MIMIC: 0 };
    let behaviorChanges = 0, maximumProbability = 0;
    const sequences = new Set<string>();
    for (let seed = 1; seed <= 1000; seed++) {
      let previousTraits: TraitId[] = ['MIMIC', 'FISSION'], recentPrimaries: TraitId[] = [];
      const sequence: TraitId[] = [];
      for (let generation = 4; generation < 12; generation++) {
        const ctx = context({ seed, generation, history: precise, previousTraits, recentPrimaries, organId: seed % 2 ? 'heart' : 'lung' });
        const choice = warned(chooseEndlessEvolution(ctx));
        expect(chooseEndlessEvolution(JSON.parse(JSON.stringify(ctx)))).toEqual(choice);
        expect(choice.generation).toBe(generation); expect(choice.warningSeconds).toBe(8);
        expect(choice.traits[0]).toBe(choice.main); expect(choice.traits.length).toBeLessThanOrEqual(2);
        expect(new Set(choice.traits).size).toBe(choice.traits.length);
        expect(choice.traits.every(trait => ids.includes(trait) && ctx.counterAvailable[trait])).toBe(true);
        expect(choice.candidates).toHaveLength(3);
        expect(choice.candidates.reduce((sum, candidate) => sum + candidate.probability, 0)).toBeCloseTo(1, 12);
        for (const candidate of choice.candidates) {
          expect(candidate.probability).toBeGreaterThan(0); expect(candidate.probability).toBeLessThanOrEqual(.55 + 1e-12);
          maximumProbability = Math.max(maximumProbability, candidate.probability);
        }
        if (generation === 4) {
          counts[choice.main]++;
          const other = warned(chooseEndlessEvolution({ ...ctx, history: area }));
          expect(chance(choice, 'CARAPACE')).toBeGreaterThan(chance(other, 'CARAPACE'));
          expect(chance(other, 'MIMIC')).toBeGreaterThan(chance(choice, 'MIMIC'));
          if (choice.main !== other.main) behaviorChanges++;
        }
        previousTraits = choice.traits; recentPrimaries = [...recentPrimaries, choice.main].slice(-3); sequence.push(choice.main);
      }
      sequences.add(sequence.join('>'));
    }
    expect(ids.every(trait => counts[trait] > 0)).toBe(true); expect(sequences.size).toBeGreaterThan(3);
    expect(behaviorChanges).toBeGreaterThan(0); expect(behaviorChanges).toBeLessThan(1000);
    console.info('ENDLESS_EVOLUTION_AUDIT', JSON.stringify({ seeds: 1000, generationsPerSeed: 8, firstMainCounts: counts,
      behaviorChangedFirstMain: behaviorChanges, distinctSequences: sequences.size, maximumProbability, warningSeconds: 8 }));
  });
});
