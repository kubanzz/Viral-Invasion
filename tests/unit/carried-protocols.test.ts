import { describe, expect, it } from 'vitest';
import { GrowthController } from '../../src/game/growth';
import { preparationForPlan } from '../../src/game/preparation';
import { PROTOCOL_IDS, protocolRank } from '../../src/game/protocols';
import { GameSession } from '../../src/game/session';
import { buildRunSummary, ProfileStore } from '../../src/meta/profile';
import type { GrowthCommand, GrowthContext, ProtocolId, ResearchDirectionId } from '../../src/game/growthTypes';
import type { GameEvent, Target } from '../../src/game/types';

const observed: Target[] = (['CARAPACE', 'FISSION', 'MIMIC'] as const).map((trait, index) => ({ id: trait, x: 700 + index * 20, y: 400, kind: 'single', role: 'virus', hp: 68, maxHp: 68, radius: 22, hitUntil: 0, scanned: false, traits: [trait] }));
const context = (elapsed = 1): GrowthContext => ({ tick: Math.round(elapsed * 60), elapsed, active: true, organId: 'heart', rhythm: 'rest', player: { x: 600, y: 400 }, aim: { x: 700, y: 400 }, deviceOrigin: { x: 730, y: 230 }, tissue: { x: 780, y: 610, hp: 60, maxHp: 100, radius: 43 }, targets: observed, tool: 1 });
const event = (type: string, data: GameEvent['data'] = {}): GameEvent => ({ type, tick: 60, data });
function research(c: GrowthController, direction: ResearchDirectionId) {
  expect(c.requestResearch('heart-lab', context()).kind).toBe('requested');
  expect(c.confirmResearch({ runId: c.state.runId, requestId: c.state.pendingResearch!.id, direction }).kind).toBe('opened');
}
function select(c: GrowthController, id: ProtocolId) {
  const draft = c.state.draft!, option = draft.options.find(option => option.protocolId === id)!;
  expect(option).toBeDefined();
  return c.chooseDraft({ runId: c.state.runId, draftId: draft.id, optionId: option.id });
}

