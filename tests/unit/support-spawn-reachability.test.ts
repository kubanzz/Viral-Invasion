import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { GameSession } from '../../src/game/session';
import { EndlessDirector } from '../../src/game/endless';
import { distance, isLegalPosition, normalized, wallHit } from '../../src/actors/collision';
import type { EndlessBatch, EndlessHost, EndlessSpawnRole } from '../../src/game/endlessTypes';
import type { EnemyTactic } from '../../src/game/enemyTacticsTypes';
import type { GameEvent, Vec } from '../../src/game/types';

const evidence: object[] = [];
const point = (p: Vec) => ({ x: p.x, y: p.y });
function fixture(seed: number, wave: number) {
  const session = new GameSession(seed, { mode: 'endless' }); session.start();
  const state = session.state;
  Object.assign(state.player, { x: 105, y: 650 });
  Object.assign(state.endless!, { wave: wave - 1, phase: 'intermission', phaseUntil: 0 });
  const events: GameEvent[] = []; let director: EndlessDirector;
  const host: EndlessHost = { state, emit(type, data) { const event = { type, data, tick: state.tick }; events.push(structuredClone(event)); director.recordEvent(event); }, effect() {}, message() {}, completeWave() {} };
  director = new EndlessDirector(host); director.beforeInput();
  expect(state.endless!.wave).toBe(wave);
  const enter = () => { state.elapsed = state.endless!.phaseUntil; state.tick = Math.round(state.elapsed * 60); director.beforeInput(); director.afterInput(); };
  return { session, state, director, events, enter };
}
const visible = (from: Vec, to: Vec, radius: number, f: ReturnType<typeof fixture>) => {
  const length = distance(from, to), block = wallHit(from, normalized(to.x - from.x, to.y - from.y), length, f.state.world);
  return block === null || block >= length - radius;
};
type SpawnProbe = { spawnPosition(serial: number, radius: number, role: EndlessSpawnRole, tactic: EnemyTactic, batch: EndlessBatch, member: number): Vec | undefined };

afterAll(() => {
  const output = process.env.VI_SUPPORT_REACHABILITY_REPORT;
  if (!output) return;
  const sources = ['src/game/endless.ts', 'src/game/battle.ts', 'src/game/enemyTactics.ts', 'src/actors/enemyNavigation.ts', 'src/actors/collision.ts', 'tests/unit/support-spawn-reachability.test.ts'];
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'Isolated director fixtures, not natural survival or player evidence. No private rule replacement; wave/start/cursor fixtures are explicit.',
    sourceHashes: Object.fromEntries(sources.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])), cases: evidence }, null, 2), { flag: 'wx' });
});

