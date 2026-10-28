import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtPresentation, SceneEntity } from '../../src/render/artPresentation';
import type { HostedSprite } from '../../src/render/phaserHost';
import type { Effect, GameState, Target } from '../../src/game/types';
import type { ImmuneCellState } from '../../src/game/immuneCells';
import type { BeaconState } from '../../src/game/growthTypes';
import type { TraitId } from '../../src/game/battleTypes';

interface FixtureAsset {
  atlas: string; frame: string; width: number; height: number;
  pivot: { x: number; y: number }; visibleBounds: { x: number; y: number; width: number; height: number };
  sourceSize?: { width: number; height: number }; sourceBounds?: { x?: number; y?: number; width?: number; height: number };
  flags: string[]; status: string; animation?: unknown; aliasOf?: string; sourceMuzzle?: { x: number; y: number };
}
interface Paint { method: string; color: string; alpha: number; path: string[]; position?: { x: number; y: number } }
interface RecordedContext extends CanvasRenderingContext2D { paints: Paint[]; rotations: number[] }
interface TestScene { bridge: ArtPresentation; ctx: RecordedContext; fallbacks: string[]; annotations: { id: string; halfWidth: number; above: number }[] }
interface TestHost {
  sprites: { id: string; config: HostedSprite }[];
  rasters: { key: string; depth: number; paints: Paint[] }[];
}
const mocked = vi.hoisted(() => ({
  runtime: { inputSignature: 'isolated-native-dispatch', atlases: [], environments: {}, assets: {} as Record<string, FixtureAsset> },
  entities: [] as SceneEntity[], scenes: [] as TestScene[], hosts: [] as TestHost[],
}));

vi.mock('../../.art-generated/art-runtime.json', () => ({ default: mocked.runtime }));
vi.mock('../../src/render/phaserHost', () => ({ PhaserHost: class {
  readonly ready = Promise.resolve(); readonly isReady = true;
  readonly scene = { anims: { exists: () => false, create: vi.fn() } };
  sprites: TestHost['sprites'] = []; rasters: TestHost['rasters'] = [];
  constructor() { mocked.hosts.push(this); }
  resize() {} startFrameLoop() {} destroy() {} endFrame() {} removeRasterLayer() {}
  diagnostics() { return {}; }
  beginFrame() {
    this.sprites = []; this.rasters = [];
    for (const scene of mocked.scenes) { scene.ctx.paints.length = 0; scene.ctx.rotations.length = 0; scene.fallbacks.length = 0; scene.annotations.length = 0; }
  }
  sprite(id: string, config: HostedSprite) { this.sprites.push({ id, config: { ...config } }); return {}; }
  setRasterLayer(key: string, source: HTMLCanvasElement, depth: number) {
    this.rasters.push({ key, depth, paints: structuredClone((source.getContext('2d') as RecordedContext).paints) });
  }
} }));
vi.mock('../../src/render/canvasScene', async () => {
  const { Camera } = await import('../../src/render/camera');
  return { CanvasScene: class {
    readonly camera = new Camera(1440, 900); readonly ctx: RecordedContext; fallbacks: string[] = []; annotations: TestScene['annotations'] = [];
    constructor(canvas: HTMLCanvasElement, readonly bridge: ArtPresentation) {
      this.ctx = canvas.getContext('2d') as RecordedContext; mocked.scenes.push(this);
    }
    resize() {} prepareCamera() {} setHudRects() {}
    annotateArtEntity(_ctx: CanvasRenderingContext2D, entity: SceneEntity, _state: GameState, halfWidth: number, above: number) {
      this.annotations.push({ id: entity.id, halfWidth, above });
    }
    diagnostics() { return {}; }
    render(state: GameState) {
      for (const [index, entity] of mocked.entities.entries()) {
        if (!this.bridge.nativeEntity(entity, state, this.ctx, 100 + index * 3)) this.fallbacks.push(entity.id);
      }
    }
  } };
});

import { Renderer } from '../../src/render/phaserRenderer';
import { GameSession } from '../../src/game/session';
import { immuneCellBody } from '../../src/render/immuneVisuals';
import { MotherCoreController, MOTHER_CORE_BALANCE } from '../../src/game/motherCore';
import type { InputFrame } from '../../src/game/types';
import { fixtureHeroAnimationAssets } from '../fixtures/heroAnimationAssets';
import { fixturePaintedToolAsset, PAINTED_TOOL_FIXTURE_GRIP } from '../fixtures/paintedToolAsset';
import { aimedPaintedTool, paintedToolMuzzle } from '../../src/render/spriteGeometry';

function recordedContext(): RecordedContext {
  const paints: Paint[] = [], rotations: number[] = [], stack: { alpha: number; fill: string; stroke: string }[] = [];
  let path: string[] = [];
  const ctx = {
    paints, rotations, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() { stack.push({ alpha: this.globalAlpha, fill: this.fillStyle, stroke: this.strokeStyle }); },
    restore() { const previous = stack.pop()!; this.globalAlpha = previous.alpha; this.fillStyle = previous.fill; this.strokeStyle = previous.stroke; },
    setTransform() {}, clearRect() { paints.length = 0; }, translate() {}, scale() {}, setLineDash() {},
    rotate(angle: number) { rotations.push(angle); },
    beginPath() { path = []; }, closePath() { path.push('closePath'); },
    moveTo() { path.push('moveTo'); }, lineTo() { path.push('lineTo'); },
    ellipse() { path.push('ellipse'); }, arc() { path.push('arc'); },
    roundRect() { path.push('roundRect'); },
    fill() { paints.push({ method: 'fill', color: this.fillStyle, alpha: this.globalAlpha, path: [...path] }); },
    stroke() { paints.push({ method: 'stroke', color: this.strokeStyle, alpha: this.globalAlpha, path: [...path] }); },
    fillText(value: string, x: number, y: number) { paints.push({ method: 'text', color: this.fillStyle, alpha: this.globalAlpha, path: [value], position: { x, y } }); },
    fillRect() {}, strokeRect(...args: number[]) { paints.push({ method: 'strokeRect', color: this.strokeStyle, alpha: this.globalAlpha, path: [args.join(',')] }); },
  };
  return ctx as unknown as RecordedContext;
}
function canvas(): HTMLCanvasElement {
  const ctx = recordedContext();
  return { id: '', width: 1440, height: 900, getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 1440, height: 900 }) } as unknown as HTMLCanvasElement;
}
function asset(id: string, visibleHeight = 40, sourceHeight = 600): FixtureAsset {
  return { atlas: 'test-atlas', frame: id, width: 100, height: 100, pivot: { x: .5, y: .9 },
    visibleBounds: { x: 10, y: 10, width: 80, height: visibleHeight },
    sourceSize: { width: 1024, height: 1024 }, sourceBounds: { height: sourceHeight }, flags: [], status: 'test-only' };
}
function cell(changes: Partial<ImmuneCellState> = {}): ImmuneCellState {
  return { id: 'cell', beaconId: 'beacon', organId: 'heart', x: 400, y: 400, radius: 15,
    born: 0, until: 5, facing: 0, damage: 8, interval: .8, updatedAt: 1, attackReadyAt: 2,
    attackUntil: 1.2, targetId: 'parent', activity: 'biting', navigationAt: 1, waypoint: null, ...changes };
}
function beacon(changes: Partial<BeaconState> = {}): BeaconState {
  return { id: 'beacon', organId: 'heart', x: 420, y: 400, born: 0, until: 5, radius: 160,
    damage: 12, interval: .8, nextAttackAt: 2, tuning: 'balanced', mode: 'protocol', ...changes };
}
function state(): GameState {
  const state = new GameSession(17, { campaign: true, milestone: 'G3' }).snapshot();
  state.phase = 'playing'; state.elapsed = 1; state.tick = 60; state.effects = [];
  state.targets = []; state.growth!.cells = []; return state;
}
function target(id: string, changes: Partial<Target> = {}): Target {
  return { id, kind: 'single', role: 'virus', x: 500, y: 400, radius: 24, hp: 30, maxHp: 30,
    hitUntil: 0, scanned: false, traits: ['FISSION'], generation: 0, ...changes };
}
async function setup() {
  const renderer = new Renderer(canvas()); await renderer.ready;
  return { renderer, host: mocked.hosts[0], scene: mocked.scenes[0] };
}
function visibleHeight(sprite: HostedSprite, fixture: FixtureAsset) {
  return sprite.height * fixture.visibleBounds.height / fixture.height;
}
function motherAssets() {
  const boxes: Record<string, [number, number, number, number, number]> = {
    'mother.base': [168, 150, 688, 700, .39], 'mother.core.exposed': [444, 460, 138, 126, .83],
    'mother.membrane': [428, 448, 168, 160, .71], 'mother.carapace': [160, 140, 704, 520, .36],
    'mother.fission': [190, 350, 644, 400, .45], 'mother.mimic': [100, 100, 824, 700, .28],
    'mother.purified': [250, 640, 524, 210, .51],
  };
  for (const [id, [x, y, width, height, density]] of Object.entries(boxes)) {
    // Independent per-layer atlas trims, dimensions and integer resize rounding.
    const packedW = Math.round(width * density), packedH = Math.round(height * density);
    const sourceX = packedW / width, sourceY = packedH / height;
    const anchorX = 8 + (512 - x) * sourceX, anchorY = 8 + (850 - y) * sourceY;
    const outputW = Math.ceil(Math.max(packedW + 16, anchorX + 8)), outputH = Math.ceil(Math.max(packedH + 16, anchorY + 8));
    mocked.runtime.assets[id] = { atlas: 'mother-atlas', frame: id, width: outputW, height: outputH,
      pivot: { x: (anchorX + .25) / outputW, y: (anchorY - .25) / outputH },
      visibleBounds: { x: 8, y: 8, width: packedW, height: packedH }, sourceSize: { width: 1024, height: 1024 },
      sourceBounds: { x, y, width, height }, flags: ['test-only-layer'], status: 'test-only' };
  }
}
function motherFixture(traits: TraitId[] = ['CARAPACE', 'FISSION']) {
  motherAssets(); const sample = state(); sample.elapsed = 2.5;
  const actor = target('mother', { role: 'core', radius: 50, traits, x: 500, y: 400 }); sample.targets = [actor];
  const combat = new MotherCoreController({ coreId: actor.id, organId: 'heart', traits, tick: sample.tick, elapsed: 0 }).state;
  combat.phase = 'windup'; sample.campaign!.core.combat = combat;
  mocked.entities.push({ id: actor.id, kind: 'target', index: 0, y: actor.y });
  return { sample, actor, combat };
}
function sourcePoint(sprite: HostedSprite, fixture: FixtureAsset, x: number, y: number) {
  const b = fixture.sourceBounds!, v = fixture.visibleBounds;
  const atlasX = v.x + (x - b.x!) * v.width / b.width!, atlasY = v.y + (y - b.y!) * v.height / b.height;
  const px = ((sprite.flipX ? fixture.width - atlasX : atlasX) / fixture.width - sprite.originX!) * sprite.width;
  const py = ((sprite.flipY ? fixture.height - atlasY : atlasY) / fixture.height - sprite.originY!) * sprite.height;
  const rotation = sprite.rotation ?? 0;
  return { x: sprite.x + px * Math.cos(rotation) - py * Math.sin(rotation),
    y: sprite.y + px * Math.sin(rotation) + py * Math.cos(rotation) };
}
const heroInput = (changes: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0, fire: false, aim: { x: 700, y: 440 }, ...changes });

