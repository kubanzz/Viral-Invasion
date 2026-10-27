import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { initializeBattle } from '../../src/game/battle';
import { ENDLESS_BALANCE as E, EndlessDirector, initializeEndless } from '../../src/game/endless';
import type { EndlessGameState, EndlessHost } from '../../src/game/endlessTypes';
import { GameSession } from '../../src/game/session';
import type { GameEvent, Target } from '../../src/game/types';

function fixture(seed = 71) {
  const state: EndlessGameState = { game: 'viral-invasion', schemaVersion: 1, seed, phase: 'playing', tick: 0, elapsed: 0,
    player: { x: 450, y: 1070, hp: 100, radius: 19, facing: 0, moving: false, dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 },
    targets: [], tissue: { x: 850, y: 1190, hp: 62, maxHp: 100, radius: 43 }, terminal: { x: 350, y: 1180 }, tool: 1,
    cooldowns: { 1: 0, 2: 0, 3: 0 }, scanReady: 0, scanUntil: 0, effects: [], events: [], message: '', messageUntil: 0,
    shots: 0, hits: 0, scans: 0, dashes: 0, result: null };
  initializeBattle(state, { milestone: 'G3', encounterMode: 'fixture' });
  initializeEndless(state);
  const completed: number[] = [], events: GameEvent[] = [];
  let director: EndlessDirector;
  const host: EndlessHost = { state, emit(type, data) { const event = { type, tick: state.tick, data }; events.push(event); director.recordEvent(event); },
    effect() {}, message() {}, completeWave(wave) { completed.push(wave); } };
  director = new EndlessDirector(host);
  function advance(seconds: number) { state.elapsed += seconds; state.tick += Math.max(1, Math.round(seconds * 60)); director.beforeInput(); director.afterInput(); }
  function clear(target: Target) { target.hp = 0; director.recordEvent({ type: 'TARGET_CLEARED', tick: state.tick, data: { id: target.id } }); }
  function finishWave() {
    for (let attempt = 0; attempt < 50 && state.endless!.phase === 'combat'; attempt++) {
      for (const target of state.targets) { if (target.hp > 0) clear(target); target.splitAt = undefined; }
      director.afterInput();
      if (state.endless!.phase === 'combat') advance(2.1);
    }
    expect(state.endless!.phase).toBe('intermission');
  }
  return { state, director, host, completed, events, advance, clear, finishWave };
}

