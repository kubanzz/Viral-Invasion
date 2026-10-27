import type { OrganGraph, OrganId, OrganNode, PulseState, TraitId } from './battleTypes';
import type { GameEvent, MessagePriority, Target, Tissue, Vec, WorldGeometry } from './types';
import type { MotherCoreState } from './motherCoreTypes';

export interface LungFlowState {
  phase: 'inhale' | 'exhale'; phaseRemaining: number; airwayOpen: boolean;
  changedAt: number; pressureUntil: number; origin: Vec; direction: Vec; strength: number;
}
export interface OrganArena {
  organId: OrganId; activated: boolean; geometry: WorldGeometry;
  targets: Target[]; tissue: Tissue; terminal: Vec; graph: OrganGraph; pulse: PulseState;
  nextSpawnAt: Record<string, number>; gateChangedAt: number; organLowSince: number | null;
  departedAt: number | null; nextBackgroundAt: number; backgroundLoss: number; backgroundReason: string;
  offscreenElapsed: number; nextBackgroundElapsed: number; lastPressureAt: number; totalBackgroundLoss: number;
  flow?: LungFlowState;
}
export type MigrationChoice = 'pursue' | 'block' | 'ignore';
export interface MigrationState {
  id: string; status: 'locked' | 'warning' | 'blocking' | 'pursuing' | 'resolved';
  from: OrganId; to: OrganId; warnedAt: number; deadline: number;
  choice: MigrationChoice | null; resolvedAt: number | null; blockStartedAt: number | null;
  carrierIds: string[]; interceptUntil: number | null; interceptSucceeded: boolean | null;
  clearedCarrierIds: string[];
  interceptResolvedAt: number | null;
}
export interface CoreProgress {
  status: 'locked' | 'ready' | 'active' | 'cleared'; organId: OrganId; actorId: string;
  traits: TraitId[]; clearedAt: number | null; combat?: MotherCoreState;
}
export interface CampaignState {
  seed: number; activeOrganId: OrganId; arenas: Record<OrganId, OrganArena>;
  phase: 'contain' | 'migration' | 'counterattack' | 'core-ready' | 'core' | 'retest';
  migration: MigrationState; travelReadyAt: number; core: CoreProgress;
  clearedSourceIds: string[]; clearedEliteIds: string[]; transactionIds: string[];
  requiredSourceIds: Record<OrganId, string[]>;
  pendingCommands: CampaignCommand[];
  progress: { sourceClears: number; sourceTotal: number; eliteClears: number; coreCleared: boolean; organConditions: boolean; infectionCondition: boolean };
  history: Array<{ at: number; text: string }>;
  stats: { travels: number; airwayUses: number; backgroundDamage: number; migrationChoice: MigrationChoice | null };
}
export type CampaignCommand =
  | { kind: 'moveActor'; organId: OrganId; targetId: string; delta: Vec }
  | { kind: 'spawnActor'; organId: OrganId; target: Target; eventId: string }
  | { kind: 'spawnSource'; organId: OrganId; id: string; position: Vec; hp: number; connectTo: string; eventId: string }
  | { kind: 'spawnCore'; organId: OrganId; coreId: string; position: Vec; traits: TraitId[]; eventId: string }
  | { kind: 'organDamage'; organId: OrganId; amount: number; reason: string; eventId: string }
  | { kind: 'infectionDelta'; amount: number; reason: string; eventId: string }
  | { kind: 'setRoute'; organId: OrganId; nodeId: string; open: boolean; eventId: string }
  | { kind: 'travel'; from: OrganId; to: OrganId; entry: Vec; eventId: string }
  | { kind: 'log'; type: string; data: GameEvent['data'] }
  | { kind: 'notice'; text: string; seconds: number; priority?: MessagePriority }
  | { kind: 'retest'; success: boolean; reason: string };
export interface CampaignInteraction { handled: boolean; commands: CampaignCommand[] }
export interface OrganDefinition {
  id: OrganId; geometry: WorldGeometry; entry: Vec; exit: Vec; tissue: Vec; terminal: Vec;
  research: Vec; device: Vec; corePosition: Vec; migrationGoal: Vec;
  playerStart: Vec; gate: Vec; sourcePositions: readonly Vec[]; elitePosition: Vec;
  retainedSource: Vec; migratedSource: Vec; carrierStarts: readonly Vec[]; flowOrigin: Vec;
  regions: readonly { id: string; label: string; x: number; y: number; radius: number }[];
}
export type CampaignNode = Pick<OrganNode, 'id' | 'kind' | 'x' | 'y' | 'active'>;
