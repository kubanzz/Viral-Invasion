import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtPresentation } from '../../src/render/artPresentation';
import type { HostedSprite } from '../../src/render/phaserHost';
import type { GameState } from '../../src/game/types';
import type { ActorAsset } from '../../src/render/actorAnimation';

const fixture = vi.hoisted(() => ({
  art: { inputSignature: 'weapon-native-fixture', actorContract: { version: 2 }, atlases: [], environments: {},
    assets: {} as Record<string, ActorAsset & { atlas: string; frame: string; flags: string[]; status: string }> },
  sprites: [] as { id: string; config: HostedSprite }[], bridge: undefined as ArtPresentation | undefined,
}));
vi.mock('../../.art-generated/art-runtime.json', () => ({ default: fixture.art }));
// This suite exercises the existing registered PNG renderer, including the
// unsupported-WebGL fallback. Genuine 3D rendering is covered in browser tests.
vi.mock('../../src/render/player3D', () => ({ Player3D: class {
  ready = Promise.resolve(); available = false;
  observe() {} render() {} destroy() {} diagnostics() { return { enabled: true, ready: false }; }
} }));
vi.mock('../../src/render/phaserHost', () => ({ PhaserHost: class {
  ready = Promise.resolve(); isReady = true; scene = { anims: { create() {} } };
  resize() {} startFrameLoop() {} destroy() {} endFrame() {} removeRasterLayer() {} setRasterLayer() {}
  beginFrame() { fixture.sprites = []; } diagnostics() { return {}; }
  sprite(id: string, config: HostedSprite) { fixture.sprites.push({ id, config: { ...config } }); }
} }));
vi.mock('../../src/render/canvasScene', async () => {
  const { Camera } = await import('../../src/render/camera');
  return { CanvasScene: class {
    camera = new Camera(1440, 900);
    constructor(_canvas: HTMLCanvasElement, readonly bridge: ArtPresentation) { fixture.bridge = bridge; }
    resize() {} prepareCamera() {} setHudRects() {} annotateArtEntity() {} diagnostics() { return {}; }
    render(state: GameState) { this.bridge.nativeEntity?.({ id: 'player', kind: 'player', y: state.player.y }, state,
      {} as CanvasRenderingContext2D, 100); }
  } };
});

import { Renderer } from '../../src/render/phaserRenderer';
import { GameSession } from '../../src/game/session';
import { createWeaponCombat } from '../../src/game/weaponSkills';
import { HELD_WEAPON_ART } from '../../src/render/weaponPresentation';
import { fixtureActorAnimationAssets } from '../fixtures/actorAnimationAssets';
import { ACTOR_STATIC_IDS } from '../../src/render/actorAnimation';

function canvas() {
  return { id: 'fixture', width: 1440, height: 900, getContext: () => ({}),
    getBoundingClientRect: () => ({ width: 1440, height: 900 }) } as unknown as HTMLCanvasElement;
}
beforeEach(() => {
  fixture.art.assets = fixtureActorAnimationAssets(); fixture.bridge = undefined; fixture.sprites = [];
  for (const [weaponId, config] of Object.entries(HELD_WEAPON_ART)) {
    const a = structuredClone(fixture.art.assets[ACTOR_STATIC_IDS.emitter]), grip = { x: 160, y: 300 };
    const bounds = weaponId === 'steady' ? { x: 70, y: 220, width: 370, height: 180 } : { x: 130, y: 50, width: 310, height: 410 };
    a.sourceBounds = bounds; a.visibleBounds = { x: bounds.x / 2, y: bounds.y / 2, width: bounds.width / 2, height: bounds.height / 2 };
    a.frame = config.id; a.pivot = { x: grip.x / 512, y: grip.y / 512 }; a.sourceMuzzle = { x: 430, y: 256 };
    a.actorRegistration = { canvas: { width: 512, height: 512 }, foot: grip, grip, muzzle: { ...a.sourceMuzzle }, commonCanvasScale: 1 };
    a.animation = { group: config.id, index: 0, frameCount: 1, fps: 1, approved: true }; fixture.art.assets[config.id] = a;
  }
  vi.stubGlobal('innerWidth', 1440); vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal('document', { createElement: canvas, querySelector: () => null, body: { dataset: {} } });
});
afterEach(() => vi.unstubAllGlobals());

