import type { GameState } from '../game/types';
import { MISSIONS, MODULE_NAMES, type MissionHaul, type MissionReceipt, type TemplateId } from '../game/microfront';
import { RARITY_NAMES, WEAPONS, isWeaponId, type WeaponRarity } from '../game/expedition';
import type { EndlessProfileStatus } from '../meta/endlessProfile';
import { missionCoinIcon, missionFragmentIcon, missionSealIcon, missionTemplateIcon } from './missionRewardIcons';
import { territoryHudView, territoryStagePathMarkup } from './territoryHud';
import { anchorDangerView } from '../game/anchorDanger';

const escape = (value: string): string => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const name = (id: string): string => isWeaponId(id) ? WEAPONS[id].name : MODULE_NAMES[id as keyof typeof MODULE_NAMES] ?? id;
interface RewardCard {
  kind: 'weapon' | 'module' | 'fragment' | 'core'; templateId?: TemplateId;
  rarity: WeaponRarity; quantity: number; repaired?: boolean;
}
const rarityPriority: Record<WeaponRarity, number> = { white: 0, blue: 1, purple: 2, gold: 3 };
const shortName = (id: TemplateId): string => name(id).replace(/^[^·]+·/, '').replace(/模组$/, '');
const missionCopy = (text: string): string => text.replaceAll('心核', '稳态锚').replaceAll('生命泉', '营养凝露').replaceAll('心脏救援', '微区清剿').replaceAll('免疫细胞', '抗体小队').replaceAll('选择强化后迎战母巢', '准备迎战母巢').replaceAll('清波后选择一次强化', '清波后自动收集战利品');

/** Full tactical information is available while paused, without covering combat. */
export function missionBattleDetailsMarkup(state: GameState): string {
  const id = state.expedition?.missionId, view = territoryHudView(state);
  if (!id || !view || state.camp) return '';
  const mission = MISSIONS[id], haul = state.expedition?.haul;
  return `<section class="mission-battle-details" aria-label="清剿战况详情"><header><div><small>${escape(mission.region)} · ${escape(mission.threat)}</small><h3>${escape(mission.name)}</h3></div><b>${escape(view.wave)}</b></header>
    <div class="territory-progress mission-stage-path" aria-label="通关阶段">${territoryStagePathMarkup(view.progressPath)}</div>
    <dl class="mission-battle-resources"><div><dt>拾取金币</dt><dd>${haul?.coins ?? 0}</dd></div><div><dt>拾取生质</dt><dd>${haul?.materials ?? 0}</dd></div><div><dt>拾取装备</dt><dd>${haul?.items.length ?? 0}</dd></div></dl>
    <div class="mission-battle-lanes">${view.lines.map(line => `<div data-attacked="${line.attacked}"><strong>${line.name}</strong><span>${escape(missionCopy(line.status))}</span><ol>${line.sourceAccess.steps.map(step => `<li data-done="${step.done}" data-current="${step.current}">${step.done ? '✓ ' : ''}${escape(missionCopy(step.label))}</li>`).join('')}</ol></div>`).join('')}</div>
    <p>${escape(view.stability)} · ${escape(view.stabilityDetail)}</p></section>`;
}

function rewardCards(haul: MissionHaul): RewardCard[] {
  const cards: RewardCard[] = [];
  for (const item of haul.items) {
    const existing = cards.find(card => card.kind !== 'fragment' && card.templateId === item.templateId && card.rarity === item.rarity && card.repaired === (item.repaired !== false));
    if (existing) existing.quantity++;
    else cards.push({ kind: isWeaponId(item.templateId) ? 'weapon' : 'module',
      templateId: item.templateId, rarity: item.rarity, repaired: item.repaired !== false, quantity: 1 });
  }
  if (haul.cores) cards.push({ kind: 'core', rarity: 'gold', quantity: haul.cores });
  for (const [id, amount] of Object.entries(haul.fragments)) {
    // Fragments have a template and count, but no equipment rarity.
    if (amount) cards.push({ kind: 'fragment', templateId: id as TemplateId, rarity: 'white', quantity: amount });
  }
  return cards.sort((a, b) => rarityPriority[b.rarity] - rarityPriority[a.rarity]);
}

