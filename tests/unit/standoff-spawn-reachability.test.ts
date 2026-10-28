import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition, normalized, wallHit } from '../../src/actors/collision';
import { ENDLESS_BALANCE, EndlessDirector } from '../../src/game/endless';
import { endlessPacing } from '../../src/game/endlessPacing';
import type { EndlessBatch } from '../../src/game/endlessTypes';
import { enemyAttackPlan } from '../../src/game/enemyTactics';
import { HEART_WORLD, LUNG_WORLD } from '../../src/game/organConfig';
import { GameSession } from '../../src/game/session';
import type { GameEvent, Target, Vec, WorldGeometry } from '../../src/game/types';

function fixture(geometry = HEART_WORLD, position: Vec = { x: 2000, y: 1200 }) {
  const session = new GameSession(3, { mode: 'endless' }); session.start();
  const state = session.state; state.world = geometry; state.targets = [];
  Object.assign(state.player, position);
  const events: GameEvent[] = [];
  const director = new EndlessDirector({ state, emit(type, data) { events.push({ type, data, tick: state.tick }); },
    message() {}, effect() {}, completeWave() {} });
  const e = state.endless!;
  Object.assign(e, { wave: 2, phase: 'intermission', phaseUntil: 0 }); director.beforeInput();
  // The first two ordinary members were cleared; the original support slot
  // remains queued. No change to the real wave-three plan or its finite budget.
  Object.assign(e, { phase: 'combat', phaseUntil: 0, spawnSerial: 2, batchIndex: 0,
    batchMemberIndex: 2, remainingToSpawn: 10, nextSpawnAt: 0 });
  return { state, e, director, events };
}

function assertSafe(target: Target, state: ReturnType<typeof fixture>['state']) {
  const world = state.world!, gap = distance(target, state.player);
  expect(gap).toBeGreaterThanOrEqual(ENDLESS_BALANCE.minimumSpawnDistance - 1e-7);
  expect(isLegalPosition(target, target.radius, world)).toBe(true);
  for (const fold of world.obstacles) expect(distance(target, fold)).toBeGreaterThanOrEqual(target.radius + fold.radius + 2 - 1e-7);
  expect(distance(target, state.tissue)).toBeGreaterThanOrEqual(target.radius + state.tissue.radius + 40 - 1e-7);
  const block = wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), gap, world);
  expect(block === null || block >= gap - target.radius).toBe(true);
  expect(enemyAttackPlan(target, state)?.kind).toBe('thin-ray');
}

