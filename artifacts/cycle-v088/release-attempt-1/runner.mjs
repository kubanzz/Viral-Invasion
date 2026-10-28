import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, dirname } from 'node:path';
const root = process.cwd(), work = resolve('.tools/cycle-v088-release'), evidence = resolve('artifacts/cycle-v088/release-attempt-1');
if (existsSync(evidence)) throw Error('Preserve prior release qualification.');
mkdirSync(evidence, { recursive: true }); copyFileSync(new URL(import.meta.url), join(evidence, 'runner.mjs'));
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const env = { ...process.env, VI_ART_SOURCE: join(work, 'unavailable-upstream') };
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
env[pathKey] = [resolve('.tools/v075-npm-bin'), dirname(process.execPath), env[pathKey]].join(';');
const npm = resolve('.tools/node_modules/npm/bin/npm-cli.js');
const commands = [], summary = { version: '0.8.8', work, at: new Date().toISOString(), status: 'running', commands,
  scope: 'Frozen gameplay and UI over the verified v0.8.7 art/rendering snapshot; no current production build or in-flight artwork changed. Full nonbatch regression is new; the 1000-session campaign batch is not rerun or relabeled.', mainDistBefore: sha('dist/game.js') };
const save = () => writeFileSync(join(evidence, 'summary.json'), JSON.stringify(summary, null, 2));
const require = createRequire(join(work, 'package.json'));
summary.dependencies = Object.fromEntries(['phaser', 'esbuild', 'sharp', 'vitest'].map(name => [name, require.resolve(name)]));
if (Object.values(summary.dependencies).some(path => !path.startsWith(join(work, 'node_modules')))) throw Error('Dependencies are not independent.');
save();
async function run(label, args) {
  const row = { label, args, cwd: work, startedAt: new Date().toISOString(), status: 'running' }; commands.push(row); save();
  const child = spawn(process.execPath, [npm, ...args], { cwd: work, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output += bytes.toString(); });
  console.log(`${label}: started`);
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  row.exitCode = exitCode; row.finishedAt = new Date().toISOString(); row.status = exitCode === 0 ? 'passed' : 'failed'; row.log = `${label}.log`;
  writeFileSync(join(evidence, row.log), output); row.logSha256 = sha(join(evidence, row.log)); save(); console.log(`${label}: exit ${exitCode}`);
  if (exitCode !== 0) throw Error(`${label} failed\n${output.slice(-2500)}`);
}
try {
  await run('01-build', ['run', 'build']);
  const meta = JSON.parse(readFileSync(join(work, 'dist/build-meta.json'), 'utf8'));
  summary.gameSha256 = sha(join(work, 'dist/game.js')); summary.buildInputs = Object.keys(meta.sourceManifest).length;
  copyFileSync(join(work, 'dist/build-meta.json'), join(evidence, 'tested-build-meta.json'));
  await run('02-nonbatch-tests', ['test', '--', '--exclude', 'tests/unit/full-system-seeds.test.ts', '--maxWorkers=2', '--reporter=default', '--reporter=json', `--outputFile=${join(evidence, 'unit.json')}`]);
  const unit = JSON.parse(readFileSync(join(evidence, 'unit.json'), 'utf8'));
  summary.tests = { success: unit.success, files: unit.testResults.length, passed: unit.numPassedTests, failed: unit.numFailedTests, pending: unit.numPendingTests };
  summary.mainDistUnchanged = summary.mainDistBefore === sha('dist/game.js');
  summary.sourceMatches = Object.entries(meta.sourceManifest).every(([path, hash]) => sha(join(work, path)) === hash);
  if (!summary.mainDistUnchanged || !summary.sourceMatches || !unit.success) throw Error('Final source/build verification failed.');
  summary.status = 'passed'; summary.pass = true;
} catch (error) { summary.status = 'failed'; summary.pass = false; summary.error = String(error.stack ?? error); process.exitCode = 1; }
finally { summary.finishedAt = new Date().toISOString(); save(); console.log(JSON.stringify({ status: summary.status, tests: summary.tests, gameSha256: summary.gameSha256, error: summary.error })); }
