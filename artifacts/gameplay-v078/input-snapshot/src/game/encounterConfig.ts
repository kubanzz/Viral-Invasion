/** Versioned encounter pacing; combat HP, damage and counter rules stay shared. */
export const ENCOUNTER_CONFIGS = {
  'campaign-1': { firstWarningFallback: 14, warningDuration: 8, initialOrdinary: 2, openingOrdinaryCap: 4, openingSpawnBudget: 2, introGuardian: { x: 1600, y: 930 } },
  'fixture-1': { firstWarningFallback: 14, warningDuration: 8, initialOrdinary: 4 },
} as const;
