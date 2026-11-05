import { drawLowCover, drawFrontPlatform, lowPropOpacity } from './lowCover';
import { drawPlayerHealth, playerHealthView, type PlayerHealthView } from './playerHealth';
import { drawTerritoryMarkerIcons, territoryMarkerLayouts, type TerritoryMarkerLayout } from './territoryMarkers';
import { campStations } from '../game/campScene';
import { drawExpeditionSignals, drawConstructionPreview, drawExpeditionFacilityFallback, drawExpeditionProjectiles } from './expeditionVisuals';
import { immuneLegions } from '../game/immuneLegions';
import { activeWorld, BALANCE, WORLD, type Effect, type GameState, type Target, type Vec, type WorldGeometry } from '../game/types';
import { endlessCombatStats } from '../game/endlessGrowth';
import { drawEnemyTacticDangers } from './enemyTacticVisuals';
import { drawCombatEffects } from './combatEffects';
import { drawPlayerProjectiles } from './playerProjectileVisuals';
import { Camera, type CameraFollowOptions } from './camera';
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
import { GROWTH_BALANCE } from '../game/protocols';
import { drawLungAirflow, drawLungAirway } from './lungVisuals';
import { drawNavigationMap } from './navigation';
import { drawImmuneCell, immuneCellBody, IMMUNE_BODY_LIFT } from './immuneVisuals';
import { getRaisedActorBodies, getRaisedObstacleOcclusion, PLAYER_HEAD_SHAPE, playerBodyPose, playerVisualBounds } from './raisedObstacleOcclusion';
import { boundsOverlap, drawRaisedBodyLayers } from './raisedObstacleGeometry';
import { SceneLabels, type SceneLabel, type LabelRect } from './sceneLabels';
import { touchCopy } from '../ui/touchCopy';
import { TERRITORY_BALANCE } from '../game/territory';
import { drawPlayerPresence, playerPresence } from './playerPresence';
import { HeroLocomotionController } from './heroLocomotion';
import { drawHeroContactShadow } from './actorFootPlant';
import { drawPlayerDamage, drawPlayerDangerOverlay, PlayerDangerFeedback } from './playerDamageFeedback';
import { drawTerritoryCannon, drawTerritoryCannonPreview, drawTerritoryCannonShots, territoryCannonCameraFocus } from './territoryCannonVisuals';
import { drawSmartVirusSignals, drawSmartVirusFallback } from './smartVirusVisuals';
import { territoryPlayerFlightHeight,isTerritoryPlayerAirborne } from '../game/territoryCannon';
import type { ArtPresentation } from './artPresentation';
import { crosshairStatus, type CrosshairStatus } from './crosshairStatus';
import { drawHostEventGround, drawHostEventLabels, drawHostEventTarget } from './hostEventVisuals';
import { drawPlayerInfection, drawTerritoryAttackIndicators, drawTerritoryInvaders, drawTerritoryNodeAccents, drawTerritorySignals, FantasyGroundCache, FantasyTerritoryGeometryCache,
  fantasyOwnerAt, territoryRenderFrame, visibleTerritory, type TerritoryAttackIndicator, type TerritoryRenderFrame } from './fantasyTerritory';

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

export class CanvasScene {
  readonly camera = new Camera();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly signalCanvas: HTMLCanvasElement | undefined;
  private readonly signalCtx: CanvasRenderingContext2D | undefined;
  private width = 1440;
  private height = 900;
  private dpr = 1;
  private readonly growthVisuals = new GrowthVisuals();
  private readonly labels = new SceneLabels();
  private lastHealth: PlayerHealthView | null = null;
  private lastMarkers: TerritoryMarkerLayout[] = [];
  private hudRects: readonly LabelRect[] = [];
  private readonly actorCanvases = new Map<string, HTMLCanvasElement>();
  private readonly fantasyGround = new FantasyGroundCache();
  private readonly territoryGeometry = new FantasyTerritoryGeometryCache();
  private territoryFrame: TerritoryRenderFrame | undefined;
  private territoryIndicators: TerritoryAttackIndicator[] = [];
  private territoryLabelled: string[] = [];
  private lastCrosshair: { status: CrosshairStatus; aim: Vec } | null = null;
  private readonly locomotion = new HeroLocomotionController();
  private readonly dangerFeedback = new PlayerDangerFeedback();
  private renderAim: Vec = {x:0,y:0};

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
  prepareCamera(state: GameState, options: CameraFollowOptions = {}): void {
    const committed=options.aim?undefined:territoryCannonCameraFocus(state);
    const lift=territoryPlayerFlightHeight(state);
    const compact = this.width <= 1024 || this.height <= 600;
    const header = this.hudRects.filter(r => r.left < this.width / 2 + 36 && r.right > this.width / 2 - 36 && r.top < this.height * .4);
    const viewport = options.viewport ?? (compact && state.phase !== 'menu' ? { left:8, right:this.width-8,
      top:Math.min(this.height-100, Math.max(0, ...header.map(r => r.bottom)) + 10), bottom:this.height-18 } : undefined);
    this.camera.follow(state.player,activeWorld(state),{...options,...committed,viewport,playerFrame:{left:-64,right:64,top:-148-lift,bottom:28}});
  }

