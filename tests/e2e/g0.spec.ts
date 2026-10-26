import { test, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameState, Vec } from '../../src/game/types';

type Diagnostics = {
  depthOrder: string[];
  occluded: boolean;
  foregroundOpacity: number;
  layerOrder: string[];
};
type ReadonlyDiagnostics = {
  version: string;
  snapshot(): GameState;
  toScreen(point: Vec): Vec;
  toWorld(point: Vec): Vec;
  diagnostics(): Diagnostics;
};
declare global { interface Window { readonly __viral: ReadonlyDiagnostics } }

const entry = pathToFileURL(resolve('dist/index.html')).href;
type Audit = { remoteRequests: string[]; pageErrors: string[]; consoleErrors: string[]; browserVersion: string; offline: boolean };
const audits = new WeakMap<Page, Audit>();

async function installOfflineAudit(page: Page, context: BrowserContext): Promise<void> {
  const audit: Audit = { remoteRequests: [], pageErrors: [], consoleErrors: [], browserVersion: context.browser()?.version() ?? 'unknown', offline: true };
  audits.set(page, audit);
  await context.setOffline(true);
  await context.route(/^https?:\/\//i, async route => {
    audit.remoteRequests.push(route.request().url());
    await route.abort('internetdisconnected');
  });
  page.on('pageerror', error => audit.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') audit.consoleErrors.push(message.text());
  });
}

async function snapshot(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__viral.snapshot());
}
async function diagnostics(page: Page): Promise<Diagnostics> {
  return page.evaluate(() => window.__viral.diagnostics());
}
async function pointOnScreen(page: Page, point: Vec): Promise<Vec> {
  return page.evaluate(p => window.__viral.toScreen(p), point);
}
async function terminalOverlapPixel(page: Page): Promise<{ r: number; g: number; b: number; brightness: number }> {
  return page.evaluate(() => {
    const terminal = window.__viral.snapshot().terminal;
    const anchor = window.__viral.toScreen(terminal);
    const scale = window.__viral.toScreen({ x: terminal.x + 1, y: terminal.y }).x - anchor.x;
    // A flat part of the terminal screen is covered by the player's suit when
    // behind and helmet when in front. Read the final Canvas, not sort metadata.
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    const [r, g, b] = canvas.getContext('2d')!.getImageData(
      Math.round((anchor.x + 12 * scale) * devicePixelRatio),
      Math.round((anchor.y - 40 * scale) * devicePixelRatio), 1, 1,
    ).data;
    return { r, g, b, brightness: (r + g + b) / 3 };
  });
}
async function aimAt(page: Page, point: Vec): Promise<void> {
  const screen = await pointOnScreen(page, point);
  await page.mouse.move(screen.x, screen.y);
}
async function selectTool(page: Page, tool: 1 | 2 | 3): Promise<void> {
  await page.keyboard.press(`Digit${tool}`);
  await expect.poll(async () => (await snapshot(page)).tool).toBe(tool);
}
async function clickWorld(page: Page, point: Vec): Promise<void> {
  await aimAt(page, point);
  await page.mouse.down();
  await page.waitForTimeout(65);
  await page.mouse.up();
}
async function hold(page: Page, keys: string[], milliseconds: number): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  for (const key of keys) await page.keyboard.up(key);
}
async function holdSimulationTicks(page: Page, keys: string[], ticks: number): Promise<void> {
  const startingTick = (await snapshot(page)).tick;
  for (const key of keys) await page.keyboard.down(key);
  try {
    await expect.poll(async () => (await snapshot(page)).tick - startingTick,
      { timeout: 8_000, intervals: [10, 20, 30] }).toBeGreaterThanOrEqual(ticks);
  } finally { for (const key of keys) await page.keyboard.up(key); }
}

// Every movement is a real key hold. Diagnostic snapshots only decide when to release.
// The caller supplies waypoints around visible tissue footprints when necessary.
async function moveTo(page: Page, target: Vec, tolerance = 7): Promise<void> {
  for (const axis of ['x', 'y'] as const) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const state = await snapshot(page);
      const delta = target[axis] - state.player[axis];
      if (Math.abs(delta) <= tolerance) break;
      if (Date.now() > deadline) throw new Error(`Could not reach ${JSON.stringify(target)}: ${JSON.stringify(state.player)}`);
      const key = axis === 'x' ? delta > 0 ? 'KeyD' : 'KeyA' : delta > 0 ? 'KeyS' : 'KeyW';
      await hold(page, [key], Math.max(22, Math.min(250, (Math.abs(delta) - 3) / 235 * 1000)));
    }
  }
}