describe('bounded independent carrying evidence', () => {
  it('keeps accepted early equipment through replacement and log eviction, then unlocks it from a serialized result', () => {
    const c = new GrowthController(28, 'carrying-run');
    let diagnosticEvents: GameEvent[] = [];
    const retain = (commands: GrowthCommand[], at = context()) => {
      diagnosticEvents.push(...commands.filter(command => command.kind === 'log').map(command => ({ type: command.type, data: command.data, tick: at.tick })));
      diagnosticEvents = diagnosticEvents.slice(-512);
    };
    const flush = () => retain(c.afterInput(context()));
    const discardXp = () => { flush(); while (c.state.draft) { c.discardDraft(c.state.draft.id); flush(); } };
    // Samples and directions are earned from the accepted objective and diagnosis event paths.
    c.recordEvent(event('BATTLE_DIAGNOSED', { count: observed.length }), context()); discardXp();
    for (let index = 0; index < 4; index++) { c.recordEvent(event('INFECTION_SOURCE_CLEARED', { nodeId: `source-${index}`, organId: 'heart' }), context()); discardXp(); }
    expect(c.state.research).toBe(15); expect(c.state.carriedProtocols).toEqual([]);

    research(c, 'CARAPACE'); expect(select(c, 'PULSE_BREAK').kind).toBe('committed'); flush();
    expect(c.state.carriedProtocols).toEqual(['PULSE_BREAK']);
    research(c, 'CARAPACE'); expect(select(c, 'PULSE_BREAK').kind).toBe('committed'); flush();
    expect(protocolRank(c.state.equipped[0])).toBe(2); expect(c.state.carriedProtocols).toEqual(['PULSE_BREAK']);
    research(c, 'CARAPACE'); expect(select(c, 'PURIFY_CHAIN').kind).toBe('committed'); flush();
    research(c, 'MIMIC'); expect(select(c, 'IMMUNE_BEACON').kind).toBe('committed'); flush();

    research(c, 'MIMIC');
    const draft = c.state.draft!, option = draft.options.find(option => option.protocolId === 'EXPOSE_TRACE')!;
    const intent = { runId: c.state.runId, draftId: draft.id, optionId: option.id };
    expect(c.chooseDraft({ ...intent, optionId: 'invalid-option' }).kind).toBe('rejected');
    expect(c.chooseDraft(intent).kind).toBe('replace-required');
    expect(c.state.carriedProtocols).not.toContain('EXPOSE_TRACE');
    expect(c.chooseDraft({ ...intent, slotIndex: 0, expectedPreviousProtocolId: 'IMMUNE_BEACON' }).kind).toBe('rejected');
    expect(c.state.carriedProtocols).not.toContain('EXPOSE_TRACE');
    expect(c.chooseDraft({ ...intent, slotIndex: 0, expectedPreviousProtocolId: 'PULSE_BREAK' }).kind).toBe('committed'); flush();
    expect(c.state.equipped.some(slot => slot.id === 'PULSE_BREAK')).toBe(false);
    expect(c.state.carriedProtocols).toEqual(PROTOCOL_IDS);
    expect(c.chooseDraft(intent).kind).toBe('rejected'); expect(c.state.carriedProtocols).toHaveLength(4);

    // Repeated legal scans exercise the unchanged 128-entry history cap and a host-sized 512-event ring.
    for (let index = 0; index < 300; index++) {
      const at = context(15 + index * 13);
      retain(c.onScan(at), at); retain(c.afterInput(at), at);
    }
    expect(c.state.protocolHistory).toHaveLength(128); expect(diagnosticEvents).toHaveLength(512);
    expect(c.state.protocolHistory.some(entry => entry.type === 'PROTOCOL_EQUIPPED')).toBe(false);
    expect(diagnosticEvents.some(entry => entry.type === 'PROTOCOL_EQUIPPED')).toBe(false);
    expect(c.state.carriedProtocols).toEqual(PROTOCOL_IDS);

    // A terminal serialization fixture carries this controller state; this is not a simulated win or loss.
    const serialized = new GameSession(28, { campaign: true, encounterMode: 'formal', counterGuide: 'adaptive' }).snapshot();
    serialized.phase = 'result'; serialized.result = { success: false, reason: 'Terminal serialization fixture for independent carrying evidence.' };
    serialized.growth = c.state; serialized.events = diagnosticEvents;
    expect(buildRunSummary(serialized).protocols).toEqual(PROTOCOL_IDS);
    const store = new ProfileStore(null);
    expect(store.recordRun(serialized, 'serialized-carrying-evidence').kind).toBe('recorded');
    expect(store.data.unlockedProtocols).toEqual(PROTOCOL_IDS);
    expect(store.selectStartingPlan('PULSE_BREAK')).toBe(true);
    expect(store.data.startingPlan).toBe('PULSE_BREAK');
  });

  it('does not infer carrying from basic patrol, unconfirmed candidates or unrelated effect logs', () => {
    const c = new GrowthController(29);
    c.onScan(context());
    c.recordEvent(event('PROTOCOL_BEACON_HIT', { protocolId: 'IMMUNE_BEACON', damage: 8 }), context());
    c.recordEvent(event('PROTOCOL_EQUIPPED', { protocolId: 'EXPOSE_TRACE' }), context());
    expect(c.state.carriedProtocols).toEqual([]);
    c.recordEvent(event('INFECTION_SOURCE_CLEARED', { nodeId: 'real-source', organId: 'heart' }), context()); c.afterInput(context());
    const id = c.state.draft!.id;
    expect(c.chooseDraft({ runId: 'other-run', draftId: id, optionId: c.state.draft!.options[0].id }).kind).toBe('rejected');
    expect(c.state.carriedProtocols).toEqual([]);
    c.discardDraft(id); expect(c.state.carriedProtocols).toEqual([]);
  });

  it.each(PROTOCOL_IDS)('starts a new %s plan with only that rank-I protocol and no previous carrying evidence', id => {
    const old = new GrowthController(30, 'old', preparationForPlan('IMMUNE_BEACON'));
    old.recordEvent(event('RUN_ENDED'), context());
    const fresh = new GrowthController(30, 'new', preparationForPlan(id));
    expect(fresh.state.carriedProtocols).toEqual([id]); expect(fresh.state.equipped).toEqual([{ id, tuning: 'balanced' }]);
    expect(protocolRank(fresh.state.equipped[0])).toBe(1); expect(fresh.state.xp).toBe(0);
    expect(new GrowthController(30, 'field').state.carriedProtocols).toEqual([]);
  });
});
