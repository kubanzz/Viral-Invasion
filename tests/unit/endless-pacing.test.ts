import { describe, expect, it } from 'vitest';
import { endlessPacing } from '../../src/game/endlessPacing';
import { ENDLESS_BALANCE, EndlessDirector } from '../../src/game/endless';
import { GameSession } from '../../src/game/session';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { enemyAttackPlan } from '../../src/game/enemyTactics';
import type { EndlessHost } from '../../src/game/endlessTypes';
import type { GameEvent, Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };

/** Explicit director/attack fixtures, never evidence of natural player difficulty. */
function fixture(wave: number, seed = 71) {
  const session = new GameSession(seed, { mode: 'endless' }); session.start(); const state = session.state;
  state.world = structuredClone(world); state.targets = [];
  Object.assign(state.player, { x: 1100, y: 750 }); Object.assign(state.tissue, { x: 1200, y: 1050, hp: 100 });
  state.growth!.cells = []; state.growth!.beacon = null; state.growth!.ended = true;
  Object.assign(state.endless!, { wave: wave - 1, clearedWaves: wave - 1, phase: 'intermission', phaseUntil: 0,
    traits: [], evolution: { history: [], recentPrimaries: [] } });
  const events: GameEvent[] = [];
  let director: EndlessDirector;
  const host: EndlessHost = { state, emit(type, data) { const event = { type, data, tick: state.tick }; events.push(structuredClone(event)); director.recordEvent(event); },
    effect() {}, message() {}, completeWave() {} };
  director = new EndlessDirector(host);
  function advance(seconds: number) {
    state.elapsed += seconds; state.tick = Math.round(state.elapsed * 60); director.beforeInput(); director.afterInput();
  }
  director.beforeInput(); advance(state.endless!.phaseUntil - state.elapsed);
  return { session, state, events, director, advance };
}

describe('fixed pressure, growth-release and elite challenge rhythm', () => {
  it('announces two pressure/release pairs before every elite and starts the next cycle after it', () => {
    expect(Array.from({ length: 10 }, (_, i) => endlessPacing(i + 1).role))
      .toEqual(['pressure', 'release', 'pressure', 'release', 'elite', 'pressure', 'release', 'pressure', 'release', 'elite']);
    expect(endlessPacing(5)).toMatchObject({ cycle: 1, step: 5, label: '精英检验' });
    expect(endlessPacing(6)).toMatchObject({ cycle: 2, step: 1, label: '压力推进' });
  });

  it.each([1, 6, 16, 31, 101])('makes wave%i release bodies lighter and cohorts denser while the next pressure returns', wave => {
    const pressure = endlessPacing(wave), release = endlessPacing(wave + 1), next = endlessPacing(wave + 2);
    expect(release.healthMultiplier).toBeLessThan(pressure.healthMultiplier * .65);
    expect(release.speedMultiplier).toBeLessThan(pressure.speedMultiplier);
    expect(release.spawnIntervalMultiplier).toBeLessThan(pressure.spawnIntervalMultiplier);
    expect(release.budgetBonus).toBeGreaterThan(pressure.budgetBonus);
    expect(next.role).toBe('pressure'); expect(next.healthMultiplier).toBeGreaterThan(pressure.healthMultiplier);
  });

  it('keeps later health and elite checkpoints growing past the old low-wave plateau', () => {
    expect(endlessPacing(36).healthMultiplier).toBeGreaterThan(endlessPacing(31).healthMultiplier);
    expect(endlessPacing(100).eliteHealthMultiplier).toBeGreaterThan(endlessPacing(35).eliteHealthMultiplier * 20);
    expect(endlessPacing(35).eliteHealthMultiplier).toBeCloseTo(1.45 ** 6);
    expect(endlessPacing(31).healthMultiplier).toBeCloseTo(1.35 ** 6);
  });

  it('is deterministic, sanitizes malformed waves and preserves finite safe HP and bounded pursuit at extreme waves', () => {
    for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_VALUE]) expect(endlessPacing(invalid)).toEqual(endlessPacing(1));
    for (const wave of [1, 35, 100, 1000, Number.MAX_SAFE_INTEGER]) {
      const pace = endlessPacing(wave);
      expect(pace).toEqual(endlessPacing(wave));
      for (const value of Object.values(pace).filter(value => typeof value === 'number')) expect(Number.isFinite(value)).toBe(true);
      expect(Number.isSafeInteger(Math.round(170 * pace.eliteHealthMultiplier))).toBe(true);
      expect(Number.isSafeInteger(Math.round(68 * pace.healthMultiplier))).toBe(true);
      expect(64 * pace.speedMultiplier).toBeLessThan(235);
      expect(pace.spawnIntervalMultiplier).toBeGreaterThanOrEqual(.32);
      expect(pace.budgetBonus).toBeLessThanOrEqual(24);
    }
  });
});

