import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, open, unlink } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';

const root = 'artifacts/completion-v074';
const lockPath = `${root}/exclusive-browser.lock.json`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function maybeJson(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }

export async function verifyFrozen074() {
  const freezeFile = '.tools/v074-frozen.json';
  const frozen = await maybeJson(freezeFile), build = await maybeJson('dist/build-meta.json');
  const expectedGameSha256 = frozen?.gameSha256;
  if (!frozen || !build || frozen.version !== '0.7.4' || build.version !== '0.7.4'
    || !/^[a-f0-9]{64}$/.test(expectedGameSha256 ?? '') || !frozen.finishedAt || frozen.typecheckExitCode !== 0 || frozen.buildExitCode !== 0
    || Object.keys(build.sourceManifest).length !== frozen.sourceInputCount
    || JSON.stringify(build.sourceManifest) !== JSON.stringify(frozen.sourceManifest)) throw new Error('Expected the latest completed parent-frozen0.7.4 build and identical consumed-input manifest.');
  const checks = await Promise.all(Object.entries(build.sourceManifest).map(async ([path, expected]) => ({ path, expected, current: sha(await readFile(path)) })));
  const outputs = await Promise.all(Object.entries(frozen.outputs).map(async ([path, expected]) => ({ path, expected, current: sha(await readFile(path)) })));
  if (checks.some(row => row.expected !== row.current) || outputs.some(row => row.expected !== row.current)
    || outputs.find(row => row.path === 'dist/game.js')?.current !== expectedGameSha256) throw new Error('Current build or source bytes differ from the frozen074 inputs.');
  return { version: build.version, gameSha256: expectedGameSha256, buildInputCount: checks.length,
    freezeFile, freezeSha256: sha(await readFile(freezeFile)), sourceChecks: checks, outputChecks: outputs };
}

/** Read result-bearing directories only; never inspect/close user's browsers. */
export async function inspectWork074(ignoreOutput) {
  const inspected = [], active = [];
  const scopes = ['browser', 'system', 'visual-live', 'visual-density', 'visual-derived', 'density', 'performance', 'chain-burst'];
  const ignored = ignoreOutput ? resolve(ignoreOutput) : '';
  async function visit(folder, depth = 0) {
    if (resolve(folder) === ignored || depth > 3) return;
    let entries; try { entries = await readdir(folder, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    const names = new Set(entries.filter(item => item.isFile()).map(item => item.name));
    const pre = names.has('pre-run.json') ? await maybeJson(join(folder, 'pre-run.json')) : null;
    const execution = names.has('execution.json') ? await maybeJson(join(folder, 'execution.json')) : null;
    const failed = names.has('execution-error.json') ? await maybeJson(join(folder, 'execution-error.json')) : null;
    const report = names.has('report.json') ? await maybeJson(join(folder, 'report.json')) : null;
    const hasStart = !!pre || report && ['running', 'preparing', 'warming', 'measuring'].includes(report.status);
    if (hasStart || execution || report?.startedAt || report?.wallStartedAt) {
      const terminal = !!(execution?.finishedAt && Number.isInteger(execution.exitCode))
        || !!(failed?.finishedAt && failed.status === 'failed')
        || !!(report?.finishedAt && !['running', 'preparing', 'warming', 'measuring'].includes(report.status));
      const row = { folder: folder.replaceAll('\\', '/'), terminal, executionStatus: execution?.status ?? failed?.status ?? null, reportStatus: report?.status ?? null };
      inspected.push(row); if (!terminal) active.push(row);
    }
    for (const item of entries) if (item.isDirectory() && !['output', 'report-html', 'node_modules', 'capture'].includes(item.name) && !item.name.startsWith('video-')) await visit(join(folder, item.name), depth + 1);
  }
  for (const scope of scopes) await visit(`${root}/${scope}`);
  return { inspectedAt: new Date().toISOString(), inspected, active, exclusiveReady: active.length === 0, lock: await maybeJson(lockPath),
    scope: 'Cooperative artifact terminal markers and an atomic lock for these measurement tools. Existing functional/visual runners must be coordinated by the parent; this neither enumerates nor terminates user browser processes.' };
}

export async function acquireExclusive074(output, kind) {
  const within = relative(resolve(root), resolve(output));
  if (!within || within.startsWith('..') || /^[A-Za-z]:/.test(within)) throw new Error('Measurement output must stay within completion-v074.');
  const readiness = await inspectWork074(output);
  if (!readiness.exclusiveReady) throw new Error(`Other qualification jobs lack terminal markers: ${readiness.active.map(row => row.folder).join(', ')}`);
  const token = randomUUID(), record = { token, kind, output, pid: process.pid, startedAt: new Date().toISOString(), readiness };
  const handle = await open(lockPath, 'wx');
  try { await handle.writeFile(JSON.stringify(record, null, 2)); } finally { await handle.close(); }
  return { record,
    async assertExclusive() {
      const current = await maybeJson(lockPath);
      if (current?.token !== token) throw new Error('Exclusive measurement lock ownership changed.');
      const other = await inspectWork074(output);
      if (!other.exclusiveReady) throw new Error(`Another qualification job started during measurement: ${other.active.map(row => row.folder).join(', ')}`);
      return other;
    },
    async release() { const current = await maybeJson(lockPath); if (current?.token === token) await unlink(lockPath); },
  };
}
