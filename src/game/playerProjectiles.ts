import { distance, moveWithCollision, normalized, rayCircle, wallHit } from '../actors/collision';
import { activeWorld, BALANCE, type Effect, type GameEvent, type GameState, type Target, type Vec, type WorldGeometry } from './types';
import type { EndlessCombatStats } from './endlessGrowthTypes';
import type { DamageOrigin } from './growthTypes';
import { weaponCombatProfile } from './expedition';
import { ritualMotherShielded, ritualProjectileTargets } from './ritual';
import { territorySourceShielded } from './territory';

function attackable(state: GameState): Target[] { return [...state.targets, ...ritualProjectileTargets(state)]; }
function present(state: GameState, target: Target): boolean { return state.targets.includes(target) || ritualProjectileTargets(state).some(t => t.id === target.id && t.hp > 0); }
function protectedBody(state: GameState, target: Target): boolean {
  return ritualMotherShielded(state, target) || target.role === 'source' && !!target.territorySourceId
    && territorySourceShielded(state, target.territorySourceId);
}

export const PLAYER_PROJECTILE_BALANCE = {
  maximum: 192,
  primary: { speed: 1800, radius: 6, range: 530 },
  cannon: { speed: 900, radius: 12, range: 420 },
  sword: { speed: 1000, radius: 24, range: 650 },
  crescent: { speed: 800, radius: 13, range: 400, returnDamageFactor: .65, returnRange: 1000, lifetime: 2.2 },
  overdrive: { sideDamageFactor: .35, sideSpread: .28 },
  aftershock: { delay: .35, radiusFactor: .75, damageFactor: .4 },
} as const;

/** Independent of biological targets: these bodies never enter population accounting. */
export interface PlayerProjectile extends Vec {
  id: string;
  castId: string;
  kind: 'primary' | 'cannon' | 'sword' | 'aftershock';
  born: number;
  from: Vec;
  previous: Vec;
  direction: Vec;
  speed: number;
  radius: number;
  remaining: number;
  damage: number;
  origin: DamageOrigin;
  hitsRemaining: number;
  /** Sword bodies in one volley share this array, enforcing one receipt per cast. */
  hitTargetIds: string[];
  explosionRadius?: number;
  aftershock?: boolean;
  detonateAt?: number;
  /** A weapon capsule may wait on its visible impact point before resolving. */
  impactDelay?: number;
  displacement?: { kind: 'push' | 'pull'; maximum: number };
  movedByTargetId?: Record<string, number>;
  visual?: 'hive-needle' | 'swarm-needle' | 'crescent' | 'heavy-blade' | 'storm-crescent' | 'pulse-ring' | 'anchor';
  flightPhase?: 'outbound' | 'returning';
  returnFlight?: { damageFactor: number; range: number; hitsRemaining: number; hitTargetIds: string[]; expiresAt: number };
  homing?: { targetId?: string; turnRate: number; remainingTurn: number; range: number; acquireCos: number; startsAt: number; acquired?: boolean };
  penetration?: { perTarget: number; maximum: number; count: number; baseDamage: number };
}

export interface PlayerProjectileHost {
  state: GameState;
  damage(target: Target, amount: number, origin: DamageOrigin): number;
  emit(type: string, data: GameEvent['data']): void;
  effect(kind: Effect['kind'], from: Vec, to: Vec, radius: number, duration: number): Effect;
}

export function playerProjectilePopulation(state: GameState): number {
  return (state.playerProjectiles?.length ?? 0) + (state.weaponCombat?.reservedProjectiles ?? 0);
}

function admit(state: GameState, count: number): PlayerProjectile[] | undefined {
  if ((!state.endless && !state.weaponCombat && !state.territory) || state.phase !== 'playing' || !Number.isSafeInteger(count) || count < 1) return;
  const queue = state.playerProjectiles ??= [];
  return playerProjectilePopulation(state) + count <= PLAYER_PROJECTILE_BALANCE.maximum ? queue : undefined;
}

