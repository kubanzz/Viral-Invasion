import { distance, isLegalPosition } from '../actors/collision';
import { EnemyNavigator } from '../actors/enemyNavigation';
import { endlessCombatStats } from './endlessGrowth';
import { openingIntroductionBlocked } from './openingEvolution';
import { activeWorld, BALANCE, type GameState, type Target, type Vec } from './types';
import type { OrganId } from './battleTypes';
import type { HostEventActive, HostEventCategory, HostEventCommand, HostEventId, HostEventModifierKind, HostEventState, HostEventZone } from './hostEventTypes';

/** First tuning pass. R is the logical player radius; D never includes run bonuses. */
export const HOST_EVENT_BALANCE = {
  slots: [75, 240, 420, 600], maximumDelay: 60, minimumGap: 60, alarmGrace: 15,
  categoryWeights: { green: 30, red: 45, yellow: 25 }, maximumRed: 2,
  warning: { green: 2, red: 8, yellow: 8 }, minimumHpRatio: .25, maximumInfection: 80, minimumIntegrityRatio: .25,
  medication: { duration: 24, appearances: [0, 8, 16], radiusR: 6, zoneDuration: 6, previewSeconds: 1, damageD: 1, tickSeconds: 1 },
  rest: { duration: 30, healRatioPerSecond: .01, maximumHealRatio: .2, activeRepairMultiplier: 1.25, tickSeconds: 1 },
  sleepless: { duration: 35, immuneAttackFrequency: .8, captureProgress: 1.25 },
  smoke: { duration: 35, targetCount: 3, hpD: 3, radiusR: 5, minimumDistanceR: 8, moveMultiplier: .8, immuneAttackFrequency: .8, targetRadiusR: 1 },
  alcohol: { duration: 30, targetCount: 2, hpD: 4, radiusR: 6, repairMultiplier: .6, targetRadiusR: 1 },
  exercise: { duration: 30, challengeDuration: 35, pulseCooldown: .7, pulseStrength: 1.25, lightVirusMove: 1.15 },
} as const;

const B = HOST_EVENT_BALANCE;
export const HOST_EVENT_CARDS: Record<HostEventId, { name: string; icon: string; category: HostEventCategory; duration: number; description: string }> = {
  MEDICATION: { name: '药剂入体', icon: '✚', category: 'green', duration: B.medication.duration,
    description: `第 ${B.medication.appearances.join('、')} 秒生成净化药区：半径 ${B.medication.radiusR}R，持续 ${B.medication.zoneDuration} 秒，每秒 ${B.medication.damageD}D 伤害；提前 ${B.medication.previewSeconds} 秒显示范围。引怪入圈，趁机清源。` },
  REST: { name: '安稳休息', icon: '☾', category: 'green', duration: B.rest.duration,
    description: `每秒恢复最大耐久 ${B.rest.healRatioPerSecond * 100}%，本次最多 ${B.rest.maximumHealRatio * 100}%；满血不储存。玩家主动组织修复 +${Math.round((B.rest.activeRepairMultiplier - 1) * 100)}%。战斗与感染继续。` },
  SLEEPLESS: { name: '深夜未眠', icon: '◷', category: 'red', duration: B.sleepless.duration,
    description: `军团攻击频率 −${Math.round((1 - B.sleepless.immuneAttackFrequency) * 100)}%；病毒满足占领条件时，治疗点感染进度增量 +${Math.round((B.sleepless.captureProgress - 1) * 100)}%。支援治疗点，集中驻防。` },
  SMOKE: { name: '烟雾入肺', icon: '≋', category: 'red', duration: B.smoke.duration,
    description: `${B.smoke.targetCount} 个污染源，各 ${B.smoke.hpD}D 耐久、${B.smoke.radiusR}R 影响范围；圈内玩家与军团移速 −${Math.round((1 - B.smoke.moveMultiplier) * 100)}%，军团攻击频率 −${Math.round((1 - B.smoke.immuneAttackFrequency) * 100)}%。病毒不受影响；清除全部污染源提前结束。` },
  ALCOHOL: { name: '饮酒负荷', icon: '◈', category: 'red', duration: B.alcohol.duration,
    description: `${B.alcohol.targetCount} 处组织旁产生沉积，各 ${B.alcohol.hpD}D 耐久、${B.alcohol.radiusR}R 范围；圈内组织最终修复量 −${Math.round((1 - B.alcohol.repairMultiplier) * 100)}%。用基础工具清除沉积，或低效率抢修；全部清除提前结束。` },
  EXERCISE: { name: '突然运动', icon: '↯', category: 'yellow', duration: B.exercise.duration,
    description: `主动定向冲流冷却 −${Math.round((1 - B.exercise.pulseCooldown) * 100)}%、推动 +${Math.round((B.exercise.pulseStrength - 1) * 100)}%；当前器官轻型病毒移速 +${Math.round((B.exercise.lightVirusMove - 1) * 100)}%。借更频繁的冲流抵消追击。` },
};
export const HOST_EVENT_IDS = Object.keys(HOST_EVENT_CARDS) as HostEventId[];

