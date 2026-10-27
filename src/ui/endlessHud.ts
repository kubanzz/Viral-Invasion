import { BATTLE_BALANCE } from '../game/battleConfig';
import { createEndlessGrowth, endlessCombatStats, ENDLESS_UPGRADES, ENDLESS_UPGRADE_IDS } from '../game/endlessGrowth';
import { ENEMY_TACTIC_INFO } from '../game/enemyTacticInfo';
import { endlessSupportTactics } from '../game/endless';
import { endlessEvolutionWarningMarkup, endlessTraitCopy, endlessUpcomingTraits, updateEndlessEvolutionWarning } from './endlessEvolutionWarning';
import type { EnemyTactic } from '../game/enemyTacticsTypes';
import { activeWorld, BALANCE, type GameState } from '../game/types';
import type { EndlessProfileData, EndlessProfileSnapshot, EndlessRunRecord } from '../meta/endlessProfile';

export type EndlessRecordView = EndlessProfileSnapshot | EndlessProfileData | EndlessRunRecord;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const number = (value: number, places = 1) => Number.isFinite(value) ? String(Number(value.toFixed(places))) : '0';
const time = (seconds: number) => { const value = Math.max(0, Math.floor(seconds)); return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`; };
const statsFor = (state: GameState) => endlessCombatStats(state.endlessGrowth ?? createEndlessGrowth(state.seed));
const dataOf = (record?: EndlessRecordView): EndlessProfileData | undefined => record && 'data' in record ? record.data : record && 'bestWave' in record ? record : undefined;
const statusMarkup = (record?: EndlessRecordView): string => record && 'status' in record
  ? `<p class="endless-storage ${record.status.mode === 'session' ? 'is-temporary' : ''}" role="status">${escape(record.status.message)}</p>` : '';

/** Counts live bodies, unspawned wave budget and genuine pending fission children. */
export function endlessRemaining(state: GameState): number {
  return state.endless ? state.targets.filter(target => target.hp > 0).length + state.endless.remainingToSpawn + state.endless.pendingChildren : 0;
}
function abilityLines(state: GameState): string[] {
  const s = statsFor(state);
  return [
    `1 · ${s.shotRays} 束 × ${number(BALANCE.damage[1] * s.damageMultiplier)}伤害 · 贯穿 +${s.pierceCount} · ${number(s.primaryCooldown, 3)}s`,
    `2 · 半径 ${number(s.areaRadius)} · ${number(BALANCE.damage[2] * s.damageMultiplier * s.areaDamageMultiplier)}伤害 · ${number(s.areaCooldown, 2)}s`,
    `Space · ${s.dashDamage ? `冲刺斩 ${number(s.dashDamage * s.damageMultiplier)}伤害` : '冲刺斩未解锁'}　Q · ${s.scanDamage ? `${number(s.scanDamage * s.damageMultiplier)}爆发` : '免疫小队'}`,
    `细胞伤害 ×${number(s.cellDamageMultiplier * s.damageMultiplier, 2)} · 寿命 +${number(s.cellDurationBonus, 2)}s · Q ${number(s.scanCooldown, 2)}s`,
  ];
}
const specialTactics = ['thin-ray', 'crystal-charge', 'fission-burst', 'mimic-corrosion'] as const;
function tacticCopy(tactic: EnemyTactic): string {
  const info = ENEMY_TACTIC_INFO[tactic];
  return `${info.name}：${info.counter}${tactic === 'crystal-charge' ? '让开路线后反打。' : ''}`;
}
function mixedSupportCopy(state: GameState): string {
  const e = state.endless;
  if (!e || e.wave < 16) return '';
  const tactics = endlessSupportTactics(state.seed, e.wave);
  return [...new Set(tactics)].map(tactic => `${ENEMY_TACTIC_INFO[tactic].name}${tactics.filter(item => item === tactic).length > 1 ? '×2' : ''}`).join(' / ');
}
function threatCopy(state: GameState, upcoming = false): string {
  if (upcoming && state.endless?.eliteWave) {
    const traits = endlessUpcomingTraits(state);
    const tactic: EnemyTactic = traits[0] === 'CARAPACE' ? 'crystal-charge' : traits[0] === 'FISSION' ? 'fission-burst' : 'mimic-corrosion';
    return `精英 · ${tacticCopy(tactic)}${state.endless.wave >= 16 ? ` 混编：${mixedSupportCopy(state)}。` : ''}`;
  }
  if (upcoming && state.endless && state.endless.wave >= 16) {
    return `${mixedSupportCopy(state)}。锁线侧闪，双圈离圈，侵蚀 Q 打断；远距支援可接近或 Q 部署细胞。`;
  }
  const threats = state.targets.filter(target => target.hp > 0 && target.tactic && target.tactic !== 'melee');
  const active = threats.find(target => target.attackPlan || target.charge) ?? threats[0];
  if (active?.tactic) return tacticCopy(active.tactic);
  if (upcoming && (state.endless?.supportRemaining ?? 0) > 0) return tacticCopy('thin-ray');
  return '1 按住净化 · 2 清群打断 · Q 召集或指挥小队。';
}
function phaseCopy(state: GameState): { title: string; detail: string; alert: boolean } {
  const endless = state.endless!;
  const seconds = Math.max(0, endless.phaseUntil - state.elapsed);
  if (endless.phase === 'warning') return { title: `${endless.eliteWave ? '精英来袭' : '下一波来袭'} · ${number(seconds)}s`,
    detail: `${endless.formationLabel} · ${threatCopy(state, true)}`, alert: endless.eliteWave };
  if (endless.phase === 'intermission') return { title: `第 ${endless.clearedWaves} 波清除`,
    detail: state.growth?.draft?.source === 'endless' ? '精英波联动重配 · 免样本、可放弃，战斗进化照常获得。'
      : state.endlessGrowth?.draft ? '选择战斗进化；每5波另有协议重配。选择期间暂停。' : `补给整备 · ${number(seconds)}s 后继续；3 抢修组织。`, alert: false };
  return { title: `${endless.eliteWave ? '精英波' : '本波编队'} · ${endless.formationLabel}`,
    detail: threatCopy(state), alert: endless.eliteWave || state.targets.some(target => target.hp > 0 && !!(target.attackPlan || target.charge)) };
}

export function endlessHudMarkup(): string {
  return `<div id="endless-hud" class="endless-hud" aria-label="连续挑战状态">
    ${endlessEvolutionWarningMarkup()}
    <section class="endless-wave-panel"><div class="eyebrow">ENDLESS / 连续挑战</div><div class="endless-wave-heading"><strong id="endless-wave">第 1 波</strong><span id="endless-cleared">已清 0 波</span></div>
      <div class="endless-count"><b id="endless-remaining">0</b><span>敌群剩余<small id="endless-spawn-plan"></small></span></div>
      <h3 id="endless-phase"></h3><p id="endless-objective"></p><p id="endless-traits"></p><div class="endless-score"><span>得分 <b id="endless-score">0</b></span><span id="endless-combo">连击 0</span></div></section>
    <section class="endless-vitals" aria-label="救援体和组织状态"><div><span>救援体耐久</span><b id="endless-hp"></b></div><div class="meter"><i id="endless-hp-meter"></i></div>
      <div><span>组织完整度</span><b id="endless-tissue"></b></div><div class="meter"><i id="endless-tissue-meter"></i></div><p id="endless-pressure"></p><p id="endless-critical" role="status"></p></section>
    <section class="endless-build-panel"><strong id="endless-level">战斗进化 Lv.0</strong><div id="endless-abilities">${Array.from({ length: 4 }, (_, i) => `<p id="endless-ability-${i}"></p>`).join('')}</div><p id="endless-latest" class="endless-latest"></p></section>
    <section class="endless-navigation"><strong>战场导航</strong><canvas id="endless-minimap" width="220" height="130" role="img" aria-label="连续挑战小地图：三角为你，加号为组织，菱形为阀门，圆点为敌群"></canvas><p>△ 你　＋ 组织　◇ 阀门　● 敌群</p><p id="endless-tissue-route"></p></section>
  </div>`;
}

const text = (id: string, value: string) => { const node = document.getElementById(id); if (node && node.textContent !== value) node.textContent = value; };
const meter = (id: string, ratio: number) => { const node = document.getElementById(id); if (node) node.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`; };

