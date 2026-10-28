import './style.css';
import { GameSession } from './game/session';
import { FixedClock } from './core/clock';
import { MotionInterpolation } from './render/motionInterpolation';
import { Controller, BINDINGS } from './input/controller';
import { Renderer } from './render/renderer';
import { BALANCE, type Tool } from './game/types';
import { Soundscape } from './audio';
import { battleHudMarkup, battleOverlay, updateBattleHud } from './ui/battleHud';
import type { TraitId } from './game/battleTypes';
import type { ProtocolId, ResearchDirectionId } from './game/growthTypes';
import { draftOverlay, researchDirectionOverlay, growthHudMarkup, updateGrowthHud, growthHelpMarkup, growthHistoryMarkup, growthDetailsEntryMarkup, growthDetailsOverlay } from './ui/growthHud';
import './ui/research.css';
import { ProfileStore } from './meta/profile';
import type { RunEncounterRecord } from './meta/profile';
import { newRunOptions, replayRunOptions } from './meta/runOptions';
import { profileOverlay, profileMenuMarkup, profileResultMarkup } from './ui/profileHud';
import './ui/profile.css';
import { encounterHudMarkup, updateEncounterHud, encounterHelpMarkup } from './ui/encounterHud';
import './ui/encounter.css';
import { startingPlanOverlay } from './ui/startingPlanHud';
import './ui/startingPlan.css';
import { preparationForPlan, type StartingPlanId } from './game/preparation';
import { readVisibleHudRects } from './ui/hudLayout';
import { endlessHudMarkup, updateEndlessHud, endlessOverlay, endlessMenuEntry } from './ui/endlessHud';
import { EndlessProfileStore } from './meta/endlessProfile';
import { endlessCombatStats } from './game/endlessGrowth';
import type { EndlessUpgradeId } from './game/endlessGrowthTypes';
import './ui/endless.css';
import './ui/artTheme.css';
import { artIconMarkup, installArtIcons } from './ui/artIcons';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const app = document.querySelector<HTMLDivElement>('#app')!;
installArtIcons(document);
const params = new URL(location.href).searchParams;
const seedText = params.get('seed');
const seedParam = seedText !== null && seedText.trim() !== '' ? Number(seedText) : NaN;
const initialSeed = Number.isInteger(seedParam) && seedParam >= 0 && seedParam <= 0xffffffff ? seedParam : 130026;
// The old slice is an explicit regression fixture; the player enters the campaign.
const trainingFixture = params.get('scenario') === 'training';
const firstTrait = ['CARAPACE', 'FISSION', 'MIMIC'].includes(params.get('trait') ?? '') ? params.get('trait') as TraitId : undefined;
const milestone = params.get('fixture') === 'G1' ? 'G1' : params.get('fixture') === 'G2' ? 'G2' : 'G3';
const profile = new ProfileStore();
const endlessProfile = new EndlessProfileStore();
const session = new GameSession(initialSeed, { campaign: !trainingFixture, ...newRunOptions(profile.data, firstTrait), milestone });
const clock = new FixedClock();
const motion = new MotionInterpolation();
const renderer = new Renderer(canvas);
let presentedState = session.state;
app.inert = true;
app.setAttribute('aria-busy', 'true');
const sound = new Soundscape();
sound.enabled = profile.data.settings.sound;
let lowEffects = profile.data.settings.lowEffects;
let help = false;
let resumeAfterHelp = false;
let overlayKey = '';
let history = false;
let resumeAfterHistory = false;
let growthDetails = false;
let resumeAfterGrowthDetails = false;
let growthDetailsReturnSelector = '.growth-panel [data-action="growth-details"]';
let growthDetailsReturnLabel = '返回战场';
let resetClockAfterStep = false;
let profileOpen = false;
let startingPlanOpen = false;
let startingPlanSelection = profile.data.startingPlan;
let resumeAfterProfile = false;
let runId = '';
let migrationGuide = false;
let migrationGuidePending = false;
let migrationGuideSeen = profile.data.onboarding.migrationGuideAcknowledged;

