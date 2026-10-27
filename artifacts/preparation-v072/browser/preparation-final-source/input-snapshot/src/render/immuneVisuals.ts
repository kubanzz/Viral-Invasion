import type { ImmuneCellState } from '../game/immuneCells';
import type { Vec } from '../game/types';

const TAU = Math.PI * 2;
const font = '"Microsoft YaHei", "Segoe UI", sans-serif';
export const IMMUNE_BODY_LIFT = -13;
/** The very same local vertices are used for drawing and occlusion bounds. */
export function immuneCellBody(cell: ImmuneCellState, elapsed: number) {
  const alpha = cell.until <= elapsed ? 0 : Math.max(0, Math.min(1, (elapsed - cell.born) / .2, (cell.until - elapsed) / .35));
  const crawling = cell.activity === 'seeking' || cell.activity === 'returning', biting = elapsed < cell.attackUntil;
  const pulse = Math.sin(elapsed * (crawling ? 13 : 4) + cell.born * 3), radius = cell.radius + (biting ? 3 : 0);
  const outline = Array.from({ length: 37 }, (_, index) => {
    const angle = index / 36 * TAU, r = radius * (1 + Math.sin(angle * 5 + elapsed * 3) * .085 + (crawling ? pulse * .035 : 0));
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * .88 };
  });
  return { alpha, crawling, biting, pulse, radius, rotation: Math.atan2(Math.sin(cell.facing) * .72, Math.cos(cell.facing)), outline };
}
function stroke(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, color: string, width: number) {
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

/** Render-only: lobed white cells visibly crawl, acquire a target and engulf on contact. */
export function drawImmuneCell(ctx: CanvasRenderingContext2D, cell: ImmuneCellState, elapsed: number, low = false): void {
  if (cell.until <= elapsed) return;
  const body = immuneCellBody(cell, elapsed), { alpha, crawling, biting, pulse, radius } = body;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.translate(cell.x, cell.y);
  ctx.beginPath(); ctx.ellipse(0, 3, cell.radius + 4, (cell.radius + 4) * .46, 0, 0, TAU);
  ctx.fillStyle = '#0c252d77'; ctx.fill();
  ctx.scale(1, 1 / .72);
  // Every unit carries its own cross/nucleus rather than reading as a second turret.
  ctx.save(); ctx.translate(0, IMMUNE_BODY_LIFT);
  ctx.rotate(body.rotation);
  ctx.beginPath();
  for (const [index, vertex] of body.outline.entries()) {
    if (index === 0) ctx.moveTo(vertex.x, vertex.y); else ctx.lineTo(vertex.x, vertex.y);
  }
  ctx.closePath(); ctx.fillStyle = biting ? '#ecffe4' : '#cdebd7'; ctx.fill(); ctx.strokeStyle = '#619b89'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-4, -2, 6, 8, -.4, 0, TAU); ctx.ellipse(4, 3, 5, 7, .4, 0, TAU);
  ctx.fillStyle = '#689c9c'; ctx.fill();
  stroke(ctx, { x: -4, y: -1 }, { x: 4, y: -1 }, '#f4ffdd', 2.2);
  stroke(ctx, { x: 0, y: -5 }, { x: 0, y: 3 }, '#f4ffdd', 2.2);
  if (!low && crawling) for (const sign of [-1, 1]) {
    stroke(ctx, { x: -radius - 7, y: sign * 5 }, { x: -radius - 1, y: sign * 5 + pulse * 2 }, '#b1e3ceaa', 1.5);
  }
  if (biting) {
    const open = .5 + (cell.attackUntil - elapsed) / .24 * .8;
    ctx.beginPath(); ctx.arc(0, 0, radius + 7, -.7 - open, .7 + open); ctx.strokeStyle = '#e3ffba'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();
  // A tiny lifetime bar makes the temporary nature visible without a label wall.
  const remaining = Math.max(0, Math.min(1, (cell.until - elapsed) / (cell.until - cell.born)));
  stroke(ctx, { x: -10, y: 8 }, { x: 10, y: 8 }, '#193f3e', 3);
  stroke(ctx, { x: -10, y: 8 }, { x: -10 + remaining * 20, y: 8 }, '#c7efb5', 2);
  ctx.restore();
}

export function drawImmuneSquadLabel(ctx: CanvasRenderingContext2D, origin: Vec, count: number, patrol = false): void {
  if (!count) return;
  ctx.save(); ctx.translate(origin.x, origin.y); ctx.scale(1, 1 / .72); ctx.font = `500 11px ${font}`;
  ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#15242c'; ctx.fillStyle = '#d5efd1';
  const value = patrol ? '✚ 免疫侦巡' : `✚ 免疫小队 ×${count}`;
  ctx.strokeText(value, 0, -59); ctx.fillText(value, 0, -59); ctx.restore();
}
