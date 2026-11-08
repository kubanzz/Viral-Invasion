import type Phaser from 'phaser';
import { wallHit } from '../actors/collision';
import { activeWorld, BALANCE, type GameEvent, type GameState, type Vec } from '../game/types';
import { combatVfxCue, combatVfxPoint, type CombatVfxCue, type CombatVfxRecipeId } from './combatVfxRecipes';
import { slashSweepWindow } from './combatEffects';
export type { CombatVfxCue, CombatVfxRecipeId } from './combatVfxRecipes';

export interface CombatVfxProjection {
  projectGround(point: Vec): Vec;
  projectUpright(point: Vec, height: number): Vec;
  depthAt(worldY: number): number;
  entityDepth(id: string): number | undefined;
  /** Already projected CSS pixels; do not project these again. */
  anchorScreen(id: string, kind: 'muzzle' | 'bladeTip' | 'foot'): Vec | undefined;
  groundDepth: number; frontDepth: number; criticalDepth: number; scale: number;
}
export interface CombatVfxAsset {
  atlasKey: string; frameNames?: readonly (string | number)[]; fps?: number; duration?: number;
  pivot?: { x: number; y: number }; blendMode?: number | string;
  width?: number; height?: number; defaultWidth?: number; defaultHeight?: number; startOffsetSeconds?: number;
}
export type CombatVfxAssetProvider = (recipe: CombatVfxRecipeId, cue: Readonly<CombatVfxCue>) => CombatVfxAsset | undefined;
export interface CombatVfxOptions {
  lowEffects?: boolean; reducedMotion?: boolean; scopeId?: string; suppressGenericHits?: boolean;
}
export const COMBAT_VFX_BUDGET = { pending: 192, active: 32, lowActive: 12, seen: 1536, eventScan: 128,
  particles: 224, lowParticles: 48, particlesPerCue: 12, emitterPool: 12, spritePool: 48, ropePool: 6,
  echoTrails: 8, echoSamples: 4,
  textureBytes: 128 * 128 * 4 + 64 * 64 * 4 * 4 } as const;
interface Active {
  cue: CombatVfxCue; point: Vec; sprite: Phaser.GameObjects.Sprite; ring?: Phaser.GameObjects.Sprite;
  emitter?: Phaser.GameObjects.Particles.ParticleEmitter; rope?: Phaser.GameObjects.Rope;
  asset?: CombatVfxAsset; lastTime: number; particleCount: number;
  reverse: boolean;
}
interface EchoTrail { samples: { point: Vec; at: number }[]; rope?: Phaser.GameObjects.Rope }
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const validPoint = (p: Vec | undefined): p is Vec => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
let runtimeSerial = 0;

/** A Rope's default cross-section is its entire texture height. Author the two
 * vertex edges explicitly so texture padding can never become a 64px beam.
 * Point centres (including both true endpoints) are preserved exactly. */
export function combatRopeVertices(points: readonly Vec[], fullWidth: number): Float32Array {
  const vertices = new Float32Array(points.length * 4), width = Math.max(0, Number.isFinite(fullWidth) ? fullWidth : 0);
  for (let i = 0; i < points.length; i++) {
    const point = points[i], before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
    const dx = after.x - before.x, dy = after.y - before.y, length = Math.hypot(dx, dy);
    const taper = .12 + .88 * Math.sin(points.length > 1 ? i / (points.length - 1) * Math.PI : 0);
    const half = width * taper / 2, nx = length > 1e-8 ? -dy / length : 0, ny = length > 1e-8 ? dx / length : 0;
    vertices.set([point.x + nx * half, point.y + ny * half, point.x - nx * half, point.y - ny * half], i * 4);
  }
  return vertices;
}

/** Native Phaser display objects. Simulation and replay state remain entirely read-only.
 * Emitters leave Phaser's automatic UpdateList and receive the displayed-time delta once.
 * Nothing here owns a browser loop, uses wall-clock Tween time, or calls damage code. */
