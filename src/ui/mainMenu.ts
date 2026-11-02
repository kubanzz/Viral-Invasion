import type { EndlessProfileSnapshot } from '../meta/endlessProfile';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function mainMenuOverlay(record: EndlessProfileSnapshot, touchMode: boolean): string {
  const { data, status } = record;
  const showStorageNotice = status.mode === 'session' || status.code === 'corrupt' || status.code === 'incompatible';
  return `<div class="overlay challenge-home"><section class="challenge-home-card" aria-labelledby="challenge-home-title">
    <p class="challenge-home-eyebrow">MICROSCOPIC SURVIVAL</p>
    <h1 id="challenge-home-title">病毒入侵<span lang="en">Viral Invasion</span></h1>
    <p class="challenge-home-lead">守住生命，一波接一波。</p>
    <p class="challenge-home-description">清除病毒，选择进化，让心脏重获生机。</p>
    <button class="primary challenge-home-start" data-action="endless-start"><span>开始挑战</span><span aria-hidden="true">↗</span></button>
    <p class="challenge-home-rules">每波进化 · 5波完成首段救援 · 可继续无尽</p>
    ${data.runs ? `<p class="challenge-home-record" aria-label="个人最佳">最高 ${data.bestWave} 波<span>·</span>${data.bestScore} 分<span>·</span>${data.bestCombo} 连击</p>` : ''}
    ${showStorageNotice ? `<p class="challenge-home-storage" role="status">${escape(status.message)}</p>` : ''}
    <p class="challenge-home-controls">${touchMode ? '左侧移动 · 右侧瞄准与攻击' : 'WASD 移动 · 鼠标瞄准 · 左键攻击'}</p>
  </section></div>`;
}
