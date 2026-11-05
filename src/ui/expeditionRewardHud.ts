import { RARITY_NAMES, WEAPONS } from '../game/expedition';
import type { GameState } from '../game/types';

/** The saved victory and its visible reward share the same stable loot receipt. */
export function expeditionRewardMarkup(state: GameState): string {
  const loot = state.expedition?.pendingLoot;
  if (!loot) return '';
  const weapon = WEAPONS[loot.weaponId];
  return `<section class="expedition-rewards" aria-label="本次远征战利品" data-rarity="${loot.rarity}">
    <header><span class="camp-quality camp-quality-${loot.rarity}">${RARITY_NAMES[loot.rarity]}战利品</span><strong>${state.expedition?.firstClear ? '噬心母巢首胜奖励' : '本次心脏远征奖励'}</strong></header>
    <div class="expedition-reward-items"><article class="expedition-reward-weapon"><span class="camp-weapon-icon" data-camp-art="weapon-${loot.weaponId}-broken" aria-hidden="true"></span><div><h3>破损${weapon.name}</h3><p>${weapon.description}</p><small>回营修复后可装备 · 强化随枪型保留</small></div></article>
    <article><span class="camp-facility-icon" data-camp-art="blueprint-rapid-launch-pod" aria-hidden="true"></span><div><h3>速装弹射荚蓝图</h3><p>16秒装填 · 短程高频回防</p><small>已有蓝图自动转为5生质</small></div></article>
    <article><strong class="expedition-reward-material">+${loot.materials}</strong><div><h3>修复生质</h3><p>修复、锻造与准备补给</p><small>重复或低品质武器另按收藏规则折算</small></div></article></div>
  </section>`;
}
