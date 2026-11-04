# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: actor-touch-production.spec.ts >> new menu and native walk frames survive two independently released touch contacts
- Location: tests\e2e\actor-touch-production.spec.ts:181:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic "病毒入侵战场：左杆移动，右下大盘按住攻击；技能拖动瞄准、松手施放，拖至取消区撤销。点击战场可精确选点。" [ref=e2]
  - generic:
    - text: ●
    - main:
      - text: · 当前 辅助配装
      - generic "连续挑战状态"
      - region "救援目标与领地状态":
        - generic:
          - generic: 心核 100 / 100
          - generic:
            - generic:
              - generic: 北线
              - generic: 前线待净化
            - generic:
              - generic: 南线
              - generic: 前线待净化
        - strong: 净化北线前沿，准备军团接防
        - paragraph: 军团I阶 · 北南各击退1队，成长至III阶
        - generic: 全域净化 00:00
    - region "触屏操作":
      - button "打开战况与完整地图" [ref=e3] [cursor=pointer]
      - generic "战场状态":
        - generic:
          - generic: 耐久
          - generic: 100/100
        - generic: 余敌40 · 1弹
      - navigation:
        - button "打开战况与地图" [ref=e5] [cursor=pointer]: ☷
        - button "暂停游戏" [ref=e6] [cursor=pointer]: Ⅱ
      - generic "移动摇杆" [ref=e7]: 移动
      - button "净化攻击，按住并拖动瞄准" [ref=e8] [cursor=pointer]:
        - generic: 净化
      - generic:
        - button "净化能量炮，按住瞄准，松手发射" [ref=e9] [cursor=pointer]:
          - generic: 能量炮
        - button "附近净化，点按净化附近感染节点或修复心核，不切换武器" [ref=e10] [cursor=pointer]:
          - generic: 附近净化
        - button "驻防，轻点选择附近健康节点，按住拖动指定位置，松手指挥" [ref=e11] [cursor=pointer]:
          - generic: 驻防
          - generic [ref=e12]: 0/2
        - button "冲刺，长按蓄能，拖动瞄准，松手发射剑气。长按剑气" [ref=e13] [cursor=pointer]:
          - generic: 冲刺
          - generic: 长按剑气
