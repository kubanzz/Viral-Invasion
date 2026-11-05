import { territoryMarkerView, type TerritoryMarkerView } from '../game/territoryPresentation';
import type { GameState } from '../game/types';
import type { TerritoryRenderFrame, TerritoryViewport } from './fantasyTerritory';
import type { LabelRect, SceneLabelSink } from './sceneLabels';

export interface TerritoryMarkerLayout { view: TerritoryMarkerView; x: number; y: number; rect: LabelRect }
export function territoryMarkerLayouts(state: GameState, frame: TerritoryRenderFrame | undefined, viewport: TerritoryViewport, touch = false): TerritoryMarkerLayout[] {
  return (frame?.nodes ?? []).flatMap(({ node }) => {
    const view = territoryMarkerView(state, node, touch), p = viewport.project(node);
    if (view.kind === 'none' && !view.alert || p.x < 0 || p.x > viewport.width || p.y < 0 || p.y > viewport.height) return [];
    const rise = node.kind === 'front' ? 59 : node.kind === 'healing' ? 115 : 110;
    const x = Math.max(14, Math.min(viewport.width - 14, p.x));
    let y = Math.max(15, p.y - rise * viewport.scale);
    for (const r of viewport.blocked ?? []) if (x + 13 > r.left && x - 13 < r.right && y + 13 > r.top && y - 13 < r.bottom) y = r.bottom + 15;
    y = Math.min(viewport.height - 15, y);
    return [{ view, x, y, rect: { left: x - 13, right: x + 13, top: y - 13, bottom: y + 13 } }];
  });
}
export function queueTerritoryMarkerLabels(state: GameState, layouts: readonly TerritoryMarkerLayout[], viewport: TerritoryViewport, labels: SceneLabelSink): string[] {
  return layouts.flatMap(({ view, x, y }) => {
    const { node } = view, active = state.territory?.purification?.nodeId === node.id;
    const near = node.kind === 'source' ? Math.hypot(node.x - state.player.x, node.y - state.player.y) <= 440 : view.near;
    const text = view.alert === 'captured' ? `${node.name}失守` : active ? `${view.label}${view.reason ? ` · ${view.reason}` : ''}` : near ? view.label : '';
    if (!text) return [];
    const p = viewport.project(node), color = view.alert ? '#ffc3c5' : view.kind === 'attack' ? '#ffacae' : view.kind === 'blocked' || view.kind === 'paused' ? '#e2dcce' : '#c9f2df';
    labels.add({ id: `territory-node:${node.id}`, anchor: node, offset: { x: (x - p.x) / viewport.scale, y: (y - p.y - 23) / viewport.scale },
      priority: view.alert ? 95 : active ? 88 : 75, essential: !!view.alert || active || near, lines: [{ text, color, size: 11 }] });
    return [node.id];
  });
}
export function drawTerritoryMarkerIcons(ctx: CanvasRenderingContext2D, layouts: readonly TerritoryMarkerLayout[]): void {
  for (const { view, x, y } of layouts) {
    ctx.save(); ctx.translate(x, y);
    const locked = ['blocked', 'paused', 'shielded', 'dormant'].includes(view.kind);
    ctx.fillStyle = '#203d3bee'; ctx.strokeStyle = view.alert || view.kind === 'attack' ? '#f28089' : locked ? '#b3b4ae' : '#93e5c8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = ctx.fillStyle = view.alert ? '#ffb7ba' : view.kind === 'attack' ? '#ff9ba4' : locked ? '#d0d1c8' : '#a7f1d3';
    if (view.alert) {
      ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, 6);
    } else if (view.kind === 'attack') {
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 3, 0); ctx.lineTo(s * 8, 0); ctx.moveTo(0, s * 3); ctx.lineTo(0, s * 8); ctx.stroke(); }
    } else if (view.kind === 'dormant') {
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('z', 0, 4);
    } else if (view.kind === 'paused') {
      ctx.fillRect(-4, -5, 3, 10); ctx.fillRect(2, -5, 3, 10);
    } else if (locked) {
      ctx.beginPath(); ctx.arc(0, -3, 4, Math.PI, 0); ctx.stroke(); ctx.strokeRect(-5, -3, 10, 8);
    } else {
      ctx.beginPath(); ctx.moveTo(-2, -7); ctx.bezierCurveTo(-10, 1, -6, 7, -2, 7); ctx.bezierCurveTo(3, 7, 6, 1, -2, -7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(6, 1); ctx.moveTo(3, -3); ctx.lineTo(9, -3); ctx.stroke();
    }
    if (view.progress > 0 && (view.kind === 'purifying' || view.kind === 'paused')) {
      ctx.strokeStyle = '#a8efd0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * view.progress); ctx.stroke();
    }
    ctx.restore();
  }
}
