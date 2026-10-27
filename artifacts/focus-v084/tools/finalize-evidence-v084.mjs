import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const out = 'artifacts/focus-v084';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const check = (ok, why) => { if (!ok) throw Error(why); };
const meta = read('dist/build-meta.json'), release = read('artifacts/releases/v0.8.4/release-package.json');
const rules = read(`${out}/regression/main-final-nonseed-results.json`), seeds = read(`${out}/regression/full-system-seeds.json`);
const comparison = read(`${out}/comparison-attempt-1/report.json`), derived = read(`${out}/comparison-attempt-1/derived-review.json`);
const browser = read(`${out}/browser-attempt-2/summary.json`), inspection = read(`${out}/release/inspection-1/inspection.json`), offline = read(`${out}/release/offline-smoke-1/report.json`);
check(meta.version === '0.8.4' && meta.stage === 'G4', 'Build differs');
check(rules.numPassedTests === 777 && rules.numFailedTests === 0 && rules.testResults.length === 90, 'Rule verification incomplete');
check(seeds.complete && seeds.completedSeeds === 1000 && seeds.runs.length === 1000 && seeds.runs.every(r => r.outcome === 'win')
  && seeds.replay.equal && seeds.preparedReplay.equal && seeds.simulationSourceUnchanged, 'Campaign verification incomplete');
for (const [p, h] of Object.entries(seeds.simulationSourceManifest)) check(sha(p) === h, `Campaign input changed: ${p}`);
check(comparison.completedRuns === 7 && comparison.results.every(r => !r.measurementError && r.observerViolationKinds === 0)
  && comparison.replayCheck.exactRawResultsEqual, 'Natural comparison incomplete');
check(derived.aggregate.candidate.acceptedFocusCommands === 71 && derived.aggregate.candidate.recipientPositiveWindows === 52
  && derived.aggregate.candidate.recipientZeroWindows === 19 && derived.aggregate.pairedActualHits === 607 && derived.aggregate.exactRedirectInvariants === 61, 'Focus evidence differs');
check(browser.checks.length === 2 && browser.checks.every(r => r.exitCode === 0) && inspection.pass && offline.pass, 'Browser/release qualification incomplete');
check(sha('dist/game.js') === inspection.expectedGameSha256 && sha('releases/Viral-Invasion-G4-v0.8.4.zip') === release.sha256, 'Release bytes differ');
for (const [p, h] of Object.entries(meta.sourceManifest)) check(sha(p) === h, `Build input changed: ${p}`);
const candidate = comparison.frozenVersions.find(v => v.version === 'candidate'), outputs = new Set(candidate.runtimeOutputInputs);
const rows = candidate.fingerprints.map(input => {
  const primarySha256 = sha(input.path), productionRuntimeOutput = outputs.has(input.path) && input.path.startsWith('src/');
  check(primarySha256 === input.sha256, `Measured input differs: ${input.path}`);
  if (productionRuntimeOutput) check(meta.sourceManifest[input.path] === primarySha256, `Runtime output differs from build: ${input.path}`);
  return { ...input, primarySha256, productionRuntimeOutput, deliveredManifestSha256: meta.sourceManifest[input.path] ?? null, pass: true };
});
writeFileSync(`${out}/integration/final-source-lineage.json`, JSON.stringify({ version: '0.8.4', pass: true, measuredInputCount: rows.length,
  productionRuntimeOutputCount: rows.filter(r => r.productionRuntimeOutput).length, deliveryInputCount: Object.keys(meta.sourceManifest).length,
  scope: 'All measured inputs match primary; emitted production inputs match delivery manifest. Test navigation helper and tree-shaken clock are not claimed as game outputs.', rows }, null, 2), { flag: 'wx' });
mkdirSync(`${out}/tools`, { recursive: true });
const scripts = ['init-focus-v084.mjs', 'integrate-focus-v084.mjs', 'edit-focus-copy-v084.mjs', 'compare-focus-v084.mjs',
  'run-focus-v084-browser.mjs', 'run-focus-v084-browser-final.mjs', 'prepare-delivery-v084.mjs', 'inspect-v084-release.mjs', 'verify-offline-v084.mjs', 'finalize-evidence-v084.mjs'];
