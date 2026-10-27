import { TRAITS } from '../game/battleConfig';
import type { TraitId } from '../game/battleTypes';
import { PROTOCOL_IDS, PROTOCOLS, TUNING_NAMES, RANK_NAMES, protocolRank } from '../game/protocols';
import type { GameState } from '../game/types';
import { formatRunMetrics } from '../game/runMetrics';
import { ACHIEVEMENTS, buildRunSummary, type AchievementId, type ProfileData, type ProfileStatus, type RunRecord, type RunSummary } from '../meta/profile';
import { startingPlanEntryMarkup } from './startingPlanHud';

const TRAIT_IDS: TraitId[] = ['CARAPACE', 'FISSION', 'MIMIC'];
const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const time = (seconds: number): string => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
};
const seed = (value: number): string => String(value >>> 0);
const migration = (choice: RunSummary['migrationChoice']): string => choice === 'pursue' ? '出口追击' : choice === 'block' ? '隔离闸封锁' : choice === 'ignore' ? '放任迁移' : '迁移前结束';

function storageCopy(status: ProfileStatus): { title: string; detail: string; warning: boolean } {
  if (status.mode === 'session') return { title: '记录暂存于本次游玩', detail: '浏览器暂时无法保存。关闭或刷新此页面后，本次新增的发现与战绩可能丢失。', warning: true };
  if (status.code === 'corrupt') return { title: '已开始一份新档案', detail: '原有档案损坏，已安全重新记录。本局仍可正常游玩。', warning: true };
  if (status.code === 'incompatible') return { title: '已开始一份新档案', detail: '这份旧档案暂时无法读取，已为你重新记录发现与战绩。', warning: true };
  return { title: '档案保存在此浏览器', detail: '发现、成就和战绩仅保存在本机；清理浏览器数据可能丢失记录。', warning: false };
}
function storageMarkup(status: ProfileStatus, compact = false): string {
  const copy = storageCopy(status);
  return `<div class="profile-storage ${copy.warning ? 'profile-storage-warning' : ''} ${compact ? 'profile-storage-compact' : ''}" role="status"><span class="profile-storage-mark" aria-hidden="true">${copy.warning ? '△' : '◈'}</span><span><strong>${escape(copy.title)}</strong><small>${escape(copy.detail)}</small></span></div>`;
}
function traitCards(data: ProfileData): string {
  return TRAIT_IDS.map((id, index) => {
    const trait = TRAITS[id], discovered = data.discoveredTraits.includes(id), weakness = data.discoveredWeaknesses.includes(id);
    if (!discovered) return `<article class="profile-trait profile-undiscovered"><div class="profile-card-top"><span class="profile-card-symbol" aria-hidden="true">?</span><span class="profile-card-state">等待发现</span></div><h4>未知变异 ${String(index + 1).padStart(2, '0')}</h4><p>深入病例，观察病毒的新变化。<br>遇见后会在这里留下它的形态记录。</p><div class="profile-counter"><span>弱点记录</span><p>未知 · 等待诊断与实战验证</p></div></article>`;
    return `<article class="profile-trait"><div class="profile-card-top"><span class="profile-card-symbol" aria-hidden="true">${escape(trait.symbol)}</span><span class="profile-card-state">已发现</span></div><h4>${escape(trait.name)}</h4><p>${escape(trait.ability)}</p><p class="profile-trait-cost">进化代价 · ${escape(trait.cost)}</p><div class="profile-counter ${weakness ? 'profile-counter-known' : ''}"><span>${weakness ? '已记录的反制' : '弱点待验证'}</span><p>${weakness ? escape(trait.counter) : '未知 · 扫描这一变异，或清除对应精英后记录。'}</p></div></article>`;
  }).join('');
}
function protocolCards(data: ProfileData): string {
  return PROTOCOL_IDS.map(id => {
    const protocol = PROTOCOLS[id], recorded = data.unlockedProtocols.includes(id);
    return `<article class="profile-protocol ${recorded ? 'profile-protocol-recorded' : ''}"><span class="profile-protocol-symbol" aria-hidden="true">${escape(protocol.symbol)}</span><div><div class="profile-protocol-heading"><h4>${escape(protocol.name)}</h4><span>${recorded ? '已携带记录' : '尚未携带'}</span></div><p>${escape(protocol.trigger)}</p></div></article>`;
  }).join('');
}
function achievementCards(data: ProfileData): string {
  return (Object.keys(ACHIEVEMENTS) as AchievementId[]).map(id => {
    const info = ACHIEVEMENTS[id], earned = data.achievements.includes(id);
    return `<article class="profile-achievement ${earned ? 'profile-achievement-earned' : ''}"><span aria-hidden="true">${earned ? '✓' : '◇'}</span><div><h4>${escape(info.name)}</h4><p>${escape(info.description)}</p><small>${earned ? '已达成' : '尚未达成'}</small></div></article>`;
  }).join('');
}
function replayButton(value: number, label = '重试此病例', runId?: string): string {
  return `<button class="profile-replay" data-action="replay-record" data-seed="${seed(value)}"${runId ? ` data-run-id="${escape(runId)}"` : ''} aria-label="${escape(label)}，种子 ${seed(value)}">${escape(label)} <span aria-hidden="true">↗</span></button>`;
}
function bestMarkup(data: ProfileData): string {
  const fastest = data.best.fastestVictory;
  return `<div class="profile-best-grid"><article class="profile-best profile-best-victory"><span>最快成功复测</span><strong>${fastest ? time(fastest.durationSeconds) : '—'}</strong>${fastest ? `<small>SEED ${seed(fastest.seed)}</small>${replayButton(fastest.seed, '再访最佳病例', fastest.runId)}` : '<small>等待第一次复测通过</small>'}</article><article class="profile-best"><span>单局净化感染体</span><strong>${data.best.mostKills}</strong><small>次净化</small></article><article class="profile-best"><span>单局净化感染源</span><strong>${data.best.mostSources}</strong><small>处源头</small></article><article class="profile-best"><span>最长作战记录</span><strong>${data.stats.runs ? time(data.best.longestRunSeconds) : '—'}</strong><small>已结束病例的行动时长</small></article></div>`;
}
function pathMarkup(summary: RunSummary): string {
  const antibody = summary.timeline.filter(entry => entry.side === 'antibody');
  const virus = summary.traits.map(id => `<span class="profile-path-chip">${escape(TRAITS[id].symbol)} ${escape(TRAITS[id].name)}</span>`).join('<span class="profile-path-arrow" aria-hidden="true">→</span>');
  const protocols = summary.protocols.map(id => `<span class="profile-path-chip">${escape(PROTOCOLS[id].symbol)} ${escape(PROTOCOLS[id].name)}</span>`).join('');
  return `<div class="profile-paths"><article><h4><span aria-hidden="true">◇</span> 病毒进化</h4><div class="profile-path-chips">${virus || '<span class="profile-path-empty">本局尚未出现变异</span>'}</div><p class="profile-path-note">${escape(migration(summary.migrationChoice))}${summary.coreCleared ? ' · 母巢已净化' : ''}</p></article><article><h4><span aria-hidden="true">✚</span> 抗体应答</h4>${antibody.length ? `<ol class="profile-antibody-route">${antibody.map(entry => `<li><time>${time(entry.at)}</time><span>${escape(entry.text)}</span></li>`).join('')}</ol>` : `<div class="profile-path-chips">${protocols || '<span class="profile-path-empty">本局尚未选择抗体</span>'}</div>`}</article></div>`;
}
function reviewSummaryMarkup(summary: RunSummary): string {
  const review = formatRunMetrics(summary.review);
  return `<div class="profile-review-dimensions" aria-label="本局两维事实说明"><article><h4>治疗质量</h4><p>${escape(review.care)}</p></article><article><h4>系统掌控</h4><p>${escape(review.control)}</p></article></div>${review.notice ? `<p class="profile-review-summary-notice">${escape(review.notice)}</p>` : ''}`;
}
function reviewDetailsMarkup(summary: RunSummary): string {
  const review = formatRunMetrics(summary.review);
  return `<section class="profile-review-basis" aria-label="结算事实依据"><h4>本局记录的依据</h4>${review.details.length ? `<ul>${review.details.map(detail => `<li>${escape(detail)}</li>`).join('')}</ul>` : ''}<p>${escape(review.chainDefinition)}</p>${review.notice ? `<p class="profile-review-notice">${escape(review.notice)}</p>` : ''}</section>`;
}
function recentRecord(record: RunRecord, index: number): string {
  const rules = record.encounter ? `${record.encounter.configId} · ${record.encounter.guideVariant === 'guided' ? '首次反制引导' : '自主应对'}` : '旧版病例 · 按当前规则再访';
  return `<li class="profile-run"><div class="profile-run-heading"><div><span class="profile-run-number">${String(index + 1).padStart(2, '0')}</span><strong class="${record.success ? 'profile-run-won' : 'profile-run-ended'}">${record.success ? '复测通过' : '行动结束'}</strong><span class="profile-run-seed">SEED ${seed(record.seed)}</span></div><time>${time(record.durationSeconds)}</time></div><div class="profile-run-facts"><span>净化 ${record.stats.kills}</span><span>清源 ${record.stats.sourceClears}</span><span>${escape(migration(record.migrationChoice))}</span></div><p class="profile-run-reason">${escape(record.reason)}</p><div class="profile-run-bottom"><details class="profile-run-detail"><summary>展开本局复盘</summary><div class="profile-run-review">${reviewSummaryMarkup(record)}${reviewDetailsMarkup(record)}${pathMarkup(record)}<p class="profile-path-note">${escape(rules)}</p><p class="profile-review-advice">${escape(record.suggestion)}</p><p class="profile-review-evidence">本局依据 · ${escape(record.suggestionEvidence)}</p></div></details>${replayButton(record.seed, '重试此病例', record.runId)}</div></li>`;
}