/** Future burst/preparation bodies count exactly like in-flight bodies. */
export function reservePlayerProjectiles(state: GameState, count: number): boolean {
  if (!state.weaponCombat || !admit(state, count)) return false;
  state.weaponCombat.reservedProjectiles += count; return true;
}

function directionTo(state: GameState, aim: Vec): Vec {
  const direction = normalized(aim.x - state.player.x, aim.y - state.player.y);
  return direction.x || direction.y ? direction : { x: Math.cos(state.player.facing), y: Math.sin(state.player.facing) };
}

function body(state: GameState, direction: Vec, castId: string, index: number,
  kind: 'primary' | 'cannon' | 'sword', damage: number, origin: DamageOrigin): PlayerProjectile {
  const profile = PLAYER_PROJECTILE_BALANCE[kind], from = { x: state.player.x, y: state.player.y };
  return { id: `${castId}:${index}`, castId, kind, born: state.elapsed, ...from, from, previous: { ...from },
    direction, speed: profile.speed, radius: profile.radius, remaining: profile.range,
    damage, origin, hitsRemaining: 1, hitTargetIds: [] };
}

function rotated(direction: Vec, angle: number): Vec {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: direction.x * c - direction.y * s, y: direction.x * s + direction.y * c };
}

/** Whole volleys are atomic. The caller only spends cooldown after true. */
export function launchPrimary(state: GameState, aim: Vec, stats: EndlessCombatStats, castId: string): boolean {
  if (state.weaponCombat && state.elapsed + 1e-8 < state.weaponCombat.primaryBlockedUntil) return false;
  const loadout = state.weaponCombat?.loadout ?? state.expedition?.loadout;
  const crescent = !!state.weaponCombat && loadout?.weaponId === 'piercing';
  const overdrive = !!state.weaponCombat && loadout?.weaponId === 'steady' && state.elapsed + 1e-8 < state.weaponCombat.overdriveUntil;
  const count = stats.shotRays + (overdrive ? 2 : 0), queue = admit(state, count);
  if (!queue) return false;
  const direction = directionTo(state, aim);
  const equipment = loadout ? weaponCombatProfile(loadout, stats.damageMultiplier) : undefined;
  for (let index = 0; index < count; index++) {
    const side = index >= stats.shotRays;
    const offset = side ? (index === stats.shotRays ? -1 : 1) * PLAYER_PROJECTILE_BALANCE.overdrive.sideSpread
      : index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? -1 : 1) * .14;
    const shot = body(state, rotated(direction, offset), castId, index, 'primary',
      (equipment?.primaryDamage ?? BALANCE.damage[1] * stats.damageMultiplier) * (side ? PLAYER_PROJECTILE_BALANCE.overdrive.sideDamageFactor : 1), { cause: 'basic', basicTool: 1, rootId: castId,
        ...(state.weaponCombat && equipment ? { weaponId: equipment.weaponId, damageCategory: 'precision' as const,
          armorResponse: crescent ? 'heavy' as const : 'needle' as const, castId } : {}) });
    shot.hitsRemaining += stats.pierceCount + (equipment?.extraPierce ?? 0);
    if (state.weaponCombat) shot.visual = crescent ? 'crescent' : 'hive-needle';
    if (crescent) {
      const profile = PLAYER_PROJECTILE_BALANCE.crescent;
      shot.speed = profile.speed; shot.radius = profile.radius; shot.remaining = profile.range;
      shot.flightPhase = 'outbound';
      shot.returnFlight = { damageFactor: profile.returnDamageFactor, range: profile.returnRange,
        hitsRemaining: shot.hitsRemaining, hitTargetIds: [], expiresAt: state.elapsed + profile.lifetime };
    }
    queue.push(shot);
  }
  return true;
}

