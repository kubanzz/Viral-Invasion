import { describe, expect, it } from 'vitest';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { GrowthController, growthContext } from '../../src/game/growth';
import type { BeaconState, GrowthContext } from '../../src/game/growthTypes';
import { activeImmuneGuard, IMMUNE_GUARD_BALANCE as GUARD } from '../../src/game/immuneFocus';
import { advanceImmuneCells, ENDLESS_IMMUNE_CELL_BALANCE, IMMUNE_CELL_BALANCE } from '../../src/game/immuneCells';
import { GROWTH_BALANCE } from '../../src/game/protocols';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 3000, height: 1800, bounds: { left: 30, right: 2970, top: 30, bottom: 1770 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, x: number, y: number, changes: Partial<Target> = {}): Target => ({ id, x, y, radius: 22, hp: 1000, maxHp: 1000,
  role: 'virus', kind: 'single', hitUntil: 0, scanned: false, traits: [], generation: 0, attackReady: 100, ...changes });
const input = (changes: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim: { x: 500, y: 750 }, ...changes });
function fixture(rank = 3, targets: Target[] = []) {
  const session = new GameSession(71, { mode: 'endless' }); session.start(); const state = session.state;
  state.world = structuredClone(world); Object.assign(state.player, { x: 500, y: 500 });
  Object.assign(state.tissue, { x: 500, y: 750, hp: 100 }); state.targets = targets;
  state.endlessGrowth!.ranks = { immune: rank };
  Object.assign(state.endless!, { phase: 'combat', remainingToSpawn: 1, nextSpawnAt: 1000 });
  return { session, state };
}
const ctx = (changes: Partial<GrowthContext> = {}): GrowthContext => ({ endless: true, immuneRank: 3, cellDamageMultiplier: 1.6, active: true, tick: 1, elapsed: 1 / 60,
  organId: 'heart', rhythm: 'rest', player: { x: 500, y: 500 }, aim: { x: 500, y: 750 },
  tissue: { x: 500, y: 750, hp: 100, maxHp: 100, radius: 43 }, deviceOrigin: { x: 500, y: 650 }, targets: [], tool: 1, geometry: world, ...changes });

