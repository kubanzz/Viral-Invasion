import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.tools/playwright-browsers');

export default defineConfig({
  testDir: './tests/mobile', testMatch: 'responsive-layout.spec.ts',
  timeout: 45_000, expect: { timeout: 10_000 }, workers: 1, fullyParallel: false, retries: 0,
  outputDir: 'artifacts/responsive-layout-20261102/browser',
  reporter: [['list'], ['json', { outputFile: 'artifacts/responsive-layout-20261102/browser-report.json' }]],
  use: { headless: true, viewport: { width: 1366, height: 768 }, hasTouch: false, deviceScaleFactor: 1,
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'responsive-chrome', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'responsive-edge', use: { browserName: 'chromium', channel: 'msedge' } },
    { name: 'responsive-webkit', use: { browserName: 'webkit' } },
  ],
});
