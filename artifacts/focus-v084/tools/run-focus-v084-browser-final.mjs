import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd(), output = resolve(root, 'artifacts/focus-v084/browser-attempt-2');
if (existsSync(output)) throw new Error('Preserve browser evidence'); mkdirSync(output, { recursive: true });
const checks = [];
for (const project of ['chrome', 'edge']) {
  const args = ['node_modules/playwright/cli.js', 'test', 'tests/e2e/focus-v084.spec.ts', `--project=${project}`];
  const result = spawnSync(process.execPath, args, { cwd: root, windowsHide: true, stdio: 'inherit',
    env: { ...process.env, VI_E2E_OUTPUT: resolve(output, project, 'output'), VI_E2E_REPORT: resolve(output, project, 'report.json'),
      VI_E2E_HTML: resolve(output, project, 'html'), VI_E2E_LEAN: '1' } });
  checks.push({ project, exitCode: result.status, signal: result.signal, command: args });
  writeFileSync(resolve(output, 'summary.json'), JSON.stringify({ scope: 'Production offline natural focus Q, real bite, pause, compact status and empty-ground redirect; no FPS or human comprehension claim.', checks }, null, 2));
  if (result.status !== 0) { process.exitCode = 1; break; }
}
