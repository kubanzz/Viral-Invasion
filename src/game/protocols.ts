import type { BeaconProtocolConfig, ChainProtocolConfig, DraftOption, ProtocolId, ProtocolInfo, PulseProtocolConfig, TraceProtocolConfig, Tuning } from './growthTypes';

export const PROTOCOL_IDS: ProtocolId[] = ['PULSE_BREAK', 'PURIFY_CHAIN', 'IMMUNE_BEACON', 'EXPOSE_TRACE'];
export const TUNINGS: Tuning[] = ['balanced', 'focused', 'extended'];
export const TUNING_NAMES: Record<Tuning, string> = { balanced: '均衡', focused: '聚焦', extended: '延展' };
export const PROTOCOLS: Record<ProtocolId, ProtocolInfo> = {
  PULSE_BREAK: { id: 'PULSE_BREAK', name: '共振裂解', symbol: '◇', trigger: '靠近节律装置，在冲流相位用基础工具命中', tags: ['PULSE', 'BREAK'] },
  PURIFY_CHAIN: { id: 'PURIFY_CHAIN', name: '连锁净化', symbol: '⌁', trigger: '基础工具清除感染体或感染源', tags: ['CHAIN', 'PURIFY'] },
  IMMUNE_BEACON: { id: 'IMMUNE_BEACON', name: '免疫灯塔', symbol: '✚', trigger: 'Q 扫描后，在鼠标标记点召集临时免疫灯塔', tags: ['SUMMON', 'ZONE'] },
  EXPOSE_TRACE: { id: 'EXPOSE_TRACE', name: '异常显影', symbol: '◌', trigger: 'Q 扫描当前范围内活跃感染体', tags: ['SCAN', 'REVEAL'] },
};
export const GROWTH_BALANCE = { slots: 3, xpThresholds: [20, 55, 95], researchCost: 3, chainCap: 3, commandBudget: 128, scanRadius: 650, beaconPlacementRange: 420 } as const;
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

/** Draft and HUD text is derived from the same parameters used by the controller. */
export function describeProtocol(id: ProtocolId, tuning: Tuning = 'balanced'): { effect: string; cost: string } {
  if (id === 'PULSE_BREAK') { const c=PULSE_CONFIG[tuning]; return { effect: `距装置 ${c.deviceRange} 内，冲流相位命中追加 ${c.bonusDamage} 共振伤害，破壳 ${c.exposeSeconds} 秒；每目标每节律最多一次。`, cost: '需要接近装置并配合节律；无时机时不追加。' }; }
  if (id === 'PURIFY_CHAIN') { const c=CHAIN_CONFIG[tuning]; return { effect: `清除后向 ${c.range} 范围内邻体跳 ${c.jumps} 次，每跳 ${c.damage} 伤害；共振破绽清除可增为 3 跳。`, cost: '单体无邻体时无额外收益；跳跃检查视线，协议伤害不再开新链。' }; }
  if (id === 'IMMUNE_BEACON') { const c=BEACON_CONFIG[tuning]; return { effect: `灯塔持续 ${c.duration} 秒，射程 ${c.radius}，每 ${c.interval} 秒造成 ${c.damage} 伤害。显影联动时优先已标记体。`, cost: `独立冷却 ${c.cooldown} 秒；每次组织承压 −${c.tissueCost}；同时仅一座。` }; }
  const c=TRACE_CONFIG[tuning]; return { effect: `标记与显形 ${c.duration} 秒，前 ${c.slowDuration} 秒移动速度 ×${c.factor}；灯塔优先追踪标记目标。`, cost: '占用一个协议槽位，没有直接伤害。' };
}
export function makeDraftOption(protocolId: ProtocolId, tuning: Tuning, kind: DraftOption['kind']): DraftOption {
  const info=PROTOCOLS[protocolId], description=describeProtocol(protocolId,tuning);
  return { id: `${protocolId}:${kind}:${tuning}`, kind, protocolId, tuning,
    title: `${info.name} · ${TUNING_NAMES[tuning]}${kind==='retune'?'校准':''}`, trigger: info.trigger,
    effect: description.effect, cost: description.cost, tags: [...info.tags] };
}
