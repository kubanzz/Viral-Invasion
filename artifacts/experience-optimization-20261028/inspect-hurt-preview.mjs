import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('artifacts/experience-optimization-20261028/hurt-preview-evidence');
await mkdir(output); // Preserve any earlier evidence.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const snapshot = () => page.evaluate(() => {
  const s = window.__viral.snapshot(), d = window.__viral.diagnostics();
  return { phase: s.phase, elapsed: s.elapsed, tick: s.tick, hp: s.player.hp, facing: s.player.facing,
    events: s.events.filter(e => e.type === 'PLAYER_HURT'), animation: d.art.heroAnimation,
    player: d.phaser.nativeSprites.find(s => s.id === 'player'), tool: d.phaser.nativeSprites.find(s => s.id === 'player:tool') };
});
const result = { scope: 'Isolated actual Renderer and selected idle + unapproved hurt frames. Real UI training practice-hit; no simulation state injection.', errors, trials: [] };
try {
  await page.goto('http://127.0.0.1:4185/?scenario=training&seed=71');
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => window.__viral.diagnostics().art.heroAnimation.enabledClips.includes('hurt'));
  for (const [side, x] of [['right', 1000], ['left', 350]]) {
    await page.mouse.move(x, 360);
    await page.waitForTimeout(200);
    await page.locator('[data-action="help"]').first().click();
    const before = await snapshot();
    await page.evaluate(() => {
      window.__hurtSamples = [];
      const collect = () => {
        const s = window.__viral.snapshot(), d = window.__viral.diagnostics(), f = d.art.heroAnimation.frame;
        window.__hurtSamples.push({ wall: performance.now(), tick: s.tick, elapsed: s.elapsed, hp: s.player.hp,
          phase: s.phase, frame: f, native: d.phaser.nativeSprites.find(v => v.id === 'player')?.frame,
          tool: d.phaser.nativeSprites.find(v => v.id === 'player:tool')?.frame });
        if (window.__hurtSamples.length < 100 && !window.__hurtStop) requestAnimationFrame(collect);
      }; requestAnimationFrame(collect);
    });
    await page.locator('[data-action="practice-hit"]').click();
    // Capture several real browser frames; screenshot timestamps bracketed by
    // diagnostics to avoid claiming an image was a particular frame if it advanced.
    const screenshots = [];
    for (let i = 0; i < 4; i++) {
      const first = await snapshot(), path = `${output}/${side}-${i}.png`;
      await page.screenshot({ path });
      const last = await snapshot(); screenshots.push({ path, first, last });
    }
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__hurtStop = true; });
    const samples = await page.evaluate(() => window.__hurtSamples), after = await snapshot();
    await page.evaluate(() => { window.__hurtStop = false; });
    const hurt = samples.filter(s => s.frame?.clip === 'hurt');
    const firstHurt = hurt[0], nextIdle = samples.find(s => s.tick > (firstHurt?.tick ?? Infinity) && s.frame?.clip === 'idle');
    if (after.hp !== before.hp - 5 || !after.events.some(e => e.data.damage === 5 && e.data.reason === 'training-exercise')) throw Error(`${side}: positive practice damage missing`);
    if (!hurt.some(s => s.frame.index === 0) || !hurt.some(s => s.frame.index === 1) || !nextIdle) throw Error(`${side}: both hurt frames and return to idle not observed`);
    if (hurt.some(s => s.native !== s.frame.id || s.tool !== 'weapon.emitter.painted')) throw Error(`${side}: native sprite or tool missing`);
    if (hurt.some(s => s.frame.flipX !== (side === 'left'))) throw Error(`${side}: mirror incorrect`);
    if (nextIdle.tick - firstHurt.tick !== 9) throw Error(`${side}: hurt duration ${nextIdle.tick-firstHurt.tick} ticks, expected 9`);
    result.trials.push({ side, before, after, firstHurt, nextIdle, hurt, samples, screenshots });
  }
  // Real pause during a new positive hit. Input timing is recorded; if the
  // 150ms reaction elapsed before pausing, no freeze claim is made.
  await page.locator('[data-action="help"]').first().click();
  await page.locator('[data-action="practice-hit"]').click();
  await page.keyboard.press('Escape');
  const pause1 = await snapshot(); await page.waitForTimeout(650); const pause2 = await snapshot();
  result.pause = { before: pause1, after: pause2 };
  if (pause1.phase !== 'paused' || pause2.tick !== pause1.tick || JSON.stringify(pause1.animation.frame) !== JSON.stringify(pause2.animation.frame)) throw Error('Pause did not freeze presentation');
  result.pauseDuringHurt = pause1.animation.frame?.clip === 'hurt';
  if (!result.pauseDuringHurt) throw Error('Pause arrived after the hurt animation; cannot verify freezing the hurt frame');
  if (errors.length) throw Error(errors.join('; '));
  result.pass = true;
} catch (error) { result.pass = false; result.error = String(error.stack ?? error); process.exitCode = 1; }
finally { await writeFile(`${output}/report.json`, JSON.stringify(result, null, 2)); await browser.close(); }
console.log(JSON.stringify({ pass: result.pass, error: result.error, trials: result.trials.map(t => ({ side:t.side, start:t.firstHurt.tick, end:t.nextIdle.tick })), pauseDuringHurt:result.pauseDuringHurt, output }));