async function start(page: Page): Promise<void> {
  await page.goto(entry);
  await expect(page).toHaveTitle(/Viral Invasion/);
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  await page.locator('[data-action="start"]').click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
}
async function imageEvidence(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${info.project.name}-${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: 'image/png' });
}
async function jsonEvidence(info: TestInfo, name: string, data: unknown): Promise<void> {
  await info.attach(name, { body: Buffer.from(JSON.stringify(data, null, 2)), contentType: 'application/json' });
}

test.beforeEach(async ({ page, context }) => { await installOfflineAudit(page, context); });
test.afterEach(async ({ page }, info) => {
  const audit = audits.get(page);
  if (audit) {
    await jsonEvidence(info, 'offline-network-and-console', audit);
    expect(audit.remoteRequests, 'The offline release must not attempt remote HTTP requests').toEqual([]);
    expect(audit.pageErrors, 'No fatal browser exception').toEqual([]);
    expect(audit.consoleErrors, 'No console errors or failed resource loading').toEqual([]);
  }
});

test('RUN-01: offline file release completes both target families, repair, retest, and clean retries', async ({ page }, info) => {
  await page.goto(entry);
  await imageEvidence(page, info, 'menu');
  await page.locator('[data-action="start"]').click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  await imageEvidence(page, info, 'training-overview');
  await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await snapshot(page)).scans).toBe(1);

  const initial = await snapshot(page);
  const single = initial.targets.find(target => target.kind === 'single')!;
  await selectTool(page, 1);
  await aimAt(page, single);
  await page.mouse.down();
  await expect.poll(async () => (await snapshot(page)).targets.find(target => target.id === single.id)!.hp).toBe(0);
  await page.mouse.up();
  await moveTo(page, { x: 450, y: 440 });
  const clusters = (await snapshot(page)).targets.filter(target => target.kind === 'cluster');
  const center = { x: clusters.reduce((sum, target) => sum + target.x, 0) / clusters.length, y: clusters.reduce((sum, target) => sum + target.y, 0) / clusters.length };
  await selectTool(page, 2);
  await clickWorld(page, center);
  await expect.poll(async () => (await snapshot(page)).targets.every(target => target.hp === 0)).toBe(true);
  await imageEvidence(page, info, 'both-target-families-cleared');

  await selectTool(page, 3);
  const tissue = (await snapshot(page)).tissue;
  for (const expectedHp of [50, 75, 100]) {
    await expect.poll(async () => { const s = await snapshot(page); return s.elapsed >= s.cooldowns[3]; }).toBe(true);
    await clickWorld(page, tissue);
    await expect.poll(async () => (await snapshot(page)).tissue.hp).toBe(expectedHp);
  }
  await imageEvidence(page, info, 'tissue-repaired');
  await moveTo(page, { x: 450, y: 610 });
  await moveTo(page, { x: 340, y: 610 });
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('dialog', { name: '训练完成' })).toBeVisible();
  const result = await snapshot(page);
  expect(result.result?.success).toBe(true);
  expect(result.events.filter(event => event.type === 'RUN_ENDED')).toHaveLength(1);
  await page.keyboard.press('KeyE');
  expect((await snapshot(page)).events.filter(event => event.type === 'RUN_ENDED')).toHaveLength(1);
  await imageEvidence(page, info, 'training-success');
  await jsonEvidence(info, 'legal-input-completion-state', result);

  const previousSeed = result.seed;
  await page.locator('[data-action="new"]').click();
  let retry = await snapshot(page);
  expect(retry.seed).not.toBe(previousSeed);
  const seed = retry.seed;
  expect(retry.tissue.hp).toBe(25);
  expect(retry.shots).toBe(0);
  expect(retry.scans).toBe(0);
  expect(retry.targets.every(target => target.hp === target.maxHp)).toBe(true);
  expect(retry.events.filter(event => event.type === 'RUN_ENDED')).toHaveLength(0);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="retry"]').click();
  retry = await snapshot(page);
  expect(retry.seed).toBe(seed);
  expect(retry.shots).toBe(0);
  expect(retry.scans).toBe(0);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="menu"]').click();
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  await page.locator('[data-action="start"]').click();
  retry = await snapshot(page);
  expect(retry.player.x).toBe(330);
  expect(retry.player.y).toBe(440);
  await page.reload();
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  expect((await snapshot(page)).phase).toBe('menu');
});

