import { activeEliteTacticCycle, createEliteTacticCycle, ELITE_TACTIC_CYCLE_BALANCE } from '../game/eliteTacticCycle';
import { ENEMY_TACTIC_INFO } from '../game/enemyTacticInfo';
import type { EliteTacticCycle } from '../game/enemyTacticsTypes';
import type { GameState, Target } from '../game/types';

export const eliteCycleSequence = (cycle: EliteTacticCycle): string => cycle.tactics.map(tactic => ENEMY_TACTIC_INFO[tactic].name).join(' → ');

/** Read only the host's already announced generation. Never choose a new branch in the HUD. */
export function upcomingEliteCycle(state: GameState): EliteTacticCycle | undefined {
  const e = state.endless;
  if (!e?.eliteWave || e.wave < ELITE_TACTIC_CYCLE_BALANCE.minimumWave) return;
  return createEliteTacticCycle(e.phase === 'warning' ? e.evolution?.pending?.decision.traits ?? e.traits : e.traits);
}

export function eliteCycleForecast(state: GameState): string {
  const cycle = upcomingEliteCycle(state);
  const short = { 'crystal-charge': '冲锋锁向后侧闪', 'fission-burst': '离开双圈落点', 'mimic-corrosion': 'Q打断侵蚀' };
  return cycle ? `首只精英双招：${eliteCycleSequence(cycle)}；${cycle.tactics.map(t => short[t]).join(' / ')}。每招后有恢复窗口。` : '';
}

export function eliteCycleWarningCounters(state: GameState): string[] {
  const cycle = upcomingEliteCycle(state);
  return cycle ? cycle.tactics.map(t => `${ENEMY_TACTIC_INFO[t].name}：${ENEMY_TACTIC_INFO[t].counter}`) : [];
}

/** Next tactic is an intention; only an actual attack plan is a committed warning. */
export function eliteCycleStatus(state: GameState, target: Target): string {
  const cycle = activeEliteTacticCycle(state, target); if (!cycle) return '';
  const next = ENEMY_TACTIC_INFO[cycle.tactics[cycle.index]].name;
  const after = ENEMY_TACTIC_INFO[cycle.tactics[cycle.index === 0 ? 1 : 0]].name;
  if (target.charge) return `锁向冲锋进行中 · 结束后换${after}`;
  if (target.attackPlan && target.attackAt !== undefined) return `${ENEMY_TACTIC_INFO[target.attackPlan.kind].name}前摇 ${Math.max(0, target.attackAt - state.elapsed).toFixed(1)}s · 随后${after}`;
  if ((target.recoverUntil ?? 0) > state.elapsed) return `恢复 ${Math.max(0, target.recoverUntil! - state.elapsed).toFixed(1)}s · 下招${next}`;
  return `待施招：${next}`;
}

export function eliteCycleCounter(state: GameState, target: Target): string {
  const cycle = activeEliteTacticCycle(state, target); if (!cycle) return '';
  const committed = !!(target.attackPlan || target.charge);
  const kind = target.attackPlan?.kind ?? (target.charge ? 'crystal-charge' : cycle.tactics[cycle.index]);
  return `${committed ? '当前反制' : '准备反制'}：${ENEMY_TACTIC_INFO[kind].counter}`;
}
