import { TRAITS } from './battleConfig';
import type { TraitId } from './battleTypes';
import type { GameEvent, GameState, MessagePriority } from './types';

/** Finite keys deliberately exclude actor/transaction IDs and arbitrary strings. */
export const TACTICAL_RECORD_LIMIT = 64;
interface Feedback { key: string; text: string; priority: MessagePriority; seconds: number; toast?: boolean }
const traitId = (value: unknown): TraitId | undefined => value === 'CARAPACE' || value === 'FISSION' || value === 'MIMIC' ? value : undefined;
const organ = (value: unknown) => value === 'lung' ? '肺部' : value === 'heart' ? '心脏' : '当前器官';
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const organCrisisEvent = (type: string) => type === 'ORGAN_CRISIS_STARTED' || type === 'ORGAN_CRISIS_INTERRUPTED' || type === 'ORGAN_CRISIS_CLEARED';
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function organCrisisFeedback(event: GameEvent): Feedback | undefined {
  const d = event.data;
  if ((d.organId !== 'heart' && d.organId !== 'lung') || typeof d.sourceId !== 'string' || !d.sourceId.trim() || d.sourceId.length > 128) return;
  // One configured crisis per organ. Keep source IDs out of record keys so a
  // producer ID can never create unbounded categories or evict other causes.
  const label = organ(d.organId), key = `${event.type}:${d.organId}`;
  if (event.type === 'ORGAN_CRISIS_STARTED') {
    if (!positive(d.chargeSeconds) || !count(d.maximumImpacts) || typeof d.blockedByAirway !== 'boolean') return;
    return { key, text: d.blockedByAirway
      ? `${label}传播支点已出现；气道已关闭，冲击充能暂停。可先抢修，再净化支点；重新开放气道后充能继续。`
      : `${label}传播支点已出现，开始 ${d.chargeSeconds} 秒充能，最多 ${d.maximumImpacts} 次组织冲击。可净化支点，或借器官装置中断并抢修。`, priority: 2, seconds: 9 };
  }
  if (event.type === 'ORGAN_CRISIS_INTERRUPTED') {
    if (!positive(d.chargeSeconds) || !count(d.interruptions) || d.interruptions === 0) return;
    if (d.reason === 'pulse' && d.organId === 'heart') return { key: `${key}:pulse`, text: `${label}冲流已打断支点充能，重置为 ${d.chargeSeconds} 秒；支点仍需净化。`, priority: 2, seconds: 6 };
    if (d.reason === 'airway' && d.organId === 'lung') return { key: `${key}:airway`, text: `${label}气道已截断支点充能，充能暂停；可先抢修，支点仍需净化。`, priority: 2, seconds: 6 };
    return;
  }
  if (event.type === 'ORGAN_CRISIS_CLEARED') {
    if (!count(d.impacts) || !count(d.interruptions)) return;
    return { key, text: `${label}危机源已净化，组织冲击已停止。实际冲击 ${d.impacts} 次、中断 ${d.interruptions} 次；受损组织仍需按实际完整度修复。`, priority: 2, seconds: 5 };
  }
}

