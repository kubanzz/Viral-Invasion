import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const output = resolve(process.env.VI_CHECK_OUTPUT ?? 'artifacts/experience-optimization-20261028/narrow-hud-baseline');
const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'artifacts/experience-optimization-20261028/synced-build/index.html')).href;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const observations = [];
for (const size of [{ width: 480, height: 600 }, { width: 360, height: 640 }]) {
  const page = await browser.newPage({ viewport: size });
  await page.goto(`${entry}?seed=130026`);
  await page.locator('[data-action="start"]').click();
  await page.waitForTimeout(500);
  const selector = ['.dock-wrap', '.growth-panel', '.organ-overview', '.message', '.battle-objective', '.battle-telemetry', '.topbar'];
  const boxes = Object.fromEntries(await Promise.all(selector.map(async name => [name, await page.locator(name).boundingBox()])));
  await page.screenshot({ path: `${output}/${size.width}x${size.height}.png` });
  observations.push({ size, boxes });
  await page.close();
}
await browser.close();
await writeFile(`${output}/observations.json`, JSON.stringify(observations, null, 2));
console.log(JSON.stringify(observations));
