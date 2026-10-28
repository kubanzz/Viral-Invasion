import { distance, isLegalPosition, normalized, rayCircle } from '../actors/collision';
import { endlessPacing } from './endlessPacing';
import type { EndlessSourcePlan, EndlessSpawnRole } from './endlessTypes';
import { activeWorld, BALANCE, type GameEvent, type GameState, type Target, type Vec } from './types';
import type { ViralCapsuleCarrier, ViralCapsuleEnd, ViralCapsuleObjective, ViralCapsuleState } from './viralCapsulesTypes';

export const VIRAL_CAPSULE_BALANCE = {
  carrierWarning: .8, warning: .8, branchWarning: .45, speed: 220, range: 760, lifetime: 5,
  radius: 14, health: 20, branchRadius: 12, branchHealth: 12,
  maximumBodies: 4, maximumTransactions: 2, maximumPopulation: 24, maximumCommitments: 3,
} as const;
export interface ViralCapsuleHost {
  state: GameState;
  emit(type: string, data: GameEvent['data']): void;
  damagePlayer(target: Target, amount: number): boolean;
  damageTissue(target: Target, amount: number): boolean;
}
const point = (value: Vec): Vec => ({ x: value.x, y: value.y });
const active = (host: ViralCapsuleHost, state: GameState) => host.state === state && state.phase === 'playing' && state.player.hp > 0 && state.tissue.hp > 0;
const bodies = (state: GameState) => state.targets.filter(target => target.hp > 0 && target.role === 'capsule' && target.viralCapsule);

/** Original recipe slots only; a payload never expands the finite enemy queue. */
export function viralCapsulePlan(wave: number, roles: readonly EndlessSpawnRole[], source?: EndlessSourcePlan): { slot: number; objective: ViralCapsuleObjective; fork: boolean } | undefined {
  if (!Number.isSafeInteger(wave) || wave < 5) return;
  if (wave % 5 === 0 && roles[0] === 'elite') return { slot: 0, objective: 'player', fork: wave >= 15 };
  if (wave >= 6 && endlessPacing(wave).role === 'pressure' && roles[1] === 'ordinary' && !source?.quotaSlots.includes(1)) {
    return { slot: 1, objective: 'tissue', fork: wave >= 15 };
  }
  return;
}

export function makeViralCapsuleCarrier(id: string, wave: number, objective: ViralCapsuleObjective, fork: boolean): ViralCapsuleCarrier {
  return { transactionId: `${id}:payload:${wave}`, wave, objective, fork, stock: 1 };
}

export function viralCapsuleReservedPopulation(state: GameState): number {
  return state.targets.reduce((count, target) => count + (target.hp > 0
    ? target.role !== 'source' && target.role !== 'core' && target.role !== 'capsule' && target.traits?.includes('FISSION') && (target.generation ?? 0) === 0 ? 2 : 1
    : target.splitAt !== undefined ? target.splitPositions?.length ?? 2 : 0), 0);
}
function commitments(state: GameState): number {
  return state.targets.filter(target => target.hp > 0 && (target.role === 'capsule' || target.attackAt !== undefined || target.charge !== undefined)).length;
}
function capacityReason(state: GameState, transactionId: string): string | undefined {
  const live = bodies(state);
  if (live.length >= VIRAL_CAPSULE_BALANCE.maximumBodies) return 'capsule-cap';
  if (!live.some(target => target.viralCapsule!.transactionId === transactionId)
    && new Set(live.map(target => target.viralCapsule!.transactionId)).size >= VIRAL_CAPSULE_BALANCE.maximumTransactions) return 'transaction-cap';
  if (viralCapsuleReservedPopulation(state) >= VIRAL_CAPSULE_BALANCE.maximumPopulation) return 'population-cap';
  if (commitments(state) >= VIRAL_CAPSULE_BALANCE.maximumCommitments) return 'commitment-cap';
  return;
}
function retire(state: GameState, target: Target, reason: ViralCapsuleEnd): boolean {
  if (!target.viralCapsule || target.viralCapsule.terminalReason) return false;
  target.hp = 0; target.deadAt = state.elapsed; target.viralCapsule.terminalReason = reason;
  return true;
}
function termination(host: ViralCapsuleHost, target: Target): void {
  const capsule = target.viralCapsule!;
  host.emit('VIRAL_CAPSULE_TERMINATED', { id: target.id, transactionId: capsule.transactionId, carrierId: capsule.carrierId,
    wave: capsule.wave, objective: capsule.objective, reason: capsule.terminalReason!, x: target.x, y: target.y, generation: capsule.generation });
}
export function terminateViralCapsule(host: ViralCapsuleHost, target: Target, reason: ViralCapsuleEnd = 'intercepted'): void {
  if (retire(host.state, target, reason)) termination(host, target);
}

