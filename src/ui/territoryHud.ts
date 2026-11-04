import type { GameState } from '../game/types';
import type { TerritoryProfileSnapshot } from '../meta/endlessProfile';
import { territoryBeaconRank, territoryContextView, territoryFrontGarrison, territoryLaneViews, territoryNodeView } from '../game/territory';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

/** Alerts describe real attackers only; static infected terrain is not an alarm. */
export function territoryInvasionWarning(state: GameState): string {
  if (!state.territory || !state.endless) return '';
  return territoryLaneViews(state).flatMap(lane => {
    const name = lane.laneId === 'north' ? '北线' : '南线';
    return lane.warning ? [`${name}受袭 · ${lane.warning.seconds.toFixed(1)}秒失守`]
      : lane.attackedNodeIds.includes('core') ? [`${name}侵染者正在攻击心核`] : [];
  }).join('；');
}

/** One nearby action or one truthful reason that the accepted action is paused. */
export function territoryContextHint(state: GameState, touch = false): string {
  if (!state.territory) return '';
  const context = territoryContextView(state);
  const node = state.territory.nodes.find(item => item.id === context.nodeId) ?? context.candidate;
  const name = node?.name ?? '区域';
  const progress = Math.floor(context.progress);
  if (context.pausedReason === 'inactive') return state.territory.purification ? `${name}净化暂停：战斗已暂停，进度${progress}%保留` : '';
  if (context.pausedReason === 'airborne') return `${name}净化暂停：弹射中，落地后靠近继续 · ${progress}%保留`;
  if (context.reason === 'airborne') return '弹射中，落地后靠近感染节点净化';
  if (context.pausedReason === 'healing-required' || context.reason === 'healing-required') return `先夺回对应生命泉，再净化${name}`;
  if (context.pausedReason === 'out-of-range') return `${name}净化暂停：离开范围，靠近后继续 · ${progress}%`;
  if (context.pausedReason === 'invader') return `${name}净化暂停：清除侵染者继续 · ${progress}%`;
  if (context.pausedReason === 'contaminant') return `${name}净化暂停：清除贴泉病毒继续 · ${progress}%`;
  if (context.pausedReason === 'hurt') return `${name}净化暂停：躲开攻击后继续 · ${progress}%保留`;
  if (node && state.territory.purification && state.territory.purification.nodeId === node.id) return `${name}净化 ${progress}% · 留在附近`;
  if (context.action === 'purify') return touch ? `点附近净化：${name}` : `按3净化${name}`;
  if (context.action === 'repair') return touch ? '点附近净化，修复心核' : '按3修复心核';
  return '';
}

