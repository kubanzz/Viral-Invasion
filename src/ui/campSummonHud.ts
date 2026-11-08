import type { CampProfileSnapshot } from '../meta/campProfile';
import { DRAW_COST, DRAW_PITY_LIMIT, DRAW_RARITY_WEIGHTS, MODULE_NAMES, type AntibodyDrawResult } from '../game/microfront';
import { RARITY_NAMES, WEAPONS, isWeaponId, type WeaponRarity } from '../game/expedition';
import { summonArtMarkup } from './summonArt';
import type { CampSummonReceipt, CampSummonSequenceView } from './campSummonSequence';
import { LEGIONS } from '../game/legionCatalog';
import { legionPortraitMarkup, seraphFormationMarkup } from './campLifeHud';
import { EQUIPMENT_WISH_IDS, EQUIPMENT_WISH_LIMIT, equipmentWishName } from '../game/equipmentWish';

const escape = (value: string): string => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const rarityName = (rarity: WeaponRarity): string => RARITY_NAMES[rarity];
type Prize = Readonly<AntibodyDrawResult>;
export function summonPrizeName(prize: Prize): string {
  if (prize.kind === 'legion' && prize.legionId) return LEGIONS[prize.legionId].name + (prize.duplicateMaterials ? ` · 重复转${prize.duplicateMaterials}生质` : ' · 新军团');
  if (prize.kind === 'core') return '锻造核心';
  if (prize.kind === 'materials') return '修复生质';
  const id = prize.templateId;
  const name = isWeaponId(id) ? WEAPONS[id].name : id ? MODULE_NAMES[id] : '型号';
  return name + (prize.kind === 'fragments' ? '碎片' : '');
}
const prizeKind = (prize: Prize): string => ({weapon:'武器',module:'机制模组',fragments:'型号碎片',materials:'材料',core:'锻造素材',legion:'免疫军团'}[prize.kind]);
function seraphPrizeDetail(prize: Prize, single = false): string {
  if (prize.kind !== 'legion' || prize.legionId !== 'seraph') return '';
  if (!single) return '<small class="seraph-prize-summary">统御者×1 · 枪卫×2 · 咏卫×1</small>';
  return `<div class="summon-seraph-detail">${seraphFormationMarkup(true)}<p>Q集火合击 · R残像协同</p><span>${prize.duplicateMaterials ? '已拥有军团 · 50生质已入库' : '已永久解锁 · 前往免疫居所编队'}</span></div>`;
}
function prizeArt(prize: Prize): string {
  if (prize.kind === 'legion' && prize.legionId) return `<span class="summon-prize-art">${legionPortraitMarkup(prize.legionId)}</span>`;
  const id = prize.templateId;
  const art = prize.kind === 'core' ? 'forge-core' : prize.kind === 'materials' ? 'biomass'
    : isWeaponId(id) ? `weapon-${id}` : id ? `module-${id}` : 'model-fragment';
  return `<span class="summon-prize-art">${summonArtMarkup(art)}${prize.kind === 'fragments' ? '<span class="summon-fragment-label">碎片</span>' : ''}</span>`;
}

function receiptMarkup(receipt: CampSummonReceipt): string {
  const gold = receipt.results.filter(result => result.rarity === 'gold').length;
  return `<section class="camp-draw-results summon-receipt" aria-label="本次接引实际结果" data-draw-receipt="${escape(receipt.id)}"><header><div><h3>接引完成</h3><p>${receipt.results.length} 份收获 · 已入库</p></div>${gold ? `<span class="summon-gold-count">金色 ×${gold}</span>` : ''}</header><ol>${receipt.results.map((result, index) => `<li class="camp-draw-result" data-rarity="${result.rarity}" data-draw-index="${index + 1}" aria-label="第${index + 1}抽 · ${escape(summonPrizeName(result))} ×${result.quantity}"><div class="summon-result-frame"><span class="summon-result-rarity">${rarityName(result.rarity)}</span>${prizeArt(result)}<b>×${result.quantity}</b></div><strong>${escape(summonPrizeName(result))}</strong>${seraphPrizeDetail(result)}</li>`).join('')}</ol></section>`;
}

