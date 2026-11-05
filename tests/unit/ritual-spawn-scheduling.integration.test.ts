import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { EndlessDirector } from '../../src/game/endless';
import { advanceSmartViruses, cancelSmartSupports } from '../../src/game/smartViruses';
import { combatPopulation } from '../../src/game/combatPopulation';
import { distance } from '../../src/actors/collision';
import type { GameEvent } from '../../src/game/types';

/** Controlled actor removals keep this producer regression independent of combat AI.
 * The real seed-71 wave plan and the normal beforeInput / smart / afterInput order
 * reproduce the one-tick round-off between the two producers' same due time. */
describe('warned ritual plots participate in production spawn scheduling', () => {
  it('does not let the simultaneous north squad occupy and cancel its own ritual', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    const state = game.state, e = state.endless!, events: GameEvent[] = [];
    state.targets = []; Object.assign(state.player, { x: 1100, y: 350 });
    Object.assign(e, { wave: 2, phase: 'intermission', phaseUntil: 0 });
    const host = { state, emit: (type: string, data: GameEvent['data']) => events.push({ type, data, tick: state.tick }),
      message() {}, effect() {}, completeWave() {} };
    const director = new EndlessDirector(host);
    director.beforeInput(); expect(e.wave).toBe(3); expect(e.phase).toBe('warning');
    state.tick = 3095; state.elapsed = state.tick / 60;
    director.beforeInput(); expect(e.phase).toBe('combat');
    advanceSmartViruses(host); director.afterInput();
    const ritual = e.smartSupport!.plans.find(p => p.kind === 'ritual')!;
    const north = e.territoryTasks!.squads[2];
    expect(north.laneId).toBe('north'); expect(ritual.laneId).toBe('north');
    expect(north.departureOffset).toBe(ritual.departureOffset);
    let maxReserved = 0, warningPositions: typeof ritual.ritualPositions;
    let northBeforeRitual = false;
    for (let frame = 0; frame < 25 * 60; frame++) {
      state.tick++; state.elapsed = state.tick / 60;
      // Preserve the actual colliding squad across the next smart-producer step.
      state.targets = state.targets.filter(t => t.territoryTask?.squadId === north.id || !!t.profession?.startsWith('ritual-'));
      director.beforeInput(); advanceSmartViruses(host);
      if (ritual.status === 'warning') warningPositions ??= structuredClone(ritual.ritualPositions);
      const oldIds = new Set(state.targets.map(t => t.id));
      director.afterInput();
      if (ritual.status === 'warning' && north.status === 'active') northBeforeRitual = true;
      if (ritual.status === 'warning') for (const target of state.targets.filter(t => !oldIds.has(t.id)))
        for (const [index, plot] of ritual.ritualPositions!.entries())
          expect(distance(target, plot)).toBeGreaterThanOrEqual(target.radius + (index ? 22 : 32) + 12);
      maxReserved = Math.max(maxReserved, combatPopulation(state).reserved);
      expect(maxReserved).toBeLessThanOrEqual(48);
    }
    expect(northBeforeRitual, 'the actual squad producer runs before the next ritual due step').toBe(true);
    expect(north.memberIds).toHaveLength(4);
    expect(ritual.ritualPositions).toEqual(warningPositions);
    expect(ritual.bornSlots).toHaveLength(4); expect(ritual.status).toBe('active');
    expect(events.filter(event => event.type === 'RITUAL_SPAWNED')).toHaveLength(1);
    expect(events.filter(event => event.type === 'SMART_SUPPORT_CANCELED' && event.data.id === ritual.id)).toEqual([]);
    const canceled = e.canceledToSpawn;
    cancelSmartSupports(host, ritual.sourceId); cancelSmartSupports(host, ritual.sourceId);
    expect(e.canceledToSpawn).toBe(canceled);
    expect(state.targets.filter(t => t.profession?.startsWith('ritual-'))).toHaveLength(4);
    expect(combatPopulation(state).reserved).toBeLessThanOrEqual(48);
  });
});
