import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [buildDirectory, outputDirectory] = process.argv.slice(2);
if (!buildDirectory || !outputDirectory) throw Error('Provide the offline build and capture directory.');
const output = resolve(outputDirectory);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { method: 'Offline production bundle; ordinary keyboard and pointer inputs. Screenshots are visual evidence, not a performance measurement.', errors: [], captures: [] };
try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, offline: true });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(`${pathToFileURL(resolve(buildDirectory, 'index.html')).href}?seed=130026`);
    await page.locator('[data-action="start"]').click();
    await page.waitForFunction(() => window.__viral?.snapshot().tick > 10);
    await page.mouse.move(viewport.width * .7, viewport.height * .46);
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    // Capture the unobstructed battlefield after resuming so the camera/actor
    // placement can also be compared at a normal input-driven frame.
    await page.locator('[data-action="continue"]').click();
    const file = `campaign-${viewport.width}.png`;
    await page.screenshot({ path: resolve(output, file) });
    report.captures.push({ file, viewport, snapshot: await page.evaluate(() => window.__viral.snapshot()) });
    if (viewport.width > 1000) {
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(260);
      await page.screenshot({ path: resolve(output, 'walking.png') });
      await page.keyboard.up('KeyD');
      await page.mouse.down();
      await page.waitForTimeout(80);
      await page.screenshot({ path: resolve(output, 'shooting.png') });
      await page.mouse.up();
      report.motionDiagnostics = await page.evaluate(() => window.__viral.diagnostics());
      for (const [direction, angle] of [['right', 0], ['down-right', Math.PI / 4], ['down', Math.PI / 2], ['down-left', Math.PI * .75], ['left', Math.PI], ['up-left', -Math.PI * .75], ['up', -Math.PI / 2], ['up-right', -Math.PI / 4]]) {
        const player = await page.evaluate(() => window.__viral.toScreen(window.__viral.snapshot().player));
        await page.mouse.move(player.x + Math.cos(angle) * 220, player.y + Math.sin(angle) * 220);
        await page.waitForTimeout(100);
        await page.screenshot({ path: resolve(output, `aim-${direction}.png`), clip: {
          x: Math.max(0, Math.round(player.x - 110)), y: Math.max(0, Math.round(player.y - 130)), width: 220, height: 180 } });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
}
if (report.errors.length) throw Error(report.errors.join('\n'));
console.log(`Saved battlefield and eight-direction screenshots to ${output}.`);
