import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

// Preserve the historical filename for existing release commands. This now
// requires the complete replacement actor, not the old idle-only presentation.
test.use({ video: 'off', trace: 'off' });
const entry = `${pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href}?scenario=training&seed=71`;
type Clip = 'idle' | 'walk' | 'hurt' | 'dash';
interface ActorFrame {
  actorId: string; semanticId: string; action: string; clip: Clip; index?: number; frameIndex?: number; frame: string;
  direction: string; authoredDirection: string; flipX: boolean; native: boolean; visible: boolean;
  groupReady: boolean; fallback: boolean; source: { path: string; sha256: string };
}
interface NativeSprite { id: string; frame: string; texture: string; flipX: boolean; visible: boolean; articulated: boolean; x: number; y: number }
interface ProductionDiagnostics {
  art: { actorFrames: ActorFrame[]; actorContract: { version: number; preview?: boolean; animationPreview?: boolean; ready: boolean; oldSourceIds: string[] } };
  phaser: { nativeSprites: NativeSprite[] };
}
interface Sample {
  phase: string; tick: number; elapsed: number; moving: boolean; facing: number; runId?: string;
  expectedClip: Clip; expectedDirection: string; actor?: ActorFrame; sprite?: NativeSprite;
}

async function presentation(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const state = window.__viral.snapshot(), diagnostics = window.__viral.diagnostics() as unknown as ProductionDiagnostics;
    const hurt = state.player.hurtUntil > state.elapsed && state.events.some(event => event.type === 'PLAYER_HURT' && Number(event.data.damage) > 0 && event.tick <= state.tick
      && state.elapsed - event.tick / 60 >= -1e-8 && state.elapsed - event.tick / 60 + 1e-8 < .15);
    return { phase: state.phase, tick: state.tick, elapsed: state.elapsed, moving: state.player.moving, facing: state.player.facing,
      runId: state.runMetrics?.runId,
      expectedClip: state.player.dashUntil > state.elapsed ? 'dash' : hurt ? 'hurt' : state.player.moving ? 'walk' : 'idle',
      expectedDirection: Math.cos(state.player.facing) >= 0 ? Math.sin(state.player.facing) >= 0 ? 'front_right' : 'back_right'
        : Math.sin(state.player.facing) >= 0 ? 'front_left' : 'back_left',
      actor: diagnostics.art.actorFrames?.find(actor => actor.actorId === 'player'),
      sprite: diagnostics.phaser.nativeSprites.find(sprite => sprite.id === 'player') };
  });
}
async function beginTrace(page: Page, durationMs: number) {
  await page.evaluate(durationMs => {
    const buffer = { samples: [] as Sample[], done: false, started: performance.now() };
    (window as unknown as { __heroProductionTrace: typeof buffer }).__heroProductionTrace = buffer;
    const observe = (now: number) => {
      const state = window.__viral.snapshot(), diagnostics = window.__viral.diagnostics() as unknown as ProductionDiagnostics;
      const hurt = state.player.hurtUntil > state.elapsed && state.events.some(event => event.type === 'PLAYER_HURT' && Number(event.data.damage) > 0 && event.tick <= state.tick
        && state.elapsed - event.tick / 60 >= -1e-8 && state.elapsed - event.tick / 60 + 1e-8 < .15);
      buffer.samples.push({ phase: state.phase, tick: state.tick, elapsed: state.elapsed, moving: state.player.moving,
        facing: state.player.facing, runId: state.runMetrics?.runId,
        expectedClip: state.player.dashUntil > state.elapsed ? 'dash' : hurt ? 'hurt' : state.player.moving ? 'walk' : 'idle',
        expectedDirection: Math.cos(state.player.facing) >= 0 ? Math.sin(state.player.facing) >= 0 ? 'front_right' : 'back_right'
          : Math.sin(state.player.facing) >= 0 ? 'front_left' : 'back_left',
        actor: diagnostics.art.actorFrames?.find(actor => actor.actorId === 'player'),
        sprite: diagnostics.phaser.nativeSprites.find(sprite => sprite.id === 'player') });
      if (now - buffer.started < durationMs) requestAnimationFrame(observe); else buffer.done = true;
    };
    requestAnimationFrame(observe);
  }, durationMs);
}
async function finishTrace(page: Page): Promise<Sample[]> {
  await page.waitForFunction(() => (window as unknown as { __heroProductionTrace?: { done: boolean } }).__heroProductionTrace?.done === true);
  return page.evaluate(() => (window as unknown as { __heroProductionTrace: { samples: Sample[] } }).__heroProductionTrace.samples);
}
async function aimQuadrant(page: Page, x: number, y: number) {
  // Starting/retrying clears stale input on the first displayed run frame.
  // A default facing must not satisfy this test before the fresh pointer is read.
  await page.waitForFunction(() => window.__viral.snapshot().phase === 'playing' && window.__viral.snapshot().tick >= 1);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const target = await page.evaluate(({ x, y }) => {
    const state = window.__viral.snapshot(); return window.__viral.toScreen({ x: state.player.x + x * 240, y: state.player.y + y * 220 });
  }, { x, y });
  await page.mouse.move(target.x, target.y);
  const direction = `${y < 0 ? 'back' : 'front'}_${x < 0 ? 'left' : 'right'}`;
  await expect.poll(async () => {
    const sample = await presentation(page);
    return sample.expectedDirection === direction && sample.actor?.direction === direction && sample.sprite?.frame === sample.actor?.frame;
  }).toBe(true);
}
function verifySamples(samples: Sample[], clip: Clip, authoredDirection: 'front_right' | 'back_right') {
  const matching = samples.filter(sample => sample.phase === 'playing' && sample.expectedClip === clip);
  expect(matching.length, `A real ${clip} window must be sampled`).toBeGreaterThanOrEqual(2);
  const displayed = new Set<string>();
  for (const sample of matching) {
    const actor = sample.actor, sprite = sample.sprite;
    expect(actor, 'Production diagnostics must identify the displayed hero').toBeDefined();
    expect(actor!.native && actor!.groupReady && actor!.visible && !actor!.fallback).toBe(true);
    expect(actor!.clip).toBe(clip); expect(actor!.direction).toBe(sample.expectedDirection);
    expect(actor!.authoredDirection).toBe(authoredDirection);
    expect(actor!.semanticId).toMatch(new RegExp(`^fantasy\\.actor\\.hero\\.${authoredDirection}\\.${clip}\\.\\d{2}$`));
    expect(sprite?.frame).toBe(actor!.frame);
    expect(sprite?.frame).toBe(actor!.semanticId);
    expect(sprite?.flipX).toBe(sample.expectedDirection.endsWith('_left'));
    expect(sprite?.articulated, 'New authored frames must be actual sprites, not the old idle Mesh2D gait').toBe(false);
    expect(actor!.source.path.replaceAll('\\', '/').includes('ViralInvasion_Art_v1/')).toBe(false);
    displayed.add(sprite!.frame);
  }
  expect(displayed.size, `Actual ${authoredDirection}.${clip} native frames must advance`).toBeGreaterThanOrEqual(2);
  return { clip, authoredDirection, samples: matching.length, actualFrames: [...displayed] };
}

