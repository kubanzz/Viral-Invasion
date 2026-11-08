import { describe, expect, it } from 'vitest';
import artRuntime from '../../.art-generated/art-runtime.json';
import { GameSession } from '../../src/game/session';
import { prepareCampScene } from '../../src/game/campScene';
import { CAMP_DORMITORY_OFFSETS, campLayout } from '../../src/game/campLayout';
import { campFarmPlots } from '../../src/game/campFarm';
import { campLifeBodies, campLifeBodyFrame, campLifeFacilityBounds } from '../../src/render/campLifePresentation';
import { campFacilityFrame, campFacilityPresentationBounds } from '../../src/render/campArt';
import { registeredSpriteBodyBounds, type SourceRegisteredSpriteAsset } from '../../src/render/spriteGeometry';
import { depthSort } from '../../src/render/depthSort';

const assets = artRuntime.assets as unknown as Record<string, SourceRegisteredSpriteAsset>;
function camp() {
  const game = new GameSession(520, { mode: 'endless', territory: true }); game.start();
  prepareCampScene(game.state, true, 'ready', ['warehouse', 'forge', 'shop', 'summon', 'departure', 'farm', 'house']);
  game.state.camp!.farmPlots = [{ planted: true, growth: 0 }, { planted: true, growth: 1 }, { planted: true, growth: 2 }];
  return game.state;
}

describe('walkable camp farm and dormitory compound presentation', () => {
  it('places three real crop clusters on the shared ground beds and keeps the nutrient tank in the fourth cell', () => {
    const state = camp(), before = JSON.stringify(state), bodies = campLifeBodies(state), plots = campFarmPlots(state);
    const crops = bodies.filter(body => body.kind === 'crop'); expect(crops).toHaveLength(9);
    for (const plot of plots) {
      const plants = crops.filter(body => body.plotIndex === plot.index); expect(plants).toHaveLength(3);
      expect(plants.map(plant => ({ x: plant.x - plot.position.x, y: plant.y - plot.position.y })))
        .toEqual([{ x: -34, y: 8 }, { x: 32, y: 12 }, { x: 0, y: 30 }]);
      for (const plant of plants) {
        expect(plant.x).toBeGreaterThanOrEqual(plot.rect.left); expect(plant.x).toBeLessThanOrEqual(plot.rect.right);
        expect(plant.y).toBeGreaterThanOrEqual(plot.rect.top); expect(plant.y).toBeLessThanOrEqual(plot.rect.bottom);
        expect(plant.stage).toBe(plot.status);
      }
    }
    const farm = campLayout(state).facilities.find(facility => facility.id === 'farm')!;
    expect(bodies.find(body => body.kind === 'farm-supply')).toMatchObject({ x: farm.position.x + 90, y: farm.position.y + 80, logicalWidth: 90 });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('shows substantial registered plants whose stages grow without alpha-based rescaling', () => {
    const state = camp(), bodies = campLifeBodies(state), stageHeights: number[] = [];
    for (const stage of ['seed', 'grow', 'ripe'] as const) {
      const body = bodies.find(item => item.stage === stage)!, frame = campLifeBodyFrame(assets, body)!;
      expect(frame.id).toBe(`sanctum.crop.${stage}`); expect(frame.flipX).toBe(false);
      const bounds = registeredSpriteBodyBounds(frame.layout, body);
      stageHeights.push(bounds.bottom - bounds.top);
      const asset=assets[frame.id],source=asset.sourceSize!,footY=source.height*870/1024;
      expect(source.width).toBeGreaterThan(0);expect(source.height).toBeGreaterThan(0);
      expect(bounds.bottom).toBeCloseTo(body.y*.72+(asset.sourceBounds!.y!+asset.sourceBounds!.height-footY)*body.logicalWidth/source.width+2);
    }
    expect(stageHeights[0]).toBeGreaterThanOrEqual(32); expect(stageHeights[1]).toBeGreaterThan(stageHeights[0]); expect(stageHeights[2]).toBeGreaterThan(stageHeights[1]);
    expect(stageHeights[2]).toBeLessThan(92);
  });

  it('creates three independently sorted houses using the exact collision anchors and avoids duplicate station sprites', () => {
    const state = camp(), house = campLayout(state).facilities.find(site => site.id === 'house')!;
    const houses = campLifeBodies(state).filter(body => body.kind === 'house'); expect(houses).toHaveLength(3);
    for (const [index, definition] of CAMP_DORMITORY_OFFSETS.entries()) expect(houses[index]).toMatchObject({
      id: `camp-life:house:${definition.id}`, x: house.position.x + definition.offset.x, y: house.position.y + definition.offset.y, logicalWidth: definition.logicalWidth });
    const player = { id: 'player', y: house.position.y + 40 };
    expect(depthSort([...houses, player]).map(body => body.id)).toEqual(['camp-life:house:west', 'camp-life:house:east', 'player', 'camp-life:house:south']);
    const bounds = campLifeFacilityBounds(assets, state, house)!;
    for (const body of houses) {
      const sprite = registeredSpriteBodyBounds(campLifeBodyFrame(assets, body)!.layout, body);
      expect(sprite.left).toBeGreaterThanOrEqual(bounds.left); expect(sprite.right).toBeLessThanOrEqual(bounds.right);
      expect(sprite.top).toBeGreaterThanOrEqual(bounds.top); expect(sprite.bottom).toBeLessThanOrEqual(bounds.bottom);
    }
    expect(campFacilityFrame(assets, state, house)).toBeUndefined();
    expect(campFacilityPresentationBounds(assets, state, house)).toEqual(bounds);
  });

  it('includes empty ground beds in the clickable farm envelope and stops drawing harvested plants', () => {
    const state = camp(), farm = campLayout(state).facilities.find(site => site.id === 'farm')!;
    state.camp!.farmPlots = [{ planted: false, growth: 0 }, { planted: false, growth: 0 }, { planted: false, growth: 0 }];
    expect(campLifeBodies(state).filter(body => body.kind === 'crop')).toHaveLength(0);
    const bounds = campFacilityPresentationBounds(assets, state, farm)!;
    for (const plot of campFarmPlots(state)) {
      expect(bounds.left).toBeLessThanOrEqual(plot.rect.left); expect(bounds.right).toBeGreaterThanOrEqual(plot.rect.right);
      expect(bounds.top).toBeLessThanOrEqual(plot.rect.top * .72); expect(bounds.bottom).toBeGreaterThanOrEqual(plot.rect.bottom * .72);
    }
    expect(campFacilityFrame(assets, state, farm)).toBeUndefined();
    state.camp!.builtFacilities = state.camp!.builtFacilities!.filter(id => id !== 'farm' && id !== 'house');
    expect(campLifeBodies(state)).toEqual([]);
  });
});
