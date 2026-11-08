import { campLayout, type CampFacility, type CampStationId } from '../game/campLayout';
import { nearbyCampStation } from '../game/campScene';
import { CAMP_CONSTRUCTION_SECONDS } from '../game/campProgression';
import type { GameState, Vec } from '../game/types';
import { SPRITE_Y_SCALE, type VisualBounds } from './raisedObstacleGeometry';
import type { LabelRect, SceneLabelSink } from './sceneLabels';

export interface CampScreenTarget {
  id: CampStationId;
  body: LabelRect;
  ground?: { x: number; y: number; radiusX: number; radiusY: number };
  labels: { id: string; rect: LabelRect }[];
  eligible: boolean;
  built: boolean;
  groundY: number;
}

/** Resolve the visible thing being clicked before checking whether it is in interaction range. */
export function hitCampScreenTarget(targets: readonly CampScreenTarget[], point: Vec): CampScreenTarget | undefined {
  const contains = (rect: LabelRect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  const frontFirst = (a: CampScreenTarget, b: CampScreenTarget) => b.groundY - a.groundY || a.id.localeCompare(b.id);
  const labelled = targets.filter(target => target.labels.some(label => contains(label.rect))).sort(frontFirst);
  if (labelled.length) return labelled[0];
  return targets.filter(target => contains(target.body) || !!target.ground
    && ((point.x - target.ground.x) / target.ground.radiusX) ** 2 + ((point.y - target.ground.y) / target.ground.radiusY) ** 2 <= 1).sort(frontFirst)[0];
}

function constructionProgress(state: GameState): number {
  const seconds = state.camp?.constructionSeconds ?? 0;
  return Math.max(0, Math.min(1, (Number.isFinite(seconds) ? seconds : 0) / CAMP_CONSTRUCTION_SECONDS));
}

/** Matches the upright body painted by drawExpeditionFacilityFallback. */
export function campFacilityFallbackBounds(site: CampFacility): VisualBounds {
  if (site.id === 'summon') return { left: site.position.x - 28, right: site.position.x + 28,
    top: site.position.y * SPRITE_Y_SCALE - 70, bottom: site.position.y * SPRITE_Y_SCALE - 25 };
  return { left: site.position.x - 38, right: site.position.x + 38,
    top: site.position.y * SPRITE_Y_SCALE - 65, bottom: site.position.y * SPRITE_Y_SCALE };
}

/** Ground-space foundations remain visibly empty until their individual building is completed. */
export function drawCampFoundations(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.camp || state.camp.prologue === 'arrival') return;
  const layout = campLayout(state), built = new Set(layout.facilities.map(site => site.id));
  for (const site of layout.sites) {
    if (built.has(site.id)) continue;
    const r = site.footprint, active = state.camp.activeConstruction === site.id;
    ctx.save();
    if (site.id === 'summon') {
      const progress = active ? constructionProgress(state) : 0;
      ctx.fillStyle = active ? '#f1d38842' : '#e5d9ac38';ctx.strokeStyle = '#bb995d';ctx.lineWidth = 2;
      ctx.beginPath();ctx.arc(site.position.x, site.position.y, 31, 0, Math.PI * 2);ctx.fill();ctx.stroke();
      if (active) {ctx.lineWidth = 4;ctx.strokeStyle = '#e1b15f';ctx.beginPath();ctx.arc(site.position.x, site.position.y, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);ctx.stroke();}
      ctx.restore();continue;
    }
    ctx.fillStyle = active ? '#e9c77f38' : '#c3d9bb38';
    ctx.strokeStyle = active ? '#ad8550' : '#6e9c81'; ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]); ctx.beginPath();
    ctx.roundRect(r.left, r.top, r.right - r.left, r.bottom - r.top, 10); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    for (const x of [r.left + 8, r.right - 8]) for (const y of [r.top + 8, r.bottom - 8]) {
      ctx.fillStyle = '#b1a27b'; ctx.fillRect(x - 3, y - 4, 6, 8);
    }
    if (active) {
      const progress = constructionProgress(state), half = Math.min(55, (r.right - r.left) * .32);
      const baseY = r.bottom - 4, topY = baseY - (30 + progress * 25) / SPRITE_Y_SCALE;
      ctx.strokeStyle = '#957953'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath();
      for (const x of [site.position.x - half, site.position.x + half]) {
        ctx.moveTo(x, baseY); ctx.lineTo(x, topY);
      }
      ctx.moveTo(site.position.x - half - 5, topY + 9); ctx.lineTo(site.position.x + half + 5, topY + 9);
      ctx.moveTo(site.position.x - half, baseY - 5); ctx.lineTo(site.position.x + half, topY + 12); ctx.stroke();
      ctx.fillStyle = '#d1bb89';
      for (let index = 0; index < 3; index++) ctx.fillRect(r.left + 15 + index * 9, r.bottom - 21 - index * 3, 27, 8);
      const centerY = r.bottom + 20;
      ctx.strokeStyle = '#d4ddc4'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(site.position.x, centerY, 17, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ae8241'; ctx.beginPath(); ctx.arc(site.position.x, centerY, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
    }
    ctx.restore();
  }
}

