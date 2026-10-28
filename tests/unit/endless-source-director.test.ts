import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition } from '../../src/actors/collision';
import { EndlessDirector } from '../../src/game/endless';
import { ENDLESS_SOURCE_BALANCE as S, planEndlessSource, sourcePlanEligible, sourceQuotaRemaining } from '../../src/game/endlessSource';
import { endlessPacing } from '../../src/game/endlessPacing';
import { GameSession } from '../../src/game/session';
import type { EndlessHost } from '../../src/game/endlessTypes';
import { BALANCE, type GameEvent, type Target } from '../../src/game/types';

/** Director-only queue fixtures; real public input and bites are covered by source-squad tests. */
function fixture(wave = 6, seed = 71) {
  const session = new GameSession(seed, { mode: 'endless' }); session.start(); const state = session.state, e = state.endless!;
  state.targets = [];
  Object.assign(e, { wave: wave - 1, clearedWaves: wave - 1, phase: 'intermission', phaseUntil: 0, remainingToSpawn: 0,
    traits: ['CARAPACE', 'FISSION'], evolution: { history: [], recentPrimaries: [] } });
  const events: GameEvent[] = [], messages: string[] = [];
  let director: EndlessDirector;
  const host: EndlessHost = { state, emit(type, data) {
    const event = { type, data, tick: state.tick }; events.push(structuredClone(event)); director.recordEvent(event);
    expect(e.spawnSerial + e.canceledToSpawn + e.remainingToSpawn).toBe(e.totalToSpawn);
  }, effect() {}, message(text) { messages.push(text); }, completeWave() {} };
  director = new EndlessDirector(host); director.beforeInput();
  function advance(seconds: number) { state.elapsed += seconds; state.tick = Math.round(state.elapsed * 60); director.beforeInput(); director.afterInput(); }
  function enter() { advance(e.phaseUntil - state.elapsed); }
  function clearSource() {
    const body = state.targets.find(target => target.id === e.source!.id)!; body.hp = 0;
    director.recordEvent({ type: 'TARGET_CLEARED', data: { id: body.id, kind: body.kind }, tick: state.tick });
  }
  function drain(until: () => boolean = () => e.remainingToSpawn === 0) {
    for (let batch = 0; batch < e.batchSchedule.length + 2 && !until(); batch++) {
      for (const target of state.targets) if (target.role !== 'source') { target.hp = 0; target.splitAt = undefined; }
      advance(Math.max(0, e.nextSpawnAt - state.elapsed));
    }
    expect(until()).toBe(true);
  }
  return { state, e, director, host, events, messages, advance, enter, clearSource, drain };
}

