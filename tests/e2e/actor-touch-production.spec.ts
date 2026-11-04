import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameState, Vec } from '../../src/game/types';
import type { TouchPresentation } from '../../src/input/controller';

const selectedEntry = resolve(process.env.VI_ENTRY ?? 'dist/index.html');
const entry = new URL(pathToFileURL(extname(selectedEntry) ? selectedEntry : join(selectedEntry, 'index.html')).href);
entry.searchParams.set('seed', '71');
const moveControl = '[data-stick="move"]', attackControl = '.mobile-attack[data-stick="attack"]';
const scanControl = '[data-touch-skill="scan"]';
type Box = { left: number; top: number; right: number; bottom: number };
interface ActorAsset {
  atlas: string; frame: string; width: number; height: number; source: string; sourceSha256: string;
  visibleBounds: { x: number; y: number; width: number; height: number };
  sourceBounds: { x: number; y: number; width: number; height: number };
  actorRegistration?: { foot: Vec; grip?: Vec; muzzle?: Vec };
  sourceMuzzle?: Vec; animation?: { approved: boolean };
}
interface NativeSprite {
  id: string; texture: string; frame: string; x: number; y: number; width: number; height: number;
  originX: number; originY: number; flipX: boolean; flipY: boolean; rotation: number; visible: boolean; articulated: boolean;
}
interface ActorFrame {
  actorId: string; semanticId: string; frame: string; clip: string; direction: string; native: boolean; visible: boolean;
  groupReady: boolean; fallback: boolean; source: { path: string; sha256: string }; screenFoot: Vec; bodyBounds: Box;
}
interface ActorContract {
  version: number; ready: boolean; preview: boolean; animationPreview: boolean; oldSourceIds: string[]; unexpectedActorIds: string[];
}
interface Diagnostics {
  art: { signature: string; actorFrames: ActorFrame[]; actorContract: ActorContract };
  phaser: { ready: boolean; nativeSprites: NativeSprite[] }; touch?: TouchPresentation;
}
interface Observation {
  tick: number; elapsed: number; phase: GameState['phase']; moving: boolean; player: Vec;
  signature: string; contract: ActorContract; actors: ActorFrame[]; sprites: NativeSprite[];
  projection: { origin: Vec; unitX: Vec; unitY: Vec }; touch?: TouchPresentation;
}
interface PointerReceipt { type: string; trusted: boolean; pointerType: string; id: number; control: string }
type Runtime = { inputSignature: string; assets: Record<string, ActorAsset> };
const state = (page: Page): Promise<GameState> => page.evaluate(() => window.__viral.snapshot());

/** Only the harness observation buffer is written; production state stays read-only. */
async function observe(page: Page, durationMs = 0): Promise<Observation[]> {
  return page.evaluate(durationMs => new Promise<Observation[]>(resolve => {
    const samples: Observation[] = [], started = performance.now();
    const capture = (now: number) => {
      const s = window.__viral.snapshot(), d = window.__viral.diagnostics() as unknown as Diagnostics;
      const ids = ['player', 'player:tool', 'menu:hero', 'menu:tool'];
      samples.push({ tick: s.tick, elapsed: s.elapsed, phase: s.phase, moving: s.player.moving, player: { x: s.player.x, y: s.player.y },
        signature: d.art.signature, contract: d.art.actorContract, actors: d.art.actorFrames.filter(actor => ids.includes(actor.actorId)),
        sprites: d.phaser.nativeSprites.filter(sprite => ids.includes(sprite.id)), touch: d.touch,
        projection: { origin: window.__viral.toScreen({ x: 0, y: 0 }), unitX: window.__viral.toScreen({ x: 1, y: 0 }), unitY: window.__viral.toScreen({ x: 0, y: 1 }) } });
      if (now - started >= durationMs) resolve(samples); else requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
  }), durationMs);
}
const one = async (page: Page) => (await observe(page))[0];
const scaleOf = (sample: Observation) => sample.projection.unitX.x - sample.projection.origin.x;
function atlasPoint(asset: ActorAsset, sprite: NativeSprite, point: Vec): Vec {
  const dx = ((sprite.flipX ? asset.width - point.x : point.x) / asset.width - sprite.originX) * sprite.width;
  const dy = ((sprite.flipY ? asset.height - point.y : point.y) / asset.height - sprite.originY) * sprite.height;
  const cos = Math.cos(sprite.rotation), sin = Math.sin(sprite.rotation);
  return { x: sprite.x + dx * cos - dy * sin, y: sprite.y + dx * sin + dy * cos };
}
function sourcePoint(asset: ActorAsset, sprite: NativeSprite, point: Vec): Vec {
  const b = asset.sourceBounds, v = asset.visibleBounds;
  return atlasPoint(asset, sprite, { x: v.x + (point.x - b.x) * v.width / b.width, y: v.y + (point.y - b.y) * v.height / b.height });
}
const union = (boxes: Box[]): Box => ({ left: Math.min(...boxes.map(box => box.left)), top: Math.min(...boxes.map(box => box.top)),
  right: Math.max(...boxes.map(box => box.right)), bottom: Math.max(...boxes.map(box => box.bottom)) });
function alphaEnvelope(asset: ActorAsset, sprite: NativeSprite): Box {
  const v = asset.visibleBounds, corners = [v.x, v.x + v.width].flatMap(x => [v.y, v.y + v.height].map(y => atlasPoint(asset, sprite, { x, y })));
  return { left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)),
    top: Math.min(...corners.map(point => point.y)), bottom: Math.max(...corners.map(point => point.y)) };
}
/** Reverse-check actual texture/frame and transform the atlas alpha and source
 * landmarks independently; no fixed old hero height or renderer layout helper. */
