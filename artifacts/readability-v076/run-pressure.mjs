import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.argv[2] !== '--parent-sequenced') throw Error('Root must sequence after all controlled tests and browser sessions close.');
const attempt = process.argv[3] ?? 'attempt-1';
if (!/^attempt-[1-9]\d*$/.test(attempt)) throw Error('Expected attempt-N.');
const folder = `artifacts/readability-v076/performance/${attempt}`;
const identity = JSON.parse(await readFile('artifacts/readability-v076/mixed-scene/release-identity.json', 'utf8'));
const meta = JSON.parse(await readFile('dist/build-meta.json', 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
if (identity.version !== '0.7.6' || meta.version !== '0.7.6' || identity.head !== execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  || identity.gameSha256 !== hash(await readFile('dist/game.js'))) throw Error('Frozen source identity changed.');
for (const [path, expected] of Object.entries(meta.sourceManifest)) if (hash(await readFile(path)) !== expected) throw Error('Build input changed: ' + path);
await mkdir(folder);
const script = await readFile(new URL(import.meta.url)), host = 'artifacts/readability-v076/performance/measure-pressure.mjs', hostBytes = await readFile(host);
await writeFile(`${folder}/wrapper-start.json`, JSON.stringify({ startedAt: new Date().toISOString(), identity, buildInputCount: Object.keys(meta.sourceManifest).length,
  wrapperSha256: hash(script), host, hostSha256: hash(hostBytes), activeTargetSeconds: 600, postMeasurementForcedGc: true,
  scope: 'Root sequences current-source 10-minute pressure after all its other controlled processes finish; static review may continue. No OS-global exclusion claim.' }, null, 2) + '\n', { flag: 'wx' });
process.env.VI_PERF_OUTPUT = folder; process.env.VI_PERF_ACTIVE_SECONDS = '600'; process.env.VI_PERF_POST_MEMORY = '1';
try { await import(pathToFileURL(resolve(host)).href); }
finally {
  const gameUnchanged = hash(await readFile('dist/game.js')) === identity.gameSha256, hostUnchanged = hash(await readFile(host)) === hash(hostBytes);
  await writeFile(`${folder}/wrapper-end.json`, JSON.stringify({ finishedAt: new Date().toISOString(), processExitCode: process.exitCode ?? 0, gameUnchanged, hostUnchanged }, null, 2) + '\n', { flag: 'wx' });
  if (!gameUnchanged || !hostUnchanged) process.exitCode = 1;
}
