import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, Vec } from '../../src/game/types';
import { CampWeaponTrial } from '../../src/game/campWeaponTrial';
import { combatVfxCue } from '../../src/render/combatVfxRecipes';
import { COMBAT_VFX_BUDGET, CombatVfxRuntime, combatRopeVertices, type CombatVfxProjection } from '../../src/render/combatVfxRuntime';

class Display {
  x = 0; y = 0; depth = 0; alpha = 1; destroyed = false; scaleX = 1; scaleY = 1; width = 0; height = 0;
  frame?: string | number; blend?: string | number; points: Vec[] = []; particleMs = 0; emitted = 0; alive = 0; life = 430;
  active = true; visible = true; anims = { stop() {} };
  vertices = new Float32Array(0); dirty = true;
  constructor(readonly kind: string, public texture = '') {}
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setDepth(n: number) { this.depth = n; return this; }
  setAlpha(n: number) { this.alpha = n; return this; }
  setOrigin() { return this; }
  setTint() { return this; }
  clearTint() { return this; }
  setColors() { return this; }
  setAlphas() { return this; }
  setActive(value: boolean) { this.active = value; return this; }
  setVisible(value: boolean) { this.visible = value; return this; }
  setTexture(texture: string, frame?: string | number) { this.texture = texture; this.frame = frame; return this; }
  setConfig(config: { lifespan?: number }) { this.life = config.lifespan ?? 430; this.particleMs = 0; return this; }
  setRotation() { return this; }
  setFrame(n: string | number) { this.frame = n; return this; }
  setBlendMode(n: string | number) { this.blend = n; return this; }
  setDisplaySize(w: number, h: number) { this.width = w; this.height = h; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setPoints(points: Vec[]) { this.points = points.map(p => ({ ...p })); return this; }
  destroy() { this.destroyed = true; }
  explode(n: number) { this.emitted += n; this.alive += n; return this; }
  killAll() { this.alive = 0; return this; }
  getAliveParticleCount() { return this.alive; }
  preUpdate(_now: number, delta: number) { this.particleMs += delta; if (this.particleMs >= this.life) this.alive = 0; }
}
function phaser() {
  const objects: Display[] = [], detached: Display[] = [], textureKeys = new Set<string>();
  const create = (kind: string, texture = '') => { const d = new Display(kind, texture); objects.push(d); return d; };
  const graphics = {
    lineStyle() { return this; }, strokeCircle() { return this; }, fillStyle() { return this; }, fillCircle() { return this; },
    beginPath() { return this; }, arc() { return this; }, strokePath() { return this; },
    fillTriangle() { return this; }, fillRoundedRect() { return this; }, fillRect() { return this; }, destroy() {},
    generateTexture(key: string) { textureKeys.add(key); return this; },
  };
  const scene = {
    add: {
      graphics: () => graphics,
      sprite: (_x: number, _y: number, texture: string, frame?: string | number) => { const d = create('sprite', texture); d.frame = frame; return d; },
      rope: (_x: number, _y: number, texture: string) => create('rope', texture),
      particles: (_x: number, _y: number, texture: string, config: { lifespan?: number }) => create('emitter', texture).setConfig(config),
    },
    textures: { exists: (key: string) => textureKeys.has(key), remove: (key: string) => textureKeys.delete(key) },
    sys: { updateList: { remove: (o: Display) => detached.push(o) } },
  } as unknown as Phaser.Scene;
  return { scene, objects, detached, textureKeys };
}
const projection: CombatVfxProjection = {
  projectGround: p => ({ x: p.x, y: p.y * .72 }), projectUpright: (p, h) => ({ x: p.x, y: p.y * .72 - h }),
  depthAt: y => 100 + y, entityDepth: () => undefined, anchorScreen: () => undefined,
  groundDepth: 4, frontDepth: 9500, criticalDepth: 10000, scale: 1,
};
function event(type: string, tick = 60, data: GameEvent['data'] = {}): GameEvent {
  return { type, tick, data: { castId: 'cast', targetId: 'victim', damage: 10, x: 220, y: 160, weaponId: 'steady', ...data } };
}
function state(events: GameEvent[] = [], tick = 60): GameState {
  return { seed: 11, phase: 'playing', tick, elapsed: tick / 60, visualTime: tick / 60,
    player: { x: 100, y: 100, hp: 100, radius: 20 }, tissue: { x: 10, y: 10, hp: 100, maxHp: 100, radius: 20 },
    targets: [{ id: 'victim', x: 220, y: 160, hp: 50, radius: 18 }], events,
    battle: { organId: 'heart' }, growth: { runId: 'run', cells: [] },
    world: { width: 1200, height: 800, bounds: { left: 0, right: 1200, top: 0, bottom: 800 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } },
  } as unknown as GameState;
}

describe('native combat VFX ownership and displayed-time lifecycle', () => {
  it('requires accepted positive damage, resolves a real victim, and never changes simulation state', () => {
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene);
    expect(combatVfxCue(event('TARGET_HIT', 60, { damage: 0 }))).toBeUndefined();
    expect(combatVfxCue(event('PLAYER_HURT', 60, { damage: -2 }))).toBeUndefined();
    const game = state([event('TARGET_HIT', 60, { id: 'victim', x: NaN, y: NaN })]);
    const before = JSON.stringify(game); runtime.syncFrame(game, projection);
    expect(runtime.diagnostics()).toMatchObject({ active: 1, spawned: 1, nativeEmitters: 1 });
    expect(JSON.stringify(game)).toBe(before);
    const missing = event('TARGET_HIT', 61, { id: 'absent', targetId: 'absent', x: NaN, y: NaN });
    runtime.syncFrame({ ...game, tick: 61, elapsed: 61 / 60, visualTime: 61 / 60, events: [missing] }, projection);
    expect(runtime.diagnostics().spawned).toBe(1);
    expect(host.detached).toHaveLength(1);
  });

  it('queues future receipts until their visual time and freezes both pending and active particles on pause', () => {
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene), hit = event('PLAYER_PROJECTILE_HIT');
    runtime.accept(hit);
    const game = state([hit]); game.visualTime = .99;
    runtime.syncFrame(game, projection);
    expect(runtime.diagnostics()).toMatchObject({ pending: 1, active: 0 });
    runtime.syncFrame({ ...game, visualTime: 1 }, projection);
    const emitter = host.objects.find(o => o.kind === 'emitter')!;
    expect(emitter.particleMs).toBe(0);
    runtime.syncFrame({ ...game, visualTime: 1.05 }, projection);
    expect(emitter.particleMs).toBeCloseTo(50);
    const next = event('PLAYER_PROJECTILE_HIT', 64, { castId: 'next', kind: 'cannon' }); runtime.accept(next);
    const held = runtime.diagnostics().visualTime;
    runtime.syncFrame({ ...game, phase: 'paused', elapsed: 20, visualTime: 20 }, projection);
    expect(runtime.diagnostics()).toMatchObject({ paused: true, pending: 1, visualTime: held });
    expect(emitter.particleMs).toBeCloseTo(50);
    runtime.syncFrame({ ...game, tick: 64, elapsed: 64 / 60, visualTime: 64 / 60, events: [hit, next] }, projection);
    expect(emitter.particleMs).toBeCloseTo(1000 / 15);
    expect(runtime.diagnostics().spawned).toBe(2);
  });

