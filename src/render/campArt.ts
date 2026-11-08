import type { CampFacility } from '../game/campLayout';
import type { GameState } from '../game/types';
import { sourceRegisteredSpriteFrame } from './expeditionArt';
import { sourceRegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from './spriteGeometry';
import type { CombatFrame } from './smartVirusVisuals';
import { CAMP_VISUAL_SIZES } from './campVisuals';
import { campLifeFacilityBounds } from './campLifePresentation';
import { registeredSpriteBodyBounds } from './spriteGeometry';

export const CAMP_FORGE_ART_ID = 'fantasy.camp.forge.fixed.ready.00';
export const MICROFRONT_CAMP_ART_IDS: Readonly<Record<CampFacility['id'], string>> = {
  warehouse: 'microfront.camp.warehouse', forge: 'microfront.camp.forge', shop: 'microfront.camp.shop',
  departure: 'microfront.camp.departure', summon: 'microfront.camp.summon',
  farm: 'microfront.camp.farm', house: 'microfront.camp.house',
};
/** The small nonblocking beacon must remain visible at its interaction point. */
export function campFacilityOpacity(station: Pick<CampFacility, 'id'>, covered: boolean): number {
  return station.id === 'summon' ? 1 : covered ? .28 : 1;
}
export function campFacilityFrame(assets: Readonly<Record<string, SourceRegisteredSpriteAsset>>, state: GameState, station: CampFacility): CombatFrame | undefined {
  // These services are represented by independently depth-sorted compound bodies.
  if (station.id === 'farm' || station.id === 'house') return undefined;
  const microId = MICROFRONT_CAMP_ART_IDS[station.id], micro = assets[microId];
  if (micro) {
    const canvas = station.id === 'summon' && micro.sourceSize ? micro.sourceSize : { width: 1024, height: 1024 };
    // The node's ground anchor is authored in art-sync's pivotSource. Recover
    // that registration after trimming rather than assuming a house's foot.
    const source = micro.sourceBounds, visible = micro.visibleBounds;
    const anchor = station.id === 'summon' && source && typeof source.x === 'number' && typeof source.y === 'number' && typeof source.width === 'number'
      ? { x: source.x + (micro.pivot.x * micro.width - visible.x) * source.width / visible.width,
        y: source.y + (micro.pivot.y * micro.height - visible.y) * source.height / visible.height }
      : { x: 512, y: 870.4 };
    const layout = sourceRegisteredSpriteLayout(micro, canvas, anchor, station.logicalWidth / canvas.width);
    if (layout) return { id: microId, layout, flipX: false };
  }
  if (station.id === 'summon') return undefined;
  if (station.id === 'forge') {
    const asset = assets[CAMP_FORGE_ART_ID];
    if (asset) {
      const layout = sourceRegisteredSpriteLayout(asset, { width: 512, height: 512 }, { x: 256, y: 435.2 }, station.logicalWidth / 512);
      if (layout) return { id: CAMP_FORGE_ART_ID, layout, flipX: false };
    }
  }
  const identity = ({ warehouse: 'campTentWarehouse', forge: 'campForge', shop: 'campSupply', departure: 'campSortie' } as const)[station.id];
  return sourceRegisteredSpriteFrame(assets, identity, 'ready', state.elapsed, {
    logicalWidth: CAMP_VISUAL_SIZES.stationWidths[station.id],
  });
}
/** Shared visible service envelope for labels and click-to-approach. */
export function campFacilityPresentationBounds(assets: Readonly<Record<string, SourceRegisteredSpriteAsset>>, state: GameState, station: CampFacility) {
  if (station.id === 'farm' || station.id === 'house') return campLifeFacilityBounds(assets, state, station);
  const frame = campFacilityFrame(assets, state, station);
  return frame ? registeredSpriteBodyBounds(frame.layout, station.position, frame.flipX, 0) : undefined;
}
