import { SeedRng } from '../core/rng';
import type { EndlessSpawnRole } from './endlessTypes';
import type { GameEvent, GameState, Target } from './types';

export type OpeningEvolutionTrait = 'CARAPACE' | 'FISSION';
export type OpeningEvolutionReason = 'precision-dominant' | 'area-dominant' | 'mixed' | 'insufficient-data';
export interface OpeningEvolutionSelection {
  trait: OpeningEvolutionTrait;
  reason: OpeningEvolutionReason;
  frozenAtTick: number;
}
/** Run-local totals never expire; the wave director closes observation after wave two. */
export interface OpeningEvolutionState {
  precisionDamage: number;
  areaDamage: number;
  selection?: OpeningEvolutionSelection;
  warningAt?: number;
  appliedAt?: number;
  firstBornAt?: number;
  waveNotice?: { wave: number; bornAt: number; elite: boolean };
}

export const OPENING_EVOLUTION_BALANCE = {
  minimumDamage: 200, dominanceRatio: .6, seedSalt: 0x4f504556,
  introductionSeconds: 3,
  ordinaryQuotas: { 3: 6, 4: 8, 5: 8 } as Readonly<Record<number, number>>,
} as const;

export function createOpeningEvolution(): OpeningEvolutionState {
  return { precisionDamage: 0, areaDamage: 0 };
}

const positiveFinite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const areaAbilities = new Set(['nova', 'scan', 'dash', 'catalysis', 'charged-slash', 'cannon-aftershock']);

/** Only actual accepted biological damage is evidence; firing, overkill and held tools are not. */
export function recordOpeningDamage(opening: OpeningEvolutionState, event: GameEvent, target?: Target): void {
  const d = event.data;
  if (opening.selection || event.type !== 'TARGET_HIT' || !Number.isSafeInteger(event.tick) || event.tick < 0
    || !positiveFinite(d.damage) || !target || target.id !== d.id || target.role === 'event' || target.role === 'capsule'
    || d.eventTarget === true || d.ability === 'host-event' || d.cause === 'protocol' || d.protocolId !== undefined) return;
  let key: 'precisionDamage' | 'areaDamage' | undefined;
  if (d.cause === 'basic') {
    const tool = d.basicTool ?? d.tool;
    if (tool === 1) key = 'precisionDamage';
    if (tool === 2) key = 'areaDamage';
  } else if (d.cause === 'ability' && typeof d.ability === 'string' && areaAbilities.has(d.ability)) key = 'areaDamage';
  if (key) opening[key] = Math.min(Number.MAX_SAFE_INTEGER, opening[key] + d.damage);
}

/** A single frozen branch; independent fallback RNG cannot perturb births or growth drafts. */
export function freezeOpeningEvolution(opening: OpeningEvolutionState, seed: number, tick: number): OpeningEvolutionSelection {
  if (opening.selection) return opening.selection;
  const precision = positiveFinite(opening.precisionDamage) ? opening.precisionDamage : 0;
  const area = positiveFinite(opening.areaDamage) ? opening.areaDamage : 0;
  const total = precision + area;
  const enough = total >= OPENING_EVOLUTION_BALANCE.minimumDamage;
  let reason: OpeningEvolutionReason = enough ? 'mixed' : 'insufficient-data';
  let trait: OpeningEvolutionTrait;
  if (enough && precision / total >= OPENING_EVOLUTION_BALANCE.dominanceRatio) {
    trait = 'CARAPACE'; reason = 'precision-dominant';
  } else if (enough && area / total >= OPENING_EVOLUTION_BALANCE.dominanceRatio) {
    trait = 'FISSION'; reason = 'area-dominant';
  } else trait = new SeedRng((seed ^ OPENING_EVOLUTION_BALANCE.seedSalt) >>> 0).next() < .5 ? 'CARAPACE' : 'FISSION';
  return opening.selection = { trait, reason, frozenAtTick: tick };
}

/** Quotas replace ordinary recipe slots, including the first; supports/elites/sources stay intact. */
export function openingVariantSlots(wave: number, roles: readonly EndlessSpawnRole[]): number[] {
  const quota = OPENING_EVOLUTION_BALANCE.ordinaryQuotas[wave] ?? 0;
  if (!quota) return [];
  const eligible = roles.flatMap((role, index) => role === 'ordinary' ? [index] : []);
  const count = Math.min(quota, eligible.length);
  return Array.from({ length: count }, (_, index) => eligible[Math.floor(index * eligible.length / count)]);
}

/** The exercise lesson waits for a real special-body introduction, not a planned spawn. */
export function openingIntroductionBlocked(state: GameState): boolean {
  const e = state.endless, opening = e?.evolution?.opening;
  if (!e || e.wave < 3 || !opening?.selection) return false;
  if (e.wave === 3 && e.phase === 'warning') return true;
  return opening.firstBornAt === undefined
    || state.elapsed + 1e-8 < opening.firstBornAt + OPENING_EVOLUTION_BALANCE.introductionSeconds;
}