export function campSummonMarkup(snapshot: CampProfileSnapshot, receipt?: CampSummonReceipt, pool: 'equipment' | 'legion' = 'equipment'): string {
  const { data } = snapshot;
  if (receipt?.pool === 'legion') pool = 'legion';
  const legion = pool === 'legion', pity = legion ? data.legionPity : data.pity;
  const remaining = Math.max(1, DRAW_PITY_LIMIT - pity);
  if (legion) return `<section class="camp-summon summon-lobby summon-legion-pool">${poolTabs(pool)}<div class="summon-legion-banner"><div><p class="summon-kicker">免疫誓约 · 传说军团</p><h3>曜卫 · 圣裁降临</h3><p>统御者×1 · 悬翼枪卫×2 · 棱光咏卫×1<br>指令合击 · 真实近战圣裁追击</p></div>${legionPortraitMarkup('seraph')}</div>${seraphFormationMarkup()}${receipt ? receiptMarkup(receipt) : ''}<div class="summon-pity"><div><span>军团独立保底</span><strong>${pity}<small> / ${DRAW_PITY_LIMIT}</small></strong><span>最多再接引 <b>${remaining}</b> 次必得传说军团</span></div><span class="summon-pity-meter" role="progressbar" aria-label="军团连续未出金次数" aria-valuemin="0" aria-valuemax="${DRAW_PITY_LIMIT}" aria-valuenow="${pity}"><i style="width:${pity/DRAW_PITY_LIMIT*100}%"></i></span></div><div class="camp-draw-actions summon-controls">${[1,10].map(count=>`<button class="${count===10?'primary':''}" data-action="camp-legion-draw" data-count="${count}" ${data.coins<count*DRAW_COST?'disabled':''}><strong>军团接引${count===1?'一次':'十次'}</strong><span>${count*DRAW_COST} 金币</span></button>`).join('')}</div><details class="camp-draw-rules summon-rules"><summary>军团概率与保底规则</summary><p>生质×5 60% · 吞噬卫队25% · 游猎军团10% · 曜卫·圣裁军团5%。</p><p>独立50抽必得传说，出金重置；装备池与军团池互不影响。</p><p>重复蓝/紫/金军团分别转换10/20/50生质。吞噬卫队初始免费拥有；前往免疫居所安排编队。</p></details></section>`;
  return `<section class="camp-summon summon-lobby${receipt ? ' has-receipt' : ''}">
    ${poolTabs(pool)}
    ${receipt ? receiptMarkup(receipt) : `<div class="summon-lobby-hero"><div class="summon-idle-orbit" aria-hidden="true"><span class="summon-idle-ring"></span><span class="summon-idle-antibody" data-camp-art="gold-antibody"></span><i>✦</i></div><div><p class="summon-kicker">循着脉流，接引未知</p><h3>下一道光，会带来什么？</h3><p>金色灵幻体可凝成传说武器、模组或锻造核心</p></div></div>`}
    ${equipmentWishMarkup(data)}
    <div class="summon-pity"><div><span>金色保底</span><strong>${data.pity}<small> / ${DRAW_PITY_LIMIT}</small></strong><span>最多再接引 <b>${remaining}</b> 次必出金</span></div><span class="summon-pity-meter" role="progressbar" aria-label="连续未出金次数" aria-valuemin="0" aria-valuemax="${DRAW_PITY_LIMIT}" aria-valuenow="${data.pity}"><i style="width:${Math.min(100, data.pity / DRAW_PITY_LIMIT * 100)}%"></i></span></div>
    <div class="camp-draw-actions summon-controls"><button data-action="camp-draw" data-count="1" ${data.coins < DRAW_COST ? 'disabled' : ''}><strong>接引一次</strong><span>${DRAW_COST} 金币</span></button><button class="primary" data-action="camp-draw" data-count="10" ${data.coins < DRAW_COST * 10 ? 'disabled' : ''}><strong>接引十次</strong><span>${DRAW_COST * 10} 金币</span></button></div>
    <details class="camp-draw-rules summon-rules"><summary>概率与保底规则</summary><p>基础概率：${Object.entries(DRAW_RARITY_WEIGHTS).map(([rarity, weight]) => `${rarityName(rarity as WeaponRarity)} ${weight}%`).join(' · ')}。</p><p>单次与十次共享保底；连续 ${DRAW_PITY_LIMIT - 1} 次未出金，第 ${DRAW_PITY_LIMIT} 次必出金，出金后计数重置。</p><p>定向100抽内必得选中的金色；抽到其他金色不会清空定向进度。各目标独立累计，切换保留进度，抽中当前目标后其计数归零。军团池不推进装备定向。</p><p>未触发定向时，金色产出：传说武器40%（霆链·裁决铳／赤曜·斩疫刃等概率） · 传说模组40% · 锻造核心20%。首次抽到传说武器解锁对应碎片重铸。动画可跳过，收获即时入库。</p></details>
  </section>`;
}
function equipmentWishMarkup(data: CampProfileSnapshot['data']): string {
  const target = data.equipmentWishTarget, progress = data.equipmentWishPity[target] ?? 0;
  return `<section class="summon-wish" aria-label="金色定向接引"><div class="summon-wish-heading"><div><small>金色定向 · 100抽必得</small><h4>${escape(equipmentWishName(target))}</h4></div><strong><b>${progress}</b> / ${EQUIPMENT_WISH_LIMIT}</strong></div>
    <div class="summon-wish-meter" role="progressbar" aria-label="当前目标定向进度" aria-valuemin="0" aria-valuemax="${EQUIPMENT_WISH_LIMIT}" aria-valuenow="${progress}"><i style="width:${progress}%"></i></div>
    <p>最多再抽 <b>${EQUIPMENT_WISH_LIMIT - progress}</b> 次必得当前目标 · 歪金不清零</p>
    <details class="summon-wish-picker"><summary>更换定向目标 <span>各目标进度分别保留</span></summary><div class="summon-wish-options">${EQUIPMENT_WISH_IDS.map(id => `<button data-action="camp-wish-target" data-wish="${id}" aria-pressed="${id === target}"><strong>${escape(equipmentWishName(id))}</strong><small>${data.equipmentWishPity[id] ?? 0} / ${EQUIPMENT_WISH_LIMIT}${id === target ? ' · 已定向' : ''}</small></button>`).join('')}</div></details></section>`;
}
function poolTabs(pool: 'equipment' | 'legion'): string {
  return `<div class="summon-pool-tabs" role="group" aria-label="接引卡池"><button data-action="camp-summon-pool" data-pool="equipment" aria-pressed="${pool==='equipment'}">武器与模组</button><button data-action="camp-summon-pool" data-pool="legion" aria-pressed="${pool==='legion'}">免疫军团 <span>独立保底</span></button></div>`;
}