function rewardCardMarkup(card: RewardCard, index: number): string {
  const title = card.templateId ? shortName(card.templateId) : '锻造核心';
  const rarity = RARITY_NAMES[card.rarity];
  const tag = card.kind === 'fragment' ? '碎片' : card.kind === 'core' ? '核心' : rarity;
  const label = `${card.kind === 'fragment' || card.kind === 'core' ? '' : rarity + ' · '}${card.templateId ? name(card.templateId) : title}${card.kind === 'fragment' ? '碎片' : ''} ×${card.quantity}${card.repaired === false ? ' · 待修复' : ''}`;
  const icon = card.kind === 'core' ? '<span class="mission-reward-art" data-camp-art="forge-core" aria-hidden="true"></span>' : missionTemplateIcon(card.templateId!);
  return `<li class="mission-loot-card" data-kind="${card.kind}" data-rarity="${card.rarity}"${card.templateId ? ` data-template="${escape(card.templateId)}"` : ''} data-quantity="${card.quantity}" style="--reveal-delay:${Math.min(index, 7) * 65}ms" aria-label="${escape(label)}" title="${escape(label)}">
    <div class="mission-loot-frame"><span class="mission-loot-tag">${tag}</span>${icon}${card.kind === 'fragment' ? `<span class="mission-fragment-mark" aria-hidden="true">${missionFragmentIcon()}</span>` : ''}<b class="mission-loot-quantity">×${card.quantity}</b>${card.repaired === false ? '<span class="mission-loot-repair">待修复</span>' : ''}</div>
    <strong class="mission-loot-name">${escape(title)}</strong></li>`;
}

export function missionFailureReason(state: GameState): string {
  if (state.player.hp <= 0) return '玩家血量耗尽';
  if (state.tissue.hp <= 0) return '稳态锚被摧毁';
  return missionCopy(state.result?.reason.split(/[：:。\n]/, 1)[0].trim() || '任务目标未完成');
}

export function missionResultOverlay(state: GameState, receipt?: MissionReceipt, status?: EndlessProfileStatus, lowEffects = false): string {
  const missionId = state.expedition?.missionId;
  if (!missionId) return '';
  const mission = MISSIONS[missionId], success = receipt ? receipt.outcome === 'success' : !!state.result?.success;
  const withdrawn = receipt?.outcome === 'withdrawn';
  const haul = receipt?.haul;
  const cards = haul ? rewardCards(haul) : [];
  const saveWarning = status && (status.mode === 'session' || status.code === 'corrupt');
  return `<div class="overlay mission-result-overlay${lowEffects ? ' is-low-effects' : ''}"><section class="modal microfront-result mission-result-panel${success ? '' : ' is-withdrawn'}" role="dialog" aria-modal="true" aria-labelledby="mission-result-title">
    <header class="mission-result-header"><div class="mission-result-seal" aria-hidden="true">${missionSealIcon(success)}</div><div><p class="mission-result-location">${escape(mission.name)}</p><h2 id="mission-result-title">${success ? '清剿完成' : withdrawn ? '已撤回前哨' : '清剿失败'}</h2>${!success && !withdrawn ? `<p class="mission-result-cause" role="status">${escape(missionFailureReason(state))}</p>` : ''}</div>${success && receipt?.firstClear ? '<span class="mission-first-clear">首次清剿</span>' : ''}</header>
    <div class="mission-result-scroll" tabindex="0" role="region" aria-label="奖励列表"><section class="mission-loot" aria-label="本次带回的战利品"><div class="mission-loot-heading"><h3>本次收获</h3><span aria-hidden="true">✦</span></div>
      ${cards.length ? `<ul class="mission-loot-grid">${cards.map(rewardCardMarkup).join('')}</ul>` : haul && (haul.coins || haul.materials) ? '' : `<p class="mission-loot-empty">${haul ? '暂无战利品' : '正在确认收获'}</p>`}
      ${haul && (haul.coins || haul.materials) ? `<div class="mission-resource-row" aria-label="带回资源">${haul.coins ? `<div class="mission-resource" data-kind="coins" data-quantity="${haul.coins}"><span class="mission-resource-art" aria-hidden="true">${missionCoinIcon()}</span><span>金币</span><b>+${haul.coins}</b></div>` : ''}${haul.materials ? `<div class="mission-resource" data-kind="materials" data-quantity="${haul.materials}"><span class="mission-resource-art" data-camp-art="biomass" aria-hidden="true"></span><span>生质</span><b>+${haul.materials}</b></div>` : ''}</div>` : ''}
    </section>${!success && haul ? '<p class="mission-retained">已带回一半拾取资源 · 本次装备未带回</p>' : ''}</div>
    <footer class="mission-result-footer">${saveWarning ? `<div class="mission-save-warning" role="status"><p>${escape(status.message)}</p><button data-action="territory-save">重试保存</button></div>` : ''}<div class="actions"><button class="primary" data-action="camp-open">返回营地 <span aria-hidden="true">↗</span></button><button data-action="camp-open-forge">前往锻造</button></div></footer>
  </section></div>`;
}