  diagnostics(state: GameState) {
    return { playerHealth: this.lastHealth, territoryMarkers: this.lastMarkers.map(m => ({ id:m.view.node.id, kind:m.view.kind, alert:m.view.alert, rect:m.rect })), depthOrder: depthSort(this.entities(state)).map(entity => entity.id), occluded: isForegroundOccluded(state.player, activeWorld(state)), foregroundOpacity: foregroundOpacity(state.player, activeWorld(state)), layerOrder: LAYER_ORDER, labels: this.labels.diagnostics(), hudRects: this.hudRects.map(rect => ({ ...rect })), playerPresence: playerPresence(state), crosshair: this.lastCrosshair,
      territoryVisuals: { geometry: this.territoryGeometry.diagnostics(), labelledNodeIds: this.territoryLabelled, offscreenAttacks: this.territoryIndicators,
        nodes: this.territoryFrame?.nodes.map(view => ({ id: view.node.id, status: view.status, infectionProgress: view.infectionProgress, purificationProgress: view.purificationProgress,
          purificationActive: view.purificationActive, pausedReason: view.pausedReason ?? null, incomingFrom: view.incomingFrom ?? null, attackerIds: view.attackerIds })) ?? [],
        lanes: this.territoryFrame?.lanes.map(lane => ({ id: lane.laneId, shielded: lane.shielded, origin: lane.origin, attackedNodeIds: lane.attackedNodeIds,
          suppliedBy: lane.shielded ? [lane.front.node, lane.healing.node].filter(node => node.owner === 'infected').map(node => node.id) : [] })) ?? [] } };
  }

  private entities(state: GameState): { id: string; y: number; kind: string; index?: number }[] {
    return [
      { id: 'player', y: state.playerFlight?activeWorld(state).bounds.bottom+100:state.player.y, kind: 'player' },
      ...state.targets.flatMap((target, index) => target.role === 'capsule' ? [] : [{ id: target.id, y: target.y, kind: 'target', index }]),
      ...(state.endless?.smartSupport?.plans.flatMap((plan,index)=>plan.buildUntil!==undefined&&plan.nestPosition&&state.targets.some(t=>t.id===plan.builderId&&t.hp>0)
        ?[{id:`${plan.id}:construction`,y:plan.nestPosition.y,kind:'smart-construction',index}]:[])??[]),
      ...(!state.camp&&state.expedition?.pendingLoot&&state.expedition.lootPosition?[{id:'expedition:boss-loot',y:state.expedition.lootPosition.y,kind:'boss-loot'}]:[]),
      ...(state.camp ? campStations(state).map((station,index)=>({id:`camp:${station.id}`,y:station.position.y,kind:'camp-station',index})) : []),
      ...(state.territory?.construction?.task?[{id:state.territory.construction.task.id,y:state.territory.construction.task.y,kind:'player-construction'}]:[]),
      { id: 'tissue', y: state.tissue.y, kind: 'tissue' },
      ...(state.endless ? [] : [{ id: 'terminal', y: state.terminal.y, kind: 'terminal' }]),
      ...(state.battle?.graph.nodes.filter(node => node.kind === 'valve' || node.kind === 'gate' || node.kind === 'research' || node.kind === 'exit' || node.kind === 'healing').map(node => ({ id: node.id, y: node.y, kind: 'device' })) ?? []),
      ...(visibleTerritory(state)?.nodes.filter(node => node.kind === 'front').map(node => ({ id: node.id, y: node.y, kind: 'territory-node' })) ?? []),
      ...(immuneLegions(state.growth).filter(beacon => beacon.organId === state.battle?.organId && beacon.until > state.elapsed).map(beacon => ({ id: beacon.id, y: beacon.y, kind: 'beacon' }))),
      ...(state.growth?.cells?.flatMap((cell, index) => cell.organId === state.battle?.organId && cell.until > state.elapsed && (cell.hp ?? 1) > 0 ? [{ id: cell.id, y: cell.y, kind: 'immune', index }] : []) ?? []),
      ...activeWorld(state).obstacles.map(obstacle => ({ id: obstacle.id, y: obstacle.y, kind: 'obstacle' })),
    ];
  }

