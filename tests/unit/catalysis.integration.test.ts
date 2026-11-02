import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target } from '../../src/game/types';

function fixture(hp = 1000) {
  const session = new GameSession(71, { mode: 'endless' }); session.start(); const state = session.state;
  state.world = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(state.player, { x: 500, y: 500 }); Object.assign(state.tissue, { x: 500, y: 800, hp: 100 });
  const victim: Target = { id: 'victim', x: 800, y: 500, role: 'source', kind: 'single', radius: 22, hp, maxHp: hp, hitUntil: 0, scanned: false, attackReady: 1000, traits: [] };
  state.targets = [victim]; state.endlessGrowth!.ranks = { nova: 1, catalysis: 1 }; state.growth!.equipped = []; state.growth!.ended = true;
  Object.assign(state.endless!, { phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: 1000 });
  const step = (extra: Partial<InputFrame> = {}) => session.step({ moveX: 0, moveY: 0, aim: victim, fire: false, ...extra });
  const advance = (ticks: number) => { for (let i = 0; i < ticks; i++) step(); };
  const events = (type: string) => state.events.filter(e => e.type === type);
  return { session, state, victim, step, advance, events };
}

describe('legacy catalysis ID now runs finite purification aftershocks in challenge', () => {
  it('deals full main blast, then one forty-percent aftershock after .35 seconds', () => {
    const f = fixture(); f.step({ tool: 2, fire: true }); f.advance(20);
    const blast = f.events('PLAYER_CANNON_EXPLODED')[0]; expect(blast).toBeDefined();
    expect(f.victim.hp).toBeCloseTo(1000 - 92); expect(f.state.endlessGrowth!.pendingCatalysis).toBeUndefined();
    expect(f.events('CATALYSIS_ARMED')).toHaveLength(0); expect(f.events('PLAYER_CANNON_AFTERSHOCK')).toHaveLength(0);
    f.advance(21); const after = f.events('PLAYER_CANNON_AFTERSHOCK'); expect(after).toHaveLength(1);
    expect(after[0].tick - blast.tick).toBe(21); expect(after[0].data.radius).toBeCloseTo(110 * .75);
    expect(f.victim.hp).toBeCloseTo(1000 - 92 * 1.4); f.advance(80);
    expect(f.events('PLAYER_CANNON_AFTERSHOCK')).toHaveLength(1);
    expect(f.events('TARGET_HIT')[1].data).toMatchObject({ cause: 'ability', ability: 'cannon-aftershock' });
  });
  it('captures damage and upgrade at launch across a tool switch', () => {
    const f = fixture(); f.step({ tool: 2, fire: true }); f.state.endlessGrowth!.ranks = { power: 20 };
    f.step({ tool: 3 }); f.advance(50); expect(f.victim.hp).toBeCloseTo(1000 - 92 * 1.4);
    expect(f.events('TARGET_HIT')[0].data.tool).toBe(2);
  });
  it('freezes the pending aftershock in pause and clears it at wave reward', () => {
    const f = fixture(); f.step({ tool: 2, fire: true }); f.advance(20);
    expect(f.state.playerProjectiles!.some(p => p.kind === 'aftershock')).toBe(true);
    f.session.pause(); const tick = f.state.tick; f.advance(200); expect(f.state.tick).toBe(tick);
    expect(f.events('PLAYER_CANNON_AFTERSHOCK')).toHaveLength(0); f.session.resume(); f.session.completeWave(1);
    expect(f.state.playerProjectiles).toHaveLength(0); expect(f.events('PLAYER_CANNON_AFTERSHOCK')).toHaveLength(0);
  });
  it('awards real aftershock death but does not recursively trigger kill protocols', () => {
    const f = fixture(120); f.state.growth!.ended = false; f.state.growth!.equipped = [{ id: 'PURIFY_CHAIN', tuning: 'balanced' }];
    const neighbor = { ...f.victim, id: 'neighbor', x: 1000, hp: 1000, maxHp: 1000 }; f.state.targets.push(neighbor);
    f.step({ tool: 2, fire: true }); f.advance(50);
    expect(f.victim.hp).toBe(0); expect(f.events('TARGET_CLEARED').filter(e => e.data.id === 'victim')).toHaveLength(1);
    expect(neighbor.hp).toBe(1000); expect(f.events('TARGET_HIT').some(e => e.data.protocolId === 'PURIFY_CHAIN')).toBe(false);
    expect(f.events('PLAYER_CANNON_AFTERSHOCK')).toHaveLength(1);
  });
  it.each(['pause', 'restart'] as const)('stops a blast transaction if a %s callback changes its live state', action => {
    const f = fixture(); const second = { ...f.victim, id: 'z-second', y: 520 }; f.state.targets.push(second);
    let snapshot: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', event => { if (event.type === 'TARGET_HIT' && event.data.id === 'victim') {
      if (action === 'pause') f.session.pause(); else f.session.restart(); snapshot = f.session.snapshot();
    } });
    f.step({ tool: 2, fire: true });
    for (let i = 0; i < 30 && !snapshot; i++) f.step();
    expect(snapshot).toBeDefined(); expect(f.session.snapshot()).toEqual(snapshot); expect(second.hp).toBe(1000);
  });
});
