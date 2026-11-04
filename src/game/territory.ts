import { distance, normalized, wallHit } from '../actors/collision';
import { endlessCombatStats } from './endlessGrowth';
import { activeWorld, WORLD } from './types';
import { isTerritoryPlayerAirborne } from './territoryCannon';
import type { GameEvent, GameState, Target, Vec, WorldGeometry } from './types';
import type { BeaconState, ProtocolRank } from './growthTypes';
import type { TerritorySquadPlan } from './endlessTypes';
import { immuneLegions } from './immuneLegions';
import type { TerritoryContextView, TerritoryLane, TerritoryLaneView, TerritoryNode, TerritoryNodeId, TerritoryNodeStatus, TerritoryNodeView, TerritoryPurificationPauseReason, TerritoryPurificationResult, TerritoryRuleEvent, TerritorySourceId, TerritoryState } from './territoryTypes';

export type * from './territoryTypes';

export const TERRITORY_BALANCE = {
  captureRadius: 120, captureSeconds: 10, captureRecoveryPerSecond: 10,
  purificationRange: 150, purificationSeconds: 3,
  purificationHurtPause: .8, defenseRadius: 300, garrisonArrivalRange: 150,
  healingRange: 150, healPerSecond: 3, cleanseSeconds: 1,
  healingBodyRadius: 36, ordinaryPollutionPerSecond: 2.5, ordinaryPollutionLimit: 3,
  infectionSeconds: 8, infectionDamage: 1, infectionTickSeconds: 1,
  sourceHp: 1200,
  assaultWarningSeconds: 4, assaultFirstDeparture: 4, assaultIntervalSeconds: 10, assaultSquadSize: 4,
  assaultMinimumPlayerDistance: 180, assaultSpawnRingInner: 140, assaultSpawnRingOuter: 320,
  /** Escort bites counter living garrisons; the same telegraph and real hit test apply. */
  escortArmyDamageMultiplier: 2,
} as const;

export const TERRITORY_LANES: readonly TerritoryLane[] = [
  { id: 'north', sourceId: 'source-west', frontNodeId: 'front-north', healingNodeId: 'heart-healing-1', path: ['source-west', 'front-north', 'heart-healing-1', 'core'] },
  { id: 'south', sourceId: 'source-east', frontNodeId: 'front-south', healingNodeId: 'heart-healing-2', path: ['source-east', 'front-south', 'heart-healing-2', 'core'] },
];

const EPSILON = 1e-7;
const finitePoint = (point: Vec): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);
const active = (state: GameState): boolean => state.phase === 'playing' && !!state.territory && state.territory.stage !== 'victory';
const within = (a: Vec, b: Vec, radius: number): boolean => finitePoint(a) && finitePoint(b) && distance(a, b) <= radius + EPSILON;

/** Existing beacon protocol ranks remain the sole military power scale. */
export function territoryBeaconRank(state: Pick<GameState, 'territory'> & Partial<Pick<GameState, 'growth'>>): ProtocolRank {
  const earned = state.territory ? 1 + Number(state.territory.defense.north.repelled) + Number(state.territory.defense.south.repelled) : 1;
  return Math.min(3, Math.max(earned, state.growth?.equipped.find(slot => slot.id === 'IMMUNE_BEACON')?.rank ?? 1)) as ProtocolRank;
}

/** A guard order alone is insufficient: its living bodies must physically arrive. */
export function territoryFrontGarrison(state: Pick<GameState, 'territory'> & Partial<Pick<GameState, 'growth' | 'elapsed'>>,
  frontId: 'front-north' | 'front-south', minArrived = 1): BeaconState | undefined {
  const node = state.territory?.nodes.find(candidate => candidate.id === frontId), elapsed = state.elapsed ?? 0;
  if (!node || !state.growth) return;
  return immuneLegions(state.growth).find(beacon => beacon.organId === 'heart' && beacon.mode === 'protocol' && beacon.until > elapsed
    && beacon.guard?.kind === 'territory' && beacon.guard.regionId === frontId
    && (state.growth?.cells ?? []).filter(cell => cell.beaconId === beacon.id && cell.organId === 'heart'
      && (cell.hp ?? 1) > 0 && cell.until > elapsed && within(cell, node,
        minArrived >= 2 ? TERRITORY_BALANCE.garrisonArrivalRange : TERRITORY_BALANCE.defenseRadius)).length >= minArrived);
}

function squadFinished(state: GameState, squad: TerritorySquadPlan): boolean {
  return squad.memberIds.length > 0 && !squad.memberIds.some(id => state.targets.some(target => target.id === id
    && (target.hp > 0 || target.splitAt !== undefined)));
}

function finishDefenseSquad(state: GameState, squad: TerritorySquadPlan): void {
  if (squad.defenseResolved || !squadFinished(state, squad)) return;
  squad.defenseResolved = true;
  const defense = state.territory!.defense[squad.laneId];
  if (squad.defenseNodeId && !squad.defenseFailed && !defense.repelled)
    defense.repelProof = { squadId: squad.id, nodeId: squad.defenseNodeId };
  if (defense.attempt?.squadId === squad.id) defense.attempt.cleared = true;
}

