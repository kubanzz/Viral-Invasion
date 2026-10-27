import { distance, moveWithCollision, normalized, wallHit } from '../actors/collision';
import type { OrganId } from './battleTypes';
import type { BeaconState, GrowthCommand, GrowthContext } from './growthTypes';
import { WORLD, type Target, type Vec, type WorldGeometry } from './types';
import { activeImmuneFocusTarget } from './immuneFocus';

export const IMMUNE_CELL_BALANCE = { maximum: 3, radius: 15, speed: 190, biteReach: 9, attackPose: .24, navigationInterval: .35 } as const;

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
    // Collision can leave a cell exactly tangent to a fold. A larger clearance
    // here would reject every outgoing segment from that legal starting point.
    return Math.hypot(from.x + dx * t - obstacle.x, from.y + dy * t - obstacle.y) >= obstacle.radius + radius - 1e-7;
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

function validPosition(position: Vec, radius: number, geometry: WorldGeometry = WORLD): boolean {
  return position.x >= geometry.bounds.left + radius - 1e-7 && position.x <= geometry.bounds.right - radius + 1e-7
    && position.y >= geometry.bounds.top + radius - 1e-7 && position.y <= geometry.bounds.bottom - radius + 1e-7
    && geometry.obstacles.every(obstacle => distance(position, obstacle) >= obstacle.radius + radius - 1e-7);
}

function contact(position: Vec, radius: number, target: Target, geometry?: WorldGeometry): boolean {
  const gap = distance(position, target);
  if (gap > target.radius + radius + IMMUNE_CELL_BALANCE.biteReach + 1e-7) return false;
  const blocked = wallHit(position, normalized(target.x - position.x, target.y - position.y), gap, geometry);
  return blocked === null || blocked >= gap - target.radius;
}

