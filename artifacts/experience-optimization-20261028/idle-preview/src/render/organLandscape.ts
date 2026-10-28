import type { OrganId } from '../game/battleTypes';
import type { WorldGeometry } from '../game/types';
import { getOrganDefinition } from '../game/organConfig';

const TAU = Math.PI * 2;
const random = (seed: number) => { const v = Math.sin(seed * 127.13 + 31.7) * 45771.37; return v - Math.floor(v); };
function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.stroke(); }
}

/** Static art in world coordinates. The camera moves over it at combat scale. */
export function drawOrganLandscape(ctx: CanvasRenderingContext2D, world: WorldGeometry, organ: OrganId): void {
  const lung = organ === 'lung', b = world.bounds, width = b.right - b.left, height = b.bottom - b.top;
  const g = ctx.createRadialGradient(world.width * .52, world.height * .46, 80, world.width * .5, world.height * .5, world.width * .8);
  g.addColorStop(0, lung ? '#34566c' : '#6a3142'); g.addColorStop(.65, lung ? '#1c344d' : '#321a30'); g.addColorStop(1, '#130f1d');
  ctx.fillStyle = g; ctx.fillRect(-100, -200, world.width + 200, world.height + 350);
  ctx.save(); ctx.shadowColor = '#090914'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 18;
  ctx.beginPath(); ctx.roundRect(b.left - 30, b.top - 30, width + 60, height + 60, 65);
  ctx.fillStyle = lung ? '#507b8b' : '#8c4857'; ctx.fill(); ctx.restore();
  const floor = ctx.createLinearGradient(0, b.top, 0, b.bottom);
  floor.addColorStop(0, lung ? '#2a485d' : '#452536'); floor.addColorStop(.5, lung ? '#345868' : '#613444'); floor.addColorStop(1, lung ? '#243b50' : '#3a2336');
  ctx.beginPath(); ctx.roundRect(b.left, b.top, width, height, 34); ctx.fillStyle = floor; ctx.fill(); ctx.strokeStyle = lung ? '#c3e0d555' : '#ebaf8b55'; ctx.lineWidth = 3; ctx.stroke();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 380; i++) {
    const x = b.left + random(i * 4 + 1) * width, y = b.top + random(i * 4 + 2) * height, r = 10 + random(i * 4 + 3) * 27;
    oval(ctx, x, y, r * (lung ? 1.3 : 1), r * .65, lung ? '#bad8c715' : '#e8a78b15', lung ? '#c5e0d51c' : '#efa98320');
    oval(ctx, x + r * .15, y - 3, r * .35, r * .22, '#13172a18');
  }
  for (let i = 0; i < 120; i++) {
    const y = b.top + i / 120 * height;
    ctx.beginPath(); ctx.moveTo(b.left, y); ctx.bezierCurveTo(width * .3, y + 50 * Math.sin(i), width * .7, y - 60, b.right, y + 12);
    ctx.strokeStyle = lung ? '#a7c7c10c' : '#f1b28b0c'; ctx.lineWidth = 1; ctx.stroke();
  }
  const config = getOrganDefinition(organ);
  // Wide flat paths connect purposeful districts; they do not pretend to collide.
  const hub = { x: world.width * .53, y: world.height * .59 };
  for (const point of [config.research, config.terminal, config.device, config.exit, config.tissue, ...config.sourcePositions]) {
    for (const [color, lineWidth] of [[lung ? '#182d42' : '#311b30', 45], [lung ? '#5d879055' : '#b5646755', 29], [lung ? '#c6e0cd26' : '#efb09226', 3]] as const) {
      ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.bezierCurveTo(point.x, hub.y, hub.x, point.y, hub.x, hub.y); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = 'round'; ctx.stroke();
    }
  }
  for (const region of config.regions) {
    oval(ctx, region.x, region.y, region.radius, region.radius * .66, lung ? '#a4d5ce06' : '#ecb28a06', lung ? '#c4e5d920' : '#eeb49520');
    ctx.font = '500 18px "Microsoft YaHei", sans-serif'; ctx.fillStyle = lung ? '#c5dfcf70' : '#f0c8ad70'; ctx.textAlign = 'center';
    ctx.fillText(region.label, region.x, region.y + region.radius * .58);
  }
  ctx.restore();
  for (let i = 0; i < Math.ceil(width / 125); i++) {
    const x = b.left + 30 + i * 125, y = b.top - 18, r = 48 + random(i + 33) * 28;
    oval(ctx, x, y - 24, r, lung ? r * 1.3 : r * .7, lung ? '#4f7489' : '#71374b', lung ? '#a9ccc54a' : '#d18d7845');
    oval(ctx, x - 7, y - 38, r * .6, r * .45, lung ? '#bdd7d010' : '#df9f8310');
  }
  for (let i = 0; i < Math.ceil(height / 85); i++) {
    const y = b.top + 35 + i * 85;
    for (const x of [b.left - 14, b.right + 14]) oval(ctx, x, y, 27, 40, lung ? '#466d81' : '#733b4e', lung ? '#b4d4cd35' : '#e1a18430');
  }
}
