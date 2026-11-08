import { BLADE_TECHNIQUES } from '../game/bladeTechniques';
import { BALANCE, type GameState } from '../game/types';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export interface BladeCinematicView {
  active: boolean; phase: 'hidden' | 'focus' | 'eyes-open' | 'draw'; eyeOpen: number; elapsed: number;
  duration: number; draw: number; manual: boolean; lowEffects: boolean; reducedMotion: boolean;
  scope: 'trial' | 'battle'; rect: { left: number; top: number; right: number; bottom: number };
}
/** Entirely simulation-timed: pausing or changing scenes cannot leave an old cut-in running. */
export function bladeCinematicView(state: GameState, width: number, height: number, lowEffects = false, reducedMotion = false, scope: 'trial' | 'battle' = 'battle'): BladeCinematicView {
  const trace = state.weaponCombat?.bladeTrace, duration = BLADE_TECHNIQUES.trace.windup;
  const time = state.phase === 'playing' ? state.visualTime ?? state.elapsed : state.elapsed;
  const elapsed = trace?.phase === 'windup' ? Math.max(0, Math.min(duration, time - (trace.windupStartedAt ?? time))) : 0;
  const eyeOpen = .035 + .965 * smooth(.30, .46, elapsed), draw = smooth(.43, .62, elapsed);
  const w = Math.min(1000, width * .94), h = Math.min(300, height * .62);
  return { active: !!trace && trace.phase === 'windup' && state.phase !== 'menu' && state.phase !== 'result' && state.player.hp > 0,
    phase: !trace || trace.phase !== 'windup' ? 'hidden' : elapsed < .30 ? 'focus' : elapsed < .47 ? 'eyes-open' : 'draw',
    eyeOpen, elapsed, duration, draw, manual: trace?.manual ?? false, lowEffects, reducedMotion, scope,
    rect: { left: (width - w) / 2, right: (width + w) / 2, top: (height - h) / 2, bottom: (height + h) / 2 } };
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke?: string): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function line(ctx: CanvasRenderingContext2D, points: number[], color: string, width: number): void {
  ctx.beginPath(); ctx.moveTo(points[0], points[1]); for (let n = 2; n < points.length; n += 2) ctx.lineTo(points[n], points[n + 1]);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
/** Illustration of the existing cream medic helmet, mint eyes and armoured hands.
 * Eye shapes are an explicit screen graphic; the source model has no eyelid rig. */
function medicPortrait(ctx: CanvasRenderingContext2D, eyeOpen: number, draw: number): void {
  ctx.save(); ctx.translate(250 - draw * 10, 145 - draw * 9); ctx.rotate(-.10 + draw * .045); ctx.lineWidth = 3;
  const shell = ctx.createLinearGradient(-110, -130, 80, 100); shell.addColorStop(0, '#fff6e5'); shell.addColorStop(.40, '#ead8bb'); shell.addColorStop(.8, '#c0ad95'); shell.addColorStop(1, '#fff3d4');
  const mint = ctx.createLinearGradient(-100, 100, 90, 230); mint.addColorStop(0, '#b7d7bc'); mint.addColorStop(1, '#4b8b7a');
  ellipse(ctx, 0, 156, 136, 87, '#273f43', '#9fb6a2');
  ellipse(ctx, -103, 140, 50, 53, mint, '#72988a'); ellipse(ctx, 103, 140, 50, 53, mint, '#72988a');
  ctx.fillStyle = shell; ctx.strokeStyle = '#a78d70'; ctx.beginPath(); ctx.moveTo(-73, 112); ctx.quadraticCurveTo(0, 81, 73, 112); ctx.lineTo(64, 215); ctx.quadraticCurveTo(0, 247, -64, 215); ctx.closePath(); ctx.fill(); ctx.stroke();
  ellipse(ctx, 0, 162, 31, 43, '#7eae96', '#e1e6c7'); ellipse(ctx, 0, 163, 11, 26, '#b9efc3');
  ellipse(ctx, -103, 15, 29, 49, shell, '#9a826a'); ellipse(ctx, 103, 15, 29, 49, shell, '#9a826a');
  ctx.fillStyle = shell; ctx.strokeStyle = '#9c8167'; ctx.beginPath();
  ctx.moveTo(-110, 33); ctx.bezierCurveTo(-132, -91, -77, -140, 0, -150); ctx.bezierCurveTo(82, -144, 132, -87, 111, 36);
  ctx.quadraticCurveTo(107, 98, 0, 107); ctx.quadraticCurveTo(-103, 100, -110, 33); ctx.fill(); ctx.stroke();
  line(ctx, [-78, -115, -47, -65, -41, -20], '#b8a58c', 2); line(ctx, [80, -115, 49, -65, 43, -20], '#b8a58c', 2);
  ctx.fillStyle = '#74aa91'; ctx.strokeStyle = '#5c917c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-10, -109, 20, 54, 4); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.roundRect(-27, -92, 54, 20, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#25434a'; ctx.strokeStyle = '#a98e73'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-82, -27); ctx.quadraticCurveTo(-72, -49, -38, -39); ctx.quadraticCurveTo(0, -29, 38, -39); ctx.quadraticCurveTo(75, -48, 85, -24); ctx.quadraticCurveTo(103, 52, 56, 70); ctx.quadraticCurveTo(0, 91, -57, 69); ctx.quadraticCurveTo(-100, 51, -82, -27); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.shadowBlur = 17 * eyeOpen; ctx.shadowColor = '#b9ffd6';
  for (const side of [-1, 1]) {
    const x = side * 40, h = 25 * eyeOpen;
    ctx.fillStyle = '#bcffcf'; ctx.beginPath(); ctx.moveTo(x - 18, 16 + side * 4); ctx.quadraticCurveTo(x, 11 - h, x + 18, 16 - side * 4); ctx.quadraticCurveTo(x + 5, 19 + h, x - 18, 16 + side * 4); ctx.fill();
    if (eyeOpen > .3) ellipse(ctx, x - 4, 10, 4, Math.max(1, h * .35), '#f1ffe8');
  }
  ctx.restore(); line(ctx, [-68, 56, -31, 65, 34, 65, 69, 53], '#91bdad55', 1.5);
  // Braced left glove, right glove drawing a long warm blade across the foreground.
  ctx.save(); ctx.translate(-5 + draw * 175, 167 - draw * 34); ctx.rotate(-.34 - draw * .13);
  ctx.fillStyle = '#315057'; ctx.beginPath(); ctx.roundRect(-64, -12, 122, 24, 9); ctx.fill();
  line(ctx, [-52, 0, 44, 0], '#9ca98c', 8); for (let n = 0; n < 5; n++) line(ctx, [-47 + n * 16, -9, -40 + n * 16, 9], '#e3d9ba', 3);
  line(ctx, [54, -31, 54, 30], '#d3aa6b', 10); line(ctx, [55, -27, 55, 25], '#fff4c7', 3);
  ctx.fillStyle = shell; ctx.strokeStyle = '#9e876b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-22, -23, 62, 44, 15); ctx.fill(); ctx.stroke();
  for (let n = 0; n < 3; n++) line(ctx, [-5 + n * 12, -18, -1 + n * 12, 13], '#baaa8a', 2);
  const length = 40 + draw * 450;
  const blade = ctx.createLinearGradient(50, -10, 50, 12); blade.addColorStop(0, '#a64f47'); blade.addColorStop(.35, '#ffd390'); blade.addColorStop(.5, '#ffffe3'); blade.addColorStop(1, '#c86953');
  ctx.fillStyle = blade; ctx.beginPath(); ctx.moveTo(62, -12); ctx.lineTo(62 + length, -12 - draw * 9); ctx.lineTo(89 + length, -5); ctx.lineTo(62, 15); ctx.closePath(); ctx.fill();
  if (draw > .2) line(ctx, [68, -11, 60 + length, -13], '#fffbe6', 2.5);
  ctx.restore(); ctx.restore();
}
export function drawBladeCinematic(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number,
  lowEffects = false, reducedMotion = false, scope: 'trial' | 'battle' = 'battle'): BladeCinematicView {
  const view = bladeCinematicView(state, width, height, lowEffects, reducedMotion, scope);
  if (!view.active) return view;
  const p = view.elapsed, r = view.rect, w = r.right - r.left, h = r.bottom - r.top;
  const enter = reducedMotion ? 1 : smooth(0, .09, p), exit = 1 - smooth(.59, .65, p);
  ctx.save(); ctx.fillStyle = '#102b30'; ctx.globalAlpha = .18 * enter * exit; ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = enter * exit; ctx.translate(r.left + (reducedMotion ? 0 : (1 - enter) * -70), r.top);
  ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(w - 30, 0); ctx.lineTo(w, h - 30); ctx.lineTo(30, h); ctx.closePath(); ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#123e42'); bg.addColorStop(.55, '#19343b'); bg.addColorStop(1, '#612e3d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const scale = h / 320;
  if (!lowEffects) {
    ctx.strokeStyle = '#c8dfb426'; ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) { const y = (i * 31 + p * (reducedMotion ? 0 : 260)) % (h + 60) - 30; line(ctx, [w * .36, y + 45, w, y - 30], i % 3 ? '#f1d59916' : '#d65d5833', i % 3 ? 1 : 3); }
  }
  ctx.save(); ctx.translate(w * .03, h * .04); ctx.scale(scale, scale); medicPortrait(ctx, view.eyeOpen, view.draw); ctx.restore();
  const titleX = w * .62, titleY = h * .45;
  ctx.textAlign = 'center'; ctx.fillStyle = '#f8ebc6'; ctx.font = `bold ${Math.min(h * .22, w * .07)}px KaiTi,"Microsoft YaHei",serif`;
  ctx.shadowColor = '#df9960'; ctx.shadowBlur = lowEffects ? 0 : 8; ctx.fillText('四曜穿心', titleX, titleY); ctx.shadowBlur = 0;
  ctx.font = `${Math.max(11, h * .07)}px "Microsoft YaHei",sans-serif`; ctx.fillStyle = '#c0d1b8';
  ctx.fillText(view.manual ? '手绘共鸣 · 极限贯穿' : '四曜锁定 · 一线贯穿', titleX, titleY + h * .15);
  for (let i = 0; i < 4; i++) {
    const x = titleX + (i - 1.5) * h * .16, y = h * .15, size = h * .018;
    ctx.fillStyle = '#f8d88f'; ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y); ctx.closePath(); ctx.fill();
  }
  const reflection = smooth(.30, .47, p);
  if (reflection > 0 && reflection < 1 && !lowEffects) {
    ctx.globalAlpha = Math.sin(reflection * Math.PI) * .6; line(ctx, [0, h * .38, w * .48, h * .32], '#d9ffdf', 3); ctx.globalAlpha = enter * exit;
  }
  ctx.restore();
  return view;
}
export function drawBladeReleaseAccent(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number, lowEffects = false): void {
  if (!state.weaponCombat?.bladeTrace || state.phase === 'menu' || state.phase === 'result') return;
  const time = state.phase === 'playing' ? state.visualTime ?? state.elapsed : state.elapsed;
  const event = [...state.events].reverse().find(event => event.type === 'BLADE_TRACE_RELEASED');
  if (!event) return; const age = time - event.tick * BALANCE.step;
  if (age < 0 || age > .13) return;
  ctx.save(); ctx.globalAlpha = (1 - age / .13) * (lowEffects ? .4 : .8);
  line(ctx, [width * .09, height * .71, width * .91, height * .23], '#903949', lowEffects ? 7 : 15);
  line(ctx, [width * .09, height * .71, width * .91, height * .23], '#fff4cf', 2); ctx.restore();
}