describe('corrosion admission reachability without permanent finite-queue stalls', () => {
  it('admits the legacy seed19 wave16 serial5 geometric witness without pretending it is the new second support slot', () => {
    const f = fixture(19, 16), s = f.state, batch = s.endless!.batchSchedule[1];
    expect(batch.sector).toBe(7); s.endless!.batchIndex = 1;
    const probe = f.director as unknown as SpawnProbe;
    const candidate = probe.spawnPosition(5, 22, 'support', 'mimic-corrosion', batch, 2);
    const repeat = probe.spawnPosition(5, 22, 'support', 'mimic-corrosion', batch, 2);
    const ray = probe.spawnPosition(5, 22, 'support', 'thin-ray', batch, 2);
    evidence.push({ name: 'legacy-wave16-seed19-serial5-geometric-witness', fixture: 'Original 3b second-support geometric witness only. This does not label serial5 as a support in the new 2/8/14 profile.',
      seed: 19, wave: 16, serial: 5, batchIndex: 1, sector: batch.sector, roles: batch.roles, player: point(s.player), tissue: point(s.tissue), candidate: candidate ?? null, repeat: repeat ?? null, pointShotControl: ray ?? null });
    expect(candidate).toBeDefined(); expect(repeat).toEqual(candidate);
    expect(isLegalPosition(candidate!, 22, s.world)).toBe(true);
    expect(distance(candidate!, s.player)).toBeGreaterThanOrEqual(380);
    expect(distance(candidate!, s.player)).toBeLessThanOrEqual(500);
    expect(visible(s.player, candidate!, 22, f)).toBe(true);
  });

  it('advances the genuine existing corrosion elite queue at wave15 seed47 instead of retrying serial0 forever', () => {
    const f = fixture(47, 15), e = f.state.endless!;
    expect(e.traits[0]).toBe('MIMIC'); expect(e.batchSchedule[0].roles[0]).toBe('elite');
    const before = { remaining: e.remainingToSpawn, serial: e.spawnSerial };
    f.enter(); const attempts: object[] = [];
    for (let retry = 0; retry < 12; retry++) {
      attempts.push({ elapsed: f.state.elapsed, serial: e.spawnSerial, remaining: e.remainingToSpawn, batch: e.batchIndex, member: e.batchMemberIndex });
      f.state.elapsed += .25; f.state.tick += 15; f.director.beforeInput(); f.director.afterInput();
    }
    const born = f.events.filter(event => event.type === 'ACTOR_SPAWNED');
    evidence.push({ name: 'existing-wave15-seed47-corrosion-elite-real-director-queue', fixture: 'Only starting wave/player are set before the real director executes all admission/retry rules. No forced tactic or private replacement.',
      seed: 47, wave: 15, player: point(f.state.player), tissue: point(f.state.tissue), before, after: { remaining: e.remainingToSpawn, serial: e.spawnSerial }, attempts, births: born,
      actors: f.state.targets.map(target => ({ id: target.id, role: target.role, tactic: target.tactic, ...point(target) })) });
    expect(e.spawnSerial).toBeGreaterThan(before.serial); expect(born.length).toBeGreaterThan(0);
    expect(before.remaining - e.remainingToSpawn).toBe(born.length);
    expect(e.spawnSerial - before.serial).toBe(born.length);
    const elite = f.state.targets.find(target => target.role === 'elite');
    expect(elite?.tactic).toBe('mimic-corrosion');
    expect(isLegalPosition(elite!, elite!.radius, f.state.world)).toBe(true);
    expect(visible(f.state.player, elite!, elite!.radius, f)).toBe(true);
    expect(f.state.targets.filter(target => target.hp > 0).length).toBeLessThanOrEqual(24);
  });

  it.each([
    { seed: 18, wave: 16, serial: 14, role: 'virus' as const },
    { seed: 1, wave: 18, serial: 8, role: 'virus' as const },
    { seed: 47, wave: 15, serial: 0, role: 'elite' as const },
  ])('admits and genuinely navigates corrosion seed $seed wave $wave serial $serial without firing through tissue cover', scenario => {
    const f = fixture(scenario.seed, scenario.wave), s = f.state, e = s.endless!;
    // Independent longevity fixture only. There is no firing/Q, forced kill,
    // arbitrary timer advance or post-birth movement/write of an actor.
    s.player.hp = 1_000_000; s.tissue.hp = s.tissue.maxHp = 1_000_000;
    const scheduledSlots = e.batchSchedule.flatMap(batch => batch.roles).flatMap((role, index) => role === 'support' ? [index] : []);
    if (scenario.wave >= 16) expect(scheduledSlots).toEqual([2, 8, 14]);
    const births: Array<{ id: string; serial: number; tactic: unknown; role: unknown; position: Vec }> = [];
    let targetId: string | null = null, birth: object | null = null, committed: object | null = null;
    let blockedTicks = 0, illegalTicks = 0, maxPopulation = 0, maxReservedPopulation = 0, maxConcurrent = 0;
    const paths: object[] = [];
    const unsubscribe = f.session.bus.on('event', event => {
      if (event.type === 'ACTOR_SPAWNED') {
        const target = s.targets.find(target => target.id === event.data.id)!;
        const serial = e.spawnSerial - 1;
        births.push({ id: target.id, serial, tactic: event.data.tactic, role: event.data.role, position: point(target) });
        if (serial === scenario.serial && target.role === scenario.role && target.tactic === 'mimic-corrosion') {
          targetId = target.id;
          birth = { id: target.id, serial, at: s.elapsed, position: point(target), role: target.role, radius: target.radius, hp: target.hp, traits: target.traits,
            legal: isLegalPosition(target, target.radius, s.world), playerDistance: distance(s.player, target),
            playerCanShoot: visible(s.player, target, target.radius, f), tissueVisible: visible(target, s.tissue, s.tissue.radius, f), remaining: e.remainingToSpawn };
        }
      }
      if (event.type === 'ENEMY_TACTIC_COMMITTED' && event.data.actorId === targetId) {
        const target = s.targets.find(target => target.id === targetId)!;
        committed ??= { at: s.elapsed, event: structuredClone(event), position: point(target), tissueVisible: visible(target, s.tissue, s.tissue.radius, f), distanceToTissue: distance(target, s.tissue) };
      }
    });
    for (let tick = 0; tick < 50 * 60 && !committed && s.phase === 'playing'; tick++) {
      f.session.step({ moveX: 0, moveY: 0, aim: s.tissue, fire: false });
      const live = s.targets.filter(target => target.hp > 0);
      maxPopulation = Math.max(maxPopulation, live.length);
      const reserved = live.reduce((sum, target) => sum + (target.traits?.includes('FISSION') && (target.generation ?? 0) === 0 && target.role !== 'source' && target.role !== 'core' ? 2 : 1), 0)
        + s.targets.filter(target => target.hp <= 0 && target.splitAt !== undefined).reduce((sum, target) => sum + (target.splitPositions?.length ?? 2), 0);
      maxReservedPopulation = Math.max(maxReservedPopulation, reserved);
      maxConcurrent = Math.max(maxConcurrent, live.filter(target => target.attackAt !== undefined || target.charge !== undefined).length);
      for (const target of live) if (!isLegalPosition(target, target.radius, s.world)) illegalTicks++;
      const target = live.find(target => target.id === targetId);
      if (target && !visible(target, s.tissue, s.tissue.radius, f)) {
        blockedTicks++;
        expect(target.attackPlan).toBeUndefined(); expect(target.attackAt).toBeUndefined();
      }
      if (target && s.tick % 60 === 0) paths.push({ at: s.elapsed, position: point(target), tissueVisible: visible(target, s.tissue, s.tissue.radius, f) });
    }
    unsubscribe();
    evidence.push({ name: `actual-corrosion-admission-${scenario.wave}-${scenario.seed}-${scenario.serial}`, scenario, scheduledSlots,
      fixture: 'Wave and player start injected before real GameSession.step. Player/tissue durability raised to prevent early termination; no player attacks or actor state rewrites. This is not natural survival evidence.',
      birth, committed, births, actualSeconds: s.elapsed, phase: s.phase, blockedTicks, illegalTicks, maxPopulation, maxReservedPopulation, maxConcurrent,
      remaining: e.remainingToSpawn, spawnSerial: e.spawnSerial, totalToSpawn: e.totalToSpawn, paths });
    expect(birth).not.toBeNull(); expect(committed).not.toBeNull();
    const arrived = birth as unknown as { legal: boolean; playerDistance: number; playerCanShoot: boolean; tissueVisible: boolean };
    expect(arrived.legal).toBe(true); expect(arrived.playerCanShoot).toBe(true); expect(arrived.tissueVisible).toBe(false);
    expect(arrived.playerDistance).toBeGreaterThanOrEqual(380); expect(arrived.playerDistance).toBeLessThanOrEqual(scenario.role === 'elite' ? 480 : 500);
    expect((committed as unknown as { tissueVisible: boolean; distanceToTissue: number }).tissueVisible).toBe(true);
    expect((committed as unknown as { distanceToTissue: number }).distanceToTissue).toBeLessThanOrEqual(650 + 1e-7);
    expect(blockedTicks).toBeGreaterThan(0); expect(illegalTicks).toBe(0);
    expect(maxPopulation).toBeLessThanOrEqual(24); expect(maxReservedPopulation).toBeLessThanOrEqual(24); expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(e.spawnSerial).toBeGreaterThan(scenario.serial);
    expect(e.totalToSpawn - e.remainingToSpawn).toBe(births.length); expect(e.spawnSerial).toBe(births.length);
    if (scenario.role === 'virus') {
      const supports = births.filter(target => target.role === 'virus' && target.tactic !== 'melee');
      expect(supports.map(target => target.serial).every(serial => scheduledSlots.includes(serial))).toBe(true);
      expect(supports.find(target => target.serial === scenario.serial)?.tactic).toBe('mimic-corrosion');
    }
  });
});