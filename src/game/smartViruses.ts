import { distance, isLegalPosition, moveWithCollision, normalized, wallHit } from '../actors/collision';
import { EnemyNavigator } from '../actors/enemyNavigation';
import { moveEnemyThroughCrowd } from '../actors/enemyCrowd';
import { SeedRng } from '../core/rng';
import { combatPopulation, combatPopulationLimit } from './combatPopulation';
import { TERRITORY_LANES, territoryInvasionOrigin, territoryNodeAt } from './territory';
import { isTerritoryPlayerAirborne } from './territoryCannon';
import { activeWorld, BALANCE, type GameEvent, type GameState, type MessagePriority, type Target, type Vec, type WorldGeometry } from './types';
import type { EndlessSpawnRole } from './endlessTypes';
import type { SmartSupportPlan, SmartSupportWave, SlimeCast } from './smartVirusesTypes';
import { advanceRituals, ritualArrangement, ritualArrangementValid, ritualSpawnReserved, spawnRitual } from './ritual';

export const SMART_VIRUS_BALANCE = {
  casterHp: 136, casterSpeed: 60, castRange: 450, castInner: 300, castOuter: 400,
  castWindup: .9, slimeFlight: .45, castInterval: 5, slimeRadius: 75, slimeSeconds: 3, slimeSlow: .72, slimeCap: 2,
  builderHp: 204, builderSpeed: 60, buildSeconds: 3, nestHp: 238, firstHatchSeconds: 1, hatchInterval: 4, hatchBatch: 2,
  fastlingHp: 24, fastlingSpeed: 180, fastlingWindup: .45, fastlingInterval: 1.5, fastlingDamage: 4,
  warningSeconds: 4, spawnGrace: 1.5,
} as const;
export interface SmartVirusHost { state: GameState; emit(type: string, data: GameEvent['data']): void; message?(text:string,seconds?:number,priority?:MessagePriority):void;
  damagePlayer?(target: Target, amount: number, reason: string): boolean }
const live = (state: GameState) => state.phase === 'playing' && !!state.territory && state.player.hp > 0 && state.tissue.hp > 0;
const point = (p: Vec): Vec => ({ x: p.x, y: p.y });
const EPS = 1e-7;
const navigators = new WeakMap<GameState, EnemyNavigator>();
const routeWorlds = new WeakMap<GameState, { base: WorldGeometry; signature: string; world: WorldGeometry }>();
function navigator(state: GameState) { let n = navigators.get(state); if (!n) { n = new EnemyNavigator(); navigators.set(state, n); } return n; }
export function smartRemainingSlots(plan: SmartSupportPlan) {
  return plan.slots.filter(slot => !plan.bornSlots.includes(slot) && !plan.canceledSlots.includes(slot));
}

/** Supports spend original ordinary ordinals; none belongs to a handoff squad. */
export function planSmartSupports(seed: number, wave: number, roles: readonly EndlessSpawnRole[], forbidden: readonly number[] = []): SmartSupportWave {
  const plans: SmartSupportPlan[] = [], available = roles.flatMap((role, index) => role === 'ordinary' && index >= 3 && !forbidden.includes(index) ? [index] : []);
  const reserve = (kind: SmartSupportPlan['kind'], count: number, index: number) => {
    if (available.length < count) return;
    const laneId = ((seed + wave + index) & 1) ? 'north' : 'south', lane = TERRITORY_LANES.find(l => l.id === laneId)!;
    plans.push({ id: `smart:${wave}:${kind}:${index}`, wave, kind, laneId, sourceId: lane.sourceId,
      slots: available.splice(0, count), bornSlots: [], canceledSlots: [], status: 'pending', memberIds: [], departureOffset: 6 + index * 6 });
  };
  if (wave === 2) reserve('caster', 1, 0);
  if (wave === 3) reserve('brood', 8, 0);
  if (wave >= 4) { reserve('caster', 1, 0); reserve('caster', 1, 1); reserve('brood', 8, 2); }
  if (wave === 3 || wave >= 8 && (wave - 8) % 4 === 0) reserve('ritual', 4, 3);
  return { wave, plans, reservedSlots: plans.flatMap(plan => plan.slots) };
}

