import type { GameEvent, Vec } from './types';
import type { MotherCoreState } from './motherCoreTypes';
import type { TerritoryCannonState } from './territoryCannon';

export type TerritoryNodeId = 'core' | 'heart-healing-1' | 'heart-healing-2' | 'front-north' | 'front-south' | 'source-west' | 'source-east';
export type TerritorySourceId = 'source-west' | 'source-east';
export type TerritoryLaneId = 'north' | 'south';
export type TerritoryFrontId = 'front-north' | 'front-south';
export type TerritoryHealingId = 'heart-healing-1' | 'heart-healing-2';
export type TerritoryStage = 'rescue' | 'bossPending' | 'boss' | 'cleanup' | 'victory' | 'guard';

export interface TerritoryDefenseAttempt {
  squadId: string;
  beaconId: string;
  nodeId: TerritoryFrontId;
  enteredDefense: boolean;
  invaderHit: boolean;
  cleared?: boolean;
}

export interface TerritoryLaneDefense {
  /** First genuine defense, by the player or allies, grants the fixed beacon milestone. */
  repelled: boolean;
  /** Legacy snapshots only. Source access and victory depend on node ownership. */
  handoff: boolean;
  attempt?: TerritoryDefenseAttempt;
  /** A cleared finite squad may wait for its last capture progress to recede across waves. */
  repelProof?: { squadId: string; nodeId: TerritoryNodeId };
}

export interface TerritoryStability {
  totalSeconds: number;
  currentSeconds: number;
  bestSeconds: number;
  active: boolean;
}

export interface TerritoryNode extends Vec {
  id: TerritoryNodeId;
  name: string;
  kind: 'core' | 'healing' | 'front' | 'source';
  owner: 'healthy' | 'infected';
  /** Percentage points, independently of the legacy healing-point state. */
  infectionProgress: number;
  purificationProgress: number;
  /** A destroyed source remains healthy and cannot be recaptured. */
  permanent: boolean;
  /** Records the first actual purification; recapture cannot farm its reward. */
  firstPurified: boolean;
  /** Simulation timestamps survive recent-event eviction and freeze on pause. */
  contestedAt?: number;
  capturedAt?: number;
}

export interface TerritorySourceState {
  nodeId: TerritorySourceId;
  frontNodeId: TerritoryFrontId;
  healingNodeId: TerritoryHealingId;
  unlocked: boolean;
  spawned: boolean;
  destroyed: boolean;
  rewarded: boolean;
  actorId?: string;
}

/** The original rescue outcome survives optional guard play without rewriting. */
export interface TerritoryRescueSnapshot {
  runId: string;
  seed: number;
  atTick: number;
  elapsed: number;
  wave: number;
  clearedWaves: number;
  score: number;
  kills: number;
  bestCombo: number;
  level: number;
  playerHp: number;
  coreHp: number;
  fullyPurifiedSeconds: number;
  longestFullyPurifiedSeconds: number;
}

export interface TerritoryState {
  schemaVersion: 1;
  /** Unique host session identity, separate from deterministic simulation IDs. */
  recordId?: string;
  stage: TerritoryStage;
  nodes: TerritoryNode[];
  sources: Record<TerritorySourceId, TerritorySourceState>;
  /** Node progress is authoritative; startedAt is presentation metadata only. */
  purification: { nodeId: TerritoryNodeId; startedAt: number } | null;
  purificationInterruptedUntil: number;
  defense: Record<TerritoryLaneId, TerritoryLaneDefense>;
  stability: TerritoryStability;
  cannon?: TerritoryCannonState;
  construction?: import('./constructionTypes').ConstructionState;
  /** Most recent actual contact/attack exposure in simulation seconds. */
  playerExposureAt: number;
  healingContact: { nodeId: string | null; seconds: number; healed?: number; exposure?: boolean };
  bossId?: string;
  bossCombat?: MotherCoreState;
  rescueSnapshot?: TerritoryRescueSnapshot;
  campBuilt: boolean;
}

export interface PlayerInfection {
  until: number;
  /** Refreshing contact extends until but never postpones the next damage tick. */
  nextTickAt: number;
  sourceId?: string;
}

export interface TerritoryRuleEvent {
  type: string;
  data: GameEvent['data'];
}

export interface TerritoryPurificationResult {
  accepted: boolean;
  reason?: 'inactive' | 'airborne' | 'range' | 'healthy' | 'source' | 'core' | 'invader' | 'healing-required';
  nodeId?: TerritoryNodeId;
  events: TerritoryRuleEvent[];
}

export interface TerritoryLane {
  readonly id: TerritoryLaneId;
  readonly sourceId: TerritorySourceId;
  readonly frontNodeId: TerritoryFrontId;
  readonly healingNodeId: TerritoryHealingId;
  readonly path: readonly [TerritorySourceId, TerritoryFrontId, TerritoryHealingId, 'core'];
}
export type TerritoryNodeStatus = 'healthy' | 'contested' | 'infected' | 'purifying';
export type TerritoryPurificationPauseReason = 'inactive' | 'airborne' | 'out-of-range' | 'invader' | 'contaminant' | 'healing-required' | 'hurt';
export interface TerritoryNodeView {
  node: TerritoryNode;
  status: TerritoryNodeStatus;
  infecting: boolean;
  recovering: boolean;
  infectionProgress: number;
  pollutionRate: number;
  purificationProgress: number;
  purificationActive: boolean;
  pausedReason?: TerritoryPurificationPauseReason;
  requiredNodeId?: TerritoryHealingId;
  /** Real current attackers, never a static infected owner's existence. */
  attackerIds: string[];
  attackOrigins: Vec[];
  /** Actual first attacker's current world position; undefined without an attacker. */
  incomingFrom?: Vec;
}
export interface TerritoryContextView {
  action: 'purify' | 'repair' | 'blocked' | 'none';
  /** Displayed purification node, including a paused existing channel. */
  nodeId?: TerritoryNodeId;
  /** Actual target of the available action; repair always targets core. */
  actionNodeId?: TerritoryNodeId;
  candidate?: TerritoryNode;
  activeNodeId?: TerritoryNodeId;
  reason?: TerritoryPurificationResult['reason'] | 'out-of-range' | 'hurt' | 'contaminant';
  progress: number;
  pausedReason?: TerritoryPurificationPauseReason;
  requiredNodeId?: TerritoryHealingId;
}
export interface TerritoryLaneView {
  laneId: TerritoryLaneId;
  sourceId: TerritorySourceId;
  frontNodeId: TerritoryFrontId;
  healingNodeId: TerritoryHealingId;
  source: TerritoryNodeView;
  front: TerritoryNodeView;
  healing: TerritoryNodeView;
  goal: TerritoryNode;
  origin: Vec;
  shielded: boolean;
  attackedNodeIds: TerritoryNodeId[];
  /** Only a node actually being captured; never a scheduled future squad. */
  warning?: { nodeId: TerritoryNodeId; progress: number; seconds: number };
  /** A separately scheduled, finite squad that has not yet departed. */
  incoming?: { squadId: string; nodeId: TerritoryNodeId; origin: Vec; seconds: number; blocked: boolean };
}
