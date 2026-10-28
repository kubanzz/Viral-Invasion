import { activeWorld, type GameState, type Vec, type WorldGeometry } from '../game/types';
import { isLegalPosition } from '../actors/collision';

interface Positions {
  scope: string;
  tick: number;
  phase: GameState['phase'];
  player: Vec;
  targets: Map<string, Vec>;
  cells: Map<string, Vec>;
}

const point = (v: Vec): Vec => ({ x: v.x, y: v.y });
const scope = (s: GameState): string => `${s.seed}:${s.runMetrics?.runId ?? s.growth?.runId ?? ''}:${s.battle?.organId ?? 'training'}:${s.world?.width ?? 1200}:${s.world?.height ?? 800}`;
const sample = (s: GameState): Positions => ({
  scope: scope(s), tick: s.tick, phase: s.phase, player: point(s.player),
  targets: new Map(s.targets.map(t => [t.id, point(t)])),
  cells: new Map((s.growth?.cells ?? []).map(c => [`${c.organId}:${c.id}`, point(c)])),
});

// Never interpolate teleports, organ transfers or unusually large corrections.
const MAX_STEP_DISTANCE = 40;
function blend<T extends Vec>(current: T, previous: Vec | undefined, alpha: number): T {
  if (!previous || Math.hypot(current.x - previous.x, current.y - previous.y) > MAX_STEP_DISTANCE) return current;
  return { ...current, x: previous.x + (current.x - previous.x) * alpha, y: previous.y + (current.y - previous.y) * alpha };
}

/** Interpolated footprints must not cut through a fold between legal steps. */
function blendLegal<T extends Vec & { radius: number }>(current: T, previous: Vec | undefined, alpha: number, world: WorldGeometry): T {
  if (!previous || (current.x === previous.x && current.y === previous.y)) return current;
  const interpolated = blend(current, previous, alpha);
  return interpolated === current || isLegalPosition(interpolated, current.radius, world) ? interpolated : current;
}

/** Presentation snapshots contain positions only. GameSession is never mutated. */
export class MotionInterpolation {
  private previous: Positions | undefined;
  private current: Positions | undefined;
  private lastPresented: Positions | undefined;
  private wasPaused = false;
  get holdingPause(): boolean { return this.wasPaused; }

  reset(preserveDisplayed = false): void {
    this.previous = undefined; this.current = undefined;
    if (!preserveDisplayed) { this.lastPresented = undefined; this.wasPaused = false; }
  }

  step(before: GameState, update: () => void): void {
    let previous = sample(before);
    // The first step after an overlay starts at the last displayed location,
    // so interpolation resumes from the frozen image rather than jumping to
    // the (slightly ahead) authoritative position.
    if (this.wasPaused && this.lastPresented && this.lastPresented.scope === previous.scope
      && previous.tick - this.lastPresented.tick >= 0 && previous.tick - this.lastPresented.tick <= 1) {
      const held = this.mergePositions(before, this.lastPresented);
      previous = sample(held);
    }
    update();
    const current = sample(before);
    if (previous.phase !== 'playing' || current.phase !== 'playing' || previous.scope !== current.scope || current.tick !== previous.tick + 1
      || Math.hypot(current.player.x - previous.player.x, current.player.y - previous.player.y) > MAX_STEP_DISTANCE) {
      this.reset(current.phase === 'paused');
      return;
    }
    this.wasPaused = false;
    this.previous = previous;
    this.current = current;
  }

  present(state: GameState, alpha: number): GameState {
    if (state.phase === 'paused') {
      this.wasPaused = true;
      return this.mergePositions(state, this.lastPresented);
    }
    if (state.phase !== 'playing') { this.reset(); return state; }
    const prev = this.previous, current = this.current;
    if ((!prev || !current) && this.wasPaused) return this.mergePositions(state, this.lastPresented);
    if (!prev || !current || current.scope !== scope(state) || current.tick !== state.tick
      || current.player.x !== state.player.x || current.player.y !== state.player.y) {
      this.reset();
      this.lastPresented = sample(state);
      return state;
    }
    const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const world = activeWorld(state), organ = state.battle?.organId ?? 'heart';
    // A straight chord can cut inside a fold when a body slides around it.
    // Show the authoritative position when that happens, without changing the
    // simulated body. Off-organ cells are never checked against this organ.
    const visiblePlayer = blendLegal(state.player, prev.player, t, world);
    const shown: GameState = {
      ...state,
      player: visiblePlayer,
      targets: state.targets.map(target => blendLegal(target, prev.targets.get(target.id), t, world)),
      growth: state.growth?.cells ? { ...state.growth, cells: state.growth.cells.map(cell => cell.organId === organ
        ? blendLegal(cell, prev.cells.get(`${cell.organId}:${cell.id}`), t, world) : cell) } : state.growth,
    };
    this.lastPresented = sample(shown);
    return shown;
  }

  /** Carry only safe positions into the latest state, never old HP/events/phase. */
  private mergePositions(state: GameState, held: Positions | undefined): GameState {
    if (!held || held.scope !== scope(state) || state.tick < held.tick || state.tick - held.tick > 1) return state;
    const world = activeWorld(state), organ = state.battle?.organId ?? 'heart';
    const use = <T extends Vec & { radius: number }>(current: T, old: Vec | undefined): T => {
      if (!old || Math.hypot(current.x - old.x, current.y - old.y) > MAX_STEP_DISTANCE || !isLegalPosition(old, current.radius, world)) return current;
      return { ...current, x: old.x, y: old.y };
    };
    return { ...state, player: use(state.player, held.player),
      targets: state.targets.map(target => use(target, held.targets.get(target.id))),
      growth: state.growth?.cells ? { ...state.growth, cells: state.growth.cells.map(cell => cell.organId === organ
        ? use(cell, held.cells.get(`${cell.organId}:${cell.id}`)) : cell) } : state.growth };
  }
}
