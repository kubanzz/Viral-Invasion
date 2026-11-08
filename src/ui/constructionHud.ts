import type { GameState, Vec } from '../game/types';
import { BUILDING_DEFINITIONS, constructionPlacementView, type BlueprintId } from '../game/construction';

export const constructionHudMarkup = `<button class="construction-open" data-action="build-open" hidden><kbd>B</kbd> 建造</button><button id="construction-discovery" class="construction-discovery" data-action="build-open" hidden><strong>获得弹射荚蓝图</strong><span>打开建造 · 派军团建立回防支点</span></button><div id="construction-placement" class="construction-placement" hidden></div>`;

/** An actual unlock owns the one-time callout, not an unrelated wave timer. */
export function updateConstructionDiscovery(root: HTMLElement, state: GameState, discovered: boolean): void {
  const visible = discovered && state.phase === 'playing' && !!state.territory && !state.camp
    && !state.weaponCombat?.bladeTrace
    && !state.growth?.draft && !state.endlessGrowth?.draft && state.territory.stage === 'rescue'
    && !state.territory.construction?.building && !state.territory.construction?.task;
  const notice = root.querySelector<HTMLElement>('#construction-discovery');
  if (notice) {
    notice.hidden = !visible;
    if (visible) {
      const origin = root.getBoundingClientRect();
      const panels = [...root.querySelectorAll<HTMLElement>('.territory-hud,.mobile-notice,.mobile-warning-strip')]
        .filter(panel => !panel.hidden && panel.getBoundingClientRect().height > 0);
      const bottom = Math.max(0, ...panels.map(panel => panel.getBoundingClientRect().bottom - origin.top));
      notice.style.top = `${Math.ceil(bottom + 8)}px`;
    }
  }
  root.querySelectorAll<HTMLElement>('.construction-open, .mobile-tactical-menu').forEach(element => {
    element.dataset.newBlueprint = String(visible);
  });
}
const reasons: Record<string,string> = { inactive:'当前无法施工',locked:'先守住一线，取得基础蓝图',supplies:'工程补给不足',task:'先完成或取消当前工地',range:'落点需在身边180范围内',position:'地形受阻，换个位置',infected:'先净化这块组织',node:'与组织节点保持100距离',workers:'先用Q部署至少两名存活细胞' };
export function constructionMenu(state:GameState):string {
  const c=state.territory?.construction;
  return `<div class="overlay"><section class="modal construction-menu" role="dialog" aria-modal="true" aria-label="军团建设"><div class="eyebrow">FIELD ENGINEERING / 军团建设</div><h2>建立机动支点</h2><p>工程补给 ${c?.supplies??2} · 一座现役建筑 · 真实细胞到位后施工6秒</p><p>施工时军团离开防线。Q改派会暂停工地，不会补兵或恢复生命。</p><div class="construction-blueprints">${Object.entries(BUILDING_DEFINITIONS).map(([id,d])=>`<button data-action="build-select" data-blueprint="${id}" ${!c?.availableBlueprints.includes(id as BlueprintId)||!!c.task?'disabled':''}><i class="camp-art" data-camp-art="blueprint-${id}" aria-hidden="true"></i><strong>${d.name}</strong><small>射程${d.range} · 冲击${d.damage} · 装填${d.reloadSeconds}秒</small></button>`).join('')}</div>${!c?.availableBlueprints.length?'<p>首次完整击退一条战线的进攻，保底获得基础蓝图。</p>':''}${c?.task?`<p>当前工地 ${Math.round(c.task.seconds/6*100)}% · 暂停会保留进度</p><div class="actions"><button data-action="build-resume">继续建设</button><button data-action="build-cancel-task">取消工地，退还补给</button></div>`:''}<div class="actions"><button data-action="build-close">返回战场</button></div></section></div>`;
}
export function updateConstructionPlacement(root:HTMLElement,state:GameState,placement?:{blueprintId:BlueprintId;position:Vec}):void {
  root.querySelectorAll<HTMLButtonElement>('[data-action="build-open"]').forEach(button=>{
    button.hidden=!state.territory||!!state.camp||state.phase==='menu'||state.phase==='result'||state.territory.stage==='victory';
  });
  const panel=root.querySelector<HTMLElement>('#construction-placement');if(!panel)return;
  panel.hidden=!placement;
  if(!placement)return;
  const view=constructionPlacementView(state,placement.position,placement.blueprintId);
  const copy=view.valid?'位置可用 · 军团将实际赶来':reasons[view.reason??'']??'请选择健康组织';
  const markup=`<strong>${BUILDING_DEFINITIONS[placement.blueprintId].name}</strong><span>${copy}</span><small>点击地面锁定位置，再确认施工；Enter也可确认</small><div><button data-action="build-confirm" ${view.valid?'':'disabled'}>确认施工</button><button data-action="build-cancel-placement">取消</button></div>`;
  const key=`${placement.blueprintId}:${view.reason??'valid'}`;
  if(panel.dataset.renderKey!==key){panel.innerHTML=markup;panel.dataset.renderKey=key;}
}
