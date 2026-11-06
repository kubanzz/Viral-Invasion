import type { CampFacility } from '../game/campLayout';
import type { GameState } from '../game/types';
import { sourceRegisteredSpriteFrame } from './expeditionArt';
import { sourceRegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from './spriteGeometry';
import type { CombatFrame } from './smartVirusVisuals';
import { CAMP_VISUAL_SIZES } from './campVisuals';

export const CAMP_FORGE_ART_ID = 'fantasy.camp.forge.fixed.ready.00';
export const MICROFRONT_CAMP_ART_IDS: Readonly<Record<CampFacility['id'], string>> = {
  warehouse: 'microfront.camp.warehouse', forge: 'microfront.camp.forge', shop: 'microfront.camp.shop',
  departure: 'microfront.camp.departure', summon: 'microfront.camp.summon',
};
export function campFacilityFrame(assets: Readonly<Record<string, SourceRegisteredSpriteAsset>>, state: GameState, station: CampFacility): CombatFrame | undefined {
  const microId = MICROFRONT_CAMP_ART_IDS[station.id], micro = assets[microId];
  if (micro) {
    const layout = sourceRegisteredSpriteLayout(micro, { width: 1024, height: 1024 }, { x: 512, y: 870.4 }, station.logicalWidth / 1024);
    if (layout) return { id: microId, layout, flipX: false };
  }
  if (station.id === 'forge') {
    const asset = assets[CAMP_FORGE_ART_ID];
    if (asset) {
      const layout = sourceRegisteredSpriteLayout(asset, { width: 512, height: 512 }, { x: 256, y: 435.2 }, station.logicalWidth / 512);
      if (layout) return { id: CAMP_FORGE_ART_ID, layout, flipX: false };
    }
  }
  const identity = ({ warehouse: 'campTentWarehouse', forge: 'campForge', shop: 'campSupply', departure: 'campSortie', summon: 'campSupply' } as const)[station.id];
  return sourceRegisteredSpriteFrame(assets, identity, 'ready', state.elapsed, {
    logicalWidth: CAMP_VISUAL_SIZES.stationWidths[station.id],
  });
}
