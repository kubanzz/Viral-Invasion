import type { GameState } from '../game/types';
import type { ProtocolId } from '../game/growthTypes';
import { describeProtocol, GROWTH_BALANCE, PATROL_CONFIG, PROTOCOLS, TUNING_NAMES, protocolRank, protocolAction, RANK_NAMES } from '../game/protocols';
import { availableResearchDirections, RESEARCH_DIRECTIONS } from '../game/research';
import { immuneFocusStatusMarkup, updateImmuneFocusHud } from './immuneFocusHud';
import { catalysisStatusMarkup, updateCatalysisHud } from './catalysisHud';
import { choiceIconMarkup, protocolChoiceCopy, PROTOCOL_CHOICE_NAMES } from './upgradeChoices';

const escape = (value: string) => value.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Container-keyed caches let detached HUDs and their children be collected.
const slotViews = new WeakMap<HTMLElement, { signature: string; counts: (HTMLElement | null)[] }>();
const feedbackViews = new WeakMap<HTMLElement, { title: string; hint: string }>();
export const growthDetailsEntryMarkup = `<button class="growth-details-entry" data-action="growth-details">当前配装详情</button>`;
export const growthHudMarkup = `<aside class="growth-panel"><div class="growth-heading"><span>我的进化 · 抗体构筑</span><b id="growth-research">样本 0</b></div><div class="xp-label" id="growth-xp"></div><div class="meter"><i id="xp-meter"></i></div><div id="protocol-slots" class="protocol-slots"></div>${immuneFocusStatusMarkup}${catalysisStatusMarkup}${growthDetailsEntryMarkup}<p id="research-hint">Q 诊断 → 研究台 E 选方向 · Q 指敌围猎</p></aside><div id="evolution-feedback" class="evolution-feedback" role="status" hidden></div>`;
export const growthHelpMarkup = `<p><b>我的进化：</b>经验来自清源、精英、首次诊断与保护组织；达标时三选一。四种协议是四条不同的规则路线，每次显示三个候选，可装备 ${GROWTH_BALANCE.slots} 种。重复选择已有协议先升至Ⅱ/Ⅲ阶，实际提高效果；Ⅲ阶后才改变校准取向。</p><p><b>诊断 → 定向研究：</b>Q 实际诊断过的变异会开放对应研究方向。靠近研究台按 E，先选择方向；确认时才消耗 ${GROWTH_BALANCE.researchCost} 样本并生成三选一草案，选方向前取消免费。定向候选保证包含相关主协议与联动伙伴，仍可自由选择任意候选；通用研究保持随机。草案生成后放弃不退样本，研究与经验共用同一套配装，研究和草案期间暂停。</p><p><b>免疫协同：</b>没有协议时，Q 也能召来一只短时侦巡细胞协助清理。装备免疫灯塔后，Q 变为三只免疫细胞小队，在标记区移动、追击并接触吞噬；小队会带来组织承压。Q 就绪时，准星对准敌体可下达短时围猎指令；对准空地则部署区域。指定目标结束后，小队恢复自动选敌；未指定围猎时优先显影体。</p><p><b>组合打法：</b>共振裂解需要靠近装置、配合冲流相位命中；与连锁净化搭配，破绽清除可增加一跳，总计最多 3 跳。槽位下方会显示使用提示和实际命中／显影施加记录，草案同时展示前后变化与代价。</p>`;
function preparationCopy(state: GameState): string {
  const growth=state.growth;
  if(!growth?.preparation?.starterProtocolId)return '';
  return growth.starterDebt===1 ? `初始预装已提前使用首份经验成长；${GROWTH_BALANCE.xpThresholds[0]} XP 只结清预支，不生成草案；${GROWTH_BALANCE.xpThresholds[1]} XP 起正常选择。` : '初始预装的首份经验成长已结清；后续经验草案正常生成。';
}
/** Combat counters come from accepted positive-damage facts, never planned activations. */
function protocolRecord(state: GameState, id: ProtocolId): { hud: string; summary: string; definition: string } {
  if(id==='EXPOSE_TRACE'){
    if(!state.growth?.activations)return {hud:'显影未记录',summary:'显影施加次数未记录',definition:'本局没有完整显影施加记录。'};
    const count=state.growth?.activations?.EXPOSE_TRACE??0;
    return {hud:`显影 ${count}`,summary:`显影施加次数 ${count} 次`,definition:'按扫描实际施加标记记录，不代表造成伤害。'};
  }
  const control=state.runMetrics?.summary.control;
  if(!control)return {hud:'命中未记录',summary:'未记录真实命中',definition:'本局没有完整命中记录。'};
  if(id==='PULSE_BREAK')return {hud:`共振 ${control.resonanceHits}`,summary:`实际共振命中 ${control.resonanceHits} 次`,definition:'仅计实际造成正伤害的共振命中。'};
  if(id==='IMMUNE_BEACON')return {hud:`咬击 ${control.beaconBites}`,summary:`实际咬击 ${control.beaconBites} 次`,definition:'按每只灯塔细胞实际造成正伤害的咬击计数，不按整队轮次计。'};
  return {hud:`链 ${control.chainTriggers} · 折 ${control.ricochetHits}`,summary:`连锁 ${control.chainTriggers} 次 / ${control.chainHops} 跳；折射 ${control.ricochetHits} 次`,definition:'每条净化链至少一次真实邻体正伤害计一次；跳数按实际命中计，进阶折射单列。'};
}
export function growthHistoryMarkup(state: GameState): string {
  const growth=state.growth;if(!growth)return '';
  return `<div class="trait-history"><article><h3>抗体路线</h3><p>${growth.equipped.map(p=>`${PROTOCOLS[p.id].symbol} ${PROTOCOLS[p.id].name} ${RANK_NAMES[protocolRank(p)]} · ${TUNING_NAMES[p.tuning]} · ${protocolRecord(state,p.id).summary}`).join(' → ')||'无协议构筑 · Q 仍可召集基础免疫侦巡'}</p><p>经验 ${growth.xp} · 样本 ${growth.research} · 进化 Lv.${growth.level}${preparationCopy(state)?`<br>${preparationCopy(state)}`:''}</p></article></div><ol class="event-history">${growth.protocolHistory.slice().reverse().map(item=>`<li><time>${Math.floor(item.at/60).toString().padStart(2,'0')}:${Math.floor(item.at%60).toString().padStart(2,'0')}</time><span>${escape(item.text)}</span></li>`).join('')}</ol>`;
}

