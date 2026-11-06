import { BALANCE, type GameEvent, type GameState, type Vec } from '../game/types';
import { HERO_STRIDE_DISTANCE } from './heroLocomotion';
import { heldWeaponFacing } from './weaponPresentation';

export type Player3DLocomotionClip = 'Idle_Subtle' | 'Jog' | 'Walk_Backwards' | 'Strafe_left' | 'Strafe_right' | 'Sprint';
export type Player3DUpperClip = 'Pistol_Idle' | 'Pistol_Shoot' | 'Bow_Ready' | 'Bow Pull Back' | 'Bow Pull Hold' | 'Bow Release';
/** The authored draw first raises the bow from the hip; ready presentation starts after that lift. */
export const BOW_READY_TIME = .55;
export interface Player3DAnimationEvent {
  id: string;
  clip: Player3DUpperClip | 'Hit_Chest';
  age: number;
  /** Presentation duration in game seconds; source animation time is age * timeScale. */
  duration: number;
  timeScale: number;
  timeOffset?: number;
  kind: 'once' | 'hold' | 'loop';
}
export interface Player3DMotionFrame {
  runKey: string;
  time: number;
  delta: number;
  paused: boolean;
  armed: boolean;
  aimFacing: number;
  bodyFacing: number;
  bodyYaw: number;
  moving: boolean;
  dashing: boolean;
  speed: number;
  distance: number;
  stridePhase: number;
  locomotionWeights: Record<Player3DLocomotionClip, number>;
  locomotionTimeScale: number;
  upperClip?: Player3DUpperClip;
  upperEvent?: Player3DAnimationEvent;
  fullBodyEvent?: Player3DAnimationEvent;
}

const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
const emptyWeights = (): Record<Player3DLocomotionClip, number> => ({ Idle_Subtle: 0, Jog: 0, Walk_Backwards: 0, Strafe_left: 0, Strafe_right: 0, Sprint: 0 });

/** Continuous cardinal weights in the body's aimed frame. No angle sectors or sprite mirroring. */
export function player3DDirectionalWeights(velocity: Vec, facing: number): Record<Player3DLocomotionClip, number> {
  const weights = emptyWeights(), speed = Math.hypot(velocity.x, velocity.y);
  if (!Number.isFinite(speed) || speed <= 1e-6) { weights.Idle_Subtle = 1; return weights; }
  const angle = finite(facing), x = velocity.x / speed, y = velocity.y / speed;
  const forward = x * Math.cos(angle) + y * Math.sin(angle);
  const right = -x * Math.sin(angle) + y * Math.cos(angle);
  weights.Jog = Math.max(0, forward); weights.Walk_Backwards = Math.max(0, -forward);
  weights.Strafe_right = Math.max(0, right); weights.Strafe_left = Math.max(0, -right);
  const sum = weights.Jog + weights.Walk_Backwards + weights.Strafe_left + weights.Strafe_right;
  for (const clip of ['Jog', 'Walk_Backwards', 'Strafe_left', 'Strafe_right'] as const) weights[clip] /= sum;
  return weights;
}

interface AcceptedSample { tick: number; elapsed: number; x: number; y: number; dashing: boolean }
interface TimedEvent { id: string; clip: Player3DAnimationEvent['clip']; born: number; duration: number; sourceDuration: number }

/** Presentation receipts only. This class never advances simulation, consumes input or changes a save. */
export class Player3DMotionController {
  private scope = '';
  private accepted?: AcceptedSample;
  private velocity: Vec = { x: 0, y: 0 };
  private travelled = 0;
  private segment?: { from: number; to: number; fromTime: number; toTime: number };
  private lastVisualTime?: number;
  private lastHurtUntil = 0;
  private shot?: TimedEvent;
  private hit?: TimedEvent;
  private dashFacing?: number;
  private preparation?: { id: string; born: number; firesAt: number };

  reset(): void {
    this.scope = ''; this.accepted = undefined; this.velocity = { x: 0, y: 0 };
    this.travelled = 0; this.segment = undefined; this.lastVisualTime = undefined;
    this.lastHurtUntil = 0; this.shot = undefined; this.hit = undefined;
    this.dashFacing = undefined; this.preparation = undefined;
  }

