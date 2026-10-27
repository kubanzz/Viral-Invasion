import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition } from '../../src/actors/collision';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { ENDLESS_BALANCE } from '../../src/game/endless';
import { GameSession } from '../../src/game/session';
import { BALANCE, type GameEvent, type Target } from '../../src/game/types';

function idle(session: GameSession) {
  return { moveX: 0, moveY: 0, aim: { x: session.state.player.x + 1, y: session.state.player.y }, fire: false };
}
function ticks(session: GameSession, count: number) {
  for (let tick = 0; tick < count; tick++) session.step(idle(session));
}
function reserved(session: GameSession): number {
  return session.state.targets.reduce((sum, target) => sum + (target.hp > 0
    ? target.traits?.includes('FISSION') && (target.generation ?? 0) === 0 && target.role !== 'source' && target.role !== 'core' ? 2 : 1
    : target.splitAt !== undefined ? target.splitPositions?.length ?? 2 : 0), 0);
}

/** Controlled trait/deadline fixture, not a natural full-run difficulty claim.
 * The first cohorts really spawn; public tool 1 kills every body. Only the last
 * ordinary is assigned FISSION before its actual hit. Its warning, child clock,
 * future queue, collision, population checks and rewards are owned by GameSession.
 */
function pendingFission(options: { terminalQueue?: boolean; earlierDeadline?: boolean } = {}) {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const s = session.state, events: GameEvent[] = [];
  session.bus.on('event', event => events.push(structuredClone(event)));
  // Let both initial three-body pulses enter before shooting any target.
  ticks(session, 147);
  expect(s.endless!.spawnSerial).toBe(6);
  let parent: Target | undefined, priorDeadline = 0;
  for (let attempt = 0; attempt < 12 * 60; attempt++) {
    const living = s.targets.filter(target => target.hp > 0).sort((a, b) => distance(s.player, a) - distance(s.player, b));
    const target = living[0];
    const canMark = options.terminalQueue ? s.endless!.remainingToSpawn === 0 : s.endless!.remainingToSpawn > 0;
    if (!parent && living.length === 1 && canMark) { parent = target; parent.traits = ['FISSION']; parent.kind = 'cluster'; }
    if (parent && target === parent && target.hp <= 34 && s.elapsed + BALANCE.step + 1e-9 >= s.cooldowns[1]) {
      if (options.earlierDeadline) s.endless!.nextSpawnAt = s.elapsed + BALANCE.step + .2;
      priorDeadline = s.endless!.nextSpawnAt;
    }
    session.step(target ? { ...idle(session), aim: { x: target.x, y: target.y }, fire: true, tool: 1 } : idle(session));
    if (parent?.splitAt !== undefined) {
      expect(parent.hp).toBe(0); expect(s.targets.filter(target => target.hp > 0)).toHaveLength(0);
      expect(s.endless!.pendingChildren).toBe(2);
      expect(events.some(event => event.type === 'TARGET_HIT' && event.data.id === parent!.id && Number(event.data.damage) > 0)).toBe(true);
      expect(events.some(event => event.type === 'FISSION_WARNING' && event.data.parentId === parent!.id)).toBe(true);
      return { session, s, events, parent, deathAt: s.elapsed, priorDeadline };
    }
    expect(s.phase).toBe('playing');
  }
  throw new Error('Public tool inputs did not produce the pending-fission fixture');
}

