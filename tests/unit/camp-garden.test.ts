import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { prepareCampScene } from '../../src/game/campScene';
import { campLayout, isCampPositionLegal } from '../../src/game/campLayout';
import { advanceCampFarmSeeding, CAMP_FARM_RULES, campCropAction, campFarmPlots, cancelCampFarmSeeding, nearbyCampPlot, startCampFarmSeeding } from '../../src/game/campFarm';
import { Camera } from '../../src/render/camera';
import { campGardenScreenPlots, hitCampGardenPlot } from '../../src/render/campFarmVisuals';

function garden() {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  prepareCampScene(game.state, true, 'ready', ['warehouse', 'forge', 'shop', 'summon', 'departure', 'farm', 'house']);
  game.state.camp!.farmPlots = [{ planted: false, growth: 0 }, { planted: true, growth: 1 }, { planted: true, growth: 2 }];
  return game.state;
}
describe('walkable world crop beds', () => {
  it('uses three persisted stages and three separate reachable beds, with real proximity', () => {
    const state = garden(), plots = campFarmPlots(state);
    expect(plots.map(plot => plot.status)).toEqual(['empty', 'grow', 'ripe']);
    expect(nearbyCampPlot(state)).toBeUndefined();
    for (const plot of plots) {
      expect(isCampPositionLegal(plot.interactionPosition, state.player.radius, campLayout(state))).toBe(true);
      Object.assign(state.player, plot.interactionPosition);
      expect(nearbyCampPlot(state)?.index).toBe(plot.index);
    }
    state.camp!.builtFacilities = ['warehouse', 'forge', 'shop', 'summon', 'departure'];
    expect(campFarmPlots(state)).toEqual([]);
  });
  it('requires a complete nearby sowing action and returns one commit only', () => {
    const state = garden(), plot = campFarmPlots(state)[0];
    expect(startCampFarmSeeding(state, 0)).toBe(false);
    Object.assign(state.player, plot.interactionPosition);
    expect(startCampFarmSeeding(state, 0)).toBe(true);
    expect(startCampFarmSeeding(state, 0)).toBe(false);
    state.elapsed = 1.49;
    expect(campFarmPlots(state)[0].sowProgress).toBeCloseTo(1.49 / 1.5);
    expect(advanceCampFarmSeeding(state)).toBeUndefined();
    expect(state.camp!.farmPlots![0].planted).toBe(false);
    state.elapsed = CAMP_FARM_RULES.sowSeconds;
    expect(advanceCampFarmSeeding(state)).toEqual({ index: 0, completed: true, cancelled: false });
    expect(advanceCampFarmSeeding(state)).toBeUndefined();
    expect(state.camp!.farmPlots![0].planted).toBe(false);
  });
  it('cancels a sowing gesture before completion if the player walks away', () => {
    const state = garden(); Object.assign(state.player, campFarmPlots(state)[0].interactionPosition);
    startCampFarmSeeding(state, 0); state.elapsed = 1.6; state.player.x += 400;
    expect(advanceCampFarmSeeding(state)).toEqual({ index: 0, completed: false, cancelled: true });
    expect(state.camp!.farmAction).toBeUndefined();
    expect(state.camp!.farmPlots![0].planted).toBe(false);
    expect(state.camp!.cropFeedback?.kind).toBe('cancel');
  });
  it('freezes while paused, cancels on an explicit leave and exposes care countdowns', () => {
    const state = garden(); Object.assign(state.player, campFarmPlots(state)[0].interactionPosition);
    startCampFarmSeeding(state, 0); state.phase = 'paused';
    expect(advanceCampFarmSeeding(state)).toBeUndefined();
    expect(state.camp!.farmAction).toBeDefined(); cancelCampFarmSeeding(state);
    expect(state.camp!.farmAction).toBeUndefined();
    const growing = campFarmPlots(state)[1];
    expect(growing).toMatchObject({ grownSeconds: 75, remainingSeconds: 75, action: 'water', waterAvailable: true, pestsAvailable: true });
    expect(campCropAction(growing)).toContain('1:15');
    state.camp!.farmPlots![1].watered = true;
    expect(campFarmPlots(state)[1].action).toBe('pests');
  });
  it('preserves projected crop-body and label targeting even for a distant, ineligible click', () => {
    const state = garden(), camera = new Camera(844, 390), plots = campGardenScreenPlots(state, camera);
    const chosen = plots[2], center = { x: (chosen.body.left + chosen.body.right) / 2, y: (chosen.body.top + chosen.body.bottom) / 2 };
    expect(hitCampGardenPlot(plots, center)).toMatchObject({ index: 2, eligible: false });
    const labelled = campGardenScreenPlots(state, camera, [{ id: 'camp-crop:1', rect: { left: 5, top: 5, right: 60, bottom: 30 } }]);
    expect(hitCampGardenPlot(labelled, { x: 10, y: 12 })?.index).toBe(1);
    expect(hitCampGardenPlot(plots, { x: -10000, y: -10000 })).toBeUndefined();
  });
});
