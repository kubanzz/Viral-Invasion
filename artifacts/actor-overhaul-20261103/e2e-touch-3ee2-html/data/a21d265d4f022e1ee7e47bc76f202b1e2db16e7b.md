# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: actor-touch-production.spec.ts >> new menu and native walk frames survive two independently released touch contacts
- Location: tests\e2e\actor-touch-production.spec.ts:177:1

# Error details

```
Error: cdpSession.send: Protocol error (Input.dispatchTouchEvent): Must send a TouchStart first to start a new touch.
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
          - strong: 感染源 0 / 2 → 母巢
          - generic: 心核 100 / 100
        - generic:
          - generic "心核：健康": ●
          - generic "北侧生命泉：健康": ●
          - generic "南侧生命泉：感染": ◆
          - generic "西侧感染源：感染": ◆
          - generic "东侧感染源：感染": ◆
    - region "触屏操作":
      - button "打开战况与完整地图" [ref=e3] [cursor=pointer]
      - generic "战场状态":
        - generic:
          - generic: 耐久
          - generic: 100/100
        - generic: 心脏 100%
      - navigation:
        - button "打开战况与地图" [ref=e5] [cursor=pointer]: ☷
        - button "暂停游戏" [ref=e6] [cursor=pointer]: Ⅱ
      - status: 可先净化生命泉：修复/净化按钮拖向感染区域，松手启动净化。
      - generic "移动摇杆" [ref=e7]: 移动
      - button "净化攻击，按住并拖动瞄准" [ref=e8] [cursor=pointer]:
        - generic: 净化
      - generic:
        - button "净化能量炮，按住瞄准，松手发射" [ref=e9] [cursor=pointer]:
          - generic: 能量炮
        - button "修复与净化，拖向心核松手抢修；拖向感染生命泉松手启动持续净化" [ref=e10] [cursor=pointer]:
          - generic: 修复/净化
        - button "扫描与军团指挥，按住瞄准，松手施放" [ref=e11] [cursor=pointer]:
          - generic: 免疫
        - button "冲刺，长按蓄能，拖动瞄准，松手发射剑气。长按剑气" [ref=e12] [cursor=pointer]:
          - generic: 冲刺
          - generic: 长按剑气
        - button "交互，靠近" [disabled] [ref=e13] [cursor=pointer]:
          - text: ⌁
          - generic: 交互
        - button "注射抗体" [disabled] [ref=e14] [cursor=pointer]:
          - generic [ref=e15]: "2"
          - generic: 抗体
```

# Test source

