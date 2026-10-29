import type { DraftOption, EquippedProtocol, ProtocolId } from '../game/growthTypes';
import type { EndlessGrowthState, EndlessUpgradeId, EndlessUpgradeOption } from '../game/endlessGrowthTypes';
import { endlessCombatStats } from '../game/endlessGrowth';
import { getBeaconConfig, getChainConfig, getPulseConfig, getTraceConfig, protocolRank, TUNING_NAMES } from '../game/protocols';
import { artIconMarkup } from './artIcons';
import './upgradeChoices.css';

type ChoiceIcon = 'power' | 'multishot' | 'pierce' | 'nova' | 'dash' | 'scan' | 'vitality' | 'haste' | 'immune' | 'chain' | 'catalysis';
export interface ChoiceCopy { summary: string; action: string; caution: string; change?: string }
export const PROTOCOL_CHOICE_NAMES: Record<ProtocolId, string> = {
  PULSE_BREAK: '冲流破壳', PURIFY_CHAIN: '连锁攻击', IMMUNE_BEACON: '免疫小队', EXPOSE_TRACE: '扫描减速',
};
const number = (n: number) => String(Number(n.toFixed(2)));
const arrow = (a: number, b: number, suffix = '') => `${number(a)} → ${number(b)}${suffix}`;
const protocolIcons: Record<ProtocolId, ChoiceIcon> = { PULSE_BREAK: 'nova', PURIFY_CHAIN: 'chain', IMMUNE_BEACON: 'immune', EXPOSE_TRACE: 'scan' };

/** Reuse the installed art atlas; the few missing symbols are small native SVGs. */
export function choiceIconMarkup(icon: ChoiceIcon | ProtocolId): string {
  const name = icon in protocolIcons ? protocolIcons[icon as ProtocolId] : icon as ChoiceIcon;
  const art = name === 'vitality' ? 'heal' : name;
  if (art === 'dash' || art === 'scan' || art === 'heal' || art === 'chain') return `<span class="choice-icon" data-choice-icon="${name}" aria-hidden="true">${artIconMarkup(art)}</span>`;
  const paths: Partial<Record<ChoiceIcon, string>> = {
    power: '<path d="m14 2-9 12h6l-1 8 9-13h-6z"/>',
    multishot: '<path d="M12 21V4m-4 4 4-4 4 4M12 17 3 8m0 5V8h5m4 9 9-9m-5 0h5v5"/>',
    pierce: '<path d="M2 12h19m-5-5 5 5-5 5M7 5v4m0 6v4m6-14v4m0 6v4"/>',
    nova: '<circle cx="12" cy="12" r="5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    haste: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 3v3m0 5 4-3m2-5 2-2"/>',
    immune: '<circle cx="7" cy="15" r="4"/><circle cx="17" cy="15" r="4"/><circle cx="12" cy="6" r="4"/><path d="M11 6h2m-6 8v2m9-1h2"/>',
    catalysis: '<circle cx="6" cy="7" r="3"/><circle cx="18" cy="7" r="3"/><circle cx="12" cy="18" r="3"/><path d="M9 7h6M7.5 10l3 5m3 0 3-5"/>',
  };
  return `<span class="choice-icon" data-choice-icon="${name}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" focusable="false">${paths[name] ?? ''}</svg></span>`;
}