function cancelFuture(host: SmartVirusHost, plan: SmartSupportPlan, reason: string, queueAlreadyCanceled = false) {
  const slots = smartRemainingSlots(plan); if (!slots.length) return;
  plan.canceledSlots.push(...slots); delete plan.buildUntil; delete plan.nextHatchAt;
  if (host.state.endless && !queueAlreadyCanceled) {
    const debit = Math.min(slots.length, host.state.endless.remainingToSpawn);
    host.state.endless.remainingToSpawn -= debit; host.state.endless.canceledToSpawn += debit;
  }
  if (!plan.memberIds.some(id => host.state.targets.some(t => t.id === id && t.hp > 0))) plan.status = 'canceled';
  host.emit('SMART_SUPPORT_CANCELED', { id: plan.id, wave: plan.wave, count: slots.length, reason });
}
export function cancelSmartSupports(host: SmartVirusHost, sourceId?: string, queueAlreadyCanceled = false) {
  for (const plan of host.state.endless?.smartSupport?.plans ?? []) if (!sourceId || plan.sourceId === sourceId)
    cancelFuture(host, plan, 'source-cleared', queueAlreadyCanceled);
}

function clearLane(state: GameState, a: Vec, b: Vec, radius = 0) {
  const gap = distance(a, b), block = wallHit(a, normalized(b.x - a.x, b.y - a.y), gap, activeWorld(state));
  return block === null || block >= gap - radius - EPS;
}
function spawnPoint(state: GameState, plan: SmartSupportPlan, radius: number, anchor?: Vec, nearby = false): Vec | undefined {
  const world = activeWorld(state), origin = anchor ?? territoryInvasionOrigin(state, plan.sourceId); if (!origin) return;
  const rng = new SeedRng(state.seed ^ Math.imul(plan.wave, 7919) ^ plan.slots[0] ^ plan.bornSlots.length);
  const offset = rng.next() * Math.PI * 2;
  for (let attempt = 0; attempt < 96; attempt++) {
    const angle = offset + attempt * Math.PI / 8, r = nearby ? 42 + Math.floor(attempt / 16) * 12 : 140 + Math.floor(attempt / 16) * 28;
    const p = { x: origin.x + Math.cos(angle) * r, y: origin.y + Math.sin(angle) * r };
    if (!isLegalPosition(p, radius, world) || (!nearby && distance(p, state.player) < 180)) continue;
    if (!nearby && state.territory?.stage !== 'guard' && territoryNodeAt(state.territory!, p)?.owner !== 'infected') continue;
    if (state.targets.some(t => t.hp > 0 && distance(t, p) < t.radius + radius + 3)) continue;
    if (distance(p, state.tissue) < state.tissue.radius + radius + 4) continue;
    if (ritualSpawnReserved(state, p, radius)) continue;
    return p;
  }
}
function birth(host: SmartVirusHost, plan: SmartSupportPlan, profession: NonNullable<Target['profession']>, at: Vec): Target {
  const state = host.state, e = state.endless!, slot = smartRemainingSlots(plan)[0];
  const hp = profession === 'slime-caster' ? SMART_VIRUS_BALANCE.casterHp : profession === 'nest-builder' ? SMART_VIRUS_BALANCE.builderHp
    : profession === 'brood-nest' ? SMART_VIRUS_BALANCE.nestHp : SMART_VIRUS_BALANCE.fastlingHp;
  const target: Target = { ...point(at), id: `${plan.id}:${slot}`, kind: 'single', role: profession === 'brood-nest' ? 'nest' : 'virus', profession,
    radius: profession === 'brood-nest' ? 28 : profession === 'fastling' ? 12 : 22, hp, maxHp: hp, hitUntil: 0, scanned: false,
    traits: [], born: state.elapsed, generation: profession === 'fastling' ? 1 : 0, sourceId: `endless:wave:${plan.wave}`, waveId: plan.wave,
    blocksWaveClear: true, tactic: 'melee', facing: 0, attackReady: state.elapsed + SMART_VIRUS_BALANCE.spawnGrace, smartSupportId: plan.id };
  plan.bornSlots.push(slot); plan.memberIds.push(target.id); state.targets.push(target);
  e.spawnedIds.push(target.id); e.spawnSerial++; e.remainingToSpawn = Math.max(0, e.remainingToSpawn - 1);
  host.emit('ACTOR_SPAWNED', { id: target.id, role: target.role!, profession, sourceId: target.sourceId!, wave: plan.wave, slot, generation: target.generation!, traits: '', x: at.x, y: at.y });
  return target;
}

