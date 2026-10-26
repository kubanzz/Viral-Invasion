import type { GameState } from '../game/types';
import { describeProtocol, GROWTH_BALANCE, PROTOCOLS, TUNING_NAMES } from '../game/protocols';

const escape = (value: string) => value.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const growthHudMarkup = `<aside class="growth-panel"><div class="growth-heading"><span>抗体构筑</span><b id="growth-research">样本 0</b></div><div class="xp-label" id="growth-xp"></div><div class="meter"><i id="xp-meter"></i></div><div id="protocol-slots" class="protocol-slots"></div><p id="research-hint">靠近研究台 E · ${GROWTH_BALANCE.researchCost} 样本 / 草案</p></aside>`;
export const growthHelpMarkup = `<p><b>抗体构筑：</b>清除感染源、击败精英、首次诊断与有效保护组织可获得经验和样本。经验达标时三选一；靠近左下研究台按 E，可花 ${GROWTH_BALANCE.researchCost} 样本研究。共 ${GROWTH_BALANCE.slots} 槽，槽满后选择替换或放弃。草案期间模拟暂停。</p><p><b>组合打法：</b>共振裂解需要靠近装置、配合冲流相位命中；与连锁净化搭配，破绽目标清除可增加一跳，总计最多 3 跳。异常显影让 Q 留下减速轨迹，免疫灯塔会优先清理标记目标；灯塔也会让当前组织承压。具体距离、时限与代价可在草案和配装提示中查看。</p>`;
export function growthHistoryMarkup(state: GameState): string {
  const growth=state.growth;if(!growth)return '';
  return `<div class="trait-history"><article><h3>抗体路线</h3><p>${growth.equipped.map(p=>`${PROTOCOLS[p.id].symbol} ${PROTOCOLS[p.id].name} · ${TUNING_NAMES[p.tuning]}`).join(' → ')||'无协议构筑'}</p><p>经验 ${growth.xp} · 样本 ${growth.research} · 研究阶 ${growth.level}</p></article></div><ol class="event-history">${growth.protocolHistory.slice().reverse().map(item=>`<li><time>${Math.floor(item.at/60).toString().padStart(2,'0')}:${Math.floor(item.at%60).toString().padStart(2,'0')}</time><span>${escape(item.text)}</span></li>`).join('')}</ol>`;
}

export function updateGrowthHud(state: GameState): void {
  const growth=state.growth;if(!growth)return;
  document.getElementById('growth-research')!.textContent=`样本 ${growth.research}`;
  document.getElementById('growth-xp')!.textContent=`研究阶 ${growth.level} · 经验 ${growth.xp}${growth.nextXp===null?' / 已达本局上限':` / ${growth.nextXp}`}`;
  document.getElementById('xp-meter')!.style.width=`${growth.nextXp===null?100:Math.min(100,growth.xp/growth.nextXp*100)}%`;
  document.getElementById('protocol-slots')!.innerHTML=Array.from({length:GROWTH_BALANCE.slots},(_,i)=>{
    const equipped=growth.equipped[i];if(!equipped)return `<div class="protocol-slot empty"><span>${i+1}</span> 空协议槽</div>`;
    const protocol=PROTOCOLS[equipped.id], description=describeProtocol(equipped.id,equipped.tuning);
    return `<div class="protocol-slot" title="${escape(`${protocol.trigger}。${description.effect} ${description.cost}`)}"><span>${protocol.symbol}</span><b>${protocol.name}</b><small>${TUNING_NAMES[equipped.tuning]}</small></div>`;
  }).join('');
  const beacon=growth.beacon;
  document.getElementById('research-hint')!.textContent=beacon&&beacon.until>state.elapsed?`免疫灯塔 ${Math.max(0,beacon.until-state.elapsed).toFixed(1)}s · Q 扫描召集`:`研究台 E · ${GROWTH_BALANCE.researchCost} 样本 / 草案`;
}

export function draftOverlay(state: GameState): string | null {
  const growth=state.growth, draft=growth?.draft;if(!growth||!draft)return null;
  const selected=draft.options.find(option=>option.id===draft.selectedOptionId);
  const data=`data-draft="${escape(draft.id)}"`;
  if(draft.status==='replacing'&&selected) return `<div class="overlay"><section class="modal growth-draft" role="dialog" aria-modal="true" aria-label="替换抗体协议"><div class="eyebrow">THREE SLOTS / 构筑取舍</div><h2>为${escape(PROTOCOLS[selected.protocolId].name)}腾出一席。</h2><p>三个槽位已满。选择替换一个协议，其效果会立即结束；或放弃本次草案。</p><div class="draft-grid">${growth.equipped.map((old,index)=>`<button class="draft-choice replacement" data-action="draft-replace" ${data} data-option="${escape(selected.id)}" data-slot="${index}" data-previous="${old.id}"><span class="protocol-symbol">${PROTOCOLS[old.id].symbol}</span><h3>替换 ${PROTOCOLS[old.id].name}</h3><p>失去：${escape(describeProtocol(old.id,old.tuning).effect)}</p><strong>装入 ${escape(selected.title)} ↗</strong></button>`).join('')}</div><div class="actions"><button data-action="draft-back" ${data}>重新查看候选</button><button class="quiet" data-action="draft-discard" ${data}>放弃本次草案</button></div><div class="seed">模拟已暂停 · 选择不会消耗战场时间</div></section></div>`;
  return `<div class="overlay"><section class="modal growth-draft" role="dialog" aria-modal="true" aria-label="抗体协议草案"><div class="eyebrow">ANTIBODY DRAFT / ${draft.source==='xp'?'战斗经验':'样本研究'}</div><h2>你的下一次进化。</h2><p>选择一项协议，让行动产生新的连锁。${draft.source==='research'?'本次研究已消耗样本，放弃不会退还。':'经验来自有效净化、首次诊断与组织保护。'}</p><div class="draft-grid">${draft.options.map(option=>`<button class="draft-choice" data-action="draft-option" ${data} data-option="${escape(option.id)}"><span class="protocol-symbol">${PROTOCOLS[option.protocolId].symbol}</span><h3>${escape(option.title)}</h3><div class="draft-tags">${option.tags.map(tag=>`<span>${tag}</span>`).join('')}</div><p><b>触发</b>${escape(option.trigger)}</p><p class="draft-effect">${escape(option.effect)}</p><p class="draft-cost"><b>取舍</b>${escape(option.cost)}</p><strong>${option.kind==='retune'?'校准当前协议':'选择此协议'} ↗</strong></button>`).join('')}</div><div class="draft-current">当前配装：${growth.equipped.map(item=>`${PROTOCOLS[item.id].name} · ${TUNING_NAMES[item.tuning]}`).join(' / ')||'暂无协议，基础工具始终可用'}</div><div class="actions"><button class="quiet" data-action="draft-discard" ${data}>放弃本次草案</button><button class="quiet" data-action="help">查看作战手册</button></div><div class="seed">模拟已暂停 · 选择不会消耗战场时间</div></section></div>`;
}