  render(state: GameState, aim: Vec, opts: { lowEffects?: boolean; cameraPrepared?: boolean; authoritativeState?: GameState; aimRange?: number; aimCancelled?: boolean; cannonPreview?:{aim:Vec;cancelled:boolean};constructionPreview?:{blueprintId:import('../game/construction').BlueprintId;position:Vec} } = {}): void {
    this.locomotion.observe(opts.authoritativeState ?? state); this.renderAim=aim;
    if (!opts.cameraPrepared) this.prepareCamera(state);
    this.territoryFrame = territoryRenderFrame(state, this.territoryGeometry);
    const territoryViewport = { width: this.width, height: this.height, scale: this.camera.scale, project: (point: Vec) => this.camera.worldToScreen(point), blocked: this.hudRects };
    let ctx = this.ctx;
    this.labels.begin({ width: this.width, height: this.height, scale: this.camera.scale,
      project: point => this.camera.worldToScreen(point), blocked: this.hudRects,
      scope: `${state.growth?.runId ?? state.seed}:${state.battle?.organId ?? 'training'}`,
      text: this.canvas.ownerDocument?.body?.classList.contains('touch-mode') ? touchCopy : undefined });
    // Labels yield to the player's body and exact ground aim. Their shapes stay
    // in world space; only the surrounding explanatory text can move.
    this.reserveLabelPoint(state.player, 30, 78, 12);
    this.reserveLabelPoint(aim, 17, 17, 17);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.art) { ctx.fillStyle = '#120d1b'; ctx.fillRect(0, 0, this.width, this.height); }
    const world = activeWorld(state);
    ctx.save(); this.camera.apply(ctx);
    this.art?.environment(state, this.camera);
    if (!this.art) {
      const ground = this.fantasyGround.prepare(state);
      ctx.drawImage(ground.canvas, ground.x, ground.y, ground.width, ground.height);
    }
    drawExpeditionSignals(ctx, state, this.labels, false);
    drawConstructionPreview(ctx,state,opts.constructionPreview);
    drawTerritorySignals(ctx, state, Boolean(opts.lowEffects), this.territoryFrame);
    drawSmartVirusSignals(ctx,state,Boolean(opts.lowEffects),this.labels);
    drawTerritoryCannonPreview(ctx,state,opts.cannonPreview);
    this.drawAtmosphere(ctx, state, Boolean(opts.lowEffects));
    this.drawGroundSignals(ctx, state, aim);
    drawHostEventGround(ctx, state);
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
    const playerBody = this.art?.playerBounds?.(state) ?? playerVisualBounds(state);
    if (state.player.hp > 0 && !raisedActorBodies.some(body => body.kind === 'player')) raisedActorBodies.push({ id:'player', kind:'player', groundY:state.player.y, bodyBounds:playerBody });
    const dangerLevel = this.dangerFeedback.update(opts.authoritativeState ?? state);
    this.lastHealth = playerHealthView(state, this.camera, playerBody, dangerLevel);
    if (this.lastHealth) this.labels.reserveScreen(this.lastHealth.rect);
    territoryViewport.blocked = this.lastHealth ? [...this.hudRects, this.lastHealth.rect] : this.hudRects;
    const entities = depthSort(this.entities(state));
    const activeBuffers = new Set<string>();
    for (const [order, entity] of entities.entries()) {
      const depth = entity.kind==='player'&&state.playerFlight?9400:100 + order * 3;
      if (this.art?.nativeEntity(entity, state, ctx, depth)) continue;
      let drawCtx = ctx;
      let entityPosition = { x: state.player.x, y: entity.y };
      if (this.art) {
        const point = entity.kind === 'target' ? state.targets[entity.index!] : entity.kind === 'tissue' ? state.tissue : entity.kind === 'terminal' ? state.terminal
          : entity.kind === 'camp-station' ? campStations(state)[entity.index!].position
          : entity.kind === 'player-construction' ? state.territory!.construction!.task!
          : entity.kind === 'boss-loot' ? state.expedition!.lootPosition!
          : entity.kind === 'smart-construction' ? state.endless!.smartSupport!.plans[entity.index!].nestPosition!
          : entity.kind === 'obstacle' ? activeWorld(state).obstacles.find(item => item.id === entity.id)!
          : entity.kind === 'device' ? state.battle!.graph.nodes.find(item => item.id === entity.id)!
          : entity.kind === 'territory-node' ? visibleTerritory(state)!.nodes.find(node => node.id === entity.id)!
          : entity.kind === 'immune' ? state.growth!.cells![entity.index!] : entity.kind === 'player' ? state.player : immuneLegions(state.growth).find(beacon => beacon.id === entity.id)!;
        entityPosition = point;
        const screen = this.camera.worldToScreen(point);
        if (screen.x < -220 || screen.x > this.width + 220 || screen.y < -120 || screen.y > this.height + 260) continue;
        activeBuffers.add(entity.id);
        let buffer = this.actorCanvases.get(entity.id);
        if (!buffer) { buffer = document.createElement('canvas'); const r = 'radius' in point ? Number(point.radius) : 50; buffer.width = Math.max(144, Math.ceil(r * 4 + 36)); buffer.height = buffer.width + 64+(entity.kind==='player'?120:0); this.actorCanvases.set(entity.id, buffer); }
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
    if (this.art) this.art.foreground(state, this.camera);
    this.drawEffects(ctx, state, Boolean(opts.lowEffects));
    drawCombatEffects(ctx, state, Boolean(opts.lowEffects));
    drawPlayerProjectiles(ctx, state, Boolean(opts.lowEffects), castId => this.art?.projectileOrigin?.(castId));
    drawTerritoryCannonShots(ctx,state,Boolean(opts.lowEffects));
    drawExpeditionProjectiles(ctx,state,this.labels);
    this.growthVisuals.drawMarks(ctx, state, state.growth);
    this.growthVisuals.drawProtocolHits(ctx, state, state.growth, this.labels);
    drawTerritoryInvaders(ctx, state, this.labels, territoryViewport);
    drawPlayerInfection(ctx, state, Boolean(opts.lowEffects));
    drawPlayerDamage(ctx,state,Boolean(opts.lowEffects));
    if (state.battle) {
      drawEncounterDangers(ctx, state, Boolean(opts.lowEffects), this.labels);
      this.drawBattleDangers(ctx, state);
      drawEnemyTacticDangers(ctx, state, this.labels);
      const mother = visibleTerritory(state)?.bossCombat ?? state.campaign?.core.combat;
      if (mother) drawMotherCoreDangers(ctx, state, mother, this.labels);
      const labelTargets = state.targets.filter(target => target.role !== 'event' && (!this.territoryFrame || target.role !== 'source'
        || Math.hypot(target.x - state.player.x, target.y - state.player.y) <= 440 && (() => { const p = this.camera.worldToScreen(target); return p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height; })()));
      drawBattleLabels(ctx, labelTargets.length === state.targets.length ? state : { ...state, targets: labelTargets }, this.labels);
      drawHostEventLabels(state, this.labels);
      this.drawTissueMarker(ctx, state);
    }
    this.territoryLabelled = drawTerritoryNodeAccents(ctx, state, this.territoryFrame, territoryViewport, this.labels, !!this.canvas.ownerDocument?.body?.classList.contains('touch-mode'));
    if (!this.art) drawPlayerPresence(ctx, state, playerPresence(state, raisedActorBodies));
    this.drawCrosshair(ctx, state, aim, opts.authoritativeState ?? state, opts.aimRange, opts.aimCancelled);
    ctx.restore();
    this.territoryIndicators = drawTerritoryAttackIndicators(ctx, this.territoryFrame, territoryViewport);
    for (const indicator of this.territoryIndicators) this.labels.reserveScreen(indicator.rect);
    this.lastMarkers = territoryMarkerLayouts(state, this.territoryFrame, territoryViewport, !!this.canvas.ownerDocument?.body?.classList.contains('touch-mode'));
    for (const marker of this.lastMarkers) this.labels.reserveScreen(marker.rect);
    drawTerritoryMarkerIcons(ctx, this.lastMarkers);
    this.labels.draw(ctx);
    drawPlayerHealth(ctx, this.lastHealth);
    drawPlayerDangerOverlay(ctx,state,dangerLevel,this.width,this.height,
      this.camera.worldToScreen(state.player),Boolean(opts.lowEffects));
    if (this.art) this.art.raster('signals', this.signalCanvas!, 10000);
    const map = document.querySelector<HTMLCanvasElement>('#tactical-map');
    if (map && state.campaign) drawNavigationMap(map, state, { topLeft: this.camera.screenToWorld({ x: 0, y: 0 }), bottomRight: this.camera.screenToWorld({ x: this.width, y: this.height }) });
  }

  private paintEntity(ctx: CanvasRenderingContext2D, entity: {id: string; kind: string; index?: number}, state: GameState, raisedActorBodies: ReturnType<typeof getRaisedActorBodies>, low: boolean): void {
      if(['camp-station','player-construction','boss-loot'].includes(entity.kind))drawExpeditionFacilityFallback(ctx,state,entity.kind,entity.index);
      if (entity.kind === 'player') this.drawPlayer(ctx, state);
      if (entity.kind === 'target') this.drawTarget(ctx, state.targets[entity.index!], state);
      if (entity.kind === 'tissue') this.drawTissue(ctx, state);
      if (entity.kind === 'terminal') this.drawTerminal(ctx, state);
      if (entity.kind === 'obstacle') {
        const obstacle = activeWorld(state).obstacles.find(obstacle => obstacle.id === entity.id)!;
        const opacity = getRaisedObstacleOcclusion(state, obstacle, raisedActorBodies).upperOpacity;
        if (obstacle.id.startsWith('cover-')) drawLowCover(ctx, obstacle, obstacle.radius, fantasyOwnerAt(state, obstacle), lowPropOpacity(obstacle, obstacle.radius, raisedActorBodies));
        else this.drawFantasyObstacle(ctx, obstacle, fantasyOwnerAt(state, obstacle), opacity);
      }
      if (entity.kind === 'device') this.drawBattleDevice(ctx, state.battle!.graph.nodes.find(node => node.id === entity.id)!, state);
      if (entity.kind === 'territory-node') {
        const node = visibleTerritory(state)?.nodes.find(item => item.id === entity.id); if (!node) return;
        const bodies = raisedActorBodies.length ? raisedActorBodies : state.player.hp > 0 ? [{id:'player',kind:'player' as const,groundY:state.player.y,bodyBounds:playerVisualBounds(state)}] : [];
        drawFrontPlatform(ctx, node, lowPropOpacity(node, 34, bodies, true));
      }
      if (entity.kind === 'beacon') this.growthVisuals.drawBeacon(ctx, state, state.growth, this.labels, entity.id);
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
      : entity.kind === 'beacon' ? immuneLegions(state.growth).find(beacon => beacon.id === entity.id)
      : entity.kind === 'tissue' ? state.tissue : entity.kind === 'territory-node' ? visibleTerritory(state)?.nodes.find(node => node.id === entity.id) : state.battle!.graph.nodes.find(n => n.id === entity.id)!;
    if (!point) return;
    if (entity.kind === 'beacon') {
      const beacon = immuneLegions(state.growth).find(beacon => beacon.id === entity.id);
      if (!beacon || beacon.id !== entity.id || beacon.organId !== state.battle?.organId || beacon.until <= state.elapsed) return;
      if (beacon.mode !== 'patrol') this.reserveLabelPoint(point, halfWidth, above, 12);
      this.growthVisuals.drawBeaconLabel(ctx, state, state.growth, this.labels, entity.id); return;
    }
    this.reserveLabelPoint(point, halfWidth, above, 12);
    ctx.save(); ctx.globalAlpha = 0;
    if (entity.kind === 'tissue') this.drawTissue(ctx, state);
    if (entity.kind === 'device') this.drawBattleDevice(ctx, point as OrganNode, state,false);
    ctx.restore();
  }

  private reserveLabelPoint(point: Vec, halfWidth: number, above: number, below: number): void {
    const p = this.camera.worldToScreen(point), scale = this.camera.scale;
    this.labels.reserveScreen({ left: p.x - halfWidth * scale, right: p.x + halfWidth * scale,
      top: p.y - above * scale, bottom: p.y + below * scale });
  }

  private addEntityLabel(label: SceneLabel): void { this.labels.add(label); }


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
    // The approved terrain colours remain ungraded. Breathing is confined to
    // the real devices/flow cues, rather than a full-scene organ-colour wash.
  }


