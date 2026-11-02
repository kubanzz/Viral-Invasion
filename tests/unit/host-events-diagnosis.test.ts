import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { GrowthController, growthContext } from '../../src/game/growth';
import { BALANCE, type Target } from '../../src/game/types';

function smokeScene() {
  const session = new GameSession(41, { campaign: true, milestone: 'G3' }); session.start();
  expect(session.debugHostEvent('SMOKE', 'lung').ok).toBe(true);
  const state = session.state;
  state.battle!.nextEvolutionAt = Infinity;
  state.battle!.traits = ['CARAPACE', 'FISSION'];
  state.campaign!.migration.status = 'resolved'; state.campaign!.migration.choice = 'ignore';
  for (const id of Object.keys(state.battle!.nextSpawnAt)) state.battle!.nextSpawnAt[id] = Infinity;
  const step = (scan = false) => session.step({ moveX: 0, moveY: 0, aim: state.player, fire: false, scan });
  for (let tick = 0; tick < 480; tick++) step();
  expect(state.hostEvents!.active?.phase).toBe('active');
  const sources = state.targets.filter(target => target.role === 'event');
  expect(sources).toHaveLength(3);
  state.targets = sources;
  return { session, state, sources, step };
}

function virus(session: GameSession): Target {
  const player = session.state.player;
  return { id: 'diagnosis-virus', role: 'virus', kind: 'single', x: player.x + 120, y: player.y,
    hp: 10000, maxHp: 10000, radius: 22, hitUntil: 0, scanned: false, traits: [], attackReady: 1000 };
}

describe('host event targets are not virus diagnosis evidence', () => {
  it('keeps scanning visual smoke sources without granting discovery XP or research', () => {
    const f = smokeScene(); f.step(true);
    expect(f.state.events.filter(event => event.type === 'SCAN_COMPLETED').at(-1)?.data.found).toBe(0);
    expect(f.state.events.filter(event => event.type === 'BATTLE_DIAGNOSED').at(-1)?.data.count).toBe(0);
    expect(f.sources.every(target => target.scanned && target.revealedUntil! > f.state.elapsed)).toBe(true);
    expect(f.state.growth!.xp).toBe(0); expect(f.state.growth!.research).toBe(0);
    expect(f.state.growth!.rewardedKeys).not.toContain('diagnose:baseline');
    expect(f.state.events.some(event => event.type === 'GROWTH_REWARD')).toBe(false);
    expect(f.state.message).toContain('诊断 0 个感染体');
  });

  it.each([true, false])('counts only normal viruses and retains the once-per-run reward, with smoke=%s', mixed => {
    const f = smokeScene(), target = virus(f.session);
    f.state.targets = mixed ? [...f.sources, target] : [target];
    f.step(true);
    expect(f.state.events.filter(event => event.type === 'SCAN_COMPLETED').at(-1)?.data.found).toBe(1);
    expect(f.state.events.filter(event => event.type === 'BATTLE_DIAGNOSED').at(-1)?.data.count).toBe(1);
    expect(f.state.growth!.xp).toBe(6); expect(f.state.growth!.research).toBe(1);
    for (let tick = 0; tick < Math.ceil(BALANCE.scanCooldown / BALANCE.step); tick++) f.step();
    f.step(true);
    expect(f.state.growth!.xp).toBe(6); expect(f.state.growth!.research).toBe(1);
    expect(f.state.growth!.rewardedKeys.filter(key => key === 'diagnose:baseline')).toHaveLength(1);
  });

  it('uses actual diagnostic targets over stale positive event counts, including trait discovery', () => {
    const f = smokeScene(), controller = new GrowthController(41);
    f.sources[0].traits = ['MIMIC'];
    controller.recordEvent({ type: 'BATTLE_DIAGNOSED', tick: f.state.tick, data: { count: 99 } }, growthContext(f.state));
    expect(controller.state.xp).toBe(0); expect(controller.state.research).toBe(0);
    expect(controller.state.rewardedKeys).toEqual([]);
    const normal = virus(f.session); normal.traits = ['MIMIC']; f.state.targets.push(normal);
    controller.recordEvent({ type: 'BATTLE_DIAGNOSED', tick: f.state.tick, data: { count: 0 } }, growthContext(f.state));
    expect(controller.state.xp).toBe(14); expect(controller.state.research).toBe(3);
    expect(controller.state.rewardedKeys).toEqual(['diagnose:baseline', 'diagnose:MIMIC']);
  });

  it('preserves the established context-free historical count-based baseline reward', () => {
    const controller = new GrowthController(41);
    controller.recordEvent({ type: 'BATTLE_DIAGNOSED', tick: 60, data: { count: 1 } });
    expect(controller.state.xp).toBe(6); expect(controller.state.research).toBe(1);
  });
});