export class CombatVfxRuntime {
  private readonly prefix = `__combat_vfx_${++runtimeSerial}_`;
  private readonly textures = new Set<string>();
  private readonly pending = new Map<string, CombatVfxCue>();
  private readonly seen = new Set<string>();
  private readonly contacts = new Map<string, { born: number; tick: number }>();
  private readonly emitterPool: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private readonly spritePool: Phaser.GameObjects.Sprite[] = [];
  private readonly ropePool: Phaser.GameObjects.Rope[] = [];
  private readonly echoes = new Map<string, EchoTrail>();
  private active: Active[] = [];
  private scope = ''; private lastTick = -1; private time = 0; private disposed = false;
  private suppressThroughTime = -Infinity; private lastPhase: GameState['phase'] = 'menu'; private lastLog = '';
  private accepted = 0; private dropped = 0; private spawned = 0; private draws = 0; private clearReason = 'initial';
  private scanCount = 0; private paused = false; private elapsedParticleMs = 0; private coalesced = 0;
  private reusedEmitters = 0; private reusedSprites = 0;
  constructor(private readonly scene: Phaser.Scene, private readonly assets?: CombatVfxAssetProvider) {}

  accept(event: GameEvent): void {
    if (this.disposed) return;
    const cue = combatVfxCue(event);
    if (!cue || this.seen.has(cue.key)) return;
    const old = this.pending.get(cue.key);
    if (old) { if (cue.priority > old.priority || cue.priority === old.priority && old.eventType === 'TARGET_HIT' && cue.eventType !== 'TARGET_HIT') this.pending.set(cue.key, cue); return; }
    this.pending.set(cue.key, cue); this.accepted++;
    if (this.pending.size > COMBAT_VFX_BUDGET.pending) {
      const victim = [...this.pending.values()].sort((a, b) => a.priority - b.priority || a.tick - b.tick)[0];
      this.pending.delete(victim.key); this.dropped++;
    }
  }

