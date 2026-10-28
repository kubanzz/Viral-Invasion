import type { OrganId, TraitId } from './battleTypes';
import type { Effect, GameEvent, Player, Target, Tissue, Vec, WorldGeometry } from './types';

export type MotherCorePhase = 'awakening' | 'windup' | 'recovery' | 'defeated';
export type MotherCoreAttackKind = 'crystal-sweep' | 'fission-burst' | 'corrosion' | 'brood';
export interface MotherCoreAttack {
  id: string; kind: MotherCoreAttackKind; trait: TraitId;
  startedAt: number; resolveAt: number;
  origin: Vec; aim: Vec; angle: number; range: number; radius: number; halfAngle: number;
  landings: Vec[]; threshold?: number;
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
}
export interface MotherCoreOptions {
  coreId: string; organId: OrganId; traits: readonly TraitId[];
  tick: number; elapsed: number; facing?: number;
}
export interface MotherCoreContext {
  tick: number; elapsed: number; active: boolean;
  core: Readonly<Target>; player: Readonly<Player>; tissue: Readonly<Tissue>;
  geometry: WorldGeometry;
}
interface CoreCommandBase { coreId: string; organId: OrganId }
export type MotherCoreCommand =
  | (CoreCommandBase & { kind: 'pose'; traits: TraitId[]; facing: number })
  | (CoreCommandBase & { kind: 'telegraph'; attack: MotherCoreAttack })
  | (CoreCommandBase & { kind: 'cancelTelegraph' })
  | (CoreCommandBase & { kind: 'damagePlayer'; amount: number; attackId: string; reason: string })
  | (CoreCommandBase & { kind: 'damageTissue'; amount: number; attackId: string; reason: string })
  | (CoreCommandBase & { kind: 'spawn'; actorId: string; sourceId: string; position: Vec; role: 'virus'; traits: TraitId[]; generation: 1; hp: number; radius: number })
  | (CoreCommandBase & { kind: 'expose'; until: number; revealUntil: number; reason: string })
  | (CoreCommandBase & { kind: 'effect'; effect: Effect['kind']; from: Vec; to: Vec; radius: number; duration: number })
  | { kind: 'log'; type: string; data: GameEvent['data'] };
