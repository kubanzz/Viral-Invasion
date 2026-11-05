import { BALANCE, type GameState, type Target, type Vec } from '../game/types';
import { IMMUNE_CELL_BALANCE, type ImmuneCellState } from '../game/immuneCells';
import { heroFacingDirection, requestedHeroAnimation } from './heroAnimation';
import { sourceRegisteredSpriteLayout, type RegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from './spriteGeometry';
import type { HeroLocomotion } from './heroLocomotion';
import { isHeldWeaponAsset } from './weaponPresentation';

export const ACTOR_PREFIX = 'fantasy.actor.';
/** Fixed role canvases, locked by same-scene review; these never fit individual alpha bounds. */
export const ACTOR_CANVAS = { hero:128, enemyRadiusFactor:4.1, immuneRadiusFactor:3.5, motherRadiusFactor:4.1, emitter:96, beacon:82 } as const;
/** Kick pivots around the inspected palm; translating only the tool would detach it. */
export function actorRecoilAngle(facing:number,strength:number) {
  return -.075*Math.max(0,Math.min(1,strength))*(Math.cos(facing)<0?-1:1);
}
export const ACTOR_STATIC_IDS = {
  emitter: `${ACTOR_PREFIX}weapon.emitter`, beacon: `${ACTOR_PREFIX}immune.beacon`,
  invader: `${ACTOR_PREFIX}enemy.addon.spore_crown`, elite: `${ACTOR_PREFIX}enemy.elite.fungal_horns`,
} as const;
export interface ActorRegistration {
  canvas: { width: number; height: number }; foot: Vec; grip?: Vec; muzzle?: Vec;
  /** Multiplier of the already registered logical canvas (normally 1), shared by an identity.
   * Raw generation-to-512 transforms stay in delivery metadata and are not applied twice. */
  commonCanvasScale: number;
}
export interface ActorAsset extends SourceRegisteredSpriteAsset {
  actorRegistration?: ActorRegistration; animation?: unknown; aliasOf?: string;
  source?: string; sourceSha256?: string; sourceFrame?: { x: number; y: number; width: number; height: number };
}
interface ClipMetadata { group: string; index: number; fps: number; frameCount: number; approved: boolean }
interface ContractGroup { identity: string; direction?: string; clip: string; count: number }
const groups: ContractGroup[] = [
  ...['front_right', 'back_right'].flatMap(direction => Object.entries({ idle: 4, walk: 8, hurt: 2, dash: 4 })
    .map(([clip, count]) => ({ identity: 'hero', direction, clip, count }))),
  ...['basic', 'thinRay', 'carapace', 'fission.parent', 'fission.child', 'mimic'].flatMap(kind =>
    Object.entries({ walk: 4, windup: 2, hurt: 1, dissolve: 1 }).map(([clip, count]) => ({ identity: `enemy.${kind}`, clip, count }))),
  ...['front_right', 'back_right'].flatMap(direction => Object.entries({ crawl: 4, bite: 4 })
    .map(([clip, count]) => ({ identity: 'immune', direction, clip, count }))),
  ...Object.entries({ base: 4, core: 2, membrane: 1, carapace: 1, fission: 1, mimic: 1, purified: 1 })
    .map(([clip, count]) => ({ identity: 'mother', clip, count })),
];
const groupName = (group: Pick<ContractGroup, 'identity' | 'direction' | 'clip'>) =>
  `${ACTOR_PREFIX}${group.identity}.${group.direction ? `${group.direction}.` : ''}${group.clip}`;
export const ACTOR_REQUIRED_GROUPS = groups.map(group => ({ ...group, group: groupName(group) }));
export const ACTOR_RUNTIME_IDS = [
  ...groups.flatMap(group=>Array.from({length:group.count},(_,index)=>group.identity==='mother'&&group.count===1?groupName(group)
    :`${groupName(group)}.${String(index).padStart(2,'0')}`)),
  ...Object.values(ACTOR_STATIC_IDS),
] as readonly string[];
export interface ActorGroupStatus { identity: string; ready: boolean; missing: string[]; issues: string[] }
interface ActorClip { frames: { id: string; asset: ActorAsset; registration: ActorRegistration }[]; fps: number }
export interface ActorRequest {
  identity: string; action: string; clip: string; direction?: string; authoredDirection?: string; flipX?: boolean;
  age?: number; duration?: number; moving?: boolean; logicalAction?: string;
  /** Fixed-step distance phase; present only for the real player's walk. */
  cycle?: number;
}
export interface ActorFrame extends ActorRequest {
  id: string; index: number; asset: ActorAsset; registration: ActorRegistration; layout: RegisteredSpriteLayout;
  sourceScale: number; groupReady: boolean; preview: boolean;
}
const finitePoint = (p: Vec | undefined, width: number, height: number) => !!p
  && [p.x, p.y].every(Number.isFinite) && p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height;

export function actorRegistration(asset: ActorAsset): ActorRegistration | undefined {
  const r = asset.actorRegistration, size = asset.sourceSize;
  if (!r || !size || ![512, 1024].includes(r.canvas?.width) || r.canvas.width !== r.canvas.height
    || r.canvas.width !== size.width || r.canvas.height !== size.height
    || !finitePoint(r.foot, size.width, size.height) || !Number.isFinite(r.commonCanvasScale) || r.commonCanvasScale <= 0
    || r.grip && !finitePoint(r.grip, size.width, size.height) || r.muzzle && !finitePoint(r.muzzle, size.width, size.height)) return;
  return r;
}
const metadata = (asset: ActorAsset) => asset.animation && typeof asset.animation === 'object'
  ? asset.animation as ClipMetadata : undefined;
const sameRegistration = (a: ActorRegistration, b: ActorRegistration) => a.canvas.width === b.canvas.width
  && a.canvas.height === b.canvas.height && Math.abs(a.foot.x - b.foot.x) < 1e-6
  && Math.abs(a.foot.y - b.foot.y) < 1e-6 && a.commonCanvasScale === b.commonCanvasScale;

/** Whole identities are opted in only after every contracted frame is reviewed. */
export class ActorAnimationLibrary {
  private readonly clips = new Map<string, ActorClip>();
  private readonly candidateClips = new Map<string, ActorClip>();
  readonly statuses: ActorGroupStatus[];
  constructor(readonly assets: Readonly<Record<string, ActorAsset>>) {
    this.statuses = [...new Set(groups.map(group => group.identity))].map(identity => {
      const missing: string[] = [], issues: string[] = [];
      let common: ActorRegistration | undefined;
      for (const group of groups.filter(group => group.identity === identity)) {
        const name = groupName(group), frames: ActorClip['frames'] = [];
        let fps: number | undefined;
        const entries = Object.entries(assets).filter(([id, asset]) => !asset.aliasOf && (id.startsWith(`${name}.`) || group.identity === 'mother' && group.count === 1 && id === name));
        if (entries.length !== group.count) issues.push(`${name}:frame-count`);
        for (let index = 0; index < group.count; index++) {
          const id = group.identity === 'mother' && group.count === 1 ? name : `${name}.${String(index).padStart(2, '0')}`, asset = assets[id];
          if (!asset || asset.aliasOf) { missing.push(id); continue; }
          const a = metadata(asset), r = actorRegistration(asset);
          if (!a || a.group !== name || a.index !== index || a.frameCount !== group.count
            || !Number.isFinite(a.fps) || a.fps <= 0 || fps !== undefined && fps !== a.fps) { issues.push(`${id}:animation-contract`); continue; }
          if(a.approved!==true)issues.push(`${id}:animation-unreviewed`);
          if (!r || Math.abs(r.foot.x / r.canvas.width - .5) > 1e-6 || Math.abs(r.foot.y / r.canvas.height - .85) > 1e-6
            || !sourceRegisteredSpriteLayout(asset, r.canvas, r.foot, 1)
            || common && !sameRegistration(common, r) || identity === 'hero' && !r.grip) { issues.push(`${id}:registration`); continue; }
          common ??= r; fps = a.fps; frames.push({ id, asset, registration: r });
        }
        if (frames.length === group.count && entries.length === group.count && fps !== undefined){
          this.candidateClips.set(name,{frames,fps});
          if(frames.every(frame=>metadata(frame.asset)?.approved===true))this.clips.set(name, { frames, fps });
        }
      }
      return { identity, ready: missing.length === 0 && issues.length === 0, missing, issues };
    });
  }
  ready(identity: string) { return this.statuses.find(status => status.identity === identity)?.ready === true; }
  staticAsset(id: string, preview = false) {
    const asset = this.assets[id], registration = asset && actorRegistration(asset);
    const a=asset&&metadata(asset),reviewed=a?.approved===true&&a.group===id&&a.index===0&&a.frameCount===1&&Number.isFinite(a.fps)&&a.fps>0;
    if(registration){
      if(registration.canvas.width!==512)return;
      if(id===ACTOR_STATIC_IDS.emitter||isHeldWeaponAsset(id)){
        const grip=registration.grip,muzzle=asset.sourceMuzzle??registration.muzzle;
        if(!grip||!finitePoint(muzzle,512,512)||Math.abs(registration.foot.x-grip.x)>1e-6||Math.abs(registration.foot.y-grip.y)>1e-6)return;
        if(asset.sourceMuzzle&&registration.muzzle&&(Math.abs(asset.sourceMuzzle.x-registration.muzzle.x)>1e-6
          ||Math.abs(asset.sourceMuzzle.y-registration.muzzle.y)>1e-6))return;
      }else if(Math.abs(registration.foot.x-256)>1e-6||Math.abs(registration.foot.y-435.2)>1e-6)return;
    }
    return asset && !asset.aliasOf && (preview || reviewed) && registration
      && sourceRegisteredSpriteLayout(asset, registration.canvas, registration.foot, 1)
      ? { id, asset, registration } : undefined;
  }
  frame(request: ActorRequest, canvasWorldHeight: number, time: number, allowPreview = false, previewAnimation = false): ActorFrame | undefined {
    if(request.duration!==undefined&&(!Number.isFinite(request.duration)||request.duration<=0))return;
    const addressedDirection=request.identity==='hero'||request.identity==='immune'?request.authoredDirection:undefined;
    const name = groupName({ identity: request.identity, direction: addressedDirection, clip: request.clip });
    const ready = this.ready(request.identity), clip = ready?this.clips.get(name):previewAnimation?this.candidateClips.get(name):undefined;
    if (!ready && !allowPreview) return;
    const preview = !ready;
    const masterId = `${ACTOR_PREFIX}${request.identity}.${addressedDirection ? `${addressedDirection}.` : ''}master`;
    const masterPrefix=masterId.slice(0,-'master'.length);
    const candidate = preview ? Object.entries(this.assets).find(([id, asset]) => !asset.aliasOf && (id.startsWith(`${name}.`)||id===name) && actorRegistration(asset))
      ?? Object.entries(this.assets).find(([id, asset]) => id.startsWith(masterPrefix)&&id.endsWith('.master')&&!asset.aliasOf&&actorRegistration(asset)) : undefined;
    if (!clip && !candidate) return;
    const index = !clip ? 0 : request.duration !== undefined
      ? Math.min(clip!.frames.length - 1, Math.floor(Math.max(0, request.age ?? 0) / request.duration * clip!.frames.length + 1e-8))
      : request.cycle !== undefined ? Math.floor(Math.max(0, request.cycle % 1) * clip!.frames.length + 1e-8) % clip!.frames.length
        : request.moving === false ? 0 : Math.floor(Math.max(0, time) * clip!.fps + 1e-8) % clip!.frames.length;
    const selected = !clip ? { id: candidate![0], asset: candidate![1], registration: actorRegistration(candidate![1])! } : clip.frames[index];
    const sourceScale = canvasWorldHeight / selected.registration.canvas.height * selected.registration.commonCanvasScale;
    const layout = sourceRegisteredSpriteLayout(selected.asset, selected.registration.canvas, selected.registration.foot, sourceScale);
    return layout ? { ...request, ...selected, index, layout, sourceScale, groupReady: ready, preview } : undefined;
  }
}

export function requestedActorHero(state: GameState, locomotion?: Readonly<HeroLocomotion>): ActorRequest {
  const action = requestedHeroAnimation(state), facing = heroFacingDirection(state.player.facing);
  if (locomotion && (action.clip === 'walk' || action.clip === 'idle')) {
    const clip = locomotion.moving ? 'walk' : 'idle';
    return { identity: 'hero', action: clip, clip, ...facing, ...(clip === 'walk' ? { cycle: locomotion.cycle } : {}) };
  }
  return { identity: 'hero', action: action.clip, clip: action.clip, ...facing, age: action.age, duration: action.duration };
}
export function enemyActorIdentity(target: Target): string {
  return target.traits?.includes('FISSION') ? `enemy.fission.${(target.generation ?? 0) > 0 ? 'child' : 'parent'}`
    : target.traits?.includes('CARAPACE') ? 'enemy.carapace' : target.traits?.includes('MIMIC') ? 'enemy.mimic'
      : target.tactic === 'thin-ray' ? 'enemy.thinRay' : 'enemy.basic';
}
export function requestedActorEnemy(target: Target, state: GameState): ActorRequest {
  const identity=enemyActorIdentity(target),plan=target.attackPlan;
  const facing=identity==='enemy.thinRay'&&plan?.kind==='thin-ray'&&(target.attackAt??0)>state.elapsed
    ?Math.atan2(plan.aim.y-plan.origin.y,plan.aim.x-plan.origin.x):Number.isFinite(target.facing)?target.facing!:0;
  const flipX=Math.cos(facing)<0;
  // One upright authored view has an honest left/right reflection. Ground cues
  // carry the exact rule angle; this is not a fabricated back-facing texture.
  const base = { identity, authoredDirection:'front_right', direction:flipX?'front_left':'front_right', flipX };
  if (target.hp <= 0) return { ...base, action: 'dissolve', clip: 'dissolve', age: state.elapsed - (target.deadAt ?? state.elapsed), duration: .3 };
  if (target.hitUntil > state.elapsed) return { ...base, action: 'hurt', clip: 'hurt', moving: false };
  if (target.attackPlan && (target.attackAt ?? 0) > state.elapsed) return { ...base, action: 'windup', clip: 'windup',
    age: target.attackPlan.windup - (target.attackAt! - state.elapsed), duration: target.attackPlan.windup };
  if ((target.attackAt ?? 0) > state.elapsed) return { ...base, action: 'windup', clip: 'windup',
    age: (target.attackWindup ?? .5) - (target.attackAt! - state.elapsed), duration: target.attackWindup ?? .5 };
  return { ...base, action: target.charge ? 'charge' : 'walk', clip: 'walk' };
}
export function requestedActorImmune(cell: ImmuneCellState, state: GameState): ActorRequest {
  const biting = state.elapsed < cell.attackUntil;
  return { identity: 'immune', action: biting ? 'bite' : cell.activity === 'guarding' ? 'guard' : 'crawl', clip: biting ? 'bite' : 'crawl',
    ...heroFacingDirection(cell.facing), ...(biting ? { age: IMMUNE_CELL_BALANCE.attackPose - (cell.attackUntil - state.elapsed), duration: IMMUNE_CELL_BALANCE.attackPose }
      : { moving: cell.activity === 'seeking' || cell.activity === 'returning' }) };
}

/** Bounded visual loop phases. Replay/pause never need a Phaser clock or rule writes. */
export class ActorAnimationController {
  private run = ''; private lastElapsed = -1; private lastTick = -1;
  private readonly actors = new Map<string, { action: string; enteredAt: number; frame: ActorFrame }>();
  private readonly seen = new Set<string>();
  constructor(readonly library: ActorAnimationLibrary) {}
  beginFrame(state: GameState) {
    const run = `${state.seed}:${state.runMetrics?.runId ?? state.growth?.runId ?? ''}`;
    if (this.run !== run || state.elapsed < this.lastElapsed || state.tick < this.lastTick) this.reset();
    this.run = run; this.lastElapsed = state.elapsed; this.lastTick = state.tick; this.seen.clear();
  }
  select(id: string, request: ActorRequest, state: GameState, canvasWorldHeight: number, preview = false, inspectOnly = false, previewAnimation = false) {
    const run = `${state.seed}:${state.runMetrics?.runId ?? state.growth?.runId ?? ''}`;
    const previous = run === this.run ? this.actors.get(id) : undefined;
    if (!inspectOnly) this.seen.add(id);
    if (state.phase !== 'playing' && previous?.frame.identity===request.identity && !preview) return previous.frame;
    const time = state.visualTime ?? state.elapsed, enteredAt = previous?.action === request.action&&previous.frame.identity===request.identity ? previous.enteredAt : time;
    const frame = this.library.frame(request, canvasWorldHeight, time - enteredAt, preview, previewAnimation);
    if (frame && !inspectOnly) this.actors.set(id, { action: request.action, enteredAt, frame });
    return frame;
  }
  endFrame() { for (const id of this.actors.keys()) if (!this.seen.has(id)) this.actors.delete(id); }
  reset() { this.run = ''; this.lastElapsed = this.lastTick = -1; this.actors.clear(); this.seen.clear(); }
}

export function actorLogicalAction(state: GameState) {
  const fired = [...state.events].reverse().find(event => event.type === 'TOOL_FIRED' && event.tick <= state.tick
    && state.elapsed - event.tick * BALANCE.step >= -1e-8 && state.elapsed - event.tick * BALANCE.step < .12);
  return fired ? fired.data.tool === 1 ? 'fire' : fired.data.tool === 2 ? 'catalysis' : 'purify'
    : state.scanUntil > state.elapsed ? 'scan' : undefined;
}
