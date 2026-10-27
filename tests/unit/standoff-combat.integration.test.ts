import { describe, expect, it } from 'vitest';
import { distance } from '../../src/actors/collision';
import { enemyAttackPlan } from '../../src/game/enemyTactics';
import { BattleDirector } from '../../src/game/battle';
import { GameSession } from '../../src/game/session';
import type { GameEvent, InputFrame, Target, WorldGeometry } from '../../src/game/types';

const openWorld: WorldGeometry = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };

/** An empty-loadout transaction fixture with ordinary 68 HP and no combat upgrades. */
function fixture() {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const s = session.state;
  s.world = openWorld; Object.assign(s.player, { x: 1100, y: 700 }); Object.assign(s.tissue, { x: 1200, y: 1050 });
  s.growth!.cells = []; s.growth!.beacon = null;
  s.growth!.equipped = [];
  Object.assign(s.endless!, { wave: 3, phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: Infinity });
  const target: Target = { id: 'fixture-standoff', x: 1680, y: 700, hp: 68, maxHp: 68, role: 'virus', radius: 22,
    kind: 'single', traits: [], hitUntil: 0, scanned: false, born: 0, tactic: 'thin-ray', tacticPosture: 'standoff',
    facing: Math.PI, attackReady: 1.5, generation: 0, sourceId: 'endless:wave:3' };
  s.targets = [target];
  const events: GameEvent[] = []; session.bus.on('event', event => events.push(structuredClone(event)));
  const advance = (ticks: number, input: (tick: number) => Partial<InputFrame> = () => ({})) => {
    for (let tick = 0; tick < ticks; tick++) session.step({ moveX: 0, moveY: 0, aim: { x: target.x, y: target.y }, fire: false, ...input(tick) });
  };
  return { session, s, target, events, advance };
}

