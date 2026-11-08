import { distance, isLegalPosition, moveWithCollision } from '../actors/collision';
import type { BeaconState, GrowthContext } from './growthTypes';
import { GROWTH_BALANCE } from './protocols';
import type { Target, Vec } from './types';

export const IMMUNE_FOCUS_BALANCE = { duration: 3, aimTolerance: 12, range: GROWTH_BALANCE.scanRadius } as const;
export const IMMUNE_GUARD_BALANCE = { minimumRank: 3, radius: 300, aimTolerance: 12, commandRange: GROWTH_BALANCE.scanRadius } as const;

/** Pick a healthy node at command time. Existing guards continue after ownership changes. */
export function selectImmuneGuardCommand(context: GrowthContext): { anchor: Vec; guard: NonNullable<BeaconState['guard']> } | undefined {
  if (context.territory) {
    if (!context.endless || !context.active || context.tissue.hp <= 0) return;
    const anchor = moveWithCollision(context.player, { x: 0, y: 0 }, 12, context.geometry);
    if (!isLegalPosition(anchor, 12, context.geometry)) return;
    const node = context.territory.nodes.filter(candidate => candidate.owner === 'healthy'
      && isLegalPosition(candidate, 12, context.geometry)
      && distance(anchor, candidate) <= 150 + 1e-7)
      .sort((a, b) => distance(anchor, a) - distance(anchor, b) || a.id.localeCompare(b.id))[0];
    return { anchor, guard: node ? { kind: 'territory', regionId: node.id, radius: IMMUNE_GUARD_BALANCE.radius }
      : { kind: 'ground', radius: IMMUNE_GUARD_BALANCE.radius } };
  }
  const accepted = !!context.endless && context.active && Number.isSafeInteger(context.immuneRank) && context.immuneRank! >= IMMUNE_GUARD_BALANCE.minimumRank
    && context.tissue.hp > 0 && isLegalPosition(context.tissue, 12, context.geometry)
    && distance(context.player, context.tissue) <= IMMUNE_GUARD_BALANCE.commandRange + 1e-7
    && distance(context.aim, context.tissue) <= context.tissue.radius + IMMUNE_GUARD_BALANCE.aimTolerance + 1e-7;
  return accepted ? { anchor: { x: context.tissue.x, y: context.tissue.y }, guard: { kind: 'tissue', radius: IMMUNE_GUARD_BALANCE.radius } } : undefined;
}

/** Legacy callers only need the acceptance fact. */
export function isImmuneGuardCommand(context: GrowthContext): boolean {
  return !!selectImmuneGuardCommand(context);
}

export function activeImmuneGuard(beacon: BeaconState | null | undefined, context: GrowthContext): boolean {
  if (!context.endless || !activeBeacon(beacon, context) || beacon.constructionTaskId || beacon.mode !== 'protocol'
    || beacon.guard?.radius !== IMMUNE_GUARD_BALANCE.radius || context.tissue.hp <= 0) return false;
  const guard = beacon.guard;
  return guard.kind === 'ground' || guard.kind === 'tissue' || !!context.territory?.nodes.some(node => node.id === guard.regionId);
}

function inSquadRegion(target: Target, beacon: BeaconState, context: GrowthContext): boolean {
  return (target.role !== 'core' || beacon.legionId === 'seraph') && Number.isFinite(target.hp) && target.hp > 0
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
    && !Number.isNaN(beacon.until) && beacon.until > context.elapsed
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
  if (!activeBeacon(beacon, context) || beacon.constructionTaskId || activeImmuneGuard(beacon, context) || !beacon.focus || !Number.isFinite(beacon.focus.until)
    || beacon.focus.until <= context.elapsed) return;
  return context.targets.find(target => target.id === beacon.focus!.targetId && inSquadRegion(target, beacon, context));
}
