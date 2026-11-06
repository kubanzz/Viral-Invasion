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
  runtime: { inputSignature: 'isolated-native-dispatch', actorContract: undefined as {version:number}|undefined, atlases: [], environments: {}, assets: {} as Record<string, FixtureAsset> },
  entities: [] as SceneEntity[], scenes: [] as TestScene[], hosts: [] as TestHost[],
  animationKeys: new Set<string>(),
}));

vi.mock('../../.art-generated/art-runtime.json', () => ({ default: mocked.runtime }));
vi.mock('../../src/render/phaserHost', () => ({ PhaserHost: class {
  readonly ready = Promise.resolve(); readonly isReady = true;
  readonly scene = { anims: { exists: (key: string) => mocked.animationKeys.has(key), create: vi.fn() } };
  sprites: TestHost['sprites'] = []; rasters: TestHost['rasters'] = [];
  constructor() { mocked.hosts.push(this); }
  resize() {} startFrameLoop() {} destroy() {} endFrame() {} removeRasterLayer() {}
  diagnostics() { return {}; }
  beginFrame() {
    this.sprites = []; this.rasters = [];
    for (const scene of mocked.scenes) { scene.ctx.paints.length = 0; scene.ctx.rotations.length = 0; scene.fallbacks.length = 0; scene.annotations.length = 0; }
  }
  sprite(id: string, config: HostedSprite) { this.sprites.push({ id, config: { ...config } }); return { play() {}, anims: { isPaused: false, pause() {}, resume() {} } }; }
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
import { fixtureActorAnimationAssets } from '../fixtures/actorAnimationAssets';
import { ACTOR_STATIC_IDS } from '../../src/render/actorAnimation';
import { fixturePaintedToolAsset, PAINTED_TOOL_FIXTURE_GRIP } from '../fixtures/paintedToolAsset';
import { aimedPaintedTool, paintedToolMuzzle } from '../../src/render/spriteGeometry';
import { createTerritoryState, territoryNodeAt } from '../../src/game/territory';
import { FANTASY_ART, fantasyObstacleKind } from '../../src/render/fantasyTerritory';

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
    quadraticCurveTo() { path.push('quadraticCurveTo'); },
    bezierCurveTo() { path.push('bezierCurveTo'); }, clip() { path.push('clip'); },
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
  const ctx = recordedContext(), events = new EventTarget();
  // This host records Canvas2D rendering. Returning its recorder for WebGL2
  // falsely advertises GPU support and bypasses the real unsupported-GPU path.
  return { id: '', width: 1440, height: 900, getContext: (kind: string) => kind === '2d' ? ctx : null,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
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
  mocked.runtime.actorContract=undefined;
  mocked.entities.length = 0; mocked.hosts.length = 0; mocked.scenes.length = 0;
  mocked.animationKeys.clear();
  for (const key of Object.keys(mocked.runtime.assets)) delete mocked.runtime.assets[key];
  for (const id of ['hero.idle', 'hero.walk', 'enemy.basic', 'enemy.fission.parent', 'enemy.fission.child', 'source.infection', 'immune.cell.idle', 'immune.beacon', 'scenery.heartTissueA', 'scenery.heartTissueB']) mocked.runtime.assets[id] = asset(id);
  mocked.runtime.assets['immune.cell.bite'] = asset('immune.cell.bite', 60, 900);
  vi.stubGlobal('document', { createElement: canvas, querySelector: () => null, body: { dataset: {} } });
  vi.stubGlobal('innerWidth', 1440); vi.stubGlobal('innerHeight', 900);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('actual Renderer native art dispatch through an isolated host', () => {
  it('switches paired scenery by real ownership without per-silhouette resizing, tinting or shifting its ground anchor', async () => {
    const sample = state(); sample.territory = createTerritoryState();
    sample.endless = { wave: 1, clearedWaves: 0 } as GameState['endless'];
    const obstacle = sample.world!.obstacles[0], kind = fantasyObstacleKind(obstacle.id);
    for (const [owner, box] of [['healthy', { x: 170, y: 130, width: 680, height: 740 }], ['infected', { x: 140, y: 90, width: 740, height: 800 }]] as const) {
      const id = FANTASY_ART[kind][owner];
      mocked.runtime.assets[id] = { atlas: 'fantasy-atlas', frame: id, width: 1024, height: 1024,
        pivot: { x: .5, y: .85 }, visibleBounds: box, sourceSize: { width: 1024, height: 1024 }, sourceBounds: box, flags: [], status: 'test-only' };
    }
    mocked.entities.push({ id: obstacle.id, y: obstacle.y, kind: 'obstacle' });
    const { renderer, host } = await setup();
    const node = territoryNodeAt(sample.territory, obstacle)!; node.owner = 'healthy';
    renderer.render(sample, sample.player); const healthy = host.sprites.find(sprite => sprite.id === obstacle.id)!.config;
    sample.endless!.clearedWaves = 5;
    renderer.render(sample, sample.player); expect(host.sprites.find(sprite => sprite.id === obstacle.id)!.config.frame).toBe(FANTASY_ART[kind].healthy);
    node.owner = 'infected'; renderer.render(sample, sample.player);
    const infected = host.sprites.find(sprite => sprite.id === obstacle.id)!.config;
    expect(infected.frame).toBe(FANTASY_ART[kind].infected);
    for (const key of ['x', 'y', 'width', 'height', 'originX', 'originY'] as const) expect(infected[key]).toBeCloseTo(healthy[key]!);
    expect(healthy.tint).toBeUndefined(); expect(infected.tint).toBeUndefined();
    sample.player.x = obstacle.x; sample.player.y = obstacle.y - obstacle.radius * 1.6;
    renderer.render(sample, sample.player);
    expect(host.sprites.find(sprite => sprite.id === obstacle.id)!.config.alpha).toBe(.22);
    sample.player.y = obstacle.y + 120;
    renderer.render(sample, sample.player);
    expect(host.sprites.find(sprite => sprite.id === obstacle.id)!.config.alpha).toBe(1);
  });

  it('keeps the fantasy core and infection source separate from virus actors and HP-dependent ownership', async () => {
    const sample = state(); sample.territory = createTerritoryState();
    sample.endless = { wave: 1, clearedWaves: 0 } as GameState['endless'];
    for (const id of [FANTASY_ART.core.healthy, FANTASY_ART.core.infected, FANTASY_ART.source]) {
      const box = { x: 180, y: 180, width: 650, height: 690 };
      mocked.runtime.assets[id] = { atlas: 'fantasy-atlas', frame: id, width: 1024, height: 1024,
        pivot: { x: .5, y: .85 }, visibleBounds: box, sourceSize: { width: 1024, height: 1024 }, sourceBounds: box, flags: [], status: 'test-only' };
    }
    sample.tissue.x = 500; sample.tissue.y = 400;
    const source = target('territory-source', { role: 'source', x: 650, y: 400, traits: [] });
    sample.targets = [source]; sample.tissue.hp = 15;
    sample.territory.nodes.forEach(node => { node.owner = 'healthy'; });
    mocked.entities.push({ id: 'tissue', y: sample.tissue.y, kind: 'tissue' }, { id: source.id, y: source.y, kind: 'target', index: 0 });
    const { renderer, host } = await setup(); renderer.render(sample, sample.player);
    expect(host.sprites.find(sprite => sprite.id === 'tissue')!.config.frame).toBe(FANTASY_ART.core.healthy);
    expect(host.sprites.find(sprite => sprite.id === source.id)!.config.frame).toBe(FANTASY_ART.source);
    expect(host.sprites.filter(sprite => sprite.config.frame === 'enemy.basic')).toHaveLength(0);
  });

  it('keeps virus bob phase tied to identity and smooth presentation time, independent of horizontal movement',async()=>{
    const sample=state(),actor=target('stable-virus',{traits:[],x:500,y:400});sample.targets=[actor];sample.visualTime=.9;
    mocked.entities.push({id:actor.id,kind:'target',index:0,y:actor.y});const {renderer,host}=await setup();
    const lift=()=>host.sprites.find(item=>item.id===actor.id)!.config.y-renderer.camera.worldToScreen(actor).y;
    renderer.render(sample,sample.player);const before=lift();
    actor.x+=123;renderer.render(sample,sample.player);expect(lift()).toBeCloseTo(before,10);
    sample.visualTime+=.001;renderer.render(sample,sample.player);expect(Math.abs(lift()-before)).toBeLessThanOrEqual(.00481);
    actor.role='source';renderer.render(sample,sample.player);expect(lift()).toBeCloseTo(0,10);
  });

  it('uses the repair animation only for an actual successful repair, never for a miss or full-health cast', async () => {
    mocked.runtime.assets['fx.heal.00'] = asset('fx.heal.00'); mocked.animationKeys.add('art-heal');
    const { renderer, host } = await setup();
    for (const [where, hp, succeeds] of [['empty', 25, false], ['tissue', 100, false], ['tissue', 25, true]] as const) {
      const game = new GameSession(31); game.start();
      game.state.player.x = 650; game.state.player.y = 600; game.state.tissue.hp = hp;
      const aim = where === 'tissue' ? { ...game.state.tissue } : { x: 650, y: 500 };
      game.step(heroInput({ tool: 3, fire: true, aim }));
      const effect = game.state.effects.find(e => e.kind === 'heal')!;
      expect(Boolean(effect?.repairSucceeded)).toBe(succeeds);
      for (const lowEffects of [false, true]) {
        renderer.render(game.state, aim, { lowEffects });
        expect(host.sprites.some(sprite => sprite.id.startsWith('effect:'))).toBe(succeeds && !lowEffects);
      }
    }
  });
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
    expect(scene.ctx.paints.some(paint => paint.color === '#f3e7bc' && paint.path.includes('arc'))).toBe(true);
    expect(scene.ctx.rotations).toContainEqual(immuneCellBody(sample.growth!.cells![0], sample.elapsed).rotation);
    expect(JSON.stringify(sample)).toBe(before);
  });

  it('requires matching logical canvases and source bounds, then falls back completely if idle is unavailable', async () => {
    const { renderer, host, scene } = await setup(), sample = state(); sample.growth!.cells = [cell()];
    mocked.entities.push({ id: 'cell', kind: 'immune', index: 0, y: 400 });
    const bite = mocked.runtime.assets['immune.cell.bite']; delete mocked.runtime.assets['immune.cell.bite'];
    renderer.render(sample, sample.player);
    expect(host.sprites[0].config.frame).toBe('immune.cell.idle');
    expect(scene.ctx.paints.some(paint => paint.color === '#f3e7bc' && paint.path.includes('arc'))).toBe(true);
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
    expect(scene.ctx.paints.filter(paint => paint.color === '#f3e7bc')).toHaveLength(3);
    expect(scene.ctx.paints.filter(paint => paint.color === '#bdd0a8')).toHaveLength(3);
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
    const { renderer, host, scene } = await setup(); renderer.witnessSimulation(sample);
    sample.tick++;sample.elapsed+=1/60;sample.player.x+=1;renderer.render(sample, sample.player);
    expect(host.sprites.find(item => item.id === 'player')!.config.frame).toBe('hero.front_right.walk.00');
    sample.elapsed += 2 / 12; sample.tick += 10;sample.player.x+=27;
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

  it('keeps unreviewed walk groups disabled and skins the approved body with bounds shared by both occlusion paths', async () => {
    const assets = fixtureHeroAnimationAssets(); assets['hero.front_right.walk.03'].animation.approved = false;
    Object.assign(mocked.runtime.assets, assets); const sample = state(); sample.player.moving = true;
    sample.world={width:1200,height:800,bounds:{left:0,top:0,right:1200,bottom:800},obstacles:[{id:'fold',x:sample.player.x,y:sample.player.y+30,radius:70}],foreground:{x:sample.player.x-10,y:sample.player.y,width:20,height:100}};
    mocked.entities.push({ id: 'player', kind: 'player', y: sample.player.y });
    const { renderer, host, scene } = await setup();renderer.witnessSimulation(sample);
    sample.tick++;sample.elapsed+=1/60;sample.player.x+=2;const before=JSON.stringify(sample);renderer.render(sample, sample.player);
    const sprite = host.sprites[0].config;
    expect(sprite.frame).toBe('hero.front_right.idle.00'); expect(sprite.mesh).toBeDefined();
    expect(visibleHeight(sprite,mocked.runtime.assets[String(sprite.frame)])).toBeCloseTo(86);
    expect(sprite.y).toBeCloseTo(renderer.camera.worldToScreen(sample.player).y);
    const bounds=renderer.diagnostics(sample).art.activeBodies.find(item=>item.id==='player')!.bounds;
    expect(scene.bridge.actorBodies(sample).find(item=>item.id==='player')!.bodyBounds).toEqual(bounds);
    const source=mocked.runtime.assets[String(sprite.frame)],v=source.visibleBounds,offset=renderer.camera.worldToScreen({x:0,y:0}),vertices=sprite.mesh!.vertices;
    for(let i=0;i<vertices.length;i+=4){
      const ax=vertices[i+2]*source.width,ay=vertices[i+3]*source.height;
      if(ax<v.x||ax>v.x+v.width||ay<v.y||ay>v.y+v.height)continue;
      expect(bounds.left+offset.x).toBeLessThanOrEqual(sprite.x+vertices[i]);expect(bounds.right+offset.x).toBeGreaterThanOrEqual(sprite.x+vertices[i]);
      expect(bounds.top+offset.y).toBeLessThanOrEqual(sprite.y+vertices[i+1]);expect(bounds.bottom+offset.y).toBeGreaterThanOrEqual(sprite.y+vertices[i+1]);
    }
    expect(renderer.diagnostics(sample).art.heroAnimation.frame).toMatchObject({ animated: false, clip: null });
    expect(renderer.diagnostics(sample).art.heroAnimation.enabledClips).not.toContain('walk');
    expect(renderer.diagnostics(sample).art.provisional).toContain('continuous-player-animation');
    expect(JSON.stringify(sample)).toBe(before);
  });

  it('holds the rig tool continuously across vertical aim, shares its true muzzle with all tools/effect settings, and freezes its mesh on pause', async () => {
    const assets=fixtureHeroAnimationAssets();delete assets['hero.front_right.walk.07'];Object.assign(mocked.runtime.assets,assets);
    const source=fixturePaintedToolAsset();mocked.runtime.assets['weapon.emitter.painted']=source;
    const sample=state();mocked.entities.push({id:'player',kind:'player',y:sample.player.y});
    const {renderer,host,scene}=await setup();let previousX:number|undefined;
    for(const facing of [Math.PI/2-.00001,Math.PI/2+.00001]){
      sample.player.facing=facing;renderer.render(sample,sample.player);
      const tool=host.sprites.find(item=>item.id==='player:tool')!.config;
      if(previousX!==undefined)expect(Math.abs(tool.x-previousX)).toBeLessThan(.01);previousX=tool.x;
      expect(host.sprites.find(item=>item.id==='player')!.config.mesh).toBeDefined();
    }
    for(const tool of [1,2,3] as const)for(const lowEffects of [false,true]){
      sample.tool=tool;sample.player.facing=Math.PI/4;renderer.render(sample,sample.player,{lowEffects});
      expect(host.sprites.filter(item=>item.id==='player:tool')).toHaveLength(1);
      expect(host.sprites.find(item=>item.id==='player')!.config.mesh).toBeDefined();
      expect(scene.ctx.paints.some(paint=>paint.color==='#24758b'&&paint.path.join(',')==='moveTo,lineTo')).toBe(false);
    }
    const mesh=structuredClone(host.sprites.find(item=>item.id==='player')!.config.mesh);
    sample.phase='paused';sample.player.moving=false;renderer.render(sample,sample.player);
    expect(host.sprites.find(item=>item.id==='player')!.config.mesh).toEqual(mesh);
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
    const weapon = renderer.diagnostics(sample).art.weapon;
    expect(weapon).toMatchObject({ assetId: 'weapon.emitter.painted', mode: 'painted-static', gripSource: 'registered-sprite', forward: null });
    const projectedOrigin = renderer.camera.worldToScreen({ x: 0, y: 0 });
    const muzzle = sourcePoint(tool, source, source.sourceMuzzle!.x, source.sourceMuzzle!.y);
    expect([weapon.grip!.x, weapon.grip!.y, weapon.muzzle!.x, weapon.muzzle!.y].every(Number.isFinite)).toBe(true);
    // Diagnostics describe the same submitted native texture transform, in projected-world coordinates.
    expect(weapon.grip!.x * scale + projectedOrigin.x).toBeCloseTo(grip.x, 10);
    expect(weapon.grip!.y * scale + projectedOrigin.y).toBeCloseTo(grip.y, 10);
    expect(weapon.muzzle!.x * scale + projectedOrigin.x).toBeCloseTo(muzzle.x, 10);
    expect(weapon.muzzle!.y * scale + projectedOrigin.y).toBeCloseTo(muzzle.y, 10);
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
      expect(renderer.diagnostics(sample).art.weapon).toEqual({ assetId: null, mode: 'procedural-fallback',
        gripSource: 'registered-sprite', grip: null, muzzle: null, forward: null });
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

  it.each([1, 2] as const)('registers the real painted muzzle for challenge tool %i without changing projectile geometry', async toolNumber => {
    Object.assign(mocked.runtime.assets, fixtureHeroAnimationAssets()); const source = fixturePaintedToolAsset();
    mocked.runtime.assets['weapon.emitter.painted'] = source;
    const game = new GameSession(31, { mode: 'endless' }); game.start(); const aim = { x: 1000, y: 500 };
    game.state.targets = []; game.state.world!.obstacles = [];
    game.step(heroInput({ fire: true, tool: toolNumber, aim }));
    const shot = game.state.playerProjectiles![0]; expect(shot).toBeDefined();
    const displayed = game.snapshot(); displayed.player.x -= 2;
    mocked.entities.push({ id: 'player', kind: 'player', y: displayed.player.y });
    const { renderer, host, scene } = await setup(), before = JSON.stringify(game.state);
    renderer.render(displayed, aim, { authoritativeState: game.state });
    const nativeTool = host.sprites.find(sprite => sprite.id === 'player:tool')!.config;
    const muzzle = sourcePoint(nativeTool, source, source.sourceMuzzle!.x, source.sourceMuzzle!.y);
    const registered = scene.bridge.projectileOrigin!(shot.castId)!, offset = renderer.camera.worldToScreen({ x: 0, y: 0 });
    expect(registered.x + offset.x).toBeCloseTo(muzzle.x, 10);
    expect(registered.y * .72 + offset.y).toBeCloseTo(muzzle.y, 10);
    expect(JSON.stringify(game.state)).toBe(before);
    const captured = { ...registered };
    game.step(heroInput({ moveX: 1, tool: 3, aim: { x: 100, y: 400 } }));
    renderer.witnessSimulation(game.state); renderer.render(game.state, game.state.player);
    expect(scene.bridge.projectileOrigin!(shot.castId)).toEqual(captured);
    game.pause(); renderer.render(game.state, game.state.player);
    expect(scene.bridge.projectileOrigin!(shot.castId)).toEqual(captured);
    game.restart(31); renderer.render(game.state, game.state.player);
    expect(scene.bridge.projectileOrigin!(shot.castId)).toBeUndefined();
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

describe('new complete actor groups through the actual Renderer dispatch', () => {
  function actors() { mocked.runtime.actorContract={version:2}; Object.assign(mocked.runtime.assets,fixtureActorAnimationAssets()); }
  it('routes front nodes to the shared low platform instead of the tall crystal sprite, without rule writes',async()=>{
    actors();const sample=state();sample.territory=createTerritoryState();sample.endless={wave:1,clearedWaves:0}as GameState['endless'];
    const node=sample.territory.nodes.find(node=>node.id==='front-north')!;
    mocked.entities.push({id:node.id,kind:'territory-node',y:node.y});const {renderer,host,scene}=await setup();
    for(const owner of ['infected','healthy']as const)for(const lowEffects of[false,true]){
      node.owner=owner;node.purificationProgress=50;const before=JSON.stringify(sample);
      renderer.render(sample,sample.player,{lowEffects});
      expect(scene.fallbacks).toEqual([node.id]);
      expect(host.sprites.some(item=>item.id===node.id||item.id===node.id+':purification')).toBe(false);
      expect(JSON.stringify(sample)).toBe(before);
    }
  });
  it('equips the enlarged menu hero at its own actual palm and scaled96/128 source ratio, independent of the simulation player point',async()=>{
    actors();const sample=state();sample.phase='menu';sample.player.x=65;sample.player.y=125;sample.player.facing=-2.5;
    sample.player.moving=true;sample.player.dashUntil=sample.elapsed+.16;
    const {renderer,host}=await setup(),before=JSON.stringify(sample);renderer.render(sample,sample.player);
    const body=host.sprites.find(item=>item.id==='menu:hero')!.config,tool=host.sprites.find(item=>item.id==='menu:tool')!.config;
    expect(host.sprites.map(item=>item.id)).toEqual(['menu:hero','menu:tool']);expect(body.frame).toBe('fantasy.actor.hero.front_right.idle.00');
    expect(body.flipX).toBe(false);expect(tool.depth).toBeGreaterThan(body.depth);expect(body.mesh).toBeUndefined();
    const frames=renderer.diagnostics(sample).art.actorFrames,hero=frames.find(a=>a.actorId==='menu:hero')!,weapon=frames.find(a=>a.actorId==='menu:tool')!;
    expect(renderer.diagnostics(sample).art.heroAnimation.frame?.id).toBe(body.frame);
    expect(renderer.diagnostics(sample).art.weapon.assetId).toBe(ACTOR_STATIC_IDS.emitter);
    const hand=hero.sourceGrip as {x:number;y:number},grip=weapon.sourceGrip as {x:number;y:number},muzzle=weapon.sourceMuzzle as {x:number;y:number};
    const actualHand=sourcePoint(body,mocked.runtime.assets[String(body.frame)],hand.x,hand.y),actualGrip=sourcePoint(tool,mocked.runtime.assets[String(tool.frame)],grip.x,grip.y),actualMuzzle=sourcePoint(tool,mocked.runtime.assets[String(tool.frame)],muzzle.x,muzzle.y);
    expect(actualHand.x).toBeCloseTo(actualGrip.x,9);expect(actualHand.y).toBeCloseTo(actualGrip.y,9);
    expect((weapon.sourceScale as number)/(hero.sourceScale as number)).toBeCloseTo(96/128,9);
    expect(hero.screenFoot).toEqual({x:1440*.76,y:900*.86});expect(weapon.worldFoot).toEqual(hero.worldFoot);
    expect(hero.worldFoot).not.toEqual({x:sample.player.x,y:sample.player.y});expect(weapon.entityId).toBe('menu:hero');expect(weapon.sourceFoot).toBeNull();
    const origin=renderer.camera.worldToScreen({x:0,y:0}),recorded=weapon.muzzle as {x:number;y:number};
    expect(actualMuzzle.x).toBeCloseTo(origin.x+recorded.x*renderer.camera.scale,9);expect(actualMuzzle.y).toBeCloseTo(origin.y+recorded.y*renderer.camera.scale,9);
    expect(JSON.stringify(sample)).toBe(before);
  });

  it.each(['hero-back-frame','emitter'] as const)('keeps the normal menu holding composition unready when %s is missing',async missing=>{
    actors();delete mocked.runtime.assets[missing==='emitter'?ACTOR_STATIC_IDS.emitter:'fantasy.actor.hero.back_right.walk.07'];
    const sample=state();sample.phase='menu';const {renderer,host}=await setup();renderer.render(sample,sample.player);
    expect(host.sprites.filter(item=>item.id==='menu:hero'||item.id==='menu:tool')).toEqual([]);
    const diagnostics=renderer.diagnostics(sample);expect(diagnostics.art.actorContract.ready).toBe(false);
    expect(diagnostics.art.actorFrames.find(a=>a.actorId==='menu:hero')).toMatchObject({native:false,fallback:true,
      fallbackReason:missing==='emitter'?'emitter-registration-or-group-not-ready':'hero-group-not-ready'});
  });

  it('renders four real authored/mirrored views with the per-pose hand/tool muzzle and never uses the old mesh rig', async () => {
    actors();const sample=state();mocked.entities.push({id:'player',kind:'player',y:sample.player.y});
    const {renderer,host,scene}=await setup();
    for(const [facing,direction] of [[.5,'front_right'],[2.5,'front_left'],[-.5,'back_right'],[-2.5,'back_left']] as const){
      sample.player.facing=facing;sample.elapsed+=.2;sample.tick+=12;
      const before=JSON.stringify(sample);renderer.render(sample,sample.player);
      const body=host.sprites.find(item=>item.id==='player')!.config,tool=host.sprites.find(item=>item.id==='player:tool')!.config;
      expect(body.frame).toMatch(/fantasy\.actor\.hero\.(front_right|back_right)\.idle\./);expect(body.mesh).toBeUndefined();
      expect(tool.depth).toBeGreaterThan(body.depth);
      expect(scene.fallbacks).toEqual([]);
      const diagnostics=renderer.diagnostics(sample).art.actorFrames;
      const hero=diagnostics.find(item=>item.actorId==='player')!,weapon=diagnostics.find(item=>item.actorId==='player:tool')!;
      expect(hero.direction).toBe(direction);expect(hero.native).toBe(true);expect(hero.groupReady).toBe(true);
      const foot=sourcePoint(body,mocked.runtime.assets[String(body.frame)],256,435.2);
      expect(foot.x).toBeCloseTo((hero.screenFoot as {x:number}).x,9);expect(foot.y).toBeCloseTo((hero.screenFoot as {y:number}).y,9);
      const muzzle=sourcePoint(tool,mocked.runtime.assets[ACTOR_STATIC_IDS.emitter],390,285),p=renderer.camera.worldToScreen({x:0,y:0});
      expect(muzzle.x).toBeCloseTo(p.x+(weapon.muzzle as {x:number}).x*renderer.camera.scale,9);
      expect(muzzle.y).toBeCloseTo(p.y+(weapon.muzzle as {y:number}).y*renderer.camera.scale,9);
      expect(JSON.stringify(sample)).toBe(before);
    }
  });

  it('freezes the actual new walk frame and reports its presented clip when pause clears moving',async()=>{
    actors();const sample=state();sample.player.moving=true;mocked.entities.push({id:'player',kind:'player',y:sample.player.y});
    const {renderer,host}=await setup();renderer.render(sample,sample.player);
    sample.elapsed+=.2;sample.tick+=12;sample.player.x+=28;renderer.render(sample,sample.player);
    const moving=host.sprites.find(item=>item.id==='player')!.config.frame;
    sample.phase='paused';sample.player.moving=false;renderer.render(sample,sample.player);
    expect(host.sprites.find(item=>item.id==='player')!.config.frame).toBe(moving);
    // The frozen distance controller retains its walk request while paused;
    // the accepted input state has been cleared and the shown body stays fixed.
    expect(sample.player.moving).toBe(false);
    expect(renderer.diagnostics(sample).art.actorFrames.find(item=>item.actorId==='player')).toMatchObject({action:'walk',clip:'walk',requestedAction:'walk',requestedClip:'walk'});
  });
  it('lifts exactly one real hero and its registered tool at the flight apex, preserving the ground footprint',async()=>{
    actors();const sample=state();sample.playerFlight={id:'flight',from:{x:sample.player.x-100,y:sample.player.y},to:{x:sample.player.x+100,y:sample.player.y},born:.625,landsAt:1.375};
    mocked.entities.push({id:'player',kind:'player',y:sample.player.y});const {renderer,host}=await setup(),before=JSON.stringify(sample);
    renderer.render(sample,sample.player);const player=host.sprites.filter(item=>item.id==='player');expect(player).toHaveLength(1);
    const foot=renderer.camera.worldToScreen(sample.player);expect(player[0].config.y).toBeCloseTo(foot.y-120*renderer.camera.scale,8);
    expect(player[0].config.frame).toContain('.dash.');expect(host.sprites.filter(item=>item.id==='player:tool')).toHaveLength(1);
    expect(renderer.diagnostics(sample).art.activeBodies.find(item=>item.id==='player')!.bounds.top).toBeLessThan(sample.player.y*.72-120);
    expect(JSON.stringify(sample)).toBe(before);
  });

  it('reports the actual frozen enemy walk frame after death during pause, then reports dissolve only when it is displayed on resume',async()=>{
    actors();const sample=state();sample.visualTime=sample.elapsed;
    const actor=target('pause-death',{traits:[],facing:2.5});sample.targets=[actor];
    mocked.entities.push({id:actor.id,kind:'target',index:0,y:actor.y});const {renderer,host}=await setup();
    renderer.render(sample,sample.player);sample.elapsed+=.13;sample.visualTime=sample.elapsed;sample.tick+=8;renderer.render(sample,sample.player);
    const previous={...host.sprites.find(item=>item.id===actor.id)!.config};
    expect(previous.frame).toBe('fantasy.actor.enemy.basic.walk.01');expect(previous.flipX).toBe(true);
    sample.phase='paused';actor.hp=0;actor.deadAt=sample.elapsed;actor.hitUntil=sample.elapsed+.1;actor.facing=.5;
    const before=JSON.stringify(sample);renderer.render(sample,sample.player);
    const frozen=host.sprites.find(item=>item.id===actor.id)!.config,paused=renderer.diagnostics(sample).art.actorFrames.find(item=>item.actorId===actor.id)!;
    expect(frozen.frame).toBe(previous.frame);expect(frozen.flipX).toBe(previous.flipX);
    expect(paused).toMatchObject({semanticId:frozen.frame,frame:frozen.frame,identity:'enemy.basic',action:'walk',clip:'walk',frameIndex:1,
      direction:'front_left',authoredDirection:'front_right',flipX:true,requestedAction:'dissolve',requestedClip:'dissolve',requestedDirection:'front_right',requestedFlipX:false});
    expect(JSON.stringify(sample)).toBe(before);
    sample.phase='playing';const resumedBefore=JSON.stringify(sample);renderer.render(sample,sample.player);
    const resumed=host.sprites.find(item=>item.id===actor.id)!.config;
    expect(resumed.frame).toBe('fantasy.actor.enemy.basic.dissolve.00');expect(resumed.flipX).toBe(false);
    expect(renderer.diagnostics(sample).art.actorFrames.find(item=>item.actorId===actor.id)).toMatchObject({semanticId:resumed.frame,
      action:'dissolve',clip:'dissolve',frameIndex:0,direction:'front_right',flipX:false,requestedAction:'dissolve',requestedClip:'dissolve'});
    expect(JSON.stringify(sample)).toBe(resumedBefore);
  });

  it('reports the actual paused immune bite and mirrored back view when current intent changes to a front-view guard',async()=>{
    actors();const sample=state();sample.elapsed=1.19;sample.visualTime=sample.elapsed;
    const actor=cell({facing:-2.5,attackUntil:1.2,activity:'biting'});sample.growth!.cells=[actor];
    mocked.entities.push({id:actor.id,kind:'immune',index:0,y:actor.y});const {renderer,host}=await setup();renderer.render(sample,sample.player);
    const previous={...host.sprites.find(item=>item.id===actor.id)!.config};
    expect(previous.frame).toBe('fantasy.actor.immune.back_right.bite.03');expect(previous.flipX).toBe(true);
    sample.phase='paused';actor.facing=.5;actor.attackUntil=sample.elapsed;actor.activity='guarding';
    const before=JSON.stringify(sample);renderer.render(sample,sample.player);
    const frozen=host.sprites.find(item=>item.id===actor.id)!.config;
    expect(frozen.frame).toBe(previous.frame);expect(frozen.flipX).toBe(previous.flipX);
    expect(renderer.diagnostics(sample).art.actorFrames.find(item=>item.actorId===actor.id)).toMatchObject({semanticId:frozen.frame,
      action:'bite',clip:'bite',frameIndex:3,direction:'back_left',authoredDirection:'back_right',flipX:true,
      requestedAction:'guard',requestedClip:'crawl',requestedDirection:'front_right',requestedAuthoredDirection:'front_right',requestedFlipX:false});
    expect(JSON.stringify(sample)).toBe(before);
    sample.phase='playing';const resumedBefore=JSON.stringify(sample);renderer.render(sample,sample.player);
    const resumed=host.sprites.find(item=>item.id===actor.id)!.config;
    expect(resumed.frame).toBe('fantasy.actor.immune.front_right.crawl.00');expect(resumed.flipX).toBe(false);
    expect(renderer.diagnostics(sample).art.actorFrames.find(item=>item.actorId===actor.id)).toMatchObject({semanticId:resumed.frame,
      action:'guard',clip:'crawl',frameIndex:0,direction:'front_right',authoredDirection:'front_right',flipX:false,requestedAction:'guard',requestedClip:'crawl'});
    expect(JSON.stringify(sample)).toBe(resumedBefore);
  });

  it('keeps a missing back-view group explicitly unready even while old hero PNGs remain available in an isolated fixture', async () => {
    actors();delete mocked.runtime.assets['fantasy.actor.hero.back_right.walk.07'];
    const sample=state();mocked.entities.push({id:'player',kind:'player',y:sample.player.y});const {renderer,host,scene}=await setup();
    renderer.render(sample,sample.player);expect(host.sprites.filter(item=>item.id==='player')).toEqual([]);expect(scene.fallbacks).toContain('player');
    expect(renderer.diagnostics(sample).art.actorFrames.find(item=>item.actorId==='player')).toMatchObject({native:false,groupReady:false,fallback:true,fallbackReason:'hero-group-not-ready'});
    expect(renderer.diagnostics(sample).art.actorContract.ready).toBe(false);
  });

  it.each([1,2] as const)('registers the new emitter muzzle for accepted challenge tool %i and retains its actual historical emission',async toolNumber=>{
    actors();const source=mocked.runtime.assets[ACTOR_STATIC_IDS.emitter];
    const game=new GameSession(31,{mode:'endless'});game.start();game.state.targets=[];game.state.world!.obstacles=[];
    const aim={x:1000,y:500};game.step(heroInput({fire:true,tool:toolNumber,aim}));const shot=game.state.playerProjectiles![0];expect(shot).toBeDefined();
    mocked.entities.push({id:'player',kind:'player',y:game.state.player.y});const {renderer,host,scene}=await setup();
    const before=JSON.stringify(game.state);renderer.render(game.state,aim);
    const tool=host.sprites.find(item=>item.id==='player:tool')!.config,muzzle=sourcePoint(tool,source,390,285);
    expect(renderer.diagnostics(game.state).art.actorFrames.find(item=>item.actorId==='player:tool')).toMatchObject({
      action:'static',clip:'static',logicalAction:toolNumber===1?'fire':'catalysis',requestedAction:toolNumber===1?'fire':'catalysis',requestedClip:'static'});
    const body=host.sprites.find(item=>item.id==='player')!.config,hero=renderer.diagnostics(game.state).art.actorFrames.find(item=>item.actorId==='player')!;
    const handSource=hero.sourceGrip as {x:number;y:number},hand=sourcePoint(body,mocked.runtime.assets[String(body.frame)],handSource.x,handSource.y);
    const held=sourcePoint(tool,source,96,320);
    expect(held.x).toBeCloseTo(hand.x,9);expect(held.y).toBeCloseTo(hand.y,9);
    const origin=scene.bridge.projectileOrigin!(shot.castId)!,offset=renderer.camera.worldToScreen({x:0,y:0});
    expect(origin.x*renderer.camera.scale+offset.x).toBeCloseTo(muzzle.x,9);
    expect(origin.y*.72*renderer.camera.scale+offset.y).toBeCloseTo(muzzle.y,9);expect(JSON.stringify(game.state)).toBe(before);
    const captured={...origin};game.step(heroInput({moveX:1,tool:3,aim:{x:100,y:400}}));renderer.witnessSimulation(game.state);renderer.render(game.state,game.state.player);
    expect(scene.bridge.projectileOrigin!(shot.castId)).toEqual(captured);
  });

  it('shows the real back-view bite frame on a living immune entity without rotating its upright PNG',async()=>{
    actors();const sample=state();sample.elapsed=1.19;sample.growth!.cells=[cell({facing:-2.5,attackUntil:1.2})];
    mocked.entities.push({id:'cell',kind:'immune',index:0,y:400});const {renderer,host,scene}=await setup();renderer.render(sample,sample.player);
    expect(scene.fallbacks).toEqual([]);const sprite=host.sprites.find(item=>item.id==='cell')!.config;
    expect(sprite.frame).toBe('fantasy.actor.immune.back_right.bite.03');expect(sprite.flipX).toBe(true);expect(sprite.rotation??0).toBe(0);
    expect(renderer.diagnostics(sample).art.actorFrames.find(item=>item.actorId==='cell')).toMatchObject({action:'bite',direction:'back_left',native:true,groupReady:true});
  });

  it('keeps real family/role attachments and a low-effects dissolve frame, without recolouring the new body', async () => {
    actors();const sample=state();sample.elapsed=2;
    sample.targets=[target('elite-new',{role:'elite',traits:['FISSION','CARAPACE'],generation:1,territoryTask:{kind:'invade',nodeId:'heart-healing-1'}}),
      target('dead-new',{hp:0,deadAt:1.85,traits:[]})];
    mocked.entities.push(...sample.targets.map((t,index)=>({id:t.id,kind:'target',index,y:t.y})));
    const {renderer,host,scene}=await setup();renderer.render(sample,sample.player,{lowEffects:true});
    expect(scene.fallbacks).toEqual([]);
    expect(host.sprites.find(item=>item.id==='elite-new')!.config.frame).toContain('enemy.fission.child.walk');
    expect(host.sprites.filter(item=>item.id.startsWith('elite-new:')).map(item=>item.config.frame)).toEqual([ACTOR_STATIC_IDS.invader,ACTOR_STATIC_IDS.elite]);
    const dead=host.sprites.find(item=>item.id==='dead-new')!.config;expect(dead.frame).toContain('enemy.basic.dissolve.00');expect(dead.alpha).toBeCloseTo(.5,9);
    expect(host.sprites.every(item=>item.config.tint===undefined)).toBe(true);
    expect(renderer.diagnostics(sample).art.actorFrames.find(item=>item.actorId==='dead-new')!.action).toBe('dissolve');
  });

  it('uses new registered mother phase layers and neutral fallback for any incomplete identity', async () => {
    actors();const {sample,actor,combat}=motherFixture(['CARAPACE','FISSION']);const {renderer,host}=await setup();
    renderer.render(sample,sample.player);
    expect(host.sprites.filter(item=>item.id===actor.id||item.id.startsWith(`${actor.id}:`)).every(item=>String(item.config.frame).startsWith('fantasy.actor.mother.'))).toBe(true);
    expect(renderer.diagnostics(sample).art.actorFrames.filter(item=>item.identity==='mother').every(item=>(item.sourceFoot as {y:number}).y===870.4)).toBe(true);
    combat.exposedUntil=sample.elapsed+1;renderer.render(sample,sample.player);
    expect(host.sprites.some(item=>String(item.config.frame).includes('mother.membrane'))).toBe(true);
    expect(host.sprites.some(item=>item.config.frame==='fantasy.actor.mother.core.01')).toBe(true);
    combat.membrane.remaining=0;renderer.render(sample,sample.player);
    expect(host.sprites.some(item=>String(item.config.frame).includes('mother.membrane'))).toBe(false);
  });
});