export interface WeaponVolleyOptions {
  castId: string; kind: 'primary' | 'cannon' | 'sword'; damage: number; origin: DamageOrigin;
  count?: number; spread?: number; direction?: Vec; speed?: number; radius?: number; range?: number;
  hitsRemaining?: number; shareHits?: boolean; explosionRadius?: number; aftershock?: boolean;
  impactDelay?: number; displacement?: PlayerProjectile['displacement'];
  visual?: PlayerProjectile['visual'];
  homing?: Omit<NonNullable<PlayerProjectile['homing']>, 'startsAt'> & { delay?: number };
  returnFlight?: { damageFactor: number; range: number; lifetime: number };
  penetration?: { perTarget: number; maximum: number };
}

/** Weapon kits use the same swept bodies, unified damage host and admission cap. */
export function launchWeaponVolley(state: GameState, aim: Vec, options: WeaponVolleyOptions): boolean {
  const count = options.count ?? 1, queue = admit(state, count); if (!queue) return false;
  const direction = options.direction ?? directionTo(state, aim), sharedHits: string[] = [], sharedReturnHits: string[] = [];
  for (let index = 0; index < count; index++) {
    const offset = (index - (count - 1) / 2) * (options.spread ?? 0);
    const shot = body(state, rotated(direction, offset), options.castId, index, options.kind, options.damage, { ...options.origin });
    shot.speed = options.speed ?? shot.speed; shot.radius = options.radius ?? shot.radius;
    shot.remaining = options.range ?? shot.remaining; shot.hitsRemaining = options.hitsRemaining ?? 1;
    if (options.kind === 'cannon') shot.remaining = Math.min(shot.remaining, distance(state.player, aim));
    if (options.shareHits) shot.hitTargetIds = sharedHits;
    shot.explosionRadius = options.explosionRadius; shot.aftershock = options.aftershock;
    shot.impactDelay = options.impactDelay; shot.displacement = options.displacement;
    shot.visual = options.visual;
    if (options.homing) shot.homing = { ...options.homing, startsAt: state.elapsed + (options.homing.delay ?? 0) };
    if (options.returnFlight) {
      shot.flightPhase = 'outbound'; shot.returnFlight = { damageFactor: options.returnFlight.damageFactor,
        range: options.returnFlight.range, hitsRemaining: shot.hitsRemaining,
        hitTargetIds: options.shareHits ? sharedReturnHits : [], expiresAt: state.elapsed + options.returnFlight.lifetime };
    }
    if (options.penetration) shot.penetration = { ...options.penetration, count: 0, baseDamage: shot.damage };
    queue.push(shot);
  }
  return true;
}

export function launchCannon(state: GameState, aim: Vec, stats: EndlessCombatStats, castId: string): boolean {
  const queue = admit(state, 1);
  if (!queue) return false;
  const shot = body(state, directionTo(state, aim), castId, 0, 'cannon',
    BALANCE.damage[2] * stats.damageMultiplier * stats.areaDamageMultiplier,
    { cause: 'basic', basicTool: 2, rootId: castId });
  shot.remaining = Math.min(shot.remaining, Math.hypot(aim.x - shot.x, aim.y - shot.y));
  shot.explosionRadius = stats.areaRadius;
  shot.aftershock = stats.catalysisDamage > 0;
  queue.push(shot);
  return true;
}

export function launchSwordVolley(state: GameState, aim: Vec, damage: number, count: number, castId: string): boolean {
  const queue = admit(state, count);
  if (!queue) return false;
  const direction = directionTo(state, aim), sharedHits: string[] = [];
  for (let index = 0; index < count; index++) {
    const shot = body(state, rotated(direction, (index - (count - 1) / 2) * .16), castId, index, 'sword', damage,
      { cause: 'ability', ability: 'charged-slash', rootId: castId });
    shot.hitTargetIds = sharedHits; shot.hitsRemaining = Number.MAX_SAFE_INTEGER;
    queue.push(shot);
  }
  return true;
}