test('AC-M02-02 and VIS-02: eight-way motion, 360-degree aim, scan, dash, tool feedback, help, and collision', async ({ page }, info) => {
  await start(page);
  const routes: Array<{ keys: string[]; x: number; y: number }> = [
    { keys: ['KeyD'], x: 1, y: 0 }, { keys: ['KeyA'], x: -1, y: 0 },
    { keys: ['KeyW'], x: 0, y: -1 }, { keys: ['KeyS'], x: 0, y: 1 },
    { keys: ['KeyW', 'KeyD'], x: 1, y: -1 }, { keys: ['KeyS', 'KeyA'], x: -1, y: 1 },
    { keys: ['KeyS', 'KeyD'], x: 1, y: 1 }, { keys: ['KeyW', 'KeyA'], x: -1, y: -1 },
  ];
  const routeLog: unknown[] = [];
  for (const route of routes) {
    const before = await snapshot(page);
    // Wait for actual simulation steps, rather than assuming a 140ms wall-clock
    // hold includes frames during browser startup or a loaded CI render process.
    await holdSimulationTicks(page, route.keys, 8);
    const after = await snapshot(page);
    await jsonEvidence(info, `movement-${route.keys.join('-')}`, { route, before, after });
    const dx = after.player.x - before.player.x, dy = after.player.y - before.player.y;
    if (route.x) expect(dx * route.x).toBeGreaterThan(12); else expect(Math.abs(dx)).toBeLessThan(1);
    if (route.y) expect(dy * route.y).toBeGreaterThan(12); else expect(Math.abs(dy)).toBeLessThan(1);
    const simulatedSeconds = after.elapsed - before.elapsed;
    // Browser scheduling may add stationary frames around the key hold. It must
    // never create a diagonal speed boost, and the requested input must move.
    expect(Math.hypot(dx, dy) / simulatedSeconds).toBeLessThanOrEqual(235.01);
    expect(Math.hypot(dx, dy) / simulatedSeconds).toBeGreaterThan(120);
    if (route.x && route.y) {
      // Playwright sends keydown/keyup sequentially: at most one simulation
      // boundary at each end can contain just one of the two held keys.
      // The diagonal itself stays normalized (covered exactly by unit tests).
      const sequentialKeyBoundaryBudget = 235 / 60 * 2 + 1e-6;
      expect(Math.abs(Math.abs(dx) - Math.abs(dy))).toBeLessThanOrEqual(sequentialKeyBoundaryBudget);
    }
    routeLog.push({ keys: route.keys, before: before.player, after: after.player, tick: after.tick });
  }
  const angles: unknown[] = [];
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    const player = (await snapshot(page)).player;
    await aimAt(page, { x: player.x + Math.cos(angle) * 150, y: player.y + Math.sin(angle) * 150 });
    await expect.poll(async () => { const actual = (await snapshot(page)).player.facing; return Math.abs(Math.atan2(Math.sin(actual - angle), Math.cos(actual - angle))); }).toBeLessThan(.015);
    angles.push({ requested: angle, actual: (await snapshot(page)).player.facing });
  }
  await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await snapshot(page)).scans).toBe(1);
  expect((await snapshot(page)).targets.every(target => target.scanned)).toBe(true);
  await page.keyboard.press('KeyQ');
  expect((await snapshot(page)).scans).toBe(1);
  const beforeDash = await snapshot(page);
  await hold(page, ['KeyD', 'Space'], 180);
  const afterDash = await snapshot(page);
  expect(afterDash.dashes).toBe(1);
  expect(afterDash.player.x - beforeDash.player.x).toBeGreaterThan(80);
  await page.keyboard.press('Space');
  expect((await snapshot(page)).dashes).toBe(1);

  await selectTool(page, 3);
  let state = await snapshot(page);
  await clickWorld(page, state.targets[0]);
  await expect(page.locator('#message')).toContainText('不能净化靶标');
  expect((await snapshot(page)).targets[0].hp).toBe(state.targets[0].hp);
  await selectTool(page, 1);
  await clickWorld(page, state.tissue);
  await expect(page.locator('#message')).toContainText('按 3');
  expect((await snapshot(page)).tissue.hp).toBe(25);
  // A default mouse.click may press and release between two animation frames.
  // The controller must retain that edge exactly once, without needing a hold.
  await expect.poll(async () => { const s = await snapshot(page); return s.elapsed >= s.cooldowns[1]; }).toBe(true);
  const beforeQuickClick = await snapshot(page);
  const quickClickPoint = await pointOnScreen(page, { x: 900, y: 680 });
  await page.mouse.click(quickClickPoint.x, quickClickPoint.y);
  await expect.poll(async () => (await snapshot(page)).shots).toBe(beforeQuickClick.shots + 1);
  await page.waitForTimeout(250);
  const afterQuickClick = await snapshot(page);
  expect(afterQuickClick.shots).toBe(beforeQuickClick.shots + 1);
  expect(afterQuickClick.events.filter(event => event.type === 'TOOL_FIRED' && event.tick > beforeQuickClick.tick)).toHaveLength(1);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).events.some(event => event.type === 'INTERACTION_REJECTED')).toBe(true);
  await imageEvidence(page, info, 'wrong-tool-feedback');

  await page.locator('[data-action="help"]').first().click();
  await expect(page.getByRole('dialog', { name: '操作指南' })).toBeVisible();
  for (const binding of ['W A S D', 'Space', 'Q', '1', '2', '3', 'E', 'Esc']) await expect(page.locator('.help-grid kbd').filter({ hasText: new RegExp(`^${binding}$`) })).toBeVisible();
  expect((await snapshot(page)).phase).toBe('paused');
  await page.locator('[data-action="close-help"]').click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');

  // The visible fold must block penetration. Off-centre input can legitimately
  // slide along its circular rim, so test the trajectory, not a fixed final Y.
  await moveTo(page, { x: 440, y: 440 });
  const beforeFold = await snapshot(page);
  const foldPath: Array<{ x: number; y: number; elapsed: number }> = [];
  await page.keyboard.down('KeyW');
  try {
    for (let sample = 0; sample < 9; sample++) {
      await page.waitForTimeout(100);
      const observed = await snapshot(page);
      foldPath.push({ x: observed.player.x, y: observed.player.y, elapsed: observed.elapsed });
    }
  } finally { await page.keyboard.up('KeyW'); }
  state = await snapshot(page);
  expect(foldPath.every(point => Math.hypot(point.x - 440, point.y - 295) >= 65.9)).toBe(true);
  expect(foldPath.some(point => Math.hypot(point.x - 440, point.y - 295) < 68), 'The real input route must actually contact the visible fold').toBe(true);
  expect(Math.hypot(state.player.x - 440, state.player.y - 295)).toBeGreaterThanOrEqual(65.9);
  const unobstructedY = beforeFold.player.y - 235 * (state.elapsed - beforeFold.elapsed);
  expect(state.player.y - unobstructedY, 'Collision must impede the route compared with unobstructed travel').toBeGreaterThan(20);
  await imageEvidence(page, info, 'visible-fold-collision');
  await jsonEvidence(info, 'eight-way-and-360-input-log', { routeLog, angles, beforeDash, afterDash, quickClick: { before: beforeQuickClick, after: afterQuickClick }, collision: { player: state.player, foldPath, unobstructedY } });
  await page.locator('[data-action="help"]').first().click();
  await page.locator('[data-action="practice-hit"]').click();
  await expect.poll(async () => (await snapshot(page)).player.hp).toBe(95);
  const hurt = await snapshot(page);
  expect(hurt.phase).toBe('playing');
  expect(hurt.player.hurtUntil).toBeGreaterThan(hurt.elapsed);
  expect(hurt.events.some(event => event.type === 'PLAYER_HURT' && event.data.reason === 'training-exercise')).toBe(true);
  await imageEvidence(page, info, 'player-hit-exercise');
  await expect(page.locator('#message')).toContainText('受击演练');
  await page.waitForTimeout(650);
  const afterHurt = await snapshot(page);
  expect(afterHurt.player.hurtUntil).toBeLessThan(afterHurt.elapsed);
});

