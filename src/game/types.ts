import type { BattleState, TraitId } from './battleTypes';
import type { GrowthState } from './growthTypes';
import type { CampaignState } from './campaignTypes';
import type { RunMetrics } from './runMetrics';
import type { EndlessState } from './endlessTypes';
import type { EndlessGrowthState } from './endlessGrowthTypes';
export interface Vec { x: number; y: number }
export interface WorldGeometry {
  width: number; height: number;
  bounds: { left: number; right: number; top: number; bottom: number };
  obstacles: readonly { id: string; x: number; y: number; radius: number }[];
  foreground: { x: number; y: number; width: number; height: number };
}
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
  attackRadius?: number;
}
export interface Tissue extends Vec { hp: number; maxHp: number; radius: number }
export interface GameEvent { type: string; tick: number; data: Record<string, string | number | boolean> }
export type MessagePriority = 0 | 1 | 2 | 3;
export interface TacticalRecord {
  key: string; eventType: string; firstAt: number; at: number; text: string; count: number;
}
export interface Effect { id: number; kind: 'beam' | 'burst' | 'scan' | 'heal' | 'dash' | 'hit' | 'success' | 'pulse' | 'evolution' | 'danger' | 'flow' | 'chain'; from: Vec; to: Vec; radius: number; born: number; duration: number; angle?: number }
export interface GameState {
  game: 'viral-invasion'; schemaVersion: 1; seed: number; phase: Phase; tick: number; elapsed: number;
  player: Player; targets: Target[]; tissue: Tissue; terminal: Vec; tool: Tool;
  cooldowns: Record<Tool, number>; scanReady: number; scanUntil: number;
  effects: Effect[]; events: GameEvent[]; message: string; messageUntil: number;
  /** Presentation only: finite event categories survive eviction from the recent raw log. */
  tacticalRecords?: TacticalRecord[];
  messagePriority?: MessagePriority;
  shots: number; hits: number; scans: number; dashes: number; result: null | { success: boolean; reason: string };
  battle?: BattleState;
  growth?: GrowthState;
  world?: WorldGeometry;
  campaign?: CampaignState;
  endless?: EndlessState;
  endlessGrowth?: EndlessGrowthState;
  /** Accepted-action counters; independent of the bounded recent event log. */
  runMetrics?: RunMetrics;
}
export interface InputFrame { moveX: number; moveY: number; aim: Vec; fire: boolean; tool?: Tool; scan?: boolean; dash?: boolean; interact?: boolean; practiceHit?: boolean }
export const WORLD = { width: 1200, height: 800, bounds: { left: 65, right: 1135, top: 110, bottom: 735 }, obstacles: [{ id: 'fold-a', x: 440, y: 295, radius: 47 }, { id: 'fold-b', x: 1005, y: 575, radius: 53 }], foreground: { x: 155, y: 550, width: 190, height: 125 } } as const;
export const activeWorld = (state: GameState): WorldGeometry => state.world ?? WORLD;
export const BALANCE = { step: 1 / 60, speed: 235, dashSpeed: 780, dashDuration: .16, dashCooldown: 1.5, scanRadius: 650, scanCooldown: 3, range: 530, areaRadius: 94, cooldowns: { 1: .18, 2: 1.2, 3: .7 }, damage: { 1: 34, 2: 65 }, repair: 25, interactionRange: 110, trainingHitDamage: 5, trainingHitDuration: .55 } as const;
