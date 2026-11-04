import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { drawTerritorySignals } from '../../src/render/fantasyTerritory';
import { drawPlayerDamage, drawPlayerDangerOverlay, recentPlayerHealing } from '../../src/render/playerDamageFeedback';
function fixture() {
  const game = new GameSession(741, { mode: 'endless', territory: true }); game.start();
  const state = game.state, spring = state.territory!.nodes.find(node => node.id === 'heart-healing-1')!;
  Object.assign(state.player, { x: spring.x + 65, y: spring.y + 30, hp: 70 });
  state.tick = 30; state.elapsed = .5;
  state.territory!.healingContact = { nodeId: spring.id, seconds: .5, healed: .05 };
  state.events = Array.from({ length: 30 }, (_, index) => ({ type: 'TERRITORY_PLAYER_HEALED', tick: index + 1,
    data: { nodeId: spring.id, amount: .05, remainingHp: 70 } }));
  return state;
}
function canvas() {
  const calls: { method: string; args: unknown[]; fill: unknown; stroke: unknown }[] = [];
  const styles: Record<string, unknown> = {};
  const ctx = new Proxy({}, { get: (_target, key) => key in styles ? styles[String(key)] : (...args: unknown[]) => {
    calls.push({ method: String(key), args, fill: styles.fillStyle, stroke: styles.strokeStyle });
  }, set: (_target, key, value) => { styles[String(key)] = value; return true; } }) as CanvasRenderingContext2D;
  return { ctx, calls };
}
describe('clear local treatment feedback', () => {
  it.each([false, true])('shows a merged actual heal number and treatment markers with low effects=%s', low => {
    const state = fixture(), { ctx, calls } = canvas(), before = JSON.stringify(state);
    drawTerritorySignals(ctx, state, low); drawPlayerDamage(ctx, state, low);
    expect(calls.filter(call => call.method === 'fillText' && String(call.args[0]).startsWith('+')).map(call => call.args[0])).toEqual(['+1.5']);
    expect(calls.some(call => call.method === 'ellipse' && call.args[2] === 150 && call.stroke === '#c0eac3dd')).toBe(true);
    expect(calls.some(call => call.method === 'fillRect')).toBe(true);
    expect(calls.some(call => call.method === 'lineTo' && call.args[0] === state.player.x && call.args[1] === state.player.y)).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('waits for half a second of real healing and holds the completed amount across the next partial window', () => {
    const state = fixture();
    state.tick = 29; state.elapsed = 29 / 60;
    expect(recentPlayerHealing(state)).toBeNull();
    state.tick = 30; state.elapsed = .5;
    expect(recentPlayerHealing(state)?.amount).toBeCloseTo(1.5);
    state.events.push({ type: 'TERRITORY_PLAYER_HEALED', tick: 31, data: { nodeId: state.territory!.healingContact.nodeId!, amount: .05 } });
    state.tick = 31; state.elapsed = 31 / 60;
    expect(recentPlayerHealing(state)?.amount).toBeCloseTo(1.5);
    state.tick = 60; state.elapsed = 1;
    expect(recentPlayerHealing(state)).toBeNull();
  });
  it('keeps healing right, every damage receipt left and the cure receipt near the feet', () => {
    const state = fixture(), { ctx, calls } = canvas();
    state.events.push({ type: 'PLAYER_HURT', tick: 29, data: { reason: 'infection', damage: 1 } },
      { type: 'PLAYER_HURT', tick: 30, data: { reason: 'attack', damage: 8 } },
      { type: 'PLAYER_INFECTION_CLEARED', tick: 30, data: { reason: 'healing' } });
    drawPlayerDamage(ctx, state, true);
    const labels = calls.filter(call => call.method === 'fillText');
    expect(labels.find(call => call.args[0] === '+1.5')?.args.slice(1)).toEqual([46, -50]);
    expect(labels.filter(call => String(call.args[0]).startsWith('−')).map(call => call.args[0])).toEqual(['−1', '−8']);
    expect(labels.filter(call => String(call.args[0]).startsWith('−')).every(call => Number(call.args[1]) < 0)).toBe(true);
    expect(labels.find(call => call.args[0] === '感染已解除')?.args.slice(1)).toEqual([0, 20]);
  });
  it('removes the infection veil and perimeter immediately on real cure while showing the cure receipt', () => {
    const state = fixture(), { ctx, calls } = canvas();
    state.playerInfection = null;
    state.events.push({ type: 'PLAYER_HURT', tick: 29, data: { reason: 'infection', damage: 1 } },
      { type: 'PLAYER_INFECTION_CLEARED', tick: 30, data: { reason: 'healing' } });
    drawPlayerDamage(ctx, state, true); drawPlayerDangerOverlay(ctx, state, 'healthy', 844, 390, { x: 422, y: 195 }, true);
    expect(calls.some(call => call.method === 'fillText' && call.args[0] === '感染已解除')).toBe(true);
    expect(calls.some(call => call.fill === '#39224644')).toBe(false);
    expect(calls.some(call => call.method === 'strokeRect' && call.stroke === '#8e59a4')).toBe(false);
  });
  it('uses the entering-ring marker even while new exposure prevents cleanse progress', () => {
    const state = fixture(), { ctx, calls } = canvas(); state.territory!.healingContact.seconds = 0;
    state.territory!.healingContact.exposure = true;
    drawTerritorySignals(ctx, state, true);
    expect(calls.some(call => call.method === 'ellipse' && call.args[2] === 27)).toBe(true);
  });
});
