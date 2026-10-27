import { describe, expect, it } from 'vitest';
import { BattleDirector } from '../../src/game/battle';
import { GameSession } from '../../src/game/session';
import { WORLD, type Target } from '../../src/game/types';

// These are isolated unit fixtures, not injected live browser states.
function pulseAt(x: number) {
  const session = new GameSession(13, { campaign: true, milestone: 'G1' });
  session.start();
  const target: Target = { id: 'push-fixture', kind: 'single', role: 'virus',
    x, y: 230, radius: 22, hp: 68, maxHp: 68, hitUntil: 0, scanned: false,
    traits: ['CARAPACE'], attackAt: 1, attackAim: { x: 730, y: 230 } };
  session.state.targets = [target];
  session.state.battle!.pulse.direction = 0;
  const before = { x: target.x, y: target.y };
  new BattleDirector(session).pulse();
  return { session, target, before, event: session.state.events.find(event => event.type === 'PULSE_TRIGGERED')! };
}

describe('accepted pulse displacement facts', () => {
  it('keeps exposure and interruption but reports zero pushes when the boundary prevents displacement', () => {
    const { session, target, before, event } = pulseAt(WORLD.bounds.right - 22);
    expect({ x: target.x, y: target.y }).toEqual(before);
    expect(event.data).toMatchObject({ pushed: 0, exposed: 1, coreHit: false });
    expect(target.exposedUntil).toBeGreaterThan(session.state.elapsed);
    expect(target.attackAt).toBeUndefined();
    expect(target.attackAim).toBeUndefined();
    expect(session.state.message).toContain('推开 0 体');
  });

  it('reports a push when an affected target actually moves and still respects the world boundary', () => {
    const { session, target, before, event } = pulseAt(900);
    expect(target.x).toBeGreaterThan(before.x + 1);
    expect(target.x).toBeLessThanOrEqual(WORLD.bounds.right - target.radius);
    expect(event.data).toMatchObject({ pushed: 1, exposed: 1 });
    expect(session.state.message).toContain('推开 1 体');
  });
});
