import type { OrganId } from './battleTypes';
import type { Effect, GameEvent, GameState, Target, Tool, Vec, WorldGeometry } from './types';

export type ProtocolId = 'PULSE_BREAK' | 'PURIFY_CHAIN' | 'IMMUNE_BEACON' | 'EXPOSE_TRACE';
export type Tuning = 'balanced' | 'focused' | 'extended';
export interface EquippedProtocol { id: ProtocolId; tuning: Tuning }
export interface DraftOption {
  id: string; kind: 'equip' | 'retune'; protocolId: ProtocolId; tuning: Tuning;
  title: string; trigger: string; effect: string; cost: string; tags: string[];
}
export interface ProtocolDraft {
  id: string; source: 'xp' | 'research'; serial: number; level?: number;
  options: [DraftOption, DraftOption, DraftOption];
  status: 'choosing' | 'replacing'; selectedOptionId?: string;
}
export interface TraceMark {
  targetId: string; organId: OrganId; until: number; slowUntil: number; factor: number;
}
export interface BeaconState extends Vec {
  id: string; organId: OrganId; born: number; until: number; radius: number;
  damage: number; interval: number; nextAttackAt: number; tuning: Tuning;
}
export interface GrowthHistoryEntry { at: number; type: string; text: string }
export interface GrowthState {
  runId: string; seed: number; lastElapsed: number; xp: number; level: number; nextXp: number | null; research: number;
  equipped: EquippedProtocol[]; draft: ProtocolDraft | null; pendingLevels: number[];
  consumedDraftIds: string[]; rewardedKeys: string[]; sourceKillCounts: Record<string, number>;
  damageTakenByOrgan: Record<OrganId, number>; protectionNeeded: Record<OrganId, boolean>;
  draftSerial: number; historyHash: number; ended: boolean;
  beacon: BeaconState | null; beaconReadyAt: number; marks: TraceMark[];
  resonance: Array<{ targetId: string; organId: OrganId; cycle: number }>;
  chainRoots: string[];
  protocolHistory: GrowthHistoryEntry[];
  pendingLogs: Array<{ type: string; data: GameEvent['data'] }>;
  budgetTick: number; budgetUsed: number; skippedCommands: number;
}
export interface GrowthContext {
  tick: number; elapsed: number; organId: OrganId; active: boolean; rhythm: 'charge' | 'surge' | 'rest';
  player: Vec; aim: Vec; tissue: GameState['tissue']; deviceOrigin: Vec;
  targets: readonly Target[]; tool: Tool;
  geometry?: WorldGeometry;
  rhythmCycle?: number;
}
export interface DamageOrigin { cause: 'basic' | 'protocol'; rootId?: string; wasPulseExposed?: boolean; protocolId?: ProtocolId; allowChain?: boolean }
interface ProtocolCommandBase { protocolId: ProtocolId; rootId: string; organId: OrganId }
export type GrowthCommand =
  | (ProtocolCommandBase & { kind: 'damage'; targetId: string; amount: number; cause: 'protocol'; hop: number; allowChain?: boolean })
  | (ProtocolCommandBase & { kind: 'expose'; targetId: string; until: number; revealUntil: number })
  | (ProtocolCommandBase & { kind: 'effect'; effect: Effect['kind']; from: Vec; to: Vec; radius: number; duration: number })
  | (ProtocolCommandBase & { kind: 'organCost'; amount: number })
  | { kind: 'log'; type: string; data: GameEvent['data'] };
export interface DraftIntent {
  runId: string; draftId: string; optionId: string;
  slotIndex?: number; expectedPreviousProtocolId?: ProtocolId;
}
export type DraftResolution =
  | { kind: 'rejected'; reason: string }
  | { kind: 'replace-required' | 'returned'; draftId: string }
  | { kind: 'committed' | 'discarded'; draftId: string; nextDraftId?: string };
export type ResearchResult =
  | { kind: 'opened'; draftId: string; cost: number }
  | { kind: 'rejected'; reason: 'draft-active' | 'insufficient-samples' | 'run-inactive'; missing?: number };
export interface PulseProtocolConfig { deviceRange: number; bonusDamage: number; exposeSeconds: number }
export interface ChainProtocolConfig { range: number; damage: number; jumps: number }
export interface BeaconProtocolConfig { radius: number; damage: number; interval: number; duration: number; cooldown: number; tissueCost: number }
export interface TraceProtocolConfig { duration: number; slowDuration: number; factor: number }
export interface ProtocolInfo { id: ProtocolId; name: string; symbol: string; trigger: string; tags: string[] }
