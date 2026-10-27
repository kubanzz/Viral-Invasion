import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ENEMY_CROWD, moveEnemyThroughCrowd, planEnemySpacing } from '../../src/actors/enemyCrowd';
import { distance, moveWithCollision } from '../../src/actors/collision';
import { BattleDirector, type BattleHost } from '../../src/game/battle';
import { BATTLE_BALANCE as B } from '../../src/game/battleConfig';
import { BALANCE, activeWorld, type GameState, type Target, type WorldGeometry } from '../../src/game/types';
import { GameSession } from '../../src/game/session';

const world: WorldGeometry = { width: 1600, height: 1600, bounds: { left: 20, right: 1580, top: 20, bottom: 1580 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, patch: Partial<Target> = {}): Target => ({ id, x: 600, y: 600, radius: 22, hp: 68, maxHp: 68, role: 'virus', kind: 'single', hitUntil: 0, scanned: false, attackReady: 1000, ...patch });
const budget = (target: Target) => B.enemySpeed * (target.traits?.includes('CARAPACE') ? B.carapaceSpeed : 1)
  * (target.traits?.includes('MIMIC') ? B.mimicSpeed : 1) * BALANCE.step * ENEMY_CROWD.separationSpeedFactor;
function relax(targets: Target[], geometry = world, ticks = 1, migrating?: (target: Target) => boolean) {
  for (let tick = 0; tick < ticks; tick++) {
    const positions = planEnemySpacing(targets, geometry, { maxStep: budget, isMigrating: migrating });
    for (const target of targets) { const point = positions.get(target.id); if (point) Object.assign(target, point); }
  }
}
const mobile = (state: GameState) => state.targets.filter(target => target.hp > 0 && target.role !== 'source' && target.role !== 'core');
function coincidentPairs(targets: Target[], tolerance = 2): number {
  let pairs = 0;
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) if (distance(targets[i], targets[j]) < tolerance) pairs++;
  return pairs;
}
function bodySpacing(targets: Target[]) {
  let overlaps = 0, minimumSurfaceGap = Infinity;
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const gap = distance(targets[i], targets[j]) - targets[i].radius - targets[j].radius;
    minimumSurfaceGap = Math.min(minimumSurfaceGap, gap); if (gap < -1e-7) overlaps++;
  }
  return { overlapPairs: overlaps, minimumSurfaceGap };
}
const positions = (targets: Target[]) => targets.map(target => ({ id: target.id, x: target.x, y: target.y })).sort((a, b) => a.id < b.id ? -1 : 1);
const withoutPositions = (targets: Target[]) => targets.map(({ x: _x, y: _y, ...body }) => body);

