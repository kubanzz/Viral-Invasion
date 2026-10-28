import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const work = resolve('.tools/assault-v0811-release'), evidence = resolve('artifacts/assault-v0811');
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
async function run(label, args, folder, env = {}) {
  const row = { label, cwd: work, args, startedAt: new Date().toISOString() };
  let output = '';
  const child = spawn(process.execPath, args, { cwd: work, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => output += data.toString());
  row.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  row.finishedAt = new Date().toISOString(); row.log = `${label}.log`;
  writeFileSync(join(folder, row.log), output); writeFileSync(join(folder, `${label}.json`), JSON.stringify(row, null, 2));
  if (row.exitCode !== 0) throw Error(`${label} failed\n${output.slice(-2500)}`);
  return row;
}
const release = JSON.parse(readFileSync(join(evidence, 'release-attempt-1/summary.json'), 'utf8'));
if (!release.pass || release.gameSha256 !== sha(join(work, 'dist/game.js'))) throw Error('Validated frozen build required.');
const folder = join(evidence, 'browser-attempt-2');
if (existsSync(folder)) throw Error('Preserve previous browser attempts.');
mkdirSync(folder, { recursive: true }); copyFileSync(new URL(import.meta.url), join(folder, 'runner.mjs'));
await run('natural-guard', [join(work, 'node_modules/@playwright/test/cli.js'), 'test', 'tests/e2e/assault-v0811.spec.ts'], folder, {
  VI_E2E_LEAN: '1', VI_E2E_REPORT: join(folder, 'report.json'), VI_E2E_OUTPUT: join(folder, 'output'), VI_E2E_HTML: join(folder, 'html'),
});
const browser = JSON.parse(readFileSync(join(folder, 'report.json'), 'utf8'));
if (browser.stats.expected !== 2 || browser.stats.unexpected || browser.stats.skipped || browser.stats.flaky) throw Error('Unexpected natural browser coverage.');
await run('package', [join(work, 'scripts/package-release.mjs')], join(evidence, 'release-attempt-1'), { VI_ART_SOURCE: join(work, 'unavailable-upstream'), VI_PACKAGE_REPORT: join(evidence, 'release-attempt-1/package-report.json') });
const zipName = 'Viral-Invasion-G4-v0.8.11.zip', destination = resolve('releases', zipName);
if (existsSync(destination)) throw Error('Preserve existing final ZIP.');
copyFileSync(join(work, 'releases', zipName), destination);
const releaseDir = resolve('releases/Viral-Invasion-G4-v0.8.11');
if (existsSync(releaseDir)) throw Error('Preserve existing final directory.');
mkdirSync(releaseDir);
for (const name of readdirSync(join(work, 'releases/Viral-Invasion-G4-v0.8.11'))) copyFileSync(join(work, 'releases/Viral-Invasion-G4-v0.8.11', name), join(releaseDir, name));
console.log(JSON.stringify({ pass: true, browser: browser.stats, zipSha256: sha(destination), gameSha256: release.gameSha256 }));
