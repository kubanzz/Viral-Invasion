import { describe, expect, it } from 'vitest';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { GrowthController } from '../../src/game/growth';
import type { BeaconState, GrowthCommand, GrowthContext } from '../../src/game/growthTypes';
import { advanceImmuneCells, IMMUNE_CELL_BALANCE, summonImmuneCells } from '../../src/game/immuneCells';
import { activeImmuneFocusTarget, IMMUNE_FOCUS_BALANCE, selectImmuneFocusTarget } from '../../src/game/immuneFocus';
import { GROWTH_BALANCE } from '../../src/game/protocols';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, x: number, y: number, changes: Partial<Target> = {}): Target => ({
  id, x, y, role: 'virus', kind: 'single', hp: 1000, maxHp: 1000, radius: 22, hitUntil: 0, scanned: false,
  generation: 0, traits: [], ...changes,
});
const context = (changes: Partial<GrowthContext> = {}): GrowthContext => ({ active: true, tick: 0, elapsed: 0,
  organId: 'heart', rhythm: 'rest', player: { x: 500, y: 500 }, aim: { x: 700, y: 500 },
  tissue: { x: 500, y: 750, hp: 100, maxHp: 100, radius: 43 }, deviceOrigin: { x: 500, y: 700 },
  targets: [], tool: 1, geometry: world, ...changes,
});
const beacon = (changes: Partial<BeaconState> = {}): BeaconState => ({ id: 'squad', organId: 'heart', born: 0,
  x: 500, y: 500, until: 6, radius: 300, damage: 24, interval: .8, nextAttackAt: 0,
  tuning: 'balanced', mode: 'protocol', ...changes,
});
const damage = (commands: readonly GrowthCommand[]) => commands.filter((command): command is Extract<GrowthCommand, { kind: 'damage' }> => command.kind === 'damage');
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

