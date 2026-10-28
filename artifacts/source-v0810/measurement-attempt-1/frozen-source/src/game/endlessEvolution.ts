import type { TraitId } from './battleTypes';
import type { EnemyTactic } from './enemyTacticsTypes';
import { capSelectionProbabilities, chooseEvolution, EVOLUTION_BALANCE } from './evolution';
import type { EndlessEvolutionContext, EndlessEvolutionDecision } from './endlessEvolutionTypes';

export type * from './endlessEvolutionTypes';

export const ENDLESS_EVOLUTION_BALANCE = {
  seedSalt: 0x454e4456, recentLimit: 3, latestMultiplier: .65, recentMultiplier: .85,
} as const;

/** Reuses the three taught elite attacks; no new art, attack or passive. */
export const ENDLESS_EVOLUTION_TACTICS: Readonly<Record<TraitId, EnemyTactic>> = {
  CARAPACE: 'crystal-charge', FISSION: 'fission-burst', MIMIC: 'mimic-corrosion',
};
const TRAITS: readonly TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
const known = (trait: unknown): trait is TraitId => TRAITS.some(value => value === trait);
const nonnegativeInteger = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
const valid = (context: EndlessEvolutionContext): boolean => !!context
  && nonnegativeInteger(context.seed) && context.seed <= 0xffffffff
  && nonnegativeInteger(context.generation) && nonnegativeInteger(context.tick)
  && (context.organId === 'heart' || context.organId === 'lung')
  && Number.isFinite(context.integrity) && context.integrity >= 0 && context.integrity <= 100
  && Array.isArray(context.previousTraits) && context.previousTraits.length <= 2 && context.previousTraits.every(known)
  && Array.isArray(context.recentPrimaries) && context.recentPrimaries.every(known)
  && !!context.counterAvailable && TRAITS.every(trait => typeof context.counterAvailable[trait] === 'boolean')
  && Array.isArray(context.history) && context.history.length <= EVOLUTION_BALANCE.windowTicks + 1
  && context.history.every(bin => !!bin && nonnegativeInteger(bin.tick)
    && [bin.precisionDamage, bin.areaDamage, bin.scans, bin.isolations, bin.repaired].every(value => Number.isFinite(value) && value >= 0));

/** Pure one-generation decision. The host owns the eight-second pending/commit transaction. */
export function chooseEndlessEvolution(context: EndlessEvolutionContext): EndlessEvolutionDecision {
  if (!valid(context)) return { kind: 'defer', reason: 'invalid-context' };
  // The campaign's seen cap remains untouched. A new generation chooses a new
  // main from all taught legal branches, not a cumulative discovery collection.
  const base = chooseEvolution({ seed: (context.seed ^ ENDLESS_EVOLUTION_BALANCE.seedSalt) >>> 0,
    evolutionIndex: context.generation, tick: context.tick, organId: context.organId, integrity: context.integrity,
    history: context.history, seen: [], counterAvailable: context.counterAvailable });
  if (base.kind === 'defer') return base;
  if (base.kind !== 'warn' || !Object.values(base.summary).every(Number.isFinite)
    || !base.candidates.every(candidate => Number.isFinite(candidate.rawWeight) && candidate.rawWeight > 0)) {
    return { kind: 'defer', reason: 'invalid-context' };
  }
  const recent = context.recentPrimaries.slice(-ENDLESS_EVOLUTION_BALANCE.recentLimit);
  const candidates = base.candidates.map(candidate => {
    const varietyMultiplier = candidate.trait === recent.at(-1) ? ENDLESS_EVOLUTION_BALANCE.latestMultiplier
      : recent.includes(candidate.trait) ? ENDLESS_EVOLUTION_BALANCE.recentMultiplier : 1;
    return { trait: candidate.trait, baseWeight: candidate.rawWeight, varietyMultiplier,
      rawWeight: candidate.rawWeight * varietyMultiplier, probability: 0 };
  });
  const probabilities = capSelectionProbabilities(candidates.map(candidate => candidate.rawWeight), EVOLUTION_BALANCE.probabilityCap);
  candidates.forEach((candidate, index) => { candidate.probability = probabilities[index]; });
  // Use the independent base roll against the FINAL capped variety weights.
  // Returning base.trait here would only change the displayed probabilities.
  let cumulative = 0, main = candidates.at(-1)!.trait;
  for (const candidate of candidates) {
    cumulative += candidate.probability;
    if (base.roll < cumulative) { main = candidate.trait; break; }
  }
  const companion = [...context.previousTraits, ...candidates.map(candidate => candidate.trait)]
    .find(trait => trait !== main && context.counterAvailable[trait]);
  return { kind: 'warn', generation: context.generation, main, traits: companion ? [main, companion] : [main],
    warningSeconds: 8, roll: base.roll, candidates, summary: base.summary };
}
