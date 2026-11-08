import { anchorDangerView } from '../game/anchorDanger';
import type { GameState } from '../game/types';
import type { Camera } from './camera';
import type { LabelRect } from './sceneLabels';

export interface AnchorHealthView { rect: LabelRect; ratio: number; label: string; color: string; attacked: boolean }
export function anchorHealthView(state: GameState, camera: Camera, blocked: readonly LabelRect[] = []): AnchorHealthView | null {
  if (!state.territory || state.camp || !['playing', 'paused'].includes(state.phase)) return null;
  const ground = camera.worldToScreen(state.tissue);
  if (ground.x < 0 || ground.x > camera.width || ground.y < 0 || ground.y > camera.height) return null;
  const x = Math.max(56, Math.min(camera.width - 56, ground.x));
  const preferredTop = Math.max(6, Math.min(camera.height - 37, ground.y - 103 * camera.scale - 34));
  const overlaps = (a: LabelRect, b: LabelRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const candidates = [preferredTop, ground.y + 14, ...blocked.flatMap(rect => [rect.bottom + 6, rect.top - 39])]
    .filter(top => top >= 6 && top + 33 <= camera.height - 4)
    .sort((a, b) => Math.abs(a - preferredTop) - Math.abs(b - preferredTop));
  const rect = candidates.map(top => ({ left: x - 54, right: x + 54, top, bottom: top + 33 }))
    .find(candidate => !blocked.some(block => overlaps(candidate, block)));
  // A full-screen panel owns this space; never paint life numbers across its controls.
  if (!rect) return null;
  const danger = anchorDangerView(state), ratio = Math.max(0, Math.min(1, state.tissue.hp / state.tissue.maxHp));
  return { rect, ratio,
    label: `${Math.ceil(Math.max(0, state.tissue.hp))}/${state.tissue.maxHp}`,
    color: danger.critical ? '#ed6871' : danger.attacked ? '#efbb6b' : '#79d3af', attacked: danger.attacked };
}
export function drawAnchorHealth(ctx: CanvasRenderingContext2D, view: AnchorHealthView | null): void {
  if (!view) return;
  const r = view.rect;
  ctx.save(); ctx.fillStyle = '#173b36ee'; ctx.beginPath(); ctx.roundRect(r.left, r.top, 108, 33, 5); ctx.fill();
  ctx.fillStyle = view.attacked ? '#ffb5a9' : '#e8f1db'; ctx.font = '700 10px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`稳态锚${view.attacked ? ' · 受袭' : ''}`, r.left + 54, r.top + 11);
  ctx.font = '700 10px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#f2f7e9'; ctx.fillText(view.label, r.left + 54, r.top + 22);
  ctx.fillStyle = '#283e3d'; ctx.fillRect(r.left + 4, r.top + 25, 100, 5);
  ctx.fillStyle = view.color; ctx.fillRect(r.left + 4, r.top + 25, 100 * view.ratio, 5);
  ctx.strokeStyle = view.attacked ? '#f29b8b' : '#d7ead7'; ctx.lineWidth = 1; ctx.strokeRect(r.left + .5, r.top + .5, 107, 32); ctx.restore();
}
