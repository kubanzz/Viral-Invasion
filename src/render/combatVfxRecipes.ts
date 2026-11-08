import { BALANCE, type GameEvent, type GameState, type Vec } from '../game/types';

export type CombatVfxRecipeId = 'muzzle' | 'hit' | 'heavy-hit' | 'kill' | 'area' | 'finale' | 'slash' | 'parry'
  | 'heal' | 'purify' | 'player-hurt' | 'legion-windup' | 'legion-release' | 'legion-hit' | 'boss-state' | 'dash'
  | 'charge' | 'return' | 'infection' | 'enemy-windup' | 'enemy-impact';
export interface CombatVfxCue {
  key: string; eventType: string; tick: number; born: number; recipe: CombatVfxRecipeId; tier: 1 | 2 | 3;
  priority: number; life: number; radius: number; entityId: string; weaponId: string;
  point?: Vec; from?: Vec; to?: Vec; angle: number; halfAngle: number; ground: boolean;
  anchor?: 'muzzle' | 'bladeTip' | 'foot'; follow: boolean; color: number;
  source: GameEvent;
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const string = (n: unknown): string => typeof n === 'string' ? n : '';
const point = (d: GameEvent['data'], x = 'x', y = 'y'): Vec | undefined => finite(d[x]) && finite(d[y]) ? { x: d[x] as number, y: d[y] as number } : undefined;
const CONTACT = new Set(['TARGET_HIT', 'PLAYER_PROJECTILE_HIT', 'WEAPON_MELEE_HIT', 'THUNDER_DETONATE_HIT',
  'THUNDER_STORM_HIT', 'LEGION_SERAPH_HIT', 'PROTOCOL_BEACON_HIT', 'IMMUNE_PATROL_HIT', 'BLADE_TRACE_HIT', 'COMBAT_ABILITY_HIT']);
const HIT_LIVES = { 'hit': .23, 'heavy-hit': .34, 'legion-hit': .26 } as const;
const COLORS: Readonly<Record<string, number>> = { steady: 0x8ddcc0, piercing: 0xffd18a, thunder: 0xb9d6ff, redblade: 0xffbc87 };

/** Receipts choose a recipe; no render callback may create a hit or grant resources. */
export function combatVfxCue(event: GameEvent): CombatVfxCue | undefined {
  // The safe weapon range deliberately accepts partial fixed steps; its receipt
  // tick is elapsed / BALANCE.step and is a valid fractional timestamp.
  if (!Number.isFinite(event.tick) || event.tick < 0) return;
  const d = event.data, type = event.type, weaponId = string(d.weaponId), entityId = string(d.targetId || d.coreId || d.actorId || d.id || d.nodeId || d.motherId);
  // A Seraph action emits several parts. Its rootId identifies the accepted part,
  // shared by LEGION_SERAPH_HIT and the legacy PROTOCOL_BEACON_HIT alias.
  const cast = string(CONTACT.has(type) ? d.rootId || d.castId || d.actionId || d.transactionId || d.attackId || d.actorId || d.cellId
    : d.castId || d.actionId || d.rootId || d.transactionId || d.attackId || d.orderId || d.actorId || d.cellId);
  let recipe: CombatVfxRecipeId, tier: 1 | 2 | 3 = 1, priority = 2, life = .3, radius = 26, ground = false;
  let anchor: CombatVfxCue['anchor'], follow = false, owner = entityId;
  if (CONTACT.has(type)) {
    // Storm receipts are emitted only after damage was accepted, without a damage field.
    if (type !== 'THUNDER_STORM_HIT' && (!finite(d.damage) || d.damage <= 0)) return;
    // The specialised legion receipt owns its shape, rather than stacking a generic hit on it.
    if (type === 'TARGET_HIT' && (d.legionId === 'seraph' || d.immuneCellId)) return;
    tier = d.final === true || d.skillId === 'redblade-execute' ? 3
      : type === 'THUNDER_DETONATE_HIT' || type === 'THUNDER_STORM_HIT' || type === 'BLADE_TRACE_HIT' || d.kind === 'cannon' || d.skillId && d.cause !== 'basic' ? 2 : 1;
    recipe = type === 'LEGION_SERAPH_HIT' || type === 'PROTOCOL_BEACON_HIT' || type === 'IMMUNE_PATROL_HIT' ? 'legion-hit' : tier > 1 ? 'heavy-hit' : 'hit';
    life = HIT_LIVES[recipe]; radius = tier === 3 ? 58 : tier === 2 ? 38 : 21; priority = tier + 3;
  } else if (type === 'PLAYER_PROJECTILE_LAUNCHED' || type === 'THUNDER_CHANNEL_STARTED') {
    if (d.weaponId === 'redblade') return;
    recipe = 'muzzle'; life = .11; radius = d.kind === 'cannon' ? 26 : 13; owner = 'player'; anchor = 'muzzle'; priority = 1;
  } else if (type === 'WEAPON_MELEE_SWEEP') {
    recipe = 'slash'; tier = Number(d.combo) >= 3 || String(d.skillId).includes('execute') ? 2 : 1;
    life = .24; radius = finite(d.radius) ? Math.min(320, Math.max(8, d.radius)) : 120; owner = 'player'; priority = 3; ground = true;
  } else if (type === 'TARGET_CLEARED' || type === 'CORE_CLEARED') {
    recipe = 'kill'; tier = type === 'CORE_CLEARED' ? 3 : 1; life = tier === 3 ? .8 : .48; radius = tier === 3 ? 115 : 34; priority = tier + 3;
  } else if (['PLAYER_CANNON_EXPLODED', 'PLAYER_CANNON_AFTERSHOCK', 'TERRITORY_CANNON_EXPLODED', 'WEAPON_AREA_RESOLVED', 'WEAPON_ULTIMATE_PULSE', 'BLADE_TRACE_IMPACT', 'BLADE_TRACE_FINISHED', 'BLADE_DOMAIN_PULSE'].includes(type)) {
    const finale = d.final === true || type === 'BLADE_TRACE_FINISHED';
    recipe = finale ? 'finale' : 'area'; tier = finale ? 3 : 2; priority = finale ? 8 : 5;
    life = finale ? .72 : .46; radius = finite(d.radius) ? Math.min(380, Math.max(18, d.radius)) : type === 'BLADE_TRACE_FINISHED' ? 160 : 95; ground = true;
  } else if (type === 'BLADE_PARRIED' || type === 'BLADE_PARRY_COUNTER') {
    recipe = 'parry'; tier = d.perfect === true ? 3 : 2; radius = tier === 3 ? 65 : 40; life = .34; priority = 7; owner = 'player';
  } else if (['HEALING_POINT_TREATED', 'HOST_EVENT_PLAYER_HEALED', 'TERRITORY_PLAYER_HEALED', 'ORGAN_INTEGRITY_CHANGED'].includes(type)) {
    const healed = type === 'ORGAN_INTEGRITY_CHANGED' ? Number(d.after) - Number(d.before) : Number(d.healed ?? d.amount);
    if (!Number.isFinite(healed) || healed <= 0 || type === 'ORGAN_INTEGRITY_CHANGED' && !['repair', 'protocol-repair'].includes(string(d.reason))) return;
    recipe = 'heal'; life = .7; radius = 38; owner = type === 'ORGAN_INTEGRITY_CHANGED' ? 'tissue' : 'player'; follow = true; priority = 4;
  } else if (type === 'TERRITORY_PURIFIED' || type === 'INFECTION_SOURCE_CLEARED' || type === 'PLAYER_INFECTION_CLEARED') {
    recipe = 'purify'; life = .8; radius = 66; tier = 2; ground = true; priority = 5;
    if (type === 'PLAYER_INFECTION_CLEARED') owner = 'player';
  } else if (type === 'PLAYER_HURT') {
    if (!finite(d.damage) || d.damage <= 0) return;
    recipe = 'player-hurt'; owner = 'player'; life = .26; radius = 30; priority = 7;
  } else if (type === 'LEGION_SERAPH_WINDUP') {
    recipe = 'legion-windup'; owner = string(d.cellId); anchor = 'foot'; follow = true;
    life = finite(d.duration) ? Math.max(.08, Math.min(.6, d.duration)) : .28; radius = 26; priority = 2;
  } else if (type === 'LEGION_SERAPH_RELEASED') {
    recipe = 'legion-release'; life = .24; radius = 20; priority = 3; tier = d.strong === true ? 2 : 1;
  } else if (type === 'LEGION_SERAPH_FOCUS' || type === 'LEGION_SERAPH_ECHO') {
    recipe = 'boss-state'; life = .4; radius = 25; priority = 2;
  } else if (['CORE_PHASE_CHANGED', 'CORE_MEMBRANE_BROKEN', 'CORE_MEMBRANES_OPENED', 'HEART_BOSS_STAGGERED', 'HEART_BOSS_BAR_BROKEN', 'HEART_BOSS_SECOND_PHASE', 'CORE_SCAN_REVEALED', 'TERRITORY_BOSS_STARTED'].includes(type)) {
    recipe = 'boss-state'; tier = 2; life = .65; radius = 100; priority = 6; ground = true;
  } else if (type === 'PLAYER_DASHED' || type === 'THUNDER_DASH_STARTED') {
    recipe = 'dash'; owner = 'player'; radius = 32; life = .3; priority = 1; ground = true;
  } else if (type === 'PLAYER_PROJECTILE_RETURNED' || type === 'WEAPON_ULTIMATE_RETURNED') {
    recipe = 'return'; owner = 'player'; life = .22; radius = 19; priority = 2;
  } else if (type === 'WEAPON_CAPSULE_IMPACT') {
    recipe = 'area'; life = .28; radius = 29; priority = 3; ground = true;
  } else if (type === 'THUNDER_ROD_PLANTED' || type === 'THUNDER_ROD_POWER_CHANGED') {
    if (type === 'THUNDER_ROD_POWER_CHANGED' && d.powered !== true) return;
    recipe = 'charge'; life = .35; radius = type === 'THUNDER_ROD_PLANTED' ? 42 : 24; priority = 3; ground = true;
  } else if (type === 'THUNDER_STORM_COLLAPSE' || type === 'WEAPON_ULTIMATE_CAST') {
    // The four-point route and continuous thunder crown retain their own geometry.
    if (type === 'WEAPON_ULTIMATE_CAST' && (weaponId === 'redblade' || weaponId === 'thunder')) return;
    recipe = 'charge'; life = type === 'THUNDER_STORM_COLLAPSE' ? .25 : .42; radius = 48; tier = 2; priority = 4;
  } else if (type === 'PLAYER_INFECTED' || type === 'TERRITORY_CAPTURED' || type === 'TERRITORY_CONTESTED') {
    // Onset accent only. The existing authoritative infection contour stays visible for its true duration.
    recipe = 'infection'; life = .42; radius = type === 'PLAYER_INFECTED' ? 25 : 36; priority = 3;
    ground = type !== 'PLAYER_INFECTED'; owner = type === 'PLAYER_INFECTED' ? 'player' : string(d.nodeId); follow = !ground;
  } else if (type === 'ATTACK_TELEGRAPHED' || type === 'ENEMY_TACTIC_COMMITTED' || type === 'CORE_ATTACK_TELEGRAPHED') {
    recipe = 'enemy-windup'; life = finite(d.resolveAt) ? Math.min(1.2, Math.max(.08, d.resolveAt - event.tick * BALANCE.step))
      : finite(d.windup) ? Math.min(1.2, Math.max(.08, d.windup)) : .35;
    owner = string(d.coreId || d.actorId); radius = 22; follow = true; priority = 3;
  } else if (type === 'ENEMY_CHARGE_ENDED' || type === 'SLIME_LANDED' || type === 'RITUAL_PROJECTILE_REMOVED') {
    recipe = 'enemy-impact'; life = .38; radius = type === 'SLIME_LANDED' ? 44 : 24; priority = 3; ground = true;
  } else if (type === 'VIRAL_CAPSULE_TERMINATED') {
    if (d.reason !== 'intercepted') return;
    recipe = 'kill'; life = .34; radius = 26; priority = 3;
  } else if (type === 'RITUAL_SHIELD_BROKEN') {
    recipe = 'boss-state'; owner = string(d.motherId); life = .6; radius = 76; priority = 6; ground = true;
  } else if (type === 'TERRITORY_CAPTURE_REPELLED') {
    recipe = 'purify'; owner = string(d.nodeId); life = .46; radius = 36; priority = 3; ground = true;
  } else if (type === 'IMMUNE_CELL_HURT' || type === 'IMMUNE_CELL_DIED') {
    if (type === 'IMMUNE_CELL_HURT' && (!finite(d.damage) || d.damage <= 0)) return;
    recipe = type === 'IMMUNE_CELL_DIED' ? 'kill' : 'player-hurt'; owner = string(d.cellId);
    radius = 22; life = .3; priority = 4;
  } else if (type === 'WEAPON_SKILL_CAST' && ['steady-overdrive', 'piercing-heavy'].includes(string(d.skillId))) {
    recipe = 'charge'; owner = 'player'; anchor = d.skillId === 'piercing-heavy' ? 'muzzle' : 'foot';
    follow = true; radius = 32; life = .32; priority = 3;
  } else return;
  const target = string(d.targetId || d.id), detail = `${d.part ?? d.mark ?? d.index ?? ''}:${d.sequence ?? ''}`;
  // Alias receipts for a single accepted hit collapse, even when the generic receipt arrives first.
  const family = CONTACT.has(type) ? `contact:${cast}:${target}` : `${type}:${cast}:${owner}:${detail}`;
  const key = `${event.tick}:${family}`;
  const supplied = point(d);
  // Ordinary bites log x/y at the attacker. Contact belongs to the actual victim.
  const p = ['PROTOCOL_BEACON_HIT', 'IMMUNE_PATROL_HIT', 'ATTACK_TELEGRAPHED', 'ENEMY_TACTIC_COMMITTED', 'CORE_ATTACK_TELEGRAPHED'].includes(type) ? undefined : supplied;
  const from = point(d, 'fromX', 'fromY'), to = point(d, 'aimX', 'aimY') ?? point(d, 'toX', 'toY');
  return { key, eventType: type, tick: event.tick, born: event.tick * BALANCE.step, recipe, tier, priority, life, radius,
    entityId: owner, weaponId, point: p, from, to, angle: p && to ? Math.atan2(to.y - p.y, to.x - p.x) : 0,
    halfAngle: finite(d.arcHalfAngle) ? Math.min(Math.PI, Math.max(.15, d.arcHalfAngle)) : Math.PI * .44,
    ground, anchor, follow, color: recipe === 'player-hurt' ? 0xf3a1a0 : ['infection', 'enemy-windup', 'enemy-impact'].includes(recipe) ? 0xd5a3ce : recipe === 'heal' || recipe === 'purify' ? 0x9de9b5
      : recipe === 'boss-state' ? 0xe9b0dc : COLORS[weaponId] ?? 0xffe0a4, source: event };
}

/** Resolve only recorded coordinates or existing bodies; missing victims never turn into a fake hit at the player. */
export function combatVfxPoint(cue: CombatVfxCue, state: GameState): Vec | undefined {
  if (cue.point) return cue.point;
  if (cue.entityId === 'player') return { x: state.player.x, y: state.player.y };
  if (cue.entityId === 'tissue') return { x: state.tissue.x, y: state.tissue.y };
  const body = state.targets.find(t => t.id === cue.entityId) ?? state.growth?.cells?.find(c => c.id === cue.entityId)
    ?? state.territory?.nodes.find(n => n.id === cue.entityId);
  return body ? { x: body.x, y: body.y } : undefined;
}
