import { test, expect, type BrowserContext, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import type { GameState, Vec } from '../../src/game/types';
import { CampProfileStore, CAMP_PROFILE_STORAGE_KEY, emptyCampProfile, parseCampProfile } from '../../src/meta/campProfile';
import { createBossLoot } from '../../src/game/expedition';

// Historical filename retained; the production contract is now the actual GLB,
// not the superseded four-view PNG frames.
test.use({ video: 'off', trace: 'off' });
const servedEntry = process.env.VI_ENTRY_URL;
const entry = servedEntry ? new URL(servedEntry) : new URL(pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href);
if (servedEntry && !/^https?:$/.test(entry.protocol)) throw new Error('VI_ENTRY_URL must be an HTTP(S) entry URL.');
entry.searchParams.set('scenario', 'training'); entry.searchParams.set('seed', '71');
const served = !!servedEntry, transportName = served ? 'served' : 'offline';
const transport = { protocol: entry.protocol, kind: served ? 'same-origin-http' : 'file', offline: !served,
  allowedOrigin: served ? entry.origin : null, entry: entry.href };
const modelHash = '048ab89b2d724282fa8e36547e208b684c3df53c41558f3f53b58274c35feb5d';
const weaponManifest = JSON.parse(readFileSync(resolve('asserts/ViralInvasion_Weapons3D_v1/manifest.json'), 'utf8')) as {
  models: Record<'steady' | 'piercing', { sha256: string; triangles: number; meshCount: number }>;
};
const expectedClips = ['Bow Pull Back', 'Bow Pull Hold', 'Bow Release', 'Dodge_back', 'Dodge_left', 'Dodge_right',
  'Hit_Chest', 'Idle_A', 'Idle_Subtle', 'Jog', 'Pistol_Idle', 'Pistol_Shoot', 'Sprint', 'Strafe_left', 'Strafe_right', 'Walk', 'Walk_Backwards'];
interface WeaponFrame {
  id: 'steady' | 'piercing'; grip: Vec; muzzle: Vec; forward: Vec;
  bounds: { left: number; right: number; top: number; bottom: number };
}
interface Weapon3D extends WeaponFrame {
  assetSha256: string | null; expectedSha256: string; parentBone: string; triangles: number; meshes: number;
  handWorldQuaternion: number[]; weaponWorldQuaternion: number[]; socketLocalQuaternion: number[];
  drawAmount: number; stringCenter?: number[] | null; rightHandGap?: number | null;
}
interface HeroFrame {
  bodyFacing: number; bodyYaw: number; paused: boolean; poseTime: number; locomotionWeights: Record<string, number>;
  upperClip?: string; fullBodyClip?: string; upperWeights: Record<string, number>; hurtWeight: number;
  width: number; height: number; foot: Vec; grip: Vec; leftGrip: Vec;
  bounds: { left: number; right: number; top: number; bottom: number };
  weapon?: WeaponFrame;
}
interface Hero3D {
  enabled: boolean; ready: boolean; error?: string; threeVersion: string; expectedSha256: string; sha256: string | null; hashVerified: boolean | null;
  jointCount: number; clipNames: string[]; triangles: number; meshCount: number; skinnedMeshCount: number;
  textureSizes: { width: number; height: number }[]; drawCount: number; frame: HeroFrame | null; canvas: { width: number; height: number };
  weapon3D?: Weapon3D | null;
}
interface Raster { id: string; width: number; height: number; displayWidth: number; displayHeight: number; x: number; y: number; depth: number; visible: boolean }
interface Diagnostics {
  art: { player3D: Hero3D; actorFrames?: { actorId: string; native?: boolean; visible?: boolean }[];
    actorContract: { heroRepresentation: string }; heroAnimation: { representation: string };
    weapon: { weaponId?: string; requestedAssetId?: string; assetId: string | null; mode: string; gripSource: string } };
  phaser: { ready: boolean; widthCSS: number; heightCSS: number; rasterDimensions: Raster[];
    nativeSprites: { id: string; visible: boolean; x: number; y: number; width: number; height: number; depth: number; frame: string }[] };
  campTrial?: { loadout: { weaponId: string }; shots: number; hits: number; totalDamage: number } | null;
}
interface Sample {
  phase: GameState['phase']; tick: number; elapsed: number; player: GameState['player']; shots: number; dashes: number;
  hero: Hero3D; layer?: Raster; legacyBodies: string[]; legacyActors: string[]; legacyTools: string[]; rulesUnchanged: boolean;
  preparation: { castId: string; firesAt: number } | null;
}
interface Trace { samples: Sample[]; done: boolean }
const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const state = (page: Page): Promise<GameState> => page.evaluate(() => window.__viral.snapshot());
async function read(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const s = window.__viral.snapshot(), d = window.__viral.diagnostics() as unknown as Diagnostics;
    return { phase: s.phase, tick: s.tick, elapsed: s.elapsed, player: s.player, shots: s.shots, dashes: s.dashes,
      hero: d.art.player3D, layer: d.phaser.rasterDimensions.find(layer => layer.id === 'player3d'),
      legacyBodies: d.phaser.nativeSprites.filter(sprite => sprite.id === 'player' && sprite.visible).map(sprite => sprite.id),
      legacyActors: (d.art.actorFrames ?? []).filter(actor => actor.actorId === 'player' && actor.native && actor.visible !== false).map(actor => actor.actorId),
      legacyTools: d.phaser.nativeSprites.filter(sprite => sprite.id === 'player:tool' && sprite.visible).map(sprite => sprite.id),
      preparation: s.weaponCombat?.preparation ? { castId: s.weaponCombat.preparation.castId, firesAt: s.weaponCombat.preparation.firesAt } : null,
      rulesUnchanged: JSON.stringify(s) === JSON.stringify(window.__viral.snapshot()) };
  });
}
async function startTrace(page: Page, durationMs: number): Promise<void> {
  await page.evaluate(durationMs => {
    // Only harness storage is written; production state and inputs stay read-only.
    const trace: Trace = { samples: [], done: false }, started = performance.now();
    (window as unknown as { __hero3DProductionTrace: Trace }).__hero3DProductionTrace = trace;
    const capture = (now: number) => {
      const s = window.__viral.snapshot(), d = window.__viral.diagnostics() as unknown as Diagnostics;
      trace.samples.push({ phase: s.phase, tick: s.tick, elapsed: s.elapsed, player: s.player, shots: s.shots, dashes: s.dashes,
        hero: structuredClone(d.art.player3D), layer: structuredClone(d.phaser.rasterDimensions.find(layer => layer.id === 'player3d')),
        legacyBodies: d.phaser.nativeSprites.filter(sprite => sprite.id === 'player' && sprite.visible).map(sprite => sprite.id),
        legacyActors: (d.art.actorFrames ?? []).filter(actor => actor.actorId === 'player' && actor.native && actor.visible !== false).map(actor => actor.actorId),
        legacyTools: d.phaser.nativeSprites.filter(sprite => sprite.id === 'player:tool' && sprite.visible).map(sprite => sprite.id),
        preparation: s.weaponCombat?.preparation ? { castId: s.weaponCombat.preparation.castId, firesAt: s.weaponCombat.preparation.firesAt } : null,
        rulesUnchanged: JSON.stringify(s) === JSON.stringify(window.__viral.snapshot()) });
      if (now - started < durationMs) requestAnimationFrame(capture); else trace.done = true;
    };
    requestAnimationFrame(capture);
  }, durationMs);
}
async function finishTrace(page: Page): Promise<Sample[]> {
  await page.waitForFunction(() => (window as unknown as { __hero3DProductionTrace?: Trace }).__hero3DProductionTrace?.done === true);
  return page.evaluate(() => (window as unknown as { __hero3DProductionTrace: Trace }).__hero3DProductionTrace.samples);
}
function displayed(sample: Sample): void {
  expect(sample.rulesUnchanged, 'Presentation diagnostics must not mutate rules').toBe(true);
  expect(sample.hero).toMatchObject({ enabled: true, ready: true, jointCount: 53, meshCount: 1, skinnedMeshCount: 1, triangles: 19998 });
  expect(sample.hero.error).toBeFalsy(); expect(sample.hero.expectedSha256).toBe(modelHash);
  expect([...sample.hero.clipNames].sort()).toEqual([...expectedClips].sort());
  expect(sample.hero.textureSizes).toEqual([{ width: 2048, height: 2048 }]); expect(sample.hero.drawCount).toBeGreaterThan(0);
  expect(sample.layer, 'The actual Three canvas must enter the Phaser display list').toBeDefined(); expect(sample.layer!.visible).toBe(true);
  for (const value of [sample.layer!.width, sample.layer!.height, sample.layer!.displayWidth, sample.layer!.displayHeight]) {
    expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThan(0);
  }
  expect(sample.legacyBodies, 'No old PNG body behind the GLB').toEqual([]);
  expect(sample.legacyActors, 'Do not label a superseded PNG as the displayed player').toEqual([]);
  expect(sample.hero.frame).not.toBeNull();
  const f = sample.hero.frame!;
  for (const value of [f.poseTime, f.bodyYaw, f.bodyFacing, f.bounds.left, f.bounds.right, f.bounds.top, f.bounds.bottom]) expect(Number.isFinite(value)).toBe(true);
  expect(f.bounds.right).toBeGreaterThan(f.bounds.left); expect(f.bounds.bottom).toBeGreaterThan(f.bounds.top);
  if (f.weapon) {
    expect(sample.legacyTools, 'A held 3D weapon must not have a second PNG weapon in front of it').toEqual([]);
    attachedWeapon(sample.hero, f.weapon.id);
  }
}
function multiplyQuaternion(a: number[], b: number[]): number[] {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
}
function quaternionGap(a: number[], b: number[]): number {
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return 2 * Math.acos(Math.min(1, Math.abs(a.reduce((sum, value, index) => sum + value * b[index], 0)) / norm));
}
function attachedWeapon(hero: Hero3D, id: 'steady' | 'piercing'): Weapon3D {
  const weapon = hero.weapon3D, frame = hero.frame?.weapon;
  expect(weapon, 'The actual GLB weapon must be represented by the renderer').toBeTruthy(); expect(frame).toBeTruthy();
  expect(weapon!).toMatchObject({ id, expectedSha256: weaponManifest.models[id].sha256,
    parentBone: id === 'steady' ? 'mixamorigRightHand' : 'mixamorigLeftHand', triangles: weaponManifest.models[id].triangles,
    meshes: weaponManifest.models[id].meshCount });
  if (weapon!.assetSha256 !== null) expect(weapon!.assetSha256).toBe(weaponManifest.models[id].sha256);
  expect(frame!.id).toBe(id);
  for (const point of [weapon!.grip, weapon!.muzzle, weapon!.forward, frame!.grip, frame!.muzzle, frame!.forward]) {
    expect(Number.isFinite(point.x)).toBe(true); expect(Number.isFinite(point.y)).toBe(true);
  }
  expect(Math.hypot(frame!.muzzle.x - frame!.grip.x, frame!.muzzle.y - frame!.grip.y)).toBeGreaterThan(1);
  expect(Math.hypot(frame!.forward.x, frame!.forward.y)).toBeGreaterThan(1e-5);
  for (const q of [weapon!.handWorldQuaternion, weapon!.weaponWorldQuaternion, weapon!.socketLocalQuaternion]) {
    expect(q).toHaveLength(4); q.forEach(value => expect(Number.isFinite(value)).toBe(true));
    expect(Math.hypot(...q)).toBeCloseTo(1, 5);
  }
  expect(quaternionGap(multiplyQuaternion(weapon!.handWorldQuaternion, weapon!.socketLocalQuaternion), weapon!.weaponWorldQuaternion),
    'Weapon rotation must inherit the hand bone and fixed socket, rather than rotate as a screen-space sticker').toBeLessThan(1e-4);
  return weapon!;
}
const moving = (sample: Sample) => Object.entries(sample.hero.frame?.locomotionWeights ?? {}).some(([name, weight]) => /Jog|Walk|Strafe|Sprint/.test(name) && weight > .05);
async function prepareTransport(page: Page, context: BrowserContext, url = entry) {
  await context.setOffline(!served);
  const errors: string[] = [], remote: string[] = [], allowedRequests: string[] = [];
  // HTTP mode is explicitly online, with only the configured preview origin
  // permitted. Data/blob resources remain in-memory and require no network.
  if (served) await context.route(/^https?:\/\//i, async route => {
    if (new URL(route.request().url()).origin === url.origin) await route.continue();
    else await route.abort('blockedbyclient');
  });
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => {
    if (!/^https?:/i.test(request.url())) return;
    if (served && new URL(request.url()).origin === url.origin) allowedRequests.push(request.url());
    else remote.push(request.url());
  });
  await page.goto(url.href);
  return { errors, remote, allowedRequests, transport: { ...transport, entry: url.href } };
}
async function boot(page: Page, context: BrowserContext, touchStart = false) {
  const run = await prepareTransport(page, context);
  await page.waitForFunction(() => (window.__viral?.diagnostics() as unknown as Diagnostics)?.art?.player3D?.ready === true);
  const menuDraws = (await read(page)).hero.drawCount;
  if (touchStart) await page.locator('[data-action="start"]').tap(); else await page.locator('[data-action="start"]').click();
  await expect.poll(async () => (await state(page)).phase).toBe('playing');
  await expect.poll(async () => (await read(page)).hero.drawCount).toBeGreaterThan(menuDraws);
  await expect.poll(async () => (await read(page)).hero.frame?.paused).toBe(false);
  const first = await read(page); displayed(first);
  if (await page.evaluate(() => !!globalThis.crypto?.subtle)) {
    await expect.poll(async () => (await read(page)).hero.sha256).toBe(modelHash);
    expect((await read(page)).hero.hashVerified).toBe(true);
  }
  else { expect(first.hero.sha256).toBeNull(); expect(first.hero.hashVerified).toBeNull(); }
  return { first, ...run };
}
async function aim(page: Page, angle: number): Promise<void> {
  const point = await page.evaluate(angle => {
    const p = window.__viral.snapshot().player;
    return window.__viral.toScreen({ x: p.x + Math.cos(angle) * 180, y: p.y + Math.sin(angle) * 180 });
  }, angle);
  await page.mouse.move(point.x, point.y);
  await expect.poll(async () => gap((await state(page)).player.facing, angle)).toBeLessThan(.03);
  await expect.poll(async () => gap((await read(page)).hero.frame!.bodyYaw, Math.PI / 2 - angle)).toBeLessThan(.06);
}
async function advance(page: Page, elapsed: number, seconds = .2) { await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThanOrEqual(elapsed + seconds); }
function evidence(info: TestInfo, name: string, value: unknown) { writeFileSync(info.outputPath(name), JSON.stringify(value, null, 2)); }

