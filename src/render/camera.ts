import type { Vec, WorldGeometry } from '../game/types';

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
  }
  /** Large arenas keep combat readable instead of shrinking the whole organ. */
  follow(point: Vec, world: WorldGeometry, options: { deltaSeconds?: number; snap?: boolean } = {}): void {
    if (world.width <= 1200 && world.height <= 800) { this.resize(this.width, this.height); return; }
    this.scale = Math.min(this.width / 1152, this.height / 720);
    this.offsetX = 0; this.offsetY = 0;
    const clamp = (n: number, min: number, max: number) => min > max ? (min + max) / 2 : Math.max(min, Math.min(max, n));
    const left = -120, right = this.width / this.scale - 120;
    const top = -150 / this.yScale, bottom = (this.height / this.scale - 150) / this.yScale;
    const targetX = clamp(this.width / this.scale * .5 - 120 - point.x, right - world.width - 40, left + 40);
    const targetY = clamp((this.height / this.scale * .5 - 150) / this.yScale - point.y, bottom - world.height - 40, top + 80);
    const key = `${world.width}:${world.height}`;
    const dt = options.deltaSeconds;
    const snap = options.snap || this.followScope !== key || dt === undefined || !Number.isFinite(dt);
    const blend = snap ? 1 : 1 - Math.exp(-Math.max(0, Math.min(.1, dt)) / .09);
    this.panX += (targetX - this.panX) * blend;
    this.panY += (targetY - this.panY) * blend;
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
