import type { Vec } from './types';
import type { BeaconState } from './growthTypes';
import type { TerritoryNodeId, TerritorySourceId } from './territoryTypes';

export type BlueprintId = 'launch-pod' | 'rapid-launch-pod';
export const BUILDING_DEFINITIONS = {
  'launch-pod': { name: '基础弹射荚', range: 1100, radius: 240, damage: 260, reloadSeconds: 24 },
  'rapid-launch-pod': { name: '速装弹射荚', range: 800, radius: 200, damage: 220, reloadSeconds: 16 },
} as const;
export interface BuildingInstance extends Vec {
  id: string; blueprintId: BlueprintId; builtAt: number; nodeId: TerritoryNodeId;
}
export type ConstructionPauseReason = 'marching' | 'members' | 'infected' | 'command' | 'inactive';
export interface ConstructionTask extends Vec {
  id: string; blueprintId: BlueprintId; nodeId: TerritoryNodeId; startedAt: number; seconds: number;
  updatedAt: number;
  beaconId: string; pauseReason?: ConstructionPauseReason;
  previousOrder: Pick<BeaconState, 'x' | 'y' | 'guard' | 'focus'>;
}
export interface ConstructionState {
  supplies: number; serial: number; availableBlueprints: BlueprintId[];
  sourceCredits: TerritorySourceId[]; building?: BuildingInstance; task?: ConstructionTask;
}
