import type { GameState } from '../../src/game/types';
import type { TerritoryLaneId } from '../../src/game/territoryTypes';
import { TERRITORY_LANES } from '../../src/game/territory';
import { summonImmuneCells } from '../../src/game/immuneCells';
import { growthContext } from '../../src/game/growth';
import type { BeaconState } from '../../src/game/growthTypes';

/** Supplied prior-defense fixture for tests of later source/boss transactions.
 * This is not evidence that natural play completed a garrison handoff. */
export function supplyTerritoryDefense(state: GameState, laneIds: readonly TerritoryLaneId[] = ['north', 'south']) {
  for (const lane of TERRITORY_LANES.filter(lane => laneIds.includes(lane.id))) {
    state.territory!.defense[lane.id].repelled = true;
    state.territory!.defense[lane.id].handoff = true;
    const node = state.territory!.nodes.find(node => node.id === lane.frontNodeId)!;
    const id = `fixture:guard:${lane.id}`;
    if (state.growth!.beacons?.some(beacon => beacon.id === id)) continue;
    const beacon: BeaconState = { id, x: node.x, y: node.y, organId: 'heart', born: 0, until: Infinity,
      radius: 300, damage: 48, interval: .8, nextAttackAt: 0, tuning: 'balanced', mode: 'protocol', rank: 3, cellCount: 5,
      guard: { kind: 'territory', regionId: node.id, radius: 300 } };
    state.growth!.beacons = [...state.growth!.beacons ?? [], beacon];
    state.growth!.beacon = beacon;
    state.growth!.cells = [...state.growth!.cells ?? [], ...summonImmuneCells(beacon, growthContext(state), 5)];
  }
}
