import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target } from '../../src/game/types';

function fixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const state = session.state;
  state.world = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 },
    obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(state.player, { x: 500, y: 500 }); Object.assign(state.tissue, { x: 500, y: 800, hp: 100 });
  const victim: Target = { id: 'victim', x: 850, y: 500, kind: 'single', role: 'source', radius: 10,
    hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false, attackReady: 1000, traits: [] };
  state.targets = [victim]; state.growth!.equipped = []; state.growth!.ended = true;
  Object.assign(state.endless!, { phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: 1000 });
  const step = (extra: Partial<InputFrame> = {}) => session.step({ moveX: 0, moveY: 0, aim: victim, fire: false, ...extra });
  const advance = (ticks: number, extra: Partial<InputFrame> = {}) => { for (let i = 0; i < ticks; i++) step(extra); };
  const events = (type: string) => state.events.filter(event => event.type === type);
  return { session, state, victim, step, advance, events };
}

describe('challenge projectile and charge session integration', () => {
  it('waits for flight before damage, preserves firing tool after switching, and freezes in pause', () => {
    const f = fixture(); f.step({ fire: true });
    expect(f.victim.hp).toBe(1000); expect(f.state.playerProjectiles).toHaveLength(1);
    expect(f.state.effects.some(effect => effect.kind === 'beam')).toBe(false);
    f.session.pause(); const before = structuredClone(f.state.playerProjectiles);
    f.advance(100); expect(f.state.playerProjectiles).toEqual(before);
    f.session.resume(); f.step({ tool: 3 }); f.advance(15);
    expect(f.victim.hp).toBe(966);
    expect(f.events('TARGET_HIT')[0].data.tool).toBe(1);
    expect(f.state.playerProjectiles).toHaveLength(0);
  });

  it('repeats held cannon fire on its cooldown and retains one main damage per explosion', () => {
    const f = fixture(); f.advance(122, { tool: 2, fire: true });
    expect(f.events('TOOL_FIRED')).toHaveLength(2);
    expect(f.events('PLAYER_CANNON_EXPLODED')).toHaveLength(1);
    expect(f.victim.hp).toBe(920);
    f.advance(30); expect(f.victim.hp).toBe(840);
  });

  it('short press only dashes; full release creates five sword bodies and independent cooldown', () => {
    const f = fixture(); f.step({ dash: true, chargePressed: true, chargeHeld: true });
    const dashReady = f.state.player.dashReady;
    f.advance(10, { chargeHeld: true }); f.step({ chargeReleased: true });
    expect(f.events('PLAYER_CHARGE_RELEASED')).toHaveLength(0);
    expect(f.state.chargedSlashReadyAt).toBe(0); expect(f.state.player.dashReady).toBe(dashReady);
    f.step({ chargePressed: true, chargeHeld: true });
    f.advance(76, { chargeHeld: true }); f.step({ chargeReleased: true });
    expect(f.events('PLAYER_CHARGE_FULL')).toHaveLength(1);
    expect(f.events('PLAYER_CHARGE_RELEASED')[0].data).toMatchObject({ count: 5, damage: 80 });
    expect(f.state.chargedSlashReadyAt! - f.state.elapsed).toBeCloseTo(6);
    f.advance(40); expect(f.victim.hp).toBe(920);
    expect(f.events('TARGET_HIT')).toHaveLength(1);
  });

  it('slows only actual charge, blocks tool fire, cancels on tool change and pause without release', () => {
    const f = fixture(); f.step({ chargePressed: true, chargeHeld: true }); f.advance(16, { chargeHeld: true });
    const x = f.state.player.x;
    f.step({ chargeHeld: true, moveX: 1, fire: true });
    expect(f.state.player.x - x).toBeCloseTo(235 / 60 * .7); expect(f.state.shots).toBe(0);
    f.step({ chargeHeld: true, tool: 2 }); expect(f.state.chargedSlash).toBeUndefined();
    f.step({ chargeHeld: true }); expect(f.state.chargedSlash).toBeUndefined();
    f.step({ chargePressed: true, chargeHeld: true }); f.session.pause(); f.session.resume();
    f.step({ chargeHeld: true }); f.step({ chargeReleased: true });
    expect(f.events('PLAYER_CHARGE_RELEASED')).toHaveLength(0); expect(f.state.chargedSlashReadyAt).toBe(0);
  });

  it('admits a full volley atomically without spending cooldown, and clears attacks at wave completion', () => {
    const f = fixture(); f.state.endlessGrowth!.ranks.multishot = 2;
    f.step({ fire: true }); const template = structuredClone(f.state.playerProjectiles![0]);
    f.state.playerProjectiles = Array.from({ length: 191 }, (_, i) => ({ ...structuredClone(template), id: `held-${i}`, speed: 0 }));
    f.state.cooldowns[1] = 0; const shots = f.state.shots;
    f.step({ fire: true }); expect(f.state.playerProjectiles).toHaveLength(191);
    expect(f.state.cooldowns[1]).toBe(0); expect(f.state.shots).toBe(shots);
    f.state.playerProjectiles = []; f.step();
    expect(f.state.playerProjectiles).toHaveLength(5); expect(f.state.shots).toBe(shots + 1);
    f.session.completeWave(1); expect(f.state.phase).toBe('paused'); expect(f.state.playerProjectiles).toHaveLength(0);
    expect(f.state.chargedSlash).toBeUndefined();
  });

  it('clears live attacks on finish and restart', () => {
    const f = fixture(); f.step({ fire: true, chargePressed: true, chargeHeld: true });
    f.session.finish(false, 'test'); expect(f.state.playerProjectiles).toHaveLength(0); expect(f.state.chargedSlash).toBeUndefined();
    f.session.restart(); expect(f.session.state.playerProjectiles).toHaveLength(0);
    expect(f.session.state.chargedSlashReadyAt).toBe(0); expect(f.session.state.endless!.wave).toBe(1);
  });

  it('defers a one-frame cannon release and a full sword volley until queue capacity is available', () => {
    const f = fixture(); f.step({ fire: true });
    const body = structuredClone(f.state.playerProjectiles![0]);
    const fill = (count: number) => { f.state.playerProjectiles = Array.from({ length: count }, (_, i) => ({ ...structuredClone(body), id: `blocked-${i}`, speed: 0 })); };
    fill(192); f.step({ tool: 2, fire: true }); expect(f.state.cooldowns[2]).toBe(0);
    f.state.playerProjectiles = []; f.step();
    expect(f.events('PLAYER_PROJECTILE_LAUNCHED').at(-1)?.data.kind).toBe('cannon');
    expect(f.state.cooldowns[2]).toBeGreaterThan(f.state.elapsed);
    f.step({ chargePressed: true, chargeHeld: true }); f.advance(76, { chargeHeld: true });
    fill(190); f.step({ chargeReleased: true }); expect(f.state.chargedSlashReadyAt).toBe(0);
    f.state.playerProjectiles = []; f.step();
    expect(f.events('PLAYER_CHARGE_RELEASED').at(-1)?.data.count).toBe(5);
    expect(f.state.playerProjectiles).toHaveLength(5);
  });

  it.each(['tool', 'pause', 'finish', 'wave'] as const)('stops stale work if %s cancellation restarts the run', action => {
    const f = fixture(); f.step({ chargePressed: true, chargeHeld: true });
    let snapshot: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', event => { if (event.type === 'PLAYER_CHARGE_CANCELLED') {
      f.session.restart(); snapshot = f.session.snapshot();
    } });
    if (action === 'tool') f.step({ tool: 2 });
    if (action === 'pause') f.session.pause();
    if (action === 'finish') f.session.finish(false, 'test');
    if (action === 'wave') f.session.completeWave(1);
    expect(snapshot).toBeDefined(); expect(f.session.snapshot()).toEqual(snapshot);
  });
});
