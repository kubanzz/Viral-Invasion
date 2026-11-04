import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { GameState, Vec, WorldGeometry } from '../../src/game/types';

const selected = process.env.VI_ENTRY ?? 'dist/index.html';
const entry = /^[a-z]+:/i.test(selected) && !/^[a-z]:[\\/]/i.test(selected) ? new URL(selected)
  : pathToFileURL(extname(selected) ? resolve(selected) : resolve(selected, 'index.html'));
entry.searchParams.set('seed', '71');
const run = process.env.VI_DUALFRONT_RUN ?? new Date().toISOString().replace(/[:.]/g, '-');
const snapshot = (page: Page): Promise<GameState> => page.evaluate(() => window.__viral.snapshot());
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const north = (s: GameState) => s.territory!.nodes.find(node => node.id === 'front-north')!;
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const evidencePath = (info: TestInfo, name: string) => {
  const folder = resolve('artifacts/garrison-20261103', run, info.project.name, info.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 100));
  mkdirSync(folder, { recursive: true }); return join(folder, name);
};

function buildIdentity() {
  expect(JSON.parse(readFileSync('package.json', 'utf8')).version).toBe('0.13.0');
  if (entry.protocol !== 'file:') return { entry: entry.href, scope: 'HTTP entry; API marker and actual seven-node rule state must independently identify 0.13.' };
  const file = fileURLToPath(entry), files: Record<string, string> = { [file]: sha(file) };
  if (process.env.VI_EXPECTED_ENTRY_SHA256) expect(files[file], 'Selected candidate entry must match the explicitly frozen byte hash').toBe(process.env.VI_EXPECTED_ENTRY_SHA256);
  const metadataPath = join(dirname(file), 'build-meta.json');
  let metadata: { version: string; outputManifest?: Record<string, string> } | undefined;
  if (existsSync(metadataPath) && /index\.html$/i.test(file)) {
    metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    expect(metadata!.version).toBe('0.13.0'); files[metadataPath] = sha(metadataPath);
    for (const [name, expected] of Object.entries(metadata!.outputManifest ?? {})) {
      const path = join(dirname(file), name); expect(sha(path), `Actual ${name} bytes must match this entry's 0.13 manifest`).toBe(expected); files[path] = expected;
    }
  }
  return { entry: entry.href, files, metadataVersion: metadata?.version,
    scope: metadata ? 'Local 0.13 output manifest verified against actual entry/script/CSS bytes.' : 'Standalone HTML byte hash plus actual 0.13 API marker and seven-node rules; no desktop sibling manifest is borrowed.' };
}
async function open(page: Page, info: TestInfo, touch = false) {
  const identity = buildIdentity(), errors: string[] = [], remote: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (entry.protocol === 'file:' && /^https?:/i.test(request.url())) remote.push(request.url()); });
  if (entry.protocol === 'file:') await page.context().setOffline(true);
  await page.goto(entry.href); await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => page.evaluate(() => window.__viral?.version)).toBe('0.13.0-garrison');
  if (touch) await page.locator('[data-action="endless-start"]').tap();
  else await page.locator('[data-action="endless-start"]').click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  const initial = await snapshot(page);
  expect(initial.territory!.nodes).toHaveLength(7);
  expect(initial.territory!.nodes.filter(node => node.owner === 'healthy').map(node => node.id).sort()).toEqual(['core', 'heart-healing-1', 'heart-healing-2']);
  expect(initial.territory!.nodes.filter(node => node.kind === 'front').map(node => node.id).sort()).toEqual(['front-north', 'front-south']);
  expect(initial.campaign).toBeUndefined();
  expect(initial.territory!.purification).toBeNull();
  expect(initial.territory!.nodes.filter(node => node.kind === 'front' || node.kind === 'healing')
    .every(node => distance(initial.player, node) > 150)).toBe(true);
  await expect(page.locator('#territory-detail')).not.toContainText(/区域净化|净化\s*0%|留在附近/);
  return { initial, identity, errors, remote, info };
}
async function finish(page: Page, opened: Awaited<ReturnType<typeof open>>, details: unknown) {
  expect(opened.errors).toEqual([]); expect(opened.remote).toEqual([]);
  const after = buildIdentity(); expect(after).toEqual(opened.identity);
  const path = evidencePath(opened.info, 'natural-input-evidence.json');
  const evidence = { method: 'Public start and real keyboard/mouse or trusted CDP touch. Only snapshot/projection/DOM/diagnostics reads; no battlefield, actor, clock, inventory or storage writes.',
    boundary: 'Windows desktop browser evidence. It is not a physical-phone, human-playtest, full-rescue or performance result.',
    identity: opened.identity, errors: opened.errors, remote: opened.remote, initial: opened.initial, final: await snapshot(page), details };
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  await page.screenshot({ path: evidencePath(opened.info, 'final.png') });
  await opened.info.attach('natural-input-evidence', { path, contentType: 'application/json' });
}

