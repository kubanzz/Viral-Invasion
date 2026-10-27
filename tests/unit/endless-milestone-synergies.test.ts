import { describe, expect, it } from 'vitest';
import { endlessCombatStats } from '../../src/game/endlessGrowth';
import type { ProtocolId } from '../../src/game/growthTypes';
import { GameSession } from '../../src/game/session';
import type { InputFrame, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, x: number, y: number, hp = 1000): Target => ({ id, x, y, hp, maxHp: hp, role: 'source', kind: 'single', radius: 22, hitUntil: 0, scanned: false, traits: [] });
const input = (extra: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, aim: { x: 700, y: 500 }, fire: false, ...extra });

function milestoneFixture(equipped: ProtocolId, learned: ProtocolId, targets: Target[]): GameSession {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const s = session.state;
  // A labeled post-XP fixture isolates earned milestone choices and their real
  // combat effects. This is not represented as a natural ten-wave completion.
  s.world = world; Object.assign(s.player, { x: 500, y: 500 }); Object.assign(s.tissue, { x: 500, y: 750, hp: 100 });
  s.battle!.pulse.origin = { x: 500, y: 500 };
  s.targets = targets;
  s.battle!.graph.nodes.push(...targets.map(target => ({ id: target.id, kind: 'source' as const, x: target.x, y: target.y, active: true, infected: true })));
  Object.assign(s.growth!, { xp: 220, level: 5, nextXp: null, starterDebt: 0, equipped: [{ id: equipped, tuning: 'balanced' }] });
  session.completeWave(10);
  session.step(input());
  expect(s.phase).toBe('paused');
  expect(s.growth!.draft).toMatchObject({ source: 'endless', endlessWave: 10 });
  const draft = s.growth!.draft!, option = draft.options.find(option => option.protocolId === learned)!;
  expect(option).toBeTruthy();
  const pausedTick = s.tick;
  expect(session.chooseDraft({ runId: s.growth!.runId, draftId: draft.id, optionId: option.id }).kind).toBe('committed');
  expect(s.phase).toBe('paused');
  expect(s.tick).toBe(pausedTick);
  expect(s.growth!.draft).toBeNull();
  expect(s.endlessGrowth!.draft).not.toBeNull();
  const combat = s.endlessGrowth!.draft!;
  expect(session.chooseCombatUpgrade(combat.id, 'immune', s.growth!.runId)).toBe(true);
  expect(s.phase).toBe('playing');
  expect(s.growth!.equipped.map(slot => slot.id)).toEqual([equipped, learned]);
  expect(s.endlessGrowth!.level).toBe(1);
  expect(s.growth!.research).toBe(0);
  return session;
}

