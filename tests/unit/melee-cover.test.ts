import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { distance, isLegalPosition, normalized, wallHit } from '../../src/actors/collision';
import type { GameEvent, Target, WorldGeometry } from '../../src/game/types';

/** Small explicit cover fixture; all post-start displacement uses normal input. */
const coverWorld: WorldGeometry = { width: 1200, height: 900,
  bounds: { left: 20, right: 1180, top: 20, bottom: 880 },
  obstacles: [{ id: 'cover', x: 500, y: 650, radius: 35 }], foreground: { x: 0, y: 0, width: 0, height: 0 } };

function fixture(covered = true, mode: 'campaign' | 'endless' = 'endless') {
  const session = new GameSession(71, mode === 'endless' ? { mode } : { campaign: true }); session.start();
  const s = session.state;
  s.world = covered ? coverWorld : { ...coverWorld, obstacles: [] };
  Object.assign(s.player, { x: 460, y: 595 }); Object.assign(s.tissue, { x: 950, y: 800 });
  if (s.growth) { s.growth.cells = []; s.growth.beacon = null; }
  if (s.endless) Object.assign(s.endless, { phase: 'combat', remainingToSpawn: 1, nextSpawnAt: Infinity, phaseUntil: 0 });
  const enemy: Target = { id: 'cover-attacker', x: 440, y: 650, hp: 68, maxHp: 68, radius: 22, role: 'virus',
    kind: 'single', traits: [], hitUntil: 0, scanned: false, born: 0, attackReady: 0, tactic: 'melee', sourceId: 'endless:wave:1' };
  s.targets = [enemy];
  const events: GameEvent[] = []; session.bus.on('event', event => events.push(structuredClone(event)));
  const advance = (ticks: number, moveX = 0, moveY = 0) => {
    for (let i = 0; i < ticks; i++) session.step({ moveX, moveY, aim: { x: 1000, y: 500 }, fire: false });
  };
  return { session, s, enemy, events, advance };
}

describe('committed melee attacks respect real cover', () => {
  it.each(['campaign', 'endless'] as const)('does not hurt a %s player who walks behind cover while remaining inside the old warning circle', mode => {
    const f = fixture(true, mode); f.advance(1);
    expect(f.enemy.attackAt).toBeDefined(); const aim = { ...f.enemy.attackAim! }, deadline = f.enemy.attackAt!;
    const origin = { x: f.enemy.x, y: f.enemy.y };
    f.advance(19, 1);
    expect(distance(f.s.player, aim)).toBeLessThan(58 + f.s.player.radius);
    expect(isLegalPosition(f.s.player, f.s.player.radius, f.s.world)).toBe(true);
    const length = distance(origin, f.s.player), hit = wallHit(origin, normalized(f.s.player.x - origin.x, f.s.player.y - origin.y), length, f.s.world);
    expect(hit).not.toBeNull(); expect(hit!).toBeLessThan(length - f.s.player.radius);
    expect({ x: f.enemy.x, y: f.enemy.y }).toEqual(origin); expect(f.enemy.attackAim).toEqual(aim);
    while (f.s.elapsed <= deadline + .01) f.advance(1);
    expect(f.s.player.hp).toBe(100);
    expect(f.events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(0);
  });

  it.each(['campaign', 'endless'] as const)('still hurts the same %s movement inside the committed circle when no cover blocks it', mode => {
    const f = fixture(false, mode); f.advance(1); const deadline = f.enemy.attackAt!;
    f.advance(19, 1); while (f.s.elapsed <= deadline + .01) f.advance(1);
    expect(f.s.player.hp).toBe(93);
    expect(f.events.filter(event => event.type === 'PLAYER_HURT')).toHaveLength(1);
  });
});
