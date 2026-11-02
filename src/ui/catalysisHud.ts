import { activeCatalysisTargets } from '../game/catalysis';
import type { EndlessCombatStats } from '../game/endlessGrowthTypes';
import type { GameState } from '../game/types';

export const catalysisStatusMarkup = '<p id="catalysis-status" class="catalysis-status" role="status" hidden></p>';

export function catalysisView(state: GameState) {
  if (state.endless) return null;
  const targets = activeCatalysisTargets(state), batch = state.endlessGrowth?.pendingCatalysis;
  return targets.length && batch ? { targets, batch, seconds: Math.max(0, batch.until - state.elapsed).toFixed(1) } : null;
}

/** A prepared batch is an opportunity, never a hit or damage receipt. */
export function catalysisStatus(state: GameState): string {
  if (state.endless) return '';
  const view = catalysisView(state);
  return view ? `△ 催化 ${view.targets.length}体 · ${view.seconds}s · 1/细胞引爆` : '';
}

export function catalysisToolCopy(stats: EndlessCombatStats | undefined): { title: string; short: string; detail: string } | null {
  if (!stats || stats.catalysisDamage <= 0) return null;
  return { title: '净化余震', short: '主爆不减伤 · 0.35秒后余震',
    detail: '净化能量炮保持完整爆炸伤害，0.35秒后在原爆心追加一次75%半径、40%伤害的净化余震；余震不会递归产生余震或协议攻击。' };
}

export function updateCatalysisHud(state: GameState): void {
  const node = document.getElementById('catalysis-status'); if (!node) return;
  const text = catalysisStatus(state); node.hidden = !text;
  if (node.textContent !== text) node.textContent = text;
}