describe('held weapon dispatch through the real Renderer', () => {
  it.each(['steady', 'piercing'] as const)('renders %s from its own registered source and bridges the actual native muzzle', async weaponId => {
    const session = new GameSession(71, { mode: 'endless' }); session.start(); const state = session.state;
    state.weaponCombat = createWeaponCombat({ weaponId, rarity: 'white', upgrade: 0 }); state.effects = []; state.events = [];
    Object.assign(state.player, { x: 500, y: 500 });
    const renderer = new Renderer(canvas()); await renderer.ready;
    for (const facing of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 4]) {
      state.player.facing = facing; state.tick++; state.elapsed = state.tick / 60;
      const castId = `fixture:${weaponId}:${state.tick}`;
      state.events = [{ tick: state.tick, type: 'PLAYER_PROJECTILE_LAUNCHED', data: { castId, kind: 'primary', x: 500, y: 500,
        aimX: 500 + Math.cos(facing) * 300, aimY: 500 + Math.sin(facing) * 300 } }];
      renderer.render(state, { x: 600, y: 500 });
      const config = HELD_WEAPON_ART[weaponId], tool = fixture.sprites.find(s => s.id === 'player:tool')!.config;
      expect(tool.frame).toBe(config.id); expect(tool.flipY).toBe(Math.cos(facing) < 0);
      expect(renderer.diagnostics(state).art.weapon).toMatchObject({ weaponId, assetId: config.id, requestedAssetId: config.id });
      const registered = fixture.art.assets[config.id], sourceMuzzle = registered.sourceMuzzle!;
      // Recover the point from the actual submitted texture transform, independently of paintedToolMuzzle().
      const tx = sourceMuzzle.x / 512, ty = tool.flipY ? 1 - sourceMuzzle.y / 512 : sourceMuzzle.y / 512;
      const x = (tx - tool.originX!) * tool.width!, y = (ty - tool.originY!) * tool.height!, angle = tool.rotation ?? 0;
      const submitted = { x: tool.x + x * Math.cos(angle) - y * Math.sin(angle), y: tool.y + x * Math.sin(angle) + y * Math.cos(angle) };
      const muzzle = fixture.bridge!.projectileOrigin!(castId), screen = renderer.camera.worldToScreen(muzzle!);
      expect(screen.x).toBeCloseTo(submitted.x, 7); expect(screen.y).toBeCloseTo(submitted.y, 7);
    }
    renderer.destroy();
  });

  it('reports a requested new identity while visibly falling back when its grip registration is incomplete', async () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start();
    session.state.weaponCombat = createWeaponCombat({ weaponId: 'piercing', rarity: 'white', upgrade: 0 });
    delete fixture.art.assets[HELD_WEAPON_ART.piercing.id].actorRegistration!.grip;
    const renderer = new Renderer(canvas()); await renderer.ready; renderer.render(session.state, { x: 600, y: 500 });
    expect(fixture.sprites.find(s => s.id === 'player:tool')!.config.frame).toBe(ACTOR_STATIC_IDS.emitter);
    expect(renderer.diagnostics(session.state).art.weapon).toMatchObject({ requestedAssetId: HELD_WEAPON_ART.piercing.id, assetId: ACTOR_STATIC_IDS.emitter });
    renderer.destroy();
  });

  it('holds the charge and real heavy-launch muzzle on its committed axis while the player changes aim', async () => {
    const session = new GameSession(71, { mode: 'endless' }); session.start(); const state = session.state;
    state.weaponCombat = createWeaponCombat({ weaponId: 'piercing', rarity: 'white', upgrade: 0 });
    state.events = []; state.effects = []; state.player.facing = Math.PI;
    state.weaponCombat.preparation = { castId: 'locked-heavy', firesAt: state.elapsed + .45, direction: { x: 1, y: 0 }, damage: 112 };
    const renderer = new Renderer(canvas()); await renderer.ready;
    renderer.render(state, { x: state.player.x - 200, y: state.player.y });
    expect(fixture.sprites.find(s => s.id === 'player:tool')!.config.rotation).toBe(0);
    expect(fixture.sprites.find(s => s.id === 'player:tool')!.config.flipY).toBe(false);
    delete state.weaponCombat.preparation;
    state.events = [{ type: 'PLAYER_PROJECTILE_LAUNCHED', tick: state.tick, data: { kind: 'primary', castId: 'locked-heavy',
      weaponId: 'piercing', skillId: 'piercing-heavy', x: state.player.x, y: state.player.y, aimX: state.player.x + 700, aimY: state.player.y } }];
    renderer.render(state, { x: state.player.x - 200, y: state.player.y });
    const tool = fixture.sprites.find(s => s.id === 'player:tool')!.config;
    expect(tool.flipY).toBe(false); expect(Math.abs(tool.rotation ?? 0)).toBeLessThan(.11);
    expect(fixture.bridge!.projectileOrigin!('locked-heavy')).toBeDefined();
    state.tick++; state.elapsed += 1 / 60; renderer.render(state, { x: state.player.x - 200, y: state.player.y });
    expect(fixture.sprites.find(s => s.id === 'player:tool')!.config.flipY).toBe(true);
    renderer.destroy();
  });
});
