import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readState } from '../e2e/campaignDriver';
import type { GameState } from '../../src/game/types';
import type { TouchPresentation } from '../../src/input/controller';
import type { Renderer } from '../../src/render/renderer';

const wide = { width: 1366, height: 768 }, compact = { width: 844, height: 390 };
const entries = [
  { name: 'dist', url: pathToFileURL(resolve('dist/index.html')).href },
  { name: 'single-html', url: pathToFileURL(resolve('releases/Viral-Invasion-Mobile.html')).href },
];
type Diagnostics = ReturnType<Renderer['diagnostics']> & { touch?: TouchPresentation };
const observations = new WeakMap<Page, { errors: string[]; remote: string[] }>();
const identity = (state: GameState) => ({ seed: state.seed, runId: state.runMetrics?.runId,
  growthRun: state.growth?.runId, endless: !!state.endless, campaign: !!state.campaign });

async function open(page: Page, entry: typeof entries[number], query = '') {
  const observed = { errors: [] as string[], remote: [] as string[] }; observations.set(page, observed);
  page.on('pageerror', error => observed.errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) observed.remote.push(request.url()); });
  await page.context().setOffline(true);
  await page.goto(`${entry.url}?seed=41${query ? `&${query}` : ''}`);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  await expect.poll(async () => (await readState(page)).phase).toBe('menu');
}
async function layout(page: Page, expected: 'desktop' | 'mobile') {
  await expect(page.locator('html')).toHaveAttribute('data-layout', expected);
  if (expected === 'mobile') await expect(page.locator('body')).toHaveClass(/\btouch-mode\b/);
  else await expect(page.locator('body')).not.toHaveClass(/\btouch-mode\b/);
}
async function canvasFits(page: Page) {
  const size = page.viewportSize()!;
  await expect.poll(async () => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!, rect = canvas.getBoundingClientRect();
    const phaser = (window.__viral.diagnostics() as unknown as Diagnostics).phaser;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      rendererWidth: phaser.widthCSS, rendererHeight: phaser.heightCSS,
      backingWidth: canvas.width, backingHeight: canvas.height, dpr: phaser.dpr };
  })).toEqual({ x: 0, y: 0, width: size.width, height: size.height,
    rendererWidth: size.width, rendererHeight: size.height, backingWidth: size.width, backingHeight: size.height, dpr: 1 });
}
async function paused(page: Page) {
  await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  const before = await readState(page); await page.waitForTimeout(120);
  expect((await readState(page)).tick).toBe(before.tick);
  return before;
}
async function start(page: Page, mode: 'training' | 'endless') {
  await page.locator(`[data-action="${mode === 'training' ? 'start' : 'endless-start'}"]`).click();
  await expect.poll(async () => (await readState(page)).phase).toBe('playing');
  return readState(page);
}
async function continueRun(page: Page) {
  await page.locator('[data-action="continue"]').click();
  await expect.poll(async () => (await readState(page)).phase).toBe('playing');
}
async function noActionAfter(page: Page, before: GameState) {
  await expect.poll(async () => (await readState(page)).elapsed).toBeGreaterThan(before.elapsed + .2);
  const after = await readState(page);
  expect(after.shots).toBe(before.shots); expect(after.scans).toBe(before.scans);
  expect(after.player.x).toBeCloseTo(before.player.x, 4); expect(after.player.y).toBeCloseTo(before.player.y, 4);
  expect(identity(after)).toEqual(identity(before));
  return after;
}
async function profileStorage(page: Page) {
  return page.evaluate(() => ({ profile: localStorage.getItem('viral-invasion:1:profile'),
    endless: localStorage.getItem('viral-invasion:1:endless-profile') }));
}

test.afterEach(async ({ page }, info) => {
  const observed = observations.get(page); if (!observed) return;
  await info.attach('offline-browser-evidence', { body: JSON.stringify(observed, null, 2), contentType: 'application/json' });
  expect(observed.errors).toEqual([]); expect(observed.remote).toEqual([]);
});

