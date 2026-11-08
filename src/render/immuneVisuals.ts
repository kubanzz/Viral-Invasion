import type { ImmuneCellState } from '../game/immuneCells';
import type { Vec } from '../game/types';
import { seraphPresentationRole } from './legionPresentation';

const TAU = Math.PI * 2;
const font = '"Microsoft YaHei", "Segoe UI", sans-serif';
export const IMMUNE_BODY_LIFT = -13;
/** The very same local vertices are used for drawing and occlusion bounds. */
export function immuneCellBody(cell: ImmuneCellState, elapsed: number) {
  const alpha = cell.until <= elapsed || (cell.hp ?? 1) <= 0 ? 0 : Math.max(0, Math.min(1, (elapsed - cell.born) / .2, (cell.until - elapsed) / .35)) * (cell.echo ? .48 : 1);
  const crawling = cell.activity === 'seeking' || cell.activity === 'returning', biting = elapsed < cell.attackUntil;
  const pulse = Math.sin(elapsed * (crawling ? 13 : 4) + cell.born * 3), radius = cell.radius + (biting ? 3 : 0);
  const outline = Array.from({ length: 37 }, (_, index) => {
    // Five broad leaf lobes, with a stable phase: movement can flex the cell
    // without spinning its silhouette or making it resemble a second bot.
    const angle = index / 36 * TAU, r = radius * (.93 + Math.cos(angle * 5) * .13 + (crawling ? pulse * .025 : 0));
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
  ctx.fillStyle = '#4f685c35'; ctx.fill();
}

/** A soft contact shadow for the painted body; the complete fallback keeps its original shadow. */
function drawNativeGround(ctx: CanvasRenderingContext2D, cell: ImmuneCellState): void {
  const radius = cell.radius * .9;
  ctx.beginPath(); ctx.ellipse(0, 3, radius, radius * .32, 0, 0, TAU);
  ctx.fillStyle = '#45685d35'; ctx.fill();
}

/** Local upright body only; the caller owns its lift, orientation and alpha. */
function drawBody(ctx: CanvasRenderingContext2D, body: ImmuneBody): void {
  // Cream leaf membrane and a paired sage nucleus identify an organic ally.
  ctx.beginPath();
  for (const [index, vertex] of body.outline.entries()) {
    if (index === 0) ctx.moveTo(vertex.x, vertex.y); else ctx.lineTo(vertex.x, vertex.y);
  }
  ctx.closePath(); ctx.fillStyle = body.biting ? '#f8efd7' : '#eee9d3'; ctx.fill(); ctx.strokeStyle = '#6f927b'; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-3, -2, 4, 6, -.5, 0, TAU); ctx.ellipse(3, 2, 3.5, 5, -.5, 0, TAU);
  ctx.fillStyle = '#8caf91'; ctx.fill();
}

function drawActivity(ctx: CanvasRenderingContext2D, cell: ImmuneCellState, elapsed: number, body: ImmuneBody, low: boolean): void {
  // The dedicated effect pass owns authoritative Seraph windup/release/hit accents.
  if (cell.legionId === 'seraph') return;
  const { crawling, biting, pulse, radius } = body;
  if (!low && crawling) for (const sign of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(-radius - 4, sign * 4 + pulse, 1.8, 1.3, 0, 0, TAU); ctx.fillStyle = '#97b598'; ctx.fill();
  }
  if (biting) {
    const open = .3 + Math.min(1, (cell.attackUntil - elapsed) / .24) * .35;
    ctx.beginPath(); ctx.arc(0, 0, radius + 5, -open, open); ctx.strokeStyle = '#496f59'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#f3e7bc'; ctx.lineWidth = 2; ctx.stroke();
  }
}

/** Distinct commander/wing silhouette while the registered painted family loads. */
function drawSeraphBody(ctx: CanvasRenderingContext2D, cell: ImmuneCellState, body: ImmuneBody): void {
  const role=seraphPresentationRole(cell),leader=role==='commander',r=cell.radius,spread=(body.biting ? .5 : 1)+(body.crawling?body.pulse*.08:0);
  for(const sign of [-1,1]){
    ctx.beginPath();ctx.moveTo(-r*.3,sign*r*.45);ctx.quadraticCurveTo(-r*1.7,sign*r*2.1*spread,-r*1.9,sign*r*.85);
    ctx.lineTo(-r*.95,sign*r*.7);ctx.lineTo(-r*1.25,sign*r*.18);ctx.closePath();
    ctx.fillStyle='#d6e9dd';ctx.fill();ctx.strokeStyle='#c5ab70';ctx.lineWidth=1.4;ctx.stroke();
  }
  ctx.beginPath();ctx.moveTo(r*1.15,0);ctx.lineTo(r*.25,-r*.8);ctx.lineTo(-r*.8,-r*.65);ctx.lineTo(-r,0);
  ctx.lineTo(-r*.8,r*.65);ctx.lineTo(r*.25,r*.8);ctx.closePath();ctx.fillStyle='#f7f1db';ctx.fill();ctx.strokeStyle='#b49a60';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.ellipse(0,0,r*.4,r*.52,0,0,TAU);ctx.fillStyle='#3c8c7b';ctx.fill();
  if(leader){
    ctx.beginPath();ctx.moveTo(-r*.4,-r*.8);ctx.lineTo(-r*.55,-r*1.35);ctx.lineTo(0,-r*1.05);ctx.lineTo(r*.35,-r*1.5);
    ctx.lineTo(r*.6,-r*.65);ctx.strokeStyle='#d0ae62';ctx.lineWidth=2.8;ctx.stroke();
    if(body.biting)stroke(ctx,{x:r*.5,y:r*.5},{x:r*2.1,y:-r*.25},'#fff4bc',4);
  }else if(role==='prism'){
    stroke(ctx,{x:r*.4,y:r*.75},{x:r*1.6,y:-r*.9},'#d5ba7d',2.4);
    ctx.beginPath();ctx.moveTo(r*1.6,-r*1.25);ctx.lineTo(r*1.9,-r*.9);ctx.lineTo(r*1.6,-r*.55);ctx.lineTo(r*1.3,-r*.9);ctx.closePath();
    ctx.fillStyle='#b2ece0';ctx.fill();ctx.strokeStyle='#f8e5b5';ctx.lineWidth=1.5;ctx.stroke();
  }else{
    stroke(ctx,{x:-r*.3,y:r*.75},{x:r*2.1,y:-r*.55},'#dfc180',2.5);
    stroke(ctx,{x:r*1.65,y:-r*.25},{x:r*2.1,y:-r*.55},'#fff5d7',3.5);
  }
}

function drawLifetime(ctx: CanvasRenderingContext2D, cell: ImmuneCellState, elapsed: number): void {
  const remaining = Math.max(0, Math.min(1, cell.hp !== undefined ? cell.hp / (cell.maxHp ?? 60) : Number.isFinite(cell.until) ? (cell.until - elapsed) / (cell.until - cell.born) : 1));
  stroke(ctx, { x: -10, y: 8 }, { x: 10, y: 8 }, '#465c4d', 3);
  stroke(ctx, { x: -10, y: 8 }, { x: -10 + remaining * 20, y: 8 }, remaining < .35 ? '#c77e70' : '#bdd0a8', 2);
  if ((cell.antibodyUntil ?? 0) > elapsed) {
    ctx.beginPath(); ctx.ellipse(0, -7, cell.radius + 7, cell.radius * .65 + 5, 0, 0, TAU);
    ctx.strokeStyle = '#ad8955'; ctx.lineWidth = 2; ctx.stroke();
    stroke(ctx, { x: -10, y: 12 }, { x: -10 + Math.min(1, (cell.antibodyUntil! - elapsed) / 8) * 20, y: 12 }, '#ad8955', 2);
  }
}

/**
 * World-space feedback for a native PNG body. Never draws a second body, nucleus
 * or cross. Ground/overlay can be submitted on either side of the native sprite;
 * all is convenient when a single compatibility layer owns the accents.
 * Uses the same born/until alpha as immuneCellBody(); apply it separately to PNG.
 */
export function drawImmuneCellAccents(ctx: CanvasRenderingContext2D, cell: ImmuneCellState, elapsed: number,
  low = false, layer: ImmuneCellAccentLayer = 'all', hideLifetime = false): void {
  if (cell.until <= elapsed) return;
  const body = immuneCellBody(cell, elapsed);
  ctx.save(); ctx.globalAlpha = body.alpha; ctx.translate(cell.x, cell.y);
  if (layer !== 'overlay') drawNativeGround(ctx, cell);
  if (layer !== 'ground') {
    ctx.scale(1, 1 / .72);
    ctx.save(); ctx.translate(0, IMMUNE_BODY_LIFT); ctx.rotate(body.rotation);
    drawActivity(ctx, cell, elapsed, body, low); ctx.restore();
    if (!hideLifetime) drawLifetime(ctx, cell, elapsed);
  }
  ctx.restore();
}

/** Render-only fallback: same complete procedural body, feedback and ordering. */
export function drawImmuneCell(ctx: CanvasRenderingContext2D, cell: ImmuneCellState, elapsed: number, low = false, hideLifetime = false): void {
  if (cell.until <= elapsed) return;
  const body = immuneCellBody(cell, elapsed);
  ctx.save(); ctx.globalAlpha = body.alpha; ctx.translate(cell.x, cell.y);
  drawGround(ctx, cell); ctx.scale(1, 1 / .72);
  ctx.save(); ctx.translate(0, IMMUNE_BODY_LIFT); ctx.rotate(body.rotation);
  if(cell.legionId==='seraph')drawSeraphBody(ctx,cell,body);else drawBody(ctx, body);
  drawActivity(ctx, cell, elapsed, body, low); ctx.restore();
  if (!hideLifetime) drawLifetime(ctx, cell, elapsed); ctx.restore();
}

export function drawImmuneSquadLabel(ctx: CanvasRenderingContext2D, origin: Vec, count: number, patrol = false): void {
  if (!count) return;
  ctx.save(); ctx.translate(origin.x, origin.y); ctx.scale(1, 1 / .72); ctx.font = `500 11px ${font}`;
  ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#15242c'; ctx.fillStyle = '#d5efd1';
  const value = patrol ? '✚ 免疫侦巡' : `✚ 免疫小队 ×${count}`;
  ctx.strokeText(value, 0, -59); ctx.fillText(value, 0, -59); ctx.restore();
}
