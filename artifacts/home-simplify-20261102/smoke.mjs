import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = resolve('artifacts/home-simplify-20261102');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const reports = [];
const entry = pathToFileURL(resolve('dist/index.html')).href;
const mobileEntry = pathToFileURL(resolve('releases/Viral-Invasion-Mobile.html')).href;
const cases = [
  { name: 'desktop-1366x768', width: 1366, height: 768, touch: false },
  { name: 'touch-844x390', width: 844, height: 390, touch: true },
  { name: 'touch-667x320', width: 667, height: 320, touch: true },
];

async function menu(page) {
  await expect(page.locator('#overlay-host .challenge-home')).toBeVisible();
  await expect(page.locator('#overlay-host button')).toHaveCount(1);
  await expect(page.locator('#overlay-host [data-action="endless-start"]')).toHaveText(/连续挑战/);
  await expect(page.locator('#overlay-host [data-action="start"], #overlay-host [data-action="profile"], #overlay-host [data-action="starting-plan"]')).toHaveCount(0);
}

async function waveOne(page) {
  await expect.poll(() => page.evaluate(() => window.__viral.snapshot().phase)).toBe('playing');
  const state = await page.evaluate(() => window.__viral.snapshot());
  expect(state.endless?.wave).toBe(1);
  expect(state.campaign).toBeUndefined();
  return { phase: state.phase, wave: state.endless.wave, campaign: !!state.campaign };
}

try {
  for (const spec of cases) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.touch, deviceScaleFactor: 1 });
    await context.setOffline(true);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const result = { ...spec, errors };
    reports.push(result);
    try {
      result.entry = spec.touch ? mobileEntry : entry;
      await page.goto(`${result.entry}?seed=71${spec.touch ? '&mobile=1' : ''}`);
      await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
      await menu(page);
      result.layout = await page.evaluate(() => {
        const overlay = document.querySelector('.challenge-home');
        const card = document.querySelector('.challenge-home-card');
        const button = document.querySelector('.challenge-home-start');
        const rect = el => { const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
        return { viewport:{ width:innerWidth, height:innerHeight }, doc:{ width:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight }, overlay:{ ...rect(overlay), scrollWidth:overlay.scrollWidth, clientWidth:overlay.clientWidth, scrollHeight:overlay.scrollHeight, clientHeight:overlay.clientHeight }, card:rect(card), button:rect(button), touchMode:document.body.classList.contains('touch-mode') };
      });
      expect(result.layout.doc.width).toBeLessThanOrEqual(spec.width);
      expect(result.layout.overlay.scrollWidth).toBeLessThanOrEqual(result.layout.overlay.clientWidth);
      expect(result.layout.overlay.scrollHeight).toBeLessThanOrEqual(result.layout.overlay.clientHeight);
      expect(result.layout.card.left).toBeGreaterThanOrEqual(0);
      expect(result.layout.card.bottom).toBeLessThanOrEqual(spec.height);
      expect(result.layout.touchMode).toBe(spec.touch);
      result.screenshot = resolve(out, `${spec.name}.png`);
      await page.screenshot({ path: result.screenshot });
      if (spec.touch) await page.locator('#overlay-host [data-action="endless-start"]').tap();
      else await page.locator('#overlay-host [data-action="endless-start"]').click();
      result.firstStart = await waveOne(page);
      if (spec.touch) await page.locator('#mobile-controls [data-action="pause"]').tap();
      else await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => window.__viral.snapshot().phase)).toBe('paused');
      if (spec.touch) await page.locator('#overlay-host [data-action="menu"]').tap();
      else await page.locator('#overlay-host [data-action="menu"]').click();
      await menu(page);
      if (spec.touch) await page.locator('#overlay-host [data-action="endless-start"]').tap();
      else {
        await page.locator('#overlay-host [data-action="endless-start"]').focus();
        await page.keyboard.press('Enter');
      }
      result.returnStart = await waveOne(page);
      expect(errors).toEqual([]);
      result.passed = true;
    } catch (e) {
      result.passed = false;
      result.failure = e.stack ?? String(e);
      await page.screenshot({ path: resolve(out, `${spec.name}-failure.png`) }).catch(() => {});
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await writeFile(resolve(out, 'smoke-report.json'), JSON.stringify({ method:'Real DOM click/Enter/tap against offline dist/index.html (desktop) and latest single HTML mobile package (touch); no game state writes.', reports }, null, 2));
}
console.log(JSON.stringify(reports, null, 2));
if (reports.some(result => !result.passed)) process.exitCode = 1;
