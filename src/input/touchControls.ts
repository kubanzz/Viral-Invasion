import { BALANCE, type GameState, type Vec } from '../game/types';
import { weaponSkillViews, type WeaponSkillSlot } from '../game/weaponSkills';
import { weaponUltimateView } from '../game/weaponUltimates';
import { endlessCombatStats } from '../game/endlessGrowth';
import { TRACTION_BALANCE } from '../game/traction';
import { isTerritoryPlayerAirborne, territoryCannonView } from '../game/territoryCannon';
import { Controller, type GameAction, type ScreenToWorld, type SkillKind, type SkillPresentation, type TouchState } from './controller';

export interface TouchControlsOptions {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  input: Controller;
  getState: () => TouchState;
  screenToWorld: ScreenToWorld;
  canAccept: () => boolean;
  enabled?: () => boolean;
  onPreviewChange?: (preview: SkillPresentation | undefined) => void;
}

type PointerKind = 'move' | 'aim' | 'attack' | 'skill' | 'weapon' | 'guide' | 'cast' | 'action' | 'point' | 'charge' | 'context' | 'garrison' | 'cannon' | 'blade-trace';
interface OwnedPointer {
  kind: PointerKind;
  element: HTMLElement;
  start?: Vec;
  worldStart?: Vec;
  dragged?: boolean;
  frozen?: boolean;
}
const actions = new Set<GameAction>(['dash', 'scan', 'interact', 'antibody', 'territory']);

/** DOM adapter only: all gameplay actions are consumed through Controller.frame. */
export class TouchControls {
  private readonly pointers = new Map<number, OwnedPointer>();
  /** Secondary touch pointers do not reliably synthesize a details click. */
  private readonly touchSummaryActivation = new WeakMap<HTMLElement, number>();
  private readonly disposers: (() => void)[] = [];
  private readonly sticks: HTMLElement[];

  constructor(private readonly options: TouchControlsOptions) {
    this.sticks = [...options.root.querySelectorAll<HTMLElement>('.mobile-stick[data-stick]')];
    this.listen(options.root, 'pointerdown', event => { this.startControl(event as PointerEvent); this.present(); });
    this.listen(options.root, 'click', event => {
      const summary = (event.target as HTMLElement).closest<HTMLElement>('#mobile-tactical-menu > summary');
      const activatedAt = summary ? this.touchSummaryActivation.get(summary) : undefined;
      // Keyboard activation has detail=0 and must retain native accessibility.
      // Consume only the compatibility click after our touch pointer action.
      const compatibilityTouchClick = (event as PointerEvent).pointerType === 'touch' || (event as MouseEvent).detail !== 0;
      if (summary && compatibilityTouchClick && activatedAt !== undefined && performance.now() - activatedAt < 800) {
        event.preventDefault(); this.touchSummaryActivation.delete(summary);
      }
    });
    this.listen(options.canvas, 'pointerdown', event => this.startPoint(event as PointerEvent));
    this.listen(window, 'pointermove', event => { this.move(event as PointerEvent); this.present(); });
    this.listen(window, 'pointerup', event => { this.end(event as PointerEvent); this.present(); });
    this.listen(window, 'pointercancel', event => { this.end(event as PointerEvent); this.present(); });
    this.listen(options.root, 'lostpointercapture', event => { this.end(event as PointerEvent); this.present(); });
    this.listen(options.canvas, 'lostpointercapture', event => { this.end(event as PointerEvent); this.present(); });
    this.disposers.push(options.input.onClear(() => this.reset()));
  }

