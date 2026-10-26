import type { BattleState, TraitId } from './battleTypes';
import type { GrowthState } from './growthTypes';
export interface Vec { x: number; y: number }
export type Phase = 'menu' | 'playing' | 'paused' | 'result';
export type Tool = 1 | 2 | 3;
export interface Player extends Vec { hp: number; radius: number; facing: number; moving: boolean; dashUntil: number; dashReady: number; hurtUntil: number; actionUntil: number }
export interface Target extends Vec {
  id: string; kind: 'single' | 'cluster'; radius: number; hp: number; maxHp: number; hitUntil: number; scanned: boolean;
  role?: 'virus' | 'source' | 'elite' | 'core'; traits?: TraitId[]; facing?: number;
  born?: number; deadAt?: number; revealedUntil?: number; exposedUntil?: number;
  attackAt?: number; attackReady?: number; attackAim?: Vec; generation?: number; sourceId?: string;
  splitAt?: number; splitPositions?: Vec[];
  attackTarget?: 'player' | 'tissue';
}
export interface Tissue extends Vec { hp: number; maxHp: number; radius: number }
export interface GameEvent { type: string; tick: number; data: Record<string, string | number | boolean> }
export interface Effect { id: number; kind: 'beam' | 'burst' | 'scan' | 'heal' | 'dash' | 'hit' | 'success' | 'pulse' | 'evolution' | 'danger' | 'flow' | 'chain'; from: Vec; to: Vec; radius: number; born: number; duration: number; angle?: number }
export interface GameState {
  game: 'viral-invasion'; schemaVersion: 1; seed: number; phase: Phase; tick: number; elapsed: number;
  player: Player; targets: Target[]; tissue: Tissue; terminal: Vec; tool: Tool;
  cooldowns: Record<Tool, number>; scanReady: number; scanUntil: number;
  effects: Effect[]; events: GameEvent[]; message: string; messageUntil: number;
  shots: number; hits: number; scans: number; dashes: number; result: null | { success: boolean; reason: string };
  battle?: BattleState;
  growth?: GrowthState;
}
export interface InputFrame { moveX: number; moveY: number; aim: Vec; fire: boolean; tool?: Tool; scan?: boolean; dash?: boolean; interact?: boolean; practiceHit?: boolean }
export const WORLD = { width: 1200, height: 800, bounds: { left: 65, right: 1135, top: 110, bottom: 735 }, obstacles: [{ id: 'fold-a', x: 440, y: 295, radius: 47 }, { id: 'fold-b', x: 1005, y: 575, radius: 53 }], foreground: { x: 155, y: 550, width: 190, height: 125 } } as const;
export const BALANCE = { step: 1 / 60, speed: 235, dashSpeed: 780, dashDuration: .16, dashCooldown: 1.5, scanRadius: 650, scanCooldown: 3, range: 530, areaRadius: 94, cooldowns: { 1: .18, 2: 1.2, 3: .7 }, damage: { 1: 34, 2: 65 }, repair: 25, interactionRange: 110, trainingHitDamage: 5, trainingHitDuration: .55 } as const;