export function territoryHudView(state: GameState, touch = false) {
  const territory = state.territory;
  if (!territory || !state.endless) return null;
  const sources = Object.values(territory.sources).filter(source => source.destroyed).length;
  const boss = territory.bossId ? state.targets.find(target => target.id === territory.bossId && target.hp > 0) : undefined;
  const laneViews = territoryLaneViews(state);
  const attacked = laneViews.find(lane => lane.attackedNodeIds.length > 0);
  const lostHealing = laneViews.find(lane => !territory.sources[lane.sourceId].destroyed && lane.healing.node.owner === 'infected');
  const lostFront = laneViews.find(lane => !territory.sources[lane.sourceId].destroyed && lane.front.node.owner === 'infected');
  const openSource = laneViews.find(lane => !territory.sources[lane.sourceId].destroyed && territory.sources[lane.sourceId].spawned && !lane.shielded);
  const currentPurification = territory.nodes.find(node => node.id === territory.purification?.nodeId && node.owner === 'infected');
  const purificationPaused = currentPurification && !!territoryContextView(state).pausedReason;
  const coreCritical = state.tissue.hp < 30 && (territoryNodeView(state, 'core')?.attackerIds.length ?? 0) > 0;
  const rank = territoryBeaconRank(state);
  const needDefense = laneViews.find(lane => !territory.defense[lane.laneId].repelled && lane.front.node.owner === 'healthy');
  const needGarrison = laneViews.find(lane => !territory.defense[lane.laneId].handoff && lane.front.node.owner === 'healthy');
  const needStation = laneViews.find(lane => !territory.sources[lane.sourceId].destroyed && lane.front.node.owner === 'healthy' && !territoryFrontGarrison(state, lane.frontNodeId));
  const blockers = state.targets.filter(target => target.hp > 0 && target.role !== 'event' && target.blocksWaveClear !== false);
  const remainingNests = blockers.filter(target => target.role === 'nest');
  const onlyNestsRemain = state.endless.remainingToSpawn === 0 && state.endless.pendingChildren === 0
    && !state.endless.territoryTasks?.squads.some(squad => squad.status === 'pending' || squad.status === 'warning')
    && !state.targets.some(target => target.splitAt !== undefined || target.hp > 0 && (target.role === 'virus' || target.role === 'elite'))
    && remainingNests.length > 0 && blockers.every(target => target.role === 'nest');
  const objective = territory.stage === 'guard' ? '救援成功 · 继续守卫'
    : territory.stage === 'victory' ? '心核救援成功'
    : coreCritical ? '心核危急，清除袭击者并修复'
    : territory.stage === 'boss' ? `净化母巢${boss ? ` ${Math.ceil(boss.hp)} / ${boss.maxHp}` : ''}`
    : onlyNestsRemain && !attacked && (territory.stage === 'rescue' || territory.stage === 'bossPending' || territory.stage === 'cleanup')
      ? `拆除剩余小母巢${remainingNests.length > 1 ? `（${remainingNests.length}座）` : ''} · 跟随小地图巢标记`
    : territory.stage === 'bossPending' ? '感染源已清 · 等待母巢苏醒'
    : territory.stage === 'cleanup' ? '母巢已清 · 夺回剩余组织并清理残敌'
      : currentPurification ? `${purificationPaused ? '恢复' : '保护'}${currentPurification.name}净化`
        : attacked ? `守住${attacked.laneId === 'north' ? '北线' : '南线'}，清除${attacked.healing.attackerIds.length ? '贴泉病毒' : '侵染者'}`
      : lostHealing ? `夺回${lostHealing.healing.node.name}，恢复补给`
        : needDefense ? `守住${needDefense.laneId === 'north' ? '北' : '南'}线，击退反扑强化军团`
        : lostFront ? `净化${lostFront.front.node.name}，准备军团接防`
            : needGarrison ? `${needGarrison.laneId === 'north' ? '北' : '南'}前线部署军团，完成实战接防`
              : needStation ? `${needStation.laneId === 'north' ? '北' : '南'}前线补充驻军，解除源膜`
          : openSource ? `击破${openSource.source.node.name} · ${sources}/2已清`
            : '守住双线，等待第3波感染源苏醒';
  const lines = laneViews.map(lane => {
    const warning = lane.warning;
    const defense = territory.defense[lane.laneId];
    const stationed = !!territoryFrontGarrison(state, lane.frontNodeId);
    const readyForHandoff = !!territoryFrontGarrison(state, lane.frontNodeId, 2);
    const status = warning ? `受袭 ${Math.floor(warning.progress)}% · ${warning.seconds.toFixed(1)}s`
      : lane.attackedNodeIds.includes('core') ? '心核受袭'
      : lane.attackedNodeIds.length > 0 ? lane.healing.attackerIds.length ? '净化受扰，清除贴泉病毒' : '净化受扰，清除侵染者'
      : lane.incoming ? lane.incoming.blocked ? '敌群集结' : `进攻准备 ${lane.incoming.seconds.toFixed(1)}s`
      : lane.healing.node.owner === 'infected' ? '生命泉失守'
        : lane.front.node.owner === 'infected' ? '前线待净化'
          : territory.stage === 'guard' ? '防线稳定'
            : territory.sources[lane.sourceId].destroyed ? '感染源已净化'
          : !defense.repelled ? '守点击退 · 强化军团'
            : rank < 3 ? '支援另一线 · 军团进阶'
              : defense.attempt ? defense.attempt.enteredDefense ? '接防实战 · 拦截侵染者' : '接防验证 · 等待反扑'
                : !defense.handoff ? readyForHandoff ? '驻军到位 · 等待接防' : stationed ? '接防需2体到位 · 驻军不足' : '部署军团 · 验证接防'
                  : !stationed ? '接防已验 · 需要驻军'
              : lane.shielded ? '守住防线' : '源膜已解除';
    return { id: lane.laneId, name: lane.laneId === 'north' ? '北线' : '南线', status, attacked: lane.attackedNodeIds.length > 0,
      handedOff: defense.handoff, stationed,
      frontStatus: lane.front.status, healingStatus: lane.healing.status };
  });
  const hasHealthySpring = territory.nodes.some(node => node.kind === 'healing' && node.owner === 'healthy');
  const contact = territory.healingContact;
  const infection = state.playerInfection && state.playerInfection.until > state.elapsed
    ? `感染 ${Math.ceil(state.playerInfection.until - state.elapsed)}秒 · ${contact.nodeId
      ? contact.exposure ? '先摆脱贴身病毒，再治疗1秒' : `泉中清除感染 ${Math.floor(contact.seconds * 100)}%`
      : hasHealthySpring ? '前往健康生命泉' : '先夺回生命泉'}` : '';
  const healing = contact.nodeId ? (contact.healed ?? 0) > 0 ? '治疗中 · 每秒恢复3耐久' : '健康治疗范围 · 耐久已满' : '';
  const invasionWarning = territoryInvasionWarning(state);
  const contextHint = territoryContextHint(state, touch);
  const urgentDetail = [infection, contextHint].filter(Boolean).join(' · ');
  const routineDetail = territory.stage === 'bossPending' ? '清完余敌与裂殖，选择强化后迎战母巢'
    : territory.stage === 'boss' ? '读清母巢前摇，守住心核'
    : territory.stage === 'cleanup' ? '清完余敌，夺回全部组织；军团留守双前线'
    : territory.stage === 'guard' ? '守住北南双线与心核'
    : territory.stage === 'victory' ? '救援成果保留，可结束或继续守卫'
    : rank < 3 ? `军团${rank === 1 ? 'I' : 'II'}阶 · 北南各击退1队，成长至III阶`
      : Object.values(territory.sources).some(source => source.spawned) ? '双线实战接防后，驻军维持源膜开放' : '守住前线，军团接防；第3波感染源苏醒';
  return { objective, core: `心核 ${Math.ceil(state.tissue.hp)} / ${state.tissue.maxHp}`,
    stability: `全域净化 ${time(territory.stability.totalSeconds)}`,
    stabilityDetail: `当前连续 ${time(territory.stability.currentSeconds)} · 最长 ${time(territory.stability.bestSeconds)}`,
    fullyPurified: territory.stability.active, beaconRank: rank,
    wave: `第${state.endless.wave}波 · ${state.endless.score}分`,
    detail: urgentDetail || invasionWarning || healing || routineDetail,
    keyDetail: !!(urgentDetail || invasionWarning), invasionWarning, contextHint, lines,
    infection, healing: (contact.healed ?? 0) > 0, regions: territory.nodes.map(region => ({ id: region.id, name: region.name,
      healthy: region.owner === 'healthy', permanent: region.permanent,
      label: `${region.name}：${region.owner === 'healthy' ? '健康' : '感染'}${region.permanent ? '，永久净化' : ''}` })) };
}

