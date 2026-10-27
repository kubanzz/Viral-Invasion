import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const mode = process.argv[2], attempt = process.argv[3] ?? 'attempt-1';
if (!['unit', 'seeds', 'browser'].includes(mode) || !/^attempt-[1-9]\d*$/.test(attempt)) throw Error('Use unit|seeds|browser attempt-N.');
const output = `artifacts/readability-v076/${mode}/${attempt}`;
await mkdir(resolve(output, '..'), { recursive: true }); await mkdir(output);
const env = { ...process.env,
  VI_SYSTEM_REPORT: `${output}/full-system-seeds.json`,
  VI_FORMAL_NONCOUNTER_REPORT: `${output}/formal-noncounter.json`,
  VI_SYNERGY_REPORT_DIR: `${output}/synergy`,
  VI_G2_REPORT: `${output}/g2-noncounter-routes.json`,
  VI_ENEMY_CROWD_REPORT: `${output}/enemy-crowd.json`,
  VI_PRIORITY_PRODUCERS_REPORT: `${output}/priority-producer-coverage.json`,
  VI_E2E_OUTPUT: `${output}/output`, VI_E2E_REPORT: `${output}/report.json`, VI_E2E_HTML: `${output}/report-html`, VI_E2E_LEAN: '1',
};
const args = mode === 'browser'
  ? ['node_modules/@playwright/test/cli.js', 'test', 'tests/e2e/readability-v075.spec.ts', 'tests/e2e/feedback-v061-growth-details.spec.ts', 'tests/e2e/feedback-v062-immune-readability.spec.ts', 'tests/e2e/encounters-v070.spec.ts']
  : ['node_modules/vitest/vitest.mjs', 'run', ...(mode === 'seeds' ? ['tests/unit/full-system-seeds.test.ts'] : ['--exclude=tests/unit/full-system-seeds.test.ts']), '--reporter=default', '--reporter=json', `--outputFile=${output}/vitest.json`];
const startedAt = new Date().toISOString(), logs = [];
const child = spawn(process.execPath, args, { cwd: process.cwd(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs.push(chunk); process.stdout.write(chunk); });
const result = await new Promise((resolveRun, reject) => { child.on('error', reject); child.on('close', (code, signal) => resolveRun({ code, signal })); });
await writeFile(`${output}/stdout.txt`, Buffer.concat(logs));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(`${output}/execution.json`, JSON.stringify({ mode, startedAt, finishedAt: new Date().toISOString(), ...result,
  command: { executable: process.execPath, args }, wrapperSha256: sha256(await readFile(new URL(import.meta.url))), pass: result.code === 0 }, null, 2) + '\n');
process.exitCode = result.code === 0 ? 0 : 1;
