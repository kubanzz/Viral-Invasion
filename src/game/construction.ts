import { distance, isLegalPosition } from '../actors/collision';
import { activeWorld, BALANCE, type GameState, type Vec } from './types';
import type { BeaconState } from './growthTypes';
import { immuneRouteReachable, livingImmuneCells } from './immuneCells';
import { territoryNodeAt } from './territory';
import type { TerritoryNode, TerritoryRuleEvent } from './territoryTypes';
import { BUILDING_DEFINITIONS, type BlueprintId, type ConstructionState, type ConstructionTask } from './constructionTypes';

export type * from './constructionTypes';
export { BUILDING_DEFINITIONS };
export const CONSTRUCTION_BALANCE = {
  placementRange: 180, footprint: 40, nodeClearance: 100,
  workersRequired: 2, workerRange: 70, seconds: 6, initialSupplies: 2, maximumSupplies: 4,
} as const;
const EPS = 1e-7;
const point = (p: Vec): Vec => ({ x: p.x, y: p.y });
const validBlueprint = (id: string): id is BlueprintId => Object.hasOwn(BUILDING_DEFINITIONS, id);
const battleActive = (state: GameState) => !!state.territory && state.phase === 'playing'
  && state.territory.stage !== 'victory' && state.player.hp > 0 && state.tissue.hp > 0;
const actionActive = (state: GameState) => battleActive(state) && !state.playerFlight;
function nodeAt(state: GameState, p: Vec): TerritoryNode | undefined {
  return state.territory ? territoryNodeAt(state.territory, p) : undefined;
}
function beacons(state: GameState): BeaconState[] {
  const list = [...(state.growth?.beacons ?? [])];
  if (state.growth?.beacon && !list.some(b => b.id === state.growth!.beacon!.id)) list.push(state.growth.beacon);
  return list.filter(b => b.organId === 'heart' && b.mode === 'protocol' && b.until > state.elapsed);
}
function workers(state: GameState, beaconId: string) {
  return livingImmuneCells(state.growth?.cells ?? [], state.elapsed, 'heart').filter(c => c.beaconId === beaconId);
}
function replaceBeacon(state: GameState, beacon: BeaconState) {
  if (!state.growth) return;
  state.growth.beacons = (state.growth.beacons ?? []).map(b => b.id === beacon.id ? beacon : b);
  if (state.growth.beacon?.id === beacon.id) state.growth.beacon = beacon;
}
function resetRoutes(state: GameState, beaconId: string) {
  for (const cell of state.growth?.cells ?? []) if (cell.beaconId === beaconId) {
    cell.targetId = null; cell.waypoint = null; cell.navigationAt = 0;
  }
}
function eligibleBeacon(state: GameState, p: Vec): BeaconState | undefined {
  return beacons(state).filter(b => workers(state, b.id).filter(c => immuneRouteReachable(c, p, activeWorld(state), c.radius)).length >= CONSTRUCTION_BALANCE.workersRequired)
    .sort((a, b) => distance(a, p) - distance(b, p) || a.id.localeCompare(b.id))[0];
}

export function initializeConstruction(state: GameState, availableBlueprints: readonly BlueprintId[] = []): void {
  if (!state.territory) return;
  state.territory.construction = { supplies: CONSTRUCTION_BALANCE.initialSupplies, serial: 0,
    availableBlueprints: [...new Set(availableBlueprints.filter(validBlueprint))], sourceCredits: [] };
}
export function setConstructionBlueprints(state: GameState, ids: readonly BlueprintId[]): void {
  if (!state.territory) return;
  if (!state.territory.construction) initializeConstruction(state, ids);
  else state.territory.construction.availableBlueprints = [...new Set([...state.territory.construction.availableBlueprints, ...ids.filter(validBlueprint)])];
}
export function unlockConstructionBlueprint(state: GameState, id: BlueprintId): TerritoryRuleEvent[] {
  if (!state.territory || !validBlueprint(id)) return [];
  if (!state.territory.construction) initializeConstruction(state);
  const c = state.territory.construction!;
  if (c.availableBlueprints.includes(id)) return [];
  c.availableBlueprints.push(id);
  return [{ type: 'CONSTRUCTION_BLUEPRINT_UNLOCKED', data: { blueprintId: id } }];
}

