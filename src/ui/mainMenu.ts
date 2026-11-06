import type { EndlessProfileSnapshot, TerritoryProfileSnapshot } from '../meta/endlessProfile';
import { territoryLegacyMarkup } from './territoryHud';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function mainMenuOverlay(record: EndlessProfileSnapshot | TerritoryProfileSnapshot, touchMode: boolean, campUnlocked = false, prologue?: string): string {
  const { data, status } = record;
  const territory = data.mode === 'territory';
  const showStorageNotice = status.mode === 'session' || status.code === 'corrupt' || status.code === 'incompatible';
  const established = campUnlocked || prologue === 'ready';
  return `<div class="overlay challenge-home"><section class="challenge-home-card" aria-labelledby="challenge-home-title">
    <p class="challenge-home-eyebrow">MICROSCOPIC SURVIVAL</p>
    <h1 id="challenge-home-title">病毒入侵<span lang="en">Viral Invasion</span></h1>
    <p class="challenge-home-lead">在微观世界，带领小队守护一片生机。</p>
    <p class="challenge-home-description">${established ? '侦察队已带回异常情报。回到缓流膜湾，打造装备，再出发清除感染。' : '带领抗体小队抵达缓流膜湾，在宜居的膜间微域建立前哨。'}</p>
    <button class="primary challenge-home-start" data-action="endless-start"><span>${established ? '返回微观营地' : '带队抵达'}</span><span aria-hidden="true">↗</span></button>
    ${territory && established ? '<button class="challenge-home-camp" data-action="camp-open">仓库／锻造／血流接引</button>' : ''}
    <p class="challenge-home-rules">抵达建营 → 接收情报 → 清剿感染 → 带回战利品 → 锻造增强</p>
    ${data.runs ? `<p class="challenge-home-record" aria-label="个人最佳">${territory ? `救援成功 ${data.rescues} 次<span>·</span>` : ''}最高 ${data.bestWave} 波<span>·</span>${data.bestScore} 分</p>` : ''}
    ${'legacyAvailable' in record && record.legacyAvailable ? '<p class="challenge-home-legacy">旧版战绩保留；微域任务独立记录。</p>' : ''}
    ${territory ? territoryLegacyMarkup(record as TerritoryProfileSnapshot) : ''}
    ${showStorageNotice ? `<p class="challenge-home-storage" role="status">${escape(status.message)}</p>` : ''}
    <p class="challenge-home-controls">${touchMode ? '左侧移动 · 右侧瞄准与攻击' : 'WASD 移动 · 鼠标瞄准 · 左键攻击'}</p>
  </section></div>`;
}
