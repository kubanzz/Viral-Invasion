import type { ImmuneCellState } from '../game/immuneCells';
import type { SeraphRole, SeraphAction } from '../game/seraphCombat';
import { BALANCE } from '../game/types';
import { sourceRegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from './spriteGeometry';

const groupCache = new WeakMap<object, Map<string, string[]>>();
const readyCache = new WeakMap<object, Map<string, boolean>>();
type ActionClock = Pick<SeraphAction, 'phase' | 'phaseStartedAt' | 'until' | 'releaseTick'>;
export function seraphPresentationRole(cell: ImmuneCellState): SeraphRole {
  return cell.seraphRole ?? (cell.legionRole === 'leader' ? 'commander' : 'lancer');
}
function modernReady(assets: Readonly<Record<string, unknown>>, family: string): boolean {
  let cached = readyCache.get(assets);
  if (!cached) { cached = new Map(); readyCache.set(assets, cached); }
  const known = cached.get(family); if (known !== undefined) return known;
  const ready = ['front', 'back'].every(view => ['idle', 'move', 'attack'].every(action => {
    const group = `${family}.${view}.${action}`, frames = framesFor(assets, group + '.'), count = action === 'idle' ? 2 : 4;
    let fps: number | undefined;
    return frames.length === count && frames.every((id, index) => {
      const asset = assets[id] as SourceRegisteredSpriteAsset & { animation?: { approved?: boolean; group?: string; index?: number; frameCount?: number; fps?: number } };
      const a = asset.animation;
      if (a?.approved !== true || a.group !== group || a.index !== index || a.frameCount !== count
        || id !== `${group}.${String(index).padStart(2, '0')}` || typeof a.fps !== 'number' || !Number.isFinite(a.fps) || a.fps <= 0
        || fps !== undefined && fps !== a.fps || !sourceRegisteredSpriteLayout(asset, { width: 512, height: 512 }, { x: 256, y: 435.2 }, 1)) return false;
      fps = a.fps; return true;
    });
  }));
  cached.set(family, ready); return ready;
}
function framesFor(assets: Readonly<Record<string, unknown>>, prefix: string): string[] {
  let groups = groupCache.get(assets);
  if (!groups) { groups = new Map(); groupCache.set(assets, groups); }
  let frames = groups.get(prefix);
  if (!frames) { frames = Object.keys(assets).filter(id => id.startsWith(prefix)).sort(); groups.set(prefix, frames); }
  return frames;
}
function fpsFor(assets: Readonly<Record<string, unknown>>, frames: string[], fallback: number): number {
  const value = (assets[frames[0]] as { animation?: { fps?: number } } | undefined)?.animation?.fps;
  return typeof value === 'number' && value > 0 ? value : fallback;
}
/** Hold the authored release and recovery frames for the authoritative phase. */
export function seraphAttackFrame(clock: ActionClock, elapsed: number, count: number): number {
  if (count <= 1) return 0;
  const progress = Math.max(0, Math.min(1, (elapsed - clock.phaseStartedAt) / Math.max(.001, clock.until - clock.phaseStartedAt)));
  if (clock.phase === 'windup') return Math.min(Math.max(0, Math.floor(count / 2) - 1), Math.floor(progress * Math.max(1, count / 2)));
  // Instant cleaves and the last prism ray resolve into recovery in one fixed
  // step. Their accepted release tick still owns a brief authored impact pose.
  const releasedAge = clock.releaseTick === undefined ? Infinity : elapsed - clock.releaseTick * BALANCE.step;
  if (clock.phase === 'recover' && releasedAge >= -1e-8 && releasedAge < .08 - 1e-8) return Math.min(count - 1, Math.floor(count * .6));
  return clock.phase === 'release' ? Math.min(count - 1, Math.floor(count * .6)) : count - 1;
}
/** Each role opts into its complete registered family; existing art remains a compatibility path. */
export function legionPaintedPose(assets: Readonly<Record<string, unknown>>, cell: ImmuneCellState, elapsed: number) {
  if (cell.legionId !== 'seraph' || (cell.hp ?? 1) <= 0 || cell.until <= elapsed) return undefined;
  const role = seraphPresentationRole(cell), legacyRole = role === 'commander' ? 'leader' : 'wing';
  const direction = Math.sin(cell.facing) < -.1 ? 'back' : 'front', modern = `seraph24.${role}`;
  const ready = modernReady(assets, modern);
  const family = ready ? modern : `sanctum.seraph.${legacyRole}`;
  const frames = (action: string) => framesFor(assets, `${family}.${direction}.${action}.`);
  const clock = cell.seraphAction, active = clock && elapsed >= clock.phaseStartedAt && elapsed < clock.until;
  const moving = ['seeking', 'returning'].includes(cell.activity);
  const attackFrames = frames('attack'), attackAge = elapsed - (cell.attackUntil - .24);
  const attackDuration = Math.min(cell.interval, attackFrames.length / fpsFor(assets, attackFrames, 12));
  // Only pre-role legacy actors use the old bite clock. A completed modern
  // action must not replay its release frame during attackUntil's short tail.
  const legacyAttacking = !ready && !cell.seraphRole && !clock
    && (elapsed < cell.attackUntil || !moving && !!cell.targetId && attackAge >= 0 && attackAge < attackDuration);
  const action = active || legacyAttacking ? 'attack' : moving ? 'move' : 'idle', selected = frames(action);
  const index = active && action === 'attack' ? seraphAttackFrame(clock, elapsed, selected.length)
    : action === 'attack' ? Math.min(selected.length - 1, Math.floor(Math.max(0, attackAge) / Math.max(.24, attackDuration) * selected.length))
    : Math.floor(Math.max(0, elapsed - cell.born) * fpsFor(assets, selected, action === 'move' ? 8 : 4)) % Math.max(1, selected.length);
  const fallback = [`${family}.${direction}`, `${family}.front`, `${family}`].find(id => assets[id]);
  const id = selected.length ? selected[index] : fallback;
  const reference = assets[`${family}.front.idle.00`] ?? assets[`${family}.front`];
  const referenceHeight = (reference as { sourceBounds?: { height?: number } } | undefined)?.sourceBounds?.height;
  const height = ready ? role === 'commander' ? 72 : role === 'prism' ? 58 : 54 : role === 'commander' ? 64 : role === 'prism' ? 50 : 46;
  return id && assets[id] ? { id, height, sourceScale: height / Math.max(1, referenceHeight ?? 400), flipX: Math.cos(cell.facing) < 0 } : undefined;
}
