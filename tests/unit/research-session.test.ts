import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Vec } from '../../src/game/types';
import { distance, normalized } from '../../src/actors/collision';
import { g3Input, waypoint } from '../helpers/g3Driver';

const idle = (aim: Vec): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim });
const start = () => { const session = new GameSession(13, { campaign: true, milestone: 'G3' }); session.start(); return session; };
const resolveXp = (session: GameSession) => { while (session.state.growth?.draft) session.discardDraft(session.state.growth.draft.id); };

/** Formal integration: every resource, position, diagnosis and offer uses public simulation inputs. */
function collectSamples(session: GameSession) {
  for (let step = 0; step < 1800; step++) {
    resolveXp(session);
    if (session.state.growth!.research >= 3) return;
    if (session.state.phase !== 'playing') throw Error(`Acquisition ended: ${session.state.result?.reason}`);
    session.step(g3Input(session.state, 'block'));
  }
  throw Error('Legal source/scan acquisition exceeded its action budget');
}
function walkTo(session: GameSession, point: Vec, tolerance = 50) {
  for (let step = 0; step < 1800; step++) {
    resolveXp(session);
    if (session.state.phase !== 'playing') throw Error(`Walk ended: ${session.state.result?.reason}`);
    if (distance(session.state.player, point) <= tolerance) return;
    const next = waypoint(session.state, point), movement = normalized(next.x - session.state.player.x, next.y - session.state.player.y);
    session.step({ ...idle(point), moveX: movement.x, moveY: movement.y });
  }
  throw Error('Legal research navigation exceeded its action budget');
}
function request(session: GameSession) {
  const node = session.state.battle!.graph.nodes.find(node => node.kind === 'research')!;
  walkTo(session, node); session.step({ ...idle(node), interact: true });
  expect(session.state.phase).toBe('paused');
  const offer = session.state.growth!.pendingResearch!;
  expect(offer).toBeDefined(); expect(session.state.growth!.draft).toBeNull();
  return { offer, intent: { runId: offer.runId, requestId: offer.id }, node };
}
function diagnoseCarapace(session: GameSession) {
  for (let step = 0; step < 1800; step++) {
    resolveXp(session);
    if (session.state.battle!.encounter!.firstCounter.status === 'active') break;
    session.step(g3Input(session.state, 'block'));
  }
  const guardian = session.state.targets.find(target => target.id === session.state.battle!.encounter!.firstCounter.targetId)!;
  expect(guardian?.traits).toContain('CARAPACE');
  walkTo(session, { x: guardian.x + 300, y: guardian.y - 80 }, 40);
  for (let step = 0; step < 200 && session.state.scanReady > session.state.elapsed; step++) session.step(idle(guardian));
  session.step({ ...idle(guardian), scan: true }); resolveXp(session);
  expect(session.state.growth!.rewardedKeys).toContain('diagnose:CARAPACE');
}

