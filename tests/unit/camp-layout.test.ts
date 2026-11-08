import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { advanceCampScene, campStationDistance, campStations, canInteractCampStation, canUseCampSummon, ensureCampPlayerLegal, nearbyCampStation, prepareCampScene } from '../../src/game/campScene';
import { CAMP_COURTYARDS, CAMP_WALL_CORNER_RADIUS, CAMP_WALL_THICKNESS, campInteractionLineClear,
  campLayout, campCourtyardBoundaryTraces, isCampPositionLegal, type CampStationId } from '../../src/game/campLayout';
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
    expect(CAMP_COURTYARDS.map(c => c.gate.width)).toEqual([136, 136, 136]);
  });

  it('leaves a newly departed battle with its original combat geometry', () => {
    const state = camp();
    const departure = new GameSession(72, { campaign: true, milestone: 'G3', mode: 'endless', territory: true });
    departure.start();
    expect(departure.state.camp).toBeUndefined();
    expect(departure.state.world!.obstacles.map(obstacle => obstacle.id)).toEqual(['cover-south', 'cover-east']);
    expect(departure.state.world!.bounds).not.toEqual(state.world!.bounds);
  });

  const routes: Partial<Record<CampStationId, Vec[]>> = {
    warehouse: [{ x: 0, y: 100 }, { x: -210, y: 100 }, { x: -230, y: 100 }, { x: -386, y: -20 }],
    forge: [{ x: 0, y: 100 }, { x: -210, y: 100 }, { x: -220, y: 222 }, { x: -350, y: 222 }],
    shop: [{ x: 85, y: 270 }, { x: 85, y: -40 }, { x: 220, y: -40 }, { x: 250, y: 0 }, { x: 335, y: 0 }],
    departure: [{ x: 85, y: 250 }, { x: 205, y: 250 }, { x: 205, y: 340 }, { x: 335, y: 340 }],
    summon: [{ x: 0, y: 90 }, { x: 90, y: 90 }],
  };
  for (const id of ['warehouse', 'forge', 'shop', 'departure', 'summon'] as const) {
    it(`walks from the actual spawn through courtyard entrances to ${id}`, () => {
      const state = camp();
      for (const point of routes[id]!) walkTo(state, point);
      expect(nearbyCampStation(state)?.id).toBe(id);
    });
  }

  for (const courtyard of CAMP_COURTYARDS) {
    it(`admits broad approaches across all four open ${courtyard.id} sides`, () => {
      const state = camp(), layout = campLayout(state), r = courtyard.rect;
      const probes = [
        [{ x: r.left - 38, y: (r.top+r.bottom)/2 }, { x: r.left + 38, y: (r.top+r.bottom)/2 }],
        [{ x: r.right - 38, y: (r.top+r.bottom)/2 }, { x: r.right + 38, y: (r.top+r.bottom)/2 }],
        [{ x: (r.left+r.right)/2, y: r.top - 38 }, { x: (r.left+r.right)/2, y: r.top + 38 }],
        [{ x: (r.left+r.right)/2, y: r.bottom - 38 }, { x: (r.left+r.right)/2, y: r.bottom + 38 }],
      ];
      for (const [from,to] of probes) {
        const start=relative(state,from),end=relative(state,to);
        Object.assign(state.player,start);
        expect(isCampPositionLegal(start,state.player.radius,layout)).toBe(true);
        for(let n=0;n<25;n++)advanceCampScene(state,{moveX:to.x-from.x,moveY:to.y-from.y,aim:end,fire:false},1/60);
        expect(isCampPositionLegal(state.player,state.player.radius,layout)).toBe(true);
        const travelled=Math.hypot(state.player.x-start.x,state.player.y-start.y);
        expect(travelled).toBeGreaterThan(76);
      }
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

  it('retains four small rounded corner colliders without a continuous enclosing fence', () => {
    const state=camp(),layout=campLayout(state);
    for(const c of CAMP_COURTYARDS){
      const traces=campCourtyardBoundaryTraces(c);expect(traces).toHaveLength(4);
      const length=traces.flatMap(points=>points.slice(1).map((p,n)=>Math.hypot(p.x-points[n].x,p.y-points[n].y))).reduce((a,b)=>a+b,0);
      expect(length).toBeLessThan(340);
      expect(layout.wallSegments.filter(s=>s.courtyardId===c.id)).toHaveLength(32);
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

  it('does not allow interactions inside completed bodies or beyond grounded service reach', () => {
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
    expect(isCampPositionLegal(state.player, state.player.radius, campLayout(state))).toBe(true);
    expect(canInteractCampStation(state, 'summon')).toBe(false);
  });

  it('makes the road-side summon node walkable and usable only after activation and within reach', () => {
    const state = camp(), layout = campLayout(state), node = layout.facilities.find(site => site.id === 'summon')!;
    expect(node.courtyardId).toBeUndefined();expect(node.blocksMovement).toBe(false);
    expect(node.position).toEqual(relative(state, { x: 132, y: 90 }));
    for (const point of [{ x: 85, y: 90 }, { x: 90, y: 90 }, { x: 132, y: 90 }]) {
      setPlayer(state, point);expect(isCampPositionLegal(state.player, state.player.radius, layout)).toBe(true);
      expect(nearbyCampStation(state)?.id).toBe('summon');expect(canUseCampSummon(state)).toBe(true);
      expect(canInteractCampStation(state, 'shop')).toBe(false);
    }
    state.camp!.builtFacilities = ['shop'];expect(canUseCampSummon(state)).toBe(false);
    expect(campLayout(state).completedCourtyards.map(c => c.id)).toEqual(['supply']);
    state.camp!.builtFacilities.push('summon');expect(canUseCampSummon(state)).toBe(true);
    setPlayer(state, { x: 0, y: 270 });expect(canUseCampSummon(state)).toBe(false);
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
    setPlayer(state, { x: -150, y: -200 });
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
