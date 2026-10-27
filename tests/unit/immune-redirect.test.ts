import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { GrowthController } from '../../src/game/growth';
import type { GrowthContext } from '../../src/game/growthTypes';
import { IMMUNE_CELL_BALANCE } from '../../src/game/immuneCells';
import { GROWTH_BALANCE } from '../../src/game/protocols';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, x: number, y: number): Target => ({ id, x, y, role: 'source', kind: 'single', radius: 22, hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false, traits: [] });
const context = (): GrowthContext => ({ active: true, tick: 1, elapsed: 1 / 60, organId: 'heart', rhythm: 'rest', player: { x: 500, y: 500 }, aim: { x: 400, y: 500 }, deviceOrigin: { x: 500, y: 700 }, tissue: { x: 500, y: 700, hp: 100, maxHp: 100, radius: 43 }, targets: [], tool: 1, geometry: world });
const input = (extra: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim: { x: 700, y: 500 }, ...extra });

describe('accepted Q immune squad redirection', () => {
  it('clips the new anchor exactly like deployment while preserving the same physical squad and every combat clock', () => {
    const controller = new GrowthController(71);
    controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }, { id: 'EXPOSE_TRACE', tuning: 'balanced' }];
    controller.onScan(context());
    const before = structuredClone(controller.state), ctx = { ...context(), tick: 181, elapsed: 181 / 60, aim: { x: 2000, y: 500 },
      targets: [actor('marked', 900, 500)], geometry: { ...world, obstacles: [{ id: 'fold', x: 650, y: 500, radius: 40 }] } };
    const commands = controller.onScan(ctx);
    expect(controller.state.beacon).toEqual({ ...before.beacon, x: 592, y: 500 });
    expect(controller.state.beaconReadyAt).toBe(before.beaconReadyAt);
    expect(controller.state.cells).toEqual(before.cells!.map(cell => ({ ...cell, navigationAt: 0, waypoint: null })));
    expect(controller.state.marks.some(mark => mark.targetId === 'marked')).toBe(true);
    expect(commands.some(command => command.kind === 'organCost' || command.kind === 'damage')).toBe(false);
    expect(commands.filter(command => command.kind === 'log' && command.type === 'IMMUNE_SQUAD_REDIRECTED')).toHaveLength(1);
    expect(commands.some(command => command.kind === 'log' && command.type === 'PROTOCOL_BEACON_CREATED')).toBe(false);
    const moved = controller.afterInput({ ...ctx, tick: 182, elapsed: 182 / 60 });
    expect(moved.some(command => command.kind === 'damage')).toBe(false);
    for (const cell of controller.state.cells!) expect(distance(cell, before.cells!.find(old => old.id === cell.id)!)).toBeLessThanOrEqual(IMMUNE_CELL_BALANCE.speed / 60 + 1e-7);
    controller.onScan({ ...ctx, tick: 183, elapsed: 183 / 60, geometry: world });
    expect(controller.state.beacon!.x).toBe(500 + GROWTH_BALANCE.beaconPlacementRange);
    expect(controller.state.beacon!.until).toBe(before.beacon!.until);
  });

  it('rolls back anchor, navigation and new trace marks when the shared command budget rejects the scan', () => {
    const controller = new GrowthController(71);
    controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }, { id: 'EXPOSE_TRACE', tuning: 'balanced' }];
    controller.onScan(context());
    const before = structuredClone(controller.state), ctx = { ...context(), tick: 181, elapsed: 181 / 60, aim: { x: 900, y: 500 }, targets: [actor('new', 900, 500)] };
    controller.state.budgetTick = ctx.tick; controller.state.budgetUsed = GROWTH_BALANCE.commandBudget;
    expect(controller.onScan(ctx)).toEqual([]);
    expect(controller.state.beacon).toEqual(before.beacon);
    expect(controller.state.cells).toEqual(before.cells);
    expect(controller.state.marks).toEqual(before.marks);
    expect(controller.state.beaconReadyAt).toBe(before.beaconReadyAt);
    expect(controller.state.protocolHistory).toEqual(before.protocolHistory);
  });

  it('ignores Q during its player cooldown, then walks the same cells to the redirected front and accepts actual bite damage', () => {
    // A short G2 session fixture avoids natural wave admission while exercising
    // the common real Q, movement, collision, lifetime and damage pipelines.
    const session = new GameSession(71, { campaign: true, milestone: 'G2' }); session.start();
    const state = session.state, old = actor('old-front', 840, 500), next = actor('new-front', 350, 500);
    state.world = world; Object.assign(state.player, { x: 500, y: 500 }); Object.assign(state.tissue, { x: 500, y: 750, hp: 100 });
    state.targets = [old, next]; state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    session.step(input({ scan: true }));
    const beaconId = state.growth!.beacon!.id, until = state.growth!.beacon!.until, readyAt = state.growth!.beaconReadyAt;
    for (let tick = 2; tick <= 60; tick++) session.step(input());
    session.step(input({ scan: true, aim: { x: 400, y: 500 } }));
    expect(state.scans).toBe(1);
    expect(state.growth!.beacon!.x).toBeCloseTo(700);
    expect(state.events.some(event => event.type === 'IMMUNE_SQUAD_REDIRECTED')).toBe(false);
    while (state.tick < 180) session.step(input());
    expect(next.hp).toBe(1000);
    const cells = structuredClone(state.growth!.cells!), tissue = state.tissue.hp;
    session.step(input({ scan: true, aim: { x: 400, y: 500 } }));
    expect(state.scans).toBe(2);
    expect(state.growth!.beacon).toMatchObject({ id: beaconId, y: 500, until });
    expect(state.growth!.beacon!.x).toBeCloseTo(400);
    expect(state.growth!.beaconReadyAt).toBe(readyAt);
    expect(state.tissue.hp).toBe(tissue);
    expect(state.growth!.cells!.map(cell => cell.id)).toEqual(cells.map(cell => cell.id));
    for (const cell of state.growth!.cells!) {
      const before = cells.find(old => old.id === cell.id)!;
      expect(distance(cell, before)).toBeLessThanOrEqual(IMMUNE_CELL_BALANCE.speed / 60 + 1e-7);
      expect(cell.attackReadyAt).toBe(before.attackReadyAt);
      expect(cell.until).toBe(before.until);
    }
    while (state.tick < 355) session.step(input());
    const bites = state.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === next.id && event.data.protocolId === 'IMMUNE_BEACON');
    expect(bites.length, JSON.stringify({ phase: state.phase, tick: state.tick, beacon: state.growth!.beacon, cells: state.growth!.cells, targets: state.targets })).toBeGreaterThan(0);
    expect(next.hp).toBeCloseTo(1000 - bites.reduce((sum, event) => sum + Number(event.data.damage), 0));
    expect(bites.every(event => event.tick > 181 && Number(event.data.damage) === 8)).toBe(true);
    expect(state.events.filter(event => event.type === 'IMMUNE_SQUAD_REDIRECTED')).toHaveLength(1);
    expect(state.events.filter(event => event.type === 'PROTOCOL_BEACON_CREATED')).toHaveLength(1);
    while (state.tick < 362) session.step(input());
    expect(state.growth!.cells).toEqual([]);
    session.step(input({ scan: true, aim: next }));
    expect(state.growth!.beacon).toBeNull();
    expect(state.events.filter(event => event.type === 'IMMUNE_SQUAD_REDIRECTED')).toHaveLength(1);
    expect(state.events.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'protocol-pressure')).toHaveLength(1);
  });
});