const defaultEntry = new URL(entry.href);
defaultEntry.searchParams.delete('scenario');
async function enterDefaultCamp(page: Page, context: BrowserContext, require3D = true) {
  const run = await prepareTransport(page, context, defaultEntry);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-action="endless-start"]')).toContainText('带队抵达');
  if (require3D) await page.waitForFunction(() => (window.__viral.diagnostics() as unknown as Diagnostics).art.player3D.ready);
  await page.locator('[data-action="endless-start"]').click();
  await expect.poll(async () => { const s = await state(page); return s.phase === 'playing' && s.camp?.prologue === 'arrival'; }).toBe(true);
  return run;
}
/** Compare only after releasing movement. Both diagnostics and the public camera
 * conversion are read synchronously; no private renderer or state is accessed. */
async function alignedHero(page: Page, weaponId: 'steady' | 'piercing' = 'steady') {
  const result = await page.evaluate(() => {
    const s = window.__viral.snapshot(), d = window.__viral.diagnostics() as unknown as Diagnostics;
    const layer = d.phaser.rasterDimensions.find(layer => layer.id === 'player3d'), frame = d.art.player3D.frame;
    const legacyTool = d.phaser.nativeSprites.find(sprite => sprite.id === 'player:tool' && sprite.visible), weapon = frame?.weapon;
    if (!layer || !frame) throw new Error('Missing actual 3D raster/frame for alignment');
    const screen = window.__viral.toScreen(s.player), right = window.__viral.toScreen({ x: s.player.x + 1, y: s.player.y });
    const scale = right.x - screen.x, scaleX = layer.displayWidth / frame.width, scaleY = layer.displayHeight / frame.height;
    const rasterFoot = { x: layer.x + frame.foot.x * scaleX, y: layer.y + frame.foot.y * scaleY };
    const hand = d.art.weapon.weaponId === 'piercing' ? frame.leftGrip : frame.grip;
    return { state: s, hero: d.art.player3D, layer, screen, scale, scaleX, scaleY, rasterFoot,
      expectedWeaponGrip: { x: rasterFoot.x + hand.x * scale, y: rasterFoot.y + hand.y * scale },
      weapon, legacyTool, weaponContract: d.art.weapon, rulesUnchanged: JSON.stringify(s) === JSON.stringify(window.__viral.snapshot()) };
  });
  expect(result.rulesUnchanged).toBe(true); expect(result.hero.ready).toBe(true);
  expect(result.scale).toBeGreaterThan(0); expect(result.scaleX).toBeCloseTo(result.scale, 6); expect(result.scaleY).toBeCloseTo(result.scale, 6);
  expect(result.rasterFoot.x).toBeCloseTo(result.screen.x, 3); expect(result.rasterFoot.y).toBeCloseTo(result.screen.y, 3);
  expect(result.weaponContract).toMatchObject({ weaponId, assetId: 'weapon3d:' + weaponId, mode: 'skinned3d', gripSource: 'bone-transform' });
  expect(result.legacyTool, 'A real Three mesh must replace the old native PNG weapon').toBeUndefined();
  attachedWeapon(result.hero, weaponId);
  expect(result.weapon!.bounds.right).toBeGreaterThan(result.weapon!.bounds.left);
  expect(result.weapon!.bounds.bottom).toBeGreaterThan(result.weapon!.bounds.top);
  // A calibrated rigid socket may offset the marker slightly within the palm.
  // The world quaternion assertion above verifies inheritance independently.
  const hand = weaponId === 'piercing' ? result.hero.frame!.leftGrip : result.hero.frame!.grip;
  expect(Math.hypot(result.weapon!.grip.x - hand.x, result.weapon!.grip.y - hand.y)).toBeLessThan(8);
  return result;
}

