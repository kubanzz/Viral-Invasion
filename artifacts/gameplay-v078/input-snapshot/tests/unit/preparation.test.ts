import { describe, expect, it } from 'vitest';
import { GrowthController } from '../../src/game/growth';
import { availableStartingPlans, parsePreparation, preparationForPlan, PREPARATION_VERSION, startingPlanId, type RunPreparation } from '../../src/game/preparation';
import { GROWTH_BALANCE, PROTOCOL_IDS, protocolRank } from '../../src/game/protocols';
import type { GrowthContext, ProtocolId } from '../../src/game/growthTypes';
import type { GameEvent, Target } from '../../src/game/types';

const target: Target = { id: 'diagnosed', kind: 'single', role: 'virus', x: 700, y: 400, hp: 68, maxHp: 68, radius: 22, hitUntil: 0, scanned: false, traits: ['CARAPACE'] };
const context = (targets: Target[] = []): GrowthContext => ({ tick: 60, elapsed: 1, active: true, organId: 'heart', rhythm: 'rest', player: { x: 600, y: 400 }, aim: { x: 700, y: 400 }, deviceOrigin: { x: 730, y: 230 }, tissue: { x: 780, y: 610, hp: 60, maxHp: 100, radius: 43 }, targets, tool: 1 });
const event = (type: string, data: GameEvent['data'] = {}): GameEvent => ({ type, tick: 60, data });
const source = (c: GrowthController, id: string) => c.recordEvent(event('INFECTION_SOURCE_CLEARED', { nodeId: id, organId: 'heart' }), context());
function choose(c: GrowthController, id: ProtocolId): void {
  const draft = c.state.draft!, option = draft.options.find(item => item.protocolId === id)!;
  expect(c.chooseDraft({ runId: c.state.runId, draftId: draft.id, optionId: option.id }).kind).toBe('committed');
}
function research(c: GrowthController, direction: 'general' | 'CARAPACE' = 'general'): void {
  expect(c.requestResearch('heart-lab', context()).kind).toBe('requested');
  expect(c.confirmResearch({ runId: c.state.runId, requestId: c.state.pendingResearch!.id, direction }).kind).toBe('opened');
}