const legal = (p: Vec, radius: number, w: WorldGeometry) => p.x >= w.bounds.left + radius && p.x <= w.bounds.right - radius
  && p.y >= w.bounds.top + radius && p.y <= w.bounds.bottom - radius && w.obstacles.every(o => distance(p, o) >= o.radius + radius);
function clear(a: Vec, b: Vec, radius: number, world: WorldGeometry) {
  if (!legal(a, radius, world) || !legal(b, radius, world)) return false;
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
  return world.obstacles.every(o => { const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.y - a.y) * dy) / (square || 1)));
    return Math.hypot(a.x + t * dx - o.x, a.y + t * dy - o.y) >= o.radius + radius; });
}
/** Read-only path planning around actual static collision circles; movement is
 * still produced only by browser keys or the real touch joystick. */
function plan(s: GameState, target: Vec, stopRadius: number): Vec[] {
  const world = s.world!, radius = s.player.radius + 6;
  if (distance(s.player, target) <= stopRadius) return [];
  if (clear(s.player, target, radius, world)) return [target];
  const step = 48, points = new Map<string, Vec>();
  const nx = Math.floor((world.bounds.right - world.bounds.left) / step), ny = Math.floor((world.bounds.bottom - world.bounds.top) / step);
  for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
    const p = { x: world.bounds.left + x * step, y: world.bounds.top + y * step };
    if (legal(p, radius, world)) points.set(`${x},${y}`, p);
  }
  const starts = [...points].filter(([, p]) => distance(p, s.player) < 110 && clear(s.player, p, radius, world)).sort((a, b) => distance(a[1], s.player) - distance(b[1], s.player));
  if (!starts.length) throw Error('No collision-safe route starts at the actual player');
  const start = starts[0][0], open = [start], cost = new Map([[start, 0]]), previous = new Map<string, string>();
  const score = (key: string) => cost.get(key)! + Math.max(0, distance(points.get(key)!, target) - stopRadius);
  const visited = new Set<string>(); let end: string | undefined;
  while (open.length) {
    open.sort((a, b) => score(a) - score(b)); const key = open.shift()!;
    if (visited.has(key)) continue; visited.add(key);
    const p = points.get(key)!;
    if (distance(p, target) <= Math.max(70, stopRadius) && (stopRadius >= 70 || clear(p, target, radius, world))) { end = key; break; }
    const [x, y] = key.split(',').map(Number);
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const next = `${x + dx},${y + dy}`, q = points.get(next);
      if (!q || visited.has(next) || !clear(p, q, radius, world)) continue;
      const nextCost = cost.get(key)! + distance(p, q);
      if (nextCost >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, nextCost); previous.set(next, key); open.push(next);
    }
  }
  if (!end) throw Error('Actual collision geometry has no route to the requested interaction range');
  const result = [points.get(end)!]; while (end !== start) { end = previous.get(end)!; result.unshift(points.get(end)!); }
  if (stopRadius < 70) result.push(target); return result;
}
class Keys {
  private held = new Set<string>();
  constructor(private page: Page) {}
  async move(dx: number, dy: number) {
    const length = Math.hypot(dx, dy) || 1;
    const next = [Math.abs(dx / length) > .38 ? dx > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(dy / length) > .38 ? dy > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const key of this.held) if (!next.includes(key)) { await this.page.keyboard.up(key); this.held.delete(key); }
    for (const key of next) if (!this.held.has(key)) { await this.page.keyboard.down(key); this.held.add(key); }
  }
  async release() { for (const key of this.held) await this.page.keyboard.up(key); this.held.clear(); }
}
async function navigate(page: Page, target: Vec, range: number, move: (dx: number, dy: number) => Promise<void>, release: () => Promise<void>) {
  const trail: { tick: number; elapsed: number; player: Vec }[] = [], deadline = Date.now() + 20_000;
  let waypoints = plan(await snapshot(page), target, range);
  try {
    while (Date.now() < deadline) {
      const s = await snapshot(page); expect(s.phase, 'Natural navigation must not silently skip a pause, death or choice').toBe('playing');
      trail.push({ tick: s.tick, elapsed: s.elapsed, player: { x: s.player.x, y: s.player.y } });
      if (distance(s.player, target) <= range) return trail;
      while (waypoints.length > 1 && distance(s.player, waypoints[0]) < 22) waypoints.shift();
      const next = waypoints[0] ?? target; await move(next.x - s.player.x, next.y - s.player.y); await page.waitForTimeout(80);
    }
    throw Error(`Natural input navigation timed out at ${JSON.stringify((await snapshot(page)).player)}`);
  } finally { await release(); }
}
async function farAim(page: Page, s: GameState) {
  const aim = await page.evaluate(({ player, front }) => {
    const candidates = [{ x: player.x + 360, y: player.y }, { x: player.x - 360, y: player.y }, { x: player.x, y: player.y + 320 }];
    const point = candidates.map(world => ({ world, screen: window.__viral.toScreen(world) })).find(({ world, screen }) =>
      Math.hypot(world.x - front.x, world.y - front.y) > 230 && screen.x > 280 && screen.x < innerWidth - 250 && screen.y > 150 && screen.y < innerHeight - 160);
    if (!point) throw Error('No visible, collision-independent far reticle point for this actual camera'); return point;
  }, { player: s.player, front: north(s) });
  await page.mouse.move(aim.screen.x, aim.screen.y); return aim;
}
function realPauseReason(s: GameState): 'inactive' | 'healing-required' | 'out-of-range' | 'invader' | 'hurt' | undefined {
  const front = north(s), healing = s.territory!.nodes.find(node => node.id === 'heart-healing-1')!;
  if (s.phase !== 'playing' || s.player.hp <= 0) return 'inactive';
  if (healing.owner !== 'healthy') return 'healing-required';
  if (distance(s.player, front) > 150 + 1e-7) return 'out-of-range';
  if (s.targets.some(t => t.hp > 0 && ['virus', 'elite'].includes(t.role ?? '') && t.territoryTask?.kind === 'invade'
    && (!t.territorySourceId || t.territorySourceId === 'source-west') && distance(t, front) <= 120 + 1e-7)) return 'invader';
  if (s.territory!.purificationInterruptedUntil > s.elapsed + 1e-7) return 'hurt';
}
async function assertPauseCopy(page: Page, s: GameState) {
  const reason = realPauseReason(s); expect(reason, 'A paused progress assertion must have a real rule cause').toBeDefined();
  const text = { inactive: '战斗已暂停', 'healing-required': '先夺回对应生命泉', 'out-of-range': '离开范围', invader: '清除侵染者继续', hurt: '躲开攻击后继续' }[reason!];
  await expect(page.locator('#territory-detail')).toContainText(text); return reason;
}