  private drawGroundSignals(ctx: CanvasRenderingContext2D, state: GameState, aim: Vec): void {
    const territory = visibleTerritory(state);
    if (state.battle) {
      if (territory) this.drawValvePreview(ctx, state, aim); else this.drawBattleGround(ctx, state, aim);
    }
    const tissue = state.tissue;
    ctx.save(); ctx.setLineDash([6, 9]);
    ellipse(ctx, tissue.x, tissue.y, tissue.radius + 15, tissue.radius + 15, '#7de5ba08', '#7de5ba45'); ctx.restore();
    if (!state.endless) ellipse(ctx, state.terminal.x, state.terminal.y, 68, 48, '#67ddea09', '#74d6d22b');
    if (state.phase === 'playing' && state.tool === 2) {
      const distance = Math.hypot(aim.x - state.player.x, aim.y - state.player.y);
      ctx.save(); ctx.setLineDash([5, 6]); ctx.lineWidth = 1.5;
      const radius = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth).areaRadius : BALANCE.areaRadius;
      ellipse(ctx, aim.x, aim.y, radius, radius, '#92f5e508', distance <= BALANCE.range ? '#a6f2e376' : '#f39c6270'); ctx.restore();
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
    this.drawValvePreview(ctx, state, aim);
  }

  private drawValvePreview(ctx: CanvasRenderingContext2D, state: GameState, aim: Vec): void {
    if(state.territory)return;
    const battle = state.battle!;
    const valve = battle.graph.nodes.find(node => node.kind === 'valve');
    if (valve && state.phase === 'playing' && Math.hypot(state.player.x - valve.x, state.player.y - valve.y) <= BALANCE.interactionRange) {
      const ready = state.elapsed >= battle.pulse.readyAt;
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

  private drawBattleDevice(ctx: CanvasRenderingContext2D, node: OrganNode, state: GameState,drawBody=true): void {
    if(state.territory && node.kind==='valve'){drawTerritoryCannon(ctx,state,this.renderAim,this.labels,drawBody);return;}
    const battle = state.battle!, time = state.elapsed;
    const near = Math.hypot(state.player.x - node.x, state.player.y - node.y) <= BALANCE.interactionRange;
    ctx.save(); ctx.translate(node.x, node.y); ctx.scale(1, 1 / .72);
    const territory = visibleTerritory(state), territoryNode = territory?.nodes.find(item => item.id === node.id);
    if (node.kind === 'healing' && territoryNode) {
      const infected = territoryNode.owner === 'infected', color = infected ? '#d0a4db' : '#c0e2bc';
      // Minimal fallback body; production uses the paired authored shrine.
      ellipse(ctx, 0, 3, 34, 12, infected ? '#65516c' : '#607c69', color);
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(20, -25); ctx.lineTo(0, -4); ctx.lineTo(-20, -25); ctx.closePath();
      ctx.fillStyle = infected ? '#85718f' : '#d0e5c6'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore(); return;
    }
    const flow = state.battle?.organId === 'lung' ? state.campaign?.arenas.lung.flow : undefined;
    if (node.kind === 'healing') {
      const infection = Math.max(0, Math.min(100, node.infection ?? 0)), occupied = infection >= 100;
      const color = occupied ? '#df8f9a' : infection > 0 ? '#ecc58e' : '#b3dec6';
      ellipse(ctx, 0, 4, 37, 13, '#315c5066', color);
      ctx.beginPath(); ctx.roundRect(-22, -40, 44, 39, 11); ctx.fillStyle = occupied ? '#885d70' : '#679486'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(-12, -25, 24, 7); ctx.fillRect(-3.5, -33, 7, 23);
      if (infection > 0) { ctx.beginPath(); ctx.arc(0, -20, 30, -Math.PI / 2, -Math.PI / 2 + TAU * infection / 100); ctx.strokeStyle = '#e5a98f'; ctx.lineWidth = 3; ctx.stroke(); }
      const healingNear = Math.hypot(state.player.x - node.x, state.player.y - node.y) <= 150;
      const wait = Math.max(0, (node.healReadyAt ?? 0) - time);
      this.addEntityLabel({ id: `device:${node.id}`, anchor: node, offset: { x: 0, y: healingNear ? -72 : 29 }, priority: healingNear ? 76 : infection > 0 ? 55 : 35, essential: healingNear,
        lines: [{ text: occupied ? '✚ 治疗点 · 已感染' : infection > 0 ? `✚ 治疗点 · 感染 ${Math.ceil(infection)}%` : '✚ 治疗点', color, size: 11 },
          { text: wait > 0 ? `恢复中 ${wait.toFixed(1)}s` : occupied ? state.endless ? '3 净化夺回 · 本次不回血 · 冷却4秒' : '3 + 点击 · 消耗 2 样本夺回' : healingNear ? '3 + 点击 · 快速净化 / 耐久 +25' : '靠近后用 3 治疗', color: '#d3e2cb', size: 10 }],
        bar: infection > 0 ? { ratio: infection / 100, color: '#d99a92', width: 55 } : undefined });
    } else if (node.id === 'airway' && flow) {
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
          ellipse(ctx, landing.x, landing.y, 18, 18, '#b8878720', '#865869'); ctx.setLineDash([]);
          line(ctx, [landing.x - 5, landing.y, landing.x + 5, landing.y], '#e5c9a4', 1.5);
          this.reserveLabelPoint(landing, 10, 10, 10);
          this.labels.add({ id: `split:${target.id}:${index}`, anchor: landing, offset: { x: 0, y: -25 * this.camera.yScale }, priority: 100, essential: true,
            lines: [{ text: `⋈ ${remaining.toFixed(1)}s`, color: '#f4d7a3', size: 11 }] });
          ctx.restore();
        }
      }
      if (target.role === 'core' && (visibleTerritory(state)?.bossCombat ?? state.campaign?.core.combat)?.coreId === target.id) continue;
      if (target.attackPlan) continue;
      if (target.hp <= 0 || !target.attackAim || (target.attackAt ?? 0) <= state.elapsed) continue;
      const center = target.attackAim, radius = target.attackRadius ?? BATTLE_BALANCE.attackRadius;
      this.reserveLabelPoint(center, 9, 9, 9);
      const remaining = (target.attackAt ?? 0) - state.elapsed;
      const progress = 1 - clamp(remaining / (target.attackWindup ?? BATTLE_BALANCE.attackWindup), 0, 1);
      ctx.save(); ctx.lineWidth = 2;
      ellipse(ctx, center.x, center.y, radius, radius, '#b8838324', '#835266');
      ctx.beginPath(); ctx.arc(center.x, center.y, radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * progress); ctx.strokeStyle = '#a36669'; ctx.lineWidth = 3; ctx.stroke();
      line(ctx, [center.x - 5, center.y - 4, center.x + 5, center.y + 4], '#e5c9a4', 2);
      line(ctx, [center.x - 5, center.y + 4, center.x + 5, center.y - 4], '#e5c9a4', 2);
      ctx.restore();
    }
  }

