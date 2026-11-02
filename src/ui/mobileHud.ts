import { BALANCE, type GameState } from '../game/types';
import { BATTLE_BALANCE, TRAITS } from '../game/battleConfig';
import { hostEventMaxHp, hostEventPresentation } from '../game/hostEvents';
import { endlessCombatStats } from '../game/endlessGrowth';
import { endlessRemaining } from './endlessHud';
import { legionView } from './legionHud';
import { touchCopy } from './touchCopy';
import { artIconMarkup } from './artIcons';
import { ANTIBODY_BALANCE } from '../game/immuneCells';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const seconds = (readyAt: number, elapsed: number) => Math.max(0, readyAt - elapsed);
const cooldownRing = '<svg class="mobile-cooldown-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" /></svg>';

/** Kept outside #hud: modals make that element inert while paused. */
export const mobileHudMarkup = `<section id="mobile-controls" aria-label="触屏操作" data-layout="moba-v3" data-active="false" data-phase="menu">
  <button type="button" id="mobile-map-button" class="mobile-map" data-action="mobile-map" aria-label="打开战况与完整地图"><canvas id="mobile-minimap" width="192" height="116" aria-hidden="true"></canvas></button>
  <div class="mobile-readouts" aria-label="战场状态"><div class="mobile-hp-line"><span>耐久</span><b id="mobile-hp">100</b></div><div class="mobile-hp-track"><i id="mobile-hp-fill"></i></div><div class="mobile-status-line"><span id="mobile-organ-readout">心脏 <b id="mobile-tissue">70%</b></span><span>感 <b id="mobile-infection">0%</b></span><span>稳 <b id="mobile-vitality">100%</b></span></div><div class="mobile-organ-track"><i id="mobile-tissue-fill"></i></div></div>
  <nav class="mobile-top-actions"><button type="button" data-action="mobile-details" aria-label="打开战况与地图">☷</button><button type="button" data-action="pause" aria-label="暂停游戏">Ⅱ</button></nav>
  <div class="mobile-objective"><span id="mobile-objective-text"></span><b id="mobile-wave"></b></div>
  <div class="mobile-warning-strip" id="mobile-warnings" role="status" aria-live="polite" hidden></div>
  <div class="mobile-notice" id="mobile-notice" role="status" aria-live="polite" hidden></div>
  <div class="mobile-stick" data-stick="move" aria-label="移动摇杆"><span class="stick-knob"></span><span class="stick-label">移动</span></div>
  <button type="button" class="mobile-stick mobile-attack" data-stick="attack" data-cooldown="attack" aria-label="净化攻击，按住并拖动瞄准"><span class="attack-glyph" aria-hidden="true"></span><span class="stick-knob"></span>${cooldownRing}<span class="mobile-cooldown" id="mobile-cast-ready"></span><span class="mobile-caption" id="mobile-cast-label">净化</span></button>
  <div class="mobile-actions">
    <button type="button" class="mobile-skill" data-touch-skill="2" data-cooldown="2" aria-label="裂解，按住瞄准，松手施放">${artIconMarkup('chain')}<span class="stick-knob"></span>${cooldownRing}<span class="mobile-cooldown" id="mobile-area-ready"></span><span class="mobile-caption">裂解</span></button>
    <button type="button" class="mobile-skill" data-touch-skill="3" data-cooldown="3" aria-label="修复，按住瞄准组织或治疗点，松手施放">${artIconMarkup('heal')}<span class="stick-knob"></span>${cooldownRing}<span class="mobile-cooldown" id="mobile-heal-ready"></span><span class="mobile-caption">修复</span></button>
    <button type="button" class="mobile-skill" data-touch-skill="scan" data-cooldown="scan" aria-label="扫描与军团指挥，按住瞄准，松手施放">${artIconMarkup('scan')}<span class="stick-knob"></span>${cooldownRing}<span class="mobile-cooldown" id="mobile-scan-ready"></span><span class="mobile-caption">免疫</span></button>
    <button type="button" class="mobile-aux" data-touch-action="dash" data-cooldown="dash" aria-label="冲刺">${artIconMarkup('dash')}${cooldownRing}<span class="mobile-cooldown" id="mobile-dash-ready"></span><span class="mobile-caption">冲刺</span></button>
    <button type="button" class="mobile-aux" data-touch-action="interact" data-cooldown="interact" aria-label="交互，靠近装置"><span class="interact-glyph" aria-hidden="true">⌁</span>${cooldownRing}<span class="mobile-cooldown" id="mobile-interact-ready"></span><span class="mobile-caption" id="mobile-interact-label">交互</span></button>
    <button type="button" class="mobile-aux" data-touch-action="antibody" data-cooldown="antibody" aria-label="注射抗体">${artIconMarkup('chain')}${cooldownRing}<span class="mobile-cooldown" id="mobile-antibody-ready"></span><span class="mobile-charge" id="mobile-antibody-charges">2</span><span class="mobile-caption">抗体</span></button>
  </div>
  <button type="button" class="mobile-cancel" data-touch-cancel aria-label="取消施法" hidden><span aria-hidden="true">×</span><span class="mobile-caption">取消</span></button>
  <button type="button" class="mobile-guide" data-touch-guide aria-label="确认并开始导流" hidden><span aria-hidden="true">✓</span><span class="mobile-caption">导流</span></button>
  <div id="mobile-skill-preview" class="mobile-skill-preview" aria-hidden="true" hidden></div>
  <p class="mobile-aim-hint" id="mobile-aim-hint" hidden></p>
  <div id="mobile-rotate-notice" role="dialog" aria-modal="true" aria-label="请横屏游玩" hidden><div><span aria-hidden="true">↻</span><h2>请横屏游玩</h2><p>战斗已暂停。横屏后点击继续，重新按下摇杆。</p></div></div>
</section>`;

