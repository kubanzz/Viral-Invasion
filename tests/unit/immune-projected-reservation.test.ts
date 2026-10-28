import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { growthContext } from '../../src/game/growth';
import { advanceImmuneCells } from '../../src/game/immuneCells';
import type { GrowthCommand } from '../../src/game/growthTypes';
import type { InputFrame, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const target = (id: string, hp: number, x = 550): Target => ({ id, hp, maxHp: hp, x, y: 500, radius: 22, role: 'virus', kind: 'single', hitUntil: 0, scanned: false, traits: [], generation: 0, attackReady: 100 });
const input = (changes: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim: { x: 550, y: 500 }, ...changes });
function fixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const state = session.state;
  state.world = structuredClone(world); Object.assign(state.player, { x: 500, y: 500 });
  Object.assign(state.tissue, { x: 500, y: 750, hp: 100 });
  state.endlessGrowth!.ranks = { immune: 5, power: 5 };
  const weak = target('a-weak', 30), next = target('b-next', 100, 570); state.targets = [weak, next];
  session.step(input({ scan: true }));
  state.growth!.cells = state.growth!.cells!.map(cell => ({ ...cell, x: 550, y: 500, attackReadyAt: 0, attackUntil: 0, targetId: null, waypoint: null }));
  return { session, state, weak, next };
}

describe('immune planning reserves the actual projected host damage', () => {
  it('uses one scaled bite for a 30HP body, then lets the other two cells hit the nearby living body', () => {
    const { session, state, weak, next } = fixture();
    session.step(input());
    const hits = state.events.filter(event => event.tick === state.tick && event.type === 'TARGET_HIT' && event.data.protocolId === 'IMMUNE_BEACON');
    expect(hits.filter(event => event.data.id === weak.id)).toHaveLength(1);
    expect(hits.filter(event => event.data.id === next.id)).toHaveLength(2);
    expect(weak.hp).toBe(0); expect(next.hp).toBeCloseTo(100 - 2 * 8 * 1.9 * 2);
    expect(hits.every(event => Number(event.data.damage) > 0)).toBe(true);
    const bites = state.events.filter(event => event.tick === state.tick && event.type === 'PROTOCOL_BEACON_HIT');
    expect(bites).toHaveLength(3);
    expect(bites.every(event => hits.some(hit => hit.data.rootId === event.data.rootId && hit.data.id === event.data.targetId))).toBe(true);
  });

  it('returns only rejected late-bite clocks when one accepted physical bite detonates catalysis first', () => {
    const { session, state, weak, next } = fixture();
    state.endlessGrowth!.ranks.catalysis = 1; state.endlessGrowth!.ranks.nova = 1;
    for (const cell of state.growth!.cells!) cell.attackReadyAt = 100;
    session.step(input({ fire: true, tool: 2 }));
    expect(state.endlessGrowth!.pendingCatalysis).toBeDefined(); expect(weak.hp).toBe(22); expect(next.hp).toBe(92);
    state.growth!.cells = state.growth!.cells!.map(cell => ({ ...cell, x: 550, y: 500, attackReadyAt: 0, attackUntil: 0, waypoint: null }));
    const oldClocks = state.growth!.cells!.map(cell => ({ id: cell.id, ready: cell.attackReadyAt, until: cell.attackUntil }));
    session.step(input({ tool: 1 }));
    expect(weak.hp).toBe(0); expect(next.hp).toBe(0);
    const actual = state.events.filter(event => event.tick === state.tick && event.type === 'TARGET_HIT' && event.data.protocolId === 'IMMUNE_BEACON');
    const bites = state.events.filter(event => event.tick === state.tick && event.type === 'PROTOCOL_BEACON_HIT');
    const rejected = state.events.filter(event => event.tick === state.tick && event.type === 'IMMUNE_BITE_REJECTED');
    expect(actual).toHaveLength(1); expect(bites).toHaveLength(1); expect(bites[0].data.damage).toBe(actual[0].data.damage);
    expect(rejected).toHaveLength(2); expect(rejected.every(event => event.data.reason === 'target-already-cleared' && event.data.clockRefunded === true)).toBe(true);
    for (const event of rejected) {
      const cell = state.growth!.cells!.find(cell => cell.id === event.data.cellId)!, old = oldClocks.find(clock => clock.id === cell.id)!;
      expect(cell.attackReadyAt).toBe(old.ready); expect(cell.attackUntil).toBe(old.until);
    }
    const first = state.growth!.cells!.find(cell => cell.id === actual[0].data.immuneCellId)!;
    expect(first.attackReadyAt).toBeCloseTo(state.elapsed + first.interval);
    expect(state.events.filter(event => event.type === 'CATALYSIS_CONSUMED')).toHaveLength(1);
    expect(state.runMetrics!.summary.control.beaconBites).toBe(1);
  });

  it('does not report a planned late bite when an earlier accepted chain command clears its body in the same batch', () => {
    const { session, state, weak, next } = fixture();
    state.tick++; state.elapsed = state.tick / 60;
    // A narrow host-order fixture: real command application, no extra planner
    // invocation inside the host. Natural cascades are covered by catalysis above.
    const planned = advanceImmuneCells(state.growth!.cells!, state.growth!.beacon!, growthContext(state));
    state.growth!.cells = planned.cells;
    const before = state.growth!.cells!.map(cell => ({ id: cell.id, damage: cell.damage, interval: cell.interval }));
    const chain: GrowthCommand = { kind: 'damage', organId: 'heart', protocolId: 'PURIFY_CHAIN', rootId: 'earlier-chain', targetId: next.id, amount: 1000, cause: 'protocol', hop: 1 };
    (session as unknown as { applyGrowthCommands(commands: readonly GrowthCommand[]): void }).applyGrowthCommands([chain, ...planned.commands]);
    const rejected = state.events.filter(event => event.tick === state.tick && event.type === 'IMMUNE_BITE_REJECTED');
    expect(next.hp).toBe(0); expect(weak.hp).toBe(0); expect(rejected).toHaveLength(2);
    expect(state.events.filter(event => event.tick === state.tick && event.type === 'PROTOCOL_BEACON_HIT')).toHaveLength(1);
    for (const cell of state.growth!.cells!.slice(1)) {
      expect(cell.attackReadyAt).toBe(0); expect(cell.attackUntil).toBe(0);
      expect(cell.damage).toBe(before.find(old => old.id === cell.id)!.damage); expect(cell.interval).toBe(.8);
    }
    expect(state.events.filter(event => event.tick === state.tick && event.type === 'TARGET_HIT' && event.data.protocolId === 'IMMUNE_BEACON').map(event => event.data.id)).toEqual([weak.id]);
  });
});
