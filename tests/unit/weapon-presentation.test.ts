import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { createWeaponCombat } from '../../src/game/weaponSkills';
import { ActorAnimationLibrary, ACTOR_STATIC_IDS } from '../../src/render/actorAnimation';
import { HELD_WEAPON_ART, heldWeaponPresentation, heldWeaponRecoilStrength } from '../../src/render/weaponPresentation';
import { aimedPaintedTool, paintedToolMuzzle } from '../../src/render/spriteGeometry';
import { drawPlayerProjectiles, projectileDrawPosition } from '../../src/render/playerProjectileVisuals';
import type { PlayerProjectile } from '../../src/game/playerProjectiles';
import { fixtureActorAnimationAssets } from '../fixtures/actorAnimationAssets';

function state() {
  const game = new GameSession(16, { mode: 'endless' }); game.start();
  game.state.events = []; game.state.playerProjectiles = []; game.state.elapsed = 1; game.state.tick = 60;
  return game.state;
}

function drawing() {
  const paints: { color: string; path: string[] }[] = [], stack: { fill: string; stroke: string }[] = [];
  let path: string[] = [], fill = '', stroke = '';
  const methods = {
    save() { stack.push({ fill, stroke }); }, restore() { const value = stack.pop()!; fill = value.fill; stroke = value.stroke; },
    beginPath() { path = []; }, closePath() { path.push('close'); }, moveTo() { path.push('move'); }, lineTo() { path.push('line'); },
    quadraticCurveTo() { path.push('curve'); }, arc() { path.push('circle'); }, ellipse() { path.push('ellipse'); }, roundRect() { path.push('pill'); },
    fill() { paints.push({ color: fill, path: [...path] }); }, stroke() { paints.push({ color: stroke, path: [...path] }); },
  };
  const ctx = new Proxy({}, { get: (_, key) => key === 'fillStyle' ? fill : key === 'strokeStyle' ? stroke : methods[key as keyof typeof methods] ?? (() => {}),
    set: (_, key, value) => { if (key === 'fillStyle') fill = String(value); if (key === 'strokeStyle') stroke = String(value); return true; } }) as CanvasRenderingContext2D;
  return { ctx, paints, balanced: () => stack.length === 0 };
}

function shot(visual: PlayerProjectile['visual'], phase?: PlayerProjectile['flightPhase']): PlayerProjectile {
  return { id: 'visual-shot', castId: 'visual-cast', kind: 'primary', born: .8,
    x: 300, y: 300, previous: { x: 300, y: 300 }, from: { x: 250, y: 300 }, direction: { x: 1, y: 0 },
    speed: 800, radius: 13, remaining: 300, damage: 28, hitsRemaining: 2, hitTargetIds: [], visual, flightPhase: phase,
    origin: { cause: 'basic', basicTool: 1, weaponId: visual === 'hive-needle' || visual === 'swarm-needle' ? 'steady' : 'piercing' } };
}

describe('distinct held weapon identities', () => {
  it('selects the live weapon snapshot and keeps the menu and old combat presentation independent', () => {
    const game = state();
    expect(heldWeaponPresentation(game)).toBeUndefined();
    game.weaponCombat = createWeaponCombat({ weaponId: 'steady', rarity: 'white', upgrade: 0 });
    expect(heldWeaponPresentation(game)?.id).toBe('fantasy.weapon.steady.held');
    game.weaponCombat.loadout.weaponId = 'piercing';
    expect(heldWeaponPresentation(game)?.id).toBe('fantasy.weapon.piercing.held');
    game.phase = 'menu'; expect(heldWeaponPresentation(game)).toBeUndefined();
  });

  it.each(['steady', 'piercing'] as const)('uses its own inspected grip and muzzle in every aiming quadrant: %s', id => {
    const assets = fixtureActorAnimationAssets(), artId = HELD_WEAPON_ART[id].id;
    const asset = structuredClone(assets[ACTOR_STATIC_IDS.emitter]);
    asset.animation = { group: artId, index: 0, frameCount: 1, fps: 1, approved: true }; assets[artId] = asset;
    const library = new ActorAnimationLibrary(assets), accepted = library.staticAsset(artId)!;
    expect(accepted).toBeDefined();
    for (const facing of [0, Math.PI / 4, Math.PI, -Math.PI / 2]) {
      const hand = { x: 515, y: 345 }, tool = aimedPaintedTool(accepted.asset, { x: 500, y: 500 }, facing, 0, hand,
        HELD_WEAPON_ART[id].canvasHeight / 512)!;
      expect(tool.grip).toEqual(hand); expect(tool.sourceGrip).toEqual(accepted.registration.grip);
      const muzzle = paintedToolMuzzle(accepted.asset, tool)!;
      const grip = accepted.registration.grip!, sourceMuzzle = accepted.asset.sourceMuzzle!;
      expect(Math.hypot(muzzle.x - hand.x, muzzle.y - hand.y)).toBeCloseTo(
        Math.hypot(sourceMuzzle.x - grip.x, sourceMuzzle.y - grip.y) * HELD_WEAPON_ART[id].canvasHeight / 512);
      expect(tool.flipY).toBe(Math.cos(facing) < 0);
    }
    asset.actorRegistration!.muzzle!.x++;
    expect(new ActorAnimationLibrary(assets).staticAsset(artId)).toBeUndefined();
  });

  it('gives real swarm/heavy launches distinct bounded recoil, chooses one kick and freezes on pause', () => {
    const game = state(); game.weaponCombat = createWeaponCombat({ weaponId: 'steady', rarity: 'white', upgrade: 0 });
    game.events = [{ type: 'WEAPON_SKILL_CAST', tick: 60, data: { weaponId: 'steady', skillId: 'steady-burst' } }];
    expect(heldWeaponRecoilStrength(game)).toBe(0);
    game.events.push({ type: 'PLAYER_PROJECTILE_LAUNCHED', tick: 60, data: { weaponId: 'steady', skillId: 'steady-burst' } });
    expect(heldWeaponRecoilStrength(game)).toBe(.6); expect(heldWeaponRecoilStrength(game, .8)).toBe(.8);
    game.weaponCombat.loadout.weaponId = 'piercing';
    game.events.push({ type: 'PLAYER_PROJECTILE_LAUNCHED', tick: 60, data: { weaponId: 'piercing', skillId: 'piercing-heavy' } });
    expect(heldWeaponRecoilStrength(game, 1)).toBe(1.35);
    game.phase = 'paused'; game.visualTime = 5;
    expect(heldWeaponRecoilStrength(game)).toBe(1.35); game.visualTime = 100;
    expect(heldWeaponRecoilStrength(game)).toBe(1.35);
    game.phase = 'playing'; game.elapsed = 1.3; game.visualTime = 1.3;
    expect(heldWeaponRecoilStrength(game)).toBe(0);
  });
});

