import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameState } from '../../src/game/types';
import { walk } from './campaignDriver';
import type { SourceRegisteredSpriteAsset } from '../../src/render/spriteGeometry';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
interface Point { x: number; y: number }
interface ActorAsset extends SourceRegisteredSpriteAsset {
  atlas: string; frame: string; source: string; sourceSha256: string;
  actorRegistration?: { foot: Point; grip?: Point; muzzle?: Point };
}
interface NativeSprite {
  id: string; frame: string; texture: string; x: number; y: number; width: number; height: number;
  originX: number; originY: number; flipX: boolean; flipY: boolean; rotation: number; visible: boolean;
}
interface ActorFrame {
  actorId: string; semanticId: string; frame: string; native: boolean; groupReady: boolean; fallback: boolean;
  source: { path: string; sha256: string }; sourceGrip: Point | null; grip: Point | null; muzzle: Point | null;
}
interface ArtDiagnostics {
  art: { signature: string; actorFrames: ActorFrame[]; actorContract: { version: number; preview?: boolean; animationPreview?: boolean; ready: boolean; oldSourceIds: string[] } };
  phaser: { nativeSprites: NativeSprite[] };
}
const snapshot = (page: import('@playwright/test').Page): Promise<GameState> => page.evaluate(() => window.__viral.snapshot());

/** Apply real native UV/origin/flip/rotation directly to an authored source
 * landmark. This does not call the renderer's grip/muzzle calculation. */
function sourcePointOnNative(asset: ActorAsset, sprite: NativeSprite, point: Point): Point {
  const b = asset.sourceBounds, v = asset.visibleBounds;
  if (!b || typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.width !== 'number') throw Error('Source crop metadata is missing');
  const u = v.x + (point.x - b.x) * v.width / b.width;
  const rawV = v.y + (point.y - b.y) * v.height / b.height;
  const dx = ((sprite.flipX ? asset.width - u : u) / asset.width - sprite.originX) * sprite.width;
  const dy = ((sprite.flipY ? asset.height - rawV : rawV) / asset.height - sprite.originY) * sprite.height;
  const cos = Math.cos(sprite.rotation), sin = Math.sin(sprite.rotation);
  return { x: sprite.x + dx * cos - dy * sin, y: sprite.y + dx * sin + dy * cos };
}
test.use({ video: 'off', trace: 'off' });

