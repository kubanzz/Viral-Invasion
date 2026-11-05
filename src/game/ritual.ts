import { distance, isLegalPosition, wallHit } from '../actors/collision';
import { EnemyNavigator } from '../actors/enemyNavigation';
import { SeedRng } from '../core/rng';
import { activeWorld, BALANCE, type GameEvent, type GameState, type MessagePriority, type Target, type Vec } from './types';
import { territoryInvasionOrigin, territoryNodeAt } from './territory';
import { isTerritoryPlayerAirborne } from './territoryCannon';
import type { SmartSupportPlan } from './smartVirusesTypes';
import type { RitualEncounter, RitualProjectile, RitualProjectileTarget, RitualState } from './ritualTypes';

export const RITUAL_BALANCE = {
  motherHp: 408, priestHp: 204, priestDistance: 180, warningSeconds: 4,
  damage: 35, projectileHp: 68, projectileSpeed: 260, projectileRadius: 17,
  turnRadians: 100 * Math.PI / 180, lifetime: 6, chargeSeconds: 1,
  castInterval: 6, groupFireGap: 1, projectileCap: 2, spawnDistance: 180,
} as const;
export interface RitualHost {
  state: GameState;
  emit(type: string, data: GameEvent['data']): void;
  message?(text: string, seconds?: number, priority?: MessagePriority): void;
  damagePlayer?(target: Target, amount: number, reason: string): boolean;
}
const EPS = 1e-7;
const point = (p: Vec): Vec => ({ x: p.x, y: p.y });
const stateOf = (state: GameState): RitualState => (state.smartViruses ??= { serial: 0, slime: [] }).ritual ??= { serial: 0, encounters: [], projectiles: [] };
const living = (state: GameState, id: string) => state.targets.find(t => t.id === id && t.hp > 0);

export function ritualMotherShielded(state: GameState, target: Pick<Target, 'id' | 'profession'>): boolean {
  if (target.profession !== 'ritual-mother') return false;
  const encounter = state.smartViruses?.ritual?.encounters.find(e => e.motherId === target.id);
  return !!encounter && encounter.priestIds.some(id => !!living(state, id));
}

/** The warning freezes a real, reachable four-position arrangement. */
export function ritualArrangement(state: GameState, plan: SmartSupportPlan): Vec[] | undefined {
  if (!state.territory) return;
  const origin = territoryInvasionOrigin(state, plan.sourceId);
  if (!origin) return;
  const world = activeWorld(state), rng = new SeedRng(state.seed ^ Math.imul(plan.wave, 73856093) ^ plan.slots[0]);
  const offset = rng.next() * Math.PI * 2;
  const nav = new EnemyNavigator();
  for (let candidate = 0; candidate < 48; candidate++) {
    const angle = offset + candidate * Math.PI / 8, step = 40 + Math.floor(candidate / 16) * 65;
    const center = { x: origin.x + Math.cos(angle) * step, y: origin.y + Math.sin(angle) * step };
    for (let rotation = 0; rotation < 6; rotation++) {
      const positions = [center, ...[0, 1, 2].map(i => ({
        x: center.x + Math.cos(angle + rotation * Math.PI / 9 + i * Math.PI * 2 / 3) * RITUAL_BALANCE.priestDistance,
        y: center.y + Math.sin(angle + rotation * Math.PI / 9 + i * Math.PI * 2 / 3) * RITUAL_BALANCE.priestDistance,
      }))];
      if (!ritualArrangementValid(state, positions)) continue;
      // Reachability is checked against the same navigation geometry as the player.
      const probe: Target = { ...state.player, id: 'ritual-reachability', kind: 'single', maxHp: 100, hitUntil: 0, scanned: false };
      if (positions.some(p => distance(nav.waypoint(probe, p, world, state.elapsed), state.player) < EPS)) continue;
      return positions;
    }
  }
}

