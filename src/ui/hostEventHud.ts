import type { GameState } from '../game/types';
import { HOST_EVENT_BALANCE as B, hostEventPresentation } from '../game/hostEvents';

const categoryNames = { green: '绿色 · 有利', red: '红色 · 危险', yellow: '黄色 · 权衡' } as const;
const percent = (factor: number) => Math.round(Math.abs(factor - 1) * 100);

/** Compact copy keeps every numeric effect while removing repeated tactical advice. */
export function compactHostEventDescription(state: GameState): string {
  const active = state.hostEvents?.active;
  if (!active) return '';
  switch (active.id) {
    case 'MEDICATION': return `${B.medication.appearances.join('/')}秒：${B.medication.radiusR}R净化圈持续${B.medication.zoneDuration}秒，每秒${B.medication.damageD}D伤害；提前${B.medication.previewSeconds}秒示警。`;
    case 'REST': return `每秒回复${B.rest.healRatioPerSecond * 100}%最大耐久，累计至多${B.rest.maximumHealRatio * 100}%，满血不储存；主动组织修复+${percent(B.rest.activeRepairMultiplier)}%。`;
    case 'SLEEPLESS': return [active.affectsLegions ? `军团攻击频率−${percent(B.sleepless.immuneAttackFrequency)}%` : '', active.affectsHealingPoints ? `仅符合占领条件时，治疗点感染进度+${percent(B.sleepless.captureProgress)}%` : ''].filter(Boolean).join('；') + '。';
    case 'SMOKE': return `${B.smoke.targetCount}源，各${B.smoke.hpD}D生命/${B.smoke.radiusR}R圈；玩家及军团移速−${percent(B.smoke.moveMultiplier)}%、军团攻击频率−${percent(B.smoke.immuneAttackFrequency)}%。病毒不受影响；清源消圈，全清结束。`;
    case 'ALCOHOL': return `${B.alcohol.targetCount}沉积，各${B.alcohol.hpD}D生命/${B.alcohol.radiusR}R圈；组织最终修复−${percent(B.alcohol.repairMultiplier)}%。清除消圈，全清结束。`;
    case 'EXERCISE': return `主动冲流冷却−${percent(B.exercise.pulseCooldown)}%、推动+${percent(B.exercise.pulseStrength)}%；轻型病毒移速+${percent(B.exercise.lightVirusMove)}%（含新生）。`;
  }
}

export const hostEventHudMarkup = `<aside id="host-event-card" class="host-event-card" aria-label="宿主活动事件" aria-live="polite" hidden><div class="host-event-kicker"><span id="host-event-category"></span><span id="host-event-phase"></span></div><div class="host-event-heading"><strong id="host-event-title"></strong><b id="host-event-time"></b></div><p id="host-event-description"></p><div class="host-event-footer"><span id="host-event-objectives"></span><span id="host-event-status">宿主活动</span></div><div class="host-event-meter"><i id="host-event-progress"></i></div></aside>`;