for (const low of [false, true]) {
  test(`near wall contact in ${low ? 'low' : 'standard'} effects`, async ({ page, context }, info) => {
    await context.setOffline(true);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${entry}?scenario=training&seed=71`);
    await page.locator('[data-action="start"]').click();
    const runtime = JSON.parse(readFileSync('.art-generated/art-runtime.json', 'utf8')) as { inputSignature: string; assets: Record<string, ActorAsset> };
    expect(runtime.assets['fantasy.actor.weapon.emitter'], 'The formal new emitter must exist; missing production art is a failure').toBeDefined();
    await expect.poll(() => page.evaluate(() => {
      const d = window.__viral.diagnostics() as unknown as ArtDiagnostics;
      return d.art.actorContract?.version === 2 && d.art.actorContract.ready && !d.art.actorContract.preview
        && !d.art.actorContract.animationPreview && d.art.actorContract.oldSourceIds.length === 0;
    })).toBe(true);
    await page.keyboard.press('Escape');
    const effects = page.locator('[data-action="effects"]');
    await expect(effects).toContainText('标准');
    if (low) await effects.click();
    await expect(effects).toContainText(low ? '低' : '标准');
    await page.locator('[data-action="continue"]').click();
    // Approach from below: the real collision still stops the ground body at
    // the fold, while an upright hand/muzzle can extend beyond the short ray.
    // This exercises the near-wall visual clamp with the new authored grip.
    await walk(page, { x: 440, y: 410 }, 15);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(340); await page.keyboard.up('KeyW');
    await page.keyboard.press('Digit1');
    const state = await snapshot(page);
    expect(Math.hypot(state.player.x - 440, state.player.y - 295)).toBeLessThan(72);
    const aim = await page.evaluate(() => window.__viral.toScreen({ x: 440, y: 295 }));
    await page.mouse.move(aim.x, aim.y);
    let paused: GameState | undefined;
    for (let attempt = 0; attempt < 6 && !paused; attempt++) {
      const before = await snapshot(page);
      await page.mouse.down();
      await expect.poll(async () => (await snapshot(page)).events.some(e => e.type === 'TOOL_FIRED' && e.data.tool === 1 && e.tick > before.tick), { intervals: [5, 10, 20] }).toBe(true);
      await page.keyboard.press('Escape'); await page.mouse.up();
      const s = await snapshot(page);
      if (s.phase === 'paused' && s.effects.some(e => e.kind === 'beam' && s.elapsed - e.born < e.duration)) paused = s;
      else {
        await page.locator('[data-action="continue"]').click();
        await page.waitForTimeout(250);
      }
    }
    expect(paused, 'A live shot should remain visible while paused').toBeDefined();
    const beam = paused!.effects.filter(e => e.kind === 'beam').at(-1)!;
    const fire = paused!.events.find(e => e.type === 'TOOL_FIRED' && e.data.tool === 1 && Math.abs(e.tick / 60 - beam.born) < 1e-6)!;
    expect(fire).toBeDefined(); expect(fire.data.hit).toBe(false);
    expect(Math.hypot(beam.to.x - 440, beam.to.y - 295)).toBeCloseTo(47, 2);
    expect(Math.hypot(beam.to.x - beam.from.x, beam.to.y - beam.from.y)).toBeLessThan(35);
    const actual = await page.evaluate(() => ({ diagnostics: window.__viral.diagnostics() as unknown as ArtDiagnostics,
      origin: window.__viral.toScreen({ x: 0, y: 0 }), unitX: window.__viral.toScreen({ x: 1, y: 0 }) }));
    expect(actual.diagnostics.art.signature).toBe(runtime.inputSignature);
    const body = actual.diagnostics.phaser.nativeSprites.find(sprite => sprite.id === 'player' && sprite.visible);
    const weapon = actual.diagnostics.phaser.nativeSprites.find(sprite => sprite.id === 'player:tool' && sprite.visible);
    const bodyFrame = actual.diagnostics.art.actorFrames.find(actor => actor.actorId === 'player');
    const weaponFrame = actual.diagnostics.art.actorFrames.find(actor => actor.actorId === 'player:tool');
    expect(body).toBeDefined(); expect(weapon).toBeDefined(); expect(bodyFrame).toBeDefined(); expect(weaponFrame).toBeDefined();
    for (const frame of [bodyFrame!, weaponFrame!]) {
      expect(frame.native && frame.groupReady && !frame.fallback).toBe(true);
      expect(frame.source.path.replaceAll('\\', '/').includes('ViralInvasion_Art_v1/')).toBe(false);
    }
    expect(bodyFrame!.semanticId).toMatch(/^fantasy\.actor\.hero\.(front_right|back_right)\.(idle|walk)\.\d{2}$/);
    expect(weaponFrame!.semanticId).toBe('fantasy.actor.weapon.emitter');
    const bodyAsset = runtime.assets[bodyFrame!.semanticId], emitter = runtime.assets[weaponFrame!.semanticId];
    expect(bodyAsset).toBeDefined(); expect(emitter).toBeDefined();
    expect(body!.frame).toBe(bodyAsset.frame); expect(body!.texture).toBe(bodyAsset.atlas);
    expect(weapon!.frame).toBe(emitter.frame); expect(weapon!.texture).toBe(emitter.atlas);
    expect(bodyFrame!.source.sha256).toBe(bodyAsset.sourceSha256); expect(weaponFrame!.source.sha256).toBe(emitter.sourceSha256);
    expect(bodyAsset.actorRegistration?.grip).toBeDefined(); expect(emitter.actorRegistration?.grip).toBeDefined(); expect(emitter.sourceMuzzle).toBeDefined();
    const bodyHandScreen = sourcePointOnNative(bodyAsset, body!, bodyAsset.actorRegistration!.grip!);
    const weaponGripScreen = sourcePointOnNative(emitter, weapon!, emitter.actorRegistration!.grip!);
    const muzzleScreen = sourcePointOnNative(emitter, weapon!, emitter.sourceMuzzle!);
    const handGripError = Math.hypot(bodyHandScreen.x - weaponGripScreen.x, bodyHandScreen.y - weaponGripScreen.y);
    expect(handGripError, 'The new angular recoil must keep the actual weapon origin in the registered native palm').toBeLessThanOrEqual(1);
    const scale = actual.unitX.x - actual.origin.x;
    const projected = (point: Point) => ({ x: (point.x - actual.origin.x) / scale, y: (point.y - actual.origin.y) / scale });
    const muzzle = projected(muzzleScreen), grip = projected(weaponGripScreen);
    expect(weaponFrame!.grip).not.toBeNull(); expect(weaponFrame!.muzzle).not.toBeNull();
    expect(Math.hypot(grip.x - weaponFrame!.grip!.x, grip.y - weaponFrame!.grip!.y) * scale).toBeLessThanOrEqual(1);
    expect(Math.hypot(muzzle.x - weaponFrame!.muzzle!.x, muzzle.y - weaponFrame!.muzzle!.y) * scale).toBeLessThanOrEqual(1);
    const dx = beam.to.x - beam.from.x, dy = (beam.to.y - beam.from.y) * .72;
    const forward = (muzzle.x - beam.to.x) * dx + (muzzle.y - beam.to.y * .72) * dy;
    expect(forward, 'The actual new native muzzle must reach beyond this short near-wall ray; this is the clamp branch, not an assumed legacy pose').toBeGreaterThanOrEqual(0);
    const endpoint = await page.evaluate(p => window.__viral.toScreen(p), beam.to);
    // Hide only the pause UI for diagnostic screenshots. The game stays paused;
    // no simulation state, camera, or effect timing is modified.
    await page.locator('#overlay-host').evaluate(el => { (el as HTMLElement).style.visibility = 'hidden'; });
    await page.waitForTimeout(100);
    const beforeCapture = await snapshot(page);
    await page.screenshot({ path: info.outputPath('contact.png') });
    const afterCapture = await snapshot(page);
    expect(beforeCapture.tick).toBe(paused!.tick); expect(afterCapture.tick).toBe(paused!.tick);
    expect(errors).toEqual([]);
    writeFileSync(info.outputPath('evidence.json'), JSON.stringify({ low, paused, fire, beam, actual, bodyAsset, emitter, bodyHandScreen, weaponGripScreen,
      muzzleScreen, handGripError, projectedGrip: grip, projectedMuzzle: muzzle, forward, endpoint, beforeCapture, afterCapture, errors,
      note: 'Real training inputs; actual new native transforms and atlas/source landmarks independently reconstruct grip/muzzle. Pause overlay is hidden only for the screenshot; frozen snapshots bracket capture. The true wall endpoint and clamp branch remain asserted in both effects modes.' }, null, 2));
  });
}
