import { describe, expect, it } from 'vitest';
import { distance, moveWithCollision } from '../../src/actors/collision';
import { BattleDirector } from '../../src/game/battle';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { CARAPACE_TURN_RATE, updateEnemyFacing } from '../../src/game/enemyFacing';
import { enemyAttackPlan } from '../../src/game/enemyTactics';
import { GameSession } from '../../src/game/session';
import { BALANCE, type Target, type WorldGeometry } from '../../src/game/types';

const angleDifference = (to: number, from: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const openWorld: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
function actor(patch: Partial<Target> = {}): Target {
  return { id: 'facing-fixture', x: 1000, y: 700, hp: 100, maxHp: 100, radius: 22, role: 'virus', kind: 'single',
    traits: ['CARAPACE'], facing: 0, hitUntil: 0, scanned: false, generation: 0, attackReady: 100, ...patch };
}
function damageFixture() {
  const session = new GameSession(71, { campaign: true, firstTrait: 'CARAPACE' }); session.start();
  const target = actor(); session.state.targets = [target]; session.state.world = openWorld;
  session.state.player.x = target.x + 100; session.state.player.y = target.y; session.state.tool = 1;
  return { session, target, director: new BattleDirector(session) };
}

describe('bounded free-facing carapace turn', () => {
  it('opens the existing real resistance cone through a normal-speed radius100 side path', () => {
    const f = damageFixture(), { target, session, director } = f, s = session.state;
    // Controlled stationary-body fixture: player positions use legal collision
    // steps, facing uses the new helper, damage uses the actual host rule. This
    // does not claim the complete moving-enemy GameSession integration is tested.
    expect(director.modifiedDamage(target, BALANCE.damage[1])).toBeCloseTo(34 * BATTLE_BALANCE.carapaceResistance);
    const radius = 100, angularSpeed = BALANCE.speed / radius;
    let firstFullDamageStep: number | undefined;
    for (let step = 1; step <= 75; step++) {
      const angle = angularSpeed * step * BALANCE.step;
      const desired = { x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius };
      const before = { x: s.player.x, y: s.player.y }, beforeFacing = target.facing!;
      const moved = moveWithCollision(s.player, { x: desired.x - s.player.x, y: desired.y - s.player.y }, s.player.radius, openWorld);
      s.player.x = moved.x; s.player.y = moved.y;
      expect(distance(before, s.player)).toBeLessThanOrEqual(BALANCE.speed * BALANCE.step + 1e-9);
      expect(distance(target, s.player)).toBeCloseTo(radius);
      updateEnemyFacing(target, Math.atan2(s.player.y - target.y, s.player.x - target.x), BALANCE.step);
      expect(Math.abs(angleDifference(target.facing!, beforeFacing))).toBeLessThanOrEqual(CARAPACE_TURN_RATE * BALANCE.step + 1e-9);
      if (director.modifiedDamage(target, 34) === 34) firstFullDamageStep ??= step;
    }
    expect(firstFullDamageStep).toBeGreaterThan(60); expect(firstFullDamageStep).toBeLessThanOrEqual(75);
    expect(director.modifiedDamage(target, 34)).toBe(34);
    expect(target.hp).toBe(100); expect(target.traits).toEqual(['CARAPACE']);
    expect(Math.abs(angleDifference(Math.atan2(s.player.y - target.y, s.player.x - target.x), target.facing!))).toBeGreaterThan(Math.acos(.2));
  });

  it('keeps a stationary frontal player resisted while retaining the actual cone boundary and tool exception', () => {
    const { target, session, director } = damageFixture();
    for (let step = 0; step < 120; step++) {
      updateEnemyFacing(target, 0, BALANCE.step);
      expect(director.modifiedDamage(target, 34)).toBeCloseTo(10.2);
    }
    const boundary = Math.acos(.2);
    session.state.player.x = target.x + Math.cos(boundary - .001) * 100;
    session.state.player.y = target.y + Math.sin(boundary - .001) * 100;
    expect(director.modifiedDamage(target, 34)).toBeCloseTo(10.2);
    session.state.player.x = target.x + Math.cos(boundary + .001) * 100;
    session.state.player.y = target.y + Math.sin(boundary + .001) * 100;
    expect(director.modifiedDamage(target, 34)).toBe(34);
    session.state.player.x = target.x + 100; session.state.player.y = target.y; session.state.tool = 2;
    expect(director.modifiedDamage(target, 65)).toBe(65);
  });

  it.each([{ traits: [] }, { traits: ['FISSION'] }, { traits: ['MIMIC'] }] as const)('preserves immediate ordinary facing for traits $traits and touches no other state', ({ traits }) => {
    const target = actor({ traits: [...traits] }), before = structuredClone(target);
    for (const desired of [2.6, -2.8, .001, 0]) {
      updateEnemyFacing(target, desired, BALANCE.step); expect(target.facing).toBe(desired);
    }
    expect({ ...target, facing: before.facing }).toEqual(before);
  });

  it('takes the shortest turn across both +/-pi seams without a long spin or overshoot', () => {
    for (const sign of [1, -1]) {
      const start = sign * (Math.PI - .01), desired = -sign * (Math.PI - .01), target = actor({ facing: start });
      updateEnemyFacing(target, desired, BALANCE.step);
      expect(angleDifference(target.facing!, start)).toBeCloseTo(sign * .02);
      expect(angleDifference(desired, target.facing!)).toBeCloseTo(0);
    }
    const target = actor(); updateEnemyFacing(target, .005, BALANCE.step);
    expect(target.facing).toBeCloseTo(.005);
    updateEnemyFacing(target, 2, BALANCE.step);
    expect(target.facing).toBeCloseTo(.025);
  });

  it('initializes missing/invalid free facing from the desired angle and ignores invalid time or aim', () => {
    for (const facing of [undefined, Number.NaN, Infinity]) {
      const target = actor({ facing }); updateEnemyFacing(target, -2.4, BALANCE.step);
      expect(target.facing).toBe(-2.4);
    }
    for (const dt of [0, -1, Number.NaN, Infinity]) {
      const target = actor({ facing: .7 }); updateEnemyFacing(target, -2.4, dt); expect(target.facing).toBe(.7);
    }
    const target = actor({ facing: .7 }); updateEnemyFacing(target, Number.NaN, BALANCE.step); expect(target.facing).toBe(.7);
  });

  it('freezes each existing attack/plan/charge/recovery pose for both crystal and ordinary bodies', () => {
    const { session } = damageFixture();
    const planned = actor({ tactic: 'crystal-charge' }), plan = enemyAttackPlan(planned, session.state)!;
    expect(plan).toBeDefined();
    const patches: Partial<Target>[] = [
      { attackAt: 0 }, { attackPlan: plan },
      { charge: { from: { x: 1000, y: 700 }, to: { x: 1200, y: 700 }, startedAt: 0, endsAt: 1,
        speed: 520, radius: 34, hitPlayer: false, hitTissue: false, playerDamage: 10, tissueDamage: 0, recoveryExposure: 2, interval: 3.8 } },
      { recoverUntil: 0 },
    ];
    for (const traits of [[], ['CARAPACE'] as const]) for (const patch of patches) {
      const target = actor({ ...patch, traits: [...traits], facing: .7 }), before = structuredClone(target);
      updateEnemyFacing(target, -2.4, 10); expect(target).toEqual(before);
      target.facing = undefined; updateEnemyFacing(target, 2, BALANCE.step); expect(target.facing).toBeUndefined();
    }
    const released = actor({ attackAt: 0 }); updateEnemyFacing(released, 2, BALANCE.step); expect(released.facing).toBe(0);
    released.attackAt = undefined; updateEnemyFacing(released, 2, BALANCE.step); expect(released.facing).toBeCloseTo(.02);
  });
});