describe('continuous endless wave director', () => {
  it('removes campaign production and research while retaining a legal large chamber and central facilities', () => {
    const f = fixture(), s = f.state, world = s.world!;
    expect(s.targets).toEqual([]); expect(s.battle!.graph.edges).toEqual([]); expect(s.battle!.nextSpawnAt).toEqual({});
    expect(s.battle!.graph.nodes.some(node => node.kind === 'research' || node.kind === 'source')).toBe(false);
    expect(s.battle!.graph.nodes.some(node => node.kind === 'valve')).toBe(true);
    expect(s.battle!.encounter).toBeUndefined(); expect(world.width).toBe(2400);
    expect(s.player.hp).toBe(100); expect(s.tissue.hp).toBe(100);
    for (const point of [s.player, s.tissue, s.battle!.pulse.origin]) {
      expect(point.x).toBeGreaterThan(world.bounds.left + 50); expect(point.x).toBeLessThan(world.bounds.right - 50);
      for (const obstacle of world.obstacles) expect(distance(point, obstacle)).toBeGreaterThan(obstacle.radius + 40);
    }
  });

  it('spawns the first coherent front batch at warning expiry, with legal distant arrivals and two-shot ordinary HP', () => {
    const f = fixture(); f.advance(E.warningSeconds - .01); expect(f.state.targets).toHaveLength(0); f.advance(.01);
    expect(f.state.endless!.phase).toBe('combat'); expect(f.state.targets).toHaveLength(3);
    expect(f.state.endless!.formation).toBe('front');
    expect(f.state.endless!.batchSchedule[0].sector).toBe(f.state.endless!.batchSchedule[1].sector);
    for (const target of f.state.targets) {
      expect(distance(target, f.state.player)).toBeGreaterThanOrEqual(340);
      expect(distance(target, f.state.player)).toBeLessThanOrEqual(600);
      expect(target.hp).toBe(68); expect(target.sourceId).toBe('endless:wave:1');
      expect(target.attackReady).toBeCloseTo(f.state.elapsed + E.spawnGrace);
      for (const obstacle of f.state.world!.obstacles) expect(distance(target, obstacle)).toBeGreaterThanOrEqual(target.radius + obstacle.radius);
    }
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(3);
  });

  it('does not catch up overdue batches or advance when paused, dead, or after the run ended', () => {
    const f = fixture(); f.advance(3); const first = f.state.targets.length;
    f.advance(500); expect(f.state.targets.length - first).toBe(3);
    f.state.phase = 'paused'; const before = structuredClone(f.state.endless); f.advance(100);
    expect(f.state.endless).toEqual(before);
    f.state.phase = 'result'; f.advance(100); expect(f.state.endless).toEqual(before);
    f.state.phase = 'playing'; f.state.player.hp = 0; f.advance(100); expect(f.state.endless).toEqual(before);
  });

  it('brings the next real batch within half a second of an actual public-input clear', () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start();
    const s = session.state, pursuit: GameEvent[] = [];
    const idle = { moveX: 0, moveY: 0, aim: { x: s.player.x + 1, y: s.player.y }, fire: false };
    session.bus.on('event', event => { if (event.type === 'ENDLESS_PURSUIT_ACCELERATED') pursuit.push(event); });
    for (let tick = 0; tick < 8 * 60 && pursuit.length === 0; tick++) {
      const target = s.targets.filter(actor => actor.hp > 0).sort((a, b) => distance(s.player, a) - distance(s.player, b))[0];
      session.step(target ? { ...idle, aim: { x: target.x, y: target.y }, fire: true, tool: 1 } : idle);
    }
    expect(pursuit).toHaveLength(1);
    expect(s.endless!.kills).toBe(6); expect(s.targets.filter(target => target.hp > 0)).toHaveLength(0);
    expect(s.events.some(event => event.type === 'TARGET_CLEARED')).toBe(true);
    const remaining = s.endless!.remainingToSpawn, deadline = s.endless!.nextSpawnAt, clearAt = s.elapsed;
    expect(deadline - clearAt).toBeCloseTo(.5);
    expect(Number(pursuit[0].data.previousSpawnAt)).toBeGreaterThan(deadline);
    for (let tick = 0; tick < 29; tick++) session.step(idle);
    expect(s.endless!.remainingToSpawn).toBe(remaining); expect(s.endless!.nextSpawnAt).toBe(deadline);
    expect(pursuit).toHaveLength(1); session.step(idle);
    expect(s.endless!.remainingToSpawn).toBe(0);
    const arrivals = s.targets.filter(target => target.hp > 0); expect(arrivals).toHaveLength(remaining);
    for (const target of arrivals) {
      expect(target.born).toBeCloseTo(clearAt + .5); expect(target.attackReady! - target.born!).toBeCloseTo(E.spawnGrace);
      expect(distance(target, s.player)).toBeGreaterThanOrEqual(E.minimumSpawnDistance);
    }
  });

  it('keeps closer scheduled arrivals and does not accelerate while any living body or fission promise remains', () => {
    const f = fixture(); f.advance(E.warningSeconds); f.advance(.45);
    const original = f.state.endless!.nextSpawnAt;
    f.director.afterInput(); expect(f.state.endless!.nextSpawnAt).toBe(original);
    for (const target of f.state.targets) f.clear(target);
    const parent = f.state.targets[0]; parent.splitAt = f.state.elapsed + .8;
    parent.splitPositions = [{ x: parent.x - 27, y: parent.y }, { x: parent.x + 27, y: parent.y }];
    f.director.afterInput(); expect(f.state.endless!.pendingChildren).toBe(2);
    expect(f.state.endless!.nextSpawnAt).toBe(original);
    expect(f.events.some(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toBe(false);
    parent.splitAt = undefined;
    f.state.endless!.nextSpawnAt = f.state.elapsed + .2;
    const closer = f.state.endless!.nextSpawnAt; f.director.afterInput();
    expect(f.state.endless!.nextSpawnAt).toBe(closer);
    expect(f.events.some(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toBe(false);
    f.advance(.2); expect(f.state.targets.filter(target => target.hp > 0)).toHaveLength(2);
  });

  it('freezes a pending pursuit while paused or terminal and never spawns overdue catch-up batches', () => {
    for (const terminal of ['paused', 'result', 'player-dead', 'tissue-dead'] as const) {
      const f = fixture(); f.advance(E.warningSeconds); f.advance(.45);
      for (const target of f.state.targets) f.clear(target);
      if (terminal === 'player-dead') f.state.player.hp = 0;
      else if (terminal === 'tissue-dead') f.state.tissue.hp = 0;
      else f.state.phase = terminal;
      const before = structuredClone(f.state.endless), actors = f.state.targets.length;
      f.director.afterInput(); f.advance(100);
      expect(f.state.endless).toEqual(before); expect(f.state.targets).toHaveLength(actors);
      expect(f.events.some(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toBe(false);
    }
    const paused = fixture(); paused.advance(E.warningSeconds); paused.advance(.45);
    for (const target of paused.state.targets) paused.clear(target);
    paused.director.afterInput(); paused.state.phase = 'paused';
    const accepted = structuredClone(paused.state.endless); paused.advance(100);
    expect(paused.state.endless).toEqual(accepted);
    expect(paused.events.filter(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toHaveLength(1);
    expect(paused.state.targets.filter(target => target.hp > 0)).toHaveLength(0);
    const f = fixture(); f.advance(E.warningSeconds); f.finishWave();
    f.advance(E.intermissionSeconds); f.advance(E.warningSeconds); f.advance(.7);
    for (const target of f.state.targets) f.clear(target);
    f.director.afterInput(); expect(f.state.endless!.nextSpawnAt - f.state.elapsed).toBeCloseTo(.5);
    const serial = f.state.endless!.batchSerial; f.advance(100);
    expect(f.state.endless!.batchSerial).toBe(serial + 1);
    expect(f.state.endless!.remainingToSpawn).toBe(1);
    expect(f.state.endless!.nextSpawnAt).toBeGreaterThan(f.state.elapsed);
  });

  it('reproduces pursuit deadlines, actual arrivals and events for the same seed and clear actions', () => {
    const a = fixture(17), b = fixture(17);
    for (const f of [a, b]) {
      f.advance(E.warningSeconds); f.advance(.45);
      for (const target of f.state.targets) f.clear(target);
      f.director.afterInput(); f.advance(.25); f.advance(.25);
    }
    expect(a.events.filter(event => event.type === 'ENDLESS_PURSUIT_ACCELERATED')).toHaveLength(1);
    expect(a.events).toEqual(b.events); expect(a.state.endless).toEqual(b.state.endless);
    expect(a.state.targets).toEqual(b.state.targets);
  });

  it('completes only after finite reinforcements and every living body, gives exactly one reward, then starts another wave', () => {
    const f = fixture(); f.advance(3); f.finishWave();
    expect(f.completed).toEqual([1]); expect(f.state.endless!.clearedWaves).toBe(1);
    for (let i = 0; i < 4; i++) f.director.afterInput(); expect(f.completed).toEqual([1]);
    f.advance(E.intermissionSeconds - .01); expect(f.state.endless!.wave).toBe(1);
    f.advance(.01); expect(f.state.endless!.wave).toBe(2); expect(f.state.endless!.phase).toBe('warning');
    expect(f.state.endless!.spawnedIds).toEqual([]); expect(f.state.endless!.creditedKillIds).toEqual([]);
    f.advance(E.warningSeconds); expect(f.state.targets.some(target => target.hp > 0 && target.sourceId === 'endless:wave:2')).toBe(true);
  });

  it('waits for pending fission, then for its real child, and credits each parent/child kill once', () => {
    const f = fixture(); f.advance(3);
    for (const target of f.state.targets) f.clear(target);
    f.state.endless!.remainingToSpawn = 0;
    const parent = f.state.targets[0]; parent.traits = ['FISSION']; parent.splitAt = f.state.elapsed + .8;
    parent.splitPositions = [{ x: parent.x - 27, y: parent.y }, { x: parent.x + 27, y: parent.y }];
    f.director.afterInput(); expect(f.completed).toEqual([]); expect(f.state.endless!.pendingChildren).toBe(2);
    f.advance(.9); expect(f.completed).toEqual([]);
    parent.splitAt = undefined;
    const child = { ...parent, id: 'actual-child', hp: 22, maxHp: 22, generation: 1, splitPositions: undefined };
    f.state.targets.push(child); f.host.emit('ACTOR_SPAWNED', { id: child.id, sourceId: child.sourceId!, generation: 1 });
    f.director.afterInput(); expect(f.completed).toEqual([]);
    const before = f.state.endless!.kills; f.clear(child); f.clear(child); expect(f.state.endless!.kills).toBe(before + 1);
    f.director.afterInput(); expect(f.completed).toEqual([1]);
  });

  it('does not accept unearned/stale/foreign kill intents or duplicate kill receipts', () => {
    const f = fixture(); f.advance(3); const target = f.state.targets[0];
    f.host.emit('TARGET_CLEARED', { id: target.id }); expect(f.state.endless!.kills).toBe(0);
    target.hp = 0;
    f.director.recordEvent({ type: 'TARGET_CLEARED', tick: f.state.tick - 1, data: { id: target.id } }); expect(f.state.endless!.kills).toBe(0);
    f.clear(target); const score = f.state.endless!.score; f.clear(target);
    expect(f.state.endless!.kills).toBe(1); expect(f.state.endless!.score).toBe(score);
    f.state.targets.push({ ...target, id: 'foreign', sourceId: 'campaign-source' }); f.clear(f.state.targets.at(-1)!);
    expect(f.state.endless!.kills).toBe(1);
  });

  it('reserves the worst-case fission population, holds a full batch without deleting actors and respects the 24 cap', () => {
    const f = fixture(); f.advance(3); const base = f.state.targets[0];
    f.state.targets = Array.from({ length: 20 }, (_, index) => ({ ...base, id: `resident-${index}`, traits: index < 4 ? ['FISSION' as const] : [], x: 200 + index * 70, y: 200 }));
    f.state.endless!.remainingToSpawn = 20; const before = structuredClone(f.state.targets); f.advance(2.1);
    expect(f.state.targets).toEqual(before); expect(f.state.endless!.remainingToSpawn).toBe(20);
    // Four dying parents reserve eight landings: no primary batch may steal those slots.
    for (const parent of f.state.targets.slice(0, 4)) { parent.hp = 0; parent.splitAt = f.state.elapsed + .8; parent.splitPositions = [{ x: parent.x, y: 250 }, { x: parent.x, y: 300 }]; }
    f.advance(2.1); expect(f.state.endless!.pendingChildren).toBe(8); expect(f.state.targets.filter(target => target.hp > 0)).toHaveLength(16);
    expect(f.state.targets).toHaveLength(20);
  });

  it('keeps combos from accepted kills, expires them in simulation time and preserves the best', () => {
    const f = fixture(); f.advance(3); f.clear(f.state.targets[0]); f.clear(f.state.targets[1]);
    expect(f.state.endless!.combo).toBe(2); expect(f.state.endless!.bestCombo).toBe(2);
    f.advance(3.1); expect(f.state.endless!.combo).toBe(0); expect(f.state.endless!.bestCombo).toBe(2);
    f.clear(f.state.targets[2]); expect(f.state.endless!.combo).toBe(1);
  });

  it('warns eight seconds on every fifth-wave elite, rotates traits, keeps per-body trait/HP bounded and continues beyond a fixed finale', () => {
    const f = fixture(); f.advance(3);
    const eliteTraits: string[] = [];
    for (let wave = 1; wave <= 31; wave++) {
      if (wave > 1) {
        f.advance(E.intermissionSeconds); expect(f.state.endless!.wave).toBe(wave);
        const warning = f.state.endless!.warningSeconds;
        expect(warning).toBe(wave % 5 === 0 || wave === 3 || wave === 16 ? E.traitWarningSeconds : E.warningSeconds);
        f.advance(warning - .01); expect(f.state.endless!.phase).toBe('warning'); f.advance(.01);
      }
      if (wave % 5 === 0) {
        if (wave >= 30) f.advance(f.state.endless!.batchSchedule[1].at);
        const elites = f.state.targets.filter(target => target.hp > 0 && target.role === 'elite');
        expect(elites.length).toBe(wave >= 30 ? 2 : 1); eliteTraits.push(elites[0].traits![0]);
        for (const elite of elites) { expect(elite.hp).toBeLessThanOrEqual(204); expect(elite.traits!.length).toBeLessThanOrEqual(1); }
      }
      for (const target of f.state.targets.filter(target => target.hp > 0 && target.role === 'virus')) expect(target.maxHp).toBe(68);
      f.finishWave();
      // Mimic the host's bounded corpse cleanup rather than retaining test corpses forever.
      f.state.targets = [];
    }
    expect(new Set(eliteTraits.slice(0, 3)).size).toBe(3); expect(f.completed).toHaveLength(31);
    expect(f.state.endless!.clearedWaves).toBe(31); expect(f.state.phase).toBe('playing');
  });

  it('is deterministic for the same seed and simulation actions, including after serializing the run state', () => {
    const a = fixture(17), b = fixture(17);
    for (const f of [a, b]) { f.advance(3); f.advance(2); f.clear(f.state.targets[0]); f.advance(2); }
    expect(a.state.targets).toEqual(b.state.targets); expect(a.state.endless).toEqual(b.state.endless);
    b.host.state = structuredClone(b.state);
    a.advance(2);
    b.host.state.elapsed += 2; b.host.state.tick += 120; b.director.beforeInput(); b.director.afterInput();
    expect(a.state.endless).toEqual((b.host.state as EndlessGameState).endless);
    expect(a.state.targets).toEqual(b.host.state.targets);
  });
});