function capsuleBody(state: GameState, carrier: Target, info: ViralCapsuleCarrier, aim: Vec, secondaryAim?: Vec): Target {
  const direction = normalized(aim.x - carrier.x, aim.y - carrier.y), cycle = Math.floor((info.wave - 1) / 5);
  const range = Math.min(VIRAL_CAPSULE_BALANCE.range, Math.max(90, distance(carrier, aim) + 80));
  return { ...point(carrier), id: `${info.transactionId}:mother`, role: 'capsule', kind: 'single', radius: VIRAL_CAPSULE_BALANCE.radius,
    hp: VIRAL_CAPSULE_BALANCE.health, maxHp: VIRAL_CAPSULE_BALANCE.health, hitUntil: 0, scanned: false, traits: [],
    born: state.elapsed, generation: 0, sourceId: `endless:wave:${info.wave}`, facing: Math.atan2(direction.y, direction.x),
    viralCapsule: { transactionId: info.transactionId, carrierId: carrier.id, wave: info.wave, objective: info.objective,
      phase: 'warning', generation: 0, origin: point(carrier), aim: point(aim), ...(secondaryAim ? { secondaryAim: point(secondaryAim) } : {}), direction,
      speed: VIRAL_CAPSULE_BALANCE.speed, remainingRange: range, travelled: 0, ...(info.fork ? { splitAfter: Math.min(120, range * .4) } : {}),
      warningUntil: state.elapsed + VIRAL_CAPSULE_BALANCE.warning, expiresAt: state.elapsed + VIRAL_CAPSULE_BALANCE.lifetime,
      updatedAt: state.elapsed, playerDamage: Math.min(32, 12 + cycle * 2), tissueDamage: Math.min(20, 10 + cycle) } };
}

/** Both cast and death claim the same stock before any synchronous event. */
export function releaseViralCapsule(host: ViralCapsuleHost, carrier: Target, cause: 'cast' | 'death'): void {
  const state = host.state, info = carrier.viralCapsuleCarrier;
  if (!active(host, state) || !state.endless || !info || info.stock !== 1) return;
  const aim = point(info.aim ?? (info.objective === 'tissue' ? state.tissue : state.player));
  const secondary = info.fork ? point(info.objective === 'tissue' ? state.player : state.tissue) : undefined;
  info.stock = 0; delete info.castUntil;
  // Release replaces its own commitment. A still-living carrier can return to
  // ordinary actions only on a later tick; neither branch holds it invulnerable.
  carrier.attackAt = undefined; carrier.attackAim = undefined; carrier.attackTarget = undefined; carrier.attackWindup = undefined;
  carrier.attackReady = Math.max(carrier.attackReady ?? 0, state.elapsed + .5);
  const reason = capacityReason(state, info.transactionId)
    ?? (!isLegalPosition(carrier, VIRAL_CAPSULE_BALANCE.radius, activeWorld(state)) ? 'illegal-origin' : undefined);
  if (reason) {
    host.emit('VIRAL_CAPSULE_FIZZLED', { transactionId: info.transactionId, carrierId: carrier.id, wave: info.wave, objective: info.objective,
      reason, cause, stock: 0, capsuleCap: VIRAL_CAPSULE_BALANCE.maximumBodies, populationCap: VIRAL_CAPSULE_BALANCE.maximumPopulation });
    return;
  }
  const capsule = capsuleBody(state, carrier, info, aim, secondary); state.targets.push(capsule);
  host.emit('VIRAL_CAPSULE_RELEASED', { id: capsule.id, transactionId: info.transactionId, carrierId: carrier.id, wave: info.wave,
    objective: info.objective, cause, fork: info.fork, x: capsule.x, y: capsule.y, aimX: aim.x, aimY: aim.y,
    directionX: capsule.viralCapsule!.direction.x, directionY: capsule.viralCapsule!.direction.y,
    warningUntil: capsule.viralCapsule!.warningUntil, expiresAt: capsule.viralCapsule!.expiresAt, speed: capsule.viralCapsule!.speed,
    capsuleCap: VIRAL_CAPSULE_BALANCE.maximumBodies, populationCap: VIRAL_CAPSULE_BALANCE.maximumPopulation, stock: 0 });
}

