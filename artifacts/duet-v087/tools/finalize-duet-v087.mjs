import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd(), isolate = resolve('.tools/duet-v087-source'), out = resolve('artifacts/duet-v087');
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const mode = process.argv[2];
if (mode === 'integrate') {
  const v1 = JSON.parse(readFileSync(resolve(out, 'integration/frozen-owned-source.json'), 'utf8'));
  const initial = JSON.parse(readFileSync(resolve(isolate, 'isolation-manifest.json'), 'utf8'));
  const changed = ['src/ui/eliteTacticCycleHud.ts', 'src/ui/endlessEvolutionWarning.ts',
    'tests/unit/endless-evolution-warning.test.ts', 'tests/unit/elite-cycle-presentation.test.ts', 'tests/e2e/duet-v087.spec.ts'];
  const browser = JSON.parse(readFileSync(resolve(out, 'browser-attempt-1/summary.json'), 'utf8'));
  if (browser.checks.length !== 2 || browser.checks.some(c => c.exitCode !== 0)) throw Error('Initial browser run must have finished');
  for (const row of v1.rows) if (sha(resolve(root, row.path)) !== row.sha256) throw Error(`Primary V1 changed: ${row.path}`);
  const rows = changed.map(path => {
    const before = v1.rows.find(r => r.path === path) ?? initial.files.find(r => r.path === path);
    if (!before || sha(resolve(root, path)) !== before.sha256) throw Error(`Unowned primary change: ${path}`);
    return { path, beforeSha256: before.sha256, afterSha256: sha(resolve(isolate, path)) };
  });
  for (const row of v1.rows) if (!changed.includes(row.path) && sha(resolve(isolate, row.path)) !== row.sha256) throw Error(`Unexpected isolated change: ${row.path}`);
  const manifestPath = resolve(out, 'integration/frozen-owned-source-v2.json');
  if (existsSync(manifestPath)) throw Error('Preserve V2 integration');
  cpSync(resolve(root, 'tests/e2e/duet-v087.spec.ts'), resolve(out, 'browser-attempt-1/tested-test.ts'), { errorOnExist: true, force: false });
  writeFileSync(resolve(out, 'integration/copied-ui-v2.json'), JSON.stringify({ at: new Date().toISOString(), rows,
    reason: 'Show both explicit tactic counters, retain old warnings, verify normal/compact scrolling and capture real windups. Gameplay unchanged.' }, null, 2), { flag: 'wx' });
  for (const row of rows) cpSync(resolve(isolate, row.path), resolve(root, row.path));
  const allPaths = [...new Set([...v1.rows.map(r => r.path), ...changed])];
  const finalRows = allPaths.map(path => ({ path, sha256: sha(resolve(root, path)) }));
  for (const row of finalRows) if (row.sha256 !== sha(resolve(isolate, row.path))) throw Error(`V2 integration differs: ${row.path}`);
  writeFileSync(manifestPath, JSON.stringify({ at: new Date().toISOString(), version: '0.8.7', revision: 2, rows: finalRows }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ changed: rows.length, owned: finalRows.length, gameplayChanged: false }));
} else {
  const regression = resolve(out, 'regression'); mkdirSync(regression, { recursive: true });
  const commands = {
    rules: [['main-typecheck-final', ['node_modules/typescript/bin/tsc', '--noEmit']],
      ['main-nonseed-final', ['node_modules/vitest/vitest.mjs', 'run', '--exclude', 'tests/unit/full-system-seeds.test.ts', '--maxWorkers=2', '--reporter=json', `--outputFile=${resolve(regression, 'nonseed-results-final.json')}`]]],
    build: [['main-build-final', ['scripts/build-offline.mjs']]],
  };
  if (!commands[mode]) throw Error('Expected integrate, rules or build');
  const report = resolve(regression, `${mode}-commands-final.json`);
  if (existsSync(report)) throw Error('Preserve previous final results');
  for (const [name] of commands[mode]) for (const stream of ['stdout', 'stderr']) if (existsSync(resolve(regression, `${name}-${stream}.txt`))) throw Error('Preserve final stream');
  const checks = [];
  for (const [name, args] of commands[mode]) {
    const startedAt = new Date().toISOString(); console.log(JSON.stringify({ starting: name }));
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 30 * 1024 * 1024, env: process.env });
    for (const stream of ['stdout', 'stderr']) writeFileSync(resolve(regression, `${name}-${stream}.txt`), result[stream] ?? '', { flag: 'wx' });
    checks.push({ name, args, startedAt, finishedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal, error: result.error ? String(result.error) : null });
    writeFileSync(report, JSON.stringify({ mode, checks }, null, 2)); console.log(JSON.stringify(checks.at(-1)));
    if (result.status !== 0) { process.exitCode = 1; break; }
  }
}
