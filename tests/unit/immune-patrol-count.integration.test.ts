import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
function setup(lamp: boolean) {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const state = session.state; state.world = world;
  Object.assign(state.player, { x: 500, y: 500 }); Object.assign(state.tissue, { x: 500, y: 750 });
  const target: Target = { id: 'focus-fixture', role: 'virus', kind: 'single', x: 700, y: 500, radius: 22,
    hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false };
  state.targets = [target]; state.growth!.equipped = lamp ? [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }] : [];
  const input: InputFrame = { moveX: 0, moveY: 0, fire: false, scan: true, aim: { x: 700, y: 500 } };
  return { session, state, input };
}

describe('actual endless patrol and squad admission', () => {
  it('keeps exactly one focused base patrol after the lamp has been removed, including combat-growth projection', () => {
    const f = setup(false); f.state.endlessGrowth!.ranks.immune = 2;
    f.session.step(f.input);
    expect(f.state.growth!.beacon!.mode).toBe('patrol');
    expect(f.state.growth!.cells).toHaveLength(1);
    expect(f.state.growth!.beacon!.focus?.targetId).toBe('focus-fixture');
    expect(f.state.growth!.beacon!.until - f.state.elapsed).toBeCloseTo(6);
    expect(f.state.events.some(e => e.type === 'ORGAN_INTEGRITY_CHANGED' && e.data.reason === 'protocol-pressure')).toBe(false);
    const id = f.state.growth!.cells![0].id;
    f.session.step(f.input);
    expect(f.state.scans).toBe(1); expect(f.state.growth!.cells).toHaveLength(1);
    expect(f.state.growth!.cells![0].id).toBe(id);
  });

  it('retains three real cells and the original organization cost for an equipped lamp', () => {
    const f = setup(true); f.session.step(f.input);
    expect(f.state.growth!.beacon!.mode).toBe('protocol');
    expect(f.state.growth!.cells).toHaveLength(3);
    const costs = f.state.events.filter(e => e.type === 'ORGAN_INTEGRITY_CHANGED' && e.data.reason === 'protocol-pressure');
    expect(costs).toHaveLength(1); expect(Number(costs[0].data.before) - Number(costs[0].data.after)).toBe(3);
  });
});
