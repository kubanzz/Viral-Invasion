import { describe, expect, it } from 'vitest';
import { BattleDirector } from '../../src/game/battle';
import { GameSession } from '../../src/game/session';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import type { ImmuneCellState } from '../../src/game/immuneCells';
import { BALANCE, type GameEvent, type Target, type WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 1800, height: 1300, bounds: { left: 30, right: 1770, top: 30, bottom: 1270 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const body = (id: string, x: number, y: number, changes: Partial<ImmuneCellState> = {}): ImmuneCellState => ({
  id, beaconId: 'legion', organId: 'heart', x, y, born: 0, until: Infinity, radius: 15, facing: 0,
  hp: 60, maxHp: 60, damage: 8, interval: .8, updatedAt: 0, attackReadyAt: 1000, attackUntil: 0,
  targetId: null, activity: 'seeking', navigationAt: 0, waypoint: null, ...changes,
});
const virus = (changes: Partial<Target> = {}): Target => ({ id: 'hunter', x: 500, y: 500, role: 'virus', kind: 'single',
  radius: 22, hp: 1000, maxHp: 1000, traits: [], tactic: 'melee', scanned: false, hitUntil: 0, attackReady: 0, ...changes });
function fixture(target: Target, cells: ImmuneCellState[]) {
  const session = new GameSession(741, { mode: 'endless' }); session.start();
  const state = session.state; state.world = structuredClone(world); state.targets = [target];
  Object.assign(state.player, { x: 400, y: 1000 }); Object.assign(state.tissue, { x: 1200, y: 1000, hp: 100 });
  state.growth!.cells = cells;
  const events: GameEvent[] = [];
  const director = new BattleDirector({ state, emit: (type, data) => events.push({ type, data, tick: state.tick }),
    message: () => {}, effect: () => {}, finish: () => {} });
  const step = () => { state.tick++; state.elapsed += BALANCE.step; director.afterInput(); };
  const resolve = () => { const at = target.attackAt!; while (state.elapsed + 1e-9 < at) step(); };
  return { state, events, target, step, resolve };
}

describe('viral threat against living immune legions', () => {
  it('telegraphs a nearby physical body and reports its actual lethal HP loss', () => {
    const cell = body('victim', 550, 500, { hp: 8 }), f = fixture(virus(), [cell]);
    f.step(); expect(f.target.attackTarget).toBe('immune'); expect(f.target.immuneAttackTargetId).toBe(cell.id);
    expect(cell.hp).toBe(8); expect(f.target.attackAt! - f.state.elapsed).toBeCloseTo(BATTLE_BALANCE.attackWindup);
    f.resolve(); expect(cell.hp).toBe(0); expect(f.state.player.hp).toBe(100); expect(f.state.tissue.hp).toBe(100);
    expect(f.events.filter(event => event.type === 'IMMUNE_CELL_HURT')).toHaveLength(1);
    expect(f.events.find(event => event.type === 'IMMUNE_CELL_HURT')!.data).toMatchObject({ cellId: cell.id, damage: 8, remainingHp: 0 });
    expect(f.events.filter(event => event.type === 'IMMUNE_CELL_DIED')).toHaveLength(1);
  });

  it('antibody scent draws a tissue attacker away, then restores its objective after expiry', () => {
    const cell = body('taunt', 500, 710, { antibodyUntil: .1 });
    const f = fixture(virus({ assaultObjective: 'tissue' }), [cell]); Object.assign(f.state.tissue, { x: 555, y: 500 });
    f.step(); expect(f.target.y).toBeGreaterThan(500); expect(f.target.attackAt).toBeUndefined();
    f.state.elapsed = .2; f.step(); expect(f.target.attackTarget).toBe('tissue'); expect(f.state.tissue.hp).toBe(100);
  });

  it('never transfers a frozen melee hit to another cell or damages a body that escaped its real reach', () => {
    const first = body('first', 550, 500), second = body('second', 1100, 500), f = fixture(virus(), [first, second]);
    f.step(); const aim = { ...f.target.attackAim! }, at = f.target.attackAt;
    Object.assign(first, { x: 1100, y: 500 }); Object.assign(second, aim);
    f.resolve(); expect(first.hp).toBe(60); expect(second.hp).toBe(60); expect(f.state.player.hp).toBe(100);
    expect(f.events.filter(event => event.type === 'IMMUNE_CELL_HURT')).toHaveLength(0);
    expect(at).toBeGreaterThan(0);
  });

  it('blocks immune melee through a fold added after a valid telegraph', () => {
    const cell = body('covered', 550, 500), f = fixture(virus(), [cell]); f.step();
    f.state.world!.obstacles = [{ id: 'cover', x: 525, y: 500, radius: 10 }];
    f.resolve(); expect(cell.hp).toBe(60); expect(f.events.some(event => event.type === 'IMMUNE_CELL_HURT')).toBe(false);
  });

  it('aims a special ray at the antibody body and damages only bodies inside its real lane', () => {
    const cell = body('taunt', 850, 500, { antibodyUntil: 8 }), offLane = body('safe', 850, 650);
    const f = fixture(virus({ tactic: 'thin-ray' }), [cell, offLane]); f.step();
    expect(f.target.attackTarget).toBe('immune'); expect(f.target.attackPlan!.aim).toEqual({ x: 850, y: 500 });
    f.resolve(); expect(cell.hp).toBe(50); expect(offLane.hp).toBe(60); expect(f.state.player.hp).toBe(100);
  });

  it('a real charge hits each crossed immune body once despite multiple overlap frames', () => {
    const cell = body('taunt', 850, 500, { antibodyUntil: 8 }), f = fixture(virus({ tactic: 'crystal-charge' }), [cell]);
    f.step(); f.resolve(); expect(f.target.charge).toBeTruthy(); expect(cell.hp).toBe(60);
    for (let frame = 0; frame < 120 && f.target.charge; frame++) f.step();
    expect(cell.hp).toBe(50); expect(f.events.filter(event => event.type === 'IMMUNE_CELL_HURT')).toHaveLength(1);
  });

  it('excludes dead, expired, remote and other-organ cells from threat targeting', () => {
    const f = fixture(virus(), [body('dead', 550, 500, { hp: 0, antibodyUntil: 8 }), body('expired', 550, 500, { until: 0 }),
      body('other', 550, 500, { organId: 'lung', antibodyUntil: 8 }), body('remote', 1200, 500, { antibodyUntil: 8 })]);
    Object.assign(f.state.player, { x: 550, y: 500 }); f.step(); expect(f.target.attackTarget).toBe('player');
  });

  it('routes a tissue raider into physical occupation range and releases it after capture', () => {
    const f = fixture(virus({ id: 'virus-4', assaultObjective: 'tissue' }), []);
    const point = { id: 'aid', kind: 'healing' as const, x: 800, y: 500, active: true, infected: false, infection: 0 };
    f.state.battle!.graph.nodes.push(point);
    for (let frame = 0; frame < 240; frame++) f.step();
    expect(f.target.x).toBeGreaterThan(690); expect(f.target.x).toBeLessThan(700); expect(f.target.y).toBe(500);
    expect(f.target.attackAt).toBeUndefined(); point.infection = 100; point.infected = true;
    f.step(); expect(f.target.y).toBeGreaterThan(500);
  });
});
