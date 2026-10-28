import type { GameState } from '../game/types';
import type { SceneLabelSink } from './sceneLabels';
import { catalysisView } from '../ui/catalysisHud';

/** At most three friendly triangular markers; simulation owns their lifetime. */
export function drawCatalysis(ctx: CanvasRenderingContext2D, state: GameState, labels?: SceneLabelSink): void {
  const view = catalysisView(state); if (!view) return;
  for (const target of view.targets) {
    const r = target.radius + 5;
    ctx.save(); ctx.translate(target.x, target.y);
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, r * .7); ctx.lineTo(-r, r * .7); ctx.closePath();
    ctx.strokeStyle = '#fff9e9'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#98600e'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    labels?.add({ id: `catalysis:${target.id}`, anchor: { x: target.x, y: target.y }, offset: { x: 0, y: -target.radius * .72 - 12 },
      priority: 94, essential: true, lines: [{ text: '△ 催化 · 1/细胞', color: '#775014', size: 10 }] });
  }
}