describe('initial preparation and one prepaid XP choice', () => {
  it('expands initial choices only from known protocols, with field always available', () => {
    expect(availableStartingPlans([])).toEqual(['field']);
    expect(availableStartingPlans(['EXPOSE_TRACE', 'PURIFY_CHAIN', 'EXPOSE_TRACE'])).toEqual(['field', 'PURIFY_CHAIN', 'EXPOSE_TRACE']);
    expect(availableStartingPlans(PROTOCOL_IDS)).toHaveLength(5);
    expect(startingPlanId()).toBe('field');
    for (const id of ['field', ...PROTOCOL_IDS] as const) expect(startingPlanId(preparationForPlan(id))).toBe(id);
  });

  it('parses a versioned plan without importing rank, tuning or previous combat state', () => {
    const raw = { version: PREPARATION_VERSION, starterProtocolId: 'IMMUNE_BEACON', rank: 3, tuning: 'focused', xp: 220 };
    expect(parsePreparation(raw)).toEqual({ version: 1, starterProtocolId: 'IMMUNE_BEACON' });
    for (const invalid of [undefined, null, [], {}, { version: 2, starterProtocolId: null }, { version: 1 }, { version: 1, starterProtocolId: 'UNKNOWN' }]) {
      expect(parsePreparation(invalid)).toBeNull();
      const c = new GrowthController(10, 'invalid', invalid as RunPreparation);
      expect(c.state.equipped).toEqual([]); expect(c.state.starterDebt).toBe(0);
      expect(c.state.preparation).toEqual(preparationForPlan('field'));
    }
    raw.starterProtocolId = 'PURIFY_CHAIN';
    const parsed = parsePreparation(raw)!; raw.starterProtocolId = 'PULSE_BREAK';
    expect(parsed.starterProtocolId).toBe('PURIFY_CHAIN');
  });

  it.each(PROTOCOL_IDS)('starts %s as one real balanced rank-I slot with traceable feedback', id => {
    const preparation = preparationForPlan(id), c = new GrowthController(11, 'prepared', preparation);
    preparation.starterProtocolId = null;
    expect(c.state.equipped).toEqual([{ id, tuning: 'balanced' }]);
    expect(protocolRank(c.state.equipped[0])).toBe(1);
    expect(c.state.preparation?.starterProtocolId).toBe(id); expect(c.state.starterDebt).toBe(1);
    expect(c.state.xp).toBe(0); expect(c.state.research).toBe(0); expect(c.state.draft).toBeNull();
    expect(c.state.pendingLogs).toContainEqual(expect.objectContaining({ type: 'PROTOCOL_EQUIPPED', data: expect.objectContaining({ source: 'preparation', protocolId: id, rank: 1 }) }));
    expect(c.state.pendingLogs).toContainEqual(expect.objectContaining({ type: 'PREPARATION_APPLIED' }));
    expect(c.state.lastEvolution?.hint).toContain('20 XP 仅结清'); expect(c.state.lastEvolution?.hint).toContain('55 XP');
  });

  it('makes the prepared summon usable on the first accepted scan', () => {
    const c = new GrowthController(12, 'beacon', preparationForPlan('IMMUNE_BEACON'));
    const commands = c.onScan(context([target]));
    expect(c.state.cells).toHaveLength(3);
    expect(commands).toContainEqual(expect.objectContaining({ kind: 'organCost', amount: 3 }));
    expect(c.state.starterDebt).toBe(1); expect(c.state.xp).toBe(0);
    const field = new GrowthController(12);
    field.onScan(context([target])); expect(field.state.cells).toHaveLength(1);
  });

  it('repays exactly one XP choice while retaining the same total acquisition budget at each threshold', () => {
    const field = new GrowthController(13, 'field'), prepared = new GrowthController(13, 'prepared', preparationForPlan('PURIFY_CHAIN'));
    for (let i = 1; i <= 11; i++) {
      for (const c of [field, prepared]) {
        source(c, `source-${i}`); c.afterInput(context());
        while (c.state.draft) c.discardDraft(c.state.draft.id, c.state.runId);
      }
      expect(prepared.state.xp).toBe(field.state.xp); expect(prepared.state.level).toBe(field.state.level); expect(prepared.state.nextXp).toBe(field.state.nextXp);
      expect(prepared.state.consumedDraftIds.length + 1).toBe(field.state.consumedDraftIds.length);
      if (i === 1) {
        expect(prepared.state.starterDebt).toBe(0); expect(prepared.state.nextXp).toBe(55);
        expect(prepared.state.protocolHistory.some(entry => entry.type === 'PREPARATION_REPAID' && entry.text.includes('经验保留 20') && entry.text.includes('55 XP'))).toBe(true);
      }
    }
    expect(prepared.state.protocolHistory.filter(entry => entry.type === 'PREPARATION_REPAID')).toHaveLength(1);
    expect(prepared.state.level).toBe(GROWTH_BALANCE.xpThresholds.length);
  });

  it('repays only the earliest choice when one reward processes multiple pending thresholds', () => {
    const c = new GrowthController(14, 'batch', preparationForPlan('EXPOSE_TRACE'));
    // Mechanism fixture: stress the award loop with accumulated XP before its thresholds are processed.
    c.state.xp = 140;
    c.recordEvent(event('ELITE_CLEARED', { id: 'elite' }), context());
    expect(c.state.xp).toBe(170); expect(c.state.level).toBe(4); expect(c.state.pendingLevels).toEqual([2, 3, 4]);
    expect(c.state.starterDebt).toBe(0);
    expect(c.state.pendingLogs.filter(log => log.type === 'PREPARATION_REPAID')).toHaveLength(1);
    expect(c.state.protocolHistory.find(entry => entry.type === 'PREPARATION_REPAID')?.text).toContain('已达到，将照常排队');
    c.afterInput(context()); expect(c.state.draft?.level).toBe(2);
    c.discardDraft(c.state.draft!.id); expect(c.state.draft?.level).toBe(3);
    c.discardDraft(c.state.draft!.id); expect(c.state.draft?.level).toBe(4);
  });

  it('permits research before the first XP threshold without cancelling the repayment', () => {
    const c = new GrowthController(15, 'research-first', preparationForPlan('PULSE_BREAK'));
    c.recordEvent(event('BATTLE_DIAGNOSED', { count: 1 }), context([target]));
    expect(c.state.xp).toBe(14); expect(c.state.research).toBe(3);
    research(c, 'CARAPACE'); choose(c, 'PULSE_BREAK');
    expect(protocolRank(c.state.equipped[0])).toBe(2); expect(c.state.starterDebt).toBe(1); expect(c.state.research).toBe(0);
    source(c, 'first-source'); c.afterInput(context());
    expect(c.state.xp).toBe(34); expect(c.state.level).toBe(1); expect(c.state.starterDebt).toBe(0); expect(c.state.draft).toBeNull();
    source(c, 'second-source'); c.recordEvent(event('ELITE_CLEARED', { id: 'later-elite' }), context()); c.afterInput(context());
    expect(c.state.draft?.level).toBe(2);
  });

  it('keeps the debt after a paid replacement removes the prepared protocol', () => {
    const c = new GrowthController(16, 'replacement', preparationForPlan('PULSE_BREAK'));
    // A full-slot mechanism fixture exercises the real paid research and replacement transaction.
    c.state.equipped.push({ id: 'PURIFY_CHAIN', tuning: 'balanced' }, { id: 'IMMUNE_BEACON', tuning: 'balanced' }); c.state.research = 3;
    research(c);
    const draft = c.state.draft!, option = draft.options.find(item => item.protocolId === 'EXPOSE_TRACE')!;
    const intent = { runId: c.state.runId, draftId: draft.id, optionId: option.id };
    expect(c.chooseDraft(intent).kind).toBe('replace-required');
    expect(c.chooseDraft({ ...intent, slotIndex: 0, expectedPreviousProtocolId: 'PULSE_BREAK' }).kind).toBe('committed');
    expect(c.state.equipped.some(slot => slot.id === 'PULSE_BREAK')).toBe(false); expect(c.state.starterDebt).toBe(1);
    source(c, 'repaying-source'); c.afterInput(context());
    expect(c.state.starterDebt).toBe(0); expect(c.state.draft).toBeNull(); expect(c.state.research).toBe(2);
  });

  it('recreates only the frozen plan on retry and preserves deterministic later drafts', () => {
    const preparation = preparationForPlan('IMMUNE_BEACON'), a = new GrowthController(17, 'a', preparation);
    a.onScan(context([target])); source(a, 'before-end'); a.recordEvent(event('RUN_ENDED'), context());
    const b = new GrowthController(17, 'b', a.state.preparation);
    expect(b.state.xp).toBe(0); expect(b.state.research).toBe(0); expect(b.state.starterDebt).toBe(1);
    expect(b.state.cells).toEqual([]); expect(b.state.beacon).toBeNull(); expect(b.state.activations).toEqual({});
    const freshField = new GrowthController(17, 'field', preparationForPlan('field'));
    expect(freshField.state.equipped).toEqual([]); expect(freshField.state.starterDebt).toBe(0);
    const c = new GrowthController(17, 'c', preparation);
    for (const controller of [b, c]) {
      source(controller, 'first'); source(controller, 'second'); controller.recordEvent(event('ELITE_CLEARED', { id: 'elite' }), context()); controller.afterInput(context());
    }
    expect(b.state.draft?.level).toBe(2); expect(b.state.draft!.options).toEqual(c.state.draft!.options);
  });
});