/** Construction is allowed only on actual infected, reachable ground. */
export function smartNestPosition(state: GameState, plan: SmartSupportPlan, builder: Target): Vec | undefined {
  if (!state.territory) return;
  const lane = TERRITORY_LANES.find(l => l.id === plan.laneId)!, front = state.territory.nodes.find(n => n.id === lane.frontNodeId)!;
  const direction = Math.atan2(front.y - builder.y, front.x - builder.x);
  for (let attempt = 0; attempt < 32; attempt++) {
    const a = direction + attempt * Math.PI / 8, r = attempt < 16 ? 85 : 150;
    const p = { x: builder.x + Math.cos(a) * r, y: builder.y + Math.sin(a) * r };
    if (territoryNodeAt(state.territory, p)?.owner !== 'infected' || !isLegalPosition(p, 30, activeWorld(state)) || !clearLane(state, builder, p)) continue;
    if (state.territory.nodes.some(n => n.kind === 'healing' && distance(n, p) < 120)) continue;
    if (state.targets.some(t => t.hp > 0 && t.id !== builder.id && distance(t, p) < t.radius + 36)) continue;
    if (ritualSpawnReserved(state, p, 28)) continue;
    return p;
  }
}

export function advanceSmartViruses(host: SmartVirusHost) {
  const state = host.state, e = state.endless; if (!live(state) || !e) return;
  const smart = state.smartViruses ??= { serial: 0, slime: [] };
  smart.slime = smart.slime.filter(cast => cast.wave === e.wave && cast.expiresAt > state.elapsed);
  for (const cast of [...smart.slime]) {
    const actor = state.targets.find(t => t.id === cast.actorId);
    if (cast.phase === 'windup') {
      if (!actor || actor.hp <= 0) { smart.slime = smart.slime.filter(c => c !== cast); continue; }
      if (state.elapsed + EPS >= cast.firesAt) { cast.phase = 'flight'; actor.attackAt = undefined; actor.attackAim = undefined; host.emit('SLIME_FIRED', { id: cast.id, actorId: cast.actorId, x: cast.aim.x, y: cast.aim.y }); }
    }
    if (cast.phase === 'flight' && state.elapsed + EPS >= cast.landsAt) { cast.phase = 'pool'; host.emit('SLIME_LANDED', { id: cast.id, x: cast.aim.x, y: cast.aim.y, radius: SMART_VIRUS_BALANCE.slimeRadius }); }
  }
  for (const plan of e.smartSupport?.plans ?? []) {
    if (!live(state) || host.state !== state) return;
    const sourceGone = state.territory!.stage !== 'guard' && state.territory!.sources[plan.sourceId].destroyed;
    if (sourceGone || ['bossPending', 'boss', 'cleanup', 'victory'].includes(state.territory!.stage))
      cancelFuture(host, plan, 'source-cleared', state.territory!.stage === 'bossPending' && e.remainingToSpawn === 0);
    if (plan.status === 'canceled' || plan.status === 'complete') continue;
    if (plan.kind === 'ritual') {
      if (plan.wave !== 3 && state.territory!.stage !== 'guard') { cancelFuture(host, plan, 'guard-only'); continue; }
      if (plan.status === 'pending') {
        if (e.phase !== 'combat' || sourceGone || state.elapsed < e.phaseStartedAt + plan.departureOffset - SMART_VIRUS_BALANCE.warningSeconds) continue;
        if (combatPopulation(state).reserved + 4 > combatPopulationLimit(state)) continue;
        if (state.smartViruses?.ritual?.encounters.some(encounter => encounter.priestIds.concat(encounter.motherId).some(id => state.targets.some(t => t.id === id && t.hp > 0)))) continue;
        plan.ritualPositions = ritualArrangement(state, plan);
        if (!plan.ritualPositions) { cancelFuture(host, plan, 'no-ritual-position'); continue; }
        plan.status = 'warning'; plan.warnedAt = state.elapsed;
        host.emit('RITUAL_WARNING', { id: plan.id, wave: plan.wave, x: plan.ritualPositions[0].x, y: plan.ritualPositions[0].y, duration: 4 });
        host.message?.('感染祭团即将出现：三名祭司法师维持母体护膜，优先剿灭法师。', 4, 2);
      }
      if (plan.status === 'warning' && state.elapsed + EPS >= plan.warnedAt! + 4) {
        if (!ritualArrangementValid(state, plan.ritualPositions ?? [])) { cancelFuture(host, plan, 'ritual-warning-invalidated'); continue; }
        spawnRitual(host, plan);
      }
      if (plan.status === 'active' && !plan.memberIds.some(id => state.targets.some(t => t.id === id && t.hp > 0))) plan.status = 'complete';
      continue;
    }
    if (plan.status === 'pending' || plan.status === 'warning') {
      if (e.phase !== 'combat' || sourceGone) continue;
      const due = e.phaseStartedAt + plan.departureOffset;
      if (plan.status === 'pending' && state.elapsed + EPS >= due - SMART_VIRUS_BALANCE.warningSeconds) {
        plan.status = 'warning'; plan.warnedAt = state.elapsed;
        host.emit('SMART_SUPPORT_WARNING', { id: plan.id, kind: plan.kind, laneId: plan.laneId, duration: SMART_VIRUS_BALANCE.warningSeconds });
        host.message?.(`${plan.laneId==='north'?'北':'南'}线${plan.kind==='caster'?'黏液法师将抵达：看到落点圈及时离开。':'筑巢者将抵达：优先击杀，阻止小巢孵化。'}`,4,2);
      }
      if (plan.status !== 'warning' || state.elapsed + EPS < Math.max(due, plan.warnedAt! + SMART_VIRUS_BALANCE.warningSeconds) || state.elapsed < (plan.retryAt ?? 0)) continue;
      if (combatPopulation(state).reserved + plan.slots.length > combatPopulationLimit(state)) { plan.retryAt = state.elapsed + .25; continue; }
      const p = spawnPoint(state, plan, 22); if (!p) { plan.retryAt = state.elapsed + .5; continue; }
      plan.status = 'active';
      const body = birth(host, plan, plan.kind === 'caster' ? 'slime-caster' : 'nest-builder', p);
      if (plan.kind === 'brood') plan.builderId = body.id;
      continue;
    }
    if (plan.kind === 'brood' && smartRemainingSlots(plan).length) {
      const builder = state.targets.find(t => t.id === plan.builderId), nest = state.targets.find(t => t.id === plan.nestId);
      if (!plan.nestId && (!builder || builder.hp <= 0)) { cancelFuture(host, plan, 'builder-killed'); continue; }
      if (plan.nestId && (!nest || nest.hp <= 0)) { cancelFuture(host, plan, 'nest-destroyed'); continue; }
      if (nest && plan.nextHatchAt !== undefined && state.elapsed + EPS >= plan.nextHatchAt) {
        let born = 0;
        while (born < SMART_VIRUS_BALANCE.hatchBatch && smartRemainingSlots(plan).length) {
          const p = spawnPoint(state, plan, 12, nest, true); if (!p) break;
          const child = birth(host, plan, 'fastling', p);
          if (born === 1) child.springRaidLane = plan.laneId;
          born++;
        }
        if (born) { plan.nextHatchAt = state.elapsed + SMART_VIRUS_BALANCE.hatchInterval; delete plan.blockedSince;
          host.emit('BROOD_HATCHED', { id: nest.id, count: born, remaining: smartRemainingSlots(plan).length }); }
        else { plan.blockedSince ??= state.elapsed; if (state.elapsed - plan.blockedSince >= 4) cancelFuture(host, plan, 'hatch-blocked'); }
      }
    }
    if (!smartRemainingSlots(plan).length && !plan.memberIds.some(id => state.targets.some(t => t.id === id && (t.hp > 0 || t.splitAt !== undefined)))) plan.status = 'complete';
  }
  advanceRituals(host);
}