  private key(state: GameState): string {
    return [state.seed, state.runMetrics?.runId ?? state.growth?.runId ?? '', state.battle?.organId ?? 'training',
      state.phase === 'menu' ? 'menu' : state.camp ? 'camp' : 'world'].join(':');
  }
  private ensureScope(state: GameState): void {
    const key = this.key(state), old = this.accepted;
    if (this.scope !== key || old && (state.tick < old.tick || state.elapsed + 1e-8 < old.elapsed)) this.reset();
    this.scope = key;
  }

  /** Call with the authoritative endpoint, including fixed steps that have no rendered frame. */
  observe(state: GameState): void {
    this.ensureScope(state);
    if (state.phase !== 'playing' || this.accepted?.tick === state.tick) return;
    const p = state.player, old = this.accepted;
    const receipts = state.events.filter(event => event.tick === state.tick);
    const dashing = !!state.playerFlight || p.dashUntil > state.elapsed || receipts.some(event => event.type === 'PLAYER_DASHED');
    this.accepted = { tick: state.tick, elapsed: state.elapsed, x: p.x, y: p.y, dashing };
    if (old) {
      const dt = state.elapsed - old.elapsed, dx = p.x - old.x, dy = p.y - old.y, gap = Math.hypot(dx, dy);
      if (dashing && gap > .01 && Number.isFinite(gap)) this.dashFacing = Math.atan2(dy, dx);
      const continuous = !dashing && !old.dashing && dt > 0 && dt <= .25
        && gap <= Math.max(40, BALANCE.speed * dt * 1.4);
      const moving = continuous && p.moving && gap > .01;
      this.velocity = moving ? { x: dx / dt, y: dy / dt } : { x: 0, y: 0 };
      if (!continuous) { this.travelled = 0; this.segment = undefined; }
      else {
        const from = this.travelled;
        this.travelled += moving ? gap : 0;
        this.segment = { from, to: this.travelled, fromTime: old.elapsed, toTime: state.elapsed };
      }
    } else this.velocity = { x: 0, y: 0 };

    const projectile = receipts.find(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED');
    const tool = receipts.find(event => event.type === 'TOOL_FIRED' && (event.data.tool === 1 || event.data.tool === 2));
    const shot = projectile ?? tool;
    if (shot) this.observeShot(state, shot);

    if ((receipts.some(event => event.type === 'PLAYER_HURT' && Number(event.data.damage) > 0)
      || p.hurtUntil > this.lastHurtUntil + 1e-8) && p.hurtUntil > state.elapsed) {
      this.hit = { id: this.scope + ':hit:' + state.tick, clip: 'Hit_Chest', born: state.elapsed, duration: .375, sourceDuration: .375 };
    }
    this.lastHurtUntil = p.hurtUntil;
    const preparation = state.weaponCombat?.preparation;
    if (!preparation) this.preparation = undefined;
    else if (preparation.castId !== this.preparation?.id) {
      const receipt = receipts.find(event => event.type === 'WEAPON_SKILL_CAST' && event.data.castId === preparation.castId);
      this.preparation = { id: preparation.castId, born: receipt ? receipt.tick * BALANCE.step : state.elapsed, firesAt: preparation.firesAt };
    }
  }

  private observeShot(state: GameState, receipt: GameEvent): void {
    const bow = receipt.data.weaponId === 'piercing' || state.weaponCombat?.loadout.weaponId === 'piercing'
      || state.expedition?.loadout.weaponId === 'piercing';
    // A projectile receipt and TOOL_FIRED may describe one shot. Prefer the projectile once per tick.
    const duration = bow ? .3 : Math.max(.12, Math.min(.22, state.player.actionUntil - state.elapsed || BALANCE.cooldowns[1]));
    this.shot = { id: this.scope + ':shot:' + receipt.tick + ':' + String(receipt.data.castId ?? receipt.type),
      clip: bow ? 'Bow Release' : 'Pistol_Shoot', born: state.elapsed, duration, sourceDuration: bow ? .4583333432674408 : .75 };
  }

  private eventAt(event: TimedEvent | undefined, time: number): Player3DAnimationEvent | undefined {
    if (!event || time + 1e-8 < event.born || time >= event.born + event.duration) return;
    return { id: event.id, clip: event.clip, age: Math.max(0, time - event.born), duration: event.duration,
      timeScale: event.sourceDuration / event.duration, kind: 'once' };
  }

  /** Read render snapshots without treating interpolation as accepted travel. */
  sample(state: GameState, facingOverride?: number): Player3DMotionFrame {
    this.ensureScope(state);
    const paused = state.phase !== 'playing';
    const requested = finite(state.visualTime ?? state.elapsed, state.elapsed);
    const time = paused ? this.lastVisualTime ?? state.elapsed : requested;
    const delta = paused || this.lastVisualTime === undefined ? 0 : Math.max(0, time - this.lastVisualTime);
    this.lastVisualTime = time;
    const aimFacing = finite(facingOverride ?? heldWeaponFacing(state));
    const dashing = state.phase !== 'menu' && (!!state.playerFlight || state.player.dashUntil > time);
    const speed = Math.hypot(this.velocity.x, this.velocity.y), moving = speed > 1e-6 && !dashing;
    const bodyFacing = dashing && this.dashFacing !== undefined ? this.dashFacing : aimFacing;
    const weights = player3DDirectionalWeights(moving ? this.velocity : { x: 0, y: 0 }, bodyFacing);
    if (dashing) { for (const key of Object.keys(weights) as Player3DLocomotionClip[]) weights[key] = key === 'Sprint' ? 1 : 0; }
    let distance = this.travelled;
    const segment = this.segment;
    if (segment && segment.toTime > segment.fromTime) {
      const fraction = Math.max(0, Math.min(1, (time - segment.fromTime) / (segment.toTime - segment.fromTime)));
      distance = segment.from + (segment.to - segment.from) * fraction;
    }
    const weapon = state.weaponCombat?.loadout.weaponId ?? state.expedition?.loadout.weaponId;
    const armed = state.phase !== 'menu' && (!!weapon || !state.camp);
    let upperClip: Player3DUpperClip | undefined = armed ? weapon === 'piercing' ? 'Bow_Ready' : 'Pistol_Idle' : undefined;
    let upperEvent = this.eventAt(this.shot, time);
    const preparation = this.preparation, livePreparation = state.weaponCombat?.preparation;
    if (weapon === 'piercing' && preparation && livePreparation?.castId === preparation.id && time + 1e-8 >= preparation.born) {
      const duration = Math.max(BALANCE.step, preparation.firesAt - preparation.born), age = Math.max(0, time - preparation.born);
      upperEvent = age < duration ? { id: 'draw:' + preparation.id, clip: 'Bow Pull Back', age, duration, timeScale: (1.25 - BOW_READY_TIME) / duration, timeOffset: BOW_READY_TIME, kind: 'once' }
        : { id: 'hold:' + preparation.id, clip: 'Bow Pull Hold', age: Math.max(0, time - preparation.firesAt), duration: .2083333283662796, timeScale: 1, kind: 'hold' };
    }
    if (dashing || state.phase === 'menu') { upperClip = undefined; upperEvent = undefined; }
    else if (upperEvent) upperClip = upperEvent.clip as Player3DUpperClip;
    const fullBodyEvent = dashing ? undefined : this.eventAt(this.hit, time);
    return { runKey: this.scope, time, delta, paused, armed, aimFacing, bodyFacing, bodyYaw: Math.PI / 2 - bodyFacing,
      moving, dashing, speed, distance, stridePhase: distance / HERO_STRIDE_DISTANCE % 1, locomotionWeights: weights,
      locomotionTimeScale: dashing ? 1.4 : moving ? Math.max(.35, Math.min(1.6, speed / BALANCE.speed)) : 0,
      upperClip, upperEvent, fullBodyEvent };
  }
}