test('AC-M01-02: real 30-second pause freezes simulation and resuming clears held attack', async ({ page }, info) => {
  await start(page);
  await aimAt(page, { x: 700, y: 600 });
  await page.mouse.down();
  await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(0);
  await page.keyboard.down('KeyD');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '训练已暂停' })).toBeVisible();
  const paused = await snapshot(page);
  const startedAt = Date.now();
  await page.waitForTimeout(30_100);
  const stillPaused = await snapshot(page);
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(30_000);
  expect(stillPaused).toEqual(paused);
  await imageEvidence(page, info, 'paused-30-seconds');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  // The OS repeat of a key held through pause must not restore cleared input.
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  const afterHeldInput = await snapshot(page);
  expect(afterHeldInput.shots).toBe(paused.shots);
  expect(afterHeldInput.player.x).toBe(paused.player.x);
  await page.keyboard.up('KeyD');
  await page.mouse.up();
  const resumed = await snapshot(page);
  expect(resumed.elapsed - paused.elapsed).toBeLessThan(1.5);
  expect(resumed.tick - paused.tick).toBeLessThan(90);
  await jsonEvidence(info, 'pause-and-held-input-clearing', { wallPauseMs: Date.now() - startedAt, paused, stillPaused, resumed });
  await page.keyboard.press('Escape');
  await page.locator('[data-action="retry"]').click();
  await page.waitForTimeout(250);
  expect((await snapshot(page)).shots).toBe(0);
});

