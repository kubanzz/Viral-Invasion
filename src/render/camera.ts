import type { Vec } from '../game/types';

/** Visual projection only: simulation and collision always use the XY plane. */
export class Camera {
  width = 1440;
  height = 900;
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  readonly yScale = .72;
  constructor(width = 1440, height = 900) { this.resize(width, height); }
  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.scale = Math.min(this.width / 1440, this.height / 900);
    this.offsetX = (this.width - 1440 * this.scale) / 2;
    this.offsetY = (this.height - 900 * this.scale) / 2;
  }
  worldToScreen(point: Vec): Vec {
    return { x: this.offsetX + (point.x + 120) * this.scale, y: this.offsetY + (point.y * this.yScale + 150) * this.scale };
  }
  screenToWorld(point: Vec): Vec {
    return { x: (point.x - this.offsetX) / this.scale - 120, y: ((point.y - this.offsetY) / this.scale - 150) / this.yScale };
  }
  apply(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.offsetX + 120 * this.scale, this.offsetY + 150 * this.scale);
    ctx.scale(this.scale, this.scale * this.yScale);
  }
}
