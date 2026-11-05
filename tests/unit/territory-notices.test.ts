import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { territoryRuleNotice } from '../../src/game/territoryNotices';

describe('territory event guidance follows the actual objective', () => {
  it('distinguishes a threatened front from ordinary spring contamination', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    const before = structuredClone(game.state);
    const front = territoryRuleNotice(game.state, { type: 'TERRITORY_CONTESTED', data: { nodeId: 'front-north' } });
    const spring = territoryRuleNotice(game.state, { type: 'TERRITORY_CONTESTED', data: { nodeId: 'heart-healing-2' } });
    expect(front?.text).toContain('北线前沿'); expect(front?.text).not.toContain('生命泉');
    expect(spring?.text).toContain('南侧生命泉'); expect(spring?.text).toContain('泉边病毒');
    expect(spring?.text).not.toContain('标记侵染者'); expect(game.state).toEqual(before);
  });
  it('never instructs players to wait for an army bite from obsolete handoff events', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    for (const type of ['TERRITORY_HANDOFF_STARTED','TERRITORY_HANDOFF_FAILED','TERRITORY_HANDOFF_COMPLETED'])
      expect(territoryRuleNotice(game.state,{type,data:{laneId:'south',reason:'no-immune-interception'}})).toBeNull();
  });
  it('announces membrane loss on purification and regeneration only after a supplier falls', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    const state = game.state, front = state.territory!.nodes.find(node => node.id === 'front-south')!;
    state.territory!.sources['source-east'].spawned = true; front.owner = 'healthy';
    const purified = territoryRuleNotice(state, { type: 'TERRITORY_PURIFIED', data: { nodeId: front.id } });
    expect(purified?.text).toContain('东侧感染源供能切断，护膜解除');
    front.owner = 'infected';
    const captured = territoryRuleNotice(state, { type: 'TERRITORY_CAPTURED', data: { nodeId: front.id } });
    expect(captured?.text).toContain('源膜重新生成');
    state.territory!.sources['source-east'].destroyed = true;
    expect(territoryRuleNotice(state, { type: 'TERRITORY_CAPTURED', data: { nodeId: front.id } })?.text).not.toContain('源膜重新生成');
  });
});