/** Accepted combat receipts only; no render state, elapsed wall time, or diagnostic-log scans. */
export function recordTerritoryCombatEvent(state: GameState, event: GameEvent): TerritoryRuleEvent[] {
  if (!active(state) || event.tick !== state.tick || state.player.hp <= 0 || state.tissue.hp <= 0) return [];
  const territory = state.territory!, events: TerritoryRuleEvent[] = [], data = event.data;
  if (event.type === 'PLAYER_HURT' && data.reason !== 'infection' && Number(data.damage) > 0)
    territory.purificationInterruptedUntil = Math.max(territory.purificationInterruptedUntil, state.elapsed + TERRITORY_BALANCE.purificationHurtPause);
  const squads = state.endless?.territoryTasks?.squads ?? [];
  if (event.type === 'TERRITORY_CAPTURED') {
    for (const squad of squads) if (squad.defenseNodeId === data.nodeId) squad.defenseFailed = true;
    for (const lane of TERRITORY_LANES) {
      const defense = territory.defense[lane.id];
      if (defense.repelProof?.nodeId === data.nodeId) delete defense.repelProof;
      if (defense.attempt?.nodeId === data.nodeId) {
        events.push({ type: 'TERRITORY_HANDOFF_FAILED', data: { laneId: lane.id, reason: 'captured', squadId: defense.attempt.squadId } });
        delete defense.attempt;
      }
    }
  }
  if (event.type === 'TERRITORY_SQUAD_SPAWNED') {
    const squad = squads.find(item => item.id === data.squadId), lane = squad && TERRITORY_LANES.find(item => item.id === squad.laneId);
    if (squad && lane && territory.stage === 'rescue' && territoryBeaconRank(state) >= 3 && !territory.defense[lane.id].handoff) {
      const front = territory.nodes.find(node => node.id === lane.frontNodeId)!;
      const beacon = front.owner === 'healthy' ? territoryFrontGarrison(state, lane.frontNodeId, 2) : undefined;
      if (beacon) {
        territory.defense[lane.id].attempt = { squadId: squad.id, beaconId: beacon.id, nodeId: lane.frontNodeId, enteredDefense: false, invaderHit: false };
        events.push({ type: 'TERRITORY_HANDOFF_STARTED', data: { laneId: lane.id, nodeId: lane.frontNodeId, squadId: squad.id, beaconId: beacon.id } });
      }
    }
  }
  if (event.type === 'TARGET_HIT' && Number(data.damage) > 0 && data.ability !== 'host-event') {
    const target = state.targets.find(actor => actor.id === data.id), squad = squads.find(item => item.id === target?.territoryTask?.squadId);
    if (target && squad) {
      const lane = TERRITORY_LANES.find(item => item.id === squad.laneId)!;
      const node = territory.nodes.filter(item => lane.path.includes(item.id as never) && (item.kind === 'front' || item.kind === 'healing')
        && item.owner === 'healthy' && within(target, item, TERRITORY_BALANCE.defenseRadius))
        .sort((a, b) => distance(target, a) - distance(target, b))[0];
      if (node && !squad.defenseNodeId) squad.defenseNodeId = node.id;
      const attempt = territory.defense[squad.laneId].attempt;
      if (attempt?.squadId === squad.id) {
        const front = territory.nodes.find(item => item.id === attempt.nodeId)!;
        if (within(target, front, TERRITORY_BALANCE.defenseRadius)) attempt.enteredDefense = true;
        if (target.territoryTask?.kind === 'invade' && typeof data.immuneCellId === 'string'
          && state.growth?.cells?.some(cell => cell.id === data.immuneCellId && cell.beaconId === attempt.beaconId
            && (cell.hp ?? 1) > 0 && cell.until > state.elapsed)) attempt.invaderHit = true;
      }
    }
  }
  if (event.type === 'TERRITORY_SQUAD_CLEARED') {
    const squad = squads.find(item => item.id === data.squadId);
    if (squad) finishDefenseSquad(state, squad);
  }
  return events;
}

