import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { GameSession } from '../../src/game/session';
import { BALANCE, type InputFrame, type Target, type Vec } from '../../src/game/types';
import type { DraftIntent } from '../../src/game/growthTypes';
import type { ProtocolId } from '../../src/game/growthTypes';
import type { TraitId } from '../../src/game/battleTypes';
import { distance } from '../../src/actors/collision';

const idle = (aim: Vec = { x: 780, y: 440 }): InputFrame => ({ moveX: 0, moveY: 0, aim, fire: false });
const noncounterEvidence: Record<string, unknown>[] = [];
function campaign(seed = 613): GameSession {
  const session = new GameSession(seed, { campaign: true, milestone: 'G2' }); session.start(); return session;
}
/** All ordinary progression below uses public inputs/choices, never objective-state writes. */
function combatInput(session: GameSession, index: number): InputFrame {
  const state = session.state; const battle = state.battle!;
  const destination = battle.readyToRetest ? state.terminal : state.tissue.hp < 55 ? { x: 650, y: 580 } : { x: 620, y: 520 };
  const move = distance(state.player, destination) > 12 ? { x: destination.x - state.player.x, y: destination.y - state.player.y } : { x: 0, y: 0 };
  const rank = (target: Target) => target.role === 'source' ? -2 : target.role === 'elite' ? -1 : 0;
  const alive = state.targets.filter(target => target.hp > 0).sort((a, b) => rank(a) - rank(b) || distance(a, state.player) - distance(b, state.player));
  const heal = state.tissue.hp < 70;
  return { moveX: move.x, moveY: move.y, aim: heal ? state.tissue : alive[0] ?? state.terminal,
    tool: heal ? 3 : state.elapsed >= state.cooldowns[2] ? 2 : 1,
    fire: heal || !!alive.length, scan: index % 180 === 0,
    interact: battle.readyToRetest && distance(state.player, state.terminal) < 90 };
}
function untilDraft(session: GameSession, offset = 0): number {
  for (let index = 0; index < 9000 && session.state.phase === 'playing' && !session.state.growth?.draft; index++) {
    session.step(combatInput(session, index + offset));
  }
  expect(session.state.growth?.draft).not.toBeNull();
  expect(session.state.phase).toBe('paused');
  return session.state.tick;
}
function intent(session: GameSession): DraftIntent {
  const growth = session.state.growth!; const draft = growth.draft!;
  return { runId: growth.runId, draftId: draft.id, optionId: draft.options[0].id };
}
function approach(session: GameSession, destination: Vec): void {
  for (let index = 0; index < 1000 && distance(session.state.player, destination) > 8; index++) {
    const player = session.state.player;
    session.step({ ...idle(destination), moveX: destination.x - player.x, moveY: destination.y - player.y });
  }
  expect(distance(session.state.player, destination)).toBeLessThanOrEqual(8);
}

