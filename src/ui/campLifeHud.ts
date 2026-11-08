import type { CampProfileSnapshot } from '../meta/campProfile';
import { FARM_BALANCE, LEGIONS, LEGION_IDS, legionDeployment, type LegionId } from '../game/legionCatalog';
import artRuntime from '../../.art-generated/art-runtime.json';
import { summonArtMarkup } from './summonArt';
import { CAMP_FARM_RULES, farmGrownSeconds, formatFarmCountdown } from '../game/campFarm';

export function legionPortraitMarkup(id: LegionId, className = ''): string {
  if(id==='seraph' && (artRuntime.assets as Record<string,unknown>)['sanctum.portrait.seraph'])
    return `<span class="legion-portrait ${className}" data-legion-portrait="seraph" aria-hidden="true"><span class="sanctum-portrait-viewport">${summonArtMarkup('legion-seraph')}</span></span>`;
  const legendary = id === 'seraph', color = LEGIONS[id].color;
  return `<span class="legion-portrait ${className}" data-legion-portrait="${id}" aria-hidden="true"><svg viewBox="0 0 240 180" fill="none"><ellipse cx="120" cy="156" rx="74" ry="10" fill="#071d1b" opacity=".2"/>${legendary ? `<circle cx="120" cy="72" r="51" stroke="${color}" stroke-opacity=".45"/><circle cx="120" cy="72" r="61" stroke="${color}" stroke-opacity=".2"/>${[-1,1].map(side => `<path d="M${120+side*17} 93 Q${120+side*88} 12 ${120+side*100} 60 L${120+side*53} 111 L${120+side*18} 121Z" fill="${color}" opacity=".65"/>`).join('')}<path d="M100 42L105 21L120 32L135 21L140 42" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>` : ''}<path d="M85 68Q92 41 120 42Q148 41 155 68L165 108L144 141L120 153L96 141L75 108Z" fill="${legendary ? '#f2e4b7' : '#b3d4bb'}" stroke="${color}" stroke-width="3"/><path d="M96 79L120 65L144 79L140 113L120 131L100 113Z" fill="${legendary ? '#457b75' : '#4b7965'}"/><path d="M110 90L120 82L130 90L126 108L120 114L114 108Z" fill="${color}"/><path d="M93 79L107 86M147 79L133 86" stroke="#fcf2d4" stroke-width="4" stroke-linecap="round"/>${legendary ? [52,188,120].map((x,i) => `<path d="M${x} ${i===2?141:105}l-11 10 3 20 8 9 8-9 3-20Z" fill="#d7e5cd" stroke="${color}" stroke-width="2"/><circle cx="${x}" cy="${i===2?159:123}" r="4" fill="${color}"/>`).join('') : ''}</svg></span>`;
}
export const SERAPH_FORMATION = [
  { id: 'commander', name: '统御者', count: 1, duty: '近战破阵', detail: '挥刃近战，命中后引发圣裁追击。' },
  { id: 'lancer', name: '悬翼枪卫', count: 2, duty: '两翼包抄', detail: '从两侧切入，协同压制集火目标。' },
  { id: 'prism', name: '棱光咏卫', count: 1, duty: '中距齐射', detail: '保持中等距离，以三束棱光齐射支援。' },
] as const;
/** The collection and draw reveal share one player-facing formation description. */
export function seraphFormationMarkup(compact = false): string {
  if (compact) return `<p class="seraph-formation-summary" data-seraph-formation="compact">${SERAPH_FORMATION.map(role=>`<span>${role.name}<b>×${role.count}</b></span>`).join('')}</p>`;
  return `<section class="seraph-doctrine" data-seraph-formation="full" aria-label="曜卫小队兵种与职责"><p class="seraph-formation-label">四人小队 · 三兵种协同</p><ul class="seraph-role-grid">${SERAPH_FORMATION.map(role=>`<li data-seraph-role="${role.id}"><span class="seraph-role-portrait" data-camp-art="seraph-${role.id}" aria-hidden="true"></span><div><strong>${role.name}<b>×${role.count}</b></strong><span>${role.duty}</span><p>${role.detail}</p></div></li>`).join('')}</ul><div class="seraph-command-guide"><p><b>Q · 指令合击</b>集火后协同强化下一轮攻击：统御者挥刃、枪卫包抄、咏卫齐射。</p><p><b>圣裁追击</b>统御者近战命中后，追加一道圣裁穿刺。</p><p><b>R · 曜卫残像</b>存活成员分出同兵种残像；本体与残像共享圣裁追击。</p></div></section>`;
}
export function campFarmMarkup(snapshot: CampProfileSnapshot): string {
  const {data} = snapshot;
  return `<section class="camp-life"><div class="camp-life-heading"><div><p class="summon-kicker">田园记录 · 免费种子</p><h3>蜜露营养荚</h3></div><strong class="camp-food-total">口粮 ${data.food}</strong></div><p>返回田间，靠近空地点击或按E，停留1.5秒完成播种。营地内成长2分30秒即可采摘，每块地收获 ${FARM_BALANCE.harvest} 份口粮。</p><button class="primary" data-action="camp-close">返回田间</button><div class="camp-farm-plots">${data.farmPlots.map((plot,index) => {
    const grown = farmGrownSeconds(plot), ripe = plot.planted && grown >= CAMP_FARM_RULES.matureSeconds;
    const care = !plot.planted ? '' : ripe ? '成熟后不会腐坏' : !plot.watered ? '田边浇水可加速25秒'
      : !plot.pestsCleared && grown >= CAMP_FARM_RULES.pestsAtSeconds ? '田边除虫可加速25秒' : !plot.pestsCleared ? '成长1分钟后可除虫加速' : '照料完成 · 等待自然成熟';
    return `<article class="camp-farm-plot ${ripe?'is-ripe':plot.planted?'is-growing':'is-empty'}" data-farm-plot="${index}"><div class="camp-crop-art" ${plot.planted?`data-camp-art="crop-${ripe?'ripe':grown>=CAMP_FARM_RULES.growingAtSeconds?'grow':'seed'}"`:''} aria-hidden="true">${[0,1,2].map(i=>`<span style="--crop:${i}"><i></i>${ripe?'<b></b>':''}</span>`).join('')}</div><h4>${index+1}号田 · ${ripe?'可以采摘':plot.planted?'蜜露荚生长中':'等待播种'}</h4><p>${plot.planted?ripe?'已成熟':`剩余 ${formatFarmCountdown(CAMP_FARM_RULES.matureSeconds-grown)}`:'种子免费 · 不会枯萎'}</p><div class="camp-crop-growth"><i style="width:${grown/CAMP_FARM_RULES.matureSeconds*100}%"></i></div><p>${care}</p><button data-action="camp-close">${ripe?'回田间采摘':plot.planted?'回田间照料':'回田间播种'}</button></article>`;
  }).join('')}</div><p class="camp-life-rule">浇水、除虫各加速25秒，每轮各一次，不照料也会成熟。有效出征返营推进75秒；暂停、菜单和离线不推进。缺粮仍可应急出征，军团生命和伤害为75%。</p></section>`;
}
export function campHouseMarkup(snapshot: CampProfileSnapshot): string {
  const {data}=snapshot, deployment=legionDeployment(data.legionLoadout,data.food);
  return `<section class="camp-life"><div class="camp-life-heading"><div><p class="summon-kicker">免疫居所 · 两支编队</p><h3>让伙伴整装出发</h3></div><strong class="camp-food-total">口粮 ${data.food}</strong></div><div class="camp-legion-slots">${data.legionLoadout.map((id,slot)=>{
    const fed=deployment.find(unit=>unit.slot===slot)?.fed;
    return `<article class="camp-legion-slot" data-legion-slot="${slot}"><span class="camp-slot-number">编队 ${slot+1}</span>${id?legionPortraitMarkup(id):'<div class="camp-empty-berth" aria-hidden="true">＋</div>'}<h4>${id?LEGIONS[id].name:'空编队位'}</h4>${id==='seraph'?seraphFormationMarkup(true):''}<p class="${id&&!fed?'camp-hungry':''}">${id?fed?'口粮已备 · 归来消耗1粮':'缺粮休整 · 可虚弱出征，生命/伤害75%':'不消耗口粮'}</p><div class="camp-legion-options">${data.ownedLegions.map(candidate=>`<button data-action="camp-legion-assign" data-slot="${slot}" data-legion="${candidate}" ${id===candidate?'aria-pressed="true"':''} ${candidate==='seraph'&&data.legionLoadout.some((other,index)=>other==='seraph'&&index!==slot)?'disabled':''}>${LEGIONS[candidate].name}</button>`).join('')}<button data-action="camp-legion-assign" data-slot="${slot}" data-legion="" ${id===null?'disabled':''}>留营休整</button></div></article>`;
  }).join('')}</div><p class="camp-life-rule">每支已供粮编队仅在有效出征归来时消耗1粮。Q补员、R裂变不多扣；军团战死只影响当局，收藏永久保留。</p><div class="camp-legion-collection"><h4>军团收藏 · ${data.ownedLegions.length} / ${LEGION_IDS.length}</h4>${LEGION_IDS.map(id=>`<article class="camp-legion-collection-card ${data.ownedLegions.includes(id)?'is-owned':'is-locked'}${id==='seraph'?' has-seraph-doctrine':''}" data-rarity="${LEGIONS[id].rarity}" data-collection-legion="${id}">${legionPortraitMarkup(id)}<div class="camp-legion-collection-copy"><strong>${LEGIONS[id].name}</strong><span>${data.ownedLegions.includes(id)?id==='phagocyte'?'初始免费拥有':'已接引 · 永久保留':id==='seraph'?'尚未接引 · 军团池':'血流接引 · 军团池'}</span><p>${id==='seraph'?'统御近战、双枪包抄、棱光齐射，共同追猎。':LEGIONS[id].description}</p></div>${id==='seraph'?seraphFormationMarkup():''}</article>`).join('')}</div></section>`;
}