test(transportName + ' default GLB uses genuine skeletal motion, continuous yaw and accepted gameplay receipts', async ({ page, context }, info) => {
  test.setTimeout(45_000);
  const run = await boot(page, context), result: Record<string, unknown> = { entry: entry.href, initial: run.first };
  const idleBefore = await read(page); await advance(page, idleBefore.elapsed, .25); const idleAfter = await read(page);
  expect(idleAfter.player.x).toBe(idleBefore.player.x); expect(idleAfter.player.y).toBe(idleBefore.player.y);
  expect(idleAfter.shots).toBe(idleBefore.shots); expect(idleAfter.dashes).toBe(idleBefore.dashes);
  expect(idleAfter.hero.frame!.poseTime).toBeGreaterThan(idleBefore.hero.frame!.poseTime);
  const directions: Sample[] = [];
  // Eight inputs inside one former PNG quadrant must display eight different yaws.
  for (const angle of [.16, .25, .34, .43, .52, .61, .70, .79, Math.PI / 2, Math.PI - .035, -Math.PI + .035, -Math.PI / 2, -.035]) {
    await aim(page, angle); directions.push(await read(page));
  }
  expect(new Set(directions.slice(0, 8).map(sample => sample.hero.frame!.bodyYaw.toFixed(3))).size).toBe(8);
  expect(gap(directions[9].hero.frame!.bodyYaw, directions[10].hero.frame!.bodyYaw)).toBeLessThan(.15);
  for (const sample of directions) {
    const frame = sample.hero.frame!, forward = frame.weapon!.forward;
    expect(gap(Math.atan2(forward.y, forward.x), Math.atan2(Math.sin(frame.bodyFacing) * .72, Math.cos(frame.bodyFacing))),
      'A settled idle barrel must aim with the displayed body; calibration must use the runtime lower/upper masks').toBeLessThan(.04);
  }
  directions.forEach(displayed); result.directions = directions;
  const beforeMove = await state(page); await startTrace(page, 600); await page.keyboard.down('KeyD');
  const walking = await finishTrace(page); await page.keyboard.up('KeyD');
  expect(walking.some(sample => sample.player.x > beforeMove.player.x + 5 && moving(sample))).toBe(true);
  walking.forEach(displayed); result.walking = walking;
  await expect.poll(async () => (await read(page)).hero.frame!.locomotionWeights.Idle_Subtle).toBeGreaterThan(.95);
  await aim(page, .3); const beforeShot = await state(page);
  await startTrace(page, 650); await page.mouse.down(); const firing = await finishTrace(page); await page.mouse.up();
  expect(firing.some(sample => sample.shots > beforeShot.shots && sample.hero.frame?.upperClip === 'Pistol_Shoot'
    && (sample.hero.frame.upperWeights.Pistol_Shoot ?? 0) > .05), 'A real accepted shot drives a weighted shooting action').toBe(true);
  expect((await state(page)).events.some(event => event.type === 'TOOL_FIRED' && event.data.tool === 1)).toBe(true); result.firing = firing;
  await expect.poll(async () => { const s = await state(page); return s.player.dashReady <= s.elapsed; }).toBe(true);
  const beforeDash = await state(page); await startTrace(page, 450); await page.keyboard.press('Space'); const dashing = await finishTrace(page);
  expect(dashing.some(sample => sample.dashes === beforeDash.dashes + 1 && sample.player.dashUntil > sample.elapsed && (sample.hero.frame?.locomotionWeights.Sprint ?? 0) > .5), 'An accepted dash drives the sprint layer').toBe(true); result.dashing = dashing;
  await page.keyboard.press('Escape'); await expect.poll(async () => (await state(page)).phase).toBe('paused');
  await page.locator('#overlay-host [data-action="help"]').click();
  const beforeHit = await state(page); await startTrace(page, 550); await page.locator('[data-action="practice-hit"]').click(); const hurt = await finishTrace(page);
  expect(hurt.some(sample => sample.player.hp === beforeHit.player.hp - 5 && sample.hero.frame?.fullBodyClip === 'Hit_Chest'
    && sample.hero.frame.hurtWeight > .05), 'Positive accepted damage drives a weighted hurt action').toBe(true); result.hurt = hurt;
  await page.keyboard.press('Escape'); await expect.poll(async () => (await state(page)).phase).toBe('paused');
  const frozenState = await state(page), frozen = await read(page); await startTrace(page, 250); const paused = await finishTrace(page);
  expect(await state(page)).toEqual(frozenState);
  for (const sample of paused) { displayed(sample); expect(sample.hero.frame!.paused).toBe(true); expect(sample.hero.frame!.poseTime).toBeCloseTo(frozen.hero.frame!.poseTime, 9); expect(gap(sample.hero.frame!.bodyYaw, frozen.hero.frame!.bodyYaw)).toBeLessThan(1e-8); }
  await page.setViewportSize({ width: 1100, height: 700 });
  await expect.poll(() => page.evaluate(() => (window.__viral.diagnostics() as unknown as Diagnostics).phaser.widthCSS)).toBe(1100);
  const resized = await read(page); displayed(resized); expect(resized.hero.frame!.poseTime).toBeCloseTo(frozen.hero.frame!.poseTime, 9);
  result.paused = paused; result.resized = resized;
  const beforeRetryDraws = (await read(page)).hero.drawCount;
  await page.locator('#overlay-host [data-action="retry"]').click(); await expect.poll(async () => (await state(page)).phase).toBe('playing');
  await expect.poll(async () => {
    const sample = await read(page);
    return sample.phase === 'playing' && sample.hero.frame?.paused === false && sample.hero.drawCount > beforeRetryDraws;
  }, { message: 'Retry must reach a fresh displayed playing frame, not the previous paused canvas' }).toBe(true);
  const retried = await read(page); displayed(retried); expect(retried.elapsed).toBeLessThan(frozenState.elapsed);
  expect(retried.player.hp).toBe(100); expect(retried.shots).toBe(0); expect(retried.dashes).toBe(0); expect(retried.hero.frame!.paused).toBe(false); result.retried = retried;
  await page.screenshot({ path: info.outputPath('hero-3d-' + transportName + '-production.png') });
  expect(run.errors).toEqual([]); expect(run.remote, served ? 'Only the configured preview origin may be requested' : 'No HTTP fetch from the offline file:// game').toEqual([]);
  if (served) expect(run.allowedRequests.length).toBeGreaterThan(0);
  evidence(info, 'hero-3d-' + transportName + '-evidence.json', { scope: 'Real DOM inputs and read-only rAF observations; no simulation writes', ...result,
    transport: run.transport, errors: run.errors, remote: run.remote, allowedRequests: run.allowedRequests });
});