app.innerHTML = `
  <header class="topbar"><div class="brand"><div class="brand-icon">+</div><div><strong>Viral Invasion</strong><small>病毒入侵 · 微观幻想</small></div></div><nav class="top-actions"><span class="status-chip">HEART / 01</span><button class="small" data-action="sound" aria-label="声音开关">声音 开</button><button class="small" data-action="help">操作指南</button><button class="small" data-action="pause">暂停 <kbd>Esc</kbd></button></nav></header>
  <main class="hud" id="hud">
    <section class="objective"><div class="eyebrow">TRAINING / 心脏训练场</div><h2 id="objective-title">建立你的第一道防线</h2><ol><li id="step-targets"><span>1</span><span>净化两类靶标 <b id="target-count">0 / 4</b></span></li><li id="step-tissue"><span>2</span><span>修复组织至完整</span></li><li id="step-terminal"><span>3</span><span>靠近复测终端，按 E</span></li></ol></section>
    <aside class="telemetry"><div class="readout"><label>战士耐久 <b id="hp-label">100 / 100</b></label><div class="meter"><i id="hp-meter"></i></div><p>训练靶不会攻击 · 自由练习</p></div><div class="readout"><label>心脏组织 <b id="tissue-label">25%</b></label><div class="meter"><i id="tissue-meter"></i></div><p>使用 3 修复组织节点<br>净化工具不能修复组织</p></div></aside>
    <div class="message" id="message">WASD 移动 · 点击靶标底部的瞄准环</div>
    <div class="dock-wrap"><div class="ability"><div class="ability-key">${artIconMarkup('dash')}<kbd>Space</kbd></div><span class="ability-name">冲刺</span><em id="dash-ready">就绪</em></div><div class="tool-dock">${([[1,'精确净化','单点 · 快速冷却'],[2,'牵引裂解','聚拢 · 延迟爆发'],[3,'组织修复','治疗 · +25 完整度']] as const).map(([id,title,subtitle])=>`<button class="tool" data-action="tool-${id}" aria-label="${id} ${title}"><kbd>${id}</kbd><strong>${id===3?artIconMarkup('heal'):''}${title}</strong><small>${subtitle}</small><i class="charge" id="charge-${id}"></i></button>`).join('')}</div><div class="ability"><div class="ability-key">${artIconMarkup('scan')}<kbd>Q</kbd></div><span class="ability-name">扫描</span><em id="scan-ready">就绪</em></div></div>
    <div class="micro-footer">G0 · 基础训练 / 架空生物幻想</div><div class="run-time" id="run-time"></div>
  </main><div id="overlay-host"></div>`;
