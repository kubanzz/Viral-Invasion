import { activeEliteTacticCycle } from '../game/eliteTacticCycle';
import type { GameState } from '../game/types';
import { eliteCycleStatus } from '../ui/eliteTacticCycleHud';
import type { SceneLabelSink } from './sceneLabels';

/** One announced late elite; labels report phase and never advance the simulation. */
export function drawEliteTacticCycles(state: GameState, labels?: SceneLabelSink): void {
  if (!labels) return;
  for (const target of state.targets) {
    if (!activeEliteTacticCycle(state, target)) continue;
    const visible = !target.traits?.includes('MIMIC') || target.attackPlan || target.charge || (target.recoverUntil ?? 0) > state.elapsed
      || (target.revealedUntil ?? 0) > state.elapsed || (target.exposedUntil ?? 0) > state.elapsed || state.scanUntil > state.elapsed
      || state.growth?.marks.some(mark => mark.targetId === target.id && mark.organId === state.battle?.organId && mark.until > state.elapsed);
    if (!visible) continue;
    labels.add({ id: `elite-cycle:${target.id}`, anchor: { x: target.x, y: target.y }, offset: { x: 0, y: -target.radius * 3.4 - 20 },
      priority: 94, essential: true, lines: [{ text: '双招精英', color: '#f4dbc6', size: 11 },
        { text: eliteCycleStatus(state, target), color: '#f4dbc6', size: 10 }] });
  }
}
