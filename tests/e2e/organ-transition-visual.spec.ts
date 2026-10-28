import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { aim, chooseDraftInput, readState } from './campaignDriver';
import { HeldMovement } from './heldMovement';
import { g3Input } from '../helpers/g3Driver';
import { LUNG_WORLD } from '../../src/game/organConfig';
import { Camera } from '../../src/render/camera';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });

test('records a natural heart-to-lung transition using real inputs', async ({ page, context }, info) => {
  test.setTimeout(190_000);
  await context.setOffline(true); await page.setViewportSize({ width: 1366, height: 768 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${entry}?seed=91`); await page.locator('[data-action="start"]').click();
  const movement = new HeldMovement(page);
  let lastScan = -10, lastInteract = -10, armed = false, capturedHeart = false;
  let arrived = false, stopped = '';
  const deadline = Date.now() + 165_000;
  try {
    while (Date.now() < deadline) {
      const s = await readState(page);
      await movement.syncOrgan(s.battle!.organId);
      if (s.phase === 'result') { stopped = `result: ${s.result?.reason}`; break; }
      if (await page.locator('[data-action="close-migration-guide"]').isVisible()) {
        await movement.release(); await page.mouse.up(); await page.locator('[data-action="close-migration-guide"]').click(); continue;
      }
      if (s.growth?.draft) { await movement.release(); await page.mouse.up(); await chooseDraftInput(page); continue; }
      if (s.phase !== 'playing') { stopped = `phase: ${s.phase}`; break; }
      if (!armed && s.campaign!.migration.status === 'warning') {
        armed = true;
        await page.evaluate(() => {
          const frames: unknown[] = []; (window as any).__transitionFrames = frames;
          let previous = '', after = 0;
          const record = (time: number) => {
            const state = window.__viral.snapshot(), organ = state.battle?.organId ?? '';
            const diagnostics = window.__viral.diagnostics() as any;
            const sprite = diagnostics.phaser.nativeSprites.find((item: { id: string }) => item.id === 'player');
            const origin = window.__viral.toScreen({ x: 0, y: 0 });
            frames.push({ time, organ, tick: state.tick, phase: state.phase,
              player: { x: state.player.x, y: state.player.y }, cameraOrigin: origin,
              screenPlayer: window.__viral.toScreen(state.player), sprite: sprite ? { x: sprite.x, y: sprite.y } : null });
            if (frames.length > 50 && !after) frames.shift();
            if (previous === 'heart' && organ === 'lung') after = 1;
            else if (after) after++;
            previous = organ;
            if (after < 12) requestAnimationFrame(record);
          };
          requestAnimationFrame(record);
        });
      }
      if (s.battle!.organId === 'lung') {
        arrived = true; await movement.release(); await page.mouse.up();
        await page.waitForTimeout(250);
        await page.screenshot({ path: info.outputPath('lung-after.png') });
        break;
      }
      const input = g3Input(s, 'pursue');
      if (!capturedHeart && s.campaign!.migration.status === 'warning' && input.interact) {
        capturedHeart = true; await movement.release(); await page.mouse.up();
        await page.screenshot({ path: info.outputPath('heart-before.png') });
      }
      if (s.tool !== input.tool) await page.keyboard.press(`Digit${input.tool}`);
      await aim(page, input.aim); if (input.fire) await page.mouse.down(); else await page.mouse.up();
      if (s.elapsed - lastScan > 3.1) { await page.keyboard.press('KeyQ'); lastScan = s.elapsed; }
      if (input.interact && s.elapsed - lastInteract > .25) { await page.keyboard.press('KeyE'); lastInteract = s.elapsed; }
      await movement.move(input.moveX, input.moveY); await page.waitForTimeout(85);
    }
  } finally { await movement.release(); await page.mouse.up(); }
  const final = await readState(page);
  const frames = await page.evaluate(() => (window as any).__transitionFrames ?? []);
  writeFileSync(info.outputPath('transition-evidence.json'), JSON.stringify({ scope: 'Offline headless real-input route, read-only frame observations; not the in-app browser.', armed, capturedHeart, arrived, stopped, errors, final, frames }, null, 2));
  expect(arrived, stopped || 'route timed out').toBe(true);
  expect(capturedHeart).toBe(true);
  const index = frames.findIndex((frame: any, i: number) => i > 0 && frames[i - 1].organ === 'heart' && frame.organ === 'lung');
  expect(index, JSON.stringify(frames)).toBeGreaterThan(0);
  const first = frames[index];
  expect(first.sprite).not.toBeNull();
  // The first visible destination frame uses the new location and a snapped
  // destination camera, not an interpolation from the previous organ.
  const camera = new Camera(1366, 768);
  camera.follow(first.player, LUNG_WORLD, { snap: true });
  const expectedOrigin = camera.worldToScreen({ x: 0, y: 0 });
  expect(first.cameraOrigin.x).toBeCloseTo(expectedOrigin.x, 4);
  expect(first.cameraOrigin.y).toBeCloseTo(expectedOrigin.y, 4);
  expect(first.sprite.x).toBeCloseTo(first.screenPlayer.x, 4);
  expect(first.sprite.y).toBeCloseTo(first.screenPlayer.y, 4);
  expect(first.player).toEqual({ x: 450, y: 1060 });
  expect(errors).toEqual([]);
});