/** This card follows simulation time; neither reveal nor countdown advances while paused. */
export function updateHostEventHud(state: GameState, debugReport = ''): void {
  const card = document.getElementById('host-event-card');
  if (!card) return;
  const view = hostEventPresentation(state), active = state.hostEvents?.active;
  const visible = !!view || !!debugReport && ['playing', 'paused'].includes(state.phase);
  card.hidden = !visible;
  const app = document.getElementById('app');
  if (app) app.dataset.hostEventVisible = String(visible);
  if (!visible) return;
  const get = (id: string) => document.getElementById(id)!;
  if (view && active) {
    card.dataset.category = view.category;
    card.dataset.phase = view.phase;
    card.dataset.event = active.id;
    get('host-event-category').textContent = categoryNames[view.category];
    get('host-event-phase').textContent = view.phase === 'warning' ? view.category === 'green' ? '即将生效' : '预警' : '生效中';
    get('host-event-title').textContent = `${view.icon} ${view.name}`;
    get('host-event-time').textContent = `${Math.max(0, view.remaining).toFixed(1)}s`;
    const compact = (card.ownerDocument.defaultView?.innerWidth ?? 1366) <= 650;
    get('host-event-description').textContent = compact ? compactHostEventDescription(state) : view.description;
    const skipped = active.id === 'MEDICATION' ? view.skippedCount : 0;
    card.dataset.skipped = String(skipped > 0);
    get('host-event-objectives').textContent = active.id === 'MEDICATION'
      ? `药区待结束 ${view.targetCount}/${view.targetTotal}${skipped ? ` · 跳过 ${skipped}` : ''}`
      : view.targetTotal > 0 ? `待清除 ${view.targetCount}/${view.targetTotal}` : '当前器官';
    get('host-event-status').textContent = skipped
      ? view.skipReason === 'blood-flow-anchor-lost' ? '血流路径失效' : view.skipReason ?? '药区跳过'
      : '宿主活动';
    const span = view.phase === 'warning' ? active.startsAt - active.warningStartedAt : active.endsAt - active.startsAt;
    get('host-event-progress').style.width = `${Math.min(100, Math.max(0, view.remaining / Math.max(.01, span) * 100))}%`;
    const age = Math.max(0, state.elapsed - active.warningStartedAt);
    card.style.setProperty('--host-card-turn', `${Math.max(0, 1 - age / .35) * 65}deg`);
    card.dataset.revealScale = String(1 + .12 * (1 - Math.min(1, Math.max(0, (age - 1.2) / .8))));
    card.style.setProperty('--host-card-scale', card.dataset.revealScale);
    card.dataset.opening = String(age < 2);
  } else {
    card.dataset.category = 'disabled'; card.dataset.phase = 'disabled'; delete card.dataset.event;
    get('host-event-category').textContent = '调试 · 未启用'; get('host-event-phase').textContent = '';
    get('host-event-title').textContent = '⊘ 宿主事件不可用'; get('host-event-time').textContent = '';
    get('host-event-description').textContent = debugReport;
    get('host-event-objectives').textContent = '依赖检查'; get('host-event-progress').style.width = '0%';
    get('host-event-status').textContent = '宿主活动'; card.dataset.skipped = 'false';
    card.style.setProperty('--host-card-turn', '0deg'); card.style.setProperty('--host-card-scale', '1');
    card.dataset.revealScale = '1';
  }
  positionHostEventCard(card, !!state.endless);
}

/** Reuse the side gutters between existing panels, keeping the centre and dock clear. */
function positionHostEventCard(card: HTMLElement, endless: boolean): void {
  const viewport = card.ownerDocument.defaultView;
  if (!viewport) return;
  const compact = viewport.innerWidth <= 650;
  card.dataset.compact = String(compact);
  const width = Math.min(compact ? 154 : 204, viewport.innerWidth * .43);
  card.style.width = `${width}px`;
  const box = (selector: string) => {
    const node = card.ownerDocument.querySelector<HTMLElement>(selector);
    if (!node || node.hidden || viewport.getComputedStyle(node).display === 'none') return null;
    return node.getBoundingClientRect();
  };
  const inset = compact ? 8 : 16;
  const leftTop = box(endless ? '.endless-wave-panel' : '.battle-objective');
  const leftBottom = box('.growth-panel');
  const rightTop = box(endless ? '.endless-build-panel' : '.battle-telemetry');
  const rightBottom = box(endless ? '.endless-navigation' : '.organ-overview');
  const left = { x: inset, top: (leftTop?.bottom ?? 70) + 7, end: (leftBottom?.top ?? viewport.innerHeight - 95) - 7 };
  const right = { x: viewport.innerWidth - width - inset, top: (rightTop?.bottom ?? 70) + 7, end: (rightBottom?.top ?? viewport.innerHeight - 95) - 7 };
  const selected = left.end - left.top >= right.end - right.top ? left : right;
  card.style.left = `${selected.x}px`;
  card.style.top = `${Math.max(52, selected.top)}px`;
  // Never clip effect text or objective counts. Narrow HUD rules below reclaim
  // only explanatory space from the neighbouring build panel.
  card.style.maxHeight = '';
  card.dataset.tight = String(selected.end - selected.top < 155);
  const available = Math.max(0, selected.end - selected.top), height = card.offsetHeight;
  const scale = Math.min(Number(card.dataset.revealScale ?? 1), height > 0 ? Math.max(.85, available / height) : 1);
  card.style.setProperty('--host-card-scale', String(scale));
  card.style.transformOrigin = selected === right ? 'right top' : 'left top';
}