const fluidBackdrop = (): string => `<svg class="summon-flow" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true"><g class="summon-flow-ribbons"><path d="M-120 620C150 80 370 690 650 280S1080 190 1340-40"/><path d="M-90 590C180 95 350 650 640 300S1090 150 1300-30"/><path d="M-80-70C270 70 145 465 580 362S1010 680 1320 500"/><path d="M-100-45C300 95 135 445 590 380S1020 650 1330 480"/><path d="M-60 760C340 460 120 180 615 350S1060-100 1260 80"/></g><g class="summon-flow-sparks"><path d="M-120 620C150 80 370 690 650 280S1080 190 1340-40"/><path d="M-80-70C270 70 145 465 580 362S1010 680 1320 500"/><path d="M-60 760C340 460 120 180 615 350S1060-100 1260 80"/></g></svg>`;

/** A persistent pearl membrane opens around the prize; it never contains its identity. */
const cocoonMarkup = (): string => `<div class="summon-cocoon" aria-hidden="true"><div class="summon-cocoon-glow"></div><svg class="summon-membrane" viewBox="0 0 400 400" fill="none"><defs>
  <radialGradient id="summon-pearl" cx=".32" cy=".22" r=".85"><stop stop-color="#f4f3db" stop-opacity=".83"/><stop offset=".32" stop-color="#c5e8ce" stop-opacity=".32"/><stop offset=".75" stop-color="#629a88" stop-opacity=".12"/><stop offset="1" stop-color="#d7f0d6" stop-opacity=".48"/></radialGradient>
  <linearGradient id="summon-pearl-edge" x1="60" y1="70" x2="325" y2="350" gradientUnits="userSpaceOnUse"><stop stop-color="#fffce6"/><stop offset=".42" stop-color="#c0e5ca" stop-opacity=".18"/><stop offset=".73" stop-color="#d4eac9" stop-opacity=".3"/><stop offset="1" stop-color="#fff1c4" stop-opacity=".8"/></linearGradient>
  <radialGradient id="summon-embryo"><stop stop-color="#fffde4"/><stop offset=".25" stop-color="var(--summon-accent)" stop-opacity=".85"/><stop offset="1" stop-color="var(--summon-accent)" stop-opacity="0"/></radialGradient>
  </defs><g class="summon-membrane-body"><path d="M202 43C294 34 359 119 352 207C347 299 282 361 193 356C96 352 40 279 46 186C50 100 113 49 202 43Z" fill="url(#summon-pearl)" stroke="url(#summon-pearl-edge)" stroke-width="1.5"/><path d="M83 160C106 84 224 63 283 107" stroke="#fffce9" stroke-opacity=".28" stroke-width="3.5" stroke-linecap="round"/><path d="M291 292C262 325 207 340 166 326" stroke="#cce6c9" stroke-opacity=".3" stroke-width="2" stroke-linecap="round"/><ellipse cx="141" cy="105" rx="37" ry="10" transform="rotate(-25 141 105)" fill="#fffde7" opacity=".1"/></g>
  <g class="summon-petals">${[0,60,120,180,240,300].map(angle => `<g class="summon-petal" style="--petal-angle:${angle}deg"><path d="M200 200C140 177 102 107 150 55C186 15 234 42 236 81C240 134 216 161 200 200Z" fill="url(#summon-pearl)" stroke="url(#summon-pearl-edge)" stroke-width=".9"/></g>`).join('')}</g><circle class="summon-embryo" cx="200" cy="202" r="92" fill="url(#summon-embryo)"/></svg><div class="summon-core-antibody">${summonArtMarkup('gold-antibody')}</div></div>`;

