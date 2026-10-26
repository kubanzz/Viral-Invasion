import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: process.env.VI_E2E_OUTPUT ?? 'artifacts/e2e-results',
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.VI_E2E_REPORT ?? 'artifacts/e2e-report.json' }],
    ['html', { outputFolder: process.env.VI_E2E_HTML ?? 'artifacts/playwright-report', open: 'never' }],
  ],
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    actionTimeout: 8_000,
    screenshot: 'only-on-failure',
    video: { mode: 'on', size: { width: 1366, height: 768 } },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    { name: 'edge', use: { channel: 'msedge' } },
  ],
});
