import type { BeaconProtocolConfig, ChainProtocolConfig, DraftOption, EquippedProtocol, ProtocolId, ProtocolInfo, ProtocolRank, PulseProtocolConfig, TraceProtocolConfig, Tuning } from './growthTypes';

export const PROTOCOL_IDS: ProtocolId[] = ['PULSE_BREAK', 'PURIFY_CHAIN', 'IMMUNE_BEACON', 'EXPOSE_TRACE'];
export const TUNINGS: Tuning[] = ['balanced', 'focused', 'extended'];
export const TUNING_NAMES: Record<Tuning, string> = { balanced: '均衡', focused: '聚焦', extended: '延展' };
export const PROTOCOLS: Record<ProtocolId, ProtocolInfo> = {
  PULSE_BREAK: { id: 'PULSE_BREAK', name: '共振裂解', symbol: '◇', trigger: '靠近节律装置，在冲流相位用基础工具命中', tags: ['PULSE', 'BREAK'] },
  PURIFY_CHAIN: { id: 'PURIFY_CHAIN', name: '连锁净化', symbol: '⌁', trigger: '基础工具清除感染体或感染源', tags: ['CHAIN', 'PURIFY'] },
  IMMUNE_BEACON: { id: 'IMMUNE_BEACON', name: '免疫灯塔', symbol: '✚', trigger: 'Q 标记鼠标区域，召集三只临时免疫细胞', tags: ['SUMMON', 'ZONE'] },
  EXPOSE_TRACE: { id: 'EXPOSE_TRACE', name: '异常显影', symbol: '◌', trigger: 'Q 扫描当前范围内活跃感染体', tags: ['SCAN', 'REVEAL'] },
};
export const GROWTH_BALANCE = { slots: 3, xpThresholds: [20, 55, 95, 150, 220], researchCost: 3, maxRank: 3, chainCap: 3, commandBudget: 128, scanRadius: 650, beaconPlacementRange: 420 } as const;
export const PATROL_CONFIG = { radius: 190, damage: 12, interval: 1.2, duration: 3.5, cooldown: 3 } as const;
export const RANK_NAMES: Record<ProtocolRank, string> = { 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ' };
export const protocolRank = (slot?: Pick<EquippedProtocol, 'rank'>): ProtocolRank => slot?.rank ?? 1;
export const chainRicochetPeriod = (rank: ProtocolRank): number | null => rank === 1 ? null : rank === 2 ? 3 : 2;
export const PROTOCOL_ACTIONS: Record<ProtocolId, string> = {
  PULSE_BREAK: '靠近器官装置，趁冲流亮起用 1 / 2 命中，触发破壳冲击。',
  PURIFY_CHAIN: '把感染体引到一起，用 1 / 2 收尾，观察净化电弧连续跳跃。',
  IMMUNE_BEACON: '现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。',
  EXPOSE_TRACE: '现在按 Q，让敌群显形并减速；搭配免疫细胞优先围猎标记体。',
};
export const protocolAction = (id: ProtocolId, rank: ProtocolRank = 1): string => id === 'PURIFY_CHAIN' && rank > 1
  ? `用 1 / 2 持续命中存活目标，每 ${chainRicochetPeriod(rank)} 次命中自动向邻体折射；清除后仍会连锁。`
  : PROTOCOL_ACTIONS[id];
export const PULSE_CONFIG: Record<Tuning, PulseProtocolConfig> = {
  balanced: { deviceRange: 240, bonusDamage: 18, exposeSeconds: 4 },
  focused: { deviceRange: 170, bonusDamage: 28, exposeSeconds: 4 },
  extended: { deviceRange: 330, bonusDamage: 12, exposeSeconds: 5 },
};
export const CHAIN_CONFIG: Record<Tuning, ChainProtocolConfig> = {
  balanced: { range: 170, damage: 38, jumps: 2 },
  focused: { range: 120, damage: 52, jumps: 2 },
  extended: { range: 230, damage: 27, jumps: 2 },
};
export const BEACON_CONFIG: Record<Tuning, BeaconProtocolConfig> = {
  balanced: { radius: 190, damage: 24, interval: .8, duration: 6, cooldown: 12, tissueCost: 3 },
  focused: { radius: 150, damage: 24, interval: .5, duration: 4, cooldown: 12, tissueCost: 3 },
  extended: { radius: 240, damage: 24, interval: 1.1, duration: 8, cooldown: 12, tissueCost: 4 },
};
export const TRACE_CONFIG: Record<Tuning, TraceProtocolConfig> = {
  balanced: { duration: 9, slowDuration: 3, factor: .7 },
  focused: { duration: 5, slowDuration: 3, factor: .45 },
  extended: { duration: 14, slowDuration: 3, factor: .85 },
};

export function getPulseConfig(tuning: Tuning, rank: ProtocolRank = 1): PulseProtocolConfig {
  const base = PULSE_CONFIG[tuning], step = rank - 1;
  return { ...base, bonusDamage: base.bonusDamage + step * 14, exposeSeconds: base.exposeSeconds + step, deviceRange: base.deviceRange + step * 35 };
}
export function getChainConfig(tuning: Tuning, rank: ProtocolRank = 1): ChainProtocolConfig {
  const base = CHAIN_CONFIG[tuning], step = rank - 1;
  return { ...base, damage: base.damage + step * 16, range: base.range + step * 30 };
}
export function getBeaconConfig(tuning: Tuning, rank: ProtocolRank = 1): BeaconProtocolConfig {
  const base = BEACON_CONFIG[tuning], step = rank - 1;
  return { ...base, damage: base.damage + step * 12, radius: base.radius + step * 25, duration: base.duration + step * 2 };
}
export function getTraceConfig(tuning: Tuning, rank: ProtocolRank = 1): TraceProtocolConfig {
  const base = TRACE_CONFIG[tuning], step = rank - 1;
  return { ...base, duration: base.duration + step * 3, slowDuration: base.slowDuration + step * 1.5, factor: Number(Math.max(.2, base.factor - step * .1).toFixed(2)) };
}

export function protocolUpgradeSummary(id: ProtocolId, tuning: Tuning, before: ProtocolRank, after: ProtocolRank): string {
  if (id === 'PULSE_BREAK') { const a=getPulseConfig(tuning,before), b=getPulseConfig(tuning,after); return `共振追加伤害 ${a.bonusDamage} → ${b.bonusDamage}；破绽 ${a.exposeSeconds} → ${b.exposeSeconds} 秒。`; }
  if (id === 'PURIFY_CHAIN') { const a=getChainConfig(tuning,before), b=getChainConfig(tuning,after); return `每跳伤害 ${a.damage} → ${b.damage}；${after===2?'新能力：持续命中存活目标，每3次向邻体折射。':'折射蓄能：3次命中 → 2次。'}`; }
  if (id === 'IMMUNE_BEACON') { const a=getBeaconConfig(tuning,before), b=getBeaconConfig(tuning,after); return `小队每轮总伤害 ${a.damage} → ${b.damage}；持续 ${a.duration} → ${b.duration} 秒。`; }
  const a=getTraceConfig(tuning,before), b=getTraceConfig(tuning,after); return `减速时长 ${a.slowDuration} → ${b.slowDuration} 秒；移动速度 ×${a.factor} → ×${b.factor}。`;
}

/** Draft and HUD text is derived from the same parameters used by the controller. */
export function describeProtocol(id: ProtocolId, tuning: Tuning = 'balanced', rank: ProtocolRank = 1): { effect: string; cost: string } {
  if (id === 'PULSE_BREAK') { const c=getPulseConfig(tuning,rank); return { effect: `距装置 ${c.deviceRange} 内，冲流相位命中追加 ${c.bonusDamage} 共振伤害，破壳 ${c.exposeSeconds} 秒；每目标每节律最多一次。`, cost: '需要接近装置并配合节律；无时机时不追加。' }; }
  if (id === 'PURIFY_CHAIN') { const c=getChainConfig(tuning,rank); return { effect: `清除后向 ${c.range} 范围内邻体跳 ${c.jumps} 次，每跳 ${c.damage} 伤害；共振破绽清除可增为 3 跳。${rank>1?`持续命中存活目标，每${chainRicochetPeriod(rank)}次向一个邻体折射${c.damage}伤害。`:''}`, cost: '单体无邻体时无额外收益；跳跃检查视线，协议伤害不再开新链。' }; }
  if (id === 'IMMUNE_BEACON') { const c=getBeaconConfig(tuning,rank); return { effect: `召集三只免疫细胞，持续 ${c.duration} 秒；活动范围 ${c.radius}，每 ${c.interval} 秒每轮总伤害 ${c.damage}。显影联动优先围猎标记体。`, cost: `独立冷却 ${c.cooldown} 秒；每次组织承压 −${c.tissueCost}；同时一支小队，替换后撤离。` }; }
  const c=getTraceConfig(tuning,rank); return { effect: `标记与显形 ${c.duration} 秒，前 ${c.slowDuration} 秒移动速度 ×${c.factor}；免疫小队优先追踪标记目标。`, cost: '占用一个协议槽位，没有直接伤害。' };
}
export function makeDraftOption(protocolId: ProtocolId, tuning: Tuning, kind: DraftOption['kind'], rank: ProtocolRank = 1, previous?: EquippedProtocol): DraftOption {
  const info=PROTOCOLS[protocolId], description=describeProtocol(protocolId,tuning,rank);
  const upgrading = kind === 'retune' && rank > protocolRank(previous);
  return { id: `${protocolId}:${kind}:${tuning}:rank${rank}`, kind, protocolId, tuning, rank,
    title: `${info.name} ${RANK_NAMES[rank]} · ${upgrading?'进阶':kind==='retune'?'战术改造':TUNING_NAMES[tuning]}`, trigger: info.trigger,
    change: previous ? upgrading ? protocolUpgradeSummary(protocolId,tuning,protocolRank(previous),rank) : `${TUNING_NAMES[previous.tuning]} → ${TUNING_NAMES[tuning]}，保持 ${RANK_NAMES[rank]} 阶；改变取向，不额外升级。` : `解锁新打法 · ${PROTOCOL_ACTIONS[protocolId]}`,
    actionHint: protocolAction(protocolId,rank), effect: description.effect, cost: description.cost, tags: [...info.tags] };
}