/** A swept footprint hits folds and chamber edges before bodies at the same distance. */
function sweptWall(origin: Vec, direction: Vec, range: number, radius: number, world: WorldGeometry): number | null {
  let nearest: number | null = null;
  const accept = (value: number) => { if (value >= 0 && value <= range && (nearest === null || value < nearest)) nearest = value; };
  for (const obstacle of world.obstacles) {
    const hit = rayCircle(origin, direction, obstacle, obstacle.radius + radius, range);
    if (hit !== null) accept(hit);
  }
  const b = world.bounds;
  if (direction.x > 0) accept((b.right - radius - origin.x) / direction.x);
  if (direction.x < 0) accept((b.left + radius - origin.x) / direction.x);
  if (direction.y > 0) accept((b.bottom - radius - origin.y) / direction.y);
  if (direction.y < 0) accept((b.top + radius - origin.y) / direction.y);
  return nearest;
}

function remove(queue: PlayerProjectile[], shot: PlayerProjectile): void {
  const index = queue.indexOf(shot);
  if (index >= 0) queue.splice(index, 1);
}

function stillActive(host: PlayerProjectileHost, state: GameState, queue: PlayerProjectile[]): boolean {
  return host.state === state && state.phase === 'playing' && state.playerProjectiles === queue;
}

function receipt(host: PlayerProjectileHost, shot: PlayerProjectile, target: Target): number {
  const state = host.state, queue = state.playerProjectiles;
  const amount = host.damage(target, shot.damage, { ...shot.origin });
  if (amount > 0 && queue && stillActive(host, state, queue)) host.emit('PLAYER_PROJECTILE_HIT', { kind: shot.kind, castId: shot.castId,
    targetId: target.id, damage: amount, x: target.x, y: target.y, killed: target.hp <= 0,
    weaponId: shot.origin.weaponId ?? '', skillId: shot.origin.skillId ?? '', visual: shot.visual ?? '', flightPhase: shot.flightPhase ?? '' });
  return amount;
}

/** Steering has a finite angular budget and never acquires through a fold. */
function steerNeedle(state: GameState, shot: PlayerProjectile, dt: number): void {
  const tracking = shot.homing;
  if (!tracking || tracking.remainingTurn <= 1e-8 || state.elapsed + 1e-8 < tracking.startsAt) return;
  const world = activeWorld(state);
  if (!tracking.acquired) {
    tracking.acquired = true;
    const candidates = attackable(state).filter(target => {
      if (target.hp <= 0) return false;
      const gap = distance(shot, target), direction = normalized(target.x - shot.x, target.y - shot.y);
      if (gap > tracking.range || direction.x * shot.direction.x + direction.y * shot.direction.y < tracking.acquireCos) return false;
      const wall = sweptWall(shot, direction, gap, shot.radius, world);
      return wall === null || wall >= gap - target.radius;
    }).sort((a, b) => distance(shot, a) - distance(shot, b) || a.id.localeCompare(b.id));
    tracking.targetId = candidates[0]?.id;
  }
  const target = attackable(state).find(body => body.id === tracking.targetId && body.hp > 0);
  if (!target || distance(shot, target) > tracking.range) return;
  const direction = normalized(target.x - shot.x, target.y - shot.y);
  const gap = distance(shot, target), wall = sweptWall(shot, direction, gap, shot.radius, world);
  if (wall !== null && wall < gap - target.radius) return;
  const desired = Math.atan2(direction.y, direction.x), current = Math.atan2(shot.direction.y, shot.direction.x);
  const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  const turn = Math.sign(delta) * Math.min(Math.abs(delta), tracking.turnRate * dt, tracking.remainingTurn);
  shot.direction = rotated(shot.direction, turn); tracking.remainingTurn = Math.max(0, tracking.remainingTurn - Math.abs(turn));
}

