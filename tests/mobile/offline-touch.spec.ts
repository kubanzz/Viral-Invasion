import { expect, test, type Page, type CDPSession, type TestInfo } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readState } from '../e2e/campaignDriver';
import type { GameState, Vec } from '../../src/game/types';
import type { SkillKind, TouchPresentation } from '../../src/input/controller';
import type { Renderer } from '../../src/render/renderer';

const entry = pathToFileURL(resolve('releases/Viral-Invasion-Mobile.html')).href;
const attack = '.mobile-attack[data-stick="attack"]', moveStick = '[data-stick="move"]';
const skill = (kind: SkillKind) => `button[data-touch-skill="${kind}"]`;
const skillRanges = [[2, 420], [3, 530], ['scan', 650]] as const;
type Box = { x: number; y: number; width: number; height: number };
type Diagnostics = ReturnType<Renderer['diagnostics']> & { touch?: TouchPresentation };
interface PointerAudit { type: string; pointerType: string; trusted: boolean; id: number; control: string; x: number; y: number }

async function start(page: Page, mode: 'campaign' | 'endless' | 'training' = 'campaign', query = '') {
  await page.context().setOffline(true);
  await page.goto(`${entry}?seed=41${mode === 'training' ? '&scenario=training' : ''}${query ? `&${query}` : ''}`);
  await page.locator(`[data-action="${mode === 'endless' ? 'endless-start' : 'start'}"]`).tap();
  await expect.poll(async () => (await readState(page)).phase).toBe('playing');
  await expect(page.locator('#mobile-controls')).toHaveAttribute('data-active', 'true');
}
async function center(page: Page, selector: string, dx = 0, dy = 0): Promise<Vec> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Missing touch control ${selector}`);
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
}

/** Browser-dispatched contacts; no synthetic PointerEvent or simulation writes. */
class Fingers {
  private points = new Map<number, Vec>();
  constructor(private readonly cdp: CDPSession) {}
  async down(id: number, point: Vec) { this.points.set(id, point); await this.send('touchStart', [...this.points]); }
  async move(id: number, point: Vec) {
    if (!this.points.has(id)) throw new Error(`No active finger ${id}`);
    this.points.set(id, point); await this.send('touchMove', [...this.points]);
  }
  async up(id: number) {
    const point = this.points.get(id); this.points.delete(id);
    // A nonempty Chromium CDP touchEnd identifies the released contact;
    // passing remaining contacts would release the wrong finger.
    if (point) await this.send('touchEnd', [[id, point]]);
  }
  async release() { this.points.clear(); await this.send('touchEnd', []); }
  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, Vec][]) {
    await this.cdp.send('Input.dispatchTouchEvent', { type,
      touchPoints: points.map(([id, point]) => ({ ...point, id, radiusX: 2, radiusY: 2, force: 1 })) });
  }
}
interface Gesture { method: string; down(point: Vec): Promise<void>; move(point: Vec): Promise<void>; up(): Promise<void> }
async function gesture(page: Page, browserName: string): Promise<Gesture> {
  if (browserName === 'chromium') {
    const fingers = new Fingers(await page.context().newCDPSession(page));
    return { method: 'Chromium CDP trusted touch contact; not physical iPhone input',
      down: point => fingers.down(1, point), move: point => fingers.move(1, point), up: () => fingers.up(1) };
  }
  return { method: 'WebKit trusted mouse drag on touch controls; not multi-touch or physical iPhone input',
    down: async point => { await page.mouse.move(point.x, point.y); await page.mouse.down(); },
    move: point => page.mouse.move(point.x, point.y), up: () => page.mouse.up() };
}
async function auditPointers(page: Page) {
  await page.evaluate(() => {
    const target = window as Window & { __mobilePointerAudit?: PointerAudit[] }; target.__mobilePointerAudit = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(type, event => {
      const pointer = event as PointerEvent, element = pointer.target instanceof Element ? pointer.target.closest('[data-stick],[data-touch-skill],[data-touch-action]') : null;
      target.__mobilePointerAudit!.push({ type, pointerType: pointer.pointerType, trusted: pointer.isTrusted, id: pointer.pointerId,
        control: element?.getAttribute('data-stick') || element?.getAttribute('data-touch-skill') || element?.getAttribute('data-touch-action') || '', x: pointer.clientX, y: pointer.clientY });
      if (target.__mobilePointerAudit!.length > 180) target.__mobilePointerAudit!.shift();
    });
  });
}
async function pointerEvidence(page: Page, info: TestInfo, method: string) {
  const events = await page.evaluate(() => (window as Window & { __mobilePointerAudit?: PointerAudit[] }).__mobilePointerAudit ?? []);
  expect(events.some(event => event.type === 'pointerdown' && event.trusted)).toBe(true);
  expect(events.some(event => event.type === 'pointerup' && event.trusted)).toBe(true);
  await info.attach('browser-input-evidence', { body: JSON.stringify({ method, physicalIPhoneTouch: false, events }, null, 2), contentType: 'application/json' });
}
async function touchPresentation(page: Page): Promise<TouchPresentation | undefined> {
  return page.evaluate(() => (window.__viral.diagnostics() as unknown as Diagnostics).touch);
}
const consumption = (state: GameState) => ({ tool: state.tool, shots: state.shots, scans: state.scans, cooldowns: state.cooldowns,
  scanReady: state.scanReady, tissue: state.tissue.hp, charges: state.growth?.antibodyCharges, tractionId: state.traction?.id,
  receipts: state.events.filter(event => ['TOOL_SELECTED', 'TOOL_FIRED', 'TOOL_REJECTED', 'SCAN_COMPLETED', 'TRACTION_STARTED'].includes(event.type)) });
async function ticksAfter(page: Page, elapsed: number, seconds = .1) {
  await expect.poll(async () => (await readState(page)).elapsed).toBeGreaterThanOrEqual(elapsed + seconds);
}

interface Insets { left: number; right: number; top: number; bottom: number }
interface LayoutCase { width: number; height: number; name: string; safe?: Insets }
const layoutCases: LayoutCase[] = [
  { width: 667, height: 375, name: '667x375' }, { width: 844, height: 390, name: '844x390' }, { width: 932, height: 430, name: '932x430' },
  { width: 667, height: 280, name: '667x280-host-content' }, { width: 667, height: 320, name: '667x320-host-content' },
  { width: 844, height: 320, name: '844x320-host-content' },
  { width: 844, height: 320, name: '844x320-derived-safe44-bottom21', safe: { left: 44, right: 44, top: 0, bottom: 21 } },
  { width: 932, height: 375, name: '932x375-host-content' },
];
const clickableSelectors = '.mobile-stick,.mobile-skill,.mobile-aux,.mobile-top-actions button,.mobile-map';
const panelSelectors = '.mobile-readouts,.mobile-objective,.mobile-warning-strip,.mobile-aim-hint,.message,#mobile-notice';
// The v3 quarter-circle and outer auxiliary arc occupy 250px from the right
// edge (60 + 112 + 56 + 22); keep a further 10px of empty space beside them.
const rightThumbZone = 260;
const intersects = (a: Box, b: Box) => a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
async function visibleBoxes(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(nodes => nodes.flatMap(node => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return [];
    return [{ label: node.getAttribute('aria-label') || node.id || node.textContent || node.className, x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
  }));
}
async function battlefieldEvidence(page: Page) {
  return page.evaluate(() => {
    const state = window.__viral.snapshot(), diagnostics = window.__viral.diagnostics() as unknown as Diagnostics;
    const body = diagnostics.art.activeBodies.find(candidate => candidate.id === 'player')?.bounds;
    const upper = body && window.__viral.toScreen({ x: body.left, y: body.top / .72 }), lower = body && window.__viral.toScreen({ x: body.right, y: body.bottom / .72 });
    return { tick: state.tick, tool: state.tool, foot: window.__viral.toScreen(state.player),
      hero: upper && lower ? { x: upper.x, y: upper.y, width: lower.x - upper.x, height: lower.y - upper.y } : null,
      crosshair: diagnostics.crosshair && { ...diagnostics.crosshair, screen: window.__viral.toScreen(diagnostics.crosshair.aim) }, touch: diagnostics.touch,
      hud: diagnostics.hudRects.map(rect => ({ x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top })) };
  });
}
async function arcGeometry(page: Page) {
  const main = (await page.locator(attack).boundingBox())!;
  expect(main).not.toBeNull(); expect(main.width).toBeCloseTo(88, 0); expect(main.height).toBeCloseTo(88, 0);
  const origin = { x: main.x + main.width / 2, y: main.y + main.height / 2 }, points = [];
  for (const [kind] of skillRanges) {
    const button = page.locator(skill(kind)), box = (await button.boundingBox())!;
    expect(box).not.toBeNull(); expect(box.width).toBeCloseTo(56, 0); expect(box.height).toBeCloseTo(56, 0);
    expect(await button.evaluate(node => parseFloat(getComputedStyle(node).borderTopLeftRadius))).toBeGreaterThanOrEqual(28);
    points.push({ kind, x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  expect(points[0].x).toBeLessThan(origin.x - 56); expect(Math.abs(points[0].y - origin.y)).toBeLessThanOrEqual(12);
  expect(points[1].x).toBeLessThan(origin.x - 40); expect(points[1].y).toBeLessThan(origin.y - 40);
  expect(Math.abs(points[2].x - origin.x)).toBeLessThanOrEqual(12); expect(points[2].y).toBeLessThan(origin.y - 56);
  const radii = points.map(point => Math.hypot(point.x - origin.x, point.y - origin.y)); expect(Math.max(...radii) - Math.min(...radii)).toBeLessThanOrEqual(22);
  for (const button of await page.locator('.mobile-aux').all()) {
    const box = (await button.boundingBox())!; expect(box.width).toBeCloseTo(44, 0); expect(box.height).toBeCloseTo(44, 0);
    expect(await button.evaluate(node => parseFloat(getComputedStyle(node).borderTopLeftRadius))).toBeGreaterThanOrEqual(22);
  }
  return { origin, points, radii };
}
async function minimapEvidence(page: Page) {
  return page.evaluate(() => {
    const target = document.querySelector<HTMLCanvasElement>('#mobile-minimap');
    const source = document.querySelector<HTMLCanvasElement>(window.__viral.snapshot().endless ? '#endless-minimap' : '#tactical-map');
    if (!target || !source) return { matchesSource: false, colors: 0 };
    const reference = document.createElement('canvas'); reference.width = target.width; reference.height = target.height;
    reference.getContext('2d')!.drawImage(source, 0, 0, target.width, target.height);
    const data = target.getContext('2d')!.getImageData(0, 0, target.width, target.height).data, colors = new Set<string>();
    for (let offset = 0; offset < data.length; offset += 4) colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`);
    return { matchesSource: target.toDataURL() === reference.toDataURL(), colors: colors.size, width: target.width, height: target.height };
  });
}

