# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: offline-touch.spec.ts >> endless wave, charges and actual minimap remain available offline
- Location: tests\mobile\offline-touch.spec.ts:308:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "playing"
Received: "menu"

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic "病毒入侵战场：左杆移动，右下大盘按住攻击；技能拖动瞄准、松手施放，拖至取消区撤销。点击战场可精确选点。" [ref=e2]
  - generic:
    - region "触屏操作"
    - region [ref=e4]:
      - paragraph [ref=e5]: MICROSCOPIC SURVIVAL
      - heading "病毒入侵 Viral Invasion" [level=1] [ref=e6]:
        - text: 病毒入侵
        - generic [ref=e7]: Viral Invasion
      - paragraph [ref=e8]: 夺回领地，让生命重新生长。
      - paragraph [ref=e9]: 净化治疗区，击破感染源，带领免疫军团救回心脏。
      - button "开始挑战" [ref=e10] [cursor=pointer]:
        - generic [aria-hidden] [ref=e12]: ↗
      - paragraph [ref=e13]: 两源净化 → 母巢决战 · 获救后可继续守卫
      - paragraph [ref=e14]: 左侧移动 · 右侧瞄准与攻击
```

# Test source

```ts
  1   | import { expect, test, type Page, type CDPSession, type TestInfo } from '@playwright/test';
  2   | import { build } from 'esbuild';
  3   | import { readFile } from 'node:fs/promises';
  4   | import { resolve } from 'node:path';
  5   | import { pathToFileURL } from 'node:url';
  6   | import { readState } from '../e2e/campaignDriver';
  7   | import type { GameState, Vec } from '../../src/game/types';
  8   | import type { SkillKind, TouchPresentation } from '../../src/input/controller';
  9   | import type { Renderer } from '../../src/render/renderer';
  10  | 
  11  | const entry = pathToFileURL(resolve('releases/Viral-Invasion-Mobile.html')).href;
  12  | const attack = '.mobile-attack[data-stick="attack"]', moveStick = '[data-stick="move"]';
  13  | const skill = (kind: SkillKind) => `button[data-touch-skill="${kind}"]`;
  14  | const skillRanges = [[2, 420], [3, 530], ['scan', 650]] as const;
  15  | type Box = { x: number; y: number; width: number; height: number };
  16  | type Diagnostics = ReturnType<Renderer['diagnostics']> & { touch?: TouchPresentation };
  17  | interface PointerAudit { type: string; pointerType: string; trusted: boolean; id: number; control: string; x: number; y: number }
  18  | 
  19  | async function start(page: Page, mode: 'campaign' | 'endless' | 'training' = 'campaign', query = '') {
  20  |   await page.context().setOffline(true);
  21  |   await page.goto(`${entry}?seed=41${mode === 'training' ? '&scenario=training' : ''}${query ? `&${query}` : ''}`);
  22  |   await page.locator(`[data-action="${mode === 'endless' ? 'endless-start' : 'start'}"]`).tap();
> 23  |   await expect.poll(async () => (await readState(page)).phase).toBe('playing');
      |                                                                ^ Error: expect(received).toBe(expected) // Object.is equality
  24  |   await expect(page.locator('#mobile-controls')).toHaveAttribute('data-active', 'true');
  25  | }
  26  | async function center(page: Page, selector: string, dx = 0, dy = 0): Promise<Vec> {
  27  |   const box = await page.locator(selector).boundingBox();
  28  |   if (!box) throw new Error(`Missing touch control ${selector}`);
  29  |   return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
  30  | }
  31  | 
  32  | /** Browser-dispatched contacts; no synthetic PointerEvent or simulation writes. */
  33  | class Fingers {
  34  |   private points = new Map<number, Vec>();
  35  |   constructor(private readonly cdp: CDPSession) {}
  36  |   async down(id: number, point: Vec) { this.points.set(id, point); await this.send('touchStart', [...this.points]); }
  37  |   async move(id: number, point: Vec) {
  38  |     if (!this.points.has(id)) throw new Error(`No active finger ${id}`);
  39  |     this.points.set(id, point); await this.send('touchMove', [...this.points]);
  40  |   }
  41  |   async up(id: number) {
  42  |     const point = this.points.get(id); this.points.delete(id);
  43  |     // A nonempty Chromium CDP touchEnd identifies the released contact;
  44  |     // passing remaining contacts would release the wrong finger.
  45  |     if (point) await this.send('touchEnd', [[id, point]]);
  46  |   }
  47  |   async release() { this.points.clear(); await this.send('touchEnd', []); }
  48  |   private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, Vec][]) {
  49  |     await this.cdp.send('Input.dispatchTouchEvent', { type,
  50  |       touchPoints: points.map(([id, point]) => ({ ...point, id, radiusX: 2, radiusY: 2, force: 1 })) });
  51  |   }
  52  | }
  53  | interface Gesture { method: string; down(point: Vec): Promise<void>; move(point: Vec): Promise<void>; up(): Promise<void> }
  54  | async function gesture(page: Page, browserName: string): Promise<Gesture> {
  55  |   if (browserName === 'chromium') {
  56  |     const fingers = new Fingers(await page.context().newCDPSession(page));
  57  |     return { method: 'Chromium CDP trusted touch contact; not physical iPhone input',
  58  |       down: point => fingers.down(1, point), move: point => fingers.move(1, point), up: () => fingers.up(1) };
  59  |   }
  60  |   return { method: 'WebKit trusted mouse drag on touch controls; not multi-touch or physical iPhone input',
  61  |     down: async point => { await page.mouse.move(point.x, point.y); await page.mouse.down(); },
  62  |     move: point => page.mouse.move(point.x, point.y), up: () => page.mouse.up() };
  63  | }
  64  | async function auditPointers(page: Page) {
  65  |   await page.evaluate(() => {
  66  |     const target = window as Window & { __mobilePointerAudit?: PointerAudit[] }; target.__mobilePointerAudit = [];
  67  |     for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(type, event => {
  68  |       const pointer = event as PointerEvent, element = pointer.target instanceof Element ? pointer.target.closest('[data-stick],[data-touch-skill],[data-touch-action]') : null;
  69  |       target.__mobilePointerAudit!.push({ type, pointerType: pointer.pointerType, trusted: pointer.isTrusted, id: pointer.pointerId,
  70  |         control: element?.getAttribute('data-stick') || element?.getAttribute('data-touch-skill') || element?.getAttribute('data-touch-action') || '', x: pointer.clientX, y: pointer.clientY });
  71  |       if (target.__mobilePointerAudit!.length > 180) target.__mobilePointerAudit!.shift();
  72  |     });
  73  |   });
  74  | }
  75  | async function pointerEvidence(page: Page, info: TestInfo, method: string) {
  76  |   const events = await page.evaluate(() => (window as Window & { __mobilePointerAudit?: PointerAudit[] }).__mobilePointerAudit ?? []);
  77  |   expect(events.some(event => event.type === 'pointerdown' && event.trusted)).toBe(true);
  78  |   expect(events.some(event => event.type === 'pointerup' && event.trusted)).toBe(true);
  79  |   await info.attach('browser-input-evidence', { body: JSON.stringify({ method, physicalIPhoneTouch: false, events }, null, 2), contentType: 'application/json' });
  80  | }
  81  | async function touchPresentation(page: Page): Promise<TouchPresentation | undefined> {
  82  |   return page.evaluate(() => (window.__viral.diagnostics() as unknown as Diagnostics).touch);
  83  | }
  84  | const consumption = (state: GameState) => ({ tool: state.tool, shots: state.shots, scans: state.scans, cooldowns: state.cooldowns,
  85  |   scanReady: state.scanReady, tissue: state.tissue.hp, charges: state.growth?.antibodyCharges, tractionId: state.traction?.id,
  86  |   receipts: state.events.filter(event => ['TOOL_SELECTED', 'TOOL_FIRED', 'TOOL_REJECTED', 'SCAN_COMPLETED', 'TRACTION_STARTED'].includes(event.type)) });
  87  | async function ticksAfter(page: Page, elapsed: number, seconds = .1) {
  88  |   await expect.poll(async () => (await readState(page)).elapsed).toBeGreaterThanOrEqual(elapsed + seconds);
  89  | }
  90  | 
  91  | interface Insets { left: number; right: number; top: number; bottom: number }
  92  | interface LayoutCase { width: number; height: number; name: string; safe?: Insets }
  93  | const layoutCases: LayoutCase[] = [
  94  |   { width: 667, height: 375, name: '667x375' }, { width: 844, height: 390, name: '844x390' }, { width: 932, height: 430, name: '932x430' },
  95  |   { width: 667, height: 280, name: '667x280-host-content' }, { width: 667, height: 320, name: '667x320-host-content' },
  96  |   { width: 844, height: 320, name: '844x320-host-content' },
  97  |   { width: 844, height: 320, name: '844x320-derived-safe44-bottom21', safe: { left: 44, right: 44, top: 0, bottom: 21 } },
  98  |   { width: 932, height: 375, name: '932x375-host-content' },
  99  | ];
  100 | const clickableSelectors = '.mobile-stick,.mobile-skill,.mobile-aux,.mobile-top-actions button,.mobile-map';
  101 | const panelSelectors = '.mobile-readouts,.mobile-objective,.mobile-warning-strip,.mobile-aim-hint,.message,#mobile-notice';
  102 | // The v3 quarter-circle and outer auxiliary arc occupy 250px from the right
  103 | // edge (60 + 112 + 56 + 22); keep a further 10px of empty space beside them.
  104 | const rightThumbZone = 260;
  105 | const intersects = (a: Box, b: Box) => a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
  106 | async function visibleBoxes(page: Page, selector: string) {
  107 |   return page.locator(selector).evaluateAll(nodes => nodes.flatMap(node => {
  108 |     const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
  109 |     if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return [];
  110 |     return [{ label: node.getAttribute('aria-label') || node.id || node.textContent || node.className, x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
  111 |   }));
  112 | }
  113 | async function battlefieldEvidence(page: Page) {
  114 |   return page.evaluate(() => {
  115 |     const state = window.__viral.snapshot(), diagnostics = window.__viral.diagnostics() as unknown as Diagnostics;
  116 |     const body = diagnostics.art.activeBodies.find(candidate => candidate.id === 'player')?.bounds;
  117 |     const upper = body && window.__viral.toScreen({ x: body.left, y: body.top / .72 }), lower = body && window.__viral.toScreen({ x: body.right, y: body.bottom / .72 });
  118 |     return { tick: state.tick, tool: state.tool, foot: window.__viral.toScreen(state.player),
  119 |       hero: upper && lower ? { x: upper.x, y: upper.y, width: lower.x - upper.x, height: lower.y - upper.y } : null,
  120 |       crosshair: diagnostics.crosshair && { ...diagnostics.crosshair, screen: window.__viral.toScreen(diagnostics.crosshair.aim) }, touch: diagnostics.touch,
  121 |       hud: diagnostics.hudRects.map(rect => ({ x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top })) };
  122 |   });
  123 | }
```