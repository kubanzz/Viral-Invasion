import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { GameSession } from '../../src/game/session';
import type { EnemyTactic } from '../../src/game/enemyTacticsTypes';
import type { GameEvent, InputFrame, Target, WorldGeometry } from '../../src/game/types';

const openWorld: WorldGeometry = { width: 2400, height: 1500,
  bounds: { left: 20, right: 2380, top: 20, bottom: 1480 }, obstacles: [],
  foreground: { x: 0, y: 0, width: 0, height: 0 } };
const idle = (session: GameSession, patch: Partial<InputFrame> = {}): InputFrame => ({
  moveX: 0, moveY: 0, aim: { x: session.state.player.x + 100, y: session.state.player.y }, fire: false, ...patch,
});

/** Isolated attack transaction fixtures, deliberately separate from natural-wave evidence. */
function fixture(tactic: EnemyTactic) {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const s = session.state;
  s.world = openWorld; Object.assign(s.player, { x: 1100, y: 700 });
  Object.assign(s.tissue, { x: 1200, y: 1050 });
  // No allies or further cohorts: a durable target exposes one complete attack
  // without a simultaneous kill/clear draft ending the transaction under test.
  s.growth!.cells = []; s.growth!.beacon = null;
  Object.assign(s.endless!, { wave: 5, phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: Infinity });
  const target: Target = { id: `fixture-${tactic}`, x: 680, y: 700, hp: 10000, maxHp: 10000,
    role: tactic === 'thin-ray' ? 'virus' : 'elite', radius: tactic === 'thin-ray' ? 22 : 30,
    kind: 'single', traits: [], hitUntil: 0, scanned: false, born: 0, tactic, attackReady: 0,
    generation: 0, sourceId: 'endless:wave:5' };
  if (tactic === 'mimic-corrosion') { target.x = 800; target.y = 1050; }
  s.targets = [target];
  const events: GameEvent[] = [];
  session.bus.on('event', event => events.push(structuredClone(event)));
  const advance = (ticks: number, patch: Partial<InputFrame> = {}) => {
    for (let i = 0; i < ticks; i++) session.step(idle(session, patch));
  };
  const until = (predicate: () => boolean, maxTicks = 300) => {
    for (let i = 0; i < maxTicks && !predicate(); i++) advance(1);
    expect(predicate(), `attack did not reach expected state: ${JSON.stringify(target)}`).toBe(true);
  };
  return { session, s, target, events, advance, until };
}

