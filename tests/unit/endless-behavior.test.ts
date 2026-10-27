import { describe, expect, it } from 'vitest';
import { recordEndlessBehavior } from '../../src/game/endlessBehavior';
import { EVOLUTION_BALANCE, summarizeBehavior } from '../../src/game/evolution';
import type { BehaviorBin } from '../../src/game/evolutionTypes';
import { offerEndlessUpgrade } from '../../src/game/endlessGrowth';
import type { EndlessGrowthState } from '../../src/game/endlessGrowthTypes';
import { GameSession } from '../../src/game/session';
import type { GameEvent, InputFrame, Target, WorldGeometry } from '../../src/game/types';

const event = (type: string, data: GameEvent['data'] = {}, tick = 100): GameEvent => ({ type, tick, data });
const bin = (tick: number, changes: Partial<BehaviorBin> = {}): BehaviorBin => ({
  tick, precisionDamage: 0, areaDamage: 0, scans: 0, isolations: 0, repaired: 0, ...changes,
});
const hit = (data: GameEvent['data'], tick = 100) => event('TARGET_HIT', { damage: 20, cause: 'basic', tool: 1, ...data }, tick);

describe('limited endless behavior observer', () => {
  it('uses actual basic damage and coalesces independent hits in the same tick', () => {
    let history = recordEndlessBehavior([], hit({ damage: 7, rawDamage: 100, remainingHp: 0 }), 100);
    history = recordEndlessBehavior(history, hit({ id: 'same-body', damage: 34 }), 100);
    history = recordEndlessBehavior(history, hit({ id: 'same-body', damage: 34 }), 100);
    history = recordEndlessBehavior(history, hit({ tool: 2, damage: 65 }), 100);
    expect(history).toEqual([bin(100, { precisionDamage: 75, areaDamage: 65 })]);
  });

  it.each(['nova', 'scan', 'dash'])('attributes explicit %s ability damage independently of the held tool', ability => {
    for (const tool of [1, 2, 3]) {
      expect(recordEndlessBehavior([], hit({ cause: 'ability', ability, tool }), 100))
        .toEqual([bin(100, { areaDamage: 20 })]);
    }
  });

  it.each(['IMMUNE_BEACON', 'PURIFY_CHAIN', 'PULSE_BREAK'])('excludes %s protocol damage even with misleading tool/ability fields', protocolId => {
    for (const tool of [1, 2, 3]) {
      expect(recordEndlessBehavior([], hit({ cause: 'protocol', protocolId, tool, ability: 'scan' }), 100)).toEqual([]);
    }
  });

  it.each([
    { cause: 'ability', rootId: 'endless:scan:100' },
    { cause: 'ability', ability: 'unknown' },
    { cause: 'ability', ability: '' },
    { cause: 'basic', tool: 3 },
    { cause: 'basic', tool: '1' },
    { cause: 'unknown', tool: 2 },
  ] as GameEvent['data'][])('does not guess damage attribution from incomplete or unsupported metadata %j', data => {
    expect(recordEndlessBehavior([], hit(data), 100)).toEqual([]);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, '20', true])('rejects invalid actual damage %s', damage => {
    expect(recordEndlessBehavior([], hit({ damage }), 100)).toEqual([]);
  });

  it('records one diagnosis per accepted scan finding one or many living targets', () => {
    let history = recordEndlessBehavior([], event('SCAN_COMPLETED', { found: 1 }), 100);
    history = recordEndlessBehavior(history, event('SCAN_COMPLETED', { found: 12 }), 100);
    expect(history).toEqual([bin(100, { scans: 2 })]);
  });

  it.each([0, -1, 1.5, NaN, Infinity, '3', true])('ignores scans without a valid positive target count %s', found => {
    expect(recordEndlessBehavior([], event('SCAN_COMPLETED', { found }), 100)).toEqual([]);
  });

  it('counts only positive, finite manual organ restoration', () => {
    const records: GameEvent[] = [
      event('ORGAN_INTEGRITY_CHANGED', { reason: 'repair', before: 91, after: 100 }),
      event('ORGAN_INTEGRITY_CHANGED', { reason: 'repair', before: 100, after: 100 }),
      event('ORGAN_INTEGRITY_CHANGED', { reason: 'repair', before: 100, after: 90 }),
      event('ORGAN_INTEGRITY_CHANGED', { reason: 'wave-supply', before: 50, after: 62 }),
      event('ORGAN_INTEGRITY_CHANGED', { reason: 'protocol-pressure', before: 100, after: 95 }),
      event('ORGAN_INTEGRITY_CHANGED', { reason: 'repair', before: '50', after: 75 }),
      event('ORGAN_INTEGRITY_CHANGED', { reason: 'repair', before: NaN, after: 75 }),
      event('ORGAN_INTEGRITY_CHANGED', { reason: 'repair', before: 50, after: Infinity }),
      event('ORGAN_INTEGRITY_CHANGED', { reason: 'repair', before: -Number.MAX_VALUE, after: Number.MAX_VALUE }),
      event('TOOL_REJECTED', { tool: 3, reason: 'range' }),
      event('ISOLATE_COMPLETED', { found: 2 }),
      event('INTERACT_COMPLETED', { found: 2 }),
    ];
    const history = records.reduce<BehaviorBin[]>((previous, next) => recordEndlessBehavior(previous, next, 100), []);
    expect(history).toEqual([bin(100, { repaired: 9 })]);
  });

  it('uses the inclusive 90-second window and still expires history on ignored events', () => {
    const now = EVOLUTION_BALANCE.windowTicks + 100;
    const history = [bin(99, { precisionDamage: 100 }), bin(100, { precisionDamage: 34 }), bin(now + 1, { scans: 1 })];
    expect(recordEndlessBehavior(history, event('UNOBSERVED', {}, now), now)).toEqual([bin(100, { precisionDamage: 34 })]);
    expect(recordEndlessBehavior(history, hit({ tool: 2 }, 100), now)).toEqual([bin(100, { precisionDamage: 34, areaDamage: 20 })]);
    expect(recordEndlessBehavior(history, event('UNOBSERVED', {}, now + 1), now + 1)).toEqual([bin(now + 1, { scans: 1 })]);
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 99, 5501])('rejects invalid, expired or future event tick %s', tick => {
    expect(recordEndlessBehavior([], hit({}, tick), 5500)).toEqual([]);
  });

  it.each([-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid observer tick %s', now => {
    expect(recordEndlessBehavior([bin(100, { scans: 1 })], hit({}), now)).toEqual([]);
  });

  it('preserves frozen history/events, returns fresh bins and remains serializable', () => {
    const previous = [bin(100, { precisionDamage: 34 })];
    const next = hit({ cause: 'ability', ability: 'dash', tool: 3 });
    const originalHistory = structuredClone(previous), originalEvent = structuredClone(next);
    Object.freeze(previous[0]); Object.freeze(previous); Object.freeze(next.data); Object.freeze(next);
    const result = recordEndlessBehavior(previous, next, 100);
    expect(previous).toEqual(originalHistory); expect(next).toEqual(originalEvent);
    expect(result).not.toBe(previous); expect(result[0]).not.toBe(previous[0]);
    expect(result).toEqual([bin(100, { precisionDamage: 34, areaDamage: 20 })]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(recordEndlessBehavior(JSON.parse(JSON.stringify(previous)), JSON.parse(JSON.stringify(next)), 100)).toEqual(result);
  });
});

const world: WorldGeometry = {
  width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 },
};
function target(id: string, x: number, y: number, changes: Partial<Target> = {}): Target {
  return { id, x, y, kind: 'single', role: 'source', radius: 10, hp: 1000, maxHp: 1000,
    hitUntil: 0, scanned: false, traits: [], born: 0, ...changes };
}
function fixture(ranks: EndlessGrowthState['ranks'] = {}, targets: Target[] = []) {
  const session = new GameSession(72106, { mode: 'endless' });
  session.start(); session.state.world = structuredClone(world);
  Object.assign(session.state.player, { x: 500, y: 500 });
  Object.assign(session.state.tissue, { x: 500, y: 750, hp: 100 });
  session.state.targets = targets; session.state.endlessGrowth!.ranks = { ...ranks };
  const observed = { history: [] as BehaviorBin[], events: [] as GameEvent[] };
  session.bus.on('event', next => {
    observed.events.push(structuredClone(next));
    observed.history = recordEndlessBehavior(observed.history, next, session.state.tick);
  });
  return { session, observed };
}
function step(session: GameSession, input: Partial<InputFrame> = {}): void {
  session.step({ moveX: 0, moveY: 0, aim: { x: 1000, y: 500 }, fire: false, ...input });
}
function throughTick(session: GameSession, tick: number, input: Partial<InputFrame> = {}): void {
  while (session.state.tick < tick && session.state.phase === 'playing') step(session, input);
  expect(session.state.tick).toBe(tick); expect(session.state.phase).toBe('playing');
}
const totals = (observed: ReturnType<typeof fixture>['observed'], tick: number) => summarizeBehavior(observed.history, tick);

