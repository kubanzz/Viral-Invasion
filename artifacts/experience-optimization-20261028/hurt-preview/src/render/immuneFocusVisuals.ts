import type { GameState } from '../game/types';
import type { SceneLabelSink } from './sceneLabels';
import { immuneFocusView } from '../ui/immuneFocusHud';

/** A single friendly ground reticle follows the real order; no animation owns its lifetime. */
export function drawImmuneFocus(ctx: CanvasRenderingContext2D, state: GameState, labels?: SceneLabelSink): void {
  const view = immuneFocusView(state);
  if (!view) return;
  const { target } = view, r = target.radius + 9;
  ctx.save(); ctx.translate(target.x, target.y);
  ctx.strokeStyle = '#fff9e9'; ctx.lineWidth = 5;
  const path = () => {
    ctx.beginPath();
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(x * (r - 8), y * r); ctx.lineTo(x * r, y * r); ctx.lineTo(x * r, y * (r - 8));
    }
  };
  path(); ctx.stroke(); ctx.strokeStyle = '#147b80'; ctx.lineWidth = 2; path(); ctx.stroke(); ctx.restore();
  if (labels) labels.add({ id: 'immune-focus-order', anchor: { x: target.x, y: target.y }, offset: { x: 0, y: r * .72 + 17 },
    priority: 95, essential: true, lines: [{ text: `◎ 围猎 ${view.seconds}s`, color: '#1a676b', size: 11 }] });
}