for (const size of layoutCases) for (const mode of ['campaign', 'endless'] as const) {
  test(`offline ${mode} MOBA arc leaves a clear battlefield at ${size.name}`, async ({ page }, info) => {
    const errors: string[] = [], remote: string[] = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
    await page.setViewportSize({ width: size.width, height: size.height }); await start(page, mode);
    const safe = size.safe ?? { left: 0, right: 0, top: 0, bottom: 0 };
    if (size.safe) await page.evaluate(insets => { for (const [side, value] of Object.entries(insets)) document.body.style.setProperty(`--mobile-${side}`, `${value}px`); window.dispatchEvent(new Event('resize')); }, safe);
    const arc = await arcGeometry(page), boxes = await visibleBoxes(page, clickableSelectors); expect(boxes.length).toBeGreaterThanOrEqual(10);
    for (const box of boxes) {
      expect(box.width, String(box.label)).toBeGreaterThanOrEqual(44); expect(box.height, String(box.label)).toBeGreaterThanOrEqual(44);
      expect(box.x, String(box.label)).toBeGreaterThanOrEqual(safe.left - 1); expect(box.y, String(box.label)).toBeGreaterThanOrEqual(safe.top - 1);
      expect(box.x + box.width, String(box.label)).toBeLessThanOrEqual(size.width - safe.right + 1); expect(box.y + box.height, String(box.label)).toBeLessThanOrEqual(size.height - safe.bottom + 1);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(intersects(boxes[i], boxes[j]), `${boxes[i].label} overlaps ${boxes[j].label}`).toBe(false);
    const central = { x: safe.left + 128, y: safe.top + 128, width: size.width - safe.right - rightThumbZone - safe.left - 128, height: size.height - safe.bottom - safe.top - 128 }; expect(central.width).toBeGreaterThanOrEqual(270);
    const panels = await visibleBoxes(page, panelSelectors); for (const box of [...boxes, ...panels]) expect(intersects(central, box), `${box.label} covers the central battlefield`).toBe(false);
    await expect(page.locator('.tool-dock')).toBeHidden(); await expect(page.locator('[data-touch-action="cast"]')).toBeHidden();
    await expect(page.locator('.message')).toBeHidden(); await expect(page.locator('.mobile-aim-hint')).toBeHidden();
    await expect(page.locator('.mobile-map[data-action="mobile-map"]')).toBeVisible(); await expect.poll(async () => (await minimapEvidence(page)).matchesSource).toBe(true);
    const map = await minimapEvidence(page); expect(map.colors).toBeGreaterThan(5);
    const aimPoint = { x: central.x + central.width / 2, y: central.y + Math.min(30, central.height / 2) }; await page.touchscreen.tap(aimPoint.x, aimPoint.y);
    await expect.poll(async () => (await battlefieldEvidence(page)).hero !== null).toBe(true);
    await expect.poll(async () => { const crosshair = (await battlefieldEvidence(page)).crosshair; return !!crosshair && Math.abs(crosshair.screen.x - aimPoint.x) <= 1 && Math.abs(crosshair.screen.y - aimPoint.y) <= 1; }).toBe(true);
    const evidence = await battlefieldEvidence(page);
    expect(evidence.hero!.x).toBeGreaterThanOrEqual(safe.left); expect(evidence.hero!.y).toBeGreaterThanOrEqual(safe.top);
    expect(evidence.hero!.x + evidence.hero!.width).toBeLessThanOrEqual(size.width - safe.right); expect(evidence.hero!.y + evidence.hero!.height).toBeLessThanOrEqual(size.height - safe.bottom);
    for (const block of evidence.hud) expect(intersects(evidence.hero!, block), 'hero is underneath HUD').toBe(false);
    const reticle = { x: evidence.crosshair!.screen.x - 5, y: evidence.crosshair!.screen.y - 5, width: 10, height: 10 };
    for (const block of evidence.hud) expect(intersects(reticle, block), 'selected reticle is underneath HUD').toBe(false);
    await info.attach('layout-and-renderer-evidence', { body: JSON.stringify({ mode, size, safe, central, arc, controls: boxes, panels, map, evidence }, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(`${mode}-${size.name}-moba.png`) }); expect(errors).toEqual([]); expect(remote).toEqual([]);
  });
}

for (const [kind, range] of skillRanges) test(`skill ${kind} previews without consumption, uses range ${range}, and casts once on release`, async ({ page, browserName }, info) => {
  await start(page, 'training'); await auditPointers(page); const pointer = await gesture(page, browserName), before = await readState(page), origin = await center(page, skill(kind));
  await pointer.down(origin); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'preview');
  await expect(page.locator('[data-touch-cancel]')).toBeVisible(); await expect(page.locator('[data-touch-guide]')).toBeHidden();
  await ticksAfter(page, before.elapsed); expect(consumption(await readState(page))).toEqual(consumption(before));
  const radius = await page.locator(skill(kind)).evaluate(node => Number((node as HTMLElement).dataset.aimRadius) || 64);
  // WebKit rounds native mouse coordinates to CSS pixels. The diagonal skill
  // has a fractional center, so an exact-radius request can arrive .8px short.
  // Saturate with 2px overtravel, still inside the wheel's radius+8 freeze edge.
  const requested = { x: origin.x + (kind === 'scan' ? -1 : 1) * (radius + 2), y: origin.y };
  await pointer.move(requested);
  const presentation = (await touchPresentation(page))!; expect(presentation.preview?.kind).toBe(kind); expect(presentation.preview?.range).toBe(range);
  const state = await readState(page), aim = presentation.preview!.aim;
  const moves = await page.evaluate(() => ((window as Window & { __mobilePointerAudit?: PointerAudit[] }).__mobilePointerAudit ?? []).filter(event => event.type === 'pointermove'));
  const actual = moves.at(-1);
  await info.attach('native-wheel-range-geometry', { body: JSON.stringify({ method: pointer.method, kind, range, origin, wheelRadius: radius,
    requested, actual, actualTravel: actual ? Math.hypot(actual.x - origin.x, actual.y - origin.y) : null,
    worldDistance: Math.hypot(aim.x - state.player.x, aim.y - state.player.y),
    reason: 'Two CSS pixels of overtravel guarantee full wheel saturation after WebKit integer event rounding; range assertion remains unchanged and travel stays below the radius+8 freeze edge.' }, null, 2), contentType: 'application/json' });
  expect(Math.hypot(aim.x - state.player.x, aim.y - state.player.y)).toBeCloseTo(range, 0); expect(consumption(state)).toEqual(consumption(before));
  await page.screenshot({ path: info.outputPath(`skill-${kind}-preview.png`) }); await pointer.up();
  await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'idle'); const eventType = kind === 'scan' ? 'SCAN_COMPLETED' : 'TOOL_FIRED';
  await expect.poll(async () => (await readState(page)).events.filter(event => event.tick > before.tick && event.type === eventType && (kind === 'scan' || event.data.tool === kind)).length).toBe(1);
  const after = await readState(page);
  if (kind === 'scan') { expect(after.scans).toBe(before.scans + 1); expect(after.scanReady).toBeGreaterThan(before.scanReady); }
  else {
    const receipt = after.events.find(event => event.tick > before.tick && event.type === 'TOOL_FIRED' && event.data.tool === kind)!;
    expect(Number(receipt.data.x)).toBeCloseTo(aim.x, 0); expect(Number(receipt.data.y)).toBeCloseTo(aim.y, 0); expect(after.cooldowns[kind]).toBeGreaterThan(before.cooldowns[kind]);
    if (kind === 2) expect(after.shots).toBe(before.shots + 1);
  }
  await ticksAfter(page, after.elapsed, .4); expect((await readState(page)).events.filter(event => event.tick > before.tick && event.type === eventType && (kind === 'scan' || event.data.tool === kind))).toHaveLength(1);
  await info.attach('release-receipt', { body: JSON.stringify({ kind, range, before: consumption(before), preview: presentation, after: consumption(after) }, null, 2), contentType: 'application/json' });
  await pointerEvidence(page, info, pointer.method);
});

