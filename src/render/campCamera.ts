import { campLayout } from '../game/campLayout';
import { BALANCE, type GameState } from '../game/types';
import type { Camera, CameraFollowOptions } from './camera';
import type { LabelRect } from './sceneLabels';

interface FollowState {
  scope: string; width: number; height: number; elapsed: number; x: number; y: number; scale: number;
  anchorX: number; anchorY: number;
  screenX: number; screenY: number;
  fit: { left: number; right: number; top: number; bottom: number };
}
export const CAMP_WALK_CAMERA = { deadZoneX: 42, deadZoneY: 26, smoothingSeconds: .16 } as const;
const frames = new WeakMap<Camera, FollowState>();
const clamp = (value: number, low: number, high: number) => low > high ? (low + high) / 2 : Math.max(low, Math.min(high, value));
export function resetCampCamera(camera: Camera): void { frames.delete(camera); }

/** Explicit overview fits the camp; walking keeps one scale and a calm dead-zone follow. */
export function prepareCampCamera(camera: Camera, state: GameState, options: CameraFollowOptions, hud: readonly LabelRect[]): void {
  const layout = campLayout(state), origin = layout.origin;
  const compact = camera.width <= 1024 || camera.height <= 600;
  const ready=state.camp?.prologue==='ready',overview=ready&&!!state.camp?.overview;
  const headerBottom = Math.max(60, ...hud.filter(r => r.top < camera.height * .35 && r.right > 0 && r.left < camera.width).map(r => r.bottom));
  const viewport = options.viewport ?? { left: compact ? 12 : 24, right: camera.width - (compact ? 12 : 24), top: Math.min(camera.height - 140, headerBottom + 12), bottom: camera.height - 18 };
  const width = viewport.right - viewport.left, height = viewport.bottom - viewport.top;
  const bounds = ready?{left:layout.worldBounds.left+12,right:layout.worldBounds.right-12,top:layout.worldBounds.top*camera.yScale-75,bottom:layout.worldBounds.bottom*camera.yScale+20}
    :{ left: origin.x - 590, right: origin.x + 575, top: origin.y * camera.yScale - 300, bottom: origin.y * camera.yScale + 360 };
  let scale = Math.min(1.18, width / (bounds.right - bounds.left), height / (bounds.bottom - bounds.top));
  let x = (bounds.left + bounds.right) / 2, y = (bounds.top + bounds.bottom) / 2;
  if (!overview&&(compact||ready)) {
    scale = Math.min(ready?1.08:1, Math.max(.86, camera.height / (compact?460:700)));
    x = state.player.x; y = state.player.y * camera.yScale - 28;
  }
  const walking = !overview && (compact || ready);
  const scope = `${state.seed}:${origin.x}:${origin.y}:${compact}:${overview}:${walking}`;
  const previous = frames.get(camera);
  const snap = options.snap || !previous || previous.scope !== scope || previous.width !== camera.width || previous.height !== camera.height || state.elapsed < previous.elapsed || options.deltaSeconds === undefined;
  // A nearby action may wrap the toolbar. Its new rectangle must not recenter
  // the entire world underneath a stationary player.
  const screenX = walking && previous && !snap ? previous.screenX : (viewport.left + viewport.right) / 2;
  const screenY = walking && previous && !snap ? previous.screenY : (viewport.top + viewport.bottom) / 2;
  // A persistent dead-zone anchor moves only at its outer edge. Nearby service
  // nodes cannot change either the scale or the follow target while walking.
  let anchorX = x, anchorY = y;
  if (walking && previous && !snap) {
    anchorX = clamp(previous.anchorX, x - CAMP_WALK_CAMERA.deadZoneX / scale, x + CAMP_WALK_CAMERA.deadZoneX / scale);
    anchorY = clamp(previous.anchorY, y - CAMP_WALK_CAMERA.deadZoneY / scale, y + CAMP_WALK_CAMERA.deadZoneY / scale);
    x = anchorX; y = anchorY;
  }
  const dt = Math.max(0, Math.min(.1, options.deltaSeconds ?? 0));
  const blend = snap ? 1 : 1 - Math.exp(-dt / CAMP_WALK_CAMERA.smoothingSeconds);
  const currentScale = scale;
  const left = (screenX - viewport.left) / scale, right = (viewport.right - screenX) / scale;
  const top = (screenY - viewport.top) / scale, bottom = (viewport.bottom - screenY) / scale;
  const fit = walking && previous && !snap ? previous.fit : { left, right, top, bottom };
  // District-edge fitting belongs to the initial walk viewport too. Only the
  // player's safety envelope responds to a changing toolbar rectangle.
  x = clamp(x, bounds.left + fit.left, bounds.right - fit.right);
  y = clamp(y, bounds.top + fit.top, bounds.bottom - fit.bottom);
  // Constrain the destination, then ease toward it. A newly taller toolbar
  // can request head clearance without a one-frame safety-clamp jump.
  x = clamp(x, state.player.x + 38 - right, state.player.x - 38 + left);
  y = clamp(y, state.player.y * camera.yScale + 14 - bottom, state.player.y * camera.yScale - 80 + top);
  anchorX = x; anchorY = y;
  if (previous && !snap) {
    const nextX = previous.x + (x - previous.x) * blend, nextY = previous.y + (y - previous.y) * blend;
    // One additional CSS pixel bounds a necessary HUD-clearance correction;
    // ordinary tracking remains limited by the player's actual travel speed.
    const correction = walking && dt > 0 ? 1 / scale : 0;
    x = walking ? clamp(nextX, previous.x - BALANCE.speed * dt - correction, previous.x + BALANCE.speed * dt + correction) : nextX;
    y = walking ? clamp(nextY, previous.y - BALANCE.speed * camera.yScale * dt - correction, previous.y + BALANCE.speed * camera.yScale * dt + correction) : nextY;
  }
  camera.scale = currentScale; camera.offsetX = 0; camera.offsetY = 0;
  camera.panX = screenX / currentScale - 120 - x;
  camera.panY = (screenY / currentScale - 150 - y) / camera.yScale;
  frames.set(camera, { scope, width: camera.width, height: camera.height, elapsed: state.elapsed, x, y, scale: currentScale, anchorX, anchorY, screenX, screenY, fit });
}
