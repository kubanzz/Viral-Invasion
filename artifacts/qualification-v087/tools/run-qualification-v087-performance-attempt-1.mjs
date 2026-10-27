import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { finished } from 'node:stream/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// Prepared only. Run once after root authorizes the exclusive CPU/browser window.
// Unmodified existing public-input pressure policy; no retry or forced GC.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/qualification-v087/performance-attempt-1');
const measurement = 'scripts/measure-campaign-performance.mjs';
const archivedMeasurement = 'artifacts/art-v081/performance/measurement-script.mjs';
const expectedGame = '27a37e8a83be3b077037991e05826970629cfca01d83ce07dee5cd30e6e8b4ae';
const expectedMeta = 'b2a718f3044c0788ed07de3028fa813c826a5c11e5c8485b74b81f1e420b2bc7';
const expectedMeasurement = '90521b8b1498a61fab973ef04b59df4606d8ad62cfefa397dc0a2177438900da';
const helpers = ['src/actors/collision.ts', 'src/game/types.ts', 'tests/e2e/campaignDriver.ts', 'tests/helpers/g3Driver.ts'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pathInRoot = path => {
  const absolute = resolve(root, path);
  if (!(absolute.startsWith(root + '/') || absolute.startsWith(root + '\\'))) throw Error(`Input outside project: ${path}`);
  return absolute;
};
const read = path => readFileSync(pathInRoot(path));
const digest = path => sha(read(path));
const json = path => JSON.parse(read(path));
const saveNew = (name, value) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const metadataBytes = read('dist/build-meta.json'), meta = JSON.parse(metadataBytes);
if (existsSync(output)) throw Error('Preserve previous performance-attempt-1; this runner never retries');
if (meta.version !== '0.8.7' || meta.stage !== 'G4' || Object.keys(meta.sourceManifest).length !== 142
  || digest('dist/game.js') !== expectedGame || sha(metadataBytes) !== expectedMeta
  || digest(measurement) !== expectedMeasurement || digest(archivedMeasurement) !== expectedMeasurement) {
  throw Error('Final frozen V3 release or unchanged measurement strategy binding failed');
}
for (const [path, expected] of Object.entries(meta.sourceManifest)) {
  if (digest(path) !== expected) throw Error(`Final source changed before pressure observation: ${path}`);
}
const before = { recordedAt: new Date().toISOString(), version: meta.version, stage: meta.stage,
  buildSourceManifest: meta.sourceManifest,
  dist: Object.fromEntries(['index.html', 'game.js', 'build-meta.json'].map(name => [name, digest(`dist/${name}`)])),
  measurement: { path: measurement, sha256: expectedMeasurement, archivedIdentical: true },
  driverSourceManifest: Object.fromEntries(helpers.map(path => [path, digest(path)])),
  command: [process.execPath, measurement],
  environment: { VI_PERF_OUTPUT: output, VI_PERF_SEED: '13', VI_PERF_POST_MEMORY: '0' },
  scope: 'One existing seed13 formal FISSION/adaptive retained-production pressure observation. Public DOM inputs only, read-only snapshots, no injected HP/position/population/time, no GC request. Helper bundled in memory, game dist not rebuilt. Must run without concurrent browsers/builds/tests/recordings.' };
mkdirSync(dirname(output), { recursive: true });
mkdirSync(output);
saveNew('input-binding.before.json', before);
writeFileSync(resolve(output, 'tested-build-meta.json'), metadataBytes, { flag: 'wx' });
const stdout = createWriteStream(resolve(output, 'measurement.stdout.log'), { flags: 'wx' });
const stderr = createWriteStream(resolve(output, 'measurement.stderr.log'), { flags: 'wx' });
const startedAt = new Date().toISOString();
console.log(JSON.stringify({ starting: measurement, output, seed: 13, naturalSecondsTarget: 600, forcedGc: false }));
const child = spawn(process.execPath, [measurement], { cwd: root, windowsHide: true,
  env: { ...process.env, ...before.environment }, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.pipe(stdout); child.stderr.pipe(stderr);
// The original observer reports one sample every ~30 active seconds.
child.stdout.on('data', bytes => process.stdout.write(bytes));
child.stderr.on('data', bytes => process.stderr.write(bytes));
const completion = await new Promise(resolveChild => {
  child.once('error', error => resolveChild({ exitCode: null, signal: null, error: String(error) }));
  child.once('close', (exitCode, signal) => resolveChild({ exitCode, signal, error: null }));
});
await Promise.all([finished(stdout), finished(stderr)]);
const after = { recordedAt: new Date().toISOString(),
  sourceChecks: Object.entries(meta.sourceManifest).map(([path, expectedSha256]) => ({ path, expectedSha256, actualSha256: digest(path) })),
  distChecks: Object.entries(before.dist).map(([name, expectedSha256]) => ({ name, expectedSha256, actualSha256: digest(`dist/${name}`) })),
  measurementUnchanged: digest(measurement) === expectedMeasurement,
  driverChecks: Object.entries(before.driverSourceManifest).map(([path, expectedSha256]) => ({ path, expectedSha256, actualSha256: digest(path) })) };
saveNew('input-binding.after.json', after);
let observation = null;
if (existsSync(resolve(output, 'report.json'))) observation = JSON.parse(readFileSync(resolve(output, 'report.json')));
const bound = after.sourceChecks.every(row => row.expectedSha256 === row.actualSha256)
  && after.distChecks.every(row => row.expectedSha256 === row.actualSha256) && after.measurementUnchanged
  && after.driverChecks.every(row => row.expectedSha256 === row.actualSha256);
const naturalOnly = !!observation && !observation.postMeasurementMemory
  && observation.samples.every(sample => sample.forcedGc === false);
const sourceReportMatches = !!observation && observation.releaseGameJsSha256 === expectedGame
  && observation.measurementScriptSha256 === expectedMeasurement
  && isDeepStrictEqual(observation.buildSourceManifest, meta.sourceManifest)
  && isDeepStrictEqual(observation.driverSourceManifest, before.driverSourceManifest);
const summary = { startedAt, finishedAt: new Date().toISOString(), ...completion, output,
  sourceUnchanged: bound, sourceReportMatches, naturalOnly,
  observationStatus: observation?.status ?? 'no-observer-report',
  observationPass: observation?.pass ?? false, activeSimulationSeconds: observation?.activeSimulationSeconds ?? 0,
  error: completion.error ?? observation?.error ?? null,
  pass: completion.exitCode === 0 && bound && sourceReportMatches && naturalOnly && observation?.pass === true,
  scope: 'This records the original observer result, including natural failure. A passing frame-pressure report still needs separate natural-memory trend review and is not native-device or human-playtest acceptance. No automatic retries.' };
saveNew('runner-summary.json', summary);
console.log(JSON.stringify(summary));
if (!summary.pass) process.exitCode = 1;
