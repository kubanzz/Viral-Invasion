import { distance } from '../actors/collision';
import type { OrganId, OrganNode } from './battleTypes';
import { activeWorld, type GameEvent, type GameState, type Vec } from './types';
import { endlessCombatStats } from './endlessGrowth';
import { eventModifier } from './hostEvents';

export const HEALING_POINT_BALANCE = {
  radius: 36, infectionRadius: 145, captureSeconds: 12, maximumCaptureBodies: 2.5,
  partialRecoveryPerSecond: 3, treatmentRange: 150, heal: 25, cooldown: 4, reclaimCost: 2,
} as const;

export interface HealingPointNode extends OrganNode {
  kind: 'healing'; infection: number; healReadyAt: number;
}
const POSITIONS: Record<OrganId, readonly Vec[]> = {
  heart: [{ x: 1150, y: 330 }, { x: 1880, y: 1300 }],
  lung: [{ x: 450, y: 450 }, { x: 2090, y: 1290 }],
};

export function createHealingPointNodes(organId: OrganId): HealingPointNode[] {
  return POSITIONS[organId].map((position, index) => ({ ...position,
    id: `${organId}-healing-${index + 1}`, kind: 'healing', active: true, infected: false,
    infection: 0, healReadyAt: 0,
  }));
}

export function healingPoints(state: GameState): HealingPointNode[] {
  return (state.battle?.graph.nodes ?? []).filter((node): node is HealingPointNode => node.kind === 'healing');
}

/** Facility state belongs to the organ graph, so ordinary organ travel cannot reset it. */
export function ensureHealingPoints(state: GameState): void {
  if (!state.battle || state.battle.milestone !== 'G3' || activeWorld(state).width < 2000
    || (!state.endless && state.battle.encounter?.configId !== 'campaign-1')) return;
  const nodes = state.battle.graph.nodes;
  for (const node of createHealingPointNodes(state.battle.organId)) {
    if (!nodes.some(existing => existing.id === node.id)) nodes.push(node);
  }
}

export function healingPointStatus(node: OrganNode): 'ready' | 'infecting' | 'occupied' {
  return (node.infection ?? 0) >= 100 ? 'occupied' : (node.infection ?? 0) > 0 ? 'infecting' : 'ready';
}

export function advanceHealingPoints(state: GameState, dt: number): Array<{ type: string; data: GameEvent['data'] }> {
  if (state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return [];
  const events: Array<{ type: string; data: GameEvent['data'] }> = [];
  for (const node of healingPoints(state)) {
    if (!node.active || node.infection >= 100) continue;
    const bodies = state.targets.filter(target => target.hp > 0 && (target.role === 'virus' || target.role === 'elite')
      && distance(target, node) <= HEALING_POINT_BALANCE.infectionRadius).length;
    const before = node.infection;
    node.infection = Math.max(0, Math.min(100, before + (bodies
      ? 100 / HEALING_POINT_BALANCE.captureSeconds * Math.min(bodies, HEALING_POINT_BALANCE.maximumCaptureBodies) * eventModifier(state, 'captureProgress')
      : -HEALING_POINT_BALANCE.partialRecoveryPerSecond) * dt));
    node.infected = node.infection >= 100;
    if (before === 0 && node.infection > 0) events.push({ type: 'HEALING_POINT_CONTESTED',
      data: { nodeId: node.id, organId: state.battle!.organId, infection: node.infection } });
    if (node.infection >= 100) events.push({ type: 'HEALING_POINT_OCCUPIED',
      data: { nodeId: node.id, organId: state.battle!.organId, cost: HEALING_POINT_BALANCE.reclaimCost } });
  }
  return events;
}

export type HealingPointTreatment = { kind: 'treated'; healed: number; cost: number; infectionBefore: number }
  | { kind: 'rejected'; reason: 'inactive' | 'range' | 'cooldown' | 'insufficient-samples'; missing?: number };

/** All acceptance checks precede spending; failed treatment cannot consume research. */
export function treatHealingPoint(state: GameState, node: HealingPointNode): HealingPointTreatment {
  if (state.phase !== 'playing' || !node.active || !healingPoints(state).includes(node)) return { kind: 'rejected', reason: 'inactive' };
  if (distance(state.player, node) > HEALING_POINT_BALANCE.treatmentRange) return { kind: 'rejected', reason: 'range' };
  if (state.elapsed + 1e-9 < node.healReadyAt) return { kind: 'rejected', reason: 'cooldown' };
  const infectionBefore = node.infection;
  const cost = infectionBefore >= 100 ? HEALING_POINT_BALANCE.reclaimCost : 0;
  const samples = state.growth?.research ?? 0;
  if (samples < cost) return { kind: 'rejected', reason: 'insufficient-samples', missing: cost - samples };
  if (cost && state.growth) state.growth.research -= cost;
  node.infection = 0; node.infected = false; node.healReadyAt = state.elapsed + HEALING_POINT_BALANCE.cooldown;
  const before = state.player.hp;
  const maxHp = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth).maxHp : 100;
  state.player.hp = Math.min(maxHp, state.player.hp + HEALING_POINT_BALANCE.heal);
  return { kind: 'treated', healed: state.player.hp - before, cost, infectionBefore };
}