export const territoryHudMarkup = `<section id="territory-hud" class="territory-hud" aria-label="救援目标与领地状态" hidden>
  <div class="territory-heading"><b id="territory-core"></b><div id="territory-regions" class="territory-regions"></div></div>
  <strong id="territory-objective"></strong><p id="territory-detail"></p><span id="territory-stability" class="territory-stability"></span><small id="territory-wave"></small>
</section>`;

export function updateTerritoryHud(state: GameState): void {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('territory-hud'), view = territoryHudView(state, !!document.body?.classList.contains('touch-mode'));
  if (!root) return;
  root.hidden = !view || !['playing', 'paused'].includes(state.phase);
  if (!view) return;
  root.dataset.infected = String(!!view.infection);
  root.dataset.healing = String(view.healing);
  root.dataset.fullyPurified = String(view.fullyPurified);
  root.title = view.stabilityDetail;
  for (const [id, value] of [['territory-objective', view.objective], ['territory-core', view.core], ['territory-detail', view.detail], ['territory-wave', view.wave], ['territory-stability', view.stability]]) {
    const element = document.getElementById(id); if (element && element.textContent !== value) element.textContent = value;
  }
  const regions = document.getElementById('territory-regions');
  const detail = document.getElementById('territory-detail'); if (detail) detail.hidden = !view.detail;
  const markup = view.lines.map(line => `<span id="territory-line-${line.id}" data-line="${line.id}" data-attacked="${line.attacked}" data-front="${line.frontStatus}" data-healing="${line.healingStatus}" data-handoff="${line.handedOff}"><b>${line.name}${line.handedOff ? ' ✓' : ''}</b><span>${escape(line.status)}</span></span>`).join('');
  if (regions && regions.innerHTML !== markup) regions.innerHTML = markup;
}

