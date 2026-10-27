import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
const base = mode === 'delivery' ? 'artifacts/duet-v087/release' : 'artifacts/duet-v087/render-label-v3';
const directory = resolve(root, base);
const commands = {
  checks: [
    ['v3-integrate', ['.tools/integrate-duet-v087-label-v3.mjs']],
    ['v3-strict', ['node_modules/typescript/bin/tsc', '--noEmit']],
    ['v3-presentation14', ['node_modules/vitest/vitest.mjs', 'run', 'tests/unit/elite-cycle-presentation.test.ts',
      'tests/unit/endless-evolution-warning.test.ts', '--maxWorkers=1', '--reporter=json',
      '--outputFile=artifacts/duet-v087/render-label-v3/presentation14.json']],
    ['v3-build', ['scripts/build-offline.mjs']],
    ['v3-lineage', ['.tools/verify-duet-v087-label-v3-lineage.mjs']],
  ],
  replay: [['v3-presentation-replay', ['.tools/replay-duet-v087-label-v3.mjs']]],
  delivery: [
    ['v3-preserve-preview', ['.tools/preserve-duet-v087-ui-v2.mjs']],
    ['v3-prepare-delivery', ['.tools/prepare-delivery-v087-v3.mjs']],
    ['v3-package', ['scripts/package-release.mjs']],
    ['v3-inspection2', ['.tools/inspect-v087-release-v3.mjs', '--run', '--attempt=2']],
    ['v3-offline2', ['.tools/verify-offline-v087-v3.mjs']],
  ],
};
if (!commands[mode]) throw Error('Expected checks, replay, or delivery');
mkdirSync(directory, { recursive: true });
const summary = resolve(directory, `v3-${mode}-commands.json`);
const outputs = [summary, ...commands[mode].flatMap(([name]) => [resolve(directory, `${name}.stdout.log`), resolve(directory, `${name}.stderr.log`)])];
if (mode === 'checks') outputs.push(resolve(directory, 'presentation14.json'));
if (mode === 'delivery') outputs.push(resolve(root, 'artifacts/duet-v087/release/inspection-2'), resolve(root, 'artifacts/duet-v087/release/offline-smoke-2'));
for (const path of outputs) if (existsSync(path)) throw Error(`Preserve existing V3 evidence: ${path}`);
const checks = [];
for (const [name, args] of commands[mode]) {
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ starting: name, args }));
  const result = spawnSync(process.execPath, args, { cwd: root, windowsHide: true, encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024, env: { ...process.env, VI_PACKAGE_REPORT: 'artifacts/releases/v0.8.7/release-package.json' } });
  writeFileSync(resolve(directory, `${name}.stdout.log`), result.stdout ?? '', { flag: 'wx' });
  writeFileSync(resolve(directory, `${name}.stderr.log`), result.stderr ?? '', { flag: 'wx' });
  const row = { name, args, startedAt, finishedAt: new Date().toISOString(), exitCode: result.status,
    signal: result.signal, error: result.error ? String(result.error) : null };
  checks.push(row);
  console.log(JSON.stringify(row));
  if (result.status !== 0) break;
}
const pass = checks.length === commands[mode].length && checks.every(row => row.exitCode === 0);
writeFileSync(summary, JSON.stringify({ mode, pass, checks }, null, 2) + '\n', { flag: 'wx' });
if (!pass) process.exitCode = 1;
