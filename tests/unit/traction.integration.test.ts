import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { GameSession } from '../../src/game/session';
import type { EndlessGrowthState } from '../../src/game/endlessGrowthTypes';
import { BALANCE, type GameEvent, type InputFrame, type Target, type WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, x = 800, y = 500, changes: Partial<Target> = {}): Target => ({
  id, x, y, kind: 'single', role: 'source', radius: 22, hp: 1000, maxHp: 1000,
  hitUntil: 0, scanned: false, born: 0, attackReady: 1000, traits: [], ...changes,
});
function fixture(ranks: EndlessGrowthState['ranks'] = {}, targets = [actor('a')]) {
  const session = new GameSession(71, { mode: 'endless' }); session.start(); const state = session.state;
  state.world = structuredClone(world); state.targets = targets;
  Object.assign(state.player, { x: 500, y: 500 }); Object.assign(state.tissue, { x: 500, y: 800, hp: 100 });
  state.endlessGrowth!.ranks = { ...ranks }; state.growth!.equipped = []; state.growth!.ended = true;
  Object.assign(state.endless!, { phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: 1000 });
  const events: GameEvent[] = []; session.bus.on('event', event => events.push(structuredClone(event)));
  const step = (extra: Partial<InputFrame> = {}) => session.step({ moveX: 0, moveY: 0, aim: { x: 800, y: 500 }, fire: false, ...extra });
  const advance = (ticks: number, extra: Partial<InputFrame> = {}) => { for (let tick = 0; tick < ticks; tick++) step(extra); };
  return { session, state, targets, events, step, advance };
}
const ofType = (f: ReturnType<typeof fixture>, type: string) => f.events.filter(event => event.type === type);

