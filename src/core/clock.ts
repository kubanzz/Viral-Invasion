/** Fixed simulation steps; long background gaps are discarded rather than replayed. */
export class FixedClock {
  private previous: number | null = null;
  private accumulated = 0;
  readonly step: number;
  /** Fraction of the next simulation step available for presentation interpolation. */
  get alpha(): number { return Math.max(0, Math.min(1, this.accumulated / this.step)); }
  /** True when this advance intentionally discarded elapsed wall time. */
  discontinuity = false;
  revision = 0;

  constructor(step = 1 / 60) {
    if (!Number.isFinite(step) || step <= 0) throw new RangeError('Invalid clock step');
    this.step = step;
  }

  reset(nowMs?: number): void {
    this.revision++;
    this.previous = nowMs ?? null;
    this.accumulated = 0;
  }

  advance(nowMs: number, update: (dt: number) => void, active = true): number {
    this.discontinuity = false;
    if (!Number.isFinite(nowMs)) return 0;
    if (!active || this.previous === null) {
      this.reset(nowMs);
      return 0;
    }
    const delta = (nowMs - this.previous) / 1000;
    this.previous = nowMs;
    if (delta < 0 || delta > .25) {
      this.accumulated = 0;
      this.discontinuity = true;
      return 0;
    }
    this.accumulated += delta;
    let steps = 0;
    while (this.accumulated + 1e-10 >= this.step && steps < 8) {
      update(this.step);
      this.accumulated -= this.step;
      steps++;
    }
    // Drop overload instead of storing a simulation debt.
    if (steps === 8) { this.accumulated = 0; this.discontinuity = true; }
    return steps;
  }
}
