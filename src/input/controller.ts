import { BALANCE, type GameState, type InputFrame, type Tool, type Vec } from '../game/types';
import { TRACTION_BALANCE } from '../game/traction';
import { territoryCannonAim, territoryCannonView } from '../game/territoryCannon';
import type { WeaponSkillSlot, WeaponSkillView } from '../game/weaponSkillsTypes';
export const BINDINGS = [
  ['W A S D', '八向移动'], ['鼠标 / 左键', '瞄准 / 使用工具'], ['Space', '冲刺 · 1.5秒冷却'],
  ['Q', '脚下驻防 / 扫描'], ['B', '蓝图与军团建设'], ['R', '注射抗体 · 消耗1支'], ['1', '精确净化'], ['2', '范围清除'], ['3', '附近净化 / 组织修复'], ['E', '靠近已建弹射荚，按住瞄准、松手弹射'], ['Esc', '暂停 / 继续'],
];
export const TERRITORY_BINDINGS = [
  ['W A S D', '八向移动'], ['鼠标 / 左键', '瞄准 / 普通射击'], ['Space', '冲刺'],
  ['1 / 2 / 3', '当前武器的三个技能'], ['F', '附近净化 / 抢修心核'], ['Q', '脚下驻防'],
  ['B', '蓝图与军团建设'], ['R', '注射抗体'], ['E', '靠近设施交互'], ['Esc', '暂停 / 继续'],
];
export type GameAction = 'dash' | 'scan' | 'interact' | 'antibody' | 'territory';
export type ScreenToWorld = (point: Vec) => Vec;
export type AimState = Pick<GameState, 'player' | 'tool'> & Partial<Pick<GameState, 'endless' | 'territory' | 'playerFlight'>>;
export type TouchState = AimState & Partial<Pick<GameState, 'elapsed' | 'traction' | 'endlessGrowth'>>;
export type SkillKind = 2 | 3 | 'scan';
export interface SkillPresentation {
  kind: SkillKind | 'charge' | 'cannon' | 'weapon'; aim: Vec; range: number; cancelled: boolean; phase: 'preview' | 'guiding';
  weaponSlot?: WeaponSkillSlot;
  origin?: Vec; radius?: number;
  valid?: boolean; hint?: string;
}
export interface TouchPresentation { aim: Vec; tool: Tool; preview?: SkillPresentation }
type PreviewAim = { mode: 'world'; point: Vec } | { mode: 'stick'; vector: Vec };
interface SkillPreview { kind: SkillKind; aim: PreviewAim; cancelled: boolean }
interface SkillCommand { kind: SkillKind; aim: Vec; guide?: boolean }
interface WeaponSkillPreview { slot: WeaponSkillSlot; aim: PreviewAim; cancelled: boolean; range: number; radius: number; aimMode: WeaponSkillView['aim'] }
interface GuideInput { aim: Vec; initialAim: Vec; held: boolean; started: boolean; castId?: string }
export const TOUCH_AIM = { deadZone: .15, range: 650 } as const;
type AimSource = 'mouse' | 'stick' | 'world';
const finite = (point: Vec) => Number.isFinite(point.x) && Number.isFinite(point.y);