describe('immune III tissue guard is a real Q operation', () => {
  it('unlocks only at immune3 and preserves ordinary Q for lower rank, patrol and campaign contexts', () => {
    for (const rank of [0, 2, 3]) {
      const controller = new GrowthController(71); controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
      const commands = controller.onScan(ctx({ immuneRank: rank }));
      expect(!!controller.state.beacon!.guard).toBe(rank >= GUARD.minimumRank);
      expect(commands.some(command => command.kind === 'log' && command.type === 'IMMUNE_GUARD_ASSIGNED')).toBe(rank >= GUARD.minimumRank);
    }
    for (const changes of [{ endless: false }, { immuneRank: 2 }, { player: { x: 500, y: 99 } }, { aim: { x: 500 + 43 + GUARD.aimTolerance + .01, y: 750 } }]) {
      const controller = new GrowthController(71); controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
      controller.onScan(ctx(changes)); expect(controller.state.beacon!.guard).toBeUndefined();
    }
    const patrol = new GrowthController(71); patrol.state.equipped = []; patrol.onScan(ctx());
    expect(patrol.state.beacon!.mode).toBe('patrol'); expect(patrol.state.beacon!.guard).toBeUndefined();
    expect(patrol.state.cells).toHaveLength(1);
  });

  it('accepts a 650 guard order but births the same three units only at the wall-clipped 420 deployment point', () => {
    const controller = new GrowthController(71); controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    const context = ctx({ player: { x: 500, y: 100 } }); controller.onScan(context);
    const origin = controller.state.beacon!;
    expect(origin).toMatchObject({ x: 500, y: 750, guard: { kind: 'tissue', radius: 300 }, deploymentOrigin: { x: 500, y: 520 } });
    expect(controller.state.cells).toHaveLength(3);
    for (const cell of controller.state.cells!) {
      expect(distance(cell, context.player)).toBeLessThanOrEqual(GROWTH_BALANCE.beaconPlacementRange + 30);
      expect(distance(cell, context.tissue)).toBeGreaterThan(150);
    }
    const blocked = new GrowthController(71); blocked.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    blocked.onScan(ctx({ geometry: { ...world, obstacles: [{ id: 'fold', x: 500, y: 625, radius: 40 }] } }));
    expect(blocked.state.beacon!.guard).toBeTruthy();
    expect(blocked.state.beacon!.deploymentOrigin!.y).toBeCloseTo(567);
    expect(blocked.state.cells!.every(cell => cell.y < 625)).toBe(true);
  });

  it('keeps guarding within 300 after real player travel beyond 650 and prioritizes the tissue attacker at actual bite contact', () => {
    const assault = actor('assault', 700, 750, { assaultObjective: 'tissue' });
    const ordinary = actor('near-ordinary', 500, 710), outside = actor('outside-guard', 1100, 750, { assaultObjective: 'tissue' });
    const { session, state } = fixture(3, [ordinary, outside, assault]);
    session.step(input({ scan: true })); expect(state.growth!.beacon!.guard).toBeTruthy();
    expect(state.message).toContain('组织驻防指令已受理');
    const assigned = state.events.find(event => event.type === 'IMMUNE_GUARD_ASSIGNED')!;
    expect(assigned.data).not.toHaveProperty('until');
    expect(Number(assigned.data.plannedUntil)).toBeLessThan(state.growth!.beacon!.until);
    expect(state.growth!.cells!.every(cell => cell.targetId === assault.id)).toBe(true);
    const until = state.growth!.beacon!.until, ready = state.growth!.beaconReadyAt, identities = state.growth!.cells!.map(cell => cell.id);
    let remoteHits = 0;
    for (let frame = 0; frame < 300 && state.phase === 'playing'; frame++) {
      const previous = structuredClone(state.growth!.cells!); session.step(input({ moveX: 1 }));
      for (const cell of state.growth!.cells!) expect(distance(cell, previous.find(unit => unit.id === cell.id)!)).toBeLessThanOrEqual(ENDLESS_IMMUNE_CELL_BALANCE.pursuitSpeed / 60 + 1e-7);
      for (const event of state.events.filter(event => event.tick === state.tick && event.type === 'PROTOCOL_BEACON_HIT')) {
        const cell = state.growth!.cells!.find(unit => unit.id === event.data.cellId)!, target = state.targets.find(target => target.id === event.data.targetId)!;
        const gap = distance(cell, target), block = wallHit(cell, normalized(target.x - cell.x, target.y - cell.y), gap, world);
        expect(gap).toBeLessThanOrEqual(cell.radius + target.radius + IMMUNE_CELL_BALANCE.biteReach + 1e-7);
        expect(block === null || block >= gap - target.radius).toBe(true);
        if (distance(state.player, state.tissue) > 650) remoteHits++;
      }
    }
    expect(state.phase).toBe('playing'); expect(distance(state.player, state.tissue)).toBeGreaterThan(650);
    expect(activeImmuneGuard(state.growth!.beacon, growthContext(state))).toBe(true);
    expect(remoteHits).toBeGreaterThan(0); expect(assault.hp).toBeLessThan(1000);
    expect(state.growth!.cells!.map(cell => cell.id)).toEqual(identities);
    expect(state.growth!.beacon!.until).toBe(until); expect(state.growth!.beaconReadyAt).toBe(ready);
    expect(state.events.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'protocol-pressure')).toHaveLength(1);
  });

  it('keeps guard selection bounded, prefers tissue assaults over trace, and uses trace priority among ordinary targets', () => {
    const assault = actor('assault', 750, 750, { assaultObjective: 'tissue' }), traced = actor('traced', 540, 750);
    const controller = new GrowthController(71); controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    const context = ctx({ targets: [traced, assault] }); controller.onScan(context);
    const origin = controller.state.beacon!, initial = controller.state.cells!;
    let result = advanceImmuneCells(initial, origin, { ...context, tick: 2, elapsed: 2 / 60 }, [traced.id]);
    expect(result.cells.every(cell => cell.targetId === assault.id)).toBe(true);
    const near = actor('ordinary', 505, 750); result = advanceImmuneCells(initial, origin, { ...context, tick: 2, elapsed: 2 / 60, targets: [near, traced] }, [traced.id]);
    expect(result.cells.every(cell => cell.targetId === traced.id)).toBe(true);
    const outside = actor('outside', 500 + GUARD.radius + 22 + .01, 750, { assaultObjective: 'tissue' });
    result = advanceImmuneCells(initial, origin, { ...context, tick: 2, elapsed: 2 / 60, targets: [outside] });
    expect(result.cells.every(cell => cell.targetId === null)).toBe(true); expect(result.commands.some(command => command.kind === 'damage')).toBe(false);
  });

  it('redirects the existing squad from guard back to focus or empty ground without restoring any clock or lifespan', () => {
    const target = actor('held-target', 700, 750), controller = new GrowthController(71);
    controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }]; controller.onScan(ctx({ targets: [target] }));
    const old = structuredClone(controller.state), context = ctx({ tick: 181, elapsed: 181 / 60, targets: [target], aim: target });
    const commands = controller.onScan(context);
    expect(controller.state.beacon!.guard).toBeUndefined(); expect(controller.state.beacon!.focus?.targetId).toBe(target.id);
    expect(controller.state.cells!.map(cell => ({ id: cell.id, x: cell.x, y: cell.y, until: cell.until, attackReadyAt: cell.attackReadyAt })))
      .toEqual(old.cells!.map(cell => ({ id: cell.id, x: cell.x, y: cell.y, until: cell.until, attackReadyAt: cell.attackReadyAt })));
    expect(controller.state.beacon!.until).toBe(old.beacon!.until); expect(controller.state.beaconReadyAt).toBe(old.beaconReadyAt);
    expect(commands.some(command => command.kind === 'damage' || command.kind === 'organCost')).toBe(false);
    controller.onScan({ ...context, tick: 182, elapsed: 182 / 60, aim: { x: 600, y: 650 } });
    expect(controller.state.beacon!.guard).toBeUndefined(); expect(controller.state.beacon!.focus).toBeUndefined();
  });

  it('obeys real Q cooldown before releasing guard into a focused order and physically moves the same squad', () => {
    const assault = actor('assault', 700, 750, { assaultObjective: 'tissue' }), next = actor('new-focus', 950, 500);
    const { session, state } = fixture(3, [assault, next]);
    session.step(input({ scan: true }));
    const id = state.growth!.beacon!.id, until = state.growth!.beacon!.until, summonReady = state.growth!.beaconReadyAt;
    session.step(input({ scan: true, aim: next }));
    expect(state.scans).toBe(1); expect(state.growth!.beacon!.guard).toBeTruthy();
    while (state.elapsed < state.scanReady && state.phase === 'playing') session.step(input());
    const previous = structuredClone(state.growth!.cells!);
    session.step(input({ scan: true, aim: next }));
    expect(state.scans).toBe(2); expect(state.growth!.beacon!.guard).toBeUndefined();
    expect(state.growth!.beacon!.focus?.targetId).toBe(next.id); expect(state.message).toContain('围猎指令已下达');
    expect(state.growth!.beacon!.id).toBe(id); expect(state.growth!.beacon!.until).toBe(until); expect(state.growth!.beaconReadyAt).toBe(summonReady);
    for (const cell of state.growth!.cells!) {
      const old = previous.find(unit => unit.id === cell.id)!;
      expect(distance(cell, old)).toBeLessThanOrEqual(ENDLESS_IMMUNE_CELL_BALANCE.rallySpeed / 60 + 1e-7);
      expect(cell.until).toBe(old.until); expect(cell.attackReadyAt).toBe(old.attackReadyAt);
    }
    expect(state.events.filter(event => event.type === 'IMMUNE_GUARD_ASSIGNED')).toHaveLength(1);
    expect(state.events.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'protocol-pressure')).toHaveLength(1);
  });

  it('rolls back rejected guard orders and clears them on wave clear, tissue loss, expiry and organ change', () => {
    const controller = new GrowthController(71); controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    controller.onScan(ctx({ aim: { x: 700, y: 500 } })); const before = structuredClone(controller.state);
    const context = ctx({ tick: 180, elapsed: 3 }); controller.state.budgetTick = context.tick; controller.state.budgetUsed = GROWTH_BALANCE.commandBudget;
    expect(controller.onScan(context)).toEqual([]); expect(controller.state.beacon).toEqual(before.beacon); expect(controller.state.cells).toEqual(before.cells);
    for (const reason of ['wave', 'tissue', 'expiry', 'organ', 'ended'] as const) {
      const own = new GrowthController(71); own.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }]; own.onScan(ctx());
      const ready = own.state.beaconReadyAt;
      if (reason === 'wave' || reason === 'ended') own.recordEvent({ type: reason === 'wave' ? 'ENDLESS_WAVE_CLEARED' : 'RUN_ENDED', tick: 2, data: {} }, ctx({ tick: 2, elapsed: 2 / 60 }));
      else own.afterInput(ctx({ tick: 1200, elapsed: reason === 'expiry' ? 20 : 1, organId: reason === 'organ' ? 'lung' : 'heart', tissue: { ...context.tissue, hp: reason === 'tissue' ? 0 : 100 } }));
      expect(own.state.beacon).toBeNull(); expect(own.state.cells).toEqual([]); expect(own.state.beaconReadyAt).toBe(ready);
    }
  });

  it('freezes accepted guard and actual cells during real paused session steps', () => {
    const { session, state } = fixture(3, [actor('live', 700, 750, { assaultObjective: 'tissue' })]);
    session.step(input({ scan: true })); session.pause(); const before = session.snapshot();
    for (let frame = 0; frame < 60; frame++) session.step(input({ scan: true, moveX: 1 }));
    expect(session.snapshot()).toEqual(before);
  });
});