test('focus loss clears movement and does not catch up background time; provenance recorded', async ({ page, context }, info) => {
  await start(page);
  await page.keyboard.down('KeyD');
  const other = await context.newPage();
  await other.setContent('<title>Focus probe</title><input autofocus aria-label="focus probe">');
  await other.bringToFront();
  await other.getByRole('textbox', { name: 'focus probe' }).focus();
  await page.waitForTimeout(350);
  let actualFocusLoss = (await snapshot(page)).phase === 'paused';
  if (!actualFocusLoss) {
    // Some headless Chrome/Edge builds keep every tab visible. Report the fallback
    // explicitly; a dispatched blur is input-clear regression, not an OS focus test.
    info.annotations.push({ type: 'focus-provenance', description: 'Headless tab switch did not emit blur/hidden. Used a synthetic window blur event; real OS focus loss remains manual.' });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  }
  await expect.poll(async () => (await snapshot(page)).phase).toBe('paused');
  const paused = await snapshot(page);
  await page.waitForTimeout(1_100);
  expect(await snapshot(page)).toEqual(paused);
  await other.close();
  await page.bringToFront();
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  await page.waitForTimeout(250);
  const resumed = await snapshot(page);
  expect(resumed.player.x).toBe(paused.player.x);
  expect(resumed.player.y).toBe(paused.player.y);
  expect(resumed.elapsed - paused.elapsed).toBeLessThan(.8);
  await jsonEvidence(info, 'focus-test-provenance', { actualFocusLoss, method: actualFocusLoss ? 'new-tab-bringToFront-and-focus' : 'synthetic-window-blur-fallback', paused, resumed });
});