/** A small fixed Canvas, no history, RAF, player-state writes or global node cache. */
function drawMap(state: GameState): void {
  const canvas = document.getElementById('endless-minimap') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const world = activeWorld(state), width = canvas.width, height = canvas.height, pad = 10;
  const sx = (width - pad * 2) / world.width, sy = (height - pad * 2) / world.height;
  const point = (p: { x: number; y: number }) => ({ x: pad + p.x * sx, y: pad + p.y * sy });
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#101d22'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#53716e'; ctx.lineWidth = 1;
  ctx.strokeRect(pad + world.bounds.left * sx, pad + world.bounds.top * sy, (world.bounds.right - world.bounds.left) * sx, (world.bounds.bottom - world.bounds.top) * sy);
  ctx.fillStyle = '#425456';
  for (const obstacle of world.obstacles) { const p = point(obstacle); ctx.beginPath(); ctx.ellipse(p.x, p.y, obstacle.radius * sx, obstacle.radius * sy, 0, 0, Math.PI * 2); ctx.fill(); }
  for (const target of state.targets) if (target.hp > 0) {
    const p = point(target); ctx.fillStyle = target.role === 'elite' || target.role === 'core' ? '#ffd09b' : '#ef8f85';
    ctx.beginPath(); ctx.arc(p.x, p.y, target.role === 'elite' || target.role === 'core' ? 3.5 : 2, 0, Math.PI * 2); ctx.fill();
  }
  const tissue = point(state.tissue); ctx.strokeStyle = '#b9f7cd'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(tissue.x - 4, tissue.y); ctx.lineTo(tissue.x + 4, tissue.y); ctx.moveTo(tissue.x, tissue.y - 4); ctx.lineTo(tissue.x, tissue.y + 4); ctx.stroke();
  for (const valve of state.battle?.graph.nodes.filter(node => node.kind === 'valve') ?? []) {
    const p = point(valve); ctx.strokeStyle = '#edcc92'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x, p.y + 4); ctx.lineTo(p.x - 4, p.y); ctx.closePath(); ctx.stroke();
  }
  const p = point(state.player), angle = Math.atan2(Math.sin(state.player.facing) * sy, Math.cos(state.player.facing) * sx);
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle); ctx.fillStyle = '#d3fffb'; ctx.strokeStyle = '#102b3b'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}

