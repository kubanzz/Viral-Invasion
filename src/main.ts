import './style.css';
import { GameSession } from './game/session';
import { FixedClock } from './core/clock';
import { Controller, BINDINGS } from './input/controller';
import { Renderer } from './render/renderer';
import { BALANCE, type Tool } from './game/types';
import { Soundscape } from './audio';
import { battleHudMarkup, battleOverlay, updateBattleHud } from './ui/battleHud';
import type { TraitId } from './game/battleTypes';
import type { ProtocolId } from './game/growthTypes';
import { draftOverlay, growthHudMarkup, updateGrowthHud, growthHelpMarkup, growthHistoryMarkup } from './ui/growthHud';
import { ProfileStore } from './meta/profile';
import { profileOverlay, profileMenuMarkup, profileResultMarkup } from './ui/profileHud';
import './ui/profile.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const app = document.querySelector<HTMLDivElement>('#app')!;
const params = new URL(location.href).searchParams;
const seedText = params.get('seed');
const seedParam = seedText !== null && seedText.trim() !== '' ? Number(seedText) : NaN;
const initialSeed = Number.isInteger(seedParam) && seedParam >= 0 && seedParam <= 0xffffffff ? seedParam : 130026;
// The old slice is an explicit regression fixture; the player enters the campaign.
const trainingFixture = params.get('scenario') === 'training';
const firstTrait = ['CARAPACE', 'FISSION', 'MIMIC'].includes(params.get('trait') ?? '') ? params.get('trait') as TraitId : undefined;
const milestone = params.get('fixture') === 'G1' ? 'G1' : params.get('fixture') === 'G2' ? 'G2' : 'G3';
const session = new GameSession(initialSeed, { campaign: !trainingFixture, firstTrait, milestone });
const clock = new FixedClock();
const renderer = new Renderer(canvas);
const sound = new Soundscape();
const profile = new ProfileStore();
sound.enabled = profile.data.settings.sound;
let lowEffects = profile.data.settings.lowEffects;
let help = false;
let resumeAfterHelp = false;
let overlayKey = '';
let history = false;
let resumeAfterHistory = false;
let resetClockAfterStep = false;
let profileOpen = false;
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
    <div class="dock-wrap"><div class="ability"><kbd>Space</kbd>冲刺<em id="dash-ready">就绪</em></div><div class="tool-dock">${([[1,'精确净化','单点 · 快速冷却'],[2,'范围裂解','群体 · 94 范围'],[3,'组织修复','治疗 · +25 完整度']] as const).map(([id,title,subtitle])=>`<button class="tool" data-action="tool-${id}" aria-label="${id} ${title}"><kbd>${id}</kbd><strong>${title}</strong><small>${subtitle}</small><i class="charge" id="charge-${id}"></i></button>`).join('')}</div><div class="ability"><kbd>Q</kbd>扫描<em id="scan-ready">就绪</em></div></div>
    <div class="micro-footer">G0 · 基础训练 / 架空生物幻想</div><div class="run-time" id="run-time"></div>
  </main><div id="overlay-host"></div>`;
if (!trainingFixture) {
  app.classList.add('campaign');
  canvas.setAttribute('aria-label', '病毒入侵战场：WASD移动，鼠标瞄准，1精准净化，2范围控场，3抢修，Q召集免疫细胞，E交互');
  document.querySelector('.objective')!.remove();
  document.querySelector('.telemetry')!.remove();
  document.querySelector('#hud')!.insertAdjacentHTML('afterbegin', battleHudMarkup);
  if (session.state.growth) document.querySelector('#hud')!.insertAdjacentHTML('beforeend', growthHudMarkup);
  if (session.state.campaign) document.querySelector('.tool[data-action="tool-2"] small')!.textContent = '群体 · 击退打断';
  document.querySelector('.micro-footer')!.textContent = `${milestone === 'G3' ? 'G4' : milestone} · ${milestone === 'G3' ? '器官联防' : '心脏防线'} / 架空生物幻想`;
}
const input = new Controller(canvas, () => togglePause(), () => {
  if (session.state.phase === 'playing') session.pause();
  clock.reset();
}, () => session.state.phase === 'playing' && !help && !history && !profileOpen && !migrationGuide);
session.bus.on('event', event => {
  if (event.type === 'INPUT_RESET_REQUESTED') { input.clear(); resetClockAfterStep = true; }
  if (event.type === 'RUN_ENDED' && session.state.campaign && runId) profile.recordRun(session.state, runId);
  if (event.type === 'MIGRATION_WARNING' && !migrationGuideSeen) migrationGuidePending = true;
});
const el = (id: string) => document.getElementById(id)!;
const formatTime = (seconds: number) => `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
function togglePause() {
  input.clear(); clock.reset();
  if (profileOpen) { profileOpen = false; if (resumeAfterProfile) session.resume(); resumeAfterProfile = false; return; }
  if (migrationGuide) { closeMigrationGuide(); return; }
  if (history) { history = false; if (resumeAfterHistory) session.resume(); resumeAfterHistory = false; return; }
  if (help) { help = false; if (resumeAfterHelp) session.resume(); resumeAfterHelp = false; return; }
  if (session.state.phase === 'playing') session.pause();
  else if (session.state.phase === 'paused') session.resume();
}
function start(newSeed?: number) {
  input.clear(); clock.reset(); help = false; history = false; resumeAfterHelp = false; resumeAfterHistory = false;
  profileOpen = false; migrationGuide = false; migrationGuidePending = false;
  runId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${performance.now()}:${Math.random().toString(36).slice(2)}`;
  document.body.classList.remove('crisis');
  sound.unlock(); session.start(newSeed ?? session.state.seed);
}
function showHelp() {
  if (profileOpen || migrationGuide || history || help) return;
  resumeAfterHelp = session.state.phase === 'playing';
  if (resumeAfterHelp) session.pause();
  input.clear(); clock.reset(); help = true;
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
  if (action === 'profile') { resumeAfterProfile = session.state.phase === 'playing'; session.pause(); profileOpen = true; input.clear(); clock.reset(); button.blur(); return; }
  if (action === 'close-profile') { profileOpen = false; if (resumeAfterProfile) session.resume(); resumeAfterProfile = false; input.clear(); clock.reset(); button.blur(); return; }
  if (action === 'replay-record') { const seed = Number(button.dataset.seed); if (Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff) start(seed); return; }
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
  if (action === 'start' || action === 'retry') start();
  if (action === 'new') start((session.state.seed + 2654435761) >>> 0);
  if (action === 'pause' || action === 'continue') togglePause();
  if (action === 'menu') { input.clear(); clock.reset(); help = false; history = false; profileOpen = false; migrationGuide = false; migrationGuidePending = false; session.menu(); document.body.classList.remove('crisis'); }
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
  const key = `${state.phase}:${help}:${lowEffects}:${history}:${profileOpen}:${migrationGuide}:${draft?.id}:${draft?.status}:${draft?.selectedOptionId}`;
  if (key === overlayKey) return;
  overlayKey = key;
  el('hud').hidden = state.phase === 'menu' || state.phase === 'result';
  // Keep keyboard navigation inside the visible overlay as well as mouse input.
  const modalActive = profileOpen || migrationGuide || help || history || state.phase !== 'playing';
  document.querySelector<HTMLElement>('.topbar')!.inert = modalActive;
  el('hud').inert = modalActive;
  const host = el('overlay-host');
  if (profileOpen) { host.innerHTML = profileOverlay(profile.data, profile.status); return; }
  if (migrationGuide) { host.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="首次迁移指引"><div class="eyebrow">THE NEXT CHAMBER / 首次迁移</div><h2>病毒要去另一个器官了。</h2><p>倒数已暂停。你可以去器官出口（见小地图）按 E 追击，或在隔离闸（见小地图）按 E 留守 2 秒封锁。放任会让肺部新增感染源，仍可补救。</p><p>追击后清掉迁移小体，或关闭肺部气道；器官图会显示心脏残留风险，出口可双向返回。此说明之后可在作战手册回看。</p><div class="actions"><button class="primary" data-action="close-migration-guide">明白了，继续作战</button></div></section></div>`; return; }
  if (state.battle) {
    host.innerHTML = (!help && !history && state.phase === 'paused' ? draftOverlay(state) : null) ?? battleOverlay(state, help, resumeAfterHelp, lowEffects, history) ?? '';
    if (state.growth && help) host.querySelector('.help-grid')?.insertAdjacentHTML('afterend', growthHelpMarkup);
    if (state.growth && history) host.querySelector('h2')?.insertAdjacentHTML('afterend', growthHistoryMarkup(state));
    if (state.campaign) host.querySelector('.switches')?.insertAdjacentHTML('beforeend', `<button data-action="sound">声音 ${sound.enabled?'开':'关'}</button>`);
    if (state.campaign && state.phase === 'menu' && !help && !history) host.querySelector('.intro-card')?.insertAdjacentHTML('beforeend', profileMenuMarkup(profile.data, profile.status));
    if (state.campaign && state.phase === 'menu' && !help && !history) {
      const footnote = host.querySelector('.intro-footnote');
      if (footnote) footnote.textContent = '心肺探索战场 · 协议进阶 · 免疫细胞协同 · 完全离线';
    }
    if (state.campaign && state.phase === 'result' && !help && !history) host.querySelector('.modal')?.insertAdjacentHTML('beforeend', profileResultMarkup(state, profile.data, profile.status));
    return;
  }
  if (help) {
    host.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="操作指南"><div class="eyebrow">FIELD MANUAL / 操作指南</div><h2>小小战士，深入心脏。</h2><p>这是可自由练习的基础训练场。先清除单体与簇群靶，再将组织修复至 100%，靠近下方的复测终端按 E。</p><div class="help-grid">${BINDINGS.map(([key,label])=>`<div><kbd>${key}</kbd>${label}</div>`).join('')}</div><p>点击靶标的底部瞄准环。范围裂解显示真实半径；组织修复只作用于组织。遮挡你的前景会淡化，组织隆起则需要绕行。</p><div class="switches"><button data-action="effects">特效：${lowEffects?'低':'标准'}</button>${state.phase === 'paused'?`<button data-action="practice-hit">受击演练 · 耐久 −${BALANCE.trainingHitDamage}，保底 1</button>`:''}</div><div class="actions"><button class="primary" data-action="close-help">返回${resumeAfterHelp?'训练':'上一级'}</button></div></section></div>`;
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
  if (s.battle) {
    updateBattleHud(s);
    updateGrowthHud(s);
    el('message').textContent = s.messageUntil > s.elapsed ? s.message : s.battle.objective;
    updateCommonHud();
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
}
function updateCommonHud() {
  const s = session.state;
  document.querySelector('.status-chip')!.textContent = s.battle?.organId === 'lung' ? 'LUNG / 02' : 'HEART / 01';
  el('dash-ready').textContent = s.player.dashReady > s.elapsed ? `${(s.player.dashReady-s.elapsed).toFixed(1)}s`:'就绪';
  el('scan-ready').textContent = s.scanReady > s.elapsed ? `${(s.scanReady-s.elapsed).toFixed(1)}s`:'就绪';
  el('run-time').textContent = `SEED ${s.seed}　 /　${formatTime(s.elapsed)}`;
  document.querySelectorAll<HTMLButtonElement>('.tool').forEach((button,index)=>{const tool=(index+1) as Tool;button.classList.toggle('selected',s.tool===tool);button.setAttribute('aria-pressed',String(s.tool===tool));el(`charge-${tool}`).style.width=`${Math.max(0,1-Math.max(0,s.cooldowns[tool]-s.elapsed)/BALANCE.cooldowns[tool])*100}%`;});
  document.querySelectorAll<HTMLButtonElement>('[data-action="sound"]').forEach(button => { button.textContent = `声音 ${sound.enabled?'开':'关'}`; });
  document.querySelector<HTMLButtonElement>('[data-action="pause"]')!.hidden = s.phase === 'menu' || s.phase === 'result';
}
let lastHud = 0;
function frame(now: number) {
  renderer.prepareCamera(session.state);
  const aim = renderer.camera.screenToWorld(input.pointer);
  clock.advance(now, dt => session.step(input.frame(aim), dt), session.state.phase === 'playing');
  if (resetClockAfterStep) { clock.reset(); resetClockAfterStep = false; }
  if (migrationGuidePending && session.state.phase === 'playing' && !session.state.growth?.draft) {
    migrationGuidePending = false; migrationGuideSeen = true; migrationGuide = true; session.pause(); input.clear(); clock.reset();
  }
  renderer.prepareCamera(session.state);
  renderer.render(session.state, renderer.camera.screenToWorld(input.pointer), { lowEffects });
  sound.update(session.state);
  updateOverlay();
  if (now-lastHud > 50) { updateHud(); lastHud=now; }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => { renderer.resize(); clock.reset(); });
renderer.resize(); updateOverlay(); updateHud(); requestAnimationFrame(frame);

// Read-only diagnostics for browser regression. Inputs always use the real DOM.
Object.defineProperty(window, '__viral', { value: Object.freeze({
  version: '0.6.0-G4', snapshot: () => session.snapshot(),
  toScreen: (point: { x: number; y: number }) => renderer.camera.worldToScreen(point),
  toWorld: (point: { x: number; y: number }) => renderer.camera.screenToWorld(point),
  diagnostics: () => renderer.diagnostics(session.state),
}), writable: false });
