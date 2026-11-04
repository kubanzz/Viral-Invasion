import { describe, expect, it } from 'vitest';
import { GrowthController } from '../../src/game/growth';
import { advanceImmuneCells, ANTIBODY_BALANCE, livingImmuneCells } from '../../src/game/immuneCells';
import type { GrowthContext } from '../../src/game/growthTypes';
import type { Target, WorldGeometry } from '../../src/game/types';

const geometry: WorldGeometry = { width: 1800, height: 1200, bounds: { left: 20, right: 1780, top: 20, bottom: 1180 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const context = (elapsed = 0): GrowthContext => ({ tick: Math.round(elapsed * 60), elapsed, active: true, organId: 'heart', rhythm: 'rest',
  player: { x: 500, y: 500 }, aim: { x: 560, y: 500 }, deviceOrigin: { x: 500, y: 500 },
  tissue: { x: 350, y: 700, hp: 100, maxHp: 100, radius: 43 }, targets: [], tool: 1, geometry });
const controller = () => new GrowthController(123, 'legions', { version: 1, starterProtocolId: 'IMMUNE_BEACON' });

describe('persistent, bounded immune legions', () => {
  it('keeps two independent deployments alive indefinitely and redirects instead of overwriting a third', () => {
    const growth = controller();
    growth.onScan(context());
    const first = growth.state.cells!.map(cell => cell.id);
    growth.onScan({ ...context(12), aim: { x: 700, y: 500 } });
    expect(growth.state.beacons).toHaveLength(2);
    expect(growth.state.cells).toHaveLength(6);
    growth.onScan({ ...context(24), aim: { x: 800, y: 500 } });
    expect(growth.state.beacons).toHaveLength(2);
    expect(growth.state.cells!.filter(cell => first.includes(cell.id))).toHaveLength(3);
    growth.afterInput(context(10000));
    expect(growth.state.cells).toHaveLength(6);
    expect(growth.state.cells!.every(cell => cell.hp === 60 && cell.until === Infinity)).toBe(true);
  });

  it('keeps veteran wounds, adds one body per earned rank, and never auto refills casualties', () => {
    const growth = controller(); growth.onScan(context());
    const veteran = growth.state.cells![0]; veteran.hp = 30;
    growth.state.cells![1].hp = 0;
    growth.afterInput(context(1));
    expect(growth.state.cells).toHaveLength(2);
    growth.afterInput(context(2));
    expect(growth.state.cells).toHaveLength(2);
    growth.state.equipped[0].rank = 2;
    growth.afterInput(context(3));
    expect(growth.state.cells).toHaveLength(3);
    expect(growth.state.beacon!.cellCount).toBe(4);
    expect(growth.state.cells!.find(cell => cell.id === veteran.id)!.hp).toBe(30);
    expect(growth.state.cells!.find(cell => cell.id === veteran.id)!.maxHp).toBe(72);
    growth.state.equipped[0].rank = 3;
    growth.afterInput(context(4));
    expect(growth.state.cells).toHaveLength(4);
    expect(growth.state.beacon!.cellCount).toBe(5);
    expect(growth.state.cells!.find(cell => cell.id === veteran.id)!.hp).toBe(30);
    expect(growth.state.cells!.find(cell => cell.id === veteran.id)!.maxHp).toBe(84);
    growth.afterInput(context(5));
    expect(growth.state.cells).toHaveLength(4);
  });

  it('converts surviving patrols when equipped and grows from endless immune upgrades', () => {
    const growth = new GrowthController(12);
    growth.onScan(context()); expect(growth.state.cells).toHaveLength(1);
    growth.state.equipped.push({ id: 'IMMUNE_BEACON', tuning: 'balanced' });
    growth.afterInput(context(1));
    expect(growth.state.cells).toHaveLength(3);
    growth.afterInput({ ...context(2), endless: true, immuneRank: 1 });
    expect(growth.state.cells).toHaveLength(4);
    growth.afterInput({ ...context(3), endless: true, immuneRank: 2 });
    expect(growth.state.cells).toHaveLength(5);
  });

  it('preserves offscreen legions and releases a deployment slot only when all its bodies die', () => {
    const growth = controller(); growth.onScan(context()); growth.onScan(context(12));
    growth.afterInput({ ...context(15), organId: 'lung' });
    expect(growth.state.beacons).toHaveLength(2);
    expect(growth.state.cells).toHaveLength(6);
    growth.afterInput(context(20));
    const deadId = growth.state.beacons![0].id;
    for (const cell of growth.state.cells!) if (cell.beaconId === deadId) cell.hp = 0;
    growth.afterInput(context(24));
    expect(growth.state.beacons).toHaveLength(1);
    growth.onScan(context(25));
    expect(growth.state.beacons).toHaveLength(2);
    expect(growth.state.cells!.some(cell => cell.beaconId === deadId)).toBe(false);
  });
});

describe('antibody consumable', () => {
  it('splits surviving bodies, charges a third of current health, and bounds charges and repeated fission', () => {
    const growth = controller();
    expect(growth.injectAntibody(context())).toEqual({ kind: 'rejected', reason: 'no-cells' });
    growth.onScan(context());
    growth.state.cells![0].hp = 30;
    growth.state.cells![1].hp = 0;
    const ids = livingImmuneCells(growth.state.cells!, 1).map(cell => cell.id);
    expect(growth.injectAntibody(context(1))).toEqual({ kind: 'used' });
    expect(growth.state.antibodyCharges).toBe(1);
    expect(growth.state.cells).toHaveLength(4);
    expect(new Set(growth.state.cells!.map(cell => cell.id)).size).toBe(4);
    expect(growth.state.cells!.find(cell => cell.id === ids[0])!.hp).toBe(20);
    expect(growth.state.cells!.every(cell => cell.antibodyUntil === 9)).toBe(true);
    expect(growth.injectAntibody(context(2))).toEqual({ kind: 'rejected', reason: 'active' });
    expect(growth.state.antibodyCharges).toBe(1);
    expect(growth.injectAntibody(context(10))).toEqual({ kind: 'used' });
    expect(growth.state.cells).toHaveLength(8);
    expect(growth.injectAntibody(context(21))).toEqual({ kind: 'rejected', reason: 'empty' });
    expect(growth.state.antibodyCharges).toBe(0);
  });

  it('increases real travel speed and contact damage temporarily without changing base stats', () => {
    const growth = controller(); growth.onScan(context()); growth.injectAntibody(context(1));
    const beacon = growth.state.beacon!, cell = { ...growth.state.cells![0], x: 500, y: 500, updatedAt: 1, attackReadyAt: 0 };
    const target: Target = { id: 'danger', x: 600, y: 500, radius: 22, hp: 1000, maxHp: 1000, role: 'virus', kind: 'single', hitUntil: 0, scanned: false };
    const activeContext = { ...context(1 + 1 / 60), targets: [target] };
    const boosted = advanceImmuneCells([cell], beacon, activeContext);
    const normal = advanceImmuneCells([{ ...cell, antibodyUntil: 0 }], beacon, activeContext);
    expect(boosted.cells[0].x - cell.x).toBeCloseTo((normal.cells[0].x - cell.x) * ANTIBODY_BALANCE.speedMultiplier);
    target.x = 535;
    const bite = advanceImmuneCells([cell], beacon, activeContext).commands.find(command => command.kind === 'damage');
    expect(bite?.kind === 'damage' && bite.amount).toBe(cell.damage * ANTIBODY_BALANCE.damageMultiplier);
    const expired = advanceImmuneCells([{ ...cell, updatedAt: 10 }], beacon, { ...context(10 + 1 / 60), targets: [target] });
    const expiredBite = expired.commands.find(command => command.kind === 'damage');
    expect(expiredBite?.kind === 'damage' && expiredBite.amount).toBe(cell.damage);
    expect(expired.cells[0].damage).toBe(cell.damage);
  });
});
