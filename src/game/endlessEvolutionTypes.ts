import type { OrganId, TraitId } from './battleTypes';
import type { BehaviorBin, BehaviorSummary, EvolutionCandidate } from './evolutionTypes';

export interface EndlessEvolutionContext {
  seed: number;
  generation: number;
  tick: number;
  organId: OrganId;
  integrity: number;
  history: readonly BehaviorBin[];
  /** The previous generation's active main first, then its optional companion. */
  previousTraits: readonly TraitId[];
  /** Oldest to newest; only the last three primary choices affect variety. */
  recentPrimaries: readonly TraitId[];
  counterAvailable: Readonly<Record<TraitId, boolean>>;
}

export interface EndlessEvolutionCandidate extends EvolutionCandidate {
  baseWeight: number;
  varietyMultiplier: number;
}

export type EndlessEvolutionDecision =
  | { kind: 'defer'; reason: 'invalid-context' | 'no-candidates' | 'insufficient-diversity' }
  | {
    kind: 'warn';
    generation: number;
    main: TraitId;
    /** Main first, optional distinct legal companion second; never historical seen[]. */
    traits: TraitId[];
    warningSeconds: 8;
    roll: number;
    /** Probabilities describe the new main draw, not companion inclusion rates. */
    candidates: EndlessEvolutionCandidate[];
    summary: BehaviorSummary;
  };
