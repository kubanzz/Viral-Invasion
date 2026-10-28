import { describe, expect, it } from 'vitest';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { GrowthController } from '../../src/game/growth';
import type { BeaconState, GrowthCommand, GrowthContext } from '../../src/game/growthTypes';
import { activeImmuneFocusTarget, selectImmuneFocusTarget } from '../../src/game/immuneFocus';
import { advanceImmuneCells, ENDLESS_IMMUNE_CELL_BALANCE as RALLY, IMMUNE_CELL_BALANCE, redirectImmuneCells, summonImmuneCells, type ImmuneCellState } from '../../src/game/immuneCells';
import { GROWTH_BALANCE } from '../../src/game/protocols';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, x: number, y = 500, changes: Partial<Target> = {}): Target => ({
  id, x, y, radius: 22, role: 'virus', kind: 'single', hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false, generation: 0, traits: [], ...changes,
});
const context = (changes: Partial<GrowthContext> = {}): GrowthContext => ({ endless: true, active: true, tick: 0, elapsed: 0, organId: 'heart', rhythm: 'rest',
  player: { x: 500, y: 500 }, aim: { x: 700, y: 500 }, tissue: { x: 500, y: 750, hp: 100, maxHp: 100, radius: 43 }, deviceOrigin: { x: 500, y: 700 }, targets: [], tool: 1, geometry: world, ...changes,
});
const beacon = (changes: Partial<BeaconState> = {}): BeaconState => ({ id: 'squad', organId: 'heart', x: 700, y: 500, born: 0, until: 6, radius: 190, damage: 24, interval: .8, nextAttackAt: 0, tuning: 'balanced', mode: 'protocol', ...changes });
const hits = (commands: readonly GrowthCommand[]) => commands.filter((command): command is Extract<GrowthCommand, { kind: 'damage' }> => command.kind === 'damage');
function run(cells: ImmuneCellState[], origin: BeaconState, ctx: GrowthContext, steps: number) {
  const commands: GrowthCommand[] = [];
  let firstHitAt: number | null = null;
  for (let frame = 0; frame < steps; frame++) {
    ctx.tick++; ctx.elapsed = ctx.tick / 60;
    const previous = cells, result = advanceImmuneCells(cells, origin, ctx);
    for (const cell of result.cells) {
      const before = previous.find(unit => unit.id === cell.id)!;
      const speed = ctx.endless && origin.mode === 'protocol' ? RALLY.rallySpeed : IMMUNE_CELL_BALANCE.speed;
      expect(distance(before, cell)).toBeLessThanOrEqual(speed / 60 + 1e-7);
      for (const obstacle of ctx.geometry!.obstacles) expect(distance(cell, obstacle)).toBeGreaterThanOrEqual(cell.radius + obstacle.radius - 1e-7);
    }
    for (const hit of hits(result.commands)) {
      firstHitAt ??= ctx.elapsed;
      const cell = result.cells.find(unit => unit.id === hit.immuneCellId)!;
      const target = ctx.targets.find(unit => unit.id === hit.targetId)!;
      const gap = distance(cell, target), blocked = wallHit(cell, normalized(target.x - cell.x, target.y - cell.y), gap, ctx.geometry);
      expect(gap).toBeLessThanOrEqual(cell.radius + target.radius + IMMUNE_CELL_BALANCE.biteReach + 1e-7);
      expect(blocked === null || blocked >= gap - target.radius).toBe(true);
    }
    cells = result.cells; commands.push(...result.commands);
  }
  return { cells, commands, firstHitAt };
}

