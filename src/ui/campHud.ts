import { EXPEDITION_ECONOMY, RARITY_NAMES, WEAPONS, WEAPON_IDS, weaponCombatProfile, type WeaponId, type WeaponRarity } from '../game/expedition';
import type { CampProfileSnapshot } from '../meta/campProfile';
import { weaponSkillDefinitions, WEAPON_SKILL_BALANCE } from '../game/weaponSkills';
import { PLAYER_PROJECTILE_BALANCE } from '../game/playerProjectiles';
import { CRAFT_RECIPES, DECOMPOSE_FRAGMENTS, DECOMPOSE_MATERIALS, isMissionUnlocked, MISSIONS, MODULE_IDS, MODULE_NAMES, TEMPLATE_IDS, type DrawReceipt, type MissionId, type TemplateId } from '../game/microfront';
import { describeProtocol } from '../game/protocols';
import type { ProtocolId } from '../game/growthTypes';
import type { CampStationId } from '../game/campLayout';
import { CAMP_FACILITY_PROGRESS, INTRO_FACILITY_IDS, campHasFacility } from '../game/campProgression';
import { campStationAttention, type CampStationAttention } from '../game/campAttention';
import { campSummonMarkup } from './campSummonHud';

export type CampSection = 'overview' | 'warehouse' | 'forge' | 'shop' | 'departure' | 'missions' | 'summon' | 'trial';
export const CAMP_SECTIONS: readonly CampSection[] = ['overview', 'missions', 'warehouse', 'forge', 'shop', 'summon'];
const LABELS: Record<CampSection, string> = { overview: '微观前哨', warehouse: '装备仓库', forge: '锻造台', shop: '补给站', departure: '侦查情报', missions: '侦查情报', summon: '血流接引', trial: '安全试枪场' };
export interface CampPresentation { trialCompleted?: boolean; trialWeaponId?: WeaponId; drawReceipt?: DrawReceipt; nearbyStationId?: CampStationId }
export function campSectionStation(section: CampSection): CampStationId | undefined {
  return section === 'overview' ? undefined : section === 'trial' ? 'warehouse' : section === 'missions' ? 'departure' : section;
}
export function campAttentionBadge(attention?: CampStationAttention): string {
  return attention ? `<span class="camp-attention-badge" data-attention="${attention.kind}"><b aria-hidden="true">${attention.kind === 'build' ? '⚒' : '!'}</b> ${attention.label}${attention.count > 1 ? ` · ${attention.count}` : ''}</span>` : '';
}
export interface CampFirstStep { step: 'repair' | 'equip' | 'trial'; weaponId: WeaponId; title: string; description: string }
const escape = (v: string) => v.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const rarityName = (value: WeaponRarity) => value === 'gold' ? '神级' : RARITY_NAMES[value];
const quality = (v: WeaponRarity | null) => v ? `<span class="camp-quality camp-quality-${v}">${rarityName(v)}</span>` : '<span class="camp-muted">未收藏</span>';
const templateName = (id: TemplateId) => id === 'steady' || id === 'piercing' ? WEAPONS[id].name : MODULE_NAMES[id];
function weaponKitMarkup(id: WeaponId, repaired: WeaponRarity | null, upgrade: number): string {
  const weapon = WEAPONS[id], profile = weaponCombatProfile({ weaponId: id, rarity: repaired ?? 'white', upgrade: repaired ? upgrade : 0 });
  const b = WEAPON_SKILL_BALANCE, damage = profile.primaryDamage, number = (value: number) => String(Number(value.toFixed(1)));
  const numbers = id === 'steady' ? [
    `每针${number(damage * b.burst.damageFactor)}伤害 × ${b.burst.count}针 · 射程${b.burst.range}`,
    `${number(damage * b.repulse.damageFactor)}伤害 · 范围${b.repulse.radius} · 击退最多${b.repulse.displacement}`,
    `持续${b.overdrive.duration}秒 · 加速普攻＋两根35%伤害侧针`,
  ] : [
    `${number(damage * b.heavy.damageFactor)}伤害 · 最多${b.heavy.targets}体 · 后续命中递增，最多＋${b.heavy.maximumBonus * 100}%`,
    `${number(damage * b.gather.damageFactor)}伤害 · 范围${b.gather.radius} · 持续牵引${b.gather.delay}秒`,
    `去程${number(damage * b.fan.damageFactor)}／回程${number(damage * b.fan.damageFactor * b.fan.returnDamageFactor)}伤害 · 每体每程最多一次`,
  ];
  return `<section class="camp-weapon-kit" aria-label="${weapon.name}普攻与三个技能"><p class="camp-kit-basis">${repaired ? '以下数值已计入当前品质与强化，不含局内成长。' : '以下为普通品质基础参数，获得并修复后按实际装备更新。'}</p><p><b>普攻 · ${id === 'steady' ? '蜂巢速射' : '往返骨刃'}</b>：${id === 'steady' ? `每针${number(damage)}伤害，快速单体点杀。` : `去程${number(damage)}／回程${number(damage * PLAYER_PROJECTILE_BALANCE.crescent.returnDamageFactor)}伤害，每程基础命中两体；节奏较慢，走位改变回程。`}</p><ol>${weaponSkillDefinitions(id).map((skill, index) => `<li data-camp-skill="${skill.id}"><strong>${skill.slot} · ${skill.name}</strong><small>冷却${skill.cooldown}秒</small><span>${skill.description}</span><span class="camp-skill-numbers">${numbers[index]}</span></li>`).join('')}</ol><p class="camp-combo">${id === 'steady' ? '打法：追针点杀后排，敌人贴身时震环解围，超载齐射抢输出。' : '打法：束脉锚聚敌 → 侧移排线 → 蓄势穿心；发出回刃后横移收割。'}</p><p class="camp-kit-unlock">${repaired ? '已修复 · 三个技能全部可用，单武器出战，营地可换装。' : '获得并修复后，普攻与三个技能一起开放。'}</p></section>`;
}
/** Derived from the collection, with only the disposable practice completion kept by the UI. */
export function campFirstSteps(snapshot: CampProfileSnapshot, trialCompleted = false): CampFirstStep | null {
  const { data } = snapshot;
  if (data.victories !== 1 || trialCompleted) return null;
  const pending = WEAPON_IDS.find(id => data.weapons[id].pending);
  if (pending) return { step: 'repair', weaponId: pending, title: '先修复本次战利品', description: `花10生质修复${WEAPONS[pending].name}，再装备并试射。` };
  if (data.weapons.piercing.repaired && data.equipped !== 'piercing') return { step: 'equip', weaponId: 'piercing', title: '把刃弓带到试枪场', description: '贯脉·回旋刃弓使用较慢的往返骨刃，聚敌与回收各有用途。试射后再决定配装。' };
  return { step: 'trial', weaponId: data.equipped, title: '试用普攻与三个战技', description: '可切换单体耐久靶和五只成线群靶，试用123后再决定配装。' };
}
function firstStepsMarkup(snapshot: CampProfileSnapshot, presentation: CampPresentation): string {
  const next = campFirstSteps(snapshot, presentation.trialCompleted);
  if (!next) return '';
  const action = next.step === 'repair' ? 'data-action="camp-section" data-section="forge"' : `data-action="${next.step === 'equip' ? 'camp-equip-trial' : 'camp-trial'}" data-weapon="${next.weaponId}"`;
  return `<aside class="camp-first-steps" aria-label="首次回营建议"><div><strong>${next.title}</strong><p>${next.description}</p><ol><li data-complete="${next.step !== 'repair'}">修复</li><li data-complete="${next.step === 'trial'}">装备</li><li>试射</li><li>出击</li></ol></div><button ${action}>${next.step === 'repair' ? '前往修复' : next.step === 'equip' ? '装备并试射' : '去试射'}</button></aside>`;
}
function weaponCard(snapshot: CampProfileSnapshot, id: WeaponId, forge: boolean): string {
  const data = snapshot.data, item = data.weapons[id], definition = WEAPONS[id], equipped = data.equipped === id;
  const stats = item.repaired ? weaponCombatProfile({ weaponId: id, rarity: item.repaired, upgrade: item.upgrade }) : null;
  return `<article class="camp-weapon-card${equipped ? ' is-equipped' : ''}" data-camp-weapon="${id}">
    <div class="camp-weapon-icon" data-camp-art="weapon-${id}" aria-hidden="true"></div>
    <div><h3>${definition.name} <small>+${item.upgrade}</small></h3><p>${quality(item.repaired)}${equipped ? '<span class="camp-equipped">已装备</span>' : ''}</p>
    <p><b class="camp-weapon-role">${id === 'steady' ? '追踪速射／贴身震环' : '往返刃弓／聚敌收割'}</b> · ${definition.description}</p><p class="camp-stat">${stats ? `去程伤害 ${stats.primaryDamage.toFixed(1)} · ${1 + stats.extraPierce}个基础目标${id === 'piercing' ? ` · 回程${(stats.primaryDamage * PLAYER_PROJECTILE_BALANCE.crescent.returnDamageFactor).toFixed(1)}伤害` : ''}` : '未修复，不能装备或试射'}${stats ? ` · 永久增幅 ${Math.round((stats.permanentMultiplier - 1) * 100)}%` : ''}</p>
    <p class="camp-weapon-source">获得条件：${id === 'steady' ? '初始常驻，免费可用；收集碎片可定向打造更高品质。' : '清剿掉落、碎片锻造或血流接引；破损战利品带回后花10生质修复。'}</p>
    ${item.pending ? `<p class="camp-pending">待修复：${quality(item.pending)} ${definition.name}</p>` : ''}</div>
    ${weaponKitMarkup(id, item.repaired, item.upgrade)}
    <div class="camp-card-actions">${forge ? `${item.pending ? `<button data-action="camp-repair" data-weapon="${id}" ${data.materials < 10 ? 'disabled' : ''}>修复 · 10生质</button>` : ''}
      ${item.repaired ? `<button data-action="camp-upgrade" data-weapon="${id}" ${item.upgrade >= 3 || data.materials < (EXPEDITION_ECONOMY.upgrade[item.upgrade] ?? 0) ? 'disabled' : ''}>${item.upgrade >= 3 ? '已达 +3 上限' : `强化至 +${item.upgrade + 1} · ${EXPEDITION_ECONOMY.upgrade[item.upgrade]}生质`}</button><button data-action="${equipped ? 'camp-trial' : 'camp-equip-trial'}" data-weapon="${id}">${equipped ? '试射此枪' : '装备并试射'}</button>` : ''}`
      : `<button data-action="camp-equip" data-weapon="${id}" ${!item.repaired || equipped ? 'disabled' : ''}>${equipped ? '当前装备' : item.repaired ? '装备到下次出击' : '请先修复'}</button>${item.repaired ? `<button data-action="camp-trial" data-weapon="${id}">试射此枪</button>` : ''}`}</div>
  </article>`;
}
function missionUnlocked(snapshot: CampProfileSnapshot, id: MissionId): boolean {
  return isMissionUnlocked(id, snapshot.data.completedMissions);
}
function missionsMarkup(snapshot: CampProfileSnapshot): string {
  const { data } = snapshot;
  return `<p class="camp-section-copy">侦察队标记了三处异常微域。选择短程清剿任务，完成报告中的目标后带回战利品；已完成任务可重复出击。</p><div class="camp-missions">${Object.values(MISSIONS).map(mission => {
    const unlocked = missionUnlocked(snapshot, mission.id), completed = data.completedMissions.includes(mission.id), selected = data.selectedMissionId === mission.id;
    return `<article class="camp-mission${selected ? ' is-selected' : ''}" data-mission-card="${mission.id}"><header><span>${mission.region} · ${mission.threat}</span><strong>${completed ? '已完成 · 可重复清剿' : unlocked ? '侦查报告已送达' : '等待前序任务'}</strong></header><h3>${mission.name}</h3><p>${mission.description}</p><ul>${mission.objectives.map(objective => `<li>${objective}</li>`).join('')}</ul><p class="camp-mission-reward">完成奖励：${mission.reward}</p><button data-action="camp-mission" data-mission="${mission.id}" ${!unlocked || selected ? 'disabled' : ''}>${selected ? '已选为下次任务' : unlocked ? '选择这份情报' : `先完成${MISSIONS[mission.id === 'corridor' ? 'membrane' : 'corridor'].name}`}</button></article>`;
  }).join('')}</div><aside class="camp-expedition-brief"><strong>下次配装</strong><p>${WEAPONS[data.equipped].name} · 模组 ${data.equippedModules.length} / 3 · 抗体 ${2 + data.extraAntibodyStock} 支</p><p>途中收集金币、生质与碎片，回营后再锻造和换装。失败或撤离保留已拾金币、生质与碎片的一半；装备和完成奖励仅成功带回。</p></aside>`;
}
function modulesMarkup(snapshot: CampProfileSnapshot): string {
  const { data } = snapshot;
  return `<section class="camp-modules" aria-label="三槽模组配装"><h3>机制模组 <small>${data.equippedModules.length} / 3 槽</small></h3><p class="camp-section-copy">共振破膜、净化连锁、免疫灯塔、显影围猎：在前哨自由搭配，出发后固定配装。基础驻军和三个武器技能始终可用。</p><div class="camp-module-grid">${MODULE_IDS.map(id => {
    const owned = data.inventory.filter(item => item.kind === 'module' && item.templateId === id && item.repaired);
    const item = owned.sort((a, b) => ['white', 'blue', 'purple', 'gold'].indexOf(b.rarity) - ['white', 'blue', 'purple', 'gold'].indexOf(a.rarity))[0];
    const equipped = data.equippedModules.includes(id);
    const rank = item?.rarity === 'gold' ? 3 : item?.rarity === 'purple' ? 2 : 1;
    return `<article class="camp-module${equipped ? ' is-equipped' : ''}"><h4>${MODULE_NAMES[id]}</h4><p>${quality(item?.rarity ?? null)}${equipped ? '<span class="camp-equipped">已装入</span>' : ''}</p><p>${describeProtocol(id, 'balanced', rank).effect}</p><button data-action="camp-module" data-module="${id}" ${!item || !equipped && data.equippedModules.length >= 3 ? 'disabled' : ''}>${equipped ? '卸下模组' : item ? '装入模组槽' : '先收集或锻造'}</button></article>`;
  }).join('')}</div></section>`;
}
function recipesMarkup(snapshot: CampProfileSnapshot): string {
  const { data } = snapshot;
  return `<section class="camp-recipes" aria-label="定向打造配方"><h3><span class="camp-resource-icon" data-camp-art="model-fragment" aria-hidden="true"></span>碎片定向打造</h3><p class="camp-section-copy">清剿、分解和接引都能收集型号碎片。神级成品也能定向打造；锻造核心可由${MISSIONS.boundary.name}成功奖励获得。</p><div class="camp-recipe-grid">${TEMPLATE_IDS.map(id => `<article class="camp-recipe"><h4>${templateName(id)}</h4><p>型号碎片 <b>${data.fragments[id] ?? 0}</b></p>${(Object.keys(CRAFT_RECIPES) as (keyof typeof CRAFT_RECIPES)[]).map(rarity => {
    const recipe = CRAFT_RECIPES[rarity], available = (data.fragments[id] ?? 0) >= recipe.fragments && data.materials >= recipe.materials && data.cores >= recipe.cores;
    return `<div class="camp-recipe-row"><span>${quality(rarity)} ${recipe.fragments}碎片 + ${recipe.materials}生质${recipe.cores ? ` + ${recipe.cores}核心` : ''}</span><button data-action="camp-craft" data-template="${id}" data-rarity="${rarity}" ${available ? '' : 'disabled'}>打造</button></div>`;
  }).join('')}</article>`).join('')}</div></section>`;
}
function inventoryMarkup(snapshot: CampProfileSnapshot): string {
  const { data } = snapshot;
  return `<section class="camp-inventory" aria-label="战利品库存与分解"><h3>战利品库存 <small>${data.inventory.length} 件</small></h3><p class="camp-section-copy">分解闲置战利品，回收对应型号碎片与生质。正在使用的最后一件装备会受到保护，同型号重复件可以分解。</p>${data.inventory.length ? `<div class="camp-inventory-list">${data.inventory.map(item => {
    const equipped = item.kind === 'weapon' ? item.templateId === data.equipped : data.equippedModules.includes(item.templateId as ProtocolId);
    return `<article class="camp-inventory-item"><div><strong>${templateName(item.templateId)}</strong><p>${quality(item.rarity)}${item.repaired ? '可用' : '待修复'}${equipped ? ' · 配装中' : ''}</p><small>分解回收 ${DECOMPOSE_FRAGMENTS[item.rarity]}型号碎片 + ${DECOMPOSE_MATERIALS[item.rarity]}生质</small></div><button data-action="camp-decompose" data-item="${escape(item.id)}">分解</button></article>`;
  }).join('')}</div>` : '<p class="camp-empty">仓库还没有额外战利品。带队清剿，或前往血流接引。</p>'}<details class="camp-fragment-ledger"><summary>查看所有型号碎片</summary><dl>${TEMPLATE_IDS.map(id => `<div><dt>${templateName(id)}</dt><dd>${data.fragments[id] ?? 0}</dd></div>`).join('')}</dl></details></section>`;
}
/** Also used by world-space camp facilities, so panel and map interactions agree. */
export function campOverlay(snapshot: CampProfileSnapshot, section: CampSection = 'overview', introProgress = 1, notice = '', presentation: CampPresentation = {}, summonResult?: DrawReceipt | null): string {
  const { data, status } = snapshot;
  const drawReceipt = summonResult ?? presentation.drawReceipt;
  const ready = data.prologue === 'ready';
  const trialAvailable = section === 'trial' && campHasFacility(data, 'warehouse');
  const established = data.prologue !== 'arrival', attention = campStationAttention(data);
  const stationId = campSectionStation(section), built = stationId ? campHasFacility(data, stationId) : true;
  const nav = established ? CAMP_SECTIONS.map(id => `<button data-action="camp-section" data-section="${id}" ${(section === 'departure' ? id === 'missions' : section === id) ? 'aria-current="page"' : ''}>${LABELS[id]}${campAttentionBadge(attention[campSectionStation(id)!])}</button>`).join('') : '';
  const selected = presentation.trialWeaponId ?? data.equipped;
  const trialWeapons = `<div class="camp-trial-options" aria-label="试射武器">${WEAPON_IDS.filter(id => data.weapons[id].repaired).map(id => `<button data-action="camp-trial" data-weapon="${id}" title="${WEAPONS[id].name}" ${selected === id ? 'aria-pressed="true"' : ''}><strong>${id === 'steady' ? '蜂巢针枪' : '回旋刃弓'}</strong><small>${id === 'steady' ? '追踪速射' : '往返收割'}</small></button>`).join('')}</div>`;
  const trialUtility = `<div class="camp-trial-utility" aria-label="练习靶设置"><button data-action="camp-trial-layout" data-layout="single" aria-label="单体耐久靶" title="单体耐久靶">单体</button><button data-action="camp-trial-layout" data-layout="line" aria-label="成线五群靶" title="成线五群靶">群靶</button><button data-action="camp-trial-reset" aria-label="重置练习靶" title="重置练习靶">重置靶</button></div>`;
  let content: string;
  if (!established) {
    content = `<section class="camp-arrival" aria-label="建立微观前哨"><p class="camp-arrival-kicker">组织液缓流区 · 缓流膜湾</p><h3>找到可以扎根的一片微域</h3><p>带领抗体小队抵达发光的稳态锚，建立前哨后，亲手规划并搭起五座基础建筑。</p><ol><li>关闭面板，带领小队走到稳态锚旁。</li><li>靠近后按E，或点击发光锚点建立前哨。</li><li>逐座确认免费建设，完成后接收第一份异常情报。</li></ol><button class="primary" data-action="camp-establish">在稳态锚旁建立前哨</button><button data-action="camp-close">返回场景 · 寻找稳态锚</button></section>`;
  } else if (stationId && !built) {
    const definition = CAMP_FACILITY_PROGRESS[stationId], active = data.activeConstruction === stationId;
    content = `<section class="camp-build-card" data-build-site="${stationId}"><p class="camp-arrival-kicker">基础建设 · 免费</p><h3>${definition.name}</h3><p>${definition.purpose}</p><p>${active ? '施工随场景推进；关闭面板后小队将继续搭建。' : data.activeConstruction ? '小队正在建设另一座建筑，请待当前施工完成。' : '走到规划地基附近，点击建造标记或按E，让小队搭起这座建筑。'}</p>${active ? '<button data-action="camp-skip-construction">完成当前栋演出</button>' : presentation.nearbyStationId === stationId && !data.activeConstruction ? `<button class="primary" data-action="camp-build" data-station="${stationId}">⚒ 免费建造</button>` : '<button data-action="camp-close">返回场景 · 靠近地基</button>'}</section>`;
  } else if ((section === 'missions' || section === 'departure') && !ready) {
    content = `<section class="camp-build-card"><h3>等待前哨整备完成</h3><p>五座基础建筑已建 ${data.builtFacilities.length} / 5。小队安顿好后，侦察队会送来第一份任务。</p><button data-action="camp-close">返回场景 · 继续搭建</button></section>`;
  } else if (section === 'trial') {
    content = `<p class="camp-section-copy">按0普攻、1／2／3技能，或点击下方按钮；群靶首靶可测试贴身震环。使用当前永久品质与强化，不带局内强化；试枪不消耗物资、不计分。</p><div class="camp-trial-stage"><canvas id="camp-trial-canvas" class="camp-trial-canvas" width="560" height="220" aria-label="独立试枪场：单体耐久靶或五只成线群靶，使用普攻和三个武器技能"></canvas></div>`;
  }
  else if (section === 'warehouse' || section === 'forge') content = `<p class="camp-section-copy">${section === 'forge' ? '收集材料与碎片，定向打造装备和机制模组；修复破损武器，再选择最多三级强化。' : '蜂巢针枪擅长追踪速射与近身解围，回旋刃弓擅长聚敌、贯穿与往返收割。可先试射再决定。'}</p>${section === 'forge' ? recipesMarkup(snapshot) : modulesMarkup(snapshot)}<details class="camp-legacy-weapons" ${section === 'warehouse' ? 'open' : ''}><summary>武器${section === 'forge' ? '修复与强化' : '配装与技能'}</summary><div class="camp-weapons">${WEAPON_IDS.map(id => weaponCard(snapshot, id, section === 'forge')).join('')}</div></details>${section === 'warehouse' ? inventoryMarkup(snapshot) : ''}`;
  else if (section === 'shop') content = `<div class="camp-supply-card"><div class="camp-facility-icon" data-camp-art="supply" aria-hidden="true"></div><h3>抗体增配</h3><p>默认携带2支，可为下次出击额外准备最多2支。</p><p class="camp-stock">已备货 ${data.extraAntibodyStock} / 2 · 出击总计 ${2 + data.extraAntibodyStock} 支</p><button data-action="camp-buy-antibody" ${data.extraAntibodyStock >= 2 || data.materials < 5 ? 'disabled' : ''}>${data.extraAntibodyStock >= 2 ? '备货已满' : '购买1支 · 5生质'}</button><p class="camp-muted">出发时消耗备货，死亡或退出不返还。</p></div>`;
  else if (section === 'departure' || section === 'missions') content = missionsMarkup(snapshot);
  else if (section === 'summon') content = campSummonMarkup(snapshot, drawReceipt);
  else content = `<p class="camp-section-copy">${ready ? '查看建筑上方的提示，靠近后点击整栋建筑或按E即可操作。清剿带回物资，在这里打造与配装。' : '带小队走到每处规划地基，分别确认免费建造。你可以自由决定建设顺序，五座全部落成后开始首次出击。'}</p><div class="camp-facilities">${INTRO_FACILITY_IDS.map(id => `<button class="camp-facility" data-action="camp-section" data-section="${CAMP_FACILITY_PROGRESS[id].section}"><span class="camp-facility-icon" data-camp-art="${id}" aria-hidden="true"></span><strong>${LABELS[CAMP_FACILITY_PROGRESS[id].section]}</strong>${campAttentionBadge(attention[id])}<small>${campHasFacility(data, id) ? '已建成 · 靠近建筑操作' : data.activeConstruction === id ? '小队施工中' : '规划地基 · 免费建造'}</small></button>`).join('')}</div><p class="camp-summary">${ready ? `已完成 ${data.completedMissions.length} / 3 份情报 · 前哨将随旅途继续扩展` : `基础设施 ${data.builtFacilities.length} / 5 · 完成后收到首份情报`}</p>`;
  return `<div class="overlay camp-overlay"><section class="camp-panel${section === 'summon' && built ? ' camp-summon-panel' : ''}${section === 'summon' && ready && drawReceipt ? ' camp-summon-results-panel' : ''}${trialAvailable ? ' camp-trial-panel' : ''}" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="camp-title"><header class="camp-header"><div><p>${trialAvailable ? '安全练习 · 不消耗物资' : 'MEMBRANE HAVEN'}</p><h2 id="camp-title">${established ? LABELS[section] : '抵达缓流膜湾'}</h2></div>${trialAvailable ? trialWeapons + trialUtility : ''}${established ? `<div class="camp-wallet" aria-label="前哨资源"><span>金币 <b>${data.coins}</b></span><span>生质 <b>${data.materials}</b></span><span><i class="camp-resource-icon" data-camp-art="forge-core" aria-hidden="true"></i>核心 <b>${data.cores}</b></span></div>` : ''}<button class="camp-close" data-action="camp-close" aria-label="关闭营地面板">×</button></header>
    ${established && !ready ? `<div class="camp-intro" role="status"><span>基础建设 ${data.builtFacilities.length} / 5${data.activeConstruction ? ` · ${CAMP_FACILITY_PROGRESS[data.activeConstruction].name}施工中` : ' · 逐座确认，自由顺序'}</span><div><i style="width:${data.builtFacilities.length / 5 * 100}%"></i></div>${data.activeConstruction ? '<button data-action="camp-skip-construction">完成当前栋演出</button>' : ''}</div>` : ''}
    ${nav ? `<nav class="camp-nav" aria-label="营地设施">${nav}</nav>` : ''}<div class="camp-content">${ready && ['overview', 'warehouse', 'forge'].includes(section) ? firstStepsMarkup(snapshot, presentation) : ''}${content}</div>
    <footer class="camp-footer">${notice ? `<p class="camp-notice" role="status">${escape(notice)}</p>` : ''}${status.mode === 'session' || status.code === 'corrupt' ? `<p class="camp-storage" role="status">${escape(status.message)} <button data-action="camp-retry-save">重试保存</button></p>` : '<p class="camp-muted">装备与材料跨局保留 · 出发后固定配装</p>'}<div class="camp-footer-actions">${trialAvailable ? `<div class="camp-trial-actions"><button class="primary" data-action="camp-trial-fire">普攻</button>${weaponSkillDefinitions(presentation.trialWeaponId ?? data.equipped).map(skill => `<button data-action="camp-trial-skill" data-slot="${skill.slot}" title="${escape(skill.description)}"><b>${skill.slot}</b> ${skill.name}<small data-trial-skill-cooldown="${skill.slot}">就绪</small></button>`).join('')}<button data-action="camp-trial-cooldowns">重置CD</button></div><button data-action="camp-section" data-section="warehouse">返回配装</button>` : ''}${ready && (section === 'departure' || section === 'missions') ? `<button class="primary" data-action="camp-deploy" ${missionUnlocked(snapshot, data.selectedMissionId) ? '' : 'disabled'}>出击 · ${MISSIONS[data.selectedMissionId].name} ↗</button>` : ready && section === 'trial' ? '<button class="primary" data-action="camp-section" data-section="missions">准备出击 ↗</button>' : ''}${trialAvailable ? '' : '<button data-action="camp-leave">返回主菜单</button>'}</div></footer>
  </section></div>`;
}
