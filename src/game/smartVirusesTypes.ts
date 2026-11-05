import type { Vec } from './types';
import type { TerritoryLaneId, TerritorySourceId } from './territoryTypes';
import type { RitualState } from './ritualTypes';

export type SmartProfession = 'slime-caster' | 'nest-builder' | 'brood-nest' | 'fastling' | 'ritual-mother' | 'ritual-priest';
export interface SmartSupportPlan {
  id: string; wave: number; kind: 'caster' | 'brood' | 'ritual'; laneId: TerritoryLaneId; sourceId: TerritorySourceId;
  slots: number[]; bornSlots: number[]; canceledSlots: number[];
  status: 'pending' | 'warning' | 'active' | 'complete' | 'canceled';
  departureOffset: number; warnedAt?: number; retryAt?: number; memberIds: string[];
  builderId?: string; nestId?: string; nestPosition?: Vec; buildUntil?: number;
  nextHatchAt?: number; blockedSince?: number;
  ritualPositions?: Vec[];
}
export interface SmartSupportWave { wave: number; reservedSlots: number[]; plans: SmartSupportPlan[] }
export interface SlimeCast {
  id: string; actorId: string; wave: number; origin: Vec; aim: Vec;
  warnedAt: number; firesAt: number; landsAt: number; expiresAt: number;
  phase: 'windup' | 'flight' | 'pool';
}
export interface SmartVirusState { serial: number; slime: SlimeCast[]; ritual?: RitualState }