export const mobileDetailsMarkup = `<div class="overlay mobile-details-overlay"><section class="modal mobile-details-dialog" role="dialog" aria-modal="true" aria-label="战况与地图"><header><div><div class="eyebrow">FIELD STATUS</div><h2>战况与地图</h2></div><button type="button" data-action="mobile-close-details">返回</button></header><p class="mobile-details-help">当前战斗已暂停。查看器官风险、军团、协议和地图。</p><div id="mobile-details-content"></div><div class="actions"><button type="button" data-action="help">操作指南</button><button type="button" data-action="history">战术记录</button><button type="button" class="primary" data-action="mobile-close-details">返回战场</button></div></section></div>`;

const detailSelectors = '.objective,.telemetry,.growth-panel,.organ-overview,.endless-wave-panel,.endless-vitals,.endless-build-panel,.endless-navigation,.host-event-card,.mother-core-panel,.evolution-card,#endless-evolution-warning';
const movedPanels: { element: HTMLElement; marker: Comment }[] = [];

/** Move actual panels, including the live map canvas; cloning would lose state. */
export function setMobileDetailsOpen(open: boolean): void {
  if (!open) {
    for (const { element, marker } of movedPanels.splice(0)) {
      if (marker.parentNode) marker.replaceWith(element);
    }
    document.body.classList.remove('mobile-details-open');
    return;
  }
  const content = document.getElementById('mobile-details-content');
  if (!content || movedPanels.length) return;
  const history = document.querySelector<HTMLButtonElement>('.mobile-details-dialog [data-action="history"]');
  if (history) history.hidden = document.body.classList.contains('endless-mode') || !document.querySelector('.battle-objective');
  const endless = document.body.classList.contains('endless-mode');
  for (const element of document.querySelectorAll<HTMLElement>(detailSelectors)) {
    if (element.closest('#mobile-details-content') || element.parentElement?.closest(detailSelectors)) continue;
    // These panels normally inherit visibility from #endless-hud/body. Moving
    // them out must not reveal the other game mode's inactive presentation.
    if (endless ? element.matches('.objective,.telemetry,.organ-overview,.mother-core-panel') : element.matches('.endless-wave-panel,.endless-vitals,.endless-build-panel,.endless-navigation')) continue;
    const marker = document.createComment('mobile-detail-panel');
    element.before(marker); movedPanels.push({ element, marker }); content.append(element);
  }
  document.body.classList.add('mobile-details-open');
}

