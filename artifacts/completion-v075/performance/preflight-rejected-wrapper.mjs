import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// New, append-only qualification of the frozen v0.7.5 bundle. The imported
// host operates the game exclusively through DOM inputs and read-only state.
const root = resolve(process.cwd());
const output = resolve(root, 'artifacts/completion-v075/performance/attempt-1');
const host = resolve(root, 'artifacts/readability-v075/measure-pressure.mjs');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const gameSha256 = '971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a9a204baf8a';
const metadata = JSON.parse(await readFile(resolve(root, 'dist/build-meta.json'), 'utf8'));
if (metadata.version !== '0.7.5') throw Error('Expected the frozen v0.7.5 release.');
if (sha256(await readFile(resolve(root, 'dist/game.js'))) !== gameSha256) throw Error('Release game hash changed.');
for (const [path, expected] of Object.entries(metadata.sourceManifest)) {
  if (sha256(await readFile(resolve(root, path))) !== expected) throw Error(`Build input changed: ${path}`);
}
await mkdir(resolve(root, 'artifacts/completion-v075/performance'), { recursive: true });
await mkdir(output); // Refuse to overwrite an earlier attempt.
const wrapper = await readFile(new URL(import.meta.url));
const hostBytes = await readFile(host);
const start = {
  schemaVersion: 1, startedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: root }).trim(),
  version: metadata.version, gameSha256,
  buildInputCount: Object.keys(metadata.sourceManifest).length,
  wrapperSha256: sha256(wrapper), importedHost: relative(root, host).replaceAll('\\', '/'),
  importedHostSha256: sha256(hostBytes), output: relative(root, output).replaceAll('\\', '/'),
  activeTargetSeconds: 600, postMeasurementForcedGc: true,
  browserSequence: 'No other root-controlled browser/benchmark session is active. Static agent reviews may continue; this does not assert OS-global exclusion.',
  scope: 'Ten measured active minutes after normal formal setup and natural 24-actor warmup. Natural heap/DOM samples are separate from later forced-GC/menu/restart diagnostics.'
};
await writeFile(resolve(output, 'wrapper-start.json'), JSON.stringify(start, null, 2), { flag: 'wx' });
await writeFile(resolve(output, 'wrapper-script.mjs'), wrapper, { flag: 'wx' });
process.env.VI_PERF_OUTPUT = relative(root, output).replaceAll('\\', '/');
process.env.VI_PERF_ACTIVE_SECONDS = '600';
process.env.VI_PERF_POST_MEMORY = '1';
try {
  await import(pathToFileURL(host).href);
} finally {
  const gameUnchanged = sha256(await readFile(resolve(root, 'dist/game.js'))) === gameSha256;
  const importedHostUnchanged = sha256(await readFile(host)) === start.importedHostSha256;
  await writeFile(resolve(output, 'wrapper-end.json'), JSON.stringify({
    finishedAt: new Date().toISOString(), processExitCode: process.exitCode ?? 0,
    gameUnchanged, importedHostUnchanged
  }, null, 2), { flag: 'wx' });
  if (!gameUnchanged || !importedHostUnchanged) process.exitCode = 1;
}