  private drawShadows(ctx: CanvasRenderingContext2D, state: GameState): void {
    for (const target of state.targets) if (target.hp > 0) ellipse(ctx, target.x + 3, target.y + (this.art ? 2 : 8), target.radius + 5, target.radius * (this.art ? .25 : .62), this.art ? '#71465d33' : '#180e2378');
    ellipse(ctx, state.player.x + 3, state.player.y + 3, 25, this.art ? 7 : 13, this.art ? '#49747b45' : '#100e218a');
    if(!isTerritoryPlayerAirborne(state))drawHeroContactShadow(ctx,state.player,this.art?.heroContact?.());
    ellipse(ctx, state.tissue.x + 4, state.tissue.y + 3, 54, this.art ? 13 : 28, this.art ? '#754a6333' : '#150e2266');
    ellipse(ctx, state.terminal.x + 4, state.terminal.y + 3, 47, this.art ? 12 : 24, this.art ? '#754a6333' : '#160d2366');
    for (const o of activeWorld(state).obstacles) ellipse(ctx, o.x + 4, o.y + (this.art ? 2 : 15), o.radius + 8, o.radius * (this.art ? .22 : .7), this.art ? '#754a6333' : '#160e2277');
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, state: GameState): void {
    const p = state.player, time = state.elapsed;
    const base=playerBodyPose(state),gait=this.locomotion.current;
    const walk=gait.moving?Math.sin(gait.cycle*TAU):0,bob=gait.moving?Math.abs(walk)*1.2:0,direction=base.direction;
    ctx.save(); ctx.translate(p.x, p.y-territoryPlayerFlightHeight(state)/.72); ctx.scale(1, 1 / .72);
    // The HUD owns equipment badges. The small battlefield body keeps one
    // large visor, two eyes and a medical cross rather than floating emblems.
    ctx.save(); ctx.translate(0, -bob);
    ctx.fillStyle = '#8eb29a'; ctx.strokeStyle = '#52756b'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.roundRect(-23, -39, 14, 25, 6); ctx.fill(); ctx.stroke();
    ellipse(ctx, -11, -3 + walk * 2, 9, 6, '#a9bfae', '#52756b');
    ellipse(ctx, 11, -3 - walk * 2, 9, 6, '#c7d4bd', '#52756b');
    ctx.beginPath(); ctx.roundRect(-17, -43, 34, 32, 12); ctx.fillStyle = '#eee9d5'; ctx.fill(); ctx.strokeStyle = '#52756b'; ctx.stroke();
    line(ctx, [-5, -25, 5, -25], '#68967e', 4); line(ctx, [0, -30, 0, -20], '#68967e', 4);
    const head = PLAYER_HEAD_SHAPE;
    ellipse(ctx, head.x, head.y, head.rx, head.ry, '#f4eedb', '#52756b');
    ctx.beginPath(); ctx.roundRect(-17, -53, 34, 19, 9); ctx.fillStyle = '#38535a'; ctx.fill();
    ellipse(ctx, -7, -44, 2.8, 4.5, '#dbe5cc'); ellipse(ctx, 7, -44, 2.8, 4.5, '#dbe5cc');
    ellipse(ctx, -21, -45, 3.5, 5, '#b4c9b6', '#52756b'); ellipse(ctx, 21, -45, 3.5, 5, '#b4c9b6', '#52756b');
    ellipse(ctx, 15, -61, 3, 3, state.scanUntil > time ? '#dfd7a2' : '#94b59c');
    // Arm and tool tether to a ground-plane muzzle: no aim/hit parallax.
    const mx = Math.cos(direction) * 24, my = Math.sin(direction) * 24;
    strokeCurve(ctx, [12, -25, 24, -15, mx - 4, my - 5, mx, my], '#c8d3b9', 8);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(direction);
    ctx.fillStyle = '#a3b896'; ctx.strokeStyle = '#52715d'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.roundRect(-11, -7, 29, 14, 5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-6, -13, 13, 10, 4); ctx.fillStyle = '#d6dec1'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#527b67'; ctx.fillRect(12, -4, 8, 8);
    if (p.actionUntil > time) ellipse(ctx, 23, 0, 4, 3, '#eee6c3');
    ctx.restore();
    ctx.restore();
    if (p.hurtUntil > time) { ctx.globalAlpha = .5; ellipse(ctx, 0, -35, 30, 40, '#b86d6530', '#a86b64'); }
    if (p.dashUntil > time) {
      ellipse(ctx, -31, -16, 3, 2, '#b7caa7'); ellipse(ctx, -40, -15, 2, 1.5, '#d9dfbe');
    }
    ctx.restore();
  }