describe('bounded complete search for a finite ranged support birth', () => {
  it('resolves the actual seed-three missed-sector witness without moving the player or losing a promised birth', () => {
    const f = fixture();
    expect(f.e.batchSchedule[0]).toEqual({ at: 0, sector: 4, spread: .13, roles: ['ordinary', 'ordinary', 'support'] });
    // Before the fix, 40 real afterInput retries over 9.75 seconds left this
    // empty arena at serial2/member2/remaining10, despite a clear 580-unit point
    // at (1710, 697.705265805). This exact state must now advance immediately.
    f.director.afterInput();
    expect(f.e.remainingToSpawn).toBe(9); expect(f.e.spawnSerial).toBe(3);
    expect(f.e.batchIndex).toBe(1); expect(f.e.batchMemberIndex).toBe(0);
    expect(f.state.targets).toHaveLength(1);
    const support = f.state.targets[0]; assertSafe(support, f.state);
    expect(support.tacticPosture).toBe('standoff'); expect(support.hp).toBe(Math.round(68 * endlessPacing(f.e.wave).healthMultiplier));
    expect(distance(support, f.state.player)).toBeGreaterThanOrEqual(560 - 1e-7);
    expect(distance(support, f.state.player)).toBeLessThanOrEqual(600 + 1e-7);
    expect(support.attackReady! - support.born!).toBeCloseTo(1.5);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(1);
    const repeat = fixture(); repeat.director.afterInput();
    expect(repeat.state.targets).toEqual(f.state.targets);
    console.info('actual missed-sector witness fixed', JSON.stringify({ seed: 3, player: f.state.player,
      before: { retries: 40, elapsed: 9.75, remaining: 10, living: 0 },
      after: { position: { x: support.x, y: support.y }, gap: distance(support, f.state.player), remaining: f.e.remainingToSpawn,
        living: f.state.targets.length, posture: support.tacticPosture, grace: support.attackReady! - support.born! } }));
  });

  it('uses a safe ordinary thin ray with full birth grace when the outer ring cannot fit in the chamber', () => {
    const small: WorldGeometry = { width: 800, height: 800, bounds: { left: 20, right: 780, top: 20, bottom: 780 },
      obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    const f = fixture(small, { x: 400, y: 400 }); Object.assign(f.state.tissue, { x: 400, y: 600 });
    f.director.afterInput();
    expect(f.state.targets).toHaveLength(1); const support = f.state.targets[0]; assertSafe(support, f.state);
    expect(support.tacticPosture).toBeUndefined(); expect(support.tactic).toBe('thin-ray');
    expect(distance(support, f.state.player)).toBeLessThanOrEqual(500 + 1e-7);
    expect(support.attackReady! - support.born!).toBeCloseTo(1.5);
    expect(f.e.remainingToSpawn).toBe(9); expect(f.e.supportRemaining).toBe(0);
    expect(f.events.find(event => event.type === 'ACTOR_SPAWNED')?.data.posture).toBe('pursuit');
  });

  it('keeps a population-blocked support reserved and spawns it once a real body slot opens', () => {
    const f = fixture();
    f.state.targets = Array.from({ length: ENDLESS_BALANCE.maximumActors }, (_, index) => ({ id: `blocker-${index}`,
      x: 130 + index % 6 * 60, y: 200 + Math.floor(index / 6) * 60, radius: 22, hp: 68, maxHp: 68,
      kind: 'single' as const, role: 'virus' as const, hitUntil: 0, scanned: false, traits: [] }));
    f.director.afterInput();
    expect(f.e.remainingToSpawn).toBe(10); expect(f.e.spawnSerial).toBe(2); expect(f.e.batchMemberIndex).toBe(2);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(0);
    f.state.targets[0].hp = 0; f.state.elapsed = .25; f.state.tick = 15; f.director.afterInput();
    expect(f.e.remainingToSpawn).toBe(9); expect(f.e.spawnSerial).toBe(3);
    expect(f.state.targets.filter(target => target.hp > 0)).toHaveLength(ENDLESS_BALANCE.maximumActors);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(1);
  });

  it('never invents a birth or skips its budget when no 340-unit legal point exists', () => {
    const tiny: WorldGeometry = { width: 300, height: 300, bounds: { left: 20, right: 280, top: 20, bottom: 280 },
      obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    const f = fixture(tiny, { x: 150, y: 150 }); Object.assign(f.state.tissue, { x: 150, y: 220 });
    for (let retry = 0; retry < 4; retry++) { f.state.elapsed = retry * .25; f.state.tick = retry * 15; f.director.afterInput(); }
    expect(f.state.targets).toHaveLength(0); expect(f.e.remainingToSpawn).toBe(10);
    expect(f.e.spawnSerial).toBe(2); expect(f.e.batchMemberIndex).toBe(2); expect(f.e.supportRemaining).toBe(1);
    expect(f.events.filter(event => event.type === 'ACTOR_SPAWNED')).toHaveLength(0);
    f.state.world = HEART_WORLD; Object.assign(f.state.player, { x: 2000, y: 1200 }); Object.assign(f.state.tissue, { x: 1200, y: 900 });
    f.state.elapsed = 1; f.state.tick = 60; f.director.afterInput();
    expect(f.state.targets).toHaveLength(1); expect(f.e.remainingToSpawn).toBe(9); assertSafe(f.state.targets[0], f.state);
  });

  it('finds safe deterministic births on a sparse legal grid in both real worlds and all eight sectors', () => {
    type Probe = { spawnPosition(serial: number, radius: number, role: 'support', tactic: 'thin-ray', batch: EndlessBatch, member: number, standoff: boolean): Vec | undefined };
    const summary: Record<string, { samples: number; standoff: number; fallback: number }> = {};
    for (const [name, geometry] of [['heart', HEART_WORLD], ['lung', LUNG_WORLD]] as const) {
      const f = fixture(geometry), b = geometry.bounds, count = summary[name] = { samples: 0, standoff: 0, fallback: 0 };
      for (const x of [b.left + 19, (b.left + b.right) / 2, b.right - 19]) for (const y of [b.top + 19, (b.top + b.bottom) / 2, b.bottom - 19]) {
        if (!isLegalPosition({ x, y }, 19, geometry)) continue;
        Object.assign(f.state.player, { x, y });
        for (const seed of [3, 71]) for (let sector = 0; sector < 8; sector++) {
          f.state.seed = seed;
          const probe = f.director as unknown as Probe, batch = { ...f.e.batchSchedule[0], sector };
          const position = probe.spawnPosition(2, 22, 'support', 'thin-ray', batch, 2, true);
          expect(position, `${name}/${seed}/${x}/${y}/${sector}`).toBeDefined();
          expect(probe.spawnPosition(2, 22, 'support', 'thin-ray', batch, 2, true)).toEqual(position);
          const remote = distance(position!, f.state.player) >= 560 - 1e-7;
          const target: Target = { ...position!, id: 'sample', radius: 22, hp: 68, maxHp: 68, kind: 'single',
            role: 'virus', hitUntil: 0, scanned: false, tactic: 'thin-ray', ...(remote ? { tacticPosture: 'standoff' as const } : {}) };
          assertSafe(target, f.state); count.samples++; if (remote) count.standoff++; else count.fallback++;
        }
      }
    }
    // Controlled spawn fixtures only: this sparse sample is not an exhaustive
    // map proof, a natural run, throughput evidence or a player difficulty test.
    expect(summary.heart.samples + summary.lung.samples).toBe(288);
    console.info('sparse real-world spawn fixtures', JSON.stringify(summary));
  });
});
