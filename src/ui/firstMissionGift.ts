import { FIRST_MISSION_GIFT_COINS, TARGETED_DRAW_GIFT_COINS } from '../meta/campProfile';

export function firstMissionGiftOverlay(notice = '', kind: 'first' | 'targeted' = 'first'): string {
  const targeted = kind === 'targeted', coins = targeted ? TARGETED_DRAW_GIFT_COINS : FIRST_MISSION_GIFT_COINS;
  const safeNotice = notice.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  return `<div class="overlay first-mission-gift-overlay"><section class="modal first-mission-gift" role="dialog" aria-modal="true" aria-labelledby="first-mission-gift-title" aria-describedby="first-mission-gift-description">
    <p class="eyebrow">${targeted ? '定向接引补给' : '营地体验补给'} · 一次性奖励</p><div class="first-mission-gift-seal" aria-hidden="true">✦</div>
    <h2 id="first-mission-gift-title">${targeted ? '心仪的金色，这次有约定' : '新的冒险，准备就绪'}</h2>
    <p id="first-mission-gift-description">${targeted ? '定向接引已开放：选中目标后，100抽内必得。再送你50,000金币，去接引心仪的装备。' : '送你一份营地体验补给，去接引心仪的装备和军团，尝试更多战斗搭配。'}</p>
    <div class="first-mission-gift-coins" aria-label="奖励50,000金币"><strong>${coins.toLocaleString('en-US')}</strong><span>金币</span></div>
    <p class="first-mission-gift-note">${targeted ? '独立于首关奖励 · 已有存档补领 · 每份存档限领一次' : '首关通关解锁 · 老玩家同享补领 · 每份存档限领一次'}</p>
    ${notice ? `<p role="status">${safeNotice}</p>` : ''}
    <div class="actions"><button class="primary" data-action="${targeted ? 'claim-targeted-draw-gift' : 'claim-first-mission-gift'}">领取50,000金币</button></div>
  </section></div>`;
}
