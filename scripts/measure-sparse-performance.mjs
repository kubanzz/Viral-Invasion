// Read-only browser observation of the initial campaign, not a human playtest.
// Usage: node scripts/measure-sparse-performance.mjs <offline-build-dir> <new-output-dir>
// Uses only real game UI controls and snapshots; does not alter game state or capture screenshots.
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { summarizeFrameIntervals } from './perf-frame-analysis.mjs';

const [buildArg, outputArg] = process.argv.slice(2);
if (!buildArg || !outputArg) throw Error('Provide the offline build directory and a new output directory');
const build = resolve(buildArg), output = resolve(outputArg), durationMs = 30000;
const gameJs = await readFile(resolve(build, 'game.js'));
await readFile(resolve(build, 'index.html'));
await mkdir(output); // Never overwrite a previous observation.
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  status: 'running', method: 'Offline headless Chrome, initial campaign and real quality UI. No screenshot, forced GC, game-state injection, or desktop interaction. Browser-side snapshots once per second may add observation overhead. Frames include all intervals.',
  build, gameJsSha256: sha256(gameJs), scriptSha256: sha256(await readFile(new URL(import.meta.url))),
  setup: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2, durationMs, seed: 130026, offline: true },
  device: { os: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
  errors: [], modes: {},
};
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  report.device.browser = browser.version();
  for (const mode of ['standard', 'low']) {
    const context = await browser.newContext({ viewport: report.setup.viewport, deviceScaleFactor: 2, offline: true });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ mode, message: String(error) }));
    try {
      await page.goto(`${pathToFileURL(resolve(build, 'index.html')).href}?seed=${report.setup.seed}`);
      await page.locator('[data-action="start"]').click();
      await page.keyboard.press('Escape');
      const effects = page.locator('#overlay-host [data-action="effects"]');
      await effects.waitFor({ state: 'visible', timeout: 8000 });
      let label = await effects.textContent();
      const desired = mode === 'low' ? '低' : '标准';
      if (!label?.includes(desired)) {
        await effects.click();
        await page.waitForFunction(value => document.querySelector('#overlay-host [data-action="effects"]')?.textContent?.includes(value), desired, { timeout: 8000 });
        label = await effects.textContent();
      }
      if (!label?.includes(desired)) throw Error(`Could not verify ${mode} quality: ${label}`);
      await page.locator('[data-action="continue"]').click();
      await page.waitForTimeout(1000);
      const observed = await page.evaluate(duration => new Promise((resolveObservation, reject) => {
        const frames = [], samples = [], startMs = performance.now();
        let last = null, nextSample = startMs, finished = false;
        const observe = now => {
          if (finished) return;
          try {
            if (last !== null) frames.push({ startMs: last, endMs: now, durationMs: now - last });
            last = now;
            if (now >= nextSample) {
              const state = window.__viral.snapshot();
              samples.push({ atMs: now, phase: state.phase, elapsed: state.elapsed, tick: state.tick,
                livingTargets: state.targets.filter(target => target.hp > 0).length,
                livingViruses: state.targets.filter(target => target.role === 'virus' && target.hp > 0).length,
                cells: state.growth?.cells?.length ?? 0, hp: state.player.hp, organ: state.battle?.organId ?? null });
              nextSample = now + 1000;
            }
            if (now - startMs >= duration) { finished = true; resolveObservation({ startMs, endMs: now, frames, samples }); return; }
            requestAnimationFrame(observe);
          } catch (error) { finished = true; reject(error); }
        };
        requestAnimationFrame(observe);
        setTimeout(() => { if (!finished) { finished = true; reject(new Error('rAF observation exceeded 45 seconds')); } }, duration + 15000);
      }), durationMs);
      const activeSamples = observed.samples.filter(sample => sample.phase === 'playing');
      const modeResult = { qualityLabel: label, startMs: observed.startMs, endMs: observed.endMs,
        summary: summarizeFrameIntervals(observed.frames), samples: observed.samples,
        allSamplesPlaying: activeSamples.length === observed.samples.length,
        countsScope: 'Approximate one-second snapshots, not proof of the count at every frame.' };
      report.modes[mode] = modeResult;
      await writeFile(resolve(output, `${mode}-frame-intervals.json`), JSON.stringify(observed.frames));
    } finally { await context.close(); }
  }
  report.status = report.errors.length ? 'completed-with-page-errors' : 'completed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack ?? String(error); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ status: report.status, gameJsSha256: report.gameJsSha256,
  modes: Object.fromEntries(Object.entries(report.modes).map(([name, result]) => [name, { ...result.summary, allSamplesPlaying: result.allSamplesPlaying }])) }));