/** Uses the real ordinary commitment fields, so existing displacement can interrupt. */
export function advanceViralCapsuleCarrier(host: ViralCapsuleHost, carrier: Target): boolean {
  const state = host.state, info = carrier.viralCapsuleCarrier;
  if (!active(host, state) || !state.endless || carrier.hp <= 0 || !info || info.stock !== 1) return false;
  if (info.castUntil !== undefined) {
    if (carrier.attackAt !== info.castUntil) {
      delete info.castUntil; delete info.aim;
      host.emit('VIRAL_CAPSULE_CARRIER_INTERRUPTED', { id: carrier.id, transactionId: info.transactionId, wave: info.wave, stock: info.stock });
      return true;
    }
    if (state.elapsed + 1e-9 >= info.castUntil) releaseViralCapsule(host, carrier, 'cast');
    return true;
  }
  if (carrier.attackAt !== undefined || carrier.charge || carrier.recoverUntil !== undefined || state.elapsed < (carrier.attackReady ?? 0)
    || commitments(state) >= VIRAL_CAPSULE_BALANCE.maximumCommitments) return false;
  info.aim = point(info.objective === 'tissue' ? state.tissue : state.player);
  info.castUntil = state.elapsed + VIRAL_CAPSULE_BALANCE.carrierWarning;
  carrier.attackAt = info.castUntil; carrier.attackAim = point(info.aim); carrier.attackTarget = info.objective;
  carrier.attackWindup = VIRAL_CAPSULE_BALANCE.carrierWarning; carrier.attackRadius = VIRAL_CAPSULE_BALANCE.radius;
  host.emit('VIRAL_CAPSULE_CARRIER_WARNED', { id: carrier.id, transactionId: info.transactionId, wave: info.wave, objective: info.objective,
    fork: info.fork, x: carrier.x, y: carrier.y, aimX: info.aim.x, aimY: info.aim.y, releaseAt: info.castUntil });
  return true;
}

function split(host: ViralCapsuleHost, parent: Target): void {
  const state = host.state, original = parent.viralCapsule!;
  retire(state, parent, 'split');
  const aims = [original.aim, original.secondaryAim ?? original.aim];
  if (distance(aims[0], aims[1]) < 80) {
    aims[1] = { x: aims[1].x - original.direction.y * 150, y: aims[1].y + original.direction.x * 150 };
  }
  const children: Target[] = [], fizzles: GameEvent['data'][] = [];
  for (let index = 0; index < 2; index++) {
    const reason = capacityReason(state, original.transactionId);
    if (reason) { fizzles.push({ transactionId: original.transactionId, carrierId: original.carrierId, wave: original.wave, reason, branch: index }); continue; }
    const direction = normalized(aims[index].x - parent.x, aims[index].y - parent.y);
    const capsule: ViralCapsuleState = { ...original, generation: 1, phase: 'warning', origin: point(parent), aim: point(aims[index]), direction,
      remainingRange: Math.min(VIRAL_CAPSULE_BALANCE.range, Math.max(90, distance(parent, aims[index]) + 80)), travelled: 0,
      warningUntil: state.elapsed + VIRAL_CAPSULE_BALANCE.branchWarning, updatedAt: state.elapsed,
      objective: index === 0 ? original.objective : original.objective === 'player' ? 'tissue' : 'player' };
    delete capsule.splitAfter; delete capsule.secondaryAim; delete capsule.terminalReason;
    const child: Target = { ...point(parent), id: `${parent.id}:branch:${index}`, role: 'capsule', kind: 'single',
      radius: VIRAL_CAPSULE_BALANCE.branchRadius, hp: VIRAL_CAPSULE_BALANCE.branchHealth, maxHp: VIRAL_CAPSULE_BALANCE.branchHealth,
      hitUntil: 0, scanned: false, traits: [], born: state.elapsed, generation: 1, sourceId: parent.sourceId,
      facing: Math.atan2(direction.y, direction.x), viralCapsule: capsule };
    state.targets.push(child); children.push(child);
  }
  host.emit('VIRAL_CAPSULE_SPLIT', { id: parent.id, transactionId: original.transactionId, carrierId: original.carrierId, wave: original.wave,
    x: parent.x, y: parent.y, children: children.length, childIds: children.map(child => child.id).join(','), capsuleCap: VIRAL_CAPSULE_BALANCE.maximumBodies });
  if (host.state !== state) return;
  termination(host, parent);
  for (const child of children) {
    if (host.state !== state) return;
    host.emit('VIRAL_CAPSULE_BRANCH_CREATED', { id: child.id, parentId: parent.id, transactionId: original.transactionId, wave: original.wave,
      objective: child.viralCapsule!.objective, x: child.x, y: child.y, directionX: child.viralCapsule!.direction.x,
      directionY: child.viralCapsule!.direction.y, warningUntil: child.viralCapsule!.warningUntil, expiresAt: child.viralCapsule!.expiresAt });
  }
  for (const data of fizzles) { if (host.state !== state) return; host.emit('VIRAL_CAPSULE_FIZZLED', data); }
}

