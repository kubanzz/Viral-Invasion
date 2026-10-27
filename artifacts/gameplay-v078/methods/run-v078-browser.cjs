const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const project = process.argv[2], attempt = process.argv[3];
if (!['chrome', 'edge'].includes(project) || !/^[a-z0-9-]+$/.test(attempt ?? '')) throw Error('Expected browser and a new attempt name');
const prefix = `artifacts/gameplay-v078/${attempt}`;
if (existsSync(`${prefix}-report.json`) || existsSync(`${prefix}-results`)) throw Error('Preserve existing browser evidence');
const mode = process.argv[4] === 'mode';
const result = spawnSync(process.execPath, ['node_modules/playwright/cli.js', 'test', mode ? 'tests/e2e/endless-v077.spec.ts' : 'tests/e2e/gameplay-v078.spec.ts', `--project=${project}`, ...(mode ? ['--grep', 'mode isolation'] : [])], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, VI_E2E_OUTPUT: `${prefix}-results`, VI_E2E_REPORT: `${prefix}-report.json`, VI_E2E_HTML: `${prefix}-html`, VI_E2E_LEAN: '1' },
});
process.exitCode = result.status ?? 1;
