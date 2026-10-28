import type { OrganId } from './battleTypes';
import type { Vec } from './types';

/** One bounded tool-2 cast. Rendering only reads this simulation-owned state. */
export interface TractionCast {
  id: string;
  organId: OrganId;
  stage: 'aiming' | 'guiding' | 'fuse';
  center: Vec;
  initialCenter: Vec;
  startedAt: number;
  resolveAt: number;
  guideUntil: number;
  radius: number;
  gatherRadius: number;
  damageSnapshot: number;
  /** Zero for a normal blast; otherwise the complete later catalysis damage. */
  catalysisDamageSnapshot: number;
  guideUnlocked: boolean;
  gathered: boolean;
  movedByTargetId: Record<string, number>;
}

export interface TractionDisplacement {
  targetId: string;
  distance: number;
  total: number;
  x: number;
  y: number;
}

export interface TractionAdvance {
  guidingStarted: boolean;
  released: boolean;
  ready: boolean;
  moved: TractionDisplacement[];
}
