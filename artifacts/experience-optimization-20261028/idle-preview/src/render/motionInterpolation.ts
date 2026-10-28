import { activeWorld, type GameState, type Vec } from '../game/types';
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

/** Presentation snapshots contain positions only. GameSession is never mutated. */
export class MotionInterpolation {
  private previous: Positions | undefined;
  private current: Positions | undefined;

  reset(): void { this.previous = undefined; this.current = undefined; }

  step(before: GameState, update: () => void): void {
    const previous = sample(before);
    update();
    const current = sample(before);
    if (previous.phase !== 'playing' || current.phase !== 'playing' || previous.scope !== current.scope || current.tick !== previous.tick + 1
      || Math.hypot(current.player.x - previous.player.x, current.player.y - previous.player.y) > MAX_STEP_DISTANCE) {
      this.reset();
      return;
    }
    this.previous = previous;
    this.current = current;
  }

  present(state: GameState, alpha: number): GameState {
    const prev = this.previous, current = this.current;
    if (!prev || !current || state.phase !== 'playing' || current.scope !== scope(state) || current.tick !== state.tick
      || current.player.x !== state.player.x || current.player.y !== state.player.y) {
      this.reset();
      return state;
    }
    const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const player = blend(state.player, prev.player, t);
    // A straight chord between two valid collision-resolved positions can cut
    // inside a round obstacle when the actor slides around its perimeter.
    // Rendering the authoritative position avoids an illegal footprint without
    // affecting simulation or extrapolating through the obstacle.
    const visiblePlayer = isLegalPosition(player, player.radius, activeWorld(state)) ? player : state.player;
    return {
      ...state,
      player: visiblePlayer,
      targets: state.targets.map(target => blend(target, prev.targets.get(target.id), t)),
      growth: state.growth?.cells ? { ...state.growth, cells: state.growth.cells.map(cell => blend(cell, prev.cells.get(`${cell.organId}:${cell.id}`), t)) } : state.growth,
    };
  }
}
