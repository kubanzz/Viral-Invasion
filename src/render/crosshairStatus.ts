import { distance, normalized, wallHit } from '../actors/collision';
import { TRACTION_BALANCE } from '../game/traction';
import { activeWorld, BALANCE, type GameState, type Vec } from '../game/types';

export type CrosshairStatus = 'in-range' | 'out-of-range' | 'blocked';

/** Geometry feedback only. Cooldowns and whether a repair has a valid tissue
 * target remain separate; the authoritative session decides every action. */
export function crosshairStatus(state: GameState, aim: Vec): CrosshairStatus {
  const gap = distance(state.player, aim);
  const range = state.tool === 2 ? TRACTION_BALANCE.range : BALANCE.range;
  if (!Number.isFinite(gap) || gap > range) return 'out-of-range';
  // Precision fires a ray and can hit a target before a fold, so a fold behind
  // that target must not imply the entire shot will be rejected. Tool 2 and 3
  // instead validate line of sight to the selected point.
  if (state.tool !== 1) {
    const direction = normalized(aim.x - state.player.x, aim.y - state.player.y);
    const hit = wallHit(state.player, direction, gap, activeWorld(state));
    if (hit !== null && hit < gap - 1) return 'blocked';
  }
  return 'in-range';
}
