import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controller, TOUCH_AIM } from '../../src/input/controller';
import { TouchControls } from '../../src/input/touchControls';
import { Camera } from '../../src/render/camera';
import { GameSession } from '../../src/game/session';
import { createEndlessGrowth } from '../../src/game/endlessGrowth';
import { healingPoints } from '../../src/game/healingPoints';
import { BALANCE, type GameState, type Target, type Vec } from '../../src/game/types';
import { TERRITORY_CANNON_BALANCE } from '../../src/game/territoryCannon';
import { initializeConstruction } from '../../src/game/construction';
import { createWeaponCombat } from '../../src/game/weaponSkills';

class ElementStub extends EventTarget {
  parentElement: ElementStub | null = null;
  children: ElementStub[] = [];
  dataset: Record<string, string> = {};
  style = { translate: '' };
  hidden = false;
  disabled = false;
  isContentEditable = false;
  open = false;
  captures = new Set<number>();
  released: number[] = [];
  constructor(public role: string, public rect = { left: 0, top: 0, width: 100, height: 100 }) { super(); }
  get offsetWidth() { return this.rect.width; }
  getBoundingClientRect() { return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }; }
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); this.released.push(id); }
  append(...children: ElementStub[]) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  contains(element: ElementStub): boolean { return element === this || this.children.some(child => child.contains(element)); }
  private matches(selector: string) {
    return selector.trim().split(',').some(part => part.trim() === '#mobile-tactical-menu > summary' ? this.role === 'summary'
      : part.trim() === '.stick-knob' ? this.role === 'knob'
      : part.trim() === '.mobile-stick[data-stick]' ? !!this.dataset.stick
        : part.trim() === '[data-touch-action]' ? !!this.dataset.touchAction
          : part.trim() === '[data-touch-skill]' ? !!this.dataset.touchSkill
            : part.trim() === '[data-weapon-skill]' ? !!this.dataset.weaponSkill
            : part.trim() === '[data-weapon-ultimate]' ? this.dataset.weaponUltimate !== undefined
            : part.trim() === '[data-touch-cancel]' ? this.dataset.touchCancel !== undefined
              : part.trim() === '[data-touch-guide]' ? this.dataset.touchGuide !== undefined : false);
  }
  closest(selector: string): ElementStub | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector: string): ElementStub[] { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector: string): ElementStub | null { return this.querySelectorAll(selector)[0] ?? null; }
}

function pointer(surface: EventTarget, type: string, id: number, x = 0, y = 0, target?: ElementStub, pointerType = 'touch') {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.assign(event, { pointerId: id, pointerType, clientX: x, clientY: y, button: 0 });
  if (target) Object.defineProperty(event, 'target', { value: target });
  surface.dispatchEvent(event);
}

function keyboard(surface: EventTarget, type: string, code: string) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code, repeat: false, ctrlKey: false, altKey: false, metaKey: false });
  surface.dispatchEvent(event);
}

function fixture(stateOverride?: GameState) {
  const browser = new EventTarget(), document = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('window', browser); vi.stubGlobal('document', document);
  vi.stubGlobal('innerWidth', 844); vi.stubGlobal('innerHeight', 390);
  vi.stubGlobal('HTMLElement', ElementStub); vi.stubGlobal('HTMLInputElement', class extends ElementStub {});
  vi.stubGlobal('HTMLTextAreaElement', class extends ElementStub {});
  const canvas = new ElementStub('canvas', { left: 10, top: 20, width: 844, height: 390 });
  let allowed = true, enabled = true;
  const canAccept = () => allowed && (!stateOverride || stateOverride.phase === 'playing');
  const state = stateOverride ?? { player: { x: 500, y: 400 }, tool: 1 } as GameState;
  const input = new Controller(canvas as unknown as HTMLCanvasElement, vi.fn(), vi.fn(), canAccept, () => state);
  const camera = new Camera(844, 390); camera.panX = -40; camera.panY = -80;
  const project = (point: Vec) => camera.screenToWorld(point);
  const root = new ElementStub('root'), move = new ElementStub('stick'), aim = new ElementStub('stick', { left: 700, top: 250, width: 100, height: 100 });
  move.dataset.stick = 'move'; aim.dataset.stick = 'aim';
  move.append(new ElementStub('knob', { left: 0, top: 0, width: 20, height: 20 }));
  aim.append(new ElementStub('knob', { left: 0, top: 0, width: 20, height: 20 }));
  const attack = new ElementStub('attack', { left: 700, top: 250, width: 100, height: 100 }); attack.dataset.stick = 'attack';
  attack.append(new ElementStub('knob', { left: 0, top: 0, width: 20, height: 20 }));
  const skills = Object.fromEntries(['2', '3', 'scan'].map((kind, index) => {
    const element = new ElementStub('skill', { left: 600 - index * 70, top: 120 - index * 15, width: 56, height: 56 });
    element.dataset.touchSkill = kind; element.append(new ElementStub('knob', { left: 0, top: 0, width: 16, height: 16 }));
    return [kind, element];
  }));
  const weaponSkills = Object.fromEntries(['1', '2', '3'].map((slot, index) => {
    const element = new ElementStub('weapon', { left: 600 - index * 70, top: 120 - index * 15, width: 52, height: 52 });
    element.dataset.weaponSkill = slot; element.append(new ElementStub('knob', { left: 0, top: 0, width: 16, height: 16 }));
    return [slot, element];
  }));
  const ultimate = new ElementStub('ultimate', { left: 760, top: 65, width: 52, height: 52 }); ultimate.dataset.weaponUltimate = '';
  ultimate.append(new ElementStub('knob', { left: 0, top: 0, width: 16, height: 16 }));
  const cancel = new ElementStub('cancel', { left: 320, top: 20, width: 80, height: 40 }); cancel.dataset.touchCancel = ''; cancel.hidden = true;
  const guide = new ElementStub('guide', { left: 410, top: 20, width: 80, height: 40 }); guide.dataset.touchGuide = ''; guide.hidden = true;
  const buttons = Object.fromEntries(['cast', 'dash', 'scan', 'interact', 'antibody', 'territory'].map(action => {
    const element = new ElementStub('button'); element.dataset.touchAction = action; return [action, element];
  }));
  const tactics = new ElementStub('details'), summary = new ElementStub('summary'); tactics.append(summary);
  root.append(move, aim, attack, ...Object.values(skills), ...Object.values(weaponSkills), ultimate, cancel, guide, ...Object.values(buttons), tactics);
  const onPreviewChange = vi.fn();
  const controls = new TouchControls({ root: root as unknown as HTMLElement, canvas: canvas as unknown as HTMLCanvasElement,
    input, getState: () => state, screenToWorld: project, canAccept, enabled: () => enabled, onPreviewChange });
  const frame = () => input.frame(input.getAim(state, project));
  return { browser, document, input, canvas, camera, project, root, move, aim, attack, skills, weaponSkills, ultimate, cancel, guide, onPreviewChange, buttons, controls, state, frame, tactics, summary,
    allow(value: boolean) { allowed = value; }, enable(value: boolean) { enabled = value; } };
}

afterEach(() => vi.unstubAllGlobals());

