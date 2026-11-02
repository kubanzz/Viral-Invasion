import { activeWorld, type GameState, type Target, type Vec } from '../game/types';

const TAU = Math.PI * 2;
const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));

/** Cleared-wave progress is cosmetic. Tissue health remains a separate authority. */
export function endlessRestoration(state: GameState): { progress: number; tissueRatio: number; tint: number } | null {
  if (!state.endless || !['playing', 'paused'].includes(state.phase)) return null;
  const progress = clamp((Number.isFinite(state.endless.clearedWaves) ? state.endless.clearedWaves : 0) / 5);
  const channels = [0xcf, 0xc3, 0xcb].map(channel => Math.round(channel + (255 - channel) * progress));
  return { progress, tissueRatio: clamp(state.tissue.hp / state.tissue.maxHp), tint: channels[0] * 65536 + channels[1] * 256 + channels[2] };
}

function curvePoint(points: readonly Vec[], value: number): Vec {
  const inverse = 1 - value;
  return {
    x: inverse ** 3 * points[0].x + 3 * inverse ** 2 * value * points[1].x + 3 * inverse * value ** 2 * points[2].x + value ** 3 * points[3].x,
    y: inverse ** 3 * points[0].y + 3 * inverse ** 2 * value * points[1].y + 3 * inverse * value ** 2 * points[2].y + value ** 3 * points[3].y,
  };
}

