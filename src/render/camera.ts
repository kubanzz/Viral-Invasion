import type { Vec, WorldGeometry } from '../game/types';

export interface CameraViewport { left: number; top: number; right: number; bottom: number }
/** Offsets from the player's ground anchor in projected world units. Upright
 * sprite Y offsets are not compressed by yScale. */
export interface CameraPlayerFrame { left: number; top: number; right: number; bottom: number }
// The registered hero and independently aimed emitter must fit this envelope;
// an asset-geometry regression checks every selected body frame and tool angle.
export const CAMERA_PLAYER_FRAME: Readonly<CameraPlayerFrame> = Object.freeze({ left: -64, top: -112, right: 64, bottom: 28 });
export interface CameraFollowOptions {
  deltaSeconds?: number;
  snap?: boolean;
  aim?: Vec;
  /** Ground footprint around an aimed landing, e.g. the central heavy cannon. */
  aimRadius?: number;
  viewport?: CameraViewport;
  playerFrame?: Readonly<CameraPlayerFrame>;
  /** Normal combat readability, in CSS pixels per world unit. A distant skill
   * preview may still zoom out to keep its real endpoint and the player visible. */
  minimumScale?: number;
}

/** Normal compact combat keeps actor details readable; source alpha determines visible height. */
export const COMPACT_COMBAT_MINIMUM_SCALE = .62;