test('VIS-04 and RUN-11: foot-anchor Y sorting and walkable foreground fade', async ({ page }, info) => {
  await start(page);
  await moveTo(page, { x: 350, y: 580 });
  let order = (await diagnostics(page)).depthOrder;
  expect(order.indexOf('player')).toBeLessThan(order.indexOf('terminal'));
  const behindPixel = await terminalOverlapPixel(page);
  expect(behindPixel.brightness, 'The terminal screen must occlude a player standing behind it').toBeLessThan(120);
  await imageEvidence(page, info, 'player-behind-terminal');
  const behind = { state: await snapshot(page), render: await diagnostics(page) };
  await moveTo(page, { x: 350, y: 640 });
  order = (await diagnostics(page)).depthOrder;
  expect(order.indexOf('player')).toBeGreaterThan(order.indexOf('terminal'));
  const frontPixel = await terminalOverlapPixel(page);
  expect(frontPixel.brightness, 'The player helmet must cover the terminal when standing in front').toBeGreaterThan(behindPixel.brightness + 60);
  await imageEvidence(page, info, 'player-in-front-of-terminal');
  const front = { state: await snapshot(page), render: await diagnostics(page) };
  await moveTo(page, { x: 260, y: 600 });
  const fade = await diagnostics(page);
  expect(fade.occluded).toBe(true);
  expect(fade.foregroundOpacity).toBeLessThan(.3);
  expect(fade.layerOrder).toHaveLength(7);
  await imageEvidence(page, info, 'foreground-fades-and-player-remains-readable');
  const foreground = { state: await snapshot(page), render: fade };
  await moveTo(page, { x: 400, y: 600 });
  expect((await diagnostics(page)).occluded).toBe(false);
  expect((await diagnostics(page)).foregroundOpacity).toBeGreaterThan(.9);
  await imageEvidence(page, info, 'foreground-restored-outside-occlusion');
  await jsonEvidence(info, 'depth-sort-and-foreground-boundary', { behind, front, behindPixel, frontPixel, foreground, outside: await diagnostics(page) });
});

for (const condition of [
  { label: '1366x768-dpr1', width: 1366, height: 768, dpr: 1 },
  { label: '1920x1080-dpr2', width: 1920, height: 1080, dpr: 2 },
  { label: '1100x700-dpr1.5', width: 1100, height: 700, dpr: 1.5 },
]) {
  test.describe(condition.label, () => {
    test.use({ viewport: { width: condition.width, height: condition.height }, deviceScaleFactor: condition.dpr });
    test('VIS-03: projected pointer, inverse coordinates, hit event, and resized canvas align', async ({ page }, info) => {
      await start(page);
      expect(await page.evaluate(() => devicePixelRatio)).toBe(condition.dpr);
      const state = await snapshot(page);
      const target = state.targets.find(item => item.kind === 'single')!;
      const screen = await pointOnScreen(page, target);
      const inverse = await page.evaluate(point => window.__viral.toWorld(point), screen);
      expect(inverse.x).toBeCloseTo(target.x, 8);
      expect(inverse.y).toBeCloseTo(target.y, 8);
      await page.mouse.move(screen.x, screen.y);
      await page.mouse.down();
      await expect.poll(async () => (await snapshot(page)).targets.find(item => item.id === target.id)!.hp).toBeLessThan(100);
      await page.mouse.up();
      const hit = await snapshot(page);
      const fired = hit.events.find(event => event.type === 'TOOL_FIRED')!;
      expect(fired.data.hit).toBe(true);
      // Pointer hardware/browser coordinate quantization is allowed within two
      // logical pixels; the actual target damage remains the decisive assertion.
      expect(Math.abs(Number(fired.data.x) - target.x)).toBeLessThan(2);
      expect(Math.abs(Number(fired.data.y) - target.y)).toBeLessThan(2);
      expect(hit.events.some(event => event.type === 'TARGET_HIT' && event.data.id === target.id)).toBe(true);
      await imageEvidence(page, info, `${condition.label}-pointer-hit`);

      const newViewport = { width: Math.round(condition.width * .84), height: Math.round(condition.height * .86) };
      await page.setViewportSize(newViewport);
      await page.waitForTimeout(100);
      const screenAfter = await pointOnScreen(page, target);
      expect(screenAfter.x).not.toBeCloseTo(screen.x, 1);
      const priorHp = (await snapshot(page)).targets.find(item => item.id === target.id)!.hp;
      await page.waitForTimeout(220);
      await clickWorld(page, target);
      await expect.poll(async () => (await snapshot(page)).targets.find(item => item.id === target.id)!.hp).toBeLessThan(priorHp);
      const canvasSize = await page.locator('#game').evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height, cssWidth: canvas.getBoundingClientRect().width, cssHeight: canvas.getBoundingClientRect().height }));
      expect(canvasSize.width).toBe(Math.round(canvasSize.cssWidth * condition.dpr));
      expect(canvasSize.height).toBe(Math.round(canvasSize.cssHeight * condition.dpr));
      await imageEvidence(page, info, `${condition.label}-resized-pointer-hit`);
      await jsonEvidence(info, 'projection-and-real-mouse-hit', { condition, target, screen, inverse, fired, hit, newViewport, screenAfter, canvasSize });
    });
  });
}
