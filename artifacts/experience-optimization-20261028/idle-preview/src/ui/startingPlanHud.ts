import { availableStartingPlans, type StartingPlanId } from '../game/preparation';
import { describeProtocol, GROWTH_BALANCE, PROTOCOL_IDS, PROTOCOLS, protocolAction } from '../game/protocols';
import type { ProfileData } from '../meta/profile';

const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

function selectedPlan(data: ProfileData): StartingPlanId {
  return availableStartingPlans(data.unlockedProtocols).includes(data.startingPlan) ? data.startingPlan : 'field';
}

export function startingPlanEntryMarkup(data: ProfileData): string {
  const selected = selectedPlan(data);
  return `<button data-action="starting-plan" class="profile-menu-button starting-plan-entry"><span class="profile-menu-icon" aria-hidden="true">${selected === 'field' ? '◇' : PROTOCOLS[selected].symbol}</span><span><strong>初始方案 · ${selected === 'field' ? '现场应答' : escape(PROTOCOLS[selected].name)}</strong><small>${selected === 'field' ? '空装入场 · 首份成长自由选择' : '预装Ⅰ阶 · 提前使用首份经验成长'}</small></span><span class="profile-menu-arrow" aria-hidden="true">↗</span></button>`;
}

/** Optional preparation for a new case; retry preserves the case's original plan. */
export function startingPlanOverlay(data: ProfileData): string {
  const selected = selectedPlan(data), available = availableStartingPlans(data.unlockedProtocols);
  const choice = (id: StartingPlanId): string => {
    const known = available.includes(id), current = selected === id;
    return known ? `<button class="${current ? 'primary' : ''}" data-action="plan-select" data-plan="${id}" aria-pressed="${current}">${current ? '已选择' : '选择此方案'}${current ? ' ✓' : ' ↗'}</button>` : '<span class="starting-plan-locked">在一份已结束病例中携带后开放</span>';
  };
  const field = `<article class="starting-plan-card ${selected === 'field' ? 'selected' : ''}" data-starting-plan="field"><div class="starting-plan-kind">默认方案 · 随时可选</div><h3><span aria-hidden="true">◇</span> 现场应答</h3><p class="starting-plan-effect">空装入场，基础工具与 Q 免疫侦巡照常可用。</p><p class="starting-plan-cost">到 ${GROWTH_BALANCE.xpThresholds[0]} XP 时获得首份三选一草案，保留现场选择的自由。</p>${choice('field')}</article>`;
  const protocols = PROTOCOL_IDS.map(id => {
    const info = PROTOCOLS[id], description = describeProtocol(id, 'balanced', 1), known = available.includes(id);
    return `<article class="starting-plan-card ${known ? '' : 'locked'} ${selected === id ? 'selected' : ''}" data-starting-plan="${id}"><div class="starting-plan-kind">${known ? `预装Ⅰ阶 · 均衡 · 占 1/${GROWTH_BALANCE.slots} 槽` : '待开放的初始选项'}</div><h3><span aria-hidden="true">${info.symbol}</span> ${escape(info.name)}</h3><p class="starting-plan-action">${escape(protocolAction(id, 1))}</p><p class="starting-plan-effect">${escape(description.effect)}</p><p class="starting-plan-cost">${escape(description.cost)}</p>${choice(id)}</article>`;
  }).join('');
  return `<div class="overlay starting-plan-overlay"><section class="modal starting-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="starting-plan-title"><header class="starting-plan-header"><div><div class="eyebrow">NEXT CASE / 初始方案</div><h2 id="starting-plan-title">带着一种打法，再次出发。</h2><p>已结束病例中携带过的协议，成为下一病例的可选开局。</p></div><button class="profile-close" data-action="close-starting-plan" aria-label="关闭初始方案">×</button></header><div class="starting-plan-scroll" tabindex="0" role="region" aria-label="初始方案与实际代价"><p class="starting-plan-tradeoff"><strong>预装是提前使用成长：</strong>立即装备一个Ⅰ阶均衡协议；到 ${GROWTH_BALANCE.xpThresholds[0]} XP 时只结清预支，不生成草案，${GROWTH_BALANCE.xpThresholds[1]} XP 起正常选择。局内经验、协议等级和临时状态每局重置。</p><div class="starting-plan-grid">${field}${protocols}</div></div><footer class="starting-plan-footer"><p>选择用于“进入心脏防线”和“新病例”。<br>同种子重试保留该病例的原始方案。</p><button class="primary" data-action="close-starting-plan">保存选择并返回</button></footer></section></div>`;
}