describe('milestone-selected synergy receipts through actual session combat', () => {
  it('keeps XP, milestone and combat choices paused through all three public transactions', () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start();
    const s = session.state;
    Object.assign(s.growth!, { xp: 120, level: 3, nextXp: 150, starterDebt: 0 });
    session.completeWave(5); session.step(input());
    expect(s.phase).toBe('paused'); expect(s.growth!.draft!.source).toBe('xp');
    expect(s.growth!.nextMilestoneWave).toBe(5); expect(s.endlessGrowth!.draft).not.toBeNull();
    const frozenTick = s.tick, xp = s.growth!.draft!, option = xp.options.find(option => option.protocolId === 'IMMUNE_BEACON') ?? xp.options[0];
    expect(session.chooseDraft({ runId: s.growth!.runId, draftId: xp.id, optionId: option.id }).kind).toBe('committed');
    expect(s.growth!.draft).toMatchObject({ source: 'endless', endlessWave: 5 });
    expect(s.phase).toBe('paused'); expect(s.tick).toBe(frozenTick);
    const milestone = s.growth!.draft!;
    expect(session.discardDraft(milestone.id).kind).toBe('discarded');
    expect(s.phase).toBe('paused'); expect(s.endlessGrowth!.draft).not.toBeNull();
    for (let count = 0; count < 20; count++) session.step(input({ fire: true, scan: true }));
    expect(s.tick).toBe(frozenTick);
    const combat = s.endlessGrowth!.draft!;
    expect(session.chooseCombatUpgrade(combat.id, 'immune', s.growth!.runId)).toBe(true);
    expect(s.phase).toBe('playing'); expect(s.tick).toBe(frozenTick);
    expect(s.growth).toMatchObject({ xp: 150, level: 4, draft: null, nextMilestoneWave: null, lastMilestoneWave: 5 });
    expect(s.endlessGrowth!.level).toBe(1);
    expect(s.growth!.consumedDraftIds).toEqual([xp.id, milestone.id]);
  });

  it('accepts a real resonance last hit followed by exactly three actual chain hops under one synergy root', () => {
    const root = actor('resonance-root', 700, 500, 44), neighbors = [810, 920, 1030].map((x, index) => actor(`hop-${index}`, x, 500));
    const session = milestoneFixture('PULSE_BREAK', 'PURIFY_CHAIN', [root, ...neighbors]);
    while (session.state.tick < 131) session.step(input());
    session.step(input({ fire: true, tool: 1, aim: root }));
    expect(session.state.battle!.pulse.phase).toBe('surge');
    expect(root.hp).toBe(0);
    const events = session.state.events;
    const resonance = events.filter(event => event.type === 'TARGET_HIT' && event.data.id === root.id && event.data.protocolId === 'PULSE_BREAK');
    // The requested bonus is 18, but the target only has 10 HP left. Count the
    // common damage receipt rather than asserting the planned protocol amount.
    expect(resonance).toHaveLength(1); expect(resonance[0].data.damage).toBe(10);
    const chain = events.filter(event => event.type === 'TARGET_HIT' && event.data.protocolId === 'PURIFY_CHAIN');
    expect(chain).toHaveLength(3);
    expect(chain.map(event => event.data.id)).toEqual(neighbors.map(target => target.id));
    for (const hit of chain) { expect(hit.data.cause).toBe('protocol'); expect(hit.data.damage).toBe(38); }
    for (const target of neighbors) expect(target.hp).toBe(962);
    const synergy = events.find(event => event.type === 'PROTOCOL_SYNERGY' && event.data.pair === 'PULSE_BREAK+PURIFY_CHAIN')!;
    expect(synergy).toBeTruthy();
    expect(synergy.data.hops).toBe(3);
    expect(chain.every(hit => hit.data.rootId === synergy.data.rootId)).toBe(true);
    expect(chain.every(hit => hit.tick === resonance[0].tick)).toBe(true);
  });

  it('accepts actual traced-priority cell bites, while the same squad without trace bites the closer new body', () => {
    const run = (trace: boolean) => {
      const marked = actor('marked', 800, 500), session = milestoneFixture('IMMUNE_BEACON', 'EXPOSE_TRACE', [marked]);
      if (!trace) session.state.growth!.equipped = session.state.growth!.equipped.filter(slot => slot.id !== 'EXPOSE_TRACE');
      session.step(input({ scan: true, aim: { x: 650, y: 500 } }));
      const near = actor('new-unmarked', 680, 540); session.state.targets.push(near);
      const startHp = marked.hp;
      for (let count = 0; count < 85; count++) session.step(input());
      const events = session.state.events;
      const bites = events.filter(event => event.type === 'TARGET_HIT' && event.data.protocolId === 'IMMUNE_BEACON');
      expect(bites.length).toBeGreaterThan(0);
      const expected = 8 * endlessCombatStats(session.state.endlessGrowth!).cellDamageMultiplier;
      for (const hit of bites) expect(hit.data.damage).toBeCloseTo(expected);
      if (trace) {
        expect(bites.every(hit => hit.data.id === marked.id)).toBe(true);
        expect(marked.hp).toBeCloseTo(startHp - bites.reduce((sum, hit) => sum + Number(hit.data.damage), 0));
        expect(near.hp).toBe(1000);
        const synergy = events.filter(event => event.type === 'PROTOCOL_SYNERGY' && event.data.pair === 'EXPOSE_TRACE+IMMUNE_BEACON');
        expect(synergy.length).toBeGreaterThan(0);
        for (const event of synergy) expect(bites.some(hit => hit.data.rootId === event.data.rootId && hit.data.id === event.data.targetId && Number(hit.data.damage) > 0)).toBe(true);
      }
      return bites[0].data.id;
    };
    expect(run(true)).toBe('marked');
    expect(run(false)).toBe('new-unmarked');
  });
});