export interface MobileHudView {
  hp: string; tissue: string; organ: string; infection: string; vitality: string;
  objective: string; notice: string; wave: string; warnings: { kind: string; text: string }[];
  interaction: { label: string; hint: string; nearby: boolean };
}

interface NoticeRecord { text: string; until: number; seenAt: number }
const notices = new WeakMap<GameState, NoticeRecord>();
const introductoryMessage = /(?:W\s*A\s*S\s*D|鼠标瞄准.*左键|^先净化两类靶标|^感染正在沿血管传播|^连续挑战开始|^连续清场成长|^(?:按\s*)?Q\s*诊断.*(?:[123].*净化|[123].*修复)|^诊断：.*(?:单核用|簇群可用|受损组织用))/i;

/** A simulation-timed toast is shown once, rather than repeating the objective. */
function activeNotice(state: GameState): string {
  const text = state.message.trim();
  let record = notices.get(state);
  if (!record || record.text !== text || state.elapsed < record.seenAt || state.elapsed >= record.until && state.messageUntil > record.until) {
    record = { text, until: state.messageUntil, seenAt: state.elapsed }; notices.set(state, record);
  } else record.until = state.messageUntil;
  if (state.phase !== 'playing' || !text || state.messageUntil <= state.elapsed || state.elapsed - record.seenAt >= 4 || introductoryMessage.test(text)) return '';
  const firstClause = touchCopy(text).split(/[。；\n]/, 1)[0];
  const characters = Array.from(firstClause);
  return characters.length > 24 ? `${characters.slice(0, 23).join('')}…` : firstClause;
}

function shortObjective(state: GameState): string {
  if (state.endless) return state.endless.phase === 'warning' ? '敌群来袭' : state.endless.phase === 'intermission' ? '整理构筑' : state.endless.eliteWave ? '净化精英' : '净化本波敌群';
  const campaign = state.campaign;
  if (campaign) {
    if (state.battle?.readyToRetest) return '完成最终复测';
    const objectives = { contain: '净化感染源', 'first-counter': '击败变异精英', migration: campaign.migration.status === 'pursuing' ? '拦截迁移体' : campaign.migration.status === 'blocking' ? '守住隔离闸' : campaign.migration.status === 'warning' ? '选择迁移应对' : '前往肺部', 'organ-crisis': '清除危机源', counterattack: campaign.progress.eliteClears < 2 ? '击败变异精英' : '清除剩余感染源', 'core-ready': '前往复测台', core: '净化母巢', retest: '修复并完成复测' } as const;
    return objectives[campaign.phase];
  }
  if (state.battle) return state.battle.readyToRetest ? '前往复测台' : state.battle.stats.sourceClears < 2 ? `净化源 ${state.battle.stats.sourceClears}/2` : state.battle.stats.eliteClears < 2 ? `变异精英 ${state.battle.stats.eliteClears}/2` : state.tissue.hp < 50 ? '抢修组织至50%' : '压低感染负荷';
  return state.targets.some(target => target.hp > 0) ? '净化训练靶' : state.tissue.hp < state.tissue.maxHp ? '修复组织至100%' : '前往复测终端';
}

