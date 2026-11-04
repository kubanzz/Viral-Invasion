import { webkit } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.tools/playwright-browsers');
const browser = await webkit.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  await context.setOffline(true);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__inputAudit = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) addEventListener(type, event => {
      window.__inputAudit.push({ type, constructor: event.constructor.name, detail: event.detail, pointerId: event.pointerId,
        pointerType: event.pointerType, target: event.target?.closest?.('[data-action]')?.getAttribute('data-action') ?? event.target?.tagName,
        trusted: event.isTrusted, defaultPrevented: event.defaultPrevented });
    }, { capture: true });
  });
  await page.goto(pathToFileURL(resolve('releases/Viral-Invasion-Mobile.html')).href + '?seed=41');
  await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('aria-busy') !== 'true');
  await page.locator('[data-action="endless-start"]').tap();
  await page.waitForTimeout(250);
  const result = await page.evaluate(() => ({ phase: window.__viral.snapshot().phase, events: window.__inputAudit }));
  await writeFile(resolve('artifacts/territory-20261103/mobile-webkit-input-audit.json'), JSON.stringify({ scope: 'Read-only native browser event listeners. No game-state writes.', errors, ...result }, null, 2));
  console.log(JSON.stringify({ errors, ...result }));
} finally { await browser.close(); }
