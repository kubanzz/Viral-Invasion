import type { EndlessProfileSnapshot, TerritoryProfileSnapshot } from '../meta/endlessProfile';
import { territoryLegacyMarkup } from './territoryHud';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function mainMenuOverlay(record: EndlessProfileSnapshot | TerritoryProfileSnapshot, touchMode: boolean): string {
  const { data, status } = record;
  const territory = data.mode === 'territory';
  const showStorageNotice = status.mode === 'session' || status.code === 'corrupt' || status.code === 'incompatible';
  return `<div class="overlay challenge-home"><section class="challenge-home-card" aria-labelledby="challenge-home-title">
    <p class="challenge-home-eyebrow">MICROSCOPIC SURVIVAL</p>
    <h1 id="challenge-home-title">病毒入侵<span lang="en">Viral Invasion</span></h1>
    <p class="challenge-home-lead">${territory ? '夺回领地，让生命重新生长。' : '守住生命，一波接一波。'}</p>
    <p class="challenge-home-description">${territory ? '净化前线并守住反扑，强化军团完成双线接防；驻军解开源膜后，拆除感染源。' : '清除病毒，选择进化，让心脏重获生机。'}</p>
    <button class="primary challenge-home-start" data-action="endless-start"><span>开始挑战</span><span aria-hidden="true">↗</span></button>
    <p class="challenge-home-rules">${territory ? '守点成长 → 军团接防 → 双源与母巢 · 获救后可继续守卫' : '每波进化 · 5波完成首段救援 · 可继续无尽'}</p>
    ${data.runs ? `<p class="challenge-home-record" aria-label="个人最佳">${territory ? `救援成功 ${data.rescues} 次<span>·</span>` : ''}最高 ${data.bestWave} 波<span>·</span>${data.bestScore} 分</p>` : ''}
    ${'legacyAvailable' in record && record.legacyAvailable ? '<p class="challenge-home-legacy">旧版战绩保留；双线救援单独计分。</p>' : ''}
    ${territory ? territoryLegacyMarkup(record as TerritoryProfileSnapshot) : ''}
    ${showStorageNotice ? `<p class="challenge-home-storage" role="status">${escape(status.message)}</p>` : ''}
    <p class="challenge-home-controls">${touchMode ? '左侧移动 · 右侧瞄准与攻击' : 'WASD 移动 · 鼠标瞄准 · 左键攻击'}</p>
  </section></div>`;
}