describe('traction through actual fixed session input', () => {
  it('collects an approaching group and clears it with one delayed base blast', () => {
    const targets = [actor('left', 700, 500, { role: 'virus', hp: 68 }), actor('right', 900, 500, { role: 'virus', hp: 68 }),
      actor('below', 800, 610, { role: 'virus', hp: 68 })];
    const f = fixture({}, targets); f.step({ tool: 2, fire: true });
    expect(targets.every(target => target.hp === 68)).toBe(true);
    expect(ofType(f, 'TRACTION_DISPLACED')).toHaveLength(3);
    expect(targets.every(target => distance(target, { x: 800, y: 500 }) < 70)).toBe(true);
    f.advance(17); expect(ofType(f, 'TARGET_HIT')).toHaveLength(0);
    f.step(); expect(targets.every(target => target.hp === 0)).toBe(true);
    expect(ofType(f, 'TRACTION_RESOLVED')).toHaveLength(1);
    expect(ofType(f, 'TARGET_HIT')).toHaveLength(3);
    expect(ofType(f, 'AREA_DISPLACED')).toHaveLength(0);
  });

  it('preserves tool1 range and sustained fire while tool2 rejects a 500-distance cast', () => {
    const f = fixture({}, [actor('far', 1000, 500)]);
    f.step({ tool: 2, fire: true, aim: f.targets[0] });
    expect(ofType(f, 'TOOL_REJECTED')[0].data.reason).toBe('range');
    expect(f.state.cooldowns[2]).toBe(0); expect(f.state.traction).toBeUndefined();
    f.step({ tool: 1, fire: true, aim: f.targets[0] });
    f.advance(11, { tool: 1, fire: true, aim: f.targets[0] });
    expect(f.targets[0].hp).toBe(932); expect(ofType(f, 'TARGET_HIT')).toHaveLength(2);
  });

  it('starts tool2 when switching from held tool1 fire, and accepts a later switch back without a trigger release', () => {
    const f = fixture(); f.step({ tool: 1, fire: true });
    expect(f.targets[0].hp).toBe(966);
    f.step({ tool: 2, fire: true });
    expect(f.state.traction).toBeDefined(); expect(ofType(f, 'TRACTION_STARTED')).toHaveLength(1);
    f.advance(140, { tool: 2, fire: true });
    expect(ofType(f, 'TRACTION_STARTED')).toHaveLength(1);
    expect(ofType(f, 'TRACTION_RESOLVED')).toHaveLength(1);
    f.step({ tool: 1, fire: true }); f.step({ tool: 2, fire: true });
    expect(ofType(f, 'TRACTION_STARTED')).toHaveLength(2);
    expect(f.state.traction).toBeDefined();
  });

  it('resolves its captured tool2 damage and attribution after switching to repair', () => {
    const f = fixture(); f.step({ tool: 2, fire: true });
    f.state.endlessGrowth!.ranks.power = 9;
    f.advance(18, { tool: 3 });
    expect(f.targets[0].hp).toBe(920);
    expect(ofType(f, 'TARGET_HIT')[0].data).toMatchObject({ cause: 'basic', tool: 2, basicTool: 2, damage: 80 });
    expect(f.state.tool).toBe(3);
  });

  it('keeps a nova III quick click on the .30-second fuse', () => {
    const f = fixture({ nova: 3 }); f.step({ tool: 2, fire: true });
    f.step(); expect(f.state.traction?.stage).toBe('fuse');
    f.advance(17); expect(f.state.traction).toBeUndefined();
    expect(f.targets[0].hp).toBeCloseTo(1000 - 80 * 1.45);
    expect(ofType(f, 'TRACTION_GUIDING_STARTED')).toHaveLength(0);
  });

  it('keeps actual tool2 on-hit protocols after the player switches to repair during the fuse', () => {
    const f = fixture(); f.state.growth!.ended = false;
    f.state.growth!.equipped = [{ id: 'PULSE_BREAK', tuning: 'balanced' }];
    f.state.tick = 120; f.state.elapsed = 2;
    f.state.battle!.pulse.origin = { ...f.state.player };
    f.step({ tool: 2, fire: true }); f.advance(18, { tool: 3 });
    expect(ofType(f, 'PROTOCOL_RESONANCE_HIT')).toHaveLength(1);
    expect(ofType(f, 'TARGET_HIT').some(event => event.data.basicTool === 2 && event.data.tool === 2)).toBe(true);
    expect(f.targets[0].hp).toBeLessThan(920);
    expect(f.state.tool).toBe(3);
  });

  it('guides with the real held pointer, charges movement and never auto repeats while held', () => {
    const f = fixture({ nova: 3 }); f.step({ tool: 2, fire: true });
    f.advance(11, { fire: true }); expect(f.state.traction?.stage).toBe('guiding');
    const before = f.state.player.x;
    f.step({ fire: true, moveX: 1, aim: { x: 850, y: 500 } });
    expect(f.state.player.x - before).toBeCloseTo(BALANCE.speed * .75 / 60);
    expect(f.state.traction!.center.x).toBeGreaterThan(800);
    f.advance(180, { fire: true, aim: { x: 850, y: 500 } });
    expect(ofType(f, 'TRACTION_STARTED')).toHaveLength(1); expect(ofType(f, 'TRACTION_RESOLVED')).toHaveLength(1);
    expect(ofType(f, 'TRACTION_RELEASED')).toHaveLength(1);
    f.step(); f.step({ fire: true }); expect(ofType(f, 'TRACTION_STARTED')).toHaveLength(2);
  });

  it('retains collection but converts the blast into <=8 primer damage and one batch', () => {
    const targets = [actor('a', 800, 600, { role: 'virus' }), actor('b', 810, 500), actor('c', 790, 500), actor('d', 800, 510)];
    const f = fixture({ nova: 1, catalysis: 1 }, targets);
    f.step({ tool: 2, fire: true }); f.advance(18);
    expect(ofType(f, 'TRACTION_DISPLACED').some(event => event.data.targetId === 'a')).toBe(true);
    expect(ofType(f, 'TARGET_HIT').every(event => Number(event.data.damage) <= 8)).toBe(true);
    expect(f.state.endlessGrowth!.pendingCatalysis?.targetIds).toHaveLength(3);
    expect(ofType(f, 'CATALYSIS_ARMED')).toHaveLength(1);
    expect(ofType(f, 'CATALYSIS_DETONATED')).toHaveLength(0);
    expect(ofType(f, 'TRACTION_RESOLVED')[0].data).toMatchObject({ catalyst: true, armed: true });
    f.step({ tool: 1, fire: true }); expect(ofType(f, 'CATALYSIS_DETONATED')).toHaveLength(1);
    expect(ofType(f, 'CATALYSIS_RESOLVED')).toHaveLength(1);
  });

  it('cancels on pause and requires a release before a new tool2 press', () => {
    const f = fixture({ nova: 3 }); f.step({ tool: 2, fire: true }); f.advance(12, { fire: true });
    f.session.pause(); expect(f.state.traction).toBeUndefined();
    const paused = f.session.snapshot(); f.advance(100, { fire: true }); expect(f.session.snapshot()).toEqual(paused);
    f.session.resume(); f.advance(150, { fire: true });
    expect(ofType(f, 'TRACTION_STARTED')).toHaveLength(1); expect(ofType(f, 'TARGET_HIT')).toHaveLength(0);
    f.step(); f.step({ fire: true }); expect(ofType(f, 'TRACTION_STARTED')).toHaveLength(2);
  });

  it.each(['wave', 'organ', 'finish', 'restart', 'menu'] as const)('cleans a pending cast on %s without a later stale explosion', reason => {
    const f = fixture(); f.step({ tool: 2, fire: true });
    if (reason === 'wave') f.session.completeWave(1);
    if (reason === 'organ') { f.state.battle!.organId = 'lung'; f.step(); }
    if (reason === 'finish') f.session.finish(false, 'test');
    if (reason === 'restart') f.session.restart();
    if (reason === 'menu') f.session.menu();
    expect(f.session.state.traction).toBeUndefined();
    f.advance(30); expect(ofType(f, 'TRACTION_RESOLVED')).toHaveLength(0);
    expect(f.targets[0].hp).toBe(1000);
  });

  it.each(['pause', 'restart'] as const)('stops a blast transaction at a %s callback', action => {
    const f = fixture({}, [actor('first'), actor('second', 820, 500)]);
    let snapshot: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', event => {
      if (event.type === 'TARGET_HIT' && event.data.id === 'first') {
        if (action === 'pause') f.session.pause(); else f.session.restart();
        snapshot = f.session.snapshot();
      }
    });
    f.step({ tool: 2, fire: true }); f.advance(18);
    expect(snapshot).toBeDefined(); expect(f.session.snapshot()).toEqual(snapshot);
    expect(f.targets[1].hp).toBe(1000); expect(ofType(f, 'TRACTION_RESOLVED')).toHaveLength(0);
  });

  it('does not issue a stale RUN_PAUSED if cancellation callback restarts the run', () => {
    const f = fixture(); f.step({ tool: 2, fire: true }); let snapshot: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', event => { if (event.type === 'TRACTION_CANCELLED') { f.session.restart(); snapshot = f.session.snapshot(); } });
    f.session.pause(); expect(snapshot).toBeDefined(); expect(f.session.snapshot()).toEqual(snapshot);
    expect(ofType(f, 'RUN_PAUSED')).toHaveLength(0);
  });
});
