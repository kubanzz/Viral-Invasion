import { installExpeditionArtIcons } from './render/expeditionArt';
import './style.css';
import { GameSession } from './game/session';
import { FixedClock } from './core/clock';
import { MotionInterpolation } from './render/motionInterpolation';
import { Controller, BINDINGS, type SkillPresentation } from './input/controller';
import { TouchControls } from './input/touchControls';
import { Renderer } from './render/renderer';
import { BALANCE, type Tool, type GameState } from './game/types';
import { Soundscape } from './audio';
import { battleHudMarkup, battleOverlay, updateBattleHud } from './ui/battleHud';
import type { TraitId } from './game/battleTypes';
import type { ProtocolId, ResearchDirectionId } from './game/growthTypes';
import { draftOverlay, researchDirectionOverlay, growthHudMarkup, updateGrowthHud, growthHelpMarkup, growthHistoryMarkup, growthDetailsEntryMarkup, growthDetailsOverlay } from './ui/growthHud';
import './ui/research.css';
import { ProfileStore } from './meta/profile';
import type { RunEncounterRecord } from './meta/profile';
import { newRunOptions, replayRunOptions } from './meta/runOptions';
import { profileOverlay, profileResultMarkup } from './ui/profileHud';
import './ui/profile.css';
import { encounterHudMarkup, updateEncounterHud, encounterHelpMarkup } from './ui/encounterHud';
import './ui/encounter.css';
import { startingPlanOverlay } from './ui/startingPlanHud';
import './ui/startingPlan.css';
import { preparationForPlan, type StartingPlanId } from './game/preparation';
import { readVisibleHudRects } from './ui/hudLayout';
import { CameraFollowPolicy } from './render/cameraFollowPolicy';
import { desktopAimViewport as deriveDesktopAimViewport } from './render/desktopAimViewport';
import { COMPACT_COMBAT_MINIMUM_SCALE, type CameraFollowOptions } from './render/camera';
import { endlessHudMarkup, updateEndlessHud, endlessOverlay, endlessMenuEntry } from './ui/endlessHud';
import { TerritoryProfileStore } from './meta/endlessProfile';
import { endlessCombatStats } from './game/endlessGrowth';
import type { EndlessUpgradeId } from './game/endlessGrowthTypes';
import './ui/endless.css';
import './ui/artTheme.css';
import { artIconMarkup, installArtIcons } from './ui/artIcons';
import { hostEventHudMarkup, updateHostEventHud, hostEventAnnouncementMarkup, updateHostEventAnnouncement } from './ui/hostEventHud';
import { chargedSlashProgress } from './game/chargedSlash';
import { TERRITORY_CANNON_BALANCE } from './game/territoryCannon';
import { territoryCannonCameraFocus } from './render/territoryCannonVisuals';
import { HOST_EVENT_IDS } from './game/hostEvents';
import './ui/hostEventHud.css';
import { mobileHudMarkup, mobileDetailsMarkup, setMobileDetailsOpen, updateMobileHud } from './ui/mobileHud';
import './ui/mobile.css';
import { mainMenuOverlay } from './ui/mainMenu';
import { endlessTutorialHint } from './ui/endlessTutorial';
import './ui/mainMenu.css';
import { touchCopy } from './ui/touchCopy';
import { resolveTouchLayout } from './ui/responsiveLayout';
import { territoryHudMarkup, updateTerritoryHud, territoryVictoryOverlay, territoryResultOverlay } from './ui/territoryHud';
import './ui/territory.css';
import { ModalPointerIntent } from './ui/modalPointerIntent';
import { CampProfileStore } from './meta/campProfile';
import { campOverlay, campSectionStation, campAttentionBadge, type CampSection } from './ui/campHud';
import './ui/camp.css';
import { CampSummonSequence } from './ui/campSummonSequence';
import { campSummonOverlay, updateCampSummonOverlay } from './ui/campSummonHud';
import './ui/campSummon.css';
import { constructionHudMarkup, constructionMenu, updateConstructionPlacement, updateConstructionDiscovery } from './ui/constructionHud';
import { CampWeaponTrial } from './game/campWeaponTrial';
import { startCampWeaponTrial } from './ui/campWeaponTrial';
import { requestConstruction, resumeConstruction, cancelConstruction, type BlueprintId } from './game/construction';
import { prepareCampScene, advanceCampScene, nearbyCampStation, campBuildPoint, canEstablishCamp, canInteractCampStation, ensureCampPlayerLegal } from './game/campScene';
import { campLayout, type CampStationId } from './game/campLayout';
import { CAMP_FACILITY_PROGRESS, CAMP_CONSTRUCTION_SECONDS, INTRO_FACILITY_IDS, campHasFacility, nextCampFacility } from './game/campProgression';
import { campStationAttention } from './game/campAttention';
import { MISSIONS, type DrawReceipt, type MissionId, type MissionOutcome, type MissionReceipt, type TemplateId } from './game/microfront';
import { missionResultOverlay, missionPauseOverlay, updateMissionHud } from './ui/microfrontHud';
import './ui/microfront.css';
import { territoryCannonView } from './game/territoryCannon';
import { territoryContextView } from './game/territory';
import { WEAPONS, weaponCombatProfile, type WeaponId, type WeaponRarity } from './game/expedition';
import { createWeaponCombat, weaponSkillViews } from './game/weaponSkills';
import { dismissWeaponTutorial } from './ui/endlessTutorial';
import { weaponSkillIconMarkup } from './ui/weaponSkillIcons';
import './ui/construction.css';
import './ui/weaponSkills.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const app = document.querySelector<HTMLDivElement>('#app')!;
installArtIcons(document);
installExpeditionArtIcons(document);
const params = new URL(location.href).searchParams;
const coarsePointer = matchMedia('(pointer: coarse)');
const readTouchLayout = () => resolveTouchLayout({ width: innerWidth, height: innerHeight,
  coarsePointer: coarsePointer.matches, maxTouchPoints: navigator.maxTouchPoints, forceTouch: params.get('mobile') === '1' });