/** Called once after combat per playing simulation step; finite tasks never wait for its proofs. */
export function advanceTerritoryDefense(state: GameState, dt: number): TerritoryRuleEvent[] {
  if (!active(state) || state.player.hp <= 0 || state.tissue.hp <= 0 || !Number.isFinite(dt) || dt <= 0) return [];
  const territory = state.territory!, events: TerritoryRuleEvent[] = [], squads = state.endless?.territoryTasks?.squads ?? [];
  for (const squad of squads) {
    if (squad.defenseNodeId && territory.nodes.find(node => node.id === squad.defenseNodeId)?.owner !== 'healthy') squad.defenseFailed = true;
    if (squad.status === 'complete' || squad.status === 'active') finishDefenseSquad(state, squad);
  }
  for (const lane of TERRITORY_LANES) {
    const defense = territory.defense[lane.id], proof = defense.repelProof;
    if (proof) {
      const node = territory.nodes.find(item => item.id === proof.nodeId);
      if (!node || node.owner !== 'healthy') delete defense.repelProof;
      else if (node.infectionProgress <= EPSILON) {
        defense.repelled = true; delete defense.repelProof;
        const rank = territoryBeaconRank(state), slot = state.growth?.equipped.find(item => item.id === 'IMMUNE_BEACON');
        if (slot) slot.rank = rank;
        events.push({ type: 'TERRITORY_DEFENSE_MILESTONE', data: { laneId: lane.id, nodeId: proof.nodeId, rank } });
      }
    }
    const attempt = defense.attempt;
    if (!attempt) continue;
    const front = territory.nodes.find(node => node.id === attempt.nodeId)!;
    const beacon = immuneLegions(state.growth).find(item => item.id === attempt.beaconId && item.organId === 'heart' && item.until > state.elapsed
      && item.guard?.kind === 'territory' && item.guard.regionId === attempt.nodeId);
    const alive = beacon && state.growth?.cells?.some(cell => cell.beaconId === beacon.id && cell.organId === 'heart' && (cell.hp ?? 1) > 0 && cell.until > state.elapsed);
    if (front.owner !== 'healthy' || !alive) {
      events.push({ type: 'TERRITORY_HANDOFF_FAILED', data: { laneId: lane.id, squadId: attempt.squadId, reason: front.owner !== 'healthy' ? 'captured' : 'garrison-lost' } });
      delete defense.attempt; continue;
    }
    const squad = squads.find(item => item.id === attempt.squadId);
    if (squad?.memberIds.some(id => state.targets.some(target => target.id === id && target.hp > 0 && within(target, front, TERRITORY_BALANCE.defenseRadius))))
      attempt.enteredDefense = true;
    if (attempt.cleared) {
      if (!attempt.enteredDefense || !attempt.invaderHit) {
        events.push({ type: 'TERRITORY_HANDOFF_FAILED', data: { laneId: lane.id, squadId: attempt.squadId, reason: 'no-immune-interception' } });
        delete defense.attempt;
      } else if (front.infectionProgress <= EPSILON) {
        defense.handoff = true; delete defense.attempt;
        events.push({ type: 'TERRITORY_HANDOFF_COMPLETED', data: { laneId: lane.id, nodeId: front.id, squadId: attempt.squadId, beaconId: attempt.beaconId } });
      }
    }
  }
  const stable = territory.nodes.every(node => node.owner === 'healthy' && node.infectionProgress <= EPSILON);
  territory.stability.active = stable;
  if (stable) {
    territory.stability.totalSeconds += dt; territory.stability.currentSeconds += dt;
    territory.stability.bestSeconds = Math.max(territory.stability.bestSeconds, territory.stability.currentSeconds);
  } else territory.stability.currentSeconds = 0;
  return events;
}

export function createTerritoryState(): TerritoryState {
  const node = (id: TerritoryNodeId, name: string, kind: TerritoryNode['kind'], x: number, y: number, healthy = false): TerritoryNode => ({
    id, name, kind, x, y, owner: healthy ? 'healthy' : 'infected',
    infectionProgress: healthy ? 0 : 100, purificationProgress: 0, permanent: false, firstPurified: false,
  });
  return {
    schemaVersion: 1, stage: 'rescue', campBuilt: false, purification: null,
    purificationInterruptedUntil: 0,
    defense: { north: { repelled: false, handoff: false }, south: { repelled: false, handoff: false } },
    stability: { totalSeconds: 0, currentSeconds: 0, bestSeconds: 0, active: false },
    playerExposureAt: -1,
    healingContact: { nodeId: null, seconds: 0 },
    nodes: [
      node('core', '心核', 'core', 1200, 900, true),
      node('heart-healing-1', '北侧生命泉', 'healing', 1150, 330, true),
      node('heart-healing-2', '南侧生命泉', 'healing', 1880, 1300, true),
      node('source-west', '西侧感染源', 'source', 450, 600),
      node('source-east', '东侧感染源', 'source', 1950, 450),
      node('front-north', '北线前沿', 'front', 700, 350),
      node('front-south', '南线前沿', 'front', 2140, 950),
    ],
    sources: {
      'source-west': { nodeId: 'source-west', frontNodeId: 'front-north', healingNodeId: 'heart-healing-1', unlocked: false, spawned: false, destroyed: false, rewarded: false },
      'source-east': { nodeId: 'source-east', frontNodeId: 'front-south', healingNodeId: 'heart-healing-2', unlocked: false, spawned: false, destroyed: false, rewarded: false },
    },
  };
}

/** Explicit opt-in. The ordinary endless/campaign fixtures keep their old rules. */
export function initializeTerritory(state: GameState): void {
  state.territory = createTerritoryState();
  state.playerInfection = null;
  syncTerritoryHealingNodes(state);
}

/** Legacy graph values are a presentation mirror, never another ownership authority. */
export function syncTerritoryHealingNodes(state: GameState): void {
  if (!state.territory || !state.battle) return;
  for (const region of state.territory.nodes) {
    if (region.kind !== 'healing') continue;
    let graphNode = state.battle.graph.nodes.find(candidate => candidate.id === region.id);
    if (!graphNode) {
      graphNode = { id: region.id, kind: 'healing', x: region.x, y: region.y, active: true, infected: false, infection: 0, healReadyAt: 0 };
      state.battle.graph.nodes.push(graphNode);
    }
    graphNode.x = region.x; graphNode.y = region.y;
    graphNode.infected = region.owner === 'infected';
    graphNode.infection = graphNode.infected ? 100 : region.infectionProgress;
  }
}

