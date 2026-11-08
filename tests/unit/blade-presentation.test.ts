import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createWeaponCombat } from '../../src/game/weaponSkills';
import { Player3DMotionController } from '../../src/render/player3DMotion';

function fixture() {
  const game = new GameSession(71); game.start(); const state = game.state;
  state.weaponCombat = createWeaponCombat({ weaponId: 'redblade', rarity: 'gold', upgrade: 0 }); state.events = [];
  return { state, motion: new Player3DMotionController() };
}
describe('blade technique bone animation dispatch', () => {
  it('uses the accepted guard clip then interrupts it on the authoritative counter receipt', () => {
    const { state, motion } = fixture();
    state.weaponCombat!.bladeParry = { castId: 'guard', startedAt: state.elapsed, until: state.elapsed + .45, direction: { x: 1, y: 0 }, damage: 45, resolved: false };
    motion.observe(state); expect(motion.sample(state).upperEvent?.clip).toBe('Blade_Guard_v020');
    state.tick++; state.elapsed += 1 / 60; state.weaponCombat!.bladeParry.resolved = true;
    state.events = [{ type: 'BLADE_PARRY_COUNTER', tick: state.tick, data: { castId: 'guard', perfect: true } }];
    motion.observe(state); const counter = motion.sample(state);
    expect(counter.upperEvent?.clip).toBe('Blade_Counter_v020');
    expect(counter.upperEvent?.age).toBe(0);
    state.phase = 'paused'; state.visualTime = state.elapsed + 99;
    expect(motion.sample(state).upperEvent).toEqual(counter.upperEvent);
  });
  it('dispatches a full body fourfold loop without a second locomotion action and finishes with sheath', () => {
    const { state, motion } = fixture();
    state.weaponCombat!.bladeTrace = { castId: 'fourfold', phase: 'executing', startedAt: state.elapsed - 3, executionStartedAt: state.elapsed,
      deadline: state.elapsed, until: state.elapsed + 1, damage: 45, marks: [], path: [], route: [], routeIndex: 0,
      lastAt: state.elapsed, manual: false, hitIds: [], elapsedDistance: 0, speed: 1800 };
    state.player.facing = .71; motion.observe(state); const dash = motion.sample(state);
    expect(dash.fullBodyEvent?.clip).toBe('Blade_FourfoldDash_v020');
    expect(dash.fullBodyEvent?.age).toBe(0); expect(dash.upperClip).toBeUndefined(); expect(dash.bodyFacing).toBe(.71);
    state.tick++; state.elapsed += 1 / 60; state.weaponCombat!.bladeTrace.phase = 'recovery';
    state.events = [{ type: 'BLADE_TRACE_FINISHED', tick: state.tick, data: { castId: 'fourfold' } }];
    state.weaponCombat!.bladeTrace.until = state.elapsed + .3;
    motion.observe(state); expect(motion.sample(state).fullBodyEvent?.clip).toBe('Blade_FinishSettle_v022');
    // Wave cleanup can remove the trace after the final impact, before rendering.
    delete state.weaponCombat!.bladeTrace;
    state.tick++; state.elapsed += .1; state.events = [];
    motion.observe(state); const finish = motion.sample(state).fullBodyEvent;
    expect(finish?.clip).toBe('Blade_FinishSettle_v022'); expect(finish?.age).toBeCloseTo(.1);
    state.phase = 'paused'; state.visualTime = state.elapsed + 99;
    expect(motion.sample(state).fullBodyEvent).toEqual(finish);
    state.phase = 'playing'; delete state.visualTime; state.tick++; state.elapsed += .21;
    motion.observe(state); expect(motion.sample(state).fullBodyEvent).toBeUndefined();
  });
  it('clears a receipt-driven finish on death, scene changes and reset', () => {
    for (const end of ['death', 'scene', 'reset'] as const) {
      const { state, motion } = fixture();
      state.events = [{ type: 'BLADE_TRACE_FINISHED', tick: state.tick, data: { castId: 'fourfold' } }];
      motion.observe(state); expect(motion.sample(state).fullBodyEvent?.clip).toBe('Blade_FinishSettle_v022');
      if (end === 'death') state.player.hp = 0;
      else if (end === 'scene') state.phase = 'menu';
      else motion.reset();
      expect(motion.sample(state).fullBodyEvent).toBeUndefined();
    }
  });
});
