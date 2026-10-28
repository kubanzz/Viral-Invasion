import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, dirname } from 'node:path';
const work = resolve('.tools/combat-v090-release'), folder = resolve('artifacts/combat-v090/release-attempt-1');
if (existsSync(folder) || existsSync(join(work, 'node_modules')) || existsSync(join(work, 'dist'))) throw Error('Fresh isolated source required.');
mkdirSync(folder, { recursive: true }); copyFileSync(new URL(import.meta.url), join(folder, 'runner.mjs'));
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const npm = resolve('.tools/node_modules/npm/bin/npm-cli.js');
const env = { ...process.env, VI_ART_SOURCE: join(work, 'unavailable-upstream') };
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
env[pathKey] = [resolve('.tools/v075-npm-bin'), dirname(process.execPath), env[pathKey]].join(';');
const commands = [], result = { version: '0.9.0', work, startedAt: new Date().toISOString(), status: 'running', commands,
  mainDistBefore: sha('dist/game.js'), scope: 'Independent dependency install and frozen source build/nonbatch rules for landing blade/traction/capsule and fixed challenge strikes; frozen old art/rendering. No new1000 campaign batch, performance, or human acceptance.' };
const save = () => writeFileSync(join(folder, 'summary.json'), JSON.stringify(result, null, 2));
async function run(label, args) {
  const row = { label, command: [process.execPath, npm, ...args], cwd: work, startedAt: new Date().toISOString(), status: 'running' }; commands.push(row); save();
  const child = spawn(process.execPath, [npm, ...args], { cwd: work, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => output += bytes.toString());
  console.log(`${label}: started`);
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  Object.assign(row, { exitCode, finishedAt: new Date().toISOString(), status: exitCode === 0 ? 'passed' : 'failed', log: `${label}.log` });
  writeFileSync(join(folder, row.log), output); row.logSha256 = sha(join(folder, row.log)); save(); console.log(`${label}: exit ${exitCode}`);
  if (exitCode !== 0) throw Error(`${label} failed\n${output.slice(-3000)}`);
}
try {
  await run('01-install', ['ci', '--no-audit', '--no-fund']);
  const require = createRequire(join(work, 'package.json'));
  result.dependencies = Object.fromEntries(['esbuild', 'vitest', 'phaser', 'sharp'].map(name => [name, require.resolve(name)]));
  if (Object.values(result.dependencies).some(path => !path.startsWith(join(work, 'node_modules')))) throw Error('Dependency escaped isolated directory.');
  await run('02-build', ['run', 'build']);
  const meta = JSON.parse(readFileSync(join(work, 'dist/build-meta.json'), 'utf8'));
  result.gameSha256 = sha(join(work, 'dist/game.js')); result.buildInputs = Object.keys(meta.sourceManifest).length;
  copyFileSync(join(work, 'dist/build-meta.json'), join(folder, 'tested-build-meta.json'));
  await run('03-rules', ['test', '--', '--exclude', 'tests/unit/full-system-seeds.test.ts', '--maxWorkers=2', '--reporter=default', '--reporter=json', `--outputFile=${join(folder, 'unit.json')}`]);
  const unit = JSON.parse(readFileSync(join(folder, 'unit.json'), 'utf8'));
  result.tests = { success: unit.success, files: unit.testResults.length, passed: unit.numPassedTests, failed: unit.numFailedTests, pending: unit.numPendingTests };
  result.mainDistUnchanged = sha('dist/game.js') === result.mainDistBefore;
  result.sourceMatches = Object.entries(meta.sourceManifest).every(([path, expected]) => sha(join(work, path)) === expected);
  if (!unit.success || !result.mainDistUnchanged || !result.sourceMatches) throw Error('Frozen source or rules verification failed.');
  result.status = 'passed'; result.pass = true;
} catch (error) { result.status = 'failed'; result.pass = false; result.error = String(error.stack ?? error); process.exitCode = 1; }
finally { result.finishedAt = new Date().toISOString(); save(); console.log(JSON.stringify({ status: result.status, tests: result.tests, gameSha256: result.gameSha256, error: result.error })); }