test('dragging each skill to cancel leaves tool, cooldowns and action counters unchanged', async ({ page, browserName }, info) => {
  await start(page, 'training'); await auditPointers(page); const pointer = await gesture(page, browserName);
  for (const [kind] of skillRanges) {
    const before = await readState(page), origin = await center(page, skill(kind)); await pointer.down(origin); await pointer.move({ x: origin.x - 30, y: origin.y });
    await pointer.move(await center(page, '[data-touch-cancel]')); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'cancel');
    expect((await touchPresentation(page))?.preview?.cancelled).toBe(true); await pointer.up(); await ticksAfter(page, before.elapsed, .15);
    expect(consumption(await readState(page))).toEqual(consumption(before)); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'idle');
  }
  await pointerEvidence(page, info, pointer.method);
});

test('primary attack fires while held at center, retargets on drag and stops on release', async ({ page, browserName }, info) => {
  await start(page, 'training'); await auditPointers(page); const pointer = await gesture(page, browserName), before = await readState(page), origin = await center(page, attack);
  await pointer.down(origin); await expect.poll(async () => (await readState(page)).shots).toBeGreaterThan(before.shots);
  const atCenter = await readState(page); await ticksAfter(page, atCenter.elapsed, .25); expect((await readState(page)).shots).toBeGreaterThan(atCenter.shots);
  const firstAim = (await touchPresentation(page))!.aim; await pointer.move({ x: origin.x - 28, y: origin.y - 16 });
  await expect.poll(async () => { const aim = (await touchPresentation(page))!.aim; return Math.hypot(aim.x - firstAim.x, aim.y - firstAim.y); }).toBeGreaterThan(10);
  await pointer.up(); await page.waitForTimeout(60); const released = await readState(page); await ticksAfter(page, released.elapsed, .3);
  expect((await readState(page)).shots).toBe(released.shots); expect((await readState(page)).tool).toBe(1); await pointerEvidence(page, info, pointer.method);
});