describe('accepted special attack transactions in the real session', () => {
  it('freezes the actual ray and pauses its deadline, then misses a real perpendicular sidestep', () => {
    const f = fixture('thin-ray'); f.advance(1);
    const plan = structuredClone(f.target.attackPlan), pose = { x: f.target.x, y: f.target.y };
    expect(plan?.kind).toBe('thin-ray'); const deadline = f.target.attackAt;
    f.session.pause(); const paused = f.session.snapshot(); f.advance(180);
    expect(f.session.snapshot()).toEqual(paused); f.session.resume();
    f.advance(30, { moveY: 1 });
    expect(f.target.attackPlan).toEqual(plan); expect(f.target.attackAt).toBe(deadline);
    expect({ x: f.target.x, y: f.target.y }).toEqual(pose);
    f.until(() => f.events.some(event => event.type === 'ENEMY_TACTIC_RESOLVED'));
    expect(f.events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(0);
    expect(f.events.find(event => event.type === 'ENEMY_TACTIC_RESOLVED')?.data.hitPlayer).toBe(false);
  });

  it('deals ray damage through the common accepted event path exactly once on resolution', () => {
    const f = fixture('thin-ray'); f.until(() => f.events.some(event => event.type === 'ENEMY_TACTIC_RESOLVED'));
    const hurts = f.events.filter(event => event.type === 'PLAYER_HURT');
    expect(hurts).toHaveLength(1); expect(hurts[0].data.reason).toBe('thin-ray');
    expect(100 - f.s.player.hp).toBe(hurts[0].data.damage);
    expect(f.s.battle!.stats.playerDamage).toBe(hurts[0].data.damage);
    f.advance(60); expect(f.events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(1);
  });

  it('charges through real travelled segments, hits only once, and offers a stationary exposed recovery', () => {
    const f = fixture('crystal-charge'); f.until(() => !!f.target.charge);
    expect(f.s.player.hp).toBe(100); const start = { x: f.target.x, y: f.target.y };
    f.advance(10); expect(distance(start, f.target)).toBeCloseTo(520 / 6);
    expect(f.s.player.hp).toBe(100); // still more than 300 units away, despite the full warning lane
    f.until(() => f.events.some(event => event.type === 'ENEMY_CHARGE_ENDED'));
    const hurts = f.events.filter(event => event.type === 'PLAYER_HURT');
    expect(hurts).toHaveLength(1); expect(hurts[0].data.reason).toBe('crystal-charge');
    expect(f.target.charge).toBeUndefined(); expect(f.target.attackPlan).toBeUndefined();
    expect(f.target.recoverUntil! - f.s.elapsed).toBeCloseTo(2);
    expect(f.target.exposedUntil).toBeGreaterThanOrEqual(f.target.recoverUntil!);
    const recoveryPose = { x: f.target.x, y: f.target.y };
    f.advance(100, { moveY: 1 });
    expect({ x: f.target.x, y: f.target.y }).toEqual(recoveryPose);
    expect(f.events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(1);
  });

  it('evades a committed charge with the public perpendicular dash input', () => {
    const f = fixture('crystal-charge'); f.until(() => !!f.target.charge);
    f.until(() => distance(f.target, f.s.player) < 170);
    f.advance(1, { moveY: 1, dash: true }); f.advance(50, { moveY: 1 });
    expect(f.s.dashes).toBe(1); expect(f.s.player.hp).toBe(100);
    expect(f.events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(0);
    expect(f.events.some(event => event.type === 'ENEMY_CHARGE_ENDED')).toBe(true);
  });

  it('resolves the two frozen fission footprints with one accepted player-damage receipt', () => {
    const f = fixture('fission-burst'); f.advance(1);
    const landings = structuredClone(f.target.attackPlan!.landings);
    expect(landings).toHaveLength(2); expect(distance(landings[0], landings[1])).toBeGreaterThan(144);
    f.until(() => f.events.some(event => event.type === 'ENEMY_TACTIC_RESOLVED'));
    expect(f.events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(1);
    expect(f.events.find(event => event.type === 'PLAYER_HURT')?.data.reason).toBe('fission-burst');
    const bursts = f.s.effects.filter(effect => effect.kind === 'burst');
    expect(bursts.map(effect => effect.to)).toEqual(landings);
  });

  it('interrupts tissue corrosion with a real Q, cancels its stale deadline and reports exposure', () => {
    const f = fixture('mimic-corrosion'); f.advance(1);
    expect(f.target.attackPlan?.kind).toBe('mimic-corrosion'); const deadline = f.target.attackAt!;
    f.advance(1, { scan: true, aim: { x: f.target.x, y: f.target.y } });
    expect(f.events.filter(event => event.type === 'ENDLESS_CORROSION_INTERRUPTED')).toHaveLength(1);
    expect(f.target.attackAt).toBeUndefined(); expect(f.target.attackPlan).toBeUndefined();
    expect(f.target.recoverUntil).toBeGreaterThan(deadline);
    const integrityAfterDeployment = f.s.tissue.hp; // Q's documented beacon cost is independent of corrosion.
    f.advance(110);
    expect(f.s.elapsed).toBeGreaterThan(deadline); expect(f.s.tissue.hp).toBe(integrityAfterDeployment);
    expect(f.events.filter(event => event.type === 'ENEMY_TACTIC_RESOLVED')).toHaveLength(0);
    expect(f.events.some(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'enemy-attack')).toBe(false);
  });

  it('preserves a real committed charge through tool2 and resolves its original path once', () => {
    const f = fixture('crystal-charge'); f.until(() => !!f.target.charge);
    const charge = structuredClone(f.target.charge);
    f.advance(1, { tool: 2, fire: true, aim: { x: f.target.x, y: f.target.y } });
    expect(f.events.filter(event => event.type === 'TRACTION_DISPLACED')).toHaveLength(0);
    expect(f.target.charge).toBeDefined(); expect(f.target.charge?.from).toEqual(charge!.from);
    expect(f.target.charge?.to).toEqual(charge!.to);
    f.until(() => !f.target.charge);
    expect(f.events.filter(event => event.type === 'ENEMY_CHARGE_ENDED')).toHaveLength(1);
    expect(f.events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(1);
  });
});
