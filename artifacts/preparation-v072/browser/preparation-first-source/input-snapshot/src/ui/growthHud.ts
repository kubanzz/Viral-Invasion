import type { GameState } from '../game/types';
import { describeProtocol, GROWTH_BALANCE, PATROL_CONFIG, PROTOCOLS, TUNING_NAMES, protocolRank, protocolAction, RANK_NAMES } from '../game/protocols';
import { availableResearchDirections, RESEARCH_DIRECTIONS } from '../game/research';

const escape = (value: string) => value.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Container-keyed caches let detached HUDs and their children be collected.
const slotViews = new WeakMap<HTMLElement, { signature: string; counts: (HTMLElement | null)[] }>();
const feedbackViews = new WeakMap<HTMLElement, { title: string; hint: string }>();
export const growthDetailsEntryMarkup = `<button class="growth-details-entry" data-action="growth-details">当前配装详情</button>`;
export const growthHudMarkup = `<aside class="growth-panel"><div class="growth-heading"><span>我的进化 · 抗体构筑</span><b id="growth-research">样本 0</b></div><div class="xp-label" id="growth-xp"></div><div class="meter"><i id="xp-meter"></i></div><div id="protocol-slots" class="protocol-slots"></div>${growthDetailsEntryMarkup}<p id="research-hint">Q 诊断 → 研究台 E 选方向</p></aside><div id="evolution-feedback" class="evolution-feedback" role="status" hidden></div>`;
export const growthHelpMarkup = `<p><b>我的进化：</b>经验来自清源、精英、首次诊断与保护组织；达标时三选一。四种协议是四条不同的规则路线，每次显示三个候选，可装备 ${GROWTH_BALANCE.slots} 种。重复选择已有协议先升至Ⅱ/Ⅲ阶，实际提高效果；Ⅲ阶后才改变校准取向。</p><p><b>诊断 → 定向研究：</b>Q 实际诊断过的变异会开放对应研究方向。靠近研究台按 E，先选择方向；确认时才消耗 ${GROWTH_BALANCE.researchCost} 样本并生成三选一草案，选方向前取消免费。定向候选保证包含相关主协议与联动伙伴，仍可自由选择任意候选；通用研究保持随机。草案生成后放弃不退样本，研究与经验共用同一套配装，研究和草案期间暂停。</p><p><b>免疫协同：</b>没有协议时，Q 也能召来一只短时侦巡细胞协助清理。装备免疫灯塔后，Q 变为三只免疫细胞小队，在标记区移动、追击并接触吞噬；小队会带来组织承压。异常显影让 Q 留下减速轨迹，小队优先围猎显影体。</p><p><b>组合打法：</b>共振裂解需要靠近装置、配合冲流相位命中；与连锁净化搭配，破绽清除可增加一跳，总计最多 3 跳。槽位下方会显示使用提示和本局触发数，草案同时展示前后变化与代价。</p>`;
function preparationCopy(state: GameState): string {
  const growth=state.growth;
  if(!growth?.preparation?.starterProtocolId)return '';
  return growth.starterDebt===1 ? `初始预装已提前使用首份经验成长；${GROWTH_BALANCE.xpThresholds[0]} XP 只结清预支，不生成草案；${GROWTH_BALANCE.xpThresholds[1]} XP 起正常选择。` : '初始预装的首份经验成长已结清；后续经验草案正常生成。';
}
export function growthHistoryMarkup(state: GameState): string {
  const growth=state.growth;if(!growth)return '';
  return `<div class="trait-history"><article><h3>抗体路线</h3><p>${growth.equipped.map(p=>`${PROTOCOLS[p.id].symbol} ${PROTOCOLS[p.id].name} ${RANK_NAMES[protocolRank(p)]} · ${TUNING_NAMES[p.tuning]} · 触发 ${growth.activations?.[p.id]??0} 次`).join(' → ')||'无协议构筑 · Q 仍可召集基础免疫侦巡'}</p><p>经验 ${growth.xp} · 样本 ${growth.research} · 进化 Lv.${growth.level}${preparationCopy(state)?`<br>${preparationCopy(state)}`:''}</p></article></div><ol class="event-history">${growth.protocolHistory.slice().reverse().map(item=>`<li><time>${Math.floor(item.at/60).toString().padStart(2,'0')}:${Math.floor(item.at%60).toString().padStart(2,'0')}</time><span>${escape(item.text)}</span></li>`).join('')}</ol>`;
}

