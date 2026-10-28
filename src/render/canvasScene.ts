import { activeWorld, BALANCE, WORLD, type Effect, type GameState, type Target, type Vec, type WorldGeometry } from '../game/types';
import { endlessCombatStats } from '../game/endlessGrowth';
import { drawEnemyTacticDangers } from './enemyTacticVisuals';
import { drawCombatEffects } from './combatEffects';
import { Camera } from './camera';
import { depthSort } from './depthSort';
import { foregroundOpacity, isForegroundOccluded } from './occlusion';
import { LAYER_ORDER } from './layers';
import { drawBattleLabels, drawBattleTarget, drawMotherCoreDangers } from './battleVisuals';
import type { OrganNode } from '../game/battleTypes';
import { BATTLE_BALANCE } from '../game/battleConfig';
import { wallHit } from '../actors/collision';
import { pulsePreviewPolygon } from './pulsePreview';
import { GrowthVisuals } from './growthVisuals';
import { drawEncounterGround, drawEncounterDangers } from './encounterVisuals';
import { GROWTH_BALANCE, PROTOCOLS, protocolRank } from '../game/protocols';
import { drawLungAirflow, drawLungAirway, drawLungEnvironment, drawLungForeground, drawLungObstacle } from './lungVisuals';
import { drawOrganLandscape } from './organLandscape';
import { drawNavigationMap } from './navigation';
import { drawImmuneCell, immuneCellBody, IMMUNE_BODY_LIFT } from './immuneVisuals';
import { getRaisedActorBodies, getRaisedObstacleOcclusion, PLAYER_HEAD_SHAPE, playerBodyPose } from './raisedObstacleOcclusion';
import { drawRaisedBodyLayers, traceRaisedObstacle } from './raisedObstacleGeometry';
import { SceneLabels, type SceneLabel, type LabelRect } from './sceneLabels';
import { drawPlayerPresence, playerPresence } from './playerPresence';
import type { ArtPresentation } from './artPresentation';
import { crosshairStatus, type CrosshairStatus } from './crosshairStatus';

