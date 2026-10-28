import { activeImmuneFocusTarget } from '../game/immuneFocus';
import { growthContext } from '../game/growth';
import { TRAITS } from '../game/battleConfig';
import { ENEMY_TACTIC_INFO } from '../game/enemyTacticInfo';
import type { GameState, Target } from '../game/types';

export const immuneFocusStatusMarkup = '<p id="immune-focus-status" class="immune-focus-status" role="status" hidden></p>';

/** Actual active command only; an issued order is not a damage receipt. */
export function immuneFocusView(state: GameState): { target: Target; name: string; seconds: string } | null {
  if (state.phase !== 'playing' && state.phase !== 'paused') return null;
  const beacon = state.growth?.beacon;
  if (!beacon || !state.growth?.cells?.some(cell => cell.beaconId === beacon.id && cell.organId === beacon.organId && cell.until > state.elapsed)) return null;
  const target = activeImmuneFocusTarget(beacon, growthContext(state));
  if (!target || !beacon.focus) return null;
  const trait = target.traits?.[0], role = target.role === 'elite' ? '精英' : target.role === 'source' ? '感染源' : '感染体';
  const name = target.tactic && target.tactic !== 'melee' ? ENEMY_TACTIC_INFO[target.tactic].name : trait ? `${TRAITS[trait].name}${role}` : role;
  return { target, name, seconds: Math.max(0, beacon.focus.until - state.elapsed).toFixed(1) };
}

export function immuneFocusStatus(state: GameState): string {
  const view = immuneFocusView(state);
  return view ? `◎ 围猎 ${view.name} · ${view.seconds}s` : '';
}

export function updateImmuneFocusHud(state: GameState): void {
  const node = document.getElementById('immune-focus-status');
  if (!node) return;
  const text = immuneFocusStatus(state);
  node.hidden = !text;
  if (node.textContent !== text) node.textContent = text;
}