/** Rendered once on opening, outside the frequently refreshed HUD slots. */
export function growthDetailsOverlay(state: GameState, returnLabel: string): string {
  const growth=state.growth;if(!growth)return '';
  const hasBeacon=growth.equipped.some(slot=>slot.id==='IMMUNE_BEACON');
  const slots=Array.from({length:GROWTH_BALANCE.slots},(_,index)=>{
    const slot=growth.equipped[index];
    if(!slot)return `<article class="growth-detail-card empty" data-slot="${index}"><h3>槽位 ${index+1} · 空协议槽</h3><p>通过战斗经验或研究台获得草案，再选择新能力。空槽不影响基础 Q 免疫侦巡。</p></article>`;
    const info=PROTOCOLS[slot.id],rank=protocolRank(slot),description=describeProtocol(slot.id,slot.tuning,rank),record=protocolRecord(state,slot.id);
    return `<article class="growth-detail-card" data-protocol="${slot.id}" data-rank="${rank}" data-tuning="${slot.tuning}"><h3>${info.symbol} ${escape(info.name)} ${RANK_NAMES[rank]} <small>${escape(TUNING_NAMES[slot.tuning])}</small></h3><p class="growth-detail-count"><strong>${escape(record.summary)}</strong><br>${escape(record.definition)}</p><dl><dt>触发条件</dt><dd>${escape(info.trigger)}</dd><dt>当前效果</dt><dd class="growth-detail-effect">${escape(description.effect)}</dd><dt>代价与限制</dt><dd class="growth-detail-cost">${escape(description.cost)}</dd><dt>现在这样用</dt><dd class="growth-detail-action">${escape(protocolAction(slot.id,rank))}</dd></dl></article>`;
  }).join('');
  return `<div class="overlay"><section class="modal growth-details" role="dialog" aria-modal="true" aria-label="当前配装详情"><div class="growth-details-header"><div><div class="eyebrow">MY EVOLUTION / 我的进化</div><h2>当前配装详情</h2></div><button data-action="close-growth-details">${escape(returnLabel)} <kbd>Esc</kbd></button></div><p class="growth-details-summary">${growth.equipped.length} / ${GROWTH_BALANCE.slots} 槽 · 进化 Lv.${growth.level} · 经验 ${growth.xp} · 样本 ${growth.research}<br>模拟已暂停；命中仅计实际正伤害，显影单独记录标记施加。重复选择已有协议可进阶至Ⅲ阶。${preparationCopy(state)?`<br>${preparationCopy(state)}`:''}</p><div class="growth-details-scroll" tabindex="0" role="region" aria-label="配装效果与使用说明"><div class="growth-details-grid">${slots}</div><article class="growth-detail-patrol"><h3>Q · ${hasBeacon?'免疫小队已接管召集':'基础免疫侦巡随时可用'}</h3><p>${hasBeacon?'当前装备免疫灯塔，Q 召集三只免疫细胞；持续、伤害、冷却与组织代价见上方协议。':'未装备免疫灯塔时，Q 召来一只免疫细胞，不占协议槽、不消耗组织完整度。'}</p><p>基础侦巡：持续 ${PATROL_CONFIG.duration} 秒，活动范围 ${PATROL_CONFIG.radius}，每 ${PATROL_CONFIG.interval} 秒 ${PATROL_CONFIG.damage} 伤害，冷却 ${PATROL_CONFIG.cooldown} 秒。Q 就绪时，准星对准敌体可短时优先围猎；指向空地则部署区域。围猎受活动范围、路线与原寿命限制，细胞仍须实际赶到并接触咬击。</p></article></div></section></div>`;
}