/** Rendered once on opening, outside the frequently refreshed HUD slots. */
export function growthDetailsOverlay(state: GameState, returnLabel: string): string {
  const growth=state.growth;if(!growth)return '';
  const hasBeacon=growth.equipped.some(slot=>slot.id==='IMMUNE_BEACON');
  const slots=Array.from({length:GROWTH_BALANCE.slots},(_,index)=>{
    const slot=growth.equipped[index];
    if(!slot)return `<article class="growth-detail-card empty" data-slot="${index}"><h3>槽位 ${index+1} · 空协议槽</h3><p>通过战斗经验或研究台获得草案，再选择新能力。空槽不影响基础 Q 免疫侦巡。</p></article>`;
    const info=PROTOCOLS[slot.id],rank=protocolRank(slot),description=describeProtocol(slot.id,slot.tuning,rank),count=growth.activations?.[slot.id]??0;
    return `<article class="growth-detail-card" data-protocol="${slot.id}" data-rank="${rank}" data-tuning="${slot.tuning}"><h3>${info.symbol} ${escape(info.name)} ${RANK_NAMES[rank]} <small>${escape(TUNING_NAMES[slot.tuning])}</small></h3><p class="growth-detail-count">本局实际触发 <strong data-activation-count="${count}">${count}</strong> 次</p><dl><dt>触发条件</dt><dd>${escape(info.trigger)}</dd><dt>当前效果</dt><dd class="growth-detail-effect">${escape(description.effect)}</dd><dt>代价与限制</dt><dd class="growth-detail-cost">${escape(description.cost)}</dd><dt>现在这样用</dt><dd class="growth-detail-action">${escape(protocolAction(slot.id,rank))}</dd></dl></article>`;
  }).join('');
  return `<div class="overlay"><section class="modal growth-details" role="dialog" aria-modal="true" aria-label="当前配装详情"><div class="growth-details-header"><div><div class="eyebrow">MY EVOLUTION / 我的进化</div><h2>当前配装详情</h2></div><button data-action="close-growth-details">${escape(returnLabel)} <kbd>Esc</kbd></button></div><p class="growth-details-summary">${growth.equipped.length} / ${GROWTH_BALANCE.slots} 槽 · 进化 Lv.${growth.level} · 经验 ${growth.xp} · 样本 ${growth.research}<br>模拟已暂停，触发次数记录本局实际生效次数；重复选择已有协议可进阶至Ⅲ阶。${preparationCopy(state)?`<br>${preparationCopy(state)}`:''}</p><div class="growth-details-scroll" tabindex="0" role="region" aria-label="配装效果与使用说明"><div class="growth-details-grid">${slots}</div><article class="growth-detail-patrol"><h3>Q · ${hasBeacon?'免疫小队已接管召集':'基础免疫侦巡随时可用'}</h3><p>${hasBeacon?'当前装备免疫灯塔，Q 召集三只免疫细胞；持续、伤害、冷却与组织代价见上方协议。':'未装备免疫灯塔时，Q 召来一只免疫细胞，不占协议槽、不消耗组织完整度。'}</p><p>基础侦巡：持续 ${PATROL_CONFIG.duration} 秒，活动范围 ${PATROL_CONFIG.radius}，每 ${PATROL_CONFIG.interval} 秒 ${PATROL_CONFIG.damage} 伤害，冷却 ${PATROL_CONFIG.cooldown} 秒。鼠标指向敌群，再按 Q，细胞会移动并接触吞噬目标。</p></article></div></section></div>`;
}

