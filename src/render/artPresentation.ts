import type { Effect, GameState, Vec } from '../game/types';
import type { Camera } from './camera';
import type { RaisedActorBody } from './raisedObstacleOcclusion';

export interface SceneEntity { id: string; y: number; kind: string; index?: number }
/** A presentation-only bridge. No callback can advance the simulation. */
export interface ArtPresentation {
  environment(state: GameState, camera: Camera): void;
  nativeEntity(entity: SceneEntity, state: GameState, ctx: CanvasRenderingContext2D, depth: number): boolean;
  foreground(state: GameState, camera: Camera): void;
  actorBodies(state: GameState): RaisedActorBody[];
  /** Optional drawing-only origin for a proven emission; simulation endpoints stay untouched. */
  effectOrigin?(effect: Effect, state: GameState): Vec | undefined;
  raster(key: string, canvas: HTMLCanvasElement, depth: number, x?: number, y?: number, scale?: number): void;
}
