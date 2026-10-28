import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve('artifacts/source-v0810');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const build = json(join(root, 'release-attempt-1/summary.json'));
const browser = json(join(root, 'browser-attempt-1/report.json'));
const inspection = json(join(root, 'release-inspection-1/inspection.json'));
const offline = json(join(root, 'offline-smoke-1/report.json'));
const comparison = json(join(root, 'measurement-attempt-1/derived/comparison.json'));
const archive = json(join(root, 'measurement-attempt-1/measurement-records.complete.index.json'));
const packageReport = json(join(root, 'release-attempt-1/package-report.json'));
if (!build.pass || !build.sourceMatches || !build.mainDistUnchanged || build.tests.passed !== 968 || build.tests.failed || build.tests.pending) throw Error('Final build/rules failure');
if (browser.stats.expected !== 2 || browser.stats.unexpected || browser.stats.skipped || browser.stats.flaky) throw Error('Browser failure');
if (!inspection.pass || !offline.pass || !offline.cases.every(row => row.pass) || offline.cases.length !== 4) throw Error('ZIP/offline failure');
if (!comparison.technical.mechanicalValidity || !comparison.technical.replay.exactRawBytesEqual || comparison.technical.observedProblems || comparison.fixedCases !== 13) throw Error('Fixed comparison failure');
if (sha('releases/Viral-Invasion-G4-v0.8.10.zip') !== packageReport.sha256 || offline.gameSha256 !== build.gameSha256) throw Error('Final package binding failure');
const paths = [
  'integration/frozen-source.json', 'acceleration-regression/scope.json',
  'acceleration-regression/acceleration-red-1.json', 'acceleration-regression/acceleration-green-1.json', 'acceleration-regression/acceleration-green-2.json',
  'release-attempt-1/summary.json', 'release-attempt-1/tested-build-meta.json', 'release-attempt-1/unit.json', 'release-attempt-1/package-report.json',
  'measurement-attempt-1/derived/comparison.json', 'measurement-attempt-1/derived/actual-cell-contribution.json',
  'measurement-attempt-1/measurement-records.complete.zip', 'measurement-attempt-1/measurement-records.complete.index.json', 'measurement-attempt-1/measurement-records.complete.manifest.json',
  'browser-attempt-1/report.json', 'browser-attempt-1/browser-records.zip', 'browser-attempt-1/browser-records.index.json',
  'release-inspection-1/inspection.json', 'offline-smoke-1/report.json', 'visual-review.json',
];
const report = {
  version: '0.8.10', status: 'technical-candidate-verified-product-goal-incomplete', pass: true,
  scope: 'Finite far-side sources with passive-source fast-clear pacing fix; preserves v0.8.8 cycle, immune contact and all pending obligations. No human fun, route balance or incubation-value acceptance.',
  lineage: 'Verified v0.8.7 source archive -> frozen older rendering/art; current gameplay/named UI/tests + version-only main/package transforms, independent install/build. Current parallel art work excluded.',
  gameSha256: build.gameSha256, package: { path: 'releases/Viral-Invasion-G4-v0.8.10.zip', bytes: packageReport.bytes, sha256: packageReport.sha256 },
  rules: build.tests, browser: { passed: 2, scope: 'Natural DOM entry through wave6 source warning, approach and cutoff. Not16-wave browser coverage.' },
  offline: { passed: 4, scope: 'Independently extracted ZIP, Chrome/Edge campaign/endless startup and pause, no remote requests or page errors.' },
  measurement: { cases: 13, independentCases: 12, goalClearedWaves: 16, allCleared: true, exactReplay: true, observerProblems: 0,
    driverByteIdenticalToOriginalV089: comparison.driverByteIdenticalToOriginalV089, sourceDiff: comparison.sourceDiff,
    nearAggregateSimulatedTimeDelta: comparison.groups.find(row => row.route === 'near').elapsedDelta,
    sourceQuota: { budget: 216, born: 77, canceled: 139 }, archive },
  preservedFailures: 'Old source predicate fails2/4; first integrated35 run has one fixture accounting failure, corrected to include actual new births. Original v089 fixtures/measurement/ZIP retained with old provenance; no replacements.',
  open: ['Goal self-check: only partial satisfaction for spatial strategy, long-run build diversity and renewed pressure.', 'Standard new-player observations0/5; no verified fun, replay intention, cross-day retention or commercial value.', 'No new1000 campaign batch,10-minute device performance, full memory qualification, all35 matrix, late26 or area-build matrix for this version.'],
  evidence: paths.map(path => ({ path: `artifacts/source-v0810/${path}`, sha256: sha(join(root, path)) })),
};
if (existsSync(join(root, 'verification-summary.json'))) throw Error('Preserve final verification index');
writeFileSync(join(root, 'verification-summary.json'), JSON.stringify(report, null, 2));
copyFileSync(new URL(import.meta.url), join(root, 'finalizer.mjs'));
console.log(JSON.stringify({ pass: report.pass, tests: report.rules, gameSha256: report.gameSha256, productGoal: 'incomplete' }));
