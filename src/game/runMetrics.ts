import type { OrganId, TraitId } from './battleTypes';
import type { MigrationChoice } from './campaignTypes';
import type { ProtocolId } from './growthTypes';
import type { GameEvent } from './types';

export const RUN_METRICS_VERSION = 1 as const;
export const RUN_METRICS_FRAME_LIMIT = 256;
const TRAITS: readonly TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
const PROTOCOLS: readonly ProtocolId[] = ['PULSE_BREAK', 'PURIFY_CHAIN', 'IMMUNE_BEACON', 'EXPOSE_TRACE'];
const ORGAN_COST_REASONS = ['pulse-pressure', 'protocol-pressure', 'airway-pressure', 'migration-block-pressure'];
const CONTROL_COUNTS = ['chainTriggers', 'chainHops', 'ricochetHits', 'resonanceHits', 'beaconBites', 'patrolBites',
  'synergyPulseChain', 'synergyTraceBeacon', 'scans', 'pulseUses', 'crystalExposures', 'corePulseHits',
  'airwayCloses', 'airwayOpens', 'crisisPulseInterrupts', 'crisisAirwayInterrupts', 'coreScanInterrupts'] as const;
type ControlCount = typeof CONTROL_COUNTS[number];

export interface OrganCareMetrics { repairActions: number; repaired: number; loss: number; cost: number }
export interface RunMetricsSummary {
  schemaVersion: typeof RUN_METRICS_VERSION;
  limited: boolean;
  care: {
    repairActions: number; repaired: number; organLoss: number; organCost: number; playerDamage: number;
    organs: Record<OrganId, OrganCareMetrics>;
  };
  control: Record<ControlCount, number> & {
    diagnosedTraits: TraitId[];
    migrationChoice: MigrationChoice | null;
    migrationInterception: 'clear' | 'closed-airway' | null;
    migrationMissed: boolean;
    coreMembranes: TraitId[];
    coreCleared: boolean;
  };
}
type EntryKind = 'hit' | 'chain' | 'ricochet' | 'resonance' | 'beacon' | 'patrol' | 'pulse-chain' | 'trace-beacon';
interface FrameEntry { kind: EntryKind; rootId: string; targetId: string; protocolId: ProtocolId }
export interface RunMetrics {
  runId: string; lastSequence: number; lastTick: number; ended: boolean;
  summary: RunMetricsSummary;
  /** Ephemeral proof joins; never serialize these into a profile summary. */
  frame: { tick: number; entries: FrameEntry[] };
}
export interface AcceptedRunMetricEvent { runId: string; sequence: number; event: GameEvent }
export interface RunMetricsText { care: string; control: string; details: string[]; chainDefinition: string; notice: string }

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const positive = (value: unknown): value is number => amount(value) && value > 0;
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 240 && value.trim() === value;
const organ = (value: unknown): value is OrganId => value === 'heart' || value === 'lung';
const trait = (value: unknown): value is TraitId => TRAITS.includes(value as TraitId);
const protocol = (value: unknown): value is ProtocolId => PROTOCOLS.includes(value as ProtocolId);
const display = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const freshOrgan = (): OrganCareMetrics => ({ repairActions: 0, repaired: 0, loss: 0, cost: 0 });