function batchCardsMarkup(receipt: CampSummonReceipt): string {
  return `<ol class="summon-batch-grid" aria-label="本次全部收获">${receipt.results.map((result, index) => `<li class="summon-batch-card" data-rarity="${result.rarity}" data-draw-index="${index + 1}" data-quantity="${result.quantity}" style="--card-delay:${Math.min(index, 9) * 35}ms" aria-label="第${index + 1}抽 · ${rarityName(result.rarity)} · ${escape(summonPrizeName(result))} ×${result.quantity}"><div class="summon-batch-frame"><span class="summon-batch-quality">${rarityName(result.rarity)}</span>${prizeArt(result)}<b>×${result.quantity}</b></div><strong>${escape(summonPrizeName(result))}</strong>${seraphPrizeDetail(result)}</li>`).join('')}</ol>`;
}

function cinematicPieces(view: CampSummonSequenceView): { art: string; batch: string; identity: string; footer: string } {
  const item = view.receipt.results[view.index], rarity = view.currentRarity;
  const revealed = view.phase === 'item', batch = view.resultCount > 1;
  const goldCount = view.receipt.results.filter(result => result.rarity === 'gold').length;
  const identity = revealed && batch ? `<div class="summon-batch-heading"><span>${view.resultCount} 份馈赠</span><h2 id="summon-reveal-title">脉流的馈赠</h2>${goldCount ? `<b>金色 ×${goldCount}</b>` : ''}</div>` : revealed ? `<div class="summon-unveiled"><span class="summon-unveiled-quality"><i aria-hidden="true">✧</i>${rarityName(rarity)} · ${prizeKind(item)}<i aria-hidden="true">✧</i></span><h2 id="summon-reveal-title">${escape(summonPrizeName(item))}</h2><b class="summon-hero-count">×${item.quantity}</b>${seraphPrizeDetail(item,true)}</div>`
    : `<div class="summon-sealed-caption"><span>${view.phase === 'charge' ? '灵息凝聚' : '品质显现'}</span><h2 id="summon-reveal-title">${view.phase === 'charge' ? '循流而来' : rarity === 'gold' ? '金色灵幻体' : rarity === 'purple' ? '史诗灵幻体' : rarity === 'blue' ? '精良灵幻体' : '灵幻体已凝成'}</h2></div>`;
  const action = revealed ? `<button class="summon-next" data-action="camp-summon-next">${batch ? '全部收下' : '收下馈赠'} <span aria-hidden="true">→</span></button>`
    : view.phase === 'rarity' ? '<button class="summon-next" data-action="camp-summon-reveal">轻触揭晓 <span aria-hidden="true">✦</span></button>' : '<span class="summon-charging"><i></i><i></i><i></i></span>';
  return { art: revealed && !batch ? `<div class="summon-unveiled-art">${prizeArt(item)}</div>` : '', batch: revealed && batch ? batchCardsMarkup(view.receipt) : '', identity, footer: action };
}

