import { describe, expect, it } from 'vitest';
import { GrowthController } from '../../src/game/growth';
import type { GrowthContext, ProtocolId } from '../../src/game/growthTypes';
import { protocolRank } from '../../src/game/protocols';
import { GameSession } from '../../src/game/session';
import { draftOverlay } from '../../src/ui/growthHud';

const context = (): GrowthContext => ({ endless: true, active: true, tick: 60, elapsed: 1,
  organId: 'heart', rhythm: 'rest', player: { x: 500, y: 500 }, aim: { x: 700, y: 500 },
  deviceOrigin: { x: 500, y: 500 }, tissue: { x: 500, y: 700, hp: 100, maxHp: 100, radius: 43 }, targets: [], tool: 1 });
const current = (controller: GrowthController) => controller.state.draft!;
function discard(controller: GrowthController) {
  return controller.discardDraft(current(controller).id, controller.state.runId);
}
function choose(controller: GrowthController, id: ProtocolId) {
  const draft = current(controller), option = draft.options.find(option => option.protocolId === id)!;
  expect(option).toBeTruthy();
  return controller.chooseDraft({ runId: controller.state.runId, draftId: draft.id, optionId: option.id });
}

describe('recurring endless protocol milestones', () => {
  it('queues all earned milestones behind XP without consuming XP, samples or another reward', () => {
    const controller = new GrowthController(71, 'queued', { version: 1, starterProtocolId: 'IMMUNE_BEACON' });
    controller.rewardEndlessWave(1, 1); controller.rewardEndlessWave(2, 2);
    expect(current(controller).source).toBe('xp');
    const xpId = current(controller).id, xp = controller.state.xp;
    for (const wave of [5, 10, 15]) controller.rewardEndlessMilestone(wave, context());
    expect(current(controller).id).toBe(xpId);
    expect(controller.state.nextMilestoneWave).toBe(5);
    expect(controller.state.lastMilestoneWave).toBe(15);
    expect(discard(controller)).toMatchObject({ kind: 'discarded', nextDraftId: current(controller).id });
    for (const wave of [5, 10, 15]) {
      expect(current(controller)).toMatchObject({ source: 'endless', endlessWave: wave });
      controller.rewardEndlessMilestone(wave, context());
      const result = discard(controller);
      if (wave < 15) expect(result).toMatchObject({ nextDraftId: current(controller).id });
    }
    expect(controller.state.draft).toBeNull();
    expect(controller.state.nextMilestoneWave).toBeNull();
    expect(controller.state.xp).toBe(xp);
    expect(controller.state.research).toBe(0);
    expect(controller.state.rewardedKeys).toEqual(['endless-wave:1', 'endless-wave:2']);
    controller.rewardEndlessMilestone(10, context());
    expect(controller.state.draft).toBeNull();
  });

  it('offers both missing synergy partners first and preserves the three-slot replacement transaction', () => {
    const controller = new GrowthController(71, 'partners');
    controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }, { id: 'PULSE_BREAK', tuning: 'balanced' }];
    controller.rewardEndlessMilestone(10, context());
    expect(current(controller).options.map(option => option.protocolId)).toEqual(expect.arrayContaining(['EXPOSE_TRACE', 'PURIFY_CHAIN']));
    expect(choose(controller, 'EXPOSE_TRACE').kind).toBe('committed');
    controller.rewardEndlessMilestone(15, context());
    const draft = current(controller), option = draft.options.find(option => option.protocolId === 'PURIFY_CHAIN')!;
    const intent = { runId: controller.state.runId, draftId: draft.id, optionId: option.id };
    expect(controller.chooseDraft(intent)).toMatchObject({ kind: 'replace-required' });
    expect(controller.state.equipped).toHaveLength(3);
    expect(controller.chooseDraft({ ...intent, slotIndex: 0, expectedPreviousProtocolId: 'EXPOSE_TRACE' }).kind).toBe('rejected');
    expect(controller.chooseDraft({ ...intent, slotIndex: 0, expectedPreviousProtocolId: 'IMMUNE_BEACON' }).kind).toBe('committed');
    expect(controller.state.equipped.map(slot => slot.id)).toEqual(['PURIFY_CHAIN', 'PULSE_BREAK', 'EXPOSE_TRACE']);
    expect(controller.state.equipped).toHaveLength(3);
    expect(controller.chooseDraft(intent).kind).toBe('rejected');
  });

  it('still offers three effective, changing choices at waves 10/15/20 after XP and ranks are capped', () => {
    const controller = new GrowthController(71, 'late');
    Object.assign(controller.state, { xp: 220, level: 5, nextXp: null });
    controller.state.equipped = ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN'].map(id => ({ id: id as ProtocolId, rank: 3, tuning: 'balanced' }));
    const choices: string[] = [];
    for (const wave of [10, 15, 20]) {
      controller.rewardEndlessMilestone(wave, context());
      const draft = current(controller);
      expect(draft).toMatchObject({ source: 'endless', endlessWave: wave });
      expect(new Set(draft.options.map(option => option.protocolId)).size).toBe(3);
      expect(draft.options.some(option => option.protocolId === 'PULSE_BREAK')).toBe(true);
      for (const option of draft.options) {
        const old = controller.state.equipped.find(slot => slot.id === option.protocolId);
        expect(!old || option.tuning !== old.tuning).toBe(true);
        if (old) { expect(option.rank).toBe(3); expect(option.change).toContain('取舍：'); expect(option.change).toContain('→'); }
      }
      const option = draft.options.find(option => option.kind === 'retune')!;
      choices.push(option.id);
      expect(choose(controller, option.protocolId).kind).toBe('committed');
      expect(controller.state.research).toBe(0);
      expect(controller.state.equipped.every(slot => protocolRank(slot) === 3)).toBe(true);
    }
    expect(new Set(choices).size).toBeGreaterThan(1);
    expect(controller.state.xp).toBe(220);
    expect(controller.state.level).toBe(5);
    expect(controller.state.nextXp).toBeNull();
  });

  it('keeps an arbitrarily long earned reward queue and consumed history bounded without losing consecutive milestones', () => {
    const controller = new GrowthController(7, 'bounded');
    for (let wave = 5; wave <= 5000; wave += 5) {
      controller.rewardEndlessMilestone(wave, context());
      controller.afterInput({ ...context(), active: false });
    }
    expect(controller.state.lastMilestoneWave).toBe(5000);
    expect(controller.state.nextMilestoneWave).toBe(10);
    for (let wave = 5; wave <= 5000; wave += 5) {
      expect(current(controller).endlessWave).toBe(wave);
      discard(controller); controller.afterInput({ ...context(), active: false });
    }
    expect(controller.state.draft).toBeNull();
    expect(controller.state.nextMilestoneWave).toBeNull();
    expect(controller.state.consumedDraftIds).toHaveLength(128);
    expect(controller.state.protocolHistory.length).toBeLessThanOrEqual(128);
    expect(controller.state.pendingLogs).toEqual([]);
    expect(controller.state.rewardedKeys).toEqual([]);
    const restarted = new GrowthController(7, 'fresh');
    expect(restarted.state).toMatchObject({ lastMilestoneWave: 0, nextMilestoneWave: null, consumedDraftIds: [] });
  });

  it('rejects non-milestones, old waves, inactive runs and invented gaps in a pending queue', () => {
    const controller = new GrowthController(7, 'validation');
    for (const wave of [-5, 0, 1, 6, 10.5, Infinity, NaN]) controller.rewardEndlessMilestone(wave, context());
    controller.rewardEndlessMilestone(5, { ...context(), endless: false });
    controller.rewardEndlessMilestone(5, { ...context(), active: false });
    expect(controller.state.draft).toBeNull();
    controller.rewardEndlessMilestone(5, context());
    controller.rewardEndlessMilestone(10, context());
    controller.rewardEndlessMilestone(20, context());
    expect(controller.state.lastMilestoneWave).toBe(10);
    controller.recordEvent({ type: 'RUN_ENDED', tick: 60, data: {} }, context());
    expect(controller.state.nextMilestoneWave).toBeNull();
    controller.rewardEndlessMilestone(15, context());
    expect(controller.state.draft).toBeNull();
  });

  it('replays identical equipment/history choices deterministically and labels the free, optional UI reward', () => {
    const controllers = [new GrowthController(71, 'same'), new GrowthController(71, 'same')];
    for (const controller of controllers) {
      controller.state.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced', rank: 3 }];
      controller.rewardEndlessMilestone(10, context());
    }
    expect(controllers[0].state).toEqual(controllers[1].state);
    const session = new GameSession(71, { mode: 'endless' }); session.start();
    session.state.growth = controllers[0].state;
    const markup = draftOverlay(session.state)!;
    for (const copy of ['精英波联动重配', '第 10 波', '免样本', '可放弃', '不会抵消本波战斗成长', '取舍：']) expect(markup).toContain(copy);
    expect(markup).not.toContain('本次已消耗');
  });
});