describe('pacing reaches actual births and combat without bypassing rules', () => {
  it('spawns the announced release with lower real HP, denser finite cohorts and a later higher pressure', () => {
    const pressure = fixture(1), release = fixture(2), next = fixture(3);
    expect(pressure.state.targets[0].hp).toBe(68);
    expect(release.state.targets[0].hp).toBeLessThan(pressure.state.targets[0].hp);
    expect(next.state.targets[0].hp).toBeGreaterThan(pressure.state.targets[0].hp);
    expect(release.state.endless!.title).toContain('进化收割'); expect(next.state.endless!.title).toContain('压力推进');
    expect(release.state.endless!.batchSchedule[2].at).toBeLessThan(pressure.state.endless!.batchSchedule[2].at);
    for (const f of [pressure, release, next]) {
      expect(f.state.endless!.totalToSpawn).toBe(f.state.endless!.batchSchedule.flatMap(batch => batch.roles).length);
      expect(f.state.endless!.totalToSpawn).toBeLessThanOrEqual(ENDLESS_BALANCE.maximumWaveBudget);
      expect(f.state.targets.every(t => t.attackReady! - t.born! >= .2)).toBe(true);
    }
  });

  it('needs two actual powered primary hits on initial pressure and one after the release transition, then returns to two', () => {
    function shoot(wave: number) {
      const f = fixture(wave), s = f.state, target = s.targets[0];
      s.targets = [target]; Object.assign(target, { x: s.player.x + 200, y: s.player.y, traits: [], tactic: 'melee', attackReady: Infinity });
      Object.assign(s.endless!, { remainingToSpawn: 1, nextSpawnAt: Infinity });
      s.endlessGrowth!.ranks.power = 1; s.endlessGrowth!.level = 1;
      const hits: GameEvent[] = []; f.session.bus.on('event', e => { if (e.type === 'TARGET_HIT') hits.push(e); });
      const start = s.elapsed;
      for (let tick = 0; tick < 90 && target.hp > 0; tick++) f.session.step({ moveX: 0, moveY: 0, aim: target, fire: true, tool: 1 });
      expect(target.hp).toBe(0);
      return { hits: hits.length, seconds: s.elapsed - start };
    }
    const pressure = shoot(1), release = shoot(2), next = shoot(3);
    expect(pressure.hits).toBe(2); expect(release.hits).toBe(1); expect(next.hits).toBe(2);
    expect(release.seconds).toBeLessThan(pressure.seconds); expect(next.seconds).toBeGreaterThan(release.seconds);
  });

  it('uses the announced wave curve for real pressure and release motion', () => {
    function travel(wave: number) {
      const f = fixture(wave), s = f.state, target = s.targets[0];
      s.targets = [target]; Object.assign(target, { x: s.player.x - 400, y: s.player.y, traits: [], tactic: 'melee', attackReady: Infinity });
      Object.assign(s.endless!, { remainingToSpawn: 1, nextSpawnAt: Infinity });
      const x = target.x;
      f.session.step({ moveX: 0, moveY: 0, aim: target, fire: false });
      return target.x - x;
    }
    const pressure = travel(1), release = travel(2), later = travel(31);
    expect(pressure).toBeCloseTo(BATTLE_BALANCE.enemySpeed / 60);
    expect(release).toBeLessThan(pressure); expect(later).toBeGreaterThan(pressure);
  });

  it('preserves full heavy windup/recovery and the first elite dual cycle as durability grows', () => {
    const f = fixture(35), elite = f.state.targets.find(t => t.role === 'elite')!;
    expect(elite.hp).toBeGreaterThan(204); expect(elite.eliteCycle?.tactics).toHaveLength(2);
    const plan = enemyAttackPlan(elite, f.state);
    expect(plan).toBeDefined(); expect(plan!.windup).toBeGreaterThanOrEqual(1.2); expect(plan!.recoveryExposure).toBeGreaterThanOrEqual(1.5);
    expect(elite.attackReady! - elite.born!).toBeCloseTo(.35);
  });

  it('keeps a full reserved population blocked without extra births or a catch-up batch', () => {
    const f = fixture(101), base = f.state.targets[0];
    f.state.targets = Array.from({ length: 20 }, (_, index): Target => ({ ...base, id: `reserved-${index}`,
      x: 80 + index * 65, y: 80, traits: index < 4 ? ['FISSION'] : [], generation: 0 }));
    const remaining = f.state.endless!.remainingToSpawn, before = structuredClone(f.state.targets);
    f.advance(100); expect(f.state.targets).toEqual(before); expect(f.state.endless!.remainingToSpawn).toBe(remaining);
    expect(f.state.endless!.totalToSpawn).toBe(48);
    f.state.phase = 'paused'; const paused = structuredClone(f.state.endless); f.advance(100);
    expect(f.state.endless).toEqual(paused);
  });
});