if (!trainingFixture) {
  app.classList.add('campaign');
  canvas.setAttribute('aria-label', '病毒入侵战场：WASD移动，鼠标瞄准，1精准净化，2范围控场，3抢修，Q召集免疫细胞，E交互');
  document.querySelector('.objective')!.remove();
  document.querySelector('.telemetry')!.remove();
  document.querySelector('#hud')!.insertAdjacentHTML('afterbegin', battleHudMarkup);
  document.querySelector('.battle-objective')!.insertAdjacentHTML('beforeend', encounterHudMarkup);
  if (session.state.growth) document.querySelector('#hud')!.insertAdjacentHTML('beforeend', growthHudMarkup);
  document.querySelector('#hud')!.insertAdjacentHTML('beforeend', endlessHudMarkup());
  if (session.state.campaign) document.querySelector('.tool[data-action="tool-2"] small')!.textContent = '聚拢 · 延迟爆发';
  document.querySelector('.micro-footer')!.textContent = `${milestone === 'G3' ? 'G4' : milestone} · ${milestone === 'G3' ? '器官联防' : '心脏防线'} / 架空生物幻想`;
  document.querySelector('.dock-wrap .ability:last-child .ability-name')!.textContent = '扫描 / 召集';
}
const input = new Controller(canvas, () => togglePause(), () => {
  if (session.state.phase === 'playing') session.pause();
  clock.reset();
}, () => session.state.phase === 'playing' && !help && !history && !growthDetails && !profileOpen && !migrationGuide);
session.bus.on('event', event => {
  if (event.type === 'INPUT_RESET_REQUESTED') { input.clear(); resetClockAfterStep = true; }
  if (event.type === 'RUN_ENDED' && session.state.campaign && runId) profile.recordRun(session.state, runId);
  if (event.type === 'RUN_ENDED' && session.state.endless && runId) endlessProfile.recordRun(session.state, runId);
  if (event.type === 'MIGRATION_WARNING' && !migrationGuideSeen) migrationGuidePending = true;
  if (event.type === 'COUNTER_GUIDE_COMPLETED') profile.acknowledgeCounterGuide('completed');
  if (event.type === 'COUNTER_GUIDE_SKIPPED') profile.acknowledgeCounterGuide('skipped');
});
const el = (id: string) => document.getElementById(id)!;
const formatTime = (seconds: number) => `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
function togglePause() {
  if (startingPlanOpen) { startingPlanOpen = false; input.clear(); clock.reset(); return; }
  input.clear(); clock.reset();
  if (growthDetails) { closeGrowthDetails(); return; }
  if (profileOpen) { profileOpen = false; if (resumeAfterProfile) session.resume(); resumeAfterProfile = false; return; }
  if (migrationGuide) { closeMigrationGuide(); return; }
  if (history) { history = false; if (resumeAfterHistory) session.resume(); resumeAfterHistory = false; return; }
  if (help) { help = false; if (resumeAfterHelp) session.resume(); resumeAfterHelp = false; return; }
  const research = session.state.growth?.pendingResearch;
  if (research) { session.cancelResearch({ runId: research.runId, requestId: research.id }); return; }
  if (session.state.phase === 'playing') session.pause();
  else if (session.state.phase === 'paused') session.resume();
}
function start(newSeed?: number, replay?: RunEncounterRecord | null, preserveCurrent = false, mode: 'campaign' | 'endless' = session.state.endless ? 'endless' : 'campaign') {
  input.clear(); clock.reset(); help = false; history = false; resumeAfterHelp = false; resumeAfterHistory = false;
  growthDetails = false; resumeAfterGrowthDetails = false;
  profileOpen = false; startingPlanOpen = false; migrationGuide = false; migrationGuidePending = false;
  runId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${performance.now()}:${Math.random().toString(36).slice(2)}`;
  document.body.classList.remove('crisis');
  const options = replay ? replayRunOptions(replay, firstTrait) : newRunOptions(profile.data, firstTrait);
  // Records predating preparation replay with no preloaded protocol. They must
  // not silently borrow the newly selected menu preference.
  if (replay === null) options.preparation = preparationForPlan('field');
  sound.unlock(); session.start(newSeed ?? session.state.seed, preserveCurrent ? { mode } : { ...options, mode });
  document.body.classList.toggle('endless-mode', !!session.state.endless);
}
function showHelp() {
  if (profileOpen || startingPlanOpen || migrationGuide || history || help || growthDetails) return;
  resumeAfterHelp = session.state.phase === 'playing';
  if (resumeAfterHelp) session.pause();
  input.clear(); clock.reset(); help = true;
}
function showGrowthDetails(button: HTMLButtonElement) {
  if (!session.state.growth || growthDetails || profileOpen || startingPlanOpen || migrationGuide) return;
  resumeAfterGrowthDetails = session.state.phase === 'playing';
  growthDetailsReturnSelector = button.closest('#overlay-host') ? '#overlay-host [data-action="growth-details"]' : '.growth-panel [data-action="growth-details"]';
  growthDetailsReturnLabel = help ? '返回作战手册' : history ? '返回战术记录' : session.state.growth.pendingResearch ? '返回研究方向' : session.state.growth.draft ? '返回进化草案' : resumeAfterGrowthDetails ? '返回战场' : '返回上一级';
  if (resumeAfterGrowthDetails) session.pause();
  input.clear(); clock.reset(); growthDetails = true;
  updateOverlay();
}
function closeGrowthDetails() {
  growthDetails = false;
  if (resumeAfterGrowthDetails) session.resume();
  resumeAfterGrowthDetails = false;
  input.clear(); clock.reset();
  updateOverlay();
  document.querySelector<HTMLButtonElement>(growthDetailsReturnSelector)?.focus({ preventScroll: true });
}
function closeMigrationGuide() {
  if (!migrationGuide) return;
  migrationGuide = false;
  profile.acknowledgeMigrationGuide();
  session.resume(); input.clear(); clock.reset();
}
app.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action!;
  if (action === 'starting-plan') {
    if (!['menu', 'result'].includes(session.state.phase)) return;
    startingPlanOpen = true; profileOpen = false; help = false; history = false;
    input.clear(); clock.reset(); return;
  }
  if (action === 'close-starting-plan') { startingPlanOpen = false; input.clear(); clock.reset(); return; }
  if (action === 'plan-select') {
    if (!startingPlanOpen || !['menu', 'result'].includes(session.state.phase)) return;
    if (profile.selectStartingPlan(button.dataset.plan as StartingPlanId)) { startingPlanOpen = false; startingPlanSelection = profile.data.startingPlan; }
    input.clear(); clock.reset(); return;
  }
  if (action === 'growth-details') { showGrowthDetails(button); return; }
  if (action === 'close-growth-details') { closeGrowthDetails(); return; }
  if (action === 'profile') { resumeAfterProfile = session.state.phase === 'playing'; session.pause(); profileOpen = true; input.clear(); clock.reset(); button.blur(); return; }
  if (action === 'close-profile') { profileOpen = false; if (resumeAfterProfile) session.resume(); resumeAfterProfile = false; input.clear(); clock.reset(); button.blur(); return; }
  if (action === 'replay-record') {
    const seed = Number(button.dataset.seed), data = profile.data, record = data.recentRuns.find(run => run.runId === button.dataset.runId && run.seed === seed);
    const best = data.best.fastestVictory, encounter = record?.encounter ?? (best && best.runId === button.dataset.runId && best.seed === seed ? best.encounter : undefined);
    if (Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff) start(seed, encounter ?? null, false, 'campaign');
    return;
  }
  if (action === 'skip-counter-guide') { session.skipCounterGuide(); input.clear(); clock.reset(); button.blur(); return; }
  if (action === 'research-confirm' || action === 'research-cancel') {
    const growth = session.state.growth;
    if (!growth) return;
    const intent = { runId: growth.runId, requestId: button.dataset.request! };
    if (action === 'research-confirm') session.confirmResearch({ ...intent, direction: button.dataset.direction as ResearchDirectionId });
    else session.cancelResearch(intent);
    input.clear(); clock.reset(); button.blur(); return;
  }
  if (action === 'close-migration-guide') { closeMigrationGuide(); return; }
  if (action.startsWith('migration-')) {
    session.chooseMigration(action.slice(10) as 'pursue' | 'block' | 'ignore', button.dataset.migration!);
    input.clear(); button.blur(); return;
  }
  if (action.startsWith('draft-')) {
    const growth = session.state.growth;
    if (!growth) return;
    input.clear(); clock.reset();
    if (action === 'draft-option' || action === 'draft-replace') session.chooseDraft({ runId: growth.runId, draftId: button.dataset.draft!, optionId: button.dataset.option!, ...(action === 'draft-replace' ? { slotIndex: Number(button.dataset.slot), expectedPreviousProtocolId: button.dataset.previous as ProtocolId } : {}) });
    if (action === 'draft-discard') session.discardDraft(button.dataset.draft!);
    if (action === 'draft-back') session.backToDraft(button.dataset.draft!);
    overlayKey = ''; button.blur(); return;
  }
  if (action.startsWith('tool-')) { input.select(Number(action.at(-1)) as Tool); return; }
  if (action === 'endless-start') { start(undefined, undefined, false, 'endless'); return; }
  if (action === 'endless-upgrade') {
    session.chooseCombatUpgrade(button.dataset.draft!, button.dataset.upgrade as EndlessUpgradeId, button.dataset.run!);
    input.clear(); clock.reset(); overlayKey = ''; button.blur(); return;
  }
  if (action === 'endless-extract') {
    if (session.state.endless && session.state.phase === 'paused' && !session.state.endlessGrowth?.draft && !session.state.growth?.draft) {
      session.finish(true, `主动撤离：已完成 ${session.state.endless.clearedWaves} 波，得分 ${session.state.endless.score}。`);
      input.clear(); clock.reset();
    }
    return;
  }
  if (action === 'start') start(undefined, undefined, false, 'campaign');
  if (action === 'retry') start(undefined, undefined, true);
  if (action === 'new') start((session.state.seed + 2654435761) >>> 0);
  if (action === 'pause' || action === 'continue') togglePause();
  if (action === 'menu') { input.clear(); clock.reset(); help = false; history = false; growthDetails = false; resumeAfterGrowthDetails = false; profileOpen = false; startingPlanOpen = false; migrationGuide = false; migrationGuidePending = false; session.menu(); document.body.classList.remove('crisis'); }
  if (action === 'help') showHelp();
  if (action === 'close-help') { help = false; input.clear(); clock.reset(); if (resumeAfterHelp) session.resume(); resumeAfterHelp = false; }
  if (action === 'practice-hit') { help = false; input.clear(); clock.reset(); session.resume(); input.queuePracticeHit(); resumeAfterHelp = false; }
  if (action === 'sound') { sound.unlock(); sound.toggle(); profile.updateSettings({ sound: sound.enabled }); overlayKey = ''; }
  if (action === 'effects') { lowEffects = !lowEffects; profile.updateSettings({ lowEffects }); overlayKey = ''; }
  if (action === 'history') { resumeAfterHistory = help ? resumeAfterHelp : session.state.phase === 'playing'; help = false; resumeAfterHelp = false; history = true; session.pause(); input.clear(); clock.reset(); }
  if (action === 'close-history') { history = false; if (resumeAfterHistory) session.resume(); resumeAfterHistory = false; input.clear(); clock.reset(); }
  button.blur();
});
function updateOverlay() {
  const state = session.state;
  const draft = state.growth?.draft;
  const key = `${!!state.endless}:${state.endlessGrowth?.draft?.id}:${state.phase}:${help}:${lowEffects}:${history}:${growthDetails}:${profileOpen}:${startingPlanOpen}:${startingPlanSelection}:${migrationGuide}:${draft?.id}:${draft?.status}:${draft?.selectedOptionId}:${state.growth?.pendingResearch?.id}:${state.battle?.encounter?.firstCounter.guideStatus}`;
  if (key === overlayKey) return;
  overlayKey = key;
  el('hud').hidden = state.phase === 'menu' || state.phase === 'result';
  // Keep keyboard navigation inside the visible overlay as well as mouse input.
  const modalActive = profileOpen || migrationGuide || help || history || growthDetails || state.phase !== 'playing';
  document.querySelector<HTMLElement>('.topbar')!.inert = modalActive;
  el('hud').inert = modalActive;
  const host = el('overlay-host');
  if (growthDetails) {
    host.innerHTML = growthDetailsOverlay(state, growthDetailsReturnLabel);
    host.querySelector<HTMLButtonElement>('[data-action="close-growth-details"]')?.focus({ preventScroll: true });
    return;
  }
  if (startingPlanOpen) { host.innerHTML = startingPlanOverlay(profile.data); return; }
  if (profileOpen) { host.innerHTML = profileOverlay(profile.data, profile.status); return; }
  if (migrationGuide) { host.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="首次迁移指引"><div class="eyebrow">THE NEXT CHAMBER / 首次迁移</div><h2>病毒要去另一个器官了。</h2><p>倒数已暂停。你可以去器官出口（见小地图）按 E 追击，或在隔离闸（见小地图）按 E 留守 2 秒封锁。放任会让肺部新增感染源，仍可补救。</p><p>追击后清掉迁移小体，或关闭肺部气道；器官图会显示心脏残留风险，出口可双向返回。此说明之后可在作战手册回看。</p><div class="actions"><button class="primary" data-action="close-migration-guide">明白了，继续作战</button></div></section></div>`; return; }
  if (state.endless) {
    host.innerHTML = (!help && state.phase === 'paused' ? draftOverlay(state) : null)
      ?? endlessOverlay(state, help, lowEffects, { data: endlessProfile.data, status: endlessProfile.status }) ?? '';
    return;
  }
  if (state.battle) {
    host.innerHTML = (!help && !history && state.phase === 'paused' ? researchDirectionOverlay(state) ?? draftOverlay(state) : null) ?? battleOverlay(state, help, resumeAfterHelp, lowEffects, history) ?? '';
    if (state.growth && help) host.querySelector('.help-grid')?.insertAdjacentHTML('afterend', growthHelpMarkup);
    if (help) host.querySelector('.help-grid')?.insertAdjacentHTML('afterend', encounterHelpMarkup(state));
    if (state.growth && history) host.querySelector('h2')?.insertAdjacentHTML('afterend', growthHistoryMarkup(state));
    if (state.growth && (help || history || state.phase === 'paused' || state.phase === 'result') && !host.querySelector('[data-action="growth-details"]')) host.querySelector('.actions')?.insertAdjacentHTML('beforeend', growthDetailsEntryMarkup);
    if (state.campaign) host.querySelector('.switches')?.insertAdjacentHTML('beforeend', `<button data-action="sound">声音 ${sound.enabled?'开':'关'}</button>`);
    if (state.campaign && state.phase === 'menu' && !help && !history) host.querySelector('.intro-card')?.insertAdjacentHTML('beforeend', profileMenuMarkup(profile.data, profile.status));
    if (state.campaign && state.phase === 'menu' && !help && !history) host.querySelector('.actions')?.insertAdjacentHTML('afterbegin', endlessMenuEntry({ data: endlessProfile.data, status: endlessProfile.status }));
    if (state.campaign && state.phase === 'result' && !help && !history) host.querySelector('.actions')?.insertAdjacentHTML('afterbegin', endlessMenuEntry({ data: endlessProfile.data, status: endlessProfile.status }));
    if (state.campaign && state.phase === 'menu' && !help && !history) {
      const footnote = host.querySelector('.intro-footnote');
      if (footnote) footnote.textContent = '心肺探索战场 · 协议进阶 · 免疫细胞协同 · 完全离线';
    }
    if (state.campaign && state.phase === 'result' && !help && !history) host.querySelector('.modal')?.insertAdjacentHTML('beforeend', profileResultMarkup(state, profile.data, profile.status));
    return;
  }
  if (help) {
    host.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="操作指南"><div class="eyebrow">FIELD MANUAL / 操作指南</div><h2>小小战士，深入心脏。</h2><p>这是可自由练习的基础训练场。先清除单体与簇群靶，再将组织修复至 100%，靠近下方的复测终端按 E。</p><div class="help-grid">${BINDINGS.map(([key,label])=>`<div><kbd>${key}</kbd>${label}</div>`).join('')}</div><p>点击靶标的底部瞄准环。牵引裂解显示真实半径；组织修复只作用于组织。遮挡你的前景会淡化，组织隆起则需要绕行。</p><div class="switches"><button data-action="effects">特效：${lowEffects?'低':'标准'}</button>${state.phase === 'paused'?`<button data-action="practice-hit">受击演练 · 耐久 −${BALANCE.trainingHitDamage}，保底 1</button>`:''}</div><div class="actions"><button class="primary" data-action="close-help">返回${resumeAfterHelp?'训练':'上一级'}</button></div></section></div>`;
  } else if (state.phase === 'menu') {
    host.innerHTML = `<div class="overlay intro"><section class="intro-card"><div class="eyebrow">A MICROSCOPIC FANTASY · 01</div><h1>Viral<br><span>Invasion</span></h1><h2>病 毒 入 侵</h2><p class="lead">成为巨人体内的微型战士。<br>在有生命的心脏腔室里，练习净化、扫描与修复，为即将到来的进化对抗做准备。</p><div class="mission"><span><b>01</b> 净化靶标</span><span><b>02</b> 修复组织</span><span><b>03</b> 主动复测</span></div><div class="actions"><button class="primary" data-action="start">进入心脏训练场　↗</button><button class="quiet" data-action="help">操作指南</button></div><p class="intro-footnote">G0 可玩切片 · 键鼠操作 · 完全离线<br>WASD 移动 / 鼠标瞄准 / 左键行动</p></section><div class="intro-art-label"><strong>The living chamber.</strong><small>心脏腔室 / 基础训练</small></div></div>`;
  } else if (state.phase === 'paused') {
    host.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="训练已暂停"><div class="eyebrow">VIRAL INVASION / 病毒入侵</div><h2>让心跳，等你片刻。</h2><p>训练已暂停。计时与场景状态已冻结。</p><div class="seed">SEED ${state.seed} · ${formatTime(state.elapsed)}</div><div class="actions"><button class="primary" data-action="continue">继续训练</button><button data-action="retry">同种子重试</button><button data-action="menu">返回主菜单</button><button class="quiet" data-action="help">操作指南</button></div><div class="switches"><button data-action="effects">特效：${lowEffects?'低':'标准'}</button></div></section></div>`;
  } else if (state.phase === 'result') {
    host.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="训练完成"><div class="result-seal">✧</div><div class="eyebrow">VIRAL INVASION / TRAINING COMPLETE</div><h2>${state.result?.success?'心脏，重新有力地跳动。':'训练已结束。'}</h2><p>${state.result?.success?'靶标净化、组织修复与主动复测已完成。你已掌握基础操作。':'再次进入训练，熟悉工具与空间。'}</p><div class="stats"><div><strong>${formatTime(state.elapsed)}</strong><small>训练用时</small></div><div><strong>${state.hits} / ${state.shots}</strong><small>靶标命中 / 净化施放</small></div><div><strong>${state.scans}</strong><small>扫描次数</small></div></div><div class="seed">G0 · SEED ${state.seed} · 组织完整度 ${state.tissue.hp}%</div><p>下一阶段：真实感染扩散、病毒变异与心跳反制。当前版本为基础训练场。</p><div class="actions"><button class="primary" data-action="retry">同种子再练一次</button><button data-action="new">新种子训练</button><button class="quiet" data-action="menu">返回主菜单</button></div></section></div>`;
  } else host.innerHTML = '';
}
function updateHud() {
  const s = session.state;
  document.body.classList.toggle('endless-mode', !!s.endless);
  if (s.endless) {
    document.body.classList.remove('dual-organ');
    updateEndlessHud(s);
    updateGrowthHud(s);
    el('message').textContent = s.messageUntil > s.elapsed ? s.message : s.battle?.objective ?? '';
    updateCommonHud(); refreshHudRects(); return;
  }
  if (s.battle) {
    updateBattleHud(s);
    updateGrowthHud(s);
    updateEncounterHud(s);
    el('message').textContent = s.messageUntil > s.elapsed ? s.message : s.battle.objective;
    updateCommonHud();
    refreshHudRects();
    return;
  }
  const cleared = s.targets.filter(t=>t.hp<=0).length;
  el('target-count').textContent = `${cleared} / ${s.targets.length}`;
  const allCleared = cleared === s.targets.length;
  const repaired = s.tissue.hp >= 100;
  el('step-targets').className = allCleared?'done':'current';
  el('step-tissue').className = repaired?'done':allCleared?'current':'';
  el('step-terminal').className = allCleared&&repaired?'current':'';
  el('objective-title').textContent = allCleared?(repaired?'靠近终端，完成复测':'让受损组织恢复完整'):'清除感染体训练靶';
  el('hp-label').textContent = `${s.player.hp} / 100`;
  el('hp-meter').style.width = `${s.player.hp}%`;
  el('tissue-label').textContent = `${s.tissue.hp}%`;
  el('tissue-meter').style.width = `${s.tissue.hp}%`;
  el('message').textContent = s.messageUntil > s.elapsed ? s.message : allCleared?(repaired?'靠近复测终端，按 E 确认训练成果':'按 3 · 点击右下方受损组织，修复至 100%'):'按 Q 扫描 · 按 1 或 2 净化靶标底部的瞄准环';
  updateCommonHud();
  refreshHudRects();
}
function refreshHudRects() {
  const point = renderer.camera.worldToScreen(presentedState.player), scale = renderer.camera.scale;
  renderer.setHudRects(readVisibleHudRects(canvas, {
    active: session.state.phase === 'playing', now: performance.now(),
    player: { left: point.x - 27 * scale, right: point.x + 27 * scale, top: point.y - 68 * scale, bottom: point.y + 10 * scale },
  }));
}
function updateCommonHud() {
  const s = session.state;
  const combat = s.endlessGrowth ? endlessCombatStats(s.endlessGrowth) : undefined;
  document.querySelector('.status-chip')!.textContent = s.endless ? `连续挑战 / ${s.endless.wave}` : s.battle?.organId === 'lung' ? 'LUNG / 02' : 'HEART / 01';
  el('dash-ready').textContent = s.player.dashReady > s.elapsed ? `${(s.player.dashReady-s.elapsed).toFixed(1)}s`:'就绪';
  el('dash-ready').previousElementSibling!.textContent = combat?.dashDamage ? '冲刺挥斩' : '冲刺';
  el('scan-ready').textContent = s.scanReady > s.elapsed ? `${(s.scanReady-s.elapsed).toFixed(1)}s`:'就绪';
  el('run-time').textContent = `SEED ${s.seed}　 /　${formatTime(s.elapsed)}`;
  document.querySelectorAll<HTMLButtonElement>('.tool').forEach((button,index)=>{
    const tool=(index+1) as Tool, cooldown = (tool === 1 ? combat?.primaryCooldown : tool === 2 ? combat?.areaCooldown : undefined) ?? BALANCE.cooldowns[tool];
    button.classList.toggle('selected',s.tool===tool);button.setAttribute('aria-pressed',String(s.tool===tool));
    el(`charge-${tool}`).style.width=`${Math.max(0,1-Math.max(0,s.cooldowns[tool]-s.elapsed)/cooldown)*100}%`;
    if (tool === 1) button.querySelector('small')!.textContent = combat ? `${combat.shotRays} 束 · 贯穿 +${combat.pierceCount}` : '单点 · 快速冷却';
    if (tool === 2) {
      const catalytic = (combat?.catalysisDamage ?? 0) > 0;
      button.querySelector('strong')!.textContent = catalytic ? '催化牵引' : '牵引裂解';
      button.setAttribute('aria-label', `2 ${catalytic ? '催化牵引' : '牵引裂解'}`);
      button.querySelector('small')!.textContent = catalytic ? '直伤≤8 · 1/细胞引爆' : combat ? `聚拢 ${combat.areaGatherRadius} · ${combat.areaGuideDuration ? '可按住导流' : '延迟爆发'}` : '聚拢 · 延迟爆发';
      if (s.traction) button.querySelector('small')!.textContent = s.traction.stage === 'guiding' ? '拖动鼠标 · 松手引爆' : s.traction.stage === 'aiming' ? '按住导流 / 轻点快放' : '聚拢中 · 即将爆发';
    }
  });
  document.querySelector('.micro-footer')!.textContent = s.endless ? 'v0.9.0 · 连续进化挑战 / 微观绘本' : `v0.9.0 · ${s.battle ? '器官联防' : '基础训练'} / 微观绘本`;
  document.querySelectorAll<HTMLButtonElement>('[data-action="sound"]').forEach(button => { button.textContent = `声音 ${sound.enabled?'开':'关'}`; });
  document.querySelector<HTMLButtonElement>('[data-action="pause"]')!.hidden = s.phase === 'menu' || s.phase === 'result';
}
let lastHud = 0;
let lastFrame: number | undefined;
let lastCameraScope = '';
let lastClockRevision = clock.revision;
function frame(now: number) {
  // Input is projected through the same camera that produced the last visible frame.
  const aim = renderer.camera.screenToWorld(input.pointer);
  clock.advance(now, dt => motion.step(session.state, () => {
    session.step(input.frame(aim), dt);
    renderer.witnessSimulation(session.state);
  }), session.state.phase === 'playing');
  if (clock.discontinuity || clock.revision !== lastClockRevision) motion.reset();
  if (resetClockAfterStep) { clock.reset(); motion.reset(); resetClockAfterStep = false; }
  lastClockRevision = clock.revision;
  if (migrationGuidePending && session.state.phase === 'playing' && !session.state.growth?.draft && !session.state.growth?.pendingResearch) {
    migrationGuidePending = false; migrationGuideSeen = true; migrationGuide = true; session.pause(); input.clear(); clock.reset();
  }
  presentedState = motion.present(session.state, clock.alpha);
  const cameraScope = `${session.state.seed}:${session.state.runMetrics?.runId ?? session.state.growth?.runId ?? ''}:${session.state.battle?.organId ?? 'training'}:${session.state.phase}`;
  const dt = lastFrame === undefined ? 0 : Math.max(0, (now - lastFrame) / 1000);
  renderer.prepareCamera(presentedState, { deltaSeconds: dt, snap: presentedState === session.state || cameraScope !== lastCameraScope || dt > .25 });
  lastCameraScope = cameraScope; lastFrame = now;
  renderer.render(presentedState, renderer.camera.screenToWorld(input.pointer), { lowEffects, cameraPrepared: true, authoritativeState: session.state });
  sound.update(session.state);
  updateOverlay();
  if (now-lastHud > 50) { updateHud(); lastHud=now; }
}
window.addEventListener('resize', () => { motion.reset(); presentedState = session.state; renderer.resize(); renderer.prepareCamera(session.state); refreshHudRects(); clock.reset(); });
renderer.prepareCamera(session.state); updateOverlay(); updateHud();
renderer.ready.then(() => {
  app.inert = false; app.removeAttribute('aria-busy');
  renderer.prepareCamera(session.state); refreshHudRects(); clock.reset(); renderer.startFrameLoop(frame);
}).catch(error => {
  app.inert = false; app.removeAttribute('aria-busy');
  const host = document.querySelector<HTMLElement>('#overlay-host')!;
  host.innerHTML = '<div class="overlay"><section class="modal"><h2>画面暂未加载完成</h2><p class="art-load-error"></p><button class="primary" id="retry-art">重新加载</button></section></div>';
  host.querySelector('.art-load-error')!.textContent = error instanceof Error ? error.message : String(error);
  host.querySelector('#retry-art')!.addEventListener('click', () => location.reload());
});

// Read-only diagnostics for browser regression. Inputs always use the real DOM.
Object.defineProperty(window, '__viral', { value: Object.freeze({
  version: '0.9.0-G4', snapshot: () => session.snapshot(),
  toScreen: (point: { x: number; y: number }) => renderer.camera.worldToScreen(point),
  toWorld: (point: { x: number; y: number }) => renderer.camera.screenToWorld(point),
  diagnostics: () => renderer.diagnostics(session.state),
}), writable: false });
