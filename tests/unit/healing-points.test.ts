import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition } from '../../src/actors/collision';
import { GameSession } from '../../src/game/session';
import { BALANCE, type Target } from '../../src/game/types';
import { createOrganArena } from '../../src/game/organConfig';
import { advanceHealingPoints, createHealingPointNodes, healingPoints, healingPointStatus,
  HEALING_POINT_BALANCE, treatHealingPoint } from '../../src/game/healingPoints';

function formal() {
  const game = new GameSession(41, { campaign: true, milestone: 'G3' });
  game.start(); game.state.targets = [];
  return game;
}

const virus = (x: number, y: number, id = 'captor'): Target => ({ id, x, y, role: 'virus', kind: 'single',
  hp: 100, maxHp: 100, radius: 22, hitUntil: 0, scanned: false });

describe('Capturable healing points', () => {
  it('adds two legal, separated treatment facilities to each organ while keeping the central tissue', () => {
    const game = formal();
    expect(healingPoints(game.state)).toHaveLength(2);
    expect(game.state.battle!.graph.nodes.filter(node => node.kind === 'tissue')).toHaveLength(1);
    for (const organ of ['heart', 'lung'] as const) {
      const arena = createOrganArena(organ, 41), points = createHealingPointNodes(organ);
      expect(arena.graph.nodes.filter(node => node.kind === 'healing')).toHaveLength(2);
      for (const point of points) expect(isLegalPosition(point, HEALING_POINT_BALANCE.radius, arena.geometry)).toBe(true);
      expect(distance(points[0], points[1])).toBeGreaterThan(500);
    }
    const training = new GameSession(41); training.start();
    expect(healingPoints(training.state)).toEqual([]);
    const fixture = new GameSession(41, { campaign: true, milestone: 'G2' }); fixture.start();
    expect(healingPoints(fixture.state)).toEqual([]);
  });

  it('gives twelve seconds to stop one virus, caps crowd acceleration, and keeps occupied points occupied', () => {
    const game = formal(), point = healingPoints(game.state)[0];
    game.state.targets = [virus(point.x, point.y)];
    for (let tick = 0; tick < 360; tick++) advanceHealingPoints(game.state, BALANCE.step);
    expect(point.infection).toBeCloseTo(50, 6);
    expect(healingPointStatus(point)).toBe('infecting');
    const saved = point.infection;
    game.pause(); advanceHealingPoints(game.state, 1);
    expect(point.infection).toBe(saved);
    game.resume();
    let occupationEvents = 0;
    for (let tick = 0; tick < 361; tick++) occupationEvents += advanceHealingPoints(game.state, BALANCE.step).filter(event => event.type === 'HEALING_POINT_OCCUPIED').length;
    expect(point.infection).toBe(100); expect(point.infected).toBe(true); expect(occupationEvents).toBe(1);
    game.state.targets = []; advanceHealingPoints(game.state, 10);
    expect(point.infection).toBe(100);
    point.infection = 0; point.infected = false;
    game.state.targets = Array.from({ length: 10 }, (_, index) => virus(point.x, point.y, `crowd-${index}`));
    advanceHealingPoints(game.state, 1);
    expect(point.infection).toBeCloseTo(100 / 12 * 2.5);
  });

  it('quick treatment clears partial capture for free and restores HP with a facility cooldown', () => {
    const game = formal(), point = healingPoints(game.state)[0];
    Object.assign(game.state.player, { x: point.x - 100, y: point.y, hp: 40 });
    point.infection = 80; game.state.growth!.research = 1;
    expect(treatHealingPoint(game.state, point)).toEqual({ kind: 'treated', healed: 25, cost: 0, infectionBefore: 80 });
    expect(game.state.player.hp).toBe(65); expect(point.infection).toBe(0);
    expect(game.state.growth!.research).toBe(1);
    expect(treatHealingPoint(game.state, point)).toEqual({ kind: 'rejected', reason: 'cooldown' });
    game.state.elapsed += 4;
    expect(treatHealingPoint(game.state, point).kind).toBe('treated');
    expect(game.state.player.hp).toBe(90);
  });

  it('charges exactly two samples only after full capture and only for an accepted nearby treatment', () => {
    const game = formal(), point = healingPoints(game.state)[0];
    Object.assign(game.state.player, { x: point.x - 100, y: point.y, hp: 50 });
    point.infection = 100; point.infected = true; game.state.growth!.research = 1;
    expect(treatHealingPoint(game.state, point)).toEqual({ kind: 'rejected', reason: 'insufficient-samples', missing: 1 });
    expect(point.infection).toBe(100); expect(game.state.player.hp).toBe(50); expect(game.state.growth!.research).toBe(1);
    game.state.growth!.research = 3; game.state.player.x = point.x - 151;
    expect(treatHealingPoint(game.state, point)).toEqual({ kind: 'rejected', reason: 'range' });
    expect(game.state.growth!.research).toBe(3);
    game.state.player.x = point.x - 100;
    expect(treatHealingPoint(game.state, point)).toEqual({ kind: 'treated', healed: 25, cost: 2, infectionBefore: 100 });
    expect(point.infected).toBe(false); expect(game.state.growth!.research).toBe(1);
    expect(treatHealingPoint(game.state, point).kind).toBe('rejected');
    expect(game.state.growth!.research).toBe(1);
  });

  it('uses the real tool 3 input, emits the accepted cost, and resets facilities on retry', () => {
    const game = formal(), point = healingPoints(game.state)[0];
    Object.assign(game.state.player, { x: point.x - 100, y: point.y, hp: 50 });
    point.infection = 100; point.infected = true; game.state.growth!.research = 3;
    game.step({ moveX: 0, moveY: 0, fire: true, tool: 3, aim: point });
    expect(game.state.player.hp).toBe(75); expect(point.infection).toBe(0);
    expect(game.state.events.find(event => event.type === 'HEALING_POINT_TREATED')?.data).toMatchObject({ cost: 2, healed: 25, nodeId: point.id });
    expect(game.state.growth!.research).toBe(1);
    expect(game.state.campaign!.arenas.heart.graph.nodes.find(node => node.id === point.id)).toBe(point);
    game.restart();
    expect(healingPoints(game.state).map(node => [node.infection, node.healReadyAt])).toEqual([[0, 0], [0, 0]]);
    expect(game.state.growth!.research).toBe(0);
  });

  it('uses upgraded endless maximum HP instead of reducing a healthy player to the base cap', () => {
    const game = new GameSession(41, { mode: 'endless' }); game.start();
    game.state.endlessGrowth!.ranks.vitality = 2;
    const point = healingPoints(game.state)[0];
    Object.assign(game.state.player, { x: point.x - 100, y: point.y, hp: 112 });
    expect(treatHealingPoint(game.state, point)).toMatchObject({ kind: 'treated', healed: 25 });
    expect(game.state.player.hp).toBe(137);
    game.state.elapsed += 4;
    expect(treatHealingPoint(game.state, point)).toMatchObject({ kind: 'treated', healed: 3 });
    expect(game.state.player.hp).toBe(140);
  });

  it('reclaims a fully occupied endless point without samples or healing, then permits treatment after four seconds', () => {
    const game = new GameSession(41, { mode: 'endless' }); game.start();
    const point = healingPoints(game.state)[0];
    Object.assign(game.state.player, { x: point.x - 100, y: point.y, hp: 45 });
    point.infection = 100; point.infected = true;
    expect(game.state.growth!.research).toBe(0);
    expect(treatHealingPoint(game.state, point)).toEqual({ kind: 'treated', healed: 0, cost: 0, infectionBefore: 100 });
    expect(game.state.player.hp).toBe(45); expect(point.infected).toBe(false);
    expect(treatHealingPoint(game.state, point)).toMatchObject({ kind: 'rejected', reason: 'cooldown' });
    game.state.elapsed += 4;
    expect(treatHealingPoint(game.state, point)).toMatchObject({ kind: 'treated', healed: 25 });
    expect(game.state.player.hp).toBe(70); expect(game.state.growth!.research).toBe(0);
  });
});