test('offline production displays all four new hero clips in both authored views and mirrors them honestly', async ({ page, context }, info) => {
  test.setTimeout(45_000); await context.setOffline(true);
  const errors: string[] = [], remote: string[] = [], traces: unknown[] = [], coverage: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  await page.goto(entry); await page.locator('[data-action="start"]').click();
  await expect.poll(async () => page.evaluate(() => {
    const diagnostics = window.__viral.diagnostics() as unknown as ProductionDiagnostics;
    return diagnostics.art.actorContract?.version === 2 && !diagnostics.art.actorContract.preview && !diagnostics.art.actorContract.animationPreview && diagnostics.art.actorContract.ready
      && diagnostics.art.actorContract.oldSourceIds.length === 0;
  })).toBe(true);

  for (const [direction, y] of [['front_right', 1], ['back_right', -1]] as const) {
    await aimQuadrant(page, 1, y); await beginTrace(page, 1400); const idle = await finishTrace(page);
    coverage.push(verifySamples(idle, 'idle', direction)); traces.push({ direction, action: 'idle', samples: idle });
    await beginTrace(page, 1000); await page.keyboard.down(direction === 'front_right' ? 'KeyD' : 'KeyA');
    const walk = await finishTrace(page); await page.keyboard.up(direction === 'front_right' ? 'KeyD' : 'KeyA');
    coverage.push(verifySamples(walk, 'walk', direction)); traces.push({ direction, action: 'walk', samples: walk });
    await aimQuadrant(page, 1, y);
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__viral.snapshot()); return state.player.dashReady <= state.elapsed;
    }).toBe(true);
    await beginTrace(page, 500); await page.keyboard.press('Space'); const dash = await finishTrace(page);
    coverage.push(verifySamples(dash, 'dash', direction)); traces.push({ direction, action: 'dash', samples: dash });
    await aimQuadrant(page, 1, y); await page.keyboard.press('Escape'); await page.locator('#overlay-host [data-action="help"]').click();
    await beginTrace(page, 650); await page.locator('[data-action="practice-hit"]').click(); const hurt = await finishTrace(page);
    coverage.push(verifySamples(hurt, 'hurt', direction)); traces.push({ direction, action: 'hurt', samples: hurt });
  }
  for (const y of [1, -1]) {
    await aimQuadrant(page, -1, y);
    await expect.poll(async () => {
      const sample = await presentation(page);
      return sample.actor?.direction === sample.expectedDirection && sample.sprite?.flipX === true
        && sample.actor?.authoredDirection === (y < 0 ? 'back_right' : 'front_right');
    }).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('new-hero-production.png') });
  writeFileSync(info.outputPath('new-hero-production-frames.json'), JSON.stringify({ evidenceLevel: 'natural-dom-input-rAF', entry, coverage, traces, errors, remote,
    boundary: 'Only idle/walk/hurt/dash are authored body groups. Fire/charge/heal/scan require separate accepted-action/tool-effect evidence in verify-actor-art.mjs.' }, null, 2));
  expect(errors).toEqual([]); expect(remote).toEqual([]);
});

