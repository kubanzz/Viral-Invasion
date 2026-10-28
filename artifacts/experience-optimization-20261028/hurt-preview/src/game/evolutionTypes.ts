import type { OrganId, TraitId } from './battleTypes';

export type BehaviorKind = 'precisionDamage' | 'areaDamage' | 'scan' | 'isolate' | 'repair';
export interface BehaviorEvent { tick: number; kind: BehaviorKind; amount?: number }
/** Serializable run data. Multiple accepted events in one simulation tick share a bin. */
export interface BehaviorBin {
  tick: number;
  precisionDamage: number; areaDamage: number;
  scans: number; isolations: number; repaired: number;
}
export interface EvolutionContext {
  seed: number; evolutionIndex: number; tick: number;
  organId: OrganId; integrity: number;
  seen: readonly TraitId[];
  counterAvailable: Readonly<Record<TraitId, boolean>>;
  history: readonly BehaviorBin[];
  /** Optional data-driven stage restriction; normal MVP permits all three branches. */
  eligibleTraits?: readonly TraitId[];
}
export interface BehaviorSummary {
  precisionDamage: number; areaDamage: number;
  precisionRatio: number; areaRatio: number;
  scans: number; isolations: number; repaired: number;
  sampleCount: number; fromTick: number; toTick: number;
}
export interface EvolutionCandidate { trait: TraitId; rawWeight: number; probability: number }
export type EvolutionDecision =
  | { kind: 'stop'; reason: 'trait-cap' }
  | { kind: 'defer'; reason: 'no-candidates' | 'insufficient-diversity' }
  | {
    kind: 'warn'; trait: TraitId; warningSeconds: 8; roll: number;
    candidates: EvolutionCandidate[]; summary: BehaviorSummary;
  };
