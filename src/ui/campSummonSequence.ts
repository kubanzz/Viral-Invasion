import type { WeaponRarity } from '../game/expedition';
import type { AntibodyDrawResult, DrawReceipt } from '../game/microfront';

export type CampSummonPhase = 'charge' | 'rarity' | 'item' | 'complete';
export const SUMMON_TIMING = Object.freeze({ charge: 1400, rarity: 1100 });
export type CampSummonReceipt = Readonly<Omit<DrawReceipt, 'results'>> & {
  readonly results: readonly Readonly<AntibodyDrawResult>[];
};
export interface CampSummonSequenceView {
  readonly phase: CampSummonPhase;
  readonly phaseDuration: number;
  readonly receipt: CampSummonReceipt;
  readonly resultCount: number;
  /** Original index of the batch's highest rarity; the saved order stays intact. */
  readonly index: number;
  readonly position: number;
  readonly highestRarity: WeaponRarity;
  readonly currentRarity: WeaponRarity;
  readonly revealedIndices: readonly number[];
  readonly reduced: boolean;
  readonly key: number;
}

const rank: Record<WeaponRarity, number> = { white: 0, blue: 1, purple: 2, gold: 3 };

/** A skippable presentation of a saved receipt. Never draws or settles rewards. */
export class CampSummonSequence {
  private current: CampSummonSequenceView | undefined;
  private indices: readonly number[] = [];
  private time = 0;
  private deadline = 0;
  private serial = 0;

  get view(): CampSummonSequenceView | undefined { return this.current; }
  get active(): boolean { return !!this.current && this.current.phase !== 'complete'; }

  start(receipt: DrawReceipt | undefined, now: number, reduced = false): void {
    if (!receipt) { this.clear(); return; }
    const saved: CampSummonReceipt = Object.freeze({ ...receipt,
      results: Object.freeze(receipt.results.map(result => Object.freeze({ ...result }))) });
    this.indices = Object.freeze(saved.results.map((_, index) => index));
    const highestIndex = this.indices.reduce((best, index) => rank[saved.results[index].rarity] > rank[saved.results[best].rarity] ? index : best, 0);
    this.time = Number.isFinite(now) ? now : 0;
    this.deadline = this.time + SUMMON_TIMING.charge;
    const highestRarity = saved.results[highestIndex]?.rarity ?? 'white';
    this.current = Object.freeze({ phase: reduced || !saved.results.length ? 'complete' : 'charge',
      phaseDuration: reduced || !saved.results.length ? 0 : SUMMON_TIMING.charge,
      receipt: saved, resultCount: saved.results.length, position: 0, index: highestIndex, highestRarity, currentRarity: highestRarity,
      revealedIndices: reduced ? this.indices : Object.freeze([]), reduced, key: ++this.serial });
  }

  update(now: number): boolean {
    if (!this.active || !Number.isFinite(now)) return false;
    this.time = Math.max(this.time, now);
    let changed = false;
    if (this.current?.phase === 'charge' && this.time >= this.deadline) {
      this.deadline += SUMMON_TIMING.rarity;
      this.show('rarity'); changed = true;
    }
    if (this.current?.phase === 'rarity' && this.time >= this.deadline) {
      this.show('item'); changed = true;
    }
    return changed;
  }

  reveal(): void { if (this.current?.phase === 'rarity') this.show('item'); }

  next(): void {
    if (this.current?.phase === 'item') this.show('complete');
  }

  skip(): void { if (this.active) this.show('complete'); }
  clear(): void { this.current = undefined; this.indices = []; }

  private show(phase: CampSummonPhase): void {
    const current = this.current!;
    this.current = Object.freeze({ ...current, phase,
      phaseDuration: phase === 'rarity' ? SUMMON_TIMING.rarity : phase === 'charge' ? SUMMON_TIMING.charge : 0,
      revealedIndices: phase === 'item' || phase === 'complete' ? this.indices : Object.freeze([]), key: ++this.serial });
  }
}