export function updateEndlessHud(state: GameState): void {
  if (!state.endless || typeof document === 'undefined') return;
  const e = state.endless, stats = statsFor(state), phase = phaseCopy(state), alive = state.targets.filter(target => target.hp > 0).length;
  text('endless-wave', `第 ${e.wave} 波${e.eliteWave ? ' · 精英' : ''}`); text('endless-cleared', `已清 ${e.clearedWaves} 波`);
  text('endless-remaining', String(endlessRemaining(state)));
  text('endless-spawn-plan', `场上 ${alive} · 待入场 ${e.remainingToSpawn}${e.pendingChildren ? ` · 待分裂 ${e.pendingChildren}` : ''}`);
  text('endless-phase', phase.title); text('endless-objective', phase.detail);
  const phaseNode = document.getElementById('endless-phase'); if (phaseNode) phaseNode.dataset.alert = String(phase.alert);
  const traitText = endlessTraitCopy(state);
  // This row stays visible at compact heights where the longer objective hides.
  text('endless-traits', e.phase === 'warning' && e.wave >= 16 ? `${traitText}；混编：${mixedSupportCopy(state)}` : traitText);
  updateEndlessEvolutionWarning(state);
  text('endless-score', String(e.score)); text('endless-combo', `连击 ${e.combo} · 最高 ${e.bestCombo}`);
  text('endless-hp', `${Math.ceil(state.player.hp)} / ${stats.maxHp}`); meter('endless-hp-meter', state.player.hp / stats.maxHp);
  text('endless-tissue', `${Math.ceil(state.tissue.hp / state.tissue.maxHp * 100)}%`); meter('endless-tissue-meter', state.tissue.hp / state.tissue.maxHp);
  const pressure = state.battle?.pressure;
  text('endless-pressure', pressure ? `感染 ${number(pressure.infection, 0)}% · 全身稳定 ${number(pressure.vitality, 0)}%` : '3 · 瞄准＋组织抢修');
  text('endless-critical', pressure?.criticalSince != null ? `致命感染 · ${number(Math.max(0, BATTLE_BALANCE.crisisDuration - (state.elapsed - pressure.criticalSince)))}s 内清群或抢修`
    : pressure?.organAlarm ? '组织危急 · 立即用 3 抢修，保住全身稳定' : '3 瞄准组织抢修 · Esc 可主动撤离结算');
  text('endless-level', `战斗进化 Lv.${state.endlessGrowth?.level ?? 0}`);
  abilityLines(state).forEach((line, i) => text(`endless-ability-${i}`, line));
  const latest = state.endlessGrowth?.lastChoice;
  text('endless-latest', latest ? `最近获得 · ${latest.title}：${latest.description}` : '清除第 1 波即可三选一：扇射、免疫与更多机制。');
  const latestNode = document.getElementById('endless-latest'); if (latestNode) latestNode.title = latest?.description ?? '';
  const dx = state.tissue.x - state.player.x, dy = state.tissue.y - state.player.y;
  text('endless-tissue-route', Math.hypot(dx, dy) < 100 ? '已在组织附近 · 3 瞄准十字节点抢修' : `组织在${dy < -60 ? '北' : dy > 60 ? '南' : ''}${dx < -60 ? '西' : dx > 60 ? '东' : ''}侧 · ${Math.round(Math.hypot(dx, dy))}m`);
  drawMap(state);
}

