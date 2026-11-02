# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: offline-touch.spec.ts >> skill 3 previews without consumption, uses range 530, and casts once on release
- Location: tests\mobile\offline-touch.spec.ts:191:42

# Error details

```
Error: expect(received).toBeCloseTo(expected, precision)

Expected: 530
Received: 522.134990687158

Expected precision:    0
Expected difference: < 0.5
Received difference:   7.8650093128419485
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic "病毒入侵战场：左杆移动，右下大盘按住攻击；技能拖动瞄准、松手施放，拖至取消区撤销。点击战场可精确选点。" [ref=e2]
  - generic:
    - text: ●
    - main
    - region "触屏操作":
      - generic "战场状态":
        - generic:
          - generic: 耐久
          - generic: 100/100
        - generic:
          - generic: 心脏 25%
          - generic: 感 —
          - generic: 稳 —
      - navigation:
        - button "打开战况与地图" [ref=e3] [cursor=pointer]: ☷
        - button "暂停游戏" [ref=e4] [cursor=pointer]: Ⅱ
      - generic: 净化训练靶
      - generic "移动摇杆" [ref=e5]: 移动
      - button "净化攻击，按住并拖动瞄准" [ref=e6] [cursor=pointer]:
        - generic: 净化
      - generic:
        - button "裂解，按住瞄准，松手施放" [ref=e7] [cursor=pointer]:
          - generic: 裂解
        - button "修复，按住瞄准组织或治疗点，松手施放" [ref=e8] [cursor=pointer]:
          - generic: 修复
        - button "扫描与军团指挥，按住瞄准，松手施放" [ref=e9] [cursor=pointer]:
          - generic: 免疫
        - button "冲刺" [ref=e10] [cursor=pointer]
        - button "交互，靠近" [disabled] [ref=e11] [cursor=pointer]:
          - text: ⌁
          - generic: 交互
        - button "注射抗体" [disabled] [ref=e12] [cursor=pointer]:
          - generic [ref=e13]: "0"
          - generic: 抗体
      - button "取消施法" [ref=e14] [cursor=pointer]:
        - text: ×
        - generic: 取消
      - generic [aria-hidden]:
        - generic: 松手修复 · 拖至 × 取消
```

# Test source