export function initializeHostEvents(game: GameState): HostEventState {
  const events: HostEventState = { schemaVersion: 1, rngState: (game.seed ^ 0x686f7374) >>> 0, serial: 0,
    slots: B.slots.filter(at => !game.endless || at !== 75).map(at => ({ at, status: 'pending' })), usedIds: [], successCount: 0, redCount: 0,
    lastCategory: null, lastEndedAt: null, alarmUntil: 0, wasAlarm: false,
    active: null, sources: {}, disabled: {}, pendingCommands: [] };
  if (game.endless) events.openingExercise = { status: 'pending', ready: false, waitingReason: 'wave-3-not-reached' };
  game.hostEvents = events;
  refreshHostEventEligibility(game);
  return events;
}

function nextRandom(state: HostEventState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  let value = state.rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function hostEventMaxHp(game: GameState): number {
  return game.endlessGrowth ? endlessCombatStats(game.endlessGrowth).maxHp : 100;
}

export function hostEventCrisis(game: GameState): boolean {
  return game.player.hp / hostEventMaxHp(game) < B.minimumHpRatio
    || (game.battle?.pressure.infection ?? 0) > B.maximumInfection
    || game.tissue.hp / game.tissue.maxHp < B.minimumIntegrityRatio;
}

/** Explicit evolution/migration telegraphs and final awakening, not ordinary combat. */
export function hostEventAlarm(game: GameState): boolean {
  const migration = game.campaign?.migration.status;
  const core = game.campaign?.core.combat;
  return !!game.battle?.warning || !!game.endless?.evolution?.pending
    || migration === 'warning' || migration === 'blocking'
    || core?.phase === 'awakening';
}

export function isLightHostEventVirus(target: Target): boolean {
  return target.hp > 0 && target.role === 'virus' && !target.traits?.includes('CARAPACE');
}
export const isHostEventLightVirus = isLightHostEventVirus;

/** Ask the existing navigation graph, including disconnected chambers and narrow folds. */
function reachableFromPlayer(game: GameState, point: Vec, navigator = new EnemyNavigator()): boolean {
  const probe: Target = { ...game.player, id: 'host-event-path-probe', kind: 'single', role: 'virus', hp: 1, maxHp: 1, hitUntil: 0, scanned: false };
  if (distance(point, probe) < 1e-6) return true;
  return distance(navigator.waypoint(probe, point, activeWorld(game), game.elapsed), probe) > 1e-6;
}

/** Stable anchors on real blood-flow edges; no arbitrary drug circles in walls. */
export function medicationAnchors(game: GameState): Vec[] {
  if (!game.battle) return [];
  const radius = B.medication.radiusR * game.player.radius, world = activeWorld(game), anchors: Vec[] = [];
  for (const edge of game.battle.graph.edges) {
    if (!edge.open) continue;
    const from = game.battle.graph.nodes.find(node => node.id === edge.from);
    const to = game.battle.graph.nodes.find(node => node.id === edge.to);
    if (!from || !to || !from.active || !to.active) continue;
    for (const fraction of [.2, .5, .8]) {
      const point = { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
      if (isLegalPosition(point, radius, world) && !anchors.some(anchor => distance(anchor, point) < game.player.radius)) anchors.push(point);
    }
  }
  return anchors;
}

/** Event bodies never become movement obstacles; still keep all key action points clear. */
export function smokePlacements(game: GameState): Vec[] {
  if (game.battle?.organId !== 'lung') return [];
  const world = activeWorld(game), radius = game.player.radius;
  const navigator = new EnemyNavigator(), points: Vec[] = [];
  const candidates: Vec[] = [];
  for (let y = world.bounds.top + 4 * radius; y <= world.bounds.bottom - 4 * radius; y += 8 * radius)
    for (let x = world.bounds.left + 4 * radius; x <= world.bounds.right - 4 * radius; x += 8 * radius) candidates.push({ x, y });
  // Nearest legal, reachable targets stay observable and avoid remote chores.
  candidates.sort((a, b) => distance(a, game.player) - distance(b, game.player) || a.y - b.y || a.x - b.x);
  for (const candidate of candidates) {
    if (!isLegalPosition(candidate, radius, world) || distance(candidate, game.player) < B.smoke.minimumDistanceR * radius) continue;
    if (game.battle.graph.nodes.some(node => node.active && node.kind !== 'source' && distance(node, candidate) < 8 * radius)) continue;
    if (points.some(point => distance(point, candidate) < 7 * radius)) continue;
    if (!reachableFromPlayer(game, candidate, navigator)) continue;
    points.push(candidate);
    if (points.length >= B.smoke.targetCount) break;
  }
  return points;
}

export interface HostEventEligibility { ok: boolean; reason?: string; placements: Vec[]; affectsLegions: boolean; affectsHealingPoints: boolean }
export function hostEventEligibility(game: GameState, id: HostEventId): HostEventEligibility {
  const result: HostEventEligibility = { ok: false, placements: [], affectsLegions: false, affectsHealingPoints: false };
  const deny = (reason: string) => ({ ...result, reason });
  if (!game.battle) return deny('当前场景没有器官战斗系统');
  if (id === 'MEDICATION') {
    result.placements = medicationAnchors(game);
    if (!result.placements.length) return deny('当前器官没有合法血流锚点');
  } else if (id === 'SLEEPLESS') {
    result.affectsLegions = !!game.growth?.cells?.some(cell => cell.organId === game.battle!.organId && (cell.hp ?? 1) > 0 && cell.until > game.elapsed);
    result.affectsHealingPoints = game.battle.graph.nodes.some(node => node.kind === 'healing' && node.active && (node.infection ?? 0) < 100);
    if (!result.affectsLegions && !result.affectsHealingPoints) return deny('当前器官没有存活免疫军团或可感染治疗点');
  } else if (id === 'SMOKE') {
    if (game.battle.organId !== 'lung') return deny('仅肺部可用');
    result.placements = smokePlacements(game);
    if (result.placements.length < B.smoke.targetCount) return deny('无法放置三个可达、远离玩家且避开关键交互的污染源');
  } else if (id === 'ALCOHOL') {
    // There is exactly one real repairable Tissue in the current simulation.
    // Healing facilities restore the player and are not substitute tissues.
    // Keep the complete event/target/modifier path below, but never invent a
    // second repair interaction or borrow another organ merely to enable it.
    return deny('当前器官只有一个可修复组织，需要两个；治疗点不属于组织');
  } else if (id === 'EXERCISE') {
    if (game.battle.organId !== 'heart') return deny('仅心脏可用');
    if (!game.battle.graph.nodes.some(node => node.kind === 'valve' && node.active
      && isLegalPosition(node, game.player.radius, activeWorld(game)) && reachableFromPlayer(game, node))) return deny('当前器官没有可达且可操作的定向冲流节点');
    if (!game.targets.some(isLightHostEventVirus)) return deny('当前器官没有轻型病毒');
  }
  return { ...result, ok: true };
}

export function refreshHostEventEligibility(game: GameState): void {
  const state = game.hostEvents;
  if (!state) return;
  state.disabled = {};
  for (const id of HOST_EVENT_IDS) {
    const eligibility = hostEventEligibility(game, id);
    if (!eligibility.ok) state.disabled[id] = eligibility.reason;
  }
}

function description(id: HostEventId, eligibility: HostEventEligibility): string {
  if (id !== 'SLEEPLESS') return HOST_EVENT_CARDS[id].description;
  const effects: string[] = [];
  if (eligibility.affectsLegions) effects.push(`当前器官军团攻击频率 −${Math.round((1 - B.sleepless.immuneAttackFrequency) * 100)}%`);
  if (eligibility.affectsHealingPoints) effects.push(`满足占领条件时，治疗点感染进度增量 +${Math.round((B.sleepless.captureProgress - 1) * 100)}%`);
  return `${effects.join('；')}。支援治疗点或集中军团驻防。`;
}

function log(state: HostEventState, type: string, data: Extract<HostEventCommand, { kind: 'log' }>['data']): void {
  state.pendingCommands.push({ kind: 'log', type, data });
}

function begin(game: GameState, id: HostEventId, eligibility: HostEventEligibility, slotIndex: number | null,
  trigger: NonNullable<HostEventActive['trigger']> = 'scheduled'): void {
  const state = game.hostEvents!, card = HOST_EVENT_CARDS[id], sourceId = `host-event:${++state.serial}:${id}`;
  const startsAt = game.elapsed + B.warning[card.category];
  const endsAt = startsAt + (game.endless && id === 'EXERCISE' ? B.exercise.challengeDuration : card.duration);
  const placements = eligibility.placements.map(point => ({ ...point }));
  if (id === 'MEDICATION' && placements.length) {
    const offset = Math.floor(nextRandom(state) * placements.length);
    const rotated = placements.slice(offset).concat(placements.slice(0, offset));
    placements.splice(0, placements.length, ...B.medication.appearances.map((_, index) => ({ ...rotated[index % rotated.length] })));
  }
  const active: HostEventActive = { id, category: card.category, organId: game.battle!.organId, sourceId,
    phase: 'warning', warningStartedAt: game.elapsed, startsAt, endsAt, description: description(id, eligibility), slotIndex,
    zones: [], targetIds: [], placements, healed: 0, nextHealAt: startsAt + B.rest.tickSeconds,
    affectsLegions: eligibility.affectsLegions, affectsHealingPoints: eligibility.affectsHealingPoints, trigger };
  if (id === 'MEDICATION') active.zones = B.medication.appearances.map((offset, index): HostEventZone => ({
    ...placements[index], id: `${sourceId}:zone:${index}`, kind: 'medication', radius: B.medication.radiusR * game.player.radius,
    medicationState: 'pending',
    previewAt: startsAt + offset - B.medication.previewSeconds, startsAt: startsAt + offset,
    endsAt: startsAt + offset + B.medication.zoneDuration, nextTickAt: startsAt + offset + B.medication.tickSeconds,
  }));
  state.active = active;
  state.announcement = { sourceId, id, category: card.category, phase: 'warning', at: game.elapsed };
  state.usedIds.push(id);
  if (slotIndex !== null) { state.slots[slotIndex].status = 'selected'; state.slots[slotIndex].id = id; }
  log(state, 'HOST_EVENT_WARNING', { id, category: card.category, organId: active.organId, startsAt, endsAt, debug: trigger === 'debug', trigger });
}

export function beginDebugHostEvent(game: GameState, id: HostEventId): { ok: boolean; reason?: string } {
  if (!HOST_EVENT_CARDS[id]) return { ok: false, reason: '未知宿主事件' };
  const state = game.hostEvents ?? initializeHostEvents(game);
  if (game.phase !== 'playing') return { ok: false, reason: '需要正在运行的器官战斗' };
  syncHostEventSafety(game);
  if (state.active) return { ok: false, reason: '已有宿主事件' };
  if (state.usedIds.includes(id)) return { ok: false, reason: '此卡本局已经出现' };
  if (hostEventAlarm(game) || game.elapsed < state.alarmUntil) return { ok: false, reason: '警报或警报结束后的缓冲中' };
  if (HOST_EVENT_CARDS[id].category !== 'green' && hostEventCrisis(game)) return { ok: false, reason: '当前处于低耐久、高感染或低完整度危机' };
  const eligibility = hostEventEligibility(game, id);
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason };
  begin(game, id, eligibility, null, 'debug');
  return { ok: true };
}

/** Preserve completed cooldown fraction when event-derived duration changes. */
function rescalePulseCooldown(game: GameState, oldMultiplier: number, newMultiplier: number, organId = game.battle?.organId): void {
  if (!game.battle || oldMultiplier === newMultiplier) return;
  const pulse = organId === game.battle.organId ? game.battle.pulse : organId ? game.campaign?.arenas[organId].pulse : undefined;
  if (!pulse) return;
  const remaining = Math.max(0, pulse.readyAt - game.elapsed);
  if (remaining > 0) pulse.readyAt = game.elapsed + remaining * newMultiplier / oldMultiplier;
}

function activate(game: GameState): void {
  const state = game.hostEvents!, active = state.active!;
  active.phase = 'active';
  state.announcement = { sourceId: active.sourceId, id: active.id, category: active.category, phase: 'active', at: game.elapsed };
  state.sources[active.sourceId] = { eventId: active.id, organId: active.organId };
  state.successCount++; state.lastCategory = active.category;
  if (active.category === 'red') state.redCount++;
  if (active.id === 'EXERCISE') rescalePulseCooldown(game, 1, B.exercise.pulseCooldown);
  if (active.id === 'SMOKE' || active.id === 'ALCOHOL') {
    const smoke = active.id === 'SMOKE', config = smoke ? B.smoke : B.alcohol;
    for (let index = 0; index < config.targetCount; index++) {
      const point = active.placements[index];
      if (!point) continue;
      const id = `${active.sourceId}:target:${index}`, hp = config.hpD * BALANCE.damage[1];
      game.targets.push({ ...point, id, role: 'event', hostEventSourceId: active.sourceId, kind: 'single',
        radius: config.targetRadiusR * game.player.radius, hp, maxHp: hp, hitUntil: 0, scanned: true, traits: [], born: game.elapsed });
      active.targetIds.push(id);
      active.zones.push({ ...point, id: `${active.sourceId}:zone:${index}`, kind: smoke ? 'smoke' : 'deposit',
        radius: config.radiusR * game.player.radius, previewAt: active.startsAt, startsAt: active.startsAt,
        endsAt: active.endsAt, targetId: id, nextTickAt: active.endsAt });
    }
  }
  log(state, 'HOST_EVENT_STARTED', { id: active.id, category: active.category, organId: active.organId, endsAt: active.endsAt });
}

function removeOwnedTargets(game: GameState, sourceId: string): void {
  game.targets = game.targets.filter(target => target.hostEventSourceId !== sourceId);
  if (game.campaign) for (const arena of Object.values(game.campaign.arenas)) {
    arena.targets = arena.targets.filter(target => target.hostEventSourceId !== sourceId);
  }
}

export function endHostEvent(game: GameState, reason = 'ended'): void {
  // Restore every organ's queued bite, including offscreen persistent legions.
  // Delete the source receipt so repeated cleanup never rescales it twice.
  for (const cell of game.growth?.cells ?? []) {
    const frequency = cell.hostEventAttackFrequency;
    if (frequency === undefined) continue;
    if (Number.isFinite(frequency) && frequency > 0) {
      cell.attackReadyAt = game.elapsed + Math.max(0, cell.attackReadyAt - game.elapsed) * frequency;
    }
    delete cell.hostEventAttackFrequency;
  }
  const state = game.hostEvents, active = state?.active;
  if (!state) return;
  const opening = state.openingExercise;
  if (opening?.status === 'pending' && (['restart', 'menu', 'run-ended', 'player-dead', 'organ-changed'].includes(reason)
    || game.phase === 'result' || game.player.hp <= 0)) {
    opening.status = 'cancelled'; opening.reason = game.player.hp <= 0 ? 'player-dead' : reason;
    log(state, 'HOST_EVENT_CANCELLED', { id: 'EXERCISE', category: 'yellow', reason: opening.reason,
      blockedBy: opening.waitingReason ?? 'not-started', trigger: 'opening', triggered: false });
    state.announcement = { sourceId: 'host-event:opening:EXERCISE', id: 'EXERCISE', category: 'yellow',
      phase: 'cancelled', at: game.elapsed, reason: opening.reason };
  }
  if (!active) {
    for (const sourceId of Object.keys(state.sources)) removeOwnedTargets(game, sourceId);
    state.sources = {};
    return;
  }
  if (active.id === 'EXERCISE' && active.phase === 'active') rescalePulseCooldown(game, B.exercise.pulseCooldown, 1, active.organId);
  removeOwnedTargets(game, active.sourceId);
  delete state.sources[active.sourceId];
  if (active.slotIndex !== null) {
    const slot = state.slots[active.slotIndex];
    slot.status = active.phase === 'warning' ? 'cancelled' : 'completed'; slot.reason = reason;
  }
  state.lastEndedAt = game.elapsed;
  state.active = null;
  state.announcement = { sourceId: active.sourceId, id: active.id, category: active.category,
    phase: active.phase === 'warning' ? 'cancelled' : 'ended', at: game.elapsed, reason };
  if (opening?.sourceId === active.sourceId) {
    opening.status = active.phase === 'warning' ? 'cancelled' : 'completed'; opening.reason = reason;
  }
  log(state, active.phase === 'warning' ? 'HOST_EVENT_CANCELLED' : 'HOST_EVENT_ENDED',
    { id: active.id, category: active.category, organId: active.organId, reason, trigger: active.trigger ?? 'scheduled' });
}

/** Call after accepted basic damage, without advancing periodic effects twice. */
export function reconcileHostEvent(game: GameState): void {
  const active = game.hostEvents?.active;
  if (!active || active.phase !== 'active' || !active.targetIds.length) return;
  const living = new Set(game.targets.filter(target => target.hp > 0).map(target => target.id));
  active.zones = active.zones.filter(zone => !zone.targetId || living.has(zone.targetId));
  if (!active.targetIds.some(id => living.has(id))) endHostEvent(game, 'targets-cleared');
}

export function drainHostEventCommands(game: GameState): HostEventCommand[] {
  const state = game.hostEvents;
  if (!state) return [];
  const commands = state.pendingCommands; state.pendingCommands = [];
  return commands;
}

/** Safe after director transitions/accepted telemetry; never schedules or ticks effects. */
export function syncHostEventSafety(game: GameState): void {
  const state = game.hostEvents;
  if (!state) return;
  const alarm = hostEventAlarm(game);
  // The first clear simulation tick is the observed end of the alarm. Starting
  // the grace there grants the full 15 seconds instead of losing one step.
  if (alarm || state.wasAlarm) state.alarmUntil = game.elapsed + B.alarmGrace;
  state.wasAlarm = alarm;
  if (game.phase === 'result' || game.player.hp <= 0) {
    endHostEvent(game, game.player.hp <= 0 ? 'player-dead' : 'run-ended'); return;
  }
  const active = state.active;
  if (!active) return;
  if (game.phase === 'menu') endHostEvent(game, 'run-ended');
  else if (active.organId !== game.battle?.organId) endHostEvent(game, 'organ-changed');
  else if (alarm && (active.phase === 'warning' || active.category !== 'green')
    && !(active.trigger === 'opening' && active.phase === 'warning')) endHostEvent(game, 'alarm');
  if (state.active?.id === 'MEDICATION') updateMedicationZones(game);
}

/** Each planned round keeps its position and full preview, or is permanently skipped. */
function updateMedicationZones(game: GameState): void {
  const state = game.hostEvents, active = state?.active;
  if (game.phase !== 'playing' || !state || active?.id !== 'MEDICATION') return;
  const pending = active.zones.filter(zone => zone.medicationState === 'pending' && game.elapsed + 1e-8 >= zone.previewAt);
  if (!pending.length) return;
  const anchors = medicationAnchors(game);
  for (const zone of pending) {
    if (!anchors.some(anchor => distance(zone, anchor) < 1e-6)) {
      zone.medicationState = 'skipped'; zone.skipReason = 'blood-flow-anchor-lost';
      log(state, 'HOST_EVENT_ZONE_SKIPPED', { id: active.id, zoneId: zone.id, reason: zone.skipReason,
        at: game.elapsed, organId: active.organId });
    } else if (active.phase === 'active' && game.elapsed + 1e-8 >= zone.startsAt) zone.medicationState = 'spawned';
  }
}

function advanceActive(game: GameState): void {
  const state = game.hostEvents!, active = state.active!;
  if (active.id === 'MEDICATION') updateMedicationZones(game);
  if (active.id === 'MEDICATION') for (const zone of active.zones) {
    if (zone.medicationState !== 'spawned') continue;
    while (zone.nextTickAt <= game.elapsed + 1e-8 && zone.nextTickAt <= zone.endsAt + 1e-8) {
      for (const target of game.targets) if (target.hp > 0 && target.role !== 'event' && distance(target, zone) <= zone.radius + target.radius) {
        state.pendingCommands.push({ kind: 'damage', targetId: target.id, amount: B.medication.damageD * BALANCE.damage[1], origin: 'host-event' });
      }
      zone.nextTickAt += B.medication.tickSeconds;
    }
  }
  if (active.id === 'REST') while (active.nextHealAt <= game.elapsed + 1e-8 && active.nextHealAt <= active.endsAt + 1e-8) {
    const maxHp = hostEventMaxHp(game);
    const amount = Math.min(Math.max(0, maxHp - game.player.hp), maxHp * B.rest.healRatioPerSecond,
      Math.max(0, maxHp * B.rest.maximumHealRatio - active.healed));
    if (amount > 0) { active.healed += amount; state.pendingCommands.push({ kind: 'healPlayer', amount }); }
    active.nextHealAt += B.rest.tickSeconds;
  }
  reconcileHostEvent(game);
  if (state.active && game.elapsed + 1e-8 >= active.endsAt) endHostEvent(game, 'expired');
}

function drawCandidate(game: GameState): { id: HostEventId; eligibility: HostEventEligibility } | null {
  const state = game.hostEvents!, candidates = HOST_EVENT_IDS.flatMap(id => {
    if (state.usedIds.includes(id)) return [];
    const category = HOST_EVENT_CARDS[id].category;
    if (state.successCount === 0 && category !== 'green') return [];
    if (category === 'red' && (state.redCount >= B.maximumRed || state.lastCategory === 'red')) return [];
    if (category !== 'green' && hostEventCrisis(game)) return [];
    const eligibility = hostEventEligibility(game, id);
    return eligibility.ok ? [{ id, eligibility }] : [];
  });
  const categories = (['green', 'red', 'yellow'] as const).filter(category => candidates.some(candidate => HOST_EVENT_CARDS[candidate.id].category === category));
  if (!categories.length) return null;
  let roll = nextRandom(state) * categories.reduce((sum, category) => sum + B.categoryWeights[category], 0);
  let selected: HostEventCategory = categories[categories.length - 1];
  for (const category of categories) { roll -= B.categoryWeights[category]; if (roll < 0) { selected = category; break; } }
  const inCategory = candidates.filter(candidate => HOST_EVENT_CARDS[candidate.id].category === selected);
  return inCategory[Math.floor(nextRandom(state) * inCategory.length)];
}

/** The opening lesson waits indefinitely for safety instead of expiring a random slot. */
function openingBlockReason(game: GameState, needsLiveVirus: boolean): string | undefined {
  const state = game.hostEvents!, endless = game.endless;
  if (!endless || endless.wave < 3) return 'wave-3-not-reached';
  if (game.phase !== 'playing') return 'simulation-paused';
  if (endless.reward && endless.reward.step !== 'complete') return 'wave-reward';
  if (endless.stageCheckpoint === 'pending') return 'stage-checkpoint';
  if (endless.phase !== 'combat') return 'wave-not-in-combat';
  if (openingIntroductionBlocked(game)) return 'evolution-introduction';
  if (hostEventAlarm(game)) return 'alarm';
  if (game.elapsed + 1e-8 < state.alarmUntil) return 'alarm-grace';
  if (hostEventCrisis(game)) return 'crisis';
  if (state.active && state.active.trigger !== 'opening') return 'host-event-busy';
  const eligibility = hostEventEligibility(game, 'EXERCISE');
  if (!eligibility.ok && (needsLiveVirus || eligibility.reason !== '当前器官没有轻型病毒'))
    return eligibility.reason ?? 'dependency-lost';
  return undefined;
}

function scheduleOpeningExercise(game: GameState): void {
  const state = game.hostEvents!, opening = state.openingExercise;
  if (!opening || opening.status !== 'pending') return;
  if (game.endless!.wave >= 3 && game.endless!.phase === 'combat' && game.targets.some(isLightHostEventVirus)) opening.ready = true;
  const blocked = openingBlockReason(game, true);
  opening.waitingReason = blocked;
  if (!opening.ready || blocked) return;
  if (state.usedIds.includes('EXERCISE')) {
    // A deliberate debug selection already fulfilled the lesson; never duplicate it.
    opening.status = 'completed'; opening.reason = 'already-selected'; return;
  }
  begin(game, 'EXERCISE', hostEventEligibility(game, 'EXERCISE'), null, 'opening');
  opening.status = 'selected'; opening.sourceId = state.active!.sourceId;
}

/** Fixed-step host call only; wall time and rendering never drive this scheduler. */
export function advanceHostEvents(game: GameState, dt: number): HostEventCommand[] {
  if (game.phase !== 'playing' || !Number.isFinite(dt) || Math.abs(dt - BALANCE.step) > 1e-10) return [];
  if (game.territory && game.elapsed < 180) return [];
  const state = game.hostEvents ?? initializeHostEvents(game);
  syncHostEventSafety(game);
  if (game.player.hp <= 0) return drainHostEventCommands(game);
  const alarm = hostEventAlarm(game);
  if (alarm) state.alarmUntil = game.elapsed + B.alarmGrace;
  state.wasAlarm = alarm;
  const active = state.active;
  if (active) {
    const openingWarningBlocked = active.trigger === 'opening' && active.phase === 'warning'
      ? openingBlockReason(game, false) : undefined;
    if (active.organId !== game.battle?.organId) endHostEvent(game, 'organ-changed');
    else if (game.player.hp <= 0) endHostEvent(game, 'player-dead');
    else if (openingWarningBlocked) {
      // Pause the full eight-second telegraph through crises and intermissions.
      active.warningStartedAt += dt; active.startsAt += dt; active.endsAt += dt;
      if (state.announcement?.sourceId === active.sourceId) state.announcement.at += dt;
      if (state.openingExercise) state.openingExercise.waitingReason = openingWarningBlocked;
    }
    else if (alarm && (active.phase === 'warning' || active.category !== 'green')) endHostEvent(game, 'alarm');
    else if (active.phase === 'warning' && game.elapsed + 1e-8 >= active.startsAt) {
      let eligibility = hostEventEligibility(game, active.id);
      // Clearing a wave during its warning does not invalidate the lesson's
      // movement modifier: it applies to lightweight viruses born next wave.
      if (active.trigger === 'opening' && eligibility.reason === '当前器官没有轻型病毒') eligibility = { ...eligibility, ok: true };
      if (active.category !== 'green' && hostEventCrisis(game)) endHostEvent(game, 'crisis-before-start');
      else if (active.id !== 'MEDICATION' && !eligibility.ok) endHostEvent(game, eligibility.reason ?? 'dependency-lost');
      else {
        // Revalidate dynamic placement and partial dependencies immediately before activation.
        active.description = description(active.id, eligibility);
        active.affectsLegions = eligibility.affectsLegions; active.affectsHealingPoints = eligibility.affectsHealingPoints;
        if (active.id === 'SMOKE') active.placements = eligibility.placements.map(point => ({ ...point }));
        activate(game);
      }
    }
    if (state.active?.phase === 'active') advanceActive(game);
  }
  scheduleOpeningExercise(game);
  // Every elapsed slot is finalized, even while another event or alarm blocks it.
  for (let index = 0; index < state.slots.length; index++) {
    const slot = state.slots[index];
    if (slot.status !== 'pending' || game.elapsed + 1e-8 < slot.at) continue;
    if (game.elapsed > slot.at + B.maximumDelay + 1e-8) {
      slot.status = 'skipped'; slot.reason = 'no-legal-opportunity';
      log(state, 'HOST_EVENT_SLOT_SKIPPED', { slot: index, at: slot.at, reason: slot.reason });
      continue;
    }
    if (state.active || alarm || game.elapsed + 1e-8 < state.alarmUntil
      || state.lastEndedAt !== null && game.elapsed - state.lastEndedAt + 1e-8 < B.minimumGap) continue;
    refreshHostEventEligibility(game);
    const candidate = drawCandidate(game);
    if (candidate) begin(game, candidate.id, candidate.eligibility, index);
  }
  return drainHostEventCommands(game);
}

export function eventModifierFromState(state: HostEventState | undefined, organId: OrganId, elapsed: number, kind: HostEventModifierKind, position?: Vec): number {
  const active = state?.active;
  if (!active || active.phase !== 'active' || active.organId !== organId || elapsed >= active.endsAt
    || !state!.sources[active.sourceId]) return 1;
  const inZone = (zoneKind: HostEventZone['kind']) => !!position && active.zones.some(zone => zone.kind === zoneKind
    && elapsed >= zone.startsAt && elapsed < zone.endsAt && distance(position, zone) <= zone.radius);
  if (active.id === 'REST' && kind === 'playerActiveRepair') return B.rest.activeRepairMultiplier;
  if (active.id === 'SLEEPLESS') {
    if (kind === 'immuneAttackFrequency' && active.affectsLegions) return B.sleepless.immuneAttackFrequency;
    if (kind === 'captureProgress' && active.affectsHealingPoints) return B.sleepless.captureProgress;
  }
  if (active.id === 'SMOKE' && inZone('smoke')) {
    if (kind === 'playerMove' || kind === 'immuneMove') return B.smoke.moveMultiplier;
    if (kind === 'immuneAttackFrequency') return B.smoke.immuneAttackFrequency;
  }
  if (active.id === 'ALCOHOL' && kind === 'tissueRepair' && inZone('deposit')) return B.alcohol.repairMultiplier;
  if (active.id === 'EXERCISE') {
    if (kind === 'pulseCooldown') return B.exercise.pulseCooldown;
    if (kind === 'pulseStrength') return B.exercise.pulseStrength;
    if (kind === 'lightVirusMove') return B.exercise.lightVirusMove;
  }
  return 1;
}

export function eventModifier(game: GameState, kind: HostEventModifierKind, position?: Vec): number {
  return eventModifierFromState(game.hostEvents, game.battle?.organId ?? 'heart', game.elapsed, kind, position);
}

export function hostEventPresentation(game: GameState): { name: string; icon: string; category: HostEventCategory; description: string; remaining: number; targetCount: number; targetTotal: number; skippedCount: number; skipReason?: string; phase: 'warning' | 'active' } | null {
  const active = game.hostEvents?.active;
  if (!active) return null;
  const card = HOST_EVENT_CARDS[active.id];
  const targetTotal = active.id === 'SMOKE' ? B.smoke.targetCount : active.id === 'ALCOHOL' ? B.alcohol.targetCount : active.id === 'MEDICATION' ? B.medication.appearances.length : 0;
  const targetCount = active.id === 'MEDICATION' ? active.zones.filter(zone => zone.medicationState !== 'skipped' && zone.endsAt > game.elapsed).length
    : active.targetIds.filter(id => game.targets.some(target => target.id === id && target.hp > 0)).length;
  const skipped = active.id === 'MEDICATION' ? active.zones.filter(zone => zone.medicationState === 'skipped') : [];
  return { name: card.name, icon: card.icon, category: active.category, description: active.description,
    remaining: Math.max(0, (active.phase === 'warning' ? active.startsAt : active.endsAt) - game.elapsed),
    targetCount: active.phase === 'warning' && active.id !== 'MEDICATION' ? targetTotal : targetCount, targetTotal,
    skippedCount: skipped.length, skipReason: skipped[0]?.skipReason, phase: active.phase };
}
