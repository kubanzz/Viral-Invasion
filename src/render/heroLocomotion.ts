import { BALANCE, type GameState } from '../game/types';

export interface HeroLocomotion {
  distance: number;
  cycle: number;
  moving: boolean;
  lean: number;
}
/** One full authored two-step cycle spans 112 world units. */
export const HERO_STRIDE_DISTANCE = 112;

/** Samples accepted simulation endpoints, never interpolated render positions.
 * A wall, pause or duplicate paint cannot create a footstep. */
export class HeroLocomotionController {
  private scope = '';
  private sample?: { tick: number; elapsed: number; x: number; y: number; dashing: boolean };
  private value: HeroLocomotion = { distance: 0, cycle: 0, moving: false, lean: 0 };
  reset(): void { this.scope = ''; this.sample = undefined; this.value = { distance: 0, cycle: 0, moving: false, lean: 0 }; }
  get current(): Readonly<HeroLocomotion> { return this.value; }
  observe(state: GameState): Readonly<HeroLocomotion> {
    const scope = `${state.seed}:${state.runMetrics?.runId ?? state.growth?.runId ?? ''}:${state.battle?.organId ?? 'training'}`;
    const p = state.player, previous = this.sample;
    if (scope !== this.scope || previous && (state.tick < previous.tick || state.elapsed < previous.elapsed) || state.phase === 'menu') this.reset();
    this.scope = scope;
    if (this.sample?.tick === state.tick) return this.value;
    if (state.phase !== 'playing') return this.value;
    const old = this.sample;
    const dashing = !!state.playerFlight || p.dashUntil > state.elapsed || state.events.some(event => event.tick === state.tick && event.type === 'PLAYER_DASHED');
    this.sample = { tick: state.tick, elapsed: state.elapsed, x: p.x, y: p.y, dashing };
    if (!old) return this.value;
    const dt = state.elapsed - old.elapsed, dx = p.x - old.x, gap = Math.hypot(dx, p.y - old.y);
    // Dash endpoints and teleports are discontinuities, never fast walking.
    if (dashing || old.dashing || dt <= 0 || dt > .25 || gap > Math.max(40, BALANCE.speed * dt * 1.4)) {
      this.value = { distance: 0, cycle: 0, moving: false, lean: 0 }; return this.value;
    }
    const moving = p.moving && gap > .01;
    const distance = moving ? (this.value.distance + gap) % (HERO_STRIDE_DISTANCE * 1024) : this.value.distance;
    this.value = { distance, cycle: distance / HERO_STRIDE_DISTANCE % 1, moving,
      lean: moving ? Math.max(-1, Math.min(1, dx / dt / BALANCE.speed)) : 0 };
    return this.value;
  }
}