test(transportName + ' fresh default entry reaches the camp, keeps the skinned grip and enters its real first mission', async ({ page, context }, info) => {
  test.setTimeout(65_000);
  const run = await enterDefaultCamp(page, context), checkpoints: Record<string, unknown> = {};
  const initial = await state(page); expect(initial.camp?.introComplete).toBe(false); checkpoints.arrival = initial;
  await startTrace(page, 700); await page.keyboard.down('KeyW');
  try { await expect(page.locator('#camp-toolbar [data-action="camp-establish"]')).toBeVisible(); }
  finally { await page.keyboard.up('KeyW'); }
  const arrivalWalk = await finishTrace(page);
  expect(arrivalWalk.some(sample => sample.player.y < initial.player.y - 5 && moving(sample))).toBe(true);
  arrivalWalk.forEach(displayed); checkpoints.arrivalWalk = arrivalWalk;
  await advance(page, (await state(page)).elapsed); checkpoints.anchor = await alignedHero(page);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(page)).camp?.prologue).toBe('building');
  await expect.poll(async () => (await state(page)).camp?.introComplete, { timeout: 12_000 }).toBe(true);
  await expect(page.locator('.camp-panel [data-action="camp-deploy"]')).toBeEnabled();
  checkpoints.firstIntelligence = { state: await state(page), title: await page.locator('#camp-title').textContent() };
  await page.screenshot({ path: info.outputPath('hero-3d-' + transportName + '-default-intelligence.png') });
  await page.locator('.camp-close[data-action="camp-close"]').click();
  const campDirections: (Awaited<ReturnType<typeof alignedHero>> & { key: string })[] = [];
  for (const [key, axis, sign] of [['KeyW', 'y', -1], ['KeyA', 'x', -1], ['KeyS', 'y', 1], ['KeyD', 'x', 1]] as const) {
    const before = await state(page); await page.keyboard.down(key);
    try { await expect.poll(async () => ((await state(page)).player[axis] - before.player[axis]) * sign).toBeGreaterThan(5); }
    finally { await page.keyboard.up(key); }
    await advance(page, (await state(page)).elapsed);
    const sample = await alignedHero(page);
    // Body and weapon now share a Three depth buffer. The old whole-sprite
    // front/back layer switch must not be used to emulate partial occlusion.
    expect(sample.legacyTool).toBeUndefined();
    campDirections.push({ key, ...sample });
  }
  checkpoints.campDirections = campDirections;
  expect(campDirections.some(sample => quaternionGap(sample.hero.weapon3D!.weaponWorldQuaternion, campDirections[0].hero.weapon3D!.weaponWorldQuaternion) > .2)).toBe(true);
  for (const sample of campDirections) expect(quaternionGap(sample.hero.weapon3D!.socketLocalQuaternion, campDirections[0].hero.weapon3D!.socketLocalQuaternion)).toBeLessThan(1e-4);
  await page.screenshot({ path: info.outputPath('hero-3d-' + transportName + '-default-camp.png') });
  await page.locator('#camp-toolbar [data-action="camp-section"][data-section="missions"]').click();
  await expect(page.locator('[data-mission-card="membrane"]')).toBeVisible();
  await page.locator('.camp-nav [data-action="camp-section"][data-section="warehouse"]').click();
  const locked = page.locator('[data-camp-weapon="piercing"]');
  await expect(locked.locator('[data-action="camp-equip"]')).toBeDisabled();
  await expect(locked.locator('[data-action="camp-trial"]')).toHaveCount(0);
  checkpoints.secondWeapon = { status: 'locked-in-a-fresh-profile; switching-and-bow-rig-not-verified', explanation: await locked.innerText() };
  await page.locator('[data-camp-weapon="steady"] [data-action="camp-trial"]').click();
  await expect(page.locator('#camp-trial-canvas')).toBeVisible();
  const frozenWorld = await state(page), frozenHero = await read(page);
  await page.locator('[data-action="camp-trial-fire"]').click();
  await expect.poll(() => page.evaluate(() => (window.__viral.diagnostics() as unknown as Diagnostics).campTrial?.hits ?? 0)).toBeGreaterThan(0);
  const trial = await page.evaluate(() => (window.__viral.diagnostics() as unknown as Diagnostics).campTrial);
  expect(trial?.loadout.weaponId).toBe('steady'); expect(trial?.shots).toBeGreaterThan(0); expect(trial?.totalDamage).toBeGreaterThan(0);
  expect(await state(page)).toEqual(frozenWorld); expect((await read(page)).hero.frame!.poseTime).toBe(frozenHero.hero.frame!.poseTime);
  displayed(await read(page)); checkpoints.trial = { scope: 'Existing independent practice canvas; not a 3D battle animation claim', trial };
  await page.screenshot({ path: info.outputPath('hero-3d-' + transportName + '-default-trial.png') });
  await page.locator('.camp-footer [data-action="camp-section"][data-section="missions"]').click();
  await page.locator('[data-action="camp-deploy"]').click();
  await expect.poll(async () => { const s = await state(page); return s.phase === 'playing' && !s.camp && s.expedition?.missionId === 'membrane'; }).toBe(true);
  await advance(page, (await state(page)).elapsed); checkpoints.mission = await alignedHero(page);
  await aim(page, .4); const beforeShot = await state(page); await startTrace(page, 450); await page.mouse.down();
  let firing: Sample[]; try { firing = await finishTrace(page); } finally { await page.mouse.up(); }
  expect(firing.some(sample => sample.shots > beforeShot.shots && (sample.hero.frame?.upperWeights.Pistol_Shoot ?? 0) > .05)).toBe(true);
  firing.forEach(displayed); checkpoints.missionFiring = firing;
  const launched = await state(page); expect(launched.weaponCombat?.loadout.weaponId).toBe('steady');
  const primary = launched.events.find(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED' && event.tick > beforeShot.tick && event.data.kind === 'primary');
  expect(primary).toBeDefined();
  expect(launched.events.some(event => event.type === 'TOOL_FIRED' && event.data.tool === 1 && event.data.castId === primary!.data.castId)).toBe(true);
  checkpoints.missionLaunch = { loadout: launched.weaponCombat?.loadout, primary };
  await page.screenshot({ path: info.outputPath('hero-3d-' + transportName + '-default-mission.png') });
  expect(run.errors).toEqual([]); expect(run.remote).toEqual([]);
  evidence(info, 'hero-3d-' + transportName + '-default-entry-evidence.json', { scope: 'Fresh browser profile; real WASD, E and visible camp/mission controls only. Read-only game diagnostics; no unlock/storage/state writes. Geometry checks are renderer metadata, not pixel or physical-device proof.', checkpoints, ...run });
});