```

# Test source

```ts
  1   | import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';
  2   | import { readFileSync } from 'node:fs';
  3   | import { extname, join, resolve } from 'node:path';
  4   | import { pathToFileURL } from 'node:url';
  5   | import type { GameState, Vec } from '../../src/game/types';
  6   | import type { TouchPresentation } from '../../src/input/controller';
  7   | 
  8   | const selectedEntry = resolve(process.env.VI_ENTRY ?? 'dist/index.html');
  9   | const entry = new URL(pathToFileURL(extname(selectedEntry) ? selectedEntry : join(selectedEntry, 'index.html')).href);
  10  | entry.searchParams.set('seed', '71');
  11  | const moveControl = '[data-stick="move"]', attackControl = '.mobile-attack[data-stick="attack"]';
  12  | const scanControl = '[data-touch-skill="scan"]';
  13  | type Box = { left: number; top: number; right: number; bottom: number };
  14  | interface ActorAsset {
  15  |   atlas: string; frame: string; width: number; height: number; source: string; sourceSha256: string;
  16  |   visibleBounds: { x: number; y: number; width: number; height: number };
  17  |   sourceBounds: { x: number; y: number; width: number; height: number };
  18  |   actorRegistration?: { foot: Vec; grip?: Vec; muzzle?: Vec };
  19  |   sourceMuzzle?: Vec; animation?: { approved: boolean };
  20  | }
  21  | interface NativeSprite {
  22  |   id: string; texture: string; frame: string; x: number; y: number; width: number; height: number;
  23  |   originX: number; originY: number; flipX: boolean; flipY: boolean; rotation: number; visible: boolean; articulated: boolean;
  24  | }
  25  | interface ActorFrame {
  26  |   actorId: string; semanticId: string; frame: string; clip: string; direction: string; native: boolean; visible: boolean;
  27  |   groupReady: boolean; fallback: boolean; source: { path: string; sha256: string }; screenFoot: Vec; bodyBounds: Box;
  28  | }
  29  | interface ActorContract {
  30  |   version: number; ready: boolean; preview: boolean; animationPreview: boolean; oldSourceIds: string[]; unexpectedActorIds: string[];
  31  | }
  32  | interface Diagnostics {
  33  |   art: { signature: string; actorFrames: ActorFrame[]; actorContract: ActorContract };
  34  |   phaser: { ready: boolean; nativeSprites: NativeSprite[] }; touch?: TouchPresentation;
  35  | }
  36  | interface Observation {
  37  |   tick: number; elapsed: number; phase: GameState['phase']; moving: boolean; player: Vec;
  38  |   signature: string; contract: ActorContract; actors: ActorFrame[]; sprites: NativeSprite[];
  39  |   projection: { origin: Vec; unitX: Vec; unitY: Vec }; touch?: TouchPresentation;
  40  | }
  41  | interface PointerReceipt { type: string; trusted: boolean; pointerType: string; id: number; control: string }
  42  | type Runtime = { inputSignature: string; assets: Record<string, ActorAsset> };
  43  | const state = (page: Page): Promise<GameState> => page.evaluate(() => window.__viral.snapshot());
  44  | 
  45  | /** Only the harness observation buffer is written; production state stays read-only. */
  46  | async function observe(page: Page, durationMs = 0): Promise<Observation[]> {
  47  |   return page.evaluate(durationMs => new Promise<Observation[]>(resolve => {
  48  |     const samples: Observation[] = [], started = performance.now();
  49  |     const capture = (now: number) => {
  50  |       const s = window.__viral.snapshot(), d = window.__viral.diagnostics() as unknown as Diagnostics;
  51  |       const ids = ['player', 'player:tool', 'menu:hero', 'menu:tool'];
  52  |       samples.push({ tick: s.tick, elapsed: s.elapsed, phase: s.phase, moving: s.player.moving, player: { x: s.player.x, y: s.player.y },
  53  |         signature: d.art.signature, contract: d.art.actorContract, actors: d.art.actorFrames.filter(actor => ids.includes(actor.actorId)),
  54  |         sprites: d.phaser.nativeSprites.filter(sprite => ids.includes(sprite.id)), touch: d.touch,
  55  |         projection: { origin: window.__viral.toScreen({ x: 0, y: 0 }), unitX: window.__viral.toScreen({ x: 1, y: 0 }), unitY: window.__viral.toScreen({ x: 0, y: 1 }) } });
  56  |       if (now - started >= durationMs) resolve(samples); else requestAnimationFrame(capture);
  57  |     };
  58  |     requestAnimationFrame(capture);
  59  |   }), durationMs);
  60  | }
  61  | const one = async (page: Page) => (await observe(page))[0];
  62  | const scaleOf = (sample: Observation) => sample.projection.unitX.x - sample.projection.origin.x;
  63  | function atlasPoint(asset: ActorAsset, sprite: NativeSprite, point: Vec): Vec {
  64  |   const dx = ((sprite.flipX ? asset.width - point.x : point.x) / asset.width - sprite.originX) * sprite.width;
  65  |   const dy = ((sprite.flipY ? asset.height - point.y : point.y) / asset.height - sprite.originY) * sprite.height;
  66  |   const cos = Math.cos(sprite.rotation), sin = Math.sin(sprite.rotation);
  67  |   return { x: sprite.x + dx * cos - dy * sin, y: sprite.y + dx * sin + dy * cos };
  68  | }
  69  | function sourcePoint(asset: ActorAsset, sprite: NativeSprite, point: Vec): Vec {
  70  |   const b = asset.sourceBounds, v = asset.visibleBounds;
  71  |   return atlasPoint(asset, sprite, { x: v.x + (point.x - b.x) * v.width / b.width, y: v.y + (point.y - b.y) * v.height / b.height });
  72  | }
  73  | const union = (boxes: Box[]): Box => ({ left: Math.min(...boxes.map(box => box.left)), top: Math.min(...boxes.map(box => box.top)),
  74  |   right: Math.max(...boxes.map(box => box.right)), bottom: Math.max(...boxes.map(box => box.bottom)) });
  75  | function alphaEnvelope(asset: ActorAsset, sprite: NativeSprite): Box {
  76  |   const v = asset.visibleBounds, corners = [v.x, v.x + v.width].flatMap(x => [v.y, v.y + v.height].map(y => atlasPoint(asset, sprite, { x, y })));
  77  |   return { left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)),
  78  |     top: Math.min(...corners.map(point => point.y)), bottom: Math.max(...corners.map(point => point.y)) };
  79  | }
  80  | /** Reverse-check actual texture/frame and transform the atlas alpha and source
  81  |  * landmarks independently; no fixed old hero height or renderer layout helper. */
  82  | function nativeProof(sample: Observation, runtime: Runtime, menu = false) {
  83  |   expect(sample.signature).toBe(runtime.inputSignature);
  84  |   expect(sample.contract).toMatchObject({ version: 2, ready: true, preview: false, animationPreview: false, oldSourceIds: [], unexpectedActorIds: [] });
  85  |   const ids = menu ? ['menu:hero', 'menu:tool'] : ['player', 'player:tool'];
  86  |   const parts = ids.map(id => {
  87  |     const actor = sample.actors.find(actor => actor.actorId === id), sprite = sample.sprites.find(sprite => sprite.id === id && sprite.visible);
  88  |     expect(actor, `Actual ${id} actor record`).toBeDefined(); expect(sprite, `Actual ${id} native sprite`).toBeDefined();
  89  |     expect(actor!).toMatchObject({ native: true, visible: true, groupReady: true, fallback: false });
  90  |     const asset = runtime.assets[actor!.semanticId]; expect(asset).toBeDefined();
  91  |     expect(asset.animation?.approved).toBe(true); expect(sprite!.texture).toBe(asset.atlas); expect(sprite!.frame).toBe(asset.frame);
> 92  |     expect(sprite!.articulated).toBe(false); expect(actor!.frame).toBe(actor!.semanticId);
      |                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  93  |     expect(actor!.source).toMatchObject({ path: asset.source, sha256: asset.sourceSha256 });
  94  |     expect(asset.source.replaceAll('\\', '/')).toMatch(/^ViralInvasion_Fantasy_Actors_v2\//);
  95  |     expect(asset.actorRegistration?.grip).toBeDefined();
  96  |     const alpha = alphaEnvelope(asset, sprite!), scale = scaleOf(sample), origin = sample.projection.origin;
  97  |     const body = actor!.bodyBounds;
  98  |     expect(body, `Registered ${id} body/tool envelope`).toBeDefined();
  99  |     const registered = { left: origin.x + body.left * scale, right: origin.x + body.right * scale,
  100 |       top: origin.y + body.top * scale, bottom: origin.y + body.bottom * scale };
  101 |     return { id, actor: actor!, sprite: sprite!, asset, alpha, registered };
  102 |   });
  103 |   expect(parts[0].actor.semanticId).toMatch(/^fantasy\.actor\.hero\.(front_right|back_right)\.(idle|walk|hurt|dash)\.\d{2}$/);
  104 |   expect(parts[1].actor.semanticId).toBe('fantasy.actor.weapon.emitter');
  105 |   if (menu) expect(parts[0].actor.semanticId).toMatch(/^fantasy\.actor\.hero\.front_right\.idle\.\d{2}$/);
  106 |   const hand = sourcePoint(parts[0].asset, parts[0].sprite, parts[0].asset.actorRegistration!.grip!);
  107 |   const grip = sourcePoint(parts[1].asset, parts[1].sprite, parts[1].asset.actorRegistration!.grip!);
  108 |   expect(Math.hypot(hand.x - grip.x, hand.y - grip.y), 'Actual native palm and independent tool grip').toBeLessThanOrEqual(1);
  109 |   const foot = sourcePoint(parts[0].asset, parts[0].sprite, parts[0].asset.actorRegistration!.foot);
  110 |   expect(Math.hypot(foot.x - parts[0].actor.screenFoot.x, foot.y - parts[0].actor.screenFoot.y)).toBeLessThanOrEqual(1);
  111 |   return { parts, alpha: union(parts.map(part => part.alpha)), envelope: union(parts.flatMap(part => [part.alpha, part.registered])), hand, grip, foot };
  112 | }
  113 | async function center(page: Page, selector: string, dx = 0, dy = 0): Promise<Vec> {
  114 |   const box = await page.locator(selector).boundingBox(); if (!box) throw Error(`Missing control ${selector}`);
  115 |   return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
  116 | }
  117 | class Fingers {
  118 |   private readonly points = new Map<number, Vec>();
  119 |   constructor(private readonly cdp: CDPSession) {}
  120 |   async down(id: number, point: Vec) { this.points.set(id, point); await this.send('touchStart', [...this.points]); }
  121 |   async move(id: number, point: Vec) { if (!this.points.has(id)) throw Error(`Finger ${id} is not held`); this.points.set(id, point); await this.send('touchMove', [...this.points]); }
  122 |   async up(id: number) {
  123 |     const point = this.points.get(id); this.points.delete(id);
  124 |     // Chromium's nonempty touchEnd identifies the released contact, not those remaining.
  125 |     if (point) await this.send('touchEnd', [[id, point]]);
  126 |   }
  127 |   async release() {
  128 |     if (!this.points.size) return;
  129 |     this.points.clear(); await this.send('touchEnd', []);
  130 |   }
  131 |   private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, Vec][]) {
  132 |     await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, point]) => ({ id, ...point, radiusX: 2, radiusY: 2, force: 1 })) });
  133 |   }
  134 | }
  135 | async function pointerAudit(page: Page) {
  136 |   await page.evaluate(() => {
  137 |     const harness = window as Window & { __actorTouchAudit?: PointerReceipt[] }; harness.__actorTouchAudit = [];
  138 |     for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(type, event => {
  139 |       const pointer = event as PointerEvent, control = pointer.target instanceof Element ? pointer.target.closest('[data-stick],[data-touch-skill]') : null;
  140 |       if (!control) return;
  141 |       harness.__actorTouchAudit!.push({ type, trusted: pointer.isTrusted, pointerType: pointer.pointerType, id: pointer.pointerId,
  142 |         control: control.getAttribute('data-stick') ?? control.getAttribute('data-touch-skill') ?? '' });
  143 |       if (harness.__actorTouchAudit!.length > 256) harness.__actorTouchAudit!.shift();
  144 |     }, true);
  145 |   });
  146 | }
  147 | async function inputEvidence(page: Page, info: TestInfo, required: string[]) {
  148 |   const receipts = await page.evaluate(() => (window as Window & { __actorTouchAudit?: PointerReceipt[] }).__actorTouchAudit ?? []);
  149 |   for (const control of required) for (const type of ['pointerdown', 'pointerup'])
  150 |     expect(receipts.some(receipt => receipt.control === control && receipt.type === type && receipt.trusted && receipt.pointerType === 'touch'), `${control} ${type} must be browser-trusted touch`).toBe(true);
  151 |   await info.attach('trusted-touch-input', { body: JSON.stringify({ method: 'Chrome CDP trusted touch contacts; desktop emulation, not physical-phone evidence', receipts }, null, 2), contentType: 'application/json' });
  152 |   return receipts;
  153 | }
  154 | async function openTerritory(page: Page, info: TestInfo) {
  155 |   await page.context().setOffline(true);
  156 |   const errors: string[] = [], remote: string[] = [];
  157 |   page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  158 |   const runtime = JSON.parse(readFileSync(resolve('.art-generated/art-runtime.json'), 'utf8')) as Runtime;
  159 |   await page.goto(entry.href);
  160 |   await expect.poll(() => page.evaluate(() => window.__viral?.version)).toBe('0.13.0-garrison');
  161 |   await page.waitForFunction(() => (window.__viral?.diagnostics() as unknown as Diagnostics)?.phaser?.ready === true);
  162 |   await expect.poll(async () => (await one(page)).contract.ready, { message: 'Formal new actor groups must be ready; no preview/fallback acceptance' }).toBe(true);
  163 |   const menu = await one(page); expect(menu.phase).toBe('menu'); const menuProof = nativeProof(menu, runtime, true);
  164 |   await page.screenshot({ path: info.outputPath('new-menu-with-native-tool.png') });
  165 |   await pointerAudit(page); await page.locator('[data-action="endless-start"]').tap();
  166 |   await expect.poll(async () => (await state(page)).phase).toBe('playing');
  167 |   await expect(page.locator('#mobile-controls')).toHaveAttribute('data-active', 'true');
  168 |   const initial = await state(page); expect(initial.territory?.stage).toBe('rescue'); expect(initial.campaign).toBeUndefined();
  169 |   expect(initial.world).toMatchObject({ width: 2400, height: 1500 });
  170 |   await expect.poll(async () => scaleOf(await one(page))).toBeCloseTo(.62, 4);
  171 |   return { runtime, errors, remote, menu, menuProof };
  172 | }
  173 | async function advance(page: Page, elapsed: number, seconds: number) {
  174 |   await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThanOrEqual(elapsed + seconds);
  175 | }
  176 | test.use({ hasTouch: true, viewport: { width: 667, height: 320 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
  177 | test.beforeEach(async ({ browserName }, info) => {
  178 |   test.skip(browserName !== 'chromium' || info.project.name !== 'chrome', 'This focused production receipt targets Chrome CDP; it makes no Edge/WebKit or physical-phone claim.');
  179 | });
  180 | 
  181 | test('new menu and native walk frames survive two independently released touch contacts', async ({ page }, info) => {
  182 |   const run = await openTerritory(page, info), fingers = new Fingers(await page.context().newCDPSession(page));
  183 |   try {
  184 |     const initial = await state(page), move = await center(page, moveControl), attack = await center(page, attackControl);
  185 |     await fingers.down(1, move); await fingers.move(1, { x: move.x + 28, y: move.y }); await fingers.down(2, attack);
  186 |     await expect.poll(async () => (await state(page)).shots).toBeGreaterThan(initial.shots);
  187 |     await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(initial.player.x + 5);
  188 |     const walking = await observe(page, 650), frames = new Map<string, Set<string>>();
  189 |     for (const sample of walking.filter(sample => sample.phase === 'playing' && sample.moving)) {
  190 |       const proof = nativeProof(sample, run.runtime), body = proof.parts[0];
  191 |       if (body.actor.clip === 'hurt') continue;
  192 |       expect(body.actor.clip).toBe('walk');
```