test.use({ video: 'off', trace: 'off' });
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const observed = await snapshot(page).catch(() => null);
  const path = evidencePath(info, 'failure-observation.json');
  writeFileSync(path, JSON.stringify({ entry: entry.href, status: info.status, expectedStatus: info.expectedStatus,
    method: 'Failure observation only; no retries, state repair or skipped blocker.',
    observed, actualNorthPauseReason: observed?.territory ? realPauseReason(observed) : null }, null, 2));
  await info.attach('failure-observation', { path, contentType: 'application/json' });
});
test.describe('desktop dual-front clarity', () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  test('real desktop E hold previews, pause cancels without ammo, and release fires exactly once', async ({ page }, info) => {
    const opened = await open(page, info), keys = new Keys(page), origin = { x: 1200, y: 600 };
    const trail = await navigate(page, origin, 35, (x,y) => keys.move(x,y), () => keys.release());
    const target = { x: 1700, y: 600 }, aim = await page.evaluate(p => window.__viral.toScreen(p), target);
    await page.mouse.move(aim.x, aim.y); await page.mouse.down();
    try {
      await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(0);
      const before = await snapshot(page), serial = before.territory!.cannon?.serial ?? 0;
      await page.keyboard.down('KeyE');
      await expect.poll(() => page.evaluate(() => (window.__viral.diagnostics() as unknown as { touch: { preview?: { kind: string } } }).touch.preview?.kind)).toBe('cannon');
      // Pause is a real input barrier: it clears held E without firing or
      // consuming a shell. The browser key must release before a new action.
      await page.keyboard.press('Escape'); await page.keyboard.up('KeyE'); await page.mouse.up();
      await expect.poll(async () => (await snapshot(page)).phase).toBe('paused');
      const canceled = await snapshot(page); expect(canceled.territory!.cannon?.serial ?? 0).toBe(serial);
      expect(canceled.events.some(event => event.tick > before.tick && event.type === 'TERRITORY_CANNON_FIRED')).toBe(false);
      await page.locator('[data-action="continue"]').click();
      await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
      const aimed = await page.evaluate(p => window.__viral.toScreen(p), target); await page.mouse.move(aimed.x, aimed.y);
      await page.mouse.down(); await page.keyboard.down('KeyE');
      const preview = await page.evaluate(() => (window.__viral.diagnostics() as unknown as { touch: { preview?: { kind: string; aim: Vec } } }).touch.preview);
      expect(preview?.kind).toBe('cannon'); await page.keyboard.up('KeyE');
      await expect.poll(async () => (await snapshot(page)).territory!.cannon?.serial ?? 0).toBe(serial + 1);
      const after = await snapshot(page), receipt = after.events.filter(event => event.tick > canceled.tick && event.type === 'TERRITORY_CANNON_FIRED');
      expect(receipt).toHaveLength(1); expect(distance({ x: Number(receipt[0].data.x), y: Number(receipt[0].data.y) }, preview!.aim)).toBeLessThan(.1);
      expect(after.tool).toBe(before.tool); expect(after.shots).toBeGreaterThan(before.shots);
      await finish(page, opened, { trail, before, canceled, preview, after, cancellation: 'Real Escape pause cleared held E; no shell consumed.' });
    } finally { await page.mouse.up(); await page.keyboard.up('KeyE'); await keys.release(); }
  });

  test('public 0.13 entry exposes seven nodes and only one core/two lanes/one goal HUD', async ({ page }, info) => {
    const opened = await open(page, info);
    await expect(page.locator('#territory-core')).toBeVisible(); await expect(page.locator('#territory-regions [data-line]')).toHaveCount(2);
    await expect(page.locator('#territory-line-north > b')).toHaveText('北线'); await expect(page.locator('#territory-line-south > b')).toHaveText('南线');
    await expect(page.locator('#territory-objective')).toHaveCount(1); await expect(page.locator('#territory-objective')).toContainText('净化');
    await expect(page.locator('#territory-regions [data-region]')).toHaveCount(0);
    await expect(page.locator('#endless-spawn-plan')).toBeHidden(); await expect(page.locator('#endless-spawn-plan')).toHaveText('');
    for (const copy of await page.locator('.endless-vitals .endless-core-copy').all()) await expect(copy).toBeHidden();
    await expect(page.locator('#endless-hp')).toBeVisible(); await expect(page.locator('#endless-ability-0')).toBeVisible();
    await expect(page.locator('#territory-regions [data-attacked="true"]')).toHaveCount(0);
    // Let the real first squad enter its four-second warning naturally. Read
    // its schedule and the visible lane at the same point; never inject a queue.
    await expect(page.locator('#territory-line-north')).toContainText(/进攻准备 \d+\.\ds/, { timeout: 8_000 });
    const incoming = await page.evaluate(() => {
      const state = window.__viral.snapshot(), line = document.querySelector<HTMLElement>('#territory-line-north')!;
      return { elapsed: state.elapsed, phaseStartedAt: state.endless!.phaseStartedAt,
        squad: state.endless!.territoryTasks!.squads.find(squad => squad.laneId === 'north' && squad.status === 'warning'),
        latestDeparture: Math.max(-Infinity, ...state.endless!.territoryTasks!.squads.map(squad => squad.bornAt ?? -Infinity)),
        line: line.innerText, attacked: line.dataset.attacked, detail: document.querySelector('#territory-detail')!.textContent };
    });
    expect(incoming.squad).toBeDefined(); expect(incoming.squad!.blocked).toBeUndefined(); expect(incoming.attacked).toBe('false');
    expect(incoming.line).not.toMatch(/受袭|失守|敌群集结/);
    expect(incoming.detail).not.toMatch(/受袭|秒失守|区域净化|净化\s*0%/);
    const remaining = Math.max(0, Math.max(incoming.phaseStartedAt + incoming.squad!.departureOffset,
      incoming.squad!.warnedAt! + 4, incoming.latestDeparture + 10) - incoming.elapsed);
    const shown = Number(incoming.line.match(/进攻准备 (\d+\.\d)s/)?.[1]);
    expect(Number.isFinite(shown)).toBe(true); expect(Math.abs(shown - remaining)).toBeLessThanOrEqual(.2);
    await finish(page, opened, { hud: await page.locator('#territory-hud').innerText(), incoming, independentlyExpectedSeconds: remaining });
  });

  test('real WASD reaches a front and distant reticle plus held cannon survive one-key purification', async ({ page }, info) => {
    const opened = await open(page, info), keys = new Keys(page), target = north(opened.initial);
    const trail = await navigate(page, target, 128, (x, y) => keys.move(x, y), () => keys.release());
    await page.keyboard.press('Digit2'); await expect.poll(async () => (await snapshot(page)).tool).toBe(2);
    const aim = await farAim(page, await snapshot(page)); await page.mouse.down();
    try {
      await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(0);
      const before = await snapshot(page); await page.keyboard.press('Digit3');
      await expect.poll(async () => (await snapshot(page)).territory?.purification?.nodeId).toBe('front-north');
      const accepted = await snapshot(page); expect(accepted.tool).toBe(2);
      await expect(page.locator('#territory-objective')).toHaveText(`${realPauseReason(accepted) ? '恢复' : '保护'}${north(accepted).name}净化`);
      expect(distance(accepted.battle!.lastAim, north(accepted))).toBeGreaterThan(230);
      expect(accepted.events.some(e => e.type === 'TERRITORY_PURIFICATION_STARTED' && e.data.nodeId === 'front-north')).toBe(true);
      await expect.poll(async () => (await snapshot(page)).shots, { timeout: 4_000 }).toBeGreaterThan(before.shots);
      expect((await snapshot(page)).tool).toBe(2);
      await finish(page, opened, { trail, aim, before, accepted, heldFireAfter: await snapshot(page) });
    } finally { await page.mouse.up(); await keys.release(); }
  });

  test('leaving the real 150 range pauses accepted progress and returning resumes or exposes the actual blocker', async ({ page }, info) => {
    const opened = await open(page, info), keys = new Keys(page), target = north(opened.initial);
    const trail = await navigate(page, target, 128, (x, y) => keys.move(x, y), () => keys.release());
    const aim = await farAim(page, await snapshot(page)); await page.keyboard.press('Digit1'); await page.keyboard.press('Digit3');
    await expect.poll(async () => (await snapshot(page)).territory?.purification?.nodeId).toBe('front-north');
    await expect.poll(async () => north(await snapshot(page)).purificationProgress).toBeGreaterThan(0);
    const started = await snapshot(page); expect(started.tool).toBe(1);
    const outside = [...trail].reverse().find(sample => distance(sample.player, target) > 195 && distance(sample.player, target) < 330)?.player;
    expect(outside, 'A real, previously walked outside point must exist').toBeDefined();
    const exitTrail = await navigate(page, outside!, 18, (x, y) => keys.move(x, y), () => keys.release());
    const paused = await snapshot(page); expect(distance(paused.player, target)).toBeGreaterThan(150); expect(north(paused).owner).toBe('infected');
    await expect(page.locator('#territory-objective')).toHaveText(`恢复${north(paused).name}净化`);
    const reason = await assertPauseCopy(page, paused); await page.waitForTimeout(180); const held = await snapshot(page);
    expect(north(held).purificationProgress).toBeCloseTo(north(paused).purificationProgress, 6);
    const returnTrail = await navigate(page, target, 128, (x, y) => keys.move(x, y), () => keys.release());
    const returned = await snapshot(page), actualBlocker = realPauseReason(returned);
    await expect(page.locator('#territory-objective')).toHaveText(`${actualBlocker ? '恢复' : '保护'}${north(returned).name}净化`);
    if (actualBlocker) {
      await assertPauseCopy(page, returned);
      // No skip: verify the actual blocker holds progress, then use real fire
      // to remove nearby invaders or fail with this observed cause attached.
      if (actualBlocker !== 'invader' && actualBlocker !== 'hurt') throw Error(`Natural return has unresolved ${actualBlocker}; progress cannot be called resumed`);
      const invader = returned.targets.find(t => t.hp > 0 && t.territoryTask?.kind === 'invade' && distance(t, target) <= 120)
        ?? returned.targets.filter(t => t.hp > 0 && t.role === 'virus').sort((a,b) => distance(a,returned.player)-distance(b,returned.player))[0];
      if (invader) { const screen = await page.evaluate(p => window.__viral.toScreen(p), invader); await page.mouse.move(screen.x, screen.y); }
      await page.mouse.down();
      try { await expect.poll(async () => north(await snapshot(page)).owner === 'healthy' || north(await snapshot(page)).purificationProgress > north(returned).purificationProgress, { timeout: 6_000 }).toBe(true); }
      finally { await page.mouse.up(); }
    } else await expect.poll(async () => north(await snapshot(page)).owner === 'healthy' || north(await snapshot(page)).purificationProgress > north(returned).purificationProgress).toBe(true);
    expect((await snapshot(page)).tool).toBe(1);
    await finish(page, opened, { trail, aim, started, exitTrail, paused, pausedReason: reason, held, returnTrail, returned, actualBlocker });
  });
});