/** Identity is omitted entirely until the matching item's reveal phase. */
export function campSummonOverlay(view?: CampSummonSequenceView): string {
  if (!view || view.phase === 'complete') return '';
  const pieces = cinematicPieces(view);
  return `<div class="overlay summon-cinematic" data-phase="${view.phase}" data-rarity="${view.phase === 'charge' ? 'white' : view.highestRarity}" data-layout="${view.resultCount > 1 ? 'batch' : 'single'}" data-result-count="${view.resultCount}" data-summon-receipt="${escape(view.receipt.id)}" data-summon-key="${view.key}" style="--phase-duration:${view.phaseDuration}ms;--batch-columns:${Math.min(5, view.resultCount)}"><section class="summon-shell" role="dialog" aria-modal="true" aria-labelledby="summon-reveal-title">
    <div class="summon-atmosphere" aria-hidden="true"><div class="summon-fluid-halo"></div>${fluidBackdrop()}<div class="summon-grain"></div><div class="summon-dust">${Array.from({length:16},(_, i) => `<i style="--dust:${i};--dust-x:${[8,72,23,88,35,61,14,79,44,92,29,57,5,68,39,83][i]}%;--dust-y:${[18,74,63,28,85,12,43,54,25,81,34,70,89,20,58,39][i]}%"></i>`).join('')}</div></div>
    <header class="summon-cinematic-header"><span class="summon-wordmark"><i aria-hidden="true">✧</i>血流接引</span>${view.resultCount > 1 ? `<span class="summon-batch-count">${view.resultCount} 份馈赠</span>` : ''}<button data-action="camp-summon-skip">跳过 <span aria-hidden="true">»</span></button></header>
    <div class="summon-theatre"><div class="summon-focus"><div class="summon-release-glow" aria-hidden="true"></div>${cocoonMarkup()}<div class="summon-prize-slot">${pieces.art}</div></div><div class="summon-identity" aria-live="polite">${pieces.identity}</div><div class="summon-batch-slot" role="region" aria-label="本次收获列表" tabindex="${view.phase === 'item' && view.resultCount > 1 ? '0' : '-1'}">${pieces.batch}</div></div>
    <footer class="summon-cinematic-footer">${pieces.footer}</footer>
  </section></div>`;
}

/** Patch only reveal content. Ambient flow, membrane and their animation clocks stay alive. */
export function updateCampSummonOverlay(element: HTMLElement, view: CampSummonSequenceView): boolean {
  if (view.phase === 'complete' || element.dataset.summonReceipt !== view.receipt.id || element.dataset.summonKey === String(view.key)) return false;
  const pieces = cinematicPieces(view), slot = element.querySelector<HTMLElement>('.summon-prize-slot');
  if (slot) slot.innerHTML = pieces.art;
  const identity = element.querySelector<HTMLElement>('.summon-identity'); if (identity) identity.innerHTML = pieces.identity;
  const batch = element.querySelector<HTMLElement>('.summon-batch-slot'); if (batch) { batch.innerHTML = pieces.batch; batch.tabIndex = view.phase === 'item' && view.resultCount > 1 ? 0 : -1; }
  const footer = element.querySelector<HTMLElement>('.summon-cinematic-footer'); if (footer) footer.innerHTML = pieces.footer;
  element.style.setProperty('--phase-duration', `${view.phaseDuration}ms`);
  element.dataset.phase = view.phase; element.dataset.rarity = view.phase === 'charge' ? 'white' : view.highestRarity;
  element.dataset.summonKey = String(view.key);
  return true;
}