/** Complete overlay; central content scrolls while both close controls remain reachable. */
export function profileOverlay(data: ProfileData, status: ProfileStatus): string {
  return `<div class="overlay profile-overlay"><section class="modal profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title"><header class="profile-dialog-header"><div><div class="eyebrow">FIELD ARCHIVE / 局外档案</div><h2 id="profile-title">每次救援，都留下新的可能。</h2><p>把遇见的变化、试过的战术，留给下一次出发。</p></div><button class="profile-close" data-action="close-profile" aria-label="关闭局外档案">×</button></header><div class="profile-scroll" tabindex="0" aria-label="档案内容，可滚动"><div class="profile-totals"><div><strong>${data.stats.runs}</strong><span>已记录病例</span></div><div><strong>${data.stats.wins}</strong><span>成功复测</span></div><div><strong>${data.discoveredTraits.length}<small> / 3</small></strong><span>变异发现</span></div><div><strong>${data.unlockedProtocols.length}<small> / 4</small></strong><span>协议尝试</span></div></div>${storageMarkup(status)}<section class="profile-section" aria-labelledby="profile-traits-title"><div class="profile-section-heading"><h3 id="profile-traits-title">变异观察簿</h3><span>${data.discoveredWeaknesses.length} / 3 弱点已记录</span></div><p class="profile-section-intro">遇见变异，留下形态；扫描诊断或清除对应精英，补全反制记录。</p><div class="profile-trait-grid">${traitCards(data)}</div></section><section class="profile-section" aria-labelledby="profile-protocol-title"><div class="profile-section-heading"><h3 id="profile-protocol-title">抗体实验簿</h3><span>4 种局内协议</span></div><p class="profile-section-intro">四种协议都可在局内研究中出现。携带过的方案，会在这里留下记录。</p><div class="profile-protocol-grid">${protocolCards(data)}</div></section><section class="profile-section" aria-labelledby="profile-achievements-title"><div class="profile-section-heading"><h3 id="profile-achievements-title">救援里程碑</h3><span>${data.achievements.length} / 7 已达成</span></div><div class="profile-achievement-grid">${achievementCards(data)}</div></section><section class="profile-section" aria-labelledby="profile-best-title"><div class="profile-section-heading"><h3 id="profile-best-title">值得记住的病例</h3><span>个人最佳</span></div>${bestMarkup(data)}</section><section class="profile-section" aria-labelledby="profile-recent-title"><div class="profile-section-heading"><h3 id="profile-recent-title">最近的救援</h3><span>最多保留 10 份简要记录</span></div>${data.recentRuns.length ? `<ol class="profile-recent-runs">${data.recentRuns.slice(0, 10).map(recentRecord).join('')}</ol>` : '<div class="profile-empty-state"><span aria-hidden="true">✧</span><h4>第一份病例，等你写下。</h4><p>完成或结束一次行动后，种子、进化路线和战术建议会保存在这里。</p></div>'}</section></div><footer class="profile-dialog-footer"><p>每局重新开始，发现与战术留在档案里。</p><button class="primary" data-action="close-profile">返回</button></footer></section></div>`;
}

