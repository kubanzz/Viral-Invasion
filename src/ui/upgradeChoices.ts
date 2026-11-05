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
    IMMUNE_BEACON: { summary: `部署 ${rank + 2} 体常驻军团，追击并吞噬敌人。`, action: 'Q 部署或指挥 · R 消耗抗体裂变', caution: `最多两支军团；部署消耗 ${getBeaconConfig(option.tuning, rank).tissueCost} 组织完整度` },
    EXPOSE_TRACE: { summary: '扫描让敌人显形、减速，更容易追击。', action: '按 Q 扫描敌群', caution: '辅助能力，不直接造成伤害' },
  };
  const result = { ...copy[option.protocolId] };
  if (current && rank > protocolRank(current)) {
    const before = protocolRank(current), tuning = option.tuning;
    if (option.protocolId === 'PULSE_BREAK') result.change = `追加伤害 ${arrow(getPulseConfig(tuning, before).bonusDamage, getPulseConfig(tuning, rank).bonusDamage)}`;
    if (option.protocolId === 'PURIFY_CHAIN') result.change = `连锁伤害 ${arrow(getChainConfig(tuning, before).damage, getChainConfig(tuning, rank).damage)}`;
    if (option.protocolId === 'IMMUNE_BEACON') result.change = `军团成员 ${before + 2} → ${rank + 2} 体 · 攻击增强`;
    if (option.protocolId === 'EXPOSE_TRACE') result.change = `减速持续 ${arrow(getTraceConfig(tuning, before).slowDuration, getTraceConfig(tuning, rank).slowDuration, ' 秒')}`;
  } else if (current) result.change = `${TUNING_NAMES[current.tuning]} → ${TUNING_NAMES[option.tuning]} · 阶数不变`;
  return result;
}

/** One benefit and one action per card; exact mechanics remain in its disclosure. */
export function endlessChoiceCopy(option: EndlessUpgradeOption, growth: EndlessGrowthState, weaponSkills = false): ChoiceCopy {
  const before = endlessCombatStats(growth), after = endlessCombatStats({ ...growth, ranks: { ...growth.ranks, [option.id]: option.nextRank } });
  const copies: Record<EndlessUpgradeId, ChoiceCopy> = {
    power: { summary: '提升攻击伤害，更快清除敌人。', action: '所有攻击自动生效', change: `伤害倍率 ×${number(before.damageMultiplier)} → ×${number(after.damageMultiplier)}`, caution: '' },
    multishot: { summary: '一次发射更多净化弹丸，扫过前方敌群。', action: '切到 1，按住左键射击', change: `每次发射 ${arrow(before.shotRays, after.shotRays, ' 弹')}`, caution: '' },
    pierce: { summary: '弹丸穿过敌人，继续命中后排。', action: '切到 1，左键攻击一列敌人', change: `额外贯穿 ${arrow(before.pierceCount, after.pierceCount, ' 个敌人')}`, caution: '弹丸仍会被组织障碍挡住' },
    nova: { summary: '能量炮爆炸范围与伤害提高，清除密集敌群。', action: '切到 2，瞄准后按住左键连发', change: `爆炸半径 ${arrow(before.areaRadius, after.areaRadius)}`, caution: '首个病毒、弹囊或障碍会提前引爆炮弹' },
    dash: { summary: option.nextRank >= 6 ? '冲刺挥斩追加回斩，蓄能剑气也更强。' : option.nextRank >= 3 ? '冲刺挥斩变为回旋，蓄能剑气也更强。' : '冲刺解锁近身挥斩，蓄能剑气也更强。', action: '点 Space 冲刺；长按后松开发射剑气', change: `近身斩击 ${arrow(before.dashDamage, after.dashDamage)} · 剑气每阶 +15`, caution: '蓄能斩独立冷却6秒，遇墙消散' },
    scan: { summary: '扫描时引爆身边敌人，缓解近身压力。', action: '按 Q 扫描并引爆', change: `爆发伤害 ${arrow(before.scanDamage, after.scanDamage)}`, caution: '' },
    vitality: { summary: '提高最大耐久，让你更能扛住攻击。', action: '立即提高耐久上限', change: `最大耐久 ${arrow(before.maxHp, after.maxHp)}`, caution: '' },
    haste: { summary: '提高精准净化射速，持续压制敌人。', action: '切到 1，按住左键射击', caution: '' },
    immune: { summary: '增加军团成员并强化攻击，召集更快。', action: option.nextRank >= 3 ? '装备灯塔后，Q 点组织驻防 · R 注射抗体' : '按 Q 部署或指挥军团', change: `军团成员 ${Math.min(5, 3 + (growth.ranks.immune ?? 0))} → ${Math.min(5, 3 + option.nextRank)} 体；攻击 ×${number(after.cellDamageMultiplier)}`, caution: '常驻但会被击杀，最多两支军团' },
    catalysis: { summary: '主爆炸保持完整伤害，随后追加一次净化余震。', action: '用 2 发射能量炮，0.35秒后自动余震', change: '余震：75%半径 · 40%伤害', caution: '余震不递归产生余震或协议攻击' },
  };
  const result = { ...copies[option.id] };
  if (weaponSkills) {
    if (option.id === 'multishot' || option.id === 'pierce' || option.id === 'haste') {
      result.action = '按住左键或射击盘持续普攻'; result.caution = '仅增强普攻，不增加武器技能弹数或施放速度';
    }
    if (option.id === 'nova') { result.summary = '增强当前武器2技能的爆破范围与伤害。'; result.action = '按2直接释放，手机点按或拖动技能2'; result.change = `每阶范围＋14 · 伤害倍率＋15%`; }
    if (option.id === 'catalysis') { result.action = '武器2技能爆破后自动追加余震'; result.caution = '余震不重复位移，不递归触发'; }
    if (option.id === 'dash') { result.summary = '增强实际冲刺落点的近身斩击。'; result.action = '点按Space或冲刺按钮'; result.change = `近身斩击 ${arrow(before.dashDamage, after.dashDamage)}`; result.caution = 'Space仅冲刺，武器招式由123释放'; }
    if (option.id === 'immune') result.action = 'Q在脚下驻军 · 战术菜单使用抗体';
  }
  return result;
}