export function createRunMetrics(runId: string): RunMetrics {
  return { runId, lastSequence: -1, lastTick: -1, ended: false, frame: { tick: -1, entries: [] },
    summary: { schemaVersion: RUN_METRICS_VERSION, limited: false,
      care: { repairActions: 0, repaired: 0, organLoss: 0, organCost: 0, playerDamage: 0, organs: { heart: freshOrgan(), lung: freshOrgan() } },
      control: { ...Object.fromEntries(CONTROL_COUNTS.map(key => [key, 0])) as Record<ControlCount, number>, diagnosedTraits: [],
        migrationChoice: null, migrationInterception: null, migrationMissed: false, coreMembranes: [], coreCleared: false } } };
}
function cloneSummary(summary: RunMetricsSummary): RunMetricsSummary {
  return { ...summary, care: { ...summary.care, organs: { heart: { ...summary.care.organs.heart }, lung: { ...summary.care.organs.lung } } },
    control: { ...summary.control, diagnosedTraits: [...summary.control.diagnosedTraits], coreMembranes: [...summary.control.coreMembranes] } };
}
function limited(state: RunMetrics): RunMetrics { return state.summary.limited ? state : { ...state, summary: { ...state.summary, limited: true } }; }
function modify(state: RunMetrics, update: (summary: RunMetricsSummary) => void): RunMetrics {
  const summary = cloneSummary(state.summary); update(summary); return { ...state, summary };
}
function sum(summary: RunMetricsSummary, current: number, delta: number): number {
  const result = current + delta;
  if (result > Number.MAX_SAFE_INTEGER) { summary.limited = true; return Number.MAX_SAFE_INTEGER; }
  return result;
}
function add(summary: RunMetricsSummary, key: ControlCount, delta = 1): void { summary.control[key] = sum(summary, summary.control[key], delta); }
function has(state: RunMetrics, kind: EntryKind, rootId: string, targetId?: string, protocolId?: ProtocolId): boolean {
  return state.frame.entries.some(entry => entry.kind === kind && entry.rootId === rootId
    && (targetId === undefined || entry.targetId === targetId) && (protocolId === undefined || entry.protocolId === protocolId));
}
function append(state: RunMetrics, entry: FrameEntry): RunMetrics {
  if (state.frame.entries.length >= RUN_METRICS_FRAME_LIMIT) return limited(state);
  return { ...state, frame: { ...state.frame, entries: [...state.frame.entries, entry] } };
}

/**
 * Fold each accepted host event once, before recursive director callbacks.
 * TARGET_HIT must carry actual positive HP loss plus organId/rootId/protocolId.
 * Planned PROTOCOL_* logs count only after a matching same-tick accepted hit.
 */