/** Append inside the intro card; `profile` is handled by the host alongside close-profile. */
export function profileMenuMarkup(data: ProfileData, status: ProfileStatus): string {
  return `<div class="profile-menu"><div class="profile-menu-entries">${startingPlanEntryMarkup(data)}<button data-action="profile" class="profile-menu-button"><span class="profile-menu-icon" aria-hidden="true">◈</span><span><strong>局外档案</strong><small>${data.stats.runs ? `${data.stats.runs} 份病例 · ${data.discoveredTraits.length} 种变异` : '记录发现 · 再访病例'}</small></span><span class="profile-menu-arrow" aria-hidden="true">↗</span></button></div><div class="switches profile-menu-settings"><button data-action="sound">声音 ${data.settings.sound?'开':'关'}</button><button data-action="effects">特效：${data.settings.lowEffects?'低':'标准'}</button></div>${storageMarkup(status, true)}</div>`;
}

/** Append to a result modal. All history, reasons and advice are escaped before rendering. */
export function profileResultMarkup(state: GameState, data: ProfileData, status: ProfileStatus): string {
  const summary = buildRunSummary(state);
  const finalEquipment = state.growth?.equipped.map(slot => `${PROTOCOLS[slot.id].name} ${RANK_NAMES[protocolRank(slot)]} · ${TUNING_NAMES[slot.tuning]}`).join(' / ');
  return `<div class="profile-result-facts">${reviewSummaryMarkup(summary)}</div><div class="profile-prepare-next"><span>下一病例 · ${data.startingPlan === 'field' ? '现场应答' : escape(PROTOCOLS[data.startingPlan].name)}</span><button data-action="starting-plan">准备下一病例 ↗</button></div><details class="profile-result profile-recap" aria-label="本局进化与下次战术"><summary>展开病例复盘：抗体路线与下次战术</summary><section class="profile-recap-content"><div class="profile-section-heading"><h3>把这次经历，变成下一种打法。</h3><span>SEED ${seed(summary.seed)}</span></div>${reviewDetailsMarkup(summary)}${pathMarkup(summary)}${finalEquipment ? `<p class="profile-final-equipment">最终携带 · ${escape(finalEquipment)}</p>` : ''}<article class="profile-next-attempt"><span class="profile-next-label">下一局，可以试试</span><p>${escape(summary.suggestion)}</p><small>本局依据 · ${escape(summary.suggestionEvidence)}</small></article><div class="profile-result-archive"><span>档案已记录 ${data.stats.runs} 份病例 · ${data.achievements.length} 项里程碑</span><button data-action="profile" class="profile-result-link">查看局外档案 <span aria-hidden="true">↗</span></button></div>${storageMarkup(status, true)}</section></details>`;
}
