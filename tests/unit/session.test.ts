import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BALANCE, type InputFrame, type Tool, type Vec } from '../../src/game/types';
import { distance } from '../../src/actors/collision';
import { dashTrailVisible } from '../../src/game/dashTrail';

const idle = (aim: Vec = { x: 700, y: 440 }): InputFrame => ({ moveX: 0, moveY: 0, aim, fire: false });
function wait(session: GameSession, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) session.step(idle());
}
function fire(session: GameSession, tool: Tool, aim: Vec) {
  session.step({ ...idle(aim), tool, fire: true });
}
function approach(session: GameSession, point: Vec) {
  for (let i = 0; i < 1000 && distance(session.state.player, point) > 6; i++) {
    const player = session.state.player;
    session.step({ ...idle(point), moveX: point.x - player.x, moveY: point.y - player.y });
  }
}

describe('training session', () => {
  it('rejects variable integration steps to keep movement and simulation time consistent', () => {
    const session = new GameSession();
    session.start();
    const before = session.snapshot();
    for (const dt of [0, -.1, .1, .02, Infinity, NaN]) session.step({ ...idle(), moveX: 1, fire: true }, dt);
    expect(session.snapshot()).toEqual(before);
    session.step({ ...idle(), moveX: 1 }, BALANCE.step);
    expect(session.state.elapsed).toBe(BALANCE.step);
    expect(session.state.player.x - before.player.x).toBeCloseTo(BALANCE.speed * BALANCE.step);
  });

  it('same seed plus same input produces identical states and events', () => {
    const sessions = [new GameSession(121), new GameSession(121)];
    sessions.forEach(session => {
      session.start();
      for (let tick = 0; tick < 600; tick++) {
        session.step({ moveX: tick < 90 ? 1 : 0, moveY: tick < 90 ? 1 : 0, aim: { x: 590, y: 330 }, fire: tick % 11 === 0, scan: tick === 100, dash: tick === 30 });
      }
    });
    expect(sessions[0].snapshot()).toEqual(sessions[1].snapshot());
    const other = new GameSession(122);
    expect(other.state.targets).not.toEqual(new GameSession(121).state.targets);
  });

  it('freezes all state and event counts during 30 seconds paused', () => {
    const session = new GameSession();
    session.start();
    session.step({ ...idle(), scan: true });
    session.pause();
    const paused = session.snapshot();
    for (let tick = 0; tick < 1800; tick++) session.step({ ...idle(), fire: true, dash: true, interact: true });
    expect(session.snapshot()).toEqual(paused);
    session.resume();
    session.step(idle());
    expect(session.state.tick).toBe(paused.tick + 1);
  });

  it('resets the run, cooldowns, events, effects and results with same or new seed', () => {
    const session = new GameSession(321);
    session.start();
    session.step({ ...idle(), scan: true, dash: true, fire: true });
    session.pause();
    session.resume();
    session.finish(false, 'test');
    session.restart();
    expect(session.state.phase).toBe('playing');
    expect(session.state.tick).toBe(0);
    expect(session.state.seed).toBe(321);
    expect(session.state.events.map(event => event.type)).toEqual(['RUN_STARTED']);
    expect(session.state.effects).toHaveLength(0);
    expect(session.state.cooldowns).toEqual({ 1: 0, 2: 0, 3: 0 });
    expect(session.state.scans).toBe(0);
    expect(session.state.result).toBeNull();
    session.restart(999);
    expect(session.state.seed).toBe(999);
    session.menu();
    expect(session.state.phase).toBe('menu');
    expect(session.state.events).toHaveLength(0);
    expect(session.state.player).toMatchObject({ x: 330, y: 440 });
  });

  it('finishes and emits RUN_ENDED only once', () => {
    const session = new GameSession();
    const received: string[] = [];
    session.bus.on('event', event => received.push(event.type));
    session.start();
    session.finish(false, 'first');
    session.finish(true, 'second');
    expect(session.state.result).toEqual({ success: false, reason: 'first' });
    expect(received.filter(type => type === 'RUN_ENDED')).toHaveLength(1);
  });

  it('moves equally fast on axes and diagonals; dash obeys its cooldown', () => {
    const axis = new GameSession();
    const diagonal = new GameSession();
    for (const session of [axis, diagonal]) session.start();
    const before = { x: 330, y: 440 };
    axis.step({ ...idle(), moveX: 1 });
    diagonal.step({ ...idle(), moveX: 1, moveY: 1 });
    expect(distance(axis.state.player, before)).toBeCloseTo(distance(diagonal.state.player, before));
    axis.step({ ...idle(), moveX: 1, dash: true });
    const first = axis.state.dashes;
    axis.step({ ...idle(), moveX: 1, dash: true });
    expect(axis.state.dashes).toBe(first);
    expect(axis.state.player.dashReady).toBeGreaterThan(axis.state.elapsed);
    wait(axis, BALANCE.dashCooldown);
    axis.step({ ...idle(), dash: true });
    expect(axis.state.dashes).toBe(2);
  });

  it('leaves dash segments only along the collision-resolved path', () => {
    const session = new GameSession(); session.start();
    const start = { x: session.state.player.x, y: session.state.player.y };
    session.step({ ...idle(), moveX: 1, dash: true });
    const first = session.state.effects.filter(effect => effect.kind === 'dash');
    expect(first).toHaveLength(1);
    expect(first[0].from).toEqual(start);
    expect(first[0].to).toEqual({ x: session.state.player.x, y: session.state.player.y });
    const previous = { ...first[0].to };
    session.step({ ...idle(), moveX: 1 });
    const segments = session.state.effects.filter(effect => effect.kind === 'dash');
    expect(segments.at(-1)!.from).toEqual(previous);
    expect(segments.at(-1)!.to).toEqual({ x: session.state.player.x, y: session.state.player.y });

    const blocked = new GameSession(); blocked.start();
    Object.assign(blocked.state.player, { x: 1135 - blocked.state.player.radius, y: 400 });
    blocked.step({ ...idle(), moveX: 1, dash: true });
    expect(blocked.state.effects.filter(effect => effect.kind === 'dash')).toHaveLength(0);
    const world = { width: 200, height: 200, bounds: { left: 0, right: 200, top: 0, bottom: 200 },
      obstacles: [{ id: 'fold', x: 100, y: 100, radius: 20 }], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    expect(dashTrailVisible({ x: 70, y: 100 }, { x: 130, y: 100 }, world)).toBe(false);
    expect(dashTrailVisible({ x: 70, y: 124 }, { x: 130, y: 124 }, world)).toBe(true);
    expect(dashTrailVisible({ x: 70, y: 122 }, { x: 130, y: 122 }, world)).toBe(false);
  });

  it.each([
    { dash: false, aimX: 332 },
    { dash: true, aimX: 340 },
  ])('keeps muzzle and shot aligned when movement crosses the aim point (dash=$dash)', ({ dash, aimX }) => {
    const session = new GameSession();
    session.start();
    session.step({ ...idle({ x: aimX, y: 440 }), moveX: 1, fire: true, dash });
    const state = session.state;
    const beam = state.effects.find(effect => effect.kind === 'beam')!;
    expect(state.player.x).toBeGreaterThan(aimX);
    expect(beam.from).toEqual({ x: state.player.x, y: state.player.y });
    expect(beam.to.x).toBeLessThan(beam.from.x);
    expect(state.player.facing).toBeCloseTo(Math.PI);
    expect(state.player.facing).toBeCloseTo(Math.atan2(beam.to.y - beam.from.y, beam.to.x - beam.from.x));
    const fired = state.events.find(event => event.type === 'TOOL_FIRED')!;
    expect(fired.data).toMatchObject({ tool: 1, x: aimX, y: 440 });
    if (dash) {
      // The dash still travels right from the original aim, even though the
      // player must turn the muzzle left after passing that nearby point.
      expect(state.player.x).toBe(330 + BALANCE.dashSpeed * BALANCE.step);
    }
  });

  it('aims the muzzle and shot from the resolved position after a collision', () => {
    const session = new GameSession();
    session.start();
    session.state.player.x = 440;
    session.state.player.y = 362;
    const aim = { x: 450, y: 300 };
    session.step({ ...idle(aim), moveY: -1, fire: true });
    const state = session.state;
    const desiredY = 362 - BALANCE.speed * BALANCE.step;
    expect(state.player.y).toBeGreaterThan(desiredY);
    expect(state.player.y).toBe(361); // visible fold radius 47 + player radius 19
    const beam = state.effects.find(effect => effect.kind === 'beam')!;
    const expected = Math.atan2(aim.y - state.player.y, aim.x - state.player.x);
    expect(state.player.facing).toBeCloseTo(expected, 10);
    expect(Math.atan2(beam.to.y - beam.from.y, beam.to.x - beam.from.x)).toBeCloseTo(expected, 10);
  });

  it('scan reveals in-range targets and cannot spam during cooldown', () => {
    const session = new GameSession();
    session.start();
    session.step({ ...idle(), scan: true });
    expect(session.state.targets.every(target => target.scanned)).toBe(true);
    expect(session.state.scans).toBe(1);
    session.step({ ...idle(), scan: true });
    expect(session.state.scans).toBe(1);
    expect(session.state.effects.some(effect => effect.kind === 'scan')).toBe(true);
  });

  it('offers a deterministic nonlethal training hit with a live hurt animation window', () => {
    const session = new GameSession();
    session.start();
    session.step({ ...idle(), practiceHit: true });
    expect(session.state.player.hp).toBe(95);
    expect(session.state.player.hurtUntil).toBeGreaterThan(session.state.elapsed);
    expect(session.state.events.at(-1)).toMatchObject({ type: 'PLAYER_HURT', data: { damage: 5, remainingHp: 95, reason: 'training-exercise' } });
    expect(session.state.tissue.hp).toBe(25);
    expect(session.state.targets.every(target => target.hp === target.maxHp)).toBe(true);
    wait(session, .6);
    expect(session.state.player.hurtUntil).toBeLessThan(session.state.elapsed);
    for (let i = 0; i < 30; i++) session.step({ ...idle(), practiceHit: true });
    expect(session.state.player.hp).toBe(1);
    expect(session.state.phase).toBe('playing');
    session.restart();
    expect(session.state.player.hp).toBe(100);
    expect(session.state.player.hurtUntil).toBe(0);
  });

  it('rejects wrong tools and out-of-range interactions without changing health', () => {
    const session = new GameSession();
    session.start();
    const target = session.state.targets[0];
    fire(session, 3, target);
    expect(target.hp).toBe(target.maxHp);
    expect(session.state.message).toContain('不能净化');
    fire(session, 1, session.state.tissue);
    expect(session.state.tissue.hp).toBe(25);
    expect(session.state.message).toContain('按 3');
    session.step({ ...idle(), interact: true });
    expect(session.state.result).toBeNull();
    expect(session.state.message).toContain('靠近');
    fire(session, 2, { x: 1130, y: 720 });
    expect(session.state.message).toContain('射程');
  });

  it('hits the nearest target in a line and blocks fire through visible obstacles', () => {
    const session = new GameSession();
    session.start();
    // Fixture positions exercise the ray rules independently of the seeded layout.
    session.state.targets[0].x = 500;
    session.state.targets[0].y = 440;
    session.state.targets[1].x = 600;
    session.state.targets[1].y = 440;
    fire(session, 1, { x: 650, y: 440 });
    expect(session.state.targets[0].hp).toBe(66);
    expect(session.state.targets[1].hp).toBe(60);
    session.state.player.x = 300;
    session.state.player.y = 295;
    session.state.targets[0].x = 560;
    session.state.targets[0].y = 295;
    wait(session, .2);
    fire(session, 1, session.state.targets[0]);
    expect(session.state.targets[0].hp).toBe(66);
    expect(session.state.message).toContain('挡住');
  });

  it('completes two target categories, tissue repair and nearby E retest using inputs', () => {
    const session = new GameSession(44);
    session.start();
    const single = session.state.targets[0];
    for (let i = 0; i < 3; i++) { fire(session, 1, single); wait(session, .2); }
    expect(single.hp).toBe(0);
    // Move clear of the fold, bringing the entire cluster within range.
    approach(session, { x: 570, y: 500 });
    fire(session, 2, { x: 840, y: 430 });
    wait(session, .30);
    expect(session.state.targets.every(target => target.hp === 0)).toBe(true);
    for (let i = 0; i < 3; i++) { fire(session, 3, session.state.tissue); wait(session, .72); }
    expect(session.state.tissue.hp).toBe(100);
    approach(session, { x: 340, y: 610 });
    session.step({ ...idle(), interact: true });
    expect(session.state.phase).toBe('result');
    expect(session.state.result?.success).toBe(true);
    expect(session.state.events.filter(event => event.type === 'TARGET_CLEARED')).toHaveLength(4);
    expect(session.state.events.filter(event => event.type === 'RUN_ENDED')).toHaveLength(1);
    const finished = session.snapshot();
    session.step({ ...idle(), interact: true });
    expect(session.snapshot()).toEqual(finished);
  });

  it('does not allow incomplete objectives at a nearby terminal', () => {
    const session = new GameSession();
    session.start();
    approach(session, session.state.terminal);
    session.step({ ...idle(), interact: true });
    expect(session.state.phase).toBe('playing');
    expect(session.state.message).toContain('还需净化');
  });
});