function beginReturn(host: PlayerProjectileHost, shot: PlayerProjectile): void {
  const back = shot.returnFlight;
  if (!back) return;
  shot.flightPhase = 'returning'; shot.damage *= back.damageFactor;
  shot.remaining = back.range; shot.hitsRemaining = back.hitsRemaining; shot.hitTargetIds = back.hitTargetIds;
  shot.direction = normalized(host.state.player.x - shot.x, host.state.player.y - shot.y);
  host.emit('PLAYER_PROJECTILE_RETURNED', { kind: shot.kind, castId: shot.castId, x: shot.x, y: shot.y,
    weaponId: shot.origin.weaponId ?? 'piercing' });
}

function displace(state: GameState, shot: PlayerProjectile, target: Target, maximumStep = Infinity): void {
  const control = shot.displacement;
  if (!control || target.hp <= 0 || target.role === 'source' || target.role === 'core' || target.role === 'nest'
    || target.role === 'event' || target.role === 'capsule' || target.profession === 'ritual-mother' || target.profession === 'ritual-priest'
    || target.attackPlan || target.charge || (target.recoverUntil ?? 0) > state.elapsed
    || target.attackAt !== undefined && target.attackAt >= state.elapsed) return;
  const factor = target.role === 'elite' || target.traits?.includes('CARAPACE') ? .35 : 1;
  let direction = normalized(target.x - shot.x, target.y - shot.y);
  if (!direction.x && !direction.y) direction = shot.direction;
  const previous = shot.movedByTargetId?.[target.id] ?? 0;
  const amount = Math.min(Math.max(0, control.maximum * factor - previous), maximumStep * factor,
    control.kind === 'pull' ? Math.max(0, distance(target, shot) - target.radius - 12) : Infinity);
  const sign = control.kind === 'pull' ? -1 : 1;
  const point = moveWithCollision(target, { x: direction.x * amount * sign, y: direction.y * amount * sign }, target.radius, activeWorld(state));
  (shot.movedByTargetId ??= {})[target.id] = previous + distance(target, point);
  target.x = point.x; target.y = point.y;
}

function gatherCapsule(state: GameState, shot: PlayerProjectile, dt: number): void {
  if (shot.displacement?.kind !== 'pull' || !shot.impactDelay) return;
  const radius = shot.explosionRadius ?? 0, world = activeWorld(state);
  for (const target of state.targets) {
    const gap = distance(shot, target);
    if (target.hp <= 0 || gap > radius + target.radius) continue;
    const direction = normalized(target.x - shot.x, target.y - shot.y), wall = wallHit(shot, direction, gap, world);
    if (wall !== null && wall < gap - target.radius - 1e-7) continue;
    displace(state, shot, target, shot.displacement.maximum * dt / shot.impactDelay);
  }
}

