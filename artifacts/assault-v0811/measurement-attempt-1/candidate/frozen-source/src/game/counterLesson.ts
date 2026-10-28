import { BALANCE, type GameEvent, type GameState, type Target } from './types';
import { BATTLE_BALANCE } from './battleConfig';

/** Consume accepted damage only; exposure from an antibody is not pulse proof. */
export function acceptedFirstCounter(state: GameState, event: GameEvent, target: Target): 'rear' | 'pulse' | undefined {
  if (event.type !== 'TARGET_HIT' || event.tick !== state.tick || event.data.cause !== 'basic' || event.data.tool !== 1 || !Number.isFinite(Number(event.data.damage)) || !(Number(event.data.damage) > 0)
    || !target.traits?.includes('CARAPACE') || event.data.id !== target.id) return;
  const incoming = Math.atan2(state.player.y - target.y, state.player.x - target.x);
  if (Math.cos(incoming - (target.facing ?? 0)) <= .2) return 'rear';
  if ((target.exposedUntil ?? 0) <= state.elapsed) return;
  const pulse = state.events.some(item => item.type === 'PULSE_TRIGGERED' && item.tick <= event.tick
    && event.tick * BALANCE.step - item.tick * BALANCE.step < BATTLE_BALANCE.pulseExpose
    && typeof item.data.exposedTargetIds === 'string' && item.data.exposedTargetIds.split(',').includes(target.id));
  if (pulse) return 'pulse';
}
