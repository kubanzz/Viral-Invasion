import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createWeaponCombat } from '../../src/game/weaponSkills';
import { drawThunderEffects, thunderDamageNumbers, thunderScreenImpulse } from '../../src/render/thunderVfx';
import { Camera } from '../../src/render/camera';

function fixture() {
  const session = new GameSession(25, { mode: 'endless', territory: true }); session.start();
  const s = session.state; s.elapsed = 1; s.tick = 60; s.events = [];
  s.weaponCombat = createWeaponCombat({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 });
  s.world = { width: 1400, height: 1000, bounds: { left: 0, right: 1400, top: 0, bottom: 1000 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  s.targets = Array.from({ length: 48 }, (_, i) => ({ id: `target:${i}`, x: 400 + i % 8 * 18, y: 400 + Math.floor(i / 8) * 18,
    hp: 100, maxHp: 100, radius: 16, kind: 'single' as const, role: 'virus' as const, hitUntil: 0, scanned: false }));
  s.weaponCombat.thunder = { marks: s.targets.map(t => ({ targetId: t.id, until: 4 })), trails: [{
    castId: 'trail', from: { x: 300, y: 400 }, to: { x: 580, y: 400 }, startedAt: .5, until: 3, nextAt: 1.25, damage: 12,
  }], channel: { castId: 'held', startedAt: .5, nextAt: 1.1, links: s.targets.slice(0, 8).map((t, i) => ({
    targetId: t.id, from: s.player, to: t, main: i === 0,
  })) }, storm: { castId: 'storm', phase: 'storm', startedAt: .5, until: 6.5, nextAt: 1.5, damage: 43, center: s.player } };
  return s;
}

describe('thunder presentation', () => {
  it('keeps the accepted terminal pillar after wave cleanup removes live combat fields', () => {
    const s = fixture(); delete s.weaponCombat!.thunder; s.phase = 'paused';
    s.events = [{ type: 'WEAPON_ULTIMATE_PULSE', tick: 60, data: { weaponId: 'thunder', final: true, x: s.player.x, y: s.player.y } }];
    let images = 0;
    const ctx = new Proxy({}, { get: (_, key) => key === 'drawImage' ? () => { images++; } : () => {}, set: () => true }) as CanvasRenderingContext2D;
    const before = JSON.stringify(s); drawThunderEffects(ctx, s, false, () => ({} as CanvasImageSource));
    expect(images).toBe(1); expect(JSON.stringify(s)).toBe(before);
    s.player.hp = 0; drawThunderEffects(ctx, s, false, () => ({} as CanvasImageSource)); expect(images).toBe(1);
  });
  it.each([false, true])('draws 48 marked actors and a live field without advancing damage or leaking canvas state, low=%s', low => {
    const s = fixture(), before = JSON.stringify(s); let depth = 0, strokes = 0, images = 0;
    const ctx = new Proxy({}, { get: (_, key) => key === 'save' ? () => { depth++; }
      : key === 'restore' ? () => { depth--; expect(depth).toBeGreaterThanOrEqual(0); }
      : key === 'stroke' ? () => { strokes++; } : key === 'drawImage' ? () => { images++; } : () => {}, set: () => true }) as CanvasRenderingContext2D;
    drawThunderEffects(ctx, s, low, () => ({} as CanvasImageSource), { x: 310, y: 370 });
    expect(strokes).toBeGreaterThan(20); expect(strokes).toBeLessThan(600);
    expect(images).toBeGreaterThan(0); expect(depth).toBe(0); expect(JSON.stringify(s)).toBe(before);
  });

  it('merges actual primary hits into completed damage windows and excludes zero, future and skill damage', () => {
    const s = fixture();
    s.events = [1, 2, 3].map((_, i) => ({ type: 'TARGET_HIT', tick: 46 + i, data: { id: 'target:0', damage: 2.5, weaponId: 'thunder', cause: 'basic' } }));
    s.events.push({ type: 'TARGET_HIT', tick: 49, data: { id: 'target:0', damage: 100, weaponId: 'thunder', cause: 'ability' } },
      { type: 'TARGET_HIT', tick: 61, data: { id: 'target:0', damage: 100, weaponId: 'thunder', cause: 'basic' } });
    expect(thunderDamageNumbers(s)).toMatchObject([{ targetId: 'target:0', damage: 7.5 }]);
  });

  it('reserves a bounded camera impulse for the terminal impact, respects pause/low effects, and preserves inverse projection', () => {
    const s = fixture();
    s.events = [{ type: 'WEAPON_ULTIMATE_PULSE', tick: 60, data: { weaponId: 'thunder', final: false } }];
    expect(thunderScreenImpulse(s)).toEqual({ x: 0, y: 0 });
    s.events[0].data.final = true;
    const impulse = thunderScreenImpulse(s); expect(Math.abs(impulse.x)).toBeGreaterThan(0); expect(Math.abs(impulse.x)).toBeLessThanOrEqual(4.5);
    expect(thunderScreenImpulse(s, true)).toEqual({ x: 0, y: 0 });
    const camera = new Camera(667, 320); camera.joltX = impulse.x; camera.joltY = impulse.y;
    const point = { x: 417, y: 319 }, inverse = camera.screenToWorld(camera.worldToScreen(point));
    expect(inverse.x).toBeCloseTo(point.x); expect(inverse.y).toBeCloseTo(point.y);
    s.phase = 'paused'; expect(thunderScreenImpulse(s)).toEqual({ x: 0, y: 0 });
  });
});