export function ritualArrangementValid(state: GameState, positions: readonly Vec[]): boolean {
  if (!state.territory || positions.length !== 4) return false;
  const world = activeWorld(state);
  return positions.every((p, i) => isLegalPosition(p, i ? 22 : 32, world)
    && distance(p, state.player) >= RITUAL_BALANCE.spawnDistance
    && (state.territory!.stage === 'guard' || territoryNodeAt(state.territory!, p)?.owner === 'infected')
    && state.targets.every(t => t.hp <= 0 || distance(t, p) >= t.radius + (i ? 22 : 32) + 3));
}

/** A warned formation owns its actual landing plots until it spawns or cancels.
 * Other producers may retry elsewhere; existing moving actors remain free to enter. */
export function ritualSpawnReserved(state: GameState, candidate: Vec, radius: number, gap = 3): boolean {
  return !!state.endless?.smartSupport?.plans.some(plan => plan.kind === 'ritual' && plan.status === 'warning'
    && plan.ritualPositions?.some((plot, index) => distance(candidate, plot) < radius + (index === 0 ? 32 : 22) + gap));
}

/** Called only after all four positions and four reservations have been validated. */
export function spawnRitual(host: RitualHost, plan: SmartSupportPlan): void {
  const state = host.state, e = state.endless!, positions = plan.ritualPositions!;
  const available = plan.slots.filter(slot => !plan.bornSlots.includes(slot) && !plan.canceledSlots.includes(slot));
  if (available.length !== 4 || !ritualArrangementValid(state, positions)) return;
  const bodies: Target[] = positions.map((p, index) => {
    const profession = index === 0 ? 'ritual-mother' : 'ritual-priest';
    const hp = index === 0 ? RITUAL_BALANCE.motherHp : RITUAL_BALANCE.priestHp;
    return { ...p, id: `${plan.id}:${available[index]}`, kind: 'single', role: 'virus', profession,
      hp, maxHp: hp, radius: index ? 22 : 32, hitUntil: 0, scanned: false, traits: [],
      born: state.elapsed, generation: 0, waveId: plan.wave, blocksWaveClear: true,
      sourceId: `endless:wave:${plan.wave}`, smartSupportId: plan.id, facing: 0, tactic: 'melee' };
  });
  plan.bornSlots.push(...available); plan.memberIds.push(...bodies.map(b => b.id)); plan.status = 'active';
  state.targets.push(...bodies); e.spawnedIds.push(...bodies.map(b => b.id)); e.spawnSerial += 4; e.remainingToSpawn = Math.max(0, e.remainingToSpawn - 4);
  const encounter: RitualEncounter = { id: plan.id, wave: plan.wave, motherId: bodies[0].id,
    priestIds: bodies.slice(1).map(t => t.id), born: state.elapsed, nextCastAt: {},
    nextGroupFireAt: state.elapsed + 1, shieldBroken: false };
  encounter.priestIds.forEach((id, index) => encounter.nextCastAt[id] = state.elapsed + 1 + index);
  stateOf(state).encounters.push(encounter);
  for (const body of bodies) {
    host.emit('ACTOR_SPAWNED', { id: body.id, role: body.role!, profession: body.profession!, wave: plan.wave,
      sourceId: body.sourceId!, x: body.x, y: body.y, generation: 0, traits: '' });
    if (host.state !== state || state.phase !== 'playing') return;
  }
  host.emit('RITUAL_SPAWNED', { id: plan.id, motherId: encounter.motherId, priests: 3 });
  if (host.state !== state || state.phase !== 'playing') return;
  host.message?.('祭团已出现：优先击杀三名法师，停止追踪炮弹并解除母体护膜。', 5, 2);
}

function removeProjectile(host: RitualHost, orb: RitualProjectile, reason: string) {
  const ritual = host.state.smartViruses?.ritual; if (!ritual || !ritual.projectiles.includes(orb)) return;
  ritual.projectiles = ritual.projectiles.filter(p => p !== orb);
  host.emit('RITUAL_PROJECTILE_REMOVED', { id: orb.id, actorId: orb.actorId, reason, x: orb.x, y: orb.y });
}