/** Visual bounds use projected-world Y; label anchors use ordinary ground-space Y. */
export function addCampSiteLabels(state: GameState, labels: SceneLabelSink,
  facilityBounds: (site: CampFacility) => VisualBounds | undefined): void {
  if (!state.camp || state.camp.prologue === 'arrival') return;
  const layout = campLayout(state), built = new Set(layout.facilities.map(site => site.id));
  const nearby = nearbyCampStation(state), activeId = state.camp.activeConstruction;
  for (const site of layout.sites) {
    const near = nearby?.id === site.id;
    if (!built.has(site.id)) {
      const active = activeId === site.id, progress = constructionProgress(state);
      const status = active ? `${site.id === 'summon' ? '✦ 激活中' : '⚒ 施工中'} ${Math.round(progress * 100)}%`
        : activeId ? '等待小队完工' : site.id === 'summon' ? near ? '✦ 点击激活 / E · 免费' : '✦ 免费激活' : near ? '⚒ 点击建造 / E · 免费' : '⚒ 免费建造';
      labels.add({ id: `camp-site:${site.id}`, anchor: { x: site.position.x, y: (site.footprint.top + site.footprint.bottom) / 2 },
        offset: { x: 0, y: -5 }, theme: 'camp', priority: active ? 97 : near ? 94 : 78, essential: active || near,
        lines: [{ text: site.name, size: 12 }, { text: status, size: 12 }],
        ...(active ? { bar: { ratio: progress, color: '#ad8246', width: 72 } } : {}) });
      continue;
    }
    // Each world bed owns its action and maturity label, rather than a building menu.
    if (site.id === 'farm') continue;
    const attention = state.camp.attention?.[site.id];
    if (attention && attention.kind !== 'build') {
      const bounds = facilityBounds(site) ?? campFacilityFallbackBounds(site);
      labels.add({ id: `camp-attention:${site.id}`, anchor: { x: (bounds.left + bounds.right) / 2, y: bounds.top / SPRITE_Y_SCALE },
        offset: { x: 0, y: -14 }, theme: 'camp', campTone: attention.kind === 'mission' ? 'blue' : 'gold', priority: 96, essential: true,
        lines: [{ text: `! ${attention.label}${attention.count > 1 ? ` · ${attention.count}` : ''}`, size: 15 }] });
    }
    if (near || site.id === 'summon') labels.add({ id: `camp-name:${site.id}`, anchor: site.position, offset: { x: 0, y: 35 },
      theme: 'camp', ...(site.id === 'summon' ? { campTone: 'gold' as const } : {}), priority: near ? 94 : 86, essential: true,
      lines: [{ text: site.name, size: site.id === 'summon' ? 14 : 12 }, ...(near ? [{ text: site.id === 'summon' ? '点击光核 / E · 接引' : '点击建筑 / E', size: 12 }] : [])] });
  }
}