/** Campaign Q has a player scan clock and a separate squad summon clock. */
export function campaignImmuneResearchHint(state: GameState): string {
  const growth=state.growth;if(!growth)return '';
  const diagnosed=availableResearchDirections(growth.rewardedKeys).length-1;
  const research=`E研究（${diagnosed?`可定向 ${diagnosed} 类`:'诊断后可定向'}）`;
  const qWait=Math.max(0,state.scanReady-state.elapsed),q=qWait>0?`Q${Math.ceil(qWait)}s后`:'Q';
  const hasBeacon=growth.equipped.some(slot=>slot.id==='IMMUNE_BEACON'),beacon=growth.beacon;
  const organ=state.battle?.organId??'heart';
  const count=growth.cells?.filter(cell=>cell.beaconId===beacon?.id&&cell.organId===organ&&cell.until>state.elapsed).length??0;
  const active=!!beacon&&beacon.organId===organ&&beacon.until>state.elapsed&&count>0;
  const remaining=active?(beacon!.until-state.elapsed).toFixed(1):'';
  if(!hasBeacon){
    const patrol=active&&beacon?.mode==='patrol'?`侦巡${count}体·${remaining}s · `:'';
    return `${patrol}${q}${patrol?'再':''}召集1体侦巡 · ${research}`;
  }
  const summonWait=Math.max(0,growth.beaconReadyAt-state.elapsed);
  if(summonWait<=1e-9)return `${q}${active?'重新':''}召集3体小队 · ${research}`;
  if(active&&beacon?.mode!=='patrol')return `小队${count}体·${remaining}s · ${qWait>0?`Q冷却${Math.ceil(qWait)}s`:'Q重指挥'}，不续命 · ${research}`;
  const diagnostic=qWait>0?`Q诊断${Math.ceil(qWait)}s`:'Q可诊断';
  return `3体小队召集还需${Math.ceil(Math.max(summonWait,qWait))}s · ${diagnostic} · ${research}`;
}

