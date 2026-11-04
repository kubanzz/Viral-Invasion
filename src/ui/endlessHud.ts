import { createEndlessGrowth, endlessCombatStats, ENDLESS_UPGRADES, ENDLESS_UPGRADE_IDS } from '../game/endlessGrowth';
import { ENEMY_TACTIC_INFO } from '../game/enemyTacticInfo';
import { endlessSupportTactics } from '../game/endless';
import { endlessPacing } from '../game/endlessPacing';
import { sourceQuotaRemaining } from '../game/endlessSource';
import { endlessAssaultSlots } from '../game/endlessAssault';
import { IMMUNE_GUARD_BALANCE } from '../game/immuneFocus';
import { viralCapsulePlan } from '../game/viralCapsules';
import { endlessEvolutionWarningMarkup, endlessTraitCopy, endlessUpcomingTraits, openingEvolutionDetailText, updateEndlessEvolutionWarning } from './endlessEvolutionWarning';
import { catalysisToolCopy } from './catalysisHud';
import { eliteCycleCounter, eliteCycleForecast, eliteCycleStatus } from './eliteTacticCycleHud';
import type { EnemyTactic } from '../game/enemyTacticsTypes';
import { activeWorld, BALANCE, type GameState } from '../game/types';
import type { EndlessProfileData, EndlessProfileSnapshot, EndlessRunRecord, TerritoryProfileData, TerritoryProfileSnapshot } from '../meta/endlessProfile';
import { territoryHelpMarkup, territoryHudView, territoryLegacyMarkup } from './territoryHud';
import { choiceIconMarkup, endlessChoiceCopy } from './upgradeChoices';
import { healingPoints } from '../game/healingPoints';
import { healingPointInteractionHint } from './campaignHud';

