import type { Vec } from '../game/types';

export interface LabelRect { left: number; right: number; top: number; bottom: number }
export interface SceneLabelLine { text: string; color?: string; size?: number }
export interface SceneLabel {
  id: string; anchor: Vec; offset?: Vec; priority: number; essential?: boolean;
  lines: readonly SceneLabelLine[];
  bar?: { ratio: number; color: string; width?: number };
}
export interface SceneLabelSink {
  add(label: SceneLabel): void;
  reserveWorld?(rect: LabelRect): void;
}
export interface SceneLabelFrame {
  width: number; height: number; project: (point: Vec) => Vec; scale: number;
  blocked?: readonly LabelRect[]; scope: string;
}
export interface SceneLabelPlacement {
  id: string; priority: number; essential: boolean; rect: LabelRect; anchor: Vec;
  baseline: Vec; compact: boolean; fallback: boolean; conflicted: boolean;
  leader?: { from: Vec; to: Vec };
}
export interface SceneLabelDiagnostics {
  requested: number; placed: number; omitted: number; offscreen: number; conflicted: number;
  measureCacheSize: number; placementCacheSize: number; placements: SceneLabelPlacement[];
}
interface MeasuredLine { text: string; color: string; size: number; y: number }
interface Measured { width: number; top: number; bottom: number; lines: MeasuredLine[]; bar?: { width: number; y: number; ratio: number; color: string; height: number } }
interface Choice { baseline: Vec; rect: LabelRect; dx: number; dy: number; compact: boolean; fallback: boolean; cost: number }
const FONT = '"Microsoft YaHei", "Segoe UI", sans-serif';
const MARGIN = 6, GAP = 4, MEASURE_LIMIT = 256, PLACEMENT_LIMIT = 128;
const clamp = (value: number, min: number, max: number) => min > max ? (min + max) / 2 : Math.max(min, Math.min(max, value));
const finiteRect = (rect: LabelRect) => [rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite) && rect.right > rect.left && rect.bottom > rect.top;
const overlapArea = (a: LabelRect, b: LabelRect) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const padded = (rect: LabelRect, amount: number): LabelRect => ({ left: rect.left - amount, right: rect.right + amount, top: rect.top - amount, bottom: rect.bottom + amount });
const font = (size: number) => `500 ${size}px ${FONT}`;
/** Parametric first entry into a rectangle, including a start already inside. */
function segmentEntry(from: Vec, to: Vec, rect: LabelRect): number | null {
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [[from.x, to.x - from.x, rect.left, rect.right], [from.y, to.y - from.y, rect.top, rect.bottom]]) {
    if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return null; continue; }
    const a = (min - start) / delta, b = (max - start) / delta;
    low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
    if (low > high) return null;
  }
  return low;
}

/** Presentation-only bounded layout. Anchor and hazard coordinates never change. */
export class SceneLabels implements SceneLabelSink {
  private frame: SceneLabelFrame | undefined;
  private labels = new Map<string, SceneLabel>();
  private blocked: LabelRect[] = [];
  private previous = new Map<string, { dx: number; dy: number; compact: boolean; fallback: boolean }>();
  private measurements = new Map<string, { width: number; ascent: number; descent: number }>();
  private result: SceneLabelDiagnostics = this.emptyDiagnostics();