/** The immutable rescue receipt is displayed even if optional guard play later ends. */
export function territoryVictoryOverlay(state: GameState, profile?: TerritoryProfileSnapshot): string | null {
  const territory = state.territory, saved = territory?.rescueSnapshot;
  if (territory?.stage !== 'victory' || state.phase !== 'paused' || !saved) return null;
  return `<div class="overlay endless-overlay"><section class="modal endless-modal territory-victory" role="dialog" aria-modal="true" aria-label="心核救援成功">
    <div class="endless-stage-seal" aria-hidden="true">✚</div><div class="eyebrow">ALL THINGS ALIVE / 万物生</div>
    <h2>生命重新生长，救援成功。</h2><p>双线军团完成接防，两处感染源与母巢已净化。</p>
    <div class="stats"><div><strong>${time(saved.elapsed)}</strong><small>救援用时</small></div><div><strong>${saved.score}</strong><small>救援得分</small></div><div><strong>${Math.ceil(saved.coreHp)}%</strong><small>获救时心核完整度</small></div></div>
    <p class="territory-victory-receipt">救援成果已记录。继续守卫沿用本局成长，之后失守也保留这次成功。</p>
    <p>全域净化累计 ${time(saved.fullyPurifiedSeconds ?? 0)} · 最长连续 ${time(saved.longestFullyPurifiedSeconds ?? 0)}</p>
    ${profile ? `<p class="endless-storage ${profile.status.mode === 'session' ? 'is-temporary' : ''}" role="status">${escape(profile.status.message)}</p>` : ''}
    <div class="actions"><button class="primary" data-action="territory-finish">结束救援</button><button data-action="territory-guard">继续守卫</button><button data-action="growth-details">查看配装</button></div>
    ${profile?.status.mode === 'session' ? '<button class="territory-save-retry" data-action="territory-save">重试保存成果</button>' : ''}
  </section></div>`;
}

export function territoryResultOverlay(state: GameState, profile?: TerritoryProfileSnapshot): string | null {
  if (!state.territory || !state.endless || state.phase !== 'result') return null;
  const receipt = state.territory.rescueSnapshot, e = state.endless;
  const guard = state.territory.stage === 'guard';
  return `<div class="overlay endless-overlay"><section class="modal endless-modal territory-victory" role="dialog" aria-modal="true" aria-label="救援结算">
    <div class="eyebrow">${receipt ? 'RESCUE SAVED / 救援成功' : 'RESCUE ENDED / 救援结束'}</div>
    <h2>${receipt ? guard ? '守卫结束，救援成果仍在。' : '心脏获救，留下这次成果。' : '这次救援结束，再试一种路线。'}</h2>
    <p>${escape(state.result?.reason ?? '')}</p>
    <div class="stats"><div><strong>${e.score}</strong><small>本局总分</small></div><div><strong>${e.clearedWaves}</strong><small>完全清除波次</small></div><div><strong>${time(state.elapsed)}</strong><small>本局用时</small></div></div>
    <p>全域净化累计 ${time(state.territory.stability.totalSeconds)} · 最长连续 ${time(state.territory.stability.bestSeconds)}</p>
    ${receipt ? `<p>救援成果：${receipt.score}分 · ${time(receipt.elapsed)} · 获救时心核 ${Math.ceil(receipt.coreHp)}%。${guard ? '守卫阶段与本次救援记为同一局。' : ''}</p>` : '<p>先守住净化节点，北南各击退一队强化军团；III阶军团实战接防后再解膜拆源。</p>'}
    ${profile ? `<p class="endless-storage ${profile.status.mode === 'session' ? 'is-temporary' : ''}" role="status">${escape(profile.status.message)}</p>` : ''}
    <div class="actions"><button class="primary" data-action="retry">同种子再战</button><button data-action="new">新的救援</button><button data-action="menu">返回菜单</button></div>
    ${profile?.status.mode === 'session' ? '<button class="territory-save-retry" data-action="territory-save">重试保存成果</button>' : ''}
  </section></div>`;
}

