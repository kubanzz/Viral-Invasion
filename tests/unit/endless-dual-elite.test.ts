import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { TRAITS } from '../../src/game/battleConfig';
import type { TraitId } from '../../src/game/battleTypes';
import { ENDLESS_BALANCE, EndlessDirector } from '../../src/game/endless';
import { ENDLESS_EVOLUTION_TACTICS } from '../../src/game/endlessEvolution';
import type { EndlessHost } from '../../src/game/endlessTypes';
import { ENEMY_TACTIC_INFO } from '../../src/game/enemyTacticInfo';
import { createEliteTacticCycle } from '../../src/game/eliteTacticCycle';
import { GameSession } from '../../src/game/session';
import type { GameEvent, GameState, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const pairs: [TraitId, TraitId][] = [['CARAPACE', 'FISSION'], ['CARAPACE', 'MIMIC'], ['FISSION', 'CARAPACE'],
  ['FISSION', 'MIMIC'], ['MIMIC', 'CARAPACE'], ['MIMIC', 'FISSION']];
const observations: unknown[] = [];

// Director-only boundary fixtures. Forced pairs below are explicitly supplied
// announced generation states, not claims of six naturally played campaigns.
function fixture(wave = 20, seed = 71) {
  const session = new GameSession(seed, { mode: 'endless' }); session.start();
  const state = session.state, e = state.endless!;
  state.world = structuredClone(world); state.targets = [];
  Object.assign(state.player, { x: 1100, y: 750 }); Object.assign(state.tissue, { x: 1200, y: 950, hp: 100 });
  Object.assign(e, { wave: wave - 1, clearedWaves: wave - 1, phase: 'intermission', phaseUntil: 0, remainingToSpawn: 0,
    traits: ['CARAPACE', 'MIMIC'], evolution: { history: [], recentPrimaries: [] } });
  const events: GameEvent[] = [], messages: string[] = [];
  let director: EndlessDirector;
  const host: EndlessHost = { state, emit(type, data) { const event = { type, data, tick: state.tick }; events.push(structuredClone(event)); director.recordEvent(event); },
    effect() {}, message(text) { messages.push(text); }, completeWave() {} };
  director = new EndlessDirector(host);
  function advance(seconds: number) {
    state.elapsed += seconds; state.tick = Math.round(state.elapsed * 60); director.beforeInput(); director.afterInput();
  }
  director.beforeInput();
  function enter(pair?: readonly TraitId[]) {
    if (pair) {
      if (e.evolution?.pending) {
        e.evolution.pending.decision = { ...e.evolution.pending.decision, main: pair[0], traits: [...pair] };
      } else e.traits = [...pair];
    }
    advance(e.phaseUntil - state.elapsed);
    return state.targets.find(target => target.role === 'elite');
  }
  return { session, state, e, director, host, events, messages, advance, enter };
}
function resident(id: string, index: number, fission = false): Target {
  return { id, x: 80 + index % 8 * 65, y: 80 + Math.floor(index / 8) * 65, hp: 68, maxHp: 68, radius: 22,
    role: 'virus', kind: fission ? 'cluster' : 'single', traits: fission ? ['FISSION'] : [], generation: 0,
    hitUntil: 0, scanned: false, sourceId: 'old-fixture-wave' };
}
function reservation(state: GameState) {
  return state.targets.reduce((sum, target) => sum + (target.hp > 0
    ? target.traits?.includes('FISSION') && (target.generation ?? 0) === 0 ? 2 : 1
    : target.splitAt !== undefined ? target.splitPositions?.length ?? 2 : 0), 0);
}

describe('announced current-generation dual elite births', () => {
  it.each(pairs)('uses the announced ordered %s → %s pair on the first elite without a new roll', (main, companion) => {
    const f = fixture(), pair: [TraitId, TraitId] = [main, companion], elite = f.enter(pair)!;
    expect(elite).toBeDefined(); expect(elite.traits).toEqual(pair);
    expect(elite.eliteCycle).toEqual({ tactics: pair.map(trait => ENDLESS_EVOLUTION_TACTICS[trait]), index: 0 });
    expect(elite.tactic).toBe(ENDLESS_EVOLUTION_TACTICS[main]);
    expect(elite.hp).toBe(204); expect(elite.maxHp).toBe(204); expect(elite.radius).toBe(30);
    expect(elite.generation).toBe(0); expect(elite.attackReady! - elite.born!).toBeCloseTo(.35);
    expect(distance(elite, f.state.player)).toBeGreaterThanOrEqual(380);
    expect(distance(elite, f.state.player)).toBeLessThanOrEqual(480);
    const born = f.events.find(event => event.type === 'ACTOR_SPAWNED' && event.data.id === elite.id)!;
    expect(born.data).toMatchObject({ dualElite: true, traits: pair.join('+'), eliteTactics: elite.eliteCycle!.tactics.join('>') });
    expect(f.events.some(event => event.type === 'ATTACK_TELEGRAPHED' || event.type === 'ELITE_TACTIC_COMMITTED')).toBe(false);
    for (const other of f.state.targets.filter(target => target !== elite)) {
      expect(other.eliteCycle).toBeUndefined(); expect(other.traits!.length).toBeLessThanOrEqual(1);
      expect(other.hp).toBe(68); expect(other.radius).toBe(22);
      expect(other.attackReady! - other.born!).toBeCloseTo(other.tactic === 'thin-ray' ? ENDLESS_BALANCE.spawnGrace : 1.5);
    }
    observations.push({ pair, elite: structuredClone(elite), born, reservation: reservation(f.state) });
  });

  it.each([5, 10, 15, 19, 20, 21, 25, 30])('limits the new birth rule to the first elite from wave20 (wave %i)', wave => {
    const f = fixture(wave), elite = f.enter(['MIMIC', 'CARAPACE']);
    const shouldCycle = wave >= 20 && wave % 5 === 0;
    expect(!!elite?.eliteCycle).toBe(shouldCycle);
    if (elite) {
      expect(elite.traits!.length).toBe(shouldCycle ? 2 : 1);
      expect(elite.hp).toBe(Math.min(204, 136 + Math.floor(wave / 10) * 34));
      expect(elite.attackReady! - elite.born!).toBeCloseTo(.35);
    }
    expect(f.e.totalToSpawn).toBe(Math.min(28, 6 + wave * 2));
    expect(f.e.batchSchedule.flatMap(batch => batch.roles).filter(role => role === 'elite')).toHaveLength(wave % 5 === 0 ? wave >= 30 ? 2 : 1 : 0);
    if (wave === 30) {
      f.advance(f.e.nextSpawnAt - f.state.elapsed);
      const elites = f.state.targets.filter(target => target.role === 'elite');
      expect(elites).toHaveLength(2); expect(elites[0].eliteCycle).toBeDefined(); expect(elites[1].eliteCycle).toBeUndefined();
      expect(elites[1].traits).toEqual(['CARAPACE']); expect(elites[1].hp).toBe(204);
      expect(elites[1].attackReady! - elites[1].born!).toBeCloseTo(.35);
    }
  });

  it('announces both actions, abilities, costs and base counters for eight seconds before applying or spawning', () => {
    const f = fixture(), pending = structuredClone(f.e.evolution!.pending!), pair = pending.decision.traits;
    const cycle = createEliteTacticCycle(pair)!;
    expect(pending.appliesAt - pending.warnedAt).toBe(8);
    expect(f.e.traits).toEqual(['CARAPACE', 'MIMIC']); expect(f.state.targets).toEqual([]);
    const warning = f.events.find(event => event.type === 'ENDLESS_WAVE_WARNING')!;
    expect(warning.data).toMatchObject({ duration: 8, dualElite: true, eliteTactics: cycle.tactics.join('>'), traits: pair.join('+') });
    const message = f.messages.at(-1)!;
    expect(message).toContain('主招'); expect(message).toContain('→'); expect(message).toContain('伴招');
    for (const trait of pair) for (const copy of [TRAITS[trait].name, TRAITS[trait].ability, TRAITS[trait].cost, TRAITS[trait].counter]) expect(message).toContain(copy);
    for (const tactic of cycle.tactics) expect(message).toContain(ENEMY_TACTIC_INFO[tactic].counter);
    f.advance(8 - 1 / 60); expect(f.state.targets).toEqual([]); expect(f.e.traits).toEqual(['CARAPACE', 'MIMIC']);
    expect(f.e.evolution!.pending).toEqual(pending);
    f.advance(1 / 60); const elite = f.state.targets.find(target => target.role === 'elite')!;
    expect(f.e.traits).toEqual(pair); expect(elite.traits).toEqual(pair); expect(elite.eliteCycle?.tactics).toEqual(cycle.tactics);
    const applied = f.events.find(event => event.type === 'ENDLESS_EVOLUTION_APPLIED')!;
    const birth = f.events.find(event => event.type === 'ACTOR_SPAWNED')!;
    expect(applied.tick - warning.tick).toBe(480); expect(f.events.indexOf(applied)).toBeLessThan(f.events.indexOf(birth));
    observations.push({ warning, message, applied, birth });
  });

  it('holds the first promised FISSION duet at the parent cap, then resumes the same slot after a parent is removed', () => {
    const f = fixture(); f.state.targets = Array.from({ length: 4 }, (_, index) => resident(`parent-${index}`, index, true));
    f.enter(['MIMIC', 'FISSION']);
    const queue = { remaining: f.e.remainingToSpawn, member: f.e.batchMemberIndex, serial: f.e.spawnSerial, elites: f.e.eliteRemaining };
    expect(f.state.targets).toHaveLength(4); expect(queue).toEqual({ remaining: 28, member: 0, serial: 0, elites: 1 });
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toEqual([]); expect(f.e.nextSpawnAt - f.state.elapsed).toBeCloseTo(.25);
    f.advance(.25); expect(f.state.targets).toHaveLength(4); expect(f.e.remainingToSpawn).toBe(queue.remaining);
    f.state.targets[0].hp = 0; // Explicit released reservation; actual death/split is covered below.
    f.advance(.25); const elite = f.state.targets.find(target => target.role === 'elite')!;
    expect(elite).toBeDefined(); expect(elite.traits).toEqual(['MIMIC', 'FISSION']); expect(elite.eliteCycle).toBeDefined();
    expect(f.e.remainingToSpawn).toBeLessThan(queue.remaining); expect(reservation(f.state)).toBeLessThanOrEqual(24);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED' && event.data.dualElite === true)).toHaveLength(1);
  });

  it('reserves two population places for FISSION in either position and retries without demoting or skipping its elite', () => {
    for (const pair of [['FISSION', 'MIMIC'], ['MIMIC', 'FISSION']] as [TraitId, TraitId][]) {
      const f = fixture(); f.state.targets = Array.from({ length: 23 }, (_, index) => resident(`resident-${index}`, index));
      f.enter(pair); expect(f.state.targets).toHaveLength(23); expect(f.e.remainingToSpawn).toBe(28); expect(f.e.batchMemberIndex).toBe(0);
      f.state.targets[0].hp = 0; f.advance(.25);
      const elite = f.state.targets.find(target => target.role === 'elite')!;
      expect(elite.traits).toEqual(pair); expect(elite.eliteCycle).toBeDefined();
      expect(f.e.remainingToSpawn).toBe(27); expect(f.e.batchMemberIndex).toBe(1); expect(reservation(f.state)).toBe(24);
      expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(1);
    }
  });

  it('keeps the ordinary legacy FISSION fallback when four other parents already occupy the reservation', () => {
    const f = fixture(); f.enter(['CARAPACE', 'FISSION']);
    f.state.targets = Array.from({ length: 4 }, (_, index) => resident(`parent-${index}`, index, true));
    f.e.batchSchedule[1].roles = ['ordinary']; f.e.batchIndex = 1; f.e.batchMemberIndex = 0;
    f.e.totalToSpawn = 28; f.e.remainingToSpawn = 25; f.e.nextSpawnAt = f.state.elapsed;
    f.director.afterInput();
    const born = f.state.targets.find(target => target.sourceId === 'endless:wave:20')!;
    expect(born).toBeDefined(); expect(born.traits).toEqual([]); expect(born.eliteCycle).toBeUndefined(); expect(born.hp).toBe(68);
  });

  it('counts pending real child places before admitting the FISSION duet and resumes only after two places are free', () => {
    const f = fixture();
    const pending = { ...resident('pending-parent', 0, true), hp: 0, sourceId: 'endless:wave:20', splitAt: 100,
      splitPositions: [{ x: 80, y: 80 }, { x: 110, y: 80 }] };
    f.state.targets = [pending, ...Array.from({ length: 22 }, (_, index) => resident(`resident-${index}`, index + 1))];
    f.enter(['FISSION', 'CARAPACE']);
    expect(f.e.pendingChildren).toBe(2); expect(reservation(f.state)).toBe(24);
    expect(f.e.remainingToSpawn).toBe(28); expect(f.e.batchMemberIndex).toBe(0);
    f.state.targets[1].hp = 0; f.advance(.25);
    expect(f.e.remainingToSpawn).toBe(28); expect(reservation(f.state)).toBe(23);
    f.state.targets[2].hp = 0; f.advance(.25);
    expect(f.e.remainingToSpawn).toBe(27); expect(f.e.pendingChildren).toBe(2); expect(reservation(f.state)).toBe(24);
    const elite = f.state.targets.find(target => target.role === 'elite')!;
    expect(elite.traits).toEqual(['FISSION', 'CARAPACE']); expect(elite.eliteCycle).toBeDefined();
  });

  it('reproduces the announced generation, ordered cycle, queue and positions for the same seed and boundary inputs', () => {
    const a = fixture(), b = fixture(); a.enter(); b.enter();
    expect(a.events).toEqual(b.events); expect(a.messages).toEqual(b.messages);
    expect(a.e).toEqual(b.e); expect(a.state.targets).toEqual(b.state.targets);
  });

  it('retains finite wave births and exactly one dual elite while draining the unchanged wave30 queue', () => {
    const f = fixture(30); f.enter(['CARAPACE', 'MIMIC']);
    for (let batch = 0; batch < 15 && f.e.remainingToSpawn > 0; batch++) {
      f.state.targets = []; f.advance(Math.max(0, f.e.nextSpawnAt - f.state.elapsed));
    }
    expect(f.e.remainingToSpawn).toBe(0);
    const births = f.events.filter(event => event.type === 'ACTOR_SPAWNED');
    expect(births).toHaveLength(28); expect(births.filter(event => event.data.role === 'elite')).toHaveLength(2);
    expect(births.filter(event => event.data.dualElite === true)).toHaveLength(1);
    expect(new Set(births.map(event => event.data.id)).size).toBe(28);
  });

  it('does not continue an old batch or outer clear after its birth callback restarts or pauses the session', () => {
    for (const action of ['restart', 'pause'] as const) {
      const session = new GameSession(71, { mode: 'endless' }); session.start(); const old = session.state;
      old.world = structuredClone(world); old.targets = [];
      Object.assign(old.endless!, { wave: 20, phase: 'combat', traits: ['CARAPACE', 'MIMIC'], eliteWave: true, remainingToSpawn: 3,
        totalToSpawn: 3, batchSchedule: [{ at: 0, sector: 0, spread: .18, roles: ['elite', 'ordinary', 'support'] }],
        batchIndex: 0, batchMemberIndex: 0, nextSpawnAt: 0, eliteRemaining: 1, supportRemaining: 1 });
      let births = 0;
      session.bus.on('event', event => { if (event.type === 'ACTOR_SPAWNED' && ++births === 1) action === 'restart' ? session.restart() : session.pause(); });
      session.step({ moveX: 0, moveY: 0, aim: old.player, fire: false });
      expect(births).toBe(1); expect(old.targets).toHaveLength(1); expect(old.endless!.remainingToSpawn).toBe(2);
      expect(old.events.some(event => event.type === 'ENDLESS_REINFORCEMENTS' || event.type === 'ENDLESS_WAVE_CLEARED')).toBe(false);
      if (action === 'restart') { expect(session.state).not.toBe(old); expect(session.state.targets).toEqual([]); expect(session.state.endless!.wave).toBe(1); }
      else { expect(session.state.phase).toBe('paused'); expect(session.state).toBe(old); }
    }
  });

  it.each(['ENDLESS_WAVE_WARNING', 'ENDLESS_EVOLUTION_WARNING', 'ENDLESS_EVOLUTION_APPLIED', 'ENDLESS_WAVE_STARTED'])('stops old warning work after a %s callback changes run or phase', boundary => {
    for (const action of ['restart', 'pause'] as const) {
      const f = fixture(), old = f.state;
      const next = new GameSession(71, { mode: 'endless' }); next.start();
      let interrupted = false;
      f.host.emit = (type, data) => {
        f.events.push({ type, data, tick: f.host.state.tick });
        if (type === boundary) {
          interrupted = true;
          if (action === 'restart') f.host.state = next.state;
          else f.host.state.phase = 'paused';
        }
      };
      f.events.splice(0); f.messages.splice(0);
      if (boundary === 'ENDLESS_WAVE_WARNING' || boundary === 'ENDLESS_EVOLUTION_WARNING') {
        Object.assign(f.e, { wave: 19, phase: 'intermission', phaseUntil: 0 });
        f.e.evolution = { history: [], recentPrimaries: [] };
      } else old.elapsed = f.e.phaseUntil;
      f.director.beforeInput();
      expect(interrupted).toBe(true); expect(f.messages).toEqual([]);
      if (boundary !== 'ENDLESS_WAVE_STARTED') expect(f.e.phase).toBe('warning');
      if (boundary === 'ENDLESS_WAVE_WARNING') expect(f.events.map(event => event.type)).toEqual(['ENDLESS_WAVE_WARNING']);
      if (boundary === 'ENDLESS_EVOLUTION_APPLIED') expect(f.events.some(event => event.type === 'ENDLESS_WAVE_STARTED')).toBe(false);
      expect(old.targets).toEqual([]); expect(next.state.targets).toEqual([]);
      if (action === 'restart') expect(next.state.endless!.wave).toBe(1);
    }
  });

  it('spawns only two generation1 children with no cycle and never splits those children again', () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start(); const state = session.state;
    state.world = structuredClone(world); Object.assign(state.player, { x: 600, y: 700 });
    Object.assign(state.tissue, { x: 1400, y: 900, hp: 100 });
    Object.assign(state.endless!, { wave: 20, phase: 'combat', remainingToSpawn: 0, traits: ['FISSION', 'MIMIC'], nextSpawnAt: 100 });
    const parent: Target = { id: 'duet-parent', x: 820, y: 700, radius: 30, hp: 34, maxHp: 204, role: 'elite', kind: 'cluster',
      traits: ['FISSION', 'MIMIC'], eliteCycle: createEliteTacticCycle(['FISSION', 'MIMIC']), tactic: 'fission-burst',
      generation: 0, sourceId: 'endless:wave:20', hitUntil: 0, scanned: false, attackReady: 100 };
    state.targets = [parent]; state.growth!.equipped = [];
    session.step({ moveX: 0, moveY: 0, aim: parent, fire: true, tool: 1 });
    expect(parent.hp).toBe(0); expect(parent.splitAt).toBeDefined();
    for (let tick = 0; tick < 49; tick++) session.step({ moveX: 0, moveY: 0, aim: parent, fire: false });
    const children = state.targets.filter(target => target.generation === 1);
    expect(children).toHaveLength(2); expect(children.every(child => !child.eliteCycle && child.hp === 22 && child.radius === 14)).toBe(true);
    for (const child of children) {
      state.cooldowns[1] = state.elapsed;
      session.step({ moveX: 0, moveY: 0, aim: child, fire: true, tool: 1 });
      expect(child.hp).toBe(0); expect(child.splitAt).toBeUndefined();
    }
    expect(state.events.filter(event => event.type === 'FISSION_WARNING')).toHaveLength(1);
    expect(state.events.filter(event => event.type === 'ACTOR_SPAWNED' && event.data.generation === 1)).toHaveLength(2);
    observations.push({ boundary: 'two actual child births and no grandchildren', children: structuredClone(children), events: structuredClone(state.events) });
  });

  it('writes one optional, explicitly scoped evidence report after the rule checks', () => {
    if (!process.env.VI_DUAL_ELITE_REPORT) return;
    mkdirSync(dirname(process.env.VI_DUAL_ELITE_REPORT), { recursive: true });
    writeFileSync(process.env.VI_DUAL_ELITE_REPORT, JSON.stringify({ scope: 'Director boundary and explicit post-growth fixtures; actual child damage through public GameSession input. Not natural card acquisition, all-campaign, browser, balance or human evidence.', observations }, null, 2), { flag: 'wx' });
  });
});