describe('sustained thunder input and active ultimate recast', () => {
  const thunder = () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    game.state.weaponCombat = createWeaponCombat({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 });
    game.state.weaponCombat.ultimateEnergy = 100;
    const f = fixture(game.state); f.frame();
    return { ...f, game };
  };
  it('reports real held intent separately from a quick press receipt and clears it on blur', () => {
    const f = thunder();
    pointer(f.canvas, 'pointerdown', 1, 400, 180, undefined, 'mouse');
    expect(f.frame()).toMatchObject({ fire: true, primaryHeld: true });
    pointer(f.browser, 'pointerup', 1, 400, 180, undefined, 'mouse');
    expect(f.frame().primaryHeld).toBe(false);
    pointer(f.canvas, 'pointerdown', 2, 400, 180, undefined, 'mouse');
    pointer(f.browser, 'pointerup', 2, 400, 180, undefined, 'mouse');
    expect(f.frame()).toMatchObject({ fire: true, primaryHeld: false });
    pointer(f.root, 'pointerdown', 3, 750, 300, f.attack);
    expect(f.frame().primaryHeld).toBe(true);
    f.browser.dispatchEvent(new Event('blur'));
    expect(f.frame()).toMatchObject({ fire: false, primaryHeld: false });
  });
  it('delivers exactly the short-press pulse to a real session without retaining a released channel', () => {
    const f = thunder();
    f.state.world = { width: 1200, height: 800, bounds: { left: 20, right: 1180, top: 20, bottom: 780 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    Object.assign(f.state.player, { x: 500, y: 400 });
    const body: Target = { id: 'short-press-body', x: 620, y: 400, radius: 18, kind: 'single', role: 'virus', hp: 10000, maxHp: 10000, hitUntil: 0, scanned: false };
    f.state.targets = [body];
    pointer(f.canvas, 'pointerdown', 1, 400, 180, undefined, 'mouse');
    pointer(f.browser, 'pointerup', 1, 400, 180, undefined, 'mouse');
    const tap = f.frame(); expect(tap).toMatchObject({ fire: true, primaryHeld: false });
    f.game.step(tap);
    const remaining = body.hp;
    expect(remaining).toBeLessThan(10000); expect(f.state.weaponCombat?.thunder?.channel).toBeUndefined();
    for (let n = 0; n < 20; n++) f.game.step(f.frame());
    expect(body.hp).toBe(remaining); expect(f.state.weaponCombat?.thunder?.channel).toBeUndefined();
  });
  it('does not turn a cancelled or blocked primary pointer into a short-press pulse', () => {
    const f = thunder();
    const before = f.state.shots;
    pointer(f.canvas, 'pointerdown', 1, 400, 180, undefined, 'mouse');
    pointer(f.canvas, 'pointercancel', 1, 400, 180, undefined, 'mouse');
    const cancelled = f.frame(); expect(cancelled).toMatchObject({ fire: false, primaryHeld: false });
    f.game.step(cancelled); expect(f.state.shots).toBe(before); expect(f.state.weaponCombat?.thunder?.channel).toBeUndefined();
    f.allow(false); pointer(f.canvas, 'pointerdown', 2, 400, 180, undefined, 'mouse'); pointer(f.browser, 'pointerup', 2, 400, 180, undefined, 'mouse');
    f.allow(true); const blocked = f.frame(); expect(blocked).toMatchObject({ fire: false, primaryHeld: false });
    f.game.step(blocked); expect(f.state.shots).toBe(before); expect(f.state.weaponCombat?.thunder?.channel).toBeUndefined();
  });
  it('keeps movement and held electricity while a third finger previews and releases thunder step', () => {
    const f = thunder();
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    const skill = f.weaponSkills['3'], rect = skill.getBoundingClientRect();
    pointer(f.root, 'pointerdown', 3, rect.left + 26, rect.top + 26, skill);
    expect(f.input.resolvePreview(f.state, f.project)).toMatchObject({ kind: 'weapon', weaponSlot: 3 });
    expect(f.frame()).toMatchObject({ moveX: 1, fire: true, primaryHeld: true });
    pointer(f.browser, 'pointerup', 3, rect.left + 26, rect.top + 26);
    expect(f.frame()).toMatchObject({ moveX: 1, fire: true, primaryHeld: true, weaponSkill: { slot: 3 } });
    pointer(f.browser, 'pointerup', 2, 750, 300);
    expect(f.frame().primaryHeld).toBe(false);
  });
  it('starts and recasts the thunder storm with direct taps while two fingers remain held', () => {
    const f = thunder();
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    pointer(f.root, 'pointerdown', 3, 786, 91, f.ultimate);
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    const start = f.frame(); expect(start).toMatchObject({ moveX: 1, primaryHeld: true, weaponUltimate: expect.any(Object) });
    f.game.step(start); pointer(f.browser, 'pointerup', 3, 786, 91);
    for (let n = 0; n < 23; n++) f.game.step(f.frame());
    pointer(f.root, 'pointerdown', 4, 786, 91, f.ultimate);
    const finish = f.frame(); expect(finish).toMatchObject({ moveX: 1, primaryHeld: true, weaponUltimate: expect.any(Object) });
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    f.game.step(finish); expect(f.game.state.weaponCombat!.ultimateEnergy).toBe(0);
    pointer(f.browser, 'pointerup', 4, 786, 91);
    expect(f.frame().weaponUltimate).toBeUndefined();
  });
});

describe('blade trace input ownership', () => {
  function drawing() {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    game.state.weaponCombat = createWeaponCombat({ weaponId: 'redblade', rarity: 'gold', upgrade: 0 });
    const f = fixture(game.state); f.frame();
    game.state.weaponCombat.bladeTrace = { castId: 'trace-input', phase: 'drawing', startedAt: 0, deadline: 3, until: 4.58,
      damage: 45, marks: [], path: [], route: [], routeIndex: 0, lastAt: 0, manual: false, hitIds: [], elapsedDistance: 0, speed: 1800 };
    return f;
  }
  it('projects held mouse samples to world coordinates and suppresses primary and dash', () => {
    const f = drawing(); keyboard(f.browser, 'keydown', 'Space');
    pointer(f.canvas, 'pointerdown', 9, 300, 160, undefined, 'mouse');
    pointer(f.canvas, 'pointermove', 9, 420, 220, undefined, 'mouse');
    const frame = f.frame();
    expect(frame.fire).toBe(false); expect(frame.dash).toBe(false);
    expect(frame.bladeTrace?.points).toContainEqual(f.project({ x: 410, y: 200 }));
    expect(f.frame().bladeTrace?.points ?? []).toHaveLength(0);
    f.input.clear(); expect(f.frame().bladeTrace).toBeUndefined();
  });
  it('lets a touch draw on the battlefield while another finger continues moving', () => {
    const f = drawing(); pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.canvas, 'pointerdown', 2, 310, 170);
    pointer(f.browser, 'pointermove', 2, 410, 230);
    const frame = f.frame(); expect(frame.moveX).toBe(1); expect(frame.fire).toBe(false);
    expect(frame.bladeTrace?.points).toContainEqual(f.project({ x: 400, y: 210 }));
    pointer(f.browser, 'pointerup', 2, 430, 240);
    expect(f.frame().bladeTrace?.released).toBe(true); expect(f.frame().moveX).toBe(1);
    f.controls.destroy();
  });
  it('locks both movement sources during execution and emits no delayed skill commands', () => {
    const f = drawing(); f.state.weaponCombat!.bladeTrace!.phase = 'executing';
    keyboard(f.browser, 'keydown', 'KeyW'); keyboard(f.browser, 'keydown', 'Digit2'); keyboard(f.browser, 'keydown', 'Digit4');
    const frame = f.frame(); expect(frame.moveX).toBe(0); expect(frame.moveY).toBe(0);
    expect(frame.weaponSkill).toBeUndefined(); expect(frame.weaponUltimate).toBeUndefined();
    delete f.state.weaponCombat!.bladeTrace; expect(f.frame().weaponSkill).toBeUndefined();
  });
});

describe('independent kill-charge ultimate input', () => {
  const ready = () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    game.state.weaponCombat!.ultimateEnergy = 100;
    const f = fixture(game.state); f.frame(); f.input.setWorldAim({ x: game.state.player.x + 200, y: game.state.player.y });
    return f;
  };
  it('emits one Digit4 edge without changing held aim or primary fire', () => {
    const f = ready(); pointer(f.canvas, 'pointerdown', 1, 400, 180, undefined, 'mouse');
    const aim = f.frame().aim; keyboard(f.browser, 'keydown', 'Digit4');
    expect(f.frame()).toMatchObject({ fire: true, aim, weaponUltimate: { aim } });
    expect(f.frame().weaponUltimate).toBeUndefined();
    const repeated = new Event('keydown'); Object.assign(repeated, { code: 'Digit4', repeat: true }); f.browser.dispatchEvent(repeated);
    expect(f.frame().weaponUltimate).toBeUndefined();
    f.input.clear(); expect(f.frame().weaponUltimate).toBeUndefined();
  });
  it('keeps two held fingers while a third releases exactly one ultimate', () => {
    const f = ready(); pointer(f.root, 'pointerdown', 1, 90, 50, f.move); pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    pointer(f.root, 'pointerdown', 3, 786, 91, f.ultimate);
    expect(f.input.resolvePreview(f.state, f.project)?.weaponUltimate).toBe(true);
    expect(f.frame()).toMatchObject({ moveX: 1, fire: true });
    pointer(f.browser, 'pointerup', 3, 786, 91);
    expect(f.frame()).toMatchObject({ moveX: 1, fire: true, weaponUltimate: expect.any(Object) });
    expect(f.frame().weaponUltimate).toBeUndefined();
  });
  it('cancels on a drag outside the wheel, native cancellation and a global input gate', () => {
    const f = ready();
    pointer(f.root, 'pointerdown', 3, 786, 91, f.ultimate); pointer(f.browser, 'pointermove', 3, 650, 91);
    expect(f.input.resolvePreview(f.state, f.project)?.cancelled).toBe(true);
    pointer(f.browser, 'pointerup', 3, 650, 91); expect(f.frame().weaponUltimate).toBeUndefined();
    pointer(f.root, 'pointerdown', 4, 786, 91, f.ultimate); pointer(f.browser, 'pointercancel', 4); expect(f.frame().weaponUltimate).toBeUndefined();
    pointer(f.root, 'pointerdown', 5, 786, 91, f.ultimate); f.allow(false); f.controls.update();
    expect(f.ultimate.captures.size).toBe(0); f.allow(true); expect(f.frame().weaponUltimate).toBeUndefined();
  });
  it('never arms a mobile ultimate before full energy or in a legacy mode', () => {
    const f = ready(); f.state.weaponCombat!.ultimateEnergy = 99;
    pointer(f.root, 'pointerdown', 3, 786, 91, f.ultimate);
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined(); expect(f.frame().weaponUltimate).toBeUndefined();
    const legacy = fixture(); keyboard(legacy.browser, 'keydown', 'Digit4'); expect(legacy.frame().weaponUltimate).toBeUndefined();
  });
});

describe('territory context interaction preserves weapon control', () => {
  const territory = (tool: 1 | 2 = 2) => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start(); game.state.tool = tool;
    const f = fixture(game.state); f.frame(); return f;
  };

  it('sends one keyboard F context edge without changing aim or interrupting held fire', () => {
    const f = territory();
    pointer(f.canvas, 'pointerdown', 1, 400, 180, undefined, 'mouse');
    const aim = { x: 950, y: 50 }; f.input.setWorldAim(aim);
    keyboard(f.browser, 'keydown', 'KeyF');
    expect(f.frame()).toMatchObject({ territoryAction: true, tool: 1, fire: true, aim });
    expect(f.state.tool).toBe(2);
    expect(f.frame()).toMatchObject({ territoryAction: false, tool: 1, fire: true, aim });
    const repeated = new Event('keydown'); Object.assign(repeated, { code: 'KeyF', repeat: true }); f.browser.dispatchEvent(repeated);
    expect(f.frame().territoryAction).toBe(false);
    keyboard(f.browser, 'keyup', 'KeyF'); keyboard(f.browser, 'keydown', 'KeyF');
    expect(f.frame().territoryAction).toBe(true);
  });

  it('routes the independent context action without creating a charge attack', () => {
    const f = territory(); keyboard(f.browser, 'keydown', 'Space'); f.frame();
    f.input.queueAction('territory');
    const frame = f.frame();
    expect(frame).toMatchObject({ territoryAction: true, tool: 1 });
    expect(frame.chargeHeld).toBeUndefined(); expect(frame.weaponSkill).toBeUndefined();
    expect(f.state.tool).toBe(2);
  });

  it('makes mobile purification an immediate one-shot tap while movement and attack fingers remain live', () => {
    const f = territory(1); f.input.setWorldAim({ x: 800, y: 400 });
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    const aim = f.frame().aim;
    const button = f.buttons.territory, r = button.getBoundingClientRect();
    pointer(f.root, 'pointerdown', 3, r.left + 28, r.top + 28, button);
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    expect(f.root.dataset.gesture).toBe('idle');
    expect(f.frame()).toMatchObject({ territoryAction: true, moveX: 1, fire: true, tool: 1, aim });
    pointer(f.browser, 'pointermove', 3, 20, 20);
    expect(f.frame()).toMatchObject({ territoryAction: false, moveX: 1, fire: true, aim });
    pointer(f.browser, 'pointerup', 3, 20, 20);
    expect(f.frame()).toMatchObject({ territoryAction: false, moveX: 1, fire: true, aim });
  });

  it('clears an unconsumed context action across pause/blur and leaves legacy tool 3 intact', () => {
    const f = territory(); f.input.queueAction('territory'); f.allow(false);
    expect(f.frame()).toMatchObject({ fire: false }); f.allow(true);
    expect(f.frame().territoryAction).toBe(false);
    f.input.queueAction('territory'); f.browser.dispatchEvent(new Event('blur'));
    expect(f.frame().territoryAction).toBe(false);
    delete f.state.territory; f.frame(); keyboard(f.browser, 'keydown', 'Digit3');
    expect(f.frame()).toMatchObject({ tool: 3, territoryAction: false });
    f.state.tool = 3;
    const r = f.skills['3'].getBoundingClientRect(); pointer(f.root, 'pointerdown', 4, r.left + 28, r.top + 28, f.skills['3']);
    expect(f.input.resolvePreview(f.state, f.project)?.kind).toBe(3);
  });
});