function nativeProof(sample: Observation, runtime: Runtime, menu = false) {
  expect(sample.signature).toBe(runtime.inputSignature);
  expect(sample.contract).toMatchObject({ version: 2, ready: true, preview: false, animationPreview: false, oldSourceIds: [], unexpectedActorIds: [] });
  const ids = menu ? ['menu:hero', 'menu:tool'] : ['player', 'player:tool'];
  const parts = ids.map(id => {
    const actor = sample.actors.find(actor => actor.actorId === id), sprite = sample.sprites.find(sprite => sprite.id === id && sprite.visible);
    expect(actor, `Actual ${id} actor record`).toBeDefined(); expect(sprite, `Actual ${id} native sprite`).toBeDefined();
    expect(actor!).toMatchObject({ native: true, visible: true, groupReady: true, fallback: false });
    const asset = runtime.assets[actor!.semanticId]; expect(asset).toBeDefined();
    expect(asset.animation?.approved).toBe(true); expect(sprite!.texture).toBe(asset.atlas); expect(sprite!.frame).toBe(asset.frame);
    // v0.13 plants the authored walk's lower leg with a local mesh; the same
    // approved atlas frame, palm, weapon grip and world foot stay registered.
    expect(sprite!.articulated).toBe(!menu && id === 'player' && actor!.clip === 'walk'); expect(actor!.frame).toBe(actor!.semanticId);
    expect(actor!.source).toMatchObject({ path: asset.source, sha256: asset.sourceSha256 });
    expect(asset.source.replaceAll('\\', '/')).toMatch(/^ViralInvasion_Fantasy_Actors_v2\//);
    expect(asset.actorRegistration?.grip).toBeDefined();
    const alpha = alphaEnvelope(asset, sprite!), scale = scaleOf(sample), origin = sample.projection.origin;
    const body = actor!.bodyBounds;
    expect(body, `Registered ${id} body/tool envelope`).toBeDefined();
    const registered = { left: origin.x + body.left * scale, right: origin.x + body.right * scale,
      top: origin.y + body.top * scale, bottom: origin.y + body.bottom * scale };
    return { id, actor: actor!, sprite: sprite!, asset, alpha, registered };
  });
  expect(parts[0].actor.semanticId).toMatch(/^fantasy\.actor\.hero\.(front_right|back_right)\.(idle|walk|hurt|dash)\.\d{2}$/);
  expect(parts[1].actor.semanticId).toBe('fantasy.actor.weapon.emitter');
  if (menu) expect(parts[0].actor.semanticId).toMatch(/^fantasy\.actor\.hero\.front_right\.idle\.\d{2}$/);
  const hand = sourcePoint(parts[0].asset, parts[0].sprite, parts[0].asset.actorRegistration!.grip!);
  const grip = sourcePoint(parts[1].asset, parts[1].sprite, parts[1].asset.actorRegistration!.grip!);
  expect(Math.hypot(hand.x - grip.x, hand.y - grip.y), 'Actual native palm and independent tool grip').toBeLessThanOrEqual(1);
  const foot = sourcePoint(parts[0].asset, parts[0].sprite, parts[0].asset.actorRegistration!.foot);
  expect(Math.hypot(foot.x - parts[0].actor.screenFoot.x, foot.y - parts[0].actor.screenFoot.y)).toBeLessThanOrEqual(1);
  return { parts, alpha: union(parts.map(part => part.alpha)), envelope: union(parts.flatMap(part => [part.alpha, part.registered])), hand, grip, foot };
}
async function center(page: Page, selector: string, dx = 0, dy = 0): Promise<Vec> {
  const box = await page.locator(selector).boundingBox(); if (!box) throw Error(`Missing control ${selector}`);
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
}
class Fingers {
  private readonly points = new Map<number, Vec>();
  constructor(private readonly cdp: CDPSession) {}
  async down(id: number, point: Vec) { this.points.set(id, point); await this.send('touchStart', [...this.points]); }
  async move(id: number, point: Vec) { if (!this.points.has(id)) throw Error(`Finger ${id} is not held`); this.points.set(id, point); await this.send('touchMove', [...this.points]); }
  async up(id: number) {
    const point = this.points.get(id); this.points.delete(id);
    // Chromium's nonempty touchEnd identifies the released contact, not those remaining.
    if (point) await this.send('touchEnd', [[id, point]]);
  }
  async release() {
    if (!this.points.size) return;
    this.points.clear(); await this.send('touchEnd', []);
  }
  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, Vec][]) {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, point]) => ({ id, ...point, radiusX: 2, radiusY: 2, force: 1 })) });
  }
}
async function pointerAudit(page: Page) {
  await page.evaluate(() => {
    const harness = window as Window & { __actorTouchAudit?: PointerReceipt[] }; harness.__actorTouchAudit = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(type, event => {
      const pointer = event as PointerEvent, control = pointer.target instanceof Element ? pointer.target.closest('[data-stick],[data-touch-skill]') : null;
      if (!control) return;
      harness.__actorTouchAudit!.push({ type, trusted: pointer.isTrusted, pointerType: pointer.pointerType, id: pointer.pointerId,
        control: control.getAttribute('data-stick') ?? control.getAttribute('data-touch-skill') ?? '' });
      if (harness.__actorTouchAudit!.length > 256) harness.__actorTouchAudit!.shift();
    }, true);
  });
}
async function inputEvidence(page: Page, info: TestInfo, required: string[]) {
  const receipts = await page.evaluate(() => (window as Window & { __actorTouchAudit?: PointerReceipt[] }).__actorTouchAudit ?? []);
  for (const control of required) for (const type of ['pointerdown', 'pointerup'])
    expect(receipts.some(receipt => receipt.control === control && receipt.type === type && receipt.trusted && receipt.pointerType === 'touch'), `${control} ${type} must be browser-trusted touch`).toBe(true);
  await info.attach('trusted-touch-input', { body: JSON.stringify({ method: 'Chrome CDP trusted touch contacts; desktop emulation, not physical-phone evidence', receipts }, null, 2), contentType: 'application/json' });
  return receipts;
}
async function openTerritory(page: Page, info: TestInfo) {
  await page.context().setOffline(true);
  const errors: string[] = [], remote: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  const runtime = JSON.parse(readFileSync(resolve('.art-generated/art-runtime.json'), 'utf8')) as Runtime;
  await page.goto(entry.href);
  await expect.poll(() => page.evaluate(() => window.__viral?.version)).toBe('0.13.0-garrison');
  await page.waitForFunction(() => (window.__viral?.diagnostics() as unknown as Diagnostics)?.phaser?.ready === true);
  await expect.poll(async () => (await one(page)).contract.ready, { message: 'Formal new actor groups must be ready; no preview/fallback acceptance' }).toBe(true);
  const menu = await one(page); expect(menu.phase).toBe('menu'); const menuProof = nativeProof(menu, runtime, true);
  await page.screenshot({ path: info.outputPath('new-menu-with-native-tool.png') });
  await pointerAudit(page); await page.locator('[data-action="endless-start"]').tap();
  await expect.poll(async () => (await state(page)).phase).toBe('playing');
  await expect(page.locator('#mobile-controls')).toHaveAttribute('data-active', 'true');
  const initial = await state(page); expect(initial.territory?.stage).toBe('rescue'); expect(initial.campaign).toBeUndefined();
  expect(initial.world).toMatchObject({ width: 2400, height: 1500 });
  await expect.poll(async () => scaleOf(await one(page))).toBeCloseTo(.62, 4);
  return { runtime, errors, remote, menu, menuProof };
}
async function advance(page: Page, elapsed: number, seconds: number) {
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThanOrEqual(elapsed + seconds);
}
test.use({ hasTouch: true, viewport: { width: 667, height: 320 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test.beforeEach(async ({ browserName }, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'chrome', 'This focused production receipt targets Chrome CDP; it makes no Edge/WebKit or physical-phone claim.');
});

test('new menu and native walk frames survive two independently released touch contacts', async ({ page }, info) => {
  const run = await openTerritory(page, info), fingers = new Fingers(await page.context().newCDPSession(page));
  try {
    const initial = await state(page), move = await center(page, moveControl), attack = await center(page, attackControl);
    await fingers.down(1, move); await fingers.move(1, { x: move.x + 28, y: move.y }); await fingers.down(2, attack);
    await expect.poll(async () => (await state(page)).shots).toBeGreaterThan(initial.shots);
    await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(initial.player.x + 5);
    const walking = await observe(page, 650), frames = new Map<string, Set<string>>();
    for (const sample of walking.filter(sample => sample.phase === 'playing' && sample.moving)) {
      const proof = nativeProof(sample, run.runtime), body = proof.parts[0];
      if (body.actor.clip === 'hurt') continue;
      expect(body.actor.clip).toBe('walk');
      const decoded = body.actor.semanticId.match(/^fantasy\.actor\.hero\.(front_right|back_right)\.walk\.(\d{2})$/); expect(decoded).not.toBeNull();
      const indices = frames.get(decoded![1]) ?? new Set<string>(); indices.add(decoded![2]); frames.set(decoded![1], indices);
    }
    expect([...frames.values()].some(indices => indices.size >= 2), 'At least two real walk indices in one authored direction must dispatch during trusted touch movement').toBe(true);
    await fingers.up(2); await page.waitForTimeout(60); const attackReleased = await state(page); await advance(page, attackReleased.elapsed, .2);
    const stillMoving = await state(page); expect(stillMoving.player.x).toBeGreaterThan(attackReleased.player.x + 5); expect(stillMoving.shots).toBe(attackReleased.shots);
    await fingers.down(2, attack); await fingers.move(2, { x: attack.x - 22, y: attack.y - 10 });
    await expect.poll(async () => (await state(page)).shots).toBeGreaterThan(stillMoving.shots);
    await fingers.up(1); await page.waitForTimeout(60); const moveReleased = await state(page); await advance(page, moveReleased.elapsed, .25);
    const stillFiring = await state(page); expect(stillFiring.player.x).toBeCloseTo(moveReleased.player.x, 4); expect(stillFiring.player.y).toBeCloseTo(moveReleased.player.y, 4);
    expect(stillFiring.shots).toBeGreaterThan(moveReleased.shots);
    await fingers.up(2); await page.waitForTimeout(60); const released = await state(page); await advance(page, released.elapsed, .2);
    const clean = await state(page); expect(clean.shots).toBe(released.shots); expect(clean.player.moving).toBe(false);
    nativeProof(await one(page), run.runtime);
    const receipts = await inputEvidence(page, info, ['move', 'attack']);
    expect(new Set(receipts.filter(receipt => receipt.type === 'pointerdown' && ['move', 'attack'].includes(receipt.control)).map(receipt => receipt.id)).size).toBeGreaterThanOrEqual(2);
    await info.attach('new-native-walk-and-release-evidence', { body: JSON.stringify({ entry: entry.href, menu: run.menu, menuProof: run.menuProof,
      samples: walking, actualWalkIndices: Object.fromEntries([...frames].map(([key, indices]) => [key, [...indices]])), initial, attackReleased, stillMoving, moveReleased, stillFiring, released, clean }, null, 2), contentType: 'application/json' });
    expect(run.errors).toEqual([]); expect(run.remote).toEqual([]);
  } finally { await fingers.release(); }
});

const contains = (outer: Box, inner: Box, tolerance = 1) => inner.left >= outer.left - tolerance && inner.top >= outer.top - tolerance
  && inner.right <= outer.right + tolerance && inner.bottom <= outer.bottom + tolerance;
const intersects = (a: Box, b: Box) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
async function safeSpace(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element): Box => { const box = element.getBoundingClientRect(); return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }; };
    const visible = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].filter(element => {
      const box = element.getBoundingClientRect(), style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    });
    const move = rect(document.querySelector('[data-stick="move"]')!), dash = rect(document.querySelector('[data-touch-action="dash"]')!);
    const headers = visible('.mobile-readouts,.mobile-map,.mobile-top-actions,.mobile-notice,.mobile-warning-strip,#territory-hud');
    const safe = { left: move.right + 12, right: dash.left - 10, top: Math.max(80, ...headers.map(element => rect(element).bottom + 8)), bottom: move.bottom - 10 };
    const blocks = visible('.mobile-stick,.mobile-skill,.mobile-aux,.mobile-top-actions button,.mobile-map,.mobile-readouts,.mobile-objective,.mobile-warning-strip,.mobile-notice,#territory-hud,[data-touch-cancel],[data-touch-guide]').map(rect);
    const target = visible('.mobile-preview-target')[0], label = visible('.mobile-preview-label')[0];
    return { safe, blocks, screen: { left: 0, top: 0, right: innerWidth, bottom: innerHeight }, target: target ? rect(target) : null, label: label ? rect(label) : null };
  });
}
const consumption = (s: GameState) => ({ tool: s.tool, shots: s.shots, scans: s.scans, cooldowns: s.cooldowns, scanReady: s.scanReady, charges: s.growth?.antibodyCharges });