test(transportName + ' isolated owned-weapon profile repairs and equips the rigid bow, then draws its string through real mission input', async ({ page, context }, info) => {
  test.setTimeout(45_000);
  // Produce a valid entitlement through the same public store APIs used by
  // existing camp fixtures. This is neither a natural Boss clear nor a live
  // game-state write. The browser must still repair/equip/deploy through UI.
  const memory = new Map<string, string>([[CAMP_PROFILE_STORAGE_KEY, JSON.stringify(emptyCampProfile())]]);
  const store = new CampProfileStore({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); }, removeItem: key => { memory.delete(key); } });
  const runId = 'weapon3d:explicit-entitlement-fixture', seed = 20261106;
  store.beginExpedition(runId, seed);
  const reward = createBossLoot(runId, seed, true), settled = store.settleVictory(runId, reward);
  expect(settled.accepted).toBe(true); expect(store.data.weapons.piercing.pending).toBeTruthy(); expect(store.data.weapons.piercing.repaired).toBeNull();
  const json = memory.get(CAMP_PROFILE_STORAGE_KEY)!; expect(parseCampProfile(JSON.parse(json))).not.toBeNull();
  await context.addInitScript(({ key, json }) => { localStorage.setItem(key, json); }, { key: CAMP_PROFILE_STORAGE_KEY, json });
  const run = await prepareTransport(page, context, defaultEntry), checkpoints: Record<string, unknown> = {};
  await page.waitForFunction(() => (window.__viral?.diagnostics() as unknown as Diagnostics)?.art?.player3D?.ready);
  await page.locator('[data-action="endless-start"]').click();
  await expect.poll(async () => { const s = await state(page); return s.phase === 'playing' && s.camp?.introComplete === true; }).toBe(true);
  await page.locator('#camp-toolbar [data-action="camp-section"][data-section="overview"]').click();
  await page.locator('.camp-nav [data-action="camp-section"][data-section="forge"]').click();
  await page.locator('.camp-legacy-weapons > summary').click();
  await expect(page.locator('[data-action="camp-repair"][data-weapon="piercing"]')).toBeEnabled();
  await page.locator('[data-action="camp-repair"][data-weapon="piercing"]').click();
  await page.locator('.camp-nav [data-action="camp-section"][data-section="warehouse"]').click();
  await expect(page.locator('[data-camp-weapon="piercing"] [data-action="camp-equip"]')).toBeEnabled();
  await page.locator('[data-camp-weapon="piercing"] [data-action="camp-equip"]').click();
  await page.locator('.camp-close[data-action="camp-close"]').click();
  await expect.poll(async () => (await read(page)).hero.frame?.weapon?.id).toBe('piercing');
  await advance(page, (await state(page)).elapsed, .3);
  const ready = await alignedHero(page, 'piercing');
  expect(ready.hero.frame!.upperClip).toBe('Bow_Ready'); expect(ready.hero.weapon3D!.drawAmount).toBe(0);
  expect(ready.hero.weapon3D!.rightHandGap).toBeLessThan(.02); checkpoints.campReady = ready;
  await page.screenshot({ path: info.outputPath('hero-3d-' + transportName + '-bow-ready.png') });
  await page.locator('#camp-toolbar [data-action="camp-section"][data-section="missions"]').click();
  await page.locator('[data-action="camp-deploy"]').click();
  await expect.poll(async () => { const s = await state(page); return s.phase === 'playing' && !s.camp && s.expedition?.loadout.weaponId === 'piercing'; }).toBe(true);
  await aim(page, .65); await advance(page, (await state(page)).elapsed, .25);
  checkpoints.missionReady = await alignedHero(page, 'piercing');
  await page.screenshot({ path: info.outputPath('hero-3d-' + transportName + '-bow-mission.png') });
  const beforeCast = await state(page); await startTrace(page, 1000); await page.keyboard.press('Digit1');
  const drawing = await finishTrace(page); drawing.forEach(displayed);
  const drawSamples = drawing.filter(sample => sample.preparation && sample.hero.frame?.upperClip === 'Bow Pull Back');
  expect(drawSamples.length).toBeGreaterThan(2);
  expect(drawSamples.some(sample => sample.hero.weapon3D!.drawAmount > .5)).toBe(true);
  expect(Math.max(...drawSamples.map(sample => sample.hero.weapon3D!.drawAmount)) - Math.min(...drawSamples.map(sample => sample.hero.weapon3D!.drawAmount))).toBeGreaterThan(.3);
  for (const sample of drawSamples) {
    expect(sample.hero.weapon3D!.rightHandGap).toBeLessThan(.02);
    expect(sample.hero.weapon3D!.stringCenter).toHaveLength(3);
  }
  expect(drawing.some(sample => sample.hero.frame?.upperClip === 'Bow Release')).toBe(true);
  const afterCast = await state(page);
  expect(afterCast.events.some(event => event.type === 'WEAPON_SKILL_CAST' && event.tick > beforeCast.tick && event.data.skillId === 'piercing-heavy')).toBe(true);
  expect(afterCast.events.some(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED' && event.tick > beforeCast.tick && event.data.skillId === 'piercing-heavy')).toBe(true);
  expect(afterCast.weaponCombat?.loadout.weaponId).toBe('piercing'); checkpoints.drawing = drawing;
  await expect.poll(async () => (await read(page)).hero.frame?.upperClip).toBe('Bow_Ready');
  expect((await read(page)).hero.weapon3D!.drawAmount).toBe(0);
  await startTrace(page, 500); await page.keyboard.down('KeyD');
  let walking: Sample[]; try { walking = await finishTrace(page); } finally { await page.keyboard.up('KeyD'); }
  walking.forEach(displayed); expect(walking.some(sample => moving(sample) && sample.hero.frame?.upperClip === 'Bow_Ready')).toBe(true);
  for (const sample of walking) expect(sample.hero.weapon3D!.drawAmount).toBe(0); checkpoints.walking = walking;
  await page.keyboard.press('Escape'); await expect.poll(async () => (await state(page)).phase).toBe('paused');
  const frozenState = await state(page), frozen = await read(page); await startTrace(page, 220); const paused = await finishTrace(page);
  expect(await state(page)).toEqual(frozenState);
  for (const sample of paused) { expect(sample.hero.weapon3D!.drawAmount).toBe(frozen.hero.weapon3D!.drawAmount); expect(sample.hero.weapon3D!.stringCenter).toEqual(frozen.hero.weapon3D!.stringCenter); }
  checkpoints.paused = paused;
  await page.screenshot({ path: info.outputPath('hero-3d-' + transportName + '-bow-paused.png') });
  expect(run.errors).toEqual([]); expect(run.remote).toEqual([]);
  evidence(info, 'hero-3d-' + transportName + '-bow-evidence.json', { scope: 'Explicit isolated entitlement fixture generated with CampProfileStore.beginExpedition/settleVictory; no natural Boss completion claimed. Browser uses only visible repair/equip/deploy controls and real Digit1/WASD/pause. No live simulation writes; no physical-device claim.',
    entitlement: { source: JSON.parse(json), reward, settled }, checkpoints, ...run });
});

