import type { Effect, GameState, Vec } from '../game/types';
import type { Camera } from './camera';
import type { VisualBounds } from './raisedObstacleGeometry';
import type { RaisedActorBody } from './raisedObstacleOcclusion';

/** Rescue bosses and the hidden campaign retain independent rule owners. */
export function presentedMotherCombat(state: GameState) {
  return (state.endless && state.battle?.organId === 'heart' ? state.territory?.bossCombat : undefined) ?? state.campaign?.core.combat;
}

export interface SceneEntity { id: string; y: number; kind: string; index?: number }
/** A presentation-only bridge. No callback can advance the simulation. */
export interface ArtPresentation {
  environment(state: GameState, camera: Camera): void;
  nativeEntity(entity: SceneEntity, state: GameState, ctx: CanvasRenderingContext2D, depth: number): boolean;
  foreground(state: GameState, camera: Camera): void;
  actorBodies(state: GameState): RaisedActorBody[];
  playerBounds?(state: GameState): VisualBounds;
  /** Optional drawing-only origin for a proven emission; simulation endpoints stay untouched. */
  effectOrigin?(effect: Effect, state: GameState): Vec | undefined;
  projectileOrigin?(castId: string): Vec | undefined;
  /** Registered support sole for the current native hero frame, in ground units. */
  heroContact?(): Vec | undefined;
  raster(key: string, canvas: HTMLCanvasElement, depth: number, x?: number, y?: number, scale?: number): void;
}
