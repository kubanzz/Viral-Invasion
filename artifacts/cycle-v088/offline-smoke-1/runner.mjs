import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const folder = resolve('artifacts/cycle-v088/offline-smoke-1');
if (existsSync(folder)) throw Error('Preserve prior smoke records.');
mkdirSync(folder, { recursive: true }); copyFileSync(new URL(import.meta.url), join(folder, 'runner.mjs'));
const entry = pathToFileURL(resolve('artifacts/cycle-v088/release-inspection-2/unpacked/index.html')).href;
const report = { version: '0.8.8', scope: 'Independently extracted ZIP, separate fresh contexts, offline file launch and pause via actual DOM input. Startup only; the six-wave natural browser integration is separate.', startedAt: new Date().toISOString(), entry, cases: [] };
try {
  for (const channel of ['chrome', 'msedge']) {
    const browser = await chromium.launch({ channel, headless: true });
    try {
      for (const mode of ['campaign', 'endless']) {
        const context = await browser.newContext({ offline: true, viewport: { width: 1366, height: 768 } });
        const page = await context.newPage(), errors = [], remote = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
        try {
          await page.goto(`${entry}?seed=71`);
          await page.locator(`[data-action="${mode === 'endless' ? 'endless-start' : 'start'}"]`).click();
          await page.waitForTimeout(250);
          const state = await page.evaluate(() => window.__viral.snapshot());
          if (state.phase !== 'playing' || state.tick <= 0 || !!state.endless !== (mode === 'endless') || !!state.campaign !== (mode === 'campaign')) throw Error(`Incorrect ${channel}/${mode} entry`);
          await page.keyboard.press('Escape');
          const before = await page.evaluate(() => window.__viral.snapshot());
          await page.waitForTimeout(200);
          const after = await page.evaluate(() => window.__viral.snapshot());
          if (before.phase !== 'paused' || after.tick !== before.tick) throw Error('Pause did not freeze');
          const version = await page.evaluate(() => window.__viral.version);
          if (version !== '0.8.8-G4' || errors.length || remote.length) throw Error('Version or offline error');
          await page.screenshot({ path: join(folder, `${channel}-${mode}.png`) });
          report.cases.push({ channel, mode, pass: true, version, initialTick: state.tick, pausedTick: after.tick, errors, remote });
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  report.pass = report.cases.length === 4 && report.cases.every(row => row.pass);
} catch (error) { report.pass = false; report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  report.finishedAt = new Date().toISOString();
  report.gameSha256 = createHash('sha256').update(readFileSync(resolve('artifacts/cycle-v088/release-inspection-2/unpacked/game.js'))).digest('hex');
  writeFileSync(join(folder, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, cases: report.cases, error: report.error }));
}