/** Visual projection only: simulation and collision always use the XY plane. */
export class Camera {
  width = 1440;
  height = 900;
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  panX = 0;
  panY = 0;
  private followScope = '';
  private framingScale: number | undefined;
  readonly yScale = .72;
  constructor(width = 1440, height = 900) { this.resize(width, height); }
  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.scale = Math.min(this.width / 1440, this.height / 900);
    this.offsetX = (this.width - 1440 * this.scale) / 2;
    this.offsetY = (this.height - 900 * this.scale) / 2;
    this.panX = 0; this.panY = 0;
    this.followScope = '';
    this.framingScale = undefined;
  }
  /** Large arenas keep combat readable instead of shrinking the whole organ. */
  follow(point: Vec, world: WorldGeometry, options: CameraFollowOptions = {}): void {
    const overviewScale = Math.min(this.width / 1440, this.height / 900);
    const minimumScale = typeof options.minimumScale === 'number' && Number.isFinite(options.minimumScale)
      && options.minimumScale > 0 ? Math.min(2, options.minimumScale) : 0;
    const overview = world.width <= 1200 && world.height <= 800;
    if (overview && minimumScale <= overviewScale) { this.resize(this.width, this.height); return; }
    const key = `${world.width}:${world.height}`;
    const dt = options.deltaSeconds;
    const snap = options.snap || this.followScope !== key || dt === undefined || !Number.isFinite(dt);
    const blend = snap ? 1 : 1 - Math.exp(-Math.max(0, Math.min(.1, dt)) / .09);
    const fittedScale = overview ? overviewScale : Math.min(this.width / 1152, this.height / 720);
    const baseScale = Math.max(minimumScale, fittedScale);
    const aim = options.aim && Number.isFinite(options.aim.x) && Number.isFinite(options.aim.y) ? options.aim : undefined;
    const requested = options.viewport;
    const viewport = requested && [requested.left, requested.top, requested.right, requested.bottom].every(Number.isFinite)
      ? { left: Math.max(0, requested.left), top: Math.max(0, requested.top), right: Math.min(this.width, requested.right), bottom: Math.min(this.height, requested.bottom) }
      : { left: 0, top: 0, right: this.width, bottom: this.height };
    if (viewport.right - viewport.left <= 40 || viewport.bottom - viewport.top <= 40) {
      viewport.left = 0; viewport.top = 0; viewport.right = this.width; viewport.bottom = this.height;
    }
    const suppliedFrame = options.playerFrame;
    const frame = suppliedFrame && [suppliedFrame.left, suppliedFrame.top, suppliedFrame.right, suppliedFrame.bottom].every(Number.isFinite)
      && suppliedFrame.left < suppliedFrame.right && suppliedFrame.top < suppliedFrame.bottom ? suppliedFrame : CAMERA_PLAYER_FRAME;
    const body = { left: point.x + frame.left, right: point.x + frame.right,
      top: point.y * this.yScale + frame.top, bottom: point.y * this.yScale + frame.bottom };
    const aimRadius=typeof options.aimRadius==='number'&&Number.isFinite(options.aimRadius)?Math.max(0,options.aimRadius):0;
    const framed = aim ? { left: Math.min(body.left, aim.x-aimRadius), right: Math.max(body.right, aim.x+aimRadius),
      top: Math.min(body.top, (aim.y-aimRadius) * this.yScale), bottom: Math.max(body.bottom, (aim.y+aimRadius) * this.yScale) } : body;
    let targetScale = baseScale;
    if (aim) {
      const fitX = (viewport.right - viewport.left - 40) / (framed.right - framed.left);
      const fitY = (viewport.bottom - viewport.top - 40) / (framed.bottom - framed.top);
      // A downward 650-unit preview includes the entire upright body above its
      // foot. The former .72 floor could not fit that union on short phones.
      // Keep a bounded readable floor for impossible, out-of-range points and
      // a small fit allowance so eased zoom reaches the safe interval promptly.
      // A real landing footprint may need more room between desktop HUD
      // panels than a point preview. Ordinary aim keeps its prior scale floor.
      const floor=aimRadius>0?Math.min(fittedScale*.5,.12):fittedScale*.5;
      targetScale = Math.max(floor, Math.min(baseScale, Math.min(fitX, fitY) * .98));
      this.framingScale ??= this.scale;
      // Do not advertise a footprint underneath the HUD while easing out.
      // New/upward flight poses fit immediately; returning zoom remains eased.
      if(aimRadius>0&&targetScale<this.scale)this.framingScale=targetScale;
    }
    if (this.framingScale !== undefined) {
      this.framingScale += (targetScale - this.framingScale) * blend;
      this.scale = this.framingScale;
      if (!aim && Math.abs(this.scale - baseScale) <= baseScale * 1e-6) {
        this.scale = baseScale; this.framingScale = undefined;
      }
    } else this.scale = baseScale;
    this.offsetX = 0; this.offsetY = 0;
    const clamp = (n: number, min: number, max: number) => min > max ? (min + max) / 2 : Math.max(min, Math.min(max, n));
    const focus = aim ? { x: (framed.left + framed.right) / 2, y: (framed.top + framed.bottom) / 2 / this.yScale } : point;
    // Keep the default arithmetic unchanged for cameras which never opt in.
    const left = requested ? viewport.left / this.scale - 120 : -120;
    const right = (requested ? viewport.right : this.width) / this.scale - 120;
    const top = requested ? (viewport.top / this.scale - 150) / this.yScale : -150 / this.yScale;
    const bottom = ((requested ? viewport.bottom : this.height) / this.scale - 150) / this.yScale;
    const anchorX = requested ? (viewport.left + viewport.right) * .5 / this.scale : this.width / this.scale * .5;
    const anchorY = requested ? (viewport.top + viewport.bottom) * .5 / this.scale : this.height / this.scale * .5;
    let targetX = clamp(anchorX - 120 - focus.x, right - world.width - 40, left + 40);
    let targetY = clamp((anchorY - 150) / this.yScale - focus.y, bottom - world.height - 40, top + 80);
    const constrainFrame = (x: number, y: number): Vec => {
      // Use the current eased scale, not its eventual target. Until the whole
      // pair fits, protect the complete hero rather than just its ground point.
      const fitsX = (framed.right - framed.left) * this.scale <= viewport.right - viewport.left - 40 + 1e-8;
      const fitsY = (framed.bottom - framed.top) * this.scale <= viewport.bottom - viewport.top - 40 + 1e-8;
      const xFrame = fitsX ? framed : body, yFrame = fitsY ? framed : body;
      return { x: clamp(x, (viewport.left + 20) / this.scale - 120 - xFrame.left, (viewport.right - 20) / this.scale - 120 - xFrame.right),
        y: clamp(y, ((viewport.top + 20) / this.scale - 150 - yFrame.top) / this.yScale,
          ((viewport.bottom - 20) / this.scale - 150 - yFrame.bottom) / this.yScale) };
    };
    if (aim || suppliedFrame) {
      const target = constrainFrame(targetX, targetY); targetX = target.x; targetY = target.y;
    }
    this.panX += (targetX - this.panX) * blend;
    this.panY += (targetY - this.panY) * blend;
    if (aim || suppliedFrame) {
      // A prior non-preview camera may already have the head under a status
      // bar. Do not preserve that invalid pose for several smoothing frames.
      const next = constrainFrame(this.panX, this.panY); this.panX = next.x; this.panY = next.y;
    }
    this.followScope = key;
  }
  worldToScreen(point: Vec): Vec {
    return { x: this.offsetX + (point.x + this.panX + 120) * this.scale, y: this.offsetY + ((point.y + this.panY) * this.yScale + 150) * this.scale };
  }
  screenToWorld(point: Vec): Vec {
    return { x: (point.x - this.offsetX) / this.scale - 120 - this.panX, y: ((point.y - this.offsetY) / this.scale - 150) / this.yScale - this.panY };
  }
  apply(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.offsetX + (120 + this.panX) * this.scale, this.offsetY + (150 + this.panY * this.yScale) * this.scale);
    ctx.scale(this.scale, this.scale * this.yScale);
  }
}
