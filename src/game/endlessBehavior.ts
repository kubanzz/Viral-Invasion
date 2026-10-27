import { recordBehavior } from './evolution';
import type { BehaviorBin, BehaviorEvent } from './evolutionTypes';
import type { GameEvent } from './types';

const positiveFinite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Observe accepted basic/active attacks, diagnosis and manual repairs only.
 * Protocol damage is deliberately outside this limited strategy model.
 */
export function recordEndlessBehavior(history: readonly BehaviorBin[], event: GameEvent, nowTick: number): BehaviorBin[] {
  const data = event.data;
  let behavior: BehaviorEvent | undefined;
  if (event.type === 'TARGET_HIT' && positiveFinite(data.damage)) {
    if (data.cause === 'basic' && data.tool === 1) behavior = { tick: event.tick, kind: 'precisionDamage', amount: data.damage };
    else if (data.cause === 'basic' && data.tool === 2) behavior = { tick: event.tick, kind: 'areaDamage', amount: data.damage };
    else if (data.cause === 'ability' && (data.ability === 'nova' || data.ability === 'scan' || data.ability === 'dash' || data.ability === 'catalysis')) {
      behavior = { tick: event.tick, kind: 'areaDamage', amount: data.damage };
    }
  } else if (event.type === 'SCAN_COMPLETED' && positiveFinite(data.found) && Number.isSafeInteger(data.found)) {
    behavior = { tick: event.tick, kind: 'scan' };
  } else if (event.type === 'ORGAN_INTEGRITY_CHANGED' && data.reason === 'repair'
    && typeof data.before === 'number' && Number.isFinite(data.before)
    && typeof data.after === 'number' && Number.isFinite(data.after)) {
    const repaired = data.after - data.before;
    if (positiveFinite(repaired)) behavior = { tick: event.tick, kind: 'repair', amount: repaired };
  }
  // Even an ignored event advances the 90-second window without inventing evidence.
  return recordBehavior(history, behavior ?? { tick: nowTick, kind: 'precisionDamage', amount: 0 }, nowTick);
}