export function missionPauseOverlay(state: GameState, help = false, touch = false, lowEffects = false): string {
  const id = state.expedition?.missionId; if (!id) return '';
  const mission = MISSIONS[id], loadout = state.expedition!.loadout, haul = state.expedition?.haul;
  const modules = state.growth?.equipped.map(slot => `${MODULE_NAMES[slot.id]} ${['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][slot.rank ?? 1]}`).join(' · ');
  return `<div class="overlay"><section class="modal microfront-result" role="dialog" aria-modal="true" aria-labelledby="mission-pause-title"><div class="eyebrow">MICROFRONT / ${escape(mission.region)}</div>
    <h2 id="mission-pause-title">${help ? '微区作战手册' : '清剿已暂停'}</h2><h3>${mission.name} · ${mission.threat}</h3><ul>${mission.objectives.map(objective => `<li>${escape(objective)}</li>`).join('')}</ul>
    <p><strong>出征配装：</strong>${escape(WEAPONS[loadout.weaponId].name)} · ${RARITY_NAMES[loadout.rarity]} +${loadout.upgrade}<br>${escape(modules || '基础抗体小队 · 未安装模组')}</p>
    <p><strong>暂存收获：</strong>${haul?.coins ?? 0}金币 · ${haul?.materials ?? 0}生质 · ${haul?.items.length ?? 0}件装备。成功后全部带回；撤离或失败保留一半普通资源。</p>
    ${help ? '' : `<details class="mission-pause-tactics"><summary>查看双线战况与解膜步骤</summary>${missionBattleDetailsMarkup(state)}</details>`}
    ${help ? `<p>${touch ? '左侧摇杆移动，右侧普攻盘拖动瞄准并按住攻击；123为当前武器战技，4为独立充能大招。指向型大招按住预览、松手释放，拖出或拖至×取消；裁决铳点按4开启雷暴，再点4立即裁决。' : 'WASD移动，鼠标瞄准，左键普攻；123释放当前武器战技，4释放充能大招，Space冲刺。裁决铳长按左键持续群电，雷暴中再按4立即裁决。'}</p><p>每把武器都有独特大招：普通病毒击杀＋2能量，精英＋12；母巢总耐久每降低1%＋2，满100后可释放；大招伤害不回充，同次出征跨波保留，返回营地清空。</p><p>${touch ? '靠近感染节点点净化，驻防在脚下部署小队。' : '靠近感染节点按F净化，Q在脚下驻防。'}清除同线营养凝露与膜缘前线的感染，即可解除感染源护膜。健康凝露可缓慢治疗；净化可与移动、攻击同时进行。</p><p>清波自动收集真实战利品，制造、强化与换装在营地完成。初始蜂巢针枪与当前母巢通关赠送刃弓为史诗品质。传说霆链·裁决铳与赤曜·斩疫刃首次通过血流接引抽取解锁，之后可使用对应碎片定向重铸。</p>` : ''}
    <div class="actions"><button class="primary" data-action="${help ? 'close-help' : 'continue'}">继续清剿</button>${help ? '' : '<button data-action="help">作战手册</button><button data-action="endless-extract">撤回前哨</button>'}<button data-action="effects">特效：${lowEffects ? '低' : '标准'}</button></div></section></div>`;
}

