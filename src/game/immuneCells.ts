import { distance, moveWithCollision, normalized, wallHit } from '../actors/collision';
import type { OrganId } from './battleTypes';
import type { BeaconState, GrowthCommand, GrowthContext } from './growthTypes';
import type { Target, Vec, WorldGeometry } from './types';

export const IMMUNE_CELL_BALANCE = { maximum: 5, radius: 15, speed: 190, biteReach: 9, attackPose: .24, navigationInterval: .35 } as const;

/** Real, bounded simulation entities; rendering never updates their position or hits. */
export interface ImmuneCellState extends Vec {
  id: string; beaconId: string; organId: OrganId; born: number; until: number;
  radius: number; facing: number; damage: number; interval: number;
  updatedAt: number; attackReadyAt: number; attackUntil: number;
  targetId: string | null; activity: 'seeking' | 'biting' | 'returning' | 'guarding';
  navigationAt: number; waypoint: Vec | null;
}

type CellBeacon = BeaconState;
const point = (value: Vec): Vec => ({ x: value.x, y: value.y });
const stableId = (a: { id: string }, b: { id: string }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function segmentClear(from: Vec, to: Vec, geometry: WorldGeometry, radius: number): boolean {
  const dx = to.x - from.x, dy = to.y - from.y, squared = dx * dx + dy * dy;
  return geometry.obstacles.every(obstacle => {
    const t = Math.max(0, Math.min(1, ((obstacle.x - from.x) * dx + (obstacle.y - from.y) * dy) / (squared || 1)));
    return Math.hypot(from.x + dx * t - obstacle.x, from.y + dy * t - obstacle.y) >= obstacle.radius + radius + 1;
  });
}

/** A few fixed points around visible footprints keep cells from walking through tissue folds. */
function nextWaypoint(from: Vec, to: Vec, geometry: WorldGeometry, radius: number): Vec {
  if (segmentClear(from, to, geometry, radius)) return point(to);
  const margin = radius + 19;
  const nodes: Vec[] = [point(from), point(to), ...geometry.obstacles.flatMap(obstacle =>
    Array.from({ length: 12 }, (_, index) => ({
      x: obstacle.x + Math.cos(index * Math.PI / 6) * (obstacle.radius + margin),
      y: obstacle.y + Math.sin(index * Math.PI / 6) * (obstacle.radius + margin),
    })).filter(node => node.x > geometry.bounds.left + radius && node.x < geometry.bounds.right - radius
      && node.y > geometry.bounds.top + radius && node.y < geometry.bounds.bottom - radius))];
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  costs[0] = 0;
  for (let iteration = 0; iteration < nodes.length; iteration++) {
    let current = -1;
    for (let index = 0; index < nodes.length; index++) if (!visited.has(index) && (current < 0 || costs[index] < costs[current])) current = index;
    if (current < 0 || !Number.isFinite(costs[current]) || current === 1) break;
    visited.add(current);
    for (let index = 0; index < nodes.length; index++) if (!visited.has(index) && segmentClear(nodes[current], nodes[index], geometry, radius)) {
      const cost = costs[current] + distance(nodes[current], nodes[index]);
      if (cost < costs[index]) { costs[index] = cost; previous[index] = current; }
    }
  }
  let index = 1;
  while (previous[index] > 0) index = previous[index];
  return previous[index] === 0 ? point(nodes[index]) : point(from);
}

export function summonImmuneCells(beacon: CellBeacon, context: GrowthContext, count = 3): ImmuneCellState[] {
  const total = Math.max(1, Math.min(IMMUNE_CELL_BALANCE.maximum, Math.floor(count)));
  return Array.from({ length: total }, (_, index) => {
    const angle = -Math.PI / 2 + index / total * Math.PI * 2;
    const position = moveWithCollision(beacon, { x: Math.cos(angle) * 30, y: Math.sin(angle) * 30 }, IMMUNE_CELL_BALANCE.radius, context.geometry);
    return { ...position, id: `${beacon.id}:cell:${index}`, beaconId: beacon.id, organId: beacon.organId, born: context.elapsed,
      until: beacon.until, radius: IMMUNE_CELL_BALANCE.radius, facing: angle, damage: beacon.damage / total, interval: beacon.interval,
      updatedAt: context.elapsed, attackReadyAt: context.elapsed + .25 + index * .08, attackUntil: 0, targetId: null,
      activity: 'seeking', navigationAt: 0, waypoint: null };
  });
}

function chooseTarget(cell: ImmuneCellState, beacon: CellBeacon, context: GrowthContext, traceIds: ReadonlySet<string>, assigned: Map<string, number>, remainingHp: ReadonlyMap<string, number>): Target | undefined {
  const priority = (target: Target) => traceIds.has(target.id) ? 0 : (target.generation ?? 0) > 0 ? 1 : target.role === 'virus' ? 2 : target.role === 'elite' ? 3 : target.role === 'source' ? 4 : 5;
  // The mother core remains the player's objective; temporary cells clear its defenders.
  // Reserve planned damage so later cells never celebrate biting an already-cleared body.
  return context.targets.filter(target => target.role !== 'core' && (remainingHp.get(target.id) ?? target.hp) > 0 && distance(beacon, target) <= beacon.radius + target.radius)
    .sort((a, b) => priority(a) - priority(b) || (assigned.get(a.id) ?? 0) - (assigned.get(b.id) ?? 0)
      || distance(cell, a) - distance(cell, b) || stableId(a, b))[0];
}

/** One fixed-update movement and at most one bite per unit; no timer catch-up bursts. */
export function advanceImmuneCells(cells: readonly ImmuneCellState[], beacon: CellBeacon | null, context: GrowthContext, traceIds: readonly string[] = []): { cells: ImmuneCellState[]; commands: GrowthCommand[] } {
  if (!context.active) return { cells: cells.map(cell => ({ ...cell, waypoint: cell.waypoint && point(cell.waypoint) })), commands: [] };
  if (!beacon || beacon.until <= context.elapsed || beacon.organId !== context.organId) return { cells: [], commands: [] };
  const active = cells.filter(cell => cell.beaconId === beacon.id && cell.organId === context.organId && cell.until > context.elapsed)
    .slice(0, IMMUNE_CELL_BALANCE.maximum).map(cell => ({ ...cell, waypoint: cell.waypoint && point(cell.waypoint) }));
  const commands: GrowthCommand[] = [], assigned = new Map<string, number>();
  const remainingHp = new Map(context.targets.map(target => [target.id, target.hp]));
  const traced = new Set(beacon.mode === 'patrol' ? [] : traceIds);
  for (const cell of active) {
    const delta = Math.max(0, Math.min(1 / 60, context.elapsed - cell.updatedAt));
    cell.updatedAt = context.elapsed;
    const target = chooseTarget(cell, beacon, context, traced, assigned, remainingHp);
    if (target) assigned.set(target.id, (assigned.get(target.id) ?? 0) + 1);
    const previousTarget = cell.targetId;
    cell.targetId = target?.id ?? null;
    const index = Math.max(0, active.findIndex(value => value.id === cell.id));
    const orbit = index / Math.max(1, active.length) * Math.PI * 2;
    const destination = target ?? { x: beacon.x + Math.cos(orbit) * 38, y: beacon.y + Math.sin(orbit) * 38 };
    const reach = target ? target.radius + cell.radius + IMMUNE_CELL_BALANCE.biteReach : 5;
    const gap = distance(cell, destination);
    const direction = normalized(destination.x - cell.x, destination.y - cell.y);
    if (direction.x || direction.y) cell.facing = Math.atan2(direction.y, direction.x);
    const blocked = target ? wallHit(cell, direction, gap, context.geometry) : null;
    const canBite = !!target && gap <= reach && (blocked === null || blocked >= gap - target.radius);
    if (!canBite && gap > (target ? Math.max(1, reach - 5) : 5)) {
      if (!cell.waypoint || previousTarget !== cell.targetId || context.elapsed >= cell.navigationAt || distance(cell, cell.waypoint) < 10) {
        cell.waypoint = context.geometry ? nextWaypoint(cell, destination, context.geometry, cell.radius) : point(destination);
        cell.navigationAt = context.elapsed + IMMUNE_CELL_BALANCE.navigationInterval;
      }
      const steering = normalized(cell.waypoint.x - cell.x, cell.waypoint.y - cell.y);
      const travel = Math.min(IMMUNE_CELL_BALANCE.speed * delta, distance(cell, cell.waypoint));
      const position = moveWithCollision(cell, { x: steering.x * travel, y: steering.y * travel }, cell.radius, context.geometry);
      cell.x = position.x; cell.y = position.y;
      if (steering.x || steering.y) cell.facing = Math.atan2(steering.y, steering.x);
      cell.activity = target ? 'seeking' : 'returning';
    } else cell.activity = context.elapsed < cell.attackUntil ? 'biting' : 'guarding';
    if (!canBite || !target || context.elapsed + 1e-9 < cell.attackReadyAt || delta === 0) continue;
    cell.attackReadyAt = context.elapsed + cell.interval;
    cell.attackUntil = context.elapsed + IMMUNE_CELL_BALANCE.attackPose;
    cell.activity = 'biting';
    const amount = Math.min(cell.damage, remainingHp.get(target.id) ?? target.hp);
    remainingHp.set(target.id, Math.max(0, (remainingHp.get(target.id) ?? target.hp) - amount));
    const rootId = `${cell.id}:bite:${context.tick}`, base = { protocolId: 'IMMUNE_BEACON' as const, rootId, organId: context.organId };
    commands.push({ ...base, kind: 'effect', effect: 'hit', from: point(cell), to: point(target), radius: target.radius + 4, duration: .2 },
      { ...base, kind: 'damage', targetId: target.id, amount, cause: 'protocol', hop: 0 },
      { kind: 'log', type: beacon.mode === 'patrol' ? 'IMMUNE_PATROL_HIT' : 'PROTOCOL_BEACON_HIT', data: {
        protocolId: beacon.mode === 'patrol' ? 'BASE_PATROL' : 'IMMUNE_BEACON', rootId, cellId: cell.id, targetId: target.id,
        damage: amount, prioritizedTrace: traced.has(target.id), x: cell.x, y: cell.y,
      } });
    if (traced.has(target.id)) commands.push({ kind: 'log', type: 'PROTOCOL_SYNERGY', data: { pair: 'EXPOSE_TRACE+IMMUNE_BEACON', rootId, cellId: cell.id, targetId: target.id } });
  }
  return { cells: active, commands };
}
