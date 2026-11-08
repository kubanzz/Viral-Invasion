import { WEAPONS, WEAPON_IDS, type WeaponId } from '../game/expedition';
import type { CampProfileSnapshot } from '../meta/campProfile';
import { weaponSkillDefinitions } from '../game/weaponSkills';
import { weaponUltimateDefinition } from '../game/weaponUltimates';
import { isMissionUnlocked, MISSIONS, type DrawReceipt, type MissionId } from '../game/microfront';
import type { CampStationId } from '../game/campLayout';
import { CAMP_FACILITY_PROGRESS, INTRO_FACILITY_IDS, campHasFacility } from '../game/campProgression';
import { campStationAttention, type CampStationAttention } from '../game/campAttention';
import { campSummonMarkup } from './campSummonHud';
import { campFarmMarkup, campHouseMarkup } from './campLifeHud';
import { campEquipmentMarkup, equipmentTabsMarkup } from './campEquipmentHud';
import { createCampEquipmentState, normalizeCampEquipmentState, type CampEquipmentState } from './campEquipmentState';

export type CampSection = 'overview' | 'warehouse' | 'forge' | 'shop' | 'departure' | 'missions' | 'summon' | 'trial' | 'farm' | 'house';
const LABELS: Record<CampSection, string> = { overview: '微观前哨', warehouse: '装备仓库', forge: '锻造台', shop: '补给站', departure: '侦查情报', missions: '侦查情报', summon: '血流接引', trial: '安全试枪场', farm: '营养农场', house: '免疫居所' };
export interface CampPresentation { trialCompleted?: boolean; trialWeaponId?: WeaponId; trialOrigin?: 'warehouse' | 'forge'; drawReceipt?: DrawReceipt; nearbyStationId?: CampStationId; summonPool?: 'equipment' | 'legion'; equipment?: CampEquipmentState }
export function campSectionStation(section: CampSection): CampStationId | undefined {
  return section === 'overview' ? undefined : section === 'trial' ? 'warehouse' : section === 'missions' ? 'departure' : section;
}
export function campAttentionBadge(attention?: CampStationAttention): string {
  return attention ? `<span class="camp-attention-badge" data-attention="${attention.kind}"><b aria-hidden="true">${attention.kind === 'build' ? '⚒' : '!'}</b> ${attention.label}${attention.count > 1 ? ` · ${attention.count}` : ''}</span>` : '';
}
export interface CampFirstStep { step: 'repair' | 'equip' | 'trial'; weaponId: WeaponId; title: string; description: string }
const escape = (v: string) => v.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
/** Derived from the collection, with only the disposable practice completion kept by the UI. */
export function campFirstSteps(snapshot: CampProfileSnapshot, trialCompleted = false): CampFirstStep | null {
  const { data } = snapshot;
  if (data.victories !== 1 || trialCompleted) return null;
  const pending = WEAPON_IDS.find(id => data.weapons[id].pending);
  if (pending) return { step: 'repair', weaponId: pending, title: '先修复本次战利品', description: `花10生质修复${WEAPONS[pending].name}，再装备并试用。` };
  if (data.weapons.piercing.repaired && data.equipped !== 'piercing') return { step: 'equip', weaponId: 'piercing', title: '把刃弓带到试枪场', description: '贯脉·回旋刃弓使用较慢的往返骨刃，聚敌与回收各有用途。试射后再决定配装。' };
  return { step: 'trial', weaponId: data.equipped, title: '试用普攻、战技与大招', description: '可切换单体、成线和近身群靶，试用123，并充满能量试放4号大招。' };
}
function firstStepsMarkup(snapshot: CampProfileSnapshot, presentation: CampPresentation): string {
  const next = campFirstSteps(snapshot, presentation.trialCompleted);
  if (!next) return '';
  return `<aside class="camp-first-steps" aria-label="首次回营建议"><div><strong>${next.title}</strong><p>${next.description}</p><ol><li data-complete="${next.step !== 'repair'}">修复</li><li data-complete="${next.step === 'trial'}">装备</li><li>试射</li><li>出击</li></ol><p>${next.step === 'repair' ? '前往锻造台修复，再就地试射。' : '前往装备仓库，配装后就地试射。'}</p></div></aside>`;
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
/** Also used by world-space camp facilities, so panel and map interactions agree. */
export function campOverlay(snapshot: CampProfileSnapshot, section: CampSection = 'overview', introProgress = 1, notice = '', presentation: CampPresentation = {}, summonResult?: DrawReceipt | null): string {
  const { data, status } = snapshot;
  const drawReceipt = summonResult ?? presentation.drawReceipt;
  const ready = data.prologue === 'ready';
  const trialOrigin = presentation.trialOrigin ?? 'warehouse';
  const trialAvailable = section === 'trial' && campHasFacility(data, trialOrigin);
  const established = data.prologue !== 'arrival', attention = campStationAttention(data);
  const stationId = section === 'trial' ? trialOrigin : campSectionStation(section), built = stationId ? campHasFacility(data, stationId) : true;
  const equipmentPage = established && built && (section === 'warehouse' || section === 'forge');
  const equipment = normalizeCampEquipmentState(snapshot, presentation.equipment ?? createCampEquipmentState(snapshot));
  const selected = presentation.trialWeaponId ?? data.equipped;
  const trialWeapons = `<div class="camp-trial-options" aria-label="试用武器">${WEAPON_IDS.filter(id => data.weapons[id].repaired).map(id => `<button data-action="camp-trial" data-weapon="${id}" title="${WEAPONS[id].name}" ${selected === id ? 'aria-pressed="true"' : ''}><strong>${WEAPONS[id].name.split('·')[1]}</strong></button>`).join('')}</div>`;
  const trialUtility = `<div class="camp-trial-utility" aria-label="练习靶设置"><button data-action="camp-trial-layout" data-layout="single" aria-label="单体耐久靶" title="单体耐久靶">单体</button><button data-action="camp-trial-layout" data-layout="line" aria-label="成线五群靶" title="成线五群靶">成线</button><button data-action="camp-trial-layout" data-layout="melee" aria-label="近身五群靶" title="近身五群靶">近身</button><button data-action="camp-trial-reset" aria-label="重置练习靶" title="重置练习靶">重置靶</button><button data-action="camp-trial-fill" aria-label="充满试用大招能量" title="仅试用场充能，不影响战场">充满大招</button></div>`;
  let content: string;
  if (!established) {
    content = `<section class="camp-arrival" aria-label="建立微观前哨"><p class="camp-arrival-kicker">组织液缓流区 · 缓流膜湾</p><h3>找到可以扎根的一片微域</h3><p>带领抗体小队抵达发光的稳态锚，建立前哨后，亲手完成五处基础设施。</p><ol><li>关闭面板，带领小队走到稳态锚旁。</li><li>靠近后按E，或点击发光锚点建立前哨。</li><li>逐处确认免费建设，完成后接收第一份异常情报。</li></ol><button class="primary" data-action="camp-establish">在稳态锚旁建立前哨</button><button data-action="camp-close">返回营地 · 寻找稳态锚</button></section>`;
  } else if (stationId && !built) {
    const definition = CAMP_FACILITY_PROGRESS[stationId], active = data.activeConstruction === stationId;
    content = `<section class="camp-build-card" data-build-site="${stationId}"><p class="camp-arrival-kicker">基础建设 · 免费</p><h3>${definition.name}</h3><p>${definition.purpose}</p><p>${active ? stationId === 'summon' ? '光核正在充能；返回营地后小队将继续激活。' : '施工随场景推进；返回营地后小队将继续搭建。' : data.activeConstruction ? '小队正在建设另一座设施，请待当前施工完成。' : stationId === 'summon' ? '前往主路旁的光环，点击光核或按E，免费激活血流接引点。' : '走到规划地基附近，点击建造标记或按E，让小队搭起这座建筑。'}</p>${active ? '<button data-action="camp-skip-construction">完成当前设施演出</button>' : presentation.nearbyStationId === stationId && !data.activeConstruction ? `<button class="primary" data-action="camp-build" data-station="${stationId}">${stationId === 'summon' ? '✦ 免费激活' : '⚒ 免费建造'}</button>` : '<button data-action="camp-close">返回营地 · 靠近设施</button>'}</section>`;
  } else if ((section === 'missions' || section === 'departure') && !ready) {
    content = `<section class="camp-build-card"><h3>等待前哨整备完成</h3><p>基础设施已就绪 ${data.builtFacilities.length} / 5。小队安顿好后，侦察队会送来第一份任务。</p><button data-action="camp-close">返回营地 · 继续建设</button></section>`;
  } else if (section === 'trial') {
    content = `<p class="camp-section-copy">按住0或普攻按钮持续攻击，123战技、4大招；裁决铳雷暴中再次按4立即裁决。点击“充满大招”试用终结技。可切换单体、成线与近身群靶。使用当前品质与强化；试用不消耗物资、不计分。</p><div class="camp-trial-stage">${trialUtility}<canvas id="camp-trial-canvas" class="camp-trial-canvas" width="560" height="220" aria-label="独立试用场：单体、成线或近身群靶，使用普攻、三个战技和充能大招"></canvas></div>`;
  }
  else if (section === 'warehouse' || section === 'forge') content = campEquipmentMarkup(snapshot, section, equipment, notice);
  else if (section === 'shop') content = `<div class="camp-supply-card"><div class="camp-facility-icon" data-camp-art="supply" aria-hidden="true"></div><h3>抗体增配</h3><p>默认携带2支，可为下次出击额外准备最多2支。</p><p class="camp-stock">已备货 ${data.extraAntibodyStock} / 2 · 出击总计 ${2 + data.extraAntibodyStock} 支</p><button data-action="camp-buy-antibody" ${data.extraAntibodyStock >= 2 || data.materials < 5 ? 'disabled' : ''}>${data.extraAntibodyStock >= 2 ? '备货已满' : '购买1支 · 5生质'}</button><p class="camp-muted">出发时消耗备货，死亡或退出不返还。</p></div>`;
  else if (section === 'departure' || section === 'missions') content = missionsMarkup(snapshot);
  else if (section === 'farm') content = campFarmMarkup(snapshot);
  else if (section === 'house') content = campHouseMarkup(snapshot);
  else if (section === 'summon') content = campSummonMarkup(snapshot, drawReceipt, presentation.summonPool);
  else content = `<p class="camp-section-copy">${ready ? '靠近营地设施，点击建筑或按E即可操作。血流接引位于主路旁的发光节点。' : '带小队走到每处规划地基，分别确认免费建设；主路旁的接引点需要免费激活。五处全部就绪后开始首次出击。'}</p><div class="camp-facilities">${(ready ? [...INTRO_FACILITY_IDS, 'farm', 'house'] as CampStationId[] : INTRO_FACILITY_IDS).map(id => `<article class="camp-facility" data-camp-facility="${id}"><span class="camp-facility-icon" data-camp-art="${id}" aria-hidden="true"></span><strong>${LABELS[CAMP_FACILITY_PROGRESS[id].section]}</strong>${campAttentionBadge(attention[id])}<small>${campHasFacility(data, id) ? id === 'summon' ? '已激活 · 前往主路旁的光核' : '已建成 · 靠近建筑操作' : data.activeConstruction === id ? id === 'summon' ? '光核激活中' : '小队施工中' : id === 'summon' ? '主路旁光环 · 免费激活' : '规划地基 · 免费建造'}</small></article>`).join('')}</div><p class="camp-summary">${ready ? `已完成 ${data.completedMissions.length} / 3 份情报 · 前哨将随旅途继续扩展` : `基础设施 ${data.builtFacilities.length} / 5 · 完成后收到首份情报`}</p>`;
  return `<div class="overlay camp-overlay"><section class="camp-panel${equipmentPage ? ' camp-equipment-panel' : ''}${section === 'summon' && built ? ' camp-summon-panel' : ''}${section === 'summon' && ready && drawReceipt ? ' camp-summon-results-panel' : ''}${trialAvailable ? selected === 'thunder' ? ' camp-trial-panel camp-trial-thunder' : ' camp-trial-panel' : ''}" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="camp-title"><header class="camp-header"><div><p>${trialAvailable ? '安全练习 · 不消耗物资' : equipmentPage ? '出击整备' : 'MEMBRANE HAVEN'}</p><h2 id="camp-title">${established ? LABELS[section] : '抵达缓流膜湾'}</h2></div>${equipmentPage ? equipmentTabsMarkup(section as 'warehouse' | 'forge', equipment) : ''}${trialAvailable ? trialWeapons : ''}${equipmentPage ? section === 'forge' ? `<div class="camp-wallet" aria-label="锻造资源"><span>生质 <b>${data.materials}</b></span><span><i class="camp-resource-icon" data-camp-art="forge-core" aria-hidden="true"></i>核心 <b>${data.cores}</b></span></div>` : '' : established ? `<div class="camp-wallet" aria-label="前哨资源"><span>金币 <b>${data.coins}</b></span><span>生质 <b>${data.materials}</b></span><span>口粮 <b>${data.food}</b></span><span><i class="camp-resource-icon" data-camp-art="forge-core" aria-hidden="true"></i>核心 <b>${data.cores}</b></span></div>` : ''}<button class="camp-close" data-action="camp-close" aria-label="${equipmentPage ? '返回营地' : '关闭营地面板'}">×</button></header>
    ${established && !ready && section === 'overview' ? `<div class="camp-intro" role="status"><span>基础建设 ${data.builtFacilities.length} / 5${data.activeConstruction ? ` · ${CAMP_FACILITY_PROGRESS[data.activeConstruction].name}${data.activeConstruction === 'summon' ? '激活中' : '施工中'}` : ' · 逐处确认，自由顺序'}</span><div><i style="width:${data.builtFacilities.length / 5 * 100}%"></i></div>${data.activeConstruction ? '<button data-action="camp-skip-construction">完成当前设施演出</button>' : ''}</div>` : ''}
    <div class="camp-content">${ready && section === 'overview' ? firstStepsMarkup(snapshot, presentation) : ''}${content}</div>
    <footer class="camp-footer">${notice && !equipmentPage ? `<p class="camp-notice" role="status">${escape(notice)}</p>` : ''}${status.mode === 'session' || status.code === 'corrupt' ? `<p class="camp-storage" role="status">${escape(status.message)} <button data-action="camp-retry-save">重试保存</button></p>` : section === 'overview' ? '<p class="camp-muted">装备与材料跨局保留 · 出发后固定配装</p>' : ''}<div class="camp-footer-actions">${trialAvailable ? `<div class="camp-trial-actions"><button class="primary" data-action="camp-trial-fire">普攻</button>${weaponSkillDefinitions(presentation.trialWeaponId ?? data.equipped).map(skill => `<button data-action="camp-trial-skill" data-slot="${skill.slot}" title="${escape(skill.description)}"><b>${skill.slot}</b> ${skill.name}<small data-trial-skill-cooldown="${skill.slot}">就绪</small></button>`).join('')}<button class="camp-trial-ultimate" data-action="camp-trial-ultimate"><b>4</b> ${weaponUltimateDefinition(selected).name}<small data-trial-ultimate-energy>0 / 100</small></button><button data-action="camp-trial-cooldowns">重置CD</button></div><button data-action="camp-trial-return">${trialOrigin === 'forge' ? '返回锻造' : '返回配装'}</button>` : ''}${ready && (section === 'departure' || section === 'missions') ? `<button class="primary" data-action="camp-deploy" ${missionUnlocked(snapshot, data.selectedMissionId) ? '' : 'disabled'}>出击 · ${MISSIONS[data.selectedMissionId].name} ↗</button>` : ''}${equipmentPage ? '' : '<button class="camp-return" data-action="camp-close">返回营地</button>'}</div></footer>
  </section></div>`;
}