```ts
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
  124 | async function arcGeometry(page: Page) {
  125 |   const main = (await page.locator(attack).boundingBox())!;
  126 |   expect(main).not.toBeNull(); expect(main.width).toBeCloseTo(88, 0); expect(main.height).toBeCloseTo(88, 0);
  127 |   const origin = { x: main.x + main.width / 2, y: main.y + main.height / 2 }, points = [];
  128 |   for (const [kind] of skillRanges) {
  129 |     const button = page.locator(skill(kind)), box = (await button.boundingBox())!;
  130 |     expect(box).not.toBeNull(); expect(box.width).toBeCloseTo(56, 0); expect(box.height).toBeCloseTo(56, 0);
  131 |     expect(await button.evaluate(node => parseFloat(getComputedStyle(node).borderTopLeftRadius))).toBeGreaterThanOrEqual(28);
  132 |     points.push({ kind, x: box.x + box.width / 2, y: box.y + box.height / 2 });
  133 |   }
  134 |   expect(points[0].x).toBeLessThan(origin.x - 56); expect(Math.abs(points[0].y - origin.y)).toBeLessThanOrEqual(12);
  135 |   expect(points[1].x).toBeLessThan(origin.x - 40); expect(points[1].y).toBeLessThan(origin.y - 40);
  136 |   expect(Math.abs(points[2].x - origin.x)).toBeLessThanOrEqual(12); expect(points[2].y).toBeLessThan(origin.y - 56);
  137 |   const radii = points.map(point => Math.hypot(point.x - origin.x, point.y - origin.y)); expect(Math.max(...radii) - Math.min(...radii)).toBeLessThanOrEqual(22);
  138 |   for (const button of await page.locator('.mobile-aux').all()) {
  139 |     const box = (await button.boundingBox())!; expect(box.width).toBeCloseTo(44, 0); expect(box.height).toBeCloseTo(44, 0);
  140 |     expect(await button.evaluate(node => parseFloat(getComputedStyle(node).borderTopLeftRadius))).toBeGreaterThanOrEqual(22);
  141 |   }
  142 |   return { origin, points, radii };
  143 | }
  144 | async function minimapEvidence(page: Page) {
  145 |   return page.evaluate(() => {
  146 |     const target = document.querySelector<HTMLCanvasElement>('#mobile-minimap');
  147 |     const source = document.querySelector<HTMLCanvasElement>(window.__viral.snapshot().endless ? '#endless-minimap' : '#tactical-map');
  148 |     if (!target || !source) return { matchesSource: false, colors: 0 };
  149 |     const reference = document.createElement('canvas'); reference.width = target.width; reference.height = target.height;
  150 |     reference.getContext('2d')!.drawImage(source, 0, 0, target.width, target.height);
  151 |     const data = target.getContext('2d')!.getImageData(0, 0, target.width, target.height).data, colors = new Set<string>();
  152 |     for (let offset = 0; offset < data.length; offset += 4) colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`);
  153 |     return { matchesSource: target.toDataURL() === reference.toDataURL(), colors: colors.size, width: target.width, height: target.height };
  154 |   });
  155 | }
  156 | 
  157 | for (const size of layoutCases) for (const mode of ['campaign', 'endless'] as const) {
  158 |   test(`offline ${mode} MOBA arc leaves a clear battlefield at ${size.name}`, async ({ page }, info) => {
  159 |     const errors: string[] = [], remote: string[] = [];
  160 |     page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  161 |     await page.setViewportSize({ width: size.width, height: size.height }); await start(page, mode);
  162 |     const safe = size.safe ?? { left: 0, right: 0, top: 0, bottom: 0 };
  163 |     if (size.safe) await page.evaluate(insets => { for (const [side, value] of Object.entries(insets)) document.body.style.setProperty(`--mobile-${side}`, `${value}px`); window.dispatchEvent(new Event('resize')); }, safe);
  164 |     const arc = await arcGeometry(page), boxes = await visibleBoxes(page, clickableSelectors); expect(boxes.length).toBeGreaterThanOrEqual(10);
  165 |     for (const box of boxes) {
  166 |       expect(box.width, String(box.label)).toBeGreaterThanOrEqual(44); expect(box.height, String(box.label)).toBeGreaterThanOrEqual(44);
  167 |       expect(box.x, String(box.label)).toBeGreaterThanOrEqual(safe.left - 1); expect(box.y, String(box.label)).toBeGreaterThanOrEqual(safe.top - 1);
  168 |       expect(box.x + box.width, String(box.label)).toBeLessThanOrEqual(size.width - safe.right + 1); expect(box.y + box.height, String(box.label)).toBeLessThanOrEqual(size.height - safe.bottom + 1);
  169 |     }
  170 |     for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(intersects(boxes[i], boxes[j]), `${boxes[i].label} overlaps ${boxes[j].label}`).toBe(false);
  171 |     const central = { x: safe.left + 128, y: safe.top + 128, width: size.width - safe.right - rightThumbZone - safe.left - 128, height: size.height - safe.bottom - safe.top - 128 }; expect(central.width).toBeGreaterThanOrEqual(270);
  172 |     const panels = await visibleBoxes(page, panelSelectors); for (const box of [...boxes, ...panels]) expect(intersects(central, box), `${box.label} covers the central battlefield`).toBe(false);
  173 |     await expect(page.locator('.tool-dock')).toBeHidden(); await expect(page.locator('[data-touch-action="cast"]')).toBeHidden();
  174 |     await expect(page.locator('.message')).toBeHidden(); await expect(page.locator('.mobile-aim-hint')).toBeHidden();
  175 |     await expect(page.locator('.mobile-map[data-action="mobile-map"]')).toBeVisible(); await expect.poll(async () => (await minimapEvidence(page)).matchesSource).toBe(true);
  176 |     const map = await minimapEvidence(page); expect(map.colors).toBeGreaterThan(5);
  177 |     const aimPoint = { x: central.x + central.width / 2, y: central.y + Math.min(30, central.height / 2) }; await page.touchscreen.tap(aimPoint.x, aimPoint.y);
  178 |     await expect.poll(async () => (await battlefieldEvidence(page)).hero !== null).toBe(true);
  179 |     await expect.poll(async () => { const crosshair = (await battlefieldEvidence(page)).crosshair; return !!crosshair && Math.abs(crosshair.screen.x - aimPoint.x) <= 1 && Math.abs(crosshair.screen.y - aimPoint.y) <= 1; }).toBe(true);
  180 |     const evidence = await battlefieldEvidence(page);
  181 |     expect(evidence.hero!.x).toBeGreaterThanOrEqual(safe.left); expect(evidence.hero!.y).toBeGreaterThanOrEqual(safe.top);
  182 |     expect(evidence.hero!.x + evidence.hero!.width).toBeLessThanOrEqual(size.width - safe.right); expect(evidence.hero!.y + evidence.hero!.height).toBeLessThanOrEqual(size.height - safe.bottom);
  183 |     for (const block of evidence.hud) expect(intersects(evidence.hero!, block), 'hero is underneath HUD').toBe(false);
  184 |     const reticle = { x: evidence.crosshair!.screen.x - 5, y: evidence.crosshair!.screen.y - 5, width: 10, height: 10 };
  185 |     for (const block of evidence.hud) expect(intersects(reticle, block), 'selected reticle is underneath HUD').toBe(false);
  186 |     await info.attach('layout-and-renderer-evidence', { body: JSON.stringify({ mode, size, safe, central, arc, controls: boxes, panels, map, evidence }, null, 2), contentType: 'application/json' });
  187 |     await page.screenshot({ path: info.outputPath(`${mode}-${size.name}-moba.png`) }); expect(errors).toEqual([]); expect(remote).toEqual([]);
  188 |   });
  189 | }
  190 | 
  191 | for (const [kind, range] of skillRanges) test(`skill ${kind} previews without consumption, uses range ${range}, and casts once on release`, async ({ page, browserName }, info) => {
  192 |   await start(page, 'training'); await auditPointers(page); const pointer = await gesture(page, browserName), before = await readState(page), origin = await center(page, skill(kind));
  193 |   await pointer.down(origin); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'preview');
  194 |   await expect(page.locator('[data-touch-cancel]')).toBeVisible(); await expect(page.locator('[data-touch-guide]')).toBeHidden();
  195 |   await ticksAfter(page, before.elapsed); expect(consumption(await readState(page))).toEqual(consumption(before));
  196 |   const radius = await page.locator(skill(kind)).evaluate(node => Number((node as HTMLElement).dataset.aimRadius) || 64);
  197 |   await pointer.move({ x: origin.x + (kind === 'scan' ? -radius : radius), y: origin.y });
  198 |   const presentation = (await touchPresentation(page))!; expect(presentation.preview?.kind).toBe(kind); expect(presentation.preview?.range).toBe(range);
  199 |   const state = await readState(page), aim = presentation.preview!.aim;
> 200 |   expect(Math.hypot(aim.x - state.player.x, aim.y - state.player.y)).toBeCloseTo(range, 0); expect(consumption(state)).toEqual(consumption(before));
      |                                                                      ^ Error: expect(received).toBeCloseTo(expected, precision)
  201 |   await page.screenshot({ path: info.outputPath(`skill-${kind}-preview.png`) }); await pointer.up();
  202 |   await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'idle'); const eventType = kind === 'scan' ? 'SCAN_COMPLETED' : 'TOOL_FIRED';
  203 |   await expect.poll(async () => (await readState(page)).events.filter(event => event.tick > before.tick && event.type === eventType && (kind === 'scan' || event.data.tool === kind)).length).toBe(1);
  204 |   const after = await readState(page);
  205 |   if (kind === 'scan') { expect(after.scans).toBe(before.scans + 1); expect(after.scanReady).toBeGreaterThan(before.scanReady); }
  206 |   else {
  207 |     const receipt = after.events.find(event => event.tick > before.tick && event.type === 'TOOL_FIRED' && event.data.tool === kind)!;
  208 |     expect(Number(receipt.data.x)).toBeCloseTo(aim.x, 0); expect(Number(receipt.data.y)).toBeCloseTo(aim.y, 0); expect(after.cooldowns[kind]).toBeGreaterThan(before.cooldowns[kind]);
  209 |     if (kind === 2) expect(after.shots).toBe(before.shots + 1);
  210 |   }
  211 |   await ticksAfter(page, after.elapsed, .4); expect((await readState(page)).events.filter(event => event.tick > before.tick && event.type === eventType && (kind === 'scan' || event.data.tool === kind))).toHaveLength(1);
  212 |   await info.attach('release-receipt', { body: JSON.stringify({ kind, range, before: consumption(before), preview: presentation, after: consumption(after) }, null, 2), contentType: 'application/json' });
  213 |   await pointerEvidence(page, info, pointer.method);
  214 | });
  215 | 
  216 | test('dragging each skill to cancel leaves tool, cooldowns and action counters unchanged', async ({ page, browserName }, info) => {
  217 |   await start(page, 'training'); await auditPointers(page); const pointer = await gesture(page, browserName);
  218 |   for (const [kind] of skillRanges) {
  219 |     const before = await readState(page), origin = await center(page, skill(kind)); await pointer.down(origin); await pointer.move({ x: origin.x - 30, y: origin.y });
  220 |     await pointer.move(await center(page, '[data-touch-cancel]')); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'cancel');
  221 |     expect((await touchPresentation(page))?.preview?.cancelled).toBe(true); await pointer.up(); await ticksAfter(page, before.elapsed, .15);
  222 |     expect(consumption(await readState(page))).toEqual(consumption(before)); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'idle');
  223 |   }
  224 |   await pointerEvidence(page, info, pointer.method);
  225 | });
  226 | 
  227 | test('primary attack fires while held at center, retargets on drag and stops on release', async ({ page, browserName }, info) => {
  228 |   await start(page, 'training'); await auditPointers(page); const pointer = await gesture(page, browserName), before = await readState(page), origin = await center(page, attack);
  229 |   await pointer.down(origin); await expect.poll(async () => (await readState(page)).shots).toBeGreaterThan(before.shots);
  230 |   const atCenter = await readState(page); await ticksAfter(page, atCenter.elapsed, .25); expect((await readState(page)).shots).toBeGreaterThan(atCenter.shots);
  231 |   const firstAim = (await touchPresentation(page))!.aim; await pointer.move({ x: origin.x - 28, y: origin.y - 16 });
  232 |   await expect.poll(async () => { const aim = (await touchPresentation(page))!.aim; return Math.hypot(aim.x - firstAim.x, aim.y - firstAim.y); }).toBeGreaterThan(10);
  233 |   await pointer.up(); await page.waitForTimeout(60); const released = await readState(page); await ticksAfter(page, released.elapsed, .3);
  234 |   expect((await readState(page)).shots).toBe(released.shots); expect((await readState(page)).tool).toBe(1); await pointerEvidence(page, info, pointer.method);
  235 | });
  236 | 
  237 | test('CDP two-finger movement and primary fire release independently', async ({ page, browserName }, info) => {
  238 |   test.skip(browserName !== 'chromium', 'Independent contacts require Chromium CDP; WebKit single-pointer checks do not claim multi-touch.');
  239 |   await start(page, 'training'); await auditPointers(page); const fingers = new Fingers(await page.context().newCDPSession(page)), initial = await readState(page);
  240 |   await fingers.down(1, await center(page, moveStick)); await fingers.move(1, await center(page, moveStick, 25, 0)); await fingers.down(2, await center(page, attack));
  241 |   await expect.poll(async () => (await readState(page)).shots).toBeGreaterThan(initial.shots); await expect.poll(async () => (await readState(page)).player.x).toBeGreaterThan(initial.player.x + 5);
  242 |   await fingers.up(2); await page.waitForTimeout(60); const noAttack = await readState(page); await ticksAfter(page, noAttack.elapsed, .15);
  243 |   const moving = await readState(page); expect(moving.player.x).toBeGreaterThan(noAttack.player.x + 5); expect(moving.shots).toBe(noAttack.shots);
  244 |   await fingers.down(2, await center(page, attack)); await fingers.move(2, await center(page, attack, -22, -10)); await fingers.up(1); await page.waitForTimeout(60);
  245 |   const noMove = await readState(page); await ticksAfter(page, noMove.elapsed, .25); const firing = await readState(page);
  246 |   expect(firing.player.x).toBeCloseTo(noMove.player.x, 4); expect(firing.shots).toBeGreaterThan(noMove.shots); await fingers.release();
  247 |   await pointerEvidence(page, info, 'Chromium CDP two independent trusted contacts; not physical iPhone input');
  248 | });
  249 | 
  250 | test('a third skill finger suppresses an already held primary attack through release', async ({ page, browserName }, info) => {
  251 |   test.skip(browserName !== 'chromium', 'Three contacts use Chromium CDP.');
  252 |   await start(page, 'training'); await auditPointers(page); const fingers = new Fingers(await page.context().newCDPSession(page));
  253 |   await page.evaluate(() => {
  254 |     const target = window as Window & { __mobileSkillRelease?: { kind: SkillKind; aim: Vec; tick: number } };
  255 |     // Capture the last displayed preview in the trusted release event before
  256 |     // the DOM adapter consumes it. Separate automation calls could span a
  257 |     // render step while the movement finger is still held.
  258 |     window.addEventListener('pointerup', event => {
  259 |       if (!(event.target instanceof Element) || !event.target.closest('[data-touch-skill]')) return;
  260 |       const preview = (window.__viral.diagnostics() as unknown as Diagnostics).touch?.preview;
  261 |       if (preview) target.__mobileSkillRelease = { kind: preview.kind, aim: { ...preview.aim }, tick: window.__viral.snapshot().tick };
  262 |     }, true);
  263 |   });
  264 |   await fingers.down(1, await center(page, moveStick, 24, 0)); await fingers.down(2, await center(page, attack)); await expect.poll(async () => (await readState(page)).shots).toBeGreaterThan(0);
  265 |   const origin = await center(page, skill(2)); await fingers.down(3, origin); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'preview');
  266 |   const begun = await readState(page); await ticksAfter(page, begun.elapsed, .18); const held = await readState(page);
  267 |   expect(held.shots).toBe(begun.shots); expect(held.tool).toBe(1); expect(held.player.x).toBeGreaterThan(begun.player.x);
  268 |   await fingers.move(3, { x: origin.x + 30, y: origin.y }); const beforeRelease = await readState(page); await fingers.up(3);
  269 |   await expect.poll(async () => (await readState(page)).events.filter(event => event.tick > beforeRelease.tick && event.type === 'TOOL_FIRED' && event.data.tool === 2).length).toBe(1);
  270 |   const cast = await readState(page);
  271 |   const releasedPreview = await page.evaluate(() => (window as Window & { __mobileSkillRelease?: { kind: SkillKind; aim: Vec; tick: number } }).__mobileSkillRelease);
  272 |   expect(releasedPreview?.kind).toBe(2);
  273 |   const receipt = cast.events.find(event => event.tick > beforeRelease.tick && event.type === 'TOOL_FIRED' && event.data.tool === 2)!;
  274 |   expect(Number(receipt.data.x)).toBeCloseTo(releasedPreview!.aim.x, 4); expect(Number(receipt.data.y)).toBeCloseTo(releasedPreview!.aim.y, 4);
  275 |   await info.attach('moving-preview-release-alignment', { body: JSON.stringify({ scope: 'Last production diagnostics preview sampled in capture phase of the real third-finger pointerup while the movement finger remains held; no simulation writes.', releasedPreview, receipt, before: beforeRelease.player, after: cast.player }, null, 2), contentType: 'application/json' });
  276 |   await ticksAfter(page, cast.elapsed, .3); const after = await readState(page); expect(after.shots).toBe(cast.shots);
  277 |   expect(after.events.some(event => event.tick > begun.tick && event.type === 'TOOL_FIRED' && event.data.tool === 1)).toBe(false);
  278 |   await fingers.up(2); await fingers.down(2, await center(page, attack)); await expect.poll(async () => (await readState(page)).shots).toBeGreaterThan(after.shots);
  279 |   await fingers.down(4, await center(page, '.mobile-top-actions [data-action="pause"]')); await fingers.up(4); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  280 |   await fingers.release(); await page.locator('[data-action="continue"]').tap(); const resumed = await readState(page); await ticksAfter(page, resumed.elapsed, .18); const clean = await readState(page);
  281 |   expect(clean.shots).toBe(resumed.shots); expect(clean.player.x).toBeCloseTo(resumed.player.x, 4);
  282 |   await pointerEvidence(page, info, 'Chromium CDP three gameplay contacts plus pause; production snapshot remains read-only');
  283 | });
  284 | 
  285 | test('map opens real details; portrait and background retain a paused clean state', async ({ page }, info) => {
  286 |   await start(page); await page.locator('.mobile-map[data-action="mobile-map"]').tap(); await expect(page.locator('#mobile-details-content #tactical-map')).toBeVisible();
  287 |   const paused = await readState(page); await page.waitForTimeout(130); expect((await readState(page)).tick).toBe(paused.tick);
  288 |   await page.locator('.mobile-details-dialog [data-action="help"]').tap(); await expect(page.locator('[data-action="close-help"]')).toBeVisible();
  289 |   await page.locator('[data-action="close-help"]').tap(); await expect.poll(async () => (await readState(page)).phase).toBe('playing');
  290 |   await page.setViewportSize({ width: 390, height: 844 }); await expect(page.locator('#mobile-rotate-notice')).toBeVisible(); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  291 |   await page.screenshot({ path: info.outputPath('portrait-paused.png') }); await page.setViewportSize({ width: 844, height: 390 }); await expect(page.locator('#mobile-rotate-notice')).toBeHidden();
  292 |   expect((await readState(page)).phase).toBe('paused'); await page.locator('[data-action="continue"]').tap(); await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  293 |   await expect.poll(async () => (await readState(page)).phase).toBe('paused'); await page.locator('[data-action="continue"]').tap();
  294 |   const resumed = await readState(page); await ticksAfter(page, resumed.elapsed, .16); const clean = await readState(page);
  295 |   expect(clean.player.x).toBeCloseTo(resumed.player.x, 4); expect(clean.player.y).toBeCloseTo(resumed.player.y, 4); expect(clean.shots).toBe(resumed.shots);
  296 | });
  297 | 
  298 | test('endless wave, charges and actual minimap remain available offline', async ({ page }) => {
  299 |   await start(page, 'endless'); await expect(page.locator('#mobile-wave')).toContainText('第1波'); await expect(page.locator('#mobile-wave')).toContainText('剩余');
  300 |   await expect(page.locator('[data-touch-action="antibody"]')).toBeVisible(); await expect(page.locator('#mobile-antibody-charges')).toHaveText('2');
```