  syncFrame(state: GameState, projection: CombatVfxProjection, options: CombatVfxOptions = {}): void {
    if (this.disposed) return;
    const scope = options.scopeId ?? `${state.seed}:${state.runMetrics?.runId ?? state.growth?.runId ?? state.expedition?.runId ?? 'training'}:${state.expedition?.missionId ?? ''}:${state.battle?.organId ?? 'training'}`;
    const nextTime = state.visualTime ?? state.elapsed;
    if (!Number.isFinite(nextTime) || !Number.isFinite(projection.scale) || projection.scale <= 0) return;
    const changed = !!this.scope && (scope !== this.scope || state.tick < this.lastTick || nextTime < this.time - 1e-6);
    if (changed) {
      // New-run bus receipts can already be queued before the first render of that run.
      // Rehydrate current-scope receipts by stable keys, never event object identity.
      // A newly entered organ may retain the shared historical log, so only its
      // last fixed step is eligible; old scopes cannot replay an entire burst.
      const current = state.events.filter(e => e.tick * BALANCE.step >= state.elapsed - BALANCE.step - 1e-7 && e.tick * BALANCE.step <= state.elapsed + 1e-7
        && (!e.data.organId || e.data.organId === state.battle?.organId));
      const keys = new Set(current.map(e => combatVfxCue(e)?.key).filter(Boolean));
      const keep = [...this.pending.values()].filter(cue => keys.has(cue.key));
      this.clear('scope'); for (const cue of keep) this.pending.set(cue.key, cue);
      for (const event of current) this.accept(event);
      this.suppressThroughTime = state.elapsed - BALANCE.step;
    }
    this.scope = scope;
    if (state.camp || state.phase === 'menu' || state.phase === 'result' || state.player.hp <= 0) {
      this.clear(state.camp ? 'camp' : state.player.hp <= 0 ? 'death' : state.phase);
      this.scope = scope; this.lastTick = state.tick; this.suppressThroughTime = state.elapsed; this.lastPhase = state.phase; return;
    }
    this.paused = state.phase === 'paused';
    if (this.paused) { this.lastTick = state.tick; this.lastPhase = state.phase; return; }
    const now = Math.max(this.time, nextTime), low = !!options.lowEffects, quiet = low || !!options.reducedMotion;
    this.scanCount = 0;
    const tail = state.events.at(-1), log = tail ? `${state.events.length}:${tail.type}:${tail.tick}:${tail.data.castId ?? tail.data.rootId ?? ''}:${tail.data.id ?? tail.data.targetId ?? ''}` : '';
    if (state.tick !== this.lastTick || log !== this.lastLog) {
      for (let i = Math.max(0, state.events.length - COMBAT_VFX_BUDGET.eventScan); i < state.events.length; i++) {
        const event = state.events[i]; if (event.tick * BALANCE.step > this.suppressThroughTime + 1e-7) this.accept(event); this.scanCount++;
      }
    }
    // Existing instances advance first. A newly emitted particle never consumes time from before its receipt.
    for (const effect of this.active) this.advance(effect, now, projection, state, quiet);
    const alive: Active[] = [];
    for (const effect of this.active) {
      if (now - effect.cue.born >= effect.cue.life) this.destroyEffect(effect); else alive.push(effect);
    }
    this.active = alive;
    this.syncEchoes(state, projection, now, quiet);
    const limit = low ? COMBAT_VFX_BUDGET.lowActive : COMBAT_VFX_BUDGET.active;
    this.trimActive(limit);
    this.enforceParticleBudget(low, quiet);
    const due = [...this.pending.values()].filter(c => c.born <= state.elapsed + 1e-7 && c.born <= now + 1e-7)
      .sort((a, b) => b.priority - a.priority || a.born - b.born);
    for (const cue of due) {
      this.pending.delete(cue.key); this.remember(cue.key);
      if (cue.born <= this.suppressThroughTime + 1e-7 || now - cue.born >= cue.life || options.suppressGenericHits && cue.eventType === 'TARGET_HIT') { this.dropped++; continue; }
      const p = combatVfxPoint(cue, state);
      if (!validPoint(p)) { this.dropped++; continue; }
      // Reject malformed geometry instead of emitting an effect at an invented location.
      const projected = projection.projectGround(p); if (!validPoint(projected)) { this.dropped++; continue; }
      // Healing fields can emit accepted HP changes every fixed step. Keep the
      // receipt-driven feedback at a readable cadence without changing healing.
      if (cue.recipe === 'heal' && this.active.some(effect => effect.cue.recipe === 'heal'
        && effect.cue.entityId === cue.entityId && Math.abs(effect.cue.born - cue.born) < .2)) { this.coalesced++; continue; }
      if (cue.recipe === 'hit' || cue.recipe === 'legion-hit') {
        const cadence = cue.weaponId === 'thunder' ? .2 : .12;
        const key = `${cue.weaponId}:${cue.entityId}:${String(cue.source.data.cause ?? cue.recipe)}`;
        const previous = this.contacts.get(key);
        // Distinct transactions at the same fixed tick remain distinct. Later
        // automatic fire pulses may share one visual accent per victim/cause.
        if (previous && previous.tick !== cue.tick && cue.born >= previous.born && cue.born - previous.born < cadence - 1e-7) {
          this.coalesced++; continue;
        }
        this.contacts.delete(key); this.contacts.set(key, { born: cue.born, tick: cue.tick });
        while (this.contacts.size > 128) this.contacts.delete(this.contacts.keys().next().value!);
      }
      if (this.active.length >= limit) {
        const index = this.active.reduce((min, entry, i, entries) => entry.cue.priority < entries[min].cue.priority ? i : min, 0);
        if (this.active[index].cue.priority >= cue.priority) { this.dropped++; continue; }
        this.destroyEffect(this.active[index]); this.active.splice(index, 1); this.dropped++;
      }
      const effect = this.createEffect(cue, p, quiet, low);
      if (cue.recipe === 'slash') effect.reverse = state.events.some(e => e.type === 'WEAPON_MELEE_SWING'
        && e.data.castId === cue.source.data.castId && e.data.combo === 2);
      this.active.push(effect); this.spawned++;
      this.advance(effect, now, projection, state, quiet);
    }
    this.time = now; this.lastTick = state.tick; this.lastLog = log; this.lastPhase = state.phase; this.draws++;
  }