let touchMode = readTouchLayout();
document.body.classList.toggle('touch-mode', touchMode);
let portraitBlocked = touchMode && innerHeight > innerWidth;
let mobileDetailsOpen = false;
let resumeAfterMobileDetails = false;
let mobileAimViewport: { left: number; right: number; top: number; bottom: number } | undefined;
let desktopFlightViewport: { left: number; right: number; top: number; bottom: number } | undefined;
let mobilePreviewHeaderBottom = 80;
const seedText = params.get('seed');
const seedParam = seedText !== null && seedText.trim() !== '' ? Number(seedText) : NaN;
const initialSeed = Number.isInteger(seedParam) && seedParam >= 0 && seedParam <= 0xffffffff ? seedParam : 130026;
// The old slice is an explicit regression fixture; the player enters the campaign.
const trainingFixture = params.get('scenario') === 'training';
const firstTrait = ['CARAPACE', 'FISSION', 'MIMIC'].includes(params.get('trait') ?? '') ? params.get('trait') as TraitId : undefined;
const milestone = params.get('fixture') === 'G1' ? 'G1' : params.get('fixture') === 'G2' ? 'G2' : 'G3';
// Explicit development fixture only; it still runs dependency, organ and placement checks.
const hostEventParam = params.get('hostEvent')?.trim().toUpperCase();
const debugHostEventId = HOST_EVENT_IDS.find(id => id === hostEventParam);
let hostEventDebugReport = '';
const profile = new ProfileStore();
const endlessProfile = new TerritoryProfileStore();
const campProfile = new CampProfileStore();
let campSnapshot = campProfile.load();
let campSection: CampSection | null = null;
let campNotice = '';
let lastDrawReceipt: DrawReceipt | null = null;
let lastMissionReceipt: MissionReceipt | undefined;
let requestedMissionOutcome: MissionOutcome | undefined;
let drawingAntibodies = false;
const summonSequence = new CampSummonSequence();
let summonCueKey = -1;
let campTrial: CampWeaponTrial | undefined;
let campTrialWeaponId: WeaponId | undefined;
let campTrialCompleted = false;
let stopCampTrial: (() => void) | undefined;
let blueprintDiscovered = false;
let buildMenuOpen = false;
let buildPlacement: {blueprintId:BlueprintId;position:{x:number;y:number};locked?:boolean} | undefined;
const session = new GameSession(initialSeed, { campaign: !trainingFixture, ...newRunOptions(profile.data, firstTrait), milestone });
const clock = new FixedClock();
const motion = new MotionInterpolation();
const renderer = new Renderer(canvas);
function prepareCombatCamera(state: GameState, options: CameraFollowOptions = {}): void {
  renderer.prepareCamera(state, { ...options,
    ...((options.aimRadius??0)>0||!options.aim&&territoryCannonCameraFocus(state) ? { viewport: touchMode?mobileAimViewport:desktopFlightViewport } : {}),
    ...(touchMode && state.phase !== 'menu' ? { minimumScale: COMPACT_COMBAT_MINIMUM_SCALE } : {}) });
}
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
    <div class="dock-wrap"><div class="ability"><div class="ability-key">${artIconMarkup('dash')}<kbd>Space</kbd></div><span class="ability-name">冲刺</span><em id="dash-ready">就绪</em><small class="ability-charge" id="charged-slash-ready" hidden>长按蓄能剑气</small></div><div class="tool-dock">${([[1,'精确净化','单点 · 快速冷却'],[2,'牵引裂解','聚拢 · 延迟爆发'],[3,'组织修复','治疗 · +25 完整度']] as const).map(([id,title,subtitle])=>`<button class="tool" data-action="tool-${id}" aria-label="${id} ${title}"><kbd>${id}</kbd><strong>${id===3?artIconMarkup('heal'):''}${title}</strong><small>${subtitle}</small><i class="charge" id="charge-${id}"></i></button>`).join('')}</div><div class="ability"><div class="ability-key">${artIconMarkup('scan')}<kbd>Q</kbd></div><span class="ability-name">扫描</span><em id="scan-ready">就绪</em></div></div>
    <div class="weapon-context" id="weapon-context" hidden><span id="weapon-primary-label">左键 · 普攻</span><button data-action="territory-action"><kbd>F</kbd><strong>净化组织</strong></button><button data-action="weapon-tutorial-dismiss" class="quiet">隐藏战技提示</button></div>
    <div class="micro-footer">G0 · 基础训练 / 架空生物幻想</div><div class="run-time" id="run-time"></div>
    ${hostEventHudMarkup}
  </main>${hostEventAnnouncementMarkup}${mobileHudMarkup}${constructionHudMarkup}<div id="camp-toolbar" class="camp-toolbar" hidden></div><div id="overlay-host"></div>`;
if (!trainingFixture) {
  app.classList.add('campaign');
  canvas.setAttribute('aria-label', '病毒入侵战场：WASD移动，鼠标瞄准，1精准净化，2范围控场，3抢修，Q召集免疫细胞，E交互');
  document.querySelector('.objective')!.remove();
  document.querySelector('.telemetry')!.remove();
  document.querySelector('#hud')!.insertAdjacentHTML('afterbegin', battleHudMarkup);
  document.querySelector('.battle-objective')!.insertAdjacentHTML('beforeend', encounterHudMarkup);
  if (session.state.growth) document.querySelector('#hud')!.insertAdjacentHTML('beforeend', growthHudMarkup);
  document.querySelector('#hud')!.insertAdjacentHTML('beforeend', endlessHudMarkup());
  document.querySelector('#hud')!.insertAdjacentHTML('beforeend', territoryHudMarkup);
  if (session.state.campaign) document.querySelector('.tool[data-action="tool-2"] small')!.textContent = '聚拢 · 延迟爆发';
  document.querySelector('.micro-footer')!.textContent = `${milestone === 'G3' ? 'G4' : milestone} · ${milestone === 'G3' ? '器官联防' : '心脏防线'} / 架空生物幻想`;
  document.querySelector('.dock-wrap .ability:last-child .ability-name')!.textContent = '扫描 / 召集';
}
const touchToolLabels = ['净化', '裂解', '修复'] as const;
const desktopToolTitles = [...document.querySelectorAll('.tool strong')].map(title => title.innerHTML);
const desktopCanvasLabel = canvas.getAttribute('aria-label') ?? '';
const adaptedTouchText = new Map<Text, { original: string; adapted: string }>();
function applyControlLayout(): void {
  document.body.classList.toggle('touch-mode', touchMode);
  document.documentElement.dataset.layout = touchMode ? 'mobile' : 'desktop';
  document.querySelectorAll<HTMLElement>('.tool strong').forEach((title, index) => {
    if (touchMode) title.textContent = touchToolLabels[index];
    else title.innerHTML = desktopToolTitles[index];
  });
  canvas.setAttribute('aria-label', touchMode
    ? session.state.territory ? '病毒入侵战场：左杆移动，射击盘按住攻击；驻防和净化组织点按即用。能量炮拖动瞄准，松手施放；弹射器按住选择落点，松手起飞。'
      : '病毒入侵战场：左杆移动，右下大盘按住攻击；技能拖动瞄准、松手施放，拖至取消区撤销。点击战场可精确选点。'
    : desktopCanvasLabel);
}
applyControlLayout();
const input = new Controller(canvas, () => togglePause(), () => {
  if (session.state.phase === 'playing') session.pause();
  clock.reset();
}, canAcceptGameInput, () => session.state);
const touchControls = new TouchControls({ root: document.querySelector<HTMLElement>('#mobile-controls')!, canvas, input,
  // A release commits the point the player just saw, including motion interpolation.
  getState: () => presentedState, screenToWorld: point => renderer.camera.screenToWorld(point), canAccept: canAcceptGameInput, enabled: () => touchMode });
function canAcceptGameInput(): boolean {
  return session.state.phase === 'playing' && !buildMenuOpen && !campSection && !help && !history && !growthDetails && !profileOpen && !startingPlanOpen
    && !migrationGuide && !mobileDetailsOpen && !portraitBlocked
    && !session.state.growth?.draft && !session.state.growth?.pendingResearch && !session.state.endlessGrowth?.draft;
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !session.state.camp || !canAcceptGameInput()) return;
  const rect = canvas.getBoundingClientRect(), point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  if (session.state.camp.prologue === 'arrival') {
    const world = renderer.camera.screenToWorld(point), anchor = campBuildPoint(session.state);
    if (Math.hypot(world.x - anchor.x, world.y - anchor.y) > 60) return;
    event.preventDefault(); event.stopImmediatePropagation(); establishCamp(); return;
  }
  const target = renderer.campHitTarget(session.state, point);
  if (!target) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (target.eligible) interactCampStation(target.id);
  else { campNotice = `请靠近${CAMP_FACILITY_PROGRESS[target.id].name}，再点击操作。`; overlayKey = ''; }
}, { capture: true, passive: false });
function openBuildMenu():void {
  if(!session.state.territory||session.state.camp||!canAcceptGameInput())return;
  blueprintDiscovered=false;
  buildPlacement=undefined;buildMenuOpen=true;session.pause();input.clear();clock.reset();overlayKey='';
}
function syncCampWeapon():void {
  if(!session.state.camp)return;
  const data=campProfile.data,id=data.equipped,item=data.weapons[id];
  if(!item.repaired)return;
  const loadout={weaponId:id,rarity:item.repaired,upgrade:item.upgrade};
  session.state.weaponCombat=createWeaponCombat(loadout);
  if(session.state.expedition)session.state.expedition.loadout={...loadout};
}
function syncCampPresentation(): void {
  campSnapshot = campProfile.load();
  const camp = session.state.camp, data = campSnapshot.data;
  if (!camp) return;
  if (camp.activeConstruction !== data.activeConstruction) camp.constructionSeconds = 0;
  camp.builtFacilities = [...data.builtFacilities]; camp.activeConstruction = data.activeConstruction;
  camp.prologue = data.prologue; camp.introComplete = data.campIntroSeen;
  camp.attention = campStationAttention(data);
}
function openCampSection(section: CampSection): void {
  if (summonSequence.active) return;
  if (!session.state.camp || portraitBlocked || !['overview','warehouse','forge','shop','departure','missions','summon','trial'].includes(section)) return;
  const station = campSectionStation(section), data = campSnapshot.data;
  if (station && campHasFacility(data, station) && !canInteractCampStation(session.state, station)) {
    campNotice = `请靠近${CAMP_FACILITY_PROGRESS[station].name}，点击建筑或按E进入。`;
    campSection = null; session.state.phase = 'playing';
  } else {
    campSection = section; session.state.phase = 'paused';
    if (station && campHasFacility(data, station)) {
      if (section === 'warehouse') campProfile.markCampSectionSeen('warehouse');
      if ((section === 'missions' || section === 'departure') && data.prologue === 'ready') campProfile.markCampSectionSeen('missions');
    }
  }
  syncCampPresentation(); input.clear(); clock.reset(); overlayKey = '';
}
function startCampConstruction(id: CampStationId): void {
  if (!session.state.camp || !canInteractCampStation(session.state, id)) {
    campNotice = '先走到规划地基旁，再确认免费建造。'; overlayKey = ''; return;
  }
  const result = campProfile.beginBuild(id); campNotice = result.message;
  if (result.accepted) { campSection = null; session.state.phase = 'playing'; }
  syncCampPresentation(); input.clear(); clock.reset(); overlayKey = '';
}
function interactCampStation(id: CampStationId): void {
  if (!canAcceptGameInput() || !session.state.camp || !canInteractCampStation(session.state, id)) return;
  if (campHasFacility(campSnapshot.data, id)) openCampSection(id);
  else startCampConstruction(id);
}
function enterCamp():void {
  summonSequence.clear();
  if(session.state.expedition?.missionId && campProfile.data.activeExpedition && session.state.phase !== 'menu' && session.state.phase !== 'result') {
    requestedMissionOutcome='withdrawn';session.finish(false,'主动撤离：带回一半普通资源。');requestedMissionOutcome=undefined;
  }
  stopCampTrial?.();stopCampTrial=undefined;campTrial=undefined;campTrialWeaponId=undefined;campTrialCompleted=false;
  if(!session.state.camp&&session.state.phase==='paused'&&session.state.territory?.stage==='victory'&&session.state.territory.rescueSnapshot)session.finishTerritoryRescue();
  if(!session.state.territory)session.state=new GameSession(session.state.seed,{campaign:true,milestone:'G3',mode:'endless',territory:true}).state;
  campSnapshot = campProfile.load();
  session.state=structuredClone(session.state);prepareCampScene(session.state,campSnapshot.data.campIntroSeen,campSnapshot.data.prologue,campSnapshot.data.builtFacilities);
  syncCampPresentation();syncCampWeapon();ensureCampPlayerLegal(session.state);
  help=false;history=false;campSection=null;campNotice='';buildMenuOpen=false;buildPlacement=undefined;
  document.body.classList.add('camp-world');input.clear();input.setTerritoryMode(false);clock.reset();motion.reset();overlayKey='';
}
function completeCampConstruction(): void {
  const id = session.state.camp?.activeConstruction;
  if (!id) return;
  const result = campProfile.completeBuild(id);
  if (!result.accepted) return;
  syncCampPresentation();ensureCampPlayerLegal(session.state);
  campNotice=campSnapshot.data.prologue==='ready'?'侦察队来报：首份情报已送达，靠近出击台查看。':result.message;
  if (campSection) { campSection = null; session.state.phase = 'playing'; }
  input.clear();motion.reset();overlayKey='';
}
function establishCamp(): void {
  if (!canEstablishCamp(session.state)) {
    campNotice='先带领小队走到前方发光的锚定点，再按E建立前哨。';overlayKey='';return;
  }
  const result=campProfile.establishCamp();campNotice=result.message;
  if(result.accepted&&session.state.camp){session.state.camp.prologue='building';session.state.camp.introSeconds=0;campSection=null;session.state.phase='playing';}
  syncCampPresentation();ensureCampPlayerLegal(session.state);
  input.clear();clock.reset();overlayKey='';
}
function settleCurrentMission(outcome: MissionOutcome): void {
  const expedition=session.state.expedition;
  if(!expedition?.missionId||!expedition.haul||campProfile.data.activeExpedition?.runId!==expedition.runId)return;
  const settled=campProfile.settleMission(expedition.runId,outcome,expedition.haul,outcome==='success'?expedition.pendingLoot:undefined);
  if(settled.receipt)lastMissionReceipt=settled.receipt;
  campNotice=settled.message;overlayKey='';
}
const campToolbarMarkup = new WeakMap<HTMLElement, string>();
function updateCampToolbar():void {
  const bar=el('camp-toolbar');bar.hidden=!session.state.camp||!!campSection;bar.inert=!!campSection;if(!session.state.camp)return;
  const data=campSnapshot.data,station=nearbyCampStation(session.state),attention=session.state.camp.attention ?? {};
  const next = nextCampFacility(data), escapeText = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const nearby = station ? `<button data-action="camp-interact" data-station="${station.id}" ${!campHasFacility(data, station.id) && !!data.activeConstruction ? 'disabled' : ''}>${campHasFacility(data, station.id) ? '进入' : '⚒ 建造'} ${station.name}${touchMode?'':' E'}${campAttentionBadge(attention[station.id])}</button>` : '';
  const text=data.prologue==='arrival'?`<strong>缓流膜湾 · 带领小队前往锚定点</strong>${canEstablishCamp(session.state)?'<button data-action="camp-establish">建立前哨 E</button>':'<span>向前移动 · 靠近发光点</span>'}`
    :data.prologue==='building'?`<strong>基础建设 ${data.builtFacilities.length} / 5</strong><button data-action="camp-section" data-section="overview">建设一览</button>${data.activeConstruction ? `<span class="camp-guidance">${CAMP_FACILITY_PROGRESS[data.activeConstruction].name}施工中</span><button data-action="camp-skip-construction">完成当前栋演出</button>` : next ? `<span class="camp-guidance">建议：${CAMP_FACILITY_PROGRESS[next].name} · 均可免费建造</span>${nearby}` : ''}`
    :`<strong>缓流膜湾 · 金币 ${data.coins} · 生质 ${data.materials}</strong><button data-action="camp-section" data-section="overview">营地菜单</button><button data-action="camp-section" data-section="missions">侦查情报${campAttentionBadge(attention.departure)}</button>${nearby}`;
  const status = campSnapshot.status;
  const content = text + (campNotice ? `<span class="camp-guidance" role="status">${escapeText(campNotice)}</span>` : '') + (status.mode === 'session' ? '<span class="camp-save-warning" role="status">进度暂存本页<button data-action="camp-retry-save">重试保存</button></span>' : '');
  if(campToolbarMarkup.get(bar)!==content) { campToolbarMarkup.set(bar,content);bar.innerHTML=content;refreshHudRects(); }
}
function refreshSummonPresentation(): void {
  const view = summonSequence.view;
  if (view && view.key !== summonCueKey) {
    summonCueKey = view.key;
    if (!view.reduced) sound.summonCue(view.phase, view.currentRarity);
  }
  overlayKey = '';
}
function handleExpeditionAction(action:string,button:HTMLButtonElement):boolean {
  if (summonSequence.active) {
    summonSequence.update(performance.now());
    if (action === 'camp-summon-skip') summonSequence.skip();
    else if (action === 'camp-summon-reveal') summonSequence.reveal();
    else if (action === 'camp-summon-next') summonSequence.next();
    refreshSummonPresentation(); input.clear(); return true;
  }
  if(action==='camp-open'||action==='camp-open-forge'){enterCamp();if(action==='camp-open-forge')openCampSection('forge');return true;}
  if(action.startsWith('camp-')){
    if(!session.state.camp)return true;
    if(action==='camp-trial-fire'){campTrial?.trigger();return true;}
    if(action==='camp-trial-reset'){campTrial?.reset();return true;}
    if(action==='camp-trial-skill'){campTrial?.skill(Number(button.dataset.slot) as 1|2|3);return true;}
    if(action==='camp-trial-layout'){campTrial?.layout(button.dataset.layout === 'line' ? 'line' : 'single');overlayKey='';return true;}
    if(action==='camp-trial-cooldowns'){campTrial?.resetCooldowns();return true;}
    if(action==='camp-trial'||action==='camp-equip-trial'){
      if (!campHasFacility(campSnapshot.data, 'warehouse') || !(canInteractCampStation(session.state, 'warehouse') || campHasFacility(campSnapshot.data, 'forge') && canInteractCampStation(session.state, 'forge'))) return true;
      const id=(button.dataset.weapon??campProfile.data.equipped) as WeaponId;
      const item=campProfile.data.weapons[id];if(!item?.repaired)return true;
      if(action==='camp-equip-trial'){const result=campProfile.equip(id);campNotice=result.message;if(!result.accepted&&campProfile.data.equipped!==id)return true;syncCampWeapon();}
      stopCampTrial?.();stopCampTrial=undefined;
      campTrialWeaponId=id;campTrial=new CampWeaponTrial({weaponId:id,rarity:item.repaired,upgrade:item.upgrade});
      campSection='trial';session.state.phase='paused';input.clear();clock.reset();overlayKey='';return true;
    }
    if(action==='camp-section'){openCampSection(button.dataset.section as CampSection);return true;}
    else if(action==='camp-interact'){interactCampStation(button.dataset.station as CampStationId);return true;}
    else if(action==='camp-build'){startCampConstruction(button.dataset.station as CampStationId);return true;}
    else if(action==='camp-close'){campSection=null;session.state.phase='playing';}
    else if(action==='camp-leave'){delete session.state.camp;session.state.phase='menu';campSection=null;document.body.classList.remove('camp-world');}
    else if(action==='camp-deploy'){if(campProfile.data.prologue==='ready')start((session.state.seed+7919)>>>0,undefined,false,'endless');return true;}
    else if(action==='camp-establish'){establishCamp();return true;}
    else if(action==='camp-skip-construction'){completeCampConstruction();clock.reset();return true;}
    else if(action==='camp-mission')campNotice=campProfile.selectMission(button.dataset.mission as MissionId).message;
    else if(action==='camp-craft')campNotice=campProfile.craft(button.dataset.template as TemplateId,button.dataset.rarity as WeaponRarity).message;
    else if(action==='camp-decompose')campNotice=campProfile.decompose(button.dataset.item!).message;
    else if(action==='camp-module')campNotice=campProfile.equipModule(button.dataset.module as ProtocolId).message;
    else if(action==='camp-draw'){
      if(drawingAntibodies)return true;drawingAntibodies=true;button.disabled=true;
      const requestId=globalThis.crypto?.randomUUID?.()??`summon:${Date.now()}:${Math.random()}`;
      const result=campProfile.drawAntibodies(Number(button.dataset.count) as 1|10,requestId);
      if(result.receipt){
        lastDrawReceipt=result.receipt;
        const reduced = lowEffects || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        summonSequence.start(result.receipt,performance.now(),reduced);sound.unlock();refreshSummonPresentation();
      }
      campNotice=result.message;
      setTimeout(()=>{drawingAntibodies=false;if(!summonSequence.active)overlayKey='';},500);
    }
    else if(action==='camp-retry-save')campNotice=campProfile.save().status.message;
    else {const id=button.dataset.weapon as WeaponId;const result=action==='camp-equip'?campProfile.equip(id):action==='camp-repair'?campProfile.repair(id):action==='camp-upgrade'?campProfile.upgrade(id):action==='camp-buy-antibody'?campProfile.buyAntibody():undefined;if(result)campNotice=result.message;}
    syncCampPresentation();syncCampWeapon();input.clear();clock.reset();overlayKey='';return true;
  }
  if(!action.startsWith('build-'))return false;
  if(action==='build-open'){openBuildMenu();return true;}
  if(action==='build-select'){
    const id=button.dataset.blueprint as BlueprintId;if(!session.state.territory?.construction?.availableBlueprints.includes(id))return true;
    buildMenuOpen=false;session.resume();const p=session.state.player;buildPlacement={blueprintId:id,position:{x:p.x+Math.cos(p.facing)*120,y:p.y+Math.sin(p.facing)*120}};
  }else if(action==='build-confirm'&&buildPlacement){const result=requestConstruction(session.state,buildPlacement);for(const e of result.events)session.emit(e.type,e.data);if(result.accepted)buildPlacement=undefined;}
  else if(action==='build-close'){buildMenuOpen=false;session.resume();}
  else if(action==='build-cancel-placement')buildPlacement=undefined;
  else if(action==='build-resume'||action==='build-cancel-task'){
    buildMenuOpen=false;session.resume();const result=action==='build-resume'?resumeConstruction(session.state):cancelConstruction(session.state);for(const e of result.events)session.emit(e.type,e.data);
  }
  input.clear();clock.reset();overlayKey='';return true;
}
window.addEventListener('keydown',event=>{
  if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
  if(session.state.camp&&campSection==='trial'&&campTrial&&!portraitBlocked&&document.hasFocus()){
    const key=/^(?:Digit|Numpad)([0-3])$/.exec(event.code);
    if(key){event.preventDefault();if(key[1]==='0')campTrial.trigger();else campTrial.skill(Number(key[1]) as 1|2|3);input.clear();return;}
  }
  if(event.code==='Enter'&&buildPlacement&&canAcceptGameInput()){const result=requestConstruction(session.state,buildPlacement);for(const e of result.events)session.emit(e.type,e.data);if(result.accepted)buildPlacement=undefined;input.clear();clock.reset();event.preventDefault();}
  if(event.code==='KeyB'){event.preventDefault();if(buildMenuOpen){buildMenuOpen=false;session.resume();input.clear();clock.reset();overlayKey='';}else openBuildMenu();}
  if(event.code==='KeyE'&&session.state.camp&&!campSection&&!event.repeat&&canAcceptGameInput()){if(session.state.camp.prologue==='arrival'){establishCamp();event.preventDefault();return;}const station=nearbyCampStation(session.state);if(station){interactCampStation(station.id);event.preventDefault();}}
});
window.addEventListener('keydown', event => {
  if (!summonSequence.active) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Escape') {
    event.preventDefault(); event.stopImmediatePropagation(); summonSequence.skip();refreshSummonPresentation();input.clear();return;
  }
  if (event.code === 'Tab') {
    const buttons = [...document.querySelectorAll<HTMLElement>('.summon-cinematic button:not(:disabled),.summon-cinematic [tabindex="0"]')];
    if (!buttons.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && (document.activeElement === first || !buttons.includes(document.activeElement as HTMLElement))) { event.preventDefault();last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first.focus(); }
  }
  else if (event.target instanceof HTMLElement && event.target.closest('.summon-batch-slot') && ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.code)) { event.stopImmediatePropagation(); }
  else if (!['Enter','NumpadEnter','Space'].includes(event.code)) { event.preventDefault();event.stopImmediatePropagation(); }
}, true);
canvas.addEventListener('pointerdown',event=>{if(buildPlacement){const r=canvas.getBoundingClientRect();buildPlacement.position=renderer.camera.screenToWorld({x:event.clientX-r.left,y:event.clientY-r.top});buildPlacement.locked=true;event.preventDefault();event.stopImmediatePropagation();}},true);
function syncTouchOrientation(): void {
  const next = touchMode && innerHeight > innerWidth;
  if (next !== portraitBlocked) { input.clear(); if (session.state.phase === 'playing') session.pause(); clock.reset(); }
  portraitBlocked = next;
  document.body.classList.toggle('touch-portrait', next);
  if (next && session.state.phase === 'playing') { input.clear(); session.pause(); clock.reset(); }
}
function closeMobileDetails(): void {
  setMobileDetailsOpen(false); mobileDetailsOpen = false;
  if (resumeAfterMobileDetails && !portraitBlocked) session.resume();
  resumeAfterMobileDetails = false; input.clear(); clock.reset(); overlayKey = '';
}
session.bus.on('event', event => {
  if (event.type === 'INPUT_RESET_REQUESTED') { input.clear(); resetClockAfterStep = true; }
  if (event.type === 'RUN_PAUSED' || event.type === 'RUN_ENDED') input.clear();
  if (event.type === 'RUN_PAUSED' && session.state.camp && !campSection) { campSection='overview';overlayKey=''; }
  if (event.type === 'RUN_ENDED' && session.state.campaign && runId && !session.state.expedition?.missionId) profile.recordRun(session.state, runId);
  if (event.type === 'RUN_ENDED' && session.state.endless && runId && !session.state.expedition?.missionId) endlessProfile.recordRun(session.state, runId);
  if (event.type === 'CONSTRUCTION_BLUEPRINT_UNLOCKED') {
    const saved=campProfile.unlockBasicBlueprint();blueprintDiscovered=true;
    session.message(saved.persisted?'获得弹射荚蓝图：打开建造，派军团建立回防支点。':campProfile.status.message,6,3);overlayKey='';
  }
  if (event.type === 'CONSTRUCTION_STARTED' || event.type === 'CONSTRUCTION_COMPLETED') blueprintDiscovered=false;
  if(event.type==='MISSION_LOOT_COLLECTED'&&session.state.expedition?.haul)campProfile.saveMissionHaul(session.state.expedition.runId,session.state.expedition.haul);
  if(event.type==='RUN_ENDED'&&session.state.expedition?.missionId)settleCurrentMission(session.state.result?.success?'success':requestedMissionOutcome??'failure');
  else if (event.type === 'RUN_ENDED' && runId && !session.state.territory?.rescueSnapshot) campProfile.abandonExpedition(runId);
  if (event.type === 'TERRITORY_RESCUE_COMPLETED') {
    if(!session.state.expedition?.missionId)endlessProfile.checkpoint(session.state);
    const expedition=session.state.expedition;
    if(expedition?.missionId)settleCurrentMission('success');
    else if(expedition?.pendingLoot){campProfile.settleVictory(expedition.runId,expedition.pendingLoot);if(campProfile.status.mode==='session')campNotice=campProfile.status.message;}
    overlayKey = '';
  }
  if (event.type === 'MIGRATION_WARNING' && !migrationGuideSeen) migrationGuidePending = true;
  if (event.type === 'COUNTER_GUIDE_COMPLETED') profile.acknowledgeCounterGuide('completed');
  if (event.type === 'COUNTER_GUIDE_SKIPPED') profile.acknowledgeCounterGuide('skipped');
});
const el = (id: string) => document.getElementById(id)!;
const formatTime = (seconds: number) => `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
function togglePause() {
  if (summonSequence.active) { summonSequence.skip(); refreshSummonPresentation(); input.clear(); return; }
  if(session.state.camp){campSection=campSection?null:'overview';session.state.phase=campSection?'paused':'playing';input.clear();clock.reset();overlayKey='';return;}
  if(buildMenuOpen){buildMenuOpen=false;session.resume();input.clear();clock.reset();overlayKey='';return;}
  if (mobileDetailsOpen) { closeMobileDetails(); return; }
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
  else if (session.state.phase === 'paused' && !portraitBlocked) session.resume();
}
function start(newSeed?: number, replay?: RunEncounterRecord | null, preserveCurrent = false, mode: 'campaign' | 'endless' = session.state.endless ? 'endless' : 'campaign') {
  if(!trainingFixture){mode='endless';if(campProfile.data.prologue!=='ready'){enterCamp();return;}}
  stopCampTrial?.();stopCampTrial=undefined;campTrial=undefined;campTrialWeaponId=undefined;campTrialCompleted=false;blueprintDiscovered=false;
  if(session.state.expedition?.missionId)settleCurrentMission('withdrawn');
  else if (runId && !session.state.territory?.rescueSnapshot) campProfile.abandonExpedition(runId);
  lastMissionReceipt=undefined;
  delete session.state.camp; campSection=null; buildMenuOpen=false; buildPlacement=undefined; document.body.classList.remove('camp-world');
  setMobileDetailsOpen(false); mobileDetailsOpen = false; resumeAfterMobileDetails = false;
  input.clear(); clock.reset(); help = false; history = false; resumeAfterHelp = false; resumeAfterHistory = false;
  growthDetails = false; resumeAfterGrowthDetails = false;
  profileOpen = false; startingPlanOpen = false; migrationGuide = false; migrationGuidePending = false;
  runId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${performance.now()}:${Math.random().toString(36).slice(2)}`;
  document.body.classList.remove('crisis');
  const options = replay ? replayRunOptions(replay, firstTrait) : newRunOptions(profile.data, firstTrait);
  // Records predating preparation replay with no preloaded protocol. They must
  // not silently borrow the newly selected menu preference.
  if (replay === null) options.preparation = preparationForPlan('field');
  sound.unlock(); session.start(newSeed ?? session.state.seed, preserveCurrent ? { mode, territory: mode === 'endless', recordId: runId } : { ...options, mode, territory: mode === 'endless', recordId: runId });
  if (mode === 'endless') session.configureExpedition(campProfile.beginExpedition(runId,session.state.seed,campProfile.data.selectedMissionId));
  input.setTerritoryMode(!!session.state.territory);
  hostEventDebugReport = '';
  if (debugHostEventId) {
    const result = session.debugHostEvent(debugHostEventId, params.get('hostEventOrgan') === 'lung' ? 'lung' : undefined);
    if (!result.ok) hostEventDebugReport = result.reason ?? '当前场景未满足此卡条件。';
  } else if (hostEventParam) hostEventDebugReport = `未知卡牌 ${hostEventParam}。可用 ID：${HOST_EVENT_IDS.join(' / ')}。`;
  document.body.classList.toggle('endless-mode', !!session.state.endless);
  document.body.classList.toggle('territory-mode', !!session.state.territory);
  syncTouchOrientation();
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
let handledTouchButton: HTMLButtonElement | undefined;
let handledTouchAt = 0;
const modalPointerIntent = new ModalPointerIntent();
window.addEventListener('pointerdown', event => {
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
  modalPointerIntent.pointerDown(event.pointerId, target && app.contains(target) && !target.disabled ? target : null, event.pointerType);
}, { capture: true });
window.addEventListener('pointerup', event => {
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
  modalPointerIntent.pointerUp(event.pointerId, target && app.contains(target) && !target.disabled ? target : null);
}, { capture: true });
window.addEventListener('pointercancel', event => modalPointerIntent.pointerCancel(event.pointerId), { capture: true });
app.addEventListener('pointerdown', event => {
  if (!touchMode || event.pointerType !== 'touch') return;
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action!;
  if (!action.startsWith('tool-') && action !== 'pause' && action !== 'mobile-details' && action !== 'mobile-map' && action !== 'build-open') return;
  // Secondary fingers do not consistently synthesize a click while a stick is
  // held. Activate these battle controls from their real pointerdown instead.
  event.preventDefault(); handledTouchButton = button; handledTouchAt = performance.now(); button.click();
});
app.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  if (!modalPointerIntent.acceptsClick(event as PointerEvent, button, !!button.closest('.overlay'))) { event.preventDefault(); return; }
  if (event.isTrusted && (event as PointerEvent).pointerType !== 'mouse'
    && handledTouchButton === button && performance.now() - handledTouchAt < 800) return;
  const action = button.dataset.action!;
  if (handleExpeditionAction(action,button)) return;
  if (action === 'mobile-details' || action === 'mobile-map') {
    if (!touchMode || !canAcceptGameInput()) return;
    resumeAfterMobileDetails = true; mobileDetailsOpen = true; session.pause(); input.clear(); clock.reset(); updateOverlay(); return;
  }
  if (action === 'mobile-close-details') { closeMobileDetails(); updateOverlay(); return; }
  if (mobileDetailsOpen && ['help', 'history', 'growth-details'].includes(action)) {
    const resume = resumeAfterMobileDetails;
    setMobileDetailsOpen(false); mobileDetailsOpen = false; resumeAfterMobileDetails = false; overlayKey = '';
    // The destination dialog records whether it should return to active play.
    // No simulation can advance between this resume and its synchronous pause.
    if (resume && !portraitBlocked) session.resume();
  }
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
  if (action === 'antibody') { input.queueAction('antibody'); button.blur(); return; }
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
  if (action === 'territory-action') { input.queueAction('territory'); return; }
  if (action === 'weapon-tutorial-dismiss') { dismissWeaponTutorial(session.state); return; }
  if (action.startsWith('tool-')) { input.select(Number(action.at(-1)) as Tool); return; }
  if (action === 'endless-start') { enterCamp(); return; }
  if (action === 'territory-save') { campProfile.save(); endlessProfile.save(); overlayKey = ''; input.clear(); clock.reset(); return; }
  if (action === 'territory-finish' || action === 'territory-guard') {
    if (action === 'territory-finish') session.finishTerritoryRescue();
    else if (session.continueTerritoryGuard()) endlessProfile.checkpoint(session.state);
    input.clear(); clock.reset(); overlayKey = ''; button.blur(); return;
  }
  if (action === 'endless-upgrade') {
    session.chooseCombatUpgrade(button.dataset.draft!, button.dataset.upgrade as EndlessUpgradeId, button.dataset.run!);
    input.clear(); clock.reset(); overlayKey = ''; button.blur(); return;
  }
  if (action === 'endless-stage-continue' || action === 'endless-stage-finish') {
    if (action === 'endless-stage-continue') session.continueEndlessStage();
    else session.finishEndlessStage();
    input.clear(); clock.reset(); overlayKey = ''; button.blur(); return;
  }
  if (action === 'endless-extract') {
    if (session.state.endless && session.state.phase === 'paused' && !session.state.endlessGrowth?.draft && !session.state.growth?.draft) {
      requestedMissionOutcome='withdrawn';session.finish(session.state.territory ? !!session.state.territory.rescueSnapshot : true,
        session.state.territory ? session.state.territory.rescueSnapshot ? '结束守卫，已完成的救援成果保留。' : '主动撤离：本次尚未完成救援。'
          : `主动撤离：已完成 ${session.state.endless.clearedWaves} 波，得分 ${session.state.endless.score}。`);requestedMissionOutcome=undefined;
      input.clear(); clock.reset();
    }
    return;
  }
  if (action === 'start') start(undefined, undefined, false, 'campaign');
  if (action === 'retry') start(undefined, undefined, true);
  if (action === 'new') start((session.state.seed + 2654435761) >>> 0);
  if (action === 'pause' || action === 'continue') togglePause();
  if (action === 'menu') {
    if(session.state.expedition?.missionId&&campProfile.data.activeExpedition){requestedMissionOutcome='withdrawn';session.finish(false,'撤回前哨，保留一半普通资源。');requestedMissionOutcome=undefined;}
    else if(runId&&!session.state.territory?.rescueSnapshot)campProfile.abandonExpedition(runId);
    setMobileDetailsOpen(false); mobileDetailsOpen = false; resumeAfterMobileDetails = false; input.clear(); clock.reset();
    help = false; history = false; growthDetails = false; resumeAfterGrowthDetails = false; profileOpen = false; startingPlanOpen = false; migrationGuide = false; migrationGuidePending = false;
    // Leaving optional guard play settles its latest metrics through RUN_ENDED
    // before replacing the live session; the rescue receipt stays authoritative.
    if (session.state.territory?.stage === 'guard' && session.state.territory.rescueSnapshot)
      session.finish(true, '守卫结束：返回菜单，已完成的救援成果保留。');
    session.menu(); document.body.classList.remove('crisis');
  }
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
  const key = `${summonSequence.view?.key}:${!!state.camp}:${campSection}:${campTrialWeaponId}:${campSection==='trial'?'':campTrialCompleted}:${campProfile.status.code}:${campNotice}:${buildMenuOpen}:${state.territory?.stage}:${state.territory?.rescueSnapshot?.runId}:${endlessProfile.status.code}:${touchMode}:${!!state.endless}:${state.endless?.reward?.step}:${state.endless?.stageCheckpoint}:${state.endlessGrowth?.draft?.id}:${state.phase}:${help}:${lowEffects}:${history}:${growthDetails}:${profileOpen}:${startingPlanOpen}:${startingPlanSelection}:${migrationGuide}:${mobileDetailsOpen}:${portraitBlocked}:${draft?.id}:${draft?.status}:${draft?.selectedOptionId}:${state.growth?.pendingResearch?.id}:${state.battle?.encounter?.firstCounter.guideStatus}`;
  if (key === overlayKey) return;
  overlayKey = key;
  stopCampTrial?.();stopCampTrial=undefined;
  const challengeHome = state.phase === 'menu' && !trainingFixture && milestone === 'G3' && !help && !history;
  app.classList.toggle('challenge-home-active', challengeHome);
  el('hud').hidden = state.phase === 'menu' || state.phase === 'result';
  // Keep keyboard navigation inside the visible overlay as well as mouse input.
  const modalActive = profileOpen || migrationGuide || help || history || growthDetails || mobileDetailsOpen || state.phase !== 'playing';
  document.querySelector<HTMLElement>('.topbar')!.inert = modalActive;
  el('hud').inert = modalActive;
  const host = el('overlay-host');
  setMobileDetailsOpen(false);
  if (state.camp) {
    const summonView = summonSequence.view;
    const cinematic = host.querySelector<HTMLElement>('.summon-cinematic');
    if(summonSequence.active&&summonView&&cinematic?.dataset.summonReceipt===summonView.receipt.id){
      if(updateCampSummonOverlay(cinematic,summonView)){
        (cinematic.querySelector<HTMLButtonElement>('.summon-next')??cinematic.querySelector<HTMLButtonElement>('[data-action="camp-summon-skip"]'))?.focus({preventScroll:true});
      }
      return;
    }
    host.innerHTML=campSection?campOverlay(campSnapshot,campSection,(state.camp.constructionSeconds??0)/CAMP_CONSTRUCTION_SECONDS,summonSequence.active?'':campNotice,{trialCompleted:campTrialCompleted,trialWeaponId:campTrialWeaponId,nearbyStationId:nearbyCampStation(state)?.id},summonSequence.active?null:lastDrawReceipt)+campSummonOverlay(summonSequence.view):'';
    if(drawingAntibodies||summonSequence.active)host.querySelectorAll<HTMLButtonElement>('[data-action="camp-draw"]').forEach(button=>button.disabled=true);
    if(summonSequence.active){
      const underlying=host.querySelector<HTMLElement>('.camp-overlay');if(underlying){underlying.inert=true;underlying.setAttribute('aria-hidden','true');}
      (host.querySelector<HTMLButtonElement>('.summon-next')??host.querySelector<HTMLButtonElement>('[data-action="camp-summon-skip"]'))?.focus({preventScroll:true});
    } else if(campSection==='summon'&&lastDrawReceipt){
      host.querySelector<HTMLElement>('.camp-content')?.scrollTo(0,0);
    }
    const trialCanvas=host.querySelector<HTMLCanvasElement>('#camp-trial-canvas');
    if(trialCanvas&&campTrial)stopCampTrial=startCampWeaponTrial(trialCanvas,campTrial,()=>!!session.state.camp&&campSection==='trial'&&!portraitBlocked&&document.hasFocus());
    return;
  }
  if (buildMenuOpen) { host.innerHTML=constructionMenu(state);return; }
  if (challengeHome) { host.innerHTML = mainMenuOverlay(endlessProfile.load(), touchMode, campProfile.data.campUnlocked,campProfile.data.prologue); return; }
  if(state.expedition?.missionId&&state.phase==='result'&&!help){host.innerHTML=missionResultOverlay(state,lastMissionReceipt,campProfile.status,lowEffects);return;}
  if (mobileDetailsOpen) { host.innerHTML = mobileDetailsMarkup; setMobileDetailsOpen(true); return; }
  if (growthDetails) {
    host.innerHTML = growthDetailsOverlay(state, growthDetailsReturnLabel);
    host.querySelector<HTMLButtonElement>('[data-action="close-growth-details"]')?.focus({ preventScroll: true });
    return;
  }
  if (startingPlanOpen) { host.innerHTML = startingPlanOverlay(profile.data); return; }
  if (profileOpen) { host.innerHTML = profileOverlay(profile.data, profile.status); return; }
  if (migrationGuide) { host.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="首次迁移指引"><div class="eyebrow">THE NEXT CHAMBER / 首次迁移</div><h2>病毒要去另一个器官了。</h2><p>倒数已暂停。你可以去器官出口（见小地图）按 E 追击，或在隔离闸（见小地图）按 E 留守 2 秒封锁。放任会让肺部新增感染源，仍可补救。</p><p>追击后清掉迁移小体，或关闭肺部气道；器官图会显示心脏残留风险，出口可双向返回。此说明之后可在作战手册回看。</p><div class="actions"><button class="primary" data-action="close-migration-guide">明白了，继续作战</button></div></section></div>`; return; }
  if(state.expedition?.missionId&&(help||state.phase==='paused')){host.innerHTML=missionPauseOverlay(state,help,touchMode,lowEffects);return;}
  if (state.endless) {
    host.innerHTML = (!help ? territoryVictoryOverlay(state, endlessProfile.load()) ?? territoryResultOverlay(state, endlessProfile.load(), campProfile.data.campUnlocked) : null)
      ?? (!help && state.phase === 'paused' ? draftOverlay(state) : null)
      ?? endlessOverlay(state, help, lowEffects, endlessProfile.load(), touchMode) ?? '';
    if(state.territory?.stage==='victory'&&campProfile.status.mode==='session')host.querySelector('.territory-victory')?.insertAdjacentHTML('beforeend','<p role="status">营地奖励保存失败，暂存于本页。请恢复存储后重试。</p><button data-action="territory-save">重试保存营地奖励</button>');
    return;
  }
  if (state.battle) {
    host.innerHTML = (!help && !history && state.phase === 'paused' ? researchDirectionOverlay(state) ?? draftOverlay(state) : null) ?? battleOverlay(state, help, resumeAfterHelp, lowEffects, history) ?? '';
    if (state.growth && help) host.querySelector('.help-grid')?.insertAdjacentHTML('afterend', growthHelpMarkup);
    if (help) host.querySelector('.help-grid')?.insertAdjacentHTML('afterend', encounterHelpMarkup(state));
    if (state.growth && history) host.querySelector('h2')?.insertAdjacentHTML('afterend', growthHistoryMarkup(state));
    if (state.growth && (help || history || state.phase === 'paused' || state.phase === 'result') && !host.querySelector('[data-action="growth-details"]')) host.querySelector('.actions')?.insertAdjacentHTML('beforeend', growthDetailsEntryMarkup);
    if (state.campaign) host.querySelector('.switches')?.insertAdjacentHTML('beforeend', `<button data-action="sound">声音 ${sound.enabled?'开':'关'}</button>`);
    if (state.campaign && state.phase === 'result' && !help && !history) host.querySelector('.actions')?.insertAdjacentHTML('afterbegin', endlessMenuEntry(endlessProfile.load()));
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
  updateHostEventHud(s, hostEventDebugReport);
  updateHostEventAnnouncement(s, { lowEffects });
  document.body.classList.toggle('endless-mode', !!s.endless);
  document.body.classList.toggle('territory-mode', !!s.territory);
  updateTerritoryHud(s);
  if (s.endless) {
    document.body.classList.remove('dual-organ');
    updateEndlessHud(s);
    updateGrowthHud(s);
    el('message').textContent = s.messageUntil > s.elapsed ? s.message : s.battle?.objective ?? '';
    updateCommonHud();updateMissionHud(s); refreshHudRects(); return;
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
  const rects=readVisibleHudRects(canvas, {
    active: session.state.phase === 'playing', now: performance.now(),
    player: { left: point.x - 27 * scale, right: point.x + 27 * scale, top: point.y - 68 * scale, bottom: point.y + 10 * scale },
  });
  renderer.setHudRects(rects);
  if(!touchMode)desktopFlightViewport=deriveDesktopAimViewport(renderer.camera.width,renderer.camera.height,rects);
}
function refreshMobileAimViewport(): void {
  if (!touchMode) return;
  const move = document.querySelector<HTMLElement>('[data-stick="move"]')?.getBoundingClientRect();
  const dash = document.querySelector<HTMLElement>('[data-touch-action="dash"]')?.getBoundingClientRect();
  const rect = canvas.getBoundingClientRect();
  if (!move?.width || !dash?.width) { mobileAimViewport = undefined; return; }
  mobilePreviewHeaderBottom = Math.max(...['.mobile-readouts', '.mobile-map', '.mobile-top-actions', '.mobile-notice', '.mobile-warning-strip']
    .map(selector => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().bottom ?? rect.top)) - rect.top + 8;
  mobileAimViewport = { left: move.right - rect.left + 12, right: dash.left - rect.left - 10,
    top: Math.max(mobilePreviewHeaderBottom, Math.min(80, rect.height * .3)), bottom: move.bottom - rect.top - 10 };
}
function updateCommonHud() {
  const s = session.state;
  const tutorial = endlessTutorialHint(s, touchMode);
  if (tutorial) el('message').textContent = tutorial;
  if (touchMode) el('message').textContent = touchCopy(el('message').textContent ?? '', !!s.territory);
  if (touchMode && mobileDetailsOpen) adaptTouchText(el('mobile-details-content'));
  updateMobileHud(s, { blocked: !canAcceptGameInput(), portrait: portraitBlocked });
  if (touchMode && !mobileAimViewport) refreshMobileAimViewport();
  touchControls.update();
  const combat = s.endlessGrowth ? endlessCombatStats(s.endlessGrowth) : undefined;
  const equipment=s.expedition?weaponCombatProfile(s.expedition.loadout):undefined;
  document.querySelector('.status-chip')!.textContent = s.camp ? '缓流膜湾 / 微观前哨' : s.expedition?.missionId ? `${MISSIONS[s.expedition.missionId].name} / ${s.endless?.wave ?? 1}` : s.endless ? `${s.territory ? '微区清剿' : '连续挑战'} / ${s.endless.wave}` : s.battle?.organId === 'lung' ? 'LUNG / 02' : 'HEART / 01';
  el('dash-ready').textContent = s.player.dashReady > s.elapsed ? `${(s.player.dashReady-s.elapsed).toFixed(1)}s`:'就绪';
  el('dash-ready').previousElementSibling!.textContent = combat?.dashDamage ? '冲刺挥斩' : '冲刺';
  const chargeLabel = el('charged-slash-ready');
  chargeLabel.hidden = !s.endless || !!s.weaponCombat;
  chargeLabel.textContent = s.chargedSlash ? `蓄能 ${Math.round(chargedSlashProgress(s.chargedSlash.startedAt, s.elapsed) * 100)}% · 松开发射` : (s.chargedSlashReadyAt ?? 0) > s.elapsed ? `剑气 ${(s.chargedSlashReadyAt! - s.elapsed).toFixed(1)}s` : '长按蓄能剑气';
  el('scan-ready').textContent = s.scanReady > s.elapsed ? `${(s.scanReady-s.elapsed).toFixed(1)}s`:'就绪';
  el('run-time').textContent = `SEED ${s.seed}　 /　${formatTime(s.elapsed)}`;
  document.querySelectorAll<HTMLButtonElement>('.tool').forEach((button,index)=>{
    if (s.weaponCombat) {
      const skill = weaponSkillViews(s)[index];
      button.classList.remove('selected'); button.setAttribute('aria-pressed','false');
      button.setAttribute('aria-label',`${skill.slot} ${skill.name}，${skill.description}`);
      if (button.dataset.weaponSkillId !== skill.id) {
        button.querySelector('strong')!.innerHTML = `${weaponSkillIconMarkup(skill.id)}<span>${skill.name}</span>`;
        button.dataset.weaponSkillId = skill.id;
      }
      button.querySelector('small')!.textContent = skill.remaining > 0 ? `${skill.remaining.toFixed(1)}秒` : skill.description;
      button.title = `${skill.name}：${skill.description} · 冷却${skill.cooldown}秒`;
      el(`charge-${index+1}`).style.width = `${Math.max(0,1-skill.remaining/skill.cooldown)*100}%`;
      return;
    }
    const tool=(index+1) as Tool, cooldown = (tool === 1 ? combat?.primaryCooldown : tool === 2 ? combat?.areaCooldown : undefined) ?? BALANCE.cooldowns[tool];
    const selected = s.tool === tool && !(s.territory && tool === 3);
    button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
    el(`charge-${tool}`).style.width=`${s.territory && tool === 3 ? 100 : Math.max(0,1-Math.max(0,s.cooldowns[tool]-s.elapsed)/cooldown)*100}%`;
    if (tool === 1) {
      button.querySelector('strong')!.textContent = s.endless ? '粒子净化' : '精确净化';
      button.setAttribute('aria-label', `1 ${s.endless ? '粒子净化' : '精确净化'}`);
      button.querySelector('small')!.textContent = combat ? `${equipment?WEAPONS[equipment.weaponId].name+' · ':''}${combat.shotRays} 弹 · 贯穿 +${combat.pierceCount+(equipment?.extraPierce??0)}` : '单点 · 快速冷却';
    }
    if (tool === 2) {
      button.querySelector('strong')!.textContent = s.endless ? '净化能量炮' : '牵引裂解';
      button.setAttribute('aria-label', `2 ${s.endless ? '净化能量炮' : '牵引裂解'}`);
      button.querySelector('small')!.textContent = s.endless ? `爆心 ${combat?.areaRadius ?? 96}${(combat?.catalysisDamage ?? 0) > 0 ? ' · 追加余震' : ' · 按住连发'}` : '聚拢 · 延迟爆发';
      if (!s.endless && s.traction) button.querySelector('small')!.textContent = s.traction.stage === 'guiding' ? '拖动鼠标 · 松手引爆' : s.traction.stage === 'aiming' ? '按住导流 / 轻点快放' : '聚拢中 · 即将爆发';
    }
    if (tool === 3 && s.territory) {
      button.querySelector('strong')!.textContent = territoryContextView(s).action === 'repair' ? '修复心核' : '净化组织';
      button.querySelector('small')!.textContent = '靠近按3 · 保留当前武器';
      button.setAttribute('aria-label', '3 净化附近组织或修复心核，不切换武器');
    } else if (tool === 3) {
      const title = button.querySelector('strong')!;
      if (title.innerHTML !== desktopToolTitles[index]) title.innerHTML = desktopToolTitles[index];
      button.querySelector('small')!.textContent = '治疗 · +25 完整度';
      button.setAttribute('aria-label', '3 组织修复');
    }
    if (touchMode) button.querySelector('strong')!.textContent = tool === 2 && s.endless ? '能量炮' : tool === 3 && s.territory ? territoryContextView(s).action === 'repair' ? '修复心核' : '净化组织' : tool === 1 && s.territory ? '射击' : touchToolLabels[index];
  });
  const weaponContext = el('weapon-context'); weaponContext.hidden = !s.weaponCombat;
  if (s.weaponCombat) {
    canvas.setAttribute('aria-label', '微区清剿：WASD移动，左键普攻，123武器技能，F净化修复，Q脚下驻军，Space冲刺');
    el('weapon-primary-label').textContent = `${WEAPONS[s.weaponCombat.loadout.weaponId].name} · 左键普攻`;
    const context = territoryContextView(s), button = weaponContext.querySelector<HTMLButtonElement>('[data-action="territory-action"]')!;
    button.querySelector('strong')!.textContent = context.action === 'repair' ? '修复稳态锚' : '净化组织';
    button.dataset.available = String(context.action === 'purify' || context.action === 'repair');
    button.title = 'F：靠近感染节点净化，或抢修附近受损稳态锚';
  }
  document.querySelector('.micro-footer')!.textContent = s.expedition?.missionId || s.camp ? 'v0.18.0 · 微观前哨 / 清剿锻造 / 血流接引' : s.territory ? 'v0.17.0 · 蜂巢针枪 / 回旋刃弓'
    : s.endless ? 'v0.17.0 · 连续挑战回归场景' : `v0.17.0 · ${s.battle ? '器官联防' : '基础训练'} / 奇幻生态`;
  document.querySelector('.dock-wrap .ability:last-child .ability-name')!.textContent = s.territory ? '脚下驻军' : s.battle ? '扫描 / 召集' : '扫描';
  document.querySelectorAll<HTMLButtonElement>('[data-action="sound"]').forEach(button => { button.textContent = `声音 ${sound.enabled?'开':'关'}`; });
  document.querySelector<HTMLButtonElement>('[data-action="pause"]')!.hidden = s.phase === 'menu' || s.phase === 'result';
}
let lastHud = 0;
let lastFrame: number | undefined;
let lastTouchPreviewActive = false;
const cameraFollowPolicy = new CameraFollowPolicy();
let lastClockRevision = clock.revision;
function frame(now: number) {
  if (summonSequence.active) {
    if (!session.state.camp || campSection !== 'summon') { summonSequence.clear(); overlayKey=''; }
    else if (summonSequence.update(now)) refreshSummonPresentation();
  }
  syncTouchOrientation();
  // Input is projected through the same camera that produced the last visible frame.
  const stepPositions: { x: number; y: number }[] = [];
  clock.advance(now, dt => {
    stepPositions.push({ x: session.state.player.x, y: session.state.player.y });
    motion.step(session.state, () => {
      const commands=input.frame(input.getAim(session.state, point => renderer.camera.screenToWorld(point)));
      if(session.state.camp){
        advanceCampScene(session.state,commands,dt);
        const camp=session.state.camp;
        if(camp.activeConstruction){camp.constructionSeconds=(camp.constructionSeconds??0)+dt;if(camp.constructionSeconds>=CAMP_CONSTRUCTION_SECONDS)completeCampConstruction();}
      }
      else session.step(commands,dt);
      renderer.witnessSimulation(session.state);
    });
    stepPositions.push({ x: session.state.player.x, y: session.state.player.y });
  }, session.state.phase === 'playing');
  if (clock.discontinuity) motion.reset();
  else if (clock.revision !== lastClockRevision) motion.reset(session.state.phase === 'paused' || motion.holdingPause);
  if (resetClockAfterStep) { clock.reset(); motion.reset(session.state.phase === 'paused'); resetClockAfterStep = false; }
  lastClockRevision = clock.revision;
  if (migrationGuidePending && session.state.phase === 'playing' && !session.state.growth?.draft && !session.state.growth?.pendingResearch) {
    migrationGuidePending = false; migrationGuideSeen = true; migrationGuide = true; session.pause(); input.clear(); clock.reset();
  }
  presentedState = motion.present(session.state, clock.alpha);
  const cameraScope = `${session.state.seed}:${session.state.runMetrics?.runId ?? session.state.growth?.runId ?? ''}:${session.state.battle?.organId ?? 'training'}`;
  const dt = lastFrame === undefined ? 0 : Math.max(0, (now - lastFrame) / 1000);
  const cameraDecision = cameraFollowPolicy.next(cameraScope, session.state.phase, session.state.player, dt, clock.discontinuity, stepPositions);
  const previewFraming = input.resolvePreview(presentedState, point => renderer.camera.screenToWorld(point));
  const framing = touchMode || previewFraming?.kind === 'cannon' ? previewFraming : undefined;
  if (!cameraDecision.hold) prepareCombatCamera(presentedState, { deltaSeconds: dt, snap: cameraDecision.snap,
    ...(framing && !framing.cancelled ? { aim: framing.aim, viewport: touchMode?mobileAimViewport:desktopFlightViewport,
      ...(framing.kind === 'cannon' ? { aimRadius: framing.radius??territoryCannonView(session.state).radius } : {}) } : {}) });
  lastFrame = now;
  const touchPresentation = input.getPresentation(presentedState, point => renderer.camera.screenToWorld(point));
  const cannonPreview = touchPresentation.preview?.kind === 'cannon' ? touchPresentation.preview : undefined;
  if(buildPlacement&&!buildPlacement.locked&&!touchMode)buildPlacement.position=input.getAim(presentedState,point=>renderer.camera.screenToWorld(point));
  updateConstructionPlacement(app,session.state,buildPlacement);
  updateConstructionDiscovery(app,session.state,blueprintDiscovered&&!buildPlacement);
  updateCampToolbar();
  updateTouchSkillPreview(touchPresentation.preview);
  // The preview label follows every displayed frame; include its current box,
  // and newly shown cancel/guide areas, before placing world labels this frame.
  if (touchMode && (touchPresentation.preview || lastTouchPreviewActive)) refreshHudRects();
  lastTouchPreviewActive = !!touchPresentation.preview;
  // A skill wheel can preview another tool without selecting or firing it in
  // the simulation. The authoritative input changes only on a real commit.
  renderer.render(touchPresentation.preview && !cannonPreview ? { ...presentedState, tool: touchPresentation.tool } : presentedState,
    cannonPreview ? input.getAim(presentedState, point => renderer.camera.screenToWorld(point)) : touchPresentation.aim, { lowEffects, cameraPrepared: true,
      authoritativeState: touchPresentation.preview && !cannonPreview ? { ...session.state, tool: touchPresentation.tool } : session.state,
      aimRange: cannonPreview ? undefined : touchPresentation.preview?.range, aimCancelled: touchPresentation.preview?.cancelled,
      ...(buildPlacement?{constructionPreview:buildPlacement}:{}),
      ...(cannonPreview ? { cannonPreview: { aim: cannonPreview.aim, cancelled: cannonPreview.cancelled } } : {}) });
  sound.update(session.state);
  if(campTrial&&campTrial.view.hits>0)campTrialCompleted=true;
  updateOverlay();
  decorateTouchOverlay();
  if (now-lastHud > 50) { updateHud(); lastHud=now; }
}
function syncControlLayout(): boolean {
  const next = readTouchLayout();
  if (next === touchMode) return false;
  input.clear(); if (session.state.phase === 'playing') session.pause();
  // Return the real map/status panels before the desktop HUD becomes visible.
  setMobileDetailsOpen(false); mobileDetailsOpen = false; resumeAfterMobileDetails = false;
  for (const [node, record] of adaptedTouchText) if (node.nodeValue === record.adapted) node.nodeValue = record.original;
  adaptedTouchText.clear();
  touchMode = next; applyControlLayout();
  mobileAimViewport = undefined; desktopFlightViewport=undefined;lastTouchPreviewActive = false;
  handledTouchButton = undefined; handledTouchAt = 0;
  overlayKey = ''; delete el('overlay-host').dataset.touchDecorated;
  updateTouchSkillPreview(undefined);
  return true;
}
function resizeViewport(): void {
  const changed = syncControlLayout();
  syncTouchOrientation(); motion.reset(); cameraFollowPolicy.reset(); presentedState = session.state;
  renderer.resize();
  if (changed) { updateOverlay(); decorateTouchOverlay(); updateHud(); }
  refreshMobileAimViewport(); prepareCombatCamera(session.state); refreshHudRects(); clock.reset();
}
window.addEventListener('resize', resizeViewport);
window.visualViewport?.addEventListener('resize', resizeViewport);
coarsePointer.addEventListener('change', resizeViewport);
window.addEventListener('orientationchange', () => {
  if (!touchMode) return;
  input.clear(); if (session.state.phase === 'playing') session.pause();
  resizeViewport();
});
window.addEventListener('pagehide', () => { input.clear(); if (session.state.phase === 'playing') session.pause(); clock.reset(); });
function decorateTouchOverlay(): void {
  if (!touchMode) return;
  const host = el('overlay-host');
  if (!host.firstElementChild || host.dataset.touchDecorated === overlayKey) return;
  host.dataset.touchDecorated = overlayKey;
  if (help) {
    const grid = host.querySelector('.help-grid');
    if (grid) grid.innerHTML = session.state.weaponCombat ? '<div>左杆移动，右盘按住普攻；123是武器技能</div><div>点按技能沿当前方向释放，拖动可单独瞄准，松手施放</div><div>左侧驻军在脚下部署；净化按钮靠近节点点按启动</div><div>冲刺只负责位移；靠近已建弹射荚按住弹射、松手起飞</div><div>拖至取消区松手取消；抗体与建设在战术菜单</div>' : session.state.endless ? `<div>左摇杆移动；右下射击盘按住连射、拖动瞄准</div><div>${session.state.territory ? '驻防：点按立即在脚下部署；满两支时调最近团到脚下' : '能量炮 / 免疫：按下预览、拖动瞄准、松手施放'}</div><div>${session.state.territory ? '净化组织点按即用；能量炮拖动瞄准后松手施放' : '修复：按下预览，拖向组织，松手施放'}</div>${session.state.territory ? '<div>靠近弹射器，按住弹射选择落点，松手起飞；红色落点不可降落</div>' : ''}<div>拖入 × 区域再松手可取消技能或蓄能</div><div>点冲刺立即位移；长按蓄能，拖动定向，松开发射剑气</div><div>满蓄1.25秒发射5道剑气；释放后独立冷却6秒</div>` : '<div>左摇杆移动，右下射击盘按住攻击、拖动瞄准</div><div>裂解 / 修复 / 免疫：按下预览，松手施放</div><div>拖入 × 区域再松手取消</div><div>解锁导流后拖入 ✓ 圈确认，再拖动引导，松手引爆</div><div>点冲刺位移；靠近装置点击交互</div>';
  }
  adaptTouchText(host);
  host.querySelectorAll('.intro-footnote').forEach(node => { node.textContent = '触屏 v3 候选 · 待 iPhone 复测 · 左杆移动 / 右侧技能轮盘 · 完全离线'; });
}
function updateTouchSkillPreview(preview: SkillPresentation | undefined): void {
  const host = document.getElementById('mobile-skill-preview');
  if (!host) return;
  host.hidden = !touchMode || !preview || session.state.phase !== 'playing';
  if (!preview || host.hidden) return;
  if (!host.firstElementChild) host.innerHTML = '<div class="mobile-preview-range"></div><div class="mobile-preview-ray"></div><div class="mobile-preview-target"></div><span class="mobile-preview-label"></span>';
  host.dataset.kind = String(preview.kind); host.dataset.cancelled = String(preview.cancelled);
  const origin = renderer.camera.worldToScreen(preview.kind === 'cannon' ? (preview.origin ?? territoryCannonView(presentedState).origin) : presentedState.player), aim = renderer.camera.worldToScreen(preview.aim), scale = renderer.camera.scale;
  const position = (selector: string, point: { x: number; y: number }, radius: number) => {
    const element = host.querySelector<HTMLElement>(selector)!;
    element.style.left = `${point.x}px`; element.style.top = `${point.y}px`;
    element.style.width = `${radius * scale * 2}px`; element.style.height = `${radius * scale * .72 * 2}px`;
  };
  position('.mobile-preview-range', origin, preview.range);
  position('.mobile-preview-target', aim, preview.kind === 'weapon' ? preview.radius || 12 : preview.kind === 'cannon' ? (preview.radius ?? territoryCannonView(session.state).radius) : preview.kind === 2 ? session.state.endlessGrowth ? endlessCombatStats(session.state.endlessGrowth).areaRadius : session.state.traction?.radius ?? BALANCE.areaRadius : 30);
  const dx = aim.x - origin.x, dy = aim.y - origin.y, ray = host.querySelector<HTMLElement>('.mobile-preview-ray')!;
  ray.style.left = `${origin.x}px`; ray.style.top = `${origin.y}px`; ray.style.width = `${Math.hypot(dx, dy)}px`; ray.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  const label = host.querySelector<HTMLElement>('.mobile-preview-label')!;
  label.textContent = preview.valid === false ? preview.hint ?? '落点受阻 · 调整方向'
    : preview.cancelled ? '松手取消' : preview.hint ? `${preview.hint} · 拖至 × 取消`
      : preview.kind === 'weapon' ? `松手释放${weaponSkillViews(session.state).find(skill=>skill.slot===preview.weaponSlot)?.name ?? '武器技能'} · 拖至 × 取消`
      : preview.phase === 'guiding' ? '导流中 · 松手引爆' : `松手${preview.kind === 'cannon' ? '弹射' : preview.kind === 'charge' ? '发射剑气' : preview.kind === 2 ? session.state.endless ? '发射能量炮' : '裂解' : preview.kind === 3 ? '修复' : '指挥'} · 拖至 × 取消`;
  const halfWidth = label.offsetWidth / 2;
  const left = (mobileAimViewport?.left ?? 8) + halfWidth, right = (mobileAimViewport?.right ?? innerWidth - 8) - halfWidth;
  label.style.left = `${right >= left ? Math.max(left, Math.min(right, aim.x)) : ((mobileAimViewport?.left ?? 0) + (mobileAimViewport?.right ?? innerWidth)) / 2}px`;
  const labelHeight = label.offsetHeight;
  const labelY = aim.y - 24 - labelHeight >= mobilePreviewHeaderBottom ? aim.y - 24 : aim.y + labelHeight + 20;
  label.style.top = `${Math.max(mobilePreviewHeaderBottom + labelHeight, Math.min(innerHeight - 8, labelY))}px`;
}
function adaptTouchText(root: HTMLElement): void {
  for (const node of adaptedTouchText.keys()) if (!node.isConnected) adaptedTouchText.delete(node);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('script,style,code')) continue;
    if (node.nodeValue) {
      const text = node as Text, previous = adaptedTouchText.get(text);
      if (previous && text.nodeValue === previous.adapted) continue;
      const original = text.nodeValue!, adapted = touchCopy(original, !!session.state.territory);
      if (adapted !== original) { adaptedTouchText.set(text, { original, adapted }); text.nodeValue = adapted; }
    }
  }
}
syncTouchOrientation();
prepareCombatCamera(session.state); updateOverlay(); updateHud();
renderer.ready.then(() => {
  app.inert = false; app.removeAttribute('aria-busy');
  prepareCombatCamera(session.state); refreshHudRects(); clock.reset(); renderer.startFrameLoop(frame);
}).catch(error => {
  app.inert = false; app.removeAttribute('aria-busy');
  const host = document.querySelector<HTMLElement>('#overlay-host')!;
  host.innerHTML = '<div class="overlay"><section class="modal"><h2>画面暂未加载完成</h2><p class="art-load-error"></p><button class="primary" id="retry-art">重新加载</button></section></div>';
  host.querySelector('.art-load-error')!.textContent = error instanceof Error ? error.message : String(error);
  host.querySelector('#retry-art')!.addEventListener('click', () => location.reload());
});

// Read-only diagnostics for browser regression. Inputs always use the real DOM.
Object.defineProperty(window, '__viral', { value: Object.freeze({
  version: '0.18.0-microfront', snapshot: () => session.snapshot(),
  campProfile: () => campProfile.load(),
  toScreen: (point: { x: number; y: number }) => renderer.camera.worldToScreen(point),
  toWorld: (point: { x: number; y: number }) => renderer.camera.screenToWorld(point),
  diagnostics: () => ({ ...renderer.diagnostics(session.state), touch: input.getPresentation(presentedState, point => renderer.camera.screenToWorld(point)),campTrial:campTrial?structuredClone(campTrial.view):null }),
}), writable: false });
