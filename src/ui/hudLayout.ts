import type { LabelRect } from '../render/sceneLabels';

const hudPanels = '.topbar .brand,.top-actions,.objective,.telemetry,.growth-panel,.organ-overview,.dock-wrap,.evolution-card,.migration-card,.mother-core-panel,.evolution-feedback,.trait-strip,.message,.run-time,.endless-wave-panel,.endless-vitals,.endless-build-panel,.endless-navigation';
const softenedUntil = new WeakMap<HTMLElement, number>();

export interface HudReadOptions {
  active?: boolean;
  now?: number;
  player?: LabelRect;
}

const intersects = (a: LabelRect, b: LabelRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** One DOM read batch per HUD update/resize. Renderer keeps the returned CSS-pixel rectangles. */
export function readVisibleHudRects(canvas: HTMLCanvasElement, options: HudReadOptions = {}): readonly LabelRect[] {
  const document = canvas.ownerDocument, view = document.defaultView;
  if (!view) return [];
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return [];
  const styles = new Map<Element, CSSStyleDeclaration>();
  const visible = (element: HTMLElement) => {
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      if (node.hidden) return false;
      let style = styles.get(node);
      if (!style) { style = view.getComputedStyle(node); styles.set(node, style); }
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    return true;
  };
  const panels: { element: HTMLElement; rect: LabelRect }[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(hudPanels)) {
    if (!visible(element)) continue;
    const box = element.getBoundingClientRect();
    const rect = {
      left: Math.max(0, box.left - canvasRect.left), right: Math.min(canvasRect.width, box.right - canvasRect.left),
      top: Math.max(0, box.top - canvasRect.top), bottom: Math.min(canvasRect.height, box.bottom - canvasRect.top),
    };
    if (rect.right > rect.left && rect.bottom > rect.top) panels.push({ element, rect });
  }
  // Only optional build/map imagery softens. Critical readouts and organ-risk text never do.
  // Opacity changes no geometry, so this write phase cannot invalidate the read batch above.
  const now = options.now ?? 0;
  for (const { element, rect } of panels) {
    if (!element.matches('.growth-panel,.organ-overview')) continue;
    if (options.active && options.player && intersects(options.player, rect)) softenedUntil.set(element, now + 350);
    const soften = !!options.active && (softenedUntil.get(element) ?? 0) > now;
    element.classList.toggle('hud-obscured', soften);
    if (!options.active) softenedUntil.delete(element);
  }
  return Object.freeze(panels.map(({ rect }) => Object.freeze(rect)));
}
