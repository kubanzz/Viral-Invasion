import type { OrganId } from './battleTypes';
import type { GameEvent, Vec } from './types';

export type HostEventId = 'MEDICATION' | 'REST' | 'SLEEPLESS' | 'SMOKE' | 'ALCOHOL' | 'EXERCISE';
export type HostEventCategory = 'green' | 'red' | 'yellow';
export type HostEventModifierKind = 'playerMove' | 'immuneMove' | 'immuneAttackFrequency' | 'tissueRepair'
  | 'playerActiveRepair' | 'captureProgress' | 'pulseCooldown' | 'pulseStrength' | 'lightVirusMove';
export interface HostEventZone extends Vec {
  id: string; kind: 'medication' | 'smoke' | 'deposit'; radius: number;
  previewAt: number; startsAt: number; endsAt: number; targetId?: string; nextTickAt: number;
  /** Medication placement is committed once; a skipped round never reappears. */
  medicationState?: 'pending' | 'spawned' | 'skipped'; skipReason?: string;
}
export interface HostEventActive {
  id: HostEventId; category: HostEventCategory; organId: OrganId; sourceId: string;
  phase: 'warning' | 'active'; warningStartedAt: number; startsAt: number; endsAt: number;
  description: string; slotIndex: number | null; zones: HostEventZone[];
  targetIds: string[]; placements: Vec[]; healed: number; nextHealAt: number;
  affectsLegions: boolean; affectsHealingPoints: boolean;
  trigger?: 'scheduled' | 'opening' | 'debug';
}
export interface HostEventAnnouncement {
  sourceId: string; id: HostEventId; category: HostEventCategory;
  phase: 'warning' | 'active' | 'ended' | 'cancelled'; at: number; reason?: string;
}
export interface HostEventSlot { at: number; status: 'pending' | 'selected' | 'completed' | 'cancelled' | 'skipped'; reason?: string; id?: HostEventId }
export type HostEventCommand = { kind: 'damage'; targetId: string; amount: number; origin: 'host-event' }
  | { kind: 'healPlayer'; amount: number }
  | { kind: 'log'; type: string; data: GameEvent['data'] };
export interface HostEventState {
  schemaVersion: 1; rngState: number; serial: number; slots: HostEventSlot[];
  usedIds: HostEventId[]; successCount: number; redCount: number; lastCategory: HostEventCategory | null;
  lastEndedAt: number | null; alarmUntil: number; wasAlarm: boolean;
  active: HostEventActive | null;
  /** Challenge teaching replaces the 75-second random slot without consuming RNG. */
  openingExercise?: { status: 'pending' | 'selected' | 'completed' | 'cancelled'; ready: boolean;
    waitingReason?: string; reason?: string; sourceId?: string };
  /** Survives combat-log truncation; renderers never create announcement timing. */
  announcement?: HostEventAnnouncement;
  /** Event-owned modifiers are computed from this registry, never multiplied into base stats. */
  sources: Record<string, { eventId: HostEventId; organId: OrganId }>;
  disabled: Partial<Record<HostEventId, string>>; pendingCommands: HostEventCommand[];
}