export function updateGrowthHud(state: GameState): void {
  const growth=state.growth;if(!growth)return;
  document.getElementById('growth-research')!.textContent=`样本 ${growth.research}`;
  document.getElementById('growth-xp')!.textContent=growth.starterDebt===1 ? `预装待结清 · ${growth.xp}/${GROWTH_BALANCE.xpThresholds[0]} XP · 下份草案 ${GROWTH_BALANCE.xpThresholds[1]}` : `${growth.preparation?.starterProtocolId?'预支已结清 · ':`进化 Lv.${growth.level} · `}经验 ${growth.xp}${growth.nextXp===null?' / 已达本局上限':` / ${growth.nextXp}`}`;
  const floor=GROWTH_BALANCE.xpThresholds[growth.level-1]??0;
  document.getElementById('xp-meter')!.style.width=`${growth.nextXp===null?100:Math.max(0,Math.min(100,(growth.xp-floor)/(growth.nextXp-floor)*100))}%`;
  const slots=document.getElementById('protocol-slots')!;
  let signature='';
  for(let i=0;i<GROWTH_BALANCE.slots;i++){
    const equipped=growth.equipped[i];
    signature+=equipped?`${equipped.id}:${protocolRank(equipped)}:${equipped.tuning}|`:'empty|';
  }
  let view=slotViews.get(slots);
  if(!view||view.signature!==signature){
    slots.innerHTML=Array.from({length:GROWTH_BALANCE.slots},(_,i)=>{
      const equipped=growth.equipped[i];if(!equipped)return `<div class="protocol-slot empty"><span>${i+1}</span> 空协议槽</div>`;
      const protocol=PROTOCOLS[equipped.id],rank=protocolRank(equipped),description=describeProtocol(equipped.id,equipped.tuning,rank);
      const count=growth.activations?.[equipped.id]??0;
      return `<div class="protocol-slot" data-protocol="${equipped.id}" title="${escape(`${protocol.trigger}。${description.effect} ${description.cost} ${protocolAction(equipped.id,rank)}`)}"><span>${protocol.symbol}</span><b>${protocol.name} ${RANK_NAMES[rank]}</b><small>${count?'触发 '+count:'待触发'}</small></div>`;
    }).join('');
    view={signature,counts:Array.from(slots.children,node=>node.querySelector<HTMLElement>('small'))};
    slotViews.set(slots,view);
  }
  for(let i=0;i<GROWTH_BALANCE.slots;i++){
    const equipped=growth.equipped[i],counter=view.counts[i];
    if(!equipped||!counter)continue;
    const count=growth.activations?.[equipped.id]??0,text=count?'触发 '+count:'待触发';
    if(counter.textContent!==text)counter.textContent=text;
  }
  const beacon=growth.beacon;
  const hasBeacon=growth.equipped.some(slot=>slot.id==='IMMUNE_BEACON');
  const diagnosed=availableResearchDirections(growth.rewardedKeys).length-1;
  document.getElementById('research-hint')!.textContent=beacon&&beacon.until>state.elapsed?`${beacon.mode==='patrol'?'免疫侦巡':'免疫小队'} ${growth.cells?.length??0} 体 · ${Math.max(0,beacon.until-state.elapsed).toFixed(1)}s`:hasBeacon&&growth.beaconReadyAt>state.elapsed?`小队再召集 ${Math.ceil(growth.beaconReadyAt-state.elapsed)}s · E 研究`:`Q 诊断 · E 研究（${diagnosed?`可定向 ${diagnosed} 类`:'诊断后可定向'}）`;
  const feedback=document.getElementById('evolution-feedback');
  if(feedback){
    const evolution=growth.lastEvolution;feedback.hidden=!evolution||state.elapsed>=evolution.until;
    if(evolution&&!feedback.hidden){
      const view=feedbackViews.get(feedback);
      if(!view||view.title!==evolution.title||view.hint!==evolution.hint){
        feedback.innerHTML=`<strong>进化完成 · ${escape(evolution.title)}</strong><span>${escape(evolution.hint)}</span>`;
        feedbackViews.set(feedback,{title:evolution.title,hint:evolution.hint});
      }
    }
  }
}