export type ConstructionRejectReason = 'inactive' | 'locked' | 'supplies' | 'task' | 'range' | 'position' | 'infected' | 'node' | 'workers';
export interface ConstructionResult { accepted: boolean; reason?: ConstructionRejectReason; events: TerritoryRuleEvent[]; taskId?: string }
export function constructionPlacementView(state: GameState, position: Vec, blueprintId: BlueprintId) {
  const c = state.territory?.construction;
  let reason: ConstructionRejectReason | undefined;
  const region = nodeAt(state, position);
  if (!actionActive(state)) reason = 'inactive';
  else if (!validBlueprint(blueprintId) || !c?.availableBlueprints.includes(blueprintId)) reason = 'locked';
  else if (c.task) reason = 'task';
  else if (c.supplies < 1) reason = 'supplies';
  else if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !isLegalPosition(position, CONSTRUCTION_BALANCE.footprint, activeWorld(state))) reason = 'position';
  else if (distance(state.player, position) > CONSTRUCTION_BALANCE.placementRange + EPS) reason = 'range';
  else if (!region || region.owner !== 'healthy') reason = 'infected';
  else if (state.territory!.nodes.some(n => distance(n, position) < CONSTRUCTION_BALANCE.nodeClearance - EPS)) reason = 'node';
  const beacon = !reason ? eligibleBeacon(state, position) : undefined;
  if (!reason && !beacon) reason = 'workers';
  return { valid: !reason, reason, position: point(position), nodeId: region?.id, beaconId: beacon?.id, blueprintId };
}

function assignTask(state: GameState, task: ConstructionTask, beacon: BeaconState) {
  task.beaconId = beacon.id;
  task.previousOrder = { x: beacon.x, y: beacon.y,
    ...(beacon.guard ? { guard: { ...beacon.guard } } : {}), ...(beacon.focus ? { focus: { ...beacon.focus } } : {}) };
  const next = { ...beacon, x: task.x, y: task.y, constructionTaskId: task.id };
  delete next.guard; delete next.focus;
  replaceBeacon(state, next); resetRoutes(state, beacon.id);
}
function restoreOwnedOrder(state: GameState, task: ConstructionTask) {
  const beacon = beacons(state).find(b => b.id === task.beaconId && b.constructionTaskId === task.id);
  if (!beacon) return;
  const next = { ...beacon, x: task.previousOrder.x, y: task.previousOrder.y };
  delete next.constructionTaskId; delete next.guard; delete next.focus;
  if (task.previousOrder.guard) next.guard = { ...task.previousOrder.guard };
  if (task.previousOrder.focus && task.previousOrder.focus.until > state.elapsed) next.focus = { ...task.previousOrder.focus };
  replaceBeacon(state, next); resetRoutes(state, beacon.id);
}

export function requestConstruction(state: GameState, intent: { blueprintId: BlueprintId; position: Vec }): ConstructionResult {
  const view = constructionPlacementView(state, intent.position, intent.blueprintId);
  if (!view.valid) return { accepted: false, reason: view.reason, events: [] };
  const c = state.territory!.construction!, beacon = beacons(state).find(b => b.id === view.beaconId)!;
  const id = `construction:${state.tick}:${++c.serial}`;
  const task: ConstructionTask = { ...point(intent.position), id, blueprintId: intent.blueprintId,
    nodeId: view.nodeId!, startedAt: state.elapsed, updatedAt: state.elapsed, seconds: 0, beaconId: beacon.id, previousOrder: point(beacon), pauseReason: 'marching' };
  c.supplies--; c.task = task; assignTask(state, task, beacon);
  return { accepted: true, taskId: id, events: [{ type: 'CONSTRUCTION_STARTED', data: { id, blueprintId: task.blueprintId,
    beaconId: task.beaconId, x: task.x, y: task.y, supplies: c.supplies } }] };
}
export function resumeConstruction(state: GameState): ConstructionResult {
  const task = state.territory?.construction?.task;
  if (!actionActive(state) || !task) return { accepted: false, reason: 'inactive', events: [] };
  if (distance(state.player, task) > CONSTRUCTION_BALANCE.placementRange + EPS) return { accepted: false, reason: 'range', events: [] };
  if (nodeAt(state, task)?.owner !== 'healthy') return { accepted: false, reason: 'infected', events: [] };
  const beacon = eligibleBeacon(state, task);
  if (!beacon) return { accepted: false, reason: 'workers', events: [] };
  if (beacon.id === task.beaconId && beacon.constructionTaskId === task.id) return { accepted: true, taskId: task.id, events: [] };
  restoreOwnedOrder(state, task); assignTask(state, task, beacon);
  return { accepted: true, taskId: task.id, events: [{ type: 'CONSTRUCTION_RESUMED', data: { id: task.id, beaconId: task.beaconId } }] };
}
export function cancelConstruction(state: GameState): ConstructionResult {
  const c = state.territory?.construction, task = c?.task;
  if (!actionActive(state) || !c || !task) return { accepted: false, reason: 'inactive', events: [] };
  restoreOwnedOrder(state, task); delete c.task;
  c.supplies = Math.min(CONSTRUCTION_BALANCE.maximumSupplies, c.supplies + 1);
  return { accepted: true, taskId: task.id, events: [{ type: 'CONSTRUCTION_CANCELED', data: { id: task.id, supplies: c.supplies } }] };
}