describe('weapon projectile silhouettes', () => {
  it.each([false, true])('keeps needles, outward blades and return blades visually distinct in lowEffects=%s', low => {
    const game = state(), paints: ReturnType<typeof drawing>['paints'][] = [];
    for (const body of [shot('hive-needle'), shot('crescent', 'outbound'), shot('crescent', 'returning')]) {
      game.playerProjectiles = [body]; const before = JSON.stringify(game), draw = drawing();
      drawPlayerProjectiles(draw.ctx, game, low); paints.push(draw.paints);
      expect(draw.balanced()).toBe(true); expect(JSON.stringify(game)).toBe(before);
    }
    expect(paints[0].some(p => p.path.includes('pill'))).toBe(true);
    expect(paints[1].some(p => p.path.includes('curve'))).toBe(true);
    expect(paints[1].some(p => p.color === '#e5a64b')).toBe(true);
    expect(paints[2].some(p => p.color === '#a96425')).toBe(true);
    expect(paints[2].some(p => p.path.join(',') === 'move,line,line')).toBe(true);
  });

  it('bridges only outbound weapon bodies to the muzzle and leaves the return and anchored footprint on the true ground position', () => {
    const body = shot('crescent', 'outbound'), muzzle = { x: 280, y: 270 };
    expect(projectileDrawPosition(body, muzzle)).not.toEqual({ x: body.x, y: body.y });
    body.flightPhase = 'returning'; expect(projectileDrawPosition(body, muzzle)).toBe(body);
    body.flightPhase = undefined; body.visual = 'anchor'; body.detonateAt = 2;
    expect(projectileDrawPosition(body, muzzle)).toBe(body);
  });

  it.each([false, true])('retains the stationary amber anchor and mint self-pulse identities in lowEffects=%s', low => {
    const game = state(), anchor = shot('anchor');
    anchor.kind = 'cannon'; anchor.origin.skillId = 'piercing-gather'; anchor.detonateAt = 1.5; anchor.explosionRadius = 150;
    game.playerProjectiles = [anchor]; const anchored = drawing(), before = JSON.stringify(game);
    drawPlayerProjectiles(anchored.ctx, game, low);
    expect(anchored.paints.some(p => p.color === '#a9773e' && p.path.includes('circle'))).toBe(true);
    expect(anchored.paints.some(p => p.color === '#87562e' && p.path.includes('close'))).toBe(true);
    expect(anchored.paints.some(p => p.path.includes('pill'))).toBe(false);
    expect(JSON.stringify(game)).toBe(before); expect(anchored.balanced()).toBe(true);
    game.playerProjectiles = []; game.events = [{ type: 'PLAYER_CANNON_EXPLODED', tick: 60,
      data: { x: 300, y: 300, radius: 155, weaponId: 'steady', skillId: 'steady-repulse' } }];
    const pulse = drawing(); drawPlayerProjectiles(pulse.ctx, game, low);
    expect(pulse.paints.some(p => p.color === '#9debd0' && p.path.filter(part => part === 'line').length === 5)).toBe(true);
    expect(pulse.balanced()).toBe(true);
  });
});
