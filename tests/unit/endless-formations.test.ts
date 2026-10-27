import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { initializeBattle } from '../../src/game/battle';
import { EndlessDirector, ENDLESS_BALANCE, initializeEndless } from '../../src/game/endless';
import { clipChargeEnd, enemyAttackHits, enemyAttackPlan, enemyRayEnd, segmentDistance } from '../../src/game/enemyTactics';
import { ENEMY_TACTIC_INFO } from '../../src/game/enemyTacticInfo';
import type { EnemyTactic } from '../../src/game/enemyTacticsTypes';
import type { EndlessHost } from '../../src/game/endlessTypes';
import type { GameEvent, GameState, Target, WorldGeometry } from '../../src/game/types';
import { HEART_WORLD, LUNG_WORLD } from '../../src/game/organConfig';

const openWorld: WorldGeometry = { width: 2400, height: 1600, bounds: { left: 20, right: 2380, top: 20, bottom: 1580 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };

function fixture(seed = 71, world = openWorld) {
  const state: GameState = { game: 'viral-invasion', schemaVersion: 1, seed, phase: 'playing', tick: 0, elapsed: 0,
    player: { x: 1100, y: 800, hp: 100, radius: 19, facing: 0, moving: false, dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 },
    tissue: { x: 1200, y: 900, hp: 100, maxHp: 100, radius: 43 }, targets: [], terminal: { x: 1000, y: 900 },
    tool: 1, cooldowns: { 1: 0, 2: 0, 3: 0 }, scanReady: 0, scanUntil: 0, effects: [], events: [], message: '', messageUntil: 0,
    shots: 0, hits: 0, scans: 0, dashes: 0, result: null };
  initializeBattle(state, { milestone: 'G3', encounterMode: 'fixture' }); state.world = world; initializeEndless(state);
  const events: GameEvent[] = [], completed: number[] = [], messages: string[] = [];
  let director: EndlessDirector;
  const host: EndlessHost = { state, emit(type, data) { const event = { type, data, tick: state.tick }; events.push(event); director.recordEvent(event); },
    effect() {}, message(text) { messages.push(text); }, completeWave(wave) { completed.push(wave); } };
  director = new EndlessDirector(host);
  function advance(seconds: number) { state.elapsed += seconds; state.tick++; director.beforeInput(); director.afterInput(); }
  function nextWave() {
    // A director-only phase fixture. It does not claim natural combat progression.
    state.targets = []; state.endless!.remainingToSpawn = 0; director.afterInput();
    advance(ENDLESS_BALANCE.intermissionSeconds);
    return state.endless!;
  }
  function enter(wave: number) {
    while (state.endless!.wave < wave) {
      advance(state.endless!.phaseUntil - state.elapsed);
      nextWave();
    }
    if (state.endless!.phase === 'warning') advance(state.endless!.phaseUntil - state.elapsed);
  }
  return { state, director, events, completed, messages, advance, nextWave, enter };
}

/** Director-only arrival fixture; real damage/attack acceptance is tested separately. */
function spawnRemaining(f: ReturnType<typeof fixture>): void {
  for (let batch = 0; batch < 12 && f.state.endless!.remainingToSpawn > 0; batch++) {
    for (const target of f.state.targets) target.hp = 0;
    f.advance(Math.max(0, f.state.endless!.nextSpawnAt - f.state.elapsed));
  }
  expect(f.state.endless!.remainingToSpawn).toBe(0);
}

function actor(tactic: EnemyTactic, state: GameState, patch: Partial<Target> = {}): Target {
  return { id: `test-${tactic}`, x: state.player.x - 420, y: state.player.y, hp: 136, maxHp: 136,
    radius: 30, role: tactic === 'thin-ray' || tactic === 'melee' ? 'virus' : 'elite', kind: 'single',
    traits: [], generation: 0, hitUntil: 0, scanned: false, tactic, ...patch };
}

describe('real finite challenge formations', () => {
  it('spawns a coherent front cohort and its second three-body pulse at0/.45 seconds, then leaves a real breather', () => {
    const f = fixture(); f.enter(1); const s = f.state;
    expect(s.endless!.formation).toBe('front'); expect(s.targets).toHaveLength(3);
    expect(s.endless!.batchSchedule[0].at).toBe(0); expect(s.endless!.batchSchedule[1].at).toBe(.45);
    expect(s.endless!.batchSchedule[0].sector).toBe(s.endless!.batchSchedule[1].sector);
    const angles = s.targets.map(target => Math.atan2(target.y - s.player.y, target.x - s.player.x));
    const spread = Math.max(...angles.map(angle => Math.abs(Math.atan2(Math.sin(angle - angles[1]), Math.cos(angle - angles[1])))));
    expect(spread).toBeLessThan(.3);
    f.advance(.44); expect(s.targets).toHaveLength(3); f.advance(.01); expect(s.targets).toHaveLength(6);
    expect(s.endless!.nextSpawnAt - s.elapsed).toBeGreaterThan(3);
    for (const target of s.targets) { expect(target.maxHp).toBe(68); expect(target.tactic).toBe('melee'); }
  });

  it('uses opposite directions for the two cross cohorts rather than just changing a title', () => {
    const f = fixture(); f.enter(2); const s = f.state, first = s.targets.slice();
    expect(s.endless!.formation).toBe('cross');
    expect((s.endless!.batchSchedule[1].sector - s.endless!.batchSchedule[0].sector + 8) % 8).toBe(4);
    f.advance(.7); const second = s.targets.slice(3);
    const average = (targets: Target[]) => ({ x: targets.reduce((sum, t) => sum + t.x - s.player.x, 0) / targets.length,
      y: targets.reduce((sum, t) => sum + t.y - s.player.y, 0) / targets.length });
    const a = average(first), b = average(second); expect(a.x * b.x + a.y * b.y).toBeLessThan(0);
  });

  it('gives first support8 seconds of warning, mixes it with ordinary bodies and keeps it inside clear counterattack range', () => {
    const f = fixture(); f.enter(2); f.nextWave();
    expect(f.state.endless!.wave).toBe(3); expect(f.state.endless!.warningSeconds).toBe(8);
    f.advance(7.99); expect(f.state.targets).toHaveLength(0); f.advance(.01);
    const s = f.state, support = s.targets.find(target => target.tactic === 'thin-ray')!;
    expect(s.targets).toHaveLength(3); expect(support).toBeDefined(); expect(support.traits).toEqual([]);
    expect(distance(s.player, support)).toBeGreaterThanOrEqual(380); expect(distance(s.player, support)).toBeLessThanOrEqual(500);
    expect(support.attackReady! - s.elapsed).toBeCloseTo(.2);
    expect(s.endless!.batchSchedule.flatMap(batch => batch.roles).filter(role => role === 'support')).toHaveLength(1);
    expect(s.endless!.batchSchedule.every(batch => batch.roles.some(role => role !== 'support'))).toBe(true);
    expect(enemyAttackPlan(support, s)?.kind).toBe('thin-ray');
  });

  it('clusters ordinary pack members for a single range attack while keeping their bodies separate', () => {
    const f = fixture(); f.enter(3); const s = f.state;
    expect(s.endless!.formation).toBe('fission-pack');
    const pack = s.targets.filter(target => target.tactic === 'melee'); expect(pack).toHaveLength(2);
    expect(distance(pack[0], pack[1])).toBeLessThan(130);
    expect(distance(pack[0], pack[1])).toBeGreaterThanOrEqual(pack[0].radius + pack[1].radius + 12);
    f.advance(.55); const next = s.targets.slice(3);
    expect(next).toHaveLength(3);
    const centroid = { x: next.reduce((sum, target) => sum + target.x, 0) / 3, y: next.reduce((sum, target) => sum + target.y, 0) / 3 };
    expect(next.every(target => distance(target, centroid) < 115)).toBe(true);
  });

  it('has a three-second normal gap, repeats neither a clear reward nor overdue batches, and reserves all child population', () => {
    const f = fixture(); f.enter(1); f.nextWave();
    expect(f.state.endless!.warningSeconds + ENDLESS_BALANCE.intermissionSeconds).toBe(3);
    expect(f.completed).toEqual([1]); f.director.afterInput(); expect(f.completed).toEqual([1]);
    f.advance(2); expect(f.state.targets).toHaveLength(3); f.advance(100); expect(f.state.targets).toHaveLength(6);
    expect(f.state.endless!.nextSpawnAt).toBeGreaterThan(f.state.elapsed);
    const resident = f.state.targets[0];
    f.state.targets = Array.from({ length: 20 }, (_, index) => ({ ...resident, id: `resident-${index}`, traits: index < 4 ? ['FISSION' as const] : [] }));
    const remaining = f.state.endless!.remainingToSpawn; f.advance(100);
    expect(f.state.targets).toHaveLength(20); expect(f.state.endless!.remainingToSpawn).toBe(remaining);
    expect(f.state.endless!.batchMemberIndex).toBe(0);
  });

  it('keeps every wave schedule finite, caps support roles and elite HP, and presents all three real elite tactics', () => {
    const f = fixture(17), tactics = new Set<string>();
    for (let wave = 1; wave <= 35; wave++) {
      f.enter(wave); const s = f.state, e = s.endless!;
      expect(e.batchSchedule.flatMap(batch => batch.roles)).toHaveLength(e.totalToSpawn);
      expect(e.batchSchedule.length).toBeLessThanOrEqual(10); expect(e.totalToSpawn).toBeLessThanOrEqual(28);
      expect(e.batchSchedule.flatMap(batch => batch.roles).filter(role => role === 'support').length).toBe(wave < 3 ? 0 : wave < 6 ? 1 : wave < 16 ? 2 : wave < 30 ? 3 : 4);
      if (wave % 5 === 0) {
        expect(e.warningSeconds).toBe(8);
        const elite = s.targets.find(target => target.role === 'elite')!;
        expect(elite).toBeDefined(); expect(elite.maxHp).toBeLessThanOrEqual(204);
        expect(distance(elite, s.player)).toBeGreaterThanOrEqual(380); expect(distance(elite, s.player)).toBeLessThanOrEqual(480);
        expect(elite.attackReady! - s.elapsed).toBeCloseTo(.35); tactics.add(elite.tactic!);
        expect(enemyAttackPlan(elite, s)?.windup).toBeGreaterThanOrEqual(1.2);
      }
      if (wave < 35) f.nextWave();
    }
    expect(tactics).toEqual(new Set(['crystal-charge', 'fission-burst', 'mimic-corrosion']));
  });

  it('warns for eight seconds before the first mixed support wave and names its counters without granting passive traits', () => {
    const f = fixture(71); f.enter(15); f.nextWave(); const e = f.state.endless!;
    expect(e.wave).toBe(16); expect(e.phase).toBe('warning'); expect(e.warningSeconds).toBe(8);
    expect(e.formationLabel).toContain('混编支援');
    const warning = f.messages.at(-1)!;
    for (const hint of ['混编支援', '点射', '侧闪', '离圈', 'Q']) expect(warning).toContain(hint);
    f.advance(7.99); expect(f.state.targets).toHaveLength(0); f.advance(.01); spawnRemaining(f);
    const supports = f.state.targets.filter(target => target.role === 'virus' && target.tactic !== 'melee');
    for (const support of supports) {
      expect(warning).toContain(ENEMY_TACTIC_INFO[support.tactic!].name);
      expect(support.traits).toEqual([]); expect(support.kind).toBe('single'); expect(support.maxHp).toBe(68);
    }
  });

  it('replaces finite budget slots with three or four spaced, diverse supports and preserves their legal arrivals', () => {
    for (const seed of [7, 19, 71]) for (const wave of [16, 17, 18, 29, 30, 35]) {
      const f = fixture(seed); f.enter(wave); const s = f.state, e = s.endless!;
      const slots = e.batchSchedule.flatMap((batch, batchIndex) => batch.roles.flatMap((role, member) => role === 'support' ? [batchIndex * 3 + member] : []));
      expect(slots).toEqual(wave < 30 ? [2, 8, 14] : [2, 8, 14, 20]);
      expect(e.batchSchedule.every(batch => batch.roles.filter(role => role === 'support').length <= 1)).toBe(true);
      expect(e.batchSchedule.flatMap(batch => batch.roles)).toHaveLength(28);
      spawnRemaining(f);
      const arrivals = s.targets.filter(target => target.sourceId === `endless:wave:${wave}`);
      const supports = arrivals.filter(target => target.role === 'virus' && target.tactic !== 'melee');
      expect(arrivals).toHaveLength(28); expect(supports).toHaveLength(wave < 30 ? 3 : 4); expect(e.supportRemaining).toBe(0);
      expect(supports[0].tactic).toBe('thin-ray'); if (wave >= 30) expect(supports[3].tactic).toBe('thin-ray');
      const mixed = supports.filter(target => target.tactic !== 'thin-ray').map(target => target.tactic!);
      expect(mixed).toHaveLength(2); expect(new Set(mixed).size).toBe(2);
      for (const support of supports) {
        expect(['thin-ray', 'crystal-charge', 'fission-burst', 'mimic-corrosion']).toContain(support.tactic);
        expect(support.maxHp).toBe(68); expect(support.traits).toEqual([]); expect(support.generation).toBe(0);
        expect(support.attackReady! - support.born!).toBeCloseTo(.2);
        expect(distance(s.player, support)).toBeGreaterThanOrEqual(380); expect(distance(s.player, support)).toBeLessThanOrEqual(500);
      }
      for (const elite of arrivals.filter(target => target.role === 'elite')) expect(elite.maxHp).toBeLessThanOrEqual(204);
      expect(supports[1].born! - supports[0].born!).toBeGreaterThanOrEqual(2.6 - 1e-7);
      expect(supports[2].born! - supports[1].born!).toBeGreaterThanOrEqual(2.6 - 1e-7);
    }
  });

  it('keeps support arrival choices deterministic and rotates only previously presented elite tactics', () => {
    const pairs = new Set<string>();
    for (const seed of [7, 19, 71]) {
      const taught = new Set<EnemyTactic>();
      const lesson = fixture(seed);
      for (const wave of [5, 10, 15]) { lesson.enter(wave); taught.add(lesson.state.targets.find(target => target.role === 'elite')!.tactic!); }
      expect(taught.size).toBe(3);
      for (const wave of [16, 17, 18]) {
        const a = fixture(seed), b = fixture(seed);
        for (const f of [a, b]) { f.enter(wave); spawnRemaining(f); }
        expect(a.state.endless).toEqual(b.state.endless); expect(a.state.targets).toEqual(b.state.targets); expect(a.events).toEqual(b.events);
        const mixed = a.state.targets.filter(target => target.role === 'virus' && target.tactic !== 'melee' && target.tactic !== 'thin-ray').map(target => target.tactic!);
        for (const tactic of mixed) expect(taught.has(tactic)).toBe(true);
        pairs.add(mixed.join('+'));
      }
    }
    expect(pairs.size).toBeGreaterThanOrEqual(3);
  });
});

describe('frozen, counterable special enemy attack plans', () => {
  it('does not replace legacy melee or implicit elite fixture behavior, and rejects blocked/out-of-range plans', () => {
    const f = fixture(), s = f.state;
    expect(enemyAttackPlan(actor('melee', s), s)).toBeUndefined();
    const legacy = actor('crystal-charge', s); delete legacy.tactic; expect(enemyAttackPlan(legacy, s)).toBeUndefined();
    expect(enemyAttackPlan(actor('thin-ray', s, { x: s.player.x - 600 }), s)).toBeUndefined();
    s.world = { ...openWorld, obstacles: [{ id: 'blocking-fold', x: s.player.x - 200, y: s.player.y, radius: 60 }] };
    expect(enemyAttackPlan(actor('thin-ray', s), s)).toBeUndefined();
  });

  it('freezes the support aim, shares a wall-clipped ray endpoint with rendering, and allows a perpendicular sidestep', () => {
    const f = fixture(), s = f.state, support = actor('thin-ray', s);
    const plan = enemyAttackPlan(support, s)!; expect(plan.windup).toBeGreaterThanOrEqual(1.05);
    const before = structuredClone(plan), oldPlayer = { x: s.player.x, y: s.player.y };
    expect(enemyAttackHits(plan, oldPlayer, s.player.radius, openWorld)).toBe(true);
    expect(enemyAttackHits(plan, { x: oldPlayer.x, y: oldPlayer.y + 100 }, s.player.radius, openWorld)).toBe(false);
    s.player.y += 150; support.x -= 50; expect(plan).toEqual(before);
    const wallWorld = { ...openWorld, obstacles: [{ id: 'behind-aim', x: oldPlayer.x + 75, y: oldPlayer.y, radius: 20 }] };
    const end = enemyRayEnd(plan, wallWorld);
    expect(end.x).toBeLessThan(oldPlayer.x + 75 - 20 - plan.radius);
    expect(enemyAttackHits(plan, { x: oldPlayer.x + 115, y: oldPlayer.y }, 19, wallWorld)).toBe(false);
  });

  it('clips a charge as one straight radius-safe segment at an expanded obstacle or inset boundary', () => {
    const world = { ...openWorld, obstacles: [{ id: 'fold', x: 1000, y: 800, radius: 80 }] };
    const from = { x: 600, y: 800 }, aim = { x: 1200, y: 800 }, end = clipChargeEnd(from, aim, 600, 30, world);
    expect(end.x).toBeCloseTo(889.5); expect(end.y).toBe(800);
    expect(distance(end, world.obstacles[0])).toBeGreaterThan(110);
    const edge = clipChargeEnd({ x: 2300, y: 1400 }, { x: 2500, y: 1600 }, 600, 30, openWorld);
    expect(edge.x).toBeLessThanOrEqual(openWorld.bounds.right - 30); expect(edge.y).toBeLessThanOrEqual(openWorld.bounds.bottom - 30);
    expect(segmentDistance(edge, { x: 2300, y: 1400 }, { x: 2500, y: 1600 })).toBeLessThan(1e-7);
    const f = fixture(), plan = enemyAttackPlan(actor('crystal-charge', f.state), f.state)!;
    expect(plan.recoveryExposure).toBe(2); expect(plan.chargeSpeed).toBe(520); expect(plan.chargeEnd).toBeDefined();
    expect(enemyAttackHits(plan, f.state.player, 19, openWorld)).toBe(false); // host uses only actual moved segments
  });

  it('keeps navigating at the real grazing-wall regression instead of committing a ray clipped short of a stationary player', () => {
    const f = fixture(), s = f.state;
    s.player.x = 850; s.player.y = 650;
    const support = actor('thin-ray', s, { x: 744.100218, y: 756.412423, radius: 22 });
    const freePlan = enemyAttackPlan(support, s)!; expect(freePlan).toBeDefined();
    expect(enemyAttackHits(freePlan, s.player, s.player.radius, openWorld)).toBe(true);
    s.world = HEART_WORLD;
    expect(enemyAttackHits(freePlan, s.player, s.player.radius, HEART_WORLD)).toBe(false);
    expect(enemyAttackPlan(support, s)).toBeUndefined();
  });

  it('commits a legal frozen short rush from the lung boundary overlap instead of permanently waiting on a zero-length goal', () => {
    const f = fixture(), s = f.state; s.world = LUNG_WORLD;
    s.player.x = 750; s.player.y = 1393;
    const target = actor('crystal-charge', s, { x: 750, y: 1393, radius: 22, facing: 0 });
    const plan = enemyAttackPlan(target, s)!;
    expect(plan).toBeDefined(); expect(plan.windup).toBeGreaterThanOrEqual(1.2);
    expect(distance(target, plan.chargeEnd!)).toBeGreaterThanOrEqual(30);
    expect(plan.aim).toEqual(plan.chargeEnd);
    for (let step = 0; step <= 30; step++) {
      const fraction = step / 30, point = { x: target.x + (plan.chargeEnd!.x - target.x) * fraction,
        y: target.y + (plan.chargeEnd!.y - target.y) * fraction };
      expect(point.x).toBeGreaterThanOrEqual(LUNG_WORLD.bounds.left + target.radius - 1e-7);
      expect(point.y).toBeLessThanOrEqual(LUNG_WORLD.bounds.bottom - target.radius + 1e-7);
      for (const obstacle of LUNG_WORLD.obstacles) expect(distance(point, obstacle)).toBeGreaterThanOrEqual(obstacle.radius + target.radius - 1e-7);
    }
    const frozen = structuredClone(plan); s.player.x -= 120;
    expect(plan).toEqual(frozen); expect(plan.aim).not.toEqual({ x: s.player.x, y: s.player.y });
  });

  it('locks two distinct fission circles, threatens the old player point, and returns a single boolean union', () => {
    const f = fixture(), s = f.state, plan = enemyAttackPlan(actor('fission-burst', s), s)!;
    expect(plan.landings).toHaveLength(2); expect(distance(plan.landings[0], plan.landings[1])).toBeGreaterThan(plan.radius * 2 + 20);
    expect(enemyAttackHits(plan, s.player, s.player.radius, openWorld)).toBe(true);
    expect(enemyAttackHits(plan, { x: s.player.x + 150, y: s.player.y - 150 }, 19, openWorld)).toBe(false);
    const old = structuredClone(plan.landings); s.player.x += 100; expect(plan.landings).toEqual(old);
    expect(enemyAttackHits({ ...plan, landings: [old[0], old[0]] }, old[0], 19, openWorld)).toBe(true);
  });

  it('targets tissue with an interruptible corrosion channel rather than another player-centered blast', () => {
    const f = fixture(), s = f.state, mimic = actor('mimic-corrosion', s, { x: s.tissue.x - 400, y: s.tissue.y });
    const plan = enemyAttackPlan(mimic, s)!;
    expect(plan.aim).toEqual({ x: s.tissue.x, y: s.tissue.y }); expect(plan.windup).toBe(1.8);
    expect(plan.playerDamage).toBe(0); expect(plan.tissueDamage).toBeGreaterThan(0); expect(plan.range).toBe(650);
    expect(enemyAttackHits(plan, s.tissue, s.tissue.radius, openWorld)).toBe(true);
    s.player.x += 400; expect(plan.aim).toEqual({ x: s.tissue.x, y: s.tissue.y });
  });
});
