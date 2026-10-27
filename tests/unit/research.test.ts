import { describe, expect, it } from 'vitest';
import { GrowthController } from '../../src/game/growth';
import { availableResearchDirections, RESEARCH_DIRECTIONS } from '../../src/game/research';
import { protocolRank } from '../../src/game/protocols';
import type { GrowthContext, ResearchDirectionId, ResearchOffer } from '../../src/game/growthTypes';
import type { GameEvent, Target } from '../../src/game/types';

const context = (targets: Target[] = []): GrowthContext => ({ tick: 60, elapsed: 1, active: true, organId: 'heart', rhythm: 'rest', player: { x: 600, y: 400 }, aim: { x: 700, y: 400 }, deviceOrigin: { x: 730, y: 230 }, tissue: { x: 780, y: 610, hp: 60, maxHp: 100, radius: 43 }, targets, tool: 1 });
const event = (type: string, data: GameEvent['data'] = {}): GameEvent => ({ type, tick: 60, data });
// Mechanism fixture: currency is pre-funded; diagnosis eligibility still comes
// exclusively through the same accepted diagnosis event and real target traits.
function funded(seed = 81, runId = 'research-run') { const c = new GrowthController(seed, runId); c.state.research = 9; return c; }
function diagnose(c: GrowthController, trait: Exclude<ResearchDirectionId, 'general'>) {
  const target: Target = { id: `observed-${trait}`, x: 700, y: 400, hp: 68, maxHp: 68, radius: 22, kind: 'single', role: 'virus', hitUntil: 0, scanned: false, traits: [trait] };
  c.recordEvent(event('BATTLE_DIAGNOSED', { count: 1 }), context([target]));
}
function request(c: GrowthController): ResearchOffer {
  expect(c.requestResearch('research-heart', context()).kind).toBe('requested');
  return c.state.pendingResearch!;
}
const confirm = (c: GrowthController, offer: ResearchOffer, direction: ResearchDirectionId = 'general') => c.confirmResearch({ runId: c.state.runId, requestId: offer.id, direction });