describe('deterministic enemy body spacing', () => {
  it('unfolds exact coincident ordinary/elite bodies without deleting, healing or changing their combat fields', () => {
    const targets = Array.from({ length: 18 }, (_, index) => actor(`crowd-${index}`, index === 0 ? { role: 'elite', radius: 30, hp: 238, maxHp: 238 } : {}));
    const before = withoutPositions(targets);
    expect(coincidentPairs(targets)).toBe(153);
    relax(targets, world, 360);
    expect(coincidentPairs(targets)).toBe(0);
    expect(bodySpacing(targets).minimumSurfaceGap).toBeGreaterThanOrEqual(ENEMY_CROWD.gap - .01);
    expect(targets).toHaveLength(18); expect(withoutPositions(targets)).toEqual(before);
    const settled = positions(targets); relax(targets, world, 180);
    for (const point of settled) expect(distance(point, targets.find(target => target.id === point.id)!)).toBeLessThan(.05);
  });

  it('uses the same snapshot result regardless of input order, including zero-distance tie breaks', () => {
    const targets = [actor('b'), actor('elite', { role: 'elite', radius: 30 }), actor('a'), actor('fixed', { role: 'source', x: 630 })];
    const first = planEnemySpacing(targets, world, { maxStep: budget });
    const reversed = planEnemySpacing(targets.slice().reverse(), world, { maxStep: budget });
    expect([...first]).toEqual([...reversed]);
    expect(positions(targets)).toEqual(positions([actor('b'), actor('elite', { role: 'elite', radius: 30 }), actor('a'), actor('fixed', { role: 'source', x: 630 })]));
  });

  it('respects per-tick displacement, obstacle footprints and world bounds beside a corner', () => {
    const geometry = { ...world, bounds: { left: 20, right: 650, top: 20, bottom: 650 }, obstacles: [{ id: 'fold', x: 150, y: 150, radius: 60 }] };
    const targets = Array.from({ length: 8 }, (_, index) => actor(`edge-${index}`, { x: 44, y: 44 }));
    for (let tick = 0; tick < 300; tick++) {
      const before = new Map(targets.map(target => [target.id, { x: target.x, y: target.y }]));
      relax(targets, geometry);
      for (const target of targets) {
        expect(distance(target, before.get(target.id)!)).toBeLessThanOrEqual(budget(target) + 1e-7);
        expect(target.x).toBeGreaterThanOrEqual(geometry.bounds.left + target.radius - 1e-7);
        expect(target.y).toBeGreaterThanOrEqual(geometry.bounds.top + target.radius - 1e-7);
        expect(target.x).toBeLessThanOrEqual(geometry.bounds.right - target.radius + 1e-7);
        expect(target.y).toBeLessThanOrEqual(geometry.bounds.bottom - target.radius + 1e-7);
        expect(distance(target, geometry.obstacles[0])).toBeGreaterThanOrEqual(geometry.obstacles[0].radius + target.radius - 1e-7);
      }
    }
    expect(coincidentPairs(targets)).toBe(0);
  });

  it('never moves committed windups, source/core or migration bodies and ignores dead bodies', () => {
    const targets = [actor('windup', { attackAt: 6, attackAim: { x: 700, y: 700 }, attackTarget: 'player' }),
      actor('source', { role: 'source' }), actor('core', { role: 'core' }), actor('carrier'), actor('waiting')];
    const fixed = structuredClone(targets.slice(0, 4));
    relax(targets, world, 90, target => target.id === 'carrier');
    expect(targets.slice(0, 4)).toEqual(fixed); expect(distance(targets[4], fixed[0])).toBeGreaterThan(2);
    expect(planEnemySpacing([actor('alone'), actor('dead', { hp: 0 })], world, { maxStep: budget }).size).toBe(0);
  });

  it('retains the exact no-neighbor static-collision trajectory and queues instead of walking into a peer', () => {
    const target = actor('alone'), delta = { x: .7, y: .4 };
    expect(moveEnemyThroughCrowd(target, delta, [target], world)).toEqual(moveWithCollision(target, delta, target.radius, world));
    const peer = actor('peer', { x: target.x + target.radius * 2 + ENEMY_CROWD.gap });
    for (let tick = 0; tick < 30; tick++) {
      const point = moveEnemyThroughCrowd(target, { x: 1, y: 0 }, [target, peer], world);
      expect(distance(point, peer)).toBeGreaterThanOrEqual(target.radius + peer.radius + ENEMY_CROWD.gap - 1e-7);
      Object.assign(target, point);
    }
  });

  it('freezes an actual pending pose and preserves same-tick player/tissue damage identities and magnitudes', () => {
    const session = new GameSession(17, { campaign: true }); session.start();
    const state = session.state; state.player.x = state.tissue.x; state.player.y = state.tissue.y;
    const point = { x: state.tissue.x - 30, y: state.tissue.y };
    state.targets = [actor('player-attack', { ...point, attackAt: .3, attackAim: { ...state.player }, attackTarget: 'player' }),
      actor('tissue-attack', { ...point, attackAt: .3, attackAim: { ...state.tissue }, attackTarget: 'tissue' }), actor('uncommitted', point)];
    const committed = structuredClone(state.targets.slice(0, 2)), hp = state.player.hp, tissue = state.tissue.hp;
    for (let tick = 0; tick < 17; tick++) session.step({ moveX: 0, moveY: 0, aim: state.tissue, fire: false });
    expect(state.targets.slice(0, 2)).toEqual(committed);
    session.step({ moveX: 0, moveY: 0, aim: state.tissue, fire: false });
    expect(state.player.hp).toBe(hp - B.playerDamage); expect(state.tissue.hp).toBe(tissue - B.tissueDamage);
    expect(state.targets.map(target => target.hp)).toEqual([68, 68, 68]);
    expect(state.events.filter(event => event.type === 'PLAYER_HURT' && event.data.actorId === 'player-attack')).toHaveLength(1);
    expect(state.events.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.actorId === 'tissue-attack')).toHaveLength(1);
  });

  it('unfolds the real v075 pressure pile through the battle movement phase without reducing its 24 living actors', () => {
    const source = 'artifacts/completion-v075/performance/attempt-1/dense-standard-state.json';
    const raw = readFileSync(source), state = JSON.parse(raw.toString()) as GameState;
    const before = structuredClone(state), originalBodies = withoutPositions(state.targets), recordedEvents = [] as { type: string; tick: number; data: object }[];
    const host: BattleHost = { state, emit(type, data) { recordedEvents.push({ type, tick: state.tick, data }); }, message() {}, effect() {}, finish() { state.phase = 'result'; } };
    const director = new BattleDirector(host), initialPairs = coincidentPairs(mobile(state));
    let frozenPoseChecks = 0;
    for (let tick = 0; tick < 240; tick++) {
      const committed = state.targets.filter(target => target.hp > 0 && target.attackAt !== undefined).map(target => structuredClone(target));
      state.tick++; state.elapsed = state.tick * BALANCE.step; director.afterInput();
      for (const pending of committed) if (state.elapsed + 1e-9 < pending.attackAt!) {
        const current = state.targets.find(target => target.id === pending.id)!;
        expect(current).toMatchObject({ x: pending.x, y: pending.y, attackAt: pending.attackAt, attackAim: pending.attackAim, attackTarget: pending.attackTarget });
        frozenPoseChecks++;
      }
    }
    expect(initialPairs).toBeGreaterThan(15); expect(coincidentPairs(mobile(state))).toBe(0);
    expect(bodySpacing(mobile(state)).minimumSurfaceGap).toBeGreaterThanOrEqual(ENEMY_CROWD.gap - .01);
    expect(frozenPoseChecks).toBeGreaterThan(0);
    expect(state.targets.filter(target => target.hp > 0)).toHaveLength(24);
    for (const target of state.targets) {
      expect(target.hp).toBe(before.targets.find(old => old.id === target.id)!.hp);
      if (target.role === 'source' || target.role === 'core') expect(before.targets.find(old => old.id === target.id)).toMatchObject({ x: target.x, y: target.y });
    }
    const output = process.env.VI_ENEMY_CROWD_REPORT ?? 'artifacts/unit-generated/enemy-crowd.json';
    if (output) {
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify({ scope: 'Unit-level replay of BattleDirector on a cloned archived real v075 state; not a new browser, full GameSession, render, throughput or acceptance run. No input/immune/campaign-controller advancement is simulated.',
        source, sourceSha256: createHash('sha256').update(raw).digest('hex'), originalTick: before.tick, finalTick: state.tick, replayTicks: 240,
        originalCoincidentPairsUnder2WorldUnits: initialPairs, finalCoincidentPairsUnder2WorldUnits: coincidentPairs(mobile(state)), originalLivingActors: before.targets.filter(target => target.hp > 0).length,
        finalLivingActors: state.targets.filter(target => target.hp > 0).length, originalPositions: positions(before.targets), finalPositions: positions(state.targets), originalBodies, acceptedPhaseEvents: recordedEvents,
        originalBodySpacing: bodySpacing(mobile(before)), finalBodySpacing: bodySpacing(mobile(state)), frozenPoseChecks,
        geometry: activeWorld(state), sourceHashes: Object.fromEntries(['src/actors/enemyCrowd.ts', 'src/game/battle.ts'].map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])) }, null, 2));
    }
  });
});