for (const entry of entries) {
  test(`${entry.name}: menu follows inclusive width/height boundaries and redraws both ways`, async ({ page }, info) => {
    await open(page, entry); await layout(page, 'desktop');
    if (entry.name === 'single-html') await expect(page.locator('html')).toHaveAttribute('data-mobile', 'true');
    const original = identity(await readState(page));
    const cases = [
      { ...wide, mode: 'desktop' }, { width: 1024, height: 768, mode: 'mobile' },
      { width: 1025, height: 768, mode: 'desktop' }, { width: 1366, height: 600, mode: 'mobile' },
      { width: 1366, height: 601, mode: 'desktop' }, { ...compact, mode: 'mobile' }, { ...wide, mode: 'desktop' },
    ] as const;
    for (const size of cases) {
      await page.setViewportSize({ width: size.width, height: size.height }); await layout(page, size.mode); await canvasFits(page);
      const controls = page.locator('.challenge-home-controls');
      if (size.mode === 'desktop') await expect(controls).toContainText('WASD');
      else { await expect(controls).toContainText('左侧'); await expect(controls).not.toContainText('WASD'); }
      const state = await readState(page); expect(state.phase).toBe('menu'); expect(identity(state)).toEqual(original);
    }
    await info.attach('tested-layout-boundaries', { body: JSON.stringify(cases), contentType: 'application/json' });
  });

  test(`${entry.name}: same run and stored settings survive resize; actual details nodes return to desktop`, async ({ page }, info) => {
    await open(page, entry); await layout(page, 'desktop'); const begun = await start(page, 'endless');
    const run = identity(begun), map = await page.locator('#endless-minimap').elementHandle(), growth = await page.locator('.growth-panel').elementHandle();
    expect(map).not.toBeNull(); expect(growth).not.toBeNull();
    await page.screenshot({ path: info.outputPath(`${entry.name}-desktop-playing.png`) });
    await page.keyboard.press('Escape'); await paused(page);
    await page.locator('#overlay-host [data-action="effects"]').click();
    await expect(page.locator('#overlay-host [data-action="effects"]')).toContainText('低');
    const stored = await profileStorage(page); expect(stored.profile).not.toBeNull();
    expect(JSON.parse(stored.profile!).settings.lowEffects).toBe(true);
    await continueRun(page); await page.setViewportSize(compact); await layout(page, 'mobile'); await paused(page); await canvasFits(page);
    expect(identity(await readState(page))).toEqual(run); expect(await profileStorage(page)).toEqual(stored);
    await continueRun(page); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-active', 'true');
    await page.screenshot({ path: info.outputPath(`${entry.name}-compact-playing.png`) });
    await page.locator('.mobile-map[data-action="mobile-map"]').click(); await paused(page);
    await expect(page.locator('#mobile-details-content #endless-minimap')).toBeVisible();
    expect(await map!.evaluate(node => node === document.querySelector('#mobile-details-content #endless-minimap'))).toBe(true);
    expect(await growth!.evaluate(node => node.closest('#mobile-details-content') !== null)).toBe(true);
    await page.setViewportSize(wide); await layout(page, 'desktop'); const restored = await paused(page); await canvasFits(page);
    expect(identity(restored)).toEqual(run); await expect(page.locator('.mobile-details-dialog')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/\bmobile-details-open\b/);
    expect(await map!.evaluate(node => node === document.querySelector('#endless-minimap') && node.closest('#hud') !== null)).toBe(true);
    expect(await growth!.evaluate(node => node === document.querySelector('.growth-panel') && node.closest('#hud') !== null)).toBe(true);
    await expect(page.locator('#endless-minimap')).toHaveCount(1); await expect(page.locator('.growth-panel')).toHaveCount(1);
    await expect(page.locator('.tool-dock')).toBeVisible(); await expect(page.locator('.tool[data-action="tool-1"] strong')).toContainText('精确净化');
    await expect(page.locator('#overlay-host [data-action="effects"]')).toContainText('低'); expect(await profileStorage(page)).toEqual(stored);
    await continueRun(page); await page.screenshot({ path: info.outputPath(`${entry.name}-desktop-restored-playing.png`) });
    expect(identity(await readState(page))).toEqual(run);
    await info.attach('run-and-profile-preservation', { body: JSON.stringify({ before: run, after: identity(await readState(page)), stored, mapReturned: true, growthReturned: true }, null, 2), contentType: 'application/json' });
  });

  test(`${entry.name}: held desktop movement and mouse fire are cleared on compact transition`, async ({ page }) => {
    await open(page, entry, 'scenario=training'); await layout(page, 'desktop'); const begun = await start(page, 'training');
    await page.keyboard.down('KeyD'); await page.mouse.move(610, 360); await page.mouse.down();
    await expect.poll(async () => (await readState(page)).shots).toBeGreaterThan(begun.shots);
    await expect.poll(async () => (await readState(page)).player.x).toBeGreaterThan(begun.player.x + 5);
    await page.setViewportSize(compact); await layout(page, 'mobile'); await paused(page); await canvasFits(page);
    expect(identity(await readState(page))).toEqual(identity(begun));
    // Escape resumes while the original D key and mouse contact are still held.
    // A layout reset must require new presses, rather than resuming stale fire.
    await page.keyboard.press('Escape'); await expect.poll(async () => (await readState(page)).phase).toBe('playing');
    await noActionAfter(page, await readState(page)); await page.keyboard.up('KeyD'); await page.mouse.up();
    await page.setViewportSize(wide); await layout(page, 'desktop'); await paused(page); await canvasFits(page);
  });

  test(`${entry.name}: a held skill preview is cancelled when the window expands`, async ({ page }) => {
    await open(page, entry, 'scenario=training'); await page.setViewportSize(compact); await layout(page, 'mobile');
    const begun = await start(page, 'training'), button = page.locator('[data-touch-skill="2"]'), box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
    await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'preview');
    const preview = await readState(page); expect(preview.shots).toBe(begun.shots); expect(preview.tool).toBe(begun.tool);
    await page.setViewportSize(wide); await layout(page, 'desktop'); await paused(page); await canvasFits(page);
    await expect(page.locator('#mobile-skill-preview')).toBeHidden();
    expect(await page.evaluate(() => (window.__viral.diagnostics() as unknown as Diagnostics).touch?.preview)).toBeUndefined();
    await page.mouse.up(); await continueRun(page); const after = await noActionAfter(page, await readState(page));
    expect(after.tool).toBe(begun.tool); expect(after.cooldowns[2]).toBe(begun.cooldowns[2]);
    expect(after.events.some(event => event.tick > begun.tick && event.type === 'TRACTION_STARTED')).toBe(false);
    expect(identity(after)).toEqual(identity(begun));
  });

  test(`${entry.name}: portrait menu stays usable and an active run remains paused until resumed`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 }); await open(page, entry); await layout(page, 'mobile');
    await expect(page.locator('.challenge-home-start')).toBeVisible(); await expect(page.locator('#mobile-rotate-notice')).toBeHidden(); await canvasFits(page);
    await page.locator('[data-action="endless-start"]').click(); const blocked = await paused(page);
    await expect(page.locator('#mobile-rotate-notice')).toBeVisible(); await page.screenshot({ path: info.outputPath(`${entry.name}-portrait-paused.png`) });
    await page.setViewportSize(compact); await layout(page, 'mobile'); await expect(page.locator('#mobile-rotate-notice')).toBeHidden();
    await paused(page); await canvasFits(page); expect(identity(await readState(page))).toEqual(identity(blocked));
    await page.setViewportSize(wide); await layout(page, 'desktop'); await paused(page); await continueRun(page);
    expect(identity(await readState(page))).toEqual(identity(blocked));
  });

  test(`${entry.name}: an open manual restores keyboard wording after a touch-layout round trip`, async ({ page }) => {
    await open(page, entry, 'scenario=training'); const begun = await start(page, 'training');
    await page.locator('.topbar [data-action="help"]').click(); await paused(page);
    const grid = page.locator('.help-grid'); await expect(grid).toContainText(/W\s*A\s*S\s*D/);
    const original = await grid.textContent();
    await page.setViewportSize(compact); await layout(page, 'mobile'); await paused(page);
    await expect(grid).toContainText('左摇杆'); await expect(grid).not.toContainText(/W\s*A\s*S\s*D/);
    await page.setViewportSize(wide); await layout(page, 'desktop'); await paused(page);
    await expect(grid).toHaveText(original!); await expect(grid).not.toContainText('左摇杆');
    await page.locator('[data-action="close-help"]').click(); await expect.poll(async () => (await readState(page)).phase).toBe('playing');
    expect(identity(await readState(page))).toEqual(identity(begun));
  });

  test(`${entry.name}: explicit mobile query keeps touch controls at desktop sizes`, async ({ page }) => {
    await open(page, entry, 'mobile=1'); await layout(page, 'mobile'); await expect(page.locator('.challenge-home-controls')).toContainText('左侧');
    await page.setViewportSize({ width: 1600, height: 900 }); await layout(page, 'mobile'); await canvasFits(page);
    await page.setViewportSize(wide); await layout(page, 'mobile'); await canvasFits(page);
  });

  test(`${entry.name}: an actual coarse touch browser keeps mobile layout at wide sizes`, async ({ browser, browserName }, info) => {
    const context = await browser.newContext({ viewport: wide, hasTouch: true, deviceScaleFactor: 1 }); const page = await context.newPage();
    try {
      await open(page, entry);
      const capabilities = await page.evaluate(() => ({ maxTouchPoints: navigator.maxTouchPoints,
        coarse: matchMedia('(pointer: coarse)').matches, anyCoarse: matchMedia('(any-pointer: coarse)').matches, touchEvents: 'ontouchstart' in window }));
      await info.attach('native-touch-capability', { body: JSON.stringify({ browserName, context: { hasTouch: true, viewport: wide }, capabilities,
        scope: 'Browser-native capability exposure, without overriding navigator or media queries. Windows Playwright WebKit can emulate coarse/touch events while still exposing zero maxTouchPoints.' }, null, 2), contentType: 'application/json' });
      test.skip(browserName === 'webkit' && capabilities.maxTouchPoints === 0,
        `Windows WebKit touch emulation exposes maxTouchPoints=${capabilities.maxTouchPoints}, coarse=${capabilities.coarse}; cannot model a real coarse touch device. Chromium assertions remain strict.`);
      expect(capabilities.maxTouchPoints).toBeGreaterThan(0); expect(capabilities.coarse).toBe(true);
      await layout(page, 'mobile'); await expect(page.locator('.challenge-home-controls')).toContainText('左侧'); await canvasFits(page);
      await page.setViewportSize({ width: 1600, height: 900 }); await layout(page, 'mobile'); await canvasFits(page);
      expect(observations.get(page)!.errors).toEqual([]); expect(observations.get(page)!.remote).toEqual([]);
    } finally { await context.close(); }
  });
}