/** Stable array order breaks exact nearest-site ties; no render projection is used. */
export function territoryNodeAt(territory: TerritoryState, point: Vec): TerritoryNode | undefined {
  if (!finitePoint(point)) return;
  let nearest: TerritoryNode | undefined, best = Infinity;
  for (const node of territory.nodes) {
    const squared = (point.x - node.x) ** 2 + (point.y - node.y) ** 2;
    if (squared < best) { best = squared; nearest = node; }
  }
  return nearest;
}

/** Shared presentation geometry also accepts legacy graph IDs without creating territory gameplay state. */
export function boundedRegionPolygon<T extends Vec & { id: string }>(nodes: readonly T[], nodeId: string, bounds: WorldGeometry['bounds']): Vec[] {
  const node = nodes.find(candidate => candidate.id === nodeId);
  if (!node || !finitePoint(node) || !Object.values(bounds).every(Number.isFinite) || bounds.right <= bounds.left || bounds.bottom <= bounds.top) return [];
  let polygon: Vec[] = [{ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom }];
  for (const other of nodes) {
    if (other.id === nodeId || !finitePoint(other)) continue;
    const normal = { x: other.x - node.x, y: other.y - node.y };
    const limit = (other.x ** 2 + other.y ** 2 - node.x ** 2 - node.y ** 2) / 2;
    const side = (point: Vec) => point.x * normal.x + point.y * normal.y - limit;
    const output: Vec[] = [];
    for (let index = 0; index < polygon.length; index++) {
      const from = polygon[index], to = polygon[(index + 1) % polygon.length];
      const a = side(from), b = side(to), insideA = a <= EPSILON, insideB = b <= EPSILON;
      if (insideA) output.push(from);
      if (insideA !== insideB) {
        const fraction = a / (a - b);
        output.push({ x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction });
      }
    }
    polygon = output;
    if (!polygon.length) break;
  }
  return polygon;
}

/** A bounded Voronoi polygon in simulation XY, clipped to the actual walkable bounds. */
export function territoryPolygon(territory: TerritoryState, nodeId: TerritoryNodeId, bounds: WorldGeometry['bounds']): Vec[] {
  return boundedRegionPolygon(territory.nodes, nodeId, bounds);
}

/** Source assignments survive source destruction: already born invaders remain real threats. */
export function territoryInvaderGoal(state: Pick<GameState, 'territory'>, target: Target): TerritoryNode | undefined {
  const territory = state.territory;
  if (!territory || target.hp <= 0 || target.territoryTask?.kind !== 'invade') return;
  const lane = target.territorySourceId ? TERRITORY_LANES.find(lane => lane.sourceId === target.territorySourceId)
    : TERRITORY_LANES.find(lane => lane.path.includes(target.territoryTask!.nodeId as never));
  const path = lane?.path.slice(1) ?? [target.territoryTask.nodeId, 'core'];
  return path.map(id => territory.nodes.find(node => node.id === id)).find(node => node
    && (node.kind === 'core' || (node.kind === 'front' || node.kind === 'healing') && node.owner === 'healthy' && !node.permanent));
}

export function territoryInvaderAt(state: GameState, node: TerritoryNode): boolean {
  return state.targets.some(target => target.hp > 0 && (target.role === 'virus' || target.role === 'elite')
    && target.territoryTask?.kind === 'invade'
    && (!target.territorySourceId || TERRITORY_LANES.find(lane => lane.sourceId === target.territorySourceId)?.path.includes(node.id as never) === true)
    && within(target, node, TERRITORY_BALANCE.captureRadius));
}

export interface TerritoryPollutionContext { territory?: TerritoryState; targets: readonly Target[]; world?: WorldGeometry }
const contagiousBody = (target: Target): boolean => target.hp > 0 && (target.role === 'virus' || target.role === 'elite');
function clearBodyLine(from: Vec, to: Vec, world: WorldGeometry): boolean {
  const gap = distance(from, to);
  if (gap <= EPSILON) return true;
  const hit = wallHit(from, normalized(to.x - from.x, to.y - from.y), gap, world);
  return hit === null || hit >= gap - EPSILON;
}
function nodeInvader(state: TerritoryPollutionContext, node: TerritoryNode, target: Target): boolean {
  return contagiousBody(target) && target.territoryTask?.kind === 'invade'
    && (!target.territorySourceId || TERRITORY_LANES.find(lane => lane.sourceId === target.territorySourceId)?.path.includes(node.id as never) === true)
    && (node.owner === 'infected' || territoryInvaderGoal(state, target)?.id === node.id)
    && within(target, node, TERRITORY_BALANCE.captureRadius)
    && clearBodyLine(target, node, state.world ?? WORLD);
}
/** One owner-independent authority for contamination, purification, captions and guard priorities. */
export function territoryNodeContaminators(state: TerritoryPollutionContext, nodeOrId: TerritoryNode | TerritoryNodeId): Target[] {
  const node = typeof nodeOrId === 'string' ? state.territory?.nodes.find(item => item.id === nodeOrId) : nodeOrId;
  if (!node || node.permanent || node.kind !== 'healing' && node.kind !== 'front') return [];
  return state.targets.filter(target => nodeInvader(state, node, target) || node.kind === 'healing' && contagiousBody(target)
    && within(target, node, TERRITORY_BALANCE.healingBodyRadius + target.radius)
    && clearBodyLine(target, node, state.world ?? WORLD));
}
export function territoryPollutionRate(state: TerritoryPollutionContext, nodeOrId: TerritoryNode | TerritoryNodeId): number {
  const node = typeof nodeOrId === 'string' ? state.territory?.nodes.find(item => item.id === nodeOrId) : nodeOrId;
  if (!node) return 0;
  const attackers = territoryNodeContaminators(state, node);
  const specialist = attackers.some(target => nodeInvader(state, node, target));
  const ordinary = node.kind === 'healing' ? attackers.filter(target => !nodeInvader(state, node, target)).length : 0;
  return Math.max(specialist ? 100 / TERRITORY_BALANCE.captureSeconds : 0,
    Math.min(TERRITORY_BALANCE.ordinaryPollutionLimit, ordinary) * TERRITORY_BALANCE.ordinaryPollutionPerSecond);
}