describe('a counterable ranged support in real fixed updates', () => {
  it('extends only the designated posture, preserving the ordinary thin ray and HP', () => {
    const f = fixture();
    expect(enemyAttackPlan(f.target, f.s)?.range).toBe(620);
    expect(enemyAttackPlan({ ...f.target, tacticPosture: undefined }, f.s)).toBeUndefined();
    expect(f.target.maxHp).toBe(68);
  });

  it('lets an ordinary player close and kill before the first shot without a protocol', () => {
    const f = fixture(); f.advance(80, () => ({ moveX: 1, fire: true, tool: 1 }));
    expect(f.target.hp).toBe(0); expect(f.s.player.hp).toBe(100);
    expect(f.events.some(event => event.type === 'TARGET_CLEARED')).toBe(true);
    expect(f.events.filter(event => event.type === 'ENEMY_TACTIC_RESOLVED')).toHaveLength(0);
    expect(f.s.elapsed).toBeLessThan(f.target.attackReady!);
  });

  it('leaves standing precision fire out of reach, with a real warned hit instead of an invisible damage rule', () => {
    const f = fixture(); f.advance(180, () => ({ fire: true, tool: 1 }));
    expect(f.target.hp).toBe(68); expect(f.s.player.hp).toBe(93);
    const commits = f.events.filter(event => event.type === 'ENEMY_TACTIC_COMMITTED');
    expect(commits).toHaveLength(1); expect(commits[0].tick / 60).toBeGreaterThanOrEqual(1.5);
    expect(f.events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(1);
    expect(f.events.find(event => event.type === 'PLAYER_HURT')?.data.reason).toBe('thin-ray');
  });

  it('freezes the real origin and lane while a late ordinary sidestep avoids the shot', () => {
    const f = fixture(); f.advance(91);
    const origin = { x: f.target.x, y: f.target.y }, plan = structuredClone(f.target.attackPlan);
    expect(plan?.kind).toBe('thin-ray');
    f.advance(24, () => ({ moveY: 1 }));
    expect(f.target.attackPlan).toEqual(plan); expect({ x: f.target.x, y: f.target.y }).toEqual(origin);
    f.advance(45);
    expect(f.events.some(event => event.type === 'ENEMY_TACTIC_RESOLVED' && event.data.hitPlayer === false)).toBe(true);
    expect(f.s.player.hp).toBe(100);
  });

  it('gives base Q a real remote bite and clear, using public inputs with no protocol equipped', () => {
    const f = fixture(); f.advance(510, tick => ({ scan: tick % 180 === 0 }));
    expect(f.target.hp).toBe(0);
    const bites = f.events.filter(event => event.type === 'IMMUNE_PATROL_HIT' && event.data.targetId === f.target.id);
    expect(bites.length).toBeGreaterThanOrEqual(6);
    expect(bites.reduce((sum, event) => sum + Number(event.data.damage), 0)).toBeCloseTo(68);
    expect(f.s.shots).toBe(0); expect(f.s.scans).toBeGreaterThan(0);
    expect(distance(f.s.player, { x: 1100, y: 700 })).toBe(0);
  });

  it('pauses the entire committed support state, then resumes without moving its promised origin', () => {
    const f = fixture(); f.advance(91); const position = { x: f.target.x, y: f.target.y };
    f.session.pause(); const frozen = f.session.snapshot(); f.advance(180, () => ({ moveX: 1, fire: true, scan: true }));
    expect(f.session.snapshot()).toEqual(frozen);
    f.session.resume(); f.advance(1);
    expect({ x: f.target.x, y: f.target.y }).toEqual(position);
  });

  it('opens an actual moving crystal body with public side movement, restoring a full precision hit', () => {
    const f = fixture();
    Object.assign(f.target, { x: 1000, y: 700, tactic: 'melee', tacticPosture: undefined, traits: ['CARAPACE'], facing: 0 });
    f.advance(1, () => ({ fire: true, tool: 1 }));
    expect(f.target.hp).toBeCloseTo(68 - 34 * .3);
    let firedFromSide = false, travelled = 0, targetTravelled = 0;
    for (let tick = 0; tick < 150 && !firedFromSide; tick++) {
      const player = f.s.player, target = f.target, gap = distance(player, target);
      const radial = { x: (player.x - target.x) / gap, y: (player.y - target.y) / gap };
      const error = (100 - gap) * 4;
      const x = -radial.y * 235 + radial.x * error, y = radial.x * 235 + radial.y * error;
      const length = Math.hypot(x, y), before = { x: player.x, y: player.y }, oldTarget = { x: target.x, y: target.y };
      const incoming = Math.atan2(player.y - target.y, player.x - target.x);
      // Wait for an unmistakable rear/side window, then fire through the same
      // public tool path used for the earlier frontal hit.
      firedFromSide = Math.cos(incoming - target.facing!) < .1;
      f.advance(1, () => ({ moveX: x / length, moveY: y / length, fire: firedFromSide, tool: 1 }));
      travelled += distance(before, player); targetTravelled += distance(oldTarget, target);
    }
    expect(firedFromSide).toBe(true); expect(travelled).toBeGreaterThan(200); expect(targetTravelled).toBeGreaterThan(10);
    expect(f.target.hp).toBeCloseTo(68 - 34 * .3 - 34);
    expect(f.events.filter(event => event.type === 'CARAPACE_RESISTED')).toHaveLength(1);
    expect(f.s.player.hp).toBe(100);
  });

  it('applies the actual host trace slowdown to retreat as well as ordinary pursuit', () => {
    const run = (factor: number) => {
      const f = fixture(); f.target.x = 1500; const before = { x: f.target.x, y: f.target.y };
      const director = new BattleDirector({ state: f.s, emit() {}, message() {}, effect() {}, finish() {}, slowFactor: () => factor });
      // Explicit one-tick host fixture: all other clocks/HP remain unchanged.
      director.afterInput(); return distance(before, f.target);
    };
    expect(run(1)).toBeCloseTo(80 / 60);
    expect(run(.45)).toBeCloseTo(80 / 60 * .45);
  });
});