export function updateGrowthHud(state: GameState): void {
  updateCatalysisHud(state);
  updateImmuneFocusHud(state);
  const growth=state.growth;if(!growth)return;
  document.getElementById('growth-research')!.textContent=`样本 ${growth.research}`;
  document.getElementById('growth-xp')!.textContent=growth.starterDebt===1 ? `预装待结清 · ${growth.xp}/${GROWTH_BALANCE.xpThresholds[0]} XP · 下份草案 ${GROWTH_BALANCE.xpThresholds[1]}` : `${growth.preparation?.starterProtocolId?'预支已结清 · ':`进化 Lv.${growth.level} · `}经验 ${growth.xp}${growth.nextXp===null?' / 已达本局上限':` / ${growth.nextXp}`}`;
  if (state.endless) {
    document.getElementById('growth-research')!.textContent = '清波获得协议经验';
    document.getElementById('growth-xp')!.textContent = growth.nextXp === null ? '每5波联动重配 · 战斗进化继续'
      : `协议 Lv.${growth.level} · ${growth.xp} / ${growth.nextXp} XP`;
  }
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
      const record=protocolRecord(state,equipped.id);
      return `<div class="protocol-slot" data-protocol="${equipped.id}" title="${escape(`${protocol.trigger}。${description.effect} ${description.cost} ${protocolAction(equipped.id,rank)}`)}"><span>${protocol.symbol}</span><b>${protocol.name} ${RANK_NAMES[rank]}</b><small>${escape(record.hud)}</small></div>`;
    }).join('');
    view={signature,counts:Array.from(slots.children,node=>node.querySelector<HTMLElement>('small'))};
    slotViews.set(slots,view);
  }
  for(let i=0;i<GROWTH_BALANCE.slots;i++){
    const equipped=growth.equipped[i],counter=view.counts[i];
    if(!equipped||!counter)continue;
    const text=protocolRecord(state,equipped.id).hud;
    if(counter.textContent!==text)counter.textContent=text;
  }
  if(!state.endless)document.getElementById('research-hint')!.textContent=campaignImmuneResearchHint(state);
  else{
    const beacon=growth.beacon,hasBeacon=growth.equipped.some(slot=>slot.id==='IMMUNE_BEACON');
    document.getElementById('research-hint')!.textContent=beacon&&beacon.until>state.elapsed?`${beacon.mode==='patrol'?'免疫侦巡':'免疫小队'} ${growth.cells?.length??0} 体 · ${Math.max(0,beacon.until-state.elapsed).toFixed(1)}s`
      :hasBeacon&&growth.beaconReadyAt>state.elapsed?`小队再召集 ${Math.ceil(growth.beaconReadyAt-state.elapsed)}s`:'朝敌群按 Q · 部署免疫小队';
    if(hasBeacon&&beacon&&beacon.mode!=='patrol'&&beacon.until>state.elapsed&&growth.beaconReadyAt>state.elapsed)
      document.getElementById('research-hint')!.textContent=`小队 ${growth.cells?.length??0} 体 · ${Math.max(0,beacon.until-state.elapsed).toFixed(1)}s · Q 指挥转向，不续命`;
  }
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
  const draft=state.growth?.draft;
  if(draft?.source==='endless')return `<div class="research-draft-context" data-endless-wave="${draft.endlessWave??0}"><strong>第 ${draft.endlessWave??0} 波 · 精英波联动重配</strong><span>优先补齐已有协议的联动伙伴；三槽内选择新装、进阶或改变取向。新协议入满槽必须替换，原效果会结束。</span><small>免样本、可放弃；不会抵消本波战斗成长。当前草案结束后继续处理已获得的奖励。</small></div>`;
  if(draft?.source!=='research')return '';
  const direction=draft.researchDirection??'general',info=RESEARCH_DIRECTIONS[direction];
  return `<div class="research-draft-context" data-research-direction="${direction}"><strong>研究方向 · ${escape(info.title)}</strong><span>${escape(info.description)} 仍可自由选择本次任意候选。</span><small>本次已消耗 ${GROWTH_BALANCE.researchCost} 样本；放弃草案不会退还。</small></div>`;
}