export function clearRitualProjectiles(state: GameState, reason: string, emit?: RitualHost['emit']): void {
  const ritual = state.smartViruses?.ritual; if (!ritual) return;
  for (const orb of ritual.projectiles) emit?.('RITUAL_PROJECTILE_REMOVED', { id: orb.id, actorId: orb.actorId, reason, x: orb.x, y: orb.y });
  ritual.projectiles = [];
  ritual.encounters = ritual.encounters.filter(e => e.priestIds.concat(e.motherId).some(id => !!living(state, id)));
}

/** All attack paths use the same non-scoring, non-population candidate views. */
export function ritualProjectileTargets(state: GameState): RitualProjectileTarget[] {
  return (state.smartViruses?.ritual?.projectiles ?? []).filter(p => p.phase === 'flight' && p.hp > 0).map(p => ({
    id: p.id, x: p.x, y: p.y, kind: 'single', role: 'event', radius: p.radius,
    hp: p.hp, maxHp: RITUAL_BALANCE.projectileHp, hitUntil: 0, scanned: false, traits: [], blocksWaveClear: false,
  }));
}

export function damageRitualProjectile(state: GameState, id: string, amount: number, emit?: RitualHost['emit']): number {
  if (!Number.isFinite(amount) || amount <= 0 || state.phase !== 'playing') return 0;
  const ritual = state.smartViruses?.ritual, orb = ritual?.projectiles.find(p => p.id === id && p.phase === 'flight' && p.hp > 0);
  if (!orb || !ritual) return 0;
  const actual = Math.min(orb.hp, amount); orb.hp -= actual;
  emit?.('RITUAL_PROJECTILE_HIT', { id, damage: actual, remainingHp: orb.hp, x: orb.x, y: orb.y });
  if (orb.hp <= 0) { ritual.projectiles = ritual.projectiles.filter(p => p !== orb); emit?.('RITUAL_PROJECTILE_INTERCEPTED', { id, x: orb.x, y: orb.y }); }
  return actual;
}

function segmentDistance(a: Vec, b: Vec, p: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
  const t = square ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / square)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

