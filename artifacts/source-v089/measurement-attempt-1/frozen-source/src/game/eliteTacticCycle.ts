import type { TraitId } from './battleTypes';
import type { EliteTacticCycle, HeavyEnemyTactic } from './enemyTacticsTypes';
import type { GameEvent, GameState, Target } from './types';

export const ELITE_TACTIC_CYCLE_BALANCE = { minimumWave: 20 } as const;
const tactics: Readonly<Record<TraitId, HeavyEnemyTactic>> = {
  CARAPACE: 'crystal-charge', FISSION: 'fission-burst', MIMIC: 'mimic-corrosion',
};
const heavy = (value: unknown): value is HeavyEnemyTactic => Object.values(tactics).some(tactic => tactic === value);

export function createEliteTacticCycle(traits: readonly TraitId[]): EliteTacticCycle | undefined {
  if (traits.length !== 2 || traits[0] === traits[1]) return;
  const first = tactics[traits[0]], second = tactics[traits[1]];
  if (!first || !second) return;
  return { tactics: [first, second], index: 0 };
}

/** Pure scope/shape query. Presentation may inspect paused state without driving the cycle. */
export function activeEliteTacticCycle(state: GameState, target: Target): EliteTacticCycle | undefined {
  const cycle = target.eliteCycle, wave = state.endless?.wave;
  if (!wave || wave < ELITE_TACTIC_CYCLE_BALANCE.minimumWave || wave % 5 !== 0
    || target.role !== 'elite' || (target.generation ?? 0) !== 0 || target.hp <= 0
    || target.sourceId !== `endless:wave:${wave}` || state.phase !== 'playing' && state.phase !== 'paused'
    || !cycle || !Array.isArray(cycle.tactics) || cycle.tactics.length !== 2 || !cycle.tactics.every(heavy) || cycle.tactics[0] === cycle.tactics[1]
    || cycle.index !== 0 && cycle.index !== 1
    || cycle.committedTick !== undefined && (!Number.isSafeInteger(cycle.committedTick) || cycle.committedTick < 0 || cycle.committedTick > state.tick)) return;
  return cycle;
}

/** The previous committed tactic remains stable throughout its windup, travel and recovery. */
export function prepareEliteTactic(state: GameState, target: Target): void {
  const cycle = activeEliteTacticCycle(state, target);
  if (!cycle || state.phase !== 'playing' || target.attackPlan || target.attackAt !== undefined || target.charge
    || target.recoverUntil !== undefined || cycle.committedTick !== undefined) return;
  target.tactic = cycle.tactics[cycle.index];
}

/** Called only after the host accepted the actual frozen plan and concurrency slot. */
export function commitEliteTactic(state: GameState, target: Target): GameEvent['data'] | undefined {
  const cycle = activeEliteTacticCycle(state, target), plan = target.attackPlan;
  if (!cycle || state.phase !== 'playing' || !plan || cycle.committedTick !== undefined
    || plan.kind !== cycle.tactics[cycle.index] || target.tactic !== plan.kind
    || target.attackAt === undefined || target.attackAt <= state.elapsed) return;
  cycle.committedTick = state.tick;
  return { actorId: target.id, tactic: plan.kind, cycleIndex: cycle.index, committedTick: state.tick };
}

/** Remove the one commitment before callbacks. Repeated completion cannot advance a second time. */
export function finishEliteTactic(state: GameState, target: Target, tactic: string, reason: string): GameEvent['data'] | undefined {
  const cycle = activeEliteTacticCycle(state, target);
  if (!cycle || state.phase !== 'playing' || cycle.committedTick === undefined || cycle.tactics[cycle.index] !== tactic) return;
  const committedTick = cycle.committedTick;
  delete cycle.committedTick;
  cycle.index = cycle.index === 0 ? 1 : 0;
  return { actorId: target.id, tactic, nextTactic: cycle.tactics[cycle.index], cycleIndex: cycle.index,
    committedTick, reason, recoverUntil: target.recoverUntil ?? state.elapsed };
}