/** One paused growth flow: choose a direction, then the existing draft/slots. */
export function researchDirectionOverlay(state: GameState): string | null {
  const growth=state.growth,offer=growth?.pendingResearch;
  if(!growth||!offer||growth.draft||growth.ended||offer.runId!==growth.runId||offer.organId!==state.battle?.organId)return null;
  const unlocked=availableResearchDirections(growth.rewardedKeys);
  const directions=[...new Set(offer.directions)].filter(direction=>unlocked.includes(direction));
  if(!directions.length)return null;
  const request=`data-request="${escape(offer.id)}"`;
  return `<div class="overlay"><section class="modal growth-draft research-directions" role="dialog" aria-modal="true" aria-label="选择研究方向"><div class="eyebrow">ANTIBODY RESEARCH / 样本研究</div><h2>让研究回应刚才的诊断。</h2><p class="research-intro">先选择方向，再生成三选一草案。确认研究消耗 <strong>${GROWTH_BALANCE.researchCost} 样本</strong>，当前持有 ${growth.research}；尚未扣除样本。</p><ol class="research-flow" aria-label="研究步骤"><li aria-current="step">1 · 选择方向</li><li>2 · 三选一草案</li><li>3 · 装备或替换</li></ol><div class="research-direction-scroll" role="region" aria-label="已开放的研究方向" tabindex="0"><div class="research-direction-grid" data-directions="${directions.length}">${directions.map(direction=>{
    const info=RESEARCH_DIRECTIONS[direction],primary=info.primary?PROTOCOLS[info.primary]:null,partner=info.partner?PROTOCOLS[info.partner]:null;
    return `<button class="research-direction" data-action="research-confirm" ${request} data-direction="${direction}"><span class="research-direction-kind">${direction==='general'?'泛用候选':'本局已诊断'}</span><h3>${escape(info.title)}</h3><p>${escape(info.description)}</p>${primary&&partner?`<dl class="research-pair"><dt>保证主协议候选</dt><dd>${primary.symbol} ${escape(primary.name)}</dd><dt>保证联动伙伴候选</dt><dd>${partner.symbol} ${escape(partner.name)}</dd></dl>`:'<p class="research-general">从四条协议路线中随机生成候选，保留已有协议进阶机会。</p>'}<span class="research-direction-commit">确认${escape(info.title)} · ${GROWTH_BALANCE.researchCost} 样本 ↗</span></button>`;
  }).join('')}</div><p class="research-freedom">方向保证相关候选出现，不要求选取指定协议。基础工具始终可反制；草案生成后放弃不退样本。</p></div><div class="actions research-direction-actions"><button class="quiet" data-action="research-cancel" ${request}>取消研究 · 不消耗样本</button>${growthDetailsEntryMarkup}<button class="quiet" data-action="help">查看作战手册</button></div><div class="seed">模拟已暂停 · 选择方向不会消耗战场时间</div></section></div>`;
}

function researchDraftContext(state: GameState): string {
  const draft=state.growth?.draft;if(draft?.source!=='research')return '';
  const direction=draft.researchDirection??'general',info=RESEARCH_DIRECTIONS[direction];
  return `<div class="research-draft-context" data-research-direction="${direction}"><strong>研究方向 · ${escape(info.title)}</strong><span>${escape(info.description)} 仍可自由选择本次任意候选。</span><small>本次已消耗 ${GROWTH_BALANCE.researchCost} 样本；放弃草案不会退还。</small></div>`;
}

