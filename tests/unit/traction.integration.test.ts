import { describe, expect, it } from 'vitest';
import { createEndlessGrowth } from '../../src/game/endlessGrowth';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target } from '../../src/game/types';

// Hidden training keeps its historical traction/guide rules. Active challenge is
// covered by player-projectiles-session and player-projectiles tests.
function fixture(nova = 0) {
  const session = new GameSession(71); session.start(); const state = session.state;
  state.world = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  Object.assign(state.player, { x: 500, y: 500 });
  const victim: Target = { id: 'legacy', x: 800, y: 500, role: 'virus', kind: 'single', radius: 22, hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false };
  state.targets = [victim]; state.endlessGrowth = createEndlessGrowth(71); state.endlessGrowth.ranks.nova = nova;
  const step = (extra: Partial<InputFrame> = {}) => session.step({ moveX: 0, moveY: 0, aim: victim, fire: false, ...extra });
  const advance = (count: number, extra: Partial<InputFrame> = {}) => { for (let i = 0; i < count; i++) step(extra); };
  return { session, state, victim, step, advance };
}

describe('hidden training traction regression', () => {
  it('keeps instantaneous primary fire and delayed traction damage', () => {
    const f = fixture(); f.step({ fire: true }); expect(f.victim.hp).toBe(966);
    expect(f.state.effects.some(effect => effect.kind === 'beam')).toBe(true);
    f.step({ tool: 2, fire: true }); expect(f.state.traction).toBeDefined(); expect(f.victim.hp).toBe(966);
    f.advance(18); expect(f.victim.hp).toBe(886); expect(f.state.traction).toBeUndefined();
    expect(f.state.playerProjectiles).toBeUndefined();
  });
  it('retains nova III hold guidance and does not repeat while held', () => {
    const f = fixture(3); f.step({ tool: 2, fire: true }); f.advance(12, { fire: true });
    expect(f.state.traction?.stage).toBe('guiding'); const before = f.state.player.x;
    f.step({ fire: true, moveX: 1, aim: { x: 850, y: 500 } });
    expect(f.state.player.x - before).toBeCloseTo(235 * .75 / 60);
    f.advance(180, { fire: true }); expect(f.state.events.filter(e => e.type === 'TRACTION_STARTED')).toHaveLength(1);
    f.step(); f.step({ fire: true }); expect(f.state.traction).toBeDefined();
  });
  it('cancels traction on pause and requires a new trigger release', () => {
    const f = fixture(3); f.step({ tool: 2, fire: true }); f.advance(12, { fire: true });
    f.session.pause(); expect(f.state.traction).toBeUndefined(); f.session.resume();
    f.advance(150, { fire: true }); expect(f.victim.hp).toBe(1000);
    f.step(); f.step({ fire: true }); expect(f.state.traction).toBeDefined();
  });
  it('ignores challenge charge intents while retaining the ordinary dash', () => {
    const f = fixture(); f.step({ dash: true, chargePressed: true, chargeHeld: true });
    f.advance(90, { chargeHeld: true }); f.step({ chargeReleased: true });
    expect(f.state.dashes).toBe(1); expect(f.state.chargedSlash).toBeUndefined();
    expect(f.state.events.some(e => e.type === 'PLAYER_CHARGE_RELEASED')).toBe(false);
  });
});