/** Swept actual movement only. Dash/contact damage protection does not block transmission. */
export function advancePlayerContactInfection(state: GameState, from: Vec, to: Vec, dt: number,
  options: { wasAirborne?: boolean } = {}): TerritoryRuleEvent[] {
  if (!active(state) || state.player.hp <= 0 || !Number.isFinite(dt) || dt <= 0 || !finitePoint(from) || !finitePoint(to)
    || isTerritoryPlayerAirborne(state)) return [];
  const start = options.wasAirborne ? to : from, dx = to.x - start.x, dy = to.y - start.y, squared = dx * dx + dy * dy;
  const world = activeWorld(state);
  const target = state.targets.find(actor => {
    if (!contagiousBody(actor)) return false;
    const along = squared > EPSILON ? Math.max(0, Math.min(1, ((actor.x - start.x) * dx + (actor.y - start.y) * dy) / squared)) : 0;
    const closest = { x: start.x + dx * along, y: start.y + dy * along };
    return within(actor, closest, state.player.radius + actor.radius)
      && clearBodyLine(start, closest, world) && clearBodyLine(closest, actor, world);
  });
  if (!target) return [];
  const infected = infectPlayer(state, target.id);
  return infected ? [infected] : [];
}

export function territorySourceShielded(state: Pick<GameState, 'territory'> & Partial<Pick<GameState, 'growth' | 'elapsed'>>, sourceId: TerritorySourceId): boolean {
  const territory = state.territory, lane = TERRITORY_LANES.find(lane => lane.sourceId === sourceId);
  if (!territory || !lane || territory.sources[sourceId]?.destroyed) return false;
  return !territory.defense[lane.id].handoff
    || territory.nodes.find(node => node.id === lane.frontNodeId)?.owner !== 'healthy'
    || territory.nodes.find(node => node.id === lane.healingNodeId)?.owner !== 'healthy'
    || !territoryFrontGarrison(state, lane.frontNodeId);
}

/** Current forward infection anchor, recomputed for warnings and again on birth. */
export function territoryInvasionOrigin(state: GameState, sourceId: TerritorySourceId): Vec | undefined {
  const territory = state.territory, lane = TERRITORY_LANES.find(lane => lane.sourceId === sourceId);
  if (!territory || !lane) return;
  const source = territory.nodes.find(node => node.id === sourceId);
  if (!source) return;
  if (territory.stage === 'guard') {
    const bounds = activeWorld(state).bounds;
    return { x: sourceId === 'source-west' ? bounds.left + 70 : bounds.right - 70, y: source.y };
  }
  const anchor = [...lane.path].reverse().map(id => territory.nodes.find(node => node.id === id))
    .find(node => node?.kind !== 'core' && node?.owner === 'infected');
  return anchor ? { x: anchor.x, y: anchor.y } : { x: source.x, y: source.y };
}

