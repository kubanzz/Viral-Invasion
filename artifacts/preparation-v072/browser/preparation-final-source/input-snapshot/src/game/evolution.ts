import { SeedRng } from '../core/rng';
import type { TraitId } from './battleTypes';
import type { BehaviorBin, BehaviorEvent, BehaviorSummary, EvolutionContext, EvolutionDecision } from './evolutionTypes';
export type * from './evolutionTypes';

export const EVOLUTION_BALANCE = {
  windowTicks: 90 * 60, probabilityCap: .55, maxTraits: 2, warningSeconds: 8,
  damageConfidence: 200, scanReference: 12, isolationReference: 8, repairReference: 100,
} as const;

const TRAIT_IDS: readonly TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
const nonnegative = (value: number): number => Number.isFinite(value) ? Math.max(0, value) : 0;
const unit = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const validTick = (tick: number): boolean => Number.isSafeInteger(tick) && tick >= 0;
const emptyBin = (tick: number): BehaviorBin => ({ tick, precisionDamage: 0, areaDamage: 0, scans: 0, isolations: 0, repaired: 0 });

/** Pure sliding-window update; paused hosts do not call it and no wall clock is consulted. */
export function recordBehavior(history: readonly BehaviorBin[], event: BehaviorEvent, nowTick = event.tick): BehaviorBin[] {
  if (!validTick(nowTick)) return [];
  const bins = new Map<number, BehaviorBin>();
  const cutoff = nowTick - EVOLUTION_BALANCE.windowTicks;
  for (const previous of history) {
    if (!validTick(previous.tick) || previous.tick < cutoff || previous.tick > nowTick) continue;
    const current = bins.get(previous.tick) ?? emptyBin(previous.tick);
    current.precisionDamage += nonnegative(previous.precisionDamage);
    current.areaDamage += nonnegative(previous.areaDamage);
    current.scans += nonnegative(previous.scans);
    current.isolations += nonnegative(previous.isolations);
    current.repaired += nonnegative(previous.repaired);
    bins.set(previous.tick, current);
  }
  if (validTick(event.tick) && event.tick >= cutoff && event.tick <= nowTick) {
    const amount = event.kind === 'scan' || event.kind === 'isolate' ? 1 : nonnegative(event.amount ?? 0);
    // Rejected actions/misses/zero repairs are not evidence of a player strategy.
    if (amount > 0) {
      const current = bins.get(event.tick) ?? emptyBin(event.tick);
      if (event.kind === 'precisionDamage') current.precisionDamage += amount;
      else if (event.kind === 'areaDamage') current.areaDamage += amount;
      else if (event.kind === 'scan') current.scans++;
      else if (event.kind === 'isolate') current.isolations++;
      else if (event.kind === 'repair') current.repaired += amount;
      bins.set(event.tick, current);
    }
  }
  return [...bins.values()].sort((a, b) => a.tick - b.tick);
}

export function summarizeBehavior(history: readonly BehaviorBin[], nowTick: number): BehaviorSummary {
  const tick = validTick(nowTick) ? nowTick : 0;
  const fromTick = Math.max(0, tick - EVOLUTION_BALANCE.windowTicks);
  let precisionDamage = 0; let areaDamage = 0; let scans = 0; let isolations = 0; let repaired = 0; let sampleCount = 0;
  for (const bin of history) {
    if (!validTick(bin.tick) || bin.tick < fromTick || bin.tick > tick) continue;
    precisionDamage += nonnegative(bin.precisionDamage); areaDamage += nonnegative(bin.areaDamage);
    scans += nonnegative(bin.scans); isolations += nonnegative(bin.isolations); repaired += nonnegative(bin.repaired);
    sampleCount++;
  }
  const total = precisionDamage + areaDamage;
  return { precisionDamage, areaDamage, precisionRatio: total > 0 ? precisionDamage / total : 0, areaRatio: total > 0 ? areaDamage / total : 0, scans, isolations, repaired, sampleCount, fromTick, toTick: tick };
}

