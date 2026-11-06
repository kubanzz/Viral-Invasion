import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { advanceCampScene, campStationDistance, campStations, canInteractCampStation, ensureCampPlayerLegal, nearbyCampStation, prepareCampScene } from '../../src/game/campScene';
import { CAMP_COURTYARDS, CAMP_WALL_CORNER_RADIUS, CAMP_WALL_THICKNESS, campInteractionLineClear,
  campLayout, campWallTrace, isCampPositionLegal, type CampStationId } from '../../src/game/campLayout';
import { BALANCE, type GameState, type Vec } from '../../src/game/types';

function camp(introComplete = true): GameState {
  const game = new GameSession(71, { campaign: true, milestone: 'G3', mode: 'endless', territory: true });
  game.start(); prepareCampScene(game.state, introComplete); return game.state;
}
function relative(state: GameState, point: Vec): Vec {
  const origin = campLayout(state).origin; return { x: origin.x + point.x, y: origin.y + point.y };
}
function setPlayer(state: GameState, point: Vec): void { Object.assign(state.player, relative(state, point)); }
/** Production camp input integration, with no teleports between the route's waypoints. */
function walkTo(state: GameState, point: Vec): void {
  const target = relative(state, point), layout = campLayout(state);
  for (let step = 0; step < 600; step++) {
    const dx = target.x - state.player.x, dy = target.y - state.player.y, gap = Math.hypot(dx, dy);
    if (gap < 1.1) return;
    const dt = Math.min(BALANCE.step, gap / BALANCE.speed);
    advanceCampScene(state, { moveX: dx, moveY: dy, aim: target, fire: false }, dt);
    expect(isCampPositionLegal(state.player, state.player.radius, layout)).toBe(true);
  }
  throw new Error(`Camp route stuck before ${JSON.stringify(point)} at ${JSON.stringify({ x: state.player.x-layout.origin.x,y:state.player.y-layout.origin.y })}`);
}