test('new production hero freezes its actual frame on pause and resets its new idle group on retry', async ({ page, context }) => {
  await context.setOffline(true); await page.goto(entry); await page.locator('[data-action="start"]').click();
  await aimQuadrant(page, 1, 1);
  await expect.poll(async () => (await presentation(page)).actor?.semanticId).toMatch(/^fantasy\.actor\.hero\.front_right\.idle\.\d{2}$/);
  await page.keyboard.press('Escape'); await expect.poll(async () => (await presentation(page)).phase).toBe('paused');
  const paused = await presentation(page); await page.waitForTimeout(700); const after = await presentation(page);
  expect(after.tick).toBe(paused.tick); expect(after.actor?.semanticId).toBe(paused.actor?.semanticId);
  expect(after.sprite?.frame).toBe(paused.sprite?.frame); expect(after.sprite?.x).toBe(paused.sprite?.x); expect(after.sprite?.y).toBe(paused.sprite?.y);
  await beginTrace(page, 1200);
  await page.locator('#overlay-host [data-action="retry"]').click();
  const retryFrames = await finishTrace(page);
  const first = retryFrames.find(sample => sample.phase === 'playing' && sample.tick >= 1 && sample.runId !== paused.runId);
  expect(first, 'A new run must display a frame after a real fixed step').toBeDefined();
  const authored = first!.expectedDirection.startsWith('front') ? 'front_right' : 'back_right';
  expect(first!.actor?.semanticId).toBe(`fantasy.actor.hero.${authored}.idle.00`);
  expect(first!.sprite?.frame).toBe(first!.actor?.frame);
  expect(first!.actor?.direction).toBe(first!.expectedDirection);
  const retried = await presentation(page);
  expect(retried.phase).toBe('playing'); expect(retried.runId).not.toBe(paused.runId);
  expect(retried.actor?.clip).toBe('idle');
  expect(retried.sprite?.frame).toBe(retried.actor?.frame); expect(retried.actor?.native && retried.actor.groupReady && !retried.actor.fallback).toBe(true);
});