describe('independent territory weapon skill input', () => {
  const territory = () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    const f = fixture(game.state); f.frame(); return f;
  };

  it('routes all three keys as direct skills and never as purification or tool selection', () => {
    const f = territory(), aim = { x: 800, y: 400 }; f.input.setWorldAim(aim);
    for (const slot of [1, 2, 3] as const) {
      keyboard(f.browser, 'keydown', `Digit${slot}`);
      expect(f.frame()).toMatchObject({ tool: 1, territoryAction: false, weaponSkill: { slot, aim } });
      expect(f.frame().weaponSkill).toBeUndefined();
      keyboard(f.browser, 'keyup', `Digit${slot}`);
    }
    keyboard(f.browser, 'keydown', 'Space');
    const dash = f.frame(); expect(dash.dash).toBe(true); expect(dash.chargeHeld).toBeUndefined();
  });

  it('never queues a rapid key chord for a later simulation frame', () => {
    const f = territory(); keyboard(f.browser, 'keydown', 'Digit1'); keyboard(f.browser, 'keydown', 'Digit2'); keyboard(f.browser, 'keydown', 'Digit3');
    expect(f.frame().weaponSkill?.slot).toBe(1);
    expect(f.frame().weaponSkill).toBeUndefined();
  });

  it('keeps three captured fingers, separate aim, and continuous primary fire before and after a directed skill', () => {
    const f = territory(); f.state.weaponCombat!.loadout.weaponId = 'piercing'; f.input.setWorldAim({ x: 800, y: 400 });
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    const primaryAim = f.frame().aim, button = f.weaponSkills['2'], r = button.getBoundingClientRect();
    pointer(f.root, 'pointerdown', 3, r.left + 26, r.top + 26, button);
    expect(f.root.dataset.gesture).toBe('preview'); expect(f.root.dataset.pointerHeld).toBe('true');
    pointer(f.browser, 'pointermove', 3, r.left + 58, r.top + 10);
    const preview = f.input.resolvePreview(f.state, f.project)!;
    expect(preview).toMatchObject({ kind: 'weapon', weaponSlot: 2 }); expect(preview.aim).not.toEqual(primaryAim);
    expect(f.frame()).toMatchObject({ moveX: 1, fire: true, aim: primaryAim, tool: 1 });
    expect(f.move.captures.has(1)).toBe(true); expect(f.attack.captures.has(2)).toBe(true); expect(button.captures.has(3)).toBe(true);
    pointer(f.browser, 'pointerup', 3, r.left + 58, r.top + 10);
    expect(f.frame()).toMatchObject({ moveX: 1, fire: true, aim: primaryAim, weaponSkill: { slot: 2, aim: preview.aim } });
    expect(f.frame()).toMatchObject({ moveX: 1, fire: true, aim: primaryAim });
  });

  it('casts self overdrive on press with no ground preview and does not repeat while held', () => {
    const f = territory(), button = f.weaponSkills['3'], r = button.getBoundingClientRect();
    pointer(f.root, 'pointerdown', 3, r.left + 26, r.top + 26, button);
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    expect(f.frame().weaponSkill?.slot).toBe(3); expect(f.frame().weaponSkill).toBeUndefined();
    pointer(f.browser, 'pointerup', 3, r.left + 26, r.top + 26);
    expect(f.frame().weaponSkill).toBeUndefined();
  });
  it('casts the self ring on press while movement and primary fire remain captured', () => {
    const f = territory(), button = f.weaponSkills['2'], r = button.getBoundingClientRect();
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    pointer(f.root, 'pointerdown', 3, r.left + 26, r.top + 26, button);
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    expect(f.frame()).toMatchObject({ moveX: 1, fire: true, weaponSkill: { slot: 2 } });
    expect(f.frame()).toMatchObject({ moveX: 1, fire: true });
    expect(f.move.captures.has(1)).toBe(true); expect(f.attack.captures.has(2)).toBe(true);
    pointer(f.browser, 'pointerup', 3, r.left + 26, r.top + 26);
    expect(f.frame().weaponSkill).toBeUndefined();
  });

  it('makes weapon and facility previews mutually exclusive even across keyboard and touch entry points', () => {
    const f = territory(); initializeConstruction(f.state, ['launch-pod']);
    f.state.territory!.construction!.building = { id: 'exclusive-pod', blueprintId: 'launch-pod',
      ...TERRITORY_CANNON_BALANCE.origin, nodeId: 'core', builtAt: 0 };
    Object.assign(f.state.player, TERRITORY_CANNON_BALANCE.origin);
    const aim = { x: f.state.player.x + 300, y: f.state.player.y };
    expect(f.input.beginWeaponSkillPreview(1, aim, { range: 530, radius: 6, aim: 'direction' })).toBe(true);
    keyboard(f.browser, 'keydown', 'KeyE'); expect(f.frame().cannonHeld).toBe(false);
    expect(f.input.beginTouchCannon(aim, f.state.player)).toBe(false);
    expect(f.input.resolvePreview(f.state, f.project)?.kind).toBe('weapon');
    f.input.cancelSkillPreview(); keyboard(f.browser, 'keyup', 'KeyE'); keyboard(f.browser, 'keydown', 'KeyE');
    expect(f.frame().cannonHeld).toBe(true);
    expect(f.input.beginWeaponSkillPreview(1, aim, { range: 530, radius: 6, aim: 'direction' })).toBe(false);
    f.input.select(2); expect(f.frame().weaponSkill).toBeUndefined();
  });

  it('cancels directed gestures and clears accepted-but-unconsumed intents on global input reset', () => {
    const f = territory(), button = f.weaponSkills['1'], r = button.getBoundingClientRect();
    f.input.setWorldAim({ x: 800, y: 400 }); pointer(f.root, 'pointerdown', 2, 750, 300, f.attack); f.frame();
    pointer(f.root, 'pointerdown', 3, r.left + 26, r.top + 26, button);
    pointer(f.browser, 'pointercancel', 3, r.left + 26, r.top + 26);
    expect(f.frame().weaponSkill).toBeUndefined(); expect(f.frame().fire).toBe(true);
    pointer(f.root, 'pointerdown', 4, r.left + 26, r.top + 26, button); f.input.clear();
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined(); expect(button.captures.size).toBe(0);
    expect(f.frame()).toMatchObject({ fire: false, moveX: 0 });
    pointer(f.browser, 'pointerup', 4, r.left + 26, r.top + 26);
    expect(f.frame().weaponSkill).toBeUndefined();
    keyboard(f.browser, 'keydown', 'Digit1'); f.browser.dispatchEvent(new Event('blur'));
    expect(f.frame().weaponSkill).toBeUndefined();
  });
});