describe('pure immune focus selection and shared validity', () => {
  it('uses the ground aim radius plus a small tolerance, nearest aim distance and stable ID ties', () => {
    const near = actor('nearest', 701, 500), tiedB = actor('b', 700, 510), tiedA = actor('a', 700, 490);
    const ctx = context({ targets: [tiedB, near, tiedA] }), origin = beacon();
    const before = structuredClone(ctx);
    expect(selectImmuneFocusTarget(freeze(ctx), freeze(origin))?.id).toBe('nearest');
    expect(ctx).toEqual(before);
    expect(selectImmuneFocusTarget(context({ targets: [tiedB, tiedA] }), origin)?.id).toBe('a');
    const edge = actor('edge', 734, 500);
    expect(selectImmuneFocusTarget(context({ targets: [edge] }), origin)?.id).toBe('edge');
    edge.x += .01;
    expect(selectImmuneFocusTarget(context({ targets: [edge] }), origin)).toBeUndefined();
  });

  it('does not select empty ground, dead targets, shielded cores or malformed target positions', () => {
    for (const target of [actor('off-aim', 800, 500), actor('dead', 700, 500, { hp: 0 }),
      actor('core', 700, 500, { role: 'core' }), actor('invalid', NaN, 500), actor('invalid-radius', 700, 500, { radius: Infinity })]) {
      expect(selectImmuneFocusTarget(context({ targets: [target] }), beacon())).toBeUndefined();
    }
    expect(selectImmuneFocusTarget(context({ active: false, targets: [actor('live', 700, 500)] }), beacon())).toBeUndefined();
  });

  it('limits selection to the current squad region and scan reach rather than extending deployment range', () => {
    const within = actor('within', 1100, 500), beyondScan = actor('beyond-scan', 1150.01, 500);
    const origin = beacon({ x: 920, radius: 240 });
    expect(selectImmuneFocusTarget(context({ aim: within, targets: [within] }), origin)?.id).toBe(within.id);
    expect(selectImmuneFocusTarget(context({ aim: beyondScan, targets: [beyondScan] }), origin)).toBeUndefined();
    const beyondRegion = actor('beyond-region', 1112.01, 500);
    expect(selectImmuneFocusTarget(context({ aim: beyondRegion, targets: [beyondRegion] }), beacon({ x: 900, radius: 190 }))).toBeUndefined();
    const illegal = actor('inside-fold', 700, 500);
    expect(selectImmuneFocusTarget(context({ aim: illegal, targets: [illegal], geometry: { ...world,
      obstacles: [{ id: 'fold', x: 700, y: 500, radius: 35 }] } }), beacon())).toBeUndefined();
  });

  it('uses the actual wall-clipped deployment anchor when deciding whether Q can focus', () => {
    const controller = new GrowthController(71), far = actor('far', 900, 500);
    controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    controller.onScan(context({ aim: far, targets: [far], geometry: { ...world,
      obstacles: [{ id: 'fold', x: 650, y: 500, radius: 40 }] } }));
    expect(controller.state.beacon!.x).toBe(592);
    expect(controller.state.beacon!.focus).toBeUndefined();
  });

  it('keeps a valid focus visible in paused snapshots and never mutates its lifetime or target', () => {
    const victim = actor('focused', 700, 500), ctx = context({ active: false, elapsed: 1, tick: 60, targets: [victim] });
    const origin = beacon({ focus: { targetId: victim.id, until: 3 } });
    const before = structuredClone({ ctx, origin }); freeze(ctx); freeze(origin);
    expect(activeImmuneFocusTarget(origin, ctx)?.id).toBe(victim.id);
    expect({ ctx, origin }).toEqual(before);
    expect(activeImmuneFocusTarget(JSON.parse(JSON.stringify(origin)), JSON.parse(JSON.stringify(ctx)))).toEqual(victim);
  });

  it.each(['expired', 'dead', 'outside-region', 'wrong-organ', 'squad-expired', 'core', 'removed'] as const)('invalidates %s focus without changing retained serializable state', reason => {
    const victim = actor('focused', 700, 500), ctx = context({ elapsed: 1, targets: [victim] });
    const origin = beacon({ focus: { targetId: victim.id, until: 3 } });
    if (reason === 'expired') ctx.elapsed = 3;
    if (reason === 'dead') victim.hp = 0;
    if (reason === 'outside-region') victim.x = 850;
    if (reason === 'wrong-organ') ctx.organId = 'lung';
    if (reason === 'squad-expired') origin.until = 1;
    if (reason === 'core') victim.role = 'core';
    if (reason === 'removed') ctx.targets = [];
    const before = structuredClone({ ctx, origin });
    expect(activeImmuneFocusTarget(origin, ctx)).toBeUndefined();
    expect({ ctx, origin }).toEqual(before);
  });
});