/** Keep one objective and essential vitals; move routine guidance into paused details. */
export function updateMissionHud(state: GameState): void {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('microfront-mission', !!state.expedition?.missionId && !state.camp);
  const missionId = state.expedition?.missionId;
  let indicator = document.getElementById('microfront-assignment');
  if (!missionId || state.camp || !['playing', 'paused'].includes(state.phase)) { if (indicator) indicator.hidden = true; return; }
  if (!indicator) {
    indicator = document.createElement('div'); indicator.id = 'microfront-assignment'; indicator.className = 'microfront-assignment';
    document.getElementById('territory-hud')?.prepend(indicator);
  }
  indicator.hidden = false;
  const mission = MISSIONS[missionId], view = territoryHudView(state), anchorAttacked = anchorDangerView(state).attacked;
  const assignment = `<strong>${escape(mission.name)}</strong><small>${escape(mission.threat)}</small>`;
  if (indicator.innerHTML !== assignment) indicator.innerHTML = assignment;
  indicator.dataset.threat = mission.threat;
  const root = document.getElementById('territory-hud');
  if (root) {
    root.dataset.coreAttacked = String(anchorAttacked);
    root.style.setProperty('--anchor-health', `${Math.max(0, Math.min(100, state.tissue.hp / state.tissue.maxHp * 100))}%`);
    root.dataset.coreCritical = String(state.tissue.hp / state.tissue.maxHp <= .3);
    root.dataset.keyDetail = String(!!view?.keyDetail);
  }
  const core = document.getElementById('territory-core'); if (core) core.textContent = `稳态锚 ${Math.ceil(state.tissue.hp)} / ${state.tissue.maxHp}`;
  const objective = document.getElementById('territory-objective');
  if (objective && view) objective.textContent = missionCopy(view.objective).replace(/，(?:恢复补给|切断源膜供能)$/, '');
  const detail = document.getElementById('territory-detail'); if (detail) detail.hidden = !view?.keyDetail || anchorAttacked;
  // Keep the mobile alert in the same flowing card as variable-length context.
  // Its source is already prioritized and escaped by updateMobileHud.
  const warnings = document.getElementById('mobile-warnings');
  let alert = document.getElementById('microfront-warning');
  if (!alert && root) {
    alert = document.createElement('div'); alert.id = 'microfront-warning';
    alert.setAttribute('role', 'status'); alert.setAttribute('aria-live', 'polite'); root.append(alert);
  }
  if (alert) {
    alert.hidden = !warnings || warnings.hidden || anchorAttacked;
    if (alert.innerHTML !== (warnings?.innerHTML ?? '')) alert.innerHTML = warnings?.innerHTML ?? '';
  }
  const battleDetails = document.getElementById('microfront-battle-details');
  if (battleDetails) {
    battleDetails.hidden = false;
    const markup = missionBattleDetailsMarkup(state);
    if (battleDetails.innerHTML !== markup) battleDetails.innerHTML = markup;
    const help = document.querySelector('.mobile-details-help');
    if (help) help.textContent = '当前清剿已暂停。查看双线进度、拾取和战场地图。';
  }
  for (const id of ['territory-objective', 'territory-detail', 'territory-regions', 'mobile-details-content', 'message']) {
    const element = document.getElementById(id); if (!element) continue;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent ?? '';
      const next = missionCopy(text);
      if (next !== text) walker.currentNode.textContent = next;
    }
  }
}
