# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: responsive-layout.spec.ts >> single-html: an actual coarse touch browser keeps mobile layout at wide sizes
- Location: tests\mobile\responsive-layout.spec.ts:189:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Test source

```ts
  92  |       else { await expect(controls).toContainText('左侧'); await expect(controls).not.toContainText('WASD'); }
  93  |       const state = await readState(page); expect(state.phase).toBe('menu'); expect(identity(state)).toEqual(original);
  94  |     }
  95  |     await info.attach('tested-layout-boundaries', { body: JSON.stringify(cases), contentType: 'application/json' });
  96  |   });
  97  | 
  98  |   test(`${entry.name}: same run and stored settings survive resize; actual details nodes return to desktop`, async ({ page }, info) => {
  99  |     await open(page, entry); await layout(page, 'desktop'); const begun = await start(page, 'endless');
  100 |     const run = identity(begun), map = await page.locator('#endless-minimap').elementHandle(), growth = await page.locator('.growth-panel').elementHandle();
  101 |     expect(map).not.toBeNull(); expect(growth).not.toBeNull();
  102 |     await page.screenshot({ path: info.outputPath(`${entry.name}-desktop-playing.png`) });
  103 |     await page.keyboard.press('Escape'); await paused(page);
  104 |     await page.locator('#overlay-host [data-action="effects"]').click();
  105 |     await expect(page.locator('#overlay-host [data-action="effects"]')).toContainText('低');
  106 |     const stored = await profileStorage(page); expect(stored.profile).not.toBeNull();
  107 |     expect(JSON.parse(stored.profile!).settings.lowEffects).toBe(true);
  108 |     await continueRun(page); await page.setViewportSize(compact); await layout(page, 'mobile'); await paused(page); await canvasFits(page);
  109 |     expect(identity(await readState(page))).toEqual(run); expect(await profileStorage(page)).toEqual(stored);
  110 |     await continueRun(page); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-active', 'true');
  111 |     await page.screenshot({ path: info.outputPath(`${entry.name}-compact-playing.png`) });
  112 |     await page.locator('.mobile-map[data-action="mobile-map"]').click(); await paused(page);
  113 |     await expect(page.locator('#mobile-details-content #endless-minimap')).toBeVisible();
  114 |     expect(await map!.evaluate(node => node === document.querySelector('#mobile-details-content #endless-minimap'))).toBe(true);
  115 |     expect(await growth!.evaluate(node => node.closest('#mobile-details-content') !== null)).toBe(true);
  116 |     await page.setViewportSize(wide); await layout(page, 'desktop'); const restored = await paused(page); await canvasFits(page);
  117 |     expect(identity(restored)).toEqual(run); await expect(page.locator('.mobile-details-dialog')).toHaveCount(0);
  118 |     await expect(page.locator('body')).not.toHaveClass(/\bmobile-details-open\b/);
  119 |     expect(await map!.evaluate(node => node === document.querySelector('#endless-minimap') && node.closest('#hud') !== null)).toBe(true);
  120 |     expect(await growth!.evaluate(node => node === document.querySelector('.growth-panel') && node.closest('#hud') !== null)).toBe(true);
  121 |     await expect(page.locator('#endless-minimap')).toHaveCount(1); await expect(page.locator('.growth-panel')).toHaveCount(1);
  122 |     await expect(page.locator('.tool-dock')).toBeVisible(); await expect(page.locator('.tool[data-action="tool-1"] strong')).toContainText('精确净化');
  123 |     await expect(page.locator('#overlay-host [data-action="effects"]')).toContainText('低'); expect(await profileStorage(page)).toEqual(stored);
  124 |     await continueRun(page); await page.screenshot({ path: info.outputPath(`${entry.name}-desktop-restored-playing.png`) });
  125 |     expect(identity(await readState(page))).toEqual(run);
  126 |     await info.attach('run-and-profile-preservation', { body: JSON.stringify({ before: run, after: identity(await readState(page)), stored, mapReturned: true, growthReturned: true }, null, 2), contentType: 'application/json' });
  127 |   });
  128 | 
  129 |   test(`${entry.name}: held desktop movement and mouse fire are cleared on compact transition`, async ({ page }) => {
  130 |     await open(page, entry, 'scenario=training'); await layout(page, 'desktop'); const begun = await start(page, 'training');
  131 |     await page.keyboard.down('KeyD'); await page.mouse.move(610, 360); await page.mouse.down();
  132 |     await expect.poll(async () => (await readState(page)).shots).toBeGreaterThan(begun.shots);
  133 |     await expect.poll(async () => (await readState(page)).player.x).toBeGreaterThan(begun.player.x + 5);
  134 |     await page.setViewportSize(compact); await layout(page, 'mobile'); await paused(page); await canvasFits(page);
  135 |     expect(identity(await readState(page))).toEqual(identity(begun));
  136 |     // Escape resumes while the original D key and mouse contact are still held.
  137 |     // A layout reset must require new presses, rather than resuming stale fire.
  138 |     await page.keyboard.press('Escape'); await expect.poll(async () => (await readState(page)).phase).toBe('playing');
  139 |     await noActionAfter(page, await readState(page)); await page.keyboard.up('KeyD'); await page.mouse.up();
  140 |     await page.setViewportSize(wide); await layout(page, 'desktop'); await paused(page); await canvasFits(page);
  141 |   });
  142 | 
  143 |   test(`${entry.name}: a held skill preview is cancelled when the window expands`, async ({ page }) => {
  144 |     await open(page, entry, 'scenario=training'); await page.setViewportSize(compact); await layout(page, 'mobile');
  145 |     const begun = await start(page, 'training'), button = page.locator('[data-touch-skill="2"]'), box = (await button.boundingBox())!;
  146 |     await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  147 |     await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
  148 |     await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'preview');
  149 |     const preview = await readState(page); expect(preview.shots).toBe(begun.shots); expect(preview.tool).toBe(begun.tool);
  150 |     await page.setViewportSize(wide); await layout(page, 'desktop'); await paused(page); await canvasFits(page);
  151 |     await expect(page.locator('#mobile-skill-preview')).toBeHidden();
  152 |     expect(await page.evaluate(() => (window.__viral.diagnostics() as unknown as Diagnostics).touch?.preview)).toBeUndefined();
  153 |     await page.mouse.up(); await continueRun(page); const after = await noActionAfter(page, await readState(page));
  154 |     expect(after.tool).toBe(begun.tool); expect(after.cooldowns[2]).toBe(begun.cooldowns[2]);
  155 |     expect(after.events.some(event => event.tick > begun.tick && event.type === 'TRACTION_STARTED')).toBe(false);
  156 |     expect(identity(after)).toEqual(identity(begun));
  157 |   });
  158 | 
  159 |   test(`${entry.name}: portrait menu stays usable and an active run remains paused until resumed`, async ({ page }, info) => {
  160 |     await page.setViewportSize({ width: 390, height: 844 }); await open(page, entry); await layout(page, 'mobile');
  161 |     await expect(page.locator('.challenge-home-start')).toBeVisible(); await expect(page.locator('#mobile-rotate-notice')).toBeHidden(); await canvasFits(page);
  162 |     await page.locator('[data-action="endless-start"]').click(); const blocked = await paused(page);
  163 |     await expect(page.locator('#mobile-rotate-notice')).toBeVisible(); await page.screenshot({ path: info.outputPath(`${entry.name}-portrait-paused.png`) });
  164 |     await page.setViewportSize(compact); await layout(page, 'mobile'); await expect(page.locator('#mobile-rotate-notice')).toBeHidden();
  165 |     await paused(page); await canvasFits(page); expect(identity(await readState(page))).toEqual(identity(blocked));
  166 |     await page.setViewportSize(wide); await layout(page, 'desktop'); await paused(page); await continueRun(page);
  167 |     expect(identity(await readState(page))).toEqual(identity(blocked));
  168 |   });
  169 | 
  170 |   test(`${entry.name}: an open manual restores keyboard wording after a touch-layout round trip`, async ({ page }) => {
  171 |     await open(page, entry, 'scenario=training'); const begun = await start(page, 'training');
  172 |     await page.locator('.topbar [data-action="help"]').click(); await paused(page);
  173 |     const grid = page.locator('.help-grid'); await expect(grid).toContainText(/W\s*A\s*S\s*D/);
  174 |     const original = await grid.textContent();
  175 |     await page.setViewportSize(compact); await layout(page, 'mobile'); await paused(page);
  176 |     await expect(grid).toContainText('左摇杆'); await expect(grid).not.toContainText(/W\s*A\s*S\s*D/);
  177 |     await page.setViewportSize(wide); await layout(page, 'desktop'); await paused(page);
  178 |     await expect(grid).toHaveText(original!); await expect(grid).not.toContainText('左摇杆');
  179 |     await page.locator('[data-action="close-help"]').click(); await expect.poll(async () => (await readState(page)).phase).toBe('playing');
  180 |     expect(identity(await readState(page))).toEqual(identity(begun));
  181 |   });
  182 | 
  183 |   test(`${entry.name}: explicit mobile query keeps touch controls at desktop sizes`, async ({ page }) => {
  184 |     await open(page, entry, 'mobile=1'); await layout(page, 'mobile'); await expect(page.locator('.challenge-home-controls')).toContainText('左侧');
  185 |     await page.setViewportSize({ width: 1600, height: 900 }); await layout(page, 'mobile'); await canvasFits(page);
  186 |     await page.setViewportSize(wide); await layout(page, 'mobile'); await canvasFits(page);
  187 |   });
  188 | 
  189 |   test(`${entry.name}: an actual coarse touch browser keeps mobile layout at wide sizes`, async ({ browser }) => {
  190 |     const context = await browser.newContext({ viewport: wide, hasTouch: true, deviceScaleFactor: 1 }); const page = await context.newPage();
  191 |     try {
> 192 |       await open(page, entry); expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
      |                                                                                            ^ Error: expect(received).toBeGreaterThan(expected)
  193 |       expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  194 |       await layout(page, 'mobile'); await expect(page.locator('.challenge-home-controls')).toContainText('左侧'); await canvasFits(page);
  195 |       await page.setViewportSize({ width: 1600, height: 900 }); await layout(page, 'mobile'); await canvasFits(page);
  196 |       expect(observations.get(page)!.errors).toEqual([]); expect(observations.get(page)!.remote).toEqual([]);
  197 |     } finally { await context.close(); }
  198 |   });
  199 | }
  200 | 
```