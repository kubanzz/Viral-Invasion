import type { BeaconState, GrowthContext } from './growthTypes';
import type { LegionDeployment } from './legionCatalog';

/** Slots are frozen by the departure receipt, never read from camp mid-run. */
export function nextLegionDeployment(context: GrowthContext, beacons: readonly BeaconState[]): LegionDeployment | undefined {
  return context.legions?.find(entry => !beacons.some(beacon => beacon.legionSlot === entry.slot));
}

export function configureLegionBeacon(beacon: BeaconState, deployment: LegionDeployment | undefined): void {
  if (!deployment) return;
  beacon.legionId = deployment.legionId; beacon.legionSlot = deployment.slot; beacon.fed = deployment.fed;
  if (deployment.legionId === 'seraph') { beacon.cellCount = 4; beacon.radius += 30; }
}

export function legionCellStats(beacon: BeaconState, index: number, total: number) {
  const rank = beacon.rank ?? 1, fed = beacon.fed === false ? .75 : 1;
  const seraph = beacon.legionId === 'seraph', ranger = beacon.legionId === 'ranger';
  const leader = seraph && index === 0;
  const health = seraph ? leader ? 120 + (rank - 1) * 24 : 72 + (rank - 1) * 12
    : (60 + (rank - 1) * 12) * (ranger ? .9 : 1);
  return { health: health * fed, damage: beacon.damage * (seraph ? 1.8 * (leader ? 1 / 3 : 2 / 9) : (ranger ? 1.25 : 1) / total) * fed,
    seraphRole: seraph ? index === 0 ? 'commander' as const : index === 3 ? 'prism' as const : 'lancer' as const : undefined,
    speed: seraph ? 210 : ranger ? 230 : 190, role: leader ? 'leader' as const : seraph ? 'wing' as const : 'guard' as const };
}