function requiredHealing(state: Pick<GameState, 'territory'>, node: TerritoryNode): TerritoryNode | undefined {
  const lane = node.kind === 'front' ? TERRITORY_LANES.find(lane => lane.frontNodeId === node.id) : undefined;
  return lane ? state.territory?.nodes.find(candidate => candidate.id === lane.healingNodeId && candidate.owner !== 'healthy') : undefined;
}
function nearbyInfected(state: GameState): TerritoryNode[] {
  return state.territory?.nodes.filter(node => (node.kind === 'front' || node.kind === 'healing') && node.owner === 'infected'
    && within(state.player, node, TERRITORY_BALANCE.purificationRange))
    .sort((a, b) => distance(a, state.player) - distance(b, state.player) || a.id.localeCompare(b.id)) ?? [];
}
export function territoryPurificationCandidate(state: GameState): TerritoryNode | undefined {
  return active(state) && state.player.hp > 0 && !isTerritoryPlayerAirborne(state) ? nearbyInfected(state).find(node => !requiredHealing(state, node)) : undefined;
}
function purificationPauseReason(state: GameState, node: TerritoryNode): TerritoryPurificationPauseReason | undefined {
  if (!active(state) || state.player.hp <= 0) return 'inactive';
  if (isTerritoryPlayerAirborne(state)) return 'airborne';
  if (requiredHealing(state, node)) return 'healing-required';
  if (!within(state.player, node, TERRITORY_BALANCE.purificationRange)) return 'out-of-range';
  if (node.kind === 'healing' && territoryNodeContaminators(state, node).length > 0) return 'contaminant';
  if (territoryInvaderAt(state, node)) return 'invader';
  if (state.elapsed + EPSILON < state.territory!.purificationInterruptedUntil) return 'hurt';
}
export function territoryNodeStatus(state: Pick<GameState, 'territory'>, nodeOrId: TerritoryNode | TerritoryNodeId): TerritoryNodeStatus {
  const node = typeof nodeOrId === 'string' ? state.territory?.nodes.find(node => node.id === nodeOrId) : nodeOrId;
  if (!node) return 'healthy';
  if (node.owner === 'infected') return state.territory?.purification?.nodeId === node.id ? 'purifying' : 'infected';
  return node.infectionProgress > EPSILON ? 'contested' : 'healthy';
}
export function territoryNodeView(state: GameState, nodeOrId: TerritoryNode | TerritoryNodeId): TerritoryNodeView | undefined {
  const node = typeof nodeOrId === 'string' ? state.territory?.nodes.find(node => node.id === nodeOrId) : nodeOrId;
  if (!node) return;
  const purificationActive = state.territory?.purification?.nodeId === node.id && node.owner === 'infected';
  const attackers = node.kind === 'core' ? state.targets.filter(target => target.hp > 0 && (
    target.attackTarget === 'tissue' && (target.attackAt ?? 0) > state.elapsed
      || target.territoryTask?.kind === 'invade' && territoryInvaderGoal(state, target)?.id === node.id && within(target, node, TERRITORY_BALANCE.captureRadius)))
    : territoryNodeContaminators(state, node);
  const infecting = node.owner === 'healthy' && (node.kind === 'healing' || node.kind === 'front') && attackers.length > 0;
  const origins = attackers.map(target => ({ x: target.x, y: target.y }));
  const required = requiredHealing(state, node);
  return { node, status: territoryNodeStatus(state, node), infecting, recovering: node.owner === 'healthy' && node.infectionProgress > 0 && !infecting,
    infectionProgress: node.infectionProgress, pollutionRate: territoryPollutionRate(state, node), purificationProgress: node.purificationProgress, purificationActive,
    ...(purificationActive ? { pausedReason: purificationPauseReason(state, node) } : {}),
    ...(required ? { requiredNodeId: required.id as 'heart-healing-1' | 'heart-healing-2' } : {}),
    attackerIds: attackers.map(target => target.id), attackOrigins: origins, ...(origins[0] ? { incomingFrom: origins[0] } : {}) };
}
export function territoryContextView(state: GameState): TerritoryContextView {
  const territory = state.territory, current = territory?.nodes.find(node => node.id === territory.purification?.nodeId && node.owner === 'infected');
  const pausedReason = current ? purificationPauseReason(state, current) : undefined;
  const base = { progress: current?.purificationProgress ?? 0, ...(current ? { nodeId: current.id, activeNodeId: current.id, pausedReason } : {}) };
  if (!territory) return { ...base, action: 'none' };
  if (!active(state) || state.player.hp <= 0) return { ...base, action: 'blocked', reason: 'inactive' };
  if (isTerritoryPlayerAirborne(state)) return { ...base, action: 'blocked', reason: 'airborne' };
  const candidate = territoryPurificationCandidate(state);
  if (candidate) return { ...base, action: 'purify', candidate, nodeId: current?.id ?? candidate.id, actionNodeId: candidate.id,
    progress: current?.purificationProgress ?? candidate.purificationProgress };
  const core = territory.nodes.find(node => node.kind === 'core');
  if (core && state.tissue.hp < state.tissue.maxHp && within(state.player, core, TERRITORY_BALANCE.purificationRange))
    return { ...base, action: 'repair', nodeId: current?.id ?? core.id, actionNodeId: core.id };
  const blocked = nearbyInfected(state).find(node => requiredHealing(state, node));
  if (blocked) return { ...base, action: 'blocked', nodeId: current?.id ?? blocked.id, actionNodeId: blocked.id, reason: 'healing-required',
    requiredNodeId: requiredHealing(state, blocked)!.id as 'heart-healing-1' | 'heart-healing-2' };
  if (current) return { ...base, action: 'blocked', reason: pausedReason ?? 'range' };
  return { ...base, action: 'none' };
}
export function territoryLaneViews(state: GameState): TerritoryLaneView[] {
  if (!state.territory) return [];
  return TERRITORY_LANES.flatMap(lane => {
    const source = territoryNodeView(state, lane.sourceId), front = territoryNodeView(state, lane.frontNodeId), healing = territoryNodeView(state, lane.healingNodeId);
    if (!source || !front || !healing) return [];
    const phantom: Target = { id: 'lane-view', x: 0, y: 0, kind: 'single', hp: 1, maxHp: 1, radius: 1, hitUntil: 0, scanned: false,
      territorySourceId: lane.sourceId, territoryTask: { kind: 'invade', nodeId: lane.frontNodeId } };
    const goal = territoryInvaderGoal(state, phantom) ?? state.territory!.nodes.find(node => node.id === 'core')!;
    const origin = territoryInvasionOrigin(state, lane.sourceId) ?? source.node;
    const attacked = [front, healing].filter(view => view.infecting || view.purificationActive
      && (view.pausedReason === 'invader' || view.pausedReason === 'contaminant'));
    const warning = [front, healing].find(view => view.infecting);
    const core = territoryNodeView(state, 'core');
    const coreAttacked = core?.attackerIds.some(id => state.targets.some(target => target.id === id && target.territorySourceId === lane.sourceId));
    const pending = state.endless?.territoryTasks?.squads.find(squad => squad.laneId === lane.id && squad.status === 'warning');
    const combatStart = state.endless?.phaseStartedAt ?? state.elapsed;
    return [{ laneId: lane.id, sourceId: lane.sourceId, frontNodeId: lane.frontNodeId, healingNodeId: lane.healingNodeId,
      source, front, healing, goal, origin, shielded: territorySourceShielded(state, lane.sourceId),
      attackedNodeIds: [...attacked.map(view => view.node.id), ...(coreAttacked ? ['core' as const] : [])],
      ...(warning ? { warning: { nodeId: warning.node.id, progress: warning.infectionProgress,
        seconds: Math.max(0, 100 - warning.infectionProgress) / Math.max(EPSILON, warning.pollutionRate) } } : {}),
      ...(pending ? { incoming: { squadId: pending.id, nodeId: goal.id, origin,
        seconds: Math.max(0, Math.max(combatStart + pending.departureOffset, (pending.warnedAt ?? state.elapsed) + TERRITORY_BALANCE.assaultWarningSeconds,
          Math.max(-Infinity, ...(state.endless?.territoryTasks?.squads.map(squad => squad.bornAt ?? -Infinity) ?? [])) + TERRITORY_BALANCE.assaultIntervalSeconds) - state.elapsed),
        blocked: !!pending.blocked } } : {}) }];
  });
}

