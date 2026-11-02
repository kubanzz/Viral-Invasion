export const TOUCH_LAYOUT_MAX_WIDTH = 1024;
export const TOUCH_LAYOUT_MAX_HEIGHT = 600;

export interface TouchLayoutInput {
  width: number;
  height: number;
  coarsePointer: boolean;
  maxTouchPoints: number;
  forceTouch?: boolean;
}

/** Resolve each observed viewport independently, including desktop window resizes. */
export function resolveTouchLayout({ width, height, coarsePointer, maxTouchPoints, forceTouch }: TouchLayoutInput): boolean {
  if (forceTouch === true) return true;
  // Hidden or not-yet-measured surfaces report zero. Keep desktop until a real
  // viewport is available instead of matching a compact-screen breakpoint.
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  return width <= TOUCH_LAYOUT_MAX_WIDTH || height <= TOUCH_LAYOUT_MAX_HEIGHT
    || coarsePointer && Number.isFinite(maxTouchPoints) && maxTouchPoints > 0;
}