export function reduceRunMetrics(previous: RunMetrics, input: AcceptedRunMetricEvent): RunMetrics {
  if (previous.ended || input.runId !== previous.runId || !count(input.sequence) || input.sequence <= previous.lastSequence
    || !count(input.event.tick) || input.event.tick < previous.lastTick || !object(input.event.data)) return previous;
  const event = input.event, d = event.data;
  let state: RunMetrics = { ...previous, lastSequence: input.sequence, lastTick: event.tick,
    frame: event.tick === previous.frame.tick ? previous.frame : { tick: event.tick, entries: [] } };
  if (event.type === 'RUN_ENDED') return { ...state, ended: true, frame: { tick: event.tick, entries: [] } };
  if (event.type === 'TARGET_HIT' && d.cause === 'protocol' && positive(d.damage)) {
    if (!organ(d.organId) || !identifier(d.rootId) || !identifier(d.id) || !protocol(d.protocolId)) return limited(state);
    if (has(state, 'hit', d.rootId, d.id, d.protocolId)) return state;
    return append(state, { kind: 'hit', rootId: d.rootId, targetId: d.id, protocolId: d.protocolId });
  }
  const hitLogs: Record<string, { kind: EntryKind; protocolId: ProtocolId; count: ControlCount; label: string }> = {
    PROTOCOL_CHAIN_HIT: { kind: 'chain', protocolId: 'PURIFY_CHAIN', count: 'chainHops', label: 'PURIFY_CHAIN' },
    PROTOCOL_RICOCHET_HIT: { kind: 'ricochet', protocolId: 'PURIFY_CHAIN', count: 'ricochetHits', label: 'PURIFY_CHAIN' },
    PROTOCOL_RESONANCE_HIT: { kind: 'resonance', protocolId: 'PULSE_BREAK', count: 'resonanceHits', label: 'PULSE_BREAK' },
    PROTOCOL_BEACON_HIT: { kind: 'beacon', protocolId: 'IMMUNE_BEACON', count: 'beaconBites', label: 'IMMUNE_BEACON' },
    IMMUNE_PATROL_HIT: { kind: 'patrol', protocolId: 'IMMUNE_BEACON', count: 'patrolBites', label: 'BASE_PATROL' },
  };
  const log = hitLogs[event.type];
  if (log) {
    if (d.protocolId !== log.label || !identifier(d.rootId) || !identifier(d.targetId)
      || event.type === 'PROTOCOL_CHAIN_HIT' && (!count(d.hop) || d.hop < 1 || d.hop > 3)
      || !has(state, 'hit', d.rootId, d.targetId, log.protocolId) || has(state, log.kind, d.rootId, d.targetId, log.protocolId)) return state;
    if (state.frame.entries.length >= RUN_METRICS_FRAME_LIMIT) return limited(state);
    const newChain = log.kind === 'chain' && !has(state, 'chain', d.rootId);
    state = append(state, { kind: log.kind, rootId: d.rootId, targetId: d.targetId, protocolId: log.protocolId });
    return modify(state, summary => { add(summary, log.count); if (newChain) add(summary, 'chainTriggers'); });
  }
  if (event.type === 'PROTOCOL_SYNERGY' && identifier(d.rootId)) {
    if (d.pair === 'PULSE_BREAK+PURIFY_CHAIN' && has(state, 'chain', d.rootId) && !has(state, 'pulse-chain', d.rootId)) {
      if (state.frame.entries.length >= RUN_METRICS_FRAME_LIMIT) return limited(state);
      state = append(state, { kind: 'pulse-chain', rootId: d.rootId, targetId: '', protocolId: 'PURIFY_CHAIN' });
      return modify(state, summary => add(summary, 'synergyPulseChain'));
    }
    if (d.pair === 'EXPOSE_TRACE+IMMUNE_BEACON' && identifier(d.targetId) && has(state, 'beacon', d.rootId, d.targetId)
      && !has(state, 'trace-beacon', d.rootId, d.targetId)) {
      if (state.frame.entries.length >= RUN_METRICS_FRAME_LIMIT) return limited(state);
      state = append(state, { kind: 'trace-beacon', rootId: d.rootId, targetId: d.targetId, protocolId: 'IMMUNE_BEACON' });
      return modify(state, summary => add(summary, 'synergyTraceBeacon'));
    }
    return state;
  }
  if (event.type === 'ORGAN_INTEGRITY_CHANGED' && organ(d.organId) && amount(d.before) && amount(d.after) && d.before <= 100 && d.after <= 100) {
    const organId = d.organId, before = d.before, after = d.after;
    if (d.reason === 'repair' && after > before) return modify(state, summary => {
      const care = summary.care, local = care.organs[organId], restored = after - before;
      care.repairActions = sum(summary, care.repairActions, 1); local.repairActions = sum(summary, local.repairActions, 1);
      care.repaired = sum(summary, care.repaired, restored); local.repaired = sum(summary, local.repaired, restored);
    });
    if (before > after) return modify(state, summary => {
      const care = summary.care, local = care.organs[organId], loss = before - after;
      care.organLoss = sum(summary, care.organLoss, loss); local.loss = sum(summary, local.loss, loss);
      if (ORGAN_COST_REASONS.includes(String(d.reason))) { care.organCost = sum(summary, care.organCost, loss); local.cost = sum(summary, local.cost, loss); }
    });
    return state;
  }
  if (event.type === 'PLAYER_HURT' && positive(d.damage) && d.damage <= 100) return modify(state, summary => { summary.care.playerDamage = sum(summary, summary.care.playerDamage, d.damage as number); });
  if (event.type === 'SCAN_COMPLETED' && count(d.found)) return modify(state, summary => add(summary, 'scans'));
  if (event.type === 'GROWTH_REWARD' && typeof d.key === 'string' && (positive(d.xp) || positive(d.research))) {
    const diagnosed = d.key.startsWith('diagnose:') ? d.key.slice(9) : undefined;
    if (trait(diagnosed) && !state.summary.control.diagnosedTraits.includes(diagnosed)) return modify(state, summary => { summary.control.diagnosedTraits.push(diagnosed); });
  }
  if (event.type === 'PULSE_TRIGGERED' && organ(d.organId)) return modify(state, summary => {
    add(summary, 'pulseUses');
    if (count(d.exposed)) add(summary, 'crystalExposures', d.exposed); else summary.limited = true;
    if (d.coreHit === true) add(summary, 'corePulseHits'); else if (d.coreHit !== false) summary.limited = true;
    // `pushed` includes bodies whose collision projection did not move. Never
    // describe that producer field as proven displacement or avoided damage.
  });
  if (event.type === 'AIRWAY_CHANGED' && d.organId === 'lung' && typeof d.open === 'boolean') return modify(state, summary => add(summary, d.open ? 'airwayOpens' : 'airwayCloses'));
  if (event.type === 'ORGAN_CRISIS_INTERRUPTED' && identifier(d.sourceId)) {
    if (d.organId === 'heart' && d.reason === 'pulse') return modify(state, summary => add(summary, 'crisisPulseInterrupts'));
    if (d.organId === 'lung' && d.reason === 'airway') return modify(state, summary => add(summary, 'crisisAirwayInterrupts'));
  }
  if (event.type === 'MIGRATION_DECIDED' && ['pursue', 'block', 'ignore'].includes(String(d.choice))) return modify(state, summary => {
    const choice = d.choice as MigrationChoice;
    if (summary.control.migrationChoice !== null && summary.control.migrationChoice !== choice) summary.limited = true;
    else summary.control.migrationChoice = choice;
  });
  if (event.type === 'MIGRATION_INTERCEPTED' && (d.by === 'clear' || d.by === 'closed-airway')) return modify(state, summary => { summary.control.migrationInterception = d.by as 'clear' | 'closed-airway'; });
  if (event.type === 'MIGRATION_ESTABLISHED') return modify(state, summary => { summary.control.migrationMissed = true; });
  if (event.type === 'CORE_MEMBRANE_BROKEN' && trait(d.trait) && identifier(d.coreId) && !state.summary.control.coreMembranes.includes(d.trait)) return modify(state, summary => { summary.control.coreMembranes.push(d.trait as TraitId); });
  if (event.type === 'CORE_CORROSION_INTERRUPTED' && identifier(d.coreId) && identifier(d.attackId) && d.by === 'scan') return modify(state, summary => add(summary, 'coreScanInterrupts'));
  if (event.type === 'CORE_CLEARED' && (identifier(d.coreId) || identifier(d.actorId))) return modify(state, summary => { summary.control.coreCleared = true; });
  return state;
}