describe('physical immune focus pursuit and ordinary fallback', () => {
  it('prioritizes the commanded elite over both traced ordinary targets and nearby offspring', () => {
    const child = actor('child', 520, 500, { generation: 1 }), traced = actor('traced', 560, 500);
    const elite = actor('elite', 760, 500, { role: 'elite' });
    const ctx = context({ tick: 1, elapsed: 1 / 60, targets: [child, traced, elite] });
    const origin = beacon({ focus: { targetId: elite.id, until: 3 } });
    const initial = summonImmuneCells(origin, context());
    const result = advanceImmuneCells(initial, origin, ctx, [traced.id]);
    expect(result.cells.map(cell => cell.targetId)).toEqual([elite.id, elite.id, elite.id]);
    expect(damage(result.commands)).toEqual([]);
    for (const cell of result.cells) {
      expect(distance(cell, initial.find(previous => previous.id === cell.id)!)).toBeLessThanOrEqual(IMMUNE_CELL_BALANCE.speed / 60 + 1e-7);
    }
    const automatic = advanceImmuneCells(initial, { ...origin, focus: undefined }, ctx, [traced.id]);
    expect(automatic.cells.every(cell => cell.targetId === traced.id)).toBe(true);
  });

  it('physically circles a fold and only logs focused bites at real contact with clear line of sight', () => {
    const victim = actor('behind-fold', 740, 500), obstacle = { id: 'fold', x: 620, y: 500, radius: 55 };
    const ctx = context({ targets: [victim], geometry: { ...world, obstacles: [obstacle] } });
    const origin = beacon({ focus: { targetId: victim.id, until: 3 } });
    let cells = summonImmuneCells(origin, ctx), movedAround = false, bites = 0;
    for (let tick = 1; tick <= 170; tick++) {
      ctx.tick = tick; ctx.elapsed = tick / 60;
      const previous = cells, result = advanceImmuneCells(cells, origin, ctx); cells = result.cells;
      for (const cell of cells) {
        expect(distance(cell, previous.find(other => other.id === cell.id)!)).toBeLessThanOrEqual(IMMUNE_CELL_BALANCE.speed / 60 + 1e-7);
        expect(distance(cell, obstacle)).toBeGreaterThanOrEqual(obstacle.radius + cell.radius - 1e-7);
        movedAround ||= Math.abs(cell.y - obstacle.y) > obstacle.radius + cell.radius;
      }
      for (const command of result.commands) if (command.kind === 'log' && command.type === 'PROTOCOL_BEACON_HIT') {
        const cell = cells.find(unit => unit.id === command.data.cellId)!;
        const gap = distance(cell, victim), wall = wallHit(cell, normalized(victim.x - cell.x, victim.y - cell.y), gap, ctx.geometry);
        expect(gap).toBeLessThanOrEqual(victim.radius + cell.radius + IMMUNE_CELL_BALANCE.biteReach + 1e-7);
        expect(wall === null || wall >= gap - victim.radius).toBe(true);
        expect(command.data).toMatchObject({ prioritizedFocus: true, focusTargetId: victim.id, damage: 8 }); bites++;
      }
    }
    expect(movedAround).toBe(true); expect(bites).toBeGreaterThan(0);
  });

  it('falls back to ordinary selection when no legal contact route exists', () => {
    const victim = actor('unreachable-elite', 1500, 400, { role: 'elite' }), ordinary = actor('ordinary', 500, 470);
    const ctx = context({ tick: 60, elapsed: 1, targets: [victim, ordinary], geometry: { ...world, height: 800,
      bounds: { ...world.bounds, bottom: 770 }, obstacles: [{ id: 'sealed-fold', x: 1000, y: 400, radius: 385 }] } });
    const origin = beacon({ y: 400, radius: 1200, focus: { targetId: victim.id, until: 3 } });
    const cells = summonImmuneCells(origin, context()).map(cell => ({ ...cell, x: 500, y: 500, attackReadyAt: 0 }));
    expect(activeImmuneFocusTarget(origin, ctx)?.id).toBe(victim.id);
    const result = advanceImmuneCells(cells, origin, ctx);
    expect(result.cells.every(cell => cell.targetId === ordinary.id)).toBe(true);
    expect(damage(result.commands).every(command => command.targetId === ordinary.id)).toBe(true);
    expect(result.commands.some(command => command.kind === 'log' && command.data.prioritizedFocus === true)).toBe(false);
  });

  it.each(['expired', 'dead', 'outside-region'] as const)('restores trace priority after focus becomes %s', reason => {
    const victim = actor('focused', 740, 500, { role: 'elite' }), marked = actor('marked', 650, 500);
    const ctx = context({ tick: 60, elapsed: 1, targets: [victim, marked] });
    const origin = beacon({ focus: { targetId: victim.id, until: reason === 'expired' ? 1 : 3 } });
    if (reason === 'dead') victim.hp = 0;
    if (reason === 'outside-region') victim.x = 850;
    const result = advanceImmuneCells(summonImmuneCells(origin, context()), origin, ctx, [marked.id]);
    expect(result.cells.every(cell => cell.targetId === marked.id)).toBe(true);
  });

  it('reserves actual same-frame focused damage, then lets later cells return to ordinary targets', () => {
    const weak = actor('focused-weak', 500, 470, { hp: 4, role: 'elite' }), other = actor('ordinary', 740, 500);
    const ctx = context({ tick: 60, elapsed: 1, targets: [weak, other] });
    const origin = beacon({ focus: { targetId: weak.id, until: 3 } });
    const cells = summonImmuneCells(origin, context()).map(cell => ({ ...cell, x: 500, y: 470, attackReadyAt: 0 }));
    const result = advanceImmuneCells(cells, origin, ctx);
    expect(damage(result.commands)).toEqual([expect.objectContaining({ targetId: weak.id, amount: 4 })]);
    expect(result.cells.slice(1).map(cell => cell.targetId)).toEqual([other.id, other.id]);
    const receipts = result.commands.filter(command => command.kind === 'log' && command.type === 'PROTOCOL_BEACON_HIT');
    expect(receipts).toHaveLength(1);
    expect(receipts[0].kind === 'log' && receipts[0].data).toMatchObject({ prioritizedFocus: true, focusTargetId: weak.id, damage: 4 });
  });

  it('does not add focused damage or metadata to an ordinary legacy bite', () => {
    const victim = actor('ordinary', 500, 470), ctx = context({ tick: 60, elapsed: 1, targets: [victim] });
    const origin = beacon(), cells = summonImmuneCells(origin, context(), 1).map(cell => ({ ...cell, x: 500, y: 470, attackReadyAt: 0 }));
    const result = advanceImmuneCells(cells, origin, ctx);
    expect(damage(result.commands)[0].amount).toBe(24);
    const receipt = result.commands.find(command => command.kind === 'log' && command.type === 'PROTOCOL_BEACON_HIT')!;
    expect(receipt.kind === 'log' && receipt.data).not.toHaveProperty('prioritizedFocus');
    expect(receipt.kind === 'log' && receipt.data).not.toHaveProperty('focusTargetId');
  });
});