export function tacticalFeedback(event: GameEvent): Feedback | undefined {
  if (organCrisisEvent(event.type)) return organCrisisFeedback(event);
  const d = event.data, trait = traitId(d.trait), t = trait ? TRAITS[trait] : undefined;
  const organKey = d.organId === 'lung' ? 'lung' : d.organId === 'heart' ? 'heart' : 'current';
  const item = (text: string, priority: MessagePriority = 2, seconds = 7, suffix = '', toast = true): Feedback => ({ key: `${event.type}${suffix}`, text, priority, seconds, toast });
  switch (event.type) {
    case 'EVOLUTION_WARNING': return item(`变异预警 · ${t?.name ?? '未知特性'}：${t?.ability ?? ''}。代价：${t?.cost ?? ''}。反制：${t?.counter ?? '先扫描诊断'}。`, 2, Number(d.duration) || 8, `:${trait ?? 'unknown'}`);
    case 'EVOLUTION_APPLIED': return item(`${t?.symbol ?? '△'} ${t?.name ?? '病毒变异'}已出现。弱点：${t?.counter ?? '扫描诊断'}。`, 2, 7, `:${trait ?? 'unknown'}`);
    case 'INFECTION_CRISIS_STARTED': return item('感染负荷 100！15 秒内净化感染源/感染体或抢修，降低感染即可解除危机。', 3, 15);
    case 'INFECTION_CRISIS_RECOVERED': return item('感染负荷下降，致命倒计时解除。继续净化并修复组织。', 3, 5);
    case 'ORGAN_ALARM': return item(`${organ(d.organId)}低于 30%！8 秒后全身稳定开始下降，请及时抢修。`, 3, 8, `:${organKey}`);
    case 'ORGAN_ALARM_CLEARED': return item(`${organ(d.organId)}抢修成功，器官警报解除。`, 3, 5, `:${organKey}`);
    case 'MIGRATION_WARNING': return item('病毒向肺部迁移：12 秒。出口 E 追击；心脏隔离闸 E 保持 2 秒封锁；不响应则肺部建立新源。', 2, 12);
    case 'MIGRATION_BLOCK_STARTED': return item('保持在隔离闸附近 2 秒完成封锁。离开会取消；战斗仍在进行。', 2, 3);
    case 'MIGRATION_BLOCK_CANCELLED': return item('已离开隔离闸，封锁取消；迁移倒数继续。', 2, 3);
    case 'MIGRATION_PREEMPTIVELY_BLOCKED': return item('隔离闸提前关闭，迁移自动封锁；病毒会滞留为心脏新感染源。');
    case 'MIGRATION_DECIDED': {
      const choice = d.choice === 'pursue' ? 'pursue' : d.choice === 'block' ? 'block' : 'ignore';
      return item(choice === 'pursue' ? '追击进入肺部：12 秒内清除迁移小体或关闭气道，阻止额外感染源。' : choice === 'block' ? '迁移已封锁：肺部未被激活，心脏新增滞留感染源并承压 −4。' : '放任迁移：肺部新增感染源并受损；出口开放，仍可救援。', 2, 8, `:${choice}`);
    }
    case 'MIGRATION_INTERCEPTED': return item('迁移被拦截，肺部未建立额外感染源。继续净化并保护器官。');
    case 'MIGRATION_ESTABLISHED': return item('未能及时拦截，迁移群在肺部建立新感染源。仍可净化该源挽回。');
    case 'CORE_LOCATED': return item(`主要感染源已净化。前往${organ(d.organId)}复测台按 E，唤醒双特性母巢。`, 2, 8);
    case 'CORE_COMBAT_STARTED': return item('母巢已苏醒：交替使用本局两种特性。躲开前摇或 Q 打断侵蚀，逐层打开核膜。');
    case 'CORE_MEMBRANE_BROKEN': return item(`母巢${t?.name ?? ''}核膜已破，剩余 ${Number(d.remaining) || 0} 层。`, 2, 5, `:${trait ?? 'unknown'}`);
    case 'CORE_MEMBRANES_OPENED': return item('母巢核膜全部打开！继续净化核心，保护器官。', 2, 5);
    case 'CORE_CORROSION_INTERRUPTED': return item('Q 扫描已打断母巢侵蚀，形成破绽。', 1, 3);
    case 'CORE_CLEARED': return item('母巢已净化。所有激活器官 ≥50%、感染 <35 后，到复测终端按 E。', 2, 7);
    case 'INFECTION_SOURCE_CLEARED': return item(`${organ(d.organId)}感染源已净化，停止增援并降低感染负荷。`, 1, 5, `:${organKey}`);
    case 'ELITE_CLEARED': return item(`${organ(d.organId)}${t?.name ?? '变异'}精英已清除。保持组织，继续处理当前目标。`, 1, 5, `:${trait ?? 'unknown'}`);
    case 'BACKGROUND_PRESSURE': return item(`${organ(d.organId)}离场仍有 ${number(d.openSources)} 个开放感染源，本次损伤 ${number(d.integrityLoss).toFixed(1)}。`, 1, 3, `:${organKey}`, false);
    case 'ORGAN_TRAVELLED': return item(`进入${organ(d.to)}；该器官离场期间损伤 ${number(d.backgroundLoss).toFixed(1)}。`, 1, 5, d.to === 'lung' ? ':lung' : ':heart', false);
    case 'RETEST_COMPLETED': return item('主动复测已通过，器官与感染门槛全部满足。', 2, 5);
    case 'RUN_ENDED': return item(String(d.reason || '本局已结束。'), 3, 8);
    default: return;
  }
}

/** One latest record per finite category, plus first time/count; ordinary spam cannot evict it. */
export function recordTacticalEvent(state: GameState, event: GameEvent): Feedback | undefined {
  const crisisEvent = organCrisisEvent(event.type);
  if (crisisEvent && (state.phase !== 'playing' || !Number.isSafeInteger(event.tick) || event.tick !== state.tick || event.tick < 0)) return;
  const feedback = tacticalFeedback(event);
  if (!feedback || !state.battle) return;
  const records = state.tacticalRecords ??= [];
  const at = event.tick / 60;
  const existing = records.find(record => record.key === feedback.key);
  // Accepted crisis producers emit each lifecycle transition once per tick.
  // Duplicate delivery must not inflate counts or replay an obsolete warning.
  if (crisisEvent && existing && at <= existing.at) return;
  if (existing) { existing.at = at; existing.text = feedback.text; existing.count = Math.min(Number.MAX_SAFE_INTEGER, existing.count + 1); }
  else if (records.length < TACTICAL_RECORD_LIMIT) records.push({ key: feedback.key, eventType: event.type, firstAt: at, at, text: feedback.text, count: 1 });
  return feedback;
}