describe('G2 shared-session integration', () => {
  it('earns two event-driven drafts through legal combat/scan, freezes their world and resumes only after resolving them', () => {
    const session = campaign();
    untilDraft(session);
    expect(session.state.growth!.xp).toBeGreaterThanOrEqual(20);
    expect(session.state.growth!.rewardedKeys.some(key => key.startsWith('source:'))).toBe(true);
    expect(session.state.growth!.rewardedKeys).toContain('diagnose:baseline');
    const paused = session.snapshot();
    session.resume();
    for (let index = 0; index < 1800; index++) session.step({ ...idle(), fire: true, scan: true, dash: true, interact: true, moveX: 1 });
    expect(session.snapshot()).toEqual(paused);

    const choice = intent(session);
    expect(session.chooseDraft(choice).kind).toBe('committed');
    expect(session.state.phase).toBe('playing');
    expect(session.state.growth!.equipped).toHaveLength(1);
    const committed = session.snapshot();
    expect(session.chooseDraft(choice).kind).toBe('rejected');
    expect(session.snapshot()).toEqual(committed);
    session.step(idle());
    expect(session.state.tick).toBe(paused.tick + 1);

    untilDraft(session, session.state.tick);
    const secondId = session.state.growth!.draft!.id;
    expect(secondId).not.toBe(choice.draftId);
    expect(session.state.growth!.xp).toBeGreaterThanOrEqual(55);
    expect(session.discardDraft(secondId).kind).toBe('discarded');
    expect(session.state.phase).toBe('playing');
    expect(session.state.growth!.equipped).toHaveLength(1);
    expect(session.state.growth!.consumedDraftIds).toEqual([choice.draftId, secondId]);
    expect(session.discardDraft(secondId).kind).toBe('rejected');
    expect(session.state.tick).toBeLessThan(90 * 60);
  });

  it('opens research with a real nearby E, charges once and keeps repeated inputs inside the same paused draft', () => {
    const session = campaign();
    session.step({ ...idle(), interact: true });
    expect(session.state.growth!.draft).toBeNull();
    expect(session.state.growth!.research).toBe(0);
    untilDraft(session);
    const xpDraft = session.state.growth!.draft!.id;
    session.discardDraft(xpDraft);
    expect(session.state.growth!.research).toBeGreaterThanOrEqual(3);
    const researchNode = session.state.battle!.graph.nodes.find(node => node.kind === 'research')!;
    approach(session, researchNode);
    const before = session.state.growth!.research;
    session.step({ ...idle(researchNode), interact: true });
    const draft = session.state.growth!.draft!;
    expect(draft.source).toBe('research');
    expect(session.state.growth!.research).toBe(before - 3);
    const paused = session.snapshot();
    for (let index = 0; index < 60; index++) session.step({ ...idle(researchNode), interact: true });
    session.resume();
    expect(session.snapshot()).toEqual(paused);
    expect(session.discardDraft(draft.id).kind).toBe('discarded');
    expect(session.state.phase).toBe('playing');
    expect(session.state.growth!.research).toBe(before - 3);
  });

  it('replays the same real inputs and choices to the same weighted evolution decisions', () => {
    const sessions = [campaign(722), campaign(722)];
    for (const session of sessions) {
      let drafts = 0;
      for (let index = 0; index < 12000 && session.state.phase !== 'result'; index++) {
        const draft = session.state.growth!.draft;
        if (draft) {
          if (drafts++ === 0) session.chooseDraft(intent(session));
          else session.discardDraft(draft.id);
        } else session.step(combatInput(session, index));
      }
      expect(session.state.result).toMatchObject({ success: true });
      expect(drafts).toBeGreaterThanOrEqual(2);
      expect(session.state.battle!.traits).toHaveLength(2);
      expect(session.state.battle!.evolutionDecisions).toHaveLength(2);
    }
    expect(sessions[0].snapshot()).toEqual(sessions[1].snapshot());
    for (const decision of sessions[0].state.battle!.evolutionDecisions!) {
      expect(decision.kind).toBe('warn');
      if (decision.kind === 'warn') expect(decision.candidates.every(candidate => candidate.probability <= .55)).toBe(true);
    }
  });

  it.each<TraitId>(['CARAPACE', 'FISSION', 'MIMIC'])('completes the %s opening through legal inputs while deliberately avoiding the known trait counters in every draft', firstTrait => {
    const session = new GameSession(91, { campaign: true, milestone: 'G2', firstTrait });
    session.start();
    const counters: Record<TraitId, readonly ProtocolId[]> = {
      CARAPACE: ['PULSE_BREAK'], FISSION: ['PURIFY_CHAIN', 'IMMUNE_BEACON'], MIMIC: ['EXPOSE_TRACE', 'IMMUNE_BEACON'],
    };
    const route: Array<{ tick: number; draftId: string; threats: TraitId[]; excluded: ProtocolId[]; candidates: string[]; action: string; protocol?: ProtocolId; equipment: string[] }> = [];
    for (let index = 0; index < 15000 && session.state.phase !== 'result'; index++) {
      const state = session.state; const growth = state.growth!; const battle = state.battle!; const draft = growth.draft;
      if (!draft) { session.step(combatInput(session, index)); continue; }
      const threats = [...new Set([firstTrait, ...battle.traits, ...(battle.warning ? [battle.warning.trait] : [])])];
      const excluded = [...new Set(threats.flatMap(trait => counters[trait]))];
      const option = draft.options.find(candidate => !excluded.includes(candidate.protocolId));
      let action = 'discard-no-noncounter-option';
      if (!option) expect(session.discardDraft(draft.id).kind).toBe('discarded');
      else {
        const choice: DraftIntent = { runId: growth.runId, draftId: draft.id, optionId: option.id };
        const result = session.chooseDraft(choice);
        if (result.kind === 'replace-required') {
          // Prefer removing any protocol that incidentally matches a newly
          // revealed threat. The choice never reads future evolution results.
          const counterSlot = growth.equipped.findIndex(slot => excluded.includes(slot.id));
          const slotIndex = counterSlot >= 0 ? counterSlot : 0;
          expect(session.chooseDraft({ ...choice, slotIndex, expectedPreviousProtocolId: growth.equipped[slotIndex].id }).kind).toBe('committed');
          action = `replace-${slotIndex}`;
        } else { expect(result.kind).toBe('committed'); action = option.kind; }
        expect(excluded).not.toContain(option.protocolId);
        expect(draft.options.some(candidate => candidate.id === option.id)).toBe(true);
      }
      route.push({ tick: state.tick, draftId: draft.id, threats, excluded, candidates: draft.options.map(candidate => candidate.id), action,
        ...(option ? { protocol: option.protocolId } : {}), equipment: growth.equipped.map(slot => `${slot.id}:${slot.tuning}`) });
      expect(session.state.phase).toBe(session.state.growth!.draft ? 'paused' : 'playing');
    }
    expect(session.state.result, firstTrait).toMatchObject({ success: true });
    expect(session.state.battle!.stats.sourceClears).toBe(2);
    expect(session.state.battle!.stats.eliteClears).toBe(2);
    expect(session.state.tissue.hp).toBeGreaterThanOrEqual(50);
    expect(session.state.battle!.pressure.infection).toBeLessThan(35);
    expect(session.state.events.filter(event => event.type === 'RETEST_COMPLETED')).toHaveLength(1);
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(route.some(choice => choice.protocol !== undefined)).toBe(true);
    expect(route.every(choice => choice.protocol === undefined || !choice.excluded.includes(choice.protocol))).toBe(true);
    noncounterEvidence.push({ seed: 91, firstTrait, elapsed: session.state.elapsed,
      finalTraits: session.state.battle!.traits, finalEquipment: session.state.growth!.equipped,
      result: session.state.result, objectives: { sourceClears: session.state.battle!.stats.sourceClears,
        eliteClears: session.state.battle!.stats.eliteClears, integrity: session.state.tissue.hp,
        infection: session.state.battle!.pressure.infection, activeRetest: true }, route });
    const evidencePath = resolve('artifacts/g2-noncounter-routes.json');
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, JSON.stringify({ schemaVersion: 1, expectedCases: 3, complete: noncounterEvidence.length === 3,
      method: 'Unit integration using public InputFrame and DraftIntent; explicit opening-trait scenario; no victory-state injection.',
      limitation: 'Choices avoid first/current/warned trait counters. Equipment chosen before a later trait becomes known may incidentally counter that later trait.',
      runs: noncounterEvidence }, null, 2) + '\n');
    console.info('G2_NONCOUNTER_INPUT_ROUTE', JSON.stringify({ seed: 91, firstTrait, elapsed: session.state.elapsed,
      choices: route.length, selected: route.filter(choice => choice.protocol !== undefined).length,
      discarded: route.filter(choice => choice.protocol === undefined).length }));
  });

  it('isolates retry run identity and rejects delayed intents from the prior same-seed run', () => {
    const session = campaign(); untilDraft(session);
    const oldIntent = intent(session);
    const oldSeed = session.state.seed;
    session.restart();
    expect(session.state.seed).toBe(oldSeed);
    expect(session.state.growth!.runId).not.toBe(oldIntent.runId);
    expect(session.state.growth!.xp).toBe(0);
    expect(session.state.growth!.equipped).toEqual([]);
    expect(session.state.growth!.research).toBe(0);
    untilDraft(session);
    const current = session.snapshot();
    expect(session.chooseDraft(oldIntent).kind).toBe('rejected');
    expect(session.discardDraft(oldIntent.draftId).kind).toBe('rejected');
    session.backToDraft(oldIntent.draftId);
    expect(session.snapshot()).toEqual(current);
    expect(session.state.phase).toBe('paused');
    expect(session.chooseDraft(intent(session)).kind).toBe('committed');
    expect(session.state.phase).toBe('playing');
  });

  it('records actual base damage, excluding overkill and protocol damage from the behavior window', () => {
    const session = campaign();
    // Targeted unit fixture only: this is not a browser victory or progression proof.
    session.state.targets = [{ id: 'overkill', x: 500, y: 440, role: 'virus', kind: 'single', radius: 22, hp: 1, maxHp: 68, hitUntil: 0, scanned: false, traits: [], generation: 0, attackReady: 1000 }];
    session.step({ ...idle(session.state.targets[0]), fire: true, tool: 1 });
    expect(session.state.events.find(event => event.type === 'TARGET_HIT')!.data.damage).toBe(1);
    expect(session.state.battle!.behaviorHistory!.reduce((sum, bin) => sum + bin.precisionDamage, 0)).toBe(1);
  });

  it('settles a resonance bonus kill once and propagates its pulse exposure into a capped three-hop chain', () => {
    const session = campaign();
    // Explicit integration fixture: establishes a surge and an equipped pair to
    // verify the common damage/death hooks; it does not claim legal acquisition.
    session.state.tick = 125; session.state.elapsed = 125 / 60;
    Object.assign(session.state.player, { x: 730, y: 300 });
    session.state.growth!.equipped = [{ id: 'PULSE_BREAK', tuning: 'balanced' }, { id: 'PURIFY_CHAIN', tuning: 'balanced' }];
    const actor = (id: string, x: number, y: number, hp: number): Target => ({ id, x, y, role: 'virus', kind: 'single', radius: 22, hp, maxHp: hp, hitUntil: 0, scanned: false, traits: [], generation: 0, sourceId: 'integration', attackReady: 1000 });
    const primary = actor('resonance-primary', 730, 400, 28); primary.traits = ['CARAPACE']; primary.facing = -Math.PI / 2;
    session.state.targets = [primary, actor('chain-1', 820, 400, 30), actor('chain-2', 910, 410, 30), actor('chain-3', 990, 390, 30)];
    session.step({ ...idle(primary), tool: 1, fire: true });
    expect(primary.hp).toBe(0);
    expect(session.state.targets.every(target => target.hp === 0)).toBe(true);
    const clears = session.state.events.filter(event => event.type === 'TARGET_CLEARED');
    expect(clears).toHaveLength(4);
    expect(new Set(clears.map(event => event.data.id)).size).toBe(4);
    expect(session.state.events.filter(event => event.type === 'PROTOCOL_RESONANCE_HIT')).toHaveLength(1);
    const jumps = session.state.events.filter(event => event.type === 'PROTOCOL_CHAIN_HIT');
    expect(jumps.map(event => event.data.hop)).toEqual([1, 2, 3]);
    expect(session.state.events.find(event => event.type === 'PROTOCOL_SYNERGY')!.data).toMatchObject({ pair: 'PULSE_BREAK+PURIFY_CHAIN', hops: 3, cap: 3 });
    expect(session.state.battle!.stats.kills).toBe(4);
    expect(session.state.growth!.xp).toBe(7);
    const hits = session.state.events.filter(event => event.type === 'TARGET_HIT' && event.data.id === primary.id);
    expect(hits).toHaveLength(2);
    expect(hits[0].data).toMatchObject({ cause: 'basic', damage: 34 * .3 });
    expect(hits[1].data.cause).toBe('protocol');
    const actualBase = session.state.battle!.behaviorHistory!.reduce((sum, bin) => sum + bin.precisionDamage, 0);
    expect(actualBase).toBeCloseTo(34 * .3);
    for (let index = 0; index < 30; index++) session.step(idle());
    expect(session.state.events.filter(event => event.type === 'TARGET_CLEARED')).toHaveLength(4);
  });
});