function syncBuildingNode(state: GameState, c: ConstructionState) {
  if (!state.battle) return;
  const id = 'territory:constructed-launcher';
  state.battle.graph.nodes = state.battle.graph.nodes.filter(n => n.kind !== 'valve' || n.id === id);
  if (!c.building) { state.battle.graph.nodes = state.battle.graph.nodes.filter(n => n.id !== id); return; }
  const active = nodeAt(state, c.building)?.owner === 'healthy';
  const existing = state.battle.graph.nodes.find(n => n.id === id);
  if (existing) Object.assign(existing, point(c.building), { active });
  else state.battle.graph.nodes.push({ ...point(c.building), id, kind: 'valve', active, infected: false });
}
export function advanceConstruction(state: GameState, dt = BALANCE.step): TerritoryRuleEvent[] {
  if (!battleActive(state)) return [];
  if (!state.territory!.construction) initializeConstruction(state);
  const c = state.territory!.construction!, events: TerritoryRuleEvent[] = [];
  if (Object.values(state.territory!.defense).some(d => d.repelled)) events.push(...unlockConstructionBlueprint(state, 'launch-pod'));
  for (const id of ['source-west', 'source-east'] as const) if (state.territory!.sources[id].destroyed && !c.sourceCredits.includes(id)) {
    c.sourceCredits.push(id); c.supplies = Math.min(CONSTRUCTION_BALANCE.maximumSupplies, c.supplies + 1);
    events.push({ type: 'CONSTRUCTION_SUPPLY_EARNED', data: { sourceId: id, supplies: c.supplies } });
  }
  const task = c.task;
  if (task) {
    const owner = beacons(state).find(b => b.id === task.beaconId && b.constructionTaskId === task.id);
    const alive = workers(state, task.beaconId), arrived = alive.filter(cell => distance(cell, task) <= CONSTRUCTION_BALANCE.workerRange + EPS);
    task.pauseReason = !owner ? alive.length < CONSTRUCTION_BALANCE.workersRequired ? 'members' : 'command' : nodeAt(state, task)?.owner !== 'healthy' ? 'infected'
      : alive.length < CONSTRUCTION_BALANCE.workersRequired ? 'members' : arrived.length < CONSTRUCTION_BALANCE.workersRequired ? 'marching' : undefined;
    const delta = Math.max(0, Math.min(BALANCE.step, dt, state.elapsed - task.updatedAt));
    task.updatedAt = state.elapsed;
    if (!task.pauseReason) task.seconds = Math.min(CONSTRUCTION_BALANCE.seconds, task.seconds + delta);
    if (task.seconds + EPS >= CONSTRUCTION_BALANCE.seconds) {
      c.building = { ...point(task), id: `building:${task.id}`, blueprintId: task.blueprintId, nodeId: task.nodeId, builtAt: state.elapsed };
      restoreOwnedOrder(state, task); delete c.task;
      events.push({ type: 'CONSTRUCTION_COMPLETED', data: { id: task.id, buildingId: c.building.id, blueprintId: task.blueprintId,
        x: task.x, y: task.y, supplies: c.supplies } });
    }
  }
  syncBuildingNode(state, c);
  return events;
}
export function constructionView(state: GameState) {
  const c = state.territory?.construction, task = c?.task;
  return { supplies: c?.supplies ?? 0, availableBlueprints: c?.availableBlueprints ?? [], building: c?.building,
    enabled: !!c?.building && nodeAt(state, c.building)?.owner === 'healthy', task,
    progress: task ? Math.min(1, task.seconds / CONSTRUCTION_BALANCE.seconds) : 0,
    workers: task ? workers(state, task.beaconId).filter(cell => distance(cell, task) <= CONSTRUCTION_BALANCE.workerRange + EPS).length : 0 };
}