/** Only the explicit, bounded DTO leaves the run. No event, root or match cache. */
export function summarizeRunMetrics(metrics: RunMetrics): RunMetricsSummary { return cloneSummary(metrics.summary); }
function same(a: number, b: number) { return Math.abs(a - b) <= Math.max(1, a, b) * 1e-9; }
function traitArray(value: unknown): value is TraitId[] { return Array.isArray(value) && value.length <= 3 && value.every(trait) && new Set(value).size === value.length; }
function parseOrgan(value: unknown): OrganCareMetrics | undefined {
  if (!object(value) || !count(value.repairActions) || !amount(value.repaired) || !amount(value.loss) || !amount(value.cost) || value.cost > value.loss) return;
  return { repairActions: value.repairActions, repaired: value.repaired, loss: value.loss, cost: value.cost };
}

/** Missing/invalid old data remains unrecorded. Unknown keys never restore run state. */
export function parseRunMetricsSummary(value: unknown): RunMetricsSummary | undefined {
  if (!object(value) || value.schemaVersion !== RUN_METRICS_VERSION || typeof value.limited !== 'boolean' || !object(value.care) || !object(value.control)) return;
  const care = value.care, control = value.control;
  if (!count(care.repairActions) || !amount(care.repaired) || !amount(care.organLoss) || !amount(care.organCost) || !amount(care.playerDamage) || !object(care.organs)) return;
  const heart = parseOrgan(care.organs.heart), lung = parseOrgan(care.organs.lung);
  if (!heart || !lung || !same(care.repairActions, heart.repairActions + lung.repairActions) || !same(care.repaired, heart.repaired + lung.repaired)
    || !same(care.organLoss, heart.loss + lung.loss) || !same(care.organCost, heart.cost + lung.cost) || care.organCost > care.organLoss) return;
  if (!CONTROL_COUNTS.every(key => count(control[key])) || !traitArray(control.diagnosedTraits) || !traitArray(control.coreMembranes)
    || control.migrationChoice !== null && !['pursue', 'block', 'ignore'].includes(String(control.migrationChoice))
    || control.migrationInterception !== null && !['clear', 'closed-airway'].includes(String(control.migrationInterception))
    || typeof control.migrationMissed !== 'boolean' || typeof control.coreCleared !== 'boolean') return;
  if ((control.chainTriggers as number) > (control.chainHops as number) || (control.synergyPulseChain as number) > (control.chainTriggers as number)
    || (control.synergyTraceBeacon as number) > (control.beaconBites as number) || (control.corePulseHits as number) > (control.pulseUses as number)) return;
  return { schemaVersion: RUN_METRICS_VERSION, limited: value.limited,
    care: { repairActions: care.repairActions, repaired: care.repaired, organLoss: care.organLoss, organCost: care.organCost, playerDamage: care.playerDamage, organs: { heart, lung } },
    control: { ...Object.fromEntries(CONTROL_COUNTS.map(key => [key, control[key]])) as Record<ControlCount, number>, diagnosedTraits: [...control.diagnosedTraits],
      coreMembranes: [...control.coreMembranes], migrationChoice: control.migrationChoice as MigrationChoice | null,
      migrationInterception: control.migrationInterception as 'clear' | 'closed-airway' | null, migrationMissed: control.migrationMissed, coreCleared: control.coreCleared } };
}