test('CDP two-finger movement and primary fire release independently', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Independent contacts require Chromium CDP; WebKit single-pointer checks do not claim multi-touch.');
  await start(page, 'training'); await auditPointers(page); const fingers = new Fingers(await page.context().newCDPSession(page)), initial = await readState(page);
  await fingers.down(1, await center(page, moveStick)); await fingers.move(1, await center(page, moveStick, 25, 0)); await fingers.down(2, await center(page, attack));
  await expect.poll(async () => (await readState(page)).shots).toBeGreaterThan(initial.shots); await expect.poll(async () => (await readState(page)).player.x).toBeGreaterThan(initial.player.x + 5);
  await fingers.up(2); await page.waitForTimeout(60); const noAttack = await readState(page); await ticksAfter(page, noAttack.elapsed, .15);
  const moving = await readState(page); expect(moving.player.x).toBeGreaterThan(noAttack.player.x + 5); expect(moving.shots).toBe(noAttack.shots);
  await fingers.down(2, await center(page, attack)); await fingers.move(2, await center(page, attack, -22, -10)); await fingers.up(1); await page.waitForTimeout(60);
  const noMove = await readState(page); await ticksAfter(page, noMove.elapsed, .25); const firing = await readState(page);
  expect(firing.player.x).toBeCloseTo(noMove.player.x, 4); expect(firing.shots).toBeGreaterThan(noMove.shots); await fingers.release();
  await pointerEvidence(page, info, 'Chromium CDP two independent trusted contacts; not physical iPhone input');
});