function explode(host: PlayerProjectileHost, state: GameState, queue: PlayerProjectile[], shot: PlayerProjectile): void {
  const aftershock = shot.kind === 'aftershock', radius = shot.explosionRadius ?? BALANCE.areaRadius;
  // Claim before callbacks: neither recursive damage nor repeated steps can detonate twice.
  remove(queue, shot);
  const followup: PlayerProjectile | undefined = !aftershock && shot.aftershock ? {
    ...shot, kind: 'aftershock', speed: 0, remaining: 0, aftershock: false,
    detonateAt: state.elapsed + PLAYER_PROJECTILE_BALANCE.aftershock.delay,
    explosionRadius: radius * PLAYER_PROJECTILE_BALANCE.aftershock.radiusFactor,
    damage: shot.damage * PLAYER_PROJECTILE_BALANCE.aftershock.damageFactor,
    displacement: undefined, impactDelay: undefined, movedByTargetId: undefined,
    origin: { ...shot.origin, cause: 'ability', ability: 'cannon-aftershock', rootId: shot.castId, allowChain: false },
  } : undefined;
  // Reserve before reentrant host callbacks can enqueue another volley.
  if (followup) queue.push(followup);
  host.emit(aftershock ? 'PLAYER_CANNON_AFTERSHOCK' : 'PLAYER_CANNON_EXPLODED',
    { castId: shot.castId, x: shot.x, y: shot.y, radius, damage: shot.damage,
      weaponId: shot.origin.weaponId ?? '', skillId: shot.origin.skillId ?? '', visual: shot.visual ?? '' });
  const world = activeWorld(state);
  const targets = attackable(state).filter(target => target.hp > 0 && Math.hypot(target.x - shot.x, target.y - shot.y) <= radius + target.radius)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const target of targets) {
    if (!stillActive(host, state, queue)) return;
    if (target.hp <= 0 || !present(state, target)) continue;
    const distance = Math.hypot(target.x - shot.x, target.y - shot.y), direction = normalized(target.x - shot.x, target.y - shot.y);
    const block = wallHit(shot, direction, distance, world);
    if (block !== null && block < distance - target.radius - 1e-7) continue;
    displace(state, shot, target);
    receipt(host, shot, target);
  }
  if (followup && stillActive(host, state, queue)) followup.detonateAt = state.elapsed + PLAYER_PROJECTILE_BALANCE.aftershock.delay;
}

/** Called only after the self skill has committed its cooldown and cast receipt. */
export function resolveWeaponPulse(host: PlayerProjectileHost, castId: string): void {
  const state = host.state, queue = state.playerProjectiles;
  const shot = queue?.find(body => body.castId === castId && body.visual === 'pulse-ring');
  if (shot && queue && state.phase === 'playing') explode(host, state, queue, shot);
}

