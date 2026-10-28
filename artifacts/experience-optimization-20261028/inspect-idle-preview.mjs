import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('artifacts/experience-optimization-20261028/idle-preview-evidence-v3');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const frame = () => page.evaluate(() => window.__viral.diagnostics().art.heroAnimation);
const snapshot = () => page.evaluate(() => window.__viral.snapshot());
const result = { fps: 4, samples: [], transitions: [], errors };
try {
  await page.goto('http://127.0.0.1:4184/?seed=130026');
  await page.locator('[data-action="start"]').click();
  await page.mouse.move(1000, 360);
  // Sampling happens in the browser frame loop; screenshot IPC is deliberately
  // separate because capturing every image can take longer than a 250ms frame.
  result.samples = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let previous = -1; const deadline = performance.now() + 6500;
    function observe() {
      const current = window.__viral.diagnostics().art.heroAnimation.frame;
      if (current?.clip === 'idle' && current.index !== previous) {
        const state = window.__viral.snapshot();
        samples.push({ index: current.index, id: current.id, animated: current.animated,
          elapsed: state.elapsed, tick: state.tick, flipX: current.flipX, wall: performance.now() });
        previous = current.index;
      }
      if (samples.length >= 16 || performance.now() >= deadline) resolve(samples); else requestAnimationFrame(observe);
    }
    requestAnimationFrame(observe);
  }));
  if (result.samples.length < 13 || !result.samples.every((sample, i, all) => i === 0 || sample.index === (all[i - 1].index + 1) % 4)) throw new Error('Idle loop did not produce at least three ordered cycles');
  for (let index = 0; index < 4; index++) {
    await page.waitForFunction(index => window.__viral.diagnostics().art.heroAnimation.frame?.index === index, index);
    await page.screenshot({ path: `${output}/idle-frame-${index}.png` });
  }
  await page.keyboard.press('Escape');
  const pausedBefore = await frame();
  await page.waitForTimeout(650);
  const pausedAfter = await frame();
  result.transitions.push({ name: 'pause', before: pausedBefore.frame, after: pausedAfter.frame });
  if (JSON.stringify(pausedBefore.frame) !== JSON.stringify(pausedAfter.frame)) throw new Error('Paused frame changed');
  await page.locator('[data-action="continue"]').click();
  await page.mouse.move(350, 360);
  await page.waitForTimeout(200);
  result.transitions.push({ name: 'left', frame: (await frame()).frame, hit: await page.evaluate(() => document.elementFromPoint(350, 360)?.outerHTML.slice(0, 100)), state: (await snapshot()).player });
  await page.screenshot({ path: `${output}/idle-left.png` });
  await page.mouse.move(900, 360);
  await page.waitForTimeout(200);
  result.transitions.push({ name: 'right', frame: (await frame()).frame, hit: await page.evaluate(() => document.elementFromPoint(900, 360)?.outerHTML.slice(0, 100)), state: (await snapshot()).player });
  await page.screenshot({ path: `${output}/idle-right.png` });
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  result.transitions.push({ name: 'moving', frame: (await frame()).frame });
  await page.screenshot({ path: `${output}/moving-fallback.png` });
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(250);
  result.transitions.push({ name: 'idle-again', frame: (await frame()).frame });
  if (!result.transitions.find(t => t.name === 'left').frame.flipX || result.transitions.find(t => t.name === 'right').frame.flipX) throw new Error('Facing did not flip with aim');
  if (result.transitions.find(t => t.name === 'moving').frame.animated || result.transitions.find(t => t.name === 'idle-again').frame.clip !== 'idle') throw new Error('Walk fallback or return to idle failed');
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  result.pass = true;
} catch (error) {
  result.pass = false; result.error = String(error.stack ?? error); process.exitCode = 1;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ pass: result.pass, samples: result.samples, transitions: result.transitions, errors: result.errors, report: `${output}/report.json` }));
