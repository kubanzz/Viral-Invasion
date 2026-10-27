import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GameSession } from '../../src/game/session';
import { HEART_WORLD, LUNG_WORLD } from '../../src/game/organConfig';
import { distance, isLegalPosition, normalized, wallHit } from '../../src/actors/collision';
import type { GameEvent, Target, Vec, WorldGeometry } from '../../src/game/types';

const evidence: Record<string, unknown>[] = [];
const point = (value: Vec) => ({ x: +value.x.toFixed(5), y: +value.y.toFixed(5) });
const actor = (id: string, patch: Partial<Target> = {}): Target => ({ id, x: 400, y: 650, role: 'virus', kind: 'single', radius: 22,
  hp: 68, maxHp: 68, traits: [], hitUntil: 0, scanned: false, born: 0, attackReady: 0, generation: 0, sourceId: 'endless:wave:5', ...patch });
function fixture(world: WorldGeometry, goal: Vec, targets: Target[], wave = 5) {
  const session = new GameSession(130026, { mode: 'endless' }); session.start();
  const state = session.state;
  state.world = world; state.battle!.organId = world === LUNG_WORLD ? 'lung' : 'heart';
  Object.assign(state.player, goal, { hp: 1_000_000 });
  // Deliberate navigation fixture: no firing/scan, no additional cohorts or clear
  // reward, and enough durability to observe a complete stationary-goal interval.
  state.targets = targets;
  Object.assign(state.endless!, { wave, phase: 'combat', phaseUntil: 0, remainingToSpawn: 0, pendingChildren: 0,
    totalToSpawn: targets.length, spawnedIds: targets.map(target => target.id), nextSpawnAt: Infinity });
  return session;
}

function observe(name: string, session: GameSession, seconds: number) {
  const state = session.state, world = state.world!;
  const initial = state.targets.map(target => ({ ...point(target), id: target.id, hp: target.hp, radius: target.radius, role: target.role, tactic: target.tactic }));
  const goal = point(state.player), events: Array<{ type: string; at: number; data: GameEvent['data'] }> = [];
  let attackCount = 0, resolvedCount = 0, hurtCount = 0, chargeCount = 0, chargeEndedCount = 0, invalidBodyTicks = 0, firstInvalid: object | null = null;
  let firstAttackAt: number | null = null, firstAttackHasLineOfSight = false, frozenPoseChecks = 0, changedCommittedPoses = 0;
  let maximumStep = 0, minimumBodyGap = Infinity;
  const pathEverySecond: object[] = [];
  const unsubscribe = session.bus.on('event', event => {
    if (event.type === 'ATTACK_TELEGRAPHED') {
      attackCount++;
      if (firstAttackAt === null) {
        firstAttackAt = state.elapsed;
        const target = state.targets.find(item => item.id === event.data.actorId)!;
        const length = distance(target, state.player), block = wallHit(target, normalized(state.player.x - target.x, state.player.y - target.y), length, world);
        firstAttackHasLineOfSight = block === null || block >= length - state.player.radius;
      }
    }
    if (event.type === 'ENEMY_TACTIC_RESOLVED') resolvedCount++;
    if (event.type === 'PLAYER_HURT') hurtCount++;
    if (event.type === 'ENEMY_CHARGE_STARTED') chargeCount++;
    if (event.type === 'ENEMY_CHARGE_ENDED') chargeEndedCount++;
    if (['ATTACK_TELEGRAPHED', 'ENEMY_TACTIC_COMMITTED', 'ENEMY_TACTIC_RESOLVED', 'PLAYER_HURT', 'ENEMY_CHARGE_STARTED', 'ENEMY_CHARGE_ENDED'].includes(event.type) && events.length < 128) events.push({ type: event.type, at: state.elapsed, data: structuredClone(event.data) });
  });
  for (let tick = 1; tick <= seconds * 60; tick++) {
    const before = new Map(state.targets.map(target => [target.id, { x: target.x, y: target.y, attackAt: target.attackAt, attackAim: target.attackAim ? { ...target.attackAim } : undefined }]));
    session.step({ moveX: 0, moveY: 0, aim: state.player, fire: false });
    for (const target of state.targets) {
      if (!isLegalPosition(target, target.radius, world)) {
        invalidBodyTicks++;
        firstInvalid ??= { tick: state.tick, at: state.elapsed, id: target.id, position: point(target) };
      }
      const previous = before.get(target.id);
      if (!previous) continue;
      maximumStep = Math.max(maximumStep, distance(previous, target));
      if (previous.attackAt !== undefined && state.elapsed + 1e-9 < previous.attackAt) {
        frozenPoseChecks++;
        if (distance(previous, target) > 1e-9 || target.attackAt !== previous.attackAt
          || target.attackAim?.x !== previous.attackAim?.x || target.attackAim?.y !== previous.attackAim?.y) changedCommittedPoses++;
      }
    }
    for (let a = 0; a < state.targets.length; a++) for (let b = a + 1; b < state.targets.length; b++) {
      minimumBodyGap = Math.min(minimumBodyGap, distance(state.targets[a], state.targets[b]) - state.targets[a].radius - state.targets[b].radius);
    }
    if (tick % 60 === 0) pathEverySecond.push({ second: tick / 60, phase: state.phase, actors: state.targets.map(target => ({ id: target.id, ...point(target), attackAt: target.attackAt ?? null })) });
  }
  unsubscribe();
  const report = { name, scope: 'Independent injected-position fixture driven only through the actual GameSession.step and its BattleDirector; not a natural run or retention/balance evidence.',
    fixtureAdjustments: ['Player durability set to 1000000 so repeated genuine attacks do not end the observation early.', 'Extra cohort spawns disabled by initial wave budget; initial actors never killed or reset during observation.', 'No player movement, shots, Q, dash or interactions during simulation.', ...(world === LUNG_WORLD ? ['Existing lung geometry injected into the endless session harness to isolate the exact boundary case.'] : [])],
    secondsRequested: seconds, actualSeconds: state.elapsed, ticks: state.tick, phase: state.phase, world: world === LUNG_WORLD ? 'lung' : 'heart',
    goal, initial, final: state.targets.map(target => ({ id: target.id, ...point(target), hp: target.hp, radius: target.radius, role: target.role, tactic: target.tactic })),
    playerHp: state.player.hp, attackCount, resolvedCount, hurtCount, chargeCount, chargeEndedCount, firstAttackAt, firstAttackHasLineOfSight,
    invalidBodyTicks, firstInvalid, frozenPoseChecks, changedCommittedPoses, maximumStep, minimumBodyGap: Number.isFinite(minimumBodyGap) ? minimumBodyGap : null,
    within300AtEnd: state.targets.filter(target => distance(target, state.player) < 300).length, events, pathEverySecond };
  evidence.push(report);
  return report;
}