const CHAIN_DEFINITION = '连锁次数：每条净化链至少一次真实邻体正伤害计一次；跳数按实际命中计。进阶折射单列。共振×连锁按链计，显影×小队按实际标记咬击计，不按整队轮次计。';
export function formatRunMetrics(summary: RunMetricsSummary | undefined): RunMetricsText {
  if (!summary) return { care: '本局未记录有效修复与受击统计。', control: '本局未记录连锁与联动统计。', details: [], chainDefinition: CHAIN_DEFINITION, notice: '旧病例没有完整行动统计，未将缺失记录填为零。' };
  const c = summary.care, s = summary.control, names: Record<TraitId, string> = { CARAPACE: '晶壳', FISSION: '裂殖', MIMIC: '潜伏' };
  const migration = s.migrationChoice ? { pursue: '追击', block: '封锁', ignore: '放任' }[s.migrationChoice] : '未记录迁移选择';
  const outcome = s.migrationInterception === 'clear' ? '；实际清除小体完成拦截' : s.migrationInterception === 'closed-airway' ? '；实际关闭气道完成拦截' : s.migrationMissed ? '；本次未截住迁移' : '';
  return {
    care: `有效修复 ${display(c.repaired)} 点 · ${c.repairActions} 次；受击 ${display(c.playerDamage)} 点`,
    control: `连锁 ${s.chainTriggers} 次 / ${s.chainHops} 跳；折射 ${s.ricochetHits} 次`,
    notice: summary.limited ? '本局统计不完整，以下仅显示已记录事实。' : '', chainDefinition: CHAIN_DEFINITION,
    details: [
      `组织总损失 ${display(c.organLoss)} 点，其中装置／协议主动代价 ${display(c.organCost)} 点；修复量按完整度实际增加计算。`,
      `心脏实际修复 ${display(c.organs.heart.repaired)} 点，损失 ${display(c.organs.heart.loss)} 点；肺部实际修复 ${display(c.organs.lung.repaired)} 点，损失 ${display(c.organs.lung.loss)} 点。`,
      `实际联动：共振×连锁 ${s.synergyPulseChain} 次；显影×小队 ${s.synergyTraceBeacon} 次标记咬击。`,
      `实际命中：共振 ${s.resonanceHits} 次、灯塔小队 ${s.beaconBites} 次咬击、基础侦巡 ${s.patrolBites} 次咬击。`,
      `环境：冲流 ${s.pulseUses} 次，晶壳暴露 ${s.crystalExposures} 体次，母巢被冲流命中 ${s.corePulseHits} 次；气道关闭 ${s.airwayCloses} 次、开启 ${s.airwayOpens} 次。`,
      `危机充能实际中断：冲流 ${s.crisisPulseInterrupts} 次、气道截流 ${s.crisisAirwayInterrupts} 次；不折算避免伤害。`,
      `诊断：扫描 ${s.scans} 次；${s.diagnosedTraits.length ? `实际诊断 ${s.diagnosedTraits.map(id => names[id]).join('、')}` : '未记录变异诊断'}。`,
      `迁移：${migration}${outcome}。`,
      `母巢：实际破膜 ${s.coreMembranes.length} 种，Q 中断侵蚀 ${s.coreScanInterrupts} 次；${s.coreCleared ? '已实际清除' : '未记录清除'}。`,
    ],
  };
}
