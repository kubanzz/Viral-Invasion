import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameSession } from '../../src/game/session';
import { createWeaponCombat } from '../../src/game/weaponSkills';
import { slashSweepWindow, drawCombatEffects } from '../../src/render/combatEffects';
import { thunderArcPoints, drawThunderEffects, drawThunderGroundEffects, thunderDamageNumbers, THUNDER_ART } from '../../src/render/thunderVfx';
import { bladeActionEnvelope, bladeHipTwist, createBladeClips } from '../../src/render/bladeAnimationClips';
import { drawPlayerProjectiles } from '../../src/render/playerProjectileVisuals';

function paint() {
  const calls: { name: string; args: unknown[]; alpha: number }[] = [], stack: Record<string, unknown>[] = [];
  const styles: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(styles, { get(target, key) { if (key in target) return target[String(key)];
    return (...args: unknown[]) => { if (key === 'save') stack.push({ ...target });
      if (key === 'restore') Object.assign(target, stack.pop());
      calls.push({ name: String(key), args, alpha: Number(target.globalAlpha) }); };
  } }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, stack };
}
function state() {
  const session = new GameSession(261108, { mode: 'endless', territory: true }); session.start();
  const s = session.state; s.tick = 60; s.elapsed = 1; s.visualTime = 1; s.events = []; s.effects = []; s.targets = []; s.playerProjectiles = [];
  s.weaponCombat = createWeaponCombat({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 }); return s;
}

describe('combat presentation ownership and timing', () => {
  it('moves a fast leading blade and delayed tail with a shorter-lived bright core', () => {
    const early = slashSweepWindow(.05), contact = slashSweepWindow(.43), late = slashSweepWindow(.85);
    expect(early.head).toBeGreaterThan(early.tail); expect(early.head).toBeLessThan(1);
    expect(contact.head).toBe(1); expect(contact.tail).toBeLessThan(.3);
    expect(late.tail).toBeGreaterThan(contact.tail); expect(late.coreAlpha).toBe(0); expect(late.alpha).toBeGreaterThan(0);
    for (let n = 0; n <= 100; n++) { const p = slashSweepWindow(n / 100); expect(p.tail).toBeGreaterThanOrEqual(0); expect(p.head).toBeLessThanOrEqual(1); expect(p.tail).toBeLessThan(p.head); }
  });
  it('holds a jagged electric silhouette briefly before restriking, with stable real endpoints', () => {
    const a = { x: 10, y: 30 }, b = { x: 210, y: 150 };
    const first = thunderArcPoints(a, b, 1, 17, true), same = thunderArcPoints(a, b, 1.001, 17, true), next = thunderArcPoints(a, b, 1.06, 17, true);
    expect(first).toEqual(same); expect(next).not.toEqual(first);
    for (const points of [first, next]) { expect(points[0]).toEqual(a); expect(points.at(-1)).toEqual(b); expect(points).toHaveLength(10); expect(points.every(p => Number.isFinite(p.x + p.y))).toBe(true); }
    expect(thunderArcPoints(a, a, 1, 17)).toEqual([]);
  });
  it('splits actual thunder fields below actors and does not draw them twice in the upper pass', () => {
    const s = state(); s.weaponCombat!.thunder = { marks: [], trails: [{ castId: 'trail', from: { x: 300, y: 400 }, to: { x: 580, y: 400 }, startedAt: .5, until: 3, nextAt: 1.25, damage: 12 }] };
    const before = JSON.stringify(s), ground = paint(), upper = paint(), legacy = paint();
    const images: string[] = []; const image = (id: string) => { images.push(id); return {} as CanvasImageSource; };
    drawThunderGroundEffects(ground.ctx, s, false, image); expect(images).toEqual([THUNDER_ART.trail]);
    images.length = 0; drawThunderEffects(upper.ctx, s, false, image, undefined, { groundEffectsDrawn: true }); expect(images).toEqual([]);
    drawThunderEffects(legacy.ctx, s, false, image); expect(images).toEqual([THUNDER_ART.trail]);
    expect(ground.calls.some(c => c.name === 'stroke')).toBe(true); expect(upper.calls.some(c => c.name === 'stroke')).toBe(false);
    expect(ground.stack).toHaveLength(0); expect(upper.stack).toHaveLength(0); expect(JSON.stringify(s)).toBe(before);
  });
  it('hands transient flashes to native rendering while keeping the accepted cannon footprint', () => {
    const s = state(); s.events = [{ type: 'PLAYER_PROJECTILE_HIT', tick: 60, data: { targetId: 'target', x: 400, y: 400 } },
      { type: 'PLAYER_CANNON_EXPLODED', tick: 60, data: { x: 400, y: 400, radius: 126 } }];
    const ordinary = paint(), native = paint(); drawPlayerProjectiles(ordinary.ctx, s); drawPlayerProjectiles(native.ctx, s, false, undefined, undefined, { nativeVfx: true });
    const nativeArcs = native.calls.filter(c => c.name === 'arc'); expect(nativeArcs).toHaveLength(1); expect(nativeArcs[0].args[2]).toBe(126);
    expect(ordinary.calls.length).toBeGreaterThan(native.calls.length); expect(native.stack).toHaveLength(0);
    s.effects = [{ id: 1, kind: 'slash', from: { x: 300, y: 400 }, to: { x: 450, y: 400 }, radius: 150, born: 1, duration: .22 }]; s.events = [];
    const slash = paint(); drawCombatEffects(slash.ctx, s, false, undefined, true, undefined, { nativeVfx: true });
    expect(slash.calls.some(c => c.name === 'fill' || c.name === 'stroke')).toBe(false);
  });
  it('selects fewer nonoverlapping positive damage labels from a dense electric hit window', () => {
    const s = state(); s.targets = Array.from({ length: 20 }, (_, i) => ({ id: 't' + i, x: 400 + i * 8, y: 400, radius: 16, hp: 100, maxHp: 100, hitUntil: 0, scanned: false, kind: 'single', role: 'virus' }));
    s.events = s.targets.map((t, i) => ({ type: 'TARGET_HIT', tick: 48, data: { id: t.id, damage: i + 1, weaponId: 'thunder', cause: 'basic' } }));
    const labels = thunderDamageNumbers(s); expect(labels.length).toBeLessThanOrEqual(6); expect(labels[0].damage).toBe(20);
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(Math.hypot(labels[i].x - labels[j].x, labels[i].y - labels[j].y)).toBeGreaterThanOrEqual(34);
    expect(thunderDamageNumbers(s, true).length).toBeLessThanOrEqual(3);
  });
});

