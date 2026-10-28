import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, x: number, y: number): Target => ({ id, x, y, role: 'source', kind: 'single', radius: 10, hp: 1000, maxHp: 1000, scanned: false, hitUntil: 0 });
function setup(rank: number, targets: Target[], obstacles: WorldGeometry['obstacles'] = []) {
  const game = new GameSession(71, { mode: 'endless' }); game.start();
  game.state.world = { ...world, obstacles }; Object.assign(game.state.player, { x: 500, y: 500 });
  game.state.targets = targets; game.state.endlessGrowth!.ranks.dash = rank;
  Object.assign(game.state.endless!, { phase: 'combat', remainingToSpawn: 1, nextSpawnAt: 999 });
  return game;
}
const input = (extra: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim: { x: 1000, y: 500 }, ...extra });
const hits = (game: GameSession, id: string) => game.state.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === id);

describe('wide dash blade through real session inputs', () => {
  it('cleaves lateral bodies once, leaves the rear outside the early fan, and draws the actual fan', () => {
    const side = actor('side', 700, 635), rear = actor('rear', 550, 500), outside = actor('outside', 900, 500);
    const game = setup(1, [side, rear, outside]); game.step(input({ dash: true, moveX: 1 }));
    for (let i = 0; i < 12; i++) game.step(input({ dash: true }));
    expect(side.hp).toBe(945); expect(rear.hp).toBe(1000); expect(outside.hp).toBe(1000);
    expect(hits(game, side.id)).toHaveLength(1);
    const slash = game.state.effects.find(effect => effect.kind === 'slash')!;
    expect(slash.radius).toBe(160); expect(slash.arcHalfAngle).toBeCloseTo(Math.PI * .6);
    expect(slash.from.x).toBe(630); expect(game.state.dashes).toBe(1);
  });

  it('rank three unlocks a circular cut that can hit an enemy behind the travelling player', () => {
    const rear = actor('rear', 500, 500), game = setup(3, [rear]); game.step(input({ dash: true, moveX: 1 }));
    for (let i = 0; i < 11; i++) game.step(input());
    expect(rear.hp).toBe(835); expect(hits(game, rear.id)).toHaveLength(1);
    expect(game.state.effects.find(effect => effect.kind === 'slash')!.arcHalfAngle).toBe(Math.PI);
  });

  it('rank six adds exactly one delayed return at the real moved position and freezes it while paused', () => {
    const body = actor('twice', 620, 560), game = setup(6, [body]); game.step(input({ dash: true, moveX: 1 }));
    expect(hits(game, body.id)).toHaveLength(0);
    game.pause(); const frozen = structuredClone(game.state);
    for (let i = 0; i < 60; i++) game.step(input());
    expect(game.state).toEqual(frozen); game.resume();
    for (let i = 0; i < 11; i++) game.step(input());
    expect(hits(game, body.id)).toHaveLength(1); const until = game.state.bladeFollow!.at;
    while (game.state.elapsed < until + .1) game.step(input());
    expect(hits(game, body.id)).toHaveLength(2); expect(body.hp).toBeCloseTo(1000 - 330 * 1.65);
    const returning = game.state.events.find(event => event.type === 'COMBAT_ABILITY_TRIGGERED' && event.data.stage === 'return')!;
    expect(returning.data.hits).toBe(1); expect(game.state.bladeFollow).toBeUndefined();
    const effect = game.state.effects.find(effect => effect.kind === 'slash' && effect.born >= until)!;
    expect(effect.from.x).toBeCloseTo(game.state.player.x);
    expect(effect.from.x).toBeGreaterThan(600);
  });

  it('local cover blocks even the circular blade and restarting clears the pending return', () => {
    const covered = actor('covered', 620, 500), game = setup(6, [covered], [{ id: 'wall', x: 565, y: 500, radius: 20 }]);
    game.step(input({ dash: true, moveX: 1 })); expect(covered.hp).toBe(1000);
    expect(game.state.bladeOpening).toBeDefined(); game.start();
    expect(game.state.bladeOpening).toBeUndefined(); expect(game.state.bladeFollow).toBeUndefined(); expect(game.state.bladeDashSerial).toBeUndefined();
  });
});