describe('diagnosis-directed paid research', () => {
  it('uses exact accepted diagnosis keys, not a warning, profile discovery or baseline scan', () => {
    expect(availableResearchDirections(['diagnose:baseline', 'CARAPACE', 'warning:CARAPACE', 'diagnose:CARAPACE-extra'])).toEqual(['general']);
    const c = funded();
    c.recordEvent(event('EVOLUTION_WARNING', { trait: 'MIMIC' }), context());
    expect(request(c).directions).toEqual(['general']);
    c.cancelResearch({ runId: c.state.runId, requestId: c.state.pendingResearch!.id });
    diagnose(c, 'MIMIC');
    expect(request(c).directions).toEqual(['general', 'MIMIC']);
  });

  it('creates only a run/node/organ-bound offer, without payment or draft RNG progress', () => {
    const c = funded(); const amount = c.state.research, serial = c.state.draftSerial;
    const result = c.requestResearch('lung-lab', { ...context(), organId: 'lung' });
    expect(result.kind).toBe('requested');
    expect(c.state.pendingResearch).toMatchObject({ runId: c.state.runId, nodeId: 'lung-lab', organId: 'lung', directions: ['general'] });
    expect(c.state.research).toBe(amount); expect(c.state.draftSerial).toBe(serial); expect(c.state.draft).toBeNull();
    expect(c.state.researchSerial).toBe(1);
    expect(c.requestResearch('another-lab', context())).toMatchObject({ kind: 'rejected', reason: 'research-pending' });
    expect(c.state.researchSerial).toBe(1);
  });

  it('rejects inactive/insufficient requests and handles queued XP before any research offer', () => {
    const c = funded();
    expect(c.requestResearch('lab', { ...context(), active: false })).toMatchObject({ kind: 'rejected', reason: 'run-inactive' });
    c.state.research = 2;
    expect(c.requestResearch('lab', context())).toMatchObject({ kind: 'rejected', reason: 'insufficient-samples', missing: 1 });
    expect(c.state.pendingResearch).toBeNull(); expect(c.state.researchSerial).toBe(0);
    c.state.pendingLevels.push(1);
    expect(c.requestResearch('lab', context())).toMatchObject({ kind: 'rejected', reason: 'draft-active' });
    expect(c.state.draft!.source).toBe('xp'); expect(c.state.research).toBe(2); expect(c.state.pendingResearch).toBeNull();
  });

  it('validates nonce/run/direction/credits atomically and charges exactly once on confirmation', () => {
    const c = funded(), offer = request(c), initial = c.state.research;
    expect(c.confirmResearch({ runId: 'old-run', requestId: offer.id, direction: 'general' })).toMatchObject({ kind: 'rejected', reason: 'stale-request-or-run' });
    expect(c.confirmResearch({ runId: c.state.runId, requestId: 'old-offer', direction: 'general' })).toMatchObject({ kind: 'rejected', reason: 'stale-request-or-run' });
    expect(confirm(c, offer, 'CARAPACE')).toMatchObject({ kind: 'rejected', reason: 'invalid-direction' });
    expect(c.state.research).toBe(initial); expect(c.state.draftSerial).toBe(0);
    c.state.research = 2;
    expect(confirm(c, offer)).toMatchObject({ kind: 'rejected', reason: 'insufficient-samples' });
    expect(c.state.pendingResearch!.id).toBe(offer.id); expect(c.state.draft).toBeNull();
    c.state.research = initial;
    expect(confirm(c, offer)).toMatchObject({ kind: 'opened', requestId: offer.id, cost: 3 });
    expect(c.state.research).toBe(initial - 3); expect(c.state.pendingResearch).toBeNull();
    expect(c.state.draft).toMatchObject({ source: 'research', researchDirection: 'general' });
    expect(confirm(c, offer)).toMatchObject({ kind: 'rejected', reason: 'stale-request-or-run' });
    expect(c.state.research).toBe(initial - 3);
    c.discardDraft(c.state.draft!.id); expect(c.state.research).toBe(initial - 3);
  });

  it.each(['CARAPACE', 'FISSION', 'MIMIC'] as const)('guarantees %s primary and partner with three distinct legal choices', direction => {
    for (let seed = 1; seed <= 8; seed++) {
      const c = funded(seed); diagnose(c, direction); const offer = request(c);
      expect(confirm(c, offer, direction).kind).toBe('opened');
      const draft = c.state.draft!, info = RESEARCH_DIRECTIONS[direction];
      expect(draft.researchDirection).toBe(direction);
      expect(new Set(draft.options.map(option => option.protocolId)).size).toBe(3);
      expect(draft.options.some(option => option.protocolId === info.primary)).toBe(true);
      expect(draft.options.some(option => option.protocolId === info.partner)).toBe(true);
      expect(draft.options.every(option => option.kind === 'equip' && option.tuning === 'balanced')).toBe(true);
      // A guaranteed counter is a choice, never a required random key.
      const other = draft.options.find(option => option.protocolId !== info.primary && option.protocolId !== info.partner)!;
      expect(c.chooseDraft({ runId: c.state.runId, draftId: draft.id, optionId: other.id }).kind).toBe('committed');
    }
  });

  it('offers normal upgrades and legal full-rank retunes while preserving replacement confirmation', () => {
    const c = funded(); diagnose(c, 'MIMIC');
    c.state.equipped = [{ id: 'EXPOSE_TRACE', tuning: 'focused', rank: 3 }, { id: 'IMMUNE_BEACON', tuning: 'balanced', rank: 1 }, { id: 'PULSE_BREAK', tuning: 'balanced', rank: 2 }];
    confirm(c, request(c), 'MIMIC');
    const draft = c.state.draft!, trace = draft.options.find(option => option.protocolId === 'EXPOSE_TRACE')!, beacon = draft.options.find(option => option.protocolId === 'IMMUNE_BEACON')!;
    expect(trace.kind).toBe('retune'); expect(trace.rank).toBe(3); expect(trace.tuning).not.toBe('focused');
    expect(beacon.kind).toBe('retune'); expect(beacon.rank).toBe(2); expect(beacon.tuning).toBe('balanced');
    expect(c.chooseDraft({ runId: c.state.runId, draftId: draft.id, optionId: trace.id }).kind).toBe('committed');
    expect(protocolRank(c.state.equipped[0])).toBe(3);

    const replace = funded(); diagnose(replace, 'MIMIC');
    replace.state.equipped = [{ id: 'PULSE_BREAK', tuning: 'balanced' }, { id: 'PURIFY_CHAIN', tuning: 'balanced' }, { id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    confirm(replace, request(replace), 'MIMIC');
    const next = replace.state.draft!, option = next.options.find(item => item.protocolId === 'EXPOSE_TRACE')!;
    const intent = { runId: replace.state.runId, draftId: next.id, optionId: option.id };
    expect(replace.chooseDraft(intent).kind).toBe('replace-required');
    expect(replace.chooseDraft({ ...intent, slotIndex: 0, expectedPreviousProtocolId: 'PULSE_BREAK' }).kind).toBe('committed');
  });

  it('cancels freely without changing the later cards, including across run IDs and cancellation counts', () => {
    const a = funded(92, 'a'), b = funded(92, 'b'); diagnose(a, 'MIMIC'); diagnose(b, 'MIMIC');
    const initial = a.state.research;
    for (let i = 0; i < 3; i++) { const offer = request(a); expect(a.cancelResearch({ runId: a.state.runId, requestId: offer.id }).kind).toBe('cancelled'); expect(a.cancelResearch({ runId: a.state.runId, requestId: offer.id }).kind).toBe('rejected'); }
    expect(a.state.research).toBe(initial); expect(a.state.draftSerial).toBe(0);
    confirm(a, request(a), 'MIMIC'); confirm(b, request(b), 'MIMIC');
    expect(a.state.draft!.options).toEqual(b.state.draft!.options); expect(a.state.draft!.serial).toBe(b.state.draft!.serial);
    expect(a.state.researchSerial).not.toBe(b.state.researchSerial);
  });

  it('includes focus in deterministic generation while general preserves the legacy candidate algorithm', () => {
    const a = funded(93, 'new'), b = funded(93, 'legacy');
    confirm(a, request(a), 'general'); b.openResearch('lab', context());
    expect(a.state.draft!.options).toEqual(b.state.draft!.options);
    const differences: boolean[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const first = funded(seed), second = funded(seed);
      for (const c of [first, second]) { diagnose(c, 'CARAPACE'); diagnose(c, 'FISSION'); c.afterInput(context()); if (c.state.draft) c.discardDraft(c.state.draft.id); }
      confirm(first, request(first), 'CARAPACE'); confirm(second, request(second), 'FISSION');
      differences.push(JSON.stringify(first.state.draft!.options) !== JSON.stringify(second.state.draft!.options));
    }
    expect(differences.some(Boolean)).toBe(true);
  });

  it('keeps XP queued behind an offer; cancel or finishing paid research opens it without overlap', () => {
    for (const action of ['cancel', 'confirm'] as const) {
      const c = funded(), offer = request(c), initial = c.state.research;
      c.recordEvent(event('INFECTION_SOURCE_CLEARED', { nodeId: 'actual-source', organId: 'heart' }), context()); c.afterInput(context());
      expect(c.state.pendingResearch!.id).toBe(offer.id); expect(c.state.draft).toBeNull(); expect(c.state.pendingLevels).toEqual([1]);
      if (action === 'cancel') {
        expect(c.cancelResearch({ runId: c.state.runId, requestId: offer.id })).toMatchObject({ kind: 'cancelled' });
        expect(c.state.research).toBe(initial + 2);
      } else {
        confirm(c, offer); expect(c.state.draft!.source).toBe('research');
        expect(c.state.research).toBe(initial + 2 - 3); c.discardDraft(c.state.draft!.id);
      }
      expect(c.state.pendingResearch).toBeNull(); expect(c.state.draft!.source).toBe('xp'); expect(c.state.pendingLevels).toEqual([]);
    }
  });

  it('records request/direction/payment/candidate provenance and clears offers when the run ends', () => {
    const c = funded(); diagnose(c, 'CARAPACE'); const offer = request(c); confirm(c, offer, 'CARAPACE');
    const opened = c.state.pendingLogs.find(log => log.type === 'PROTOCOL_DRAFT_OPENED')!;
    expect(opened.data).toMatchObject({ source: 'research', requestId: offer.id, researchDirection: 'CARAPACE' });
    for (const type of ['RESEARCH_REQUESTED', 'RESEARCH_CONFIRMED', 'RESEARCH_SPENT', 'PROTOCOL_DRAFT_OPENED']) expect(c.state.protocolHistory.some(item => item.type === type)).toBe(true);
    expect(c.state.pendingLogs.filter(log => log.type === 'RESEARCH_SPENT')).toHaveLength(1);
    const pending = funded(), activeOffer = request(pending);
    pending.recordEvent(event('RUN_ENDED'), context());
    expect(pending.state.pendingResearch).toBeNull(); expect(pending.state.pendingLevels).toEqual([]);
    expect(confirm(pending, activeOffer)).toMatchObject({ kind: 'rejected', reason: 'run-inactive' });
    expect(new GrowthController(81).state.pendingResearch).toBeNull(); expect(new GrowthController(81).state.researchSerial).toBe(0);
  });
});
