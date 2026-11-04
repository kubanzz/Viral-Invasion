import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: resolve('tests/e2e'), testMatch: 'modal-pointer-intent.spec.ts', workers: 1, retries: 0,
  outputDir: resolve('artifacts/territory-20261103/input-compat-completed-webkit/browser'),
  reporter: [['list'], ['json', { outputFile: resolve('artifacts/territory-20261103/input-compat-completed-webkit/report.json') }]],
  use: { browserName: 'webkit', headless: true, viewport: { width: 667, height: 320 }, hasTouch: true },
});