```ts
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
  92  |     expect(sprite!.articulated).toBe(false); expect(actor!.frame).toBe(actor!.semanticId);
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
  127 |   async release() { this.points.clear(); await this.send('touchEnd', []); }
  128 |   private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, Vec][]) {
> 129 |     await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, point]) => ({ id, ...point, radiusX: 2, radiusY: 2, force: 1 })) });
      |                    ^ Error: cdpSession.send: Protocol error (Input.dispatchTouchEvent): Must send a TouchStart first to start a new touch.
  130 |   }
  131 | }
  132 | async function pointerAudit(page: Page) {
  133 |   await page.evaluate(() => {
  134 |     const harness = window as Window & { __actorTouchAudit?: PointerReceipt[] }; harness.__actorTouchAudit = [];
  135 |     for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(type, event => {
  136 |       const pointer = event as PointerEvent, control = pointer.target instanceof Element ? pointer.target.closest('[data-stick],[data-touch-skill]') : null;
  137 |       if (!control) return;
  138 |       harness.__actorTouchAudit!.push({ type, trusted: pointer.isTrusted, pointerType: pointer.pointerType, id: pointer.pointerId,
  139 |         control: control.getAttribute('data-stick') ?? control.getAttribute('data-touch-skill') ?? '' });
  140 |       if (harness.__actorTouchAudit!.length > 256) harness.__actorTouchAudit!.shift();
  141 |     }, true);
  142 |   });
  143 | }
  144 | async function inputEvidence(page: Page, info: TestInfo, required: string[]) {
  145 |   const receipts = await page.evaluate(() => (window as Window & { __actorTouchAudit?: PointerReceipt[] }).__actorTouchAudit ?? []);
  146 |   for (const control of required) for (const type of ['pointerdown', 'pointerup'])
  147 |     expect(receipts.some(receipt => receipt.control === control && receipt.type === type && receipt.trusted && receipt.pointerType === 'touch'), `${control} ${type} must be browser-trusted touch`).toBe(true);
  148 |   await info.attach('trusted-touch-input', { body: JSON.stringify({ method: 'Chrome CDP trusted touch contacts; desktop emulation, not physical-phone evidence', receipts }, null, 2), contentType: 'application/json' });
  149 |   return receipts;
  150 | }
  151 | async function openTerritory(page: Page, info: TestInfo) {
  152 |   await page.context().setOffline(true);
  153 |   const errors: string[] = [], remote: string[] = [];
  154 |   page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  155 |   const runtime = JSON.parse(readFileSync(resolve('.art-generated/art-runtime.json'), 'utf8')) as Runtime;
  156 |   await page.goto(entry.href);
  157 |   await page.waitForFunction(() => (window.__viral?.diagnostics() as unknown as Diagnostics)?.phaser?.ready === true);
  158 |   await expect.poll(async () => (await one(page)).contract.ready, { message: 'Formal new actor groups must be ready; no preview/fallback acceptance' }).toBe(true);
  159 |   const menu = await one(page); expect(menu.phase).toBe('menu'); const menuProof = nativeProof(menu, runtime, true);
  160 |   await page.screenshot({ path: info.outputPath('new-menu-with-native-tool.png') });
  161 |   await pointerAudit(page); await page.locator('[data-action="endless-start"]').tap();
  162 |   await expect.poll(async () => (await state(page)).phase).toBe('playing');
  163 |   await expect(page.locator('#mobile-controls')).toHaveAttribute('data-active', 'true');
  164 |   const initial = await state(page); expect(initial.territory?.stage).toBe('rescue'); expect(initial.campaign).toBeUndefined();
  165 |   expect(initial.world).toMatchObject({ width: 2400, height: 1500 });
  166 |   await expect.poll(async () => scaleOf(await one(page))).toBeCloseTo(.62, 4);
  167 |   return { runtime, errors, remote, menu, menuProof };
  168 | }
  169 | async function advance(page: Page, elapsed: number, seconds: number) {
  170 |   await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThanOrEqual(elapsed + seconds);
  171 | }
  172 | test.use({ hasTouch: true, viewport: { width: 667, height: 320 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
  173 | test.beforeEach(async ({ browserName }, info) => {
  174 |   test.skip(browserName !== 'chromium' || info.project.name !== 'chrome', 'This focused production receipt targets Chrome CDP; it makes no Edge/WebKit or physical-phone claim.');
  175 | });
  176 | 
  177 | test('new menu and native walk frames survive two independently released touch contacts', async ({ page }, info) => {
  178 |   const run = await openTerritory(page, info), fingers = new Fingers(await page.context().newCDPSession(page));
  179 |   try {
  180 |     const initial = await state(page), move = await center(page, moveControl), attack = await center(page, attackControl);
  181 |     await fingers.down(1, move); await fingers.move(1, { x: move.x + 28, y: move.y }); await fingers.down(2, attack);
  182 |     await expect.poll(async () => (await state(page)).shots).toBeGreaterThan(initial.shots);
  183 |     await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(initial.player.x + 5);
  184 |     const walking = await observe(page, 650), frames = new Map<string, Set<string>>();
  185 |     for (const sample of walking.filter(sample => sample.phase === 'playing' && sample.moving)) {
  186 |       const proof = nativeProof(sample, run.runtime), body = proof.parts[0];
  187 |       if (body.actor.clip === 'hurt') continue;
  188 |       expect(body.actor.clip).toBe('walk');
  189 |       const decoded = body.actor.semanticId.match(/^fantasy\.actor\.hero\.(front_right|back_right)\.walk\.(\d{2})$/); expect(decoded).not.toBeNull();
  190 |       const indices = frames.get(decoded![1]) ?? new Set<string>(); indices.add(decoded![2]); frames.set(decoded![1], indices);
  191 |     }
  192 |     expect([...frames.values()].some(indices => indices.size >= 2), 'At least two real walk indices in one authored direction must dispatch during trusted touch movement').toBe(true);
  193 |     await fingers.up(2); await page.waitForTimeout(60); const attackReleased = await state(page); await advance(page, attackReleased.elapsed, .2);
  194 |     const stillMoving = await state(page); expect(stillMoving.player.x).toBeGreaterThan(attackReleased.player.x + 5); expect(stillMoving.shots).toBe(attackReleased.shots);
  195 |     await fingers.down(2, attack); await fingers.move(2, { x: attack.x - 22, y: attack.y - 10 });
  196 |     await expect.poll(async () => (await state(page)).shots).toBeGreaterThan(stillMoving.shots);
  197 |     await fingers.up(1); await page.waitForTimeout(60); const moveReleased = await state(page); await advance(page, moveReleased.elapsed, .25);
  198 |     const stillFiring = await state(page); expect(stillFiring.player.x).toBeCloseTo(moveReleased.player.x, 4); expect(stillFiring.player.y).toBeCloseTo(moveReleased.player.y, 4);
  199 |     expect(stillFiring.shots).toBeGreaterThan(moveReleased.shots);
  200 |     await fingers.up(2); await page.waitForTimeout(60); const released = await state(page); await advance(page, released.elapsed, .2);
  201 |     const clean = await state(page); expect(clean.shots).toBe(released.shots); expect(clean.player.moving).toBe(false);
  202 |     nativeProof(await one(page), run.runtime);
  203 |     const receipts = await inputEvidence(page, info, ['move', 'attack']);
  204 |     expect(new Set(receipts.filter(receipt => receipt.type === 'pointerdown' && ['move', 'attack'].includes(receipt.control)).map(receipt => receipt.id)).size).toBeGreaterThanOrEqual(2);
  205 |     await info.attach('new-native-walk-and-release-evidence', { body: JSON.stringify({ entry: entry.href, menu: run.menu, menuProof: run.menuProof,
  206 |       samples: walking, actualWalkIndices: Object.fromEntries([...frames].map(([key, indices]) => [key, [...indices]])), initial, attackReleased, stillMoving, moveReleased, stillFiring, released, clean }, null, 2), contentType: 'application/json' });
  207 |     expect(run.errors).toEqual([]); expect(run.remote).toEqual([]);
  208 |   } finally { await fingers.release(); }
  209 | });
  210 | 
  211 | const contains = (outer: Box, inner: Box, tolerance = 1) => inner.left >= outer.left - tolerance && inner.top >= outer.top - tolerance
  212 |   && inner.right <= outer.right + tolerance && inner.bottom <= outer.bottom + tolerance;
  213 | const intersects = (a: Box, b: Box) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  214 | async function safeSpace(page: Page) {
  215 |   return page.evaluate(() => {
  216 |     const rect = (element: Element): Box => { const box = element.getBoundingClientRect(); return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }; };
  217 |     const visible = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].filter(element => {
  218 |       const box = element.getBoundingClientRect(), style = getComputedStyle(element);
  219 |       return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
  220 |     });
  221 |     const move = rect(document.querySelector('[data-stick="move"]')!), dash = rect(document.querySelector('[data-touch-action="dash"]')!);
  222 |     const headers = visible('.mobile-readouts,.mobile-map,.mobile-top-actions,.mobile-notice,.mobile-warning-strip,#territory-hud');
  223 |     const safe = { left: move.right + 12, right: dash.left - 10, top: Math.max(80, ...headers.map(element => rect(element).bottom + 8)), bottom: move.bottom - 10 };
  224 |     const blocks = visible('.mobile-stick,.mobile-skill,.mobile-aux,.mobile-top-actions button,.mobile-map,.mobile-readouts,.mobile-objective,.mobile-warning-strip,.mobile-notice,#territory-hud,[data-touch-cancel],[data-touch-guide]').map(rect);
  225 |     const target = visible('.mobile-preview-target')[0], label = visible('.mobile-preview-label')[0];
  226 |     return { safe, blocks, screen: { left: 0, top: 0, right: innerWidth, bottom: innerHeight }, target: target ? rect(target) : null, label: label ? rect(label) : null };
  227 |   });
  228 | }
  229 | const consumption = (s: GameState) => ({ tool: s.tool, shots: s.shots, scans: s.scans, cooldowns: s.cooldowns, scanReady: s.scanReady, charges: s.growth?.antibodyCharges });
```