describe('territory garrison and cannon gestures keep independent aim', () => {
  const territory = () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    initializeConstruction(game.state, ['launch-pod']);
    game.state.territory!.construction!.building = { id: 'gesture-pod', blueprintId: 'launch-pod',
      ...TERRITORY_CANNON_BALANCE.origin, nodeId: 'core', builtAt: 0 };
    const f = fixture(game.state); f.frame(); return f;
  };
  it('opens tactical details from a third touch pointer without stealing the two battle controls or double toggling', () => {
    const f = territory();
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move); pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    pointer(f.root, 'pointerdown', 3, 500, 30, f.summary);
    expect(f.tactics.open).toBe(true); expect(f.move.captures.has(1)).toBe(true); expect(f.attack.captures.has(2)).toBe(true);
    const click = new Event('click', { cancelable: true }); Object.assign(click, { pointerType: 'touch', detail: 0 }); Object.defineProperty(click, 'target', { value: f.summary });
    f.root.dispatchEvent(click); expect(click.defaultPrevented).toBe(true); expect(f.tactics.open).toBe(true);
    pointer(f.browser, 'pointerup', 3, 500, 30); pointer(f.root, 'pointerdown', 4, 500, 30, f.summary);
    expect(f.tactics.open).toBe(false); expect(f.frame()).toMatchObject({ fire: true });
    const keyboardClick = new Event('click', { cancelable: true }); Object.assign(keyboardClick, { pointerType: '', detail: 0 }); Object.defineProperty(keyboardClick, 'target', { value: f.summary });
    f.root.dispatchEvent(keyboardClick); expect(keyboardClick.defaultPrevented).toBe(false); f.controls.destroy();
  });
  it('garrison press acts immediately at the player without a targeting preview or waiting for release', () => {
    const f = territory(), spring = f.state.territory!.nodes.find(node => node.id === 'heart-healing-1')!;
    Object.assign(f.state.player, { x: spring.x + 30, y: spring.y });
    const primary = { x: 2000, y: 800 }; f.input.setWorldAim(primary);
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    const skill = f.skills.scan, r = skill.rect;
    pointer(f.root, 'pointerdown', 3, r.left + 28, r.top + 28, skill);
    const command = f.frame();
    expect(command).toMatchObject({ fire: true, aim: primary, scan: true });
    expect(command.scanAim).toBeUndefined(); expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    pointer(f.browser, 'pointerup', 3, r.left + 28, r.top + 28);
    expect(f.frame()).toMatchObject({ fire: true, aim: primary, scan: false });
    expect(command.moveX).toBeGreaterThan(0); expect(f.frame().scan).toBe(false);
    f.controls.destroy();
  });
  it('dragging the garrison button cannot issue a remote deployment or steer primary fire', () => {
    const f = territory(), primary = { x: 800, y: 700 }; f.input.setWorldAim(primary);
    pointer(f.root, 'pointerdown', 1, 750, 300, f.attack);
    const skill = f.skills.scan, r = skill.rect;
    pointer(f.root, 'pointerdown', 2, r.left + 28, r.top + 28, skill);
    expect(f.frame()).toMatchObject({ scan: true, fire: true, aim: primary });
    pointer(f.browser, 'pointermove', 2, r.left + 70, r.top + 28);
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    expect(f.input.getPresentation(f.state, f.project).aim).toEqual(primary);
    pointer(f.browser, 'pointerup', 2, r.left + 70, r.top + 28);
    expect(f.frame()).toMatchObject({ scan: false, fire: true, aim: primary });
    f.controls.destroy();
  });
  it('holds E for a separate cannon preview and emits exactly one release, preserving legacy E interaction', () => {
    const f = territory(); Object.assign(f.state.player, TERRITORY_CANNON_BALANCE.origin);
    const aim = { x: 1800, y: 650 }; f.input.setWorldAim(aim);
    keyboard(f.browser, 'keydown', 'KeyE');
    expect(f.input.getPresentation(f.state, f.project)).toMatchObject({ aim, preview: { kind: 'cannon', origin: TERRITORY_CANNON_BALANCE.origin, radius: 240 } });
    expect(f.frame()).toMatchObject({ cannonPressed: true, cannonHeld: true, cannonReleased: false, cannonAim: aim, interact: false });
    expect(f.frame()).toMatchObject({ cannonPressed: false, cannonHeld: true });
    keyboard(f.browser, 'keyup', 'KeyE');
    expect(f.frame()).toMatchObject({ cannonReleased: true, cannonHeld: false, cannonAim: aim });
    expect(f.frame().cannonReleased).toBe(false);
    f.controls.destroy();
    const old = fixture(); old.frame(); keyboard(old.browser, 'keydown', 'KeyE');
    expect(old.frame().interact).toBe(true); old.controls.destroy();
  });
  it('an absent facility or remote E press cannot acquire a preview, and walking closer while held cannot arm it', () => {
    const f = territory(), origin = TERRITORY_CANNON_BALANCE.origin;
    delete f.state.territory!.construction!.building; Object.assign(f.state.player, origin);
    keyboard(f.browser, 'keydown', 'KeyE');
    expect(f.frame()).toMatchObject({ cannonPressed: false, cannonHeld: false, cannonReleased: false });
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    f.state.territory!.construction!.building = { id: 'newly-built', blueprintId: 'launch-pod', ...origin, nodeId: 'core', builtAt: 0 };
    expect(f.frame().cannonHeld).toBe(false);
    keyboard(f.browser, 'keydown', 'KeyE'); expect(f.frame().cannonHeld).toBe(false);
    keyboard(f.browser, 'keyup', 'KeyE');
    f.state.player.x += 111; keyboard(f.browser, 'keydown', 'KeyE');
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    Object.assign(f.state.player, origin); expect(f.frame().cannonHeld).toBe(false);
    keyboard(f.browser, 'keyup', 'KeyE'); expect(f.frame().cannonReleased).toBe(false);
    keyboard(f.browser, 'keydown', 'KeyE'); expect(f.frame().cannonHeld).toBe(true);
    f.controls.destroy();
  });
  it('crossing the interaction boundary cancels before the next sample even when no render ran', () => {
    const f = territory(), origin = TERRITORY_CANNON_BALANCE.origin; Object.assign(f.state.player, origin);
    keyboard(f.browser, 'keydown', 'KeyE'); expect(f.frame().cannonHeld).toBe(true);
    f.state.player.x += 111;
    expect(f.frame()).toMatchObject({ cannonHeld: false, cannonReleased: false, cannonCancelled: true });
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    Object.assign(f.state.player, origin); expect(f.frame().cannonHeld).toBe(false);
    keyboard(f.browser, 'keyup', 'KeyE'); expect(f.frame().cannonReleased).toBe(false);
    f.controls.destroy();
  });
  it.each(['infected', 'reloading', 'replacement'] as const)('cancels an owned E gesture when its facility becomes %s', reason => {
    const f = territory(), origin = TERRITORY_CANNON_BALANCE.origin; Object.assign(f.state.player, origin);
    keyboard(f.browser, 'keydown', 'KeyE'); expect(f.frame().cannonHeld).toBe(true);
    if (reason === 'infected') f.state.territory!.nodes.find(n => n.id === 'core')!.owner = 'infected';
    else if (reason === 'reloading') f.state.territory!.cannon = { readyAt: f.state.elapsed + 24, serial: 1 };
    else f.state.territory!.construction!.building!.id = 'replacement-pod';
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    keyboard(f.browser, 'keyup', 'KeyE');
    expect(f.frame()).toMatchObject({ cannonHeld: false, cannonReleased: false }); f.controls.destroy();
  });
  it('cannot queue a released E command from a facility retired before the simulation consumes it', () => {
    const f = territory(); Object.assign(f.state.player, TERRITORY_CANNON_BALANCE.origin);
    keyboard(f.browser, 'keydown', 'KeyE'); keyboard(f.browser, 'keyup', 'KeyE');
    f.state.territory!.construction!.building!.id = 'replacement';
    expect(f.frame()).toMatchObject({ cannonReleased: false, cannonCancelled: true }); f.controls.destroy();
  });
  it('releases the last displayed keyboard cannon marker when the camera moved after the simulation sample', () => {
    const f = territory(); Object.assign(f.state.player, TERRITORY_CANNON_BALANCE.origin);
    keyboard(f.browser, 'keydown', 'KeyE');
    f.frame();
    // A real camera update between simulation and painting changes pointer
    // projection. The shell must agree with the marker the player saw.
    f.camera.panX -= 35; f.camera.panY += 17;
    const shown = f.input.getPresentation(f.state, f.project).preview!;
    expect(shown.kind).toBe('cannon');
    f.camera.panX += 80; f.camera.panY -= 45; f.frame();
    expect(f.input.getPresentation(f.state, f.project).preview!.aim).toEqual(shown.aim);
    keyboard(f.browser, 'keyup', 'KeyE');
    const released = f.frame();
    expect(released.cannonAim).toEqual(shown.aim); expect(released.cannonReleased).toBe(true);
    f.controls.destroy();
  });
  it('retargets a held keyboard cannon only after a real mouse movement', () => {
    const f = territory(); Object.assign(f.state.player, TERRITORY_CANNON_BALANCE.origin);
    keyboard(f.browser, 'keydown', 'KeyE');
    const first = f.input.getPresentation(f.state, f.project).preview!.aim;
    f.camera.panX += 50; f.camera.panY += 20;
    expect(f.input.getPresentation(f.state, f.project).preview!.aim).toEqual(first);
    pointer(f.canvas, 'pointermove', 77, 550, 260, undefined, 'mouse');
    const retargeted = f.input.getPresentation(f.state, f.project).preview!.aim;
    expect(retargeted).not.toEqual(first);
    keyboard(f.browser, 'keyup', 'KeyE');
    expect(f.frame().cannonAim).toEqual(retargeted); f.controls.destroy();
  });
  it('a coalesced fresh E tap cannot reuse the preceding cannon target', () => {
    const f = territory(); Object.assign(f.state.player, TERRITORY_CANNON_BALANCE.origin);
    const previous = { x: 1600, y: 600 }; f.input.setWorldAim(previous);
    keyboard(f.browser, 'keydown', 'KeyE'); f.frame();
    f.input.getPresentation(f.state, f.project);
    keyboard(f.browser, 'keyup', 'KeyE'); expect(f.frame().cannonAim).toEqual(previous);
    const current = { x: 900, y: 1000 }; f.input.setWorldAim(current);
    keyboard(f.browser, 'keydown', 'KeyE'); keyboard(f.browser, 'keyup', 'KeyE');
    const fast = f.frame();
    expect(fast).toMatchObject({ cannonPressed: true, cannonReleased: true, cannonHeld: false, cannonAim: current });
    f.controls.destroy();
  });
  it('cannon touch release fires only the shell intent while held movement and shooting keep their aim', () => {
    const f = territory(); Object.assign(f.state.player, TERRITORY_CANNON_BALANCE.origin);
    const primary = { x: 1400, y: 700 }; f.input.setWorldAim(primary);
    pointer(f.root, 'pointerdown', 1, 750, 300, f.attack);
    pointer(f.root, 'pointerdown', 2, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 3, 50, 50, f.buttons.interact);
    expect(f.frame()).toMatchObject({ cannonPressed: true, cannonHeld: true, fire: true, aim: primary });
    pointer(f.browser, 'pointermove', 3, 120, 50);
    const preview = f.input.resolvePreview(f.state, f.project)!;
    expect(preview.kind).toBe('cannon'); expect(preview.aim).not.toEqual(primary);
    expect(f.frame()).toMatchObject({ cannonHeld: true, cannonAim: preview.aim, aim: primary, fire: true });
    pointer(f.browser, 'pointerup', 3, 120, 50);
    const command = f.frame(); expect(command).toMatchObject({ cannonReleased: true, cannonAim: preview.aim, aim: primary, fire: true });
    expect(command.moveX).toBeGreaterThan(0); f.controls.destroy();
  });
  it('a remote touch press does not capture or activate after moving closer', () => {
    const f = territory(), origin = TERRITORY_CANNON_BALANCE.origin;
    Object.assign(f.state.player, { x: origin.x + 111, y: origin.y });
    pointer(f.root, 'pointerdown', 9, 50, 50, f.buttons.interact);
    expect(f.buttons.interact.captures.has(9)).toBe(false);
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    Object.assign(f.state.player, origin); f.controls.update(); pointer(f.browser, 'pointerup', 9, 50, 50);
    expect(f.frame()).toMatchObject({ cannonPressed: false, cannonHeld: false, cannonReleased: false }); f.controls.destroy();
  });
  it('invalidates only the cannon finger when leaving range, preserving movement and shooting owners', () => {
    const f = territory(), origin = TERRITORY_CANNON_BALANCE.origin; Object.assign(f.state.player, origin);
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    pointer(f.root, 'pointerdown', 3, 50, 50, f.buttons.interact); expect(f.frame().cannonHeld).toBe(true);
    f.state.player.x += 111; f.controls.update();
    expect(f.buttons.interact.captures.has(3)).toBe(false);
    expect(f.move.captures.has(1)).toBe(true); expect(f.attack.captures.has(2)).toBe(true);
    const frame = f.frame(); expect(frame).toMatchObject({ cannonHeld: false, cannonReleased: false, fire: true });
    expect(frame.moveX).toBeGreaterThan(0); f.controls.destroy();
  });
  it('touch release checks actual proximity even without an intervening update', () => {
    const f = territory(); Object.assign(f.state.player, TERRITORY_CANNON_BALANCE.origin);
    pointer(f.root, 'pointerdown', 3, 50, 50, f.buttons.interact); f.frame();
    f.state.player.x += 111; pointer(f.browser, 'pointerup', 3, 50, 50);
    expect(f.frame()).toMatchObject({ cannonHeld: false, cannonReleased: false, cannonCancelled: true }); f.controls.destroy();
  });
  it('uses the real rapid facility parameters instead of caller-supplied preview geometry', () => {
    const f = territory(), building = f.state.territory!.construction!.building!;
    building.blueprintId = 'rapid-launch-pod'; Object.assign(f.state.player, building);
    expect(f.input.beginTouchCannon({ x: building.x + 400, y: building.y }, { x: 1, y: 1 }, 9999, 9999)).toBe(true);
    expect(f.input.resolvePreview(f.state, f.project)).toMatchObject({ origin: { x: building.x, y: building.y }, range: 800, radius: 200 });
    f.controls.destroy();
  });
  it.each(['pointercancel', 'clear', 'cancel-zone'])('cancels a cannon gesture via %s without emitting a shot release', mode => {
    const f = territory(); Object.assign(f.state.player, TERRITORY_CANNON_BALANCE.origin);
    pointer(f.root, 'pointerdown', 1, 50, 50, f.buttons.interact); f.frame();
    if (mode === 'clear') f.input.clear();
    else if (mode === 'pointercancel') pointer(f.browser, 'pointercancel', 1, 50, 50);
    else { pointer(f.browser, 'pointermove', 1, 350, 40); pointer(f.browser, 'pointerup', 1, 350, 40); }
    expect(f.frame()).toMatchObject({ cannonReleased: false, cannonHeld: false, cannonCancelled: true });
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined(); f.controls.destroy();
  });
  it('marks an impossible landing red without substituting an undisclosed distant target', () => {
    const f = territory(), origin = TERRITORY_CANNON_BALANCE.origin, aim = { x: origin.x + 350, y: origin.y };
    Object.assign(f.state.player, origin);
    f.state.world = { ...f.state.world!, obstacles: [{ id: 'sealed-landing', ...aim, radius: 120 }] };
    f.input.beginTouchCannon(aim, origin);
    expect(f.input.resolvePreview(f.state, f.project)).toMatchObject({ kind: 'cannon', aim, valid: false, cancelled: true, hint: '落点受阻 · 调整方向' });
    f.input.endTouchCannon(true);
    expect(f.frame()).toMatchObject({ cannonReleased: false, cannonCancelled: true });
    f.controls.destroy();
  });
  it('clears owned movement, primary and Q while airborne and requires fresh controls after landing', () => {
    const f = territory(), origin = TERRITORY_CANNON_BALANCE.origin;
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    expect(f.frame().fire).toBe(true);
    f.state.playerFlight = { id: 'flight', from: { ...origin }, to: { x: origin.x + 500, y: origin.y }, born: 0, landsAt: .75 };
    f.controls.update();
    pointer(f.root, 'pointerdown', 3, f.skills.scan.rect.left + 28, f.skills.scan.rect.top + 28, f.skills.scan);
    expect(f.frame()).toMatchObject({ moveX: 0, moveY: 0, fire: false });
    expect(f.input.resolvePreview(f.state, f.project)).toBeUndefined();
    delete f.state.playerFlight; f.controls.update(); f.frame();
    expect(f.frame()).toMatchObject({ moveX: 0, moveY: 0, fire: false, scan: false });
    pointer(f.root, 'pointerdown', 4, 750, 300, f.attack); expect(f.frame().fire).toBe(true);
    f.controls.destroy();
  });
});

