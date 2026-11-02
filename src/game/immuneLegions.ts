import type { GrowthState } from './growthTypes';

/** Older saved probes expose one beacon; current runs expose both legions. */
export function immuneLegions(growth: Pick<GrowthState, 'beacon' | 'beacons'> | undefined) {
  return growth?.beacons?.length ? growth.beacons : growth?.beacon ? [growth.beacon] : [];
}