describe('authored blade follow through', () => {
  it('starts in contact, overshoots then settles, without delaying the damage clock', () => {
    expect(bladeActionEnvelope(0)).toBeGreaterThan(.7); expect(bladeActionEnvelope(.13)).toBeGreaterThan(1);
    expect(bladeActionEnvelope(.72)).toBeLessThan(0); expect(bladeActionEnvelope(1)).toBe(0);
    const right = bladeHipTwist('Blade_Slash_Right', .02, .18), left = bladeHipTwist('Blade_Slash_Left', .02, .18);
    expect(right).toBeGreaterThan(0); expect(left).toBeCloseTo(-right); expect(bladeHipTwist('Blade_Slash_Right', .02, .18, true)).toBeCloseTo(right * .45);
    expect(bladeHipTwist('Blade_Slash_Right', .18, .18)).toBe(0); expect(bladeHipTwist('Hit_Chest', .02, .18)).toBe(0);
  });
  it('authors shoulder, spine and arm keys on the original rig without mutating the source reference', () => {
    const q = [0, 0, 0, 1], tracks = ['mixamorigRightArm', 'mixamorigRightShoulder', 'mixamorigSpine2'].map(name => new THREE.QuaternionKeyframeTrack(name + '.quaternion', [0, 1], [...q, ...q]));
    const reference = new THREE.AnimationClip('Pistol_Idle', 1, tracks), original = JSON.stringify(reference.toJSON());
    const clips = createBladeClips(reference), slash = clips.find(c => c.name === 'Blade_Slash_Right')!;
    expect(clips).toHaveLength(5); expect(slash.duration).toBe(.18);
    for (const track of slash.tracks) { expect(track.times).toHaveLength(5); expect(track.times[0]).toBe(0); expect(track.times.at(-1)).toBeCloseTo(.18); expect(Array.from(track.values).every(Number.isFinite)).toBe(true); expect(Array.from(track.values.slice(0, 4))).not.toEqual(Array.from(track.values.slice(4, 8))); }
    expect(JSON.stringify(reference.toJSON())).toBe(original);
  });
});