  it('collapses generic and specialised contact aliases and keeps bus receipts outside the bounded game log', () => {
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene);
    runtime.accept(event('TARGET_HIT', 60, { id: 'victim' }));
    runtime.accept(event('PLAYER_PROJECTILE_HIT'));
    const noise = Array.from({ length: 512 }, () => event('TARGET_MOVED'));
    const game = state(noise); runtime.syncFrame(game, projection);
    expect(runtime.diagnostics().scanned).toBe(128);
    runtime.syncFrame(game, projection);
    runtime.accept(event('PLAYER_PROJECTILE_HIT')); runtime.syncFrame(game, projection);
    expect(runtime.diagnostics()).toMatchObject({ spawned: 1, active: 1, pending: 0, remembered: 1, scanned: 0 });
  });

  it('bounds queues and native objects, retaining contact/terminal cues ahead of ambient ones, including low mode switches', () => {
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene);
    for (let n = 0; n < 300; n++) runtime.accept(event('PLAYER_PROJECTILE_HIT', 60, { castId: `hit${n}` }));
    runtime.accept(event('BLADE_TRACE_FINISHED', 60, { castId: 'terminal' }));
    expect(runtime.diagnostics().pending).toBe(COMBAT_VFX_BUDGET.pending);
    const game = state(); runtime.syncFrame(game, projection);
    expect(runtime.diagnostics().active).toBeLessThanOrEqual(COMBAT_VFX_BUDGET.active);
    expect(runtime.diagnostics().particles).toBeLessThanOrEqual(COMBAT_VFX_BUDGET.particles);
    expect(runtime.diagnostics().byRecipe.finale).toBe(1);
    runtime.syncFrame(game, projection, { lowEffects: true });
    expect(runtime.diagnostics().active).toBeLessThanOrEqual(COMBAT_VFX_BUDGET.lowActive);
    expect(runtime.diagnostics().particles).toBeLessThanOrEqual(COMBAT_VFX_BUDGET.lowParticles);
    runtime.dispose();
    expect(host.objects.every(o => o.destroyed)).toBe(true); expect(host.textureKeys.size).toBe(0);
  });

  it('resets organ/trial scopes by stable receipt keys, preserves fresh cloned receipts, and rejects old-scope log replay', () => {
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene), old = event('PLAYER_PROJECTILE_HIT', 60, { organId: 'heart' });
    runtime.syncFrame(state([old]), projection, { scopeId: 'trial:1' });
    const fresh = event('PLAYER_PROJECTILE_HIT', 61, { castId: 'new', organId: 'lung' }); runtime.accept(fresh);
    const game = { ...state([old, structuredClone(fresh)], 61), battle: { organId: 'lung' } } as GameState;
    runtime.syncFrame(game, projection, { scopeId: 'trial:2' });
    expect(runtime.diagnostics()).toMatchObject({ active: 1, spawned: 2, clearReason: 'scope' });
    expect(host.objects.filter(o => o.kind === 'emitter' && !o.destroyed && o.visible)).toHaveLength(1);
    runtime.syncFrame({ ...game, camp: {} } as GameState, projection, { scopeId: 'camp' });
    expect(runtime.diagnostics()).toMatchObject({ active: 0, pending: 0, clearReason: 'camp' });
  });

  it('keeps accepted finale receipts after their gameplay action is removed by wave settlement', () => {
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene), finish = event('BLADE_TRACE_FINISHED');
    const game = state([finish]); runtime.syncFrame(game, projection);
    runtime.syncFrame({ ...game, tick: 66, elapsed: 1.1, visualTime: 1.1, weaponCombat: undefined }, projection);
    expect(runtime.diagnostics().byRecipe.finale).toBe(1);
    runtime.syncFrame({ ...game, tick: 108, elapsed: 1.8, visualTime: 1.8 }, projection);
    expect(runtime.diagnostics().active).toBe(0);
  });

  it('uses projected anchors once, chooses the displayed sequence frame manually, and normalizes catalog blend modes', () => {
    const host = phaser(); host.textureKeys.add('atlas');
    const runtime = new CombatVfxRuntime(host.scene, () => ({ atlasKey: 'atlas', frameNames: ['a', 'b', 'c', 'd'], duration: .4, blendMode: 'add', pivot: { x: .5, y: .8 } }));
    const shot = event('PLAYER_PROJECTILE_LAUNCHED'), game = state([shot]);
    const anchored = { ...projection, anchorScreen: () => ({ x: 900, y: 450 }) };
    runtime.syncFrame(game, anchored); runtime.syncFrame({ ...game, visualTime: 1.21, tick: 73, elapsed: 73 / 60 }, anchored);
    const sprite = host.objects.find(o => o.kind === 'sprite' && o.texture === 'atlas')!;
    expect(sprite).toMatchObject({ x: 900, y: 450, frame: 'c', blend: 'NORMAL' });
  });

  it('draws a bounded native Rope arc inside real collision limits and honors the second swing direction', () => {
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene);
    const swing = event('WEAPON_MELEE_SWING', 60, { combo: 2 });
    const sweep = event('WEAPON_MELEE_SWEEP', 60, { x: 100, y: 100, aimX: 240, aimY: 100, radius: 110, arcHalfAngle: 1 });
    const game = state([swing, sweep]); game.world!.obstacles = [{ id: 'fold', x: 1100, y: 100, radius: 960 }]; runtime.syncFrame(game, projection);
    const rope = host.objects.find(o => o.kind === 'rope')!, initial = rope.points.at(-1)!.y;
    runtime.syncFrame({ ...game, tick: 63, elapsed: 1.05, visualTime: 1.05 }, projection);
    expect(rope.points).toHaveLength(13); expect(rope.points.at(-1)!.y).toBeLessThan(initial);
    expect(rope.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.hypot(p.x, p.y) <= 110.00001)).toBe(true);
    expect(rope.points.every(p => p.x < 50)).toBe(true);
    expect(rope.points.some(p => Math.hypot(p.x, p.y) < 60)).toBe(true);
    expect(runtime.diagnostics().nativeRopes).toBe(1);
    expect(runtime.diagnostics().ropeGeometry[0].maxWidthCSS).toBeLessThanOrEqual(6.0001);
  });

  it('anchors ordinary bites on their victim and collapses both Seraph receipt aliases by accepted root/part', () => {
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene);
    const ordinary = event('IMMUNE_PATROL_HIT', 60, { rootId: 'bite:1', cellId: 'cell', x: 40, y: 40 });
    runtime.syncFrame(state([ordinary]), projection);
    const contact = host.objects.find(o => o.kind === 'sprite')!;
    expect(contact.x).toBe(220); expect(contact.y).toBeCloseTo(160 * .72 - 15);
    const vfx = new CombatVfxRuntime(phaser().scene);
    const first = event('LEGION_SERAPH_HIT', 60, { rootId: 'action:part:0:victim', actionId: 'action', part: 0 });
    const alias = event('PROTOCOL_BEACON_HIT', 60, { rootId: 'action:part:0:victim' });
    const different = event('LEGION_SERAPH_HIT', 60, { rootId: 'action:part:1:victim', actionId: 'action', part: 1 });
    [first, alias, different].forEach(e => vfx.accept(e));
    vfx.syncFrame(state([first, alias, different]), projection);
    expect(vfx.diagnostics()).toMatchObject({ accepted: 2, spawned: 2, remembered: 2 });
  });

  it('throttles repeated light thunder contacts per victim while preserving heavy/terminal receipts and reusing native objects', () => {
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene);
    const hit = (tick: number, targetId = 'victim') => event('TARGET_HIT', tick, { id: targetId, targetId, rootId: `pulse:${tick}`, weaponId: 'thunder', cause: 'basic' });
    runtime.syncFrame(state([hit(60)]), projection);
    runtime.syncFrame(state([hit(66)], 66), projection);
    expect(runtime.diagnostics()).toMatchObject({ spawned: 1, coalesced: 1 });
    const heavy = event('THUNDER_DETONATE_HIT', 67, { rootId: 'heavy', weaponId: 'thunder' });
    runtime.syncFrame(state([heavy], 67), projection);
    expect(runtime.diagnostics().byRecipe['heavy-hit']).toBe(1);
    runtime.syncFrame(state([hit(84)], 84), projection);
    expect(runtime.diagnostics().reusedEmitters).toBeGreaterThan(0);
    expect(runtime.diagnostics().reusedSprites).toBeGreaterThan(0);
    expect(runtime.diagnostics().actualAliveParticleCount).toBe(runtime.diagnostics().particles);
    expect(runtime.diagnostics().remembered).toBe(4);
  });

  it('coalesces continuous healing and keeps thunder pillars upright while their shock ring stays on the ground', () => {
    const host = phaser(); host.textureKeys.add('pillar');
    const runtime = new CombatVfxRuntime(host.scene, recipe => recipe === 'finale' ? { atlasKey: 'pillar', width: 180, height: 390, pivot: { x: .5, y: .85 } } : undefined);
    for (const tick of [60, 61, 62, 63]) runtime.syncFrame(state([event('TERRITORY_PLAYER_HEALED', tick, { amount: 1 })], tick), projection);
    expect(runtime.diagnostics()).toMatchObject({ spawned: 1, coalesced: 3 });
    runtime.accept(event('WEAPON_ULTIMATE_PULSE', 64, { weaponId: 'thunder', final: true }));
    runtime.syncFrame(state([], 64), projection);
    const pillar = host.objects.find(o => o.kind === 'sprite' && o.visible && o.texture === 'pillar')!;
    const rings = host.objects.filter(o => o.kind === 'sprite' && o.visible && o.depth === projection.groundDepth);
    expect(pillar.width / pillar.height).toBeCloseTo(180 / 390);
    expect(rings).toHaveLength(1); expect(rings[0].height / rings[0].width).toBeCloseTo(.72);
  });

  it('recognizes actual enemy/infection/return receipts without replacing authoritative hazard geometry', () => {
    const expected: [string, string, GameEvent['data']][] = [
      ['PLAYER_INFECTED', 'infection', { duration: 6, until: 7 }],
      ['TERRITORY_CAPTURED', 'infection', { nodeId: 'north' }],
      ['TERRITORY_PURIFIED', 'purify', { nodeId: 'north' }],
      ['SLIME_LANDED', 'enemy-impact', { id: 'slime:1', radius: 55 }],
      ['CORE_ATTACK_TELEGRAPHED', 'enemy-windup', { coreId: 'boss', resolveAt: 1.5 }],
      ['ATTACK_TELEGRAPHED', 'enemy-windup', { actorId: 'enemy', resolveAt: 1.5 }],
      ['PLAYER_PROJECTILE_RETURNED', 'return', {}],
      ['THUNDER_STORM_COLLAPSE', 'charge', { weaponId: 'thunder' }],
      ['THUNDER_ROD_PLANTED', 'charge', { weaponId: 'thunder' }],
    ];
    for (const [type, recipe, data] of expected) expect(combatVfxCue(event(type, 60, data))?.recipe, type).toBe(recipe);
    expect(combatVfxCue(event('TERRITORY_NODE_PURIFIED'))).toBeUndefined();
    expect(combatVfxCue(event('THUNDER_ROD_POWER_CHANGED', 60, { powered: false }))).toBeUndefined();
  });

  it('keeps different roots and victims distinct while reducing dense contact exposure instead of dropping heavy hits', () => {
    const first = event('TARGET_HIT', 60, { rootId: 'one', id: 'victim' });
    const second = event('TARGET_HIT', 60, { rootId: 'two', id: 'victim' });
    const third = event('TARGET_HIT', 60, { rootId: 'one', id: 'another', targetId: 'another' });
    expect(new Set([first, second, third].map(e => combatVfxCue(e)!.key)).size).toBe(3);
    const soloHost = phaser(), solo = new CombatVfxRuntime(soloHost.scene);
    solo.syncFrame(state([event('THUNDER_DETONATE_HIT')]), projection);
    const soloAlpha = soloHost.objects.find(o => o.kind === 'sprite')!.alpha;
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene);
    const hits = Array.from({ length: 26 }, (_, n) => event('THUNDER_DETONATE_HIT', 60, { castId: `cast${n}` }));
    const game = state(hits); runtime.syncFrame(game, projection); runtime.syncFrame(game, projection);
    expect(runtime.diagnostics()).toMatchObject({ active: 26, spawned: 26 });
    expect(host.objects.filter(o => o.kind === 'sprite').every(o => o.alpha < soloAlpha)).toBe(true);
  });

  it('accepts exact fractional timestamps from the real safe weapon range, including receipts appended within one outer step', () => {
    const trial = new CampWeaponTrial({ weaponId: 'steady', rarity: 'purple', upgrade: 0 });
    trial.advance(.01); trial.trigger();
    const initial = trial.snapshot(), launch = initial.events.find(e => e.type === 'PLAYER_PROJECTILE_LAUNCHED')!;
    expect(Number.isInteger(launch.tick)).toBe(false);
    expect(combatVfxCue(launch)?.born).toBeCloseTo(.01, 12);
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene);
    runtime.syncFrame(initial, projection, { scopeId: 'safe-range:1' });
    expect(runtime.diagnostics().spawned).toBeGreaterThan(0);
    const before = runtime.diagnostics().spawned;
    // A UI trigger is allowed before another outer clock step advances.
    trial.skill(3); runtime.syncFrame(trial.snapshot(), projection, { scopeId: 'safe-range:1' });
    expect(runtime.diagnostics().spawned).toBeGreaterThan(before);
    let contactSeen = false;
    for (let n = 0; n < 25; n++) {
      trial.advance(.013); runtime.syncFrame(trial.snapshot(), projection, { scopeId: 'safe-range:1' });
      contactSeen ||= (runtime.diagnostics().byRecipe.hit ?? 0) + (runtime.diagnostics().byRecipe['heavy-hit'] ?? 0) > 0;
    }
    const later = trial.snapshot(); runtime.syncFrame(later, projection, { scopeId: 'safe-range:1' });
    expect(later.events.some(e => e.type === 'PLAYER_PROJECTILE_HIT')).toBe(true);
    expect(contactSeen).toBe(true);
  });

  it('samples only existing Seraph echoes into bounded native trails and clears them in reduced effects', () => {
    const host = phaser(), runtime = new CombatVfxRuntime(host.scene), game = state();
    game.growth!.cells = Array.from({ length: 20 }, (_, n) => ({ id: `echo:${n}`, legionId: 'seraph', echo: true, organId: 'heart',
      x: 100 + n * 20, y: 100, hp: 50, until: 10 })) as unknown as NonNullable<GameState['growth']>['cells'];
    runtime.syncFrame(game, projection);
    const next = { ...game, tick: 66, elapsed: 1.1, visualTime: 1.1,
      growth: { ...game.growth!, cells: game.growth!.cells!.map(c => ({ ...c, x: c.x + 20 })) } };
    runtime.syncFrame(next, projection);
    expect(runtime.diagnostics()).toMatchObject({ echoTrails: 8, echoSamples: 16, nativeRopes: 8 });
    expect(runtime.diagnostics().ropeGeometry.every(g => g.maxWidthCSS <= 1.5001)).toBe(true);
    const before = host.objects.filter(o => o.kind === 'rope').map(o => o.points);
    runtime.syncFrame({ ...next, phase: 'paused' }, projection);
    expect(host.objects.filter(o => o.kind === 'rope').map(o => o.points)).toEqual(before);
    runtime.syncFrame(next, projection, { reducedMotion: true });
    expect(runtime.diagnostics()).toMatchObject({ echoTrails: 0, nativeRopes: 0 });
    runtime.dispose(); expect(host.objects.every(o => o.destroyed)).toBe(true);
  });

  it('constrains actual legion Rope vertex edges to 1–3 CSS pixels without shortening any recorded ray', () => {
    for (const low of [false, true]) for (const role of ['commander', 'lancer', 'prism']) {
      const host = phaser(), runtime = new CombatVfxRuntime(host.scene);
      const release = event('LEGION_SERAPH_RELEASED', 60, { fromX: 100, fromY: 100, x: 250, y: 100, role });
      runtime.syncFrame(state([release]), projection, { lowEffects: low });
      const rope = host.objects.find(o => o.kind === 'rope')!;
      const geometry = runtime.diagnostics().ropeGeometry[0];
      expect(geometry.kind).toBe('legion-release'); expect(geometry.pointCount).toBe(5);
      expect(geometry.maxWidthCSS).toBeLessThanOrEqual(low ? 1.5001 : 3.0001);
      expect(geometry.maxWidthCSS).toBeGreaterThan(1);
      expect(geometry.first).toEqual({ x: 100, y: 57 }); expect(geometry.last).toEqual({ x: 250, y: 57 });
      expect(rope.dirty).toBe(false);
      expect(rope.vertices.length).toBe(20);
      expect(Math.hypot(rope.vertices[0] - rope.vertices[2], rope.vertices[1] - rope.vertices[3])).toBeLessThan(geometry.maxWidthCSS / 3);
    }
    const points = [{ x: 20, y: 10 }, { x: 60, y: 50 }, { x: 100, y: 10 }];
    const vertices = combatRopeVertices(points, 3);
    for (let i = 0; i < points.length; i++) {
      expect((vertices[i * 4] + vertices[i * 4 + 2]) / 2).toBeCloseTo(points[i].x, 5);
      expect((vertices[i * 4 + 1] + vertices[i * 4 + 3]) / 2).toBeCloseTo(points[i].y, 5);
    }
    expect([...combatRopeVertices([{ x: 0, y: 0 }, { x: 0, y: 0 }], 2)].every(Number.isFinite)).toBe(true);
  });

  it('keeps ultimate ground echoes local, thin and translucent while preserving baked pillar colors on a pale ground', () => {
    const host = phaser(); host.textureKeys.add('pillar');
    const runtime = new CombatVfxRuntime(host.scene, recipe => recipe === 'finale'
      ? { atlasKey: 'pillar', width: 168, height: 360, blendMode: 'add', pivot: { x: .5, y: .85 } } : undefined);
    const pulse = event('WEAPON_ULTIMATE_PULSE', 60, { weaponId: 'thunder', final: true, radius: 360 });
    const game = state([pulse]); runtime.syncFrame(game, { ...projection, scale: .75 });
    runtime.syncFrame({ ...game, visualTime: 1.15, elapsed: 1.15, tick: 69 }, { ...projection, scale: .75 });
    const ring = host.objects.find(o => o.kind === 'sprite' && o.texture.endsWith('_ring'))!;
    expect(ring.width / .75).toBeLessThanOrEqual(200); expect(ring.alpha).toBeLessThanOrEqual(.3);
    expect(ring.blend).toBe('NORMAL');
    const pillar = host.objects.find(o => o.texture === 'pillar')!;
    expect(pillar.blend).toBe('NORMAL'); expect(pillar.alpha).toBeLessThan(.75);
    expect(game.events[0].data.radius).toBe(360);
  });
});
