import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd(), output = resolve(root, 'artifacts/tactics-v082/browser-final-1');
if (existsSync(output)) throw new Error('Preserve existing browser evidence');
mkdirSync(output, { recursive: true });
const checks = [];
// These are production offline pages, DOM controls, real keys and read-only
// snapshots. Run the browsers serially; this is not a frame-rate measurement.
for (const project of ['chrome', 'edge']) {
  const args = ['node_modules/playwright/cli.js', 'test', 'tests/e2e/gameplay-v078.spec.ts', 'tests/e2e/endless-v077.spec.ts',
    `--project=${project}`, '--grep', 'five natural waves|mode isolation'];
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, VI_E2E_OUTPUT: resolve(output, project, 'output'), VI_E2E_REPORT: resolve(output, project, 'report.json'),
      VI_E2E_HTML: resolve(output, project, 'html'), VI_E2E_LEAN: '1' } });
  checks.push({ project, exitCode: result.status, signal: result.signal, command: args });
  writeFileSync(resolve(output, 'summary.json'), JSON.stringify({ scope: 'Offline real DOM input and mode/5-wave smoke; no performance or human-readability claim.', checks }, null, 2));
  if (result.status !== 0) { process.exitCode = 1; break; }
}