/** Water-filling redistribution: capping then blindly normalizing would break the cap. */
export function capSelectionProbabilities(rawWeights: readonly number[], cap = EVOLUTION_BALANCE.probabilityCap): number[] {
  const count = rawWeights.length;
  if (!count) return [];
  if (!Number.isFinite(cap) || cap <= 0 || cap > 1 || count * cap < 1 - 1e-12) {
    throw new RangeError('Probability cap cannot accommodate this candidate count');
  }
  const cleaned = rawWeights.map(nonnegative);
  const maximum = Math.max(...cleaned);
  // Scaling first avoids overflowing the sum even for finite extreme inputs.
  const weights = maximum > 0 ? cleaned.map(weight => weight / maximum) : cleaned.map(() => 1);
  const probabilities = rawWeights.map(() => 0);
  let remaining = weights.map((_, index) => index);
  let mass = 1;
  while (remaining.length) {
    const total = remaining.reduce((sum, index) => sum + weights[index], 0);
    const allocation = (index: number) => total > 0 ? mass * weights[index] / total : mass / remaining.length;
    const capped = remaining.filter(index => allocation(index) > cap + 1e-14);
    if (!capped.length) {
      for (const index of remaining) probabilities[index] = allocation(index);
      break;
    }
    for (const index of capped) { probabilities[index] = cap; mass -= cap; }
    remaining = remaining.filter(index => !capped.includes(index));
  }
  return probabilities;
}

function evolutionSeed(seed: number, index: number): number {
  // A dedicated salt isolates choices from actor spawns, drafts and rendering.
  let value = (seed >>> 0) ^ 0x45564f4c ^ Math.imul((index >>> 0) + 1, 0x9e3779b1);
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}

function rawWeight(trait: TraitId, context: EvolutionContext, summary: BehaviorSummary): number {
  const damage = summary.precisionDamage + summary.areaDamage;
  const confidence = damage / (damage + EVOLUTION_BALANCE.damageConfidence);
  const scans = unit(summary.scans / EVOLUTION_BALANCE.scanReference);
  const isolated = unit(summary.isolations / EVOLUTION_BALANCE.isolationReference);
  const repairs = unit(summary.repaired / EVOLUTION_BALANCE.repairReference);
  const organDamage = 1 - unit(context.integrity / 100);
  let environmentBias = 0; let responseBias = 0;
  if (trait === 'CARAPACE') {
    environmentBias = context.organId === 'heart' ? .12 : 0;
    responseBias = .35 * summary.precisionRatio * confidence + .05 * scans - .05 * isolated + .05 * organDamage;
  } else if (trait === 'FISSION') {
    environmentBias = context.organId === 'lung' ? .12 : 0;
    responseBias = .12 * summary.areaRatio * confidence + .08 * scans + .05 * isolated - .05 * organDamage;
  } else {
    environmentBias = context.organId === 'lung' ? .06 : 0;
    responseBias = .20 * summary.areaRatio * confidence - .12 * scans + .10 * isolated + .10 * repairs;
  }
  return Math.max(.1, 1 + environmentBias + responseBias);
}

export function chooseEvolution(context: EvolutionContext): EvolutionDecision {
  const seen = new Set(context.seen);
  if (seen.size >= EVOLUTION_BALANCE.maxTraits) return { kind: 'stop', reason: 'trait-cap' };
  const permitted = new Set(context.eligibleTraits ?? TRAIT_IDS);
  const eligible = TRAIT_IDS.filter(trait => permitted.has(trait) && !seen.has(trait) && context.counterAvailable[trait]);
  if (!eligible.length) return { kind: 'defer', reason: 'no-candidates' };
  if (eligible.length * EVOLUTION_BALANCE.probabilityCap < 1) return { kind: 'defer', reason: 'insufficient-diversity' };
  const summary = summarizeBehavior(context.history, context.tick);
  const weights = eligible.map(trait => rawWeight(trait, context, summary));
  const probabilities = capSelectionProbabilities(weights);
  const roll = new SeedRng(evolutionSeed(context.seed, context.evolutionIndex)).next();
  let cumulative = 0;
  let selected = eligible.at(-1)!;
  for (let index = 0; index < eligible.length; index++) {
    cumulative += probabilities[index];
    if (roll < cumulative) { selected = eligible[index]; break; }
  }
  return { kind: 'warn', trait: selected, warningSeconds: EVOLUTION_BALANCE.warningSeconds, roll,
    candidates: eligible.map((trait, index) => ({ trait, rawWeight: weights[index], probability: probabilities[index] })), summary };
}
