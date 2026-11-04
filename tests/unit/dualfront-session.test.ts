import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { DamageOrigin } from '../../src/game/growthTypes';
import type { InputFrame, Target } from '../../src/game/types';
import { supplyTerritoryDefense } from '../fixtures/territoryDefense';

function session(wave = 1) {
  const game = new GameSession(71, { mode: 'endless', territory: true });
  game.start();
  // Isolated rule transaction fixture; no natural battle outcome is inferred.
  Object.assign(game.state.endless!, { wave, phase: wave >= 3 ? 'combat' : 'warning', phaseUntil: Infinity,
    remainingToSpawn: 1, batchSchedule: [], batchIndex: 0, batchMemberIndex: 0, nextSpawnAt: Infinity });
  return game;
}
function step(game: GameSession, extra: Partial<InputFrame> = {}) {
  game.step({ moveX: 0, moveY: 0, fire: false, aim: { x: 100, y: 100 }, ...extra });
}
const node = (game: GameSession, id: string) => game.state.territory!.nodes.find(n => n.id === id)!;
const hit = (game: GameSession, body: Target, amount: number, origin?: DamageOrigin) =>
  (game as unknown as { damage(t: Target, n: number, o?: DamageOrigin): number }).damage(body, amount, origin);

describe('dual-front production session utility and membrane acceptance', () => {
  it('starts purification with a single context press, ignores distant aim and keeps weapon2', () => {
    const game = session(), front = node(game, 'front-north');
    Object.assign(game.state.player, { x: front.x + 100, y: front.y, hp: 60 });
    game.state.tool = 2;
    step(game, { territoryAction: true });
    expect(game.state.tool).toBe(2);
    expect(game.state.territory!.purification?.nodeId).toBe(front.id);
    expect(game.state.player.hp).toBe(60); // A front is not a healing facility.
    for (let i = 0; i < 181; i++) step(game);
    expect(front.owner).toBe('healthy');
    expect(game.state.player.hp).toBe(60);
  });

  it('pauses a front purification when its supporting spring is lost and resumes without resetting', () => {
    const game = session(), front = node(game, 'front-north'), spring = node(game, 'heart-healing-1');
    Object.assign(game.state.player, { x: front.x, y: front.y });
    step(game, { territoryAction: true });
    for (let i = 0; i < 60; i++) step(game);
    const progress = front.purificationProgress;
    spring.owner = 'infected'; spring.infectionProgress = 100;
    for (let i = 0; i < 60; i++) step(game);
    expect(front.purificationProgress).toBe(progress);
    spring.owner = 'healthy'; spring.infectionProgress = 0;
    for (let i = 0; i < 121; i++) step(game);
    expect(front.owner).toBe('healthy');
  });

  it('requires a healthy spring to begin its front and leaves weapon selection untouched on rejection', () => {
    const game = session(), front = node(game, 'front-north'), spring = node(game, 'heart-healing-1');
    spring.owner = 'infected'; spring.infectionProgress = 100;
    Object.assign(game.state.player, { x: front.x, y: front.y });
    step(game, { territoryAction: true });
    expect(game.state.territory!.purification).toBeNull();
    expect(game.state.tool).toBe(1);
    expect(game.state.events.some(e => e.type === 'TERRITORY_ACTION_REJECTED' && e.data.reason === 'healing-required')).toBe(true);
  });

  it('repairs only the nearby core while the primary trigger continues firing', () => {
    const game = session();
    Object.assign(game.state.player, { x: 1100, y: 900, hp: 50 });
    game.state.tissue.hp = 50;
    step(game, { territoryAction: true, fire: true, aim: { x: 1500, y: 900 } });
    expect(game.state.tissue.hp).toBe(75);
    expect(game.state.player.hp).toBe(50);
    expect(game.state.tool).toBe(1);
    expect(game.state.events.some(e => e.type === 'PLAYER_PROJECTILE_LAUNCHED')).toBe(true);
  });

  it('does not consume a paused utility press or advance an active purification', () => {
    const game = session(), front = node(game, 'front-north');
    Object.assign(game.state.player, { x: front.x, y: front.y });
    step(game, { territoryAction: true }); game.pause();
    const before = game.snapshot();
    for (let i = 0; i < 120; i++) step(game, { territoryAction: true });
    expect(game.snapshot()).toEqual(before);
  });

  it.each([
    { cause: 'basic', basicTool: 1 }, { cause: 'basic', basicTool: 2 },
    { cause: 'protocol' }, { cause: 'ability', ability: 'dash' },
    { cause: 'ability', ability: 'charged-slash' }, { cause: 'ability', ability: 'catalysis' },
    { cause: 'ability', ability: 'cannon-aftershock' }, { cause: 'ability', ability: 'host-event' },
  ] as DamageOrigin[])('protects the source from every damage path: $cause $ability $basicTool', origin => {
    const game = session(3); step(game);
    const source = game.state.targets.find(t => t.role === 'source' && t.territorySourceId === 'source-west')!;
    expect(source.hp).toBe(1200);
    expect(hit(game, source, 5000, origin)).toBe(0);
    expect(source.hp).toBe(1200);
    expect(game.state.endless!.score).toBe(0);
    expect(game.state.events.some(e => e.type === 'TERRITORY_SOURCE_PROTECTED')).toBe(true);
  });

  it('opens and restores the source membrane from real lane ownership without resetting damage', () => {
    const game = session(3); step(game);
    const source = game.state.targets.find(t => t.role === 'source' && t.territorySourceId === 'source-west')!;
    const front = node(game, 'front-north'), spring = node(game, 'heart-healing-1');
    front.owner = 'healthy'; front.infectionProgress = 0;
    supplyTerritoryDefense(game.state, ['north']);
    expect(hit(game, source, 200)).toBe(200);
    expect(source.hp).toBe(1000);
    front.owner = 'infected';
    expect(hit(game, source, 5000)).toBe(0);
    expect(source.hp).toBe(1000);
    front.owner = 'healthy'; spring.owner = 'infected';
    expect(hit(game, source, 5000)).toBe(0);
    spring.owner = 'healthy';
    expect(hit(game, source, 1000)).toBe(1000);
    expect(game.state.territory!.sources['source-west'].destroyed).toBe(true);
    expect(node(game, 'source-west')).toMatchObject({ permanent: true, owner: 'healthy' });
    expect(game.state.endless!.score).toBe(600);
    expect(hit(game, source, 1000)).toBe(0);
  });
});