test('a third skill finger suppresses an already held primary attack through release', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Three contacts use Chromium CDP.');
  await start(page, 'training'); await auditPointers(page); const fingers = new Fingers(await page.context().newCDPSession(page));
  await page.evaluate(() => {
    const target = window as Window & { __mobileSkillRelease?: { kind: SkillKind; aim: Vec; tick: number } };
    // Capture the last displayed preview in the trusted release event before
    // the DOM adapter consumes it. Separate automation calls could span a
    // render step while the movement finger is still held.
    window.addEventListener('pointerup', event => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-touch-skill]')) return;
      const preview = (window.__viral.diagnostics() as unknown as Diagnostics).touch?.preview;
      if (preview && preview.kind !== 'charge' && preview.kind !== 'cannon' && preview.kind !== 'weapon') target.__mobileSkillRelease = { kind: preview.kind, aim: { ...preview.aim }, tick: window.__viral.snapshot().tick };
    }, true);
  });
  await fingers.down(1, await center(page, moveStick, 24, 0)); await fingers.down(2, await center(page, attack)); await expect.poll(async () => (await readState(page)).shots).toBeGreaterThan(0);
  const origin = await center(page, skill(2)); await fingers.down(3, origin); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'preview');
  const begun = await readState(page); await ticksAfter(page, begun.elapsed, .18); const held = await readState(page);
  expect(held.shots).toBe(begun.shots); expect(held.tool).toBe(1); expect(held.player.x).toBeGreaterThan(begun.player.x);
  await fingers.move(3, { x: origin.x + 30, y: origin.y }); const beforeRelease = await readState(page); await fingers.up(3);
  await expect.poll(async () => (await readState(page)).events.filter(event => event.tick > beforeRelease.tick && event.type === 'TOOL_FIRED' && event.data.tool === 2).length).toBe(1);
  const cast = await readState(page);
  const releasedPreview = await page.evaluate(() => (window as Window & { __mobileSkillRelease?: { kind: SkillKind; aim: Vec; tick: number } }).__mobileSkillRelease);
  expect(releasedPreview?.kind).toBe(2);
  const receipt = cast.events.find(event => event.tick > beforeRelease.tick && event.type === 'TOOL_FIRED' && event.data.tool === 2)!;
  expect(Number(receipt.data.x)).toBeCloseTo(releasedPreview!.aim.x, 4); expect(Number(receipt.data.y)).toBeCloseTo(releasedPreview!.aim.y, 4);
  await info.attach('moving-preview-release-alignment', { body: JSON.stringify({ scope: 'Last production diagnostics preview sampled in capture phase of the real third-finger pointerup while the movement finger remains held; no simulation writes.', releasedPreview, receipt, before: beforeRelease.player, after: cast.player }, null, 2), contentType: 'application/json' });
  await ticksAfter(page, cast.elapsed, .3); const after = await readState(page); expect(after.shots).toBe(cast.shots);
  expect(after.events.some(event => event.tick > begun.tick && event.type === 'TOOL_FIRED' && event.data.tool === 1)).toBe(false);
  await fingers.up(2); await fingers.down(2, await center(page, attack)); await expect.poll(async () => (await readState(page)).shots).toBeGreaterThan(after.shots);
  await fingers.down(4, await center(page, '.mobile-top-actions [data-action="pause"]')); await fingers.up(4); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  await fingers.release(); await page.locator('[data-action="continue"]').tap(); const resumed = await readState(page); await ticksAfter(page, resumed.elapsed, .18); const clean = await readState(page);
  expect(clean.shots).toBe(resumed.shots); expect(clean.player.x).toBeCloseTo(resumed.player.x, 4);
  await pointerEvidence(page, info, 'Chromium CDP three gameplay contacts plus pause; production snapshot remains read-only');
});

