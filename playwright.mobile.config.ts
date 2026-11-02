import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.tools/playwright-browsers');

export default defineConfig({
  testDir: './tests/mobile', testMatch: 'offline-touch.spec.ts', timeout: 45_000, expect: { timeout: 10_000 },
  workers: 1, fullyParallel: false, retries: 0,
  outputDir: 'artifacts/mobile-moba-20261101/browser',
  reporter: [['list'], ['json', { outputFile: 'artifacts/mobile-moba-20261101/browser-report.json' }]],
  use: { headless: true, viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 1,
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-chrome', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'mobile-edge', use: { browserName: 'chromium', channel: 'msedge' } },
    { name: 'mobile-webkit', use: { browserName: 'webkit' } },
  ],
});
