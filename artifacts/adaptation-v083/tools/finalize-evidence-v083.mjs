import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = process.cwd(), out = 'artifacts/adaptation-v083';
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const sha = path => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
const meta = read('dist/build-meta.json');
const comparison = read(`${out}/comparison-attempt-1/report.json`);
const derived = read(`${out}/comparison-attempt-1/derived-review.json`);
const regression = read(`${out}/regression/main-nonseed-results.json`);
const browser = read(`${out}/browser-attempt-1/summary.json`);
const inspection = read(`${out}/release/inspection-1/inspection.json`);
const offline = read(`${out}/release/offline-smoke-1/report.json`);
const release = read('artifacts/releases/v0.8.3/release-package.json');
check(meta.version === '0.8.3' && meta.stage === 'G4', 'Build identity differs');
check(regression.numPassedTests === 746 && regression.numFailedTests === 0 && regression.testResults.length === 87, 'Rules regression differs');
check(comparison.completedRuns === 24 && comparison.results.length === 24 && comparison.results.every(r => !r.measurementError && r.clearedWaves === 30), 'Natural comparison incomplete');
check(derived.applicationsWithFull480TickWarning === 36 && derived.applicationsCommittedBeforeEveryBirth === 36
  && derived.observerViolationKinds === 0 && derived.finalProbabilityArrayChanges === 18 && derived.selectedMainChanges === 0, 'Derived receipts differ');
check(browser.checks.length === 2 && browser.checks.every(r => r.exitCode === 0), 'Natural browser verification incomplete');
check(inspection.pass && offline.pass && offline.results.length === 2, 'ZIP inspection or offline boot incomplete');
check(sha('dist/game.js') === inspection.expectedGameSha256 && sha('releases/Viral-Invasion-G4-v0.8.3.zip') === release.sha256, 'Build/release differs');
for (const [path, expected] of Object.entries(meta.sourceManifest)) check(sha(path) === expected, `Current build input differs: ${path}`);
const candidate = comparison.frozenVersions.find(v => v.version === 'candidate');
const outputs = new Set(candidate.runtimeOutputInputs);
const rows = candidate.sourceFingerprints.map(input => {
  const primary = sha(input.path), productionOutput = outputs.has(input.path) && input.path.startsWith('src/');
  check(primary === input.sha256, `Measured source differs from primary: ${input.path}`);
  if (productionOutput) check(meta.sourceManifest[input.path] === primary, `Measured runtime differs from delivered build: ${input.path}`);
  return { path: input.path, measuredSha256: input.sha256, primarySha256: primary, productionRuntimeOutput: productionOutput,
    deliveredManifestSha256: meta.sourceManifest[input.path] ?? null, pass: true };
});
const lineage = { version: '0.8.3', at: new Date().toISOString(), pass: true, measuredInputCount: rows.length,
  productionRuntimeOutputCount: rows.filter(r => r.productionRuntimeOutput).length,
  deliveryBuildInputCount: Object.keys(meta.sourceManifest).length, rows,
  scope: 'Frozen simulation parser inputs match primary; production runtime output inputs match the independently inspected delivery source manifest. Test navigation helper and tree-shaken clock are not claimed as delivered gameplay outputs.' };
writeFileSync(`${out}/integration/final-source-lineage.json`, JSON.stringify(lineage, null, 2) + '\n', { flag: 'wx' });
mkdirSync(`${out}/tools`, { recursive: true });
const scripts = ['init-adaptation-v083.mjs', 'integrate-adaptation-v083.mjs', 'compare-adaptation-v083.mjs',
  'run-adaptation-v083-browser.mjs', 'prepare-delivery-v083.mjs', 'inspect-v083-release.mjs', 'verify-offline-v083.mjs', 'finalize-evidence-v083.mjs'];
for (const name of scripts) cpSync(`.tools/${name}`, `${out}/tools/${name}`);
cpSync('.tools/adaptation-v083-source/isolation-manifest.json', `${out}/integration/isolation-baseline.json`);
cpSync('.tools/adaptation-v083-source/artifacts/adaptation-initial-unit-results.json', `${out}/regression/isolation-initial-results.json`);
const references = ['Docs/ViralInvasion_Adaptation_v0.8.3.md', 'Docs/ViralInvasion_Playtest.md',
  `${out}/regression/main-nonseed-results.json`, `${out}/comparison-attempt-1/report.json`, `${out}/comparison-attempt-1/derived-review.json`,
  `${out}/integration/final-source-lineage.json`, `${out}/browser-attempt-1/summary.json`,
  `${out}/release/inspection-1/inspection.json`, `${out}/release/offline-smoke-1/report.json`,
  'artifacts/releases/v0.8.3/release-package.json', 'dist/game.js', 'dist/build-meta.json'];
const report = { schemaVersion: 1, version: '0.8.3', at: new Date().toISOString(), technicalCandidate: true,
  source: { runtimeInputLineagePass: true, measuredInputs: rows.length, productionRuntimeOutputs: lineage.productionRuntimeOutputCount,
    deliveryBuildInputs: lineage.deliveryBuildInputCount },
  regression: { files: 87, passed: 746, failed: 0, strictTypecheckExitCode: 0, fullCampaign1000Rerun: false,
    reason: 'Endless-only selector/controller/observer changes plus optional ability provenance; existing campaign regressions passed. v082 full campaign evidence retains its original build attribution.' },
  comparison: { versions: 2, seeds: comparison.seeds, policies: comparison.policies, naturalRuns: 24, natural30WaveClears: 24,
    before20IdenticalInputPairs: 12, teachingComparisonsExact: 36, fullEightSecondApplicationsBeforeBirth: 36,
    generation4And5LockedStartedWaves: 120, finalProbabilityArrayChanges: 18, selectedMainChanges: 0, observerViolations: 0 },
  browser: { installed: ['chrome', 'edge'], natural20WaveTestsPassed: 2, viewportChecks: ['1366x768', '1100x560'],
    checked: ['public keyboard/mouse/DOM input', 'natural wave20 pending decision', 'pause freezes clock and countdown', 'full warning content fits', 'announced traits applied and real elite born'],
    independentZipOfflineModeGroupsPassed: 4 },
  release: { zip: 'releases/Viral-Invasion-G4-v0.8.3.zip', bytes: release.bytes, sha256: release.sha256,
    gameSha256: inspection.expectedGameSha256, independentZipCrc32Pass: true, decodedFiles: 5 },
  humanBlindPlaytests: { completed: 0, required: 5 },
  limitations: ['Natural policies changed all18 probability arrays but selected the same18 mains; no claim of observed main outcome differences.',
    'The 1000-seed selector matrix is pure decisions, not1000 complete sessions. Full campaign1000 was not rerun for v083.',
    'Behavior model observes accepted basic/active fire, effective diagnosis and manual repair; protocol damage and isolation control are excluded.',
    'Browser checks cover wave20 first adaptive commit; wave25/30 and later wave inheritance are simulation evidence.',
    'No new600-second performance, universal layout, human comprehension, fun, replay intent, retention or commercial validation.',
    'Adaptation reuses three taught traits, may repeat a recent main, and caps a new-main draw at55%, not two-trait marginal inclusion.'],
  scripts: scripts.map(name => ({ path: `${out}/tools/${name}`, sha256: sha(`${out}/tools/${name}`) })),
  references: references.map(path => ({ path, sha256: sha(path) })) };
writeFileSync(`${out}/verification-summary.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ technicalPass: true, source: report.source, rules: 746, naturalRuns: 24, browserTests: 2, release: report.release }));