afterAll(() => {
  const output = process.env.VI_NAVIGATION_INTEGRATION_REPORT;
  if (!output) return;
  const sources = ['src/game/session.ts', 'src/game/battle.ts', 'src/game/enemyTactics.ts', 'src/actors/collision.ts', 'src/actors/enemyNavigation.ts', 'src/actors/enemyCrowd.ts', 'tests/unit/enemy-navigation.integration.test.ts'];
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    scope: 'Isolated production GameSession/BattleDirector integration fixtures, explicitly separate from natural survival-loop evidence.',
    sourceHashes: Object.fromEntries(sources.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])), cases: evidence }, null, 2), { flag: 'wx' });
});

describe('actual battle navigation integration fixtures', () => {
  it('unblocks the original heart elite wall trap through 60 seconds of actual session ticks', () => {
    const session = fixture(HEART_WORLD, { x: 850, y: 650 }, [actor('elite-regression', { role: 'elite', radius: 30, hp: 238, maxHp: 238 })]);
    const report = observe('heart-elite-original-wall-trap', session, 60);
    expect(report.actualSeconds).toBe(60); expect(report.phase).toBe('playing');
    expect(report.invalidBodyTicks).toBe(0); expect(report.attackCount).toBeGreaterThan(0); expect(report.hurtCount).toBeGreaterThan(0);
    expect(report.firstAttackAt).toBeLessThan(15); expect(report.firstAttackHasLineOfSight).toBe(true);
    expect(report.frozenPoseChecks).toBeGreaterThan(0); expect(report.changedCommittedPoses).toBe(0);
    expect(report.final[0].hp).toBe(238);
  });

  it('escapes the exact lower lung boundary trap and remains legal for 30 actual seconds', () => {
    const session = fixture(LUNG_WORLD, { x: 750, y: 1393 }, [actor('virus-2', { x: 550, y: 1393 })], 1);
    const report = observe('lung-south-boundary-original-wall-trap', session, 30);
    expect(report.actualSeconds).toBe(30); expect(report.phase).toBe('playing'); expect(report.invalidBodyTicks).toBe(0);
    expect(report.attackCount).toBeGreaterThan(0); expect(report.hurtCount).toBeGreaterThan(0);
    expect(report.firstAttackAt).toBeLessThan(15); expect(report.changedCommittedPoses).toBe(0);
    expect(report.maximumStep).toBeLessThanOrEqual(64 / 60 + 1e-7);
  });

  it('moves a thin ray around an obstructed sightline and commits and resolves a real attack', () => {
    const session = fixture(HEART_WORLD, { x: 850, y: 650 }, [actor('thin-ray-regression', { tactic: 'thin-ray' })]);
    const report = observe('thin-ray-blocked-sightline', session, 30);
    expect(report.actualSeconds).toBe(30); expect(report.invalidBodyTicks).toBe(0);
    expect(report.firstAttackAt).toBeLessThan(15); expect(report.firstAttackHasLineOfSight).toBe(true);
    expect(report.events.some(event => event.type === 'ENEMY_TACTIC_COMMITTED' && event.data.tactic === 'thin-ray')).toBe(true);
    expect(report.resolvedCount).toBeGreaterThan(0); expect(report.hurtCount).toBeGreaterThan(0);
    expect(report.changedCommittedPoses).toBe(0);
  });

  it('keeps a 24-body obstacle queue legal and spaced without changing or deleting its actors', () => {
    const targets = Array.from({ length: 24 }, (_, index) => actor(`queue-${index}`, { x: 300 + index % 4 * 52, y: 480 + Math.floor(index / 4) * 52 }));
    const session = fixture(HEART_WORLD, { x: 1050, y: 650 }, targets, 1);
    const report = observe('twenty-four-body-fold-queue', session, 60);
    expect(report.actualSeconds).toBe(60); expect(report.phase).toBe('playing'); expect(report.invalidBodyTicks).toBe(0);
    expect(report.final).toHaveLength(24); expect(report.final.map(target => target.id).sort()).toEqual(targets.map(target => target.id).sort());
    expect(report.final.every(target => target.hp === 68)).toBe(true);
    expect(report.minimumBodyGap!).toBeGreaterThanOrEqual(4 - 1e-6);
    expect(report.maximumStep).toBeLessThanOrEqual(64 / 60 * 1.25 + 1e-7);
    expect(report.attackCount).toBeGreaterThan(0); expect(report.changedCommittedPoses).toBe(0);
  });

  it('preserves actual charge commitments and freezes windup, rush and recovery through pause', () => {
    const target = actor('charge-pause', { x: 1100, y: 650, tactic: 'crystal-charge', traits: ['CARAPACE'], role: 'elite', radius: 30 });
    const session = fixture(HEART_WORLD, { x: 1500, y: 650 }, [target]), state = session.state;
    const idle = () => session.step({ moveX: 0, moveY: 0, aim: state.player, fire: false });
    let starts = 0, ends = 0, hits = 0;
    const unsubscribe = session.bus.on('event', event => {
      if (event.type === 'ENEMY_CHARGE_STARTED') starts++;
      if (event.type === 'ENEMY_CHARGE_ENDED') ends++;
      if (event.type === 'PLAYER_HURT' && event.data.actorId === target.id) hits++;
    });
    const pauseCheck = () => {
      session.pause(); const paused = structuredClone(state);
      for (let attempt = 0; attempt < 120; attempt++) idle();
      expect(state).toEqual(paused); session.resume();
      return { tick: paused.tick, elapsed: paused.elapsed, position: point(target), attempts: 120, unchanged: true };
    };
    idle(); expect(target.attackPlan?.kind).toBe('crystal-charge');
    const windupPlan = structuredClone(target.attackPlan), windupPause = pauseCheck();
    const start = point(target);
    while (!target.charge && state.tick < 120) {
      idle();
      if (!target.charge) { expect(point(target)).toEqual(start); expect(target.attackPlan).toEqual(windupPlan); }
    }
    expect(target.charge).toBeDefined();
    const frozenCharge = structuredClone(target.charge!), rushPause = pauseCheck();
    while (target.charge && state.tick < 240) {
      const before = { x: target.x, y: target.y }; idle();
      expect(isLegalPosition(target, target.radius, HEART_WORLD)).toBe(true);
      expect(distance(before, target)).toBeLessThanOrEqual(520 / 60 + 1e-7);
      if (target.charge) {
        const { hitPlayer: _player, hitTissue: _tissue, ...actual } = target.charge;
        const { hitPlayer: _originalPlayer, hitTissue: _originalTissue, ...original } = frozenCharge;
        expect(actual).toEqual(original);
      }
    }
    expect(starts).toBe(1); expect(ends).toBe(1); expect(hits).toBe(1);
    expect(target.recoverUntil).toBeGreaterThan(state.elapsed);
    const recoveryPause = pauseCheck(), end = point(target);
    for (let tick = 0; tick < 30; tick++) idle();
    expect(point(target)).toEqual(end); expect(target.recoverUntil).toBeGreaterThan(state.elapsed);
    unsubscribe();
    evidence.push({ name: 'actual-charge-windup-rush-recovery-pause', scope: 'Independent actual GameSession fixture with initial positions and boosted durability; not a natural loop.',
      source: 'GameSession.step / pause / resume; BattleDirector special commitment and charge movement', windupPlan, frozenCharge, windupPause, rushPause, recoveryPause, starts, ends, hits, finalPosition: point(target), actualSeconds: state.elapsed });
  });

  it('keeps a real wall-adjacent charge body legal before, during and after its rush', () => {
    const session = fixture(LUNG_WORLD, { x: 750, y: 1393 }, [actor('charge-wall', { x: 550, y: 1393, tactic: 'crystal-charge', traits: ['CARAPACE'] })], 1);
    const report = observe('charge-lung-south-boundary', session, 30);
    expect(report.actualSeconds).toBe(30); expect(report.invalidBodyTicks).toBe(0);
    expect(report.chargeCount).toBeGreaterThan(0); expect(report.chargeEndedCount).toBeGreaterThan(0);
    // The first rush can terminate exactly on the stationary player's center.
    // Recovery must lead to a new threat instead of a permanent zero-vector idle.
    expect(report.attackCount).toBeGreaterThan(1); expect(report.hurtCount).toBeGreaterThan(1);
    expect(report.maximumStep).toBeLessThanOrEqual(520 / 60 + 1e-7);
    expect(report.changedCommittedPoses).toBe(0);
  });
});
