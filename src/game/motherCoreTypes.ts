import type { OrganId, TraitId } from './battleTypes';
import type { Effect, GameEvent, Player, Target, Tissue, Vec, WorldGeometry } from './types';

export type MotherCorePhase = 'awakening' | 'windup' | 'lunging' | 'recovery' | 'defeated';
export type MotherCoreAttackKind = 'crystal-sweep' | 'fission-burst' | 'corrosion' | 'brood' | 'heart-pulse' | 'heart-marked-strike' | 'heart-guard-call' | 'heart-lunge';
export interface MotherCoreAttack {
  id: string; kind: MotherCoreAttackKind; trait: TraitId;
  startedAt: number; resolveAt: number;
  origin: Vec; aim: Vec; angle: number; range: number; radius: number; halfAngle: number;
  landings: Vec[]; threshold?: number;
  /** Locked together with the telegraph; presentation never determines damage. */
  damage?: number; sweepStep?: 1 | 2;
}
export interface HeartBossRuntime {
  stage: 1 | 2 | 3; stageStartedAt: number; transitionUntil: number;
  toughness: number; toughnessMax: number; brokenUntil: number;
  pendingBarBreak: boolean; blockedDamageTransactions: string[];
  attackIndex: number; nextGuardAt: number; guardWaveSerial: number;
}
export interface MotherCoreDamageOrigin { rootId?: string; castId?: string }
export interface MotherCoreLocomotion {
  mode: 'idle' | 'pursuit' | 'strafe' | 'lunge-windup' | 'lunge';
  moving: boolean; velocity: Vec; anchor: Vec; route: Vec[]; replanAt: number; routeGoal?: Vec; holdUntil: number;
  trail?: { from: Vec; to: Vec; at: number };
  lunge?: { attack: MotherCoreAttack; direction: Vec; aim: Vec; startedAt: number; endsAt: number; lastAt: number; hitPlayer: boolean };
}
/** Run-local serializable combat state, retained when its organ is offscreen. */
export interface MotherCoreState {
  schemaVersion: 1; coreId: string; organId: OrganId; traits: TraitId[];
  activeTrait: TraitId; phase: MotherCorePhase; phaseIndex: number; phaseStartedAt: number;
  facing: number; nextActionAt: number; attack: MotherCoreAttack | null;
  exposedUntil: number; revealedUntil: number;
  broodQueued: number[]; broodReleased: number[];
  attackSerial: number; attacksResolved: number; scanInterrupts: number;
  cleared: boolean; clearedAt: number | null; lastTick: number;
  introduced: boolean; lastScanTick: number; lastPulseTick: number;
  seenTraits: TraitId[];
  membrane: { total: number; remaining: number; floorRatio: number; thresholdReached: boolean };
  /** Heart expedition only; old campaign controllers do not opt into this phase. */
  heartExpedition?: boolean;
  heartBoss?: HeartBossRuntime;
  secondPhase?: boolean;
  pulseQueued?: boolean;
  pulseUsed?: boolean;
  pulse?: { attack: MotherCoreAttack; startedAt: number; endsAt: number; hitPlayer: boolean };
  locomotion?: MotherCoreLocomotion;
}
export interface MotherCoreOptions {
  coreId: string; organId: OrganId; traits: readonly TraitId[];
  tick: number; elapsed: number; facing?: number; heartExpedition?: boolean;
}
export interface MotherCoreContext {
  tick: number; elapsed: number; active: boolean;
  core: Readonly<Target>; player: Readonly<Player>; tissue: Readonly<Tissue>;
  geometry: WorldGeometry;
  /** Alive guards with sourceId `${core.id}:guard`, supplied by the host. */
  liveGuardCount?: number;
  /** Shared slow/trace freeze, supplied by the authoritative session. */
  movementFactor?: number;
}
interface CoreCommandBase { coreId: string; organId: OrganId }
export type MotherCoreCommand =
  | (CoreCommandBase & { kind: 'pose'; traits: TraitId[]; facing: number })
  | (CoreCommandBase & { kind: 'move'; delta: Vec })
  | (CoreCommandBase & { kind: 'telegraph'; attack: MotherCoreAttack })
  | (CoreCommandBase & { kind: 'cancelTelegraph' })
  | (CoreCommandBase & { kind: 'damagePlayer'; amount: number; attackId: string; reason: string })
  | (CoreCommandBase & { kind: 'damageTissue'; amount: number; attackId: string; reason: string })
  | (CoreCommandBase & { kind: 'spawn'; actorId: string; sourceId: string; position: Vec; role: 'virus'; traits: TraitId[]; generation: 1; hp: number; radius: number })
  | (CoreCommandBase & { kind: 'expose'; until: number; revealUntil: number; reason: string })
  | (CoreCommandBase & { kind: 'effect'; effect: Effect['kind']; from: Vec; to: Vec; radius: number; duration: number })
  | { kind: 'log'; type: string; data: GameEvent['data'] };
