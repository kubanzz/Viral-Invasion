import type { ProtocolId } from './growthTypes';
import { PROTOCOL_IDS } from './protocols';

export const PREPARATION_VERSION = 1 as const;
export type StartingPlanId = 'field' | ProtocolId;
export interface RunPreparation { version: typeof PREPARATION_VERSION; starterProtocolId: ProtocolId | null }

/** Persist only the plan, never a previous run's rank, tuning or combat state. */
export function preparationForPlan(id: StartingPlanId): RunPreparation {
  return { version: PREPARATION_VERSION, starterProtocolId: PROTOCOL_IDS.includes(id as ProtocolId) ? id as ProtocolId : null };
}

export function parsePreparation(value: unknown): RunPreparation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== PREPARATION_VERSION
    || record.starterProtocolId !== null && !PROTOCOL_IDS.includes(record.starterProtocolId as ProtocolId)) return null;
  return { version: PREPARATION_VERSION, starterProtocolId: record.starterProtocolId as ProtocolId | null };
}

/** Availability is an archive concern; this list never gates the in-run pool. */
export function availableStartingPlans(known: readonly ProtocolId[]): StartingPlanId[] {
  return ['field', ...PROTOCOL_IDS.filter(id => known.includes(id))];
}

export function startingPlanId(preparation?: RunPreparation | null): StartingPlanId {
  return parsePreparation(preparation)?.starterProtocolId ?? 'field';
}