describe('focus commands through accepted Q transactions', () => {
  it('adds bounded focus to both a full protocol squad and the single baseline patrol without changing their configs', () => {
    for (const equipped of [false, true]) {
      const controller = new GrowthController(71), victim = actor('selected', 700, 500);
      controller.state.equipped = equipped ? [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }] : [];
      const ctx = context({ elapsed: 1, tick: 60, aim: victim, targets: [victim] });
      const commands = controller.onScan(ctx), origin = controller.state.beacon!;
      expect(origin.focus).toEqual({ targetId: victim.id, until: 1 + IMMUNE_FOCUS_BALANCE.duration });
      expect(controller.state.cells).toHaveLength(equipped ? 3 : 1);
      expect(origin).toMatchObject(equipped ? { damage: 24, interval: .8, until: 7, mode: 'protocol' }
        : { damage: 12, interval: 1.2, until: 4.5, mode: 'patrol' });
      expect(commands.filter(command => command.kind === 'organCost')).toHaveLength(equipped ? 1 : 0);
      expect(commands.some(command => command.kind === 'log' && command.data.focusTargetId === victim.id)).toBe(true);
    }
  });

  it('redirects to a target or empty ground while keeping every entity, life, bite clock and independent cooldown', () => {
    const controller = new GrowthController(71), first = actor('first', 700, 500), second = actor('second', 350, 500);
    controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    controller.onScan(context({ targets: [first, second] }));
    const previous = structuredClone(controller.state), ctx = context({ elapsed: 3, tick: 180, aim: second, targets: [first, second] });
    const commands = controller.onScan(ctx);
    expect(controller.state.beacon).toEqual({ ...previous.beacon, x: second.x, y: second.y, focus: { targetId: second.id, until: 6 } });
    expect(controller.state.cells).toEqual(previous.cells!.map(cell => ({ ...cell, waypoint: null, navigationAt: 0 })));
    expect(controller.state.beaconReadyAt).toBe(previous.beaconReadyAt);
    expect(commands.some(command => command.kind === 'organCost' || command.kind === 'damage')).toBe(false);
    expect(commands.some(command => command.kind === 'log' && command.type === 'IMMUNE_SQUAD_REDIRECTED')).toBe(true);
    controller.onScan({ ...ctx, tick: 181, elapsed: 3.01, aim: { x: 500, y: 600 } });
    expect(controller.state.beacon!.focus).toBeUndefined();
    expect(controller.state.beacon!.until).toBe(previous.beacon!.until);
    expect(controller.state.cells).toEqual(previous.cells!.map(cell => ({ ...cell, waypoint: null, navigationAt: 0 })));
    expect(controller.state.beaconReadyAt).toBe(previous.beaconReadyAt);
  });

  it('caps a late focus at the original squad expiry and never revives expired units during summon cooldown', () => {
    const controller = new GrowthController(71), victim = actor('selected', 700, 500);
    controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    controller.onScan(context());
    controller.onScan(context({ elapsed: 5.9, tick: 354, targets: [victim] }));
    expect(controller.state.beacon!.focus).toEqual({ targetId: victim.id, until: 6 });
    controller.afterInput(context({ elapsed: 6.1, tick: 366, targets: [victim] }));
    expect(controller.state.cells).toEqual([]);
    const commands = controller.onScan(context({ elapsed: 7, tick: 420, targets: [victim] }));
    expect(controller.state.cells).toEqual([]);
    expect(commands.some(command => command.kind === 'log' && ['PROTOCOL_BEACON_CREATED', 'IMMUNE_SQUAD_REDIRECTED'].includes(command.type))).toBe(false);
  });

  it('rolls back focus, navigation and marks if the shared command budget rejects an otherwise legal command', () => {
    const controller = new GrowthController(71), first = actor('first', 700, 500), second = actor('second', 350, 500);
    controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }, { id: 'EXPOSE_TRACE', tuning: 'balanced' }];
    controller.onScan(context({ targets: [first] }));
    const before = structuredClone(controller.state), ctx = context({ elapsed: 3, tick: 180, aim: second, targets: [second] });
    controller.state.budgetTick = ctx.tick; controller.state.budgetUsed = GROWTH_BALANCE.commandBudget;
    expect(controller.onScan(ctx)).toEqual([]);
    expect(controller.state.beacon).toEqual(before.beacon);
    expect(controller.state.cells).toEqual(before.cells);
    expect(controller.state.marks).toEqual(before.marks);
    expect(controller.state.beaconReadyAt).toBe(before.beaconReadyAt);
  });

  it('accepts real Q target commands only after scan cooldown and walks unchanged cells to a real focused bite', () => {
    const session = new GameSession(71, { campaign: true, milestone: 'G2' }); session.start();
    const state = session.state, old = actor('old-front', 840, 500, { role: 'source' });
    const next = actor('new-front', 350, 500, { role: 'source' });
    state.world = structuredClone(world); Object.assign(state.player, { x: 500, y: 500 });
    Object.assign(state.tissue, { x: 500, y: 750, hp: 100 }); state.targets = [old, next];
    state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    const input = (extra: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim: { x: 700, y: 500 }, ...extra });
    session.step(input({ scan: true }));
    expect(state.growth!.beacon!.focus).toBeUndefined();
    const id = state.growth!.beacon!.id, until = state.growth!.beacon!.until, ready = state.growth!.beaconReadyAt;
    while (state.tick < 60) session.step(input());
    session.step(input({ scan: true, aim: next }));
    expect(state.scans).toBe(1); expect(state.growth!.beacon!.focus).toBeUndefined();
    while (state.tick < 180) session.step(input());
    const previous = structuredClone(state.growth!.cells!), tissue = state.tissue.hp;
    session.step(input({ scan: true, aim: next }));
    expect(state.growth!.beacon).toMatchObject({ id, until, focus: { targetId: next.id, until } });
    expect(state.growth!.beaconReadyAt).toBe(ready); expect(state.tissue.hp).toBe(tissue);
    for (const cell of state.growth!.cells!) {
      const before = previous.find(unit => unit.id === cell.id)!;
      expect(distance(cell, before)).toBeLessThanOrEqual(IMMUNE_CELL_BALANCE.speed / 60 + 1e-7);
      expect(cell.until).toBe(before.until); expect(cell.attackReadyAt).toBe(before.attackReadyAt);
    }
    expect(next.hp).toBe(1000);
    while (state.tick < 355) session.step(input());
    const receipts = state.events.filter(event => event.type === 'PROTOCOL_BEACON_HIT' && event.data.focusTargetId === next.id && event.data.prioritizedFocus === true);
    expect(receipts.length).toBeGreaterThan(0);
    expect(receipts.every(event => event.tick > 181 && event.data.targetId === next.id && event.data.damage === 8)).toBe(true);
    expect(next.hp).toBeLessThan(1000);
    expect(state.events.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'protocol-pressure')).toHaveLength(1);
    session.restart(); expect(session.state.growth!.beacon).toBeNull();
  });
});
