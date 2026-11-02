import type { TraitId } from './battleTypes';
import type { Effect, GameEvent, GameState, MessagePriority, Vec } from './types';
import type { BehaviorBin } from './evolutionTypes';
import type { EndlessEvolutionDecision } from './endlessEvolutionTypes';
import type { EndlessUpgradeId } from './endlessGrowthTypes';

export type EndlessEvolutionWarning = Extract<EndlessEvolutionDecision, { kind: 'warn' }>;
export interface EndlessAdaptationState {
  history: BehaviorBin[];
  /** Oldest to newest; only the latest three main axes survive. */
  recentPrimaries: TraitId[];
  current?: EndlessEvolutionWarning;
  pending?: { decision: EndlessEvolutionWarning; warnedAt: number; appliesAt: number };
}

export type EndlessFormation = 'front' | 'cross' | 'fission-pack' | 'mixed';
export type EndlessSpawnRole = 'ordinary' | 'support' | 'elite' | 'source';
export interface EndlessSourcePlan {
  id: string;
  slot: 0;
  position: Vec;
  status: 'active' | 'destroyed' | 'exhausted';
  bornAt: number | null;
  quotaSlots: number[];
  bornQuotaSlots: number[];
  canceledSlots: number[];
  fallbackBirths: number;
}
export interface EndlessBatch {
  /** Seconds after this wave actually enters combat, not a wall-clock deadline. */
  at: number;
  sector: number;
  spread: number;
  roles: EndlessSpawnRole[];
}

/** Run-local challenge progress. Arrays contain only the current finite wave. */
export interface EndlessState {
  schemaVersion: 1;
  wave: number;
  clearedWaves: number;
  phase: 'warning' | 'combat' | 'intermission';
  phaseUntil: number;
  phaseStartedAt: number;
  remainingToSpawn: number;
  /** Explicitly canceled future ordinary slots; not kills or births. */
  canceledToSpawn: number;
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
  formation: EndlessFormation;
  formationLabel: string;
  batchSchedule: EndlessBatch[];
  batchIndex: number;
  batchMemberIndex: number;
  supportRemaining: number;
  evolution?: EndlessAdaptationState;
  source?: EndlessSourcePlan;
  /** One paused transaction per cleared wave; protocol follows combat. */
  reward?: { wave: number; step: 'combat' | 'protocol' | 'complete' };
  stageCheckpoint?: 'pending' | 'acknowledged';
  tutorial?: {
    fired: boolean; deployed: boolean; tissueHurt: boolean; repaired: boolean;
    seenUpgrades: EndlessUpgradeId[]; upgradeHint?: EndlessUpgradeId; upgradeHintUntil?: number;
  };
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
