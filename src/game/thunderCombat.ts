import { clamp, distance, moveWithCollision, normalized, rayCircle, wallHit } from '../actors/collision';
import { createEndlessGrowth, endlessCombatStats } from './endlessGrowth';
import type { EndlessCombatStats } from './endlessGrowthTypes';
import { weaponCombatProfile } from './expedition';
import type { DamageOrigin } from './growthTypes';
import type { PlayerProjectileHost } from './playerProjectiles';
import { activeWorld, BALANCE, type GameState, type Target, type Vec } from './types';
import type { ThunderCombatState, ThunderLink, WeaponSkillSlot } from './weaponSkillsTypes';
import { weaponAimDirection, weaponCombatAvailable, weaponOrigin } from './weaponMelee';

export const THUNDER_BALANCE = {
  primary: { radius: 240, targets: 8, interval: .1, branchFactor: .35, jumpRange: 120, markDuration: 3 },
  detonate: { radius: 300, markedFactor: 4, ordinaryFactor: 1, cooldown: 5 },
  rod: { range: 450, radius: 200, duration: 4, pullDuration: .4, pullDistance: 120, factor: 1.5, cooldown: 9 },
  dash: { range: 280, duration: .18, factor: 2.5, cooldown: 10, trailWidth: 80, trailDuration: 2.5, trailInterval: .25, trailFactor: .25 },
  storm: { radius: 360, duration: 6, interval: .5, targets: 12, factor: .5, recastAfter: .35, collapseDelay: .25, finalFactor: 4, markedFactor: 4 },
} as const;
const point = (p: Vec): Vec => ({ x: p.x, y: p.y });
const profile = (state: GameState) => endlessCombatStats(state.endlessGrowth ?? createEndlessGrowth(0));
function runtime(state: GameState): ThunderCombatState | undefined {
  if (state.weaponCombat?.loadout.weaponId !== 'thunder') return;
  return state.weaponCombat.thunder ??= { marks: [], trails: [] };
}
function visible(state: GameState, from: Vec, target: Vec, targetRadius = 0): boolean {
  const gap = distance(from, target), direction = normalized(target.x - from.x, target.y - from.y);
  const block = wallHit(from, direction, gap, activeWorld(state));
  return block === null || block >= gap - targetRadius - 1e-7;
}
function candidates(state: GameState, center: Vec, radius: number): Target[] {
  return state.targets.filter(target => target.hp > 0 && target.role !== 'event' && target.role !== 'capsule'
    && distance(center, target) <= radius + target.radius && visible(state, center, target, target.radius))
    .sort((a, b) => distance(center, a) - distance(center, b) || a.id.localeCompare(b.id));
}
function valid(host: PlayerProjectileHost, state: GameState, thunder: ThunderCombatState): boolean {
  return host.state === state && state.weaponCombat?.thunder === thunder && weaponCombatAvailable(state);
}
function mark(state: GameState, target: Target): void {
  const thunder = runtime(state); if (!thunder || target.hp <= 0) return;
  const existing = thunder.marks.find(item => item.targetId === target.id);
  if (existing) existing.until = state.elapsed + THUNDER_BALANCE.primary.markDuration;
  else thunder.marks.push({ targetId: target.id, until: state.elapsed + THUNDER_BALANCE.primary.markDuration });
}
function marked(thunder: ThunderCombatState, id: string, now: number): boolean {
  return thunder.marks.some(item => item.targetId === id && item.until > now + 1e-8);
}
function consumeMark(thunder: ThunderCombatState, id: string): void {
  thunder.marks = thunder.marks.filter(item => item.targetId !== id);
}
function damage(host: PlayerProjectileHost, target: Target, amount: number, origin: DamageOrigin, electrify = false): number {
  if (target.hp <= 0 || !host.state.targets.includes(target)) return 0;
  const state = host.state, actual = host.damage(target, amount, origin);
  if (actual > 0 && electrify && host.state === state) mark(state, target);
  return actual;
}
function primaryOrigin(castId: string): DamageOrigin {
  return { cause: 'basic', basicTool: 1, weaponId: 'thunder', castId, rootId: castId, damageCategory: 'precision', armorResponse: 'heavy', allowChain: false };
}
function rodPowered(state: GameState, thunder: ThunderCombatState, held: boolean): boolean {
  return !!thunder.rod && state.elapsed < thunder.rod.until && held
    && distance(state.player, thunder.rod) <= THUNDER_BALANCE.rod.range && visible(state, state.player, thunder.rod);
}
function links(state: GameState, thunder: ThunderCombatState, aim: Vec, stats: EndlessCombatStats): ThunderLink[] {
  const bodies = candidates(state, state.player, THUNDER_BALANCE.primary.radius);
  const choices: { target: Target; from: Vec }[] = bodies.map(target => ({ target, from: state.player }));
  if (thunder.rod?.powered) for (const target of candidates(state, thunder.rod, thunder.rod.radius)) {
    if (!choices.some(choice => choice.target.id === target.id)) choices.push({ target, from: thunder.rod });
  }
  // Aim chooses across the complete powered network before its shared budget
  // is applied; empty ground keeps nearest-local-first ordering.
  const pointed = choices.filter(choice => distance(aim, choice.target) <= choice.target.radius + 44)
    .sort((a, b) => distance(aim, a.target) - distance(aim, b.target) || a.target.id.localeCompare(b.target.id))[0];
  if (pointed) choices.splice(choices.indexOf(pointed), 1), choices.unshift(pointed);
  const budget = THUNDER_BALANCE.primary.targets + stats.shotRays - 1;
  const selected = choices.slice(0, budget), result: ThunderLink[] = selected.map(({ target, from }, i) => ({ targetId: target.id, from: point(from), to: point(target), main: i === 0 }));
  // Each pierce rank buys one extra one-hop branch; branches cannot branch again.
  for (let n = 0; n < stats.pierceCount; n++) {
    let found: { target: Target; from: Target } | undefined;
    for (const root of selected) {
      const target = candidates(state, root.target, THUNDER_BALANCE.primary.jumpRange)
        .find(body => !result.some(link => link.targetId === body.id));
      if (target && (!found || distance(root.target, target) < distance(found.from, found.target))) found = { target, from: root.target };
    }
    if (!found) break;
    result.push({ targetId: found.target.id, from: point(found.from), to: point(found.target), main: false, fromTargetId: found.from.id });
  }
  return result;
}
function pulse(host: PlayerProjectileHost, aim: Vec, stats: EndlessCombatStats): void {
  const state = host.state, thunder = runtime(state), channel = thunder?.channel;
  if (!thunder || !channel) return;
  channel.links = links(state, thunder, aim, stats);
  const base = weaponCombatProfile(state.weaponCombat!.loadout, stats.damageMultiplier).primaryDamage
    * THUNDER_BALANCE.primary.interval / stats.primaryCooldown;
  let hits = 0; const acceptedRoots = new Set<string>();
  const transactionId = `${channel.castId}:pulse:${Math.round(channel.nextAt * 1e6)}`;
  for (const link of channel.links) {
    if (!valid(host, state, thunder)) return;
    const target = state.targets.find(body => body.id === link.targetId);
    if (link.fromTargetId && !acceptedRoots.has(link.fromTargetId)) continue;
    if (target && damage(host, target, base * (link.main ? 1 : THUNDER_BALANCE.primary.branchFactor),
      { ...primaryOrigin(transactionId), damageCategory: link.main ? 'precision' : 'area' }, true) > 0) { hits++; acceptedRoots.add(target.id); }
  }
  if (!valid(host, state, thunder)) return;
  state.player.actionUntil = state.elapsed + .15;
  host.emit('THUNDER_PULSE', { castId: channel.castId, weaponId: 'thunder', hits, x: state.player.x, y: state.player.y, radius: THUNDER_BALANCE.primary.radius });
  if (!valid(host, state, thunder)) return;
  host.emit('TOOL_FIRED', { tool: 1, weaponId: 'thunder', castId: transactionId, x: aim.x, y: aim.y, hit: hits > 0, rays: channel.links.length, pierce: stats.pierceCount });
  if (!valid(host, state, thunder)) return;
  channel.links = links(state, thunder, aim, stats);
}
export function stopThunderPrimary(state: GameState): void {
  const thunder = state.weaponCombat?.thunder; if (!thunder) return;
  delete thunder.channel;
  if (thunder.rod) thunder.rod.powered = false;
}
export function clearThunderCombat(state: GameState): void {
  if (!state.weaponCombat) return;
  delete state.weaponCombat.thunder;
  if (state.weaponCombat.ultimate?.id === 'thunder-ultimate') delete state.weaponCombat.ultimate;
}
export function startThunderPrimary(host: PlayerProjectileHost, aim: Vec, stats: EndlessCombatStats, castId: string): boolean {
  const state = host.state;
  if (!weaponCombatAvailable(state) || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return false;
  const thunder = runtime(state); if (!thunder) return false;
  if (thunder.channel) return true;
  const readyAt = Math.max(state.elapsed, thunder.nextPrimaryAt ?? state.elapsed);
  thunder.channel = { castId, startedAt: state.elapsed, nextAt: readyAt, links: [] };
  if (thunder.rod) thunder.rod.powered = rodPowered(state, thunder, true);
  host.emit('THUNDER_CHANNEL_STARTED', { weaponId: 'thunder', castId, x: state.player.x, y: state.player.y });
  if (valid(host, state, thunder) && state.elapsed + 1e-8 >= readyAt) {
    thunder.channel.nextAt = state.elapsed + THUNDER_BALANCE.primary.interval;
    thunder.nextPrimaryAt = thunder.channel.nextAt;
    pulse(host, aim, stats);
  }
  return true;
}
function boundedPoint(state: GameState, aim: Vec, range: number, radius = 0): Vec {
  const direction = weaponAimDirection(state, aim), world = activeWorld(state);
  let travel = Math.min(range, distance(state.player, aim));
  for (const obstacle of world.obstacles) {
    const hit = rayCircle(state.player, direction, obstacle, obstacle.radius + radius, travel);
    if (hit !== null) travel = Math.max(0, hit - 1e-5);
  }
  const b = world.bounds;
  if (direction.x > 0) travel = Math.min(travel, (b.right - radius - state.player.x) / direction.x);
  if (direction.x < 0) travel = Math.min(travel, (b.left + radius - state.player.x) / direction.x);
  if (direction.y > 0) travel = Math.min(travel, (b.bottom - radius - state.player.y) / direction.y);
  if (direction.y < 0) travel = Math.min(travel, (b.top + radius - state.player.y) / direction.y);
  return { x: state.player.x + direction.x * Math.max(0, travel), y: state.player.y + direction.y * Math.max(0, travel) };
}
function area(host: PlayerProjectileHost, center: Vec, radius: number, amount: number, origin: DamageOrigin, electrify = false): void {
  const state = host.state, thunder = runtime(state); if (!thunder) return;
  for (const target of candidates(state, center, radius)) {
    if (!valid(host, state, thunder)) return;
    damage(host, target, amount, origin, electrify);
  }
}
export function castThunderSkill(host: PlayerProjectileHost, slot: WeaponSkillSlot, aim: Vec, castId: string): boolean {
  const state = host.state, thunder = runtime(state); if (!thunder) return false;
  const stats = profile(state), base = weaponCombatProfile(state.weaponCombat!.loadout, stats.damageMultiplier).primaryDamage;
  // Reserve the cast before synchronous damage callbacks can cast again.
  state.weaponCombat!.cooldowns[slot] = state.elapsed + (slot === 1 ? THUNDER_BALANCE.detonate.cooldown : slot === 2 ? THUNDER_BALANCE.rod.cooldown : THUNDER_BALANCE.dash.cooldown);
  if (slot === 1) {
    const centers: { center: Vec; radius: number }[] = [{ center: point(state.player), radius: THUNDER_BALANCE.detonate.radius }];
    if (thunder.rod && rodPowered(state, thunder, !!thunder.channel)) centers.push({ center: point(thunder.rod), radius: thunder.rod.radius });
    const visited = new Set<string>(), origin = weaponOrigin(state, 'thunder-spear', castId); let hits = 0;
    for (const { center, radius } of centers) for (const target of candidates(state, center, radius)) {
      if (!valid(host, state, thunder)) return true;
      if (visited.has(target.id)) continue;
      visited.add(target.id);
      const charged = marked(thunder, target.id, state.elapsed); consumeMark(thunder, target.id);
      const actual = damage(host, target, base * (charged ? THUNDER_BALANCE.detonate.markedFactor : THUNDER_BALANCE.detonate.ordinaryFactor), origin);
      if (actual > 0) { hits++; host.emit('THUNDER_DETONATE_HIT', { weaponId: 'thunder', castId, targetId: target.id, x: target.x, y: target.y, charged, damage: actual }); }
    }
    if (valid(host, state, thunder)) host.emit('THUNDER_DETONATE', { weaponId: 'thunder', castId, x: state.player.x, y: state.player.y, radius: THUNDER_BALANCE.detonate.radius, hits });
  } else if (slot === 2) {
    const center = boundedPoint(state, aim, THUNDER_BALANCE.rod.range, 4), radius = THUNDER_BALANCE.rod.radius + stats.areaRadius - BALANCE.areaRadius;
    thunder.rod = { ...center, castId, startedAt: state.elapsed, until: state.elapsed + THUNDER_BALANCE.rod.duration,
      radius, powered: false, pullUntil: state.elapsed + THUNDER_BALANCE.rod.pullDuration, nextPullAt: state.elapsed,
      damage: base * THUNDER_BALANCE.rod.factor * stats.areaDamageMultiplier, moved: {},
      ...(stats.catalysisDamage > 0 ? { aftershockAt: state.elapsed + .35, aftershockDamage: base * THUNDER_BALANCE.rod.factor * stats.areaDamageMultiplier * .4 } : {}) };
    thunder.rod.powered = rodPowered(state, thunder, !!thunder.channel);
    host.emit('THUNDER_ROD_PLANTED', { weaponId: 'thunder', castId, x: center.x, y: center.y, radius, until: thunder.rod.until });
    if (valid(host, state, thunder)) area(host, center, radius, thunder.rod.damage, weaponOrigin(state, 'thunder-cage', castId));
  } else {
    const direction = weaponAimDirection(state, aim), intended = { x: state.player.x + direction.x * THUNDER_BALANCE.dash.range, y: state.player.y + direction.y * THUNDER_BALANCE.dash.range };
    const to = boundedPoint(state, intended, THUNDER_BALANCE.dash.range, state.player.radius), from = point(state.player);
    thunder.dash = { castId, from, to, direction, startedAt: state.elapsed, until: state.elapsed + THUNDER_BALANCE.dash.duration,
      lastAt: state.elapsed, damage: base * THUNDER_BALANCE.dash.factor, hitIds: [], path: [from] };
    thunder.trails.push({ castId, from, to: from, startedAt: state.elapsed, until: thunder.dash.until + THUNDER_BALANCE.dash.trailDuration,
      nextAt: state.elapsed + THUNDER_BALANCE.dash.trailInterval, damage: base * THUNDER_BALANCE.dash.trailFactor });
    thunder.trails = thunder.trails.slice(-8);
    host.emit('THUNDER_DASH_STARTED', { weaponId: 'thunder', castId, x: from.x, y: from.y, toX: to.x, toY: to.y, until: thunder.dash.until });
  }
  return true;
}
function segmentDistance(p: Vec, from: Vec, to: Vec): number {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const t = length ? clamp(((p.x - from.x) * dx + (p.y - from.y) * dy) / length, 0, 1) : 0;
  return distance(p, { x: from.x + dx * t, y: from.y + dy * t });
}
function advanceDash(host: PlayerProjectileHost, thunder: ThunderCombatState): void {
  const state = host.state, dash = thunder.dash; if (!dash) return;
  const at = Math.min(state.elapsed, dash.until), t = clamp((at - dash.startedAt) / THUNDER_BALANCE.dash.duration, 0, 1);
  if (at <= dash.lastAt + 1e-8) return;
  dash.lastAt = at;
  const from = point(state.player), desired = { x: dash.from.x + (dash.to.x - dash.from.x) * t, y: dash.from.y + (dash.to.y - dash.from.y) * t };
  const to = moveWithCollision(from, { x: desired.x - from.x, y: desired.y - from.y }, state.player.radius, activeWorld(state));
  Object.assign(state.player, to); dash.path.push(to);
  const trail = thunder.trails.find(item => item.castId === dash.castId); if (trail) trail.to = to;
  for (const target of state.targets) {
    if (!valid(host, state, thunder)) return;
    if (target.hp <= 0 || target.role === 'event' || target.role === 'capsule' || dash.hitIds.includes(target.id)
      || segmentDistance(target, from, to) > THUNDER_BALANCE.dash.trailWidth / 2 + target.radius
      || !visible(state, from, target, target.radius)) continue;
    dash.hitIds.push(target.id); damage(host, target, dash.damage, weaponOrigin(state, 'thunder-overdrive', dash.castId), true);
  }
  if (!valid(host, state, thunder)) return;
  host.emit('THUNDER_DASH_ADVANCED', { weaponId: 'thunder', castId: dash.castId, x: to.x, y: to.y, fromX: from.x, fromY: from.y });
  if (state.elapsed + 1e-8 >= dash.until) delete thunder.dash;
}
function advanceRod(host: PlayerProjectileHost, thunder: ThunderCombatState, held: boolean): void {
  const state = host.state, rod = thunder.rod; if (!rod) return;
  if (state.elapsed >= rod.until - 1e-8) { delete thunder.rod; return; }
  const powered = rodPowered(state, thunder, held);
  if (powered !== rod.powered) { rod.powered = powered; host.emit('THUNDER_ROD_POWER_CHANGED', { weaponId: 'thunder', castId: rod.castId, powered, x: rod.x, y: rod.y }); }
  const through = Math.min(state.elapsed, rod.pullUntil), duration = Math.max(0, through - rod.nextPullAt); rod.nextPullAt = Math.max(rod.nextPullAt, through);
  if (duration > 0) for (const target of candidates(state, rod, rod.radius)) {
    if (target.role !== 'virus' && target.role !== 'elite' || target.profession === 'ritual-mother' || target.profession === 'ritual-priest'
      || target.attackPlan || target.charge || (target.recoverUntil ?? 0) > state.elapsed || target.attackAt !== undefined && target.attackAt >= state.elapsed) continue;
    const factor = target.role === 'elite' || target.traits?.includes('CARAPACE') ? .35 : 1, moved = rod.moved[target.id] ?? 0;
    const amount = Math.min(THUNDER_BALANCE.rod.pullDistance * factor - moved, THUNDER_BALANCE.rod.pullDistance * duration / THUNDER_BALANCE.rod.pullDuration * factor,
      Math.max(0, distance(rod, target) - target.radius - 12));
    if (amount <= 0) continue;
    const direction = normalized(rod.x - target.x, rod.y - target.y), to = moveWithCollision(target, { x: direction.x * amount, y: direction.y * amount }, target.radius, activeWorld(state));
    rod.moved[target.id] = moved + distance(target, to); Object.assign(target, to);
  }
  if (rod.aftershockAt !== undefined && state.elapsed + 1e-8 >= rod.aftershockAt) {
    delete rod.aftershockAt;
    area(host, rod, rod.radius * .75, rod.aftershockDamage ?? 0, { ...weaponOrigin(state, 'thunder-cage', rod.castId), ability: 'cannon-aftershock', allowChain: false });
  }
}
export function canRecastThunder(state: GameState): boolean {
  const storm = state.weaponCombat?.thunder?.storm;
  return weaponCombatAvailable(state) && storm?.phase === 'storm' && state.elapsed + 1e-8 >= storm.startedAt + THUNDER_BALANCE.storm.recastAfter;
}
export function beginThunderStorm(host: PlayerProjectileHost, castId: string, base: number): void {
  const state = host.state, thunder = runtime(state); if (!thunder) return;
  thunder.storm = { castId, phase: 'storm', startedAt: state.elapsed, until: state.elapsed + THUNDER_BALANCE.storm.duration,
    nextAt: state.elapsed + THUNDER_BALANCE.storm.interval, damage: base, center: point(state.player) };
}
export function recastThunderStorm(host: PlayerProjectileHost): boolean {
  const state = host.state, storm = state.weaponCombat?.thunder?.storm; if (!storm || !canRecastThunder(state)) return false;
  collapse(host, storm); return true;
}
function collapse(host: PlayerProjectileHost, storm: NonNullable<ThunderCombatState['storm']>): void {
  const state = host.state;
  storm.phase = 'collapse'; storm.duration = clamp(state.elapsed - storm.startedAt, 0, THUNDER_BALANCE.storm.duration);
  storm.collapseAt = state.elapsed + THUNDER_BALANCE.storm.collapseDelay;
  storm.until = storm.collapseAt;
  if (state.weaponCombat?.ultimate) state.weaponCombat.ultimate.until = storm.until;
  host.emit('THUNDER_STORM_COLLAPSE', { weaponId: 'thunder', castId: storm.castId, x: state.player.x, y: state.player.y, at: storm.collapseAt, duration: storm.duration });
}
function advanceStorm(host: PlayerProjectileHost, thunder: ThunderCombatState): void {
  const state = host.state, storm = thunder.storm; if (!storm) return;
  storm.center = point(state.player);
  const origin = weaponOrigin(state, 'thunder-ultimate', storm.castId);
  while (storm.phase === 'storm' && storm.nextAt <= Math.min(state.elapsed, storm.until) + 1e-8) {
    storm.nextAt += THUNDER_BALANCE.storm.interval;
    for (const target of candidates(state, state.player, THUNDER_BALANCE.storm.radius).slice(0, THUNDER_BALANCE.storm.targets)) {
      if (!valid(host, state, thunder)) return;
      const actual = damage(host, target, storm.damage * THUNDER_BALANCE.storm.factor, origin);
      if (actual > 0) host.emit('THUNDER_STORM_HIT', { weaponId: 'thunder', castId: storm.castId, targetId: target.id, x: target.x, y: target.y });
    }
    if (!valid(host, state, thunder)) return;
    host.emit('WEAPON_ULTIMATE_PULSE', { weaponId: 'thunder', ultimateId: 'thunder-ultimate', skillId: 'thunder-ultimate', castId: storm.castId,
      x: state.player.x, y: state.player.y, radius: THUNDER_BALANCE.storm.radius, final: false });
  }
  if (storm.phase === 'storm' && state.elapsed >= storm.until - 1e-8) collapse(host, storm);
  if (!valid(host, state, thunder) || storm.phase !== 'collapse' || state.elapsed + 1e-8 < storm.collapseAt!) return;
  // Claim the one final transaction before callbacks can request another collapse.
  delete thunder.storm; delete state.weaponCombat!.ultimate;
  const center = point(state.player), targets = candidates(state, center, THUNDER_BALANCE.storm.radius);
  host.emit('WEAPON_ULTIMATE_PULSE', { weaponId: 'thunder', ultimateId: 'thunder-ultimate', skillId: 'thunder-ultimate', castId: storm.castId,
    x: center.x, y: center.y, radius: THUNDER_BALANCE.storm.radius, final: true, thunder: true, duration: storm.duration ?? THUNDER_BALANCE.storm.duration });
  for (const target of targets) {
    if (!valid(host, state, thunder)) return;
    const charged = marked(thunder, target.id, state.elapsed); consumeMark(thunder, target.id);
    const factor = THUNDER_BALANCE.storm.finalFactor + (charged ? THUNDER_BALANCE.storm.markedFactor * clamp((storm.duration ?? 6) / 6, 0, 1) : 0);
    damage(host, target, storm.damage * factor, origin);
  }
}
export function advanceThunderCombat(host: PlayerProjectileHost, aim: Vec, dt = BALANCE.step, held = false): void {
  const state = host.state;
  if (state.phase === 'paused' || !Number.isFinite(dt) || dt <= 0) return;
  if (!weaponCombatAvailable(state)) { clearThunderCombat(state); return; }
  const thunder = runtime(state); if (!thunder) return;
  thunder.marks = thunder.marks.filter(item => item.until > state.elapsed + 1e-8 && state.targets.some(body => body.id === item.targetId && body.hp > 0));
  advanceDash(host, thunder); if (!valid(host, state, thunder)) return;
  advanceRod(host, thunder, held); if (!valid(host, state, thunder)) return;
  if (!held) {
    if (thunder.channel) host.emit('THUNDER_CHANNEL_STOPPED', { weaponId: 'thunder', castId: thunder.channel.castId });
    stopThunderPrimary(state);
  } else {
    const stats = profile(state);
    if (!thunder.channel) startThunderPrimary(host, aim, stats, `weapon:thunder:primary:${++state.weaponCombat!.serial}`);
    const channel = thunder.channel;
    while (channel && thunder.channel === channel && state.elapsed + 1e-8 >= channel.nextAt) {
      channel.nextAt += THUNDER_BALANCE.primary.interval;
      thunder.nextPrimaryAt = channel.nextAt;
      pulse(host, aim, stats); if (!valid(host, state, thunder)) return;
    }
    if (channel) channel.links = links(state, thunder, aim, stats);
  }
  thunder.trails = thunder.trails.filter(trail => state.elapsed < trail.until + 1e-8);
  for (const trail of thunder.trails) while (trail.nextAt <= state.elapsed + 1e-8 && trail.nextAt <= trail.until + 1e-8) {
    trail.nextAt += THUNDER_BALANCE.dash.trailInterval;
    for (const target of state.targets) {
      if (!valid(host, state, thunder)) return;
      if (target.hp <= 0 || target.role === 'event' || target.role === 'capsule' || segmentDistance(target, trail.from, trail.to) > THUNDER_BALANCE.dash.trailWidth / 2 + target.radius) continue;
      const delta = normalized(trail.to.x - trail.from.x, trail.to.y - trail.from.y), length = distance(trail.from, trail.to);
      const along = clamp((target.x - trail.from.x) * delta.x + (target.y - trail.from.y) * delta.y, 0, length);
      const from = { x: trail.from.x + delta.x * along, y: trail.from.y + delta.y * along };
      if (visible(state, from, target, target.radius)) damage(host, target, trail.damage, weaponOrigin(state, 'thunder-overdrive', trail.castId), true);
    }
  }
  if (valid(host, state, thunder)) advanceStorm(host, thunder);
}