class Fingers {
  private points = new Map<number, Vec>();
  constructor(private cdp: CDPSession) {}
  async down(id: number, p: Vec) { this.points.set(id, p); await this.send('touchStart', [...this.points]); }
  async move(id: number, p: Vec) { this.points.set(id, p); await this.send('touchMove', [...this.points]); }
  async up(id: number) { const p = this.points.get(id); this.points.delete(id); if (p) await this.send('touchEnd', [[id, p]]); }
  async release() { if (this.points.size) { this.points.clear(); await this.send('touchEnd', []); } }
  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, Vec][]) {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, point]) => ({ id, ...point, radiusX: 3, radiusY: 3, force: 1 })) });
  }
}
async function center(page: Page, selector: string) { const b = await page.locator(selector).boundingBox(); if (!b) throw Error(`Missing ${selector}`); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
test.describe('trusted Chrome touch dual-front clarity', () => {
  test.use({ hasTouch: true, viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  test('quick nearby garrison tap keeps the independent movement and primary attack fingers live', async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium' || info.project.name !== 'chrome', 'Trusted CDP touch is Chrome-only Windows emulation.');
    const opened = await open(page, info, true), fingers = new Fingers(await page.context().newCDPSession(page));
    const move = await center(page, '[data-stick="move"]'), core = opened.initial.territory!.nodes.find(node => node.id === 'core')!;
    try {
      await fingers.down(1, move);
      const trail = await navigate(page, core, 90, (dx, dy) => { const length = Math.hypot(dx, dy) || 1;
        return fingers.move(1, { x: move.x + dx / length * 28, y: move.y + dy / length * 28 }); }, () => fingers.move(1, move));
      const attack = await center(page, '.mobile-attack'), garrison = await center(page, '[data-touch-skill="scan"]');
      await fingers.down(2, attack); await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(0);
      const before = await snapshot(page), aim = { ...before.battle!.lastAim };
      await fingers.move(1, { x: move.x + 18, y: move.y });
      await fingers.down(3, garrison); await fingers.up(3);
      await expect.poll(async () => (await snapshot(page)).events.filter(event => event.tick >= before.tick && event.type === 'IMMUNE_GUARD_ASSIGNED' && event.data.regionId === 'core').length).toBe(1);
      await fingers.move(1, move);
      await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(before.shots);
      const after = await snapshot(page); expect(after.tool).toBe(before.tool); expect(distance(after.battle!.lastAim, aim)).toBeLessThan(.1);
      expect(distance(after.player, before.player)).toBeGreaterThan(1); expect(after.growth!.beacons?.some(beacon => beacon.guard?.kind === 'territory' && beacon.guard.regionId === 'core')).toBe(true);
      await expect(page.locator('[data-touch-skill="scan"] .mobile-caption')).toHaveText('驻防');
      await expect(page.locator('#mobile-garrison-count')).toHaveText('1/2');
      await finish(page, opened, { trail, before, after, expectedGarrisonNode: 'core', independentPrimaryAim: aim });
    } finally { await fingers.release(); }
  });

  test('nearby cannon preview cancels without ammo loss and releases a real shell while retaining primary aim', async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium' || info.project.name !== 'chrome', 'Trusted CDP touch is Chrome-only Windows emulation.');
    const opened = await open(page, info, true), fingers = new Fingers(await page.context().newCDPSession(page));
    const move = await center(page, '[data-stick="move"]'), origin = { x: 1200, y: 600 };
    try {
      await expect(page.locator('[data-touch-action="interact"]')).toBeHidden();
      await fingers.down(1, move);
      const trail = await navigate(page, origin, 35, (dx, dy) => { const length = Math.hypot(dx, dy) || 1;
        return fingers.move(1, { x: move.x + dx / length * 28, y: move.y + dy / length * 28 }); }, () => fingers.move(1, move));
      await fingers.up(1);
      await expect(page.locator('[data-touch-action="interact"]')).toBeVisible();
      const attack = await center(page, '.mobile-attack'), cannon = await center(page, '[data-touch-action="interact"]');
      await fingers.down(2, attack); await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(0);
      const before = await snapshot(page), primaryAim = { ...before.battle!.lastAim }, previousSerial = before.territory!.cannon?.serial ?? 0;
      await fingers.down(3, cannon); await fingers.move(3, { x: cannon.x + 55, y: cannon.y - 15 });
      await expect(page.locator('#mobile-controls')).toHaveAttribute('data-skill', 'cannon');
      await expect(page.locator('#mobile-skill-preview')).toBeVisible();
      await fingers.move(3, await center(page, '[data-touch-cancel]'));
      await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'cancel'); await fingers.up(3);
      await expect(page.locator('#mobile-skill-preview')).toBeHidden();
      const canceled = await snapshot(page); expect(canceled.territory!.cannon?.serial ?? 0).toBe(previousSerial);
      expect(canceled.events.some(event => event.tick > before.tick && event.type === 'TERRITORY_CANNON_FIRED')).toBe(false);
      await fingers.down(3, cannon); await fingers.move(3, { x: cannon.x + 55, y: cannon.y - 15 });
      await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'preview');
      const preview = await page.evaluate(() => (window.__viral.diagnostics() as unknown as { touch: { preview: { kind: string; aim: Vec } } }).touch.preview);
      expect(preview.kind).toBe('cannon'); await fingers.up(3);
      await expect.poll(async () => (await snapshot(page)).territory!.cannon?.serial ?? 0).toBe(previousSerial + 1);
      const after = await snapshot(page); expect(distance(after.battle!.lastAim, primaryAim)).toBeLessThan(.1);
      expect(after.shots).toBeGreaterThan(before.shots); expect(after.tool).toBe(before.tool);
      expect(after.territory!.cannon!.readyAt).toBeGreaterThan(after.elapsed);
      await expect(page.locator('[data-touch-action="interact"]')).toHaveAttribute('data-cooling', 'true');
      await finish(page, opened, { trail, before, canceled, preview, after, independentPrimaryAim: primaryAim });
    } finally { await fingers.release(); }
  });

  test('real joystick and primary attack remain live while a third finger taps 3 without a skill preview', async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium' || info.project.name !== 'chrome', 'Trusted CDP touch is Chrome-only Windows emulation; Edge and physical phones are not claimed.');
    const opened = await open(page, info, true), fingers = new Fingers(await page.context().newCDPSession(page));
    const move = await center(page, '[data-stick="move"]'), attack = await center(page, '.mobile-attack'), action = await center(page, '[data-touch-skill="3"]');
    const trusted: { type: string; trusted: boolean; kind: string; control: string }[] = [];
    await page.exposeFunction('__dualfrontPointerReceipt', (receipt: typeof trusted[number]) => trusted.push(receipt));
    await page.evaluate(() => { for (const type of ['pointerdown', 'pointerup']) window.addEventListener(type, event => {
      const e = event as PointerEvent, target = e.target instanceof Element ? e.target.closest('[data-stick],[data-touch-skill]') : null;
      if (target) void (window as unknown as { __dualfrontPointerReceipt(value: unknown): Promise<void> }).__dualfrontPointerReceipt({ type, trusted: e.isTrusted, kind: e.pointerType, control: target.getAttribute('data-stick') ?? target.getAttribute('data-touch-skill') ?? '' });
    }, true); });
    try {
      await fingers.down(1, move);
      const trail = await navigate(page, north(opened.initial), 128, (dx, dy) => { const length = Math.hypot(dx, dy) || 1;
        return fingers.move(1, { x: move.x + dx / length * 28, y: move.y + dy / length * 28 }); },
      () => fingers.move(1, move));
      await fingers.down(2, attack); await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(0);
      const before = await snapshot(page), toward = north(before), gap = distance(before.player, toward) || 1;
      await fingers.move(1, { x: move.x + (toward.x - before.player.x) / gap * 28, y: move.y + (toward.y - before.player.y) / gap * 28 });
      await fingers.down(3, action);
      await expect.poll(async () => (await snapshot(page)).territory?.purification?.nodeId).toBe('front-north');
      const started = await snapshot(page); expect(started.tool).toBe(before.tool); expect(started.player.moving).toBe(true);
      await expect(page.locator('#territory-objective')).toHaveText(`${realPauseReason(started) ? '恢复' : '保护'}${north(started).name}净化`);
      await fingers.move(1, move);
      await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'idle'); await expect(page.locator('#mobile-skill-preview')).toBeHidden();
      await fingers.up(3);
      await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(started.shots);
      const x = started.player.x, y = started.player.y; await fingers.move(1, { x: move.x + 28, y: move.y });
      await expect.poll(async () => distance((await snapshot(page)).player, { x, y })).toBeGreaterThan(5);
      await fingers.up(2); await fingers.up(1); await page.waitForTimeout(100);
      for (const control of ['move', 'attack', '3']) for (const type of ['pointerdown', 'pointerup'])
        expect(trusted.some(e => e.control === control && e.type === type && e.trusted && e.kind === 'touch'), `${control}/${type} browser-trusted receipt`).toBe(true);
      expect((await snapshot(page)).tool).toBe(before.tool);
      await finish(page, opened, { trail, before, started, trusted });
    } finally { await fingers.release(); }
  });
});
