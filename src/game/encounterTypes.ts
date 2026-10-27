export type CounterGuideVariant = 'guided' | 'adaptive';
export type EncounterMode = 'formal' | 'fixture';
export interface FirstCounterState {
  status: 'opening' | 'warning' | 'active' | 'resolved';
  guideStatus: 'inactive' | 'active' | 'skipped' | 'completed';
  targetId: string | null;
  warnedAt: number | null; appliedAt: number | null; resolvedAt: number | null;
  skippedAt: number | null; completedAt: number | null;
  counterHit: { tick: number; at: number; targetId: string; method: 'rear' | 'pulse'; damage: number } | null;
}
export interface EncounterState {
  configId: 'campaign-1' | 'fixture-1';
  guideVariant: CounterGuideVariant;
  firstCounter: FirstCounterState;
  openingSpawned: number;
}
