import type { GameState } from '../game/types';

export const legionHudMarkup = `<div class="legion-command"><p id="legion-status" role="status"></p><button data-action="antibody" id="antibody-use" title="消耗1支：存活军团裂变一次，生命减少三分之一；8秒内移速+40%、攻击+50%，病毒优先攻击军团"><kbd>R</kbd> <span id="antibody-action-label">注射抗体</span> <b id="antibody-charges">2</b></button><small id="antibody-status">裂变 · 扣血 1/3 · 强化 8 秒</small></div>`;

export function legionView(state: GameState) {
  const growth = state.growth, organ = state.battle?.organId;
  const cells = (growth?.cells ?? []).filter(cell => cell.until > state.elapsed && (cell.hp ?? 1) > 0);
  const local = cells.filter(cell => cell.organId === organ);
  const squads = new Set(cells.map(cell => cell.beaconId)).size;
  const until = Math.max(0, ...cells.map(cell => cell.antibodyUntil ?? 0));
  const charges = growth?.antibodyCharges ?? 0;
  const seraph = local.some(cell => cell.legionId === 'seraph');
  const hungry = local.some(cell => cell.fed === false);
  const qHint = seraph ? '集火合击 / 空地驻防' : state.territory ? squads < 2 ? '脚下驻防' : '调最近团到脚下' : squads < 2 ? '部署 / 指挥' : '指挥';
  return { squads, count: local.length, charges, boosted: until > state.elapsed,
    enabled: state.phase === 'playing' && charges > 0 && cells.length > 0 && until <= state.elapsed,
    seraph, qHint, antibodyLabel: seraph ? '曜卫残像' : '注射抗体',
    antibodyTitle: seraph ? '消耗1支：存活曜卫分出同兵种残像协同进攻，生命减少三分之一；强化8秒，本体与残像共享圣裁追击。' : '消耗1支：存活军团裂变一次，生命减少三分之一；8秒内移速+40%、攻击+50%，病毒优先攻击军团',
    status: `军团 ${squads}/2 · 当前 ${local.length} 体${seraph?' · 曜卫三兵种':''}${hungry?' · 缺粮虚弱':''} · Q ${qHint}`,
    hint: until > state.elapsed ? `强化 ${(until - state.elapsed).toFixed(1)} 秒${seraph?' · 残像协同':' · 病毒优先攻击军团'}`
      : charges ? seraph ? '同兵种残像 · 扣血 1/3 · 强化 8 秒' : '裂变 · 扣血 1/3 · 强化 8 秒' : '本局抗体已用完' };
}

export function updateLegionHud(state: GameState): void {
  const status = document.getElementById('legion-status'), button = document.getElementById('antibody-use') as HTMLButtonElement | null;
  if (!status || !button) return;
  const view = legionView(state);
  status.textContent = view.status; button.disabled = !view.enabled; button.title = view.antibodyTitle;
  const label = document.getElementById('antibody-action-label'); if (label) label.textContent = view.antibodyLabel;
  document.getElementById('antibody-charges')!.textContent = String(view.charges);
  document.getElementById('antibody-status')!.textContent = view.hint;
}