/** Read-only presentation. It never decides targets or commits game actions. */
export function mobileHudView(state: GameState): MobileHudView {
  const warnings: MobileHudView['warnings'] = [];
  if (state.battle) {
    const pressure = state.battle.pressure;
    if (pressure.criticalSince !== null) warnings.push({ kind: 'fatal', text: `失控 ${Math.max(0, BATTLE_BALANCE.crisisDuration - (state.elapsed - pressure.criticalSince)).toFixed(1)}s` });
    else if (pressure.organAlarm) warnings.push({ kind: 'organ', text: `${state.battle.organId === 'heart' ? '心脏' : '肺部'}濒危 ${Math.ceil(state.tissue.hp)}%` });
    const warning = state.battle.warning;
    if (warning) warnings.push({ kind: 'mutation', text: `${TRAITS[warning.trait].name} ${Math.max(0, warning.applyAt - state.elapsed).toFixed(1)}s` });
  }
  const pending = state.endless?.evolution?.pending;
  if (pending) warnings.push({ kind: 'mutation', text: `${pending.decision.generation}代 ${pending.decision.traits.map(trait => TRAITS[trait].name).join('/')} ${Math.max(0, pending.appliesAt - state.elapsed).toFixed(1)}s` });
  const crisis = state.campaign?.encounters?.crisis;
  if (crisis && ['arming', 'charging', 'exhausted'].includes(crisis.status)) {
    const organ = crisis.organId === 'heart' ? '心脏' : '肺部';
    const text = crisis.status === 'arming' ? `${organ}危机预警` : crisis.status === 'exhausted' ? `${organ}危机源待清` : crisis.organId !== state.battle?.organId ? `${organ}冲击暂停` : crisis.blockedByAirway ? `${organ}截流暂停` : crisis.nextImpactAt === null ? `${organ}充能暂停` : `${organ}冲击 ${Math.ceil(Math.max(0, crisis.chargeRemaining))}s`;
    warnings.push({ kind: 'organ', text });
  }
  const migration = state.campaign?.migration;
  if (migration && ['warning', 'blocking', 'pursuing'].includes(migration.status)) {
    const until = migration.status === 'pursuing' ? migration.interceptUntil ?? state.elapsed : migration.deadline;
    warnings.push({ kind: 'migration', text: `${migration.status === 'pursuing' ? '拦截' : '迁移'} ${Math.max(0, until - state.elapsed).toFixed(1)}s` });
  }
  const core = state.campaign?.core;
  if (core?.status === 'active') {
    const combat = core.combat, target = state.targets.find(candidate => candidate.id === core.actorId);
    const phase = combat ? ({ awakening: '苏醒', windup: '蓄力', recovery: '破绽', defeated: '净化' } as const)[combat.phase] : '作战';
    const remaining = combat?.attack ? `${Math.max(0, combat.attack.resolveAt - state.elapsed).toFixed(1)}s` : '';
    warnings.push({ kind: 'core', text: `巢${target ? `${Math.ceil(target.hp / target.maxHp * 100)}% ` : ''}${phase}${remaining}${combat?.membrane.remaining ? ` 膜${combat.membrane.remaining}` : ''}` });
  }
  const host = hostEventPresentation(state);
  if (host && state.hostEvents?.active) {
    const name = ({ MEDICATION: '药剂', REST: '休息', SLEEPLESS: '熬夜', SMOKE: '烟雾', ALCOHOL: '饮酒', EXERCISE: '运动' } as const)[state.hostEvents.active.id];
    warnings.push({ kind: host.category === 'red' ? 'fatal' : 'host', text: `${name}${host.phase === 'warning' ? '警' : '中'} ${host.remaining.toFixed(1)}s${host.targetTotal ? ` ${host.targetCount}/${host.targetTotal}` : ''}` });
  }
  if (state.campaign) {
    for (const arena of Object.values(state.campaign.arenas)) {
      if (arena.activated && arena.organId !== state.campaign.activeOrganId && arena.tissue.hp < 50) warnings.push({ kind: 'organ', text: `${arena.organId === 'heart' ? '心脏' : '肺部'}回救 ${Math.ceil(arena.tissue.hp)}%` });
    }
  }
  const nearby = state.battle?.graph.nodes.filter(node => (state.endless ? node.kind === 'valve' : ['valve', 'gate', 'retest', 'research', 'exit'].includes(node.kind)) && Math.hypot(node.x - state.player.x, node.y - state.player.y) <= BALANCE.interactionRange)
    .sort((first, second) => Math.hypot(first.x - state.player.x, first.y - state.player.y) - Math.hypot(second.x - state.player.x, second.y - state.player.y))[0];
  const interaction = nearby ? { label: ({ valve: '冲流', gate: '闸门', retest: '复测', research: '研究', exit: '出口' } as Record<string, string>)[nearby.kind], hint: nearby.active ? '可用' : '条件', nearby: true }
    : { label: '交互', hint: '靠近', nearby: false };
  if (!state.battle && Math.hypot(state.terminal.x - state.player.x, state.terminal.y - state.player.y) <= BALANCE.interactionRange) Object.assign(interaction, { label: '复测', hint: '可用', nearby: true });
  if (nearby?.id === 'airway') interaction.label = state.campaign?.arenas.lung.flow?.airwayOpen ? '关气道' : '开气道';
  return { hp: `${Math.ceil(state.player.hp)}/${hostEventMaxHp(state)}`, tissue: `${Math.ceil(state.tissue.hp / state.tissue.maxHp * 100)}%`,
    organ: state.battle?.organId === 'lung' ? '肺部' : '心脏', infection: state.battle ? `${Math.ceil(state.battle.pressure.infection)}%` : '—', vitality: state.battle ? `${Math.ceil(state.battle.pressure.vitality)}%` : '—',
    objective: shortObjective(state), notice: activeNotice(state), wave: state.endless ? `第${state.endless.wave}波 · 剩余${endlessRemaining(state)}` : '', warnings: warnings.map(warning => ({ ...warning, text: touchCopy(warning.text) })), interaction };
}