beforeEach(() => {
  mocked.entities.length = 0; mocked.hosts.length = 0; mocked.scenes.length = 0;
  for (const key of Object.keys(mocked.runtime.assets)) delete mocked.runtime.assets[key];
  for (const id of ['hero.idle', 'hero.walk', 'enemy.basic', 'enemy.fission.parent', 'enemy.fission.child', 'source.infection', 'immune.cell.idle', 'immune.beacon', 'scenery.heartTissueA', 'scenery.heartTissueB']) mocked.runtime.assets[id] = asset(id);
  mocked.runtime.assets['immune.cell.bite'] = asset('immune.cell.bite', 60, 900);
  vi.stubGlobal('document', { createElement: canvas, querySelector: () => null, body: { dataset: {} } });
  vi.stubGlobal('innerWidth', 1440); vi.stubGlobal('innerHeight', 900);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('actual Renderer native art dispatch through an isolated host', () => {
  it('fades only overlapping tissue in front of the current player body while retaining its real state annotation', async () => {
    for (const id of ['tissue.unstable', 'tissue.restored']) mocked.runtime.assets[id] = asset(id);
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets());
    const { renderer, host, scene } = await setup(), sample = state();
    sample.tissue.x = 500; sample.tissue.y = 400;
    sample.player.x = sample.tissue.x; sample.player.y = sample.tissue.y;
    mocked.entities.push({ id: 'player', kind: 'player', y: sample.player.y }, { id: 'tissue', kind: 'tissue', y: sample.tissue.y });
    for (const restored of [false, true]) {
      sample.tissue.hp = restored ? sample.tissue.maxHp : sample.tissue.maxHp - 10;
      for (const [dx, dy, alpha] of [[0, 0, .28], [0, -15, .28], [0, 1, 1], [200, 0, 1]] as const) {
        sample.player.x = sample.tissue.x + dx; sample.player.y = sample.tissue.y + dy;
        sample.player.moving = true; sample.player.facing = Math.PI; const before = JSON.stringify(sample);
        renderer.render(sample, sample.player);
        const tissue = host.sprites.find(item => item.id === 'tissue')!;
        expect(tissue.config.frame).toBe(restored ? 'tissue.restored' : 'tissue.unstable');
        expect(tissue.config.alpha).toBe(alpha);
        expect(host.sprites.find(item => item.id === 'player')!.config.alpha ?? 1).toBe(1);
        expect(scene.annotations.some(annotation => annotation.id === 'tissue')).toBe(true);
        expect(scene.fallbacks).toEqual([]); expect(JSON.stringify(sample)).toBe(before);
      }
    }
  });

  it('leaves missing tissue art to fallback and does not fade tissue for a tool-only overlap', async () => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets()); mocked.runtime.assets['weapon.emitter.painted'] = fixturePaintedToolAsset();
    const { renderer, host, scene } = await setup(), sample = state();
    sample.player.x = 500; sample.player.y = 400; sample.player.facing = 0;
    mocked.entities.push({ id: 'player', kind: 'player', y: 400 }, { id: 'tissue', kind: 'tissue', y: 400 });
    sample.tissue.x = sample.player.x + 45; sample.tissue.y = sample.player.y;
    const before = JSON.stringify(sample); renderer.render(sample, sample.player);
    expect(scene.fallbacks).toEqual(['tissue']); expect(host.sprites.some(item => item.id === 'tissue')).toBe(false);
    expect(JSON.stringify(sample)).toBe(before);
    const tissue = asset('tissue.unstable'); tissue.visibleBounds.width = 5; tissue.pivot.x = .1;
    mocked.runtime.assets['tissue.unstable'] = tissue;
    // Its narrow body overlaps the aimed tool's extended player envelope, while
    // the registered torso remains separate. The tool alone must not fade it.
    renderer.render(sample, sample.player);
    const extended = renderer.diagnostics(sample).art.activeBodies.find(item => item.id === 'player')!.bounds;
    expect(extended.right).toBeGreaterThan(sample.tissue.x - 2);
    const withArt = JSON.stringify(sample); renderer.render(sample, sample.player);
    expect(host.sprites.find(item => item.id === 'tissue')!.config.alpha).toBe(1);
    expect(scene.annotations.some(annotation => annotation.id === 'tissue')).toBe(true);
    expect(scene.fallbacks).toEqual([]); expect(JSON.stringify(sample)).toBe(withArt);
  });

  it('selects independent parent/child bodies, retains infection-source precedence and leaves cores/dead targets to fallback', async () => {
    const { renderer, host, scene } = await setup(), sample = state();
    sample.targets = [target('parent'), target('child', { generation: 1 }), target('grandchild', { generation: 2 }),
      target('core', { role: 'core' }), target('source', { role: 'source' }), target('dead', { hp: 0 })];
    mocked.entities.push(...sample.targets.map((actor, index) => ({ id: actor.id, kind: 'target', index, y: actor.y })));
    const before = JSON.stringify(sample); renderer.render(sample, sample.player);
    expect(host.sprites.map(item => [item.id, item.config.frame])).toEqual([
      ['parent', 'enemy.fission.parent'], ['child', 'enemy.fission.child'], ['grandchild', 'enemy.fission.child'], ['source', 'source.infection'],
    ]);
    expect(scene.fallbacks).toEqual(['core', 'dead']);
    expect(JSON.stringify(sample)).toBe(before);
    delete mocked.runtime.assets['enemy.fission.child']; renderer.render(sample, sample.player);
    expect(scene.fallbacks).toEqual(['child', 'grandchild', 'core', 'dead']);
    expect(host.sprites.some(item => item.id === 'child')).toBe(false);
  });

  it('keeps compound-trait concealment and armour/parent feedback tied to the real state', async () => {
    const { renderer, host, scene } = await setup(), sample = state();
    sample.targets = [target('parent', { traits: ['CARAPACE', 'MIMIC', 'FISSION'], facing: .6 })];
    mocked.entities.push({ id: 'parent', kind: 'target', index: 0, y: 400 });
    renderer.render(sample, sample.player);
    expect(host.sprites[0].config.frame).toBe('enemy.fission.parent'); expect(host.sprites[0].config.alpha).toBe(.5);
    expect(scene.ctx.paints.some(paint => paint.color === '#6d386a')).toBe(true);
    expect(scene.ctx.paints.some(paint => paint.path.includes('Ⅱ'))).toBe(true);
    sample.targets[0].exposedUntil = 2; const before = JSON.stringify(sample); renderer.render(sample, sample.player);
    expect(host.sprites[0].config.alpha).toBe(1);
    expect(scene.ctx.paints.some(paint => paint.color === '#fff2cf')).toBe(true);
    expect(JSON.stringify(sample)).toBe(before);
  });

  it.each([0, Math.PI, Math.PI * 2 - .3, Math.PI + .3])('uses the aligned bite only near horizontal facing %s with a shared source scale', async facing => {
    const { renderer, host } = await setup(), sample = state(); sample.growth!.cells = [cell({ facing })];
    mocked.entities.push({ id: 'cell', kind: 'immune', index: 0, y: 400 });
    const before = JSON.stringify(sample); renderer.render(sample, sample.player);
    const bite = host.sprites[0].config;
    expect(bite.frame).toBe('immune.cell.bite'); expect(bite.flipX).toBe(Math.cos(facing) < 0); expect(bite.rotation ?? 0).toBe(0);
    expect(visibleHeight(bite, mocked.runtime.assets['immune.cell.bite'])).toBeCloseTo(54);
    expect(visibleHeight(bite, mocked.runtime.assets['immune.cell.bite']) / 900).toBeCloseTo(36 / 600);
    const bounds = renderer.diagnostics(sample).art.activeBodies.find(item => item.id === 'cell')!.bounds;
    const source = mocked.runtime.assets['immune.cell.bite'], offset = renderer.camera.worldToScreen({ x: 0, y: 0 });
    const xs = [source.visibleBounds.x, source.visibleBounds.x + source.visibleBounds.width]
      .map(x => bite.flipX ? source.width - x : x)
      .map(x => bite.x + (x / source.width - bite.originX!) * bite.width);
    const ys = [source.visibleBounds.y, source.visibleBounds.y + source.visibleBounds.height]
      .map(y => bite.y + (y / source.height - bite.originY!) * bite.height);
    expect(bounds.left + offset.x).toBeLessThanOrEqual(Math.min(...xs));
    expect(bounds.right + offset.x).toBeGreaterThanOrEqual(Math.max(...xs));
    expect(bounds.top + offset.y).toBeLessThanOrEqual(Math.min(...ys));
    expect(bounds.bottom + offset.y).toBeGreaterThanOrEqual(Math.max(...ys));
    expect(JSON.stringify(sample)).toBe(before);
    sample.elapsed = sample.growth!.cells![0].attackUntil; renderer.render(sample, sample.player);
    expect(host.sprites[0].config.frame).toBe('immune.cell.idle');
    expect(visibleHeight(host.sprites[0].config, mocked.runtime.assets['immune.cell.idle'])).toBeCloseTo(36);
  });

  it.each([Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI * .75])('retains idle and the actual directional bite arc for unsupported facing %s', async facing => {
    const { renderer, host, scene } = await setup(), sample = state(); sample.growth!.cells = [cell({ facing })];
    mocked.entities.push({ id: 'cell', kind: 'immune', index: 0, y: 400 });
    const before = JSON.stringify(sample); renderer.render(sample, sample.player, { lowEffects: true });
    expect(host.sprites[0].config.frame).toBe('immune.cell.idle');
    expect(scene.ctx.paints.some(paint => paint.color === '#e3ffba' && paint.path.includes('arc'))).toBe(true);
    expect(scene.ctx.rotations).toContainEqual(immuneCellBody(sample.growth!.cells![0], sample.elapsed).rotation);
    expect(JSON.stringify(sample)).toBe(before);
  });

  it('requires matching logical canvases and source bounds, then falls back completely if idle is unavailable', async () => {
    const { renderer, host, scene } = await setup(), sample = state(); sample.growth!.cells = [cell()];
    mocked.entities.push({ id: 'cell', kind: 'immune', index: 0, y: 400 });
    const bite = mocked.runtime.assets['immune.cell.bite']; delete mocked.runtime.assets['immune.cell.bite'];
    renderer.render(sample, sample.player);
    expect(host.sprites[0].config.frame).toBe('immune.cell.idle');
    expect(scene.ctx.paints.some(paint => paint.color === '#e3ffba' && paint.path.includes('arc'))).toBe(true);
    mocked.runtime.assets['immune.cell.bite'] = bite;
    mocked.runtime.assets['immune.cell.bite'].sourceSize!.width = 512; renderer.render(sample, sample.player);
    expect(host.sprites[0].config.frame).toBe('immune.cell.idle');
    mocked.runtime.assets['immune.cell.bite'].sourceSize!.width = 1024; delete mocked.runtime.assets['immune.cell.bite'].sourceBounds;
    renderer.render(sample, sample.player); expect(host.sprites[0].config.frame).toBe('immune.cell.idle');
    delete mocked.runtime.assets['immune.cell.idle']; renderer.render(sample, sample.player);
    expect(host.sprites).toEqual([]); expect(scene.fallbacks).toEqual(['cell']); expect(host.rasters).toEqual([]);
  });

  it('submits a separate ground shadow below each native body, preserves timed alpha and draws only essential accents above it', async () => {
    const { renderer, host, scene } = await setup(), sample = state(); sample.elapsed = .1;
    sample.growth!.cells = [cell(), cell({ id: 'cell-2', x: 450 }), cell({ id: 'cell-3', x: 500 })];
    mocked.entities.push(...sample.growth!.cells!.map((actor, index) => ({ id: actor.id, kind: 'immune', index, y: actor.y })));
    const before = JSON.stringify(sample); renderer.render(sample, sample.player, { lowEffects: true });
    expect(host.sprites).toHaveLength(3); expect(host.rasters).toHaveLength(3);
    for (const [index, item] of host.sprites.entries()) {
      expect(item.config.depth).toBe(100 + index * 3); expect(item.config.alpha).toBeCloseTo(.5);
      expect(host.rasters[index].key).toBe(`immune-shadow:${item.id}`); expect(host.rasters[index].depth).toBe(1);
      expect(host.rasters[index].paints).toEqual([{ method: 'fill', color: '#45685d35', alpha: .5, path: ['ellipse'] }]);
    }
    expect(scene.ctx.paints.every(paint => paint.method === 'stroke')).toBe(true);
    expect(scene.ctx.paints.filter(paint => paint.color === '#e3ffba')).toHaveLength(3);
    expect(scene.ctx.paints.filter(paint => paint.color === '#c7efb5')).toHaveLength(3);
    expect(renderer.diagnostics(sample).art.activeBodies).toHaveLength(3);
    expect(JSON.stringify(sample)).toBe(before);
    sample.elapsed = 5; renderer.render(sample, sample.player);
    expect(host.sprites).toEqual([]); expect(host.rasters).toEqual([]); expect(scene.fallbacks).toEqual([]);
  });

  it('uses one 54px native protocol beacon with its actual annotation anchor and no procedural body submission', async () => {
    const { renderer, host, scene } = await setup(), sample = state(); sample.growth!.beacon = beacon();
    mocked.entities.push({ id: 'beacon', kind: 'beacon', y: 400 });
    const before = JSON.stringify(sample); renderer.render(sample, sample.player);
    expect(host.sprites.map(item => [item.id, item.config.frame, item.config.depth])).toEqual([['beacon', 'immune.beacon', 100]]);
    expect(visibleHeight(host.sprites[0].config, mocked.runtime.assets['immune.beacon'])).toBeCloseTo(54);
    expect(scene.annotations).toHaveLength(1); expect(scene.annotations[0].id).toBe('beacon');
    expect(scene.fallbacks).toEqual([]); expect(host.rasters).toEqual([]); expect(scene.ctx.paints).toEqual([]);
    expect(renderer.diagnostics(sample).art.activeBodies.map(item => item.id)).toEqual(['beacon']);
    expect(JSON.stringify(sample)).toBe(before);
    delete mocked.runtime.assets['immune.beacon']; renderer.render(sample, sample.player);
    expect(host.sprites).toEqual([]); expect(scene.fallbacks).toEqual(['beacon']);
  });

  it('shows patrol information without a device and suppresses expired or other-organ beacon entities', async () => {
    const { renderer, host, scene } = await setup(), sample = state(); sample.growth!.beacon = beacon({ mode: 'patrol' });
    mocked.entities.push({ id: 'beacon', kind: 'beacon', y: 400 });
    renderer.render(sample, sample.player);
    expect(host.sprites).toEqual([]); expect(scene.fallbacks).toEqual([]);
    expect(scene.annotations).toEqual([{ id: 'beacon', halfWidth: 0, above: 0 }]);
    expect(renderer.diagnostics(sample).art.activeBodies).toEqual([]);
    for (const changes of [{ mode: 'protocol', until: 1 }, { mode: 'protocol', organId: 'lung' }] as const) {
      sample.growth!.beacon = beacon(changes); const before = JSON.stringify(sample); renderer.render(sample, sample.player);
      expect(host.sprites).toEqual([]); expect(scene.annotations).toEqual([]); expect(scene.fallbacks).toEqual([]);
      expect(JSON.stringify(sample)).toBe(before);
    }
  });

  it('protects the actual native beacon body behind obstacles and foreground, with no phantom protection for patrols', async () => {
    const { renderer, host, scene } = await setup(), sample = state(); sample.growth!.beacon = beacon();
    sample.player.x = 20; sample.player.y = 20;
    sample.world = { width: 1200, height: 800, bounds: { left: 0, top: 0, right: 1200, bottom: 800 },
      obstacles: [{ id: 'fold', x: 420, y: 430, radius: 70 }], foreground: { x: 400, y: 350, width: 40, height: 100 } };
    mocked.entities.push({ id: 'beacon', kind: 'beacon', y: 400 }, { id: 'fold', kind: 'obstacle', y: 430 });
    const before = JSON.stringify(sample); renderer.render(sample, sample.player);
    expect(host.sprites.find(item => item.id === 'fold')!.config.alpha).toBe(.22);
    expect(scene.bridge.actorBodies(sample).filter(body => body.kind === 'beacon').map(body => body.id)).toEqual(['beacon']);
    scene.bridge.foreground(sample, renderer.camera);
    expect(host.sprites.find(item => item.id === 'foreground:main')!.config.alpha).toBe(.2);
    expect(JSON.stringify(sample)).toBe(before);
    sample.growth!.beacon!.y = 450; renderer.render(sample, sample.player);
    expect(host.sprites.find(item => item.id === 'fold')!.config.alpha).toBe(1);
    expect(scene.bridge.actorBodies(sample).some(body => body.kind === 'beacon')).toBe(false);
    sample.growth!.beacon!.y = 400; sample.growth!.beacon!.mode = 'patrol'; renderer.render(sample, sample.player);
    expect(host.sprites.find(item => item.id === 'fold')!.config.alpha).toBe(1);
    expect(scene.bridge.actorBodies(sample).some(body => body.kind === 'beacon')).toBe(false);
    scene.bridge.foreground(sample, renderer.camera);
    expect(host.sprites.find(item => item.id === 'foreground:main')!.config.alpha).toBe(.78);
  });

  it('registers every mother layer to the same source scale and foot anchor despite independently packed alpha bounds', async () => {
    const f = motherFixture(), { renderer, host, scene } = await setup(), before = JSON.stringify(f.sample), assetsBefore = JSON.stringify(mocked.runtime.assets);
    renderer.render(f.sample, f.sample.player);
    expect(host.sprites.map(item => item.config.frame)).toEqual(['mother.base', 'mother.fission', 'mother.carapace', 'mother.core.exposed', 'mother.membrane']);
    const foot = renderer.camera.worldToScreen(f.actor), expected = { x: foot.x + .2, y: foot.y - 327 * .2 - 3 };
    for (const [index, item] of host.sprites.entries()) {
      const source = mocked.runtime.assets[String(item.config.frame)], bounds = source.sourceBounds!;
      expect(visibleHeight(item.config, source) / bounds.height).toBeCloseTo(.2, 10);
      const actual = sourcePoint(item.config, source, 513, 523);
      expect(actual.x).toBeCloseTo(expected.x, 10); expect(actual.y).toBeCloseTo(expected.y, 10);
      expect(item.config.depth).toBeCloseTo(100 + index * .1); expect(item.config.depth).toBeLessThan(103);
    }
    expect(renderer.diagnostics(f.sample).art.activeBodies[0].bounds).toEqual({ left: 427.6, right: 572.4, top: 141, bottom: 287 });
    expect(renderer.diagnostics(f.sample).art.provisional).toContain('mother-static-layers');
    expect(renderer.diagnostics(f.sample).art.provisional).toContain('missing-continuous-mother-animation');
    expect(renderer.diagnostics(f.sample).art.provisional).not.toContain('mother-core');
    expect(scene.fallbacks).toEqual([]); expect(scene.annotations).toHaveLength(1);
    expect(JSON.stringify(f.sample)).toBe(before); expect(JSON.stringify(mocked.runtime.assets)).toBe(assetsBefore);
  });

  it('uses real remaining membranes and exposure deadlines without inventing extra layer bodies', async () => {
    const f = motherFixture(), { renderer, host, scene } = await setup();
    for (const remaining of [2, 1, 0]) {
      f.combat.membrane.remaining = remaining; const before = JSON.stringify(f.sample); renderer.render(f.sample, f.sample.player);
      expect(host.sprites.filter(item => item.config.frame === 'mother.membrane')).toHaveLength(remaining > 0 ? 1 : 0);
      expect(host.sprites.filter(item => item.config.frame === 'mother.base')).toHaveLength(1); expect(JSON.stringify(f.sample)).toBe(before);
    }
    delete mocked.runtime.assets['mother.membrane']; renderer.render(f.sample, f.sample.player);
    expect(scene.fallbacks).toEqual([]);
    expect(renderer.diagnostics(f.sample).art.provisional).toContain('mother-core');
    f.combat.membrane.remaining = 1; renderer.render(f.sample, f.sample.player);
    expect(scene.fallbacks).toEqual(['mother']); expect(host.sprites).toEqual([]); expect(scene.annotations).toEqual([]);
    for (const owner of [f.combat, f.actor]) {
      owner.exposedUntil = f.sample.elapsed + .2; renderer.render(f.sample, f.sample.player);
      expect(scene.fallbacks).toEqual([]); expect(host.sprites.some(item => item.config.frame === 'mother.membrane')).toBe(false);
      const glyph = scene.ctx.paints.find(paint => paint.path.includes('◇'))!;
      expect(glyph.position!.x).toBeCloseTo(.2); expect(glyph.position!.y).toBeCloseTo(-327 * .2 - 3 + 4);
      owner.exposedUntil = f.sample.elapsed; renderer.render(f.sample, f.sample.player);
      expect(scene.fallbacks).toEqual(['mother']); expect(host.sprites).toEqual([]);
    }
  });

  it.each([['CARAPACE'], ['FISSION'], ['MIMIC'], ['CARAPACE', 'FISSION'], ['CARAPACE', 'MIMIC'], ['FISSION', 'MIMIC']] as TraitId[][])
  ('combines the real mother traits %j and requires no absent-trait attachments', async (...traits) => {
    const f = motherFixture(traits), { renderer, host, scene } = await setup();
    for (const trait of ['CARAPACE', 'FISSION', 'MIMIC'] as const) if (!traits.includes(trait)) delete mocked.runtime.assets[`mother.${trait.toLowerCase()}`];
    const before = JSON.stringify(f.sample); renderer.render(f.sample, f.sample.player);
    expect(scene.fallbacks).toEqual([]);
    expect(host.sprites.map(item => String(item.config.frame)).filter(id => ['mother.carapace', 'mother.fission', 'mother.mimic'].includes(id)).sort())
      .toEqual(traits.map(trait => `mother.${trait.toLowerCase()}`).sort());
    expect(JSON.stringify(f.sample)).toBe(before);
  });

  it('falls back as a whole when any needed mother layer, shared canvas, source metadata or authored anchor is invalid', async () => {
    const f = motherFixture(), { renderer, host, scene } = await setup();
    for (const id of ['mother.base', 'mother.core.exposed', 'mother.carapace', 'mother.fission', 'mother.membrane']) {
      const source = mocked.runtime.assets[id]; delete mocked.runtime.assets[id]; renderer.render(f.sample, f.sample.player);
      expect(scene.fallbacks).toEqual(['mother']); expect(host.sprites).toEqual([]); expect(scene.annotations).toEqual([]);
      mocked.runtime.assets[id] = source;
    }
    const id = 'mother.core.exposed', original = structuredClone(mocked.runtime.assets[id]);
    const mutations = [
      (a: FixtureAsset) => { a.sourceSize!.width = 1254; },
      (a: FixtureAsset) => { delete a.sourceBounds!.width; },
      (a: FixtureAsset) => { a.pivot.y += .05; },
    ];
    for (const mutate of mutations) {
      mocked.runtime.assets[id] = structuredClone(original); mutate(mocked.runtime.assets[id]); renderer.render(f.sample, f.sample.player);
      expect(scene.fallbacks).toEqual(['mother']); expect(host.sprites).toEqual([]);
    }
    mocked.runtime.assets[id] = original; f.combat.organId = 'lung'; renderer.render(f.sample, f.sample.player);
    expect(scene.fallbacks).toEqual(['mother']); expect(host.sprites).toEqual([]);
  });

  it('uses the real MIMIC disturbance, reveal and exposure state for all registered layers', async () => {
    const f = motherFixture(['MIMIC', 'FISSION']), { renderer, host } = await setup();
    renderer.render(f.sample, f.sample.player); expect(host.sprites.some(item => item.config.frame === 'mother.mimic')).toBe(true);
    expect(host.sprites.every(item => item.config.alpha === .68)).toBe(true);
    f.combat.revealedUntil = f.sample.elapsed + .2; renderer.render(f.sample, f.sample.player);
    expect(host.sprites.every(item => item.config.alpha === 1)).toBe(true);
    f.combat.revealedUntil = f.sample.elapsed; f.actor.exposedUntil = f.sample.elapsed + .2; renderer.render(f.sample, f.sample.player);
    expect(host.sprites.every(item => item.config.alpha === 1)).toBe(true);
    f.actor.exposedUntil = f.sample.elapsed; f.combat.activeTrait = 'FISSION'; renderer.render(f.sample, f.sample.player);
    expect(host.sprites.every(item => item.config.alpha === 1)).toBe(true);
    f.combat.activeTrait = 'MIMIC'; f.sample.elapsed = MOTHER_CORE_BALANCE.mimicDisturbance / 2; renderer.render(f.sample, f.sample.player);
    expect(host.sprites.every(item => item.config.alpha === 1)).toBe(true);
  });

  it('uses the current mother layer union and identical live lift for sprites, raised-body protection and foreground', async () => {
    const f = motherFixture(['CARAPACE', 'MIMIC']), { renderer, host, scene } = await setup();
    f.sample.player.x = 20; f.sample.player.y = 20;
    f.sample.world = { width: 1200, height: 800, bounds: { left: 0, top: 0, right: 1200, bottom: 800 },
      obstacles: [{ id: 'fold', x: 500, y: 430, radius: 75 }], foreground: { x: 420, y: 310, width: 30, height: 60 } };
    mocked.entities.push({ id: 'fold', kind: 'obstacle', y: 430 });
    const before = JSON.stringify(f.sample); renderer.render(f.sample, f.sample.player);
    let body = renderer.diagnostics(f.sample).art.activeBodies.find(item => item.id === 'mother')!.bounds;
    expect(body).toEqual({ left: 415.6, right: 584.4, top: 133, bottom: 287 });
    expect(scene.bridge.actorBodies(f.sample).find(actor => actor.id === 'mother')!.bodyBounds).toEqual(body);
    expect(host.sprites.find(item => item.id === 'fold')!.config.alpha).toBe(.22);
    scene.bridge.foreground(f.sample, renderer.camera);
    expect(host.sprites.find(item => item.id === 'foreground:main')!.config.alpha).toBe(.2);
    expect(JSON.stringify(f.sample)).toBe(before);
    f.combat.phase = 'recovery'; renderer.render(f.sample, f.sample.player);
    body = renderer.diagnostics(f.sample).art.activeBodies.find(item => item.id === 'mother')!.bounds;
    expect(body.top).toBe(139); expect(body.bottom).toBe(293);
    expect(scene.bridge.actorBodies(f.sample).find(actor => actor.id === 'mother')!.bodyBounds).toEqual(body);
    const foot = renderer.camera.worldToScreen(f.actor);
    expect(host.sprites.filter(item => String(item.config.frame).startsWith('mother.')).every(item => item.config.y === foot.y + 3)).toBe(true);
    f.combat.traits = ['CARAPACE']; renderer.render(f.sample, f.sample.player);
    const smaller = renderer.diagnostics(f.sample).art.activeBodies.find(item => item.id === 'mother')!.bounds;
    expect(smaller.left).toBeGreaterThan(body.left); expect(smaller.right).toBeLessThan(body.right); expect(smaller.top).toBeGreaterThan(body.top);
  });

  it('shows only the registered purified remnant after actual death and retains its own bounds without live bob', async () => {
    const f = motherFixture(), { renderer, host, scene } = await setup(); f.actor.hp = 0; f.combat.phase = 'defeated';
    for (const id of ['mother.core.exposed', 'mother.carapace', 'mother.fission', 'mother.mimic', 'mother.membrane']) delete mocked.runtime.assets[id];
    f.sample.world = { width: 1200, height: 800, bounds: { left: 0, top: 0, right: 1200, bottom: 800 },
      obstacles: [{ id: 'fold', x: 500, y: 430, radius: 100 }], foreground: { x: 490, y: 355, width: 20, height: 40 } };
    const before = JSON.stringify(f.sample); renderer.render(f.sample, f.sample.player);
    expect(host.sprites.map(item => item.config.frame)).toEqual(['mother.purified']);
    expect(visibleHeight(host.sprites[0].config, mocked.runtime.assets['mother.purified'])).toBeCloseTo(42);
    expect(host.sprites[0].config.y).toBeCloseTo(renderer.camera.worldToScreen(f.actor).y);
    expect(renderer.diagnostics(f.sample).art.activeBodies[0].bounds).toEqual({ left: 445.6, right: 554.4, top: 244, bottom: 290 });
    expect(scene.bridge.actorBodies(f.sample).some(body => body.id === 'mother')).toBe(true);
    const clearance = scene.ctx.paints.filter(paint => paint.method === 'text');
    expect(clearance.map(paint => paint.path)).toEqual([['✓ 母巢核心已清除']]);
    expect(clearance[0].position!.y).toBe(-52);
    expect(JSON.stringify(f.sample)).toBe(before);
    delete mocked.runtime.assets['mother.purified']; renderer.render(f.sample, f.sample.player);
    expect(scene.fallbacks).toEqual(['mother']); expect(host.sprites).toEqual([]);
  });

  it('submits the selected reviewed walk frame at one source scale and shares its reflected alpha bounds with both occlusion paths', async () => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets());
    const sample = state(); sample.player.x = 500; sample.player.y = 400; sample.player.moving = true;
    sample.world = { width: 1200, height: 800, bounds: { left: 0, top: 0, right: 1200, bottom: 800 },
      obstacles: [{ id: 'fold', x: 500, y: 430, radius: 70 }], foreground: { x: 490, y: 400, width: 20, height: 100 } };
    mocked.entities.push({ id: 'player', kind: 'player', y: 400 }, { id: 'fold', kind: 'obstacle', y: 430 });
    const { renderer, host, scene } = await setup(); renderer.render(sample, sample.player);
    expect(host.sprites.find(item => item.id === 'player')!.config.frame).toBe('hero.front_right.walk.00');
    sample.elapsed += 2 / 12; sample.tick += 10;
    for (const facing of [0, Math.PI]) {
      sample.player.facing = facing; const before = JSON.stringify(sample); renderer.render(sample, sample.player);
      const sprite = host.sprites.find(item => item.id === 'player')!.config;
      expect(sprite.frame).toBe('hero.front_right.walk.02'); expect(sprite.flipX).toBe(facing === Math.PI);
      expect(sprite.y).toBe(renderer.camera.worldToScreen(sample.player).y); // authored walk has no second bob
      const source = mocked.runtime.assets[String(sprite.frame)];
      expect(visibleHeight(sprite, source)).toBeCloseTo(645 * 86 / 700);
      expect(visibleHeight(sprite, source)).not.toBeCloseTo(86);
      const foot = sourcePoint(sprite, source, 512, 850), expectedFoot = renderer.camera.worldToScreen(sample.player);
      expect(foot.x).toBeCloseTo(expectedFoot.x, 10); expect(foot.y).toBeCloseTo(expectedFoot.y, 10);
      const b = source.sourceBounds!, alpha = [sourcePoint(sprite, source, b.x!, b.y!), sourcePoint(sprite, source, b.x! + b.width!, b.y! + b.height)];
      const bounds = renderer.diagnostics(sample).art.activeBodies.find(item => item.id === 'player')!.bounds, offset = renderer.camera.worldToScreen({ x: 0, y: 0 });
      expect(bounds.left + offset.x).toBeCloseTo(Math.min(...alpha.map(p => p.x)) - 2, 10);
      expect(bounds.right + offset.x).toBeCloseTo(Math.max(...alpha.map(p => p.x)) + 2, 10);
      expect(bounds.top + offset.y).toBeCloseTo(Math.min(...alpha.map(p => p.y)) - 2, 10);
      expect(bounds.bottom + offset.y).toBeCloseTo(Math.max(...alpha.map(p => p.y)) + 2, 10);
      expect(scene.bridge.actorBodies(sample).find(actor => actor.id === 'player')!.bodyBounds).toEqual(bounds);
      expect(host.sprites.find(item => item.id === 'fold')!.config.alpha).toBe(.22);
      scene.bridge.foreground(sample, renderer.camera);
      expect(host.sprites.find(item => item.id === 'foreground:main')!.config.alpha).toBe(.2);
      expect(renderer.diagnostics(sample).art.heroAnimation.frame).toMatchObject({ clip: 'walk', index: 2, animated: true });
      expect(renderer.diagnostics(sample).art.provisional).not.toContain('continuous-player-animation');
      expect(renderer.diagnostics(sample).art.provisional).toContain('additional-player-directions');
      expect(JSON.stringify(sample)).toBe(before);
    }
  });

  it('keeps missing or unreviewed hero groups on the existing static fallback and retains its matching live bob bounds', async () => {
    const assets = fixtureHeroAnimationAssets(); assets['hero.front_right.walk.03'].animation.approved = false;
    Object.assign(mocked.runtime.assets, assets); const sample = state(); sample.player.moving = true;
    mocked.entities.push({ id: 'player', kind: 'player', y: sample.player.y });
    const { renderer, host } = await setup(), before = JSON.stringify(sample); renderer.render(sample, sample.player);
    const sprite = host.sprites[0].config;
    expect(sprite.frame).toBe('hero.walk'); expect(visibleHeight(sprite, mocked.runtime.assets['hero.walk'])).toBeCloseTo(86);
    const lift = -Math.abs(Math.sin(sample.elapsed * 16)) * 1.5;
    expect(sprite.y).toBeCloseTo(renderer.camera.worldToScreen(sample.player).y + lift);
    expect(renderer.diagnostics(sample).art.heroAnimation.frame).toMatchObject({ animated: false, clip: null });
    expect(renderer.diagnostics(sample).art.heroAnimation.enabledClips).not.toContain('walk');
    expect(renderer.diagnostics(sample).art.provisional).toContain('continuous-player-animation');
    expect(JSON.stringify(sample)).toBe(before);
  });

  it('freezes the actual paused native frame and resets it after a real same-seed restart', async () => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets());
    const game = new GameSession(19); game.start(); game.step(heroInput({ moveX: 1 }));
    mocked.entities.push({ id: 'player', kind: 'player', y: game.state.player.y });
    const { renderer, host } = await setup(); renderer.render(game.state, game.state.player);
    for (let i = 0; i < 6; i++) game.step(heroInput({ moveX: 1 })); renderer.render(game.state, game.state.player);
    const shown = host.sprites[0].config; expect(shown.frame).toBe('hero.front_right.walk.01');
    game.pause(); expect(game.state.player.moving).toBe(false); const before = JSON.stringify(game.state);
    renderer.render(game.state, game.state.player); renderer.render(game.state, game.state.player);
    expect(host.sprites[0].config).toEqual(shown); expect(JSON.stringify(game.state)).toBe(before);
    game.finish(false, 'fixture'); renderer.render(game.state, game.state.player); expect(host.sprites[0].config.frame).toBe(shown.frame);
    game.restart(19); renderer.render(game.state, game.state.player);
    expect(host.sprites[0].config.frame).toBe('hero.front_right.idle.00');
  });

  it('uses the actual dash window and aim-facing mirror without binding body art to the dash travel direction', async () => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets());
    const game = new GameSession(19); game.start(); const x = game.state.player.x;
    game.step(heroInput({ moveX: 1, dash: true, practiceHit: true, aim: { x: 0, y: 0 } }));
    expect(game.state.player.x).toBeGreaterThan(x);
    mocked.entities.push({ id: 'player', kind: 'player', y: game.state.player.y });
    const { renderer, host } = await setup();
    for (const [steps, index] of [[0, 0], [3, 1], [3, 2], [3, 3]] as const) {
      for (let i = 0; i < steps; i++) game.step(heroInput({ aim: { x: 0, y: 0 } }));
      const before = JSON.stringify(game.state); renderer.render(game.state, game.state.player);
      expect(host.sprites[0].config.frame).toBe(`hero.front_right.dash.0${index}`); expect(host.sprites[0].config.flipX).toBe(true);
      expect(JSON.stringify(game.state)).toBe(before);
    }
    game.step(heroInput()); renderer.render(game.state, game.state.player);
    expect(host.sprites[0].config.frame).toBe('hero.front_right.idle.00');
    expect(game.state.player.hurtUntil).toBeGreaterThan(game.state.elapsed);
  });

  it('shows a short reaction to real new damage and returns to normal body motion while the true hurt feedback persists', async () => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets());
    const game = new GameSession(19); game.start(); game.step(heroInput({ practiceHit: true }));
    mocked.entities.push({ id: 'player', kind: 'player', y: game.state.player.y });
    const { renderer, host, scene } = await setup(); renderer.render(game.state, game.state.player);
    expect(host.sprites[0].config.frame).toBe('hero.front_right.hurt.00');
    for (let i = 0; i < 5; i++) game.step(heroInput()); renderer.render(game.state, game.state.player);
    expect(host.sprites[0].config.frame).toBe('hero.front_right.hurt.01');
    game.step(heroInput({ practiceHit: true })); renderer.render(game.state, game.state.player);
    expect(host.sprites[0].config.frame).toBe('hero.front_right.hurt.00');
    for (let i = 0; i < 9; i++) game.step(heroInput());
    const before = JSON.stringify(game.state); renderer.render(game.state, game.state.player);
    expect(host.sprites[0].config.frame).toBe('hero.front_right.idle.00');
    expect(scene.ctx.paints.some(paint => paint.method === 'stroke' && paint.color === '#c84239' && paint.path.join(',') === 'arc,moveTo,arc')).toBe(true);
    expect(JSON.stringify(game.state)).toBe(before);
  });

  it.each([0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4, Math.PI, -Math.PI * 3 / 4, -Math.PI / 2, -Math.PI / 4])
  ('replaces the single procedural tool with one painted tool at its true grip for projected facing %s', async facing => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets());
    const source = fixturePaintedToolAsset(); mocked.runtime.assets['weapon.emitter.painted'] = source;
    const sample = state(); sample.player.facing = facing;
    mocked.entities.push({ id: 'player', kind: 'player', y: sample.player.y });
    const { renderer, host, scene } = await setup(); renderer.camera.resize(1152, 720);
    const before = JSON.stringify(sample), assetBefore = JSON.stringify(source); renderer.render(sample, sample.player);
    const tools = host.sprites.filter(item => item.config.frame === 'weapon.emitter.painted'); expect(tools).toHaveLength(1);
    const tool = tools[0].config, body = host.sprites.find(item => item.id === 'player')!.config;
    expect(host.sprites).toHaveLength(2); expect(tool.flipY).toBe(Math.cos(facing) < 0); expect(tool.flipX ?? false).toBe(false);
    expect(host.rasters).toEqual([]);
    const angle = Math.atan2(Math.sin(facing) * .72, Math.cos(facing)), scale = renderer.camera.scale;
    expect(tool.rotation).toBeCloseTo(angle, 10);
    const origin = renderer.camera.worldToScreen(sample.player), grip = sourcePoint(tool, source, PAINTED_TOOL_FIXTURE_GRIP.x, PAINTED_TOOL_FIXTURE_GRIP.y);
    expect(grip.x).toBeCloseTo(origin.x + Math.cos(angle) * 20 * scale, 10);
    expect(grip.y).toBeCloseTo(origin.y + (-30 + Math.sin(angle) * 20) * scale, 10);
    const forward = sourcePoint(tool, source, PAINTED_TOOL_FIXTURE_GRIP.x + 100, PAINTED_TOOL_FIXTURE_GRIP.y);
    expect(Math.atan2(forward.y - grip.y, forward.x - grip.x)).toBeCloseTo(angle, 10);
    const top = sourcePoint(tool, source, PAINTED_TOOL_FIXTURE_GRIP.x, PAINTED_TOOL_FIXTURE_GRIP.y - 30);
    expect(top.y - grip.y).toBeLessThanOrEqual(1e-9);
    expect(tool.depth).toBe(Math.sin(angle) < 0 ? body.depth - .1 : body.depth + .2);
    expect(scene.ctx.paints.some(paint => paint.method === 'fill' && paint.color === '#fffdf0' && paint.path.includes('roundRect'))).toBe(false);
    expect(renderer.diagnostics(sample).art.weapon).toEqual({ assetId: 'weapon.emitter.painted', mode: 'painted-static' });
    expect(renderer.diagnostics(sample).art.provisional).not.toContain('painted-emitter-tool');
    const bounds = renderer.diagnostics(sample).art.activeBodies.find(item => item.id === 'player')!.bounds, offset = renderer.camera.worldToScreen({ x: 0, y: 0 });
    const b = source.sourceBounds!;
    const corners = [b.x!, b.x! + b.width!].flatMap(x => [b.y!, b.y! + b.height].map(y => sourcePoint(tool, source, x, y)));
    expect(bounds.left * scale + offset.x).toBeLessThanOrEqual(Math.min(...corners.map(p => p.x)));
    expect(bounds.right * scale + offset.x).toBeGreaterThanOrEqual(Math.max(...corners.map(p => p.x)));
    expect(bounds.top * scale + offset.y).toBeLessThanOrEqual(Math.min(...corners.map(p => p.y)));
    expect(bounds.bottom * scale + offset.y).toBeGreaterThanOrEqual(Math.max(...corners.map(p => p.y)));
    expect(JSON.stringify(sample)).toBe(before); expect(JSON.stringify(source)).toBe(assetBefore);
  });

  it('uses the same single independently aimed device for all tools and low-effect modes while retaining actual hit feedback', async () => {
    mocked.runtime.assets['weapon.emitter.painted'] = fixturePaintedToolAsset();
    const sample = state(); sample.player.hurtUntil = sample.elapsed + .4;
    mocked.entities.push({ id: 'player', kind: 'player', y: sample.player.y });
    const { renderer, host, scene } = await setup();
    for (const tool of [1, 2, 3] as const) for (const lowEffects of [false, true]) {
      sample.tool = tool; const before = JSON.stringify(sample); renderer.render(sample, sample.player, { lowEffects });
      expect(host.sprites.filter(item => item.id === 'player:tool')).toHaveLength(1);
      expect(host.sprites.find(item => item.id === 'player:tool')!.config.frame).toBe('weapon.emitter.painted');
      expect(scene.ctx.paints.some(paint => paint.method === 'fill' && paint.color === '#fffdf0' && paint.path.includes('roundRect'))).toBe(false);
      expect(scene.ctx.paints.some(paint => paint.method === 'stroke' && paint.color === '#c84239' && paint.path.join(',') === 'arc,moveTo,arc')).toBe(true);
      expect(JSON.stringify(sample)).toBe(before);
    }
  });

  it('keeps the original single procedural tool when only the prototype exists or the new source grip is invalid', async () => {
    mocked.runtime.assets['weapon.emitter'] = fixturePaintedToolAsset();
    const sample = state(); mocked.entities.push({ id: 'player', kind: 'player', y: sample.player.y });
    const { renderer, host, scene } = await setup();
    for (const painted of [undefined, { ...fixturePaintedToolAsset(), aliasOf: 'weapon.emitter' }, { ...fixturePaintedToolAsset(), sourceBounds: undefined }]) {
      if (painted) mocked.runtime.assets['weapon.emitter.painted'] = painted; else delete mocked.runtime.assets['weapon.emitter.painted'];
      const before = JSON.stringify(sample); renderer.render(sample, sample.player);
      expect(host.sprites.map(item => item.id)).toEqual(['player']);
      expect(scene.ctx.paints.filter(paint => paint.method === 'fill' && paint.color === '#fffdf0' && paint.path.includes('roundRect'))).toHaveLength(1);
      expect(renderer.diagnostics(sample).art.weapon).toEqual({ assetId: null, mode: 'procedural-fallback' });
      expect(renderer.diagnostics(sample).art.provisional).toContain('painted-emitter-tool');
      expect(JSON.stringify(sample)).toBe(before);
    }
  });

  it('includes painted tool overhang in the shared player bounds for obstacle and foreground protection', async () => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets()); mocked.runtime.assets['weapon.emitter.painted'] = fixturePaintedToolAsset();
    mocked.runtime.assets['scenery.heartTissueA'] = asset('scenery.heartTissueA', 80);
    const sample = state(); sample.player.x = 500; sample.player.y = 400; sample.player.facing = 0;
    sample.world = { width: 1200, height: 800, bounds: { left: 0, top: 0, right: 1200, bottom: 800 },
      obstacles: [{ id: 'tool-fold', x: 560, y: 400, radius: 25 }], foreground: { x: 546, y: 350, width: 10, height: 40 } };
    mocked.entities.push({ id: 'player', kind: 'player', y: 400 }, { id: 'tool-fold', kind: 'obstacle', y: 400 });
    const { renderer, host, scene } = await setup(), before = JSON.stringify(sample); renderer.render(sample, sample.player);
    const extended = renderer.diagnostics(sample).art.activeBodies.find(item => item.id === 'player')!.bounds;
    expect(host.sprites.find(item => item.id === 'tool-fold')!.config.alpha).toBe(.22);
    expect(scene.bridge.actorBodies(sample).find(item => item.id === 'player')!.bodyBounds).toEqual(extended);
    scene.bridge.foreground(sample, renderer.camera); expect(host.sprites.find(item => item.id === 'foreground:main')!.config.alpha).toBe(.2);
    expect(JSON.stringify(sample)).toBe(before);
    delete mocked.runtime.assets['weapon.emitter.painted']; renderer.render(sample, sample.player);
    const bodyOnly = renderer.diagnostics(sample).art.activeBodies.find(item => item.id === 'player')!.bounds;
    expect(bodyOnly.right).toBeLessThan(extended.right);
    expect(host.sprites.find(item => item.id === 'tool-fold')!.config.alpha).toBe(1);
    scene.bridge.foreground(sample, renderer.camera); expect(host.sprites.find(item => item.id === 'foreground:main')!.config.alpha).toBe(.78);
  });

  it.each([0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4, Math.PI, -Math.PI * 3 / 4, -Math.PI / 2, -Math.PI / 4])
  ('registers a proven actual player beam at the native source muzzle for facing %s', async facing => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets()); const source = fixturePaintedToolAsset(); mocked.runtime.assets['weapon.emitter.painted'] = source;
    const game = new GameSession(31); game.start();
    const aim = { x: game.state.player.x + Math.cos(facing) * 300, y: game.state.player.y + Math.sin(facing) * 300 };
    game.step(heroInput({ fire: true, aim }));
    const beam = game.state.effects.find(effect => effect.kind === 'beam')!; expect(beam).toBeDefined();
    mocked.entities.push({ id: 'player', kind: 'player', y: game.state.player.y });
    const { renderer, host, scene } = await setup(), before = JSON.stringify(game.state); renderer.render(game.state, aim);
    const tool = host.sprites.find(sprite => sprite.id === 'player:tool')!.config;
    const actualMuzzle = sourcePoint(tool, source, source.sourceMuzzle!.x, source.sourceMuzzle!.y);
    const origin = scene.bridge.effectOrigin!(beam, game.state)!, cameraOffset = renderer.camera.worldToScreen({ x: 0, y: 0 });
    expect(origin.x + cameraOffset.x).toBeCloseTo(actualMuzzle.x, 10);
    expect(origin.y * .72 + cameraOffset.y).toBeCloseTo(actualMuzzle.y, 10);
    expect(origin).not.toEqual(beam.from);
    expect(host.sprites.filter(sprite => sprite.id === 'player:tool')).toHaveLength(1);
    expect(JSON.stringify(game.state)).toBe(before);
  });

  it('shows a brief tool recoil and muzzle flash only for an accepted use', async () => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets());
    mocked.runtime.assets['weapon.emitter.painted'] = fixturePaintedToolAsset();
    const game = new GameSession(31); game.start(); const aim = { x: 800, y: 440 };
    mocked.entities.push({ id: 'player', kind: 'player', y: game.state.player.y });
    const { renderer, host, scene } = await setup();
    game.step(heroInput({ fire: true, aim })); renderer.render(game.state, aim);
    const recoiled = host.sprites.find(sprite => sprite.id === 'player:tool')!.config.x;
    expect(scene.ctx.paints.some(paint => paint.color === '#d7fff5')).toBe(true);
    for (let i = 0; i < 9; i++) game.step(heroInput({ aim }));
    renderer.render(game.state, aim);
    const resting = host.sprites.find(sprite => sprite.id === 'player:tool')!.config.x;
    expect(resting - recoiled).toBeCloseTo(4 * renderer.camera.scale, 6);
    expect(scene.ctx.paints.some(paint => paint.color === '#d7fff5')).toBe(false);
  });

  it('uses authoritative shot identity and displayed muzzle when player position is interpolated', async () => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets()); const source = fixturePaintedToolAsset();
    mocked.runtime.assets['weapon.emitter.painted'] = source;
    const game = new GameSession(31); game.start(); const aim = { x: 800, y: 440 };
    game.step(heroInput({ moveX: 1, fire: true, aim }));
    const displayed = game.snapshot(); displayed.player.x -= 2;
    const beam = displayed.effects.find(effect => effect.kind === 'beam')!;
    const unrelated = { ...beam, id: beam.id + 1000, from: { ...displayed.player } };
    displayed.effects.push(unrelated);
    mocked.entities.push({ id: 'player', kind: 'player', y: displayed.player.y });
    const { renderer, host, scene } = await setup();
    renderer.render(displayed, aim, { authoritativeState: game.state });
    const tool = host.sprites.find(sprite => sprite.id === 'player:tool')!.config;
    const muzzle = sourcePoint(tool, source, source.sourceMuzzle!.x, source.sourceMuzzle!.y);
    const origin = scene.bridge.effectOrigin!(beam, displayed)!, offset = renderer.camera.worldToScreen({ x: 0, y: 0 });
    expect(origin.x + offset.x).toBeCloseTo(muzzle.x, 10);
    expect(origin.y * .72 + offset.y).toBeCloseTo(muzzle.y, 10);
    expect(scene.bridge.effectOrigin!(unrelated, displayed)).toBeUndefined();
  });

  it('retains only a witnessed player muzzle when several simulation steps precede a render', async () => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets()); const source = fixturePaintedToolAsset();
    mocked.runtime.assets['weapon.emitter.painted'] = source;
    const game = new GameSession(31); game.start(); const aim = { x: 800, y: 440 };
    mocked.entities.push({ id: 'player', kind: 'player', y: game.state.player.y });
    const { renderer, scene } = await setup();
    game.step(heroInput({ moveX: 1, fire: true, aim }));
    const beam = game.state.effects.find(effect => effect.kind === 'beam')!;
    const unrelated = { ...beam, id: beam.id + 1000, from: { x: beam.from.x + 3, y: beam.from.y } };
    game.state.effects.push(unrelated);
    const actual = game.snapshot();
    const point = { x: actual.player.x - Math.cos(actual.player.facing) * 4, y: actual.player.y - Math.sin(actual.player.facing) * 4 };
    const muzzle = paintedToolMuzzle(source, aimedPaintedTool(source, point, actual.player.facing)!)!;
    renderer.witnessSimulation(game.state);
    game.step(heroInput({ moveX: 1, aim: { x: 100, y: 440 } }));
    renderer.witnessSimulation(game.state);
    game.step(heroInput({ moveX: 1, aim: { x: 100, y: 440 } }));
    renderer.witnessSimulation(game.state); renderer.render(game.state, game.state.player);
    expect(scene.bridge.effectOrigin!(beam, game.state)).toEqual({ x: muzzle.x, y: muzzle.y / .72 });
    expect(scene.bridge.effectOrigin!(unrelated, game.state)).toBeUndefined();
    const captured = structuredClone(scene.bridge.effectOrigin!(beam, game.state));
    game.pause(); renderer.render(game.state, game.state.player);
    expect(scene.bridge.effectOrigin!(beam, game.state)).toEqual(captured);
    game.restart(31); renderer.render(game.state, game.state.player);
    expect(scene.bridge.effectOrigin!(beam, game.state)).toBeUndefined();
  });

  it('keeps a captured historical beam at its emission muzzle through movement, new facing and pause, then forgets it on restart', async () => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets()); mocked.runtime.assets['weapon.emitter.painted'] = fixturePaintedToolAsset();
    const game = new GameSession(31); game.start(); const aim = { x: 800, y: 440 };
    game.step(heroInput({ fire: true, aim })); const beam = game.state.effects.find(effect => effect.kind === 'beam')!;
    mocked.entities.push({ id: 'player', kind: 'player', y: game.state.player.y });
    const { renderer, scene } = await setup(); renderer.render(game.state, aim);
    const captured = { ...scene.bridge.effectOrigin!(beam, game.state)! };
    for (let i = 0; i < 3; i++) game.step(heroInput({ moveX: 1, aim: { x: 0, y: 50 } }));
    const before = JSON.stringify(game.state); renderer.render(game.state, game.state.player);
    expect(scene.bridge.effectOrigin!(beam, game.state)).toEqual(captured);
    expect(JSON.stringify(game.state)).toBe(before);
    game.pause(); renderer.render(game.state, game.state.player); expect(scene.bridge.effectOrigin!(beam, game.state)).toEqual(captured);
    game.resume(); for (let i = 0; i < 6; i++) game.step(heroInput()); renderer.render(game.state, game.state.player);
    expect(scene.bridge.effectOrigin!(beam, game.state)).toBeUndefined();
    game.restart(31); renderer.render(game.state, game.state.player); expect(scene.bridge.effectOrigin!(beam, game.state)).toBeUndefined();
  });

  it('captures the native muzzle after actual post-move firing with the existing static-walk body lift', async () => {
    const source = fixturePaintedToolAsset(); mocked.runtime.assets['weapon.emitter.painted'] = source;
    const game = new GameSession(31); game.start(); game.step(heroInput({ moveX: 1, fire: true, aim: { x: 900, y: 500 } }));
    const beam = game.state.effects.find(effect => effect.kind === 'beam')!;
    expect(beam.from).toEqual({ x: game.state.player.x, y: game.state.player.y });
    mocked.entities.push({ id: 'player', kind: 'player', y: game.state.player.y });
    const { renderer, host, scene } = await setup(), before = JSON.stringify(game.state); renderer.render(game.state, game.state.player);
    expect(host.sprites.find(sprite => sprite.id === 'player')!.config.frame).toBe('hero.walk');
    const nativeTool = host.sprites.find(sprite => sprite.id === 'player:tool')!.config;
    const muzzle = sourcePoint(nativeTool, source, source.sourceMuzzle!.x, source.sourceMuzzle!.y);
    const registered = scene.bridge.effectOrigin!(beam, game.state)!, offset = renderer.camera.worldToScreen({ x: 0, y: 0 });
    expect(registered.x + offset.x).toBeCloseTo(muzzle.x, 10); expect(registered.y * .72 + offset.y).toBeCloseTo(muzzle.y, 10);
    expect(JSON.stringify(game.state)).toBe(before);
  });

  it('keeps unseen historical, enemy and unrelated beams at their serialized origins instead of attaching them to the current player', async () => {
    mocked.runtime.assets['weapon.emitter.painted'] = fixturePaintedToolAsset();
    const sample = state(), origin = { ...sample.player };
    const beam = (id: number, changes: Partial<Effect> = {}): Effect => ({ id, kind: 'beam', from: { x: origin.x, y: origin.y },
      to: { x: origin.x + 300, y: origin.y }, radius: 0, duration: .14, born: sample.elapsed, ...changes });
    sample.effects = [beam(1, { born: sample.elapsed - 1 / 60 }), beam(2, { duration: .2 }),
      beam(3, { from: { x: origin.x + 100, y: origin.y + 30 } }), beam(4, { to: { x: origin.x, y: origin.y + 300 } }),
      beam(5, { kind: 'chain' })];
    sample.events = [{ type: 'TOOL_FIRED', tick: sample.tick, data: { tool: 1, x: origin.x + 300, y: origin.y } }];
    mocked.entities.push({ id: 'player', kind: 'player', y: sample.player.y });
    const { renderer, scene } = await setup(), before = JSON.stringify(sample); renderer.render(sample, sample.player);
    for (const effect of sample.effects) expect(scene.bridge.effectOrigin!(effect, sample)).toBeUndefined();
    expect(JSON.stringify(sample)).toBe(before);
  });

  it('uses the same emission point for the actual spread rays and refuses shots without a proven firing event or muzzle metadata', async () => {
    mocked.runtime.assets['weapon.emitter.painted'] = fixturePaintedToolAsset();
    const sample = state(), from = { x: sample.player.x, y: sample.player.y };
    sample.effects = [0, -.14, .14].map((angle, index): Effect => ({ id: index, kind: 'beam', from: { ...from },
      to: { x: from.x + Math.cos(angle) * 300, y: from.y + Math.sin(angle) * 300 }, radius: 0, born: sample.elapsed, duration: .14 }));
    sample.events = [{ type: 'TOOL_FIRED', tick: sample.tick, data: { tool: 1, x: from.x + 300, y: from.y, rays: 3 } }];
    mocked.entities.push({ id: 'player', kind: 'player', y: sample.player.y }); const { renderer, scene } = await setup(); renderer.render(sample, sample.player);
    const first = scene.bridge.effectOrigin!(sample.effects[0], sample); expect(first).toBeDefined();
    expect(sample.effects.map(effect => scene.bridge.effectOrigin!(effect, sample))).toEqual([first, first, first]);
    sample.runMetrics!.runId += '-different'; sample.events = []; renderer.render(sample, sample.player);
    expect(sample.effects.map(effect => scene.bridge.effectOrigin!(effect, sample))).toEqual([undefined, undefined, undefined]);
    sample.runMetrics!.runId += '-metadata'; sample.events = [{ type: 'TOOL_FIRED', tick: sample.tick, data: { tool: 1, x: from.x + 300, y: from.y, rays: 3 } }];
    delete mocked.runtime.assets['weapon.emitter.painted'].sourceMuzzle; renderer.render(sample, sample.player);
    expect(sample.effects.map(effect => scene.bridge.effectOrigin!(effect, sample))).toEqual([undefined, undefined, undefined]);
  });
});
