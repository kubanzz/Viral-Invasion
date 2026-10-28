import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw Error('pass a label such as before or after');
const entry = pathToFileURL(resolve(`artifacts/dpr2-quality/${label}-build/index.html`)).href;
const folder = resolve(`artifacts/dpr2-quality/${label}`); await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
for (const dpr of [1, 2]) {
  const context = await browser.newContext({ viewport: { width: 900, height: 650 }, deviceScaleFactor: dpr, offline: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = document.createElement.bind(document);
    const created = [];
    document.createElement = (...args) => {
      const item = original(...args);
      if (item instanceof HTMLCanvasElement) created.push(item);
      return item;
    };
    Object.defineProperty(window, '__dprAuditCanvases', { value: created });
  });
  await page.goto(`${entry}?seed=130026`); await page.locator('[data-action="start"]').click();
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(200);
  const diagnostic = await page.evaluate(() => ({
    dpr: devicePixelRatio, phaser: window.__viral.diagnostics().phaser,
    canvases: window.__dprAuditCanvases.map(canvas => ({ width: canvas.width, height: canvas.height }))
  }));
  const screenshot = `dpr-${dpr}.png`; await page.screenshot({ path: `${folder}/${screenshot}` });
  results.push({ dpr, screenshot, diagnostic, errors }); await context.close();
}
await writeFile(`${folder}/report.json`, JSON.stringify({ entry, results }, null, 2));
await browser.close();
console.log(JSON.stringify(results.map(({ dpr, diagnostic, errors }) => ({ dpr, layers: diagnostic.canvases.filter(c => c.width >= 900 && c.height >= 650), host: diagnostic.phaser.dpr, errors }))));