/** A bounded ground pass, below actors and danger geometry; particles never represent units. */
export function drawEndlessRestoration(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false): void {
  const restoration = endlessRestoration(state);
  if (!restoration) return;
  const { progress } = restoration, { bounds } = activeWorld(state), tissue = state.tissue;
  const time = state.visualTime ?? state.elapsed, width = bounds.right - bounds.left;
  ctx.save();
  // Muted tissue gradually regains its original warm colour. This does not grade
  // sprites, damage telegraphs, labels or the actual tissue-health indicator.
  ctx.fillStyle = `rgba(79,76,97,${(1 - progress) * .10})`;
  ctx.fillRect(bounds.left, bounds.top, width, bounds.bottom - bounds.top);
  const glow = ctx.createRadialGradient(tissue.x, tissue.y, 35, tissue.x, tissue.y, 450);
  glow.addColorStop(0, `rgba(194,239,204,${progress * .15})`); glow.addColorStop(1, '#d7efd000');
  ctx.fillStyle = glow; ctx.fillRect(tissue.x - 450, tissue.y - 450, 900, 900);
  for (let channel = 0; channel < 3; channel++) {
    const offset = (channel - 1) * 215;
    const y = clamp(tissue.y + offset, bounds.top + 100, bounds.bottom - 100);
    const points = [{ x: bounds.left - 40, y: y - 100 }, { x: bounds.left + width * .38, y: y + 165 },
      { x: bounds.left + width * .62, y: y - 165 }, { x: bounds.right + 40, y: y + 100 }];
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    ctx.bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y);
    ctx.lineCap = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = `rgba(222,139,140,${.025 + progress * .075})`; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(104,161,139,${.025 + progress * .15})`; ctx.stroke();
    if (!lowEffects) for (let index = 0; index < 6; index++) {
      const phase = ((index / 6 + channel * .11 + time * (.014 + progress * .018)) % 1 + 1) % 1;
      const point = curvePoint(points, phase);
      ctx.beginPath(); ctx.ellipse(point.x, point.y, 3.8, 2.5, .1, 0, TAU);
      ctx.fillStyle = `rgba(215,124,125,${.06 + progress * .22})`; ctx.fill();
    }
  }
  const fifthClear = progress === 1 ? [...state.events].reverse().find(event => event.type === 'ENDLESS_WAVE_CLEARED' && event.data.wave === 5) : undefined;
  const age = fifthClear ? state.elapsed - fifthClear.tick / 60 : Infinity;
  if (!lowEffects && age >= 0 && age < 2.2) {
    const amount = age / 2.2;
    ctx.globalAlpha = (1 - amount) * .55; ctx.strokeStyle = '#e6f3cb'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(tissue.x, tissue.y, 70 + amount * 440, 70 + amount * 440, 0, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

export interface CombatReceiptGroup extends Vec { count: number; strength: number; radius: number }
export interface CombatReceiptFeedback { hits: CombatReceiptGroup[]; kills: CombatReceiptGroup[] }

/** Only accepted positive damage and matching real deaths can create feedback. */
export function combatReceiptFeedback(state: GameState, lowEffects = false): CombatReceiptFeedback {
  const result: CombatReceiptFeedback = { hits: [], kills: [] };
  if (!state.endless || !['playing', 'paused'].includes(state.phase)) return result;
  const targets = new Map(state.targets.map(target => [target.id, target]));
  const collect = (kind: 'hits' | 'kills', duration: number, cap: number) => {
    const groups = new Map<string, CombatReceiptGroup>();
    const targetIds = new Set<string>();
    for (let index = state.events.length - 1; index >= 0; index--) {
      const event = state.events[index], age = state.elapsed - event.tick / 60;
      if (age < 0 || age >= duration || (kind === 'hits' ? event.type !== 'TARGET_HIT' || !Number.isFinite(event.data.damage) || !(Number(event.data.damage) > 0) : event.type !== 'TARGET_CLEARED')) continue;
      const target = targets.get(String(event.data.id));
      if (!target || targetIds.has(target.id) || target.role === 'event' || ![target.x, target.y, target.radius].every(Number.isFinite)
        || kind === 'kills' && (target.hp > 0 || target.deadAt === undefined)) continue;
      targetIds.add(target.id);
      const key = `${Math.floor(target.x / 96)}:${Math.floor(target.y / 96)}`;
      const group = groups.get(key);
      if (group) {
        group.x = (group.x * group.count + target.x) / (group.count + 1); group.y = (group.y * group.count + target.y) / (group.count + 1);
        group.count++; group.strength = Math.max(group.strength, 1 - age / duration); group.radius = Math.max(group.radius, target.radius);
      } else if (groups.size < cap) groups.set(key, { x: target.x, y: target.y, count: 1, strength: 1 - age / duration, radius: target.radius });
    }
    result[kind] = [...groups.values()];
  };
  collect('hits', .14, lowEffects ? 4 : 12);
  collect('kills', .3, lowEffects ? 0 : 6);
  return result;
}

export function drawCombatReceiptFeedback(ctx: CanvasRenderingContext2D, state: GameState, lowEffects = false): void {
  const feedback = combatReceiptFeedback(state, lowEffects);
  for (const hit of feedback.hits) {
    ctx.save(); ctx.globalAlpha = hit.strength; ctx.strokeStyle = '#fff4cf'; ctx.lineWidth = 2;
    const size = 5 + Math.min(3, hit.count);
    ctx.beginPath(); ctx.moveTo(hit.x - size, hit.y - size); ctx.lineTo(hit.x + size, hit.y + size);
    ctx.moveTo(hit.x + size, hit.y - size); ctx.lineTo(hit.x - size, hit.y + size); ctx.stroke(); ctx.restore();
  }
  for (const kill of feedback.kills) {
    ctx.save(); ctx.globalAlpha = kill.strength * .75; ctx.strokeStyle = '#d5f7be'; ctx.lineWidth = 2;
    const spread = 10 + (1 - kill.strength) * 24;
    for (let index = 0; index < 4; index++) {
      const angle = index / 4 * TAU + .4;
      ctx.beginPath(); ctx.moveTo(kill.x + Math.cos(angle) * spread, kill.y + Math.sin(angle) * spread);
      ctx.lineTo(kill.x + Math.cos(angle) * (spread + 7), kill.y + Math.sin(angle) * (spread + 7)); ctx.stroke();
    }
    ctx.restore();
  }
}

/** A short removal pose uses a real death timestamp, never an attack request. */
export function endlessDeathPose(target: Target, state: GameState, lowEffects: boolean): { scale: number; alpha: number } | null {
  if (!state.endless || !['playing', 'paused'].includes(state.phase) || target.hp > 0 || target.deadAt === undefined || !['virus', 'elite'].includes(target.role ?? '')) return null;
  const age = state.elapsed - target.deadAt;
  if (age < 0 || age >= .18 || lowEffects) return { scale: 1, alpha: 0 };
  const amount = age / .18;
  return { scale: 1 - amount * .28, alpha: (1 - amount) * .75 };
}
