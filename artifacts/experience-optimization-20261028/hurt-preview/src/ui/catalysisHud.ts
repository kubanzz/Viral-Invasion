import { activeCatalysisTargets, CATALYSIS_BALANCE } from '../game/catalysis';
import type { EndlessCombatStats } from '../game/endlessGrowthTypes';
import type { GameState } from '../game/types';

export const catalysisStatusMarkup = '<p id="catalysis-status" class="catalysis-status" role="status" hidden></p>';

export function catalysisView(state: GameState) {
  const targets = activeCatalysisTargets(state), batch = state.endlessGrowth?.pendingCatalysis;
  return targets.length && batch ? { targets, batch, seconds: Math.max(0, batch.until - state.elapsed).toFixed(1) } : null;
}

/** A prepared batch is an opportunity, never a hit or damage receipt. */
export function catalysisStatus(state: GameState): string {
  const view = catalysisView(state);
  return view ? `△ 催化 ${view.targets.length}体 · ${view.seconds}s · 1/细胞引爆` : '';
}

export function catalysisToolCopy(stats: EndlessCombatStats | undefined): { title: string; short: string; detail: string } | null {
  if (!stats || stats.catalysisDamage <= 0) return null;
  return { title: '催化裂解', short: `直伤≤${CATALYSIS_BALANCE.directDamageCap} · 1/细胞引爆`,
    detail: `工具2保留牵引与导流，普通爆发改为低伤铺标；${CATALYSIS_BALANCE.duration}秒内用1或真实细胞咬击兑现整批一次。爆发半径${CATALYSIS_BALANCE.radius}，最多${CATALYSIS_BALANCE.maximumTargets}体，每体预算${Number(stats.catalysisDamage.toFixed(1))}。有效再铺覆盖旧批，不叠加。` };
}

export function updateCatalysisHud(state: GameState): void {
  const node = document.getElementById('catalysis-status'); if (!node) return;
  const text = catalysisStatus(state); node.hidden = !text;
  if (node.textContent !== text) node.textContent = text;
}