describe('challenge charge input edges and captured touch gestures', () => {
  const challenge = () => { const game = new GameSession(42, { mode: 'endless' }); game.start(); return fixture(game.state); };
  it('keeps Space dash immediate, sends one press and one release, and ignores keyboard repeat', () => {
    const f = challenge(); f.frame();
    keyboard(f.browser, 'keydown', 'Space');
    expect(f.frame()).toMatchObject({ dash: true, chargePressed: true, chargeHeld: true, chargeReleased: false });
    const repeated = new Event('keydown', { cancelable: true }); Object.assign(repeated, { code: 'Space', repeat: true }); f.browser.dispatchEvent(repeated);
    expect(f.frame()).toMatchObject({ dash: false, chargePressed: false, chargeHeld: true, chargeReleased: false });
    keyboard(f.browser, 'keyup', 'Space');
    expect(f.frame()).toMatchObject({ chargeHeld: false, chargeReleased: true });
    expect(f.frame().chargeReleased).toBe(false);
  });
  it('cancels on tool switch and blur, requiring a fresh key press after recovery', () => {
    const f = challenge(); f.frame(); keyboard(f.browser, 'keydown', 'Space'); f.frame();
    f.input.select(2);
    expect(f.frame()).toMatchObject({ chargeHeld: false, chargeCancelled: true, chargeReleased: false });
    keyboard(f.browser, 'keyup', 'Space'); expect(f.frame().chargeReleased).toBe(false);
    keyboard(f.browser, 'keydown', 'Space'); f.frame(); f.browser.dispatchEvent(new Event('blur'));
    expect(f.frame()).toMatchObject({ chargeHeld: false, chargeCancelled: true, chargeReleased: false });
    keyboard(f.browser, 'keyup', 'Space'); expect(f.frame().chargeReleased).toBe(false);
    keyboard(f.browser, 'keydown', 'Space'); expect(f.frame().chargePressed).toBe(true);
  });
  it('captures dash hold, drags sword direction, and releases once while movement stays live', () => {
    const f = challenge(); f.input.setWorldAim({ x: 900, y: 400 });
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 50, 50, f.buttons.dash);
    expect(f.frame()).toMatchObject({ moveX: 1, dash: true, chargePressed: true, chargeHeld: true });
    expect(f.cancel.hidden).toBe(false);
    pointer(f.browser, 'pointermove', 2, 50, 100);
    const preview = f.input.resolvePreview(f.state, f.project)!;
    expect(preview.kind).toBe('charge'); expect(preview.aim.y).toBeGreaterThan(f.state.player.y);
    pointer(f.browser, 'pointerup', 2, 50, 100);
    expect(f.frame()).toMatchObject({ moveX: 1, chargeHeld: false, chargeReleased: true, chargeAim: preview.aim });
    expect(f.frame().chargeReleased).toBe(false); expect(f.cancel.hidden).toBe(true);
  });
  it.each(['cancel-zone', 'pointercancel', 'clear'] as const)('cancels touch charge via %s without release fire', reason => {
    const f = challenge();
    pointer(f.root, 'pointerdown', 2, 50, 50, f.buttons.dash); f.frame();
    if (reason === 'cancel-zone') { pointer(f.browser, 'pointermove', 2, 360, 40); pointer(f.browser, 'pointerup', 2, 360, 40); }
    else if (reason === 'pointercancel') pointer(f.browser, 'pointercancel', 2);
    else f.input.clear();
    expect(f.frame()).toMatchObject({ chargeCancelled: true, chargeHeld: false, chargeReleased: false });
    expect(f.buttons.dash.captures.size).toBe(0);
  });
  it('keeps hidden training on plain dash and removes challenge cannon guide confirmation', () => {
    const training = fixture(); training.frame(); keyboard(training.browser, 'keydown', 'Space');
    expect(training.frame()).toMatchObject({ dash: true }); expect(training.frame().chargeHeld).toBeUndefined();
    const f = challenge(); f.state.endlessGrowth!.ranks.nova = 3;
    pointer(f.root, 'pointerdown', 9, 628, 148, f.skills['2']);
    expect(f.guide.hidden).toBe(true);
  });
});

