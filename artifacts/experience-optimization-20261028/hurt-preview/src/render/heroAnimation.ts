import { BALANCE, type GameState } from '../game/types';
import { heroArtPose, sourceRegisteredSpriteLayout, type RegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from './spriteGeometry';

export type HeroClip = 'idle' | 'walk' | 'hurt' | 'dash';
const CLIP_COUNTS: Record<HeroClip, number> = { idle: 4, walk: 8, hurt: 2, dash: 4 };
const GROUP_PREFIX = 'hero.front_right.';
const REFERENCE_ID = `${GROUP_PREFIX}idle.00`;
export const HERO_HURT_REACTION_SECONDS = .15;
const EPSILON = 1e-8;

export interface HeroAnimationAsset extends SourceRegisteredSpriteAsset { animation?: unknown; aliasOf?: string }
interface FrameMetadata { group: string; index: number; fps: number; frameCount: number; approved: true }
interface HeroClipFrame { id: string; layout: RegisteredSpriteLayout }
export interface ApprovedHeroClip { clip: HeroClip; fps: number; frames: readonly HeroClipFrame[] }
export type HeroAnimationClips = Partial<Record<HeroClip, ApprovedHeroClip>>;
export interface HeroFramePresentation {
  id: string; clip: HeroClip | null; index: number; animated: boolean; flipX: boolean; lift: number;
  layout?: RegisteredSpriteLayout;
}

function rawMetadata(asset: HeroAnimationAsset): Record<string, unknown> | undefined {
  return asset.animation && typeof asset.animation === 'object' ? asset.animation as Record<string, unknown> : undefined;
}
function approvedMetadata(asset: HeroAnimationAsset): FrameMetadata | undefined {
  const a = rawMetadata(asset);
  if (!a || a.approved !== true || typeof a.group !== 'string' || !Number.isInteger(a.index) || Number(a.index) < 0
    || typeof a.fps !== 'number' || !Number.isFinite(a.fps) || a.fps <= 0 || !Number.isInteger(a.frameCount) || Number(a.frameCount) <= 0) return;
  return a as unknown as FrameMetadata;
}

/** Curated approval is a prerequisite; this parser does not prove that candidate images form a real animation. */
export function approvedHeroAnimationClips(assets: Readonly<Record<string, HeroAnimationAsset>>): HeroAnimationClips {
  const reference = assets[REFERENCE_ID], approval = reference && approvedMetadata(reference);
  if (!reference || !approval || approval.group !== `${GROUP_PREFIX}idle` || approval.index !== 0 || approval.frameCount !== CLIP_COUNTS.idle
    || !reference.sourceBounds || reference.sourceBounds.height <= 0) return {};
  const sourceScale = 86 / reference.sourceBounds.height, canvas = { width: 1024, height: 1024 }, anchor = { x: 512, y: 850 };
  if (!sourceRegisteredSpriteLayout(reference, canvas, anchor, sourceScale)) return {};
  const clips: HeroAnimationClips = {};
  for (const clip of Object.keys(CLIP_COUNTS) as HeroClip[]) {
    const group = `${GROUP_PREFIX}${clip}`, count = CLIP_COUNTS[clip];
    const entries = Object.entries(assets).filter(([, asset]) => !asset.aliasOf && rawMetadata(asset)?.group === group);
    if (entries.length !== count) continue;
    const frames: HeroClipFrame[] = []; let fps: number | undefined;
    for (const [id, asset] of entries) {
      const a = approvedMetadata(asset);
      // Canonical new sequence IDs keep old weapon/scan poses out of these groups.
      if (!a || a.frameCount !== count || a.index >= count || id !== `${group}.${String(a.index).padStart(2, '0')}` || frames[a.index]
        || fps !== undefined && a.fps !== fps) break;
      const layout = sourceRegisteredSpriteLayout(asset, canvas, anchor, sourceScale); if (!layout) break;
      fps = a.fps; frames[a.index] = { id, layout };
    }
    if (fps !== undefined && frames.filter(Boolean).length === count) clips[clip] = { clip, fps, frames };
  }
  return clips;
}

/** Action timing is derived exclusively from the serialized simulation clock and accepted damage events. */
export function requestedHeroAnimation(state: Pick<GameState, 'player' | 'elapsed' | 'tick' | 'events'>): { clip: HeroClip; age?: number; duration?: number } {
  const elapsed = state.elapsed, dashStart = state.player.dashUntil - BALANCE.dashDuration;
  if (elapsed < state.player.dashUntil && elapsed >= dashStart - EPSILON) return { clip: 'dash', age: Math.max(0, elapsed - dashStart), duration: BALANCE.dashDuration };
  if (elapsed < state.player.hurtUntil) {
    let latestTick = -1;
    for (const event of state.events) if (event.type === 'PLAYER_HURT' && Number.isInteger(event.tick) && event.tick >= 0 && event.tick <= state.tick
      && typeof event.data.damage === 'number' && Number.isFinite(event.data.damage) && event.data.damage > 0) latestTick = Math.max(latestTick, event.tick);
    const age = elapsed - latestTick * BALANCE.step;
    if (latestTick >= 0 && age >= -EPSILON && age + EPSILON < HERO_HURT_REACTION_SECONDS) return { clip: 'hurt', age: Math.max(0, age), duration: HERO_HURT_REACTION_SECONDS };
  }
  return { clip: state.player.moving ? 'walk' : 'idle' };
}

/** Bounded presentation state only. No Phaser clock, event cursor or simulation mutation. */
export class HeroAnimationController {
  private run = '';
  private lastElapsed = -1;
  private lastTick = -1;
  private loop: 'idle' | 'walk' | undefined;
  private enteredAt = 0;
  private last: HeroFramePresentation | undefined;
  constructor(readonly clips: HeroAnimationClips) {}

  reset(): void { this.run = ''; this.lastElapsed = -1; this.lastTick = -1; this.loop = undefined; this.enteredAt = 0; this.last = undefined; }

  select(state: GameState): HeroFramePresentation {
    const run = `${state.seed}:${state.runMetrics?.runId ?? state.growth?.runId ?? ''}`;
    if (run !== this.run || state.elapsed < this.lastElapsed || state.tick < this.lastTick || state.phase === 'menu') this.reset();
    this.run = run; this.lastElapsed = state.elapsed; this.lastTick = state.tick;
    // pause() clears moving in GameSession. Preserve the actual last displayed
    // clip as well as its index, rather than changing a paused walk into idle.
    if (state.phase !== 'playing' && this.last) return this.last;
    const request = requestedHeroAnimation(state), clip = this.clips[request.clip];
    if (request.clip === 'idle' || request.clip === 'walk') {
      if (this.loop !== request.clip) { this.loop = request.clip; this.enteredAt = state.elapsed; }
    } else this.loop = undefined;
    if (!clip || state.phase === 'menu') {
      this.last = { ...heroArtPose(state), clip: null, index: 0, animated: false,
        lift: state.player.moving ? -Math.abs(Math.sin(state.elapsed * 16)) * 1.5 : 0 };
    } else {
      const index = request.duration !== undefined
        ? Math.min(clip.frames.length - 1, Math.floor((request.age! / request.duration) * clip.frames.length + EPSILON))
        : Math.floor(Math.max(0, state.elapsed - this.enteredAt) * clip.fps + EPSILON) % clip.frames.length;
      const frame = clip.frames[index];
      this.last = { id: frame.id, clip: request.clip, index, animated: true, flipX: Math.cos(state.player.facing) < 0, lift: 0, layout: frame.layout };
    }
    return this.last;
  }
}