export interface MobileHudFlags { blocked?: boolean; portrait?: boolean }

export type MobileCooldownKey = 'attack' | '2' | '3' | 'scan' | 'dash' | 'interact' | 'antibody';
export interface MobileCooldown { remaining: number; ratio: number; label: string }
const cooldownState = (readyAt: number, elapsed: number, duration: number): MobileCooldown => {
  const remaining = seconds(readyAt, elapsed);
  return { remaining, ratio: Math.max(0, Math.min(1, remaining / Math.max(.001, duration))), label: remaining > 0 ? remaining >= 10 ? String(Math.ceil(remaining)) : remaining.toFixed(1) : '' };
};

/** Remaining fractions drive the radial masks; zero is fully ready. */
export function mobileCooldownViews(state: GameState): Record<MobileCooldownKey, MobileCooldown> {
  const combat = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth) : undefined;
  const boostUntil = Math.max(0, ...(state.growth?.cells ?? []).filter(cell => cell.until > state.elapsed && (cell.hp ?? 1) > 0).map(cell => cell.antibodyUntil ?? 0));
  return {
    attack: cooldownState(state.cooldowns[1], state.elapsed, combat?.primaryCooldown ?? BALANCE.cooldowns[1]),
    2: cooldownState(state.cooldowns[2], state.elapsed, combat?.areaCooldown ?? BALANCE.cooldowns[2]),
    3: cooldownState(state.cooldowns[3], state.elapsed, BALANCE.cooldowns[3]),
    scan: cooldownState(state.scanReady, state.elapsed, combat?.scanCooldown ?? BALANCE.scanCooldown),
    dash: cooldownState(state.player.dashReady, state.elapsed, BALANCE.dashCooldown),
    interact: cooldownState(0, state.elapsed, 1),
    antibody: cooldownState(boostUntil, state.elapsed, ANTIBODY_BALANCE.duration),
  };
}