describe('finite pursuit overlapping an unchanged fission promise', () => {
  it('admits the next real batch at .5s while the real children retain their .8s warning', () => {
    const f = pendingFission(), { s, session, parent, deathAt, events } = f;
    const splitAt = parent.splitAt!, remaining = s.endless!.remainingToSpawn, serial = s.endless!.spawnSerial;
    expect(splitAt - deathAt).toBeCloseTo(BATTLE_BALANCE.fissionDelay);
    expect(s.endless!.nextSpawnAt - deathAt).toBeCloseTo(.5);
    expect(f.priorDeadline).toBeGreaterThan(s.endless!.nextSpawnAt);
    expect(events.filter(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toHaveLength(1);
    ticks(session, 29);
    expect(s.endless!.remainingToSpawn).toBe(remaining); expect(parent.splitAt).toBe(splitAt);
    expect(events.filter(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toHaveLength(1);
    session.step(idle(session));
    const arrivals = s.targets.filter(target => target.hp > 0 && target.generation === 0);
    expect(arrivals).toHaveLength(remaining); expect(s.endless!.spawnSerial).toBe(serial + remaining);
    expect(s.endless!.remainingToSpawn).toBe(0); expect(s.endless!.pendingChildren).toBe(2);
    for (const target of arrivals) {
      expect(target.born).toBeCloseTo(deathAt + .5);
      expect(target.attackReady! - target.born!).toBeCloseTo(ENDLESS_BALANCE.spawnGrace);
      expect(distance(target, s.player)).toBeGreaterThanOrEqual(ENDLESS_BALANCE.minimumSpawnDistance);
      expect(isLegalPosition(target, target.radius, s.world)).toBe(true);
    }
    ticks(session, 17);
    expect(events.some(event => event.type === 'FISSION_SPAWNED')).toBe(false);
    expect(parent.splitAt).toBe(splitAt); expect(reserved(session)).toBe(remaining + 2);
    session.step(idle(session));
    expect(events.filter(event => event.type === 'FISSION_SPAWNED')).toHaveLength(1);
    expect(events.find(event => event.type === 'FISSION_SPAWNED')!.data.children).toBe(2);
    const children = s.targets.filter(target => target.hp > 0 && target.generation === 1);
    expect(children).toHaveLength(2);
    for (const child of children) expect(child.born).toBeCloseTo(splitAt);
    expect(reserved(session)).toBe(remaining + 2);
    expect(events.some(event => event.type === 'ENDLESS_WAVE_CLEARED')).toBe(false);
    expect(new Set(events.filter(event => event.type === 'ACTOR_SPAWNED').map(event => event.data.id)).size)
      .toBe(events.filter(event => event.type === 'ACTOR_SPAWNED').length);
  });

  it('does not postpone an already earlier deadline or rearm it on repeated fixed updates', () => {
    const f = pendingFission({ earlierDeadline: true }), deadline = f.s.endless!.nextSpawnAt;
    expect(deadline).toBe(f.priorDeadline); expect(deadline - f.deathAt).toBeCloseTo(.2);
    expect(f.events.some(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toBe(false);
    const remaining = f.s.endless!.remainingToSpawn;
    ticks(f.session, 11); expect(f.s.endless!.nextSpawnAt).toBe(deadline);
    expect(f.s.endless!.remainingToSpawn).toBe(remaining);
    f.session.step(idle(f.session)); expect(f.s.endless!.remainingToSpawn).toBe(0);
    expect(f.parent.splitAt).toBeCloseTo(f.deathAt + .8);
    expect(f.events.some(event => event.type === 'FISSION_SPAWNED')).toBe(false);
  });

  it('never clears or rewards a final pending-only wave before both actual children are killed', () => {
    const f = pendingFission({ terminalQueue: true });
    expect(f.s.endless!.remainingToSpawn).toBe(0);
    expect(f.events.some(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED' && event.tick >= f.s.tick)).toBe(false);
    ticks(f.session, 47);
    expect(f.s.endless!.phase).toBe('combat'); expect(f.s.endless!.clearedWaves).toBe(0);
    expect(f.s.endlessGrowth!.draft).toBeNull(); expect(f.s.growth!.draft).toBeNull();
    f.session.step(idle(f.session));
    expect(f.s.targets.filter(target => target.hp > 0 && target.generation === 1)).toHaveLength(2);
    expect(f.s.endless!.phase).toBe('combat'); expect(f.s.endless!.clearedWaves).toBe(0);
    for (let attempt = 0; attempt < 180 && f.s.phase === 'playing'; attempt++) {
      const target = f.s.targets.filter(target => target.hp > 0).sort((a, b) => distance(f.s.player, a) - distance(f.s.player, b))[0];
      f.session.step(target ? { ...idle(f.session), aim: target, fire: true, tool: 1 } : idle(f.session));
    }
    expect(f.s.endless!.clearedWaves).toBe(1); expect(f.s.phase).toBe('paused');
    expect(f.events.filter(event => event.type === 'ENDLESS_WAVE_CLEARED')).toHaveLength(1);
    const awarded = structuredClone(f.s.endlessGrowth!.draft);
    expect(awarded).not.toBeNull(); ticks(f.session, 120);
    expect(f.s.endlessGrowth!.draft).toEqual(awarded);
    expect(f.events.filter(event => event.type === 'ENDLESS_WAVE_CLEARED')).toHaveLength(1);
  });

  it('keeps the accepted pursuit and child promise frozen through actual pause and resume', () => {
    const f = pendingFission(), before = f.session.snapshot();
    f.session.pause(); ticks(f.session, 180);
    expect(f.s.tick).toBe(before.tick); expect(f.s.elapsed).toBe(before.elapsed);
    expect(f.s.endless).toEqual(before.endless); expect(f.parent.splitAt).toBe(before.targets.find(target => target.id === f.parent.id)!.splitAt);
    expect(f.events.some(event => event.type === 'FISSION_SPAWNED')).toBe(false);
    f.session.resume(); ticks(f.session, 30);
    expect(f.s.endless!.remainingToSpawn).toBe(0); expect(f.s.endless!.pendingChildren).toBe(2);
    ticks(f.session, 18); expect(f.events.filter(event => event.type === 'FISSION_SPAWNED')).toHaveLength(1);
    expect(f.events.filter(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toHaveLength(1);
  });

  it.each(['player', 'tissue', 'ended'] as const)('does not advance accepted promises after %s termination', terminal => {
    const f = pendingFission(), before = structuredClone(f.s.endless), splitAt = f.parent.splitAt;
    // Terminal boundary fixtures; lifecycle and queue are not manually advanced.
    if (terminal === 'player') f.s.player.hp = 0;
    else if (terminal === 'tissue') f.s.tissue.hp = 0;
    else f.session.finish(false, 'fixture ended');
    ticks(f.session, 120);
    expect(f.s.phase).toBe('result'); expect(f.s.endless).toEqual(before); expect(f.parent.splitAt).toBe(splitAt);
    expect(f.events.some(event => event.type === 'FISSION_SPAWNED')).toBe(false);
    expect(f.events.some(event => event.type === 'ENDLESS_WAVE_CLEARED')).toBe(false);
  });

  it('holds a due primary batch behind 24 actual and reserved actors, then spends each freed budget slot once', () => {
    const f = pendingFission(), { s, session, parent } = f, e = s.endless!;
    // Explicit density fixture: 16 ordinary residents plus four pending two-child
    // promises fill 24 slots. This verifies admission, not natural crowd survival.
    s.world = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    for (let index = 0; index < 16; index++) {
      const angle = index * Math.PI * 2 / 16;
      s.targets.push({ ...parent, id: `density-resident-${index}`, x: s.player.x + Math.cos(angle) * 550, y: s.player.y + Math.sin(angle) * 550,
        hp: 68, maxHp: 68, traits: [], kind: 'single', splitAt: undefined, splitPositions: undefined, attackReady: s.elapsed + 10 });
    }
    for (let index = 0; index < 3; index++) s.targets.push({ ...parent, id: `density-pending-${index}`, x: 350 + index * 350, y: 250,
      splitPositions: [{ x: 323 + index * 350, y: 260 }, { x: 377 + index * 350, y: 260 }] });
    const remaining = e.remainingToSpawn, serial = e.spawnSerial;
    expect(reserved(session)).toBe(24);
    expect(e.nextSpawnAt - f.deathAt).toBeCloseTo(.5);
    ticks(session, 30);
    expect(e.pendingChildren).toBe(8); expect(e.spawnSerial).toBe(serial); expect(e.remainingToSpawn).toBe(remaining);
    expect(e.batchMemberIndex).toBe(0); expect(reserved(session)).toBe(24);
    expect(e.nextSpawnAt - s.elapsed).toBeCloseTo(.25);
    ticks(session, 18);
    expect(e.pendingChildren).toBe(0); expect(s.targets.filter(target => target.hp > 0)).toHaveLength(24);
    expect(f.events.filter(event => event.type === 'FISSION_SPAWNED')).toHaveLength(4);
    expect(f.events.filter(event => event.type === 'FISSION_SPAWNED').every(event => event.data.children === 2)).toBe(true);
    expect(e.spawnSerial).toBe(serial); expect(e.remainingToSpawn).toBe(remaining);
    const cap = BATTLE_BALANCE.maxActors;
    for (let attempt = 0; attempt < 180 && e.remainingToSpawn > 0; attempt++) {
      const target = s.targets.filter(target => target.hp > 0).sort((a, b) => distance(s.player, a) - distance(s.player, b))[0];
      session.step({ ...idle(session), aim: target, fire: true, tool: 1 });
      expect(reserved(session)).toBeLessThanOrEqual(cap);
      expect(s.targets.filter(target => target.hp > 0).length).toBeLessThanOrEqual(cap);
    }
    expect(e.remainingToSpawn).toBe(0); expect(e.spawnSerial).toBe(serial + remaining);
    const primaryBirths = f.events.filter(event => event.type === 'ACTOR_SPAWNED' && event.data.generation === 0);
    expect(primaryBirths).toHaveLength(e.totalToSpawn);
    expect(new Set(primaryBirths.map(event => event.data.id)).size).toBe(e.totalToSpawn);
  });
});
