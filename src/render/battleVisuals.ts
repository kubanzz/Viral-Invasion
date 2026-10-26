import type { TraitId } from '../game/battleTypes';
import type { GameState, Target } from '../game/types';
import { BATTLE_BALANCE } from '../game/battleConfig';

const TAU = Math.PI * 2;

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke?: string): void {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, TAU);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function line(ctx: CanvasRenderingContext2D, points: number[], color: string, width = 1): void {
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 10): void {
  ctx.font = `500 ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(value, x, y);
}

/** All three branches use genuinely different outer paths, including in monochrome. */
export function traceVirusOutline(ctx: CanvasRenderingContext2D, trait: TraitId | undefined, radius: number): void {
  const r = radius;
  ctx.beginPath();
  if (trait === 'CARAPACE') {
    const points = [-1.05, .15, -1.3, -.23, -.82, -.52, -.88, -1.12, -.35, -.85, -.03, -1.38, .35, -.91, .86, -1.05, .85, -.46, 1.28, -.17, .95, .25, 1.08, .73, .45, .81, .13, 1.03, -.31, .81, -.91, .85];
    ctx.moveTo(points[0] * r, points[1] * r);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i] * r, points[i + 1] * r);
  } else if (trait === 'FISSION') {
    ctx.moveTo(-1.02 * r, .15 * r);
    ctx.bezierCurveTo(-1.55 * r, -.56 * r, -.86 * r, -1.3 * r, -.12 * r, -.78 * r);
    ctx.bezierCurveTo(.41 * r, -1.4 * r, 1.38 * r, -.95 * r, 1.07 * r, -.12 * r);
    ctx.bezierCurveTo(1.55 * r, .5 * r, .85 * r, 1.21 * r, .21 * r, .79 * r);
    ctx.bezierCurveTo(-.32 * r, 1.3 * r, -1.5 * r, .92 * r, -1.02 * r, .15 * r);
  } else if (trait === 'MIMIC') {
    ctx.moveTo(-1.68 * r, .48 * r);
    ctx.bezierCurveTo(-.88 * r, .07 * r, -1.03 * r, -.7 * r, -.36 * r, -.96 * r);
    ctx.bezierCurveTo(.51 * r, -1.24 * r, 1.24 * r, -.62 * r, 1.02 * r, .09 * r);
    ctx.bezierCurveTo(.85 * r, .83 * r, .28 * r, 1.03 * r, -.22 * r, .74 * r);
    ctx.bezierCurveTo(-.83 * r, .52 * r, -1.03 * r, .88 * r, -1.68 * r, .48 * r);
  } else {
    for (let i = 0; i <= 48; i++) {
      const angle = i / 48 * TAU, length = r * (1 + Math.sin(angle * 8) * .11);
      const x = Math.cos(angle) * length, y = Math.sin(angle) * length * .86;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

const TRAIT_NAME: Record<TraitId, string> = { CARAPACE: '晶壳', FISSION: '裂殖', MIMIC: '潜伏' };

/** Drawn in the same Y-sorted world layer as every other actor. */
export function drawBattleTarget(ctx: CanvasRenderingContext2D, target: Target, state: GameState): void {
  const t = state.elapsed, r = target.radius;
  const trait = target.traits?.[0];
  const exposed = (target.exposedUntil ?? 0) > t;
  const traced = state.growth?.marks.some(mark => mark.targetId === target.id && mark.organId === state.battle?.organId && mark.until > t) ?? false;
  const revealed = (target.revealedUntil ?? 0) > t || exposed || state.scanUntil > t || traced;
  const mimic = target.traits?.includes('MIMIC') && !revealed;
  const source = target.role === 'source';
  const elite = target.role === 'elite' || target.role === 'core';
  ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);

  if (target.hp <= 0) {
    const progress = Math.min(1, Math.max(0, (t - (target.deadAt ?? t - 1)) / .6));
    ctx.globalAlpha = (1 - progress) * .8;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      ellipse(ctx, Math.cos(a) * r * progress, -12 + Math.sin(a) * r * progress, 4 * (1 - progress) + 1, 3, '#e5f5b6');
    }
    ctx.globalAlpha = .32;
    ellipse(ctx, 0, 0, r * .6, 5, '#a2e9ba21', '#a2e9ba44');
    if (source) { ctx.globalAlpha = .75; label(ctx, '✓ 感染源已净化', 0, 25, '#b8dcc2', 10); }
    ctx.restore(); return;
  }

  // A hidden mimic remains a hittable, tissue-shaped body; periodic ripples betray it.
  if (mimic) {
    const age = (t - (target.born ?? 0)) % BATTLE_BALANCE.mimicPeriod;
    if (age < BATTLE_BALANCE.mimicDisturbance) {
      const ripple = age / BATTLE_BALANCE.mimicDisturbance;
      ctx.globalAlpha = (1 - ripple) * .8;
      ellipse(ctx, 0, 0, r + ripple * 35, (r + ripple * 35) * .47, '#00000000', '#e9c3a4');
      label(ctx, '≈', 0, -r * 1.5 - 12, '#f4d1ad', 18);
      ctx.globalAlpha = 1;
    }
  }

  if (source) {
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU, x = Math.cos(a) * r * 1.1, y = Math.sin(a) * r * .4;
      line(ctx, [0, -5, x * .7, y - 11, x, y + 4], '#d273715c', 5);
      ellipse(ctx, x, y + 3, 8, 4, '#af6870', '#e5aa8b');
    }
    ellipse(ctx, 0, 0, r * 1.23, r * .4, '#6c304c', '#dc9c7e');
  }

  const bob = source ? Math.sin(t * 2) * 1.2 : Math.sin(t * 5 + target.x) * 2;
  const telegraph = (target.attackAt ?? 0) > t;
  ctx.save(); ctx.translate(0, -r * .8 + bob);
  if (elite) {
    const crownY = -r * 1.08;
    ctx.beginPath(); ctx.moveTo(-r * .58, crownY + 4); ctx.lineTo(-r * .7, crownY - 11);
    ctx.lineTo(-r * .18, crownY - 4); ctx.lineTo(0, crownY - 18); ctx.lineTo(r * .2, crownY - 4);
    ctx.lineTo(r * .67, crownY - 10); ctx.lineTo(r * .56, crownY + 5); ctx.closePath();
    ctx.fillStyle = '#f0c993'; ctx.fill(); ctx.strokeStyle = '#542b43'; ctx.lineWidth = 2; ctx.stroke();
  }

  const body = ctx.createLinearGradient(-r, -r, r, r);
  body.addColorStop(0, target.hitUntil > t ? '#fff2c5' : mimic ? '#b17d7a' : trait === 'CARAPACE' ? '#b997c3' : trait === 'FISSION' ? '#f1b077' : '#ed8a87');
  body.addColorStop(.55, mimic ? '#805663' : trait === 'CARAPACE' ? '#785c9b' : '#ba5c73');
  body.addColorStop(1, '#633a58');
  traceVirusOutline(ctx, trait, r); ctx.fillStyle = body; ctx.fill();
  ctx.strokeStyle = revealed && target.traits?.includes('MIMIC') ? '#9cf2e8' : '#3b203d'; ctx.lineWidth = revealed ? 2.5 : 2; ctx.stroke();

  if (trait === 'CARAPACE') {
    const facing = target.facing ?? 0;
    ctx.save(); ctx.rotate(Math.atan2(Math.sin(facing) * .72, Math.cos(facing)));
    if (!exposed) {
      // The thick jagged front and a cut-out at the rear communicate directional armour.
      for (let i = -1; i <= 1; i++) {
        const a = i * .61;
        ctx.beginPath(); ctx.moveTo(r * .28, 0); ctx.lineTo(Math.cos(a - .35) * r * .85, Math.sin(a - .35) * r * .85);
        ctx.lineTo(Math.cos(a) * r * 1.16, Math.sin(a) * r * 1.16);
        ctx.lineTo(Math.cos(a + .35) * r * .85, Math.sin(a + .35) * r * .85); ctx.closePath();
        ctx.fillStyle = '#c8b3d0'; ctx.fill(); ctx.strokeStyle = '#ead7d8a8'; ctx.lineWidth = 1; ctx.stroke();
      }
    } else {
      line(ctx, [r * .56, -r * .8, r * .84, -r * 1.05], '#fff4bf', 3);
      line(ctx, [r * .72, r * .65, r * 1.04, r * .88], '#fff4bf', 3);
    }
    ctx.restore();
    ellipse(ctx, -.15 * r, .09 * r, r * .39, r * .43, exposed ? '#ffd68e' : '#d6a4a0', '#e9c5a0');
    if (exposed) line(ctx, [-r * .4, -r * .2, -r * .14, r * .1, r * .1, -r * .22], '#fff7c9', 3);
  } else if (trait === 'FISSION') {
    ellipse(ctx, -r * .48, -r * .23, r * .35, r * .4, '#ffd4a986', '#f4c18e');
    ellipse(ctx, r * .43, -r * .14, r * .32, r * .35, '#fbc4c483', '#f4b6b4');
    ellipse(ctx, 0, r * .42, r * .28, r * .26, '#ffdf9b77', '#f2d6a3');
    line(ctx, [0, -r * .66, -r * .17, -r * .27, r * .15, r * .08, -.12 * r, r * .45, .13 * r, .73 * r], '#572541', 2.5);
    if ((target.generation ?? 0) === 0) label(ctx, 'Ⅱ', r * .65, r * .68, '#ffedc2', 11);
  } else if (trait === 'MIMIC') {
    for (let i = 0; i < 3; i++) ellipse(ctx, (i - 1) * r * .42, Math.sin(i * 2) * r * .23, r * .34, r * .2, mimic ? '#b28b8044' : '#bddcce44', '#dfbca76b');
    if (revealed) {
      ctx.setLineDash([4, 3]); ellipse(ctx, 0, 0, r * 1.1, r * 1.08, '#00000000', '#b5fbeb'); ctx.setLineDash([]);
      line(ctx, [-r * .3, -r * .2, r * .2, r * .1, -.06 * r, r * .45], '#c2ffef', 2);
    }
  } else {
    ellipse(ctx, -3, -r * .35, r * .57, r * .23, '#ffdfb947');
    ellipse(ctx, 0, 3, r * .43, r * .44, '#f7b38955', '#f4b27d77');
  }

  if (!mimic) {
    const pupilX = Math.cos(target.facing ?? 0) * 1.3;
    ellipse(ctx, -r * .27, -3, telegraph ? 4 : 3, telegraph ? 2 : 4, '#2e1e38');
    ellipse(ctx, r * .25, -3, telegraph ? 4 : 3, telegraph ? 2 : 4, '#2e1e38');
    ellipse(ctx, -r * .27 + pupilX, -4, 1, 1, '#fff1c1'); ellipse(ctx, r * .25 + pupilX, -4, 1, 1, '#fff1c1');
    if (telegraph) label(ctx, '!', 0, -r * .88, '#ffdf9f', 16);
  }
  ctx.restore();

  // Every actor retains its exact ground anchor, even while its body disguises.
  ctx.lineWidth = 1; ellipse(ctx, 0, 1, 9, 4, '#f1ca8b0b', mimic ? '#d9ab8c55' : '#efc69aa0');
  ctx.restore();
}

const TRAIT_SYMBOL: Record<TraitId, string> = { CARAPACE: '◇', FISSION: '⋈', MIMIC: '◌' };
type LabelBox = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: LabelBox, b: LabelBox): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Information floats above entities; ordinary names cannot drown an elite or weakness. */
export function drawBattleLabels(ctx: CanvasRenderingContext2D, state: GameState): void {
  const time = state.elapsed, aim = state.battle?.lastAim;
  const aimed = (target: Target): boolean => !!aim && Math.hypot(target.x - aim.x, target.y - aim.y) <= target.radius + 12;
  const priority = (target: Target): number => target.role === 'core' ? 0 : target.role === 'elite' ? 1 : target.role === 'source' ? 2 : aimed(target) ? 3 : 4;
  const targets = state.targets.filter(target => target.hp > 0).sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
  const occupied: LabelBox[] = [];
  for (const target of targets) {
    const full = target.role === 'source' || target.role === 'elite' || target.role === 'core';
    const exposed = (target.exposedUntil ?? 0) > time;
    const traced = state.growth?.marks.some(mark => mark.targetId === target.id && mark.organId === state.battle?.organId && mark.until > time) ?? false;
    const mimic = target.traits?.includes('MIMIC') && (target.revealedUntil ?? 0) <= time && state.scanUntil <= time && !exposed && !traced;
    if (mimic) continue;
    const focused = aimed(target), bar = full || focused || target.hitUntil > time;
    const symbols = target.traits?.map(id => TRAIT_SYMBOL[id]).join('') ?? '';
    if (!full && !bar && (!symbols || !target.scanned)) continue;
    const role = target.role === 'core' ? '母巢' : target.role === 'elite' ? '精英' : '感染源';
    const name = full ? `${role}${target.traits?.length ? ' · ' + target.traits.map(id => TRAIT_NAME[id]).join('·') : ''}` : symbols;
    const width = Math.max(target.radius * 2, name.length * 10 + 10), baseY = -target.radius * 1.96 - (target.role === 'elite' || target.role === 'core' ? 17 : 7);
    const offsets = full || focused ? [0, -16, -32, -48, -64] : [0, -14];
    let chosen: number | undefined;
    for (const offset of offsets) {
      const box = { left: target.x - width / 2 - 4, right: target.x + width / 2 + 4, top: target.y * .72 + baseY + offset - 18, bottom: target.y * .72 + baseY + offset + 7 };
      if (!occupied.some(other => overlaps(other, box))) { occupied.push(box); chosen = offset; break; }
    }
    // Bodies retain their distinct silhouette, so an obscured ordinary badge can
    // yield its tiny area to the clinically useful labels above it.
    if (chosen === undefined && !full && !focused) continue;
    const offset = chosen ?? -64;
    ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
    if (offset < -5) line(ctx, [0, baseY - 2, 0, baseY + offset + 5], '#d1c3aa59', 1);
    const y = baseY + offset;
    if (bar) {
      ctx.fillStyle = '#21182ce0'; ctx.beginPath(); ctx.roundRect(-target.radius, y, target.radius * 2, full ? 5 : 3, 2); ctx.fill();
      ctx.fillStyle = exposed ? '#ffe4a1' : '#f2bd9c';
      ctx.beginPath(); ctx.roundRect(-target.radius, y, Math.max(1, target.radius * 2 * target.hp / target.maxHp), full ? 5 : 3, 2); ctx.fill();
    }
    if (name) {
      ctx.font = `500 ${full ? 10 : 11}px "Microsoft YaHei", "Segoe UI", sans-serif`; ctx.textAlign = 'center';
      ctx.strokeStyle = '#241b2ce0'; ctx.lineWidth = 3; ctx.strokeText(name, 0, y - 7);
      ctx.fillStyle = full ? '#f4dcc2' : '#e6d0b9'; ctx.fillText(name, 0, y - 7);
    }
    ctx.restore();
  }

  const groups: Target[][] = [];
  for (const target of targets.filter(target => (target.exposedUntil ?? 0) > time)) {
    const group = groups.find(items => Math.hypot(items[0].x - target.x, items[0].y - target.y) < 65);
    if (group) group.push(target); else groups.push([target]);
  }
  for (const group of groups) {
    const target = group[0], seconds = Math.ceil(Math.min(...group.map(item => item.exposedUntil!)) - time);
    ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
    const value = `◇ 破绽 ${seconds}s${group.length > 1 ? ` ×${group.length}` : ''}`;
    ctx.font = '500 11px "Microsoft YaHei", "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#241b2cf0'; ctx.lineWidth = 4; ctx.strokeText(value, 0, 23);
    ctx.fillStyle = '#ffe6b0'; ctx.fillText(value, 0, 23); ctx.restore();
  }
}
