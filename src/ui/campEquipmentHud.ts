import { EXPEDITION_ECONOMY, RARITY_NAMES, WEAPONS, WEAPON_IDS, isLegendaryWeaponId, isWeaponId, rarityRank, weaponCombatProfile, type WeaponId, type WeaponRarity } from '../game/expedition';
import { CRAFT_RECIPES, DECOMPOSE_FRAGMENTS, DECOMPOSE_MATERIALS, MISSIONS, MODULE_IDS, MODULE_NAMES, TEMPLATE_IDS, moduleRank, type InventoryItem, type TemplateId } from '../game/microfront';
import type { ProtocolId } from '../game/growthTypes';
import { describeProtocol } from '../game/protocols';
import { weaponSkillDefinitions, WEAPON_SKILL_BALANCE } from '../game/weaponSkills';
import { weaponUltimateDefinition } from '../game/weaponUltimates';
import { REDBLADE_PRIMARY } from '../game/weaponMelee';
import { PLAYER_PROJECTILE_BALANCE } from '../game/playerProjectiles';
import { THUNDER_BALANCE } from '../game/thunderCombat';
import { canCraftTemplate, campDecomposeEligibility, type CampProfileSnapshot } from '../meta/campProfile';
import { weaponSkillIconMarkup, weaponUltimateIconMarkup } from './weaponSkillIcons';
import { campCraftRarity, createCampEquipmentState, normalizeCampEquipmentState, type CampEquipmentDetail, type CampEquipmentState } from './campEquipmentState';

type EquipmentSection = 'warehouse' | 'forge';
const escape = (v: string) => v.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const number = (value: number) => String(Number(value.toFixed(1)));
const templateName = (id: TemplateId) => isWeaponId(id) ? WEAPONS[id].name : MODULE_NAMES[id];
const art = (id: TemplateId) => `${isWeaponId(id) ? 'weapon' : 'module'}-${id}`;
const quality = (value: WeaponRarity | null, empty = '未获得') => value ? `<span class="camp-quality camp-quality-${value}">${RARITY_NAMES[value]}</span>` : `<span class="eq-muted">${empty}</span>`;
const weaponRoles: Record<WeaponId, string> = { steady: '追踪速射 · 近身解围', piercing: '往返贯穿 · 聚敌收割', thunder: '持续群电 · 感电裁决', redblade: '近身连斩 · 招架突进' };
const weaponCombos: Record<WeaponId, string> = {
  steady: '追针猎群 → 双震解围 → 蜂巢暴走持续齐射；充能后展开蜂后歼灭阵。',
  piercing: '涡锚聚敌 → 裂脉重刃贯穿 → 横移接回缝刃潮；天轮收回追加终结圆斩。',
  thunder: '长按电住 → 引雷磁极聚怪供电 → 雷遁穿场 → 断罪连爆；4开启随身雷暴，再按4立即裁决。',
  redblade: '逆鳞返刃招架反击 → 破阵疾斩切入 → 赤曜剑域持续压制；四曜穿心连接四点，沿轨迹穿刺。',
};
const weaponSource = (id: WeaponId) => isLegendaryWeaponId(id)
  ? '血流接引抽到首把解锁；之后可消耗对应碎片定向重铸传说。'
  : id === 'steady' ? '初始赠送史诗品质；收集碎片可定向打造。' : '当前母巢通关赠送史诗品质；清剿掉落、碎片锻造或血流接引。';
