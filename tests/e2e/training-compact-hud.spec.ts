import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
const sizes = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 480, height: 720 },
  { width: 600, height: 640 }, { width: 800, height: 600 }, { width: 1280, height: 720 }];
test.use({ video: 'off', trace: 'off' });

async function assertLayout(page: Page, info: TestInfo, size: { width: number; height: number }) {
  const evidence = await page.evaluate(() => {
    const selectors = ['.topbar', '.objective', '.telemetry', '.dock-wrap', '.message',
      '.top-actions [data-action="sound"]', '.top-actions [data-action="help"]', '.top-actions [data-action="pause"]',
      '[data-action="tool-1"]', '[data-action="tool-2"]', '[data-action="tool-3"]'];
    const bounds = Object.fromEntries(selectors.map(selector => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return [selector, { left: r.left, top: r.top, right: r.right, bottom: r.bottom }];
    }));
    const textSelectors = ['.brand strong', '.top-actions button', '.objective .eyebrow', '.objective h2', '.objective li span',
      '.telemetry label', '.telemetry p', '.tool kbd', '.tool strong', '.tool small', '.ability-name', '.ability em'];
    const clipped: string[] = [];
    for (const selector of textSelectors) for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (!element.getClientRects().length) continue;
      const clip = element.closest('.objective,.telemetry,.tool,.ability,.topbar')!.getBoundingClientRect();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const r of range.getClientRects()) if (r.left < clip.left - 1 || r.right > clip.right + 1 || r.top < clip.top - 1 || r.bottom > clip.bottom + 1
          || r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) clipped.push(`${selector}: ${node.textContent.trim()}`);
      }
      if (element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).display !== 'inline') clipped.push(`${selector}: horizontal overflow`);
    }
    return { bounds, clipped, viewport: { width: innerWidth, height: innerHeight } };
  });
  writeFileSync(info.outputPath(`layout-${size.width}x${size.height}.json`), JSON.stringify(evidence, null, 2));
  const b = evidence.bounds;
  for (const [selector, rect] of Object.entries(b)) {
    expect(rect.left, selector).toBeGreaterThanOrEqual(-1); expect(rect.right, selector).toBeLessThanOrEqual(size.width + 1);
    expect(rect.top, selector).toBeGreaterThanOrEqual(-1); expect(rect.bottom, selector).toBeLessThanOrEqual(size.height + 1);
  }
  const overlaps = (a: typeof b[string], c: typeof b[string]) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
  for (const [a, c] of [['.topbar', '.objective'], ['.topbar', '.telemetry'], ['.objective', '.telemetry'],
    ['.objective', '.dock-wrap'], ['.telemetry', '.dock-wrap'], ['.message', '.dock-wrap']]) expect(overlaps(b[a], b[c]), `${a} vs ${c}`).toBe(false);
  expect(evidence.clipped).toEqual([]);
  for (const tool of [1, 2, 3]) {
    await page.locator(`[data-action="tool-${tool}"]`).click();
    await expect.poll(() => page.evaluate(() => window.__viral.snapshot().tool)).toBe(tool);
  }
  await page.screenshot({ path: info.outputPath(`training-${size.width}x${size.height}.png`) });
}

test('training HUD remains usable across viewport changes', async ({ page, context }, info) => {
  await context.setOffline(true); await page.setViewportSize(sizes[0]);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${entry}?scenario=training&seed=71`);
  await page.locator('[data-action="start"]').click();
  for (const size of [...sizes, sizes[0]]) {
    await page.setViewportSize(size);
    await assertLayout(page, info, size);
  }
  expect(errors).toEqual([]);
});

test('campaign layout is unchanged from the preceding build', async ({ browser }, info) => {
  test.skip(!process.env.VI_BASELINE_ENTRY, 'Provide VI_BASELINE_ENTRY to compare the preceding build');
  const baseline = pathToFileURL(resolve(process.env.VI_BASELINE_ENTRY!)).href;
  const capture = async (url: string) => {
    const context = await browser.newContext({ viewport: sizes[0], offline: true });
    const page = await context.newPage(); await page.goto(`${url}?seed=130026`);
    await page.locator('[data-action="start"]').click();
    const result = await page.evaluate(() => {
      const selectors = ['.topbar', '.battle-objective', '.battle-telemetry', '.dock-wrap', '.message', '.growth-panel', '.organ-overview'];
      return Object.fromEntries(selectors.map(selector => {
        const node = document.querySelector<HTMLElement>(selector)!, r = node.getBoundingClientRect(), s = getComputedStyle(node);
        return [selector, { left: r.left, top: r.top, right: r.right, bottom: r.bottom, fontSize: s.fontSize, display: s.display }];
      }));
    });
    await page.screenshot({ path: info.outputPath(url === baseline ? 'campaign-baseline.png' : 'campaign-current.png') });
    await context.close(); return result;
  };
  const [before, after] = [await capture(baseline), await capture(entry)];
  writeFileSync(info.outputPath('campaign-layout-comparison.json'), JSON.stringify({ before, after }, null, 2));
  expect(after).toEqual(before);
});
