import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/core/clock';
import { GameSession } from '../../src/game/session';
import { MotionInterpolation } from '../../src/render/motionInterpolation';
import { Camera } from '../../src/render/camera';
import { HEART_WORLD, LUNG_WORLD } from '../../src/game/organConfig';
import { isLegalPosition } from '../../src/actors/collision';
import { WORLD } from '../../src/game/types';

const input = { moveX: 1, moveY: 0, aim: { x: 700, y: 440 }, fire: false };

describe('presentation motion', () => {
  it.each([60, 120, 144])('smooths %i Hz frames without changing simulation', rate => {
    const session = new GameSession(12); session.start();
    const reference = new GameSession(12); reference.start();
    const clock = new FixedClock(), motion = new MotionInterpolation();
    const positions: number[] = [];
    for (let frame = 0; frame <= rate; frame++) {
      clock.advance(frame * 1000 / rate, dt => motion.step(session.state, () => session.step(input, dt)));
      positions.push(motion.present(session.state, clock.alpha).player.x);
    }
    for (let i = 0; i < 60; i++) reference.step(input);
    expect(session.snapshot()).toEqual(reference.snapshot());
    // Once one simulation step has occurred, positions advance every display
    // frame instead of repeating the same fixed-step position at 120/144 Hz.
    const increments = positions.slice(Math.ceil(rate / 60) + 2).map((x, i, values) => i ? x - values[i - 1] : 0).slice(1);
    expect(Math.min(...increments)).toBeGreaterThan(0);
    expect(Math.max(...increments) - Math.min(...increments)).toBeLessThan(1e-6);
  });

  it('snaps after pause, teleport, restart or a changed organ, without modifying state', () => {
    const session = new GameSession(3); session.start();
    const motion = new MotionInterpolation();
    motion.step(session.state, () => session.step(input));
    const before = session.snapshot();
    expect(motion.present(session.state, .5).player.x).toBeLessThan(session.state.player.x);
    expect(session.snapshot()).toEqual(before);
    session.pause();
    expect(motion.present(session.state, .5)).toBe(session.state);
    session.resume();
    motion.step(session.state, () => { session.state.player.x += 100; session.state.tick++; });
    expect(motion.present(session.state, .5)).toBe(session.state);
    motion.step(session.state, () => { session.state.tick++; session.state.world = LUNG_WORLD; });
    expect(motion.present(session.state, .5)).toBe(session.state);
    session.restart();
    expect(motion.present(session.state, .5)).toBe(session.state);
  });

  it('preserves the full combat state for the same seed and fixed input sequence', () => {
    const displayed = new GameSession(91, { campaign: true, milestone: 'G3' }); displayed.start();
    const reference = new GameSession(91, { campaign: true, milestone: 'G3' }); reference.start();
    const motion = new MotionInterpolation();
    for (let tick = 0; tick < 600; tick++) {
      const frame = { moveX: tick % 180 < 90 ? 1 : -1, moveY: tick % 120 < 60 ? 1 : 0,
        aim: { x: 850, y: 1000 }, fire: tick % 3 !== 0, tool: 1 as const,
        dash: tick % 180 === 0, scan: tick % 240 === 0 };
      motion.step(displayed.state, () => displayed.step(frame));
      for (const alpha of [0, .25, .5, .75, 1]) motion.present(displayed.state, alpha);
      reference.step(frame);
    }
    expect(displayed.snapshot()).toEqual(reference.snapshot());
  });

  it('never draws the player inside a round obstacle while sliding around it', () => {
    const session = new GameSession(3); session.start();
    const obstacle = WORLD.obstacles[0], radius = obstacle.radius + session.state.player.radius;
    const around = (angle: number) => ({ x: obstacle.x + radius * Math.cos(angle), y: obstacle.y + radius * Math.sin(angle) });
    Object.assign(session.state.player, around(-.08));
    const motion = new MotionInterpolation();
    motion.step(session.state, () => { Object.assign(session.state.player, around(.08)); session.state.tick++; });
    const before = session.snapshot();
    for (const fraction of [.1, .25, .5, .75, .9]) {
      const rendered = motion.present(session.state, fraction).player;
      expect(isLegalPosition(rendered, rendered.radius, WORLD)).toBe(true);
      expect(rendered).toEqual(session.state.player);
    }
    expect(session.snapshot()).toEqual(before);
  });

  it('smooths camera movement without losing the pointer inverse and snaps on reset', () => {
    const camera = new Camera(1366, 768);
    const from = { x: 700, y: 700 }, to = { x: 1500, y: 700 };
    camera.follow(from, HEART_WORLD, { deltaSeconds: 1 / 60 });
    const before = camera.panX;
    camera.follow(to, HEART_WORLD, { deltaSeconds: 1 / 60 });
    const middle = camera.panX;
    camera.follow(to, HEART_WORLD, { snap: true });
    const final = camera.panX;
    expect(Math.abs(middle - before)).toBeGreaterThan(0);
    expect(Math.abs(middle - before)).toBeLessThan(Math.abs(final - before));
    const worldPoint = { x: 1380, y: 790 };
    const roundTrip = camera.screenToWorld(camera.worldToScreen(worldPoint));
    expect(roundTrip.x).toBeCloseTo(worldPoint.x, 8);
    expect(roundTrip.y).toBeCloseTo(worldPoint.y, 8);
    camera.follow(from, LUNG_WORLD, { snap: true });
    const fresh = new Camera(1366, 768); fresh.follow(from, LUNG_WORLD);
    expect(camera.panX).toBe(fresh.panX); expect(camera.panY).toBe(fresh.panY);
  });
});