/** Different cell IDs keep different real approach positions, even for coincident enemies. */
function contactPosition(cell: ImmuneCellState, target: Target, index: number, count: number, beacon: CellBeacon,
  geometry: WorldGeometry | undefined, reserved: { position: Vec; radius: number }[]): Vec | null {
  const angle = Math.atan2(beacon.y - target.y, beacon.x - target.x) + index / count * Math.PI * 2;
  const ring = target.radius + cell.radius + 3;
  const preferred = { x: target.x + Math.cos(angle) * ring, y: target.y + Math.sin(angle) * ring };
  let best: Vec | null = null, bestScore = Infinity;
  // A fixed candidate set permits partial surround at walls/corners. There is no
  // search for an impossible full ring, and no movement/teleport to these seats.
  for (const radius of [ring, Math.max(cell.radius, ring - 8)]) for (let step = 0; step < 24; step++) {
    const offset = step === 0 ? 0 : Math.ceil(step / 2) * (step % 2 ? 1 : -1) * Math.PI / 12;
    const raw = { x: target.x + Math.cos(angle + offset) * radius, y: target.y + Math.sin(angle + offset) * radius };
    const candidate = moveWithCollision(raw, { x: 0, y: 0 }, cell.radius, geometry);
    if (!validPosition(candidate, cell.radius, geometry) || !contact(candidate, cell.radius, target, geometry)) continue;
    const crowded = reserved.reduce((sum, other) => sum + Math.max(0, cell.radius + other.radius + 3 - distance(candidate, other.position)), 0);
    const blockedApproach = segmentClear(cell, candidate, geometry ?? WORLD, cell.radius) ? 0 : 1000;
    const score = crowded * 100 + blockedApproach + distance(candidate, preferred) + distance(cell, candidate) * .05;
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

/** Soft separation shares the normal movement budget and only moves this cell. */
function moveCell(cell: ImmuneCellState, waypoint: Vec, squad: readonly ImmuneCellState[], index: number,
  delta: number, geometry?: WorldGeometry): void {
  const limit = IMMUNE_CELL_BALANCE.speed * delta;
  if (limit <= 0) return;
  const toward = normalized(waypoint.x - cell.x, waypoint.y - cell.y), travel = Math.min(limit, distance(cell, waypoint));
  const approach = { x: toward.x * travel, y: toward.y * travel };
  const separation = { x: 0, y: 0 };
  for (const other of squad) if (other.id !== cell.id) {
    const gap = distance(cell, other), minimum = cell.radius + other.radius + 3;
    if (gap >= minimum) continue;
    const angle = index / squad.length * Math.PI * 2;
    const away = gap > 1e-7 ? normalized(cell.x - other.x, cell.y - other.y) : { x: Math.cos(angle), y: Math.sin(angle) };
    const weight = (minimum - gap) / minimum;
    separation.x += away.x * weight * limit; separation.y += away.y * weight * limit;
  }
  const score = (position: Vec) => distance(position, waypoint) + squad.reduce((sum, other) => other.id === cell.id ? sum
    : sum + Math.max(0, cell.radius + other.radius + 3 - distance(position, other)) * 3, 0);
  let best = point(cell), bestScore = score(cell);
  for (const motion of [{ x: approach.x + separation.x * 1.5, y: approach.y + separation.y * 1.5 }, approach, separation]) {
    const length = Math.hypot(motion.x, motion.y), factor = length > limit ? limit / length : 1;
    const candidate = moveWithCollision(cell, { x: motion.x * factor, y: motion.y * factor }, cell.radius, geometry);
    // Collision projection followed by a bounds clamp can invalidate a point
    // between overlapping footprints. Keep the previous position in that case.
    if (!validPosition(candidate, cell.radius, geometry) || distance(cell, candidate) > limit + 1e-7) continue;
    const value = score(candidate);
    if (value < bestScore - 1e-7) { best = candidate; bestScore = value; }
  }
  cell.x = best.x; cell.y = best.y;
}

/** One fixed-update movement and at most one bite per unit; no timer catch-up bursts. */
export function advanceImmuneCells(cells: readonly ImmuneCellState[], beacon: CellBeacon | null, context: GrowthContext, traceIds: readonly string[] = []): { cells: ImmuneCellState[]; commands: GrowthCommand[] } {
  if (!context.active) return { cells: cells.map(cell => ({ ...cell, waypoint: cell.waypoint && point(cell.waypoint) })), commands: [] };
  if (!beacon || beacon.until <= context.elapsed || beacon.organId !== context.organId) return { cells: [], commands: [] };
  const active = cells.filter(cell => cell.beaconId === beacon.id && cell.organId === context.organId && cell.until > context.elapsed)
    .slice().sort(stableId).slice(0, IMMUNE_CELL_BALANCE.maximum).map(cell => ({ ...cell, waypoint: cell.waypoint && point(cell.waypoint) }));
  const commands: GrowthCommand[] = [], assigned = new Map<string, number>();
  const reserved: { position: Vec; radius: number }[] = [];
  const remainingHp = new Map(context.targets.map(target => [target.id, target.hp]));
  const traced = new Set(beacon.mode === 'patrol' ? [] : traceIds);
  const focus = activeImmuneFocusTarget(beacon, context);
  for (const cell of active) {
    const delta = Math.max(0, Math.min(1 / 60, context.elapsed - cell.updatedAt));
    cell.updatedAt = context.elapsed;
    const previousTarget = cell.targetId;
    const index = Math.max(0, active.findIndex(value => value.id === cell.id));
    // A command can override automatic priorities, never physical reachability.
    // Reuse a still-valid navigation leg rather than solving the same route each tick.
    const focusSeat = focus && (remainingHp.get(focus.id) ?? focus.hp) > 0
      ? contactPosition(cell, focus, index, active.length, beacon, context.geometry, reserved) : null;
    const cachedRoute = focus && previousTarget === focus.id && cell.waypoint && context.elapsed < cell.navigationAt
      && distance(cell, cell.waypoint) > 1e-7 && segmentClear(cell, cell.waypoint, context.geometry ?? WORLD, cell.radius);
    const focusRoute = focusSeat && !cachedRoute && !contact(cell, cell.radius, focus!, context.geometry)
      ? nextWaypoint(cell, focusSeat, context.geometry ?? WORLD, cell.radius) : null;
    const canFocus = !!focus && !!focusSeat && (contact(cell, cell.radius, focus, context.geometry)
      || !!cachedRoute || !!focusRoute && distance(cell, focusRoute) > 1e-7);
    const target = canFocus ? focus : chooseTarget(cell, beacon, context, traced, assigned, remainingHp);
    if (target) assigned.set(target.id, (assigned.get(target.id) ?? 0) + 1);
    cell.targetId = target?.id ?? null;
    const orbit = index / Math.max(1, active.length) * Math.PI * 2;
    const seat = canFocus ? focusSeat : target && active.length > 1 ? contactPosition(cell, target, index, active.length, beacon, context.geometry, reserved) : null;
    if (seat) reserved.push({ position: seat, radius: cell.radius });
    const destination = seat ?? target ?? { x: beacon.x + Math.cos(orbit) * 38, y: beacon.y + Math.sin(orbit) * 38 };
    const reach = target ? target.radius + cell.radius + IMMUNE_CELL_BALANCE.biteReach : 5;
    const gap = distance(cell, destination);
    const direction = normalized(destination.x - cell.x, destination.y - cell.y);
    if (direction.x || direction.y) cell.facing = Math.atan2(direction.y, direction.x);
    const wasTouching = !!target && contact(cell, cell.radius, target, context.geometry);
    if (seat ? gap > 3 : !wasTouching && gap > (target ? Math.max(1, reach - 5) : 5)) {
      if (!cell.waypoint || previousTarget !== cell.targetId || context.elapsed >= cell.navigationAt || distance(cell, cell.waypoint) < 10) {
        cell.waypoint = canFocus && focusRoute ? focusRoute
          : context.geometry ? nextWaypoint(cell, destination, context.geometry, cell.radius) : point(destination);
        cell.navigationAt = context.elapsed + IMMUNE_CELL_BALANCE.navigationInterval;
      }
      moveCell(cell, cell.waypoint, active, index, delta, context.geometry);
      cell.activity = target ? 'seeking' : 'returning';
    } else {
      moveCell(cell, point(cell), active, index, delta, context.geometry);
      cell.activity = context.elapsed < cell.attackUntil ? 'biting' : 'guarding';
    }
    // Later cells never push an already-settled cell. Contact, LOS and event
    // coordinates therefore describe its final simulated position this frame.
    const canBite = !!target && contact(cell, cell.radius, target, context.geometry);
    if (target) cell.facing = Math.atan2(target.y - cell.y, target.x - cell.x);
    if (!canBite || !target || context.elapsed + 1e-9 < cell.attackReadyAt || delta === 0) continue;
    cell.attackReadyAt = context.elapsed + cell.interval;
    cell.attackUntil = context.elapsed + IMMUNE_CELL_BALANCE.attackPose;
    cell.activity = 'biting';
    const amount = Math.min(cell.damage, remainingHp.get(target.id) ?? target.hp);
    remainingHp.set(target.id, Math.max(0, (remainingHp.get(target.id) ?? target.hp) - amount));
    const rootId = `${cell.id}:bite:${context.tick}`, base = { protocolId: 'IMMUNE_BEACON' as const, rootId, organId: context.organId };
    commands.push({ ...base, kind: 'effect', effect: 'hit', from: point(cell), to: point(target), radius: target.radius + 4, duration: .2 },
      { ...base, kind: 'damage', targetId: target.id, amount, cause: 'protocol', hop: 0, immuneCellId: cell.id },
      { kind: 'log', type: beacon.mode === 'patrol' ? 'IMMUNE_PATROL_HIT' : 'PROTOCOL_BEACON_HIT', data: {
        protocolId: beacon.mode === 'patrol' ? 'BASE_PATROL' : 'IMMUNE_BEACON', rootId, cellId: cell.id, targetId: target.id,
        damage: amount, prioritizedTrace: traced.has(target.id), x: cell.x, y: cell.y,
        ...(beacon.focus ? { prioritizedFocus: canFocus && target.id === focus?.id, focusTargetId: beacon.focus.targetId } : {}),
      } });
    if (traced.has(target.id)) commands.push({ kind: 'log', type: 'PROTOCOL_SYNERGY', data: { pair: 'EXPOSE_TRACE+IMMUNE_BEACON', rootId, cellId: cell.id, targetId: target.id } });
  }
  return { cells: active, commands };
}
