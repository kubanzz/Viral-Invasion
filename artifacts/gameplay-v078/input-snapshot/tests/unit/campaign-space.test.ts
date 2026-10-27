import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { GameSession } from '../../src/game/session';
import { BALANCE, WORLD, activeWorld, type Vec, type WorldGeometry } from '../../src/game/types';
import { CAMPAIGN_BALANCE, getOrganDefinition } from '../../src/game/organConfig';

const clear = (a: Vec, b: Vec, world: WorldGeometry, radius = 19): boolean => {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  return world.obstacles.every(obstacle => {
    const t = Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / (length || 1)));
    return Math.hypot(a.x + t * dx - obstacle.x, a.y + t * dy - obstacle.y) >= obstacle.radius + radius + .5;
  });
};
const walkable = (point: Vec, world: WorldGeometry, radius = 19): boolean => {
  const b = world.bounds;
  return point.x >= b.left + radius && point.x <= b.right - radius && point.y >= b.top + radius && point.y <= b.bottom - radius
    && world.obstacles.every(obstacle => distance(point, obstacle) >= obstacle.radius + radius + .5);
};

/** Visibility paths around real collision footprints, independent of the input drivers. */
function routeLengths(world: WorldGeometry, destinations: Vec[]) {
  const nodes = [...destinations, ...world.obstacles.flatMap(obstacle => Array.from({ length: 16 }, (_, index) => ({
    x: obstacle.x + Math.cos(index * Math.PI / 8) * (obstacle.radius + 32),
    y: obstacle.y + Math.sin(index * Math.PI / 8) * (obstacle.radius + 32),
  })).filter(point => walkable(point, world)))];
  const edges = nodes.map(a => nodes.map(b => clear(a, b, world) ? distance(a, b) : Infinity));
  return destinations.map((_, destinationIndex) => {
    const costs = nodes.map(() => Infinity), seen = new Set<number>(); costs[destinationIndex] = 0;
    while (seen.size < nodes.length) {
      let current = -1;
      for (let i = 0; i < nodes.length; i++) if (!seen.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
      if (current < 0 || !Number.isFinite(costs[current])) break;
      seen.add(current);
      for (let i = 0; i < nodes.length; i++) costs[i] = Math.min(costs[i], costs[current] + edges[current][i]);
    }
    return (start: Vec) => Math.min(...nodes.map((node, index) => clear(start, node, world) ? distance(start, node) + costs[index] : Infinity));
  });
}

describe('Campaign spatial revision', () => {
  it('uses a genuinely larger G3 chamber while keeping the training and early regression fixtures at their original scale', () => {
    const game = new GameSession(91, { campaign: true, milestone: 'G3' }); game.start();
    const world = activeWorld(game.state), originalArea = (WORLD.bounds.right - WORLD.bounds.left) * (WORLD.bounds.bottom - WORLD.bounds.top);
    const area = (world.bounds.right - world.bounds.left) * (world.bounds.bottom - world.bounds.top);
    expect(area / originalArea).toBeGreaterThan(4);
    expect(game.state.player).toMatchObject(getOrganDefinition('heart').playerStart);
    expect(game.state.tissue).toMatchObject(getOrganDefinition('heart').tissue);
    expect(game.state.terminal).toEqual(getOrganDefinition('heart').terminal);
    for (const options of [{}, { campaign: true, milestone: 'G1' as const }, { campaign: true, milestone: 'G2' as const }]) {
      const fixture = new GameSession(91, options); fixture.start();
      expect(activeWorld(fixture.state)).toEqual(WORLD); expect(fixture.state.player).toMatchObject({ x: 330, y: 440 });
    }
  });

  it('separates usable facilities, keeps landmarks outside collisions, and leaves explicit route-width clearance', () => {
    for (const organ of ['heart', 'lung'] as const) {
      const layout = getOrganDefinition(organ), facilities = [layout.terminal, layout.research, layout.tissue, layout.device, layout.exit];
      if (organ === 'heart') facilities.push(layout.gate);
      for (let i = 0; i < facilities.length; i++) for (let j = i + 1; j < facilities.length; j++) expect(distance(facilities[i], facilities[j])).toBeGreaterThanOrEqual(300);
      for (const point of [layout.playerStart, layout.entry, ...facilities, ...layout.sourcePositions, layout.elitePosition, layout.corePosition, layout.retainedSource, layout.migratedSource, ...layout.carrierStarts]) expect(walkable(point, layout.geometry, 45), `${organ} landmark ${JSON.stringify(point)}`).toBe(true);
      expect(layout.regions.length).toBeGreaterThanOrEqual(4);
      const paths = routeLengths(layout.geometry, [layout.playerStart]);
      for (const target of facilities) expect(Number.isFinite(paths[0](target))).toBe(true);
    }
  });

  it('keeps both migration choices reachable within the real 12-second warning across a walkable grid, without dash or teleport', () => {
    const heart = getOrganDefinition('heart'), world = heart.geometry;
    const [toGate, toExit] = routeLengths(world, [heart.gate, heart.exit]);
    let samples = 0, longestBlock = 0, longestPursue = 0;
    for (let x = world.bounds.left + 20; x <= world.bounds.right - 20; x += 140) {
      for (let y = world.bounds.top + 20; y <= world.bounds.bottom - 20; y += 140) {
        const point = { x, y }; if (!walkable(point, world)) continue;
        const blockSeconds = Math.max(0, toGate(point) - BALANCE.interactionRange) / BALANCE.speed + CAMPAIGN_BALANCE.blockDuration;
        const pursueSeconds = Math.max(0, toExit(point) - BALANCE.interactionRange) / BALANCE.speed;
        expect(blockSeconds, `block from ${x},${y}`).toBeLessThan(CAMPAIGN_BALANCE.migrationWarning - .5);
        expect(pursueSeconds, `pursue from ${x},${y}`).toBeLessThan(CAMPAIGN_BALANCE.migrationWarning - .5);
        longestBlock = Math.max(longestBlock, blockSeconds); longestPursue = Math.max(longestPursue, pursueSeconds); samples++;
      }
    }
    expect(samples).toBeGreaterThan(100);
    console.log('CAMPAIGN_MIGRATION_SPACE', JSON.stringify({ samples, longestBlock, longestPursue, method: 'Visibility paths around actual footprints; walking speed only, including 2-second block channel. Grid coverage is not human reaction-time evidence.' }));
  });
});
