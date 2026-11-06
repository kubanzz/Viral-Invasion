import { campLayout } from '../game/campLayout';
import { campStationDistance } from '../game/campScene';
import type { GameState } from '../game/types';
import type { Camera, CameraFollowOptions } from './camera';
import type { LabelRect } from './sceneLabels';

interface FollowState { scope: string; width: number; height: number; elapsed: number; x: number; y: number; scale: number }
const frames = new WeakMap<Camera, FollowState>();
const clamp = (value: number, low: number, high: number) => low > high ? (low + high) / 2 : Math.max(low, Math.min(high, value));
export function resetCampCamera(camera: Camera): void { frames.delete(camera); }

/** Camp is an overview on desktop and a readable, locally framed walk on phones. */
export function prepareCampCamera(camera: Camera, state: GameState, options: CameraFollowOptions, hud: readonly LabelRect[]): void {
  const layout = campLayout(state), origin = layout.origin;
  const compact = camera.width <= 1024 || camera.height <= 600;
  const headerBottom = Math.max(60, ...hud.filter(r => r.top < camera.height * .35 && r.right > 0 && r.left < camera.width).map(r => r.bottom));
  const viewport = options.viewport ?? { left: compact ? 12 : 24, right: camera.width - (compact ? 12 : 24), top: Math.min(camera.height - 140, headerBottom + 12), bottom: camera.height - 18 };
  const width = viewport.right - viewport.left, height = viewport.bottom - viewport.top;
  const bounds = { left: origin.x - 590, right: origin.x + 575, top: origin.y * camera.yScale - 300, bottom: origin.y * camera.yScale + 360 };
  let scale = Math.min(1.18, width / (bounds.right - bounds.left), height / (bounds.bottom - bounds.top));
  let x = (bounds.left + bounds.right) / 2, y = (bounds.top + bounds.bottom) / 2;
  if (compact) {
    scale = Math.min(1, Math.max(.86, camera.height / 460));
    x = state.player.x; y = state.player.y * camera.yScale - 28;
    const nearest = layout.sites.slice().sort((a, b) => campStationDistance(state.player, a) - campStationDistance(state.player, b) || a.id.localeCompare(b.id))[0];
    if (nearest && campStationDistance(state.player, nearest) < 180) {
      // Include the whole destination, not just its interaction point beneath the roof.
      const bodyHeight = ({ warehouse: 171, forge: 185, shop: 107, departure: 108, summon: 115 } as const)[nearest.id];
      const bodyWidth = nearest.id === 'forge' ? 220 : nearest.logicalWidth * .8;
      const body = { left: nearest.position.x - bodyWidth / 2, right: nearest.position.x + bodyWidth / 2, top: nearest.position.y * camera.yScale - bodyHeight, bottom: nearest.position.y * camera.yScale + 16 };
      const union = { left: Math.min(body.left, state.player.x - 38), right: Math.max(body.right, state.player.x + 38), top: Math.min(body.top, state.player.y * camera.yScale - 80), bottom: Math.max(body.bottom, state.player.y * camera.yScale + 14) };
      scale = Math.max(.62, Math.min(scale, (width - 32) / (union.right - union.left), (height - 22) / (union.bottom - union.top)));
      x = (union.left + union.right) / 2; y = (union.top + union.bottom) / 2;
    }
  }
  const scope = `${state.seed}:${origin.x}:${origin.y}:${compact}`;
  const previous = frames.get(camera);
  const snap = options.snap || !previous || previous.scope !== scope || previous.width !== camera.width || previous.height !== camera.height || state.elapsed < previous.elapsed || options.deltaSeconds === undefined;
  const blend = snap ? 1 : 1 - Math.exp(-Math.max(0, Math.min(.1, options.deltaSeconds!)) / .10);
  const currentScale = previous && !snap ? previous.scale + (scale - previous.scale) * blend : scale;
  x = previous && !snap ? previous.x + (x - previous.x) * blend : x;
  y = previous && !snap ? previous.y + (y - previous.y) * blend : y;
  x = clamp(x, bounds.left + width / currentScale / 2, bounds.right - width / currentScale / 2);
  y = clamp(y, bounds.top + height / currentScale / 2, bounds.bottom - height / currentScale / 2);
  // Keep the actual player envelope in the usable viewport even during a camera transition.
  x = clamp(x, state.player.x + 38 - width / currentScale / 2, state.player.x - 38 + width / currentScale / 2);
  y = clamp(y, state.player.y * camera.yScale + 14 - height / currentScale / 2, state.player.y * camera.yScale - 80 + height / currentScale / 2);
  camera.scale = currentScale; camera.offsetX = 0; camera.offsetY = 0;
  camera.panX = (viewport.left + viewport.right) / 2 / currentScale - 120 - x;
  camera.panY = ((viewport.top + viewport.bottom) / 2 / currentScale - 150 - y) / camera.yScale;
  frames.set(camera, { scope, width: camera.width, height: camera.height, elapsed: state.elapsed, x, y, scale: currentScale });
}