function advanceStep(host: PlayerProjectileHost, dt: number): void {
  const state = host.state, queue = state.playerProjectiles;
  if (!queue || state.phase !== 'playing' || (!state.endless && !state.weaponCombat && !state.territory)) return;
  const world = activeWorld(state);
  for (const shot of [...queue]) {
    if (!stillActive(host, state, queue)) return;
    if (!queue.includes(shot)) continue;
    if (shot.kind === 'aftershock') {
      if (state.elapsed + 1e-8 >= (shot.detonateAt ?? Infinity)) explode(host, state, queue, shot);
      continue;
    }
    if (shot.detonateAt !== undefined) {
      gatherCapsule(state, shot, dt);
      if (state.elapsed + 1e-8 >= shot.detonateAt) { shot.displacement = undefined; explode(host, state, queue, shot); }
      continue;
    }
    if (shot.returnFlight && state.elapsed + 1e-8 >= shot.returnFlight.expiresAt) { remove(queue, shot); continue; }
    shot.previous = { x: shot.x, y: shot.y };
    steerNeedle(state, shot, dt);
    if (shot.flightPhase === 'returning') shot.direction = normalized(state.player.x - shot.x, state.player.y - shot.y);
    let travel = Math.min(shot.remaining, shot.speed * dt);
    const caughtAt = shot.flightPhase === 'returning'
      ? rayCircle(shot, shot.direction, state.player, state.player.radius + shot.radius, travel) : null;
    if (caughtAt !== null) travel = caughtAt;
    const block = sweptWall(shot, shot.direction, travel, shot.radius, world);
    const hits = attackable(state).flatMap(target => {
      if (target.hp <= 0 || !protectedBody(state, target) && (shot.hitsRemaining <= 0 || shot.hitTargetIds.includes(target.id))) return [];
      const distance = rayCircle(shot, shot.direction, target, target.radius + shot.radius, travel);
      return distance === null || block !== null && distance >= block - 1e-7 ? [] : [{ target, distance }];
    }).sort((a, b) => a.distance - b.distance || a.target.id.localeCompare(b.target.id));
    let travelled = block ?? travel, consumed = block !== null, membraneBlocked = false;
    for (const hit of hits) {
      if (!stillActive(host, state, queue)) return;
      if (hit.target.hp <= 0 || !protectedBody(state, hit.target) && shot.hitTargetIds.includes(hit.target.id) || !present(state, hit.target)) continue;
      if (shot.kind === 'cannon') { travelled = hit.distance; consumed = true; break; }
      shot.hitTargetIds.push(hit.target.id);
      if (shot.kind === 'sword') for (const sibling of queue) {
        if (sibling.castId !== shot.castId) continue;
        const ledger = shot.flightPhase === 'returning' ? sibling.returnFlight?.hitTargetIds
          : sibling.flightPhase === 'returning' ? undefined : sibling.hitTargetIds;
        if (ledger && !ledger.includes(hit.target.id)) ledger.push(hit.target.id);
      }
      const accepted = receipt(host, shot, hit.target);
      if (!stillActive(host, state, queue)) return;
      if (accepted <= 0 && (hit.target.role === 'source' || hit.target.role === 'core' || hit.target.profession === 'ritual-mother')) {
        // A rejected shield contact is a physical stop, not a shared damage receipt.
        // Leaving it in the cast ledger would let sibling blades skip the membrane.
        for (const sibling of queue) {
          if (sibling.castId !== shot.castId) continue;
          const ledger = shot.flightPhase === 'returning' ? sibling.returnFlight?.hitTargetIds
            : sibling.flightPhase === 'returning' ? undefined : sibling.hitTargetIds;
          if (!ledger) continue;
          const index = ledger.indexOf(hit.target.id); if (index >= 0) ledger.splice(index, 1);
        }
        const ownIndex = shot.hitTargetIds.indexOf(hit.target.id); if (ownIndex >= 0) shot.hitTargetIds.splice(ownIndex, 1);
        travelled = hit.distance; consumed = true; membraneBlocked = true; break;
      }
      if (shot.penetration) {
        shot.penetration.count++;
        shot.damage = shot.penetration.baseDamage * (1 + Math.min(shot.penetration.maximum, shot.penetration.count * shot.penetration.perTarget));
      }
      if (--shot.hitsRemaining <= 0) {
        if (!shot.returnFlight) { travelled = hit.distance; consumed = true; }
        break;
      }
    }
    shot.x += shot.direction.x * travelled; shot.y += shot.direction.y * travelled;
    shot.remaining = Math.max(0, shot.remaining - travelled);
    if (caughtAt !== null && block === null && !consumed) { remove(queue, shot); continue; }
    if (consumed || shot.remaining <= 1e-8) {
      if (shot.flightPhase === 'outbound' && block === null && !membraneBlocked && shot.returnFlight) {
        beginReturn(host, shot); continue;
      }
      if (shot.kind === 'cannon' && (shot.impactDelay ?? 0) > 0) {
        shot.previous = { x: shot.x, y: shot.y }; shot.remaining = 0; shot.speed = 0;
        shot.detonateAt = state.elapsed + shot.impactDelay!;
        host.emit('WEAPON_CAPSULE_IMPACT', { castId: shot.castId, x: shot.x, y: shot.y,
          radius: shot.explosionRadius ?? 0, detonatesAt: shot.detonateAt });
      } else if (shot.kind === 'cannon') explode(host, state, queue, shot);
      else remove(queue, shot);
    }
  }
}

/** Hosts normally pass one fixed step; a larger caller step is subdivided. */
export function advancePlayerProjectiles(host: PlayerProjectileHost, dt: number = BALANCE.step): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  let remaining = dt;
  while (remaining > 1e-8) {
    const step = Math.min(BALANCE.step, remaining);
    advanceStep(host, step); remaining -= step;
  }
}

export function clearPlayerProjectiles(state: GameState): void {
  state.playerProjectiles = [];
  if (state.weaponCombat) {
    state.weaponCombat.reservedProjectiles = 0;
    delete state.weaponCombat.burst; delete state.weaponCombat.preparation;
  }
}
