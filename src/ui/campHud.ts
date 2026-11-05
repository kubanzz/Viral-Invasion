import { EXPEDITION_ECONOMY, RARITY_NAMES, WEAPONS, WEAPON_IDS, weaponCombatProfile, type WeaponId, type WeaponRarity } from '../game/expedition';
import type { CampProfileSnapshot } from '../meta/campProfile';
import { weaponSkillDefinitions, WEAPON_SKILL_BALANCE } from '../game/weaponSkills';
import { PLAYER_PROJECTILE_BALANCE } from '../game/playerProjectiles';

export type CampSection = 'overview' | 'warehouse' | 'forge' | 'shop' | 'departure' | 'trial';
export const CAMP_SECTIONS: readonly CampSection[] = ['overview', 'warehouse', 'forge', 'shop', 'departure'];
const LABELS: Record<CampSection, string> = { overview: '免疫营地', warehouse: '武器仓库', forge: '锻造台', shop: '补给站', departure: '出击台', trial: '安全试枪场' };
export interface CampPresentation { trialCompleted?: boolean; trialWeaponId?: WeaponId }
export interface CampFirstStep { step: 'repair' | 'equip' | 'trial'; weaponId: WeaponId; title: string; description: string }
const escape = (v: string) => v.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const quality = (v: WeaponRarity | null) => v ? `<span class="camp-quality camp-quality-${v}">${RARITY_NAMES[v]}</span>` : '<span class="camp-muted">未收藏</span>';
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
    <p class="camp-weapon-source">获得条件：${id === 'steady' ? '初始常驻，免费可用。' : '心脏Boss掉落破损武器，最后净化带回后花10生质修复。'}</p>
    ${item.pending ? `<p class="camp-pending">待修复：${quality(item.pending)} ${definition.name}</p>` : ''}</div>
    ${weaponKitMarkup(id, item.repaired, item.upgrade)}
    <div class="camp-card-actions">${forge ? `${item.pending ? `<button data-action="camp-repair" data-weapon="${id}" ${data.materials < 10 ? 'disabled' : ''}>修复 · 10生质</button>` : ''}
      ${item.repaired ? `<button data-action="camp-upgrade" data-weapon="${id}" ${item.upgrade >= 3 || data.materials < (EXPEDITION_ECONOMY.upgrade[item.upgrade] ?? 0) ? 'disabled' : ''}>${item.upgrade >= 3 ? '已达 +3 上限' : `强化至 +${item.upgrade + 1} · ${EXPEDITION_ECONOMY.upgrade[item.upgrade]}生质`}</button><button data-action="${equipped ? 'camp-trial' : 'camp-equip-trial'}" data-weapon="${id}">${equipped ? '试射此枪' : '装备并试射'}</button>` : ''}`
      : `<button data-action="camp-equip" data-weapon="${id}" ${!item.repaired || equipped ? 'disabled' : ''}>${equipped ? '当前装备' : item.repaired ? '装备到下次出击' : '请先修复'}</button>${item.repaired ? `<button data-action="camp-trial" data-weapon="${id}">试射此枪</button>` : ''}`}</div>
  </article>`;
}
/** Also used by world-space camp facilities, so panel and map interactions agree. */
export function campOverlay(snapshot: CampProfileSnapshot, section: CampSection = 'overview', introProgress = 1, notice = '', presentation: CampPresentation = {}): string {
  const { data, status } = snapshot;
  const intro = !data.campIntroSeen && introProgress < 1;
  const nav = CAMP_SECTIONS.map(id => `<button data-action="camp-section" data-section="${id}" ${section === id ? 'aria-current="page"' : ''}>${LABELS[id]}</button>`).join('');
  const selected = presentation.trialWeaponId ?? data.equipped;
  const trialWeapons = `<div class="camp-trial-options" aria-label="试射武器">${WEAPON_IDS.filter(id => data.weapons[id].repaired).map(id => `<button data-action="camp-trial" data-weapon="${id}" title="${WEAPONS[id].name}" ${selected === id ? 'aria-pressed="true"' : ''}><strong>${id === 'steady' ? '蜂巢针枪' : '回旋刃弓'}</strong><small>${id === 'steady' ? '追踪速射' : '往返收割'}</small></button>`).join('')}</div>`;
  const trialUtility = `<div class="camp-trial-utility" aria-label="练习靶设置"><button data-action="camp-trial-layout" data-layout="single" aria-label="单体耐久靶" title="单体耐久靶">单体</button><button data-action="camp-trial-layout" data-layout="line" aria-label="成线五群靶" title="成线五群靶">群靶</button><button data-action="camp-trial-reset" aria-label="重置练习靶" title="重置练习靶">重置靶</button></div>`;
  let content: string;
  if (section === 'trial') {
    content = `<p class="camp-section-copy">按0普攻、1／2／3技能，或点击下方按钮；群靶首靶可测试贴身震环。使用当前永久品质与强化，不带局内强化；试枪不消耗物资、不计分。</p><div class="camp-trial-stage"><canvas id="camp-trial-canvas" class="camp-trial-canvas" width="560" height="220" aria-label="独立试枪场：单体耐久靶或五只成线群靶，使用普攻和三个武器技能"></canvas></div>`;
  }
  else if (section === 'warehouse' || section === 'forge') content = `<p class="camp-section-copy">${section === 'forge' ? '破损武器先修复，再选择最多三级强化。修复后可直接装备并试射；换更高品质时保留已有强化。' : '蜂巢针枪擅长追踪速射与近身解围，回旋刃弓擅长聚敌、贯穿与往返收割。可先试射再决定。'}</p><div class="camp-weapons">${WEAPON_IDS.map(id => weaponCard(snapshot, id, section === 'forge')).join('')}</div>`;
  else if (section === 'shop') content = `<div class="camp-supply-card"><div class="camp-facility-icon" data-camp-art="supply" aria-hidden="true"></div><h3>抗体增配</h3><p>默认携带2支，可为下次出击额外准备最多2支。</p><p class="camp-stock">已备货 ${data.extraAntibodyStock} / 2 · 出击总计 ${2 + data.extraAntibodyStock} 支</p><button data-action="camp-buy-antibody" ${data.extraAntibodyStock >= 2 || data.materials < 5 ? 'disabled' : ''}>${data.extraAntibodyStock >= 2 ? '备货已满' : '购买1支 · 5生质'}</button><p class="camp-muted">出发时消耗备货，死亡或退出不返还。</p></div>`;
  else if (section === 'departure') {
    const id = data.equipped, item = data.weapons[id];
    content = `<div class="camp-departure"><h3>心脏 · 再次清剿</h3><p>军团、战场建筑和局内进化重新开始；已解锁蓝图与永久装备保留。</p><dl><div><dt>主武器</dt><dd>${WEAPONS[id].name} ${quality(item.repaired)} +${item.upgrade}</dd></div><div><dt>建筑蓝图</dt><dd>${data.blueprints.includes('launch-pod') ? '基础弹射荚' : '守线解锁'}${data.blueprints.includes('rapid-launch-pod') ? ' · 速装弹射荚' : ''}</dd></div><div><dt>工程补给</dt><dd>2份 · 击破感染源可补充</dd></div><div><dt>抗体</dt><dd>${2 + data.extraAntibodyStock}支</dd></div></dl><p class="camp-muted">新器官将在后续远征开放。</p></div>`;
  } else content = `<p class="camp-section-copy">心脏已成为安全据点。修复战利品、准备补给，再带着新的打法出发。</p><div class="camp-facilities">${(['warehouse', 'forge', 'shop', 'departure'] as const).map(id => `<button class="camp-facility" data-action="camp-section" data-section="${id}"><span class="camp-facility-icon" data-camp-art="${id}" aria-hidden="true"></span><strong>${LABELS[id]}</strong><small>${({ warehouse: '收藏与配装', forge: '修复与强化', shop: '抗体备货', departure: '再次挑战心脏' } as const)[id]}</small></button>`).join('')}</div><p class="camp-summary">已完成 ${data.victories} 次新远征 · 蓝图 ${data.blueprints.length} / 2</p>`;
  return `<div class="overlay camp-overlay"><section class="camp-panel${section === 'trial' ? ' camp-trial-panel' : ''}" aria-labelledby="camp-title"><header class="camp-header"><div><p>${section === 'trial' ? '安全练习 · 不消耗物资' : 'HEART SANCTUARY'}</p><h2 id="camp-title">${LABELS[section]}</h2></div>${section === 'trial' ? trialWeapons + trialUtility : ''}<span class="camp-material" aria-label="修复生质">生质 <b>${data.materials}</b></span>${intro && section !== 'overview' ? '<button class="camp-header-skip" data-action="camp-skip-intro">完成搭建</button>' : ''}<button class="camp-close" data-action="camp-close" aria-label="关闭营地面板">×</button></header>
    ${intro && section === 'overview' ? `<div class="camp-intro" role="status"><span>免疫小队正在搭建安全营地</span><div><i style="width:${Math.max(0, Math.min(100, introProgress * 100))}%"></i></div><button data-action="camp-skip-intro">完成搭建</button></div>` : ''}
    <nav class="camp-nav" aria-label="营地设施">${nav}</nav><div class="camp-content">${['overview', 'warehouse', 'forge'].includes(section) ? firstStepsMarkup(snapshot, presentation) : ''}${content}</div>
    <footer class="camp-footer">${notice && status.mode !== 'session' && status.code !== 'corrupt' ? `<p role="status">${escape(notice)}</p>` : ''}${status.mode === 'session' || status.code === 'corrupt' ? `<p class="camp-storage" role="status">${escape(status.message)} <button data-action="camp-retry-save">重试保存</button></p>` : '<p class="camp-muted">永久装备已保存 · 未完成远征的战利品需净化后带回</p>'}<div class="camp-footer-actions">${section === 'trial' ? `<div class="camp-trial-actions"><button class="primary" data-action="camp-trial-fire">普攻</button>${weaponSkillDefinitions(presentation.trialWeaponId ?? data.equipped).map(skill => `<button data-action="camp-trial-skill" data-slot="${skill.slot}" title="${escape(skill.description)}"><b>${skill.slot}</b> ${skill.name}<small data-trial-skill-cooldown="${skill.slot}">就绪</small></button>`).join('')}<button data-action="camp-trial-cooldowns">重置CD</button></div><button data-action="camp-section" data-section="warehouse">返回配装</button>` : ''}${section === 'departure' ? '<button class="primary" data-action="camp-deploy">出击心脏 ↗</button>' : section === 'trial' ? '<button class="primary" data-action="camp-section" data-section="departure">准备出击 ↗</button>' : ''}${section === 'trial' ? '' : '<button data-action="camp-leave">返回主菜单</button>'}</div></footer>
  </section></div>`;
}
