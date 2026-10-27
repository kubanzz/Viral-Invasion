import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd(), out = resolve('artifacts/duet-v087/browser-attempt-2');
if (existsSync(out)) throw Error('Preserve final browser evidence');
mkdirSync(out, { recursive: true });
cpSync('dist/build-meta.json', resolve(out, 'tested-build-meta.json'));
cpSync('tests/e2e/duet-v087.spec.ts', resolve(out, 'tested-test.ts'));
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
writeFileSync(resolve(out, 'tested-game-hash.json'), JSON.stringify({ gameSha256: sha('dist/game.js'), testSha256: sha('tests/e2e/duet-v087.spec.ts') }, null, 2), { flag: 'wx' });
const checks = [];
for (const project of ['chrome', 'edge']) {
  const args = ['node_modules/playwright/cli.js', 'test', 'tests/e2e/duet-v087.spec.ts', `--project=${project}`];
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, args, { cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env,
    VI_E2E_OUTPUT: resolve(out, project, 'output'), VI_E2E_REPORT: resolve(out, project, 'report.json'), VI_E2E_HTML: resolve(out, project, 'html'), VI_E2E_LEAN: '1' } });
  checks.push({ project, args, startedAt, finishedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal });
  writeFileSync(resolve(out, 'summary.json'), JSON.stringify({ checks, scope: 'Final V2 natural seed71 public inputs; no injection/retry. Hold-fire orbit at20 specifically observes two real elite tactics, complete recovery,8s warning, pause and normal/compact scroll. Not balance or human comprehension.' }, null, 2));
  if (result.status !== 0) { process.exitCode = 1; break; }
}
if (sha('dist/game.js') !== JSON.parse(readFileSync(resolve(out, 'tested-game-hash.json'), 'utf8')).gameSha256) throw Error('Build changed during browser run');
