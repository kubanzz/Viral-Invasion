import type { OrganId } from '../game/battleTypes';
import type { GameState } from '../game/types';
import { BALANCE } from '../game/types';
import { TRAITS, BATTLE_BALANCE } from '../game/battleConfig';
import { CAMPAIGN_BALANCE } from '../game/organConfig';
import { tacticalHistoryMarkup } from './tacticalHistory';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const organName = (id: OrganId) => id === 'heart' ? '心脏' : '肺部';
const get = (id: string) => document.getElementById(id)!;
const set = (id: string, value: string) => { get(id).textContent = value; };
const html = (id: string, value: string) => { const element = get(id); if (element.innerHTML !== value) element.innerHTML = value; };

export const campaignHudMarkup = `
  <aside class="organ-overview" id="organ-overview" aria-label="器官状态图" hidden><div class="organ-overview-title">器官导航 <small>白点为你 · 框为视野</small></div><canvas id="tactical-map" width="196" height="120" aria-label="当前器官小地图：感染源、研究、抢修及出口"></canvas><div id="organ-map"></div><p id="migration-outcome"></p></aside>
  <section class="migration-card" id="migration-card" aria-label="迁移抉择" role="status" hidden>
    <div class="campaign-card-title"><strong id="migration-title">△ 病毒向肺部迁移</strong><b id="migration-countdown"></b></div>
    <p id="migration-summary"></p>
    <div class="migration-choices" id="migration-choices">
      <button data-action="migration-pursue"><strong>追击</strong><small>器官出口（见小地图） E · 肺部拦截</small></button>
      <button data-action="migration-block"><strong>封锁</strong><small>隔离闸（见小地图） E · 停留 2s</small></button>
      <button data-action="migration-ignore"><strong>放任</strong><small>肺部新增感染源</small></button>
    </div>
    <div class="migration-progress" id="migration-progress" hidden><div class="meter"><i id="migration-progress-meter"></i></div><small id="migration-progress-label"></small></div>
    <p class="migration-note" id="migration-note">战斗继续；追击和封锁需要靠近对应装置。</p>
  </section>
  <section class="mother-core-panel" id="mother-core-panel" aria-label="母巢状态" role="status" hidden>
    <div class="campaign-card-title"><strong id="mother-core-title">双特性母巢</strong><b id="mother-core-hp"></b></div>
    <div class="mother-core-health" id="mother-core-health"><i id="mother-core-meter"></i><span id="mother-core-floor" hidden></span></div>
    <div class="mother-core-phase" id="mother-core-phase"></div>
    <div class="mother-core-traits" id="mother-core-traits"></div>
    <p id="mother-core-membrane"></p>
  </section>`;

function arenaSummary(state: GameState, id: OrganId): string {
  const c = state.campaign!, arena = c.arenas[id], current = c.activeOrganId === id;
  const hp = current ? state.tissue.hp : arena.tissue.hp;
  const sources = arena.targets.filter(target => target.hp > 0 && target.role === 'source').length;
  const status = !arena.activated ? '尚未激活' : current ? '当前器官' : hp < 50 ? '需返回抢修' : sources ? '离场仍有感染源' : '感染源已清';
  const risk = arena.backgroundLoss > 0 ? `离场损伤 −${arena.backgroundLoss.toFixed(1)}` : sources && arena.activated && !current ? '开放感染源会低频侵蚀' : '';
  return `<div class="organ-map-node ${current ? 'current' : ''} ${arena.activated ? 'activated' : 'dormant'} ${hp < 50 && arena.activated ? 'at-risk' : ''}"><span class="organ-map-symbol">${id === 'heart' ? '♥' : '◖◗'}</span><div><div class="organ-map-label"><b>${organName(id)}</b><strong>${Math.ceil(hp)}%</strong></div><div class="meter"><i style="width:${Math.max(0, Math.min(100, hp))}%"></i></div><small>${status}${risk ? ` · ${risk}` : ''}</small></div></div>`;
}

