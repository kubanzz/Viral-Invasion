import type { GameState } from '../game/types';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

/** Separate from the recent log: important explanations survive ordinary-event eviction. */
export function tacticalHistoryMarkup(state: GameState): string {
  const records = [...(state.tacticalRecords ?? [])].sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
  if (!records.length) return '';
  return `<section class="tactical-records" aria-label="关键决策记录"><h3>关键决策记录</h3><p>关键原因按类别保留，不被近期操作刷掉。重复发生时显示最近一次与累计次数。</p><ol class="event-history">${records.map(record => `<li data-tactical-key="${escape(record.key)}"><time>${time(record.at)}</time><span>${escape(record.text)}${record.count > 1 ? `<small>本局发生 ${record.count} 次 · 首次 ${time(record.firstAt)}</small>` : ''}</span></li>`).join('')}</ol></section>`;
}
