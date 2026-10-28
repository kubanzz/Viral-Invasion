import type { Vec } from './types';

export type ViralCapsuleObjective = 'player' | 'tissue';
export type ViralCapsuleEnd = 'intercepted' | 'wall' | 'range' | 'expired' | 'split' | 'hit-player' | 'hit-tissue' | 'evaded';
export interface ViralCapsuleCarrier {
  transactionId: string;
  wave: number;
  objective: ViralCapsuleObjective;
  fork: boolean;
  stock: 0 | 1;
  castUntil?: number;
  aim?: Vec;
}
export interface ViralCapsuleState {
  transactionId: string;
  carrierId: string;
  wave: number;
  objective: ViralCapsuleObjective;
  phase: 'warning' | 'flying';
  generation: 0 | 1;
  origin: Vec;
  aim: Vec;
  secondaryAim?: Vec;
  direction: Vec;
  speed: number;
  remainingRange: number;
  travelled: number;
  splitAfter?: number;
  warningUntil: number;
  expiresAt: number;
  updatedAt: number;
  playerDamage: number;
  tissueDamage: number;
  terminalReason?: ViralCapsuleEnd;
}