  private remember(key: string): void {
    this.seen.add(key);
    while (this.seen.size > COMBAT_VFX_BUDGET.seen) this.seen.delete(this.seen.values().next().value!);
  }
  private trimActive(limit: number): void {
    this.active.sort((a, b) => b.cue.priority - a.cue.priority || b.cue.tick - a.cue.tick);
    while (this.active.length > limit) { this.destroyEffect(this.active.pop()!); this.dropped++; }
  }
  private enforceParticleBudget(low: boolean, quiet: boolean): void {
    let left: number = low ? COMBAT_VFX_BUDGET.lowParticles : COMBAT_VFX_BUDGET.particles;
    for (const effect of this.active) {
      if (effect.particleCount > left || quiet && effect.particleCount > (effect.cue.priority >= 5 ? 2 : 0)) {
        if (effect.emitter) this.releaseEmitter(effect.emitter); effect.emitter = undefined; effect.particleCount = 0;
      }
      left -= effect.particleCount;
    }
  }
  private sprite(texture: string, frame?: string | number): Phaser.GameObjects.Sprite {
    const cached = this.spritePool.pop();
    if (!cached) return this.scene.add.sprite(0, 0, texture, frame);
    this.reusedSprites++;
    return cached.setTexture(texture, frame).setActive(true).setVisible(true).clearTint().setRotation(0).setScale(1).setAlpha(1);
  }
  private releaseSprite(sprite: Phaser.GameObjects.Sprite): void {
    sprite.anims.stop();
    if (this.spritePool.length < COMBAT_VFX_BUDGET.spritePool) {
      sprite.setActive(false).setVisible(false); this.spritePool.push(sprite);
    } else sprite.destroy();
  }
  private releaseEmitter(emitter: Phaser.GameObjects.Particles.ParticleEmitter): void {
    emitter.killAll();
    if (this.emitterPool.length < COMBAT_VFX_BUDGET.emitterPool) {
      emitter.setActive(false).setVisible(false); this.emitterPool.push(emitter);
    } else emitter.destroy();
  }
  private releaseRope(rope: Phaser.GameObjects.Rope): void {
    if (this.ropePool.length < COMBAT_VFX_BUDGET.ropePool) { rope.setActive(false).setVisible(false); this.ropePool.push(rope); }
    else rope.destroy();
  }
  private rope(): Phaser.GameObjects.Rope {
    const cached = this.ropePool.pop();
    if (cached) return cached.setActive(true).setVisible(true);
    return this.scene.add.rope(0, 0, this.texture('ribbon'), undefined, [{ x: 0, y: 0 }, { x: .1, y: 0 }]);
  }
  private shapeRope(rope: Phaser.GameObjects.Rope, points: Vec[], width: number): Phaser.GameObjects.Rope {
    rope.setPoints(points);
    const vertices = combatRopeVertices(points, width);
    if (rope.vertices?.length === vertices.length) rope.vertices.set(vertices); else rope.vertices = vertices;
    // Phaser's default updater would replace these edges with frame.halfHeight.
    rope.dirty = false;
    return rope;
  }
  private syncEchoes(state: GameState, projection: CombatVfxProjection, now: number, quiet: boolean): void {
    const cells = quiet ? [] : (state.growth?.cells ?? []).filter(c => c.echo && c.legionId === 'seraph'
      && c.organId === (state.battle?.organId ?? 'heart') && (c.hp ?? 1) > 0 && c.until > state.elapsed)
      .slice(0, COMBAT_VFX_BUDGET.echoTrails);
    const ids = new Set(cells.map(c => c.id));
    for (const [id, trail] of this.echoes) if (!ids.has(id)) {
      if (trail.rope) this.releaseRope(trail.rope); this.echoes.delete(id);
    }
    for (const cell of cells) {
      const trail = this.echoes.get(cell.id) ?? { samples: [] };
      if (!trail.samples.length || now - trail.samples.at(-1)!.at >= .075) {
        trail.samples.push({ point: { x: cell.x, y: cell.y }, at: now });
        if (trail.samples.length > COMBAT_VFX_BUDGET.echoSamples) trail.samples.shift();
      }
      this.echoes.set(cell.id, trail);
      if (trail.samples.length < 2) continue;
      const first = trail.samples[0].point, last = trail.samples.at(-1)!.point;
      if (Math.hypot(last.x - first.x, last.y - first.y) < 3) { trail.rope?.setAlpha(0); continue; }
      trail.rope ??= this.rope();
      const samples = trail.samples.map(s => projection.projectUpright(s.point, 12));
      this.shapeRope(trail.rope, samples, 1.5).setPosition(0, 0).setScale(1).setColors(0xb9eed9).setBlendMode('ADD')
        .setAlphas(samples.map((_, index) => (index + 1) / samples.length)).setAlpha(.3)
        .setDepth((projection.entityDepth(cell.id) ?? projection.depthAt(cell.y)) + .15);
    }
  }
  private texture(kind: 'flash' | 'ring' | 'shard' | 'plus' | 'ribbon'): string {
    const key = this.prefix + kind;
    if (this.textures.has(key)) return key;
    const g = this.scene.add.graphics(), size = kind === 'ring' ? 128 : 64, mid = size / 2;
    if (kind === 'ring') {
      // A local contact echo, separate from the authoritative range contour.
      g.lineStyle(1.25, 0xffffff, 1);
      for (let n = 0; n < 5; n++) {
        const start = n / 5 * Math.PI * 2 + .12;
        g.beginPath(); g.arc(mid, mid, mid - 7, start, start + .65); g.strokePath();
      }
    }
    else if (kind === 'shard') { g.fillStyle(0xffffff, 1); g.fillTriangle(8, 28, 53, 31, 12, 37); }
    else if (kind === 'plus') { g.fillStyle(0xffffff, 1); g.fillRoundedRect(27, 10, 10, 44, 3); g.fillRoundedRect(10, 27, 44, 10, 3); }
    else if (kind === 'ribbon') {
      // Two-row cream core, weak colored edge and transparent outer rows. Both
      // ends fade independently of the geometry taper, preventing square caps.
      for (let x = 0; x < 64; x += 4) {
        const along = Math.sin((x + 2) / 64 * Math.PI) ** .6;
        g.fillStyle(0xc6dfc4, along * .16); g.fillRect(x, 1, 4, 6);
        g.fillStyle(0xfff6d6, along * .82); g.fillRect(x, 3, 4, 2);
      }
    } else {
      for (let n = 6; n >= 1; n--) { g.fillStyle(0xffffff, n === 1 ? 1 : .035 + (7 - n) * .012); g.fillCircle(32, 32, n * 4.5); }
      g.fillStyle(0xffffff, 1); g.fillTriangle(5, 32, 59, 29, 35, 34); g.fillTriangle(32, 6, 29, 57, 35, 35);
    }
    g.generateTexture(key, size, kind === 'ribbon' ? 8 : size); g.destroy(); this.textures.add(key); return key;
  }
  private createEffect(cue: CombatVfxCue, p: Vec, quiet: boolean, low: boolean): Active {
    // A whole baked slash cannot obey a clipped cone. Its editor sequence stays
    // available as source art; the native Rope owns the actual moving blade.
    const supplied = cue.recipe === 'slash' ? undefined : this.assets?.(cue.recipe, cue);
    const asset = supplied && this.scene.textures.exists(supplied.atlasKey) ? supplied : undefined;
    if (asset?.duration) cue = { ...cue, life: Math.min(1.4, Math.max(cue.life, asset.duration + (asset.startOffsetSeconds ?? 0))) };
    const texture = asset?.atlasKey ?? this.texture(cue.recipe === 'heal' ? 'plus' : 'flash');
    const sprite = this.sprite(texture, asset?.frameNames?.[0]);
    // Baked sequences already contain their luminous core. Additive composition
    // over the pale ground destroys their pigment and turns them solid white.
    sprite.setOrigin(asset?.pivot?.x ?? .5, asset?.pivot?.y ?? .5).setBlendMode('NORMAL');
    if (!asset) sprite.setTint(cue.color);
    let ring: Phaser.GameObjects.Sprite | undefined;
    if (['area', 'finale', 'purify', 'kill', 'boss-state', 'parry'].includes(cue.recipe))
      ring = this.sprite(this.texture('ring')).setTint(cue.weaponId === 'thunder' ? 0x9389ba : cue.recipe === 'purify' ? 0x85ac99 : 0xb49778).setBlendMode('NORMAL');
    const maxParticles = low ? COMBAT_VFX_BUDGET.lowParticles : COMBAT_VFX_BUDGET.particles;
    const used = this.active.reduce((sum, fx) => sum + fx.particleCount, 0);
    const requested = quiet ? cue.priority >= 5 ? 2 : 0 : cue.recipe === 'enemy-windup' ? 0 : cue.recipe === 'muzzle' ? 1 : cue.tier === 3 ? 12 : cue.tier === 2 ? 6 : 2;
    const count = Math.max(0, Math.min(maxParticles - used, requested));
    let emitter: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
    if (count > 0) {
      const healing = cue.recipe === 'heal' || cue.recipe === 'purify';
      const config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
        emitting: false, frequency: -1, lifespan: Math.min(cue.life * 1000, healing ? 650 : 430), maxAliveParticles: count,
        speed: healing ? { min: 12, max: 35 } : { min: 40, max: cue.tier === 3 ? 200 : 110 },
        angle: healing ? { min: 240, max: 300 } : { min: 0, max: 360 },
        gravityY: healing ? -12 : cue.ground ? 0 : 95,
        scale: { start: healing ? .15 : .32, end: .015, ease: 'Cubic.easeOut' },
        alpha: { start: .9, end: 0, ease: 'Quad.easeIn' }, tint: cue.color, blendMode: 'ADD',
      };
      const particleTexture = this.texture(healing ? 'plus' : 'shard'), cached = this.emitterPool.pop();
      if (cached) {
        emitter = cached.setTexture(particleTexture).setConfig(config).setActive(true).setVisible(true);
        this.reusedEmitters++;
      } else {
        emitter = this.scene.add.particles(0, 0, particleTexture, config);
        // ParticleEmitter.addedToScene registers automatically. DisplayList ownership remains intact.
        this.scene.sys.updateList.remove(emitter);
      }
      emitter.explode(count, 0, 0);
    }
    let rope: Phaser.GameObjects.Rope | undefined;
    if (cue.recipe === 'slash' || cue.recipe === 'legion-release') {
      rope = this.rope();
      rope.setColors(cue.color).setBlendMode('ADD');
    }
    return { cue, point: { ...p }, sprite, ring, emitter, rope, asset, lastTime: cue.born, particleCount: count, reverse: false };
  }
  private advance(effect: Active, now: number, projection: CombatVfxProjection, state: GameState, quiet: boolean): void {
    const c = effect.cue, age = Math.max(0, now - c.born), p = clamp(age / c.life), ease = 1 - (1 - p) ** 3;
    if (c.follow) { const live = combatVfxPoint({ ...c, point: undefined }, state); if (validPoint(live)) effect.point = live; }
    const uprightPillar = c.recipe === 'finale' && c.weaponId === 'thunder';
    const flat = c.ground && !uprightPillar;
    const base = projection.projectGround(effect.point), raised = projection.projectUpright(effect.point, flat || uprightPillar ? 0 : c.recipe === 'heal' ? 28 + ease * 20 : 15);
    const anchor = c.anchor ? projection.anchorScreen(c.entityId, c.anchor) : undefined;
    const at = validPoint(anchor) ? anchor : raised;
    const depth = flat ? projection.groundDepth : (projection.entityDepth(c.entityId) ?? projection.depthAt(effect.point.y)) + .6;
    const scale = projection.scale, envelope = c.recipe === 'muzzle' ? (1 - p) ** 2 : Math.min(1, age / .025 + .35) * (1 - p) ** 1.4;
    const swell = c.recipe === 'legion-windup' || c.recipe === 'charge' || c.recipe === 'enemy-windup' ? 1.3 - p * .5 : c.recipe === 'heal' ? .65 + ease * .35 : .65 + ease * .65;
    const offset = effect.asset?.startOffsetSeconds ?? 0, frames = effect.asset?.frameNames;
    if (frames?.length) {
      const duration = effect.asset?.duration ?? frames.length / (effect.asset?.fps ?? 24);
      const sample = clamp((age - offset) / Math.max(.001, duration));
      effect.sprite.setFrame(frames[Math.min(frames.length - 1, Math.floor(sample * frames.length))]);
    }
    const width = effect.asset?.width ?? effect.asset?.defaultWidth ?? c.radius * 2;
    const height = effect.asset?.height ?? effect.asset?.defaultHeight ?? width;
    const contact = c.recipe === 'hit' || c.recipe === 'legion-hit' || c.recipe === 'heavy-hit';
    // Many simultaneous victims retain every accepted contact but share an
    // exposure budget. The cast's main wave and finale keep their full accent.
    const exposure = contact && c.tier < 3 ? clamp(1 - Math.max(0, this.active.length - 12) * .03, .45, 1) : 1;
    const opacity = (c.recipe === 'hit' || c.recipe === 'legion-hit' ? .72 : c.recipe === 'infection' || c.recipe === 'enemy-windup' ? .3 : uprightPillar ? age < .035 ? .92 : .75 : effect.asset ? .92 : c.recipe === 'area' ? .25 : .85) * exposure;
    effect.sprite.setPosition(at.x, at.y).setDisplaySize(width * scale * swell, height * scale * swell * (flat ? .72 : 1))
      .setDepth(depth).setAlpha(age < offset ? 0 : envelope * opacity);
    if (!effect.asset) effect.sprite.setRotation(c.recipe === 'heal' ? 0 : c.angle + (quiet ? 0 : .14 * p));
    if (effect.ring) {
      const diameter = Math.min(100, c.radius) * 2 * (.2 + ease * .8) * scale;
      effect.ring.setPosition(base.x, base.y).setDisplaySize(diameter, diameter * .72)
        .setDepth(projection.groundDepth).setAlpha((1 - p) ** 2 * (quiet ? .18 : .3));
    }
    if (effect.emitter) {
      effect.emitter.setPosition(at.x, at.y).setScale(scale, scale * (flat ? .72 : 1)).setDepth(depth + .1);
      // Bound large catch-ups, while allowing every living cue to reach its true visual age.
      let delta = Math.min(c.life, Math.max(0, now - effect.lastTime)) * 1000;
      while (delta > 1e-5) { const step = Math.min(delta, 1000 / 60); effect.emitter.preUpdate(now * 1000 - delta + step, step); this.elapsedParticleMs += step; delta -= step; }
      if (!effect.emitter.getAliveParticleCount()) { this.releaseEmitter(effect.emitter); effect.emitter = undefined; effect.particleCount = 0; }
    }
    if (effect.rope) {
      let points: Vec[];
      let localWidth: number;
      if (c.recipe === 'slash') {
        const sweep = slashSweepWindow(p), sign = effect.reverse ? -1 : 1;
        const half = c.halfAngle, head = c.angle + sign * (-half + sweep.head * half * 2);
        const tail = c.angle + sign * (-half + sweep.tail * half * 2);
        const world = activeWorld(state);
        points = Array.from({ length: 13 }, (_, index) => {
          const a = tail + (head - tail) * index / 12, direction = { x: Math.cos(a), y: Math.sin(a) };
          const r = Math.min(c.radius, wallHit(effect.point, direction, c.radius, world) ?? c.radius);
          return { x: direction.x * r, y: direction.y * r };
        });
        effect.rope.setPosition(base.x, base.y).setScale(scale, scale * .72);
        localWidth = (quiet ? 3 : 6) / scale;
      } else {
        const start = c.from ?? effect.point, end = c.point ?? c.to ?? effect.point;
        const a = projection.projectUpright(start, 15), b = projection.projectUpright(end, 15);
        points = [0, .2, .5, .8, 1].map(t => ({ x: (b.x - a.x) * t, y: (b.y - a.y) * t }));
        effect.rope.setPosition(a.x, a.y).setScale(1);
        const role = c.source.data.role;
        localWidth = (role === 'commander' ? 3 : role === 'prism' ? 2.2 : 2.6) * (quiet ? .5 : 1);
      }
      this.shapeRope(effect.rope, points, localWidth).setColors(c.source.data.role === 'prism' ? 0xb9eed9 : c.color)
        .setAlphas(points.map((_, i) => .18 + .82 * Math.sin(i / Math.max(1, points.length - 1) * Math.PI)))
        .setDepth(depth + .2).setAlpha(c.recipe === 'slash' ? slashSweepWindow(p).alpha : (1 - p) * (quiet ? .48 : .66));
      effect.sprite.setAlpha(effect.asset ? envelope : 0);
    }
    effect.lastTime = now;
  }
  private destroyEffect(effect: Active): void {
    this.releaseSprite(effect.sprite); if (effect.ring) this.releaseSprite(effect.ring);
    if (effect.rope) {
      this.releaseRope(effect.rope);
    }
    if (effect.emitter) this.releaseEmitter(effect.emitter);
  }
  clear(reason = 'manual'): void {
    for (const effect of this.active) this.destroyEffect(effect);
    for (const trail of this.echoes.values()) if (trail.rope) this.releaseRope(trail.rope);
    this.echoes.clear();
    this.active = []; this.pending.clear(); this.seen.clear(); this.contacts.clear(); this.time = 0; this.lastTick = -1; this.lastLog = '';
    this.scope = ''; this.suppressThroughTime = -Infinity;
    this.paused = false; this.clearReason = reason;
  }
  diagnostics() {
    const byRecipe: Partial<Record<CombatVfxRecipeId, number>> = {};
    for (const effect of this.active) byRecipe[effect.cue.recipe] = (byRecipe[effect.cue.recipe] ?? 0) + 1;
    const ropeGeometry = [
      ...this.active.flatMap(e => e.rope ? [{ rope: e.rope, kind: e.cue.recipe }] : []),
      ...[...this.echoes.values()].flatMap(e => e.rope ? [{ rope: e.rope, kind: 'echo' }] : []),
    ].map(({ rope, kind }) => {
      const vertices = rope.vertices, points = rope.points ?? [];
      let maxWidthCSS = 0;
      for (let i = 0; i < vertices.length; i += 4) maxWidthCSS = Math.max(maxWidthCSS,
        Math.hypot((vertices[i] - vertices[i + 2]) * rope.scaleX, (vertices[i + 1] - vertices[i + 3]) * rope.scaleY));
      const screen = (p: Vec | undefined) => p ? { x: rope.x + p.x * rope.scaleX, y: rope.y + p.y * rope.scaleY } : null;
      return { kind, pointCount: points.length, maxWidthCSS, first: screen(points[0]), last: screen(points.at(-1)) };
    });
    return { backend: 'phaser-native', scope: this.scope, active: this.active.length, pending: this.pending.size, ropeGeometry,
      remembered: this.seen.size, accepted: this.accepted, dropped: this.dropped, spawned: this.spawned, draws: this.draws,
      nativeEmitters: this.active.filter(e => e.emitter).length, nativeSprites: this.active.reduce((n, e) => n + 1 + Number(!!e.ring), 0),
      nativeRopes: this.active.filter(e => e.rope).length + [...this.echoes.values()].filter(t => t.rope).length,
      echoTrails: this.echoes.size, echoSamples: [...this.echoes.values()].reduce((n, e) => n + e.samples.length, 0),
      particles: this.active.reduce((n, e) => n + (e.emitter?.getAliveParticleCount() ?? 0), 0),
      particleCapacity: this.active.reduce((n, e) => n + e.particleCount, 0),
      actualAliveParticleCount: this.active.reduce((n, e) => n + (e.emitter?.getAliveParticleCount() ?? 0), 0),
      pooledEmitters: this.emitterPool.length, pooledSprites: this.spritePool.length, pooledRopes: this.ropePool.length,
      coalesced: this.coalesced, reusedEmitters: this.reusedEmitters, reusedSprites: this.reusedSprites,
      textures: this.textures.size, elapsedParticleMs: this.elapsedParticleMs, visualTime: this.time, paused: this.paused,
      phase: this.lastPhase, scanned: this.scanCount, clearReason: this.clearReason, byRecipe, budget: COMBAT_VFX_BUDGET };
  }
  dispose(): void {
    if (this.disposed) return;
    this.clear('dispose'); for (const key of this.textures) this.scene.textures.remove(key);
    for (const object of [...this.emitterPool, ...this.spritePool, ...this.ropePool]) object.destroy();
    this.emitterPool.length = 0; this.spritePool.length = 0; this.ropePool.length = 0;
    this.textures.clear(); this.disposed = true;
  }
}