  private drawTarget(ctx: CanvasRenderingContext2D, target: Target, state: GameState): void {
    if (drawSmartVirusFallback(ctx,target,state)) return;
    if (drawHostEventTarget(ctx, target, state)) return;
    // The training fallback and combat share the same short-bud family.
    drawBattleTarget(ctx, target, state);
    if (state.battle || target.hp <= 0) return;
    ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
    const r = target.radius, isCluster = target.kind === 'cluster';
    const barY = -r * 1.8 - 10;
    ctx.fillStyle = '#6c5460'; ctx.beginPath(); ctx.roundRect(-r, barY, r * 2, 4, 2); ctx.fill();
    ctx.fillStyle = '#dab99a'; ctx.beginPath(); ctx.roundRect(-r, barY, Math.max(1, r * 2 * target.hp / target.maxHp), 4, 2); ctx.fill();
    if (target.scanned || state.scanUntil > state.elapsed) {
      text(ctx, isCluster ? '群聚训练体 · 范围裂解' : '单体训练靶 · 精确净化', 0, barY - 8, '#f0d3ad', 10);
    }
    ctx.restore();
  }

  private drawTissue(ctx: CanvasRenderingContext2D, state: GameState): void {
    const tissue = state.tissue, ratio = tissue.hp / tissue.maxHp, territory = visibleTerritory(state);
    ctx.save(); ctx.translate(tissue.x, tissue.y); ctx.scale(1, 1 / .72);
    // Geometry fallback only; the core is an independent facility, never the
    // mother actor or an infection-colour substitute for missing HP.
    ellipse(ctx, 0, 3, 43, 17, '#567b6766', '#b4caa2');
    ctx.beginPath(); ctx.moveTo(0, -66); ctx.lineTo(30, -31); ctx.lineTo(0, -5); ctx.lineTo(-30, -31); ctx.closePath();
    ctx.fillStyle = '#d5dfbb'; ctx.fill(); ctx.strokeStyle = '#719b88'; ctx.lineWidth = 2; ctx.stroke();
    const near = Math.hypot(tissue.x - state.player.x, tissue.y - state.player.y) <= BALANCE.range;
    if (state.battle && !territory) this.labels.add({ id: 'tissue', anchor: tissue, offset: { x: 0, y: 35 }, priority: 75, essential: true,
      lines: [{ text: territory ? `♥ 心核完整度 ${Math.round(ratio * 100)}%` : ratio >= 1 ? '✚ 组织修复完成' : `✚ 组织 ${Math.round(ratio * 100)}%`,
        color: ratio >= .5 ? '#c9e9c4' : '#f0b5a4', size: 12 },
        ...(near && ratio < 1 ? [{ text: territory ? '3 · 瞄准心核修复' : '3 · 瞄准组织修复', color: '#d3dfc7', size: 10 }] : [])],
      bar: { ratio, color: ratio >= .5 ? '#a5cba8' : '#d58d7e', width: 74 } });
    else if (!state.battle) {
      ctx.fillStyle = '#567766'; ctx.fillRect(-37, 12, 74 * ratio, 4);
      text(ctx, ratio >= 1 ? '组织修复完成' : `受损组织 ${Math.round(ratio * 100)}%`, 0, 35, '#c9e9c4', 12);
    }
    ctx.restore();
  }