describe('formal research pause and transaction ownership', () => {
  it('previews without charging, cancels freely, rejects stale requests and charges a new confirmation once', () => {
    const session = start(); collectSamples(session);
    const credits = session.state.growth!.research, serial = session.state.growth!.draftSerial;
    const first = request(session), before = session.snapshot();
    expect(first.offer.directions).toEqual(['general']);
    expect(before.growth!.research).toBe(credits); expect(before.growth!.draftSerial).toBe(serial);
    session.resume(); session.step({ ...idle(first.node), fire: true, scan: true, interact: true });
    expect(session.snapshot()).toEqual(before);
    expect(session.cancelResearch(first.intent).kind).toBe('cancelled');
    expect(session.state.phase).toBe('playing'); expect(session.state.growth!.research).toBe(credits);
    const second = request(session); expect(second.offer.id).not.toBe(first.offer.id);
    expect(session.confirmResearch({ ...first.intent, direction: 'general' }).kind).toBe('rejected');
    const frozen = session.snapshot(), accepted = session.confirmResearch({ ...second.intent, direction: 'general' });
    expect(accepted.kind).toBe('opened'); expect(session.state.phase).toBe('paused');
    expect(session.state.tick).toBe(frozen.tick); expect(session.state.growth!.research).toBe(credits - 3);
    expect(session.state.targets).toEqual(frozen.targets); expect(session.state.tissue).toEqual(frozen.tissue);
    expect(session.state.growth!.draft!.researchDirection).toBe('general');
    expect(session.confirmResearch({ ...second.intent, direction: 'general' }).kind).toBe('rejected');
    expect(session.state.growth!.research).toBe(credits - 3);
    expect(session.state.events.filter(event => event.type === 'RESEARCH_SPENT')).toHaveLength(1);
    session.discardDraft(session.state.growth!.draft!.id);
    expect(session.state.phase).toBe('playing'); expect(session.state.growth!.research).toBe(credits - 3);
  });

  it('offers an actual scanned trait and permits choosing an alternative to its guaranteed counter', () => {
    const session = start(); collectSamples(session); diagnoseCarapace(session);
    const { offer, intent } = request(session), credits = session.state.growth!.research;
    expect(offer.directions).toEqual(['general', 'CARAPACE']);
    expect(session.confirmResearch({ ...intent, direction: 'MIMIC' }).kind).toBe('rejected');
    expect(session.state.growth!.research).toBe(credits);
    expect(session.confirmResearch({ ...intent, direction: 'CARAPACE' }).kind).toBe('opened');
    const draft = session.state.growth!.draft!, ids = draft.options.map(option => option.protocolId);
    expect(new Set(ids).size).toBe(3); expect(ids).toContain('PULSE_BREAK'); expect(ids).toContain('PURIFY_CHAIN');
    const alternative = draft.options.find(option => option.protocolId !== 'PULSE_BREAK' && option.protocolId !== 'PURIFY_CHAIN')!;
    const tick = session.state.tick;
    expect(session.chooseDraft({ runId: session.state.growth!.runId, draftId: draft.id, optionId: alternative.id }).kind).toBe('committed');
    expect(session.state.tick).toBe(tick); expect(session.state.phase).toBe('playing');
    expect(session.state.growth!.equipped[0].id).toBe(alternative.protocolId);
    expect(session.state.events.filter(event => event.type === 'RESEARCH_CONFIRMED')).toHaveLength(1);
    expect(session.state.events.some(event => event.type === 'INPUT_RESET_REQUESTED' && event.data.reason === 'research-direction-confirmed')).toBe(true);
  });

  it('clears request identity, samples and temporary research state on retry and menu', () => {
    const session = start(); collectSamples(session); const first = request(session);
    session.restart();
    expect(session.state.growth!.pendingResearch).toBeNull(); expect(session.state.growth!.research).toBe(0);
    expect(session.state.player.hp).toBe(100);
    expect(session.confirmResearch({ ...first.intent, direction: 'general' }).kind).toBe('rejected');
    collectSamples(session); const second = request(session);
    session.menu(); expect(session.state.phase).toBe('menu'); expect(session.state.growth!.pendingResearch).toBeNull();
    expect(session.cancelResearch(second.intent).kind).toBe('rejected');
  });

  it('discards pending research on termination without charging a sample', () => {
    const session = start(); collectSamples(session); const { intent } = request(session), credits = session.state.growth!.research;
    // Terminal lifecycle fixture; the public finish call is not a natural defeat claim.
    session.finish(false, 'research lifecycle fixture');
    expect(session.state.growth!.pendingResearch).toBeNull(); expect(session.state.growth!.research).toBe(credits);
    expect(session.confirmResearch({ ...intent, direction: 'general' }).kind).toBe('rejected');
    expect(session.state.events.some(event => event.type === 'RESEARCH_SPENT')).toBe(false);
  });
});