for (const name of scripts) cpSync(`.tools/${name}`, `${out}/tools/${name}`);
cpSync('.tools/focus-v084-source/isolation-manifest.json', `${out}/integration/isolation-baseline.json`);
for (const name of ['focus-ui-initial-results.json', 'focus-patrol-initial-results.json']) cpSync(`.tools/focus-v084-source/artifacts/${name}`, `${out}/regression/${name}`);
const references = ['Docs/ViralInvasion_ImmuneFocus_v0.8.4.md', 'Docs/ViralInvasion_Playtest.md',
  `${out}/regression/main-nonseed-results.json`, `${out}/regression/failure-recheck-serial.json`, `${out}/regression/main-final-nonseed-results.json`,
  `${out}/regression/full-system-seeds.json`, `${out}/comparison-attempt-1/report.json`, `${out}/comparison-attempt-1/derived-review.json`,
  `${out}/integration/final-source-lineage.json`, `${out}/browser-attempt-1/summary.json`, `${out}/browser-attempt-2/summary.json`,
  `${out}/release/inspection-1/inspection.json`, `${out}/release/offline-smoke-1/report.json`, 'artifacts/releases/v0.8.4/release-package.json', 'dist/game.js', 'dist/build-meta.json'];
const report = { schemaVersion: 1, version: '0.8.4', at: new Date().toISOString(), technicalCandidate: true,
  regression: { files: 90, passed: 777, strictTypecheckExitCode: 0, completeCampaignSessions: 1000, campaignWins: 1000, campaignReplayPairsEqual: 2 },
  source: { pass: true, measuredInputs: rows.length, emittedProductionInputs: rows.filter(r => r.productionRuntimeOutput).length, deliveryInputs: Object.keys(meta.sourceManifest).length },
  comparison: { uniqueRuns: 6, predeterminedReplays: 1, candidate15WaveClears: 3, baseline15WaveClears: 2, baselineDeaths: 1,
    candidateFocusCommands: 71, positiveRecipientWindows: 52, zeroRecipientWindows: 19, actualCellHitsPaired: 607, exactRedirects: 61, replayEqual: true },
  browser: { installed: ['chrome', 'edge'], realInputFocusTestsPassed: 2, resolutions: ['1366x768', '1100x560'],
    scope: 'Natural first-wave Q target, actual bite receipt, pause, compact status, same-squad empty-ground redirect; no complex later-wave FPS claim.',
    independentlyDecodedOfflineModeGroups: 4 },
  release: { zip: 'releases/Viral-Invasion-G4-v0.8.4.zip', bytes: release.bytes, sha256: release.sha256, gameSha256: inspection.expectedGameSha256, independentZipCrc32Pass: true, decodedFiles: 5 },
  humanBlindPlaytests: { completed: 0, required: 5 },
  preservedFailures: ['First rules run:2 old copy assertions and1 unchanged24-body test5s timeout; serial recheck and2-worker final suite passed without weakening limits.',
    'First Edge natural focus run exposed compact paragraph hiding; CSS-only repair, second Chrome/Edge run passed.',
    'Baseline seed19 died at wave15; retained, not retried.', 'Review prose arithmetic corrected69/17 to71/19; raw data always correct, draft preserved.'],
  limitations: ['Same state-feedback policy is not an identical input tape across versions; do not attribute all timing/damage/win changes solely to focus.',
    'Candidate7/71 were slower and71 took more damage; no universal power or speed improvement.',
    'Most natural focus windows had no ordinary distractors; priority under competing bodies is fixture evidence.',
    'Focus can expire before3s with the old squad lifetime; no target damage in19/71 natural windows.',
    'Failed-route work is finite but negative results are not cached; no new600s performance claim.',
    'No human fun, comprehension, replay-intent, retention or incubation-value validation; growth specialization planning is not an implemented feature.'],
  scripts: scripts.map(name => ({ path: `${out}/tools/${name}`, sha256: sha(`${out}/tools/${name}`) })),
  references: references.map(path => ({ path, sha256: sha(path) })) };
writeFileSync(`${out}/verification-summary.json`, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ technicalPass: true, rules: 777, campaignWins: 1000, source: report.source, release: report.release }));