function migrationOutcome(state: GameState): string {
  const migration = state.campaign!.migration;
  if (!migration.choice) return migration.status === 'locked' ? '第二次变异后，器官通道开放。' : '迁移正在发生，先作出抉择。';
  if (migration.choice === 'block') return '封锁完成 · 病毒滞留心脏，出口仍可通行。';
  if (migration.choice === 'ignore') return '放任迁移 · 肺部承担新增感染源风险。';
  return migration.interceptSucceeded === null ? '追击中 · 清除迁移小体或封闭气道。' : migration.interceptSucceeded ? '追击成功 · 已阻止额外感染源。' : '追击错失 · 留意肺部新源并及时净化。';
}

export function updateCampaignHud(state: GameState): void {
  const c = state.campaign, overview = document.getElementById('organ-overview');
  document.body.classList.toggle('dual-organ', !!c);
  if (!overview) return;
  overview.hidden = !c;
  get('migration-card').hidden = true; get('mother-core-panel').hidden = true;
  if (!c || !state.battle) return;
  const b = state.battle, current = c.activeOrganId;
  document.body.dataset.organ = current;
  const chip = document.querySelector('.status-chip'); if (chip) chip.textContent = current === 'heart' ? 'HEART / 01' : 'LUNG / 02';
  set('organ-integrity-name', `${organName(current)}完整度`);
  html('organ-map', arenaSummary(state, 'heart') + arenaSummary(state, 'lung'));
  set('migration-outcome', migrationOutcome(state));
  set('battle-progress', `感染源 ${c.progress.sourceClears} / ${c.progress.sourceTotal}　进化精英 ${c.progress.eliteClears} / 2`);
  const objective = b.objective.replaceAll('CARAPACE', '晶壳').replaceAll('FISSION', '裂殖').replaceAll('MIMIC', '潜伏');
  set('battle-objective', objective);
  set('objective-title', b.readyToRetest ? '指标达标，主动复测' : c.core.status === 'active' ? '清除双特性母巢' : c.core.status === 'ready' ? '前往复测台，唤醒母巢' : c.phase === 'migration' ? '在迁移前作出抉择' : '守住这道生命防线');
  const flow = c.arenas.lung.flow;
  if (current === 'lung' && flow) {
    set('pulse-phase', `${flow.phase === 'inhale' ? '⇢ 吸气 · 聚拢' : '⇣ 呼气 · 分散'} ${flow.phaseRemaining.toFixed(1)}s`);
    set('pulse-ready', flow.airwayOpen ? '气道开启 · 气流与传播有效' : '气道关闭 · 气流与传播停止');
    set('pulse-explanation', `肺门 E 开关气道；关闭消耗 ${CAMPAIGN_BALANCE.closeAirwayCost} 完整度，开启消耗 ${CAMPAIGN_BALANCE.openAirwayCost}。出口仍可通行。`);
  } else set('pulse-explanation', `阀门附近 E · 朝鼠标冲流；击退 / 破壳，消耗 ${BATTLE_BALANCE.pulseCost} 组织完整度。`);

  const nearby = b.graph.nodes.filter(node => !['source', 'tissue'].includes(node.kind) && Math.hypot(node.x - state.player.x, node.y - state.player.y) <= BALANCE.interactionRange).sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
  if (nearby?.kind === 'exit') set('interaction-hint', !nearby.active ? '器官出口在第二次变异后开放' : state.elapsed < c.travelReadyAt ? `通行冷却 ${(c.travelReadyAt - state.elapsed).toFixed(1)}s` : `E · ${c.migration.choice ? '前往' : '追击至'}${current === 'heart' ? '肺部' : '心脏'}`);
  if (nearby?.kind === 'retest') set('interaction-hint', c.core.status === 'ready' ? `E · ${c.core.organId === current ? '启动母巢诊断' : `母巢位于${organName(c.core.organId)}`}` : b.readyToRetest ? 'E · 完成最终复测' : 'E · 查看最终复测条件');
  if (nearby?.id === 'gate' && ['warning', 'blocking'].includes(c.migration.status)) set('interaction-hint', 'E · 在隔离闸旁停留 2 秒封锁，战斗继续');
  if (nearby?.id === 'gate' && c.migration.status === 'locked') set('interaction-hint', nearby.active ? 'E · 关闭闸门；提前关闭会自动封堵迁移' : 'E · 开启闸门；保持关闭将自动封堵迁移');
  if (nearby?.id === 'gate' && c.migration.choice === 'block') set('interaction-hint', '封锁已完成 · 闸门维持关闭，出口仍可双向通行');
  if (nearby?.id === 'airway' && flow) set('interaction-hint', `E · ${flow.airwayOpen ? '封闭' : '开启'}气道，完整度 −${flow.airwayOpen ? CAMPAIGN_BALANCE.closeAirwayCost : CAMPAIGN_BALANCE.openAirwayCost}`);

  const migration = c.migration, warning = ['warning', 'blocking'].includes(migration.status), pursuing = migration.status === 'pursuing';
  get('migration-card').hidden = !warning && !pursuing;
  if (warning || pursuing) {
    const remaining = Math.max(0, (pursuing ? migration.interceptUntil ?? state.elapsed : migration.deadline) - state.elapsed);
    set('migration-title', pursuing ? '⇢ 肺部拦截 · 阻止立源' : '△ 病毒向肺部迁移');
    set('migration-countdown', `${remaining.toFixed(1)}s`);
    set('migration-summary', pursuing ? `迁移小体 ${Math.max(0, migration.carrierIds.length - migration.clearedCarrierIds.length)} / ${migration.carrierIds.length} 尚未清除；气道关闭也可阻止立源。` : '追击进入肺部；封锁使病毒滞留心脏；放任会新增肺部感染源。');
    get('migration-choices').hidden = pursuing || migration.status === 'blocking';
    get('migration-card').classList.toggle('pursuing', pursuing);
    for (const choice of ['pursue', 'block', 'ignore'] as const) {
      const button = document.querySelector<HTMLButtonElement>(`[data-action="migration-${choice}"]`)!;
      button.dataset.migration = migration.id;
      const device = c.arenas.heart.graph.nodes.find(node => choice === 'pursue' ? node.kind === 'exit' : node.id === 'gate');
      const near = current === 'heart' && !!device && Math.hypot(device.x - state.player.x, device.y - state.player.y) <= BALANCE.interactionRange;
      button.disabled = state.phase !== 'playing' || (choice !== 'ignore' && !near) || (choice === 'block' && (remaining < CAMPAIGN_BALANCE.blockDuration || migration.status === 'blocking'));
      button.title = choice === 'ignore' ? '立即放任迁移，肺部会建立额外感染源' : near ? choice === 'block' ? '按下后在闸旁停留 2 秒，离开范围会取消' : '进入肺部，尝试拦截迁移小体' : `先移动到${choice === 'block' ? '隔离闸（见小地图）' : '器官出口'}，再按 E 或点击此项`;
    }
    const blocking = migration.status === 'blocking' && migration.blockStartedAt !== null;
    get('migration-progress').hidden = !blocking && !pursuing;
    if (blocking) {
      const progress = Math.max(0, Math.min(1, (state.elapsed - migration.blockStartedAt!) / CAMPAIGN_BALANCE.blockDuration));
      get('migration-progress-meter').style.width = `${progress * 100}%`;
      set('migration-progress-label', `封锁进度 ${(progress * 100).toFixed(0)}% · 留在闸旁，仍需躲避攻击`);
    } else if (pursuing) {
      get('migration-progress-meter').style.width = `${migration.clearedCarrierIds.length / Math.max(1, migration.carrierIds.length) * 100}%`;
      set('migration-progress-label', `拦截 ${migration.clearedCarrierIds.length} / ${migration.carrierIds.length} · E 气道可停止迁移通路`);
    }
    set('migration-note', pursuing ? '心脏残留感染仍会低频侵蚀；左侧出口可返回。' : migration.status === 'blocking' ? '离开隔离闸范围会取消封锁，迁移倒数继续。' : '封锁耗时 2s、心脏承压；放任使肺部 −10 完整度、感染 +8。');
  }

  const core = c.core, combat = core.combat;
  const showCore = !warning && !pursuing && ['ready', 'active', 'cleared'].includes(core.status);
  get('mother-core-panel').hidden = !showCore;
  if (!showCore) return;
  const actor = c.arenas[core.organId].targets.find(target => target.id === core.actorId);
  set('mother-core-title', core.status === 'ready' ? `母巢定位 · ${organName(core.organId)}` : core.status === 'cleared' ? '✓ 母巢核心已清除' : `双特性母巢 · ${organName(core.organId)}`);
  get('mother-core-health').hidden = core.status !== 'active';
  set('mother-core-hp', core.status === 'active' && actor ? `${Math.ceil(actor.hp)} / ${actor.maxHp}` : core.status === 'cleared' ? '等待复测' : '复测台 E 唤醒');
  get('mother-core-meter').style.width = `${actor ? Math.max(0, actor.hp / actor.maxHp * 100) : 0}%`;
  if (!combat || core.status !== 'active') {
    set('mother-core-phase', core.status === 'ready' ? `前往${organName(core.organId)}复测台，按 E 开始最终诊断。` : '将所有激活器官修复至 ≥50%，感染负荷降至 <35%，再到终端按 E。');
    html('mother-core-traits', core.traits.map(id => `<span>${TRAITS[id].symbol} ${TRAITS[id].name}</span>`).join(''));
    set('mother-core-membrane', ''); get('mother-core-floor').hidden = true; return;
  }
  const inArena = core.organId === current, attack = combat.attack;
  const phase = !inArena ? `前往${organName(core.organId)}继续决战` : attack ? `${attack.kind === 'brood' ? '⋈ 有限分裂' : attack.kind === 'corrosion' ? '◌ 组织侵蚀 · Q 可打断' : attack.kind === 'crystal-sweep' ? '◇ 晶壳横扫 · 避开扇区' : '⋈ 裂殖爆发 · 避开落点'}　${Math.max(0, attack.resolveAt - state.elapsed).toFixed(1)}s` : combat.exposedUntil > state.elapsed ? `◇ 破绽 ${(combat.exposedUntil - state.elapsed).toFixed(1)}s · 抓住净化窗口` : combat.phase === 'awakening' ? `母巢苏醒 ${(Math.max(0, combat.nextActionAt - state.elapsed)).toFixed(1)}s` : '母巢正在调整姿态，观察下一次前摇';
  set('mother-core-phase', phase);
  html('mother-core-traits', combat.traits.map(id => `<span class="${combat.seenTraits.includes(id) ? 'demonstrated' : ''} ${combat.activeTrait === id ? 'active' : ''}">${combat.seenTraits.includes(id) ? '✓' : '◇'} ${TRAITS[id].name}${combat.activeTrait === id ? ' · 当前' : ''}</span>`).join(''));
  const membrane = combat.membrane, floor = get('mother-core-floor'); floor.hidden = membrane.remaining <= 0;
  floor.style.left = `${membrane.floorRatio * 100}%`; floor.title = `核膜存在时保护至 ${Math.round(membrane.floorRatio * 100)}%`;
  set('mother-core-membrane', membrane.remaining <= 0 ? '核膜已全部打开 · 核心可以清除' : `核膜 ${membrane.remaining} / ${membrane.total} · ${membrane.thresholdReached ? '已到' : '保护至'} ${Math.round(membrane.floorRatio * 100)}%。避开未展示特性的攻击，或 Q 打断侵蚀，即可破膜。`);
}

