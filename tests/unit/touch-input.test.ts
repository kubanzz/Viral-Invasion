import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controller, TOUCH_AIM } from '../../src/input/controller';
import { TouchControls } from '../../src/input/touchControls';
import { Camera } from '../../src/render/camera';
import { GameSession } from '../../src/game/session';
import { createEndlessGrowth } from '../../src/game/endlessGrowth';
import { healingPoints } from '../../src/game/healingPoints';
import { BALANCE, type GameState, type Target, type Vec } from '../../src/game/types';

class ElementStub extends EventTarget {
  parentElement: ElementStub | null = null;
  children: ElementStub[] = [];
  dataset: Record<string, string> = {};
  style = { translate: '' };
  hidden = false;
  disabled = false;
  isContentEditable = false;
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
    return selector.trim().split(',').some(part => part.trim() === '.stick-knob' ? this.role === 'knob'
      : part.trim() === '.mobile-stick[data-stick]' ? !!this.dataset.stick
        : part.trim() === '[data-touch-action]' ? !!this.dataset.touchAction
          : part.trim() === '[data-touch-skill]' ? !!this.dataset.touchSkill
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
  const input = new Controller(canvas as unknown as HTMLCanvasElement, vi.fn(), vi.fn(), canAccept);
  const camera = new Camera(844, 390); camera.panX = -40; camera.panY = -80;
  const state = stateOverride ?? { player: { x: 500, y: 400 }, tool: 1 } as GameState;
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
  const cancel = new ElementStub('cancel', { left: 320, top: 20, width: 80, height: 40 }); cancel.dataset.touchCancel = ''; cancel.hidden = true;
  const guide = new ElementStub('guide', { left: 410, top: 20, width: 80, height: 40 }); guide.dataset.touchGuide = ''; guide.hidden = true;
  const buttons = Object.fromEntries(['cast', 'dash', 'scan', 'interact', 'antibody'].map(action => {
    const element = new ElementStub('button'); element.dataset.touchAction = action; return [action, element];
  }));
  root.append(move, aim, attack, ...Object.values(skills), cancel, guide, ...Object.values(buttons));
  const onPreviewChange = vi.fn();
  const controls = new TouchControls({ root: root as unknown as HTMLElement, canvas: canvas as unknown as HTMLCanvasElement,
    input, getState: () => state, screenToWorld: project, canAccept, enabled: () => enabled, onPreviewChange });
  const frame = () => input.frame(input.getAim(state, project));
  return { browser, document, input, canvas, camera, project, root, move, aim, attack, skills, cancel, guide, onPreviewChange, buttons, controls, state, frame,
    allow(value: boolean) { allowed = value; }, enable(value: boolean) { enabled = value; } };
}

afterEach(() => vi.unstubAllGlobals());

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
