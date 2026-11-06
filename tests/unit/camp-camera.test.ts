import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { prepareCampScene } from '../../src/game/campScene';
import { campLayout } from '../../src/game/campLayout';
import { Camera } from '../../src/render/camera';
import { prepareCampCamera } from '../../src/render/campCamera';

function camp() {
  const game = new GameSession(20261105, { mode: 'endless', territory: true }); game.start();
  prepareCampScene(game.state, true); return game.state;
}
describe('camp overview and local framing', () => {
  it('shows all three real yard boundaries and the arrival point on desktop', () => {
    for (const [width, height] of [[1366, 768], [1920, 1080]]) {
      const state = camp(), camera = new Camera(width, height), layout = campLayout(state);
      prepareCampCamera(camera, state, { snap: true }, []);
      for (const yard of layout.courtyards) for (const point of [{ x: yard.rect.left, y: yard.rect.top }, { x: yard.rect.right, y: yard.rect.bottom }, yard.gate.center, layout.spawn]) {
        const screen = camera.worldToScreen(point);
        expect(screen.x).toBeGreaterThan(20); expect(screen.x).toBeLessThan(width - 20);
        expect(screen.y).toBeGreaterThan(68); expect(screen.y).toBeLessThan(height - 18);
      }
    }
  });
  it('keeps a whole player envelope in view while visiting all facilities on short phones', () => {
    for (const [width, height] of [[844, 390], [667, 320]]) {
      const state = camp(), camera = new Camera(width, height), layout = campLayout(state);
      const hud = [{ left: 12, right: width - 12, top: 12, bottom: 70 }];
      for (const point of [layout.spawn, ...layout.facilities.map(f => f.interactionPosition)]) {
        state.player.x = point.x; state.player.y = point.y;
        prepareCampCamera(camera, state, { snap: true }, hud);
        const screen = camera.worldToScreen(state.player);
        expect(screen.x - 38 * camera.scale).toBeGreaterThanOrEqual(12 - 1e-6);
        expect(screen.x + 38 * camera.scale).toBeLessThanOrEqual(width - 12 + 1e-6);
        expect(screen.y - 80 * camera.scale).toBeGreaterThanOrEqual(82 - 1e-6);
        expect(screen.y + 14 * camera.scale).toBeLessThanOrEqual(height - 18 + 1e-6);
        expect(camera.scale).toBeGreaterThanOrEqual(.62);
      }
    }
  });
  it('preserves world-pointer inversion through eased movement and a screen rotation', () => {
    const state = camp(), camera = new Camera(844, 390);
    for (let i = 0; i < 100; i++) {
      state.elapsed += 1 / 60; state.player.x -= 1.2;
      if (i === 50) camera.resize(667, 320);
      prepareCampCamera(camera, state, { deltaSeconds: 1 / 60 }, []);
      const point = { x: state.player.x + 43, y: state.player.y - 26 };
      const roundTrip = camera.screenToWorld(camera.worldToScreen(point));
      expect(roundTrip.x).toBeCloseTo(point.x, 8); expect(roundTrip.y).toBeCloseTo(point.y, 8);
    }
  });
  it('frames planned sites and rear approaches using the building edge instead of its doorway', () => {
    for (const [width, height] of [[844, 390], [667, 320]]) {
      const state = camp(), camera = new Camera(width, height);
      state.camp!.builtFacilities = [];
      const warehouse = campLayout(state).sites.find(site => site.id === 'warehouse')!;
      for (const point of [{ x: warehouse.footprint.left - 22, y: warehouse.position.y },
        { x: warehouse.position.x, y: warehouse.footprint.top - 22 }]) {
        Object.assign(state.player, point);
        prepareCampCamera(camera, state, { snap: true }, [{ left: 12, right: width - 12, top: 12, bottom: 70 }]);
        const player = camera.worldToScreen(state.player), site = camera.worldToScreen(warehouse.position);
        expect(player.x - 38 * camera.scale).toBeGreaterThanOrEqual(12 - 1e-6);
        expect(player.y - 80 * camera.scale).toBeGreaterThanOrEqual(82 - 1e-6);
        expect(site.x - warehouse.logicalWidth * .4 * camera.scale).toBeGreaterThanOrEqual(12 - 1e-6);
        expect(site.y - 171 * camera.scale).toBeGreaterThanOrEqual(82 - 1e-6);
        expect(site.y + 16 * camera.scale).toBeLessThanOrEqual(height - 18 + 1e-6);
      }
    }
  });
});