  private emptyDiagnostics(): SceneLabelDiagnostics { return { requested: 0, placed: 0, omitted: 0, offscreen: 0, conflicted: 0, measureCacheSize: this.measurements?.size ?? 0, placementCacheSize: this.previous?.size ?? 0, placements: [] }; }
  begin(frame: SceneLabelFrame): void {
    if (!this.frame || frame.scope !== this.frame.scope || frame.width !== this.frame.width || frame.height !== this.frame.height) this.previous.clear();
    this.frame = { ...frame, width: Math.max(1, frame.width), height: Math.max(1, frame.height), scale: Number.isFinite(frame.scale) && frame.scale > 0 ? frame.scale : 1 };
    this.labels.clear(); this.blocked = (frame.blocked ?? []).filter(finiteRect).map(rect => ({ ...rect })); this.result = this.emptyDiagnostics();
  }
  add(label: SceneLabel): void {
    if (!this.frame || !label.id || !Number.isFinite(label.anchor.x) || !Number.isFinite(label.anchor.y) || !Number.isFinite(label.priority)) return;
    if (!label.lines.some(line => line.text) && !label.bar) return;
    this.labels.set(label.id, { ...label, anchor: { ...label.anchor }, offset: label.offset ? { ...label.offset } : undefined,
      lines: label.lines.map(line => ({ ...line })), bar: label.bar ? { ...label.bar } : undefined });
  }
  reserveScreen(rect: LabelRect): void { if (finiteRect(rect)) this.blocked.push({ ...rect }); }
  reserveWorld(rect: LabelRect): void {
    if (!this.frame || !finiteRect(rect)) return;
    const points = [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top }, { x: rect.left, y: rect.bottom }, { x: rect.right, y: rect.bottom }].map(this.frame.project);
    this.reserveScreen({ left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) });
  }
  private measure(ctx: CanvasRenderingContext2D, label: SceneLabel, compact: boolean): Measured {
    const scale = this.frame!.scale, lines: MeasuredLine[] = []; let width = 0, y = 0, top = Infinity, bottom = -Infinity;
    const raw = compact ? label.lines.slice(0, 1).map(line => ({ ...line, text: [...line.text].length > 18 ? [...line.text].slice(0, 17).join('') + '…' : line.text })) : label.lines;
    for (const line of raw) {
      if (!line.text) continue;
      const size = clamp((line.size ?? 11) * scale, 9, 16), key = `${size}:${line.text}`;
      let measured = this.measurements.get(key);
      if (!measured) {
        ctx.font = font(size); const metric = ctx.measureText(line.text);
        measured = { width: metric.width, ascent: Number.isFinite(metric.actualBoundingBoxAscent) ? metric.actualBoundingBoxAscent : size * .8,
          descent: Number.isFinite(metric.actualBoundingBoxDescent) ? metric.actualBoundingBoxDescent : size * .25 };
        this.measurements.set(key, measured);
        if (this.measurements.size > MEASURE_LIMIT) this.measurements.delete(this.measurements.keys().next().value!);
      }
      lines.push({ text: line.text, color: line.color ?? '#eadbca', size, y });
      width = Math.max(width, measured.width); top = Math.min(top, y - measured.ascent); bottom = Math.max(bottom, y + measured.descent); y += size + 3;
    }
    const bar = label.bar ? { width: clamp((label.bar.width ?? 52) * scale, 20, 180), y: lines.length ? bottom + 4 : 0,
      ratio: clamp(Number.isFinite(label.bar.ratio) ? label.bar.ratio : 0, 0, 1), color: label.bar.color, height: clamp(4 * scale, 3, 6) } : undefined;
    if (bar) { width = Math.max(width, bar.width); top = Math.min(top, bar.y); bottom = Math.max(bottom, bar.y + bar.height); }
    return { width, top: Number.isFinite(top) ? top : 0, bottom: Number.isFinite(bottom) ? bottom : 0, lines, bar };
  }
  private choice(preferred: Vec, measured: Measured, dx: number, dy: number, compact: boolean, fallback: boolean, occupied: readonly LabelRect[]): Choice {
    const frame = this.frame!, half = measured.width / 2 + GAP;
    const baseline = { x: clamp(preferred.x + dx, MARGIN + half, frame.width - MARGIN - half),
      y: clamp(preferred.y + dy, MARGIN - measured.top + GAP, frame.height - MARGIN - measured.bottom - GAP) };
    const rect = { left: baseline.x - half, right: baseline.x + half, top: baseline.y + measured.top - GAP, bottom: baseline.y + measured.bottom + GAP };
    const obstruction = this.blocked.reduce((sum, block) => sum + overlapArea(rect, padded(block, GAP)), 0);
    const peers = occupied.reduce((sum, block) => sum + overlapArea(rect, padded(block, GAP)), 0);
    return { baseline, rect, dx: baseline.x - preferred.x, dy: baseline.y - preferred.y, compact, fallback,
      cost: obstruction * 16 + peers * 4 };
  }
  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.frame) return;
    this.result = this.emptyDiagnostics(); this.result.requested = this.labels.size;
    const frame = this.frame, occupied: LabelRect[] = [];
    const requests = [...this.labels.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (const label of requests) {
      const anchor = frame.project(label.anchor), preferred = { x: anchor.x + (label.offset?.x ?? 0) * frame.scale, y: anchor.y + (label.offset?.y ?? 0) * frame.scale };
      // Only near-edge captions may clamp inward. Distant threats retain their
      // fixed HUD/navigation information instead of pulling text across a room.
      if (![anchor.x, anchor.y, preferred.x, preferred.y].every(Number.isFinite)
        || anchor.x < -96 || anchor.x > frame.width + 96 || anchor.y < -96 || anchor.y > frame.height + 96) {
        this.result.offscreen++; this.result.omitted++; continue;
      }
      let chosen: Choice | undefined, measured: Measured | undefined, best: { choice: Choice; measured: Measured } | undefined;
      for (const compact of label.priority < 70 && label.lines.length > 0 ? [false, true] : [false]) {
        const size = this.measure(ctx, label, compact), previous = this.previous.get(label.id);
        const horizontal = size.width / 2 + 24, row = Math.max(18, size.bottom - size.top + GAP * 2 + 4);
        const offsets = [[0, 0], [0, -row], [-horizontal, 0], [horizontal, 0], [0, row], [-horizontal, -row], [horizontal, -row], [-horizontal, row], [horizontal, row], [0, -row * 2], [0, row * 2]];
        if (previous?.compact === compact && !previous.fallback) offsets.unshift([previous.dx, previous.dy]);
        for (const [dx, dy] of offsets) {
          const candidate = this.choice(preferred, size, dx, dy, compact, false, occupied);
          if (!best || candidate.cost < best.choice.cost) best = { choice: candidate, measured: size };
          if (!candidate.cost) { chosen = candidate; measured = size; break; }
        }
        if (chosen) break;
      }
      if (!chosen && label.essential) {
        const size = this.measure(ctx, label, false), previous = this.previous.get(label.id);
        const rails = [
          ...(previous?.fallback ? [[preferred.x + previous.dx, preferred.y + previous.dy]] : []),
          [frame.width / 2, MARGIN - size.top + GAP], [frame.width / 2, frame.height - MARGIN - size.bottom - GAP],
          [MARGIN + size.width / 2 + GAP, preferred.y], [frame.width - MARGIN - size.width / 2 - GAP, preferred.y],
          ...Array.from({ length: 6 }, (_, index) => [frame.width / 2, MARGIN - size.top + GAP + index * (size.bottom - size.top + 16)]),
        ];
        for (const [x, y] of rails) {
          const candidate = this.choice(preferred, size, x - preferred.x, y - preferred.y, false, true, occupied);
          if (!best || candidate.cost < best.choice.cost) best = { choice: candidate, measured: size };
          if (!candidate.cost) { chosen = candidate; measured = size; break; }
        }
        // Finite viewport capacity can be exhausted. Essential information is
        // retained at the least-overlapping candidate and explicitly diagnosed.
        if (!chosen && best) { chosen = best.choice; measured = best.measured; }
      }
      if (!chosen || !measured) { this.result.omitted++; continue; }
      const displaced = Math.hypot(chosen.dx, chosen.dy) > 8;
      let leader: SceneLabelPlacement['leader'];
      if (displaced) {
        const to = { x: clamp(anchor.x, chosen.rect.left, chosen.rect.right), y: clamp(anchor.y, chosen.rect.top, chosen.rect.bottom) };
        const distance = Math.hypot(anchor.x - to.x, anchor.y - to.y), length = Math.min(56, distance);
        if (distance > 1e-6) {
          const toward = { x: to.x + (anchor.x - to.x) / distance * length, y: to.y + (anchor.y - to.y) / distance * length };
          const entries = [...this.blocked, ...occupied].map(rect => segmentEntry(to, toward, padded(rect, 2))).filter((value): value is number => value !== null);
          const fraction = entries.length ? Math.max(0, Math.min(...entries) - 2 / Math.max(1, length)) : 1;
          if (length * fraction >= 4) leader = { from: { x: to.x + (toward.x - to.x) * fraction, y: to.y + (toward.y - to.y) * fraction }, to };
        }
      }
      const placement: SceneLabelPlacement = { id: label.id, priority: label.priority, essential: !!label.essential, rect: { ...chosen.rect }, anchor: { ...anchor },
        baseline: { ...chosen.baseline }, compact: chosen.compact, fallback: chosen.fallback, conflicted: chosen.cost > 0, ...(leader ? { leader } : {}) };
      this.result.placements.push(placement); occupied.push(chosen.rect);
      this.previous.delete(label.id); this.previous.set(label.id, { dx: chosen.dx, dy: chosen.dy, compact: chosen.compact, fallback: chosen.fallback });
      if (this.previous.size > PLACEMENT_LIMIT) this.previous.delete(this.previous.keys().next().value!);
      if (leader) {
        ctx.beginPath(); ctx.moveTo(leader.from.x, leader.from.y); ctx.lineTo(leader.to.x, leader.to.y); ctx.strokeStyle = '#d6e6ca88'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.fillStyle = '#191724b8'; ctx.beginPath(); ctx.roundRect(chosen.rect.left, chosen.rect.top, chosen.rect.right - chosen.rect.left, chosen.rect.bottom - chosen.rect.top, 4); ctx.fill();
      for (const line of measured.lines) {
        ctx.font = font(line.size); ctx.strokeStyle = '#171622ee'; ctx.lineWidth = 2.5; ctx.strokeText(line.text, chosen.baseline.x, chosen.baseline.y + line.y);
        ctx.fillStyle = line.color; ctx.fillText(line.text, chosen.baseline.x, chosen.baseline.y + line.y);
      }
      if (measured.bar) {
        const bar = measured.bar, x = chosen.baseline.x - bar.width / 2, y = chosen.baseline.y + bar.y;
        ctx.fillStyle = '#30283b'; ctx.fillRect(x, y, bar.width, bar.height); ctx.fillStyle = bar.color; ctx.fillRect(x, y, bar.width * bar.ratio, bar.height);
      }
    }
    ctx.restore();
    this.result.placed = this.result.placements.length; this.result.conflicted = this.result.placements.filter(item => item.conflicted).length;
    this.result.measureCacheSize = this.measurements.size; this.result.placementCacheSize = this.previous.size;
  }
  diagnostics(): SceneLabelDiagnostics { return { ...this.result, placements: this.result.placements.map(item => ({ ...item, rect: { ...item.rect }, anchor: { ...item.anchor }, baseline: { ...item.baseline },
    ...(item.leader ? { leader: { from: { ...item.leader.from }, to: { ...item.leader.to } } } : {}) })) }; }
}