export function territoryHelpMarkup(touch: boolean): string {
  return `<div class="territory-help"><p><strong>净化后，先守住。</strong>北南两线均为感染源 → 前线 → 生命泉 → 心核。前线不治疗，健康泉150范围每秒恢复3耐久；摆脱病毒接触后在泉中连续治疗1秒可清除感染。病毒实际贴住泉内圈会缓慢污染，离开后污染消退；150治疗大圈不等于污染范围。先夺回生命泉才能净化同线前线。</p><p><strong>一键净化。</strong>进入节点150范围后${touch ? '点附近净化' : '按3'}，允许移动射击，不切换武器。生命泉内圈仍有污染体、前线有侵染者、离开范围、同线泉失守、弹射飞行或受到有效攻击会暂停，进度保留；感染持续掉血不打断。身体接触病毒也会感染，冲刺不能消除传染。附近无感染节点时可修复心核。</p><p><strong>军团成长，再交接。</strong>在北南健康节点各完整击退1队，军团依次升至II、III阶。站到健康节点150附近${touch ? '点驻防' : '按Q'}，新军团从脚下留守；最多两团，满编后直接调最近一团到脚下。细胞真实行军且保留伤势，撤走旧前线驻军可能使源膜恢复。III阶至少两名细胞到达前线后，用下一队真实反扑验证接防；军团须拦截并命中侵染者、清完小队且前线无侵染，玩家可以协助。护卫擅长拆驻军，军团受损时回防。</p><p><strong>驻军解膜，拆源决战。</strong>第3波两源苏醒；该线完成接防、泉与前线健康且前线仍有活驻军，源膜才开放。失守或驻军离开会复膜，源耐久保留。双源与母巢击破、双线接防且全域健康后救援成功；有失地先收复。${touch ? '靠近弹射器，按住拖动瞄准、松手起跳' : '靠近弹射器，按住E瞄准、松手起跳'}，玩家飞至落点继续作战；落地冲击可打小巢，不能伤主感染源或母巢。</p><p><strong>识破新敌人。</strong>法师锁定圆圈后，侧移或冲刺脱离黏液落区。筑巢者优先击杀；建成的小巢可射击或弹射落地拆除，每巢只有六只幼体的有限库存。拆巢会取消未孵化幼体，已经出生的幼体仍留在战场。</p><p><strong>全域净化时间。</strong>所有区域健康且无正在侵染时累加；再次感染暂停累计并重置当前连续时间。暂停与强化期间不计时。胜利即保存，继续守卫保留救援成果。心核或玩家耐久归零则失败。</p></div>`;
}

export function territoryLegacyMarkup(profile?: TerritoryProfileSnapshot): string {
  const old = profile?.previousGarrison;
  if (!old) return '';
  return `<details class="territory-legacy-records"><summary>旧规则v4战绩 · 救援${old.rescues}次 · 最高${old.bestScore}分</summary><p>旧记录保留，与当前规则分别统计。</p><ul>${old.recentRuns.slice(0,3).map(record => `<li>${record.rescue.success ? '救援成功' : '救援结束'} · ${record.score}分 · ${time(record.durationSeconds)} · SEED ${record.seed}</li>`).join('')}</ul></details>`;
}