test(transportName + ' WebGL2 refusal preserves Phaser WebGL1 and starts the default game with a visible sprite', async ({ page, context }, info) => {
  test.setTimeout(30_000);
  await page.addInitScript(() => {
    const probe = { deniedWebGL2: 0, acceptedWebGL1: 0 }, original = HTMLCanvasElement.prototype.getContext;
    (window as unknown as { __hero3DFallbackProbe: typeof probe }).__hero3DFallbackProbe = probe;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: unknown) {
      if (kind === 'webgl2') { probe.deniedWebGL2++; return null; }
      const result = Reflect.apply(original, this, [kind, options]);
      if (result && (kind === 'webgl' || kind === 'experimental-webgl')) probe.acceptedWebGL1++;
      return result;
    } as typeof original;
  });
  const run = await enterDefaultCamp(page, context, false);
  await expect(page.locator('#retry-art')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const d = window.__viral.diagnostics() as unknown as Diagnostics;
    return d.phaser.ready && d.art.actorContract.heroRepresentation === 'sprite' && d.art.heroAnimation.representation === 'sprite'
      && d.phaser.nativeSprites.some(sprite => sprite.id === 'player' && sprite.visible && sprite.width > 0 && sprite.height > 0);
  })).toBe(true);
  const before = await state(page); await page.keyboard.down('KeyW');
  try { await expect.poll(async () => (await state(page)).player.y).toBeLessThan(before.player.y - 5); }
  finally { await page.keyboard.up('KeyW'); }
  const result = await page.evaluate(() => ({ state: window.__viral.snapshot(), diagnostics: window.__viral.diagnostics() as unknown as Diagnostics,
    probe: (window as unknown as { __hero3DFallbackProbe: { deniedWebGL2: number; acceptedWebGL1: number } }).__hero3DFallbackProbe }));
  expect(result.state.phase).toBe('playing'); expect(result.state.tick).toBeGreaterThan(before.tick);
  expect(result.probe.deniedWebGL2).toBeGreaterThan(0); expect(result.probe.acceptedWebGL1).toBeGreaterThan(0);
  expect(result.diagnostics.art.player3D.ready).toBe(false); expect(result.diagnostics.art.player3D.error).toContain('WebGL2');
  expect(result.diagnostics.phaser.rasterDimensions.some(layer => layer.id === 'player3d' && layer.visible)).toBe(false);
  expect(result.diagnostics.phaser.nativeSprites.some(sprite => sprite.id === 'player:tool' && sprite.visible)).toBe(true);
  expect(run.errors).toEqual([]); expect(run.remote).toEqual([]);
  await page.screenshot({ path: info.outputPath('hero-3d-' + transportName + '-webgl1-fallback.png') });
  evidence(info, 'hero-3d-' + transportName + '-webgl1-fallback-evidence.json', { scope: 'Controlled browser capability refusal, not a game-state mutation: only canvas webgl2 requests return null; original WebGL1/2D contexts are preserved.', ...result, ...run });
});