describe('approved three-courtyard camp geometry', () => {
  it('uses a dedicated bounded camp world without the old battle folds or foreground', () => {
    const state = camp(), layout = campLayout(state);
    expect(state.world!.obstacles).toHaveLength(0);
    expect(state.world!.bounds).toEqual(layout.worldBounds);
    expect(state.player).toMatchObject(layout.spawn);
    expect(isCampPositionLegal(state.player, state.player.radius, layout)).toBe(true);
    expect(state.world!.foreground.x).toBeGreaterThan(state.world!.bounds.right);
    expect(CAMP_COURTYARDS.map(c => c.gate.width)).toEqual([92, 92, 92]);
  });

  it('leaves a newly departed battle with its original combat geometry', () => {
    const state = camp();
    const departure = new GameSession(72, { campaign: true, milestone: 'G3', mode: 'endless', territory: true });
    departure.start();
    expect(departure.state.camp).toBeUndefined();
    expect(departure.state.world!.obstacles.map(obstacle => obstacle.id)).toEqual(['cover-south', 'cover-east']);
    expect(departure.state.world!.bounds).not.toEqual(state.world!.bounds);
  });

  const routes: Record<CampStationId, Vec[]> = {
    warehouse: [{ x: 0, y: 100 }, { x: -210, y: 100 }, { x: -230, y: 100 }, { x: -386, y: -20 }],
    forge: [{ x: 0, y: 100 }, { x: -210, y: 100 }, { x: -220, y: 222 }, { x: -350, y: 222 }],
    shop: [{ x: 85, y: 270 }, { x: 85, y: -40 }, { x: 220, y: -40 }, { x: 250, y: 0 }, { x: 335, y: 0 }],
    departure: [{ x: 85, y: 250 }, { x: 205, y: 250 }, { x: 205, y: 340 }, { x: 335, y: 340 }],
    summon: [{ x: 85, y: 270 }, { x: 85, y: -40 }, { x: 220, y: -40 }, { x: 220, y: -85 }],
  };
  for (const id of ['warehouse', 'forge', 'shop', 'departure'] as const) {
    it(`walks from the actual spawn through courtyard entrances to ${id}`, () => {
      const state = camp();
      for (const point of routes[id]) walkTo(state, point);
      expect(nearbyCampStation(state)?.id).toBe(id);
    });
  }

  for (const courtyard of CAMP_COURTYARDS) {
    it(`blocks the ${courtyard.id} wall, admits its 92-wide door, and does not tunnel at long frame deltas`, () => {
      const state = camp(), layout = campLayout(state), gate = courtyard.gate;
      const outside = gate.side === 'east' ? 50 : -50, direction = gate.side === 'east' ? -1 : 1;
      setPlayer(state, { x: gate.center.x + outside, y: gate.center.y - 100 });
      advanceCampScene(state, { moveX: direction, moveY: 0, aim: state.player, fire: false }, 1);
      const blocked = state.player.x - layout.origin.x;
      expect(gate.side === 'east' ? blocked > gate.center.x : blocked < gate.center.x).toBe(true);
      expect(isCampPositionLegal(state.player, state.player.radius, layout)).toBe(true);
      for (const offset of [-26, 0, 26]) {
        setPlayer(state, { x: gate.center.x + outside, y: gate.center.y + offset });
        advanceCampScene(state, { moveX: direction, moveY: 0, aim: state.player, fire: false }, .5);
        const inside = state.player.x - layout.origin.x;
        expect(gate.side === 'east' ? inside < gate.center.x : inside > gate.center.x).toBe(true);
        expect(isCampPositionLegal(state.player, state.player.radius, layout)).toBe(true);
      }
      setPlayer(state, { x: gate.center.x + outside, y: gate.center.y + 32 });
      advanceCampScene(state, { moveX: direction, moveY: 0, aim: state.player, fire: false }, .5);
      const clippedDoorEdge = state.player.x - layout.origin.x;
      expect(gate.side === 'east' ? clippedDoorEdge > gate.center.x : clippedDoorEdge < gate.center.x).toBe(true);
    });
  }

  it('walks through the formerly invisible obstacle outside the workshop rounded corner', () => {
    const state = camp(), layout = campLayout(state);
    const point = relative(state, { x: -135, y: -255 });
    expect(isCampPositionLegal(point, 19, layout)).toBe(true);
    for (const waypoint of [{ x: -100, y: 270 }, { x: -100, y: -280 }, { x: -135, y: -255 }]) walkTo(state, waypoint);
    expect(Math.hypot(state.player.x-point.x,state.player.y-point.y)).toBeLessThan(1.1);
  });

  it('matches the inside and outside edges of every rounded corner without permitting wall crossings', () => {
    const state = camp(), layout = campLayout(state), radius = state.player.radius;
    const halfWall = CAMP_WALL_THICKNESS / 2, corner = CAMP_WALL_CORNER_RADIUS;
    for (const courtyard of layout.courtyards) {
      const r = courtyard.rect;
      for (const [sx, sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
        const name = `${courtyard.id} corner ${sx},${sy}`;
        const center = { x: sx < 0 ? r.left + corner : r.right - corner, y: sy < 0 ? r.top + corner : r.bottom - corner };
        const nx = sx * Math.SQRT1_2, ny = sy * Math.SQRT1_2;
        const at = (distance: number) => ({ x: center.x + nx * distance, y: center.y + ny * distance });
        expect(isCampPositionLegal(at(corner + radius + halfWall + .5), radius, layout), `${name}: outer clearance`).toBe(true);
        expect(isCampPositionLegal(at(corner + radius + halfWall - 1), radius, layout), `${name}: outer contact`).toBe(false);
        expect(isCampPositionLegal(at(-6), radius, layout), `${name}: inner clearance`).toBe(true);
        expect(isCampPositionLegal(at(0), radius, layout), `${name}: inner contact`).toBe(false);
        expect(campInteractionLineClear(at(80), at(-6), layout), `${name}: interaction wall`).toBe(false);
        Object.assign(state.player, at(80));
        advanceCampScene(state, { moveX: -nx, moveY: -ny, aim: state.player, fire: false }, 1);
        expect(state.player.x < r.left || state.player.x > r.right || state.player.y < r.top || state.player.y > r.bottom, `${name}: outside-to-inside crossing`).toBe(true);
        expect(isCampPositionLegal(state.player, radius, layout)).toBe(true);
        Object.assign(state.player, at(-6));
        advanceCampScene(state, { moveX: nx, moveY: ny, aim: state.player, fire: false }, 1);
        expect(state.player.x > r.left && state.player.x < r.right && state.player.y > r.top && state.player.y < r.bottom, `${name}: inside-to-outside crossing`).toBe(true);
        expect(isCampPositionLegal(state.player, radius, layout)).toBe(true);
      }
    }
  });

  it('uses round end caps while preserving exactly 92 units of visible and physical gate clearance', () => {
    const state = camp(), layout = campLayout(state), radius = state.player.radius;
    for (const courtyard of layout.courtyards) {
      const { gate } = courtyard, trace = campWallTrace(courtyard), halfWall = CAMP_WALL_THICKNESS / 2;
      expect(Math.abs(trace[0].y-gate.center.y)-halfWall).toBe(gate.width/2);
      expect(Math.abs(trace[trace.length-1].y-gate.center.y)-halfWall).toBe(gate.width/2);
      for (const sign of [-1, 1]) {
        const at = (offset: number) => ({ x: gate.center.x, y: gate.center.y + sign * offset });
        expect(isCampPositionLegal(at(gate.width/2-radius), radius, layout)).toBe(true);
        expect(isCampPositionLegal(at(gate.width/2-radius+.25), radius, layout)).toBe(false);
        const clearY = gate.center.y + sign * gate.width/2;
        expect(campInteractionLineClear({ x: gate.center.x-40, y: clearY }, { x: gate.center.x+40, y: clearY }, layout)).toBe(true);
        const blockedY = clearY + sign * .25;
        expect(campInteractionLineClear({ x: gate.center.x-40, y: blockedY }, { x: gate.center.x+40, y: blockedY }, layout)).toBe(false);
      }
    }
  });

  it('keeps the player outside the enlarged warehouse, full forge and heart root', () => {
    const state = camp(), layout = campLayout(state);
    for (const id of ['warehouse', 'forge'] as const) {
      const station = layout.facilities.find(f => f.id === id)!;
      Object.assign(state.player, station.interactionPosition);
      expect(nearbyCampStation(state)?.id).toBe(id);
      advanceCampScene(state, { moveX: 0, moveY: -1, aim: state.player, fire: false }, 1);
      expect(state.player.y).toBeGreaterThanOrEqual(station.footprint.bottom + state.player.radius - .001);
      expect(isCampPositionLegal(state.player, state.player.radius, layout)).toBe(true);
    }
    setPlayer(state, { x: 0, y: 100 });
    advanceCampScene(state, { moveX: 0, moveY: -1, aim: state.player, fire: false }, 1);
    expect(state.player.y).toBeGreaterThanOrEqual(layout.coreFootprint.bottom + state.player.radius - .001);
  });

  it('interacts from every accessible building side without depending on its door anchor', () => {
    for (const id of ['warehouse', 'forge', 'shop', 'departure', 'summon'] as const) {
      const state = camp(); state.camp!.builtFacilities = [id];
      const station = campLayout(state).facilities[0], r = station.footprint;
      for (const point of [{ x: r.left - 22, y: (r.top + r.bottom) / 2 }, { x: r.right + 22, y: (r.top + r.bottom) / 2 },
        { x: (r.left + r.right) / 2, y: r.top - 22 }, { x: (r.left + r.right) / 2, y: r.bottom + 22 }]) {
        Object.assign(state.player, point);
        expect(campStationDistance(state.player, station)).toBe(22);
        expect(canInteractCampStation(state, id), `${id} at ${JSON.stringify(point)}`).toBe(true);
      }
    }
  });

  it('does not allow nearby interactions through courtyard walls or inside completed bodies', () => {
    const state = camp();
    for (const id of ['warehouse', 'forge', 'shop', 'departure'] as const) {
      const station = campStations(state).find(s => s.id === id)!;
      Object.assign(state.player, station.interactionPosition);
      expect(nearbyCampStation(state)?.id).toBe(id);
    }
    setPlayer(state, { x: 335, y: 60 }); expect(nearbyCampStation(state)).toBeUndefined();
    setPlayer(state, { x: -350, y: 280 }); expect(nearbyCampStation(state)).toBeUndefined();
    const warehouse = campStations(state).find(s => s.id === 'warehouse')!;
    Object.assign(state.player, warehouse.position); expect(nearbyCampStation(state)).toBeUndefined();
    setPlayer(state, { x: 123, y: -145 });
    expect(campStationDistance(state.player, campLayout(state).sites.find(site => site.id === 'summon')!)).toBeLessThan(64);
    expect(isCampPositionLegal(state.player, state.player.radius, campLayout(state))).toBe(true);
    expect(canInteractCampStation(state, 'summon')).toBe(false);
  });

  it('allows a clicked eligible target even when another nearby station is closer', () => {
    const state = camp(); setPlayer(state, { x: 277, y: -109 });
    expect(canInteractCampStation(state, 'shop')).toBe(true);
    expect(canInteractCampStation(state, 'summon')).toBe(true);
    expect(nearbyCampStation(state)?.id).toBe('shop');
    for (let i = 0; i < 5; i++) expect(nearbyCampStation(state)?.id).toBe('shop');
  });

  it('shows planned sites while enabling only finished building and courtyard collisions', () => {
    const state = camp(); state.camp!.builtFacilities = [];
    let layout = campLayout(state);
    expect(layout.sites).toHaveLength(5); expect(layout.facilities).toHaveLength(0);
    expect(layout.completedCourtyards).toHaveLength(0); expect(layout.wallSegments).toHaveLength(0);
    const warehouse = layout.sites.find(site => site.id === 'warehouse')!;
    Object.assign(state.player, warehouse.position);
    expect(canInteractCampStation(state, 'warehouse')).toBe(true);
    expect(isCampPositionLegal(state.player, state.player.radius, layout)).toBe(true);
    state.camp!.builtFacilities = ['warehouse']; layout = campLayout(state);
    expect(layout.facilities.map(f => f.id)).toEqual(['warehouse']); expect(layout.wallSegments).toHaveLength(0);
    expect(isCampPositionLegal(state.player, state.player.radius, layout)).toBe(false);
    ensureCampPlayerLegal(state);
    expect(isCampPositionLegal(state.player, state.player.radius, layout)).toBe(true);
    expect(campStationDistance(state.player, warehouse)).toBeLessThan(21);
    state.camp!.builtFacilities.push('forge'); layout = campLayout(state);
    expect(layout.completedCourtyards.map(c => c.id)).toEqual(['workshop']);
    expect(new Set(layout.wallSegments.map(wall => wall.courtyardId))).toEqual(new Set(['workshop']));
  });

  it('moves a player clear when a completed courtyard appears around their position', () => {
    const state = camp(); state.camp!.builtFacilities = ['warehouse'];
    setPlayer(state, { x: -150, y: -50 });
    expect(isCampPositionLegal(state.player, state.player.radius, campLayout(state))).toBe(true);
    state.camp!.builtFacilities.push('forge');
    expect(isCampPositionLegal(state.player, state.player.radius, campLayout(state))).toBe(false);
    const before = { ...state.player }; ensureCampPlayerLegal(state);
    expect(isCampPositionLegal(state.player, state.player.radius, campLayout(state))).toBe(true);
    expect(Math.hypot(state.player.x - before.x, state.player.y - before.y)).toBeLessThan(28);
    advanceCampScene(state, { moveX: 0, moveY: 1, aim: state.player, fire: false }, .1);
    expect(state.player.y).toBeGreaterThan(before.y);
  });

  it('keeps builders and permanent residents in legal ground space throughout their local activity', () => {
    const state = camp(false), layout = campLayout(state);
    expect(state.growth!.cells!.every(cell => isCampPositionLegal(cell, cell.radius, layout))).toBe(true);
    state.camp!.introComplete = true;
    for (let step = 0; step < 1200; step++) {
      advanceCampScene(state, { moveX: 0, moveY: 0, aim: state.player, fire: false }, BALANCE.step);
      expect(state.growth!.cells).toHaveLength(6);
      expect(state.growth!.cells!.every(cell => isCampPositionLegal(cell, cell.radius, layout))).toBe(true);
      for (const [index, cell] of state.growth!.cells!.entries()) expect(Math.hypot(cell.x-layout.residents[index].home.x,cell.y-layout.residents[index].home.y)).toBeLessThanOrEqual(26);
    }
  });
});
