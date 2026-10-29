import type { Vec } from '../game/types';
import type { AimedPaintedTool, RegisteredSpriteLayout, SourceRegisteredSpriteAsset } from './spriteGeometry';
import type { VisualBounds } from './raisedObstacleGeometry';

export interface HeroGait { phase: number; amount: number; lean: number }
export interface SpriteMesh { vertices: number[]; indices: number[] }
export interface HeroRig { mesh: SpriteMesh; bounds: VisualBounds; wrist: Vec }
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Same authored idle body, deformed at hips and the holding arm by Phaser Mesh2D.
 * The upper body is stable; opposite legs swing from their own hip, with a
 * planted half-cycle and a lifted return. No unapproved frame is substituted.
 */
export function createHeroRig(asset: SourceRegisteredSpriteAsset, layout: RegisteredSpriteLayout,
  point: Vec, flipX: boolean, lift: number, gait: HeroGait, tool?: AimedPaintedTool): HeroRig | undefined {
  const b = asset.sourceBounds, v = asset.visibleBounds;
  if (!b || typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.width !== 'number'
    || asset.sourceSize?.width !== 1024 || asset.sourceSize.height !== 1024) return;
  const sourceScale = (layout.bounds.bottom - layout.bounds.top - 4) / b.height;
  const reflection = flipX ? -1 : 1;
  // Inspected front wrist and shoulder of the approved, shared-canvas idle.
  const wristSource = { x: 682, y: 699 }, shoulder = { x: 617, y: 565 };
  const wrist = { x: point.x + reflection * (wristSource.x - 512) * sourceScale,
    y: point.y * .72 + (wristSource.y - 850) * sourceScale + lift };
  const targetWrist = tool ? { x: 512 + (tool.grip.x - point.x) * reflection / sourceScale,
    y: 850 + (tool.grip.y - point.y * .72 - lift) / sourceScale } : wristSource;
  const oldArm = { x: wristSource.x - shoulder.x, y: wristSource.y - shoulder.y };
  const newArm = { x: targetWrist.x - shoulder.x, y: targetWrist.y - shoulder.y };
  const armAngle = Math.atan2(newArm.y, newArm.x) - Math.atan2(oldArm.y, oldArm.x);
  const armScale = Math.hypot(newArm.x, newArm.y) / Math.hypot(oldArm.x, oldArm.y);
  const skin = (sx: number, sy: number): Vec => {
    let dx = 0, dy = 0;
    const leg = smooth(653, 835, sy) * (1 - smooth(655, 705, sx)) * smooth(330, 395, sx)
      * (1 - smooth(600, 650, sx) * (1 - smooth(735, 775, sy)));
    const side = 2 * smooth(501, 552, sx) - 1;
    const swing = Math.sin(gait.phase) * side;
    dx += swing * 35 * leg * gait.amount;
    dy -= Math.max(0, Math.cos(gait.phase) * side) * 27 * leg * gait.amount;
    dx += gait.lean * smooth(855, 570, sy) * (1 - smooth(530, 620, sx)) * 16;
    // The inner sleeve edge follows the authored diagonal, above the far leg.
    // A rigid shoulder rotation avoids folding triangles when aiming upward.
    const inner = 599 + Math.max(0, sy - 560) * .4;
    const arm = smooth(inner, inner + 22, sx) * smooth(548, 615, sy) * (1 - smooth(737, 760, sy));
    const ax = sx - shoulder.x, ay = sy - shoulder.y;
    dx += (ax * Math.cos(armAngle) * armScale - ay * Math.sin(armAngle) * armScale - ax) * arm;
    dy += (ax * Math.sin(armAngle) * armScale + ay * Math.cos(armAngle) * armScale - ay) * arm;
    return { x: reflection * (sx - 512 + dx) * sourceScale,
      y: (sy - 850 + dy) * sourceScale + lift };
  };
  const vertices: number[] = [], indices: number[] = [];
  // More rows around hips/wrists keep their bends local, without slicing art.
  const columns = 28, rows = 36;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const u = col / columns, w = row / rows;
    const atlasX = u * asset.width, atlasY = w * asset.height;
    const sx = b.x + (atlasX - v.x) * b.width / v.width;
    const sy = b.y + (atlasY - v.y) * b.height / v.height;
    const { x, y } = skin(sx, sy);
    vertices.push(x, y, u, w);
    if (atlasX >= v.x && atlasX <= v.x + v.width && atlasY >= v.y && atlasY <= v.y + v.height) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = row * (columns + 1) + col, c = a + columns + 1;
    // Already ordered into adjacent triangle pairs for Phaser's quad batching.
    indices.push(a, c, a + 1, 0, c, a + 1, c + 1, 0);
  }
  // The envelope covers edge interpolation and all pixels between sample rows.
  const original = layout.bounds;
  const pad = 5 + Math.abs(gait.amount) * 5;
  const hand = skin(wristSource.x, wristSource.y);
  return { mesh: { vertices, indices }, wrist: { x: point.x + hand.x, y: point.y * .72 + hand.y },
    bounds: { left: point.x + Math.min(left, flipX ? -original.right : original.left) - pad,
      right: point.x + Math.max(right, flipX ? -original.left : original.right) + pad,
      top: point.y * .72 + Math.min(top, original.top + lift) - pad,
      bottom: point.y * .72 + Math.max(bottom, original.bottom + lift) + pad } };
}