function bestModule(snapshot: CampProfileSnapshot, id: ProtocolId): InventoryItem | undefined {
  return snapshot.data.inventory.filter(item => item.templateId === id && item.repaired).sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity))[0];
}
function loadoutUsesTemplate(snapshot: CampProfileSnapshot, item: InventoryItem): boolean {
  return item.kind === 'weapon' ? snapshot.data.equipped === item.templateId : snapshot.data.equippedModules.includes(item.templateId as ProtocolId);
}
function itemButton(action: string, field: string, id: string, name: string, icon: string, subtitle: string, status: string, selected: boolean, extra = ''): string {
  return `<button class="eq-item${selected ? ' is-selected' : ''}${extra}" data-action="${action}" data-${field}="${escape(id)}" aria-pressed="${selected}"><span class="eq-item-icon" data-camp-art="${icon}" aria-hidden="true"></span><span class="eq-item-copy"><strong>${name}</strong><small>${subtitle}</small></span>${status ? `<span class="eq-item-state">${status}</span>` : ''}</button>`;
}
function header(id: TemplateId, rarity: WeaponRarity | null, kicker: string, tags = '', empty = '未获得'): string {
  return `<header class="eq-detail-header"><span class="eq-hero-icon" data-camp-art="summon-hero-${art(id)}" aria-hidden="true"></span><div><p class="eq-kicker">${kicker}</p><h3>${templateName(id)}</h3><div class="eq-tags">${quality(rarity, empty)}${tags}</div></div></header>`;
}
function subnav(state: CampEquipmentState, entries: [CampEquipmentDetail, string][]): string {
  if (state.detail === 'summary') return '';
  return `<nav class="eq-subnav" aria-label="返回装备概览"><button data-action="eq-detail" data-detail="summary">‹ 返回${entries[0][1]}</button></nav>`;
}
function detailLinks(state: CampEquipmentState, entries: [CampEquipmentDetail, string][]): string {
  return state.detail === 'summary' ? `<nav class="eq-detail-links" aria-label="更多装备信息">${entries.map(([detail, label]) => `<button data-action="eq-detail" data-detail="${detail}">${label} <span aria-hidden="true">›</span></button>`).join('')}</nav>` : '';
}
function actions(buttons: string, notice: string, hint = ''): string {
  return `<div class="eq-actions">${notice ? `<p class="eq-feedback" role="status">${escape(notice)}</p>` : ''}${hint ? `<p class="eq-action-hint">${hint}</p>` : ''}<div class="eq-action-buttons">${buttons}</div></div>`;
}
function stat(label: string, value: string): string { return `<div><span>${label}</span><strong>${value}</strong></div>`; }
function weaponStats(id: WeaponId, rarity: WeaponRarity | null, upgrade: number): string {
  if (!rarity) return '<p class="eq-hint">获得并修复后可装备与试用，技能说明可提前查看。</p>';
  const stats = weaponCombatProfile({ weaponId: id, rarity, upgrade });
  return `<div class="eq-stats">${stat('基础伤害', number(stats.primaryDamage))}${id === 'piercing' ? stat('回程伤害', number(stats.primaryDamage * PLAYER_PROJECTILE_BALANCE.crescent.returnDamageFactor)) : ''}${stat('永久增幅', `+${Math.round((stats.permanentMultiplier - 1) * 100)}%`)}${stat('强化等级', `+${upgrade} / +3`)}</div><p class="eq-hint">含当前品质与强化，不含局内成长。</p>`;
}
/** Detailed mechanics are mounted for the selected weapon only, after an explicit detail action. */
function weaponKitMarkup(id: WeaponId, repaired: WeaponRarity | null, upgrade: number): string {
  const profile = weaponCombatProfile({ weaponId: id, rarity: repaired ?? (isLegendaryWeaponId(id) ? 'gold' : 'purple'), upgrade: repaired ? upgrade : 0 });
  const b = WEAPON_SKILL_BALANCE, damage = profile.primaryDamage;
  const numbers = id === 'steady' ? [
    `每针${number(damage * b.burst.damageFactor)}伤害 × ${b.burst.count}针 · 射程${b.burst.range}`,
    `首震${number(damage * b.repulse.damageFactor)}＋追震${number(damage)}伤害 · 范围${b.repulse.radius}`,
    `持续${b.overdrive.duration}秒 · 加速普攻＋两根45%伤害侧针`,
  ] : id === 'piercing' ? [
    `${number(damage * b.heavy.damageFactor)}伤害 · 最多${b.heavy.targets}体 · 后续命中递增，最多＋${b.heavy.maximumBonus * 100}%`,
    `${number(damage * b.gather.damageFactor)}伤害 · 范围${b.gather.radius} · 持续牵引${b.gather.delay}秒`,
    `每片去程${number(damage * b.fan.damageFactor)}／回程${number(damage * b.fan.damageFactor * b.fan.returnDamageFactor)}伤害 · 每体每程最多两片`,
  ] : id === 'thunder' ? [
    `感电${number(damage * THUNDER_BALANCE.detonate.markedFactor)}／未感电${number(damage * THUNDER_BALANCE.detonate.ordinaryFactor)}伤害 · 范围${THUNDER_BALANCE.detonate.radius}`,
    `落地${number(damage * THUNDER_BALANCE.rod.factor)}伤害 · 供电${THUNDER_BALANCE.rod.duration}秒 · 覆盖${THUNDER_BALANCE.rod.radius}`,
    `穿行${THUNDER_BALANCE.dash.range}距离 · ${number(damage * THUNDER_BALANCE.dash.factor)}伤害 · 留雷痕${THUNDER_BALANCE.dash.trailDuration}秒`,
  ] : ['', '', ''];
  const primaryName = { steady: '蜂巢速射', piercing: '往返骨刃', thunder: '霆链电刑', redblade: '近身三连斩' }[id];
  const primaryDescription = id === 'piercing' ? `去程${number(damage)}／回程${number(damage * PLAYER_PROJECTILE_BALANCE.crescent.returnDamageFactor)}伤害，每程基础命中两体；走位改变回程。`
    : id === 'redblade' ? `三连斩伤害${REDBLADE_PRIMARY.factors.map(factor => number(damage * factor)).join('／')}，半径${REDBLADE_PRIMARY.radii.join('／')}；近身扇形命中多体，第三斩扩大收割。`
    : id === 'thunder' ? `长按持续电击周身${THUNDER_BALANCE.primary.radius}范围最多${THUNDER_BALANCE.primary.targets}个可见目标，主弧保持原普攻伤害率，支弧为${THUNDER_BALANCE.primary.branchFactor * 100}%；命中感电${THUNDER_BALANCE.primary.markDuration}秒，松手即停。` : `每针${number(damage)}伤害，快速单体点杀。`;
  const ultimate = weaponUltimateDefinition(id);
  return `<section class="eq-skill-list camp-weapon-kit" aria-label="${WEAPONS[id].name}普攻、三个战技与大招"><p class="camp-kit-basis">${repaired ? '以下数值已计入当前品质与强化，不含局内成长。' : `以下为${isLegendaryWeaponId(id) ? '传说' : '史诗'}品质预览，获得后按实际装备更新。`}</p><p><b>普攻 · ${primaryName}</b>：${primaryDescription}</p><ol>${weaponSkillDefinitions(id).map((skill, index) => `<li data-camp-skill="${skill.id}"><strong>${weaponSkillIconMarkup(skill.id)}<b>${skill.slot} · ${skill.name}</b></strong><small>冷却${skill.cooldown}秒</small><span>${skill.description}</span>${numbers[index] ? `<span class="camp-skill-numbers">${numbers[index]}</span>` : ''}</li>`).join('')}<li class="camp-ultimate-kit" data-camp-skill="${ultimate.id}"><strong>${weaponUltimateIconMarkup(ultimate.id)}<b>4 · ${ultimate.name}</b></strong><small>战斗充能 · ${ultimate.required}能量</small><span>${ultimate.description}</span><span>普通病毒＋2、精英＋12；母巢总耐久每降低1%＋2；大招伤害不回充，返营清空。</span></li></ol><p class="camp-combo">打法：${weaponCombos[id]}</p><p>${repaired ? '已修复 · 三个战技全部可用，大招在关卡内充能后释放。' : '获得并修复后，开放普攻、三个战技与战斗充能大招。'}</p></section>`;
}
function weaponInfo(id: WeaponId): string {
  return `<section class="eq-info"><h4>武器定位</h4><p>${WEAPONS[id].description}</p><h4>获得条件</h4><p>${weaponSource(id)}</p></section>`;
}
function weaponList(snapshot: CampProfileSnapshot, selected: WeaponId, maintenance: boolean): string {
  const { data } = snapshot;
  return WEAPON_IDS.map(id => {
    const item = data.weapons[id], equipped = data.equipped === id;
    return itemButton(maintenance ? 'eq-select-maintenance' : 'eq-select-weapon', 'weapon', id, WEAPONS[id].name, art(id), `${quality(item.repaired ?? item.pending)}${item.repaired ? ` · +${item.upgrade}` : item.pending ? ' · 待修复' : ''}`, maintenance && item.pending ? '待修复' : equipped ? '已装备' : '', selected === id, `${equipped ? ' is-equipped' : ''}${!item.repaired && !item.pending ? ' is-locked' : ''}`);
  }).join('');
}
function weaponDetail(snapshot: CampProfileSnapshot, state: CampEquipmentState, notice: string): string {
  const { data } = snapshot, id = state.weaponId, item = data.weapons[id], equipped = id === data.equipped;
  const content = state.detail === 'skills' ? weaponKitMarkup(id, item.repaired, item.upgrade) : state.detail === 'info' ? weaponInfo(id)
    : `<p class="eq-role">${weaponRoles[id]}</p>${weaponStats(id, item.repaired, item.upgrade)}${item.pending ? `<p class="eq-hint">已带回${RARITY_NAMES[item.pending]}候选，前往锻造台修复后可用。</p>` : ''}`;
  const buttons = equipped && item.repaired ? `<button class="primary" data-action="camp-trial" data-weapon="${id}">试用</button>` : `<button class="primary" data-action="camp-equip" data-weapon="${id}" ${!item.repaired ? 'disabled' : ''}>${item.repaired ? '装备武器' : item.pending ? '待修复' : '尚未获得'}</button>${item.repaired ? `<button data-action="camp-trial" data-weapon="${id}">试用</button>` : ''}`;
  return `<section class="eq-detail" data-camp-weapon="${id}" data-equipment-weapon="${id}"><div class="eq-detail-scroll">${header(id, item.repaired, '主武器', `<span class="eq-tag">+${item.upgrade}</span>${equipped ? '<span class="eq-tag is-equipped">已装备</span>' : ''}`, item.pending ? '待修复' : '未获得')}${subnav(state, [['summary', '概览'], ['skills', '技能'], ['info', '获取与说明']])}${content}${detailLinks(state, [['skills', '战技与大招'], ['info', '获取与说明']])}</div>${actions(buttons, notice, '出发后固定配装')}</section>`;
}
function loadout(snapshot: CampProfileSnapshot): string {
  const { data } = snapshot;
  return `<div class="eq-loadout-summary"><span>出击配装</span><strong>${WEAPONS[data.equipped].name}</strong><small>模组 ${data.equippedModules.length} / 3 槽</small></div>`;
}
function moduleDetail(snapshot: CampProfileSnapshot, state: CampEquipmentState, notice: string): string {
  const { data } = snapshot, id = state.moduleId, item = bestModule(snapshot, id), equipped = data.equippedModules.includes(id), full = data.equippedModules.length >= 3;
  const effect = describeProtocol(id, 'balanced', moduleRank(item?.rarity ?? 'blue')).effect;
  const slots = `<div class="eq-module-slots" aria-label="当前三个模组槽">${Array.from({ length: 3 }, (_, index) => {
    const module = data.equippedModules[index];
    return module ? `<button data-action="eq-select-module" data-module="${module}" title="${MODULE_NAMES[module]}" aria-label="查看${MODULE_NAMES[module]}"><span class="eq-slot-icon" data-camp-art="${art(module)}" aria-hidden="true"></span><span>${MODULE_NAMES[module].replace('模组', '')}</span></button>` : '<span class="eq-empty-slot">空槽</span>';
  }).join('')}</div>`;
  const content = state.detail === 'info' ? '<section class="eq-info"><h4>获得方式</h4><p>清剿任务、血流接引与碎片锻造均可获得模组。同型号按已拥有的最高品质生效。</p><p>基础驻军和三个武器技能始终可用。</p></section>'
    : `<p class="eq-role">${item ? `当前效果 · 等级${moduleRank(item.rarity)}` : '蓝色品质效果预览'}</p><p class="eq-module-effect">${effect}</p>${slots}<p class="eq-hint">同型号按最高品质生效，最多装入三个不同模组。</p>`;
  return `<section class="eq-detail" data-equipment-module="${id}"><div class="eq-detail-scroll">${header(id, item?.rarity ?? null, `机制模组 · ${data.equippedModules.length} / 3 槽`, equipped ? '<span class="eq-tag is-equipped">已装入</span>' : '')}${subnav(state, [['summary', '概览'], ['info', '获取与说明']])}${content}${detailLinks(state, [['info', '获取与说明']])}</div>${actions(`<button class="primary" data-action="camp-module" data-module="${id}" ${!item || !equipped && full ? 'disabled' : ''}>${equipped ? '卸下模组' : !item ? '尚未获得' : full ? '模组槽已满' : '装入模组'}</button>`, notice, !equipped && item && full ? '先卸下一项模组，再装入当前模组' : '出发后固定配装')}</section>`;
}
function ledger(snapshot: CampProfileSnapshot): string {
  return `<section class="eq-fragment-ledger"><h4>型号碎片</h4><dl>${TEMPLATE_IDS.map(id => `<div><dt>${templateName(id)}</dt><dd>${snapshot.data.fragments[id] ?? 0}</dd></div>`).join('')}</dl></section>`;
}
function inventoryDetail(snapshot: CampProfileSnapshot, state: CampEquipmentState, notice: string): string {
  const item = snapshot.data.inventory.find(value => value.id === state.inventoryItemId);
  if (!item) return `<section class="eq-detail"><div class="eq-detail-scroll"><div class="eq-empty"><h3>暂无战利品</h3><p>清剿或血流接引获得的装备会存入这里。</p>${ledger(snapshot)}</div></div>${actions('', notice)}</section>`;
  const eligibility = campDecomposeEligibility(snapshot.data, item.id), copies = snapshot.data.inventory.filter(candidate => candidate.templateId === item.templateId).length;
  const inLoadout = loadoutUsesTemplate(snapshot, item);
  const content = state.detail === 'ledger' ? ledger(snapshot) : state.detail === 'info'
    ? `<section class="eq-info"><h4>装备说明</h4><p>${isWeaponId(item.templateId) ? weaponSource(item.templateId) : '清剿任务、碎片锻造或血流接引获得。同型号模组按最高品质生效。'}</p><h4>分解保护</h4><p>保留最后一把可用基础武器；配装中且没有同等或更好替代副本的装备受到保护。</p></section>`
    : `<div class="eq-stats">${stat('同型号库存', `${copies} 件`)}${stat('装备状态', item.repaired ? '可用' : '破损')}</div>${inLoadout ? '<p class="eq-hint">当前配装使用此型号，按已修复的最高品质生效；副本可按保护规则单独分解。</p>' : ''}<section class="eq-salvage"><h4>分解回收</h4><p><strong>${DECOMPOSE_FRAGMENTS[item.rarity]}</strong> 型号碎片 <span>＋</span> <strong>${DECOMPOSE_MATERIALS[item.rarity]}</strong> 生质</p></section><p class="eq-hint${eligibility.allowed ? '' : ' eq-protected'}">${eligibility.allowed ? '仅分解当前选中的这一件，操作后立即回收材料。' : eligibility.message}</p>`;
  const tags = `${inLoadout ? '<span class="eq-tag">配装使用此型号</span>' : ''}${!eligibility.allowed ? '<span class="eq-tag">受保护</span>' : ''}`;
  return `<section class="eq-detail" data-equipment-item="${escape(item.id)}"><div class="eq-detail-scroll">${header(item.templateId, item.rarity, `战利品整理 · ${item.repaired ? '可用' : '破损'}`, tags)}${subnav(state, [['summary', '分解预览'], ['info', '说明'], ['ledger', '碎片账本']])}${content}${detailLinks(state, [['info', '分解说明'], ['ledger', '碎片账本']])}</div>${actions(`<button class="primary eq-destructive" data-action="camp-decompose" data-item="${escape(item.id)}" ${eligibility.allowed ? '' : 'disabled'}>${eligibility.allowed ? '分解这件装备' : '装备受保护'}</button>`, notice)}</section>`;
}
function maintenanceDetail(snapshot: CampProfileSnapshot, state: CampEquipmentState, notice: string): string {
  const { data } = snapshot, id = state.forgeWeaponId, item = data.weapons[id], repair = state.maintenanceMode === 'repair';
  const cost = repair ? EXPEDITION_ECONOMY.repair : EXPEDITION_ECONOMY.upgrade[item.upgrade];
  const available = repair ? !!item.pending : !!item.repaired && item.upgrade < 3;
  const affordable = available && data.materials >= (cost ?? 0);
  const before = item.repaired ? weaponCombatProfile({ weaponId: id, rarity: item.repaired, upgrade: item.upgrade }).primaryDamage : null;
  const afterRarity = repair ? item.pending : item.repaired;
  const after = available && afterRarity ? weaponCombatProfile({ weaponId: id, rarity: afterRarity, upgrade: item.upgrade + (repair ? 0 : 1) }).primaryDamage : null;
  const modes = item.pending && item.repaired ? `<div class="eq-segmented" aria-label="武器维护方式"><button data-action="eq-maintenance-mode" data-mode="repair" aria-pressed="${repair}">修复 · ${RARITY_NAMES[item.pending]}</button><button data-action="eq-maintenance-mode" data-mode="upgrade" aria-pressed="${!repair}">强化 · +${item.upgrade} / +3</button></div>` : '';
  const summary = `${modes}<p class="eq-role">${repair ? '修复带回的更高品质候选' : '提升这把武器的永久伤害'}</p>${repair && item.pending ? `<p class="eq-maintenance-result">${quality(item.repaired, '未修复')} <span aria-hidden="true">→</span> ${quality(item.pending)} · 保留强化 +${item.upgrade}</p>` : ''}<div class="eq-stats">${stat('当前伤害', before === null ? '未修复' : number(before))}${stat(repair ? '修复后伤害' : '强化后伤害', after === null ? '—' : number(after))}</div>${available ? `<div class="eq-costs">${resourceCost('生质', data.materials, cost ?? 0, 'biomass')}</div>` : `<p class="eq-hint">${item.repaired && item.upgrade >= 3 ? '已达到 +3 强化上限。' : '获得并修复这把武器后可强化。'}</p>`}`;
  const content = state.detail === 'skills' ? weaponKitMarkup(id, item.repaired, item.upgrade) : state.detail === 'info' ? weaponInfo(id) : summary;
  const label = repair ? '修复武器' : item.upgrade >= 3 ? '已达 +3 上限' : `强化至 +${item.upgrade + 1}`;
  return `<section class="eq-detail" data-camp-weapon="${id}" data-equipment-weapon="${id}"><div class="eq-detail-scroll">${header(id, item.repaired, '武器维护', `<span class="eq-tag">+${item.upgrade}</span>${item.pending ? '<span class="eq-tag">待修复</span>' : ''}`, item.pending ? '未修复' : '未获得')}${subnav(state, [['summary', '概览'], ['skills', '技能'], ['info', '获取与说明']])}${content}${detailLinks(state, [['skills', '战技与大招'], ['info', '获取与说明']])}</div>${actions(`<button class="primary" data-action="${repair ? 'camp-repair' : 'camp-upgrade'}" data-weapon="${id}" ${affordable ? '' : 'disabled'}>${label}${available ? ` · ${cost}生质` : ''}</button>${item.repaired ? `<button data-action="camp-trial" data-weapon="${id}">试用</button>` : ''}`, notice, available && !affordable ? `生质不足，还差${(cost ?? 0) - data.materials}` : repair ? '修复后前往装备仓库换装' : '强化对该型号永久生效')}</section>`;
}
function resourceCost(name: string, owned: number, needed: number, icon: string): string {
  return `<div class="eq-cost${owned < needed ? ' is-short' : ''}"><span class="eq-cost-icon" data-camp-art="${icon}" aria-hidden="true"></span><span>${name}</span><strong>${owned} / ${needed}</strong></div>`;
}
function sources(id: TemplateId): string {
  const mission = Object.values(MISSIONS).find(value => value.fragmentTemplateId === id);
  return `<section class="eq-info eq-source-list"><h4>材料来源</h4><p>型号碎片：${mission ? `${mission.name}成功奖励、` : ''}分解同型号装备、血流接引与清剿掉落。</p><p>生质：清剿拾取、任务成功奖励或分解闲置装备。</p><p>锻造核心：${MISSIONS.boundary.name}成功奖励或血流接引。</p>${isLegendaryWeaponId(id) ? '<p>传说武器首次接引获得后，永久解锁该型号的金色重铸。</p>' : ''}</section>`;
}
function craftDetail(snapshot: CampProfileSnapshot, state: CampEquipmentState, notice: string): string {
  const { data } = snapshot, id = state.craftTemplateId, rarity = campCraftRarity(state), recipe = CRAFT_RECIPES[rarity];
  const unlocked = canCraftTemplate(data, id, rarity), fragments = data.fragments[id] ?? 0;
  const affordable = unlocked && fragments >= recipe.fragments && data.materials >= recipe.materials && data.cores >= recipe.cores;
  const legendary = isLegendaryWeaponId(id), owned = data.inventory.filter(item => item.templateId === id).length;
  const duplicate = data.inventory.some(item => item.templateId === id && item.repaired && rarityRank(item.rarity) >= rarityRank(rarity));
  const options = `<div class="eq-rarities" aria-label="选择打造品质">${(legendary ? ['gold'] as const : ['blue', 'purple', 'gold'] as const).map(value => `<button data-action="eq-rarity" data-rarity="${value}" aria-pressed="${rarity === value}">${quality(value)}</button>`).join('')}</div>`;
  const summary = `${options}<p class="eq-role">${legendary ? '定向重铸传说武器' : `打造一件${RARITY_NAMES[rarity]}${isWeaponId(id) ? '武器' : '模组'}`}</p><div class="eq-costs">${resourceCost('型号碎片', fragments, recipe.fragments, 'model-fragment')}${resourceCost('生质', data.materials, recipe.materials, 'biomass')}${recipe.cores ? resourceCost('锻造核心', data.cores, recipe.cores, 'forge-core') : ''}</div><p class="eq-craft-result">获得：${quality(rarity)} ${templateName(id)} × 1</p><p class="eq-hint">${duplicate ? '已拥有同品质或更高品质，打造结果为重复件，可用于分解。' : '成品直接入库，同型号按最高品质生效。'}</p>${!unlocked ? '<p class="eq-protected">首次抽取后解锁重铸。请先通过血流接引获得这把传说武器。</p>' : ''}`;
  const content = state.detail === 'sources' ? sources(id) : state.detail === 'info' ? isWeaponId(id) ? weaponInfo(id) : `<section class="eq-info"><h4>模组效果</h4><p>${describeProtocol(id, 'balanced', moduleRank(rarity)).effect}</p></section>` : summary;
  const shortage = [fragments < recipe.fragments ? `${recipe.fragments - fragments}型号碎片` : '', data.materials < recipe.materials ? `${recipe.materials - data.materials}生质` : '', data.cores < recipe.cores ? `${recipe.cores - data.cores}锻造核心` : ''].filter(Boolean).join('、');
  return `<section class="eq-detail" data-recipe-template="${id}"><div class="eq-detail-scroll">${header(id, rarity, legendary ? '传说重铸' : '定向打造', `<span class="eq-tag">已拥有 ${owned} 件</span>${legendary && unlocked ? '<span class="eq-tag">已解锁重铸</span>' : ''}`)}${subnav(state, [['summary', '配方'], ['info', '装备说明'], ['sources', '材料来源']])}${content}${detailLinks(state, [['info', '装备说明'], ['sources', '材料来源']])}</div>${actions(`<button class="primary" data-action="camp-craft" data-template="${id}" data-rarity="${rarity}" ${affordable ? '' : 'disabled'}>${legendary ? '重铸传说武器' : `打造${RARITY_NAMES[rarity]}装备`}</button>`, notice, !unlocked ? '首次接引获得后解锁重铸' : shortage ? `还差 ${shortage}` : '材料齐全，可立即打造')}</section>`;
}
export function equipmentTabsMarkup(section: EquipmentSection, state: CampEquipmentState): string {
  const entries = section === 'warehouse' ? [['weapons', '武器'], ['modules', '模组'], ['inventory', '整理']] : [['maintenance', '修复 / 强化'], ['craft', '打造']];
  return `<nav class="eq-tabs" aria-label="${section === 'warehouse' ? '仓库' : '锻造'}功能" role="tablist">${entries.map(([tab, title]) => `<button class="eq-tab" role="tab" data-action="eq-tab" data-section="${section}" data-tab="${tab}" aria-selected="${(section === 'warehouse' ? state.warehouseTab : state.forgeTab) === tab}">${title}</button>`).join('')}</nav>`;
}
export function campEquipmentMarkup(snapshot: CampProfileSnapshot, section: EquipmentSection,
  value: CampEquipmentState = createCampEquipmentState(snapshot), notice = ''): string {
  const state = normalizeCampEquipmentState(snapshot, value), { data } = snapshot;
  const tab = section === 'warehouse' ? state.warehouseTab : state.forgeTab;
  let list: string, detail: string, selection: string;
  if (section === 'warehouse' && tab === 'weapons') {
    list = `${loadout(snapshot)}<h3 class="eq-list-title">武器 <small>${WEAPON_IDS.filter(id => data.weapons[id].repaired).length} / ${WEAPON_IDS.length}</small></h3>${weaponList(snapshot, state.weaponId, false)}`;
    detail = weaponDetail(snapshot, state, notice); selection = state.weaponId;
  } else if (section === 'warehouse' && tab === 'modules') {
    list = `${loadout(snapshot)}<h3 class="eq-list-title">机制模组 <small>${data.equippedModules.length} / 3 槽</small></h3>${MODULE_IDS.map(id => {
      const item = bestModule(snapshot, id), equipped = data.equippedModules.includes(id);
      return itemButton('eq-select-module', 'module', id, MODULE_NAMES[id], art(id), quality(item?.rarity ?? null), equipped ? '已装入' : '', state.moduleId === id, equipped ? ' is-equipped' : !item ? ' is-locked' : '');
    }).join('')}`;
    detail = moduleDetail(snapshot, state, notice); selection = state.moduleId;
  } else if (section === 'warehouse') {
    list = `<h3 class="eq-list-title">战利品 <small>${data.inventory.length} 件</small></h3>${data.inventory.length ? data.inventory.map(item => {
      const eligibility = campDecomposeEligibility(data, item.id);
      return itemButton('eq-select-inventory', 'item', item.id, templateName(item.templateId), art(item.templateId), `${quality(item.rarity)} · ${item.repaired ? '可用' : '破损'}`, eligibility.allowed ? loadoutUsesTemplate(snapshot, item) ? '配装型号' : '' : '受保护', state.inventoryItemId === item.id);
    }).join('') : '<p class="eq-empty-list">暂无战利品</p>'}`;
    detail = inventoryDetail(snapshot, state, notice); selection = state.inventoryItemId ?? '';
  } else if (tab === 'maintenance') {
    list = `<h3 class="eq-list-title">武器维护</h3>${weaponList(snapshot, state.forgeWeaponId, true)}`;
    detail = maintenanceDetail(snapshot, state, notice); selection = state.forgeWeaponId;
  } else {
    list = `<h3 class="eq-list-title">打造型号 <small>${TEMPLATE_IDS.length}</small></h3>${TEMPLATE_IDS.map((id, index) => {
      const unlocked = !isLegendaryWeaponId(id) || data.unlockedLegendaryWeapons.includes(id);
      return `${index === 0 ? '<h4 class="eq-list-group">武器</h4>' : index === WEAPON_IDS.length ? '<h4 class="eq-list-group">机制模组</h4>' : ''}${itemButton('eq-select-recipe', 'template', id, templateName(id), art(id), `${data.fragments[id] ?? 0} 型号碎片`, unlocked ? '' : '未解锁', state.craftTemplateId === id, unlocked ? '' : ' is-locked')}`;
    }).join('')}`;
    detail = craftDetail(snapshot, state, notice); selection = state.craftTemplateId;
  }
  return `<div class="eq-workspace" data-eq-section="${section}" data-eq-tab="${tab}" data-eq-selection="${escape(selection)}" data-eq-detail="${state.detail}"><aside class="eq-list" aria-label="装备列表">${list}</aside>${detail}</div>`;
}