describe('mobile input ownership and world aiming', () => {
  it('supports simultaneous movement and primary fire, and releasing either finger preserves the other', () => {
    const f = fixture();
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 790, 300, f.aim);
    expect(f.frame()).toMatchObject({ moveX: 1, moveY: 0, fire: true });
    pointer(f.browser, 'pointerup', 1);
    expect(f.frame()).toMatchObject({ moveX: 0, moveY: 0, fire: true });
    pointer(f.root, 'pointerdown', 3, 50, 10, f.move);
    pointer(f.browser, 'pointerup', 2);
    expect(f.frame()).toMatchObject({ moveX: 0, moveY: -1, fire: false });
    expect(f.move.captures.has(3)).toBe(true);
    expect(f.aim.captures.size).toBe(0);
  });

  it('maps the right stick through the camera inverse and locks a world point after release', () => {
    const f = fixture();
    f.input.setTouchAim({ x: .6, y: .8 });
    const aim = f.input.getAim(f.state, f.project), dx = aim.x - f.state.player.x, dy = aim.y - f.state.player.y;
    expect(Math.hypot(dx, dy)).toBeCloseTo(TOUCH_AIM.range);
    expect(dy / dx).toBeCloseTo(.8 / .6 / .72);
    f.input.releaseTouchAim(f.state, f.project);
    f.camera.panX -= 200; f.camera.panY += 100; f.state.player.x += 80;
    expect(f.input.getAim(f.state, f.project)).toEqual(aim);
    f.input.queueAction('scan');
    expect(f.frame()).toMatchObject({ aim, scan: true, fire: false });
  });

  it('keeps the 15 percent aim dead zone quiet and scales distance continuously outside it', () => {
    const f = fixture();
    f.input.setWorldAim({ x: 600, y: 450 });
    f.input.setTouchAim({ x: .15, y: 0 });
    expect(f.frame()).toMatchObject({ aim: { x: 600, y: 450 }, fire: false });
    f.input.setTouchAim({ x: .575, y: 0 });
    expect(f.frame()).toMatchObject({ aim: { x: 825, y: 400 }, fire: true });
  });

  it('does not transfer right-stick primary fire into tools 2 or 3', () => {
    const f = fixture(); f.input.setTouchAim({ x: 1, y: 0 });
    expect(f.frame().fire).toBe(true);
    f.input.select(2); expect(f.frame()).toMatchObject({ tool: 2, fire: false });
    f.state.tool = 2;
    expect(f.frame().fire).toBe(false);
    f.input.select(3); expect(f.frame()).toMatchObject({ tool: 3, fire: false });
    f.state.tool = 3;
    expect(f.frame().fire).toBe(false);
  });

  it('uses battlefield touches only to select a world point and preserves it when Q is tapped', () => {
    const f = fixture();
    pointer(f.canvas, 'pointerdown', 4, 460, 200);
    const expected = f.project({ x: 450, y: 180 });
    expect(f.frame()).toMatchObject({ aim: expected, fire: false });
    pointer(f.browser, 'pointerup', 4);
    pointer(f.root, 'pointerdown', 5, 2, 3, f.buttons.scan);
    expect(f.frame()).toMatchObject({ aim: expected, scan: true, fire: false });
    expect(f.frame().scan).toBe(false);
  });

  it('consumes each touch action once through InputFrame without changing the selected aim', () => {
    const f = fixture(); f.input.setWorldAim({ x: 650, y: 430 });
    for (const [index, action] of ['dash', 'scan', 'interact', 'antibody'].entries()) {
      pointer(f.root, 'pointerdown', index + 1, 0, 0, f.buttons[action]);
    }
    expect(f.frame()).toMatchObject({ aim: { x: 650, y: 430 }, dash: true, scan: true, interact: true, antibody: true });
    expect(f.frame()).toMatchObject({ dash: false, scan: false, interact: false, antibody: false });
  });

  it('preserves every quick cast press and release as separate fixed-step fire states', () => {
    const f = fixture(); f.state.tool = 2;
    pointer(f.root, 'pointerdown', 6, 20, 20, f.buttons.cast);
    pointer(f.browser, 'pointerup', 6);
    pointer(f.root, 'pointerdown', 7, 20, 20, f.buttons.cast);
    pointer(f.browser, 'pointerup', 7);
    expect([f.frame().fire, f.frame().fire, f.frame().fire, f.frame().fire, f.frame().fire]).toEqual([true, false, true, false, false]);
  });

  it('cancels an unconsumed cast on OS pointer cancellation or tool change', () => {
    const f = fixture(); f.state.tool = 2;
    pointer(f.root, 'pointerdown', 6, 20, 20, f.buttons.cast);
    pointer(f.browser, 'pointercancel', 6);
    expect(f.frame().fire).toBe(false);
    pointer(f.root, 'pointerdown', 7, 20, 20, f.buttons.cast);
    f.input.select(3);
    expect(f.frame()).toMatchObject({ tool: 3, fire: false });
    f.state.tool = 3;
    expect(f.frame().fire).toBe(false);
    pointer(f.browser, 'pointerup', 7);
    pointer(f.root, 'pointerdown', 8, 20, 20, f.buttons.cast);
    expect(f.frame().fire).toBe(true);
  });

  it('bounds cast-button dragging in world space and keeps the left stick active', () => {
    const f = fixture(); f.state.tool = 2; f.input.setWorldAim({ x: 700, y: 400 });
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 20, 20, f.buttons.cast);
    pointer(f.browser, 'pointermove', 2, 200, 200);
    const frame = f.frame();
    expect(Math.hypot(frame.aim.x - 700, frame.aim.y - 400)).toBeCloseTo(100);
    expect(frame).toMatchObject({ moveX: 1, fire: true });
    pointer(f.browser, 'pointerup', 2);
    expect(f.frame()).toMatchObject({ moveX: 1, fire: false });
  });

  it('clears captures, visual knobs and queued actions across a blocked modal without resuming held input', () => {
    const f = fixture();
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    pointer(f.root, 'pointerdown', 2, 790, 300, f.aim);
    f.input.queueAction('antibody');
    f.allow(false);
    expect(f.frame()).toMatchObject({ moveX: 0, moveY: 0, fire: false });
    expect(f.move.captures.size + f.aim.captures.size).toBe(0);
    expect(f.move.querySelector('.stick-knob')!.style.translate).toBe('0px 0px');
    f.input.queueAction('scan'); f.input.setTouchCast(true);
    f.allow(true);
    expect(f.frame()).toMatchObject({ moveX: 0, fire: false, scan: false, antibody: false });
    expect(f.frame().fire).toBe(false);
  });

  it('leaves keyboard and mouse controls working and ignores unrelated touch releases', () => {
    const f = fixture();
    keyboard(f.browser, 'keydown', 'KeyW'); keyboard(f.browser, 'keydown', 'KeyQ');
    pointer(f.canvas, 'pointerdown', 100, 400, 200, undefined, 'mouse');
    expect(f.frame()).toMatchObject({ moveY: -1, scan: true, fire: true });
    pointer(f.browser, 'pointerup', 8);
    expect(f.frame()).toMatchObject({ moveY: -1, scan: false, fire: true });
    pointer(f.browser, 'pointerup', 100, 0, 0, undefined, 'mouse');
    keyboard(f.browser, 'keyup', 'KeyW');
    expect(f.frame()).toMatchObject({ moveY: 0, fire: false });
  });

  it('preserves desktop coalescing of multiple mouse clicks within one fixed step', () => {
    const f = fixture();
    for (const id of [100, 101]) {
      pointer(f.canvas, 'pointerdown', id, 400, 200, undefined, 'mouse');
      pointer(f.browser, 'pointerup', id, 400, 200, undefined, 'mouse');
    }
    expect([f.frame().fire, f.frame().fire, f.frame().fire]).toEqual([true, false, false]);
  });

  it('keeps mobile bindings inactive on desktop and clears all owners when the page is hidden', () => {
    const f = fixture(); f.enable(false);
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move);
    expect(f.frame().moveX).toBe(0);
    f.enable(true); pointer(f.root, 'pointerdown', 2, 90, 50, f.move);
    f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange'));
    expect(f.move.captures.size).toBe(0);
    expect(f.frame()).toMatchObject({ moveX: 0, fire: false });
  });
});

const clearWorld = () => ({ width: 2400, height: 1500, bounds: { left: 30, right: 2370, top: 30, bottom: 1470 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } });
const source = (id: string, x: number, y = 500): Target => ({ id, x, y, radius: 22, role: 'source', kind: 'single',
  hp: 100000, maxHp: 100000, hitUntil: 0, scanned: false });
function selectWorld(f: ReturnType<typeof fixture>, point: Vec, id = 90) {
  const screen = f.camera.worldToScreen(point), rect = f.canvas.getBoundingClientRect();
  pointer(f.canvas, 'pointerdown', id, screen.x + rect.left, screen.y + rect.top);
  pointer(f.browser, 'pointerup', id);
}
function pressAction(f: ReturnType<typeof fixture>, action: string, id = 91) {
  pointer(f.root, 'pointerdown', id, 0, 0, f.buttons[action]);
}
function tapAction(f: ReturnType<typeof fixture>, action: string, id = 91) {
  pressAction(f, action, id); pointer(f.browser, 'pointerup', id);
}

