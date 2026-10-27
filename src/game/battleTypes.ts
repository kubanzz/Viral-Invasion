import type { Vec } from './types';
import type { BehaviorBin, EvolutionDecision } from './evolutionTypes';
import type { CounterGuideVariant, EncounterMode, EncounterState } from './encounterTypes';
import type { RunPreparation } from './preparation';
export type { CounterGuideVariant } from './encounterTypes';

export type TraitId = 'CARAPACE' | 'FISSION' | 'MIMIC';
export type OrganId = 'heart' | 'lung';
export interface OrganNode extends Vec {
  id: string;
  kind: 'source' | 'tissue' | 'valve' | 'gate' | 'retest' | 'exit' | 'research';
  active: boolean;
  infected: boolean;
}
export interface OrganEdge {
  id: string; from: string; to: string; open: boolean; nextSpread: number; flowDirection: Vec;
}
export interface OrganGraph { nodes: OrganNode[]; edges: OrganEdge[] }
export interface PressureState { infection: number; vitality: number; criticalSince: number | null; organAlarm: boolean; crisisReason: string }
export interface PulseState {
  phase: 'charge' | 'surge' | 'rest'; phaseRemaining: number; readyAt: number;
  activeUntil: number; origin: Vec; direction: number; uses: number;
  cycleIndex?: number;
}
export interface EvolutionWarning { trait: TraitId; startedAt: number; applyAt: number }
export interface BattleStats {
  kills: number; sourceClears: number; eliteClears: number; repairs: number; pulses: number;
  playerDamage: number; tissueDamage: number; scans: number;
}
export interface BattleState {
  milestone: 'G1' | 'G2' | 'G3'; organId: OrganId; graph: OrganGraph;
  pressure: PressureState; pulse: PulseState; warning: EvolutionWarning | null;
  traits: TraitId[]; defeatedTraits: TraitId[]; nextEvolutionAt: number;
  stage: number; stageLabel: string; objective: string; readyToRetest: boolean;
  lastAim: Vec; stats: BattleStats; nextSpawnAt: Record<string, number>;
  nextActorId: number; firstTrait: TraitId; recentNotice: string;
  gateChangedAt: number; organLowSince: number | null; eliteSpawned: number;
  history: Array<{ at: number; text: string }>;
  forcedFirstTrait?: TraitId; behaviorHistory?: BehaviorBin[]; evolutionDecisions?: EvolutionDecision[];
  encounter?: EncounterState;
}
export interface CampaignOptions { campaign?: boolean; firstTrait?: TraitId; milestone?: 'G1' | 'G2' | 'G3'; encounterMode?: EncounterMode; counterGuide?: CounterGuideVariant; preparation?: RunPreparation }
export interface TraitInfo { id: TraitId; name: string; symbol: string; ability: string; cost: string; counter: string }
