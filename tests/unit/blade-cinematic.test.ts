import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createWeaponCombat } from '../../src/game/weaponSkills';
import { bladeCinematicView, drawBladeCinematic, drawBladeReleaseAccent } from '../../src/render/bladeCinematic';
import { Player3DMotionController } from '../../src/render/player3DMotion';

function windup() {
  const session = new GameSession(71); session.start(); const s = session.state;
  s.weaponCombat = createWeaponCombat({ weaponId: 'redblade', rarity: 'gold', upgrade: 0 });
  s.weaponCombat.bladeTrace = { castId: 'fourfold-test', phase: 'windup', startedAt: 0, deadline: 3, until: .65,
    windupStartedAt: 0, damage: 50, marks: [], path: [{ ...s.player }], route: [{ ...s.player }], routeIndex: 1,
    lastAt: 0, manual: true, hitIds: [], elapsedDistance: 0, speed: 1800 };
  return s;
}
function painter() {
  const calls: { method: string; args: unknown[] }[] = [], gradient = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (_, name: string) => (...args: unknown[]) => { calls.push({ method: name, args }); return name.includes('Gradient') ? gradient : undefined; } }) as CanvasRenderingContext2D;
  return { ctx, calls };
}
describe('fourfold closed-eye draw and release cut-in', () => {
  it('opens the medic visor eyes before the blade is drawn, inside all three safe frames', () => {
    const s = windup(); s.elapsed = .15;
    for (const [w, h] of [[1366, 768], [844, 390], [667, 320]]) {
      const closed = bladeCinematicView(s, w, h, false, false, 'trial');
      expect(closed.active).toBe(true); expect(closed.eyeOpen).toBeLessThan(.1); expect(closed.draw).toBe(0);
      expect(closed.rect.left).toBeGreaterThan(0); expect(closed.rect.right).toBeLessThan(w);
      expect(closed.rect.bottom - closed.rect.top).toBeLessThanOrEqual(h * .62);
    }
    s.elapsed = .45; expect(bladeCinematicView(s, 667, 320).eyeOpen).toBeGreaterThan(.9);
    s.elapsed = .57; expect(bladeCinematicView(s, 667, 320).draw).toBeGreaterThan(.7);
  });
  it('uses the authored charge and finish full-body clips without consuming game state', () => {
    const s = windup(); s.elapsed = .2; const before = structuredClone(s), motion = new Player3DMotionController();
    motion.observe(s); expect(motion.sample(s).fullBodyEvent).toMatchObject({ clip: 'Blade_ChargeDraw_v022', age: .2, duration: .65 });
    expect(s).toEqual(before);
    s.weaponCombat!.bladeTrace!.phase = 'recovery'; s.weaponCombat!.bladeTrace!.until = .5;
    expect(motion.sample(s).fullBodyEvent).toMatchObject({ clip: 'Blade_FinishSettle_v022', duration: .3 });
  });
  it('freezes the screen animation on pause, preserves low-effect eye detail and clears at exit', () => {
    const s = windup(); s.elapsed = .42; s.phase = 'paused';
    const a = bladeCinematicView(s, 844, 390, true, true), b = bladeCinematicView(s, 844, 390, true, true);
    expect(a).toEqual(b); expect(a.lowEffects).toBe(true); expect(a.reducedMotion).toBe(true); expect(a.eyeOpen).toBeGreaterThan(.7);
    const mock = painter(); drawBladeCinematic(mock.ctx, s, 844, 390, true, true);
    expect(mock.calls.some(call => call.method === 'fillText' && call.args[0] === '四曜穿心')).toBe(true);
    s.phase = 'result'; expect(bladeCinematicView(s, 844, 390).active).toBe(false);
    delete s.weaponCombat!.bladeTrace; const empty = painter(); drawBladeCinematic(empty.ctx, s, 844, 390); drawBladeReleaseAccent(empty.ctx, s, 844, 390);
    expect(empty.calls).toEqual([]);
  });
});