function moveSmart(state: GameState, actor: Target, goal: Vec, speed: number, dt: number) {
  const base = activeWorld(state), bodies = state.targets.filter(t => t.hp > 0 && (t.role === 'source' || t.role === 'nest'));
  const signature = bodies.map(t => `${t.id}:${t.x}:${t.y}`).join('|'); let route = routeWorlds.get(state);
  if (!route || route.base !== base || route.signature !== signature) {
    route = { base, signature, world: bodies.length ? { ...base, obstacles: [...base.obstacles, ...bodies.map(t => ({ id: t.id, x: t.x, y: t.y, radius: t.radius + 3 }))] } : base };
    routeWorlds.set(state, route);
  }
  const next = navigator(state).waypoint(actor, goal, route.world, state.elapsed), d = normalized(next.x - actor.x, next.y - actor.y);
  const step = Math.min(speed * dt, distance(actor, goal));
  const p = moveEnemyThroughCrowd(actor, { x: d.x * step, y: d.y * step }, state.targets, activeWorld(state));
  actor.x = p.x; actor.y = p.y; if (d.x || d.y) actor.facing = Math.atan2(d.y, d.x);
}
/** Returns true when a profession owns the complete action this step. */
export function advanceSmartVirusActor(host: SmartVirusHost, actor: Target, dt = BALANCE.step): boolean {
  const state = host.state, B = SMART_VIRUS_BALANCE;
  if (!state.territory || !actor.profession || actor.profession === 'fastling') return false;
  if (actor.profession === 'ritual-mother' || actor.profession === 'ritual-priest') return true;
  if (actor.profession === 'brood-nest') return true;
  if (actor.profession === 'slime-caster') {
    const smart = state.smartViruses ??= { serial: 0, slime: [] };
    if (smart.slime.some(c => c.actorId === actor.id && c.phase === 'windup')) return true;
    const gap = distance(actor, state.player);
    if (gap < B.castInner) {
      const dir = normalized(actor.x - state.player.x, actor.y - state.player.y);
      const goal = moveWithCollision(actor, { x: dir.x * 80, y: dir.y * 80 }, actor.radius, activeWorld(state)); moveSmart(state, actor, goal, B.casterSpeed, dt);
    } else if (gap > B.castOuter) moveSmart(state, actor, state.player, B.casterSpeed, dt);
    if (!isTerritoryPlayerAirborne(state) && distance(actor, state.player) <= B.castRange && clearLane(state, actor, state.player, state.player.radius)
      && state.elapsed >= (actor.attackReady ?? 0) && smart.slime.length < B.slimeCap) {
      const firesAt = state.elapsed + B.castWindup, landsAt = firesAt + B.slimeFlight;
      actor.facing = Math.atan2(state.player.y - actor.y, state.player.x - actor.x);
      const cast: SlimeCast = { id: `slime:${++smart.serial}`, actorId: actor.id, wave: state.endless!.wave, origin: point(actor), aim: point(state.player),
        warnedAt: state.elapsed, firesAt, landsAt, expiresAt: landsAt + B.slimeSeconds, phase: 'windup' };
      smart.slime.push(cast); actor.attackAt = firesAt; actor.attackAim = point(cast.aim); actor.attackWindup = B.castWindup; actor.attackReady = firesAt + B.castInterval;
      host.emit('SLIME_WARNED', { id: cast.id, actorId: actor.id, x: cast.aim.x, y: cast.aim.y, radius: B.slimeRadius, landsAt });
    }
    return true;
  }
  const plan = state.endless?.smartSupport?.plans.find(p => p.id === actor.smartSupportId);
  if (!plan || plan.nestId || !smartRemainingSlots(plan).length) return false;
  plan.nestPosition ??= smartNestPosition(state, plan, actor);
  if (!plan.nestPosition) { cancelFuture(host, plan, 'no-build-position'); return false; }
  if (distance(actor, plan.nestPosition) > 70) { moveSmart(state, actor, plan.nestPosition, B.builderSpeed, dt); return true; }
  if (plan.buildUntil === undefined) {
    plan.buildUntil = state.elapsed + B.buildSeconds;
    host.emit('BROOD_CONSTRUCTION_STARTED', { id: actor.id, x: plan.nestPosition.x, y: plan.nestPosition.y, finishesAt: plan.buildUntil });
  }
  if (state.elapsed + EPS >= plan.buildUntil) {
    if (territoryNodeAt(state.territory, plan.nestPosition)?.owner !== 'infected') { cancelFuture(host, plan, 'ground-purified'); return false; }
    if (ritualSpawnReserved(state, plan.nestPosition, 28)) return true;
    if (state.targets.some(t => t.hp > 0 && distance(t, plan.nestPosition!) < t.radius + 30)) {
      plan.blockedSince ??= state.elapsed;
      if (state.elapsed - plan.blockedSince >= 4) { cancelFuture(host, plan, 'construction-blocked'); return false; }
      return true;
    }
    const nest = birth(host, plan, 'brood-nest', plan.nestPosition); plan.nestId = nest.id; delete plan.buildUntil;
    delete plan.blockedSince;
    plan.nextHatchAt = state.elapsed + B.firstHatchSeconds;
    host.emit('BROOD_CONSTRUCTED', { id: nest.id, builderId: actor.id, x: nest.x, y: nest.y, remaining: smartRemainingSlots(plan).length });
  }
  return true;
}
export function playerSlimeMultiplier(state: GameState): number {
  if (isTerritoryPlayerAirborne(state) || state.elapsed < state.player.dashUntil) return 1;
  return state.smartViruses?.slime.some(c => c.phase === 'pool' && c.expiresAt > state.elapsed
    && distance(state.player, c.aim) <= SMART_VIRUS_BALANCE.slimeRadius + state.player.radius && clearLane(state, c.aim, state.player, state.player.radius))
    ? SMART_VIRUS_BALANCE.slimeSlow : 1;
}
export function smartSpringRaidGoal(state: GameState, actor: Target) {
  if (!actor.springRaidLane || !state.territory || actor.profession && actor.profession !== 'fastling' || actor.territoryTask) return;
  const lane = TERRITORY_LANES.find(l => l.id === actor.springRaidLane)!;
  const front = state.territory.nodes.find(n => n.id === lane.frontNodeId), spring = state.territory.nodes.find(n => n.id === lane.healingNodeId);
  return front?.owner === 'infected' && spring?.owner === 'healthy' ? spring : undefined;
}