/** Swept flight uses the same visible circles and finite bounds as interception. */
export function advanceViralCapsules(host: ViralCapsuleHost): void {
  const state = host.state, world = activeWorld(state);
  for (const target of [...bodies(state)]) {
    if (!active(host, state)) return;
    const capsule = target.viralCapsule!;
    if (target.hp <= 0 || capsule.terminalReason) continue;
    const delta = Math.max(0, Math.min(BALANCE.step, state.elapsed - capsule.updatedAt)); capsule.updatedAt = state.elapsed;
    if (state.elapsed >= capsule.expiresAt) { terminateViralCapsule(host, target, 'expired'); continue; }
    if (state.elapsed + 1e-9 < capsule.warningUntil || delta <= 0) continue;
    capsule.phase = 'flying';
    let travel = Math.min(capsule.remainingRange, capsule.speed * delta), wallAt = Infinity;
    const dir = capsule.direction;
    if (dir.x > 0) wallAt = Math.min(wallAt, (world.bounds.right - target.radius - target.x) / dir.x);
    if (dir.x < 0) wallAt = Math.min(wallAt, (world.bounds.left + target.radius - target.x) / dir.x);
    if (dir.y > 0) wallAt = Math.min(wallAt, (world.bounds.bottom - target.radius - target.y) / dir.y);
    if (dir.y < 0) wallAt = Math.min(wallAt, (world.bounds.top + target.radius - target.y) / dir.y);
    for (const obstacle of world.obstacles) {
      const at = rayCircle(target, dir, obstacle, obstacle.radius + target.radius, travel);
      if (at !== null) wallAt = Math.min(wallAt, at);
    }
    const playerAt = rayCircle(target, dir, state.player, state.player.radius + target.radius, travel);
    const tissueAt = rayCircle(target, dir, state.tissue, state.tissue.radius + target.radius, travel);
    const hitAt = Math.min(playerAt ?? Infinity, tissueAt ?? Infinity);
    const splitAt = capsule.splitAfter === undefined ? Infinity : Math.max(0, capsule.splitAfter - capsule.travelled);
    const end = Math.max(0, Math.min(travel, wallAt, hitAt, splitAt));
    target.x += dir.x * end; target.y += dir.y * end; capsule.travelled += end; capsule.remainingRange = Math.max(0, capsule.remainingRange - end);
    // A wall wins ties. No warning, projectile or detonation deals through it.
    if (wallAt <= Math.min(travel, hitAt, splitAt) + 1e-9) { terminateViralCapsule(host, target, 'wall'); continue; }
    if (hitAt <= Math.min(travel, splitAt) + 1e-9) {
      const player = (playerAt ?? Infinity) <= (tissueAt ?? Infinity), before = player ? state.player.hp : state.tissue.hp;
      retire(state, target, player ? 'hit-player' : 'hit-tissue');
      const accepted = player ? host.damagePlayer(target, capsule.playerDamage) : host.damageTissue(target, capsule.tissueDamage);
      const actual = before - (player ? state.player.hp : state.tissue.hp);
      if (!accepted || actual <= 0) capsule.terminalReason = 'evaded';
      // Report this already-committed collision even when it was lethal or a
      // receipt listener paused the run; never continue against a replaced run.
      if (host.state !== state) return;
      if (accepted && actual > 0) host.emit('VIRAL_CAPSULE_HIT', { id: target.id, transactionId: capsule.transactionId, carrierId: capsule.carrierId,
        wave: capsule.wave, target: player ? 'player' : 'tissue', damage: actual, generation: capsule.generation });
      if (host.state === state) termination(host, target);
      continue;
    }
    if (splitAt <= travel + 1e-9) { split(host, target); continue; }
    if (capsule.remainingRange <= 1e-7 || !dir.x && !dir.y) terminateViralCapsule(host, target, 'range');
  }
}
