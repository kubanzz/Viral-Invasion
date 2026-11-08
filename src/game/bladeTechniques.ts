import { distance, isLegalPosition, moveWithCollision, normalized, wallHit } from '../actors/collision';
import { createEndlessGrowth, endlessCombatStats } from './endlessGrowth';
import { weaponCombatProfile } from './expedition';
import type { DamageOrigin } from './growthTypes';
import type { PlayerProjectileHost } from './playerProjectiles';
import { activeWorld, BALANCE, type GameState, type Target, type Vec, type WorldGeometry } from './types';
import { visibleWeaponTargets, weaponCombatAvailable, weaponOrigin, weaponRadialDamage, weaponSweep } from './weaponMelee';
import type { BladeTraceState } from './weaponSkillsTypes';
import { damageRitualProjectile } from './ritual';

export const BLADE_TECHNIQUES = {
  parry: { duration: .45, perfect: .18, perfectFactor: 6, counterFactor: 3.5, missFactor: 2, range: 320, cooldown: 8 },
  domain: { duration: 1.8, radius: 220, interval: .6, pulseFactor: 1.2, finalFactor: 2.4, cooldown: 14 },
  trace: { drawSeconds: 3, windup: .65, range: 650, speed: 1800, minimumExecution: .72, maximumExecution: 1.2, recovery: .3,
    width: 88, manualWidth: 110, impactRadius: 130, manualImpactRadius: 160,
    bossFactor: 10, eliteFactor: 18, collateralFactor: 12, manualBonus: 1.35, toughness: 25,
    maximumPathPoints: 128, maximumRoutePoints: 256 },
} as const;
const finite = (point: Vec) => Number.isFinite(point.x) && Number.isFinite(point.y);
const copy = (point: Vec): Vec => ({ x: point.x, y: point.y });
function segmentPoint(point: Vec, from: Vec, to: Vec): Vec {
  const dx = to.x - from.x, dy = to.y - from.y, square = dx * dx + dy * dy;
  const t = square ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / square)) : 0;
  return { x: from.x + dx * t, y: from.y + dy * t };
}
function segmentDistance(point: Vec, from: Vec, to: Vec): number {
  return distance(point, segmentPoint(point, from, to));
}
function visibleFrom(state: GameState, from: Vec, target: Target): boolean {
  const gap = distance(from, target), block = wallHit(from, normalized(target.x - from.x, target.y - from.y), gap, activeWorld(state));
  return block === null || block >= gap - target.radius - 1e-7;
}
/** Swept player footprint, shared by the preview and the authoritative route. */
function clearSegment(from: Vec, to: Vec, radius: number, world: WorldGeometry): boolean {
  return isLegalPosition(from, radius, world) && isLegalPosition(to, radius, world)
    && world.obstacles.every(obstacle => segmentDistance(obstacle, from, to) >= obstacle.radius + radius - 1e-6);
}
/** A bounded visibility graph keeps a drawn leg around solid folds, never through them. */
export function bladeRouteBetween(from: Vec, goal: Vec, radius: number, world: WorldGeometry): Vec[] {
  const to = moveWithCollision(goal, { x: 0, y: 0 }, radius, world);
  if (clearSegment(from, to, radius, world)) return [copy(to)];
  if (!isLegalPosition(from, radius, world) || !isLegalPosition(to, radius, world)) return [];
  const nodes: Vec[] = [copy(from), to];
  for (const obstacle of world.obstacles) {
    const r = (obstacle.radius + radius + 1) / Math.cos(Math.PI / 16);
    for (let n = 0; n < 16 && nodes.length < 162; n++) {
      const angle = n * Math.PI / 8, point = { x: obstacle.x + Math.cos(angle) * r, y: obstacle.y + Math.sin(angle) * r };
      if (isLegalPosition(point, radius, world)) nodes.push(point);
    }
  }
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>(); costs[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    let current = -1;
    for (let n = 0; n < nodes.length; n++) if (!visited.has(n) && Number.isFinite(costs[n]) && (current < 0 || costs[n] < costs[current])) current = n;
    if (current < 0 || current === 1) break;
    visited.add(current);
    for (let n = 1; n < nodes.length; n++) if (!visited.has(n) && clearSegment(nodes[current], nodes[n], radius, world)) {
      const cost = costs[current] + distance(nodes[current], nodes[n]);
      if (cost < costs[n]) { costs[n] = cost; previous[n] = current; }
    }
  }
  if (!Number.isFinite(costs[1])) return [];
  const route: Vec[] = []; for (let n = 1; n > 0; n = previous[n]) route.push(copy(nodes[n]));
  return route.reverse();
}
function baseDamage(state: GameState): number {
  return weaponCombatProfile(state.weaponCombat!.loadout, endlessCombatStats(state.endlessGrowth ?? createEndlessGrowth(0)).damageMultiplier).primaryDamage;
}
export function bladeControlsLocked(state: GameState): boolean {
  return ['windup', 'executing'].includes(state.weaponCombat?.bladeTrace?.phase ?? '');
}
export function bladeEnemyMovementFactor(state: GameState, target: Target): number {
  const trace = state.weaponCombat?.bladeTrace;
  if (trace && ['drawing', 'windup', 'executing'].includes(trace.phase)
    && trace.marks.some(mark => mark.targetId === target.id && mark.connected)) return 0;
  return trace?.phase === 'drawing' && state.phase === 'playing' && target.hp > 0
    && distance(state.player, target) <= BLADE_TECHNIQUES.trace.range + target.radius ? .2 : 1;
}
export function beginBladeTrace(host: PlayerProjectileHost, castId: string): boolean {
  const state = host.state, runtime = state.weaponCombat!;
  const candidates = visibleWeaponTargets(state, state.player, BLADE_TECHNIQUES.trace.range)
    .filter(target => target.role === undefined || ['virus', 'elite', 'core'].includes(target.role));
  const chosen: Target[] = [];
  while (candidates.length && chosen.length < 4) {
    candidates.sort((a, b) => chosen.length
      ? Math.min(...chosen.map(body => distance(b, body))) - Math.min(...chosen.map(body => distance(a, body))) || a.id.localeCompare(b.id)
      : distance(state.player, a) - distance(state.player, b) || a.id.localeCompare(b.id));
    const target = candidates.shift()!;
    if (bladeRouteBetween(state.player, target, state.player.radius, activeWorld(state)).length) chosen.push(target);
  }
  if (!chosen.length) return false;
  const marks = Array.from({ length: 4 }, (_, index) => {
    const target = chosen[index % chosen.length], copies = Math.ceil((4 - (index % chosen.length)) / chosen.length);
    const ordinal = Math.floor(index / chosen.length), angle = ordinal * Math.PI * 2 / copies - Math.PI / 2;
    const offset = copies > 1 ? Math.max(24, target.radius * .8) : 0;
    const point = moveWithCollision({ x: target.x + Math.cos(angle) * offset, y: target.y + Math.sin(angle) * offset }, { x: 0, y: 0 }, state.player.radius, activeWorld(state));
    return { id: index, targetId: target.id, x: point.x, y: point.y, connected: false, resolved: false,
      offset: { x: point.x - target.x, y: point.y - target.y } };
  });
  const balance = BLADE_TECHNIQUES.trace;
  runtime.bladeTrace = { castId, phase: 'drawing', startedAt: state.elapsed, deadline: state.elapsed + balance.drawSeconds,
    until: state.elapsed + balance.drawSeconds + balance.windup + balance.maximumExecution + balance.recovery,
    damage: baseDamage(state), marks, path: [copy(state.player)], route: [], routeIndex: 0, lastAt: state.elapsed,
    manual: false, hitIds: [], elapsedDistance: 0, speed: BLADE_TECHNIQUES.trace.speed };
  runtime.primaryBlockedUntil = runtime.bladeTrace.until;
  return true;
}
function appendLeg(state: GameState, trace: BladeTraceState, point: Vec): boolean {
  const from = trace.path.at(-1)!;
  const route = bladeRouteBetween(from, point, state.player.radius, activeWorld(state));
  if (!route.length || trace.path.length + route.length > BLADE_TECHNIQUES.trace.maximumPathPoints) return false;
  trace.path.push(...route); return true;
}
export interface BladeTraceInput { points: Vec[]; released?: boolean; tolerance?: number }
/** Called before advanceWeaponSkills. Input samples describe the displayed world projection. */
export function applyBladeTraceInput(state: GameState, input?: BladeTraceInput): void {
  const trace = state.weaponCombat?.bladeTrace;
  if (!trace || trace.phase !== 'drawing' || state.phase !== 'playing' || !input || state.elapsed > trace.deadline + 1e-8) return;
  const tolerance = Math.max(12, Math.min(90, input.tolerance ?? 24));
  for (const sample of input.points.slice(0, BLADE_TECHNIQUES.trace.maximumPathPoints)) {
    if (!finite(sample) || distance(trace.path[0], sample) > 1100 || trace.path.length >= BLADE_TECHNIQUES.trace.maximumPathPoints) continue;
    const from = trace.path.at(-1)!;
    // Connect in the actual order encountered along the pointer segment.
    const nearby = trace.marks.filter(mark => !mark.connected && segmentDistance(mark, from, sample) <= tolerance)
      .sort((a, b) => distance(from, a) - distance(from, b));
    for (const mark of nearby) if (appendLeg(state, trace, mark)) {
      mark.connected = true;
      traceEvent(state, 'BLADE_TRACE_MARK_CONNECTED', { castId: trace.castId, mark: mark.id, targetId: mark.targetId,
        x: mark.x, y: mark.y, manual: true });
    }
    if (distance(trace.path.at(-1)!, sample) >= 6 && trace.path.length < BLADE_TECHNIQUES.trace.maximumPathPoints) appendLeg(state, trace, sample);
    if (trace.marks.every(mark => mark.connected)) { trace.manual = true; commitTrace(state, trace); break; }
  }
}
function traceEvent(state: GameState, type: string, data: Parameters<PlayerProjectileHost['emit']>[1]): void {
  // The disposable trial may advance partial simulation steps; use the same
  // exact receipt timestamp as its host.emit rather than its integer step count.
  state.events.push({ type, data, tick: state.elapsed / BALANCE.step });
  if (state.events.length > 512) state.events.shift();
}
function commitTrace(state: GameState, trace: BladeTraceState, emit: PlayerProjectileHost['emit'] = (type, data) => traceEvent(state, type, data)): void {
  while (trace.marks.some(mark => !mark.connected)) {
    const from = trace.path.at(-1)!, mark = trace.marks.filter(mark => !mark.connected)
      .sort((a, b) => distance(from, a) - distance(from, b) || a.id - b.id)[0];
    // Already validated target anchors can become unreachable only after world replacement.
    if (!appendLeg(state, trace, mark)) { mark.resolved = true; mark.connected = true; continue; }
    mark.connected = true;
    emit('BLADE_TRACE_MARK_CONNECTED', { castId: trace.castId, mark: mark.id, targetId: mark.targetId,
      x: mark.x, y: mark.y, manual: false });
  }
  const prefix = bladeRouteBetween(state.player, trace.path[0], state.player.radius, activeWorld(state));
  // Never skip visibility-graph corners to fit the presentation budget. An
  // extreme overflow retains a legal prefix and cannot hit unreached marks.
  trace.route = [copy(state.player), ...prefix, ...trace.path.slice(1)].slice(0, BLADE_TECHNIQUES.trace.maximumRoutePoints);
  trace.routeIndex = 1;
  const length = trace.route.reduce((sum, point, n) => sum + (n ? distance(trace.route[n - 1], point) : 0), 0);
  const balance = BLADE_TECHNIQUES.trace;
  trace.executionDuration = Math.max(balance.minimumExecution, Math.min(balance.maximumExecution, length / balance.speed));
  trace.speed = length / trace.executionDuration;
  trace.phase = 'windup'; trace.lastAt = state.elapsed; trace.windupStartedAt = state.elapsed; trace.until = state.elapsed + balance.windup;
  state.weaponCombat!.primaryBlockedUntil = trace.until + trace.executionDuration + balance.recovery;
  emit('BLADE_TRACE_COMMITTED', { castId: trace.castId, x: state.player.x, y: state.player.y, until: trace.until,
    manual: trace.manual, width: trace.manual ? balance.manualWidth : balance.width,
    radius: trace.manual ? balance.manualImpactRadius : balance.impactRadius,
    impactRadius: trace.manual ? balance.manualImpactRadius : balance.impactRadius, markCount: trace.marks.length });
}
function traceHit(host: PlayerProjectileHost, trace: BladeTraceState, from: Vec, to: Vec): void {
  const state = host.state, balance = BLADE_TECHNIQUES.trace, factor = trace.manual ? balance.manualBonus : 1;
  const width = trace.manual ? balance.manualWidth : balance.width;
  const radius = trace.manual ? balance.manualImpactRadius : balance.impactRadius;
  const markedIds = new Set(trace.marks.map(mark => mark.targetId));
  const valid = () => host.state === state && state.phase === 'playing' && state.weaponCombat?.bladeTrace === trace;
  const collateral = (targets: Target[]) => {
    for (const target of targets) {
      if (target.hp <= 0 || markedIds.has(target.id) || trace.hitIds.includes(target.id) || target.role === 'event' || target.role === 'capsule') continue;
      // A cast owns one collateral receipt per body, across its entire route and all four impacts.
      trace.hitIds.push(target.id);
      host.damage(target, trace.damage * balance.collateralFactor * factor, weaponOrigin(state, 'redblade-ultimate', trace.castId));
      if (!valid()) return;
    }
  };
  collateral(state.targets.filter(target => segmentDistance(target, from, to) <= target.radius + width
    && visibleFrom(state, segmentPoint(target, from, to), target)));
  if (!valid()) return;
  for (const mark of trace.marks) {
    if (mark.resolved || segmentDistance(mark, from, to) > 1e-4) continue;
    mark.resolved = true;
    host.emit('BLADE_TRACE_IMPACT', { castId: trace.castId, targetId: mark.targetId, mark: mark.id,
      x: mark.x, y: mark.y, radius, manual: trace.manual });
    if (!valid()) return;
    const target = state.targets.find(body => body.id === mark.targetId && body.hp > 0);
    if (target) {
      const ordinary = target.role === 'virus' || target.role === undefined;
      const damage = ordinary ? target.hp : trace.damage * factor * (target.role === 'core' ? balance.bossFactor : balance.eliteFactor);
      const origin: DamageOrigin = { ...weaponOrigin(state, 'redblade-ultimate', trace.castId),
        ...(ordinary ? { execution: 'ordinary' as const } : {}), toughnessDamage: target.role === 'core' ? balance.toughness * factor : 0 };
      const actual = host.damage(target, damage, origin);
      if (!valid()) return;
      host.emit('BLADE_TRACE_HIT', { castId: trace.castId, targetId: target.id, mark: mark.id, damage: actual,
        x: target.x, y: target.y, killed: target.hp <= 0, manual: trace.manual });
      if (!valid()) return;
    }
    collateral(visibleWeaponTargets(state, mark, radius));
    if (!valid()) return;
  }
}
function counter(host: PlayerProjectileHost, perfect: boolean, missed = false): void {
  const state = host.state, parry = state.weaponCombat?.bladeParry;
  if (!parry || parry.resolved) return;
  parry.resolved = true;
  const factor = missed ? 2 : perfect ? 6 : 3.5;
  host.emit('BLADE_PARRY_COUNTER', { castId: parry.castId, perfect, missed, x: state.player.x, y: state.player.y,
    aimX: state.player.x + parry.direction.x * 320, aimY: state.player.y + parry.direction.y * 320 });
  const origin: DamageOrigin = { ...weaponOrigin(state, 'redblade-parry', parry.castId), toughnessDamage: missed ? 0 : perfect ? 40 : 20 };
  weaponSweep(host, state.player, parry.direction, 320, .24, parry.damage * factor, origin);
  state.weaponCombat!.primaryBlockedUntil = Math.min(state.weaponCombat!.primaryBlockedUntil, state.elapsed + .12);
}
/** Resolve before all player HP writes. This does not apply the other weapon mitigations. */
export function resolveBladeIncomingDamage(host: PlayerProjectileHost, amount: number,
  attack: { source?: Vec; id?: string; reflectable?: boolean } = {}): number {
  const state = host.state;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (bladeControlsLocked(state)) return 0;
  const parry = state.weaponCombat?.bladeParry;
  if (!parry || parry.resolved || state.elapsed > parry.until || !weaponCombatAvailable(state)) return amount;
  if (!attack.source || !finite(attack.source)) return amount;
  if (attack.source) {
    const direction = normalized(attack.source.x - state.player.x, attack.source.y - state.player.y);
    if (direction.x * parry.direction.x + direction.y * parry.direction.y < -1e-8) return amount;
  }
  const perfect = state.elapsed <= parry.startedAt + .18 + 1e-8;
  host.emit('BLADE_PARRIED', { castId: parry.castId, attackId: attack.id ?? '', perfect, reflected: !!attack.reflectable,
    x: state.player.x, y: state.player.y });
  counter(host, perfect); return perfect ? 0 : amount * .25;
}
export function advanceBladeTechniques(host: PlayerProjectileHost): void {
  const state = host.state, runtime = state.weaponCombat;
  if (!runtime) return;
  if (!weaponCombatAvailable(state)) {
    if (state.phase !== 'paused' && (state.phase !== 'playing' || state.player.hp <= 0 || state.tissue.hp <= 0)) {
      const castId = runtime.bladeTrace?.castId;
      delete runtime.bladeTrace;
      if (castId && runtime.ultimate?.castId === castId) delete runtime.ultimate;
      runtime.primaryBlockedUntil = Math.min(runtime.primaryBlockedUntil, state.elapsed);
    }
    return;
  }
  const parry = runtime.bladeParry;
  if (parry && !parry.resolved && state.elapsed <= parry.until) {
    const orb = state.smartViruses?.ritual?.projectiles.find(body => body.phase === 'flight' && body.hp > 0 && distance(body, state.player) <= 80 + body.radius
      && (body.x - state.player.x) * parry.direction.x + (body.y - state.player.y) * parry.direction.y >= 0);
    if (orb) {
      damageRitualProjectile(state, orb.id, orb.hp, (type, data) => host.emit(type, data));
      resolveBladeIncomingDamage(host, 1, { source: orb, id: orb.id, reflectable: true });
    }
  }
  if (runtime.bladeParry && !runtime.bladeParry.resolved && state.elapsed + 1e-8 >= runtime.bladeParry.until) counter(host, false, true);
  if (runtime.bladeParry && state.elapsed >= runtime.bladeParry.until + .12) delete runtime.bladeParry;
  const domain = runtime.bladeDomain;
  while (domain && runtime.bladeDomain === domain && state.elapsed + 1e-8 >= domain.startedAt + domain.next * .6) {
    const final = domain.next >= 3; domain.next++;
    host.emit('BLADE_DOMAIN_PULSE', { castId: domain.castId, x: state.player.x, y: state.player.y, radius: 220, final, index: domain.next });
    weaponRadialDamage(host, state.player, 220, domain.damage * (final ? 2.4 : 1.2), weaponOrigin(state, 'redblade-domain', domain.castId));
    if (final) delete runtime.bladeDomain;
    if (host.state !== state || state.phase !== 'playing') return;
  }
  const trace = runtime.bladeTrace; if (!trace) return;
  if (trace.phase === 'drawing') for (const mark of trace.marks) if (!mark.connected) {
    const target = state.targets.find(body => body.id === mark.targetId && body.hp > 0);
    if (target && mark.offset) {
      const point = moveWithCollision({ x: target.x + mark.offset.x, y: target.y + mark.offset.y }, { x: 0, y: 0 }, state.player.radius, activeWorld(state));
      mark.x = point.x; mark.y = point.y;
    }
  }
  const balance = BLADE_TECHNIQUES.trace;
  if (trace.phase === 'drawing' && state.elapsed + 1e-8 >= trace.deadline) commitTrace(state, trace, (type, data) => host.emit(type, data));
  if (host.state !== state || state.phase !== 'playing' || runtime.bladeTrace !== trace) return;
  if (trace.phase === 'windup' && state.elapsed + 1e-8 >= trace.until) {
    trace.executionStartedAt = trace.until;
    trace.lastAt = trace.until;
    trace.until = trace.executionStartedAt + (trace.executionDuration ?? balance.minimumExecution);
    trace.phase = 'executing';
    runtime.primaryBlockedUntil = trace.until + balance.recovery;
    host.emit('BLADE_TRACE_RELEASED', { castId: trace.castId, x: state.player.x, y: state.player.y, until: trace.until,
      manual: trace.manual, width: trace.manual ? balance.manualWidth : balance.width,
      radius: trace.manual ? balance.manualImpactRadius : balance.impactRadius,
      impactRadius: trace.manual ? balance.manualImpactRadius : balance.impactRadius, markCount: trace.marks.length });
    if (host.state !== state || state.phase !== 'playing' || runtime.bladeTrace !== trace) return;
  }
  if (trace.phase === 'executing') {
    if (trace.lastAt === state.elapsed) return;
    const through = Math.min(state.elapsed, trace.until);
    let budget = Math.max(0, through - trace.lastAt) * trace.speed; trace.lastAt = through;
    while (trace.routeIndex < trace.route.length && budget > 1e-8) {
      const from = copy(state.player), goal = trace.route[trace.routeIndex], gap = distance(from, goal), travel = Math.min(gap, budget);
      const direction = normalized(goal.x - from.x, goal.y - from.y);
      const to = moveWithCollision(from, { x: direction.x * travel, y: direction.y * travel }, state.player.radius, activeWorld(state));
      Object.assign(state.player, to); state.player.facing = Math.atan2(direction.y, direction.x);
      traceHit(host, trace, from, to); if (host.state !== state || state.phase !== 'playing' || runtime.bladeTrace !== trace) return;
      host.emit('BLADE_TRACE_SEGMENT', { castId: trace.castId, fromX: from.x, fromY: from.y, x: to.x, y: to.y, manual: trace.manual });
      trace.elapsedDistance += distance(from, to); budget -= travel;
      if (gap <= travel + 1e-7) trace.routeIndex++;
      else if (distance(from, to) < travel - 1e-4) { trace.routeIndex++; } // A changed fold cannot cause a stuck loop.
    }
    if (state.elapsed + 1e-8 >= trace.until) {
      trace.phase = 'recovery'; trace.until = state.elapsed + balance.recovery; runtime.primaryBlockedUntil = trace.until;
      host.emit('BLADE_TRACE_FINISHED', { castId: trace.castId, x: state.player.x, y: state.player.y, until: trace.until,
        manual: trace.manual });
    }
  } else if (trace.phase === 'recovery' && state.elapsed + 1e-8 >= trace.until) {
    delete runtime.bladeTrace; if (runtime.ultimate?.castId === trace.castId) delete runtime.ultimate;
  }
}
