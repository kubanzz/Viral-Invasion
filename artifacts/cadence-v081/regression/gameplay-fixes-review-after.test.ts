import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BALANCE, type GameEvent, type InputFrame, type Target, type Vec, type WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 1800, height: 1300, bounds: { left: 30, right: 1770, top: 30, bottom: 1270 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, position: Vec, mimic = false): Target => ({ id, ...position, radius: 22, hp: 68, maxHp: 68,
  role: 'virus', kind: 'single', traits: mimic ? ['MIMIC'] : [], tactic: 'melee', hitUntil: 0, scanned: false, born: 0, attackReady: 0 });
function fixture(mode: 'campaign' | 'endless', actors: Target[]) {
  const session = new GameSession(741, mode === 'endless' ? { mode } : { campaign: true }); session.start();
  const state = session.state;
  state.world = world; Object.assign(state.player, { x: 850, y: 650 }); Object.assign(state.tissue, { x: 850, y: 650, hp: 100 });
  state.targets = actors;
  if (state.endless) Object.assign(state.endless, { wave: 13, phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: Infinity });
  const events: GameEvent[] = []; session.bus.on('event', event => events.push(structuredClone(event)));
  const step = (input: Partial<InputFrame> = {}) => session.step({ moveX: 0, moveY: 0, aim: { x: 1000, y: 650 }, fire: false, ...input });
  return { session, state, events, step };
}

describe('independent review of melee cover and shared damage guards', () => {
  it.each(['campaign', 'endless'] as const)('preserves simultaneous %s player/tissue attack identities and actual damage totals', mode => {
    const playerAttacker = actor('identity-player', { x: 800, y: 650 }), tissueAttacker = actor('identity-tissue', { x: 850, y: 590 }, true);
    const f = fixture(mode, [playerAttacker, tissueAttacker]);
    f.step();
    expect(playerAttacker.attackTarget).toBe('player'); expect(tissueAttacker.attackTarget).toBe('tissue');
    const deadline = playerAttacker.attackAt!;
    expect(tissueAttacker.attackAt).toBe(deadline);
    while (f.state.elapsed + 1e-9 < deadline) f.step();
    const playerDamage = mode === 'endless' ? 10 : 7, tissueDamage = mode === 'endless' ? 5 : 4;
    const playerHits = f.events.filter(event => event.type === 'PLAYER_HURT');
    const tissueHits = f.events.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'enemy-attack');
    expect(playerHits).toHaveLength(1); expect(tissueHits).toHaveLength(1);
    expect(playerHits[0].data).toMatchObject({ actorId: playerAttacker.id, reason: 'enemy-attack', damage: playerDamage, remainingHp: 100 - playerDamage });
    expect(tissueHits[0].data).toMatchObject({ actorId: tissueAttacker.id, reason: 'enemy-attack', before: 100, after: 100 - tissueDamage, organId: 'heart' });
    expect(playerHits[0].tick).toBe(tissueHits[0].tick);
    expect(f.state.battle!.stats).toMatchObject({ playerDamage, tissueDamage });
    expect(f.state.player.hp).toBe(100 - playerDamage); expect(f.state.tissue.hp).toBe(100 - tissueDamage);
    expect(playerAttacker.attackAt).toBeUndefined(); expect(tissueAttacker.attackAt).toBeUndefined();
  });

  it.each(['campaign', 'endless'] as const)('keeps normal dash immunity when the %s committed attack resolves inside its warning', mode => {
    const target = actor('dash-identity', { x: 800, y: 650 }), f = fixture(mode, [target]);
    f.step(); const deadline = target.attackAt!, aim = { ...target.attackAim! };
    while ((f.state.tick + 1) * BALANCE.step + 1e-9 < deadline) f.step();
    f.step({ dash: true });
    expect(f.state.elapsed).toBeGreaterThanOrEqual(deadline);
    expect(Math.hypot(f.state.player.x - aim.x, f.state.player.y - aim.y)).toBeLessThan(58 + f.state.player.radius);
    expect(f.state.elapsed).toBeLessThan(f.state.player.dashUntil);
    expect(f.state.player.hp).toBe(100);
    expect(f.events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(0);
    expect(f.state.battle!.stats.playerDamage).toBe(0); expect(target.attackAt).toBeUndefined();
  });

  it('clamps a lethal hit and freezes the unprocessed second attack without a zero-damage identity', () => {
    const first = actor('lethal-first', { x: 800, y: 650 }), second = actor('lethal-second', { x: 900, y: 650 });
    const f = fixture('endless', [first, second]); f.state.player.hp = 5;
    f.step(); const deadline = first.attackAt!;
    expect(second.attackAt).toBe(deadline);
    const secondWarning = { attackAt: second.attackAt, attackAim: { ...second.attackAim! }, attackTarget: second.attackTarget };
    while (f.state.phase === 'playing' && f.state.elapsed + 1e-9 < deadline) f.step();
    const hits = f.events.filter(event => event.type === 'PLAYER_HURT');
    expect(f.state.player.hp).toBe(0); expect(f.state.phase).toBe('result');
    expect(hits).toHaveLength(1); expect(hits[0].data).toMatchObject({ actorId: first.id, damage: 5, remainingHp: 0, reason: 'enemy-attack' });
    expect(f.state.battle!.stats.playerDamage).toBe(5);
    expect(first.attackAt).toBeUndefined(); expect(second).toMatchObject(secondWarning);
    expect(f.events.filter(event => event.tick === f.state.tick && event.data.actorId === second.id)).toHaveLength(0);
    const terminal = f.session.snapshot(), eventCount = f.events.length;
    for (let tick = 0; tick < 120; tick++) f.step();
    expect(f.session.snapshot()).toEqual(terminal); expect(f.events).toHaveLength(eventCount);
  });
});