/** Healthy contested facilities continue to work. Choose one; overlapping radii never stack. */
export function territoryHealingNodeAt(state: GameState, point: Vec = state.player): TerritoryNode | undefined {
  return state.territory?.nodes.filter(node => node.kind === 'healing' && node.owner === 'healthy'
    && within(point, node, TERRITORY_BALANCE.healingRange))
    .sort((a, b) => distance(a, point) - distance(b, point) || a.id.localeCompare(b.id))[0];
}

export function beginTerritoryPurification(state: GameState, aim: Vec = state.player): TerritoryPurificationResult {
  const rejected = (reason: TerritoryPurificationResult['reason'], nodeId?: TerritoryNodeId): TerritoryPurificationResult => ({ accepted: false, reason, nodeId, events: [] });
  if (!active(state) || state.player.hp <= 0) return rejected('inactive');
  if (isTerritoryPlayerAirborne(state)) return rejected('airborne');
  const node = territoryNodeAt(state.territory!, aim);
  if (!node || !within(aim, node, TERRITORY_BALANCE.purificationRange) || !within(state.player, node, TERRITORY_BALANCE.purificationRange)) return rejected('range', node?.id);
  if (node.kind === 'source') return rejected('source', node.id);
  if (node.kind === 'core') return rejected('core', node.id);
  if (node.owner === 'healthy') return rejected('healthy', node.id);
  if (requiredHealing(state, node)) return rejected('healing-required', node.id);
  if (state.territory!.purification?.nodeId === node.id) return { accepted: true, nodeId: node.id, events: [] };
  state.territory!.purification = { nodeId: node.id, startedAt: state.elapsed };
  return { accepted: true, nodeId: node.id, events: [{ type: 'TERRITORY_PURIFICATION_STARTED', data: { nodeId: node.id, progress: node.purificationProgress } }] };
}

/** Contact extends the fixed-duration condition without evading its already scheduled damage. */
export function infectPlayer(state: GameState, sourceId?: string): TerritoryRuleEvent | null {
  if (!active(state) || state.player.hp <= 0) return null;
  state.territory!.playerExposureAt = state.elapsed;
  state.territory!.healingContact.seconds = 0;
  state.territory!.healingContact.exposure = true;
  const infection = state.playerInfection;
  if (infection && infection.until + EPSILON >= state.elapsed) {
    infection.until = Math.max(infection.until, state.elapsed + TERRITORY_BALANCE.infectionSeconds);
    if (sourceId) infection.sourceId = sourceId;
    return null;
  }
  state.playerInfection = { until: state.elapsed + TERRITORY_BALANCE.infectionSeconds,
    nextTickAt: state.elapsed + TERRITORY_BALANCE.infectionTickSeconds, ...(sourceId ? { sourceId } : {}) };
  // Every new exposure requires a fresh full treatment; the damage tick is
  // deliberately preserved by the refresh branch above.
  return { type: 'PLAYER_INFECTED', data: { sourceId: sourceId ?? '', until: state.playerInfection.until, duration: TERRITORY_BALANCE.infectionSeconds } };
}

/** A source requires a real death receipt from the session; the rule never invents score. */
export function destroyTerritorySource(state: GameState, sourceId: TerritorySourceId): TerritoryRuleEvent[] {
  if (!active(state)) return [];
  const territory = state.territory!, source = territory.sources[sourceId];
  if (!source || source.destroyed || !source.unlocked || !source.spawned) return [];
  const body = state.targets.find(target => target.role === 'source' && target.territorySourceId === sourceId
    && (!source.actorId || target.id === source.actorId));
  if (!body || body.hp > 0 || !Number.isFinite(body.hp)) return [];
  source.destroyed = true;
  const firstReward = !source.rewarded;
  source.rewarded = true;
  const node = territory.nodes.find(candidate => candidate.id === source.nodeId)!;
  const first = !node.firstPurified;
  node.owner = 'healthy'; node.infectionProgress = 0; node.purificationProgress = 100;
  node.permanent = true; node.firstPurified = true;
  return [
    { type: 'TERRITORY_SOURCE_DESTROYED', data: { sourceId, nodeId: node.id, healingNodeId: source.healingNodeId, firstReward } },
    { type: 'TERRITORY_PURIFIED', data: { nodeId: node.id, first, permanent: true, reason: 'source-destroyed' } },
  ];
}

