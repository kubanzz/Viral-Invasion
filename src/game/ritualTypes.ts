import type { Target, Vec } from './types';

/** The four bodies share a finite wave obligation; projectiles never do. */
export interface RitualEncounter {
  id: string;
  wave: number;
  motherId: string;
  priestIds: string[];
  born: number;
  nextCastAt: Record<string, number>;
  nextGroupFireAt: number;
  shieldBroken: boolean;
}

export interface RitualProjectile extends Vec {
  id: string;
  actorId: string;
  encounterId: string;
  wave: number;
  hp: number;
  radius: number;
  angle: number;
  phase: 'charging' | 'flight';
  born: number;
  firesAt: number;
  expiresAt: number;
  aim: Vec;
  tracking: boolean;
}

export interface RitualState {
  serial: number;
  encounters: RitualEncounter[];
  projectiles: RitualProjectile[];
}

/** Attack adapters expose this view, never add it to the combat population. */
export type RitualProjectileTarget = Target & { role: 'event' };