function organResults(state: GameState): string {
  return `<div class="campaign-organ-results">${(['heart', 'lung'] as const).map(id => {
    const arena = state.campaign!.arenas[id], hp = state.campaign!.activeOrganId === id ? state.tissue.hp : arena.tissue.hp;
    return `<div><span>${id === 'heart' ? '♥' : '◖◗'}</span><strong>${organName(id)} ${Math.ceil(hp)}%</strong><small>${arena.activated ? hp >= 50 ? '完整度达标' : '需要抢修' : '未激活，不计入复测'}</small></div>`;
  }).join('')}</div>`;
}

export function campaignOverlay(state: GameState, help: boolean, resumeAfterHelp: boolean, lowEffects: boolean, history: boolean): string | null {
  const c = state.campaign!, b = state.battle!;
  const effects = `<div class="switches"><button data-action="effects">特效：${lowEffects ? '低' : '标准'}</button></div>`;
  const modal = (content: string, label: string) => `<div class="overlay"><section class="modal battle-modal campaign-modal" role="dialog" aria-modal="true" aria-label="${label}">${content}</section></div>`;
  if (history) {
    const messages = [...b.history, ...c.history, ...state.events.filter(event => event.type === 'CORE_MEMBRANE_BROKEN').map(event => ({ at: event.tick / 60, text: `母巢${TRAITS[event.data.trait as keyof typeof TRAITS]?.name ?? ''}核膜已破，剩余 ${event.data.remaining} 层。` }))].sort((a, b) => b.at - a.at);
    const unique = messages.filter((item, index, items) => items.findIndex(other => other.at === item.at && other.text === item.text) === index).slice(0, 90);
    return modal(`<div class="eyebrow">CASE RECORD / 本局战术记录</div><h2>每次转向，都留下了后果。</h2>${organResults(state)}<p>${escape(migrationOutcome(state))}<br>本局变异：${b.traits.map(id => `${TRAITS[id].symbol} ${TRAITS[id].name}`).join(' → ') || '尚未发生'}。母巢位于${organName(c.core.organId)}。</p><div class="trait-history">${b.traits.map(id => { const trait = TRAITS[id]; return `<article><h3>${trait.symbol} ${trait.name}</h3><p>${escape(trait.ability)}<br>代价：${escape(trait.cost)}<br>反制：${escape(trait.counter)}</p></article>`; }).join('')}</div>${tacticalHistoryMarkup(state)}<h3>近期行动</h3><ol class="event-history">${unique.map(item => `<li><time>${time(item.at)}</time><span>${escape(item.text)}</span></li>`).join('')}</ol><div class="actions"><button class="primary" data-action="close-history">返回战场</button></div>`, '战术记录');
  }
  if (help) return modal(`<div class="eyebrow">FIELD MANUAL / 作战手册</div><h2>让变化，成为你的突破口。</h2><p>清除主要感染源和两次变异精英，处理跨器官迁移，再到母巢所在器官的复测台按 E 唤醒核心。最终胜利需要：<b>母巢清除、所有激活器官完整度 ≥50%、感染负荷 &lt;35%</b>，最后主动复测。</p><div class="help-grid"><div><kbd>WASD</kbd>二维自由移动</div><div><kbd>鼠标</kbd>瞄准 · 左键行动</div><div><kbd>Space</kbd>冲刺脱离危险</div><div><kbd>Q</kbd>扫描召集免疫细胞 · 打断侵蚀</div><div><kbd>1 / 2</kbd>精准净化 / 击退控场</div><div><kbd>3</kbd>瞄准十字组织抢修</div><div><kbd>E</kbd>附近装置 / 出口 / 复测</div><div><kbd>Esc</kbd>暂停 · 研究选择也暂停</div></div><h3>心跳与呼吸，会改变战术。</h3><p>心脏阀门 E 朝鼠标发动冲流，击退并暴露晶壳，消耗 ${BATTLE_BALANCE.pulseCost} 完整度。肺部吸气聚拢、呼气分散；气道 E 关闭会同时停止气流和传播，消耗 ${CAMPAIGN_BALANCE.closeAirwayCost} 完整度，重新开启消耗 ${CAMPAIGN_BALANCE.openAirwayCost}。玩家出口始终独立。</p><h3>12 秒迁移，三种真实后果。</h3><p>追击：前往器官出口（见小地图） E，在肺部清除迁移小体或关闭气道。封锁：在隔离闸（见小地图）按 E，留在范围内 ${CAMPAIGN_BALANCE.blockDuration} 秒；战斗继续，离开会取消。封锁后心脏新增滞留感染源，肺部不激活。若提前关闭心脏隔离闸，迁移发生时会自动封锁并承担相同后果；想追击时请保持闸门开放。不响应或主动放任：肺部新增感染源并受损，仍可前往挽回。通道开放后可双向返回，旅行冷却 ${CAMPAIGN_BALANCE.travelCooldown} 秒。</p><p>离场器官若仍有开放感染源，会在缓冲期后低频受损；单次离场损伤有上限。器官图会显示残留风险与实际损伤，请安排回救。</p><h3>双特性母巢，要先读懂再击穿。</h3><p>母巢交替使用本局两种特性：晶壳扇区横扫、裂殖定点爆发、潜伏组织侵蚀。Q 可打断侵蚀；攻势结束有真实破绽。核膜存在时核心耐久最低保持 50%；避开两种特性的攻击，或扫描打断侵蚀，即可逐层破膜，再清除核心。裂殖母巢只会在有限阈值释放脆弱小体。</p><p>普通晶壳可绕后/冲流破壳；裂殖小体用 2 清理；潜伏体有周期扰动，Q 可显形，基础射击仍有效。感染达 100% 后有 ${BATTLE_BALANCE.crisisDuration} 秒可挽回；器官濒危先警报再影响全身稳定，抢修能够恢复。</p>${effects}<div class="actions"><button class="primary" data-action="close-help">返回${resumeAfterHelp ? '战场' : '上一级'}</button><button data-action="history">战术记录</button></div>`, '操作指南');
  if (state.phase === 'menu') return `<div class="overlay intro"><section class="intro-card"><div class="eyebrow">A MICROSCOPIC FANTASY · HEART & LUNG</div><h1>Viral<br><span>Invasion</span></h1><h2>病 毒 入 侵</h2><p class="lead">深入巨人的心肺。<br>病毒会进化、伪装、跨器官迁移。借心跳破壳，趁呼吸聚拢敌群，在净化与抢修间，找到属于你的抗体联动。</p><div class="mission"><span><b>01</b> 诊断变异</span><span><b>02</b> 迁移抉择</span><span><b>03</b> 击穿母巢</span></div><div class="actions"><button class="primary" data-action="start">进入心脏防线　↗</button><button class="quiet" data-action="help">作战手册</button></div><p class="intro-footnote">双器官完整局 · 键鼠操作 · 完全离线<br>WASD 移动 / 鼠标瞄准 / 左键行动</p></section><div class="intro-art-label"><strong>Adapt. Protect. Turn the tide.</strong><small>病毒在改变，你也有下一种打法。</small></div></div>`;
  if (state.phase === 'paused') return modal(`<div class="eyebrow">VIRAL INVASION / 病毒入侵</div><h2>让心跳，等你片刻。</h2><p>战斗、器官气流、传播和迁移倒数都已暂停。</p>${organResults(state)}<div class="seed">SEED ${state.seed} · ${time(state.elapsed)} · 当前${organName(c.activeOrganId)}</div><div class="actions"><button class="primary" data-action="continue">继续战斗</button><button data-action="retry">同种子重试</button><button data-action="history">战术记录</button><button data-action="help">作战手册</button><button class="quiet" data-action="menu">返回主菜单</button></div>${effects}`, '战斗已暂停');
  if (state.phase === 'result') {
    const suggestion = c.migration.choice === 'ignore' ? '本局选择放任迁移。下次可试试出口追击或隔离闸封锁，比较器官压力。' : c.arenas.lung.activated && c.stats.airwayUses === 0 ? '本局没有操作肺部气道。下次可试试先借吸气聚拢，再用范围裂解清群。' : c.core.combat?.traits.includes('MIMIC') && c.core.combat.scanInterrupts === 0 ? '下次遇到母巢组织侵蚀时，可留住 Q 扫描打断，争取额外破绽。' : b.stats.pulses === 0 && b.traits.includes('CARAPACE') ? '本局未使用定向冲流。下次遇到晶壳，可借阀门 E 打开破绽窗口。' : '看看本局战术记录，尝试另一条迁移路线或抗体联动。';
    return modal(`<div class="result-seal">${state.result?.success ? '✧' : '△'}</div><div class="eyebrow">VIRAL INVASION / ${state.result?.success ? 'LIFE STABILIZED' : 'CASE ENDED'}</div><h2>${state.result?.success ? '让生命，再次有力地呼吸。' : '这次防线，没能守住。'}</h2><p>${escape(state.result?.reason ?? '')}</p>${organResults(state)}<div class="stats"><div><strong>${time(state.elapsed)}</strong><small>作战用时</small></div><div><strong>${b.stats.kills}</strong><small>净化感染体</small></div><div><strong>${c.stats.travels}</strong><small>跨器官旅行</small></div></div><div class="seed">SEED ${state.seed} · 感染 ${Math.ceil(b.pressure.infection)}% · 全身稳定 ${Math.ceil(b.pressure.vitality)}%</div><p>本局进化：${b.traits.map(id => TRAITS[id].name).join(' → ') || '尚未发生'}<br>${escape(migrationOutcome(state))}<br>母巢：${c.core.status === 'cleared' ? '已净化' : '尚未清除'} · 离场损伤 ${c.stats.backgroundDamage.toFixed(1)}<br>${escape(suggestion)}</p><div class="actions"><button class="primary" data-action="retry">同种子重试</button><button data-action="new">新病例</button><button data-action="history">战术记录</button><button class="quiet" data-action="menu">返回主菜单</button></div>`, '病例结算');
  }
  return null;
}