export function draftOverlay(state: GameState): string | null {
  const growth=state.growth, draft=growth?.draft;if(!growth||!draft)return null;
  const selected=draft.options.find(option=>option.id===draft.selectedOptionId);
  const data=`data-draft="${escape(draft.id)}"`;
  const researchContext=researchDraftContext(state);
  const sourceLabel=draft.source==='xp'?'战斗经验':draft.source==='endless'?'精英波联动重配':`样本研究 · ${RESEARCH_DIRECTIONS[draft.researchDirection??'general'].title}`;
  if(draft.status==='replacing'&&selected) return `<div class="overlay"><section class="modal growth-draft choice-overlay" role="dialog" aria-modal="true" aria-label="替换抗体协议"><div class="eyebrow">替换能力</div><h2>要换掉哪一项？</h2>${researchContext}<p>三个槽位已满。换下的能力会立即失效，装入 ${escape(PROTOCOL_CHOICE_NAMES[selected.protocolId])}。</p><div class="draft-grid">${growth.equipped.map((old,index)=>{
    const info=PROTOCOLS[old.id],rank=protocolRank(old),description=describeProtocol(old.id,old.tuning,rank),copy=protocolChoiceCopy({protocolId:old.id,tuning:old.tuning,rank});
    return `<article class="upgrade-card"><button class="draft-choice replacement choice-select" data-action="draft-replace" ${data} data-option="${escape(selected.id)}" data-slot="${index}" data-previous="${old.id}">${choiceIconMarkup(old.id)}<span class="choice-kind">将失去的能力 · ${RANK_NAMES[rank]}阶</span><h3>${escape(PROTOCOL_CHOICE_NAMES[old.id])}</h3><p class="choice-summary">${escape(copy.summary)}</p><p class="choice-caution">替换后不再生效</p><strong class="choice-commit">换下此项，装入${escape(PROTOCOL_CHOICE_NAMES[selected.protocolId])} ↗</strong></button><details class="upgrade-details"><summary aria-label="${escape(info.name)}的替换详情">查看将失去的效果</summary><p>${escape(description.effect)}</p><p>${escape(description.cost)}</p></details></article>`;
  }).join('')}</div><div class="actions"><button data-action="draft-back" ${data}>重新查看候选</button><button class="quiet" data-action="draft-discard" ${data}>放弃本次草案</button>${growthDetailsEntryMarkup}</div><div class="seed">战场已暂停</div></section></div>`;
  return `<div class="overlay"><section class="modal growth-draft choice-overlay" role="dialog" aria-modal="true" aria-label="抗体协议草案"><div class="eyebrow">${sourceLabel}</div><h2>选一项，让自己更强。</h2><p>三选一 · 最多装备三种能力 · 选择期间暂停${draft.source==='research'?' · 本次研究已消耗样本，放弃不会退还':''}</p>${researchContext}<div class="draft-grid">${draft.options.map(option=>{
    const current=growth.equipped.find(item=>item.id===option.protocolId),rank=option.rank??1,upgrading=!!current&&rank>protocolRank(current),copy=protocolChoiceCopy(option,current);
    const kind=upgrading?`进阶 · ${RANK_NAMES[protocolRank(current)]} → ${RANK_NAMES[rank]}`:current?`调整为${TUNING_NAMES[option.tuning]}`:`新能力 · ${RANK_NAMES[rank]}阶`;
    return `<article class="upgrade-card"><button class="draft-choice choice-select" data-action="draft-option" ${data} data-option="${escape(option.id)}">${choiceIconMarkup(option.protocolId)}<span class="choice-kind">${kind}</span><h3>${escape(PROTOCOL_CHOICE_NAMES[option.protocolId])}</h3><p class="choice-summary">${escape(copy.summary)}</p>${copy.change?`<p class="draft-change choice-change">${escape(copy.change)}</p>`:''}<p class="draft-action choice-action">${escape(copy.action)}</p><p class="choice-caution">${escape(copy.caution)}</p><strong class="choice-commit">${upgrading?'选择并进阶':current?'选择此取向':growth.equipped.length>=GROWTH_BALANCE.slots?'选择并替换一项':'选择此能力'} ↗</strong></button><details class="upgrade-details"><summary aria-label="${escape(PROTOCOLS[option.protocolId].name)}的数值与限制">查看数值与限制</summary><p><b>${escape(option.title)}</b></p><p>${escape(option.change??option.effect)}</p><p class="draft-effect">${escape(option.effect)}</p><p class="draft-cost"><b>取舍：</b>${escape(option.cost)}</p><p>${escape(option.actionHint??option.trigger)}</p></details></article>`;
  }).join('')}</div><div class="draft-current">已装备：${growth.equipped.map(item=>`${PROTOCOL_CHOICE_NAMES[item.id]} ${RANK_NAMES[protocolRank(item)]}`).join(' / ')||'暂无 · Q 已可召来一只细胞帮忙'}</div><div class="actions"><button class="quiet" data-action="draft-discard" ${data}>放弃本次草案</button>${growthDetailsEntryMarkup}<button class="quiet" data-action="help">查看作战手册</button></div><div class="seed">战场已暂停 · 详细数值可展开查看</div></section></div>`;
}