export function protocolChoiceCopy(option: Pick<DraftOption, 'protocolId' | 'tuning' | 'rank'>, current?: EquippedProtocol): ChoiceCopy {
  const rank = option.rank ?? 1;
  const copy: Record<ProtocolId, ChoiceCopy> = {
    PULSE_BREAK: { summary: '配合装置冲流，命中时追加破壳伤害。', action: '靠近装置，切到 1 / 2，左键攻击', caution: '只在装置冲流时触发' },
    PURIFY_CHAIN: { summary: rank > 1 ? '持续命中会折射，清除敌人还会连锁。' : '清除一个敌人，电弧继续攻击附近敌人。', action: '切到 1 / 2，左键攻击密集敌群', caution: '附近需要有其他敌人' },
    IMMUNE_BEACON: { summary: '召集三只免疫细胞，追击并吞噬敌人。', action: 'Q 对准敌人，召集小队围猎', caution: `每次召集消耗 ${getBeaconConfig(option.tuning, rank).tissueCost} 组织完整度` },
    EXPOSE_TRACE: { summary: '扫描让敌人显形、减速，更容易追击。', action: '按 Q 扫描敌群', caution: '辅助能力，不直接造成伤害' },
  };
  const result = { ...copy[option.protocolId] };
  if (current && rank > protocolRank(current)) {
    const before = protocolRank(current), tuning = option.tuning;
    if (option.protocolId === 'PULSE_BREAK') result.change = `追加伤害 ${arrow(getPulseConfig(tuning, before).bonusDamage, getPulseConfig(tuning, rank).bonusDamage)}`;
    if (option.protocolId === 'PURIFY_CHAIN') result.change = `连锁伤害 ${arrow(getChainConfig(tuning, before).damage, getChainConfig(tuning, rank).damage)}`;
    if (option.protocolId === 'IMMUNE_BEACON') result.change = `小队持续 ${arrow(getBeaconConfig(tuning, before).duration, getBeaconConfig(tuning, rank).duration, ' 秒')}`;
    if (option.protocolId === 'EXPOSE_TRACE') result.change = `减速持续 ${arrow(getTraceConfig(tuning, before).slowDuration, getTraceConfig(tuning, rank).slowDuration, ' 秒')}`;
  } else if (current) result.change = `${TUNING_NAMES[current.tuning]} → ${TUNING_NAMES[option.tuning]} · 阶数不变`;
  return result;
}

/** One benefit and one action per card; exact mechanics remain in its disclosure. */
export function endlessChoiceCopy(option: EndlessUpgradeOption, growth: EndlessGrowthState): ChoiceCopy {
  const before = endlessCombatStats(growth), after = endlessCombatStats({ ...growth, ranks: { ...growth.ranks, [option.id]: option.nextRank } });
  const copies: Record<EndlessUpgradeId, ChoiceCopy> = {
    power: { summary: '提升攻击伤害，更快清除敌人。', action: '所有攻击自动生效', change: `伤害倍率 ×${number(before.damageMultiplier)} → ×${number(after.damageMultiplier)}`, caution: '' },
    multishot: { summary: '一次发射更多射线，扫过前方敌群。', action: '切到 1，按住左键射击', change: `每次发射 ${arrow(before.shotRays, after.shotRays, ' 束')}`, caution: '' },
    pierce: { summary: '射线穿过敌人，继续命中后排。', action: '切到 1，左键攻击一列敌人', change: `额外贯穿 ${arrow(before.pierceCount, after.pierceCount, ' 个敌人')}`, caution: '射线仍会被组织障碍挡住' },
    nova: { summary: '牵引和爆破范围更大，聚群清场更轻松。', action: option.nextRank >= 3 ? '切到 2，轻点左键释放，按住可拖动' : '切到 2，左键聚拢敌人后爆破', change: `爆破半径 ${arrow(before.areaRadius, after.areaRadius)}`, caution: option.nextRank >= 3 ? '拖动落点时移动稍慢' : '爆破有短暂延迟' },
    dash: { summary: option.nextRank >= 6 ? '冲刺挥斩后，追加一次延迟回斩。' : option.nextRank >= 3 ? '冲刺抵达时，挥刀攻击周围一圈。' : '冲刺抵达时，挥刀攻击前方敌人。', action: '按 Space 冲刺挥斩', change: `斩击伤害 ${arrow(before.dashDamage, after.dashDamage)}`, caution: '无法斩中障碍后的敌人' },
    scan: { summary: '扫描时引爆身边敌人，缓解近身压力。', action: '按 Q 扫描并引爆', change: `爆发伤害 ${arrow(before.scanDamage, after.scanDamage)}`, caution: '' },
    vitality: { summary: '提高最大耐久，让你更能扛住攻击。', action: '立即提高耐久上限', change: `最大耐久 ${arrow(before.maxHp, after.maxHp)}`, caution: '' },
    haste: { summary: '提高精准净化射速，持续压制敌人。', action: '切到 1，按住左键射击', caution: '' },
    immune: { summary: '免疫细胞更强、停留更久，召集更快。', action: option.nextRank >= 3 ? '装备灯塔后，Q 点组织可驻防' : '按 Q 召集或指挥细胞', change: `额外停留 ${arrow(before.cellDurationBonus, after.cellDurationBonus, ' 秒')}`, caution: '细胞需要接近敌人才能吞噬' },
    catalysis: { summary: '用 2 铺设标记，再用 1 或细胞引爆。', action: '切到 2 左键铺标，再切 1 左键命中', caution: '取舍：替换 2 的普通爆破，直接伤害降低' },
  };
  return copies[option.id];
}