describe('DOM touch input reaches accepted gameplay effects', () => {
  it('repairs tissue from a battlefield-selected point with the independent cast button', () => {
    const game = new GameSession(); game.start(); game.state.world = clearWorld(); game.state.targets = [];
    Object.assign(game.state.player, { x: 500, y: 500 }); Object.assign(game.state.tissue, { x: 800, y: 500, hp: 25 });
    const f = fixture(game.state); f.input.select(3); selectWorld(f, game.state.tissue);
    game.step(f.frame());
    expect(game.state.tissue.hp).toBe(25);
    tapAction(f, 'cast'); game.step(f.frame());
    expect(game.state.tissue.hp).toBe(50);
    expect(game.state.events.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'repair')).toHaveLength(1);
  });

  it('reclaims an occupied healing point and consumes exactly the real two-sample cost', () => {
    const game = new GameSession(41, { campaign: true, milestone: 'G3' }); game.start(); game.state.targets = [];
    const point = healingPoints(game.state)[0];
    Object.assign(game.state.player, { x: point.x - 100, y: point.y, hp: 50 });
    point.infection = 100; point.infected = true; game.state.growth!.research = 3;
    const f = fixture(game.state); f.input.select(3); selectWorld(f, point); tapAction(f, 'cast');
    game.step(f.frame());
    expect(game.state.player.hp).toBe(75); expect(point.infection).toBe(0);
    expect(game.state.growth!.research).toBe(1);
    expect(game.state.events.find(event => event.type === 'HEALING_POINT_TREATED')?.data).toMatchObject({ nodeId: point.id, healed: 25, cost: 2 });
    game.step(f.frame());
    expect(game.state.growth!.research).toBe(1);
    expect(game.state.events.filter(event => event.type === 'HEALING_POINT_TREATED')).toHaveLength(1);
  });

  it('deploys with Q at the selected enemy, then redirects the same living cells to a new selected enemy', () => {
    const game = new GameSession(71, { campaign: true, milestone: 'G2' }); game.start();
    game.state.world = clearWorld(); Object.assign(game.state.player, { x: 500, y: 500 });
    Object.assign(game.state.tissue, { x: 500, y: 750, hp: 100 });
    const first = source('touch-first', 700), next = source('touch-next', 350);
    game.state.targets = [first, next]; game.state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    const f = fixture(game.state);
    selectWorld(f, first); tapAction(f, 'scan'); game.step(f.frame());
    const growth = game.state.growth!, beaconId = growth.beacon!.id, cells = growth.cells!.map(cell => cell.id), ready = growth.beaconReadyAt;
    expect(game.state.scans).toBe(1); expect(growth.cells).toHaveLength(3);
    expect(growth.beacon!.focus?.targetId).toBe(first.id);
    tapAction(f, 'scan'); game.step(f.frame()); expect(game.state.scans).toBe(1);
    while (game.state.elapsed < 3.1) game.step(f.frame());
    selectWorld(f, next); tapAction(f, 'scan'); game.step(f.frame());
    expect(game.state.scans).toBe(2); expect(game.state.shots).toBe(0);
    expect(growth.beacon!.id).toBe(beaconId); expect(growth.cells!.map(cell => cell.id)).toEqual(cells);
    expect(growth.beaconReadyAt).toBe(ready); expect(growth.beacon!.focus?.targetId).toBe(next.id);
    expect(game.state.events.find(event => event.type === 'IMMUNE_SQUAD_REDIRECTED')?.data).toMatchObject({ beaconId, focusTargetId: next.id, cost: 0 });
  });

  it('accepts a Q tissue-guard order through the same battlefield selection in an upgraded challenge', () => {
    const game = new GameSession(71, { mode: 'endless' }); game.start();
    game.state.world = clearWorld(); Object.assign(game.state.player, { x: 500, y: 500 });
    Object.assign(game.state.tissue, { x: 500, y: 750, hp: 100 }); game.state.targets = [source('keep-wave-active', 1100)];
    game.state.endlessGrowth!.ranks.immune = 3;
    const f = fixture(game.state); selectWorld(f, game.state.tissue); tapAction(f, 'scan'); game.step(f.frame());
    expect(game.state.growth!.beacon!.guard).toMatchObject({ kind: 'tissue', radius: 300 });
    expect(game.state.events.some(event => event.type === 'IMMUNE_GUARD_ASSIGNED')).toBe(true);
    expect(game.state.shots).toBe(0);
  });

  it('dashes only once while a touch action remains held beyond its cooldown', () => {
    const game = new GameSession(); game.start(); game.state.world = clearWorld(); game.state.targets = [];
    const f = fixture(game.state); pressAction(f, 'dash');
    for (let tick = 0; tick < 120; tick++) game.step(f.frame());
    expect(game.state.dashes).toBe(1);
    expect(game.state.events.filter(event => event.type === 'PLAYER_DASHED')).toHaveLength(1);
  });

  it('interacts with a real gate only once while the button remains held', () => {
    const game = new GameSession(71, { campaign: true, milestone: 'G2' }); game.start(); game.state.targets = [];
    const gate = game.state.battle!.graph.nodes.find(node => node.kind === 'gate')!;
    Object.assign(game.state.player, { x: gate.x, y: gate.y }); const before = gate.active;
    const f = fixture(game.state); pressAction(f, 'interact');
    for (let tick = 0; tick < 60; tick++) game.step(f.frame());
    expect(gate.active).toBe(!before);
    expect(game.state.events.filter(event => event.type === 'ROUTE_CHANGED')).toHaveLength(1);
  });

  it('injects antibody once through InputFrame and never spends another charge when the held button outlives the boost', () => {
    const game = new GameSession(71, { campaign: true, milestone: 'G2' }); game.start();
    game.state.world = clearWorld(); Object.assign(game.state.player, { x: 500, y: 500 });
    Object.assign(game.state.tissue, { x: 500, y: 750, hp: 100 }); game.state.targets = [];
    game.state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    const f = fixture(game.state); selectWorld(f, { x: 600, y: 500 }); tapAction(f, 'scan'); game.step(f.frame());
    expect(game.state.growth!.cells).toHaveLength(3);
    pressAction(f, 'antibody'); game.step(f.frame());
    expect(game.state.growth!.antibodyCharges).toBe(1); expect(game.state.growth!.cells).toHaveLength(6);
    for (let tick = 0; tick < 540; tick++) game.step(f.frame());
    expect(game.state.phase).toBe('playing'); expect(game.state.growth!.antibodyCharges).toBe(1);
    expect(game.state.growth!.antibodySerial).toBe(1);
  });

  it('pauses a real session with movement, firing and a pending action, then resumes without any residual effects', () => {
    const game = new GameSession(); game.start(); game.state.world = clearWorld(); game.state.targets = [];
    const f = fixture(game.state);
    pointer(f.root, 'pointerdown', 1, 90, 50, f.move); pointer(f.root, 'pointerdown', 2, 790, 300, f.aim);
    game.step(f.frame()); const before = { x: game.state.player.x, y: game.state.player.y, shots: game.state.shots };
    pressAction(f, 'dash'); game.pause(); f.controls.update();
    expect(f.move.captures.size + f.aim.captures.size).toBe(0);
    game.resume();
    for (let tick = 0; tick < 20; tick++) game.step(f.frame());
    expect(game.state.player).toMatchObject({ x: before.x, y: before.y });
    expect(game.state.shots).toBe(before.shots); expect(game.state.dashes).toBe(0);
  });
});

function skillDown(f: ReturnType<typeof fixture>, kind: '2' | '3' | 'scan', id = 70) {
  const element = f.skills[kind], rect = element.getBoundingClientRect();
  pointer(f.root, 'pointerdown', id, rect.left + rect.width / 2, rect.top + rect.height / 2, element);
}

