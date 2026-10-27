import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const evidence = resolve('artifacts/reproduction-v087/attempt-1');
const archive = resolve('releases/Viral-Invasion-SourceCandidate-v0.8.7.zip');
if (existsSync(evidence) || existsSync(archive)) throw Error('Preserve prior reproduction attempts.');
mkdirSync(evidence, { recursive: true });
copyFileSync(fileURLToPath(import.meta.url), join(evidence, 'runner.mjs'));
const sha = value => createHash('sha256').update(value).digest('hex');
const fileSha = path => sha(readFileSync(path));
const slash = path => path.split(sep).join('/');
const save = (name, value) => writeFileSync(join(evidence, name), JSON.stringify(value, null, 2) + '\n');
const frozenMeta = JSON.parse(readFileSync('dist/build-meta.json', 'utf8'));
const expected = Object.fromEntries(['game.js', 'index.html', 'build-meta.json'].map(name => [name, fileSha(join(root, 'dist', name))]));
if (expected['game.js'] !== '27a37e8a83be3b077037991e05826970629cfca01d83ce07dee5cd30e6e8b4ae') throw Error('Wrong candidate build.');
for (const [path, hash] of Object.entries(frozenMeta.sourceManifest)) if (fileSha(path) !== hash) throw Error(`Candidate input changed: ${path}`);
const isolatedRoot = mkdtempSync(join(tmpdir(), 'viral-reproduction-v087-'));
const staging = join(isolatedRoot, 'source'), work = join(isolatedRoot, 'work');
mkdirSync(staging); mkdirSync(work);
const paths = new Set();
function include(path) {
  const absolute = resolve(root, path), rel = relative(root, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error(`Unsafe source path: ${path}`);
  const info = lstatSync(absolute);
  if (info.isSymbolicLink()) throw Error(`Source symlink: ${path}`);
  if (info.isDirectory()) for (const name of readdirSync(absolute).sort()) include(join(path, name));
  else if (info.isFile()) paths.add(slash(rel));
}
for (const directory of ['src', 'scripts', 'tests', 'asserts', 'Docs', 'DesignDoc_v1.3']) include(directory);
for (const name of readdirSync(root)) if (/^(?:package(?:-lock)?\.json|.*\.config\.ts|tsconfig\.json|index\.html|README\.md|Start-Game\.cmd|\.gitignore|\.gitattributes)$/.test(name)) include(name);
// Frozen real-session fixtures and the geometric helper are inputs to existing tests.
for (const path of [...paths].filter(path => path.startsWith('tests/') && path.endsWith('.ts'))) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/['"`]((?:\.\.\/\.\.\/)?artifacts\/[^'"`\r\n]+)['"`]/g)) {
    let dependency = match[1].replace(/^\.\.\/\.\.\//, '');
    if (dependency.startsWith('artifacts/unit-generated/')) continue;
    if (!existsSync(dependency) && existsSync(dependency + '.ts')) dependency += '.ts';
    if (existsSync(dependency)) include(dependency);
  }
}
const inputManifest = {};
for (const path of [...paths].sort()) {
  const bytes = readFileSync(path), target = join(staging, path);
  mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
  inputManifest[path] = { sha256: sha(bytes), bytes: bytes.length };
}
save('frozen-inputs.json', inputManifest);
const commands = [], env = { ...process.env, VI_ART_SOURCE: join(isolatedRoot, 'nonexistent-upstream') };
delete env.NODE_PATH;
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
const npmCli = resolve('.tools/node_modules/npm/bin/npm-cli.js');
env[pathKey] = [dirname(process.execPath), dirname(npmCli), env[pathKey] ?? ''].join(sep === '\\' ? ';' : ':');
const summary = { version: '0.8.7', startedAt: new Date().toISOString(), status: 'running', root, isolatedRoot, work, archive,
  node: process.version, npm: JSON.parse(readFileSync(resolve(dirname(npmCli), '../package.json'), 'utf8')).version,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
  method: 'Frozen complete worktree snapshot, independently archived/extracted into a fresh temporary directory. No node_modules, generated art, dist, Git data, or links are copied. npm ci installs independent dependencies; local artwork is regenerated with an unavailable upstream. This is snapshot reproducibility, not a clean Git HEAD claim.',
  sourceFiles: paths.size, sourceBytes: Object.values(inputManifest).reduce((sum, entry) => sum + entry.bytes, 0), expectedBuild: expected,
  originalBuildInputs: Object.keys(frozenMeta.sourceManifest).length, commands };
save('summary.json', summary);
async function run(label, executable, args, cwd = work) {
  const row = { label, executable, args, cwd, startedAt: new Date().toISOString(), status: 'running' };
  commands.push(row); save('commands.json', commands);
  console.log(`${label}: started`);
  const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', bytes => { output += bytes.toString(); });
  child.stderr.on('data', bytes => { output += bytes.toString(); });
  row.pid = child.pid;
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  Object.assign(row, { exitCode, endedAt: new Date().toISOString(), status: exitCode === 0 ? 'passed' : 'failed', log: `${label}.log`, logSha256: sha(output) });
  writeFileSync(join(evidence, row.log), output); save('commands.json', commands);
  console.log(`${label}: exit ${exitCode}`);
  if (exitCode !== 0) throw Error(`${label} failed: ${exitCode}; ${output.slice(-1800)}`);
}
try {
  const python = 'C:/Users/SEASUN/AppData/Local/Programs/Python/Python312/python.exe';
  await run('01-archive-and-extract', python, ['-c',
    'import pathlib,sys,zipfile\nsrc=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); target=pathlib.Path(sys.argv[3])\nwith zipfile.ZipFile(out,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:\n for p in sorted(src.rglob("*")):\n  if p.is_file(): z.write(p,p.relative_to(src).as_posix())\nwith zipfile.ZipFile(out) as z:\n assert z.testzip() is None\n z.extractall(target)\nprint("Archive CRC and extraction passed")', staging, archive, work], isolatedRoot);
  summary.archiveSha256 = fileSha(archive);
  summary.archiveBytes = lstatSync(archive).size;
  for (const [path, entry] of Object.entries(inputManifest)) if (fileSha(join(work, path)) !== entry.sha256) throw Error(`Archive mismatch: ${path}`);
  for (const name of ['node_modules', 'dist', '.art-generated', '.git']) if (existsSync(join(work, name))) throw Error(`Not a clean source snapshot: ${name}`);
  summary.initiallyAbsent = ['node_modules', 'dist', '.art-generated', '.git'];
  save('summary.json', summary);
  await run('02-npm-ci', process.execPath, [npmCli, 'ci', '--no-audit', '--no-fund']);
  if (lstatSync(join(work, 'node_modules')).isSymbolicLink()) throw Error('Dependencies must not be linked.');
  const require = createRequire(join(work, 'package.json'));
  summary.resolvedDependencies = Object.fromEntries(['esbuild', 'vitest', 'phaser', 'sharp', 'vite'].map(name => {
    const path = require.resolve(name);
    if (!path.startsWith(join(work, 'node_modules') + sep)) throw Error(`Shared dependency: ${name}`);
    return [name, path];
  }));
  await run('03-npm-build', process.execPath, [npmCli, 'run', 'build']);
  summary.build = Object.fromEntries(Object.entries(expected).map(([path, expectedSha256]) => {
    const actualSha256 = fileSha(join(work, 'dist', path));
    return [path, { expectedSha256, actualSha256, equal: expectedSha256 === actualSha256 }];
  }));
  if (Object.values(summary.build).some(entry => !entry.equal)) throw Error('Independent build is not byte-identical.');
  const meta = JSON.parse(readFileSync(join(work, 'dist/build-meta.json'), 'utf8'));
  for (const [path, expectedHash] of Object.entries(frozenMeta.sourceManifest)) if (fileSha(join(work, path)) !== expectedHash) throw Error(`Independent build input mismatch: ${path}`);
  summary.independentBuildInputs = Object.keys(meta.sourceManifest).length;
  const artReport = JSON.parse(readFileSync(join(work, '.art-generated/art-sync-report.json'), 'utf8'));
  summary.artSource = { mode: artReport.sourceMode, sourceAvailable: artReport.sourceAvailable, sourceRoot: env.VI_ART_SOURCE };
  if (artReport.sourceMode !== 'local-snapshot' || existsSync(env.VI_ART_SOURCE)) throw Error('Upstream artwork was not isolated.');
  save('summary.json', summary);
  await run('04-npm-test', process.execPath, [npmCli, 'test', '--', '--maxWorkers=2', '--reporter=default', '--reporter=json', `--outputFile=${join(evidence, 'unit.json')}`]);
  const unit = JSON.parse(readFileSync(join(evidence, 'unit.json'), 'utf8'));
  const sessions = JSON.parse(readFileSync(join(work, 'artifacts/unit-generated/full-system-seeds.json'), 'utf8'));
  summary.tests = { success: unit.success, files: unit.testResults.length, passed: unit.numPassedTests, failed: unit.numFailedTests, pending: unit.numPendingTests };
  summary.sessions = { complete: sessions.complete, completed: sessions.completedSeeds, outcomes: sessions.outcomes };
  copyFileSync(join(work, 'artifacts/unit-generated/full-system-seeds.json'), join(evidence, 'full-system-seeds.json'));
  if (!unit.success || unit.numFailedTests || !sessions.complete || sessions.completedSeeds !== 1000) throw Error('Full independent tests did not pass.');
  const changed = [];
  for (const [path, entry] of Object.entries(inputManifest)) if (fileSha(join(root, path)) !== entry.sha256 || fileSha(join(work, path)) !== entry.sha256) changed.push(path);
  summary.sourceChanges = changed;
  summary.mainBuildUnchanged = Object.entries(expected).every(([name, hash]) => fileSha(join(root, 'dist', name)) === hash);
  if (changed.length || !summary.mainBuildUnchanged) throw Error('Source or main build changed during reproduction.');
  summary.status = 'awaiting-dev'; summary.installBuildTestsPassed = true; summary.pass = false;
  summary.devPending = 'npm run dev will be exercised separately through a real PTY, HTTP request and normal q/Enter exit.';
} catch (error) {
  summary.status = 'failed'; summary.pass = false; summary.error = String(error.stack ?? error); process.exitCode = 1;
  console.error(String(error));
} finally {
  summary.finishedAt = new Date().toISOString(); save('summary.json', summary);
  console.log(JSON.stringify({ status: summary.status, pass: summary.pass, evidence, tests: summary.tests, sessions: summary.sessions, error: summary.error }));
}