export class Controller {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private actions = new Set<GameAction>();
  private mousePointer: number | undefined;
  private mouseHeld = false;
  private mouseBlocked = false;
  private castHeld = false;
  private castBlocked = false;
  private mousePressed = false;
  private castStep = false;
  private castEdges: boolean[] = [];
  private releaseBarrier = false;
  private practiceHit = false;
  private tool: Tool | undefined;
  private activeTool: Tool = 1;
  private territoryMode = false;
  private airborne = false;
  private touchMove: Vec = { x: 0, y: 0 };
  private touchAim: Vec = { x: 0, y: 0 };
  private touchAimRange = TOUCH_AIM.range as number;
  private touchAimAutoFire = true;
  private attackHeld = false;
  private attackPressed = false;
  private attackBlocked = false;
  private skillPreview: SkillPreview | undefined;
  private skillCommands: SkillCommand[] = [];
  private skillRelease: { tool: Tool; aim: Vec } | undefined;
  private weaponSkillPreview: WeaponSkillPreview | undefined;
  private weaponSkillCommands: { slot: WeaponSkillSlot; aim?: Vec }[] = [];
  private guide: GuideInput | undefined;
  private aimSource: AimSource = 'mouse';
  private worldAim: Vec | undefined;
  private lastAim: Vec | undefined;
  private gated = false;
  private chargeEnabled = false;
  private chargeOwner: 'keyboard' | 'touch' | undefined;
  private chargePressed = false;
  private chargeReleased = false;
  private chargeCancelled = false;
  private chargeAim: Vec | undefined;
  private chargePreviewCancelled = false;
  private cannonOwner: 'keyboard' | 'touch' | undefined;
  private cannonBuildingId: string | undefined;
  private cannonPressed = false;
  private cannonReleased = false;
  private cannonCancelled = false;
  private cannonPreviewCancelled = false;
  private cannonAim: Vec | undefined;
  private cannonDisplayAim: Vec | undefined;
  private cannonPointer: Vec | undefined;
  private cannonOrigin: Vec | undefined;
  private cannonRange = 1100;
  private cannonRadius = 240;
  private scanCommand: Vec | undefined;
  private readonly clearListeners = new Set<() => void>();
  pointer: Vec = { x: innerWidth / 2, y: innerHeight / 2 };
  constructor(private readonly canvas: HTMLCanvasElement, onPause: () => void, onBlur: () => void,
    private readonly acceptsGameInput: () => boolean = () => true,
    private readonly gameState?: () => GameState) {
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable)) return;
      if (e.code === 'Escape') { if (!e.repeat) onPause(); return; }
      if (!this.accepts() || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      const fresh = !this.keys.has(e.code);
      if (fresh) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (fresh && e.code === 'Space' && this.chargeEnabled && !this.isTerritory() && !this.chargeOwner) {
        this.chargeOwner = 'keyboard'; this.chargePressed = true; this.chargeAim = undefined;
      }
      if (fresh && e.code === 'KeyE' && this.territoryMode && !this.cannonOwner && !this.weaponSkillPreview && !this.skillPreview && !this.guide && this.cannonUsable()) {
        this.cannonOwner = 'keyboard'; this.cannonPressed = true; this.cannonCancelled = false; this.cannonReleased = false;
        this.cannonBuildingId = this.gameState?.().territory?.construction?.building?.id;
        this.cannonAim = undefined; this.cannonDisplayAim = undefined; this.cannonPointer = undefined;
      }
      if (/^Digit[123]$/.test(e.code)) this.select(Number(e.code.at(-1)) as Tool);
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'Space' && this.chargeOwner === 'keyboard') this.endCharge(false);
      if (e.code === 'KeyE' && this.cannonOwner === 'keyboard') this.endCannon(false);
    });
    const updatePointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = canvas.getBoundingClientRect(); this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.aimSource = 'mouse';
    };
    canvas.addEventListener('pointermove', updatePointer);
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      if (this.mousePointer !== undefined && this.mousePointer !== e.pointerId) return;
      updatePointer(e);
      if (e.button === 0 && this.accepts()) {
        this.mousePointer = e.pointerId;
        this.mouseHeld = true; this.mousePressed = true;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    const releaseMouse = (e: PointerEvent) => {
      if (e.pointerId !== this.mousePointer) return;
      this.mousePointer = undefined; this.mouseHeld = false; this.mouseBlocked = false;
      if (e.type !== 'pointerup') this.mousePressed = false;
      this.releaseCapture(e.pointerId);
    };
    window.addEventListener('pointerup', releaseMouse);
    canvas.addEventListener('pointercancel', releaseMouse);
    canvas.addEventListener('lostpointercapture', releaseMouse);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => { this.clear(); onBlur(); });
    window.addEventListener('pagehide', () => { this.clear(); onBlur(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); onBlur(); } });
  }

  private accepts(): boolean {
    if (this.acceptsGameInput() && !this.airborne) { this.gated = false; return true; }
    if (!this.gated) { this.gated = true; this.clear(); }
    return false;
  }

  private isTerritory(): boolean { return this.gameState ? !!this.gameState().territory : this.territoryMode; }

  private releaseCapture(pointerId: number): void {
    try { if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId); } catch { /* The browser may already have cancelled it. */ }
  }

  select(tool: Tool): void {
    if (!this.accepts() || ![1, 2, 3].includes(tool)) return;
    if (this.isTerritory()) { this.queueWeaponSkill(tool); return; }
    if (this.activeTool !== tool) this.endCharge(true);
    if (this.activeTool !== tool && this.castHeld) { this.castBlocked = true; this.castEdges = []; this.castStep = false; }
    this.activeTool = tool; this.tool = tool;
  }

  /** Context interaction is separate from the held weapon and its aim/fire. */
  setTerritoryMode(enabled: boolean): void {
    if (this.territoryMode !== enabled) this.actions.delete('territory');
    if (!enabled && this.cannonOwner) this.endCannon(true);
    if (!enabled) { this.weaponSkillPreview = undefined; this.weaponSkillCommands = []; }
    this.territoryMode = enabled;
  }

  queueAction(action: GameAction): void { if (this.accepts()) this.actions.add(action); }
  queuePracticeHit(): void { if (this.accepts()) this.practiceHit = true; }

  /** Weapon skills are commands, never tool selection or primary-aim ownership. */
  queueWeaponSkill(slot: WeaponSkillSlot, aim?: Vec): void {
    if (!this.accepts() || !this.isTerritory() || ![1, 2, 3].includes(slot) || aim && !finite(aim)) return;
    // Keep one immediate intent per simulation frame. Rapid keys never queue a
    // sequence that could fire later, and a facility gesture owns its preview.
    if (this.weaponSkillCommands.length || this.cannonOwner || this.skillPreview || this.guide || this.chargeOwner || this.weaponSkillPreview && !aim) return;
    this.weaponSkillCommands.push({ slot, ...(aim ? { aim: { ...aim } } : {}) });
  }

  beginWeaponSkillPreview(slot: WeaponSkillSlot, point: Vec, view: Pick<WeaponSkillView, 'range' | 'radius' | 'aim'>): boolean {
    if (!this.accepts() || !this.isTerritory() || !finite(point) || this.weaponSkillPreview || this.cannonOwner || this.skillPreview || this.guide || this.chargeOwner) return false;
    this.weaponSkillPreview = { slot, aim: { mode: 'world', point: { ...point } }, cancelled: false,
      range: view.range, radius: view.radius, aimMode: view.aim };
    return true;
  }

  /** Cannon and garrison aim never replace the held primary weapon's aim. */
  queueScanAt(aim: Vec): void { if (this.accepts() && finite(aim)) this.scanCommand = { ...aim }; }

  beginTouchCannon(aim: Vec, origin: Vec, range = 1100, radius = 240): boolean {
    if (!this.accepts() || this.cannonOwner || this.weaponSkillPreview || this.skillPreview || this.guide || this.chargeOwner || !finite(aim) || !finite(origin) || !this.cannonUsable()) return false;
    const view = territoryCannonView(this.gameState!());
    this.cannonOwner = 'touch'; this.cannonPressed = true; this.cannonPreviewCancelled = false; this.cannonCancelled = false; this.cannonReleased = false;
    this.cannonBuildingId = view.buildingId;
    this.cannonAim = { ...aim }; this.cannonOrigin = { ...view.origin }; this.cannonRange = view.range; this.cannonRadius = view.radius;
    return true;
  }
  updateTouchCannon(aim: Vec, cancelled = false): void {
    if (this.cannonOwner !== 'touch') return;
    if (finite(aim)) this.cannonAim = { ...aim };
    this.cannonPreviewCancelled = cancelled;
  }
  endTouchCannon(cancelled = false): void {
    if (this.cannonOwner === 'touch') this.endCannon(cancelled || this.cannonPreviewCancelled);
  }
  private endCannon(cancelled: boolean): void {
    if (!this.cannonOwner) return;
    if (this.gameState && !this.cannonUsable()) cancelled = true;
    // Rendering may have moved the camera since the last fixed step. Release
    // the last displayed ground marker instead of remapping an old pointer.
    if (!cancelled && this.cannonOwner === 'keyboard' && this.cannonDisplayAim) this.cannonAim = { ...this.cannonDisplayAim };
    this.cannonOwner = undefined;
    this.cannonCancelled = cancelled; this.cannonReleased = !cancelled;
    if (cancelled) this.cannonPressed = false;
    this.cannonPreviewCancelled = false;
  }

  private cannonUsable(snapshot?: TouchState): boolean {
    const state = this.gameState?.() ?? snapshot;
    if (!state?.territory) return false;
    const game = state as GameState, view = territoryCannonView(game);
    return game.phase === 'playing' && game.player.hp > 0 && game.tissue.hp > 0
      && game.territory?.stage !== 'victory' && view.exists && view.enabled && view.nearby && view.ready && !view.airborne
      && (!(this.cannonOwner || this.cannonReleased) || !this.cannonBuildingId || this.cannonBuildingId === view.buildingId);
  }

  beginTouchCharge(state: AimState, aim: Vec): void {
    this.chargeEnabled = !!state.endless && !state.territory;
    if (!this.accepts() || !this.chargeEnabled || this.chargeOwner || !finite(aim)) return;
    this.chargeOwner = 'touch'; this.chargePressed = true; this.chargeAim = { ...aim };
    this.chargePreviewCancelled = false; this.actions.add('dash');
  }

  updateTouchCharge(aim: Vec, cancelled = false): void {
    if (this.chargeOwner !== 'touch') return;
    if (finite(aim)) this.chargeAim = { ...aim };
    this.chargePreviewCancelled = cancelled;
  }

  endTouchCharge(cancelled = false): void {
    if (this.chargeOwner === 'touch') this.endCharge(cancelled || this.chargePreviewCancelled);
  }

  private endCharge(cancelled: boolean): void {
    if (!this.chargeOwner) return;
    this.chargeOwner = undefined;
    if (cancelled) { this.chargeCancelled = true; this.chargePressed = false; this.chargeReleased = false; }
    else this.chargeReleased = true;
    this.chargePreviewCancelled = false;
  }

  setTouchMove(vector: Vec): void {
    if (this.accepts() && finite(vector)) this.touchMove = { ...vector };
  }

  /** The vector uses the stick's CSS-pixel axes and unit travel radius. */
  setTouchAim(vector: Vec, range: number = TOUCH_AIM.range, autoFire = true): void {
    if (!this.accepts() || !finite(vector)) return;
    this.touchAim = { ...vector }; this.touchAimRange = range; this.touchAimAutoFire = autoFire;
    if (Math.hypot(vector.x, vector.y) > TOUCH_AIM.deadZone) this.aimSource = 'stick';
    else if (this.aimSource === 'stick') {
      this.worldAim = this.lastAim && { ...this.lastAim }; this.aimSource = 'world';
    }
  }

  setWorldAim(point: Vec): void {
    if (!this.accepts() || !finite(point)) return;
    this.worldAim = { ...point }; this.lastAim = { ...point }; this.aimSource = 'world';
  }

  releaseTouchAim(state: AimState, screenToWorld: ScreenToWorld): void {
    const point = this.getAim(state, screenToWorld);
    this.touchAim = { x: 0, y: 0 };
    if (this.aimSource === 'stick') { this.worldAim = point; this.aimSource = 'world'; }
  }

  setTouchCast(held: boolean, cancelled = false): void {
    if (!held) {
      if (cancelled) { this.castEdges = []; this.castStep = false; }
      else if (this.castHeld && !this.castBlocked) this.castEdges.push(false);
      this.castHeld = false; this.castBlocked = false; return;
    }
    if (!this.accepts() || this.castHeld) return;
    this.castHeld = true; this.castEdges.push(true);
  }

  /** A primary press fires at the current exact point until a real drag retargets it. */
  setTouchAttack(held: boolean, cancelled = false): void {
    if (!held) { this.attackHeld = false; this.attackBlocked = false; if (cancelled) this.attackPressed = false; return; }
    if (!this.accepts() || this.attackHeld) return;
    this.attackHeld = true;
    this.attackBlocked = !!this.skillPreview && !(this.skillPreview.kind === 'scan' && this.territoryMode) || !!this.guide;
    this.attackPressed = !this.attackBlocked;
  }

  setTouchAttackAim(vector: Vec): void {
    if (!this.attackHeld || this.attackBlocked || this.skillPreview && !(this.skillPreview.kind === 'scan' && this.territoryMode) || this.guide) return;
    this.setTouchAim(vector, BALANCE.range, false);
  }

  beginSkillPreview(kind: SkillKind, point: Vec): void {
    if (!this.accepts()) return;
    if (kind === 'scan' && this.territoryMode) { this.actions.add('scan'); return; }
    if (!finite(point)) return;
    if (!(kind === 'scan' && this.territoryMode)) this.endCharge(true);
    this.skillPreview = { kind, aim: { mode: 'world', point: { ...point } }, cancelled: false };
    if (kind === 'scan' && this.territoryMode) return;
    // A skill owns firing until that gesture ends. Old held fingers must be
    // released before they can start primary fire again after the skill.
    if (this.attackHeld) this.attackBlocked = true;
    if (this.mouseHeld) this.mouseBlocked = true;
    if (this.castHeld) this.castBlocked = true;
    this.mousePressed = false; this.attackPressed = false; this.castEdges = []; this.castStep = false; this.touchAimAutoFire = false;
  }

  setSkillPreviewVector(vector: Vec): void {
    if (!this.accepts() || !finite(vector)) return;
    if (this.weaponSkillPreview) this.weaponSkillPreview.aim = { mode: 'stick', vector: { ...vector } };
    else if (this.skillPreview) this.skillPreview.aim = { mode: 'stick', vector: { ...vector } };
  }

  setSkillPreviewPoint(point: Vec): void {
    if (!this.accepts() || !finite(point)) return;
    if (this.weaponSkillPreview) this.weaponSkillPreview.aim = { mode: 'world', point: { ...point } };
    else if (this.skillPreview) this.skillPreview.aim = { mode: 'world', point: { ...point } };
  }

  setSkillCancelled(cancelled: boolean): void { if (this.weaponSkillPreview) this.weaponSkillPreview.cancelled = cancelled; else if (this.skillPreview) this.skillPreview.cancelled = cancelled; }
  cancelSkillPreview(): void { this.weaponSkillPreview = undefined; this.skillPreview = undefined; }

  private skillRange(kind: SkillKind): number { return kind === 2 ? TRACTION_BALANCE.range : kind === 3 ? BALANCE.range : BALANCE.scanRadius; }

  private resolveVector(vector: Vec, range: number, state: AimState, screenToWorld: ScreenToWorld): Vec {
    const length = Math.hypot(vector.x, vector.y);
    const origin = screenToWorld({ x: 0, y: 0 }), projected = screenToWorld(vector);
    const dx = projected.x - origin.x, dy = projected.y - origin.y, worldLength = Math.hypot(dx, dy);
    const radius = Math.max(0, Math.min(1, (length - TOUCH_AIM.deadZone) / (1 - TOUCH_AIM.deadZone))) * range;
    return worldLength > 0 ? { x: state.player.x + dx / worldLength * radius, y: state.player.y + dy / worldLength * radius } : { x: state.player.x, y: state.player.y };
  }

  resolvePreview(state: TouchState, screenToWorld: ScreenToWorld): SkillPresentation | undefined {
    if (this.cannonOwner && !this.cannonUsable(state)) { this.endCannon(true); return; }
    const cannonState = this.gameState?.() ?? state as GameState;
    if (this.cannonOwner === 'keyboard' && state.territory) {
      const cannon = territoryCannonView(cannonState);
      // A stationary mouse owns a world target while the remote camera pulls
      // back. Only a real pointer movement may retarget the held cannon.
      const moved = !this.cannonPointer || this.pointer.x !== this.cannonPointer.x || this.pointer.y !== this.cannonPointer.y;
      const aim = this.cannonDisplayAim && !moved ? this.cannonDisplayAim : this.getAim(state, screenToWorld);
      const acceptedAim = territoryCannonAim(cannonState, aim), displayAim = acceptedAim ?? aim;
      this.cannonDisplayAim = { ...displayAim };
      this.cannonPointer = { ...this.pointer };
      return { kind: 'cannon', aim: displayAim, origin: { ...cannon.origin },
        range: cannon.range, radius: cannon.radius, valid: !!acceptedAim, hint: acceptedAim ? '松手弹射 · 落地冲击清群' : '落点受阻 · 调整方向',
        cancelled: !acceptedAim || !cannon.nearby || !cannon.ready, phase: 'preview' };
    }
    if (this.cannonOwner === 'touch' && this.cannonAim) {
      const acceptedAim = territoryCannonAim(cannonState, this.cannonAim);
      return { kind: 'cannon', aim: acceptedAim ?? { ...this.cannonAim },
      origin: this.cannonOrigin && { ...this.cannonOrigin }, range: this.cannonRange, radius: this.cannonRadius,
      valid: !!acceptedAim, hint: acceptedAim ? '松手弹射 · 落地冲击清群' : '落点受阻 · 调整方向',
      cancelled: this.cannonPreviewCancelled || !acceptedAim, phase: 'preview' };
    }
    if (this.chargeOwner === 'touch' && this.chargeAim) return { kind: 'charge', aim: { ...this.chargeAim }, range: 650, cancelled: this.chargePreviewCancelled, phase: 'preview' };
    const weapon = this.weaponSkillPreview;
    if (weapon) {
      let point = weapon.aimMode === 'self' ? { x: state.player.x, y: state.player.y }
        : weapon.aim.mode === 'world' ? { ...weapon.aim.point } : this.resolveVector(weapon.aim.vector, weapon.range, state, screenToWorld);
      const dx = point.x - state.player.x, dy = point.y - state.player.y, length = Math.hypot(dx, dy);
      if (weapon.range > 0 && length > weapon.range) point = { x: state.player.x + dx / length * weapon.range, y: state.player.y + dy / length * weapon.range };
      return { kind: 'weapon', weaponSlot: weapon.slot, aim: point, range: weapon.range, radius: weapon.radius,
        cancelled: weapon.cancelled, phase: 'preview' };
    }
    const preview = this.skillPreview;
    if (preview) return { kind: preview.kind, aim: preview.aim.mode === 'world' ? { ...preview.aim.point }
      : this.resolveVector(preview.aim.vector, this.skillRange(preview.kind), state, screenToWorld),
      range: this.skillRange(preview.kind), cancelled: preview.cancelled, phase: 'preview' };
    if (this.guide) return { kind: 2, aim: { ...this.guide.aim }, range: TRACTION_BALANCE.range, cancelled: false, phase: 'guiding' };
    return undefined;
  }

  getPresentation(state: TouchState, screenToWorld: ScreenToWorld): TouchPresentation {
    this.syncSkillGuide(state);
    const preview = this.resolvePreview(state, screenToWorld);
    const independent = preview?.kind === 'weapon' || preview?.kind === 'cannon' || preview?.kind === 'scan' && !!state.territory;
    return { aim: !independent && preview ? preview.aim : this.getAim(state, screenToWorld), tool: state.territory ? 1 : typeof preview?.kind === 'number' ? preview.kind : state.tool, preview };
  }

  commitSkillPreview(state: TouchState, screenToWorld: ScreenToWorld): void {
    if (!this.accepts()) return;
    const preview = this.resolvePreview(state, screenToWorld);
    if (this.weaponSkillPreview) {
      if (preview?.kind === 'weapon' && !preview.cancelled) this.queueWeaponSkill(this.weaponSkillPreview.slot, preview.aim);
      this.weaponSkillPreview = undefined; return;
    }
    if (!this.skillPreview || !preview || preview.kind === 'charge' || preview.kind === 'cannon' || preview.kind === 'weapon' || preview.cancelled) { this.cancelSkillPreview(); return; }
    if (preview.kind === 'scan' && this.territoryMode) {
      this.queueScanAt(preview.aim); this.skillPreview = undefined; return;
    }
    this.skillCommands.push({ kind: preview.kind, aim: { ...preview.aim } });
    this.skillPreview = undefined;
  }

  beginSkillGuide(state: TouchState, screenToWorld: ScreenToWorld): boolean {
    if (!this.accepts() || this.skillPreview?.kind !== 2 || this.skillPreview.cancelled || this.guide) return false;
    const preview = this.resolvePreview(state, screenToWorld)!;
    this.guide = { aim: { ...preview.aim }, initialAim: { ...preview.aim }, held: true, started: false };
    this.skillCommands.push({ kind: 2, aim: { ...preview.aim }, guide: true });
    this.skillPreview = undefined;
    return true;
  }

  updateSkillGuide(point: Vec): void {
    if (!this.accepts() || !this.guide || !finite(point)) return;
    const dx = point.x - this.guide.initialAim.x, dy = point.y - this.guide.initialAim.y;
    const length = Math.hypot(dx, dy), scale = length > TRACTION_BALANCE.guideOffset ? TRACTION_BALANCE.guideOffset / length : 1;
    this.guide.aim = { x: this.guide.initialAim.x + dx * scale, y: this.guide.initialAim.y + dy * scale };
  }

  endSkillGuide(cancelled = false): void {
    if (!this.guide) return;
    if (cancelled && !this.guide.started) {
      this.skillCommands = this.skillCommands.filter(command => !command.guide); this.guide = undefined;
    } else this.guide.held = false;
  }

  syncSkillGuide(state: TouchState): void {
    if (!this.guide?.started || state.elapsed === undefined) return;
    const cast = state.traction;
    if (!cast || !cast.guideUnlocked || cast.stage === 'fuse' || this.guide.castId && this.guide.castId !== cast.id) this.guide.held = false;
    else this.guide.castId ??= cast.id;
  }

  /** Resolve through the displayed camera; stick direction is relative to the
   * current player, while a released stick or battlefield tap keeps a world point. */
  getAim(state: AimState, screenToWorld: ScreenToWorld): Vec {
    this.airborne = !!state.playerFlight;
    this.setTerritoryMode(!!state.territory);
    this.chargeEnabled = !!state.endless && !state.territory;
    if (this.tool === undefined) this.activeTool = state.territory ? 1 : state.tool;
    let aim: Vec;
    if (this.aimSource === 'stick') {
      aim = this.resolveVector(this.touchAim, this.touchAimRange, state, screenToWorld);
    } else if (this.aimSource === 'world' && this.worldAim) aim = { ...this.worldAim };
    else aim = screenToWorld(this.pointer);
    this.lastAim = { ...aim };
    return aim;
  }

  onClear(listener: () => void): () => void { this.clearListeners.add(listener); return () => this.clearListeners.delete(listener); }

  clear(): void {
    this.endCharge(true);
    this.chargePressed = false; this.chargeReleased = false; this.chargeAim = undefined;
    this.endCannon(true); this.cannonPressed = false; this.cannonReleased = false;
    this.cannonAim = undefined; this.cannonDisplayAim = undefined; this.cannonPointer = undefined; this.cannonOrigin = undefined; this.cannonBuildingId = undefined; this.scanCommand = undefined;
    const mousePointer = this.mousePointer; this.mousePointer = undefined;
    this.keys.clear(); this.pressed.clear(); this.actions.clear(); this.practiceHit = false; this.tool = undefined;
    this.mouseHeld = false; this.mouseBlocked = false; this.castHeld = false; this.castBlocked = false; this.mousePressed = false; this.castStep = false;
    this.castEdges = []; this.releaseBarrier = true;
    this.attackHeld = false; this.attackPressed = false; this.attackBlocked = false; this.skillPreview = undefined; this.skillCommands = []; this.skillRelease = undefined; this.guide = undefined;
    this.weaponSkillPreview = undefined; this.weaponSkillCommands = [];
    this.touchMove = { x: 0, y: 0 }; this.touchAim = { x: 0, y: 0 };
    this.touchAimRange = TOUCH_AIM.range; this.touchAimAutoFire = true;
    this.aimSource = 'mouse'; this.worldAim = undefined; this.lastAim = undefined;
    if (mousePointer !== undefined) this.releaseCapture(mousePointer);
    for (const listener of this.clearListeners) listener();
  }

  frame(aim: Vec): InputFrame {
    if (!this.accepts()) return { moveX: 0, moveY: 0, aim, fire: false };
    if ((this.cannonOwner || this.cannonReleased) && this.gameState && !this.cannonUsable()) {
      this.endCannon(true); this.cannonReleased = false; this.cannonPressed = false; this.cannonCancelled = true;
    }
    if (this.cannonOwner === 'keyboard') this.cannonAim = { ...aim };
    let fire: boolean;
    let atomic: Partial<InputFrame> | undefined;
    if (this.releaseBarrier) { this.releaseBarrier = false; fire = false; }
    else if (this.guide?.started && (!this.guide.held || this.skillCommands.length)) {
      this.worldAim = { ...this.guide.aim }; this.lastAim = { ...this.guide.aim }; this.aimSource = 'world';
      atomic = { tool: 2, aim: { ...this.guide.aim }, fire: false, scan: false }; this.guide = undefined; fire = false;
    } else if (this.skillRelease) {
      atomic = { ...this.skillRelease, fire: false, scan: false }; this.skillRelease = undefined; fire = false;
    } else if (this.skillCommands.length) {
      const command = this.skillCommands.shift()!;
      this.worldAim = { ...command.aim }; this.aimSource = 'world'; this.lastAim = { ...command.aim };
      if (command.kind === 'scan') atomic = { tool: undefined, aim: { ...command.aim }, fire: false, scan: true };
      else {
        atomic = { tool: command.kind, aim: { ...command.aim }, fire: true, scan: false };
        if (command.guide && this.guide) this.guide.started = true;
        else this.skillRelease = { tool: command.kind, aim: { ...command.aim } };
      }
      fire = atomic.fire!;
    } else if (this.guide?.started && this.guide.held) {
      atomic = { tool: 2, aim: { ...this.guide.aim }, fire: true, scan: false }; fire = true;
    } else if (this.skillPreview && !(this.skillPreview.kind === 'scan' && this.territoryMode)) fire = false;
    else {
      if (this.castEdges.length) this.castStep = this.castEdges.shift()!;
      const stickFire = this.touchAimAutoFire && this.activeTool === 1 && this.aimSource === 'stick' && Math.hypot(this.touchAim.x, this.touchAim.y) > TOUCH_AIM.deadZone;
      const attackFire = (this.attackHeld || this.attackPressed) && !this.attackBlocked;
      fire = (this.mouseHeld || this.mousePressed) && !this.mouseBlocked || this.castStep || stickFire || attackFire;
      if (attackFire) atomic = { tool: 1 };
      this.mousePressed = false; this.attackPressed = false;
    }
    const charge = this.chargeEnabled ? { chargePressed: this.chargePressed, chargeHeld: !!this.chargeOwner,
      chargeReleased: this.chargeReleased, chargeCancelled: this.chargeCancelled,
      chargeAim: this.chargeAim ?? aim } : {};
    const cannon = this.territoryMode ? { cannonPressed: this.cannonPressed, cannonHeld: !!this.cannonOwner,
      cannonReleased: this.cannonReleased, cannonCancelled: this.cannonCancelled,
      cannonAim: this.cannonOwner === 'keyboard' ? aim : this.cannonAim ?? aim } : {};
    const frame = { moveX: Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')) + this.touchMove.x,
      moveY: Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW')) + this.touchMove.y, aim, fire, tool: this.tool,
      dash: this.pressed.has('Space') || this.actions.has('dash'), scan: !!this.scanCommand || this.pressed.has('KeyQ') || this.actions.has('scan'),
      ...(this.scanCommand ? { scanAim: { ...this.scanCommand } } : {}),
      interact: !this.territoryMode && this.pressed.has('KeyE') || this.actions.has('interact'), practiceHit: this.practiceHit,
      antibody: this.pressed.has('KeyR') || this.actions.has('antibody'),
      territoryAction: this.territoryMode && (this.pressed.has('KeyF') || this.actions.has('territory')), ...atomic, ...charge, ...cannon };
    if (this.territoryMode) {
      frame.tool = 1;
      const command = this.weaponSkillCommands.shift();
      if (command) (frame as InputFrame).weaponSkill = { slot: command.slot, aim: { ...(command.aim ?? aim) } };
    }
    this.chargePressed = false; this.chargeReleased = false; this.chargeCancelled = false;
    this.cannonPressed = false; this.cannonReleased = false; this.cannonCancelled = false; this.scanCommand = undefined;
    this.pressed.clear(); this.actions.clear(); this.tool = undefined; this.practiceHit = false; return frame;
  }
}