const TAU = Math.PI * 2;
const hash = (n: number): number => { const a = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return a - Math.floor(a); };
const clamp = (n: number, a: number, b: number): number => Math.max(a, Math.min(b, n));

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient | CanvasPattern, stroke?: string): void {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, TAU);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function line(ctx: CanvasRenderingContext2D, points: number[], color: string, width = 1): void {
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color = '#e4d3c6', size = 12, align: CanvasTextAlign = 'center'): void {
  ctx.font = `500 ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y);
}

function strokeCurve(ctx: CanvasRenderingContext2D, points: number[], stroke: string, width: number): void {
  ctx.beginPath(); ctx.moveTo(points[0], points[1]); ctx.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]);
  ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
}

function organic(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string | CanvasGradient | CanvasPattern, outline: string, seed: number, elongate = 1): void {
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const a = i / 80 * TAU;
    const r = radius * (1 + Math.sin(a * 5 + seed) * .07 + Math.sin(a * 3 - seed) * .045);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * elongate;
    if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.stroke();
}

export class CanvasScene {
  readonly camera = new Camera();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly signalCanvas: HTMLCanvasElement | undefined;
  private readonly signalCtx: CanvasRenderingContext2D | undefined;
  private readonly background: HTMLCanvasElement;
  private lungBackground: HTMLCanvasElement | undefined;
  private width = 1440;
  private height = 900;
  private dpr = 1;
  private readonly growthVisuals = new GrowthVisuals();
  private readonly landscapes = new Map<string, HTMLCanvasElement>();
  private readonly labels = new SceneLabels();
  private hudRects: readonly LabelRect[] = [];
  private readonly actorCanvases = new Map<string, HTMLCanvasElement>();
  private lastCrosshair: { status: CrosshairStatus; aim: Vec } | null = null;

  /** UI updates this read-only presentation snapshot after its batched DOM read. */
  setHudRects(rects: readonly LabelRect[]): void { this.hudRects = rects.map(rect => ({ ...rect })); }

  constructor(private readonly canvas: HTMLCanvasElement, private readonly art?: ArtPresentation) {
    const context = canvas.getContext('2d', { alpha: !!art });
    if (!context) throw new Error('Canvas 2D is unavailable');
    this.ctx = context;
    if (art) {
      this.signalCanvas = document.createElement('canvas');
      this.signalCtx = this.signalCanvas.getContext('2d', { alpha: true }) ?? undefined;
      if (!this.signalCtx) throw new Error('Canvas 2D is unavailable for signals');
    }
    this.background = document.createElement('canvas');
    this.background.width = 1440; this.background.height = 900;
    const bg = this.background.getContext('2d')!;
    const staticCamera = new Camera(); staticCamera.apply(bg); this.drawEnvironment(bg);
    this.resize();
  }

  resize(width?: number, height?: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, width ?? (rect.width || window.innerWidth));
    this.height = Math.max(1, height ?? (rect.height || window.innerHeight));
    // Compatibility layers share the same CSS coordinate system as Phaser but
    // need device pixels too, otherwise their labels and effects are stretched
    // from a 1x texture on a high-DPI display.
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
    if (this.signalCanvas) { this.signalCanvas.width = this.canvas.width; this.signalCanvas.height = this.canvas.height; }
    this.camera.resize(this.width, this.height);
  }
  prepareCamera(state: GameState, options?: { deltaSeconds?: number; snap?: boolean }): void { this.camera.follow(state.player, activeWorld(state), options); }

  diagnostics(state: GameState) {
    return { depthOrder: depthSort(this.entities(state)).map(entity => entity.id), occluded: isForegroundOccluded(state.player, activeWorld(state)), foregroundOpacity: foregroundOpacity(state.player, activeWorld(state)), layerOrder: LAYER_ORDER, labels: this.labels.diagnostics(), hudRects: this.hudRects.map(rect => ({ ...rect })), playerPresence: playerPresence(state), crosshair: this.lastCrosshair };
  }

  private entities(state: GameState): { id: string; y: number; kind: string; index?: number }[] {
    return [
      { id: 'player', y: state.player.y, kind: 'player' },
      ...state.targets.flatMap((target, index) => target.role === 'capsule' ? [] : [{ id: target.id, y: target.y, kind: 'target', index }]),
      { id: 'tissue', y: state.tissue.y, kind: 'tissue' },
      ...(state.endless ? [] : [{ id: 'terminal', y: state.terminal.y, kind: 'terminal' }]),
      ...(state.battle?.graph.nodes.filter(node => node.kind === 'valve' || node.kind === 'gate' || node.kind === 'research' || node.kind === 'exit').map(node => ({ id: node.id, y: node.y, kind: 'device' })) ?? []),
      ...(state.growth?.beacon && state.growth.beacon.organId === state.battle?.organId && state.growth.beacon.until > state.elapsed ? [{ id: state.growth.beacon.id, y: state.growth.beacon.y, kind: 'beacon' }] : []),
      ...(state.growth?.cells?.flatMap((cell, index) => cell.organId === state.battle?.organId && cell.until > state.elapsed ? [{ id: cell.id, y: cell.y, kind: 'immune', index }] : []) ?? []),
      ...activeWorld(state).obstacles.map(obstacle => ({ id: obstacle.id, y: obstacle.y, kind: 'obstacle' })),
    ];
  }

  render(state: GameState, aim: Vec, opts: { lowEffects?: boolean; cameraPrepared?: boolean; authoritativeState?: GameState } = {}): void {
    if (!opts.cameraPrepared) this.prepareCamera(state);
    let ctx = this.ctx;
    this.labels.begin({ width: this.width, height: this.height, scale: this.camera.scale,
      project: point => this.camera.worldToScreen(point), blocked: this.hudRects,
      scope: `${state.growth?.runId ?? state.seed}:${state.battle?.organId ?? 'training'}` });
    // Labels yield to the player's body and exact ground aim. Their shapes stay
    // in world space; only the surrounding explanatory text can move.
    this.reserveLabelPoint(state.player, 30, 78, 12);
    this.reserveLabelPoint(aim, 17, 17, 17);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.art) { ctx.fillStyle = '#120d1b'; ctx.fillRect(0, 0, this.width, this.height); }
    if (state.battle?.organId === 'lung' && activeWorld(state).width <= 1200 && !this.lungBackground) {
      this.lungBackground = document.createElement('canvas'); this.lungBackground.width = 1440; this.lungBackground.height = 900;
      const bg = this.lungBackground.getContext('2d')!; const staticCamera = new Camera(); staticCamera.apply(bg); drawLungEnvironment(bg, activeWorld(state));
    }
    const world = activeWorld(state), large = world.width > 1200;
    if (!large && !this.art) ctx.drawImage(state.battle?.organId === 'lung' ? this.lungBackground! : this.background, this.camera.offsetX, this.camera.offsetY, 1440 * this.camera.scale, 900 * this.camera.scale);
    ctx.save(); this.camera.apply(ctx);
    this.art?.environment(state, this.camera);
    if (large && !this.art) {
      const organ = state.battle?.organId ?? 'heart', key = `${organ}:${world.width}:${world.height}`;
      if (!this.landscapes.has(key)) {
        const background = document.createElement('canvas'); background.width = world.width + 200; background.height = world.height + 350;
        const bg = background.getContext('2d')!; bg.translate(100, 200); drawOrganLandscape(bg, world, organ); this.landscapes.set(key, background);
      }
      ctx.drawImage(this.landscapes.get(key)!, -100, -200);
    }
    this.drawAtmosphere(ctx, state, Boolean(opts.lowEffects));
    this.drawGroundSignals(ctx, state, aim);
    drawEncounterGround(ctx, state, Boolean(opts.lowEffects), this.labels);
    this.growthVisuals.drawGround(ctx, state, state.growth, Boolean(opts.lowEffects));
    this.drawShadows(ctx, state);
    if (this.art) {
      // Ground and foreground must remain separate for sprite depth sorting.
      // Keep their canvases alive until Phaser has uploaded both, rather than
      // copying the entire ground image before reusing the same canvas.
      ctx.restore();
      this.art.raster('ground', this.canvas, 0);
      ctx = this.signalCtx!;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.save(); this.camera.apply(ctx);
    }
    const raisedActorBodies = this.art?.actorBodies(state) ?? getRaisedActorBodies(state);
    const entities = depthSort(this.entities(state));
    const activeBuffers = new Set<string>();
    for (const [order, entity] of entities.entries()) {
      const depth = 100 + order * 3;
      if (this.art?.nativeEntity(entity, state, ctx, depth)) continue;
      let drawCtx = ctx;
      let entityPosition = { x: state.player.x, y: entity.y };
      if (this.art) {
        const point = entity.kind === 'target' ? state.targets[entity.index!] : entity.kind === 'tissue' ? state.tissue : entity.kind === 'terminal' ? state.terminal
          : entity.kind === 'obstacle' ? activeWorld(state).obstacles.find(item => item.id === entity.id)!
          : entity.kind === 'device' ? state.battle!.graph.nodes.find(item => item.id === entity.id)!
          : entity.kind === 'immune' ? state.growth!.cells![entity.index!] : entity.kind === 'player' ? state.player : state.growth!.beacon!;
        entityPosition = point;
        const screen = this.camera.worldToScreen(point);
        if (screen.x < -220 || screen.x > this.width + 220 || screen.y < -120 || screen.y > this.height + 260) continue;
        activeBuffers.add(entity.id);
        let buffer = this.actorCanvases.get(entity.id);
        if (!buffer) { buffer = document.createElement('canvas'); const r = 'radius' in point ? Number(point.radius) : 50; buffer.width = Math.max(144, Math.ceil(r * 4 + 36)); buffer.height = buffer.width + 64; this.actorCanvases.set(entity.id, buffer); }
        drawCtx = buffer.getContext('2d')!;
        drawCtx.setTransform(1, 0, 0, 1, 0, 0); drawCtx.clearRect(0, 0, buffer.width, buffer.height);
        drawCtx.setTransform(1, 0, 0, .72, buffer.width / 2 - point.x, buffer.height - 32 - point.y * .72);
      }
      this.paintEntity(drawCtx, entity, state, raisedActorBodies, Boolean(opts.lowEffects));
      if (this.art) {
        const buffer = this.actorCanvases.get(entity.id)!, p = this.camera.worldToScreen(entityPosition);
        this.art.raster(`actor:${entity.id}`, buffer, depth, p.x - buffer.width / 2 * this.camera.scale, p.y - (buffer.height - 32) * this.camera.scale, this.camera.scale);
      }
    }
    for (const id of this.actorCanvases.keys()) if (!activeBuffers.has(id)) this.actorCanvases.delete(id);
    if (this.art) this.art.foreground(state, this.camera); else this.drawForeground(ctx, state);
    this.drawEffects(ctx, state, Boolean(opts.lowEffects));
    drawCombatEffects(ctx, state, Boolean(opts.lowEffects));
    this.growthVisuals.drawMarks(ctx, state, state.growth);
    this.growthVisuals.drawProtocolHits(ctx, state, state.growth, this.labels);
    if (state.battle) {
      drawEncounterDangers(ctx, state, Boolean(opts.lowEffects), this.labels);
      this.drawBattleDangers(ctx, state);
      drawEnemyTacticDangers(ctx, state, this.labels);
      if (state.campaign?.core.combat) drawMotherCoreDangers(ctx, state, state.campaign.core.combat, this.labels);
      drawBattleLabels(ctx, state, this.labels);
      this.drawTissueMarker(ctx, state);
    }
    if (!this.art) drawPlayerPresence(ctx, state, playerPresence(state, raisedActorBodies));
    this.drawCrosshair(ctx, state, aim, opts.authoritativeState ?? state);
    ctx.restore();
    this.labels.draw(ctx);
    if (this.art) this.art.raster('signals', this.signalCanvas!, 10000);
    const map = document.querySelector<HTMLCanvasElement>('#tactical-map');
    if (map && state.campaign) drawNavigationMap(map, state, { topLeft: this.camera.screenToWorld({ x: 0, y: 0 }), bottomRight: this.camera.screenToWorld({ x: this.width, y: this.height }) });
  }

  private paintEntity(ctx: CanvasRenderingContext2D, entity: {id: string; kind: string; index?: number}, state: GameState, raisedActorBodies: ReturnType<typeof getRaisedActorBodies>, low: boolean): void {
      if (entity.kind === 'player') this.drawPlayer(ctx, state);
      if (entity.kind === 'target') this.drawTarget(ctx, state.targets[entity.index!], state);
      if (entity.kind === 'tissue') this.drawTissue(ctx, state);
      if (entity.kind === 'terminal') this.drawTerminal(ctx, state);
      if (entity.kind === 'obstacle') {
        const obstacle = activeWorld(state).obstacles.find(obstacle => obstacle.id === entity.id)!;
        const opacity = getRaisedObstacleOcclusion(state, obstacle, raisedActorBodies).upperOpacity;
        if (state.battle?.organId === 'lung') drawLungObstacle(ctx, obstacle, opacity); else this.drawObstacle(ctx, obstacle, opacity);
      }
      if (entity.kind === 'device') this.drawBattleDevice(ctx, state.battle!.graph.nodes.find(node => node.id === entity.id)!, state);
      if (entity.kind === 'beacon') this.growthVisuals.drawBeacon(ctx, state, state.growth, this.labels);
      if (entity.kind === 'immune') {
        const cell = state.growth!.cells![entity.index!], body = immuneCellBody(cell, state.elapsed);
        if (body.alpha > 0) {
          const extent = body.radius * 1.12 + 8;
          this.reserveLabelPoint(cell, extent, extent - IMMUNE_BODY_LIFT, Math.max(12, extent + IMMUNE_BODY_LIFT));
        }
        drawImmuneCell(ctx, cell, state.elapsed, low);
      }
  }

  /** Keep the existing label producers while replacing their visible bodies. */
  annotateArtEntity(ctx: CanvasRenderingContext2D, entity: {id: string; kind: string}, state: GameState, halfWidth: number, above: number): void {
    const point = entity.kind === 'player' ? state.player : entity.kind === 'target' ? state.targets.find(t => t.id === entity.id)!
      : entity.kind === 'immune' ? state.growth!.cells!.find(cell => cell.id === entity.id)!
      : entity.kind === 'beacon' ? state.growth?.beacon
      : entity.kind === 'tissue' ? state.tissue : state.battle!.graph.nodes.find(n => n.id === entity.id)!;
    if (!point) return;
    if (entity.kind === 'beacon') {
      const beacon = state.growth?.beacon;
      if (!beacon || beacon.id !== entity.id || beacon.organId !== state.battle?.organId || beacon.until <= state.elapsed) return;
      if (beacon.mode !== 'patrol') this.reserveLabelPoint(point, halfWidth, above, 12);
      this.growthVisuals.drawBeaconLabel(ctx, state, state.growth, this.labels); return;
    }
    this.reserveLabelPoint(point, halfWidth, above, 12);
    ctx.save(); ctx.globalAlpha = 0;
    if (entity.kind === 'tissue') this.drawTissue(ctx, state);
    if (entity.kind === 'device') this.drawBattleDevice(ctx, point as OrganNode, state);
    ctx.restore();
  }

  private reserveLabelPoint(point: Vec, halfWidth: number, above: number, below: number): void {
    const p = this.camera.worldToScreen(point), scale = this.camera.scale;
    this.labels.reserveScreen({ left: p.x - halfWidth * scale, right: p.x + halfWidth * scale,
      top: p.y - above * scale, bottom: p.y + below * scale });
  }

  private addEntityLabel(label: SceneLabel): void { this.labels.add(label); }

  private drawEnvironment(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createRadialGradient(650, 360, 80, 600, 420, 1000);
    gradient.addColorStop(0, '#542236'); gradient.addColorStop(.52, '#311528'); gradient.addColorStop(1, '#130e1b');
    ctx.fillStyle = gradient; ctx.fillRect(-200, -250, 1650, 1500);

    // Curved chambers and layered rear valves establish depth above the floor.
    for (let i = 0; i < 8; i++) {
      const x = -70 + i * 190, y = 55 + Math.sin(i * 1.8) * 22;
      const g = ctx.createLinearGradient(x, y - 190, x, y + 150);
      g.addColorStop(0, '#8b3e4c'); g.addColorStop(.45, '#572135'); g.addColorStop(1, '#261321');
      ctx.beginPath(); ctx.moveTo(x - 130, y - 160);
      ctx.bezierCurveTo(x - 30, y - 220, x + 140, y - 120, x + 120, y + 42);
      ctx.bezierCurveTo(x + 105, y + 155, x + 20, y + 100, x - 35, y + 130);
      ctx.bezierCurveTo(x - 115, y + 120, x - 155, y - 35, x - 130, y - 160);
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#9a4a5355'; ctx.lineWidth = 3; ctx.stroke();
      for (let j = 0; j < 5; j++) strokeCurve(ctx, [x - 110 + j * 13, y - 110, x - 10, y - 150 + j * 17, x + 95, y + 10, x - 20 + j * 16, y + 84], '#c16a6840', 1.5);
    }

    // Physical bounds are visible: a broad organic rim hugs the walkable rectangle.
    ctx.save(); ctx.shadowColor = '#090611'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 15;
    ctx.beginPath(); ctx.roundRect(40, 86, 1120, 675, 65); ctx.fillStyle = '#6a293c'; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.roundRect(55, 100, 1090, 647, 45); ctx.fillStyle = '#9b4b4950'; ctx.fill();
    const floor = ctx.createLinearGradient(600, 110, 600, 750); floor.addColorStop(0, '#3c1e31'); floor.addColorStop(.45, '#4d2937'); floor.addColorStop(1, '#382136');
    ctx.beginPath(); ctx.roundRect(65, 110, 1070, 625, 25); ctx.fillStyle = floor; ctx.fill(); ctx.strokeStyle = '#d97c6552'; ctx.lineWidth = 2; ctx.stroke();

    // Hand drawn fibre, cellular hatching and vessels are fully local artwork.
    ctx.save(); ctx.beginPath(); ctx.roundRect(66, 111, 1068, 623, 24); ctx.clip();
    for (let i = 0; i < 115; i++) {
      const x = 65 + hash(i * 4 + 3) * 1070, y = 110 + hash(i * 4 + 5) * 625;
      const r = 10 + hash(i + 17) * 22;
      ellipse(ctx, x, y, r, r * .62, i % 3 ? '#b56d6530' : '#e09b7828', '#dd95781b');
      ellipse(ctx, x + 3, y - 2, r * .4, r * .21, '#281c2b37');
      strokeCurve(ctx, [x - r, y + 4, x - r * .2, y - r * .75, x + r * .7, y - r * .7, x + r, y], '#d38e781b', .8);
    }
    for (let i = 0; i < 78; i++) {
      const y = 125 + i * 8;
      strokeCurve(ctx, [70, y, 350, y - 30 + Math.sin(i) * 25, 730, y + 46, 1140, y - 13], '#e8976910', 1);
    }
    const vessels = [
      [55, 467, 294, 340, 365, 628, 682, 610],
      [679, 610, 939, 600, 935, 700, 1165, 686],
      [53, 231, 312, 182, 472, 180, 680, 221],
      [685, 220, 902, 246, 1027, 110, 1140, 135],
    ];
    for (const points of vessels) {
      strokeCurve(ctx, points, '#251322', 26); strokeCurve(ctx, points, '#763047', 18);
      strokeCurve(ctx, points.map((n, i) => n + (i % 2 ? -3 : 0)), '#b75c5d55', 4);
    }
    ctx.restore();

    // Retaining folds: perspective side walls, no decorative false platforms.
    for (let i = 0; i < 13; i++) {
      const y = 130 + i * 48, side = i % 2, x = side ? 1144 : 52;
      ellipse(ctx, x, y, 32 + hash(i) * 7, 36, side ? '#65273a' : '#713043', '#d47b6840');
      strokeCurve(ctx, [x - 10, y - 23, x + 11, y - 16, x + 17, y + 11, x - 6, y + 22], '#d2826d45', 2);
    }
    // Printed floor annotations, visually grounded rather than floating HUD.
    ctx.save(); ctx.globalAlpha = .33;
    text(ctx, 'A T R I U M   /   0 1', 735, 150, '#f1c5a1', 16);
    text(ctx, 'HEART  ·  ATRIUM', 630, 716, '#e1b09e', 11);
    ctx.restore();
  }

  private drawAtmosphere(ctx: CanvasRenderingContext2D, state: GameState, low: boolean): void {
    const flow = state.battle?.organId === 'lung' ? state.campaign?.arenas.lung.flow : undefined;
    if (flow) { drawLungAirflow(ctx, state, flow, low, this.labels); return; }
    const time = state.elapsed;
    if (!low) for (let i = 0; i < 24; i++) {
      const x = 95 + ((hash(i * 2) * 1000 + time * (4 + hash(i) * 6)) % 1030);
      const y = 120 + hash(i * 2 + 1) * 560 + Math.sin(time * .4 + i) * 10;
      const r = 1 + hash(i + 5) * 2.5;
      ellipse(ctx, x, y, r * 1.5, r, '#edb08a27');
    }
    // Subtle living material breathing is visual; it never moves a collider.
    const glow = ctx.createRadialGradient(650, 90, 0, 650, 90, 400);
    glow.addColorStop(0, `rgba(247,135,90,${.07 + Math.sin(time * 1.5) * .015})`); glow.addColorStop(1, '#f69a6000');
    ctx.fillStyle = glow; ctx.fillRect(250, -110, 800, 500);
    if (state.battle) this.drawHeartRhythm(ctx, state, low);
  }

  private drawGroundSignals(ctx: CanvasRenderingContext2D, state: GameState, aim: Vec): void {
    if (state.battle) this.drawBattleGround(ctx, state, aim);
    for (const target of state.targets) if (target.hp > 0) {
      if (state.battle) continue;
      ctx.save(); ctx.setLineDash([3, 7]); ctx.lineWidth = 1;
      ellipse(ctx, target.x, target.y, target.radius + 12, target.radius + 12, '#ff926508', '#e9a47c55'); ctx.restore();
    }
    const t = state.tissue;
    ctx.save(); ctx.setLineDash([6, 9]); ellipse(ctx, t.x, t.y, t.radius + 15, t.radius + 15, '#7de5ba08', '#7de5ba45'); ctx.restore();
    ellipse(ctx, state.terminal.x, state.terminal.y, 68, 48, '#67ddea09', '#74d6d22b');
    if (state.phase === 'playing' && state.tool === 2) {
      const distance = Math.hypot(aim.x - state.player.x, aim.y - state.player.y);
      ctx.save(); ctx.setLineDash([5, 6]); ctx.lineWidth = 1.5;
      const radius = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth).areaRadius : BALANCE.areaRadius;
      ellipse(ctx, aim.x, aim.y, radius, radius, '#92f5e508', distance <= BALANCE.range ? '#a6f2e376' : '#f39c6270'); ctx.restore();
    }
    // Decorative endpoint ticks share the exact physical floor boundary.
    for (const [x, y, dx, dy] of [[80, 125, 25, 25], [1120, 125, -25, 25], [80, 720, 25, -25], [1120, 720, -25, -25]]) {
      line(ctx, [x, y + dy, x, y, x + dx, y], '#d48d6765', 2);
    }
  }

  private drawHeartRhythm(ctx: CanvasRenderingContext2D, state: GameState, low: boolean): void {
    const battle = state.battle!, time = state.elapsed;
    const surge = battle.pulse.phase === 'surge';
    const strength = surge ? .9 : battle.pulse.phase === 'charge' ? .45 : .14;
    // These upper-rim leaflets breathe above the walkable floor; they never
    // create collision shapes or obscure a grounded actor.
    for (let i = 0; i < 3; i++) {
      const x = 440 + i * 145, stretch = Math.sin(time * TAU / BATTLE_BALANCE.pulseCycle) * 6;
      ctx.save(); ctx.translate(x, activeWorld(state).bounds.top - 29); ctx.globalAlpha *= .58 + strength * .15;
      const tissue = ctx.createLinearGradient(-30, -40, 16, 16);
      tissue.addColorStop(0, '#cf7c89'); tissue.addColorStop(.45, '#e99d9e'); tissue.addColorStop(1, '#ffd0b2');
      ctx.beginPath(); ctx.moveTo(-54, -22);
      ctx.bezierCurveTo(-49, -44, -24, -43, -10, -20 + stretch * .35);
      ctx.bezierCurveTo(-4, -8, -3, 0, 0, 10);
      ctx.bezierCurveTo(8, 1, 11, -12 + stretch * .35, 23, -24);
      ctx.bezierCurveTo(37, -39, 52, -32, 55, -19);
      ctx.bezierCurveTo(48, -5, 22, -3, 9, 9);
      ctx.bezierCurveTo(3, 15, -3, 15, -9, 9);
      ctx.bezierCurveTo(-25, -3, -45, -5, -54, -22); ctx.closePath();
      ctx.fillStyle = tissue; ctx.fill(); ctx.strokeStyle = '#b9697766'; ctx.lineWidth = 1.2; ctx.stroke();
      if (!low) {
        ctx.beginPath(); ctx.moveTo(-46, -23); ctx.bezierCurveTo(-33, -32, -18, -19 + stretch * .2, -5, 5);
        ctx.moveTo(47, -20); ctx.bezierCurveTo(32, -23, 19, -9 + stretch * .2, 6, 7);
        ctx.strokeStyle = '#ffe1c8a6'; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 9); ctx.quadraticCurveTo(-1, 2, -1, -5);
        ctx.strokeStyle = '#b7777a66'; ctx.lineWidth = .9; ctx.stroke();
      }
      ctx.restore();
    }
    if (!low) {
      const beats = ctx.createRadialGradient(655, 165, 10, 655, 165, 310);
      beats.addColorStop(0, `rgba(240,104,81,${strength * .06})`); beats.addColorStop(1, '#ed996700');
      ctx.fillStyle = beats; ctx.fillRect(345, -145, 620, 620);
    }
  }

  private drawBattleGround(ctx: CanvasRenderingContext2D, state: GameState, aim: Vec): void {
    const battle = state.battle!, time = state.elapsed;
    for (const edge of battle.graph.edges) {
      const from = battle.graph.nodes.find(node => node.id === edge.from), to = battle.graph.nodes.find(node => node.id === edge.to);
      if (!from || !to) continue;
      const angle = Math.atan2(to.y - from.y, to.x - from.x), length = Math.hypot(to.x - from.x, to.y - from.y);
      const infected = from.infected && from.active;
      line(ctx, [from.x, from.y, to.x, to.y], this.art ? '#9c726633' : '#26162477', this.art ? 5 : 14);
      ctx.save(); ctx.setLineDash(edge.open ? [] : [5, 8]);
      line(ctx, [from.x, from.y, to.x, to.y], !edge.open ? '#b7c4b24a' : infected ? '#db8d7655' : '#c29c8333', 2);
      ctx.restore();
      for (let i = 1; i <= Math.floor(length / 85); i++) {
        const fraction = i / (Math.floor(length / 85) + 1), x = from.x + (to.x - from.x) * fraction, y = from.y + (to.y - from.y) * fraction;
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
        if (edge.open) line(ctx, [-5, -5, 0, 0, -5, 5], infected ? '#eab89777' : '#ceb29644', 1.5);
        else { line(ctx, [-3, -4, 3, 4], '#d8c9b577', 1.5); line(ctx, [-3, 4, 3, -4], '#d8c9b577', 1.5); }
        ctx.restore();
      }
      if (edge.open && infected) {
        const fraction = 1 - clamp((edge.nextSpread - time) / BATTLE_BALANCE.spreadInterval, 0, 1);
        ellipse(ctx, from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction, 5, 3, '#efb98e91');
      }
    }
    for (const node of battle.graph.nodes) {
      if (node.kind === 'source' && node.active) {
        ctx.save(); ctx.setLineDash([3, 5]); ellipse(ctx, node.x, node.y, 48, 48, '#f09c7910', '#db947766'); ctx.restore();
      }
      if (node.kind === 'gate') {
        const closed = !battle.graph.edges.filter(edge => edge.from === node.id || edge.to === node.id).some(edge => edge.open);
        ellipse(ctx, node.x, node.y, 42, 29, '#a2f1c80a', closed ? '#a7dac282' : '#d7b68b5d');
      }
    }
    const valve = battle.graph.nodes.find(node => node.kind === 'valve');
    if (valve && state.phase === 'playing' && Math.hypot(state.player.x - valve.x, state.player.y - valve.y) <= BALANCE.interactionRange) {
      const ready = time >= battle.pulse.readyAt;
      const angle = Math.atan2(aim.y - valve.y, aim.x - valve.x);
      this.drawPulseSector(ctx, valve, angle, BATTLE_BALANCE.pulseRange, ready ? '#ffd89a0e' : '#c7b4a309', ready ? '#f4cb8d99' : '#bba69355', !ready, activeWorld(state));
    }
  }

  private drawPulseSector(ctx: CanvasRenderingContext2D, origin: Vec, angle: number, radius: number, fill: string, outline: string, dashed = false, world: WorldGeometry = WORLD): void {
    ctx.save(); ctx.beginPath(); ctx.moveTo(origin.x, origin.y);
    // Use the simulation's occluders: the preview cannot promise an impulse
    // behind a fold that the real pulse will reject.
    for (const point of pulsePreviewPolygon(origin, angle, radius, world).slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
    if (dashed) ctx.setLineDash([5, 7]); ctx.stroke(); ctx.setLineDash([]);
    for (const fraction of [.3, .55, .8]) {
      const limit = wallHit(origin, { x: Math.cos(angle), y: Math.sin(angle) }, radius, world) ?? radius;
      if (radius * fraction > limit) continue;
      const x = origin.x + Math.cos(angle) * radius * fraction, y = origin.y + Math.sin(angle) * radius * fraction;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); line(ctx, [-8, -6, 0, 0, -8, 6], outline, 2); ctx.restore();
    }
    ctx.restore();
  }

  private drawBattleDevice(ctx: CanvasRenderingContext2D, node: OrganNode, state: GameState): void {
    const battle = state.battle!, time = state.elapsed;
    const near = Math.hypot(state.player.x - node.x, state.player.y - node.y) <= BALANCE.interactionRange;
    ctx.save(); ctx.translate(node.x, node.y); ctx.scale(1, 1 / .72);
    const flow = state.battle?.organId === 'lung' ? state.campaign?.arenas.lung.flow : undefined;
    if (node.id === 'airway' && flow) {
      drawLungAirway(ctx, state, flow, near, this.labels, node);
    } else if (node.kind === 'exit') {
      const destination = state.battle?.organId === 'lung' ? '心脏' : '肺部';
      const readyAt = state.campaign?.travelReadyAt ?? 0, ready = node.active && time >= readyAt;
      ellipse(ctx, 0, 2, 34, 11, '#36556a', node.active ? '#b8ddd3' : '#7c9497');
      ctx.beginPath(); ctx.roundRect(-26, -58, 52, 54, 17); ctx.fillStyle = '#618290'; ctx.fill(); ctx.strokeStyle = node.active ? '#c2ded4' : '#9baaa4'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(-19, -51, 38, 45, 12); ctx.fillStyle = '#18364b'; ctx.fill();
      const sign = state.battle?.organId === 'lung' ? -1 : 1;
      line(ctx, [-sign * 10, -29, sign * 10, -29], ready ? '#d8f1d8' : '#889b98', 2.5);
      line(ctx, [sign * 3, -36, sign * 10, -29, sign * 3, -22], ready ? '#d8f1d8' : '#889b98', 2.5);
      this.addEntityLabel({ id: `device:${node.id}`, anchor: node, offset: { x: 0, y: near ? -76 : 28 }, priority: near ? 70 : 30, essential: near,
        lines: [{ text: `通往${destination}`, color: '#d8e8d9', size: 11 },
          { text: near ? !node.active ? '通道尚未开启' : ready ? `[ E ] ${state.campaign?.migration.status === 'warning' ? '追击至' : '前往'}${destination}` : '通行充能中'
            : !node.active ? '迁移阶段开启' : ready ? '双向通道 · E' : `通行冷却 ${Math.ceil(readyAt - time)}s`, color: '#b5cbc4', size: 10 }] });
    } else if (node.kind === 'valve') {
      const ready = time >= battle.pulse.readyAt, surge = battle.pulse.phase === 'surge';
      ellipse(ctx, 0, 3, 37, 12, '#6f3b46', '#c79076');
      const movement = surge ? 9 : Math.sin(time * 2) * 2;
      for (const sign of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.bezierCurveTo(sign * 12, -37 - movement, sign * 45, -57, sign * 35, -26);
        ctx.quadraticCurveTo(sign * 29, -5, 0, -6); ctx.fillStyle = '#be7970'; ctx.fill(); ctx.strokeStyle = '#e4aa87'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ellipse(ctx, 0, -17, 11, 17, '#71394a', ready ? '#f7d397' : '#a99988');
      line(ctx, [-5, -17, 0, -23, 5, -17, 0, -10, -5, -17], ready ? '#ffe0a8' : '#ad9a8b', 2);
      const phase = battle.pulse.phase === 'charge' ? '蓄力' : surge ? '冲流节律' : '舒缓';
      this.addEntityLabel({ id: `device:${node.id}`, anchor: node, offset: { x: 0, y: near ? -69 : 28 }, priority: near ? 70 : 30, essential: near,
        lines: [{ text: near ? `定向冲流 · ${phase}` : '定向冲流阀', color: '#f4d3ac', size: 11 },
          { text: ready ? `E · 组织 −${BATTLE_BALANCE.pulseCost}${near ? ' · 鼠标定向' : ''}` : `${Math.ceil(battle.pulse.readyAt - time)}s 充能`, color: ready ? '#f6dba9' : '#bbaba0', size: 10 }] });
    } else if (node.kind === 'gate') {
      const closed = !battle.graph.edges.filter(edge => edge.from === node.id || edge.to === node.id).some(edge => edge.open);
      for (const x of [-25, 25]) {
        ctx.beginPath(); ctx.roundRect(x - 8, -39, 16, 43, 5); ctx.fillStyle = '#51645d'; ctx.fill(); ctx.strokeStyle = '#aac5ac'; ctx.lineWidth = 1.5; ctx.stroke();
        ellipse(ctx, x, -37, 7, 4, '#d2d6b6', '#eae3c1');
      }
      if (closed) {
        ctx.fillStyle = '#a5d9c426'; ctx.fillRect(-17, -33, 34, 32);
        for (let y = -29; y < 0; y += 8) line(ctx, [-17, y, 17, y], '#c2e4cb88', 1.5);
        line(ctx, [-5, -25, 5, -10], '#e0edcf', 2); line(ctx, [-5, -10, 5, -25], '#e0edcf', 2);
      } else line(ctx, [-18, -3, 18, -3], '#bba98b66', 2);
      this.addEntityLabel({ id: `device:${node.id}`, anchor: node, offset: { x: 0, y: near ? -57 : 28 }, priority: near ? 70 : 30, essential: near,
        lines: [{ text: closed ? '隔离闸 · 已关闭' : '隔离闸 · 已开放', color: '#d2dbc0', size: 11 },
          ...(near ? [{ text: closed ? '[ E ] 恢复通路' : '[ E ] 截断传播', color: '#e4efd3', size: 10 }] : [])] });
    } else {
      ellipse(ctx, 0, 3, 34, 11, '#36544e', '#a5bc9f');
      ctx.beginPath(); ctx.roundRect(-28, -30, 56, 29, 6); ctx.fillStyle = '#809f8c'; ctx.fill(); ctx.strokeStyle = '#cbd5b4'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -29, 28, 9, 0, 0, TAU); ctx.fillStyle = '#c8d6b6'; ctx.fill(); ctx.strokeStyle = '#e4debd'; ctx.stroke();
      for (const x of [-16, 0, 16]) {
        ctx.beginPath(); ctx.roundRect(x - 4, -50, 8, 21, 3); ctx.fillStyle = '#d0e9cb'; ctx.fill(); ctx.strokeStyle = '#658f7f'; ctx.stroke();
        line(ctx, [x, -44, x, -34], '#72baa6', 3); ellipse(ctx, x, -50, 4, 2, '#f0e6c6');
      }
      const samples = Math.floor(state.growth?.research ?? 0);
      this.addEntityLabel({ id: `device:${node.id}`, anchor: node, offset: { x: 0, y: near ? -70 : 28 }, priority: near ? 70 : 30, essential: near,
        lines: [{ text: near ? '[ E ] 抗体研究 / 校准' : '抗体研究台', color: '#d2e7cd', size: 11 },
          { text: `样本 ${samples} / ${GROWTH_BALANCE.researchCost}`, color: '#b6cfb7', size: 10 }] });
    }
    ctx.restore();
  }

  private drawBattleDangers(ctx: CanvasRenderingContext2D, state: GameState): void {
    for (const target of state.targets) {
      if ((target.splitAt ?? 0) > state.elapsed) {
        const remaining = (target.splitAt ?? 0) - state.elapsed;
        for (const [index, landing] of (target.splitPositions ?? []).entries()) {
          ctx.save(); ctx.setLineDash([3, 4]); ctx.lineWidth = 1.7;
          ellipse(ctx, landing.x, landing.y, 18, 18, '#f7cf8f12', '#f3cf95'); ctx.setLineDash([]);
          line(ctx, [landing.x - 5, landing.y, landing.x + 5, landing.y], '#ffdfab', 1.5);
          this.reserveLabelPoint(landing, 10, 10, 10);
          this.labels.add({ id: `split:${target.id}:${index}`, anchor: landing, offset: { x: 0, y: -25 * this.camera.yScale }, priority: 100, essential: true,
            lines: [{ text: `⋈ ${remaining.toFixed(1)}s`, color: '#f4d7a3', size: 11 }] });
          ctx.restore();
        }
      }
      if (target.role === 'core' && state.campaign?.core.combat?.coreId === target.id) continue;
      if (target.attackPlan) continue;
      if (target.hp <= 0 || !target.attackAim || (target.attackAt ?? 0) <= state.elapsed) continue;
      const center = target.attackAim, radius = target.attackRadius ?? BATTLE_BALANCE.attackRadius;
      this.reserveLabelPoint(center, 9, 9, 9);
      const remaining = (target.attackAt ?? 0) - state.elapsed;
      const progress = 1 - clamp(remaining / (target.attackWindup ?? BATTLE_BALANCE.attackWindup), 0, 1);
      ctx.save(); ctx.lineWidth = 2;
      ellipse(ctx, center.x, center.y, radius, radius, '#e97d5c13', '#a74256');
      ctx.setLineDash([4, 5]); ellipse(ctx, center.x, center.y, radius * .76, radius * .76, '#00000000', '#f6b1819a'); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(center.x, center.y, radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * progress); ctx.strokeStyle = '#9e3d53'; ctx.lineWidth = 3; ctx.stroke();
      line(ctx, [center.x - 5, center.y - 4, center.x + 5, center.y + 4], '#ffd3a0', 2);
      line(ctx, [center.x - 5, center.y + 4, center.x + 5, center.y - 4], '#ffd3a0', 2);
      ctx.restore();
    }
  }

  private drawShadows(ctx: CanvasRenderingContext2D, state: GameState): void {
    for (const target of state.targets) if (target.hp > 0) ellipse(ctx, target.x + 3, target.y + (this.art ? 2 : 8), target.radius + 5, target.radius * (this.art ? .25 : .62), this.art ? '#71465d33' : '#180e2378');
    ellipse(ctx, state.player.x + 3, state.player.y + 3, 25, this.art ? 7 : 13, this.art ? '#49747b45' : '#100e218a');
    ellipse(ctx, state.tissue.x + 4, state.tissue.y + 3, 54, this.art ? 13 : 28, this.art ? '#754a6333' : '#150e2266');
    ellipse(ctx, state.terminal.x + 4, state.terminal.y + 3, 47, this.art ? 12 : 24, this.art ? '#754a6333' : '#160d2366');
    for (const o of activeWorld(state).obstacles) ellipse(ctx, o.x + 4, o.y + (this.art ? 2 : 15), o.radius + 8, o.radius * (this.art ? .22 : .7), this.art ? '#754a6333' : '#160e2277');
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, state: GameState): void {
    const p = state.player, time = state.elapsed;
    const { walk, bob, direction } = playerBodyPose(state);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 1 / .72);
    ellipse(ctx, 0, 2, 23, 8, '#78eee80b', '#93f8ed98');
    for (const [index, slot] of (state.growth?.equipped ?? []).entries()) {
      const angle = -Math.PI * .85 + index * Math.PI * .35, x = Math.cos(angle) * 36, y = -35 + Math.sin(angle) * 30;
      ellipse(ctx, x, y, 8 + protocolRank(slot), 8 + protocolRank(slot), '#254f48e8', '#c1f3d9');
      text(ctx, PROTOCOLS[slot.id].symbol, x, y + 4, '#d9ffe5', 11);
      for (let level = 0; level < protocolRank(slot); level++) ellipse(ctx, x - 5 + level * 5, y + 14, 1.5, 1.5, '#d4f6ba');
    }
    // Chunky boots, backpack and the visible front establish the elevated view.
    ctx.save(); ctx.translate(0, -bob);
    ctx.fillStyle = '#153b50'; ctx.strokeStyle = '#102b3b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-23, -41, 15, 29, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#59c3cf'; ctx.beginPath(); ctx.roundRect(-24, -38, 6, 19, 3); ctx.fill();
    ellipse(ctx, -11, -3 + walk * 2, 9, 6, '#b8d6ce', '#224d5e');
    ellipse(ctx, 11, -3 - walk * 2, 9, 6, '#cce1d6', '#224d5e');
    const suit = ctx.createLinearGradient(-12, -42, 20, -9); suit.addColorStop(0, '#f3efce'); suit.addColorStop(.5, '#c3ddd2'); suit.addColorStop(1, '#6da5b0');
    ctx.beginPath(); ctx.roundRect(-17, -43, 34, 32, 12); ctx.fillStyle = suit; ctx.fill(); ctx.strokeStyle = '#173b50'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e7f7de'; ctx.beginPath(); ctx.roundRect(-8, -31, 16, 12, 3); ctx.fill();
    line(ctx, [-4, -25, 4, -25], '#178b9a', 3); line(ctx, [0, -29, 0, -21], '#178b9a', 3);
    // Helmet cap and front visor have intentionally different lighting/height.
    const cap = ctx.createLinearGradient(-20, -67, 15, -36); cap.addColorStop(0, '#fff5d8'); cap.addColorStop(.5, '#e8ecdc'); cap.addColorStop(1, '#88b7b9');
    const head = PLAYER_HEAD_SHAPE;
    ellipse(ctx, head.x, head.y, head.rx, head.ry, cap, '#173c50');
    ellipse(ctx, -2, -57, 17, 10, '#fff8df94');
    ctx.beginPath(); ctx.roundRect(-18, -51, 36, 19, 9); ctx.fillStyle = '#163e56'; ctx.fill(); ctx.strokeStyle = '#6ad1d6'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-14, -49, 27, 10, 5); ctx.fillStyle = '#50b4ca'; ctx.fill();
    strokeCurve(ctx, [-11, -47, -4, -51, 3, -48, 7, -47], '#d9fff5a1', 1.5);
    ellipse(ctx, -20, -45, 4, 6, '#bddece', '#264c59'); ellipse(ctx, 20, -45, 4, 6, '#cde4d5', '#264c59');
    ellipse(ctx, 17, -60, 4, 4, state.scanUntil > time ? '#aaffef' : '#54dadd');
    // Arm and tool tether to a ground-plane muzzle: no aim/hit parallax.
    const mx = Math.cos(direction) * 24, my = Math.sin(direction) * 24;
    strokeCurve(ctx, [12, -25, 24, -15, mx - 4, my - 5, mx, my], '#c4e3d8', 8);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(direction);
    ctx.fillStyle = '#d6e8d7'; ctx.strokeStyle = '#193d4b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-10, -5, 26, 10, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = state.tool === 3 ? '#7ae4b2' : '#63e2e5'; ctx.fillRect(8, -3, 9, 6);
    if (p.actionUntil > time) ellipse(ctx, 20, 0, 7, 5, state.tool === 3 ? '#b0ffd3a0' : '#bcffffa0');
    ctx.restore();
    ctx.restore();
    if (p.hurtUntil > time) { ctx.globalAlpha = .5; ellipse(ctx, 0, -35, 30, 40, '#ff8e7540', '#ffac78'); }
    if (p.dashUntil > time) {
      line(ctx, [-28, -24, -48, -24], '#a8f7ec99', 3); line(ctx, [-27, -12, -41, -12], '#a8f7ec66', 2);
    }
    ctx.restore();
  }

  private drawTarget(ctx: CanvasRenderingContext2D, target: Target, state: GameState): void {
    if (state.battle) { drawBattleTarget(ctx, target, state); return; }
    const live = target.hp > 0;
    ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
    if (!live) {
      ellipse(ctx, 0, 0, target.radius * .6, 7, '#a2e9ba21', '#a2e9ba44');
      text(ctx, '✓', 0, -5, '#a7e9c5', 16); ctx.restore(); return;
    }
    const t = state.elapsed, bob = Math.sin(t * 3.2 + target.x) * 2;
    const r = target.radius, isCluster = target.kind === 'cluster';
    ctx.save(); ctx.translate(0, -r * .7 + bob);
    for (let i = 0; i < (isCluster ? 6 : 9); i++) {
      const a = i / (isCluster ? 6 : 9) * TAU;
      const x = Math.cos(a) * r * .93, y = Math.sin(a) * r * .74;
      strokeCurve(ctx, [x * .8, y * .8, x * 1.05, y * 1.05, x * 1.23, y * 1.23, x * 1.28, y * 1.28], '#7e374d', 6);
      ellipse(ctx, x * 1.28, y * 1.28, isCluster ? 5 : 4, isCluster ? 5 : 4, '#dc9666', '#7a3448');
    }
    const body = ctx.createLinearGradient(-r, -r, r, r); body.addColorStop(0, target.hitUntil > t ? '#fff0bc' : isCluster ? '#efb582' : '#f98f77'); body.addColorStop(.5, isCluster ? '#be5b64' : '#cc566b'); body.addColorStop(1, '#71374f');
    organic(ctx, 0, 0, r, body, '#572b48', target.x, .83);
    ellipse(ctx, -6, -r * .35, r * .6, r * .23, '#ffe7b447');
    if (isCluster) {
      ellipse(ctx, -r * .28, 1, r * .42, r * .5, '#d7a2864b', '#e4b19171');
      ellipse(ctx, r * .27, 2, r * .37, r * .44, '#c96e834b', '#e4b19171');
    } else ellipse(ctx, 0, 4, r * .44, r * .5, '#f7b38955', '#f4b27d77');
    // Two eyes and crown buds keep targets playful and expressive.
    ellipse(ctx, -r * .26, -3, 3, 4, '#311f3d'); ellipse(ctx, r * .26, -3, 3, 4, '#311f3d');
    ellipse(ctx, -r * .29, -4, 1, 1, '#fff1c1'); ellipse(ctx, r * .23, -4, 1, 1, '#fff1c1');
    strokeCurve(ctx, [-4, 7, -1, 10, 2, 10, 5, 7], '#4b2a47', 1.5);
    ctx.restore();
    // Ground reticle, not the elevated head, is the exact hit anchor.
    ctx.lineWidth = 1.2; ellipse(ctx, 0, 1, 11, 5, '#ffdb8b12', '#f5c785b0');
    line(ctx, [-4, 1, 4, 1], '#f9dc9a', 1); line(ctx, [0, -3, 0, 5], '#f9dc9a', 1);
    const barY = -r * 1.8 - 10;
    ctx.fillStyle = '#23182e'; ctx.beginPath(); ctx.roundRect(-r, barY, r * 2, 4, 2); ctx.fill();
    ctx.fillStyle = '#f3c18a'; ctx.beginPath(); ctx.roundRect(-r, barY, Math.max(1, r * 2 * target.hp / target.maxHp), 4, 2); ctx.fill();
    if (target.scanned || state.scanUntil > state.elapsed) {
      text(ctx, isCluster ? '群聚训练体 · 范围裂解' : '单体训练靶 · 精确净化', 0, barY - 8, '#f0d3ad', 10);
    }
    ctx.restore();
  }

  private drawTissue(ctx: CanvasRenderingContext2D, state: GameState): void {
    const tissue = state.tissue, ratio = tissue.hp / tissue.maxHp;
    ctx.save(); ctx.translate(tissue.x, tissue.y); ctx.scale(1, 1 / .72);
    const rim = ctx.createLinearGradient(0, -55, 0, 15); rim.addColorStop(0, '#aa6b69'); rim.addColorStop(.6, '#724653'); rim.addColorStop(1, '#422d44');
    organic(ctx, 0, -17, 47, rim, '#c4947e77', 13, .65);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU, x = Math.cos(a) * 29, y = -20 + Math.sin(a) * 17;
      ellipse(ctx, x, y, 15, 10, ratio === 1 ? '#96c5a0' : '#c0807b', '#ebc89b66');
      strokeCurve(ctx, [x - 8, y, x - 4, y - 5, x + 4, y - 5, x + 8, y], '#f6dab333', 1);
    }
    ellipse(ctx, 0, -18, 22, 15, ratio === 1 ? '#6ba588' : '#3b263b', ratio === 1 ? '#a9e9ba' : '#c07574');
    if (ratio < 1) {
      line(ctx, [-15, -18, -7, -22, -2, -12, 4, -19, 15, -16], '#eaaf88', 2);
    } else {
      line(ctx, [-8, -18, 8, -18], '#d8ffd7', 3); line(ctx, [0, -26, 0, -10], '#d8ffd7', 3);
    }
    // A permanent, shape-based medical marker survives both damage and repair.
    ellipse(ctx, 30, -10, 12, 12, '#d5edcf', '#3c7161');
    line(ctx, [24, -10, 36, -10], '#2d7265', 3);
    line(ctx, [30, -16, 30, -4], '#2d7265', 3);
    if (state.battle) {
      const near = Math.hypot(tissue.x - state.player.x, tissue.y - state.player.y) <= BALANCE.range;
      this.labels.add({ id: 'tissue', anchor: tissue, offset: { x: 0, y: 35 }, priority: 75, essential: true,
        lines: [{ text: ratio >= 1 ? '✚ 组织修复完成' : `✚ 组织 ${Math.round(ratio * 100)}%`, color: ratio >= 1 ? '#b9eec5' : '#f1d6bb', size: 12 },
          ...(near && ratio < 1 ? [{ text: '3 · 瞄准组织修复', color: '#c9cbb4', size: 10 }] : [])],
        bar: { ratio, color: ratio >= 1 ? '#9be4b7' : '#e5ae80', width: 74 } });
    } else {
      ctx.fillStyle = '#211d30'; ctx.beginPath(); ctx.roundRect(-37, 12, 74, 5, 2); ctx.fill();
      ctx.fillStyle = ratio === 1 ? '#9be4b7' : '#e5ae80'; ctx.beginPath(); ctx.roundRect(-37, 12, Math.max(1, 74 * ratio), 5, 2); ctx.fill();
      text(ctx, ratio === 1 ? '组织修复完成' : `受损组织  ${Math.round(tissue.hp)}%`, 0, 35, ratio === 1 ? '#b9eec5' : '#f1d6bb', 12);
      text(ctx, '03  /  组织修复注射', 0, 52, '#c9aaa1', 9);
    }
    ctx.restore();
  }

  private drawTissueMarker(ctx: CanvasRenderingContext2D, state: GameState): void {
    // This is an information marker, not a second draw of the tissue entity.
    ctx.save(); ctx.translate(state.tissue.x, state.tissue.y); ctx.scale(1, 1 / .72);
    ctx.lineWidth = 1.5; ellipse(ctx, 30, -10, 12, 12, '#d5edcf', '#31594f');
    line(ctx, [24, -10, 36, -10], '#2d7265', 3); line(ctx, [30, -16, 30, -4], '#2d7265', 3);
    ctx.restore();
  }

  private drawTerminal(ctx: CanvasRenderingContext2D, state: GameState): void {
    const position = state.terminal, ready = state.battle ? state.battle.readyToRetest : state.targets.every(t => t.hp <= 0) && state.tissue.hp >= state.tissue.maxHp;
    const near = Math.hypot(position.x - state.player.x, position.y - state.player.y) <= BALANCE.interactionRange;
    ctx.save(); ctx.translate(position.x, position.y); ctx.scale(1, 1 / .72);
    ellipse(ctx, 0, 2, 35, 11, '#193e45', '#81b6a6');
    ctx.beginPath(); ctx.moveTo(-31, -9); ctx.lineTo(-26, -36); ctx.lineTo(26, -36); ctx.lineTo(31, -9); ctx.quadraticCurveTo(0, 5, -31, -9); ctx.fillStyle = '#496a68'; ctx.fill(); ctx.strokeStyle = '#a0bba4'; ctx.lineWidth = 2; ctx.stroke();
    ellipse(ctx, 0, -36, 26, 10, '#92a897', '#dfd2ad');
    ctx.beginPath(); ctx.roundRect(-27, -65, 54, 37, 9); ctx.fillStyle = '#e1d7b7'; ctx.fill(); ctx.strokeStyle = '#4f7674'; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-21, -59, 42, 24, 5); ctx.fillStyle = '#173f4b'; ctx.fill();
    line(ctx, [-16, -47, -9, -47, -5, -53, 0, -41, 5, -49, 10, -47, 16, -47], ready ? '#a7f5c5' : '#7bd6d8', 2);
    ellipse(ctx, -14, -20, 2, 2, ready ? '#b8f2b5' : '#f1bf80'); ellipse(ctx, 13, -20, 2, 2, '#8ed7d1');
    if (state.battle) {
      this.labels.add({ id: 'terminal', anchor: position, offset: { x: 0, y: near ? -96 : 28 }, priority: near ? 70 : 30, essential: near,
        lines: [{ text: '复测终端', color: '#d6e5cc', size: 11 },
          { text: near ? ready ? '[ E ] 完成复测' : '[ E ] 查看复测条件' : ready ? 'E · 可复测' : '等待稳定', color: '#b9d8be', size: 10 }] });
    } else if (near && state.phase === 'playing') {
      ctx.fillStyle = '#173c42e8'; ctx.beginPath(); ctx.roundRect(-68, -104, 136, 25, 6); ctx.fill(); ctx.strokeStyle = '#8acfc0'; ctx.lineWidth = 1; ctx.stroke();
      text(ctx, ready ? '[ E ]  完成复测' : state.battle ? '[ E ]  查看复测条件' : '[ E ]  查看训练进度', 0, -87, '#e1f0d3', 11);
    }
    if (!state.battle) { text(ctx, '复测终端', 0, 28, '#d6e5cc', 12); text(ctx, 'RETURN  /  E', 0, 44, '#9ab8af', 9); }
    ctx.restore();
  }

  private drawObstacle(ctx: CanvasRenderingContext2D, obstacle: { x: number; y: number; radius: number }, opacity = 1): void {
    ctx.save(); ctx.translate(obstacle.x, obstacle.y); ctx.scale(1, 1 / .72);
    const r = obstacle.radius;
    const g = ctx.createLinearGradient(0, -r * 1.4, 0, 6); g.addColorStop(0, '#c37b72'); g.addColorStop(.4, '#965565'); g.addColorStop(1, '#522e48');
    drawRaisedBodyLayers(ctx, r, opacity, () => {
      traceRaisedObstacle(ctx, r, 'heart');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#cf97805e'; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const x = -r * .8 + i * r * .28;
        strokeCurve(ctx, [x, -5, x - 10, -r * .4, x + 4, -r * .9, 3 + x * .3, -r * 1.25], '#e4ae8952', 1.5);
      }
      ellipse(ctx, 0, -r * 1.05, r * .45, r * .2, '#ecc49b26');
    });
    ctx.restore();
  }

  private drawForeground(ctx: CanvasRenderingContext2D, state: GameState): void {
    const world = activeWorld(state), area = world.foreground;
    ctx.save();
    const baseOpacity = state.battle ? Math.min(foregroundOpacity(state.player, world), ...state.targets.filter(target => target.hp > 0).map(target => foregroundOpacity(target, world))) : foregroundOpacity(state.player, world);
    if (state.battle?.organId === 'lung') { drawLungForeground(ctx, state, world, baseOpacity); ctx.restore(); return; }
    const x = area.x + area.width * .5, y = area.y + area.height * .5;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 1 / .72);
    const g = ctx.createLinearGradient(0, -110, 0, 70); g.addColorStop(0, '#c08079'); g.addColorStop(.45, '#794259'); g.addColorStop(1, '#3d2943');
    for (let i = 0; i < 5; i++) {
      const sx = -90 + i * 43, sy = 22 + Math.sin(i * 2) * 18;
      // Fade individual fronds around critical facilities, even when the player
      // is elsewhere. This keeps the terminal's body and its E prompt readable.
      const nearTerminal = Math.abs(x + sx - state.terminal.x) < 86 && Math.abs(y - state.terminal.y) < 110;
      ctx.globalAlpha = nearTerminal ? Math.min(baseOpacity, .16) : baseOpacity;
      ctx.beginPath(); ctx.moveTo(sx - 28, sy + 35);
      ctx.bezierCurveTo(sx - 54, sy - 28, sx - 25, sy - 105, sx + 10, sy - 80);
      ctx.bezierCurveTo(sx + 43, sy - 66, sx + 52, sy + 11, sx + 30, sy + 35); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#d2a58a66'; ctx.lineWidth = 2; ctx.stroke();
      strokeCurve(ctx, [sx - 10, sy + 16, sx - 22, sy - 19, sx - 4, sy - 66, sx + 10, sy - 66], '#e7bfa665', 2);
      for (let j = 0; j < 4; j++) ellipse(ctx, sx + hash(i * 8 + j) * 31 - 15, sy - j * 17, 4 + j, 2 + j * .3, '#dba88b24');
    }
    ctx.restore(); ctx.restore();
  }

  private drawEffects(ctx: CanvasRenderingContext2D, state: GameState, low: boolean): void {
    for (const effect of state.effects) {
      const age = state.elapsed - effect.born, progress = clamp(age / effect.duration, 0, 1);
      if (progress >= 1 || age < 0) continue;
      ctx.save(); ctx.globalAlpha = 1 - progress;
      if (effect.kind === 'beam') {
        const origin = this.art?.effectOrigin?.(effect, state) ?? effect.from;
        // An elevated, forward muzzle can project past a nearby hit or wall.
        // Show the real endpoint without drawing a backwards beam.
        const dx = effect.to.x - effect.from.x, dy = (effect.to.y - effect.from.y) * .72;
        // No direction means there is no surface to mark. The shot's own
        // muzzle flash and any independently accepted target hit still render.
        if (dx * dx + dy * dy <= 1e-12) { ctx.restore(); continue; }
        if ((origin.x - effect.to.x) * dx + (origin.y - effect.to.y) * .72 * dy >= 0) {
          const scale = Math.max(.01, this.camera.scale);
          const radius = (7 + progress * 2) / scale;
          ctx.save(); ctx.translate(effect.to.x, effect.to.y); ctx.scale(1, 1 / .72);
          ctx.lineWidth = 4 / scale;
          ellipse(ctx, 0, 0, radius, radius, '#00000000', '#42303a');
          ctx.lineWidth = 2 / scale;
          ellipse(ctx, 0, 0, radius, radius, '#00000000', '#ffe4a4');
          ctx.restore();
          ctx.restore();
          continue;
        }
        // A beam belongs to the shot that created it, not whichever tool is selected now.
        line(ctx, [origin.x, origin.y, effect.to.x, effect.to.y], '#8bece455', 6);
        line(ctx, [origin.x, origin.y, effect.to.x, effect.to.y], '#e8fff1', 1.6);
        this.drawAntibody(ctx, { x: origin.x + (effect.to.x - origin.x) * Math.min(1, progress * 2), y: origin.y + (effect.to.y - origin.y) * Math.min(1, progress * 2) }, Math.atan2(effect.to.y - origin.y, effect.to.x - origin.x));
      } else if (effect.kind === 'scan') {
        ctx.lineWidth = 2.5; ellipse(ctx, effect.from.x, effect.from.y, effect.radius * progress, effect.radius * progress, '#7debe306', '#9bf8ed');
        ctx.setLineDash([5, 15]); ellipse(ctx, effect.from.x, effect.from.y, Math.max(1, effect.radius * progress - 14), Math.max(1, effect.radius * progress - 14), '#a9ffff00', '#75cdc06c');
      } else if (effect.kind === 'burst') {
        ctx.lineWidth = 2; ellipse(ctx, effect.to.x, effect.to.y, effect.radius, effect.radius, '#8ce7d712', '#b6ffeb');
        ellipse(ctx, effect.to.x, effect.to.y, Math.max(1, effect.radius * progress), Math.max(1, effect.radius * progress), '#8ce7d709', '#c6f8dd');
        if (state.campaign) for (let i = 0; i < 8; i++) {
          const angle = i / 8 * TAU, inner = effect.radius * (.2 + progress * .5), outer = Math.min(effect.radius, inner + 16);
          line(ctx, [effect.to.x + Math.cos(angle) * inner, effect.to.y + Math.sin(angle) * inner, effect.to.x + Math.cos(angle) * outer, effect.to.y + Math.sin(angle) * outer], '#d6ffe3', 2);
        }
        if (!low) this.sparks(ctx, effect, progress, '#bcffe7', 13);
      } else if (effect.kind === 'heal') {
        ctx.lineWidth = effect.repairSucceeded ? 2 : 1.5;
        const radius = effect.repairSucceeded ? 44 + progress * 17 : 10 + progress * 12;
        ellipse(ctx, effect.to.x, effect.to.y, radius, radius, '#a8f7bd0e', effect.repairSucceeded ? '#b0ffc9' : '#8bd8c8');
        if (effect.repairSucceeded) {
          const y = effect.to.y - progress * 38;
          line(ctx, [effect.to.x - 8, y, effect.to.x + 8, y], '#d8ffcf', 3); line(ctx, [effect.to.x, y - 11, effect.to.x, y + 11], '#d8ffcf', 3);
          if (!low) this.sparks(ctx, effect, progress, '#a2f9c3', 8);
        }
      } else if (effect.kind === 'hit') {
        this.sparks(ctx, effect, progress, '#ffe4a4', low ? 4 : 9);
      } else if (effect.kind === 'dash') {
        line(ctx, [effect.from.x, effect.from.y, effect.to.x, effect.to.y], '#b5fff188', 5 * (1 - progress) + 1);
      } else if (effect.kind === 'success') {
        ellipse(ctx, effect.to.x, effect.to.y, effect.radius * progress, effect.radius * progress, '#b4f7bc08', '#caffbd');
        if (!low) this.sparks(ctx, effect, progress, '#ffdfa3', 25);
      } else if (effect.kind === 'pulse') {
        const angle = effect.angle ?? Math.atan2(effect.to.y - effect.from.y, effect.to.x - effect.from.x);
        this.drawPulseSector(ctx, effect.from, angle, effect.radius, '#ffd99f0d', '#ffdf9d', false, activeWorld(state));
        this.drawPulseSector(ctx, effect.from, angle, effect.radius * (.2 + progress * .8), '#00000000', '#ffedc5', false, activeWorld(state));
        if (!low) this.sparks(ctx, effect, progress, '#ffe0aa', 8);
      } else if (effect.kind === 'evolution') {
        ctx.setLineDash([6, 6]); ellipse(ctx, effect.to.x, effect.to.y, effect.radius * (.4 + progress * .6), effect.radius * (.4 + progress * .6), '#e6bd9d08', '#f8c6a5'); ctx.setLineDash([]);
        text(ctx, '◇', effect.to.x, effect.to.y - 55 - progress * 20, '#f3d3af', 26);
      } else if (effect.kind === 'flow') {
        const position = { x: effect.from.x + (effect.to.x - effect.from.x) * progress, y: effect.from.y + (effect.to.y - effect.from.y) * progress };
        ellipse(ctx, position.x, position.y, 8, 5, '#edb08e8a', '#ffdbad');
      } else if (effect.kind === 'chain') {
        const angle = Math.atan2(effect.to.y - effect.from.y, effect.to.x - effect.from.x);
        line(ctx, [effect.from.x, effect.from.y, effect.to.x, effect.to.y], '#b5ffe066', 5);
        line(ctx, [effect.from.x, effect.from.y, effect.to.x, effect.to.y], '#e4fff1', 1.5);
        this.drawAntibody(ctx, effect.to, angle);
      }
      ctx.restore();
    }
  }

  private sparks(ctx: CanvasRenderingContext2D, effect: Effect, progress: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = hash(effect.id * 20 + i) * TAU, distance = (12 + hash(i + effect.id) * 42) * progress;
      const x = effect.to.x + Math.cos(a) * distance, y = effect.to.y + Math.sin(a) * distance;
      line(ctx, [x, y, x + Math.cos(a) * 5, y + Math.sin(a) * 5], color, 1.5);
    }
  }

  private drawAntibody(ctx: CanvasRenderingContext2D, position: Vec, angle: number): void {
    ctx.save(); ctx.translate(position.x, position.y); ctx.rotate(angle);
    line(ctx, [-5, 0, 0, 0, 5, -5], '#d5fff3', 2); line(ctx, [0, 0, 5, 5], '#d5fff3', 2); ctx.restore();
  }

  private drawCrosshair(ctx: CanvasRenderingContext2D, state: GameState, aim: Vec, authoritativeState: GameState): void {
    if (state.phase !== 'playing') { this.lastCrosshair = null; return; }
    const status = crosshairStatus(authoritativeState, aim);
    this.lastCrosshair = { status, aim: { ...aim } };
    const color = status === 'in-range' ? state.tool === 3 ? '#b5f7c2' : '#b2f8eb' : '#ddb58a';
    ctx.save(); ctx.translate(aim.x, aim.y); ctx.scale(1, 1 / .72);
    ctx.lineWidth = 1.3; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, 9, .15, 1.4); ctx.arc(0, 0, 9, 1.7, 2.95); ctx.arc(0, 0, 9, 3.3, 4.55); ctx.arc(0, 0, 9, 4.85, 6.1); ctx.stroke();
    line(ctx, [-15, 0, -11, 0], color); line(ctx, [11, 0, 15, 0], color); line(ctx, [0, -15, 0, -11], color); line(ctx, [0, 11, 0, 15], color);
    ellipse(ctx, 0, 0, 1.4, 1.4, color); ctx.restore();
  }
}