test('map opens real details; portrait and background retain a paused clean state', async ({ page }, info) => {
  await start(page); await page.locator('.mobile-map[data-action="mobile-map"]').tap(); await expect(page.locator('#mobile-details-content #tactical-map')).toBeVisible();
  const paused = await readState(page); await page.waitForTimeout(130); expect((await readState(page)).tick).toBe(paused.tick);
  await page.locator('.mobile-details-dialog [data-action="help"]').tap(); await expect(page.locator('[data-action="close-help"]')).toBeVisible();
  await page.locator('[data-action="close-help"]').tap(); await expect.poll(async () => (await readState(page)).phase).toBe('playing');
  await page.setViewportSize({ width: 390, height: 844 }); await expect(page.locator('#mobile-rotate-notice')).toBeVisible(); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  await page.screenshot({ path: info.outputPath('portrait-paused.png') }); await page.setViewportSize({ width: 844, height: 390 }); await expect(page.locator('#mobile-rotate-notice')).toBeHidden();
  expect((await readState(page)).phase).toBe('paused'); await page.locator('[data-action="continue"]').tap(); await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(async () => (await readState(page)).phase).toBe('paused'); await page.locator('[data-action="continue"]').tap();
  const resumed = await readState(page); await ticksAfter(page, resumed.elapsed, .16); const clean = await readState(page);
  expect(clean.player.x).toBeCloseTo(resumed.player.x, 4); expect(clean.player.y).toBeCloseTo(resumed.player.y, 4); expect(clean.shots).toBe(resumed.shots);
});

test('endless wave, charges and actual minimap remain available offline', async ({ page }) => {
  await start(page, 'endless'); await expect(page.locator('#mobile-wave')).toContainText('第1波'); await expect(page.locator('#mobile-wave')).toContainText('剩余');
  await expect(page.locator('[data-touch-action="antibody"]')).toBeVisible(); await expect(page.locator('#mobile-antibody-charges')).toHaveText('2');
  await expect.poll(async () => (await minimapEvidence(page)).matchesSource).toBe(true); await page.locator('.mobile-map[data-action="mobile-map"]').tap();
  await expect(page.locator('#mobile-details-content #endless-minimap')).toBeVisible(); await expect(page.locator('.mobile-details-dialog [data-action="history"]')).toBeHidden();
  await page.locator('[data-action="mobile-close-details"]').first().tap(); await expect.poll(async () => (await readState(page)).phase).toBe('playing');
});

test('real host-event warning stays clear of the skill arc at low content height', async ({ page }, info) => {
  await page.setViewportSize({ width: 667, height: 320 }); await start(page, 'campaign', 'hostEvent=MEDICATION'); await expect(page.locator('#mobile-warnings')).toContainText('药剂');
  const strip = (await page.locator('#mobile-warnings').boundingBox())!;
  for (const control of await visibleBoxes(page, '.mobile-skill,.mobile-attack')) expect(intersects(strip, control), 'host warning overlaps skill arc').toBe(false);
  await page.screenshot({ path: info.outputPath('host-warning.png') });
});

