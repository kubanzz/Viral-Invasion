import { hostEventMaxHp } from '../game/hostEvents';
import type { GameState } from '../game/types';
import type { Camera } from './camera';
import type { VisualBounds } from './raisedObstacleGeometry';
import type { LabelRect } from './sceneLabels';
import type { PlayerDangerLevel } from './playerDamageFeedback';

export interface PlayerHealthView { rect: LabelRect; ratio: number; label: string; color: string }
export function playerHealthView(state: GameState, camera: Camera, body: VisualBounds, level: PlayerDangerLevel): PlayerHealthView | null {
  if (state.player.hp <= 0 || state.phase === 'menu' || state.phase === 'result') return null;
  const max = hostEventMaxHp(state), ground = camera.worldToScreen(state.player);
  const x = Math.max(36, Math.min(camera.width - 36, ground.x));
  const top = Math.max(6, Math.min(camera.height - 28, ground.y + (body.top - state.player.y * .72) * camera.scale - 26));
  return { rect: { left: x - 32, right: x + 32, top, bottom: top + 22 },
    ratio: Math.max(0, Math.min(1, state.player.hp / max)), label: `${Math.ceil(state.player.hp)}/${max}`,
    color: level === 'critical' ? '#ed6871' : level === 'low' ? '#efbb6b' : '#79d3af' };
}
export function drawPlayerHealth(ctx: CanvasRenderingContext2D, view: PlayerHealthView | null): void {
  if (!view) return;
  const { rect: r } = view, x = r.left + 2, y = r.top + 13;
  ctx.save(); ctx.fillStyle = '#173b36e8'; ctx.beginPath(); ctx.roundRect(r.left, r.top, 64, 22, 5); ctx.fill();
  ctx.font = '700 10px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f2f7e9'; ctx.fillText(view.label, x + 30, r.top + 10);
  ctx.fillStyle = '#283e3d'; ctx.fillRect(x, y, 60, 7); ctx.fillStyle = view.color; ctx.fillRect(x, y, 60 * view.ratio, 7);
  ctx.strokeStyle = '#d7ead7'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, 59, 6); ctx.restore();
}