export type EndlessRecordView = EndlessProfileSnapshot | EndlessProfileData | EndlessRunRecord | TerritoryProfileSnapshot | TerritoryProfileData;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const number = (value: number, places = 1) => Number.isFinite(value) ? String(Number(value.toFixed(places))) : '0';
const time = (seconds: number) => { const value = Math.max(0, Math.floor(seconds)); return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`; };
const statsFor = (state: GameState) => endlessCombatStats(state.endlessGrowth ?? createEndlessGrowth(state.seed));
const dataOf = (record?: EndlessRecordView): EndlessProfileData | TerritoryProfileData | undefined => record && 'data' in record ? record.data : record && 'bestWave' in record ? record : undefined;
const statusMarkup = (record?: EndlessRecordView): string => record && 'status' in record
  ? `<p class="endless-storage ${record.status.mode === 'session' ? 'is-temporary' : ''}" role="status">${escape(record.status.message)}</p>` : '';

/** Counts live bodies, unspawned wave budget and genuine pending fission children. */
export function endlessRemaining(state: GameState): number {
  return state.endless ? state.targets.filter(target => target.hp > 0 && (!state.territory || target.blocksWaveClear !== false)).length + state.endless.remainingToSpawn + state.endless.pendingChildren : 0;
}
const specialTactics = ['thin-ray', 'crystal-charge', 'fission-burst', 'mimic-corrosion'] as const;
function activeGuardBeacons(state: GameState) {
  return (state.growth?.beacons ?? (state.growth?.beacon ? [state.growth.beacon] : []))
    .filter(beacon => beacon.guard && beacon.organId === state.battle?.organId && beacon.until > state.elapsed
      && state.growth?.cells?.some(cell => cell.beaconId === beacon.id && cell.until > state.elapsed && (cell.hp ?? 1) > 0));
}
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
function sourceCopy(state: GameState, compact = false): string {
  const source = state.endless?.source;
  if (!source) return '';
  if (source.status === 'destroyed') return compact ? `□ 源已截断${source.canceledSlots.length}体` : `□ 源已击破 · 已截断${source.canceledSlots.length}体待生增援`;
  if (source.status === 'exhausted') return '□ 源已枯竭 · 无需再拆，清除现存敌群即可';
  const dx = source.position.x - state.player.x, dy = source.position.y - state.player.y;
  const direction = `${dy < -80 ? '北' : dy > 80 ? '南' : ''}${dx < -80 ? '西' : dx > 80 ? '东' : ''}` || '附近';
  const route = `${direction}侧${Math.round(Math.hypot(dx, dy))}m`;
  return compact ? `□ 源${route} · ${sourceQuotaRemaining(source)}体待生`
    : `□ ${source.bornAt === null ? '远侧源待开启' : '活跃增援源'} · ${route} · 可截断${sourceQuotaRemaining(source)}体待生增援 · 截断不计击杀分`;
}
function assaultCopy(state: GameState): string {
  const e = state.endless;
  if (!e || e.phase === 'intermission') return '';
  const slots = endlessAssaultSlots(e.wave, e.batchSchedule.flatMap(batch => batch.roles), e.source);
  const alive = state.targets.filter(target => target.hp > 0 && target.assaultObjective === 'tissue').length;
  const pending = slots.filter(slot => slot >= e.batchIndex * 3 + e.batchMemberIndex).length;
  if (!alive && !pending) return '';
  return e.phase === 'warning' ? `▲ ${slots.length}体将袭击＋组织 · 拦截或部署细胞`
    : `▲ 袭击组织 ${alive}体${pending ? ` · ${pending}体待生` : ''} · 2聚拢 / Q部署`;
}
function baseThreatCopy(state: GameState, upcoming = false): string {
  if (upcoming && state.endless?.eliteWave) {
    const traits = endlessUpcomingTraits(state);
    const tactic: EnemyTactic = traits[0] === 'CARAPACE' ? 'crystal-charge' : traits[0] === 'FISSION' ? 'fission-burst' : 'mimic-corrosion';
    return `${eliteCycleForecast(state) || `精英 · ${tacticCopy(tactic)}`}${state.endless.wave >= 16 ? ` 混编：${mixedSupportCopy(state)}。` : ''}`;
  }
  if (upcoming && state.endless && state.endless.wave >= 16) {
    return `${mixedSupportCopy(state)}。锁线侧闪，双圈离圈，侵蚀 Q 打断；远距支援可接近或 Q 部署细胞。`;
  }
  const threats = state.targets.filter(target => target.hp > 0 && target.tactic && target.tactic !== 'melee');
  const active = threats.find(target => target.attackPlan || target.charge) ?? threats[0];
  const cycleStatus = active ? eliteCycleStatus(state, active) : '';
  if (cycleStatus) return `${cycleStatus} · ${eliteCycleCounter(state, active!)}`;
  if (active?.tactic) return tacticCopy(active.tactic);
  if (upcoming && (state.endless?.supportRemaining ?? 0) > 0) return tacticCopy('thin-ray');
  return state.endless?.wave === 1 ? '移动避开敌群，持续射击；清波后选择一次强化。' : '1 持续净化 · 2 聚拢爆破 · Q 召集或指挥小队。';
}
function threatCopy(state: GameState, upcoming = false): string {
  const capsules = state.targets.filter(target => target.hp > 0 && target.viralCapsule);
  const announced = upcoming && state.endless && viralCapsulePlan(state.endless.wave, state.endless.batchSchedule.flatMap(batch => batch.roles), state.endless.source);
  const prefix = capsules.length ? `离体弹囊 ${capsules.length}枚 · 1/2/挥斩击落，侧移/借墙。`
    : announced ? announced.fork ? '分叉母囊 · 先击落阻分叉；宿主死亡仍会释放。' : '携带弹囊 · 宿主死亡仍会释放，可击落/躲避。' : '';
  return prefix + baseThreatCopy(state, upcoming);
}
function phaseCopy(state: GameState): { title: string; detail: string; alert: boolean } {
  const endless = state.endless!;
  const pacing = endlessPacing(endless.wave);
  const cycle = `第${pacing.cycle}轮 · ${pacing.label}`;
  const sourceHint = sourceCopy(state);
  const assaultHint = assaultCopy(state);
  const seconds = Math.max(0, endless.phaseUntil - state.elapsed);
  if (endless.phase === 'warning') return { title: `${endless.eliteWave ? '精英来袭' : '下一波来袭'} · ${number(seconds)}s`,
    detail: `${assaultHint ? `${assaultHint}。` : ''}${sourceHint || `${cycle} · ${endless.formationLabel}`} · ${threatCopy(state, true)}`, alert: pacing.role !== 'release' };
  if (endless.phase === 'intermission') return { title: `第 ${endless.clearedWaves} 波清除`,
    detail: state.growth?.draft?.source === 'endless' ? '精英波联动重配 · 免样本、可放弃，战斗进化照常获得。'
      : state.endlessGrowth?.draft?.breakthrough ? '精英突破：所选路线最多连升两阶。另有免费协议重配。'
        : state.endlessGrowth?.draft ? '选择战斗进化；每5波另有协议重配。选择期间暂停。' : `补给整备 · ${number(seconds)}s 后继续；3 抢修组织。`, alert: false };
  return { title: `${cycle} · ${endless.formationLabel}`,
    detail: `${assaultHint ? `${assaultHint}。` : ''}${sourceHint}${sourceHint ? '。' : ''}${threatCopy(state)}`, alert: endless.eliteWave || state.targets.some(target => target.hp > 0 && !!(target.attackPlan || target.charge)) };
}

export function endlessHudMarkup(): string {
  return `<div id="endless-hud" class="endless-hud" aria-label="连续挑战状态">
    ${endlessEvolutionWarningMarkup()}
    <section class="endless-wave-panel"><div class="eyebrow">ENDLESS / 连续挑战</div><div class="endless-wave-heading"><strong id="endless-wave">第 1 波</strong><span id="endless-cleared">已清 0 波</span></div>
      <div class="endless-count"><b id="endless-remaining">0</b><span>敌群剩余<small id="endless-spawn-plan"></small></span></div>
      <h3 id="endless-phase"></h3><p id="endless-objective"></p><p id="endless-traits"></p><details id="endless-opening-details" hidden><summary>首阶段进化观察</summary><p id="endless-opening-detail"></p></details><div class="endless-score"><span>得分 <b id="endless-score">0</b></span><span id="endless-combo">连击 0</span></div></section>
    <section class="endless-vitals" aria-label="救援体和组织状态"><div><span>救援体耐久</span><b id="endless-hp"></b></div><div class="meter"><i id="endless-hp-meter"></i></div>
      <div class="endless-core-copy"><span>组织完整度</span><b id="endless-tissue"></b></div><div class="meter endless-core-copy"><i id="endless-tissue-meter"></i></div><p id="endless-pressure"></p><p id="endless-critical" role="status"></p></section>
    <section class="endless-build-panel"><strong id="endless-level">战斗进化 Lv.0</strong><div id="endless-abilities">${Array.from({ length: 4 }, (_, i) => `<p id="endless-ability-${i}"></p>`).join('')}</div><p id="endless-latest" class="endless-latest"></p></section>
    <section class="endless-navigation"><strong>战场导航</strong><canvas id="endless-minimap" width="220" height="130" role="img" aria-label="连续挑战小地图：白三角为你，橙三角为组织袭击者，加号为组织和治疗点，红色加号为已占领，菱形为阀门，方框为增援源，圆点为敌群"></canvas><p>△ 你　▲ 袭击者　＋ 治疗　□ 源</p><p id="endless-tissue-route"></p></section>
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
  for (const target of state.targets) if (target.hp > 0 && target.id !== state.endless?.source?.id) {
    if (target.role === 'nest') {
      const p=point(target);ctx.save();ctx.fillStyle='#57415f';ctx.strokeStyle='#f0cfaf';ctx.lineWidth=1.5;
      ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3,x=p.x+Math.cos(a)*7,y=p.y+Math.sin(a)*7;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff0d1';ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.fillText('巢',p.x,p.y+3);ctx.restore();continue;
    }
    if (target.viralCapsule) {
      const p = point(target); ctx.fillStyle = '#ffb4d4'; ctx.strokeStyle = '#59233c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x, p.y + 4); ctx.lineTo(p.x - 4, p.y); ctx.closePath(); ctx.fill(); ctx.stroke(); continue;
    }
    if (target.assaultObjective === 'tissue') {
      const p = point(target), to = point(state.tissue), angle = Math.atan2(to.y - p.y, to.x - p.x);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle); ctx.fillStyle = '#ffbb63'; ctx.strokeStyle = '#412723'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      continue;
    }
    const p = point(target); ctx.fillStyle = target.role === 'elite' || target.role === 'core' ? '#ffd09b' : '#ef8f85';
    ctx.beginPath(); ctx.arc(p.x, p.y, target.role === 'elite' || target.role === 'core' ? 3.5 : 2, 0, Math.PI * 2); ctx.fill();
  }
  const source = state.endless?.source;
  if (source && source.status === 'active') {
    const p = point(source.position); ctx.strokeStyle = '#ffd09b'; ctx.lineWidth = 2;
    ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
  }
  const tissue = point(state.tissue); ctx.strokeStyle = '#b9f7cd'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(tissue.x - 4, tissue.y); ctx.lineTo(tissue.x + 4, tissue.y); ctx.moveTo(tissue.x, tissue.y - 4); ctx.lineTo(tissue.x, tissue.y + 4); ctx.stroke();
  for (const node of state.territory ? [] : healingPoints(state)) {
    const p = point(node); ctx.strokeStyle = node.infection >= 100 ? '#f47f78' : node.infection > 0 ? '#e9bd61' : '#88ddcc'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke();
    if (node.infection > 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * node.infection / 100); ctx.lineWidth = 1; ctx.stroke(); }
  }
  for (const node of state.territory?.nodes ?? []) {
    const p = point(node); ctx.strokeStyle = node.owner === 'healthy' ? '#9df4bd' : '#ff837c'; ctx.lineWidth = 2;
    if (node.kind === 'source') ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
    else if (node.kind === 'front') { ctx.beginPath(); ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 5, p.y); ctx.lineTo(p.x, p.y + 5); ctx.lineTo(p.x - 5, p.y); ctx.closePath(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke(); }
    if (node.purificationProgress > 0 && node.owner === 'infected') { ctx.beginPath(); ctx.arc(p.x, p.y, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * node.purificationProgress / 100); ctx.strokeStyle = '#b8efd1'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  for (const beacon of activeGuardBeacons(state)) {
    const anchor = point(beacon); ctx.strokeStyle = '#8bf0dc'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.ellipse(anchor.x, anchor.y, beacon.guard!.radius * sx, beacon.guard!.radius * sy, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    for (const cell of state.growth?.cells ?? []) if (cell.beaconId === beacon.id && cell.until > state.elapsed && (cell.hp ?? 1) > 0) {
      const p = point(cell); ctx.fillStyle = '#8bf0dc'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
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
  text('endless-spawn-plan', state.territory ? '' : `场上 ${alive} · 待入场 ${e.remainingToSpawn}${e.pendingChildren ? ` · 待分裂 ${e.pendingChildren}` : ''}${e.canceledToSpawn ? ` · 已截断 ${e.canceledToSpawn}` : ''}`);
  text('endless-phase', phase.title); text('endless-objective', phase.detail);
  const phaseNode = document.getElementById('endless-phase'); if (phaseNode) phaseNode.dataset.alert = String(phase.alert);
  const traitText = endlessTraitCopy(state);
  const assaultHint = assaultCopy(state);
  const capsules = state.targets.filter(target => target.hp > 0 && target.viralCapsule).length;
  const announcedCapsule = e.phase === 'warning' && viralCapsulePlan(e.wave, e.batchSchedule.flatMap(batch => batch.roles), e.source);
  // This row stays visible at compact heights where the longer objective hides.
  const compactThreat = assaultHint
    ? `${assaultHint}${e.phase === 'warning' && e.wave >= 16 ? `；混编：${mixedSupportCopy(state)}` : ''}`
    : e.phase === 'warning' && e.wave >= 16 ? `${traitText}；混编：${mixedSupportCopy(state)}` : traitText;
  text('endless-traits', `${capsules ? `◆ 离体弹囊${capsules}枚 · 2/挥斩击落；` : announcedCapsule ? `◆ ${announcedCapsule.fork ? '分叉母囊' : '死亡释放弹囊'}；` : ''}${compactThreat}${e.source ? `；${sourceCopy(state, true)}` : ''}`);
  const observation = openingEvolutionDetailText(state), observationNode = document.getElementById('endless-opening-details');
  if (observationNode) observationNode.hidden = !observation;
  text('endless-opening-detail', observation);
  updateEndlessEvolutionWarning(state);
  text('endless-score', String(e.score)); text('endless-combo', `连击 ${e.combo} · 最高 ${e.bestCombo}`);
  text('endless-hp', `${Math.ceil(state.player.hp)} / ${stats.maxHp}`); meter('endless-hp-meter', state.player.hp / stats.maxHp);
  text('endless-tissue', `${Math.ceil(state.tissue.hp / state.tissue.maxHp * 100)}%`); meter('endless-tissue-meter', state.tissue.hp / state.tissue.maxHp);
  text('endless-pressure', state.territory ? '' : `生命复苏 ${Math.min(5, e.clearedWaves)} / 5 · 组织归零即失守`);
  text('endless-critical', state.territory ? '' : state.tissue.hp < 30 ? '组织危急 · 用 3 瞄准十字组织抢修' : '第5波完成首段救援，可继续无尽');
  text('endless-level', `战斗进化 Lv.${state.endlessGrowth?.level ?? 0}`);
  const equipped = ENDLESS_UPGRADE_IDS.filter(id => (state.endlessGrowth?.ranks[id] ?? 0) > 0);
  text('endless-ability-0', `${stats.shotRays}束射击 · 贯穿${stats.pierceCount} · 火力×${number(stats.damageMultiplier, 2)}`);
  text('endless-ability-1', equipped.map(id => `${ENDLESS_UPGRADES[id].title}${state.endlessGrowth!.ranks[id]}阶`).join(' · ') || '清波后获得第一次强化');
  text('endless-ability-2', stats.dashDamage ? '已解锁冲刺挥斩' : '移动、射击，保持与敌群的距离');
  text('endless-ability-3', activeGuardBeacons(state).length ? state.territory ? '免疫军团正在驻防领地' : '军团正在驻防组织' : '协议与完整数值可查看配装详情');
  const latest = state.endlessGrowth?.lastChoice;
  text('endless-latest', latest ? `最近获得 · ${latest.title}` : '首波三选一：扇射、扩大爆破或冲刺挥斩');
  const latestNode = document.getElementById('endless-latest'); if (latestNode) latestNode.title = latest?.description ?? '';
  const dx = state.tissue.x - state.player.x, dy = state.tissue.y - state.player.y;
  const guards = activeGuardBeacons(state), guardIds = new Set(guards.map(beacon => beacon.id));
  const guardCount = state.growth?.cells?.filter(cell => guardIds.has(cell.beaconId) && cell.until > state.elapsed && (cell.hp ?? 1) > 0).length ?? 0;
  const guard = guards.length ? `细胞驻防 ${guardCount}只 · ${guards.some(beacon => !Number.isFinite(beacon.until)) ? '持续驻防，可被击杀' : `${number(Math.max(...guards.map(beacon => beacon.until)) - state.elapsed)}s`}；` : '';
  text('endless-tissue-route', healingPointInteractionHint(state) ?? (guard + (Math.hypot(dx, dy) < 100 ? '已在组织附近 · 3 瞄准十字节点抢修' : `组织在${dy < -60 ? '北' : dy > 60 ? '南' : ''}${dx < -60 ? '西' : dx > 60 ? '东' : ''}侧 · ${Math.round(Math.hypot(dx, dy))}m`)));
  if (state.territory) text('endless-tissue-route', '＋ 生命泉可治疗 · ◇ 前线需先恢复同线生命泉 · □ 感染源');
  drawMap(state);
}

function modal(content: string, label: string, extra = ''): string {
  return `<div class="overlay endless-overlay"><section class="modal endless-modal ${extra}" role="dialog" aria-modal="true" aria-label="${escape(label)}">${content}</section></div>`;
}
function effects(low: boolean): string { return `<button data-action="effects">特效：${low ? '低' : '标准'}</button>`; }
function buildSummary(state: GameState): string {
  const stats = statsFor(state), growth = state.endlessGrowth;
  return `<div class="endless-build-summary"><h3>本局战斗进化 · Lv.${growth?.level ?? 0}</h3><p>${ENDLESS_UPGRADE_IDS.filter(id => growth?.ranks[id]).map(id => `${ENDLESS_UPGRADES[id].title} ${growth!.ranks[id]}阶`).join(' · ') || '尚未获得战斗进化'}</p>
    <dl><dt>粒子净化</dt><dd>${stats.shotRays}弹 × ${number(BALANCE.damage[1] * stats.damageMultiplier)}伤害 · 每弹额外贯穿${stats.pierceCount}体 · 间隔${number(stats.primaryCooldown, 3)}s</dd>
    <dt>净化能量炮</dt><dd>爆炸半径${number(stats.areaRadius)} · ${number(80 * stats.damageMultiplier * stats.areaDamageMultiplier)}伤害 · 射程420 · 冷却${number(stats.areaCooldown, 2)}s${stats.catalysisDamage > 0 ? `；${catalysisToolCopy(stats)?.detail}` : ''}</dd>
    <dt>冲刺 / Q爆发</dt><dd>${number(stats.dashDamage * stats.damageMultiplier)} / ${number(stats.scanDamage * stats.damageMultiplier)}伤害（0表示未解锁）</dd>
    <dt>蓄能净化斩</dt><dd>开局可用 · 3道 / 满蓄5道 · ${number((45 + (growth?.ranks.dash ?? 0) * 15) * stats.damageMultiplier)}—${number((80 + (growth?.ranks.dash ?? 0) * 15) * stats.damageMultiplier)}伤害 · 满蓄1.25s · 独立冷却6s</dd>
    <dt>免疫与耐久</dt><dd>细胞伤害×${number(stats.cellDamageMultiplier * stats.damageMultiplier, 2)} · 军团持续存在，可被击杀 · 最多2团 · 小队冷却×${number(stats.cellCooldownMultiplier, 2)} · Q ${number(stats.scanCooldown, 2)}s · 最大耐久${stats.maxHp}</dd>${state.territory ? '<dt>修复 / 净化</dt><dd>靠近按3净化感染节点；无可净化节点时修复附近心核。保持当前武器。生命泉提供治疗，前线不治疗。</dd>' : ''}</dl>
    ${growth?.lastChoice ? `<p class="endless-latest">最近获得 · ${escape(growth.lastChoice.title)}：${escape(growth.lastChoice.description)}</p>` : ''}
    ${openingEvolutionDetailText(state) ? `<p class="endless-opening-observation"><strong>首阶段进化观察：</strong>${escape(openingEvolutionDetailText(state))}</p>` : ''}</div>`;
}

export function endlessMenuEntry(record?: EndlessRecordView): string {
  const data = dataOf(record);
  if (data?.mode === 'territory') return `<div class="endless-menu-entry"><button class="primary" data-action="endless-start">开始救援　↗</button><p>净化并守住节点，按Q在脚下驻防；军团接防解膜后拆源，继续迎战母巢。${data.runs ? `<br>已救援 ${data.rescues} 次 · 最高 ${data.bestScore} 分` : ''}</p>${territoryLegacyMarkup(record && 'data' in record ? record as TerritoryProfileSnapshot : undefined)}${statusMarkup(record)}</div>`;
  return `<div class="endless-menu-entry"><button class="primary" data-action="endless-start">开始挑战　↗</button><p>顶住压力，进化后收割，让心脏重获生机。每波三选一，每5波精英与协议联动重配；首5波完成一段救援，可继续无尽。${data?.runs ? `<br>最高通关 ${data.bestWave} 波 · 最高分 ${data.bestScore} · 最高连击 ${data.bestCombo}` : '<br>从第 1 波起步，打造这一局的抗体构筑。'}</p>${statusMarkup(record)}</div>`;
}

/** Help wins over a pending mechanical choice; returning from help restores that choice. */
export function endlessOverlay(state: GameState, help: boolean, lowEffects: boolean, record?: EndlessRecordView, touch = false): string | null {
  if (!state.endless) return null;
  const e = state.endless;
  if (help && state.territory) return modal(`<div class="eyebrow">LIVING TERRITORY / 心脏救援</div><h2>净化领地，守住生命。</h2>${territoryHelpMarkup(touch)}<div class="help-grid"><div><kbd>WASD</kbd>移动</div><div><kbd>鼠标 / 左键</kbd>手动瞄准与攻击</div><div><kbd>1 / 2</kbd>粒子净化 / 能量炮</div><div><kbd>3</kbd>附近净化 / 无目标时修复心核</div><div><kbd>Space</kbd>点按冲刺 / 长按剑气</div><div><kbd>Q</kbd>立即脚下驻防；满两支时调最近团</div><div><kbd>E</kbd>靠近弹射器，按住选落点，松手起飞</div></div>${buildSummary(state)}<div class="actions"><button class="primary" data-action="close-help">返回救援</button>${effects(lowEffects)}</div>`, '心脏救援操作指南', 'endless-help');
  if (help) return modal(`<div class="eyebrow">ENDLESS / 连续挑战手册</div><h2>越打越强，选择你的清场方式。</h2><div class="endless-help-scroll">
    <p>移动射击，清群进化，让心脏重获生机。首5波完成一段救援，随后可继续无尽。在大地图自由移动，用右下导航找回＋组织与◇阀门。敌群从周围分批来袭，清完活体、待入场敌人和待分裂小体才算清波；没有等倒计时自动胜利。</p>
    <div class="help-grid"><div><kbd>WASD</kbd>移动</div><div><kbd>鼠标</kbd>手动瞄准 · 1 / 2按住连发</div><div><kbd>1</kbd>粒子净化 · 高速真实弹丸</div><div><kbd>2</kbd>净化能量炮 · 碰撞范围爆炸</div><div><kbd>3</kbd>瞄准＋组织抢修，也能恢复少量耐久</div><div><kbd>Q</kbd>扫描显形 · 召集或指挥免疫小队</div><div><kbd>Space</kbd>点按冲刺 · 长按蓄能，松开发射剑气</div><div><kbd>E</kbd>靠近◇阀门，朝鼠标发动冲流</div></div>
    <p><strong>粒子穿群，能量净化。</strong>1发射速度1800、射程530的真实弹丸；扇射增加实际弹数，贯穿增加命中数量，同一弹丸不会重复伤害同一目标。2发射射程420的净化能量炮，遇首个病毒、弹囊或障碍立即爆炸，无碰撞则在落点爆炸；基础爆炸半径96、伤害80、冷却2秒。瞄准敌群按住左键可按冷却连发，新星提高范围和伤害。墙后的目标不受爆炸伤害。</p>
    <p><strong>冲刺与蓄能剑气。</strong>按下Space立即冲刺，普通冲刺冷却1.5秒；持续按住超过0.25秒进入蓄力，按下后1.25秒满蓄。蓄力期间移动降至70%、暂停工具开火，方向跟随鼠标；松开发出3道剑气，满蓄发出5道，射程650、遇墙消散，每次释放对同一敌人最多伤害一次。基础伤害45至80，每级冲刺斩额外增加15，再乘本局伤害倍率。剑气独立冷却6秒，从释放开始；取消不耗剑气冷却，已发生的冲刺不退款。暂停、详情、换工具或失焦会取消，恢复后需重新按下。冲刺斩Ⅰ保留落点近身挥斩，Ⅲ回旋、Ⅵ追加回斩。</p>
    <p><strong>病毒的离体攻击。</strong>第5波精英首次携带弹囊；第6波起压力分队可向组织释放，第15波后出现途中分叉的母囊。携带者施法或死亡只消费同一份库存；杀宿主不会消除已经离体的弹囊。预警后沿锁定方向飞行，可用1射落、2爆破、挥斩或真实细胞接触拦截；也可侧移、借墙。先击落母囊可阻止分叉。弹囊击落不提供病毒击杀分或经验，收割波不新增携带者。</p>
    <p><strong>病毒也会进化。</strong>前两波观察你的实际伤害，第3波出现一次晶壳或裂殖；第3、4、5波分别混入6、8、8只普通特化体，第5波精英继承同一进化。以弹丸为主时更易见到晶壳，以炮弹或剑气等范围攻击为主时出现裂殖；混合打法或观测不足也会出现一种变异。晶壳挡住正面弹丸，可用炮弹、剑气、绕后或冲流反制；裂殖母体死亡后分出2只22血小体，不能继续分裂。第6—9波延续这次分支，潜伏留到后续阶段。</p>
    <p><strong>顶住压力，再进化收割。</strong>每5波为一轮：第1、3波是压力关，第2、4波是更密集但单体更脆的收割关，第5波迎战精英。新一轮敌体更强，上一轮取得的成长仍然保留；数量、血量和波次节奏固定，特化方向根据前两波的实际打法确定。</p>
    <p><strong>远侧增援源 · 可选截断路线。</strong>第6、11、16……波会预告地图上的□增援源，最多关联6体有限普通增援。你可以先处理近敌或抢修，再外出提前拆源；基础工具与实际细胞咬击都可清除，尚未出生的关联普通体才会被截断，已出生敌体与裂殖小体仍要处理。截断的增援不计击杀分或连击；保留敌群可争取真实击杀分，整波进化照常获得。配额用完后源会枯竭，不必再跑过去补刀，也不会额外发放击杀或经验。</p>
    <p><strong>压力波要保护组织。</strong>第6波起，压力波中有2只普通体以＋组织为目标，小地图用橙色▲指出它们。它们占原来的有限普通槽，不会因为你外出而消失；仍可射杀、用2爆破或用细胞拦截。收割波不新增这类分队。免疫军团达到${IMMUNE_GUARD_BALANCE.minimumRank}阶且装备免疫灯塔后，在${IMMUNE_GUARD_BALANCE.commandRange}范围内Q瞄准＋组织可驻防：细胞实际行走到组织周围${IMMUNE_GUARD_BALANCE.radius}范围，优先吞噬组织袭击者，你可以外出处理□源。它们会持续驻防，具有生命值，可被病毒击杀；再次Q指敌或空地可转回进攻。</p>
    <p><strong>治疗点争夺。</strong>地图新增两处＋治疗点。病毒靠近约12秒可占领，围攻会加快感染；占满前靠近150范围内，用3瞄准治疗点点击即可免费清除感染并恢复25耐久，设施冷却4秒。完全占领后用3夺回，本次不回血，4秒后可以正常治疗；原有十字组织仍用于器官抢修。</p><p><strong>每次清波三选一。</strong>每波一次战斗强化，每5波再选一次协议，选择全程暂停。首份固定提供扇形抗体Ⅰ、裂解新星Ⅱ、冲刺斩Ⅰ。战斗进化会立即改变真实攻击：更多弹丸、贯穿、扩大爆炸、冲刺斩、Q爆发、免疫军团、耐久与射速；选项会写明本次前后数值。每5波精英突破时，所选成长最多连升两阶，受路线阶数上限限制。战斗进化可持续获得，已达到机制上限的项目会退出选池，数值成长仍会继续。协议与这些强化同时生效；连续挑战不使用经验草案。</p>
    <p><strong>净化余震 · 追加清场。</strong>第6次成长起，已有新星Ⅰ可抽到。主爆炸保持完整伤害，0.35秒后原爆心追加一次75%半径、40%伤害的余震；余震不递归产生余震或协议攻击。旧升级记录继续沿用。</p>
    <p><strong>Q 不只是扫描。</strong>Q 就绪时，准星对准敌体可下达短时围猎指令，小队从原位短时加速集结；指空地则区域部署。细胞会实际移动并吞噬，必须赶到接触范围才咬击；指定目标结束后恢复自动选敌。小队仍在且召集冷却中时，Q 就绪后再按 Q 改指挥点；不重置咬击冷却、不额外耗组织。最多部署两个军团，细胞持续存在但可被击杀；免疫军团强化数量、伤害和召集效率。</p>
    <p><strong>读编队，换打法。</strong>正面双潮、交叉夹击、聚群猎场与侧翼点射会改变接敌方向与节奏。第16波起三名支援混用已见过的招式，第30波起四名，分批入场。轻型支援随轮次成长，无精英被动特性；精英仍有其变异。重型招式同类最多一体起手，总并发最多三体。</p>
    <p><strong>第20波起，病毒也会换代。</strong>每5波参考近期有效行动，轻度调整下一代变异倾向。提前8秒读进化预警，查看两项变异的能力、代价与基础反制。该波第一只精英兼具本代两项变异，按“主招→恢复→伴招→恢复”交替；第30波起的第二只精英仍单招。看清前摇，侧闪冲锋、离开双圈、Q打断侵蚀，利用恢复窗口清除。炮弹不会中断已经锁定的攻击；击杀施法者后仍要处理已离体弹囊。</p>
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
  if (draft) return modal(`<div class="endless-reward-progress"><strong>第 ${draft.wave} 波清场奖励</strong><span>1 / ${draft.wave % 5 === 0 ? 2 : 1} · 战斗强化</span></div><div class="eyebrow">${draft.breakthrough ? '精英突破' : '清群进化'}</div><h2>选一项，让自己更强。</h2><p>${draft.breakthrough ? '本次所选能力最多提升两阶，随后选择协议。' : '选 1 项立即生效，继续下一波。'}选择期间战场暂停。</p>
    <div class="endless-upgrade-grid">${draft.options.map(option => {
      const copy=endlessChoiceCopy(option,state.endlessGrowth!);
      return `<article class="upgrade-card"><button class="endless-upgrade choice-select" data-action="endless-upgrade" data-run="${escape(state.growth?.runId ?? '')}" data-draft="${escape(draft.id)}" data-upgrade="${escape(option.id)}">${choiceIconMarkup(option.id)}<span class="choice-kind">${option.currentRank ? `${option.currentRank}阶 → ${option.nextRank}阶` : option.id === 'catalysis' ? '工具2 · 追加余震' : ENDLESS_UPGRADES[option.id].newMechanic ? '新能力' : '能力强化'}</span><strong>${escape(option.title)}</strong><p class="choice-summary">${escape(copy.summary)}</p>${copy.change?`<p class="choice-change">${escape(copy.change)}</p>`:''}<p class="choice-action">${escape(copy.action)}</p>${copy.caution?`<p class="choice-caution">${escape(copy.caution)}</p>`:''}<b class="choice-commit">选择这项 ↗</b></button><details class="upgrade-details"><summary aria-label="${escape(option.title)}的数值与限制">查看数值与限制</summary><p>${escape(option.description)}</p></details></article>`;
    }).join('')}</div>
    <div class="actions"><button data-action="help">查看操作与构筑</button></div>`, '清波战斗进化三选一', 'endless-draft choice-overlay');
  if (!state.territory && state.phase === 'paused' && e.stageCheckpoint === 'pending' && (!e.reward || e.reward.step === 'complete')) return modal(`
    <div class="endless-stage-seal" aria-hidden="true">✚</div><div class="eyebrow">ALL THINGS ALIVE / 万物生</div><h2>第一阶段完成，生命重新生长。</h2>
    <p>五波净化，心脏重获生机。你的强化已保留，继续出发会迎接更强的敌群。</p>
    <div class="stats"><div><strong>${e.clearedWaves}</strong><small>已清波次</small></div><div><strong>${e.score}</strong><small>本局得分</small></div><div><strong>${e.bestCombo}</strong><small>最高连击</small></div></div>
    <p class="endless-stage-health">当前耐久 ${Math.ceil(state.player.hp)} / ${statsFor(state).maxHp} · 组织完整度 ${Math.ceil(state.tissue.hp)}%${state.tissue.hp < state.tissue.maxHp ? ' · 组织仍有损伤，继续时可抢修' : ''}</p>
    <p class="endless-stage-build">已获得：${ENDLESS_UPGRADE_IDS.filter(id => state.endlessGrowth?.ranks[id]).map(id => `${escape(ENDLESS_UPGRADES[id].title)} ${state.endlessGrowth!.ranks[id]}阶`).join(' · ') || '基础净化'}</p>
    <div class="actions"><button class="primary" data-action="endless-stage-continue">继续挑战 · 第6波 ↗</button><button data-action="endless-stage-finish">结束并结算</button><button data-action="growth-details">查看配装</button></div>
    <p class="endless-stage-note">战斗已暂停；继续保留本局进化，结束后保存本局战绩。</p>`, '第一阶段完成', 'endless-stage-complete');
  if (state.phase === 'paused') return modal(`<div class="eyebrow">${state.territory ? 'HEART RESCUE' : 'ENDLESS'} / 暂停</div><h2>${state.territory ? state.territory.stage === 'guard' ? '守卫已暂停。' : '救援已暂停。' : '下一波，继续变强。'}</h2><p>${state.territory ? '战斗、侵染与净化进度均已暂停。' : `模拟、危区前摇与波次计时已暂停。已清 ${e.clearedWaves} 波，当前第 ${e.wave} 波，得分 ${e.score}。`}</p>${state.territory ? `<p>${escape(territoryHudView(state)?.objective ?? '')} · 心核 ${Math.ceil(state.tissue.hp)} / ${state.tissue.maxHp}</p>` : ''}${buildSummary(state)}
    <div class="actions"><button class="primary" data-action="continue">${state.territory ? state.territory.stage === 'guard' ? '继续守卫' : '继续救援' : '继续挑战'}</button><button data-action="endless-extract">${state.territory ? state.territory.rescueSnapshot ? '结束守卫并结算' : '撤离并结算' : '主动撤离并结算'}</button><button data-action="help">操作与成长说明</button>${effects(lowEffects)}<button class="quiet" data-action="menu">返回菜单</button></div>`, state.territory ? state.territory.stage === 'guard' ? '守卫已暂停' : '救援已暂停' : '连续挑战已暂停');
  return null;
}