test('large-organ 650-unit previews above and below keep the hero and reticle clear, then restore the camera', async ({ page, browserName }, info) => {
  await start(page); await auditPointers(page);
  const initial = await readState(page);
  expect(initial.campaign).toBeDefined(); expect(initial.world).toMatchObject({ width: 2400, height: 1500 });
  await ticksAfter(page, initial.elapsed, .2);
  const projection = () => page.evaluate(() => {
    const origin = window.__viral.toScreen({ x: 0, y: 0 }), axis = window.__viral.toScreen({ x: 100, y: 0 });
    return { origin, scale: (axis.x - origin.x) / 100 };
  });
  const baseline = await projection(), baselineFoot = (await battlefieldEvidence(page)).foot;
  const pointer = await gesture(page, browserName), observations: unknown[] = [];
  const viewport = page.viewportSize()!;
  const inView = (box: Box) => box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
  for (const direction of [-1, 1]) {
    const before = await readState(page), origin = await center(page, skill('scan'));
    const radius = await page.locator(skill('scan')).evaluate(node => Number((node as HTMLElement).dataset.aimRadius) || 64);
    await pointer.down(origin); await pointer.move({ x: origin.x, y: origin.y + direction * radius });
    await expect(page.locator('#mobile-skill-preview')).toBeVisible();
    await expect.poll(async () => {
      const preview = (await touchPresentation(page))?.preview, state = await readState(page);
      return !!preview && preview.kind === 'scan' && Math.abs(preview.aim.x - state.player.x) < .01
        && Math.abs(preview.aim.y - state.player.y - direction * 650) < .5;
    }).toBe(true);
    await expect.poll(async () => {
      const evidence = await battlefieldEvidence(page), ring = await page.locator('.mobile-preview-target').boundingBox();
      const label = await page.locator('.mobile-preview-label').boundingBox();
      if (!evidence.hero || !evidence.crosshair || !ring || !label) return false;
      const reticle = { x: evidence.crosshair.screen.x - 5, y: evidence.crosshair.screen.y - 5, width: 10, height: 10 };
      const fixed = await visibleBoxes(page, `${clickableSelectors},${panelSelectors},[data-touch-cancel],[data-touch-guide]`);
      const blocks = [...evidence.hud, ...fixed];
      return [evidence.hero, reticle, ring].every(box => inView(box) && blocks.every(block => !intersects(box, block)))
        && inView(label) && fixed.every(block => !intersects(label, block)) && !intersects(label, ring);
    }).toBe(true);
    const evidence = await battlefieldEvidence(page), framed = await projection(), label = await page.locator('.mobile-preview-label').boundingBox();
    expect(Math.hypot(evidence.foot.x - baselineFoot.x, evidence.foot.y - baselineFoot.y)).toBeGreaterThan(10);
    const held = await readState(page); expect({ tool: held.tool, shots: held.shots, scans: held.scans, scanReady: held.scanReady })
      .toEqual({ tool: before.tool, shots: before.shots, scans: before.scans, scanReady: before.scanReady });
    await page.screenshot({ path: info.outputPath(`large-organ-preview-${direction < 0 ? 'above' : 'below'}-650.png`) });
    await pointer.move(await center(page, '[data-touch-cancel]')); await pointer.up();
    await expect(page.locator('#mobile-skill-preview')).toBeHidden();
    await expect.poll(async () => {
      const restored = await projection();
      return Math.hypot(restored.origin.x - baseline.origin.x, restored.origin.y - baseline.origin.y) <= .75
        && Math.abs(restored.scale - baseline.scale) <= .0001;
    }).toBe(true);
    const after = await readState(page); expect({ tool: after.tool, shots: after.shots, scans: after.scans, scanReady: after.scanReady })
      .toEqual({ tool: before.tool, shots: before.shots, scans: before.scans, scanReady: before.scanReady });
    observations.push({ direction, world: initial.world, preview: evidence.touch?.preview, baseline, framed, restored: await projection(), evidence, label });
  }
  await info.attach('large-organ-preview-camera-evidence', { body: JSON.stringify({ scope: 'Production single HTML, campaign heart 2400x1500, two vertical 650-world-unit scan previews cancelled without casting; no simulation writes. The below-player preview may extend beyond the organ boundary.', method: pointer.method, observations }, null, 2), contentType: 'application/json' });
  await pointerEvidence(page, info, pointer.method);
});

/** Isolated fixture only: Nova III is supplied at setup, never to the production page.
 * Tested transitions still use production TouchControls, Controller and GameSession. */