describe('challenge immune rally through real Q focus', () => {
  it('commands a legal target at the 650 scan edge without extending the 420 deployment anchor or campaign focus region', () => {
    const target = actor('remote-support', 1150), ctx = context({ targets: [target], aim: target });
    const controller = new GrowthController(71); controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    const commands = controller.onScan(ctx), origin = controller.state.beacon!;
    expect(origin.x).toBe(920); expect(origin.radius).toBe(190);
    expect(origin.focus?.targetId).toBe(target.id);
    expect(activeImmuneFocusTarget(origin, ctx)?.id).toBe(target.id);
    expect(hits(commands)).toEqual([]);
    expect(commands.some(command => command.kind === 'log' && command.data.rallySpeed === RALLY.rallySpeed)).toBe(true);
    expect(controller.state.cells!.every(cell => cell.rallyUntil === RALLY.rallySeconds)).toBe(true);
    expect(selectImmuneFocusTarget({ ...ctx, endless: false }, origin)).toBeUndefined();
    expect(selectImmuneFocusTarget({ ...ctx, targets: [actor('too-far', 1150.01)], aim: { x: 1150.01, y: 500 } }, origin)).toBeUndefined();
    expect(selectImmuneFocusTarget(ctx, { ...origin, mode: 'patrol' })).toBeUndefined();
  });

  it('redirects the same existing bodies and clocks, then physically reaches a remote support within the command window', () => {
    const target = actor('remote-support', 1100), ctx = context({ targets: [target], aim: target });
    const origin = beacon({ x: 920, focus: { targetId: target.id, until: 3 } });
    const original = summonImmuneCells(beacon({ x: 200 }), context({ endless: false })).map(cell => ({ ...cell, attackReadyAt: 1.4 }));
    const rallied = redirectImmuneCells(original, origin, ctx);
    expect(rallied.map(({ rallyUntil, waypoint, navigationAt, ...cell }) => cell)).toEqual(original.map(({ waypoint, navigationAt, ...cell }) => cell));
    expect(rallied.every(cell => cell.rallyUntil === .9 && cell.until === 6 && cell.attackReadyAt === 1.4)).toBe(true);
    const early = run(rallied, origin, ctx, 30);
    expect(hits(early.commands)).toEqual([]);
    const arrived = run(early.cells, origin, ctx, 150);
    expect(arrived.firstHitAt).not.toBeNull(); expect(arrived.firstHitAt!).toBeLessThan(3);
    expect(hits(arrived.commands).every(hit => hit.amount === 8 && hit.targetId === target.id)).toBe(true);
    const campaign = run(redirectImmuneCells(original, origin, { ...ctx, elapsed: 0, tick: 0, endless: false }), origin,
      context({ endless: false, targets: [target], aim: target }), 180);
    expect(hits(campaign.commands)).toEqual([]);
  });

  it('grants a focused first bite only after contact and startup, with the same divided squad damage', () => {
    const target = actor('selected', 700), ctx = context({ targets: [target], aim: target });
    const origin = beacon({ focus: { targetId: target.id, until: 3 } });
    const initial = summonImmuneCells(origin, ctx);
    const early = run(initial, origin, ctx, 5);
    expect(hits(early.commands)).toEqual([]);
    const ready = run(early.cells, origin, ctx, 7);
    expect(hits(ready.commands)).toHaveLength(3);
    expect(hits(ready.commands).reduce((sum, hit) => sum + hit.amount, 0)).toBe(24);
    expect(ready.cells.every(cell => cell.interval === .8)).toBe(true);
    const again = advanceImmuneCells(ready.cells, origin, ctx);
    expect(hits(again.commands)).toEqual([]);
    const legacy = summonImmuneCells(origin, { ...ctx, elapsed: 0, tick: 0, endless: false });
    expect(legacy.map(cell => cell.attackReadyAt)).toEqual([.25, .33, .41000000000000003]);
    expect(legacy.every(cell => cell.rallyUntil === undefined)).toBe(true);
  });

  it('retargets a dead focus to real nearby contact instead of abandoning it for distant offspring', () => {
    const dead = actor('dead-focus', 700, 500, { hp: 0, role: 'elite' }), near = actor('near', 705), farChild = actor('far-child', 870, 500, { generation: 1 });
    const ctx = context({ tick: 60, elapsed: 1, targets: [farChild, dead, near] });
    const origin = beacon({ focus: { targetId: dead.id, until: 3 } });
    const cells = summonImmuneCells(origin, context()).map(cell => ({ ...cell, x: 680, y: 500, attackReadyAt: 0, targetId: dead.id }));
    const result = advanceImmuneCells(cells, origin, ctx);
    expect(result.cells.map(cell => cell.targetId)).toEqual([near.id, near.id, near.id]);
    expect(hits(result.commands)).toHaveLength(3); expect(hits(result.commands).every(hit => hit.targetId === near.id && hit.amount === 8)).toBe(true);
    const campaign = advanceImmuneCells(cells, origin, { ...ctx, endless: false });
    expect(campaign.cells.every(cell => cell.targetId === farChild.id)).toBe(true);
    expect(hits(campaign.commands)).toEqual([]);
  });

  it('navigates around folds during the rally, retaining contact and per-frame travel limits', () => {
    const fold = { id: 'fold', x: 850, y: 500, radius: 60 }, target = actor('behind-fold', 1050);
    const ctx = context({ targets: [target], aim: target, geometry: { ...world, obstacles: [fold] } });
    const origin = beacon({ x: 700, focus: { targetId: target.id, until: 3 } });
    const initial = summonImmuneCells(origin, ctx);
    const result = run(initial, origin, ctx, 170);
    expect(result.firstHitAt).not.toBeNull(); expect(result.firstHitAt!).toBeGreaterThan(.3);
    expect(hits(result.commands).every(hit => hit.targetId === target.id)).toBe(true);
  });

  it('cannot spend rally time while paused, teleport on skipped time, reset attacks by redirecting, or revive expired cells', () => {
    const target = actor('remote', 1100), ctx = context({ targets: [target], aim: target });
    const origin = beacon({ x: 920, focus: { targetId: target.id, until: 3 } });
    const initial = summonImmuneCells(origin, ctx);
    const paused = advanceImmuneCells(initial, origin, { ...ctx, elapsed: .5, tick: 30, active: false });
    expect(paused.cells).toEqual(initial); expect(paused.commands).toEqual([]);
    const skipped = advanceImmuneCells(initial, origin, { ...ctx, elapsed: .8, tick: 48 });
    for (const cell of skipped.cells) expect(distance(cell, initial.find(unit => unit.id === cell.id)!)).toBeLessThanOrEqual(RALLY.rallySpeed / 60 + 1e-7);
    const redirected = redirectImmuneCells(skipped.cells, origin, { ...ctx, elapsed: .8, tick: 48 });
    expect(redirected.map(cell => cell.attackReadyAt)).toEqual(skipped.cells.map(cell => cell.attackReadyAt));
    const ground = redirectImmuneCells(redirected, { ...origin, focus: undefined }, { ...ctx, elapsed: .8, tick: 48 });
    expect(ground.every(cell => cell.rallyUntil === undefined)).toBe(true);
    const afterRally = advanceImmuneCells(initial, origin, { ...ctx, elapsed: 1, tick: 60 });
    for (const cell of afterRally.cells) expect(distance(cell, initial.find(unit => unit.id === cell.id)!)).toBeLessThanOrEqual(RALLY.pursuitSpeed / 60 + 1e-7);
    expect(advanceImmuneCells(ground, origin, { ...ctx, elapsed: 6, tick: 360 }).cells).toEqual([]);
  });

  it('keeps explicit trace priority during travel, then stops reassigning a nearby living target for small distance changes', () => {
    const near = actor('near', 800), marked = actor('marked', 850), ctx = context({ tick: 1, elapsed: 1 / 60, targets: [near, marked] });
    const origin = beacon({ radius: 300 }), initial = summonImmuneCells(origin, context());
    const traced = advanceImmuneCells(initial, origin, ctx, [marked.id]);
    expect(traced.cells.every(cell => cell.targetId === marked.id)).toBe(true);
    const touching = initial.map(cell => ({ ...cell, x: near.x, y: near.y, attackReadyAt: 0 }));
    const preferredTrace = advanceImmuneCells(touching, origin, ctx, [marked.id]);
    expect(preferredTrace.cells.every(cell => cell.targetId === marked.id)).toBe(true);
    expect(hits(preferredTrace.commands).every(hit => hit.targetId === marked.id)).toBe(true);
    const slightlyCloser = actor('slightly-closer', 840), retained = advanceImmuneCells(traced.cells, origin,
      { ...ctx, tick: 2, elapsed: 2 / 60, targets: [marked, slightlyCloser] });
    expect(retained.cells.every(cell => cell.targetId === marked.id)).toBe(true);
  });

  it('retains existing squad state if the shared command budget rejects a focused redirect', () => {
    const controller = new GrowthController(71); controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    controller.onScan(context());
    const before = structuredClone(controller.state), target = actor('new-front', 1100);
    const ctx = context({ tick: 180, elapsed: 3, targets: [target], aim: target });
    controller.state.budgetTick = ctx.tick; controller.state.budgetUsed = GROWTH_BALANCE.commandBudget;
    expect(controller.onScan(ctx)).toEqual([]);
    expect(controller.state.cells).toEqual(before.cells); expect(controller.state.beacon).toEqual(before.beacon);
    expect(controller.state.beaconReadyAt).toBe(before.beaconReadyAt);
  });

  it('is deterministic under cell/target ordering and keeps same-frame damage reservations', () => {
    const weak = actor('weak', 700, 500, { hp: 4 }), other = actor('other', 710);
    const ctx = context({ targets: [weak, other], tick: 60, elapsed: 1 });
    const origin = beacon();
    const initial = summonImmuneCells(origin, context()).map(cell => ({ ...cell, x: 700, y: 500, attackReadyAt: 0 }));
    const first = advanceImmuneCells(initial, origin, ctx), second = advanceImmuneCells([...initial].reverse(), origin, { ...ctx, targets: [...ctx.targets].reverse() });
    expect(second).toEqual(first);
    expect(hits(first.commands).filter(hit => hit.targetId === weak.id)).toEqual([expect.objectContaining({ amount: 4 })]);
    expect(hits(first.commands).filter(hit => hit.targetId === other.id)).toHaveLength(2);
  });

  it('uses the real session Q cooldown and accepted host bite receipts against a standoff support', () => {
    // A bounded mechanism fixture, not a natural balance or contribution run.
    const session = new GameSession(71, { mode: 'endless' }); session.start();
    const state = session.state, target = actor('remote-standoff', 1100, 500, { tactic: 'thin-ray', tacticPosture: 'standoff', attackReady: 100 });
    state.world = structuredClone(world); Object.assign(state.player, { x: 500, y: 500 });
    Object.assign(state.tissue, { x: 500, y: 750, hp: 100 }); state.targets = [target];
    Object.assign(state.endless!, { phase: 'combat', remainingToSpawn: 0, totalToSpawn: 1, spawnedIds: [target.id] });
    const input: InputFrame = { moveX: 0, moveY: 0, fire: false, scan: true, aim: { x: target.x, y: target.y } };
    session.step(input);
    const origin = structuredClone(state.growth!.beacon!), identities = state.growth!.cells!.map(cell => cell.id);
    expect(state.scans).toBe(1); expect(state.growth!.beacon!.focus?.targetId).toBe(target.id);
    expect(target.hp).toBe(1000);
    for (let frame = 0; frame < 90; frame++) session.step(input);
    const receipts = state.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === target.id && event.data.protocolId === 'IMMUNE_BEACON');
    expect(receipts.length).toBeGreaterThan(0);
    expect(receipts.every(event => event.tick > 1 && Number(event.data.damage) > 0 && Number(event.data.damage) <= 8)).toBe(true);
    expect(target.hp).toBeCloseTo(1000 - receipts.reduce((sum, event) => sum + Number(event.data.damage), 0));
    expect(state.scans).toBe(1); expect(state.growth!.cells!.map(cell => cell.id)).toEqual(identities);
    expect(state.growth!.beacon!.until).toBe(origin.until);
    expect(state.events.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'protocol-pressure')).toHaveLength(1);
  });

  it('lands real focused bites while primary fire continues against an ordinary 68-HP target', () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start();
    const state = session.state, target = actor('short-lived', 700, 500, { hp: 68, maxHp: 68, attackReady: 100 });
    state.world = structuredClone(world); Object.assign(state.player, { x: 500, y: 500 });
    Object.assign(state.tissue, { x: 500, y: 750, hp: 100 }); state.targets = [target];
    Object.assign(state.endless!, { phase: 'combat', remainingToSpawn: 0, totalToSpawn: 1, spawnedIds: [target.id] });
    const input: InputFrame = { moveX: 0, moveY: 0, fire: true, scan: true, aim: { x: 700, y: 500 }, tool: 1 };
    while (target.hp > 0 && state.tick < 60 && state.phase === 'playing') session.step(input);
    const receipts = state.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === target.id);
    const cellDamage = receipts.filter(event => event.data.protocolId === 'IMMUNE_BEACON').reduce((sum, event) => sum + Number(event.data.damage), 0);
    expect(target.hp).toBe(0); expect(state.elapsed).toBeLessThan(1);
    expect(receipts.some(event => event.data.cause === 'basic')).toBe(true);
    expect(cellDamage).toBeGreaterThan(0);
    expect(receipts.reduce((sum, event) => sum + Number(event.data.damage), 0)).toBeCloseTo(68);
  });
});