function modal(content: string, label: string, extra = ''): string {
  return `<div class="overlay endless-overlay"><section class="modal endless-modal ${extra}" role="dialog" aria-modal="true" aria-label="${escape(label)}">${content}</section></div>`;
}
function effects(low: boolean): string { return `<button data-action="effects">特效：${low ? '低' : '标准'}</button>`; }
function buildSummary(state: GameState): string {
  const stats = statsFor(state), growth = state.endlessGrowth;
  return `<div class="endless-build-summary"><h3>本局战斗进化 · Lv.${growth?.level ?? 0}</h3><p>${ENDLESS_UPGRADE_IDS.filter(id => growth?.ranks[id]).map(id => `${ENDLESS_UPGRADES[id].title} ${growth!.ranks[id]}阶`).join(' · ') || '尚未获得战斗进化'}</p>
    <dl><dt>精确净化</dt><dd>${stats.shotRays}束 × ${number(BALANCE.damage[1] * stats.damageMultiplier)}伤害 · 每束额外贯穿${stats.pierceCount}体 · 间隔${number(stats.primaryCooldown, 3)}s</dd>
    <dt>范围裂解</dt><dd>半径${number(stats.areaRadius)} · ${number(BALANCE.damage[2] * stats.damageMultiplier * stats.areaDamageMultiplier)}伤害 · 冷却${number(stats.areaCooldown, 2)}s</dd>
    <dt>冲刺 / Q爆发</dt><dd>${number(stats.dashDamage * stats.damageMultiplier)} / ${number(stats.scanDamage * stats.damageMultiplier)}伤害（0表示未解锁）</dd>
    <dt>免疫与耐久</dt><dd>细胞伤害×${number(stats.cellDamageMultiplier * stats.damageMultiplier, 2)} · 寿命+${number(stats.cellDurationBonus, 2)}s · 小队冷却×${number(stats.cellCooldownMultiplier, 2)} · Q ${number(stats.scanCooldown, 2)}s · 最大耐久${stats.maxHp}</dd></dl>
    ${growth?.lastChoice ? `<p class="endless-latest">最近获得 · ${escape(growth.lastChoice.title)}：${escape(growth.lastChoice.description)}</p>` : ''}</div>`;
}