/** Copy the real tactical map after its update; no alternate map model exists. */
export function copyMobileMinimap(state: GameState): void {
  const target = document.getElementById('mobile-minimap') as HTMLCanvasElement | null;
  const source = document.getElementById(state.endless ? 'endless-minimap' : 'tactical-map') as HTMLCanvasElement | null;
  const button = document.getElementById('mobile-map-button');
  if (button) button.hidden = !source;
  if (!target || !source || typeof target.getContext !== 'function' || !(source.width > 0 && source.height > 0)) return;
  const context = target.getContext('2d');
  if (!context) return;
  try {
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(source, 0, 0, target.width, target.height);
  } catch { /* A transient unavailable map must not interrupt combat. */ }
}

export function updateMobileHud(state: GameState, flags: MobileHudFlags = {}): void {
  const root = document.getElementById('mobile-controls');
  if (!root) return;
  const view = mobileHudView(state), active = state.phase === 'playing' && !flags.blocked && !flags.portrait;
  root.dataset.phase = state.phase; root.dataset.active = String(active);
  const set = (id: string, value: string) => { const element = document.getElementById(id); if (element && element.textContent !== value) element.textContent = value; };
  set('mobile-hp', view.hp); set('mobile-tissue', view.tissue); set('mobile-infection', view.infection); set('mobile-vitality', view.vitality);
  const hpFill = document.getElementById('mobile-hp-fill'), tissueFill = document.getElementById('mobile-tissue-fill');
  if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, state.player.hp / hostEventMaxHp(state) * 100))}%`;
  if (tissueFill) tissueFill.style.width = `${Math.max(0, Math.min(100, state.tissue.hp / state.tissue.maxHp * 100))}%`;
  const organ = document.getElementById('mobile-organ-readout');
  if (organ?.firstChild) organ.firstChild.textContent = `${view.organ} `;
  set('mobile-objective-text', view.objective); set('mobile-wave', view.wave);
  const notice = document.getElementById('mobile-notice');
  if (notice) { if (notice.textContent !== view.notice) notice.textContent = view.notice; notice.hidden = !view.notice; }
  const strip = document.getElementById('mobile-warnings');
  if (strip) { const content = view.warnings.map(warning => `<span class="mobile-warning" data-kind="${warning.kind}">${escape(warning.text)}</span>`).join(''); if (strip.innerHTML !== content) strip.innerHTML = content; strip.hidden = !view.warnings.length; }
  set('mobile-interact-label', view.interaction.label);
  const legion = legionView(state);
  set('mobile-antibody-charges', String(legion.charges)); set('mobile-cast-label', '净化');
  const cooldowns = mobileCooldownViews(state);
  const cooldownIds: Record<MobileCooldownKey, string> = { attack: 'mobile-cast-ready', 2: 'mobile-area-ready', 3: 'mobile-heal-ready', scan: 'mobile-scan-ready', dash: 'mobile-dash-ready', interact: 'mobile-interact-ready', antibody: 'mobile-antibody-ready' };
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-cooldown]')) {
    const key = button.dataset.cooldown as MobileCooldownKey, status = cooldowns[key];
    if (!status) continue;
    button.style.setProperty('--cooldown', String(status.ratio));
    button.dataset.cooling = String(status.remaining > 0);
    set(cooldownIds[key], status.label);
    const available = key === 'attack' || (key === 'antibody' ? legion.enabled : key === 'interact' ? view.interaction.nearby : status.remaining <= 0);
    // A committed guided skill still owns its finger through cooldown. Only a
    // global input gate may disable it before that real pointer is released.
    button.disabled = !active || button.dataset.active !== 'true' && !available;
    button.dataset.ready = String(available && status.remaining <= 0);
    if (key === 'interact') button.setAttribute('aria-label', `${view.interaction.label}，${view.interaction.hint}`);
  }
  copyMobileMinimap(state);
  const rotate = document.getElementById('mobile-rotate-notice');
  if (rotate) rotate.hidden = !flags.portrait || !['playing', 'paused'].includes(state.phase);
}