describe('endless behavior from actual session inputs', () => {
  it('counts lethal precision overkill by actual HP loss rather than nominal power', () => {
    const victim = target('low-hp', 800, 500, { role: 'virus', hp: 7, maxHp: 7, attackReady: 100, sourceId: 'endless:wave:1' });
    const { session, observed } = fixture({ power: 1 }, [victim]);
    const input: InputFrame = { moveX: 0, moveY: 0, aim: { x: 800, y: 500 }, fire: true, tool: 1 };
    const originalInput = structuredClone(input);
    session.step(input);
    expect(input).toEqual(originalInput);
    expect(observed.events.find(next => next.type === 'TARGET_HIT')?.data).toMatchObject({ damage: 7, rawDamage: 34 * 1.18, cause: 'basic', tool: 1 });
    expect(totals(observed, session.state.tick)).toMatchObject({ precisionDamage: 7, areaDamage: 0 });
  });

  it('retains all three real ray hits on one body during one simulation tick', () => {
    const { session, observed } = fixture({ multishot: 1 }, [target('wide-body', 800, 500, { radius: 80 })]);
    step(session, { fire: true });
    const hits = observed.events.filter(next => next.type === 'TARGET_HIT');
    expect(hits).toHaveLength(3); expect(new Set(hits.map(next => next.tick)).size).toBe(1);
    expect(observed.history).toEqual([bin(1, { precisionDamage: 102 })]);
  });

  it('records upgraded tool-2 nova through its real basic area attack path', () => {
    const { session, observed } = fixture({ nova: 2, power: 1 }, [target('nova-body', 800, 500)]);
    step(session, { tool: 2, aim: { x: 800, y: 500 }, fire: true });
    const damage = 65 * 1.18 * 1.3;
    expect(observed.events.find(next => next.type === 'TARGET_HIT')?.data).toMatchObject({ cause: 'basic', tool: 2 });
    expect(totals(observed, session.state.tick).areaDamage).toBeCloseTo(damage);
    expect(totals(observed, session.state.tick).precisionDamage).toBe(0);
  });

  it.each([1, 2, 3] as const)('records scan ability damage as area while holding tool %i', tool => {
    const { session, observed } = fixture({ scan: 2, power: 1 }, [target('scan-body', 700, 500)]);
    step(session, { scan: true, tool, aim: { x: 1000, y: 500 } });
    expect(observed.events.filter(next => next.type === 'TARGET_HIT')).toHaveLength(1);
    expect(observed.events.find(next => next.type === 'TARGET_HIT')?.data).toMatchObject({ cause: 'ability', ability: 'scan', tool });
    const summary = totals(observed, session.state.tick);
    expect(summary.areaDamage).toBeCloseTo(60 * 1.18);
    expect(summary).toMatchObject({ precisionDamage: 0, scans: 1 });
  });

  it('retains dash attribution when the player switches to repair tool before the late hit', () => {
    const { session, observed } = fixture({ dash: 1, power: 1 }, [target('dash-body', 620, 500)]);
    step(session, { dash: true, moveX: 1, tool: 1 });
    throughTick(session, 12, { tool: 3 });
    const hits = observed.events.filter(next => next.type === 'TARGET_HIT');
    expect(hits).toHaveLength(1); expect(hits[0].tick).toBeGreaterThan(1);
    expect(hits[0].data).toMatchObject({ cause: 'ability', ability: 'dash', tool: 3 });
    expect(totals(observed, session.state.tick).areaDamage).toBeCloseTo(40 * 1.18);
    expect(totals(observed, session.state.tick).precisionDamage).toBe(0);
  });

  it('excludes real summoned immune-cell bites while preserving their valid diagnosis', () => {
    const { session, observed } = fixture({ immune: 2, power: 1 }, [target('immune-body', 850, 500, { radius: 22 })]);
    step(session, { scan: true, aim: { x: 720, y: 500 }, tool: 1 });
    throughTick(session, 90, { tool: 2 });
    const bites = observed.events.filter(next => next.type === 'TARGET_HIT');
    expect(bites.length).toBeGreaterThan(0);
    expect(bites.every(next => next.data.cause === 'protocol' && next.data.protocolId === 'IMMUNE_BEACON' && Number(next.data.damage) > 0)).toBe(true);
    expect(totals(observed, session.state.tick)).toMatchObject({ precisionDamage: 0, areaDamage: 0, scans: 1 });
  });

  it('ignores empty scans, scan cooldown rejection and interactions', () => {
    const { session, observed } = fixture();
    step(session, { scan: true });
    step(session, { scan: true, interact: true });
    expect(observed.events.filter(next => next.type === 'SCAN_COMPLETED')).toHaveLength(1);
    expect(observed.events.find(next => next.type === 'SCAN_COMPLETED')?.data.found).toBe(0);
    expect(observed.history).toEqual([]);
  });

  it('counts partial manual repair once and ignores cooldown, full-health and range rejection', () => {
    const { session, observed } = fixture();
    session.state.tissue.hp = 91;
    step(session, { fire: true, tool: 3, aim: session.state.tissue });
    step(session, { fire: true, tool: 3, aim: session.state.tissue });
    throughTick(session, 43);
    step(session, { fire: true, tool: 3, aim: session.state.tissue });
    throughTick(session, 86);
    step(session, { fire: true, tool: 3, aim: { x: 1200, y: 500 } });
    expect(observed.events.filter(next => next.type === 'ORGAN_INTEGRITY_CHANGED' && next.data.reason === 'repair')).toHaveLength(2);
    expect(observed.events.some(next => next.type === 'TOOL_REJECTED' && next.data.reason === 'range')).toBe(true);
    expect(totals(observed, session.state.tick).repaired).toBe(9);
  });

  it('excludes the actual wave-clear organ supply from manual repair strategy evidence', () => {
    const { session, observed } = fixture();
    session.state.tissue.hp = 60;
    offerEndlessUpgrade(session.state.endlessGrowth!, 1);
    session.pause();
    const draft = session.state.endlessGrowth!.draft!;
    expect(session.chooseCombatUpgrade(draft.id, draft.options[0].id, session.state.growth!.runId)).toBe(true);
    expect(observed.events.find(next => next.type === 'ORGAN_INTEGRITY_CHANGED')?.data).toMatchObject({ before: 60, after: 72, reason: 'wave-supply' });
    expect(observed.history).toEqual([]);
  });
});