  private listen(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener, { passive: false });
    this.disposers.push(() => target.removeEventListener(type, listener));
  }

  private accepts(): boolean { return (this.options.enabled?.() ?? true) && !this.options.root.hidden && this.options.canAccept()
    && !isTerritoryPlayerAirborne(this.options.getState()); }
  private owns(kind: PointerKind): boolean { return [...this.pointers.values()].some(pointer => pointer.kind === kind); }

  private capture(event: PointerEvent, pointer: OwnedPointer): void {
    event.preventDefault(); this.pointers.set(event.pointerId, pointer);
    try { pointer.element.setPointerCapture(event.pointerId); } catch { /* Detached controls cannot retain capture. */ }
    pointer.element.dataset.active = 'true';
  }

  private startControl(event: PointerEvent): void {
    if (!this.accepts() || event.button !== 0 || this.pointers.has(event.pointerId)) return;
    const summary = (event.target as HTMLElement).closest<HTMLElement>('#mobile-tactical-menu > summary');
    if (event.pointerType === 'touch' && summary && this.options.root.contains(summary)) {
      const menu = summary.parentElement as HTMLDetailsElement | null;
      if (menu && !menu.hidden) {
        event.preventDefault();
        menu.open = !menu.open;
        this.touchSummaryActivation.set(summary, performance.now());
      }
      return;
    }
    const element = (event.target as HTMLElement).closest<HTMLElement>('.mobile-stick[data-stick], [data-touch-action], [data-touch-skill], [data-weapon-skill], [data-weapon-ultimate]');
    if (!element || !this.options.root.contains(element) || (element as HTMLButtonElement).disabled) return;
    const stick = element.dataset.stick;
    if (stick === 'move' || stick === 'aim') {
      if (this.owns(stick)) return;
      this.capture(event, { kind: stick, element }); this.updateStick(element, stick, event); return;
    }
    if (stick === 'attack') {
      if (this.owns('attack')) return;
      const state = this.options.getState();
      let point = this.options.input.getAim(state, this.options.screenToWorld);
      if (Math.hypot(point.x - state.player.x, point.y - state.player.y) < 1) {
        const facing = Number.isFinite(state.player.facing) ? state.player.facing : 0;
        point = { x: state.player.x + Math.cos(facing) * BALANCE.range, y: state.player.y + Math.sin(facing) * BALANCE.range };
      }
      this.options.input.setWorldAim(point);
      this.capture(event, { kind: 'attack', element, start: { x: event.clientX, y: event.clientY } });
      this.options.input.setTouchAttack(true); return;
    }
    if (element.dataset.weaponUltimate !== undefined) {
      const state = this.options.getState();
      if (!state.territory || this.owns('weapon') || this.owns('skill') || this.owns('guide') || this.owns('charge') || this.owns('cannon')) return;
      const view = weaponUltimateView(state as GameState);
      if (view?.canRecast || view?.ready && (view.weaponId === 'redblade' || view.weaponId === 'thunder' && view.aim === 'self')) {
        this.options.input.queueWeaponUltimate(this.options.input.getAim(state, this.options.screenToWorld));
        this.capture(event, { kind: 'action', element }); return;
      }
      if (!view?.ready || !this.options.input.beginWeaponUltimatePreview(this.options.input.getAim(state, this.options.screenToWorld), view)) return;
      this.capture(event, { kind: 'weapon', element, start: { x: event.clientX, y: event.clientY } }); return;
    }
    const weaponSlot = Number(element.dataset.weaponSkill) as WeaponSkillSlot;
    if ([1, 2, 3].includes(weaponSlot)) {
      const state = this.options.getState();
      if (!state.territory || this.owns('weapon') || this.owns('skill') || this.owns('guide') || this.owns('charge') || this.owns('cannon')) return;
      const view = weaponSkillViews(state as GameState).find(skill => skill.slot === weaponSlot);
      if (!view?.ready) return;
      const aim = this.options.input.getAim(state, this.options.screenToWorld);
      if (view.aim === 'self' || view.id === 'redblade-parry') {
        this.options.input.queueWeaponSkill(weaponSlot, aim);
        this.capture(event, { kind: 'action', element }); return;
      }
      if (!this.options.input.beginWeaponSkillPreview(weaponSlot, aim, view)) return;
      this.capture(event, { kind: 'weapon', element, start: { x: event.clientX, y: event.clientY } }); return;
    }
    const skill = element.dataset.touchSkill;
    if (skill === '2' || skill === '3' || skill === 'scan') {
      if (skill === 'scan' && this.options.getState().territory) {
        if (this.owns('garrison')) return;
        this.capture(event, { kind: 'garrison', element });
        this.options.input.queueAction('scan'); return;
      }
      if (this.options.getState().territory) return;
      if (this.owns('weapon') || this.owns('skill') || this.owns('guide') || this.owns('cannon')) return;
      const kind: SkillKind = skill === 'scan' ? 'scan' : Number(skill) as 2 | 3;
      const state = this.options.getState();
      const aim = this.options.input.getAim(state, this.options.screenToWorld);
      this.options.input.beginSkillPreview(kind, aim);
      this.capture(event, { kind: 'skill', element, start: { x: event.clientX, y: event.clientY } }); return;
    }
    const action = element.dataset.touchAction;
    if (action === 'interact' && this.options.getState().territory) {
      if (this.owns('cannon') || this.owns('weapon') || this.owns('skill') || this.owns('guide')) return;
      const state = this.options.getState(), cannon = territoryCannonView(state as Parameters<typeof territoryCannonView>[0]);
      if (!cannon?.nearby || !cannon.ready) return;
      const aim = this.options.input.getAim(state, this.options.screenToWorld);
      if (!this.options.input.beginTouchCannon(aim, cannon.origin, cannon.range, cannon.radius)) return;
      this.capture(event, { kind: 'cannon', element, start: { x: event.clientX, y: event.clientY } });
    } else if (action === 'territory' && this.options.getState().territory) {
      if (this.owns('context')) return;
      this.capture(event, { kind: 'context', element }); this.options.input.queueAction('territory');
    } else if (action === 'dash' && this.options.getState().endless && !this.options.getState().territory) {
      if (this.owns('charge') || this.owns('skill') || this.owns('guide')) return;
      const state = this.options.getState(), aim = this.options.input.getAim(state, this.options.screenToWorld);
      this.capture(event, { kind: 'charge', element, start: { x: event.clientX, y: event.clientY } });
      this.options.input.beginTouchCharge(state, aim);
    } else if (action === 'cast') {
      if (this.owns('cast')) return;
      const worldStart = this.options.input.getAim(this.options.getState(), this.options.screenToWorld);
      this.capture(event, { kind: 'cast', element, start: { x: event.clientX, y: event.clientY }, worldStart });
      this.options.input.setTouchCast(true);
    } else if (actions.has(action as GameAction)) {
      this.capture(event, { kind: 'action', element });
      this.options.input.queueAction(action as GameAction);
    }
  }

  private startPoint(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || !this.accepts() || this.owns('point') || this.owns('weapon') || this.owns('skill') || this.owns('guide') || this.owns('charge') || this.owns('cannon')) return;
    if (this.options.getState().weaponCombat?.bladeTrace?.phase === 'drawing') {
      if (this.owns('blade-trace')) return;
      this.capture(event, { kind: 'blade-trace', element: this.options.canvas }); this.tracePoint(event); return;
    }
    this.capture(event, { kind: 'point', element: this.options.canvas }); this.selectPoint(event);
  }

  private tracePoint(event: PointerEvent): void {
    const rect = this.options.canvas.getBoundingClientRect(), project = this.options.screenToWorld;
    const origin = project({ x: 0, y: 0 }), tolerance = project({ x: 22, y: 0 });
    this.options.input.queueBladeTracePoint(project({ x: event.clientX - rect.left, y: event.clientY - rect.top }),
      Math.hypot(tolerance.x - origin.x, tolerance.y - origin.y));
  }

  private selectPoint(event: PointerEvent): void {
    const rect = this.options.canvas.getBoundingClientRect();
    this.options.input.setWorldAim(this.options.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }));
  }

  private updateStick(element: HTMLElement, kind: 'move' | 'aim', event: PointerEvent): void {
    const rect = element.getBoundingClientRect(), knob = element.querySelector<HTMLElement>('.stick-knob');
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2 - (knob?.offsetWidth ?? 0) / 2);
    const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(dx, dy), scale = length > radius ? radius / length : 1;
    const vector = { x: dx * scale / radius, y: dy * scale / radius };
    if (knob) knob.style.translate = `${dx * scale}px ${dy * scale}px`;
    if (kind === 'aim') this.options.input.setTouchAim(vector);
    else {
      const live = length / radius > .15;
      this.options.input.setTouchMove(live ? { x: dx / length, y: dy / length } : { x: 0, y: 0 });
    }
  }

  private hit(selector: string, event: PointerEvent): boolean {
    const element = this.options.root.querySelector<HTMLElement>(selector);
    if (!element || element.hidden) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  private guideUnlocked(): boolean {
    if (this.options.getState().endless) return false;
    const growth = this.options.getState().endlessGrowth;
    return !!growth && (endlessCombatStats(growth).areaGuideDuration > 0 || (growth.ranks.nova ?? 0) >= TRACTION_BALANCE.guideMinimumRank);
  }

  private updateSkill(pointer: OwnedPointer, event: PointerEvent): void {
    const { input, screenToWorld, getState } = this.options;
    const preview = input.resolvePreview(getState(), screenToWorld);
    if (!preview || preview.phase !== 'preview') return;
    // Confirm/cancel are tested before reading the movement as a new aim. The
    // captured pointer's target remains the skill button throughout the gesture.
    if (this.hit('[data-touch-cancel]', event)) {
      input.setSkillPreviewPoint(preview.aim); input.setSkillCancelled(true); pointer.frozen = true; return;
    }
    input.setSkillCancelled(false);
    if (preview.kind === 2 && this.guideUnlocked() && this.hit('[data-touch-guide]', event)) {
      input.setSkillPreviewPoint(preview.aim);
      if (input.beginSkillGuide(getState(), screenToWorld)) {
        pointer.kind = 'guide'; pointer.worldStart = { ...preview.aim }; pointer.start = { x: event.clientX, y: event.clientY };
      }
      return;
    }
    const rect = pointer.element.getBoundingClientRect();
    const radius = Math.max(16, Number(pointer.element.dataset.aimRadius) || 64);
    const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(dx, dy);
    // Outside the expanded wheel, retain the last valid world point while the
    // finger travels to a confirmation/cancellation target.
    if (length > radius + 8) {
      input.setSkillPreviewPoint(preview.aim);
      if (preview.weaponUltimate) input.setSkillCancelled(true);
      pointer.frozen = true; return;
    }
    const dragged = pointer.dragged || !!pointer.start && Math.hypot(event.clientX - pointer.start.x, event.clientY - pointer.start.y) >= 7;
    if (!dragged) return;
    pointer.dragged = true; pointer.frozen = false;
    if (length > radius * .15) input.setSkillPreviewVector({ x: dx / radius, y: dy / radius });
    const knob = pointer.element.querySelector<HTMLElement>('.stick-knob');
    if (knob) { const scale = length > radius ? radius / length : 1; knob.style.translate = `${dx * scale}px ${dy * scale}px`; }
  }

  private updateGuide(pointer: OwnedPointer, event: PointerEvent): void {
    if (!pointer.start || !pointer.worldStart) return;
    const origin = this.options.screenToWorld({ x: 0, y: 0 });
    const delta = this.options.screenToWorld({ x: event.clientX - pointer.start.x, y: event.clientY - pointer.start.y });
    this.options.input.updateSkillGuide({ x: pointer.worldStart.x + delta.x - origin.x, y: pointer.worldStart.y + delta.y - origin.y });
  }

  private updateCharge(pointer: OwnedPointer, event: PointerEvent): void {
    const { input, getState, screenToWorld } = this.options;
    const preview = input.resolvePreview(getState(), screenToWorld);
    if (preview?.kind !== 'charge') return;
    if (this.hit('[data-touch-cancel]', event)) { input.updateTouchCharge(preview.aim, true); return; }
    if (!pointer.start) return;
    const delta = { x: event.clientX - pointer.start.x, y: event.clientY - pointer.start.y };
    if (Math.hypot(delta.x, delta.y) < 7) { input.updateTouchCharge(preview.aim); return; }
    const origin = screenToWorld({ x: 0, y: 0 }), direction = screenToWorld(delta), state = getState();
    const dx = direction.x - origin.x, dy = direction.y - origin.y, length = Math.hypot(dx, dy);
    input.updateTouchCharge(length > 0 ? { x: state.player.x + dx / length * 650, y: state.player.y + dy / length * 650 } : preview.aim);
  }

  private updateCannon(pointer: OwnedPointer, event: PointerEvent): void {
    const { input, getState, screenToWorld } = this.options;
    const preview = input.resolvePreview(getState(), screenToWorld);
    if (preview?.kind !== 'cannon') return;
    if (this.hit('[data-touch-cancel]', event)) { input.updateTouchCannon(preview.aim, true); return; }
    if (!pointer.start || !preview.origin) return;
    const delta = { x: event.clientX - pointer.start.x, y: event.clientY - pointer.start.y };
    if (Math.hypot(delta.x, delta.y) < 7) { input.updateTouchCannon(preview.aim); return; }
    pointer.dragged = true;
    const origin = screenToWorld({ x: 0, y: 0 }), direction = screenToWorld(delta);
    const dx = direction.x - origin.x, dy = direction.y - origin.y, length = Math.hypot(dx, dy);
    const distance = Math.min(1, Math.hypot(delta.x, delta.y) / 96) * preview.range;
    input.updateTouchCannon(length > 0 ? { x: preview.origin.x + dx / length * distance, y: preview.origin.y + dy / length * distance } : preview.aim);
  }

  private move(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    if (!this.accepts()) { this.options.input.clear(); return; }
    event.preventDefault();
    if (pointer.kind === 'move' || pointer.kind === 'aim') this.updateStick(pointer.element, pointer.kind, event);
    else if (pointer.kind === 'attack') {
      const travelled = pointer.dragged || !!pointer.start && Math.hypot(event.clientX - pointer.start.x, event.clientY - pointer.start.y) >= 7;
      if (travelled) {
        pointer.dragged = true;
        const rect = pointer.element.getBoundingClientRect(), radius = Math.max(1, Math.min(rect.width, rect.height) / 2 - (pointer.element.querySelector<HTMLElement>('.stick-knob')?.offsetWidth ?? 0) / 2);
        const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
        const length = Math.hypot(dx, dy), scale = length > radius ? radius / length : 1;
        this.options.input.setTouchAttackAim({ x: dx * scale / radius, y: dy * scale / radius });
        const knob = pointer.element.querySelector<HTMLElement>('.stick-knob');
        if (knob) knob.style.translate = `${dx * scale}px ${dy * scale}px`;
      }
    }
    else if (pointer.kind === 'skill' || pointer.kind === 'weapon') this.updateSkill(pointer, event);
    else if (pointer.kind === 'guide') this.updateGuide(pointer, event);
    else if (pointer.kind === 'charge') this.updateCharge(pointer, event);
    else if (pointer.kind === 'cannon') this.updateCannon(pointer, event);
    else if (pointer.kind === 'point') this.selectPoint(event);
    else if (pointer.kind === 'blade-trace') this.tracePoint(event);
    else if (pointer.kind === 'cast' && pointer.start && pointer.worldStart) {
      const delta = { x: event.clientX - pointer.start.x, y: event.clientY - pointer.start.y };
      if (Math.hypot(delta.x, delta.y) < 7) return;
      const origin = this.options.screenToWorld({ x: 0, y: 0 }), projected = this.options.screenToWorld(delta);
      const dx = projected.x - origin.x, dy = projected.y - origin.y, length = Math.hypot(dx, dy);
      const factor = this.options.getState().tool === 2 && length > 100 ? 100 / length : 1;
      this.options.input.setWorldAim({ x: pointer.worldStart.x + dx * factor, y: pointer.worldStart.y + dy * factor });
    }
  }

  private end(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    this.pointers.delete(event.pointerId);
    if (pointer.kind === 'blade-trace') { if (event.type === 'pointerup') this.tracePoint(event); this.options.input.releaseBladeTrace(); }
    if (pointer.kind === 'move') this.options.input.setTouchMove({ x: 0, y: 0 });
    if (pointer.kind === 'aim') this.options.input.releaseTouchAim(this.options.getState(), this.options.screenToWorld);
    if (pointer.kind === 'attack') {
      this.options.input.releaseTouchAim(this.options.getState(), this.options.screenToWorld); this.options.input.setTouchAttack(false, event.type !== 'pointerup');
    }
    if (pointer.kind === 'skill' || pointer.kind === 'weapon') {
      if (pointer.element.dataset.weaponUltimate !== undefined && event.type === 'pointerup') this.updateSkill(pointer, event);
      if (event.type !== 'pointerup' || this.hit('[data-touch-cancel]', event)) this.options.input.cancelSkillPreview();
      else this.options.input.commitSkillPreview(this.options.getState(), this.options.screenToWorld);
    }
    if (pointer.kind === 'guide') this.options.input.endSkillGuide(event.type !== 'pointerup');
    if (pointer.kind === 'charge') this.options.input.endTouchCharge(event.type !== 'pointerup' || this.hit('[data-touch-cancel]', event));
    if (pointer.kind === 'cannon') this.options.input.endTouchCannon(event.type !== 'pointerup' || this.hit('[data-touch-cancel]', event));
    if (pointer.kind === 'cast') this.options.input.setTouchCast(false, event.type !== 'pointerup');
    if (![...this.pointers.values()].some(owned => owned.element === pointer.element)) this.resetElement(pointer.element);
    this.release(pointer.element, event.pointerId);
  }

  private release(element: HTMLElement, pointerId: number): void {
    try { if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId); } catch { /* The OS may have cancelled it first. */ }
  }

  private resetElement(element: HTMLElement): void {
    element.dataset.active = 'false';
    element.dataset.cancelled = 'false';
    const knob = element.querySelector<HTMLElement>('.stick-knob');
    if (knob) knob.style.translate = '0px 0px';
  }

  private reset(): void {
    const captured = [...this.pointers]; this.pointers.clear();
    for (const [id, pointer] of captured) { this.resetElement(pointer.element); this.release(pointer.element, id); }
    for (const stick of this.sticks) this.resetElement(stick);
    this.present();
  }

  private present(): void {
    const preview = this.options.input.getPresentation(this.options.getState(), this.options.screenToWorld).preview;
    const { root } = this.options;
    root.dataset.gesture = preview ? preview.phase === 'guiding' ? 'guiding' : preview.cancelled ? 'cancel' : 'preview' : 'idle';
    root.dataset.skill = preview ? String(preview.kind) : '';
    const cancel = root.querySelector<HTMLElement>('[data-touch-cancel]'), guide = root.querySelector<HTMLElement>('[data-touch-guide]');
    if (cancel) cancel.hidden = !preview || preview.phase !== 'preview';
    if (guide) guide.hidden = !preview || preview.phase !== 'preview' || preview.kind !== 2 || !this.guideUnlocked();
    root.dataset.pointerHeld = String(this.pointers.size > 0);
    for (const pointer of this.pointers.values()) if (pointer.kind === 'skill' || pointer.kind === 'weapon' || pointer.kind === 'guide' || pointer.kind === 'charge' || pointer.kind === 'cannon') pointer.element.dataset.cancelled = String(preview?.cancelled ?? false);
    this.options.onPreviewChange?.(preview);
  }

  update(): void {
    if (!this.accepts() && this.pointers.size) this.options.input.clear();
    else {
      this.options.input.syncSkillGuide(this.options.getState());
      const preview = this.options.input.resolvePreview(this.options.getState(), this.options.screenToWorld);
      if (!preview) for (const [id, pointer] of [...this.pointers]) if (pointer.kind === 'guide' || pointer.kind === 'charge' || pointer.kind === 'cannon') {
        this.pointers.delete(id); this.resetElement(pointer.element); this.release(pointer.element, id);
      }
    }
    this.present();
  }
  destroy(): void { this.options.input.clear(); for (const dispose of this.disposers.splice(0)) dispose(); }
}