export function draftOverlay(state: GameState): string | null {
  const growth=state.growth, draft=growth?.draft;if(!growth||!draft)return null;
  const selected=draft.options.find(option=>option.id===draft.selectedOptionId);
  const data=`data-draft="${escape(draft.id)}"`;
  const researchContext=researchDraftContext(state);
  const sourceLabel=draft.source==='xp'?'战斗经验':`样本研究 · ${RESEARCH_DIRECTIONS[draft.researchDirection??'general'].title}`;
  if(draft.status==='replacing'&&selected) return `<div class="overlay"><section class="modal growth-draft" role="dialog" aria-modal="true" aria-label="替换抗体协议"><div class="eyebrow">THREE SLOTS / 构筑取舍</div><h2>为${escape(PROTOCOLS[selected.protocolId].name)}腾出一席。</h2>${researchContext}<p>三个槽位已满。选择替换一个协议，其效果会立即结束；或放弃本次草案。</p><div class="draft-grid">${growth.equipped.map((old,index)=>`<button class="draft-choice replacement" data-action="draft-replace" ${data} data-option="${escape(selected.id)}" data-slot="${index}" data-previous="${old.id}"><span class="protocol-symbol">${PROTOCOLS[old.id].symbol}</span><h3>替换 ${PROTOCOLS[old.id].name} ${RANK_NAMES[protocolRank(old)]}</h3><p>失去：${escape(describeProtocol(old.id,old.tuning,protocolRank(old)).effect)}</p><strong>装入 ${escape(selected.title)} ↗</strong></button>`).join('')}</div><div class="actions"><button data-action="draft-back" ${data}>重新查看候选</button><button class="quiet" data-action="draft-discard" ${data}>放弃本次草案</button>${growthDetailsEntryMarkup}</div><div class="seed">模拟已暂停 · 选择不会消耗战场时间</div></section></div>`;
  return `<div class="overlay"><section class="modal growth-draft" role="dialog" aria-modal="true" aria-label="抗体协议草案"><div class="eyebrow">ANTIBODY EVOLUTION / ${sourceLabel}</div><h2>选择一条，马上改变打法。</h2><p>四种协议路线 · 最多装备三种 · 每次三选一。已有协议优先进阶至Ⅲ阶，之后才调整取向。${draft.source==='research'?'本次研究已消耗样本，放弃不会退还。':''}</p>${researchContext}<div class="draft-grid">${draft.options.map(option=>{const current=growth.equipped.find(item=>item.id===option.protocolId),upgrading=!!current&&(option.rank??1)>protocolRank(current);return `<button class="draft-choice" data-action="draft-option" ${data} data-option="${escape(option.id)}"><span class="protocol-symbol">${PROTOCOLS[option.protocolId].symbol}</span><h3>${escape(option.title)}</h3><div class="draft-tags">${option.tags.map(tag=>`<span>${tag}</span>`).join('')}</div><p class="draft-change"><b>${upgrading?'本次提升':current?'改变取向':'获得新能力'}</b>${escape(option.change??option.effect)}</p><p class="draft-action"><b>选完这样用</b>${escape(option.actionHint??option.trigger)}</p><p class="draft-effect">${escape(option.effect)}</p><p class="draft-cost"><b>取舍</b>${escape(option.cost)}</p><strong>${upgrading?`进阶至 ${RANK_NAMES[option.rank??1]}`:option.kind==='retune'?'调整校准取向':'解锁此打法'} ↗</strong></button>`;}).join('')}</div><div class="draft-current">当前配装：${growth.equipped.map(item=>`${PROTOCOLS[item.id].name} ${RANK_NAMES[protocolRank(item)]} · ${TUNING_NAMES[item.tuning]}`).join(' / ')||'暂无协议 · Q 已有一只基础免疫侦巡，灯塔可将它强化为三体小队'}</div><div class="actions"><button class="quiet" data-action="draft-discard" ${data}>放弃本次草案</button><button class="quiet" data-action="help">查看作战手册</button>${growthDetailsEntryMarkup}</div><div class="seed">模拟已暂停 · 选择不会消耗战场时间</div></section></div>`;
}
