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

type ImmuneBody = ReturnType<typeof immuneCellBody>;
export type ImmuneCellAccentLayer = 'ground' | 'overlay' | 'all';

function drawGround(ctx: CanvasRenderingContext2D, cell: ImmuneCellState): void {
  ctx.beginPath(); ctx.ellipse(0, 3, cell.radius + 4, (cell.radius + 4) * .46, 0, 0, TAU);
  ctx.fillStyle = '#0c252d77'; ctx.fill();
}

/** A soft contact shadow for the painted body; the complete fallback keeps its original shadow. */
function drawNativeGround(ctx: CanvasRenderingContext2D, cell: ImmuneCellState): void {
  const radius = cell.radius * .9;
  ctx.beginPath(); ctx.ellipse(0, 3, radius, radius * .32, 0, 0, TAU);
  ctx.fillStyle = '#45685d35'; ctx.fill();
}

/** Local upright body only; the caller owns its lift, orientation and alpha. */
function drawBody(ctx: CanvasRenderingContext2D, body: ImmuneBody): void {
  // Every unit carries its own cross/nucleus rather than reading as a second turret.
  ctx.beginPath();
  for (const [index, vertex] of body.outline.entries()) {
    if (index === 0) ctx.moveTo(vertex.x, vertex.y); else ctx.lineTo(vertex.x, vertex.y);
  }
  ctx.closePath(); ctx.fillStyle = body.biting ? '#ecffe4' : '#cdebd7'; ctx.fill(); ctx.strokeStyle = '#619b89'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-4, -2, 6, 8, -.4, 0, TAU); ctx.ellipse(4, 3, 5, 7, .4, 0, TAU);
  ctx.fillStyle = '#689c9c'; ctx.fill();
  stroke(ctx, { x: -4, y: -1 }, { x: 4, y: -1 }, '#f4ffdd', 2.2);
  stroke(ctx, { x: 0, y: -5 }, { x: 0, y: 3 }, '#f4ffdd', 2.2);
}

function drawActivity(ctx: CanvasRenderingContext2D, cell: ImmuneCellState, elapsed: number, body: ImmuneBody, low: boolean): void {
  const { crawling, biting, pulse, radius } = body;
  if (!low && crawling) for (const sign of [-1, 1]) {
    stroke(ctx, { x: -radius - 7, y: sign * 5 }, { x: -radius - 1, y: sign * 5 + pulse * 2 }, '#b1e3ceaa', 1.5);
  }
  if (biting) {
    const open = .5 + (cell.attackUntil - elapsed) / .24 * .8;
    ctx.beginPath(); ctx.arc(0, 0, radius + 7, -.7 - open, .7 + open); ctx.strokeStyle = '#e3ffba'; ctx.lineWidth = 3; ctx.stroke();
  }
}

function drawLifetime(ctx: CanvasRenderingContext2D, cell: ImmuneCellState, elapsed: number): void {
  // A tiny lifetime bar makes the temporary nature visible without a label wall.
  const remaining = Math.max(0, Math.min(1, (cell.until - elapsed) / (cell.until - cell.born)));
  stroke(ctx, { x: -10, y: 8 }, { x: 10, y: 8 }, '#193f3e', 3);
  stroke(ctx, { x: -10, y: 8 }, { x: -10 + remaining * 20, y: 8 }, '#c7efb5', 2);
}

/**
 * World-space feedback for a native PNG body. Never draws a second body, nucleus
 * or cross. Ground/overlay can be submitted on either side of the native sprite;
 * all is convenient when a single compatibility layer owns the accents.
 * Uses the same born/until alpha as immuneCellBody(); apply it separately to PNG.
 */
export function drawImmuneCellAccents(ctx: CanvasRenderingContext2D, cell: ImmuneCellState, elapsed: number,
  low = false, layer: ImmuneCellAccentLayer = 'all'): void {
  if (cell.until <= elapsed) return;
  const body = immuneCellBody(cell, elapsed);
  ctx.save(); ctx.globalAlpha = body.alpha; ctx.translate(cell.x, cell.y);
  if (layer !== 'overlay') drawNativeGround(ctx, cell);
  if (layer !== 'ground') {
    ctx.scale(1, 1 / .72);
    ctx.save(); ctx.translate(0, IMMUNE_BODY_LIFT); ctx.rotate(body.rotation);
    drawActivity(ctx, cell, elapsed, body, low); ctx.restore();
    drawLifetime(ctx, cell, elapsed);
  }
  ctx.restore();
}

/** Render-only fallback: same complete procedural body, feedback and ordering. */
export function drawImmuneCell(ctx: CanvasRenderingContext2D, cell: ImmuneCellState, elapsed: number, low = false): void {
  if (cell.until <= elapsed) return;
  const body = immuneCellBody(cell, elapsed);
  ctx.save(); ctx.globalAlpha = body.alpha; ctx.translate(cell.x, cell.y);
  drawGround(ctx, cell); ctx.scale(1, 1 / .72);
  ctx.save(); ctx.translate(0, IMMUNE_BODY_LIFT); ctx.rotate(body.rotation);
  drawBody(ctx, body); drawActivity(ctx, cell, elapsed, body, low); ctx.restore();
  drawLifetime(ctx, cell, elapsed); ctx.restore();
}

export function drawImmuneSquadLabel(ctx: CanvasRenderingContext2D, origin: Vec, count: number, patrol = false): void {
  if (!count) return;
  ctx.save(); ctx.translate(origin.x, origin.y); ctx.scale(1, 1 / .72); ctx.font = `500 11px ${font}`;
  ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#15242c'; ctx.fillStyle = '#d5efd1';
  const value = patrol ? '✚ 免疫侦巡' : `✚ 免疫小队 ×${count}`;
  ctx.strokeText(value, 0, -59); ctx.fillText(value, 0, -59); ctx.restore();
}