  private drawTissueMarker(ctx: CanvasRenderingContext2D, state: GameState): void {
    if (visibleTerritory(state)) return;
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


  private drawFantasyObstacle(ctx: CanvasRenderingContext2D, obstacle: { x: number; y: number; radius: number }, owner: 'healthy' | 'infected', opacity = 1): void {
    ctx.save(); ctx.translate(obstacle.x, obstacle.y); ctx.scale(1, 1 / .72);
    const r = obstacle.radius;
    drawRaisedBodyLayers(ctx, r, opacity, () => {
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(-r * .72, -r * .68); ctx.lineTo(-r * .16, -r * 1.15);
      ctx.lineTo(r * .62, -r * .86); ctx.lineTo(r, -r * .12); ctx.lineTo(r * .54, r * .16); ctx.closePath();
      ctx.fillStyle = owner === 'healthy' ? '#8e9c8a' : '#796d84'; ctx.fill();
      ctx.strokeStyle = owner === 'healthy' ? '#bbc6ab' : '#a190af'; ctx.lineWidth = 2; ctx.stroke();
    });
    ctx.restore();
  }


  private drawEffects(ctx: CanvasRenderingContext2D, state: GameState, low: boolean): void {
    for (const effect of state.effects) {
      // Dense challenge hits are merged from accepted receipts in combatEffects.
      if (state.endless && effect.kind === 'hit') continue;
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
        // A fine muted connection retains the accepted hitscan endpoint. The
        // moving cream drop carries the action without a luminous laser bar.
        const travel=Math.min(1,progress*2),point={x:origin.x+(effect.to.x-origin.x)*travel,y:origin.y+(effect.to.y-origin.y)*travel};
        const angle=Math.atan2(effect.to.y-origin.y,effect.to.x-origin.x),tail=Math.min(35,Math.hypot(point.x-origin.x,point.y-origin.y));
        const points=[point.x-Math.cos(angle)*tail,point.y-Math.sin(angle)*tail,point.x,point.y];
        line(ctx,points,'#254a48',7);line(ctx,points,'#fff8d4',3.5);
        this.drawAntibody(ctx,point,angle);
        if(age<.08){ctx.lineWidth=2;ellipse(ctx,origin.x,origin.y,9,7,'#fff8d4','#315b51');}
      } else if (effect.kind === 'scan') {
        ctx.lineWidth = 2; ellipse(ctx, effect.from.x, effect.from.y, effect.radius * progress, effect.radius * progress, '#a5bb9008', '#567d68');
        if (!low) for (let i = 0; i < 6; i++) {
          const angle = i / 6 * TAU, radius = effect.radius * progress;
          ellipse(ctx, effect.from.x + Math.cos(angle) * radius, effect.from.y + Math.sin(angle) * radius, 2.5, 2.5, '#eee4c2');
        }
      } else if (effect.kind === 'burst') {
        ctx.lineWidth = 2; ellipse(ctx, effect.to.x, effect.to.y, effect.radius, effect.radius, '#a0bb9215', '#618b6e');
        ellipse(ctx, effect.to.x, effect.to.y, Math.max(1, effect.radius * progress), Math.max(1, effect.radius * progress), '#eae1bd09', '#c0c9a4');
        if (!low) this.sparks(ctx, effect, progress, '#d4dab5', 7);
      } else if (effect.kind === 'heal') {
        ctx.lineWidth = effect.repairSucceeded ? 2 : 1.5;
        const radius = effect.repairSucceeded ? 44 + progress * 17 : 10 + progress * 12;
        ellipse(ctx, effect.to.x, effect.to.y, radius, radius, '#a4be9010', effect.repairSucceeded ? '#6e956d' : '#7a9b7a');
        if (effect.repairSucceeded) {
          const y = effect.to.y - progress * 38;
          line(ctx, [effect.to.x - 8, y, effect.to.x + 8, y], '#496f58', 5); line(ctx, [effect.to.x, y - 11, effect.to.x, y + 11], '#496f58', 5);
          line(ctx, [effect.to.x - 8, y, effect.to.x + 8, y], '#f4e9bf', 2.5); line(ctx, [effect.to.x, y - 11, effect.to.x, y + 11], '#f4e9bf', 2.5);
          if (!low) this.sparks(ctx, effect, progress, '#b0c69b', 5);
        }
      } else if (effect.kind === 'hit') {
        this.sparks(ctx, effect, progress, '#eee0b8', low ? 3 : 6);
      } else if (effect.kind === 'dash') {
        line(ctx, [effect.from.x, effect.from.y, effect.to.x, effect.to.y], '#87a98b66', 4 * (1 - progress) + 1);
      } else if (effect.kind === 'success') {
        ellipse(ctx, effect.to.x, effect.to.y, effect.radius * progress, effect.radius * progress, '#c0d0a508', '#8ba678');
        if (!low) this.sparks(ctx, effect, progress, '#e7d5a4', 12);
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
        line(ctx, [effect.from.x, effect.from.y, effect.to.x, effect.to.y], '#648b706e', 1.5);
        this.drawAntibody(ctx, effect.to, angle);
      }
      ctx.restore();
    }
  }

