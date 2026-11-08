import type { GameEvent, GameState } from './types';

export const ANCHOR_ALERT_SECONDS = 2;
const attackReasons = new Set(['enemy-attack', 'core-corrosion', 'core-crystal-sweep', 'core-fission-burst']);

/** Only accepted enemy damage receipts count; ambient erosion and player costs do not. */
export function isAnchorAttackDamage(state: GameState, event: GameEvent): boolean {
  const { before, after, organId, reason } = event.data;
  return !!state.territory && !state.camp && event.type === 'ORGAN_INTEGRITY_CHANGED' && organId === 'heart'
    && typeof before === 'number' && Number.isFinite(before) && typeof after === 'number' && Number.isFinite(after)
    && after < before && attackReasons.has(String(reason));
}

/** Shared by the map, directional warning, vitals and sound. Never treats proximity as an attack. */
export function anchorDangerView(state: GameState) {
  const active = !!state.territory && !state.camp && ['playing', 'paused'].includes(state.phase);
  const attackerIds = active ? state.targets.filter(target => target.hp > 0 && target.attackTarget === 'tissue'
    && Number.isFinite(target.attackAt) && target.attackAt! > state.elapsed).map(target => target.id) : [];
  const at = state.territory?.coreLastHitAt;
  const hitAge = at === undefined ? Infinity : state.elapsed - at;
  const attacked = active && (attackerIds.length > 0 || hitAge >= 0 && hitAge < ANCHOR_ALERT_SECONDS);
  return { attacked, critical: active && !!state.tissue && state.tissue.hp / state.tissue.maxHp <= .3, hitAge, attackerIds };
}
