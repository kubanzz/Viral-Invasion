import { describe, expect, it } from 'vitest';
import { GrowthController } from '../../src/game/growth';
import { GameSession } from '../../src/game/session';
import type { GrowthContext } from '../../src/game/growthTypes';
import type { LegionDeployment } from '../../src/game/legionCatalog';
import type { GameEvent } from '../../src/game/types';

function context(legions: LegionDeployment[], elapsed = 0): GrowthContext {
  return { mission: true, legions, active: true, tick: elapsed * 60, elapsed, organId: 'heart', rhythm: 'rest',
    player: { x: 500, y: 500 }, aim: { x: 600, y: 500 }, deviceOrigin: { x: 500, y: 500 },
    tissue: { x: 300, y: 700, hp: 100, maxHp: 100, radius: 43 }, targets: [], tool: 1,
    geometry: { width: 1800, height: 1200, bounds: { left: 20, right: 1780, top: 20, bottom: 1180 },
      obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } } };
}

describe('v0.20 permanent legion battle deployments', () => {
  it('uses one commander, two lancers and one prism, preserving 180% attack budget and hunger penalty', () => {
    const deployments: LegionDeployment[] = [{ legionId: 'seraph', slot: 0, fed: true }, { legionId: 'ranger', slot: 1, fed: false }];
    const growth = new GrowthController(123, 'legion-identity'); growth.onScan(context(deployments));
    const seraph = growth.state.cells!;
    expect(seraph).toHaveLength(4);
    expect(seraph.filter(cell => cell.legionRole === 'leader')).toHaveLength(1);
    expect(seraph.map(cell => cell.maxHp)).toEqual([120, 72, 72, 72]);
    expect(seraph.map(cell => cell.seraphRole)).toEqual(['commander','lancer','lancer','prism']);
    expect(seraph.reduce((sum, cell) => sum + cell.damage, 0)).toBeCloseTo(43.2);
    growth.onScan(context(deployments, 12));
    const ranger = growth.state.cells!.filter(cell => cell.legionId === 'ranger');
    expect(ranger).toHaveLength(3);
    expect(ranger.every(cell => cell.maxHp === 40.5)).toBe(true);
    expect(ranger.reduce((sum, cell) => sum + cell.damage, 0)).toBeCloseTo(22.5);
    expect(growth.state.beacons).toHaveLength(2);
  });

  it('preserves injuries and slot identity when redirecting and only replaces a wholly dead squad', () => {
    const deployments: LegionDeployment[] = [{ legionId: 'seraph', slot: 0, fed: false }];
    const growth = new GrowthController(123, 'legion-casualties'); growth.onScan(context(deployments));
    const firstId = growth.state.beacon!.id; growth.state.cells![0].hp = 12;
    growth.onScan(context(deployments, 12));
    expect(growth.state.beacons).toHaveLength(1);
    expect(growth.state.cells![0].hp).toBe(12);
    for (const cell of growth.state.cells!) cell.hp = 0;
    growth.afterInput(context(deployments, 13)); growth.onScan(context(deployments, 14));
    expect(growth.state.beacon!.id).not.toBe(firstId);
    expect(growth.state.beacon!.legionSlot).toBe(0);
    expect(growth.state.cells![0].hp).toBe(90);
  });

  it('accepts real commander contact against an explicitly ordered core and shares pursuit across R echoes', () => {
    const game = new GameSession(123, { mode: 'endless', territory: true }); game.start();
    game.configureExpedition({ runId: 'seraph-core', seed: 123, loadout: { weaponId: 'steady', rarity: 'purple', upgrade: 0 },
      blueprints: [], extraAntibodies: 0, firstClear: false, missionId: 'boundary',
      legions: [{ legionId: 'seraph', slot: 0, fed: true }] });
    const state = game.state, events: GameEvent[] = [];
    state.world = { ...state.world!, obstacles: [] };
    Object.assign(state.player, { x: 1100, y: 750 }); state.territory!.stage = 'guard';
    Object.assign(state.endless!, { remainingToSpawn: 1, nextSpawnAt: Infinity });
    const core = { id: 'legion-test-core', x: 1190, y: 750, hp: 10000, maxHp: 10000, radius: 52,
      kind: 'single' as const, role: 'core' as const, hitUntil: 0, scanned: false, traits: [] };
    state.targets = [core];
    game.bus.on('event', event => events.push(event));
    game.step({ moveX: 0, moveY: 0, fire: false, aim: core, scan: true, scanAim: core });
    expect(state.growth!.beacon!.focus?.targetId).toBe(core.id);
    for (let frame = 0; frame < 180; frame++) {
      game.step({ moveX: 0, moveY: 0, fire: false, aim: core, antibody: frame === 30 });
    }
    expect(core.hp).toBeLessThan(10000);
    expect(events.filter(event => event.type === 'LEGION_SACRED_PURSUIT')).toHaveLength(1);
    expect(state.growth!.cells!.some(cell => cell.echo)).toBe(true);
    expect(state.growth!.beacons).toHaveLength(1);
  });
});
