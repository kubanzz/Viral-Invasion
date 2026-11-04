import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { GrowthController } from '../../src/game/growth';
import type { GrowthContext } from '../../src/game/growthTypes';
import { activeImmuneGuard, IMMUNE_GUARD_BALANCE, selectImmuneGuardCommand } from '../../src/game/immuneFocus';
import { advanceImmuneCells, IMMUNE_CELL_BALANCE } from '../../src/game/immuneCells';
import { GROWTH_BALANCE } from '../../src/game/protocols';
import { createTerritoryState } from '../../src/game/territory';
import type { Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 85, right: 2315, top: 145, bottom: 1415 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
function context(changes: Partial<GrowthContext> = {}): GrowthContext {
  return { endless: true, territory: createTerritoryState(), immuneRank: 0, active: true, tick: 1, elapsed: 1 / 60,
    organId: 'heart', rhythm: 'rest', player: { x: 1050, y: 330 }, aim: { x: 1150, y: 330 },
    tissue: { x: 1200, y: 900, hp: 100, maxHp: 100, radius: 43 }, deviceOrigin: { x: 1100, y: 600 },
    targets: [], tool: 1, geometry: world, ...changes };
}
const controller = () => new GrowthController(71, 'territory-guard', { version: 1, starterProtocolId: 'IMMUNE_BEACON' }, 'endless');
const enemy = (id: string, x: number, y: number, changes: Partial<Target> = {}): Target => ({
  id, x, y, role: 'virus', kind: 'single', hp: 1000, maxHp: 1000, radius: 22, hitUntil: 0, scanned: false, ...changes,
});

describe('basic territory region guard', () => {
  it('accepts healthy core, facilities and permanently purified sources without immune rank III', () => {
    const ctx = context();
    for (const id of ['core', 'heart-healing-1', 'front-north', 'source-west'] as const) {
      const node = ctx.territory!.nodes.find(region => region.id === id)!;
      if (node.kind === 'source') { node.owner = 'healthy'; node.permanent = true; }
      if (node.kind === 'front') node.owner = 'healthy';
      const order = selectImmuneGuardCommand({ ...ctx, player: { x: node.x - 100, y: node.y }, aim: node });
      expect(order).toEqual({ anchor: { x: node.x - 100, y: node.y }, guard: { kind: 'territory', regionId: id, radius: 300 } });
      expect(selectImmuneGuardCommand({ ...ctx, player: { x: node.x - 100, y: node.y }, aim: { x: NaN, y: Infinity } })).toEqual(order);
    }
    const south = ctx.territory!.nodes.find(region => region.id === 'heart-healing-2')!;
    south.owner = 'infected';
    expect(selectImmuneGuardCommand({ ...ctx, player: south, aim: south })).toMatchObject({ anchor: { x: south.x, y: south.y }, guard: { kind: 'ground' } });
    expect(selectImmuneGuardCommand({ ...ctx, active: false })).toBeUndefined();
    expect(selectImmuneGuardCommand({ ...ctx, player: { x: 499.999, y: 330 } })?.guard.kind).toBe('ground');
    expect(selectImmuneGuardCommand({ ...ctx, aim: { x: 2000, y: 1300 } })?.guard).toEqual({ kind: 'territory', regionId: 'heart-healing-1', radius: 300 });
    expect(selectImmuneGuardCommand({ ...ctx, geometry: { ...world, obstacles: [{ id: 'sealed', x: 1150, y: 330, radius: 50 }] } })?.guard.kind).toBe('ground');
  });

  it('births the beacon and all real bodies at the player rather than the distant reticle', () => {
    const own = controller(), ctx = context({ player: { x: 500, y: 330 } });
    const commands = own.onScan(ctx), beacon = own.state.beacon!;
    expect(beacon).toMatchObject({ x: 500, y: 330, guard: { kind: 'ground', radius: 300 } });
    expect(own.state.cells).toHaveLength(3);
    for (const cell of own.state.cells!) {
      expect(distance(cell, ctx.player)).toBeLessThanOrEqual(30 + 1e-7);
      expect(distance(cell, ctx.aim)).toBeGreaterThan(500);
    }
    expect(commands.find(command => command.kind === 'log' && command.type === 'IMMUNE_GUARD_ASSIGNED'))
      .toMatchObject({ data: { x: ctx.player.x, y: ctx.player.y, newSquad: true } });
  });

  it('continues an accepted guard at the same anchor when ownership is lost and the player leaves', () => {
    const own = controller(), ctx = context(); own.onScan(ctx);
    const beacon = own.state.beacon!, identity = own.state.cells!.map(cell => cell.id);
    ctx.territory!.nodes.find(region => region.id === 'heart-healing-1')!.owner = 'infected';
    ctx.player = { x: 2200, y: 1300 }; ctx.elapsed = 2 / 60; ctx.tick = 2;
    expect(activeImmuneGuard(beacon, { ...ctx, active: false })).toBe(true);
    own.afterInput(ctx);
    expect(own.state.beacon).toMatchObject({ x: 1050, y: 330, guard: { kind: 'territory', regionId: 'heart-healing-1' } });
    expect(own.state.cells!.map(cell => cell.id)).toEqual(identity);
    expect(ctx.territory!.nodes.find(region => region.id === 'heart-healing-1')!.owner).toBe('infected');
    ctx.territory!.nodes = ctx.territory!.nodes.filter(region => region.id !== 'heart-healing-1');
    expect(activeImmuneGuard(own.state.beacon, ctx)).toBe(false);
  });

  it('prioritizes that region’s invader over a traced nearby enemy and keeps the existing finite guard radius', () => {
    const own = controller(), ctx = context(); own.onScan(ctx);
    const beacon = own.state.beacon!, ordinary = enemy('traced', 1100, 240);
    const intruder = enemy('invader', 1320, 330, { territorySourceId: 'source-west', territoryTask: { kind: 'invade', nodeId: 'heart-healing-1' } });
    const result = advanceImmuneCells(own.state.cells!, beacon, { ...ctx, tick: 2, elapsed: 2 / 60, targets: [ordinary, intruder] }, [ordinary.id]);
    expect(result.cells.every(cell => cell.targetId === intruder.id)).toBe(true);
    expect(result.commands.some(command => command.kind === 'damage')).toBe(false);
    intruder.x = beacon.x + IMMUNE_GUARD_BALANCE.radius + intruder.radius + .001;
    const outside = advanceImmuneCells(own.state.cells!, beacon, { ...ctx, tick: 2, elapsed: 2 / 60, targets: [intruder] });
    expect(outside.cells.every(cell => cell.targetId === null)).toBe(true);
    for (const cell of result.cells) expect(distance(cell, own.state.cells!.find(previous => previous.id === cell.id)!))
      .toBeLessThanOrEqual(300 / 60 + 1e-7);
  });

  it('prioritizes invaders actually redirected to the core, and drops that core priority once the facility is healthy again', () => {
    const ctx = context({ player: { x: 1200, y: 900 }, aim: { x: 2000, y: 330 } }), own = controller();
    const north = ctx.territory!.nodes.find(region => region.id === 'heart-healing-1')!;
    north.owner = 'infected'; own.onScan(ctx);
    const beacon = own.state.beacon!, cells = own.state.cells!;
    expect(beacon.guard).toMatchObject({ kind: 'territory', regionId: 'core' });
    const near = enemy('ordinary-near-core', 1230, 900);
    const invader = enemy('redirected-invader', 1430, 900, {
      territorySourceId: 'source-west', territoryTask: { kind: 'invade', nodeId: north.id },
    });
    const next = { ...ctx, tick: 2, elapsed: 2 / 60, targets: [near, invader] };
    expect(advanceImmuneCells(cells, beacon, next).cells.every(cell => cell.targetId === invader.id)).toBe(true);
    north.owner = 'healthy';
    expect(advanceImmuneCells(cells, beacon, next).cells.every(cell => cell.targetId === near.id)).toBe(true);
    // The original facility still owns an accepted guard order after being lost.
    const originalGuard = { ...beacon, x: north.x, y: north.y, guard: { kind: 'territory' as const, regionId: north.id, radius: 300 } };
    north.owner = 'infected';
    const passingInvader = { ...invader, x: north.x + 200, y: north.y }, localOrdinary = enemy('local', north.x + 20, north.y);
    expect(advanceImmuneCells(cells, originalGuard, { ...next, targets: [localOrdinary, passingInvader] }).cells.every(cell => cell.targetId === localOrdinary.id)).toBe(true);
    localOrdinary.x = north.x + 90;
    expect(advanceImmuneCells(cells, originalGuard, { ...next, targets: [localOrdinary, passingInvader] }).cells.every(cell => cell.targetId === invader.id)).toBe(true);
    expect(originalGuard.x).toBe(north.x); expect(originalGuard.y).toBe(north.y);
  });

  it('recognizes a real tissue windup as a core threat without promoting stale or unrelated attacks', () => {
    const ctx = context({ player: { x: 1200, y: 900 }, aim: { x: 2000, y: 330 } }), own = controller(); own.onScan(ctx);
    const near = enemy('ordinary-near-core', 1230, 900);
    const winding = enemy('winding-core-attacker', 1430, 900, { attackTarget: 'tissue', attackAt: 1 });
    const next = { ...ctx, tick: 2, elapsed: 2 / 60, targets: [near, winding] };
    expect(advanceImmuneCells(own.state.cells!, own.state.beacon!, next).cells.every(cell => cell.targetId === winding.id)).toBe(true);
    winding.attackAt = 0;
    expect(advanceImmuneCells(own.state.cells!, own.state.beacon!, next).cells.every(cell => cell.targetId === near.id)).toBe(true);
    winding.attackAt = 1; winding.attackTarget = 'player';
    expect(advanceImmuneCells(own.state.cells!, own.state.beacon!, next).cells.every(cell => cell.targetId === near.id)).toBe(true);
  });

  it('changes an existing order on Q without restoring HP, moving bodies or resetting bite and summon clocks', () => {
    const own = controller(), ctx = context(); own.onScan(ctx);
    for (const cell of own.state.cells!) { cell.hp = 17; cell.attackReadyAt = 4; }
    const before = structuredClone(own.state), victim = enemy('focus', 1300, 330);
    own.onScan({ ...ctx, player: { x: 500, y: 900 }, tick: 120, elapsed: 2, aim: victim, targets: [victim] });
    expect(own.state.beacon!.guard).toMatchObject({ kind: 'ground' }); expect(own.state.beacon!.focus).toBeUndefined();
    expect(own.state.beacon).toMatchObject({ x: 500, y: 900 });
    expect(own.state.beacon!.until).toBe(before.beacon!.until); expect(own.state.beaconReadyAt).toBe(before.beaconReadyAt);
    expect(own.state.cells!.map(cell => ({ id: cell.id, x: cell.x, y: cell.y, hp: cell.hp, attackReadyAt: cell.attackReadyAt, until: cell.until })))
      .toEqual(before.cells!.map(cell => ({ id: cell.id, x: cell.x, y: cell.y, hp: cell.hp, attackReadyAt: cell.attackReadyAt, until: cell.until })));
    expect(own.state.cells!.every(cell => cell.radius === IMMUNE_CELL_BALANCE.radius)).toBe(true);
  });

  it('preserves old non-territory rank gates and does not grant a guard to a one-cell patrol', () => {
    expect(selectImmuneGuardCommand(context({ territory: undefined, aim: { x: 1200, y: 900 } }))).toBeUndefined();
    const own = new GrowthController(71), ctx = context(); own.state.equipped = []; own.onScan(ctx);
    expect(own.state.beacon!.guard).toBeUndefined(); expect(own.state.cells).toHaveLength(1);
  });

  it('redirects the nearest of two legions to the feet, preserving casualties, bodies, HP and bite clocks', () => {
    const own = controller(), ctx = context();
    const north = ctx.territory!.nodes.find(node => node.id === 'front-north')!, south = ctx.territory!.nodes.find(node => node.id === 'front-south')!;
    north.owner = 'healthy'; south.owner = 'healthy';
    own.onScan({ ...ctx, player: north, aim: south });
    const first = own.state.beacon!.id;
    own.onScan({ ...ctx, tick: 1200, elapsed: 20, player: south, aim: north });
    expect(own.state.beacons).toHaveLength(2);
    for (const [index, cell] of own.state.cells!.entries()) { cell.hp = 11 + index; cell.attackReadyAt = 40 + index; cell.targetId = 'existing-enemy'; }
    own.state.cells![0].hp = 0;
    const before = structuredClone(own.state), player = { x: north.x + 30, y: north.y + 250 };
    const commands = own.onScan({ ...ctx, tick: 1800, elapsed: 30, player, aim: south });
    expect(own.state.beacons).toHaveLength(2); expect(own.state.beacon!.id).toBe(first);
    expect(own.state.beacon).toMatchObject({ ...player, guard: { kind: 'ground' } });
    expect(own.state.beaconReadyAt).toBe(before.beaconReadyAt);
    expect(own.state.cells!.map(cell => ({ id: cell.id, hp: cell.hp, maxHp: cell.maxHp, x: cell.x, y: cell.y, attackReadyAt: cell.attackReadyAt, until: cell.until })))
      .toEqual(before.cells!.filter(cell => (cell.hp ?? 0) > 0).map(cell => ({ id: cell.id, hp: cell.hp, maxHp: cell.maxHp, x: cell.x, y: cell.y, attackReadyAt: cell.attackReadyAt, until: cell.until })));
    expect(own.state.cells).toHaveLength(5); expect(own.state.cells!.some(cell => cell.id === before.cells![0].id)).toBe(false);
    expect(commands.find(command => command.kind === 'log' && command.type === 'IMMUNE_SQUAD_REDIRECTED'))
      .toMatchObject({ data: { previousRegionId: 'front-north', withdrewFront: true, footDeployment: true, cost: 0 } });
    const oldCells = before.cells!.filter(cell => cell.beaconId === first && (cell.hp ?? 0) > 0);
    const next = advanceImmuneCells(own.state.cells!, own.state.beacon!, { ...ctx, elapsed: 30 + 1 / 60, tick: 1801, player });
    for (const cell of next.cells.filter(cell => cell.beaconId === first)) {
      const previous = oldCells.find(item => item.id === cell.id)!;
      expect(distance(cell, previous)).toBeLessThanOrEqual(300 / 60 + 1e-7);
      expect(distance(cell, previous)).toBeGreaterThan(0);
    }
  });
});