async function installGuideFixture(page: Page) {
  const compiled = await build({ stdin: { resolveDir: resolve('.'), sourcefile: 'mobile-guide-mechanism-fixture.ts', contents: `
    import { GameSession } from './src/game/session';
    import { Controller } from './src/input/controller';
    import { TouchControls } from './src/input/touchControls';
    import { createEndlessGrowth } from './src/game/endlessGrowth';
    import { mobileHudMarkup, updateMobileHud } from './src/ui/mobileHud';
    document.body.className = 'touch-mode';
    document.body.innerHTML = '<canvas id="game" style="position:fixed;inset:0;width:100vw;height:100vh;touch-action:none"></canvas><div id="app"></div>';
    document.querySelector('#app').innerHTML = mobileHudMarkup;
    const session = new GameSession(41); session.start();
    session.state.endlessGrowth = createEndlessGrowth(41); session.state.endlessGrowth.ranks.nova = 3;
    const root = document.querySelector('#mobile-controls'), canvas = document.querySelector('#game');
    const project = point => ({ x: point.x * 2, y: point.y * 2 / .72 });
    const accepts = () => session.state.phase === 'playing';
    const input = new Controller(canvas, () => session.pause(), () => session.pause(), accepts);
    const controls = new TouchControls({ root, canvas, input, getState: () => session.state, screenToWorld: project, canAccept: accepts });
    session.bus.on('event', event => { if(event.type === 'INPUT_RESET_REQUESTED') input.clear(); });
    updateMobileHud(session.state);
    setInterval(() => { session.step(input.frame(input.getAim(session.state, project)), 1/60); controls.update(); updateMobileHud(session.state); }, 1000/60);
    window.__mobaFixture = Object.freeze({ snapshot: () => session.snapshot(), presentation: () => input.getPresentation(session.state, project) });
  ` }, bundle: true, write: false, loader: { '.css': 'empty' }, format: 'iife', target: ['chrome110', 'safari17.6'] });
  await page.context().setOffline(true); await page.goto('about:blank');
  await page.addStyleTag({ content: '*{box-sizing:border-box}body{margin:0}[hidden]{display:none!important}' + await readFile(resolve('src/ui/mobile.css'), 'utf8') });
  await page.addScriptTag({ content: compiled.outputFiles[0].text }); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-active', 'true');
}
const fixtureState = (page: Page): Promise<GameState> => page.evaluate(() => (window as unknown as { __mobaFixture: { snapshot(): GameState } }).__mobaFixture.snapshot());

for (const ending of ['release', 'native-time-limit'] as const) test(`isolated Nova III fixture confirms guidance and ends by ${ending}`, async ({ page, browserName }, info) => {
  await installGuideFixture(page); await auditPointers(page); const pointer = await gesture(page, browserName), before = await fixtureState(page), origin = await center(page, skill(2));
  await pointer.down(origin); await pointer.move({ x: origin.x + 30, y: origin.y }); await expect(page.locator('[data-touch-guide]')).toBeVisible();
  expect(consumption(await fixtureState(page))).toEqual(consumption(before)); const confirmation = await center(page, '[data-touch-guide]'); await pointer.move(confirmation);
  await expect.poll(async () => (await fixtureState(page)).traction?.stage).toBe('guiding'); const guiding = await fixtureState(page), cast = guiding.traction!;
  expect(cast.guideUnlocked).toBe(true); expect(guiding.shots).toBe(before.shots + 1);
  const started = guiding.events.find(event => event.type === 'TRACTION_STARTED')!, guided = guiding.events.find(event => event.type === 'TRACTION_GUIDING_STARTED')!;
  expect(guided.tick - started.tick).toBeGreaterThanOrEqual(10); await pointer.move({ x: confirmation.x + 18, y: confirmation.y + 3 });
  await expect.poll(async () => { const current = (await fixtureState(page)).traction; return current ? Math.hypot(current.center.x - cast.initialCenter.x, current.center.y - cast.initialCenter.y) : 0; }).toBeGreaterThan(2);
  if (ending === 'release') await pointer.up();
  await expect.poll(async () => (await fixtureState(page)).events.some(event => event.type === 'TRACTION_RELEASED')).toBe(true);
  await expect.poll(async () => (await fixtureState(page)).events.some(event => event.type === 'TRACTION_RESOLVED')).toBe(true); if (ending === 'native-time-limit') await pointer.up();
  const after = await fixtureState(page); expect(after.shots).toBe(before.shots + 1); expect(after.traction).toBeUndefined();
  const release = after.events.find(event => event.type === 'TRACTION_RELEASED')!; expect((release.tick - started.tick) / 60).toBeLessThanOrEqual(.85 + 2 / 60);
  await info.attach('isolated-native-guidance-receipts', { body: JSON.stringify({ scope: 'Isolated component fixture with Nova III supplied only at setup. Production Controller, TouchControls and GameSession; not formal progression or final-release whole-game evidence.', ending, method: pointer.method, started, guided, release, events: after.events.filter(event => event.type.startsWith('TRACTION_')) }, null, 2), contentType: 'application/json' });
  await pointerEvidence(page, info, pointer.method);
});