export function advanceRituals(host: RitualHost, dt = BALANCE.step): void {
  const state = host.state, ritual = state.smartViruses?.ritual;
  if (!ritual || state.phase !== 'playing' || !state.territory || state.player.hp <= 0 || state.tissue.hp <= 0) return;
  const e = state.endless;
  if (!e || e.phase !== 'combat' || ['boss', 'cleanup', 'victory'].includes(state.territory.stage)) {
    clearRitualProjectiles(state, 'stage-changed', host.emit.bind(host)); return;
  }
  const B = RITUAL_BALANCE;
  for (const orb of [...ritual.projectiles]) {
    if (host.state !== state || state.phase !== 'playing' || state.player.hp <= 0 || state.tissue.hp <= 0) return;
    if (orb.wave !== e.wave) { removeProjectile(host, orb, 'wave-ended'); continue; }
    const actor = living(state, orb.actorId);
    if (orb.phase === 'charging') {
      if (!actor) { removeProjectile(host, orb, 'caster-killed'); continue; }
      orb.x = actor.x; orb.y = actor.y;
      if (isTerritoryPlayerAirborne(state)) { removeProjectile(host, orb, 'target-airborne'); continue; }
      if (state.elapsed + EPS < orb.firesAt) continue;
      orb.phase = 'flight'; orb.expiresAt = state.elapsed + B.lifetime;
      orb.aim = point(state.player); orb.angle = Math.atan2(orb.aim.y - orb.y, orb.aim.x - orb.x);
      actor.attackAt = undefined; actor.attackAim = undefined;
      host.emit('RITUAL_PROJECTILE_FIRED', { id: orb.id, actorId: orb.actorId, x: orb.x, y: orb.y, damage: B.damage });
      if (host.state !== state || state.phase !== 'playing') return;
    }
    if (state.elapsed + EPS >= orb.expiresAt) { removeProjectile(host, orb, 'expired'); continue; }
    if (isTerritoryPlayerAirborne(state)) orb.tracking = false;
    if (orb.tracking) orb.aim = point(state.player);
    const desired = Math.atan2(orb.aim.y - orb.y, orb.aim.x - orb.x), delta = Math.atan2(Math.sin(desired - orb.angle), Math.cos(desired - orb.angle));
    orb.angle += Math.max(-B.turnRadians * dt, Math.min(B.turnRadians * dt, delta));
    const from = point(orb), step = B.projectileSpeed * dt, direction = { x: Math.cos(orb.angle), y: Math.sin(orb.angle) };
    const to = { x: orb.x + direction.x * step, y: orb.y + direction.y * step };
    const block = wallHit(from, direction, step + orb.radius, activeWorld(state));
    if (block !== null && block <= step + orb.radius) { removeProjectile(host, orb, 'wall'); continue; }
    orb.x = to.x; orb.y = to.y;
    if (!isTerritoryPlayerAirborne(state) && segmentDistance(from, to, state.player) <= orb.radius + state.player.radius) {
      const source = actor ?? ({ id: orb.actorId, ...from, hp: 1, radius: 22 } as Target);
      host.damagePlayer?.(source, B.damage, 'ritual-homing'); removeProjectile(host, orb, 'player-hit'); continue;
    }
    if (!orb.tracking && segmentDistance(from, to, orb.aim) <= step + orb.radius) { removeProjectile(host, orb, 'lost-lock'); continue; }
    const workers = new Set([...(state.growth?.beacons ?? []), ...(state.growth?.beacon ? [state.growth.beacon] : [])]
      .filter(b => b.constructionTaskId).map(b => b.id));
    const cells = state.growth?.cells?.filter(c => (c.hp ?? 1) > 0 && c.until > state.elapsed && !workers.has(c.beaconId)) ?? [];
    const cell = cells.find(c => segmentDistance(from, to, c) <= orb.radius + 14);
    if (cell && state.elapsed >= cell.attackReadyAt) {
      cell.attackReadyAt = state.elapsed + cell.interval; cell.attackUntil = state.elapsed + .24; cell.activity = 'biting';
      damageRitualProjectile(state, orb.id, cell.damage, host.emit.bind(host));
    }
  }
  for (const encounter of ritual.encounters) {
    if (host.state !== state || state.phase !== 'playing' || state.player.hp <= 0 || state.tissue.hp <= 0) return;
    const priests = encounter.priestIds.flatMap(id => { const actor = living(state, id); return actor ? [actor] : []; });
    if (!priests.length && !encounter.shieldBroken) {
      encounter.shieldBroken = true; host.emit('RITUAL_SHIELD_BROKEN', { id: encounter.id, motherId: encounter.motherId });
      if (host.state !== state || state.phase !== 'playing') return;
    }
    if (encounter.wave !== e.wave || !living(state, encounter.motherId) && !priests.length) continue;
    for (const priest of priests) {
      if (host.state !== state || state.phase !== 'playing') return;
      priest.facing = Math.atan2(state.player.y - priest.y, state.player.x - priest.x);
      if (isTerritoryPlayerAirborne(state) || state.elapsed + EPS < (encounter.nextCastAt[priest.id] ?? Infinity)) continue;
      encounter.nextCastAt[priest.id] = state.elapsed + B.castInterval;
      if (ritual.projectiles.length >= B.projectileCap || ritual.projectiles.some(p => p.actorId === priest.id)
        || state.elapsed + B.chargeSeconds + EPS < encounter.nextGroupFireAt) continue;
      const firesAt = Math.max(state.elapsed + B.chargeSeconds, encounter.nextGroupFireAt);
      encounter.nextGroupFireAt = firesAt + B.groupFireGap;
      const orb: RitualProjectile = { ...point(priest), id: `ritual:orb:${++ritual.serial}`, actorId: priest.id, encounterId: encounter.id,
        wave: e.wave, hp: B.projectileHp, radius: B.projectileRadius, angle: priest.facing,
        phase: 'charging', born: state.elapsed, firesAt, expiresAt: firesAt + B.lifetime, aim: point(state.player), tracking: true };
      ritual.projectiles.push(orb); priest.attackAt = firesAt; priest.attackAim = point(state.player); priest.attackWindup = B.chargeSeconds;
      host.emit('RITUAL_PROJECTILE_CHARGING', { id: orb.id, actorId: priest.id, x: priest.x, y: priest.y, firesAt, damage: B.damage });
    }
  }
}
