import { normalized, rayCircle, wallHit } from '../actors/collision';
import { activeWorld, BALANCE, type Effect, type GameEvent, type GameState, type Target, type Vec, type WorldGeometry } from './types';
import type { EndlessCombatStats } from './endlessGrowthTypes';
import type { DamageOrigin } from './growthTypes';

export const PLAYER_PROJECTILE_BALANCE = {
  maximum: 192,
  primary: { speed: 1800, radius: 6, range: 530 },
  cannon: { speed: 900, radius: 12, range: 420 },
  sword: { speed: 1000, radius: 24, range: 650 },
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
}

export interface PlayerProjectileHost {
  state: GameState;
  damage(target: Target, amount: number, origin: DamageOrigin): number;
  emit(type: string, data: GameEvent['data']): void;
  effect(kind: Effect['kind'], from: Vec, to: Vec, radius: number, duration: number): Effect;
}

function admit(state: GameState, count: number): PlayerProjectile[] | undefined {
  if (!state.endless || state.phase !== 'playing' || !Number.isSafeInteger(count) || count < 1) return;
  const queue = state.playerProjectiles ??= [];
  return queue.length + count <= PLAYER_PROJECTILE_BALANCE.maximum ? queue : undefined;
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
  const queue = admit(state, stats.shotRays);
  if (!queue) return false;
  const direction = directionTo(state, aim);
  for (let index = 0; index < stats.shotRays; index++) {
    const offset = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? -1 : 1) * .14;
    const shot = body(state, rotated(direction, offset), castId, index, 'primary',
      BALANCE.damage[1] * stats.damageMultiplier, { cause: 'basic', basicTool: 1, rootId: castId });
    shot.hitsRemaining += stats.pierceCount;
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

function receipt(host: PlayerProjectileHost, shot: PlayerProjectile, target: Target): void {
  const state = host.state, queue = state.playerProjectiles;
  const amount = host.damage(target, shot.damage, { ...shot.origin });
  if (amount > 0 && queue && stillActive(host, state, queue)) host.emit('PLAYER_PROJECTILE_HIT', { kind: shot.kind, castId: shot.castId,
    targetId: target.id, damage: amount, x: target.x, y: target.y, killed: target.hp <= 0 });
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
    origin: { cause: 'ability', ability: 'cannon-aftershock', rootId: shot.castId, allowChain: false },
  } : undefined;
  // Reserve before reentrant host callbacks can enqueue another volley.
  if (followup) queue.push(followup);
  host.emit(aftershock ? 'PLAYER_CANNON_AFTERSHOCK' : 'PLAYER_CANNON_EXPLODED',
    { castId: shot.castId, x: shot.x, y: shot.y, radius, damage: shot.damage });
  const world = activeWorld(state);
  const targets = state.targets.filter(target => target.hp > 0 && Math.hypot(target.x - shot.x, target.y - shot.y) <= radius + target.radius)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const target of targets) {
    if (!stillActive(host, state, queue)) return;
    if (target.hp <= 0 || !state.targets.includes(target)) continue;
    const distance = Math.hypot(target.x - shot.x, target.y - shot.y), direction = normalized(target.x - shot.x, target.y - shot.y);
    const block = wallHit(shot, direction, distance, world);
    if (block !== null && block < distance - target.radius - 1e-7) continue;
    receipt(host, shot, target);
  }
  if (followup && stillActive(host, state, queue)) followup.detonateAt = state.elapsed + PLAYER_PROJECTILE_BALANCE.aftershock.delay;
}

function advanceStep(host: PlayerProjectileHost, dt: number): void {
  const state = host.state, queue = state.playerProjectiles;
  if (!queue || state.phase !== 'playing' || !state.endless) return;
  const world = activeWorld(state);
  for (const shot of [...queue]) {
    if (!stillActive(host, state, queue)) return;
    if (!queue.includes(shot)) continue;
    if (shot.kind === 'aftershock') {
      if (state.elapsed + 1e-8 >= (shot.detonateAt ?? Infinity)) explode(host, state, queue, shot);
      continue;
    }
    shot.previous = { x: shot.x, y: shot.y };
    const travel = Math.min(shot.remaining, shot.speed * dt);
    const block = sweptWall(shot, shot.direction, travel, shot.radius, world);
    const hits = state.targets.flatMap(target => {
      if (target.hp <= 0 || shot.hitTargetIds.includes(target.id)) return [];
      const distance = rayCircle(shot, shot.direction, target, target.radius + shot.radius, travel);
      return distance === null || block !== null && distance >= block - 1e-7 ? [] : [{ target, distance }];
    }).sort((a, b) => a.distance - b.distance || a.target.id.localeCompare(b.target.id));
    let travelled = block ?? travel, consumed = block !== null;
    for (const hit of hits) {
      if (!stillActive(host, state, queue)) return;
      if (hit.target.hp <= 0 || shot.hitTargetIds.includes(hit.target.id) || !state.targets.includes(hit.target)) continue;
      if (shot.kind === 'cannon') { travelled = hit.distance; consumed = true; break; }
      shot.hitTargetIds.push(hit.target.id);
      if (shot.kind === 'sword') for (const sibling of queue) {
        if (sibling.castId === shot.castId && !sibling.hitTargetIds.includes(hit.target.id)) sibling.hitTargetIds.push(hit.target.id);
      }
      receipt(host, shot, hit.target);
      if (!stillActive(host, state, queue)) return;
      if (--shot.hitsRemaining <= 0) { travelled = hit.distance; consumed = true; break; }
    }
    shot.x += shot.direction.x * travelled; shot.y += shot.direction.y * travelled;
    shot.remaining = Math.max(0, shot.remaining - travelled);
    if (consumed || shot.remaining <= 1e-8) {
      if (shot.kind === 'cannon') explode(host, state, queue, shot);
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

export function clearPlayerProjectiles(state: GameState): void { state.playerProjectiles = []; }