for (const viewport of [{ width: 667, height: 320 }, { width: 844, height: 390 }]) {
  test(`vertical 650 scan previews fit actual new native body/tool bounds and cancel cleanly at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const run = await openTerritory(page, info), fingers = new Fingers(await page.context().newCDPSession(page)), observations: unknown[] = [];
    try {
      const baseline = await one(page); nativeProof(baseline, run.runtime);
      for (const direction of [-1, 1]) {
        const before = await state(page), origin = await center(page, scanControl);
        const radius = await page.locator(scanControl).evaluate(element => Number((element as HTMLElement).dataset.aimRadius) || 64);
        await fingers.down(1, origin); await fingers.move(1, { x: origin.x, y: origin.y + direction * radius });
        await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'preview');
        await expect(page.locator('#mobile-skill-preview')).toBeVisible();
        await expect.poll(async () => {
          const sample = await one(page), preview = sample.touch?.preview;
          return preview?.kind === 'scan' && preview.range === 650 && !preview.cancelled
            && Math.abs(preview.aim.x - sample.player.x) < .02 && Math.abs(preview.aim.y - sample.player.y - direction * 650) < .5;
        }).toBe(true);
        await expect.poll(async () => {
          const sample = await one(page), proof = nativeProof(sample, run.runtime), space = await safeSpace(page);
          return !!space.target && !!space.label && contains(space.safe, proof.envelope) && contains(space.safe, space.target)
            && contains(space.screen, space.label) && !intersects(space.label, space.target)
            && space.blocks.every(block => !intersects(proof.envelope, block) && !intersects(space.target!, block) && !intersects(space.label!, block));
        }, { message: 'Actual alpha and registered body + independent tool, 650 reticle and label must clear visible touch HUD/controls' }).toBe(true);
        const preview = await one(page), proof = nativeProof(preview, run.runtime), space = await safeSpace(page);
        expect(scaleOf(preview)).toBeLessThan(scaleOf(baseline)); expect(consumption(await state(page))).toEqual(consumption(before));
        await page.screenshot({ path: info.outputPath(`native-scan-650-${direction < 0 ? 'above' : 'below'}.png`) });
        await fingers.move(1, await center(page, '[data-touch-cancel]'));
        await expect(page.locator('#mobile-controls')).toHaveAttribute('data-gesture', 'cancel');
        expect((await one(page)).touch?.preview?.cancelled).toBe(true); await fingers.up(1);
        await expect(page.locator('#mobile-skill-preview')).toBeHidden();
        await expect.poll(async () => {
          const restored = await one(page);
          return !restored.touch?.preview && Math.abs(scaleOf(restored) - .62) < .0001
            && Math.hypot(restored.projection.origin.x - baseline.projection.origin.x, restored.projection.origin.y - baseline.projection.origin.y) <= .75;
        }).toBe(true);
        const after = await state(page); expect(consumption(after)).toEqual(consumption(before));
        expect(after.events.filter(event => event.tick > before.tick && ['TOOL_FIRED', 'TOOL_SELECTED', 'SCAN_COMPLETED', 'TRACTION_STARTED', 'PLAYER_CHARGE_RELEASED'].includes(event.type))).toEqual([]);
        const restored = await one(page); nativeProof(restored, run.runtime);
        observations.push({ direction, before: consumption(before), after: consumption(after), preview, proof, space, restored });
      }
      await inputEvidence(page, info, ['scan']);
      await info.attach('actual-native-preview-camera-evidence', { body: JSON.stringify({ scope: 'Public territory entry, real trusted CDP touch, read-only snapshots/diagnostics; no supplied states, camera overrides or old fixed actor-height constants. Desktop emulation is not physical-phone validation.',
        entry: entry.href, viewport, baseline, observations }, null, 2), contentType: 'application/json' });
      expect(run.errors).toEqual([]); expect(run.remote).toEqual([]);
    } finally { await fingers.release(); }
  });
}
