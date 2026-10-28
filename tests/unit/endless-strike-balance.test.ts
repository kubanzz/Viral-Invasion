import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { activeWorld, type InputFrame, type Target } from '../../src/game/types';
import type { EnemyTactic } from '../../src/game/enemyTacticsTypes';

const idle: InputFrame = { moveX: 0, moveY: 0, fire: false, aim: { x: 950, y: 500 } };
function fixture(tactic: EnemyTactic = 'melee', objective: 'player' | 'tissue' = 'player', wave = 1, elite = false, endless = true) {
  const session = new GameSession(71, endless ? { mode: 'endless' } : { campaign: true }); session.start();
  const state = session.state; state.world = { ...activeWorld(state), obstacles: [] };
  Object.assign(state.player, { x: 500, y: 500 }); Object.assign(state.tissue, { x: 950, y: 500, hp: 100 });
  state.battle!.graph.edges = []; state.battle!.nextSpawnAt = {}; state.battle!.nextEvolutionAt = Infinity;
  for (const node of state.battle!.graph.nodes) if (node.kind === 'source') node.active = false;
  if (state.endless) Object.assign(state.endless, { wave, phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: Infinity });
  const x = objective === 'tissue' ? 875 : tactic === 'melee' ? 550 : 850;
  const actor: Target = { id: 'strike-fixture', x, y: 500, radius: elite ? 30 : 22, hp: 1000, maxHp: 1000,
    role: elite ? 'elite' : 'virus', kind: 'single', hitUntil: 0, scanned: false, traits: [], tactic, attackReady: 0,
    ...(objective === 'tissue' && endless ? { assaultObjective: 'tissue' as const } : {}) };
  if (!endless && objective === 'tissue') actor.traits = ['MIMIC'];
  state.targets = [actor];
  const step = (input: Partial<InputFrame> = {}) => session.step({ ...idle, ...input });
  const untilResolve = (input: Partial<InputFrame> = {}) => {
    const deadline = actor.attackAt!;
    for (let frame = 0; frame < 150 && state.phase === 'playing' && state.elapsed + 1e-9 < deadline; frame++) step(input);
  };
  return { session, state, actor, step, untilResolve };
}

describe('public wave-only continuous strike strength', () => {
  it('applies ordinary player10 and tissue7 only after their full real melee warnings', () => {
    for (const [objective, damage] of [['player', 10], ['tissue', 7]] as const) {
      const f = fixture('melee', objective, objective === 'tissue' ? 6 : 1); f.step();
      expect(f.actor.attackAt! - f.state.elapsed).toBeCloseTo(BATTLE_BALANCE.attackWindup);
      expect(f.state.player.hp).toBe(100); expect(f.state.tissue.hp).toBe(100);
      for (let frame = 0; frame < 40; frame++) f.step();
      expect(f.state.player.hp).toBe(100); expect(f.state.tissue.hp).toBe(100);
      f.untilResolve(); expect(objective === 'player' ? f.state.player.hp : f.state.tissue.hp).toBe(100 - damage);
    }
  });

  it('retains the fixed every4/every8-wave increments and the public elite8 bonus', () => {
    const player = fixture('melee', 'player', 13); player.step(); player.untilResolve(); expect(player.state.player.hp).toBe(87);
    const tissue = fixture('melee', 'tissue', 17); tissue.step(); tissue.untilResolve(); expect(tissue.state.tissue.hp).toBe(91);
    const elite = fixture('melee', 'player', 5, true); elite.step(); elite.untilResolve(); expect(elite.state.player.hp).toBe(81);
  });

  it('uses the same special player10 and elite8 while retaining the point-shot warning', () => {
    for (const [wave, elite, damage] of [[1, false, 10], [5, true, 19]] as const) {
      const f = fixture('thin-ray', 'player', wave, elite); f.step();
      expect(f.actor.attackPlan?.windup).toBe(1.05); expect(f.actor.attackPlan?.playerDamage).toBe(damage);
      expect(f.state.player.hp).toBe(100); f.untilResolve(); expect(f.state.player.hp).toBe(100 - damage);
    }
  });

  it('makes a completed corrosion channel deal organization9, while a real Q interruption prevents all damage', () => {
    const hit = fixture('mimic-corrosion', 'tissue', 6); hit.step();
    expect(hit.actor.attackPlan?.windup).toBe(1.8); expect(hit.actor.attackPlan?.tissueDamage).toBe(9);
    expect(hit.state.tissue.hp).toBe(100); hit.untilResolve(); expect(hit.state.tissue.hp).toBe(91);
    const counter = fixture('mimic-corrosion', 'tissue', 6);
    // Use the universal Q counter, without the optional lamp's real tissue cost.
    counter.state.growth!.equipped = []; counter.step();
    counter.step({ scan: true, aim: counter.actor });
    expect(counter.actor.attackAt).toBeUndefined();
    for (let frame = 0; frame < 120; frame++) counter.step();
    expect(counter.state.tissue.hp).toBe(100);
    expect(counter.state.events.some(event => event.type === 'ENDLESS_CORROSION_INTERRUPTED')).toBe(true);
  });

  it('allows basic movement to evade melee and fixed point-shot footprints with zero damage', () => {
    for (const tactic of ['melee', 'thin-ray'] as const) {
      const f = fixture(tactic); f.step(); f.untilResolve({ moveY: 1 });
      expect(f.state.player.hp).toBe(100); expect(f.state.battle!.stats.playerDamage).toBe(0);
    }
  });

  it('keeps the normal repair action able to recover a stronger organization strike', () => {
    const f = fixture('melee', 'tissue', 6); f.step(); f.untilResolve(); expect(f.state.tissue.hp).toBe(93);
    f.step({ fire: true, tool: 3, aim: f.state.tissue }); expect(f.state.tissue.hp).toBe(100);
    expect(f.state.events.some(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'repair'
      && event.data.before === 93 && event.data.after === 100)).toBe(true);
  });

  it('preserves the existing campaign7/4 damage rather than applying the challenge curve globally', () => {
    expect(BATTLE_BALANCE.playerDamage).toBe(7); expect(BATTLE_BALANCE.tissueDamage).toBe(4);
    const player = fixture('melee', 'player', 1, false, false); player.step(); player.untilResolve(); expect(player.state.player.hp).toBe(93);
    const tissue = fixture('melee', 'tissue', 1, false, false); tissue.step(); tissue.untilResolve(); expect(tissue.state.tissue.hp).toBe(96);
  });
});
