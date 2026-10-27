import { describe, expect, it } from 'vitest';
import { advanceImmuneCells, IMMUNE_CELL_BALANCE, summonImmuneCells, type ImmuneCellState } from '../../src/game/immuneCells';
import { drawImmuneCell, drawImmuneSquadLabel } from '../../src/render/immuneVisuals';
import { GrowthController } from '../../src/game/growth';
import { GROWTH_BALANCE } from '../../src/game/protocols';
import type { BeaconState, GrowthCommand, GrowthContext } from '../../src/game/growthTypes';
import type { Target, WorldGeometry } from '../../src/game/types';

const geometry: WorldGeometry = { width: 2200, height: 1500, bounds: { left: 30, right: 2170, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, x: number, y: number, generation = 0): Target => ({ id, x, y, kind: 'single', role: 'virus', radius: 22, hp: 68, maxHp: 68, hitUntil: 0, scanned: false, generation });
const context = (targets: Target[] = []): GrowthContext => ({ tick: 0, elapsed: 0, active: true, organId: 'heart', rhythm: 'rest', player: { x: 500, y: 500 }, aim: { x: 550, y: 500 }, deviceOrigin: { x: 500, y: 500 }, tissue: { x: 400, y: 650, hp: 60, maxHp: 100, radius: 43 }, targets, tool: 1, geometry });
const beacon = (changes: Partial<BeaconState> = {}): BeaconState => ({ id: 'squad', organId: 'heart', x: 500, y: 500, born: 0, until: 12, radius: 300, damage: 24, interval: .8, nextAttackAt: 0, tuning: 'balanced', ...changes });
const damage = (commands: GrowthCommand[]) => commands.filter((command): command is Extract<GrowthCommand, { kind: 'damage' }> => command.kind === 'damage');
function advance(cells: ImmuneCellState[], origin: BeaconState, ctx: GrowthContext, steps: number, traces: string[] = []) {
  const commands: GrowthCommand[] = [];
  for (let tick = 1; tick <= steps; tick++) {
    ctx.tick++; ctx.elapsed = ctx.tick / 60;
    const result = advanceImmuneCells(cells, origin, ctx, traces); cells = result.cells; commands.push(...result.commands);
  }
  return { cells, commands };
}

describe('visible temporary immune-cell combat', () => {
  it('physically approaches a remote enemy before any contact damage and splits squad damage across bounded units', () => {
    const ctx = context([actor('remote', 740, 500)]), origin = beacon();
    const initial = summonImmuneCells(origin, ctx);
    expect(initial).toHaveLength(3); expect(new Set(initial.map(cell => cell.id)).size).toBe(3);
    const early = advance(initial, origin, ctx, 20);
    expect(damage(early.commands)).toEqual([]);
    expect(early.cells.some((cell, index) => Math.hypot(cell.x - initial[index].x, cell.y - initial[index].y) > 40)).toBe(true);
    const engaged = advance(early.cells, origin, ctx, 70);
    const hits = damage(engaged.commands); expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(hit => hit.amount === origin.damage / 3 && hit.targetId === 'remote')).toBe(true);
    const firstRootPerCell = new Map<string, number>();
    for (const command of engaged.commands) if (command.kind === 'log' && command.type === 'PROTOCOL_BEACON_HIT') {
      expect(command.data.cellId).toBeTruthy(); firstRootPerCell.set(String(command.data.cellId), Number(command.data.damage));
    }
    expect(firstRootPerCell.size).toBe(3);
    expect([...firstRootPerCell.values()].reduce((sum, value) => sum + value, 0)).toBe(origin.damage);
    expect(summonImmuneCells(origin, ctx, 100)).toHaveLength(IMMUNE_CELL_BALANCE.maximum);
  });

  it('prioritizes small offspring, and trace synergy changes the selected enemy rather than inventing a hit', () => {
    const ordinary = actor('ordinary', 520, 500), child = actor('offspring', 650, 500, 1), marked = actor('marked', 700, 500);
    const ctx = context([ordinary, child, marked]), origin = beacon();
    let result = advance(summonImmuneCells(origin, ctx, 1), origin, ctx, 1);
    expect(result.cells[0].targetId).toBe(child.id); expect(damage(result.commands)).toHaveLength(0);
    result = advance(result.cells, origin, ctx, 100, [marked.id]);
    expect(result.cells[0].targetId).toBe(marked.id);
    expect(result.commands.some(command => command.kind === 'log' && command.type === 'PROTOCOL_SYNERGY' && command.data.targetId === marked.id)).toBe(true);
  });

  it('walks around a visible fold without crossing its footprint and only bites after reaching line of sight', () => {
    const fold = { id: 'fold', x: 620, y: 500, radius: 55 };
    const ctx = { ...context([actor('behind', 740, 500)]), geometry: { ...geometry, obstacles: [fold] } }, origin = beacon();
    let cells = summonImmuneCells(origin, ctx, 1), attacks = 0, movedAround = false;
    for (let tick = 1; tick <= 240; tick++) {
      ctx.tick = tick; ctx.elapsed = tick / 60;
      const result = advanceImmuneCells(cells, origin, ctx); cells = result.cells;
      for (const cell of cells) {
        expect(Math.hypot(cell.x - fold.x, cell.y - fold.y)).toBeGreaterThanOrEqual(fold.radius + cell.radius - 1e-7);
        if (Math.abs(cell.y - fold.y) > fold.radius + cell.radius) movedAround = true;
      }
      attacks += damage(result.commands).length;
    }
    expect(movedAround).toBe(true); expect(attacks).toBeGreaterThan(0);
  });

  it('freezes during pause, removes cells on organ travel, expiry or replacement, and cannot catch up with a burst', () => {
    const ctx = context([actor('touching', 500, 470)]), origin = beacon(), initial = summonImmuneCells(origin, ctx);
    const paused = advanceImmuneCells(initial, origin, { ...ctx, active: false, elapsed: 10, tick: 600 });
    expect(paused.cells).toEqual(initial); expect(paused.commands).toEqual([]);
    expect(advanceImmuneCells(initial, origin, { ...ctx, organId: 'lung' }).cells).toEqual([]);
    expect(advanceImmuneCells(initial, origin, { ...ctx, elapsed: 12 }).cells).toEqual([]);
    expect(advanceImmuneCells(initial, { ...origin, id: 'replacement' }, ctx).cells).toEqual([]);
    expect(advanceImmuneCells(initial, null, ctx).cells).toEqual([]);
    const skippedTime = advanceImmuneCells(initial, origin, { ...ctx, elapsed: 8, tick: 480 });
    expect(damage(skippedTime.commands).length).toBeLessThanOrEqual(3);
    const again = advanceImmuneCells(skippedTime.cells, origin, { ...ctx, elapsed: 8, tick: 480 });
    expect(damage(again.commands)).toHaveLength(0);
    for (let index = 0; index < initial.length; index++) expect(Math.hypot(skippedTime.cells[index].x - initial[index].x, skippedTime.cells[index].y - initial[index].y)).toBeLessThanOrEqual(IMMUNE_CELL_BALANCE.speed / 60 + 1e-7);
  });

  it('keeps baseline patrol hits separate from equipped beacon and trace synergy', () => {
    const ctx = context([actor('target', 500, 470)]), origin = { ...beacon({ damage: 12, interval: 1.2, until: 3.5 }), mode: 'patrol' as const };
    const result = advance(summonImmuneCells(origin, ctx, 1), origin, ctx, 60, ['target']);
    const logs = result.commands.filter(command => command.kind === 'log');
    expect(logs.some(command => command.kind === 'log' && command.type === 'IMMUNE_PATROL_HIT')).toBe(true);
    expect(logs.some(command => command.kind === 'log' && ['PROTOCOL_BEACON_HIT', 'PROTOCOL_SYNERGY'].includes(command.type))).toBe(false);
  });

  it('rechecks current enemy positions and never bites across a fold even within contact distance', () => {
    const victim = actor('moving', 500, 470), ctx = context([victim]), origin = beacon();
    const cells = summonImmuneCells(origin, ctx, 1);
    victim.x = 760;
    const moved = advanceImmuneCells(cells, origin, { ...ctx, tick: 60, elapsed: 1 });
    expect(damage(moved.commands)).toHaveLength(0);
    const blocked = actor('behind-small-fold', 539, 500); blocked.radius = 15;
    const blockedCtx = { ...context([blocked]), tick: 60, elapsed: 1, geometry: { ...geometry, obstacles: [{ id: 'fold', x: 519.5, y: 500, radius: 4 }] } };
    const ready = cells.map(cell => ({ ...cell, x: 500, y: 500, attackReadyAt: 0 }));
    expect(damage(advanceImmuneCells(ready, origin, blockedCtx).commands)).toHaveLength(0);
  });

  it('reserves same-frame damage, redirects later cells, and never logs a hit on a shielded mother core', () => {
    const weak = actor('weak', 500, 470); weak.hp = 4;
    const other = actor('other', 730, 500), core = { ...actor('core', 500, 470), role: 'core' as const };
    const ctx = { ...context([weak, core, other]), tick: 60, elapsed: 1 }, origin = beacon();
    const ready = summonImmuneCells(origin, context()).map(cell => ({ ...cell, x: 500, y: 470, attackReadyAt: 0 }));
    const result = advanceImmuneCells(ready, origin, ctx, [core.id]);
    expect(damage(result.commands)).toEqual([expect.objectContaining({ targetId: weak.id, amount: 4 })]);
    expect(result.commands.filter(command => command.kind === 'log' && command.type === 'PROTOCOL_BEACON_HIT')).toHaveLength(1);
    expect(result.cells.slice(1).map(cell => cell.targetId)).toEqual([other.id, other.id]);
    expect(result.commands.some(command => command.kind === 'log' && command.type === 'PROTOCOL_SYNERGY')).toBe(false);
  });

  it('does not consume a cell bite or display protocol activation when the shared command budget rejects it', () => {
    const ctx = { ...context([actor('ready', 500, 470)]), tick: 60, elapsed: 1 }, origin = beacon();
    const controller = new GrowthController(5, 'cell-budget');
    controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    controller.state.beacon = origin;
    controller.state.cells = summonImmuneCells(origin, context()).map(cell => ({ ...cell, x: 500, y: 470, attackReadyAt: 0 }));
    const before = structuredClone(controller.state.cells);
    controller.state.budgetTick = ctx.tick; controller.state.budgetUsed = GROWTH_BALANCE.commandBudget;
    const rejected = controller.afterInput(ctx);
    expect(damage(rejected)).toHaveLength(0);
    expect(rejected.some(command => command.kind === 'log' && command.type === 'PROTOCOL_BEACON_HIT')).toBe(false);
    expect(controller.state.cells).toEqual(before); expect(controller.state.activations?.IMMUNE_BEACON ?? 0).toBe(0);
    const accepted = controller.afterInput({ ...ctx, tick: 61, elapsed: 61 / 60 });
    expect(damage(accepted).length).toBeGreaterThan(0);
    expect(controller.state.activations?.IMMUNE_BEACON).toBeGreaterThan(0);
  });

  it('is deterministic under target-order changes and render passes never change its simulation state', () => {
    const ctx = context([actor('b', 700, 500), actor('a', 300, 500)]), origin = beacon();
    const first = advance(summonImmuneCells(origin, ctx), origin, structuredClone(ctx), 120);
    const second = advance(summonImmuneCells(origin, ctx), origin, { ...structuredClone(ctx), targets: [...ctx.targets].reverse() }, 120);
    expect(second).toEqual(first);
    const before = structuredClone(first.cells), calls: string[] = [];
    const canvas = new Proxy({}, { get: (_target, property) => (..._args: unknown[]) => calls.push(String(property)), set: () => true }) as CanvasRenderingContext2D;
    for (const low of [false, true]) for (const cell of first.cells) drawImmuneCell(canvas, cell, 2, low);
    drawImmuneSquadLabel(canvas, origin, first.cells.length);
    expect(calls).toContain('fill'); expect(calls).toContain('strokeText'); expect(first.cells).toEqual(before);
  });
});
