import { describe, expect, it } from 'vitest';
import { distance, isLegalPosition } from '../../src/actors/collision';
import { createEndlessGrowth, endlessCombatStats } from '../../src/game/endlessGrowth';
import { GameSession } from '../../src/game/session';
import { advanceTraction, beginTraction, TRACTION_BALANCE, tractionBlastTargets, tractionMoveMultiplier } from '../../src/game/traction';
import type { Target, WorldGeometry } from '../../src/game/types';

const world: WorldGeometry = { width: 1600, height: 1100, bounds: { left: 20, right: 1580, top: 20, bottom: 1080 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const actor = (id: string, x = 800, y = 600, extra: Partial<Target> = {}): Target => ({
  id, x, y, hp: 1000, maxHp: 1000, kind: 'single', role: 'virus', radius: 20,
  hitUntil: 0, scanned: false, attackReady: 1000, ...extra,
});
function fixture(nova = 0, targets = [actor('a')]) {
  const session = new GameSession(); session.start(); const state = session.state;
  state.world = structuredClone(world); state.targets = targets;
  Object.assign(state.player, { x: 500, y: 500 });
  const growth = createEndlessGrowth(71); growth.ranks.nova = nova;
  const cast = beginTraction(state, 'cast', { x: 800, y: 500 }, endlessCombatStats(growth));
  return { state, cast, targets, growth };
}
function advance(f: ReturnType<typeof fixture>, seconds: number, holding = false, aim = { x: 800, y: 500 }) {
  f.state.elapsed = seconds;
  return advanceTraction(f.state, holding, aim, 1 / 60);
}

describe('bounded collection geometry and committed enemy rules', () => {
  it('pulls inward at cast start, keeps the smaller blast delayed and never adds control clocks', () => {
    const f = fixture(); const update = advance(f, 0, true);
    expect(update.moved).toHaveLength(1); expect(f.targets[0].y).toBeCloseTo(532);
    expect(f.cast.movedByTargetId.a).toBeCloseTo(68); expect(update.ready).toBe(false);
    expect(f.targets[0].attackReady).toBe(1000); expect(f.targets[0].recoverUntil).toBeUndefined();
    expect(advance(f, .30 - 1 / 60).ready).toBe(false);
    expect(advance(f, .30).ready).toBe(true); expect(f.targets[0].hp).toBe(1000);
  });

  it('bounds displacement across a moving guide, release and later fuse updates', () => {
    const f = fixture(3, [actor('a', 800, 630)]); let travelled = 0;
    for (let tick = 0; tick <= 70; tick++) {
      const update = advance(f, tick / 60, tick < 45, { x: 800 + tick * 5, y: 520 });
      travelled += update.moved.reduce((total, moved) => total + moved.distance, 0);
    }
    expect(travelled).toBeGreaterThan(0); expect(travelled).toBeLessThanOrEqual(70 + 1e-7);
    expect(f.cast.movedByTargetId.a).toBeCloseTo(travelled);
    expect(advance(f, 2).moved).toEqual([]);
    expect(distance(f.cast.center, f.cast.initialCenter)).toBeLessThanOrEqual(100 + 1e-7);
  });

  it('excludes fixed sources, core, capsules, recovery, pending melee and charge', () => {
    const targets = [actor('source', 800, 600, { role: 'source' }), actor('core', 800, 600, { role: 'core' }),
      actor('capsule', 800, 600, { role: 'capsule' }), actor('recovery', 800, 600, { recoverUntil: 1 }),
      actor('melee', 800, 600, { attackAt: 1 }), actor('charge', 800, 600, { charge: {} as Target['charge'] })];
    const f = fixture(0, targets), before = structuredClone(targets);
    expect(advance(f, 0).moved).toEqual([]); expect(targets).toEqual(before);
  });

  it('never moves or cancels a frozen plan, but the real blast can still hit its body', () => {
    const target = actor('committed', 800, 570, { attackPlan: { kind: 'thin-ray' } as Target['attackPlan'] });
    const f = fixture(0, [target]), before = structuredClone(target);
    expect(advance(f, 0).moved).toEqual([]); expect(target).toEqual(before);
    expect(tractionBlastTargets(f.state, f.cast)).toEqual([target]);
  });

  it('limits an idle heavy to 35 percent of the ordinary total displacement', () => {
    const f = fixture(0, [actor('heavy', 800, 630, { role: 'elite' })]);
    const update = advance(f, 0); expect(update.moved[0].distance).toBeCloseTo(24.5);
    expect(f.cast.movedByTargetId.heavy).toBeCloseTo(24.5);
  });

  it('keeps local cover for both collection and the eventual blast', () => {
    const f = fixture(0, [actor('behind', 890, 500)]);
    f.state.world!.obstacles = [{ id: 'fold', x: 845, y: 500, radius: 12 }];
    expect(advance(f, 0).moved).toEqual([]);
    expect(tractionBlastTargets(f.state, f.cast)).toEqual([]);
    expect(isLegalPosition(f.targets[0], f.targets[0].radius, f.state.world!)).toBe(true);
  });

  it('can blast a capsule without shifting its frozen flight position', () => {
    const f = fixture(0, [actor('capsule', 800, 570, { role: 'capsule' })]);
    advance(f, 0); expect(f.targets[0].y).toBe(570);
    expect(tractionBlastTargets(f.state, f.cast)).toEqual(f.targets);
  });
});

describe('nova III changes operation without repeating a control transaction', () => {
  it('keeps a quick click on the original .30-second deadline', () => {
    const f = fixture(3); expect(advance(f, 0, true).moved).toEqual([]);
    const release = advance(f, 1 / 60, false);
    expect(release.released).toBe(true); expect(f.cast.stage).toBe('fuse');
    expect(f.cast.resolveAt).toBe(.30); expect(release.moved.length).toBeGreaterThan(0);
    expect(advance(f, .30).ready).toBe(true);
  });

  it('unlocks guidance at III, limits speed/offset and charges movement only while guiding', () => {
    const f = fixture(3); expect(tractionMoveMultiplier(f.state)).toBe(1);
    expect(advance(f, .17, true).guidingStarted).toBe(false);
    const update = advance(f, .18, true, { x: 900, y: 500 });
    expect(update.guidingStarted).toBe(true); expect(f.cast.center.x - 800).toBeCloseTo(220 / 60);
    expect(tractionMoveMultiplier(f.state)).toBe(.75);
    for (let tick = 12; tick < 45; tick++) advance(f, tick / 60, true, { x: 2000, y: 500 });
    expect(f.cast.center.x).toBeCloseTo(900); expect(f.cast.stage).toBe('guiding');
    advance(f, .75, false); expect(f.cast.stage).toBe('fuse'); expect(tractionMoveMultiplier(f.state)).toBe(1);
    expect(f.cast.resolveAt).toBeCloseTo(1.05);
  });

  it('auto releases once at .85 and ignores later held-pointer movement', () => {
    const f = fixture(3); advance(f, .20, true);
    expect(advance(f, .85, true).released).toBe(true);
    expect(f.cast.resolveAt).toBeCloseTo(1.15); const center = { ...f.cast.center };
    expect(advance(f, 1, true, { x: 900, y: 500 }).released).toBe(false);
    expect(f.cast.center).toEqual(center); expect(advance(f, 1.15, true).ready).toBe(true);
  });

  it('will not drag the center through cover, beyond range or outside its origin offset', () => {
    const f = fixture(3); f.state.world!.obstacles = [{ id: 'fold', x: 850, y: 500, radius: 14 }];
    advance(f, .20, true, { x: 900, y: 500 }); expect(f.cast.center.x).toBe(800);
    f.state.world!.obstacles = []; f.state.player.x = 450;
    advance(f, .25, true, { x: 900, y: 500 }); expect(f.cast.center.x).toBe(800);
  });

  it('captures full damage once and keeps normal and converted casts mutually exclusive', () => {
    const f = fixture(3); expect(f.cast.damageSnapshot).toBeCloseTo(80 * 1.45);
    expect(f.cast.catalysisDamageSnapshot).toBe(0);
    f.growth.ranks.catalysis = 1; f.growth.ranks.power = 2;
    const converted = beginTraction(f.state, 'converted', f.cast.center, endlessCombatStats(f.growth));
    expect(converted.catalysisDamageSnapshot).toBeCloseTo(80 * 1.45 * 1.36 * 1.25);
    f.growth.ranks.power = 9;
    expect(converted.damageSnapshot).toBeCloseTo(80 * 1.45 * 1.36);
  });

  it('does not advance positions or deadlines during a paused state', () => {
    const f = fixture(3); f.state.phase = 'paused'; const snapshot = structuredClone(f.state);
    expect(advanceTraction(f.state, true, { x: 900, y: 500 }, 1 / 60).moved).toEqual([]);
    expect(f.state).toEqual(snapshot); expect(TRACTION_BALANCE.cooldown).toBe(2);
  });
});