  private sparks(ctx: CanvasRenderingContext2D, effect: Effect, progress: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = hash(effect.id * 20 + i) * TAU, distance = (7 + hash(i + effect.id) * 26) * progress;
      const x = effect.to.x + Math.cos(a) * distance, y = effect.to.y + Math.sin(a) * distance;
      ellipse(ctx, x, y, 1.5 + (1 - progress), 1.2 + (1 - progress) * .5, color);
    }
  }

  private drawAntibody(ctx: CanvasRenderingContext2D, position: Vec, angle: number): void {
    ctx.save(); ctx.translate(position.x, position.y); ctx.rotate(angle);
    ellipse(ctx, 0, 0, 5.5, 3.5, '#e9e0c1', '#6a947a'); ctx.restore();
  }

  private drawCrosshair(ctx: CanvasRenderingContext2D, state: GameState, aim: Vec, authoritativeState: GameState, range?: number, cancelled = false): void {
    if (state.phase !== 'playing') { this.lastCrosshair = null; return; }
    const status = cancelled ? 'blocked' : crosshairStatus(authoritativeState, aim, range);
    this.lastCrosshair = { status, aim: { ...aim } };
    const color = cancelled ? '#f5a595' : status === 'in-range' ? state.tool === 3 ? '#b5f7c2' : '#b2f8eb' : '#ddb58a';
    ctx.save(); ctx.translate(aim.x, aim.y); ctx.scale(1, 1 / .72);
    ctx.lineWidth = 1.3; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, 9, .15, 1.4); ctx.arc(0, 0, 9, 1.7, 2.95); ctx.arc(0, 0, 9, 3.3, 4.55); ctx.arc(0, 0, 9, 4.85, 6.1); ctx.stroke();
    line(ctx, [-15, 0, -11, 0], color); line(ctx, [11, 0, 15, 0], color); line(ctx, [0, -15, 0, -11], color); line(ctx, [0, 11, 0, 15], color);
    ellipse(ctx, 0, 0, 1.4, 1.4, color); ctx.restore();
  }
}