export function endlessMenuEntry(record?: EndlessRecordView): string {
  const data = dataOf(record);
  return `<div class="endless-menu-entry"><button class="primary" data-action="endless-start">连续挑战 · 一波接一波　↗</button><p>清波三选一，扇射、贯穿、冲刺斩与免疫军团持续成长；每5波精英与协议联动重配。${data?.runs ? `<br>最高通关 ${data.bestWave} 波 · 最高分 ${data.bestScore} · 最高连击 ${data.bestCombo}` : '<br>从第 1 波起步，打造这一局的抗体构筑。'}</p>${statusMarkup(record)}</div>`;
}

/** Help wins over a pending mechanical choice; returning from help restores that choice. */
export function endlessOverlay(state: GameState, help: boolean, lowEffects: boolean, record?: EndlessRecordView): string | null {
  if (!state.endless) return null;
  const e = state.endless;
  if (help) return modal(`<div class="eyebrow">ENDLESS / 连续挑战手册</div><h2>越打越强，选择你的清场方式。</h2><div class="endless-help-scroll">
    <p>在大地图自由移动，用右下导航找回＋组织与◇阀门。敌群从周围分批来袭，清完活体、待入场敌人和待分裂小体才算清波；没有等倒计时自动胜利。</p>
    <div class="help-grid"><div><kbd>WASD</kbd>移动</div><div><kbd>鼠标</kbd>瞄准 · 按住左键连续行动</div><div><kbd>1</kbd>精确净化 · 扇射/贯穿可改变射击</div><div><kbd>2</kbd>范围裂解 · 击退打断</div><div><kbd>3</kbd>瞄准＋组织抢修，也能恢复少量耐久</div><div><kbd>Q</kbd>扫描显形 · 召集或指挥免疫小队</div><div><kbd>Space</kbd>冲刺脱围，升级后沿路径造成伤害</div><div><kbd>E</kbd>靠近◇阀门，朝鼠标发动冲流</div></div>
    <p><strong>每次清波三选一。</strong>战斗进化会立即改变真实攻击：更多射线、贯穿、扩大裂解、冲刺斩、Q爆发、免疫军团、耐久与射速；选项会写明本次前后数值。战斗进化可持续获得，已达到机制上限的项目会退出选池，数值成长仍会继续。左下原协议与这些强化同时生效。</p>
    <p><strong>Q 不只是扫描。</strong>鼠标指向敌群按 Q，细胞会实际移动并吞噬。小队仍在且召集冷却中时，再按 Q 改指挥点；细胞从原位赶往新战线，不续命、不重置咬击冷却、不额外耗组织。免疫军团强化伤害、持续和召集效率。</p>
    <p><strong>读编队，换打法。</strong>正面双潮、交叉夹击、聚群猎场与侧翼点射会改变接敌方向与节奏。第16波起三名支援混用已见过的招式，第30波起四名，分批入场。轻型支援基础耐久68，无精英被动特性，可直接净化；精英仍有其变异。重型招式同类最多一体起手，总并发最多三体。</p>
    <p><strong>第20波起，病毒也会换代。</strong>每5波参考近期有效行动，轻度调整下一代变异倾向。提前8秒读进化预警，查看主变异获得的能力、付出的代价和基础反制，再决定接近、清群或保护组织。</p>
    <p>${specialTactics.map(tactic => `<strong>${escape(ENEMY_TACTIC_INFO[tactic].name)}</strong> · ${escape(ENEMY_TACTIC_INFO[tactic].counter)}${tactic === 'crystal-charge' ? '让开路线后反打。' : ''}`).join('<br>')}</p>
    <p><strong>每5波协议联动重配。</strong>清除精英波后，除战斗进化外再获一次免费协议草案。优先补齐显影围猎或共振连锁的伙伴；最多三槽，进阶至Ⅲ后仍可调校。免样本、可放弃，不会抵消本波战斗成长。</p>
    <p>连击需要连续净化维持；清波与升级后继续下一波。Esc、失焦与手册暂停模拟；暂停里可主动撤离并结算。死亡也记录本局成绩。战绩独立保存，下一局从基础能力重新构筑，最高通关只计完全清除的波次。</p>${buildSummary(state)}</div>
    <div class="actions"><button class="primary" data-action="close-help">返回挑战</button>${effects(lowEffects)}</div>`, '连续挑战操作指南', 'endless-help');
  if (state.phase === 'result') {
    const data = dataOf(record);
    return modal(`<div class="eyebrow">ENDLESS / ${state.result?.success ? 'EXTRACTED' : 'RUN ENDED'}</div><h2>${state.result?.success ? '主动撤离，留下这次纪录。' : '这一轮结束，再换一种构筑。'}</h2><p>${escape(state.result?.reason ?? '')}</p>
      <div class="stats"><div><strong>${e.clearedWaves}</strong><small>完全清除波次</small></div><div><strong>${e.score}</strong><small>本局得分</small></div><div><strong>${e.bestCombo}</strong><small>最高连击</small></div></div><p>到达第 ${e.wave} 波 · 净化 ${e.kills} 体 · ${time(state.elapsed)} · SEED ${state.seed >>> 0}</p>
      ${data ? `<p class="endless-best">个人纪录 · 通关 ${data.bestWave} 波 / ${data.bestScore} 分 / 连击 ${data.bestCombo} · 已结算 ${data.runs} 局</p>` : ''}${buildSummary(state)}${statusMarkup(record)}
      <div class="actions"><button class="primary" data-action="retry">同种子再战</button><button data-action="new">换个种子再战</button><button data-action="menu">主菜单</button></div>`, '连续挑战结算');
  }
  const draft = state.endlessGrowth?.draft;
  if (draft) return modal(`<div class="eyebrow">WAVE ${draft.wave} CLEAR / 战斗进化</div><h2>这次怎样变强？</h2><p>第 ${draft.wave} 波已清除 · 选 1 项立即生效，之后继续下一波。选择期间战场暂停。</p>
    <div class="endless-upgrade-grid">${draft.options.map(option => `<button class="endless-upgrade" data-action="endless-upgrade" data-run="${escape(state.growth?.runId ?? '')}" data-draft="${escape(draft.id)}" data-upgrade="${escape(option.id)}"><span>${option.currentRank ? `${option.currentRank}阶 → ${option.nextRank}阶` : '解锁新成长'}</span><strong>${escape(option.title)}</strong><p>${escape(option.description)}</p><b>选择这项　↗</b></button>`).join('')}</div>
    <div class="actions"><button data-action="help">查看操作与构筑</button></div>`, '清波战斗进化三选一', 'endless-draft');
  if (state.phase === 'paused') return modal(`<div class="eyebrow">ENDLESS / 暂停</div><h2>下一波，继续变强。</h2><p>模拟、危区前摇与波次计时已暂停。已清 ${e.clearedWaves} 波，当前第 ${e.wave} 波，得分 ${e.score}。</p>${buildSummary(state)}
    <div class="actions"><button class="primary" data-action="continue">继续挑战</button><button data-action="endless-extract">主动撤离并结算</button><button data-action="help">操作与成长说明</button>${effects(lowEffects)}<button class="quiet" data-action="menu">返回菜单</button></div>`, '连续挑战已暂停');
  return null;
}