describe('MOBA attack and atomic skill gestures', () => {
  it('fires a nonzero forward beam from a centre press before the player has ever selected or dragged an aim', () => {
    const game = new GameSession(); game.start(); game.state.world = clearWorld();
    Object.assign(game.state.player, { x: 1100, y: 800, facing: 0 });
    const target: Target = { id: 'forward-target', x: 1300, y: 800, radius: 22, kind: 'single', hp: 100, maxHp: 100, hitUntil: 0, scanned: false };
    game.state.targets = [target];
    const f = fixture(game.state); f.camera.follow(game.state.player, game.state.world, { snap: true });
    expect(f.input.getAim(game.state, f.project).x).toBeCloseTo(game.state.player.x, 8);
    expect(f.input.getAim(game.state, f.project).y).toBeCloseTo(game.state.player.y, 8);
    pointer(f.root, 'pointerdown', 1, 750, 300, f.attack); game.step(f.frame());
    expect(target.hp).toBe(100 - BALANCE.damage[1]);
    const beam = game.state.effects.find(effect => effect.kind === 'beam')!;
    expect(beam).toBeDefined(); expect(Math.hypot(beam.to.x - beam.from.x, beam.to.y - beam.from.y)).toBeGreaterThan(100);
  });

  it('fires the main attack from its centre at the selected world point, and retargets only after dragging', () => {
    const f = fixture(); f.input.setWorldAim({ x: 670, y: 430 });
    pointer(f.root, 'pointerdown', 1, 750, 300, f.attack);
    expect(f.frame()).toMatchObject({ tool: 1, fire: true, aim: { x: 670, y: 430 } });
    pointer(f.browser, 'pointermove', 1, 752, 300);
    expect(f.frame()).toMatchObject({ fire: true, aim: { x: 670, y: 430 } });
    pointer(f.browser, 'pointermove', 1, 790, 300);
    expect(f.frame()).toMatchObject({ tool: 1, fire: true, aim: { x: 1030, y: 400 } });
    pointer(f.browser, 'pointerup', 1);
    expect(f.frame()).toMatchObject({ fire: false, aim: { x: 1030, y: 400 } });
  });

  it('preserves a short primary tap for one fixed step but cancels a pointer-cancelled tap', () => {
    const f = fixture(); f.input.setWorldAim({ x: 700, y: 400 });
    pointer(f.root, 'pointerdown', 1, 750, 300, f.attack); pointer(f.browser, 'pointerup', 1);
    expect(f.frame()).toMatchObject({ tool: 1, fire: true, aim: { x: 700, y: 400 } });
    expect(f.frame().fire).toBe(false);
    pointer(f.root, 'pointerdown', 2, 750, 300, f.attack); pointer(f.browser, 'pointercancel', 2);
    expect(f.frame().fire).toBe(false);
  });

  it('keeps skill previews out of real tool/fire/scan input and suppresses an already-held attack until it is released', () => {
    const f = fixture(); f.input.setWorldAim({ x: 700, y: 400 });
    pointer(f.root, 'pointerdown', 1, 750, 300, f.attack); expect(f.frame().fire).toBe(true);
    skillDown(f, '2'); pointer(f.browser, 'pointermove', 70, 660, 148);
    expect(f.root.dataset.gesture).toBe('preview');
    expect(f.input.getPresentation(f.state, f.project).tool).toBe(2);
    expect(f.frame()).toMatchObject({ tool: undefined, fire: false, scan: false, aim: { x: 700, y: 400 } });
    pointer(f.browser, 'pointermove', 70, 360, 40);
    expect(f.root.dataset.gesture).toBe('cancel');
    pointer(f.browser, 'pointerup', 70, 360, 40);
    expect(f.frame()).toMatchObject({ fire: false, scan: false, tool: undefined });
    expect(f.frame().fire).toBe(false);
    pointer(f.browser, 'pointerup', 1);
    pointer(f.root, 'pointerdown', 2, 750, 300, f.attack);
    expect(f.frame()).toMatchObject({ tool: 1, fire: true });
  });

  it.each([['2', 420], ['3', 530], ['scan', 650]] as const)('maps skill %s preview to its own real range without changing gameplay input', (kind, range) => {
    const f = fixture(); f.input.setWorldAim({ x: 650, y: 450 }); skillDown(f, kind);
    f.input.setSkillPreviewVector({ x: .6, y: .8 });
    const preview = f.input.resolvePreview(f.state, f.project)!;
    expect(preview.kind).toBe(kind === 'scan' ? kind : Number(kind));
    expect(Math.hypot(preview.aim.x - 500, preview.aim.y - 400)).toBeCloseTo(range);
    expect((preview.aim.y - 400) / (preview.aim.x - 500)).toBeCloseTo(.8 / .6 / .72);
    expect(f.frame()).toMatchObject({ aim: { x: 650, y: 450 }, fire: false, scan: false, tool: undefined });
    pointer(f.browser, 'pointerup', 70);
    const committed = f.frame();
    expect(committed.aim).toEqual(preview.aim);
    expect(committed.fire).toBe(kind !== 'scan'); expect(committed.scan).toBe(kind === 'scan');
    expect(committed.tool).toBe(kind === 'scan' ? undefined : Number(kind));
    expect(f.frame().fire).toBe(false); expect(f.frame().scan).toBe(false);
  });

  it('serializes immutable tool/aim/fire and scan commands rather than mixing simultaneously released skills', () => {
    const f = fixture();
    f.input.beginSkillPreview(2, { x: 600, y: 410 }); f.input.commitSkillPreview(f.state, f.project);
    f.input.beginSkillPreview(3, { x: 700, y: 420 }); f.input.commitSkillPreview(f.state, f.project);
    f.input.beginSkillPreview('scan', { x: 800, y: 430 }); f.input.commitSkillPreview(f.state, f.project);
    f.input.setWorldAim({ x: 1000, y: 700 });
    expect(f.frame()).toMatchObject({ tool: 2, aim: { x: 600, y: 410 }, fire: true, scan: false });
    expect(f.frame()).toMatchObject({ tool: 2, aim: { x: 600, y: 410 }, fire: false, scan: false });
    expect(f.frame()).toMatchObject({ tool: 3, aim: { x: 700, y: 420 }, fire: true, scan: false });
    expect(f.frame()).toMatchObject({ tool: 3, aim: { x: 700, y: 420 }, fire: false, scan: false });
    expect(f.frame()).toMatchObject({ tool: undefined, aim: { x: 800, y: 430 }, fire: false, scan: true });
  });

  it('cancels a real skill preview without selecting a tool, firing or spending cooldowns', () => {
    const game = new GameSession(); game.start(); game.state.world = clearWorld(); game.state.targets = [];
    const f = fixture(game.state), original = { tool: game.state.tool, shots: game.state.shots, scanReady: game.state.scanReady, cooldowns: { ...game.state.cooldowns } };
    skillDown(f, '2'); pointer(f.browser, 'pointermove', 70, 660, 148);
    for (let tick = 0; tick < 20; tick++) game.step(f.frame());
    pointer(f.browser, 'pointermove', 70, 360, 40); pointer(f.browser, 'pointerup', 70, 360, 40);
    game.step(f.frame());
    expect(game.state).toMatchObject(original);
    expect(game.state.events.some(event => ['TOOL_SELECTED', 'TOOL_FIRED', 'SCAN_COMPLETED'].includes(event.type))).toBe(false);
    expect(f.root.dataset.gesture).toBe('idle'); expect(f.cancel.hidden).toBe(true);
  });

  it('commits precise tool-3 repair on skill release using the last battlefield point', () => {
    const game = new GameSession(); game.start(); game.state.world = clearWorld(); game.state.targets = [];
    Object.assign(game.state.player, { x: 500, y: 500 }); Object.assign(game.state.tissue, { x: 800, y: 500, hp: 25 });
    const f = fixture(game.state); selectWorld(f, game.state.tissue); skillDown(f, '3');
    game.step(f.frame()); expect(game.state.tissue.hp).toBe(25); expect(game.state.tool).toBe(1);
    pointer(f.browser, 'pointerup', 70); game.step(f.frame());
    expect(game.state.tissue.hp).toBe(50); expect(game.state.tool).toBe(3);
    for (let tick = 0; tick < 60; tick++) game.step(f.frame());
    expect(game.state.tissue.hp).toBe(50);
  });

  it('deploys Q from the skill release point and never fires the selected primary tool', () => {
    const game = new GameSession(71, { campaign: true, milestone: 'G2' }); game.start(); game.state.world = clearWorld();
    Object.assign(game.state.player, { x: 500, y: 500 }); Object.assign(game.state.tissue, { x: 500, y: 750, hp: 100 });
    const target = source('skill-focus', 700); game.state.targets = [target]; game.state.growth!.equipped = [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    const f = fixture(game.state); selectWorld(f, target); skillDown(f, 'scan');
    game.step(f.frame()); expect(game.state.scans).toBe(0);
    pointer(f.browser, 'pointerup', 70); game.step(f.frame());
    expect(game.state.scans).toBe(1); expect(game.state.shots).toBe(0); expect(game.state.tool).toBe(1);
    expect(game.state.growth!.beacon!.focus?.targetId).toBe(target.id);
    expect(game.state.growth!.cells).toHaveLength(3);
  });

  it('clears all previews, callbacks, captures and queued atomic casts when blocked', () => {
    const f = fixture(); skillDown(f, '3'); pointer(f.browser, 'pointermove', 70, 590, 133);
    expect(f.onPreviewChange.mock.calls.at(-1)?.[0]?.phase).toBe('preview');
    f.allow(false); f.controls.update();
    expect(f.skills['3'].captures.size).toBe(0); expect(f.root.dataset.gesture).toBe('idle');
    expect(f.onPreviewChange.mock.calls.at(-1)?.[0]).toBeUndefined();
    f.allow(true); expect(f.frame().fire).toBe(false);
    f.input.beginSkillPreview(2, { x: 600, y: 400 }); f.input.commitSkillPreview(f.state, f.project);
    f.input.clear(); expect(f.frame().fire).toBe(false); expect(f.frame().fire).toBe(false);
  });

  it('retains the last valid preview point when travelling outside the wheel into the III guide confirmation', () => {
    const game = new GameSession(); game.start(); game.state.world = clearWorld(); game.state.targets = [];
    Object.assign(game.state.player, { x: 500, y: 500 }); game.state.endlessGrowth = createEndlessGrowth(71); game.state.endlessGrowth.ranks.nova = 3;
    const f = fixture(game.state); f.input.setWorldAim({ x: 750, y: 500 }); skillDown(f, '2');
    expect(f.guide.hidden).toBe(false);
    pointer(f.browser, 'pointermove', 70, 660, 148);
    const selected = f.input.resolvePreview(game.state, f.project)!.aim;
    pointer(f.browser, 'pointermove', 70, 760, 148);
    expect(f.input.resolvePreview(game.state, f.project)!.aim).toEqual(selected);
    pointer(f.browser, 'pointermove', 70, 450, 40);
    expect(f.root.dataset.gesture).toBe('guiding'); expect(game.state.shots).toBe(0);
    const step = () => { game.step(f.frame()); f.controls.update(); };
    step(); expect(game.state.shots).toBe(1); expect(game.state.traction!.initialCenter).toEqual(selected);
    for (let tick = 0; tick < 15; tick++) step();
    expect(game.state.traction?.stage).toBe('guiding');
    pointer(f.browser, 'pointermove', 70, 480, 40);
    for (let tick = 0; tick < 5; tick++) step();
    expect(game.state.traction!.center.x).toBeGreaterThan(selected.x);
    expect(Math.hypot(game.state.traction!.center.x - selected.x, game.state.traction!.center.y - selected.y)).toBeLessThanOrEqual(100);
    pointer(f.browser, 'pointerup', 70); step();
    expect(game.state.traction?.stage).toBe('fuse');
    expect(game.state.traction!.resolveAt - game.state.elapsed).toBeCloseTo(.3);
    expect(game.state.shots).toBe(1);
    expect(f.input.getAim(game.state, f.project).x).toBeGreaterThan(selected.x);
  });

  it('uses the native .85 second automatic guide release even when the guiding finger never lifts', () => {
    const game = new GameSession(); game.start(); game.state.world = clearWorld(); game.state.targets = [];
    Object.assign(game.state.player, { x: 500, y: 500 }); game.state.endlessGrowth = createEndlessGrowth(71); game.state.endlessGrowth.ranks.nova = 3;
    const f = fixture(game.state); f.input.setWorldAim({ x: 750, y: 500 }); skillDown(f, '2'); pointer(f.browser, 'pointermove', 70, 450, 40);
    for (let tick = 0; tick < 120; tick++) { game.step(f.frame()); f.controls.update(); }
    expect(game.state.shots).toBe(1); expect(game.state.traction).toBeUndefined();
    expect(f.skills['2'].captures.size).toBe(0); expect(f.root.dataset.gesture).toBe('idle');
  });
});

describe('touch cast integration with actual traction rules', () => {
  it('starts once on press, allows held guidance, then releases into the existing delayed fuse', () => {
    const f = fixture(), session = new GameSession(); session.start();
    session.state.world = { width: 1600, height: 1100, bounds: { left: 20, right: 1580, top: 20, bottom: 1080 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    Object.assign(session.state.player, { x: 500, y: 500 });
    session.state.targets = []; session.state.tool = 2;
    session.state.endlessGrowth = createEndlessGrowth(71); session.state.endlessGrowth.ranks.nova = 3;
    f.input.setWorldAim({ x: 800, y: 500 });
    const step = () => session.step(f.input.frame(f.input.getAim(session.state, f.project)), BALANCE.step);
    f.input.setTouchCast(true); step();
    expect(session.state.traction?.stage).toBe('aiming');
    expect(session.state.shots).toBe(1);
    f.input.setWorldAim({ x: 900, y: 500 });
    for (let i = 0; i < 15; i++) step();
    expect(session.state.traction?.stage).toBe('guiding');
    expect(session.state.traction!.center.x).toBeGreaterThan(800);
    expect(session.state.traction!.center.x).toBeLessThanOrEqual(900);
    f.input.setTouchCast(false); step();
    expect(session.state.traction?.stage).toBe('fuse');
    const releaseAt = session.state.elapsed;
    expect(session.state.traction!.resolveAt - releaseAt).toBeCloseTo(.3);
    for (let i = 0; i < 20; i++) step();
    expect(session.state.traction).toBeUndefined();
    expect(session.state.shots).toBe(1);
  });

  it('allows a fresh quick tool-2 tap immediately after pause while delivering the required release barrier first', () => {
    const f = fixture(), session = new GameSession(); session.start();
    session.state.world = { width: 1600, height: 1100, bounds: { left: 20, right: 1580, top: 20, bottom: 1080 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    Object.assign(session.state.player, { x: 500, y: 500 }); session.state.targets = []; session.state.tool = 2;
    session.pause(); f.input.clear(); session.resume();
    f.input.setWorldAim({ x: 800, y: 500 }); f.input.setTouchCast(true); f.input.setTouchCast(false);
    const step = () => session.step(f.input.frame(f.input.getAim(session.state, f.project)));
    step(); expect(session.state.shots).toBe(0);
    step(); expect(session.state.shots).toBe(1);
    step(); expect(session.state.shots).toBe(1);
  });

  it('uses a locked point for real tool-3 repair without firing merely from moving the right stick', () => {
    const f = fixture(), session = new GameSession(); session.start();
    session.state.world = { width: 1600, height: 1100, bounds: { left: 20, right: 1580, top: 20, bottom: 1080 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    Object.assign(session.state.player, { x: 500, y: 500 }); Object.assign(session.state.tissue, { x: 800, y: 500, hp: 25 });
    session.state.targets = []; session.state.tool = 3;
    f.input.setTouchAim({ x: .8, y: 0 });
    session.step(f.input.frame(f.input.getAim(session.state, f.project)));
    expect(session.state.tissue.hp).toBe(25);
    f.input.setWorldAim({ x: 800, y: 500 }); f.input.setTouchCast(true); f.input.setTouchCast(false);
    session.step(f.input.frame(f.input.getAim(session.state, f.project)));
    expect(session.state.tissue.hp).toBe(50);
  });
});
