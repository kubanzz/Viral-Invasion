import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = process.cwd(), original = resolve('artifacts/reproduction-v087/attempt-1');
const evidence = resolve('artifacts/reproduction-v087/continuation-1');
if (existsSync(evidence)) throw Error('Preserve prior continuation.');
mkdirSync(evidence, { recursive: true }); copyFileSync(fileURLToPath(import.meta.url), join(evidence, 'runner.mjs'));
const previous = JSON.parse(readFileSync(join(original, 'summary.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(original, 'frozen-inputs.json'), 'utf8'));
const { work, isolatedRoot, expectedBuild: expected } = previous;
const sha = value => createHash('sha256').update(value).digest('hex');
const fileSha = path => sha(readFileSync(path));
const save = (name, data) => writeFileSync(join(evidence, name), JSON.stringify(data, null, 2) + '\n');
if (previous.status !== 'failed' || previous.commands[1].exitCode !== 0 || previous.commands[2].exitCode !== 1) throw Error('Unexpected prior state.');
for (const [path, entry] of Object.entries(manifest)) if (fileSha(join(work, path)) !== entry.sha256 || fileSha(path) !== entry.sha256) throw Error(`Frozen source changed: ${path}`);
if (lstatSync(join(work, 'node_modules')).isSymbolicLink()) throw Error('Shared dependencies.');
const npmCli = resolve('.tools/node_modules/npm/bin/npm-cli.js');
const toolBin = join(isolatedRoot, 'npm-launcher'); mkdirSync(toolBin);
const launcher = `@echo off\r\n"${process.execPath}" "${npmCli}" %*\r\n`;
writeFileSync(join(toolBin, 'npm.cmd'), launcher); writeFileSync(join(evidence, 'npm-launcher.cmd'), launcher);
const env = { ...process.env, VI_ART_SOURCE: join(isolatedRoot, 'nonexistent-upstream') };
delete env.NODE_PATH;
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
env[pathKey] = [toolBin, dirname(process.execPath), env[pathKey] ?? ''].join(sep === '\\' ? ';' : ':');
const commands = [], summary = { version: '0.8.7', status: 'running', pass: false, startedAt: new Date().toISOString(), originalAttempt: 'artifacts/reproduction-v087/attempt-1/summary.json', originalAttemptSha256: fileSha(join(original, 'summary.json')), originalFailurePreserved: true,
  reason: 'The first independent npm ci succeeded. The environment-provided npm.cmd has an invalid prefix-relative path, so nested npm run typecheck failed before compilation. Resume the identical independently installed snapshot with an absolute Node/npm launcher. No source edits, new dependency install, seed replacement or original-result rewriting.',
  root, work, isolatedRoot, toolBin, npmCli, commands, archive: previous.archive, archiveSha256: previous.archiveSha256, sourceFiles: previous.sourceFiles,
  method: previous.method, initialConditions: previous.initiallyAbsent, resolvedDependencies: previous.resolvedDependencies };
save('summary.json', summary);
async function run(label, args) {
  const row = { label, executable: process.execPath, args, cwd: work, startedAt: new Date().toISOString(), status: 'running' };
  commands.push(row); save('commands.json', commands); console.log(`${label}: started`);
  const child = spawn(process.execPath, args, { cwd: work, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  row.pid = child.pid; let output = '';
  child.stdout.on('data', bytes => output += bytes.toString()); child.stderr.on('data', bytes => output += bytes.toString());
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  Object.assign(row, { exitCode, endedAt: new Date().toISOString(), status: exitCode === 0 ? 'passed' : 'failed', log: `${label}.log`, logSha256: sha(output) });
  writeFileSync(join(evidence, row.log), output); save('commands.json', commands); console.log(`${label}: exit ${exitCode}`);
  if (exitCode !== 0) throw Error(`${label} failed: ${exitCode}; ${output.slice(-2200)}`);
}
try {
  await run('01-npm-build', [npmCli, 'run', 'build']);
  summary.build = Object.fromEntries(Object.entries(expected).map(([path, expectedSha256]) => {
    const actualSha256 = fileSha(join(work, 'dist', path)); return [path, { expectedSha256, actualSha256, equal: expectedSha256 === actualSha256 }];
  }));
  if (Object.values(summary.build).some(entry => !entry.equal)) throw Error('Independent build differs.');
  const meta = JSON.parse(readFileSync(join(work, 'dist/build-meta.json'), 'utf8'));
  const mainMeta = JSON.parse(readFileSync('dist/build-meta.json', 'utf8'));
  if (JSON.stringify(meta.sourceManifest) !== JSON.stringify(mainMeta.sourceManifest)) throw Error('Build input manifests differ.');
  for (const [path, hash] of Object.entries(meta.sourceManifest)) if (fileSha(join(work, path)) !== hash) throw Error(`Build input differs: ${path}`);
  summary.buildInputs = Object.keys(meta.sourceManifest).length;
  const art = JSON.parse(readFileSync(join(work, '.art-generated/art-sync-report.json'), 'utf8'));
  summary.artSource = { mode: art.sourceMode, sourceRoot: env.VI_ART_SOURCE, upstreamExists: existsSync(env.VI_ART_SOURCE) };
  if (art.sourceMode !== 'local-snapshot' || summary.artSource.upstreamExists) throw Error('Upstream is not isolated.');
  save('summary.json', summary);
  await run('02-npm-test', [npmCli, 'test', '--', '--maxWorkers=2', '--reporter=default', '--reporter=json', `--outputFile=${join(evidence, 'unit.json')}`]);
  const unit = JSON.parse(readFileSync(join(evidence, 'unit.json'), 'utf8'));
  const sessions = JSON.parse(readFileSync(join(work, 'artifacts/unit-generated/full-system-seeds.json'), 'utf8'));
  summary.tests = { success: unit.success, files: unit.testResults.length, passed: unit.numPassedTests, failed: unit.numFailedTests, pending: unit.numPendingTests };
  summary.sessions = { complete: sessions.complete, completed: sessions.completedSeeds, outcomes: sessions.outcomes };
  copyFileSync(join(work, 'artifacts/unit-generated/full-system-seeds.json'), join(evidence, 'full-system-seeds.json'));
  if (!unit.success || unit.numFailedTests || !sessions.complete || sessions.completedSeeds !== 1000) throw Error('Independent full tests failed.');
  const changes = Object.entries(manifest).filter(([path, entry]) => fileSha(join(work, path)) !== entry.sha256 || fileSha(path) !== entry.sha256).map(([path]) => path);
  summary.sourceChanges = changes;
  summary.mainBuildUnchanged = Object.entries(expected).every(([path, hash]) => fileSha(join(root, 'dist', path)) === hash);
  if (changes.length || !summary.mainBuildUnchanged) throw Error('Source or main build changed.');
  summary.status = 'awaiting-dev'; summary.installBuildTestsPassed = true;
  summary.devPending = 'A real PTY npm run dev, HTTP request, and normal q/Enter stop will be recorded separately.';
} catch (error) {
  summary.status = 'failed'; summary.error = String(error.stack ?? error); process.exitCode = 1; console.error(String(error));
} finally {
  summary.finishedAt = new Date().toISOString(); save('summary.json', summary);
  console.log(JSON.stringify({ status: summary.status, evidence, build: summary.build, tests: summary.tests, sessions: summary.sessions, error: summary.error }));
}