class Fingers {
  private readonly points = new Map<number, Vec>();
  constructor(private readonly cdp: CDPSession) {}
  async down(id: number, point: Vec) { this.points.set(id, point); await this.send('touchStart', [...this.points]); }
  async move(id: number, point: Vec) { this.points.set(id, point); await this.send('touchMove', [...this.points]); }
  async up(id: number) { const point = this.points.get(id); this.points.delete(id); if (point) await this.send('touchEnd', [[id, point]]); }
  async release() {
    if (!this.points.size) return;
    // Reuse the same per-contact release model as up(), already exercised by
    // the independent-finger fixture. Never send an end without a start.
    for (const id of [...this.points.keys()]) await this.up(id);
  }
  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, Vec][]) {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, point]) => ({ id, ...point, radiusX: 2, radiusY: 2, force: 1 })) });
  }
}
async function center(page: Page, selector: string): Promise<Vec> {
  const box = await page.locator(selector).boundingBox(); if (!box) throw new Error('Missing visible control: ' + selector);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
test.describe('compact landscape 3D presentation', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 1 });
  test(transportName + ' GLB survives independent trusted move/fire contacts and viewport resize', async ({ page, context, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'Trusted multi-touch uses Chromium CDP; no physical-phone claim.'); test.setTimeout(35_000);
    const run = await boot(page, context, true); await expect(page.locator('#mobile-controls')).toHaveAttribute('data-active', 'true');
    const fingers = new Fingers(await context.newCDPSession(page));
    await page.evaluate(() => {
      (window as unknown as { __hero3DTouchReceipts: unknown[] }).__hero3DTouchReceipts = [];
      for (const type of ['pointerdown', 'pointerup']) addEventListener(type, event => {
        const e = event as PointerEvent, control = e.target instanceof Element ? e.target.closest('[data-stick]') : null;
        if (control) (window as unknown as { __hero3DTouchReceipts: unknown[] }).__hero3DTouchReceipts.push({ type, trusted: e.isTrusted, kind: e.pointerType, id: e.pointerId, control: control.getAttribute('data-stick') });
      }, true);
    });
    const move = await center(page, '[data-stick="move"]'), attack = await center(page, '[data-stick="attack"]');
    try {
      const initial = await state(page); await startTrace(page, 700);
      await fingers.down(1, move); await fingers.move(1, { x: move.x + 28, y: move.y }); await fingers.down(2, attack);
      const walking = await finishTrace(page);
      // Finish the bounded input sequence before the heavier per-frame mesh
      // assertions. Keeping the move finger down during Node-side assertions
      // lets the live browser reach the arena wall on slower CI machines.
      await fingers.up(2); await page.waitForTimeout(60); const attackReleased = await state(page); await advance(page, attackReleased.elapsed);
      const stillMoving = await state(page); expect(stillMoving.player.x).toBeGreaterThan(attackReleased.player.x + 5); expect(stillMoving.shots).toBe(attackReleased.shots);
      await fingers.down(2, attack); await fingers.up(1); await page.waitForTimeout(60); const moveReleased = await state(page); await advance(page, moveReleased.elapsed);
      const stillFiring = await state(page); expect(stillFiring.player.x).toBeCloseTo(moveReleased.player.x, 5); expect(stillFiring.player.y).toBeCloseTo(moveReleased.player.y, 5); expect(stillFiring.shots).toBeGreaterThan(moveReleased.shots);
      await fingers.up(2); await expect.poll(async () => (await read(page)).hero.frame!.locomotionWeights.Idle_Subtle).toBeGreaterThan(.95);
      walking.forEach(displayed);
      expect(walking.some(sample => sample.player.x > initial.player.x + 5 && moving(sample))).toBe(true);
      expect(walking.some(sample => sample.shots > initial.shots && sample.hero.frame?.upperClip === 'Pistol_Shoot'
        && (sample.hero.frame.upperWeights.Pistol_Shoot ?? 0) > .05)).toBe(true);
      await page.locator('#mobile-controls [data-action="pause"]').tap(); await expect.poll(async () => (await state(page)).phase).toBe('paused');
      const paused = await read(page); await page.setViewportSize({ width: 932, height: 430 });
      await expect.poll(() => page.evaluate(() => (window.__viral.diagnostics() as unknown as Diagnostics).phaser.widthCSS)).toBe(932);
      const resized = await read(page); displayed(resized); expect(resized.hero.frame!.poseTime).toBeCloseTo(paused.hero.frame!.poseTime, 9);
      const receipts = await page.evaluate(() => (window as unknown as { __hero3DTouchReceipts: { type: string; trusted: boolean; kind: string; control: string; id: number }[] }).__hero3DTouchReceipts);
      for (const control of ['move', 'attack']) for (const type of ['pointerdown', 'pointerup']) expect(receipts.some(e => e.control === control && e.type === type && e.trusted && e.kind === 'touch')).toBe(true);
      await page.screenshot({ path: info.outputPath('hero-3d-' + transportName + '-compact-landscape.png') });
      expect(run.errors).toEqual([]); expect(run.remote).toEqual([]);
      if (served) expect(run.allowedRequests.length).toBeGreaterThan(0);
      evidence(info, 'hero-3d-' + transportName + '-touch-evidence.json', { method: 'Browser-trusted Chromium CDP contacts; desktop emulation, not physical-device evidence',
        entry: entry.href, transport: run.transport, initial, walking, attackReleased, stillMoving, moveReleased, stillFiring, paused, resized, receipts,
        errors: run.errors, remote: run.remote, allowedRequests: run.allowedRequests });
    } finally { await fingers.release(); }
  });
});