/** Mutates only territory/contact/HP and its graph mirror; the host owns stage, score and victory. */
export function advanceTerritory(state: GameState, dt: number): TerritoryRuleEvent[] {
  if (!active(state) || !Number.isFinite(dt) || dt <= 0) return [];
  const territory = state.territory!, events: TerritoryRuleEvent[] = [];
  for (const node of territory.nodes) {
    if (node.kind !== 'healing' && node.kind !== 'front' || node.owner !== 'healthy' || node.permanent) continue;
    const before = node.infectionProgress, rate = territoryPollutionRate(state, node);
    node.infectionProgress = Math.max(0, Math.min(100, before + (rate > 0 ? rate : -TERRITORY_BALANCE.captureRecoveryPerSecond) * dt));
    if (before === 0 && node.infectionProgress > 0) events.push({ type: 'TERRITORY_CONTESTED', data: { nodeId: node.id } });
    if (before > 0 && node.infectionProgress === 0) events.push({ type: 'TERRITORY_CAPTURE_REPELLED', data: { nodeId: node.id } });
    if (node.infectionProgress >= 100 - EPSILON) {
      node.owner = 'infected'; node.infectionProgress = 100; node.purificationProgress = 0;
      events.push({ type: 'TERRITORY_CAPTURED', data: { nodeId: node.id } });
    }
  }
  const purifying = territory.purification && territory.nodes.find(node => node.id === territory.purification!.nodeId);
  if (purifying?.owner === 'infected' && !purificationPauseReason(state, purifying)) {
    purifying.purificationProgress = Math.min(100, purifying.purificationProgress + 100 / TERRITORY_BALANCE.purificationSeconds * dt);
    if (purifying.purificationProgress >= 100 - EPSILON) {
      const first = !purifying.firstPurified;
      purifying.owner = 'healthy'; purifying.infectionProgress = 0; purifying.purificationProgress = 100; purifying.firstPurified = true;
      territory.purification = null;
      events.push({ type: 'TERRITORY_PURIFIED', data: { nodeId: purifying.id, first, permanent: false, reason: 'player' } });
    }
  } else if (purifying?.owner === 'healthy') territory.purification = null;

  const healing = state.player.hp > 0 && !isTerritoryPlayerAirborne(state) ? territoryHealingNodeAt(state) : undefined;
  if (healing) {
    const exposed = territory.playerExposureAt >= state.elapsed - EPSILON;
    const uninterrupted = Math.max(0, state.elapsed - territory.playerExposureAt);
    territory.healingContact = { nodeId: healing.id,
      seconds: exposed ? 0 : Math.min(TERRITORY_BALANCE.cleanseSeconds, uninterrupted,
        territory.healingContact.nodeId === healing.id ? territory.healingContact.seconds + dt : dt),
      exposure: exposed, healed: 0 };
    if (state.playerInfection && territory.healingContact.seconds + EPSILON >= TERRITORY_BALANCE.cleanseSeconds) {
      state.playerInfection = null;
      events.push({ type: 'PLAYER_INFECTION_CLEARED', data: { reason: 'healing', nodeId: healing.id } });
    }
    const before = state.player.hp, maximum = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth).maxHp : 100;
    state.player.hp = Math.max(before, Math.min(maximum, before + TERRITORY_BALANCE.healPerSecond * dt));
    territory.healingContact.healed = state.player.hp - before;
    if (state.player.hp > before) events.push({ type: 'TERRITORY_PLAYER_HEALED', data: { nodeId: healing.id, amount: state.player.hp - before, healed: state.player.hp - before, remainingHp: state.player.hp } });
  } else territory.healingContact = { nodeId: null, seconds: 0 };

  const infection = state.playerInfection;
  if (infection) {
    const cutoff = Math.min(state.elapsed, infection.until), interval = TERRITORY_BALANCE.infectionTickSeconds;
    // At most one fixed-duration condition's ticks can be caught up in a call.
    const due = Math.max(0, Math.min(Math.ceil(TERRITORY_BALANCE.infectionSeconds / interval), Math.floor((cutoff - infection.nextTickAt + EPSILON) / interval) + 1));
    for (let tick = 0; tick < due; tick++) {
      infection.nextTickAt += interval;
      const before = state.player.hp;
      state.player.hp = Math.max(0, before - TERRITORY_BALANCE.infectionDamage);
      if (before > state.player.hp) events.push({ type: 'PLAYER_HURT', data: { reason: 'infection', actorId: infection.sourceId ?? '', damage: before - state.player.hp, remainingHp: state.player.hp } });
    }
    if (state.elapsed + EPSILON >= infection.until) {
      state.playerInfection = null;
      events.push({ type: 'PLAYER_INFECTION_CLEARED', data: { reason: 'expired', nodeId: '' } });
    }
  }
  syncTerritoryHealingNodes(state);
  return events;
}
