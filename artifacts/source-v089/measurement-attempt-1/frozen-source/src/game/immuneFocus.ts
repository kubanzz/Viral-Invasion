import { distance, isLegalPosition } from '../actors/collision';
import type { BeaconState, GrowthContext } from './growthTypes';
import { GROWTH_BALANCE } from './protocols';
import type { Target } from './types';

export const IMMUNE_FOCUS_BALANCE = { duration: 3, aimTolerance: 12, range: GROWTH_BALANCE.scanRadius } as const;

function inSquadRegion(target: Target, beacon: BeaconState, context: GrowthContext): boolean {
  return target.role !== 'core' && Number.isFinite(target.hp) && target.hp > 0
    && !!target.id && Number.isFinite(target.x) && Number.isFinite(target.y)
    && Number.isFinite(target.radius) && target.radius > 0
    && isLegalPosition(target, target.radius, context.geometry)
    // A deliberate challenge command may pursue a distant support from the
    // existing squad position. This changes neither the deployment anchor nor
    // collision/route checks, and ordinary automatic acquisition stays local.
    && (context.endless && beacon.mode === 'protocol'
      ? distance(context.player, target) <= IMMUNE_FOCUS_BALANCE.range + 1e-7
      : distance(beacon, target) <= beacon.radius + target.radius + 1e-7);
}

function activeBeacon(beacon: BeaconState | null | undefined, context: GrowthContext): beacon is BeaconState {
  return !!beacon && beacon.organId === context.organId && Number.isFinite(context.elapsed)
    && Number.isFinite(beacon.until) && beacon.until > context.elapsed
    && Number.isFinite(beacon.radius) && beacon.radius >= 0
    && Number.isFinite(beacon.x) && Number.isFinite(beacon.y);
}

/** Ground-space hit test only. The physical units still own pursuit and contact. */
export function selectImmuneFocusTarget(context: GrowthContext, beacon: BeaconState | null | undefined): Target | undefined {
  if (!context.active || !activeBeacon(beacon, context)
    || !Number.isFinite(context.aim.x) || !Number.isFinite(context.aim.y)) return;
  return context.targets.filter(target => inSquadRegion(target, beacon, context)
    && distance(context.player, target) <= IMMUNE_FOCUS_BALANCE.range + 1e-7
    && distance(context.aim, target) <= target.radius + IMMUNE_FOCUS_BALANCE.aimTolerance + 1e-7)
    .sort((a, b) => distance(context.aim, a) - distance(context.aim, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/** Pure validity shared by simulation and paused HUDs; no wall clock or mutation. */
export function activeImmuneFocusTarget(beacon: BeaconState | null | undefined, context: GrowthContext): Target | undefined {
  if (!activeBeacon(beacon, context) || !beacon.focus || !Number.isFinite(beacon.focus.until)
    || beacon.focus.until <= context.elapsed) return;
  return context.targets.find(target => target.id === beacon.focus!.targetId && inSquadRegion(target, beacon, context));
}
