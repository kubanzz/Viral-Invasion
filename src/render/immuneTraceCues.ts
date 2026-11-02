import { BALANCE, type GameState, type Vec } from '../game/types';
import type { GrowthState } from '../game/growthTypes';
import { immuneLegions } from '../game/immuneLegions';

/** A short acknowledgement of an accepted bite, never a beam from the beacon. */
export const IMMUNE_TRACE_CUE_TICKS = 24;
export interface ImmuneTraceCue {
  cellId: string;
  targetId: string;
  from: Vec;
  to: Vec;
  targetRadius: number;
  progress: number;
}

/** Pure projection of all living local legions' hit evidence; no gameplay writes. */
export function selectImmuneTraceCues(state: GameState, growth: GrowthState | undefined = state.growth): ImmuneTraceCue[] {
  const organ = state.battle?.organId;
  if (!growth || growth.ended || !organ
    || (state.phase !== 'playing' && state.phase !== 'paused')) return [];
  const beacons = new Map(immuneLegions(growth).filter(beacon => beacon.mode !== 'patrol'
    && beacon.organId === organ && beacon.until > state.elapsed).map(beacon => [beacon.id, beacon]));
  const cells = new Map((growth.cells ?? []).filter(cell => beacons.has(cell.beaconId) && cell.organId === organ
    && cell.until > state.elapsed && (cell.hp ?? 1) > 0).map(cell => [cell.id, cell]));
  const cues = new Map<string, { tick: number; cue: ImmuneTraceCue }>();
  for (const event of state.events) {
    const age = state.tick - event.tick;
    if (event.type !== 'PROTOCOL_BEACON_HIT' || event.data.protocolId !== 'IMMUNE_BEACON' || event.data.prioritizedTrace !== true
      || !Number.isInteger(event.tick) || age < 0 || age >= IMMUNE_TRACE_CUE_TICKS || !(Number(event.data.damage) > 0)) continue;
    const cell = cells.get(String(event.data.cellId));
    const beacon = cell && beacons.get(cell.beaconId);
    if (!cell || !beacon || event.data.rootId !== `${cell.id}:bite:${event.tick}` || event.tick * BALANCE.step + 1e-9 < Math.max(cell.born, beacon.born)) continue;
    const target = state.targets.find(item => item.id === event.data.targetId && item.hp > 0);
    const x = event.data.x, y = event.data.y;
    if (!target || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    if ((cues.get(cell.id)?.tick ?? -Infinity) >= event.tick) continue;
    cues.set(cell.id, { tick: event.tick, cue: { cellId: cell.id, targetId: target.id, from: { x, y }, to: { x: target.x, y: target.y }, targetRadius: target.radius, progress: age / IMMUNE_TRACE_CUE_TICKS } });
  }
  return [...cues.values()].map(item => item.cue);
}
