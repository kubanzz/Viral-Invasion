import type { Vec } from './types';

export type EnemyTactic = 'melee' | 'thin-ray' | 'crystal-charge' | 'fission-burst' | 'mimic-corrosion';

/** A committed value snapshot. Never recompute aim, landings or end while winding up. */
export interface EnemyAttackPlan {
  kind: EnemyTactic;
  origin: Vec;
  aim: Vec;
  range: number;
  windup: number;
  interval: number;
  radius: number;
  landings: Vec[];
  chargeEnd?: Vec;
  chargeSpeed?: number;
  playerDamage: number;
  tissueDamage: number;
  recoveryExposure: number;
}

/** The host moves through actual collision segments and applies each hit at most once. */
export interface EnemyCharge {
  from: Vec;
  to: Vec;
  startedAt: number;
  endsAt: number;
  speed: number;
  radius: number;
  hitPlayer: boolean;
  hitTissue: boolean;
  playerDamage: number;
  tissueDamage: number;
  recoveryExposure: number;
  interval: number;
}
