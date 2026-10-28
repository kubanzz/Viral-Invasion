import { describe, expect, it } from 'vitest';
import { EndlessDirector } from '../../src/game/endless';
import type { EndlessHost } from '../../src/game/endlessTypes';
import { GameSession } from '../../src/game/session';
import type { GameEvent, Target } from '../../src/game/types';

/** Director fixtures isolate queue acceleration from movement and actual hits. */
function fixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const state = session.state, e = state.endless!;
  state.elapsed = 10; state.tick = 600;
  const source: Target = { id: 'isolated-live-source', sourceId: 'endless:wave:6', x: 1950, y: 900, radius: 34,
    hp: 200, maxHp: 200, kind: 'single', role: 'source', hitUntil: 0, scanned: false, traits: [], generation: 0 };
  state.targets = [source];
  Object.assign(e, { wave: 6, clearedWaves: 5, phase: 'combat', phaseUntil: 0, totalToSpawn: 4, remainingToSpawn: 3,
    spawnSerial: 1, spawnedIds: [source.id], batchIndex: 1, batchMemberIndex: 0, nextSpawnAt: 20, pendingChildren: 0,
    traits: [], eliteRemaining: 0, supportRemaining: 0,
    batchSchedule: [{ at: 0, sector: 0, spread: .18, roles: ['source'] }, { at: 10, sector: 0, spread: .18, roles: ['ordinary', 'ordinary', 'ordinary'] }] });
  delete e.source;
  const events: GameEvent[] = [], completed: number[] = [];
  const host: EndlessHost = { state, emit(type, data) { events.push({ type, data, tick: state.tick }); }, message() {}, effect() {}, completeWave(wave) { completed.push(wave); } };
  const director = new EndlessDirector(host);
  const at = (elapsed: number) => { state.elapsed = elapsed; state.tick = Math.round(elapsed * 60); director.afterInput(); };
  return { state, e, source, director, events, completed, at };
}
const attacker = (id: string, changes: Partial<Target> = {}): Target => ({ id, sourceId: 'endless:wave:6', x: 400, y: 400,
  radius: 22, hp: 68, maxHp: 68, kind: 'single', role: 'virus', hitUntil: 0, scanned: false, traits: [], generation: 0, ...changes });

describe('finite source does not hold an empty attack queue idle', () => {
  it('accelerates once to half a second with only a live source, without moving its deadline on following ticks', () => {
    const f = fixture();
    f.director.afterInput();
    expect(f.e.nextSpawnAt).toBeLessThanOrEqual(f.state.elapsed + .5);
    expect(f.e.nextSpawnAt).toBe(10.5);
    expect(f.events.filter(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toHaveLength(1);
    expect(f.state.targets).toEqual([f.source]); expect(f.source.hp).toBe(200); expect(f.e.remainingToSpawn).toBe(3);
    f.at(10.1); f.at(10.4);
    expect(f.e.nextSpawnAt).toBe(10.5);
    expect(f.events.filter(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toHaveLength(1);
    expect(f.e.phase).toBe('combat'); expect(f.completed).toEqual([]);
  });

  it('keeps the original future deadline when any living attacker remains', () => {
    const f = fixture(), threat = attacker('live-attacker'); f.state.targets.push(threat);
    f.director.afterInput(); f.at(10.4);
    expect(f.e.nextSpawnAt).toBe(20);
    expect(f.events.some(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toBe(false);
    expect(f.state.targets).toEqual([f.source, threat]); expect(f.e.remainingToSpawn).toBe(3);
  });

  it('overlaps the finite queue with pending fission while retaining the original child warning and clear gate', () => {
    const f = fixture(), parent = attacker('pending-parent', { hp: 0, traits: ['FISSION'], splitAt: 10.8,
      splitPositions: [{ x: 350, y: 400 }, { x: 450, y: 400 }] });
    f.state.targets.push(parent); const promise = structuredClone(parent);
    f.director.afterInput();
    expect(f.e.nextSpawnAt).toBe(10.5); expect(f.e.pendingChildren).toBe(2); expect(parent).toEqual(promise);
    f.at(10.5);
    expect(f.e.remainingToSpawn).toBe(0); expect(f.e.pendingChildren).toBe(2); expect(parent).toEqual(promise);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(3);
    expect(f.e.phase).toBe('combat'); expect(f.completed).toEqual([]);
    // Resolve independent fixture obligations one at a time: the live source
    // still blocks a clear, and afterward the child promise still blocks it.
    f.state.targets = [f.source, parent]; f.director.afterInput();
    expect(f.e.phase).toBe('combat'); expect(f.completed).toEqual([]);
    f.source.hp = 0; f.director.afterInput();
    expect(f.e.phase).toBe('combat'); expect(f.e.pendingChildren).toBe(2); expect(f.completed).toEqual([]);
    delete parent.splitAt; delete parent.splitPositions; f.director.afterInput();
    expect(f.e.phase).toBe('intermission'); expect(f.completed).toEqual([6]);
  });

  it('continues counting the live source and pending children toward the same 24-place population cap', () => {
    const f = fixture(), parent = attacker('pending-parent', { hp: 0, traits: ['FISSION'], splitAt: 99,
      splitPositions: [{ x: 350, y: 400 }, { x: 450, y: 400 }] });
    f.state.targets.push(...Array.from({ length: 21 }, (_, index) => attacker(`crowd-${index}`)), parent);
    f.e.nextSpawnAt = f.state.elapsed;
    f.director.afterInput();
    expect(f.e.remainingToSpawn).toBe(3); expect(f.e.pendingChildren).toBe(2);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toEqual([]);
    f.source.hp = 0; f.at(10.25);
    expect(f.e.remainingToSpawn).toBe(2); expect(f.e.pendingChildren).toBe(2);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(1);
  });
});
