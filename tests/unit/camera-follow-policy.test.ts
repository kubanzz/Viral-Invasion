import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/core/clock';
import { GameSession } from '../../src/game/session';
import { BALANCE, type Vec } from '../../src/game/types';
import { HEART_WORLD } from '../../src/game/organConfig';
import { Camera } from '../../src/render/camera';
import { CameraFollowPolicy } from '../../src/render/cameraFollowPolicy';

describe('presentation camera follow policy', () => {
  it('holds the displayed view through pause and resumes without a snap', () => {
    const policy = new CameraFollowPolicy(), point = { x: 600, y: 700 };
    expect(policy.next('run:heart', 'playing', point, 1 / 60, false)).toEqual({ hold: false, snap: true });
    expect(policy.next('run:heart', 'playing', { ...point, x: 604 }, 1 / 60, false)).toEqual({ hold: false, snap: false });
    expect(policy.next('run:heart', 'paused', { ...point, x: 604 }, 1 / 60, false)).toEqual({ hold: true, snap: false });
    expect(policy.next('run:heart', 'paused', { ...point, x: 604 }, 1 / 60, false)).toEqual({ hold: true, snap: false });
    expect(policy.next('run:heart', 'playing', { ...point, x: 604 }, 1 / 60, false)).toEqual({ hold: false, snap: false });
  });

  it('snaps on new run, organ, resize, long frames and large position changes', () => {
    const policy = new CameraFollowPolicy(), point = { x: 600, y: 700 };
    policy.next('run:heart', 'playing', point, 1 / 60, false);
    expect(policy.next('run:lung', 'playing', point, 1 / 60, false).snap).toBe(true);
    expect(policy.next('run:lung', 'playing', { ...point, x: 700 }, 1 / 60, false).snap).toBe(true);
    expect(policy.next('run:lung', 'playing', { ...point, x: 700 }, .3, true).snap).toBe(true);
    policy.reset();
    expect(policy.next('run:lung', 'paused', { ...point, x: 700 }, 0, false)).toEqual({ hold: false, snap: true });
  });

  it('smoothly follows four real dash steps between two display frames', () => {
    const session = new GameSession(17, { campaign: true, milestone: 'G3' }); session.start();
    Object.assign(session.state.player, { x: 1200, y: 1000 });
    const clock = new FixedClock(), policy = new CameraFollowPolicy(), camera = new Camera(1366, 768);
    const start = { x: session.state.player.x, y: session.state.player.y };
    const scope = 'run:heart';
    policy.next(scope, 'playing', start, 0, false);
    camera.follow(start, HEART_WORLD, { snap: true });
    clock.advance(0, () => {});
    const positions: Vec[] = [];
    const count = clock.advance(4 * BALANCE.step * 1000, dt => {
      positions.push({ x: session.state.player.x, y: session.state.player.y });
      session.step({ moveX: 1, moveY: 0, aim: { x: 1800, y: 1000 }, fire: false, dash: session.state.tick === 0 }, dt);
      positions.push({ x: session.state.player.x, y: session.state.player.y });
    });
    expect(count).toBe(4);
    expect(session.state.player.x - start.x).toBeCloseTo(52);
    const decision = policy.next(scope, session.state.phase, session.state.player, 4 * BALANCE.step, clock.discontinuity, positions);
    expect(decision).toEqual({ hold: false, snap: false });
    const oldPan = camera.panX;
    camera.follow(session.state.player, HEART_WORLD, { deltaSeconds: 4 * BALANCE.step, snap: decision.snap });
    const target = new Camera(1366, 768); target.follow(session.state.player, HEART_WORLD, { snap: true });
    expect(Math.abs(camera.panX - oldPan)).toBeGreaterThan(0);
    expect(Math.abs(camera.panX - oldPan)).toBeLessThan(Math.abs(target.panX - oldPan));
  });

  it('detects a real jump within a multi-step frame even if later movement cancels it', () => {
    const session = new GameSession(17, { campaign: true, milestone: 'G3' }); session.start();
    Object.assign(session.state.player, { x: 1200, y: 1000 });
    const clock = new FixedClock(), policy = new CameraFollowPolicy(), positions: Vec[] = [];
    policy.next('run:heart', 'playing', session.state.player, 0, false);
    clock.advance(0, () => {});
    clock.advance(2 * BALANCE.step * 1000, dt => {
      positions.push({ x: session.state.player.x, y: session.state.player.y });
      session.step({ moveX: 0, moveY: 0, aim: { x: 1800, y: 1000 }, fire: false }, dt);
      session.state.player.x += session.state.tick === 1 ? 100 : -100;
      positions.push({ x: session.state.player.x, y: session.state.player.y });
    });
    expect(session.state.player.x).toBe(1200);
    expect(policy.next('run:heart', session.state.phase, session.state.player, 2 * BALANCE.step, clock.discontinuity, positions).snap).toBe(true);
    // Also detect changes between frames which did not occur during a simulation step.
    session.state.player.x += 100;
    expect(policy.next('run:heart', 'playing', session.state.player, 1 / 144, false, []).snap).toBe(true);
  });
});