describe('optional far-side finite source plan', () => {
  it('appears only at each cycle first pressure from wave6, replacing one ordinary and owning six tail ordinary slots', () => {
    for (const wave of [1, 5, 6, 7, 8, 10, 11, 16, 21, 31]) {
      const f = fixture(wave), slots = f.e.batchSchedule.flatMap(batch => batch.roles), source = f.e.source;
      expect(!!source).toBe(wave >= 6 && (wave - 1) % 5 === 0);
      expect(f.e.totalToSpawn).toBe(Math.min(48, 6 + wave * 2 + endlessPacing(wave).budgetBonus));
      if (!source) continue;
      expect(slots.filter(role => role === 'source')).toHaveLength(1); expect(slots[0]).toBe('source');
      expect(source.quotaSlots).toEqual(slots.flatMap((role, index) => role === 'ordinary' ? [index] : []).slice(-6));
      expect(f.e.warningSeconds).toBe(8); expect(source.bornAt).toBeNull(); expect(source.status).toBe('active');
      expect(f.messages.at(-1)).toContain('配额耗尽后自动枯竭');
    }
    for (const wave of [NaN, Infinity, -1, 6.5]) expect(sourcePlanEligible(wave)).toBe(false);
  });

  it('freezes a deterministic legal far point through the whole warning, then births the same body and graph node', () => {
    for (const seed of [7, 19, 71]) {
      const a = fixture(6, seed), b = fixture(6, seed), point = structuredClone(a.e.source!.position);
      expect(a.e.source).toEqual(b.e.source);
      expect(isLegalPosition(point, S.radius, a.state.world)).toBe(true);
      expect(distance(point, a.state.tissue)).toBeGreaterThan(530 + S.radius);
      a.state.player.x += 100; a.advance(7.99); expect(a.state.targets).toHaveLength(0);
      expect(a.e.source!.position).toEqual(point); a.advance(.01);
      const body = a.state.targets.find(target => target.id === a.e.source!.id)!;
      expect(body).toMatchObject({ ...point, role: 'source', traits: [], radius: S.radius, sourceId: 'endless:wave:6' });
      expect(a.state.battle!.graph.nodes.filter(node => node.id === body.id)).toEqual([expect.objectContaining({ ...point, active: true, infected: true })]);
      expect(a.state.battle!.graph.edges).toEqual([]); expect(a.state.battle!.nextSpawnAt).toEqual({});
    }
  });

  it('rejects a sealed custom geometry instead of announcing an unreachable source', () => {
    const f = fixture();
    f.state.world = { ...f.state.world!, bounds: { left: 1000, right: 1400, top: 700, bottom: 1100 } };
    expect(planEndlessSource(f.state, 6, ['ordinary', 'ordinary', 'ordinary'])).toBeUndefined();
  });

  it('leaves a scheduled first-source intervention window without delaying any existing batch', () => {
    const observations = [];
    for (const seed of [7, 19, 71]) {
      const f = fixture(6, seed), source = f.e.source!;
      const firstQuotaAt = f.e.batchSchedule[Math.floor(source.quotaSlots[0] / 3)].at;
      const lastQuotaAt = f.e.batchSchedule[Math.floor(source.quotaSlots.at(-1)! / 3)].at;
      const directDistance = distance(f.state.player, source.position);
      f.enter(); const body = f.state.targets.find(target => target.id === source.id)!;
      const shots = Math.ceil(body.hp / BALANCE.damage[1]);
      const nominalShotSeconds = (shots - 1) * BALANCE.cooldowns[1];
      const directApproachSeconds = Math.max(0, directDistance - BALANCE.range) / BALANCE.speed;
      expect(firstQuotaAt).toBeGreaterThan(directApproachSeconds + nominalShotSeconds + 3);
      expect(lastQuotaAt).toBeGreaterThanOrEqual(firstQuotaAt);
      observations.push({ seed, source: source.position, sourceHp: body.hp, directDistance,
        firstQuotaAt, lastQuotaAt, shots, nominalShotSeconds, directApproachSeconds,
        scope: 'Schedule and straight-line arithmetic only; no navigation, combat or human travel-time acceptance.' });
    }
    console.info('ENDLESS_SOURCE_SCHEDULE_WINDOW', JSON.stringify(observations));
  });

  it('cancels only still-unborn owned slots once, retains support identities and preserves the original slot trait sequence', () => {
    const cut = fixture(16), full = fixture(16); cut.enter(); full.enter();
    cut.drain(() => cut.e.source!.bornQuotaSlots.length > 0);
    const bornBefore = cut.e.source!.bornQuotaSlots.length, liveBefore = cut.state.targets.map(t => t.id);
    cut.clearSource(); const canceled = [...cut.e.source!.canceledSlots];
    expect(canceled.length).toBe(6 - bornBefore); expect(cut.e.canceledToSpawn).toBe(canceled.length);
    expect(cut.state.targets.map(t => t.id)).toEqual(liveBefore);
    expect(cut.e.source!.status).toBe('destroyed'); expect(sourceQuotaRemaining(cut.e.source!)).toBe(0);
    cut.clearSource(); expect(cut.events.filter(event => event.type === 'ENDLESS_SOURCE_CUT_OFF')).toHaveLength(1);
    cut.drain(); full.drain();
    const births = (f: typeof cut) => f.events.filter(event => event.type === 'ACTOR_SPAWNED');
    expect(births(cut).length + canceled.length).toBe(cut.e.totalToSpawn);
    expect(births(cut).some(event => canceled.includes(Number(event.data.slot)))).toBe(false);
    const fullSlots = new Map(births(full).map(event => [event.data.slot, event.data]));
    for (const event of births(cut)) expect(event.data).toMatchObject({ slot: event.data.slot,
      traits: fullSlots.get(event.data.slot)!.traits, tactic: fullSlots.get(event.data.slot)!.tactic, role: fullSlots.get(event.data.slot)!.role });
    expect(births(cut).filter(event => event.data.tactic !== 'melee')).toHaveLength(births(full).filter(event => event.data.tactic !== 'melee').length);
  });

  it('lets an untouched source exhaust without damage or kill intent and no longer block the original finite wave', () => {
    const f = fixture(); f.enter(); const kills = f.e.kills, score = f.e.score, combo = f.e.combo;
    f.drain();
    expect(f.e.source!.status).toBe('exhausted'); expect(f.e.source!.bornQuotaSlots).toHaveLength(6);
    expect(f.e.canceledToSpawn).toBe(0); expect(f.e.spawnSerial).toBe(f.e.totalToSpawn);
    expect(f.state.targets.find(target => target.id === f.e.source!.id)!.hp).toBe(0);
    expect(f.e.kills).toBe(kills); expect(f.e.score).toBe(score); expect(f.e.combo).toBe(combo);
    expect(f.events.filter(event => event.type === 'ENDLESS_SOURCE_EXHAUSTED')).toHaveLength(1);
    expect(f.events.some(event => ['TARGET_HIT', 'TARGET_CLEARED', 'INFECTION_SOURCE_CLEARED'].includes(event.type))).toBe(false);
    for (const target of f.state.targets) target.hp = 0;
    f.director.afterInput(); expect(f.e.phase).toBe('intermission'); expect(f.e.clearedWaves).toBe(6);
  });

  it('births owned units on the source approach with ordinary safety and discloses legal fallback arrivals', () => {
    const near = fixture(); near.enter(); near.drain();
    const nearEvents = near.events.filter(event => event.type === 'ENDLESS_SOURCE_QUOTA_BORN');
    expect(nearEvents).toHaveLength(6); expect(nearEvents.some(event => event.data.fallback === false)).toBe(true);
    for (const event of nearEvents) {
      const body = near.state.targets.find(target => target.id === event.data.actorId)!;
      expect(distance(body, near.state.player)).toBeGreaterThanOrEqual(340); expect(distance(body, near.state.player)).toBeLessThanOrEqual(600);
      expect(isLegalPosition(body, body.radius, near.state.world)).toBe(true);
      if (!event.data.fallback) expect(distance(body, near.e.source!.position)).toBeLessThanOrEqual(440 + 1e-7);
    }
    const far = fixture(); far.enter();
    far.state.player.x = far.e.source!.position.x > 1200 ? 150 : 2250; far.state.player.y = 400;
    far.drain();
    const fallbacks = far.events.filter(event => event.type === 'ENDLESS_SOURCE_QUOTA_BORN' && event.data.fallback === true);
    expect(fallbacks.length).toBeGreaterThan(0); expect(far.e.source!.fallbackBirths).toBe(fallbacks.length);
  });

  it('preserves existing child promises and bodies when cutting quota and never cancels them as future births', () => {
    const f = fixture(); f.enter(); const original = f.state.targets[1];
    const parent: Target = { ...original, id: 'pending-parent', hp: 0, splitAt: 99,
      splitPositions: [{ x: 200, y: 400 }, { x: 260, y: 400 }], traits: ['FISSION'] };
    f.state.targets.push(parent); const before = structuredClone(parent);
    f.clearSource(); f.director.afterInput();
    expect(parent).toEqual(before); expect(f.state.targets).toContain(original); expect(original.hp).toBeGreaterThan(0);
    expect(f.e.pendingChildren).toBe(2); expect(f.e.source!.canceledSlots.every(slot => f.e.batchSchedule[Math.floor(slot / 3)].roles[slot % 3] === 'ordinary')).toBe(true);
  });

  it('commits cutoff once before callbacks and never writes an old success message after pause or restart', () => {
    for (const action of ['pause', 'restart'] as const) {
      const f = fixture(); f.enter(); const before = f.messages.length, original = f.host.emit;
      f.host.emit = (type, data) => {
        original(type, data);
        if (type === 'ENDLESS_SOURCE_CUT_OFF') {
          if (action === 'pause') f.state.phase = 'paused';
          else { const fresh = new GameSession(71, { mode: 'endless' }); fresh.start(); f.host.state = fresh.state; }
        }
      };
      f.clearSource();
      expect(f.e.source!.status).toBe('destroyed'); expect(f.e.canceledToSpawn).toBe(6);
      expect(f.messages.length).toBe(before);
      expect(f.events.filter(event => event.type === 'ENDLESS_SOURCE_CUT_OFF')).toHaveLength(1);
    }
  });
});
