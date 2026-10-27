import type { TraitId } from './battleTypes';
import type { Effect, GameEvent, GameState, MessagePriority } from './types';

/** Run-local challenge progress. Arrays contain only the current finite wave. */
export interface EndlessState {
  schemaVersion: 1;
  wave: number;
  clearedWaves: number;
  phase: 'warning' | 'combat' | 'intermission';
  phaseUntil: number;
  phaseStartedAt: number;
  remainingToSpawn: number;
  totalToSpawn: number;
  spawnedIds: string[];
  creditedKillIds: string[];
  kills: number;
  score: number;
  combo: number;
  bestCombo: number;
  lastKillAt: number;
  traits: TraitId[];
  title: string;
  eliteWave: boolean;
  eliteRemaining: number;
  warningSeconds: number;
  nextSpawnAt: number;
  batchSerial: number;
  spawnSerial: number;
  pendingChildren: number;
  directions: string[];
}

export interface EndlessHost {
  state: GameState;
  emit(type: string, data: GameEvent['data']): void;
  message(text: string, seconds?: number, priority?: MessagePriority): void;
  effect(kind: Effect['kind'], from: { x: number; y: number }, to: { x: number; y: number }, radius: number, duration: number): void;
  completeWave(wave: number): void;
}

/** Also permits isolated initialization while the shared GameState is integrated. */
export type EndlessGameState = GameState & { endless?: EndlessState };
