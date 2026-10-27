import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const parse = async path => JSON.parse((await readFile(resolve(root, path), 'utf8')).replace(/^\uFEFF/, ''));
const hash = data => createHash('sha256').update(data).digest('hex');
const fileHash = async path => hash(await readFile(resolve(root, path)));
const label = path => relative(root, path).replaceAll('\\', '/');
const paths = {
  unit: 'artifacts/readability-v075/unit/final-c/qualification.json',
  build: 'artifacts/readability-v075/build/final-d/qualification.json',
  browser: 'artifacts/readability-v075/browser/final-a/qualification.json',
  perf: 'artifacts/readability-v075/perf/final-d/qualification.json',
};
const qualifications = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, { path, result: await parse(path) }])));
const unit = await parse('artifacts/readability-v075/unit/final-c/results.json');
const browser = await parse('artifacts/readability-v075/browser/final-a/report.json');
const perf = await parse('artifacts/readability-v075/perf/final-d/report.json');
const render = await parse('artifacts/readability-v075/render-invariance/dense/report.json');
const release = await parse('artifacts/readability-v075/release-package.json');
const smoke = await parse('artifacts/readability-v075/release-smoke/report.json');
const meta = await parse('dist/build-meta.json');
const sourceChecks = await Promise.all(Object.entries(meta.sourceManifest).map(async ([path, sha256]) => ({ path, expected: sha256, current: await fileHash(path),
  qualificationInputs: Object.fromEntries(Object.entries(qualifications).map(([name, { result }]) => [name, result.sourceBefore[path] === sha256 && result.sourceAfter[path] === sha256])) })));
const sourcePass = sourceChecks.every(item => item.current === item.expected && Object.values(item.qualificationInputs).every(Boolean));
const summary = {
  version: meta.version, createdAt: new Date().toISOString(), sourcePass, sourceChecks,
  release: { ...release, currentZipSha256: await fileHash(release.zip), bundleSha256: await fileHash('dist/game.js'), smokePath: 'artifacts/readability-v075/release-smoke/report.json', smokePass: smoke.pass },
  qualifications: Object.fromEntries(Object.entries(qualifications).map(([name, { path, result }]) => [name, { path, pass: result.pass, sourceUnchanged: result.sourceUnchanged }])),
  unit: { files: unit.testResults.filter(result => result.status === 'passed').length, tests: unit.numPassedTests, failed: unit.numFailedTests, scope: 'All current unit files except the unchanged full-system 1000-formal-session batch. Evolution director seed audit is a separate unit test, not 1000 new browser games.' },
  browser: { ...browser.stats, scope: '26 targeted allocations: 2 browsers × real growth/upgrade/hits, actual marked-cell full-run/retry, 3 HUD viewport samples, and 8 training/input/lifecycle cases. Resize/DPR and synthetic focus retain their original scope; not OS focus, actual browser zoom, human testing or performance.' },
  performance: { pass: perf.pass, activeTargetSeconds: perf.activeTargetSeconds, activeSimulationSeconds: perf.activeSimulationSeconds, metrics: perf.metrics, maxActors: perf.maxActors, maxCells: perf.maxCells, observedRecentRequestLogCount: perf.cellHits, acceptedControlDuringMeasurement: perf.acceptedControlDuringMeasurement, acceptanceTenMinuteRun: perf.acceptanceTenMinuteRun, scope: perf.passScope },
  renderInvariance: { pass: render.pass, path: 'artifacts/readability-v075/render-invariance/dense/report.json', tick: render.checks.tick, aliveActors: render.checks.aliveActors, framesPerMode: render.checks.framesPerMode, scope: 'Two independent real Canvas2D renderers consume one old real snapshot at its captured tick. Complete state/HP/damage/collision fingerprints must remain equal. No game time, input, main HUD, victory or performance claim.' },
  visualReview: { scope: 'Developer technical image inspection, not a blind player score or exhaustive dense-warning visual acceptance.', reviewPath: 'artifacts/readability-v075/visual-sample-review.json', images: [
    { path: 'artifacts/readability-v075/browser/final-a/output/readability-v075-Readabili-eae57--world-captions-at-1366x768-chrome/tissue-patrol-hud.png', observation: 'Tissue HP and repair hint are below its body, patrol identity above/right; fixed HUD occupies the edges. No observed overlap of these captions.' },
    { path: 'artifacts/readability-v075/browser/final-a/output/readability-v075-Readabili-cbd39--world-captions-at-1000x560-chrome/tissue-patrol-hud.png', observation: 'Smaller viewport retains vitals, infection pressure, map and three empty slots; tissue/patrol captions remain separate. This image has routine pressure, not a live fatal countdown.' },
    { path: 'artifacts/readability-v075/browser/final-a/output/feedback-v062-immune-reada-8a1be--and-a-clean-full-run-retry-chrome/immune-standard-readable.png', observation: 'The real squad surrounds the shell elite; genuine bite cues and separate squad/weakness captions are visible. The center cell partly overlaps the elite. Near-edge offscreen tissue caption is redundant; no universal zero-overlap, edge or mixed-core readability claim.' },
  ] },
  preservedFailures: [
    { path: 'artifacts/readability-v075/unit-initial-fixture-failure.json', reason: 'New airway fixture assumed a cooldown after it had expired; corrected fixture changedAt to current elapsed.' },
    { path: 'artifacts/readability-v075/labels-unit-results-attempt-1.json', reason: 'Layout candidate gap and an inappropriate leader expectation; source candidate set and fixture corrected before the final runs.' },
    { path: 'artifacts/readability-v075/build/final-b/qualification.json', reason: 'Nested npm command missing in local PATH; no build completed.' },
    { path: 'artifacts/readability-v075/build/final-c/qualification.json', reason: 'npm.cmd expects a global layout; replaced the validation shim with explicit actual npm-cli.js.' },
    { path: 'artifacts/readability-v075/perf/final-a/report.json', reason: 'Preparation walk chose an unreachable offset near a moving target. No frame measurement started. Measurement host now chooses legal clear-line firing positions.' },
    { path: 'artifacts/readability-v075/perf/final-b/report.json', reason: '120-second frame budget passed, but maximum population was only nine, so the required dense-workload gate failed. Next attempt naturally prewarms to the population cap before measuring.' },
    { path: 'artifacts/readability-v075/perf/final-c/report.json', reason: 'Initial guided encounter has a lower population limit; its prewarm cannot qualify the formal 24-actor workload. Final attempt reuses the known formal FISSION/adaptive source-clear, guardian and block route from the preserved v074 pressure host.' },
    { path: 'artifacts/readability-v075/packaging-attempt-1.json', reason: 'Windows PowerShell execution policy rejected the new packaging script. No policy was changed; final packaging uses the already installed Node ZIP library.' },
  ],
  remaining: ['Five genuine new-player standard blind observations are 0/5.', 'Actual browser zoom and native OS focus/minimize are unverified.', 'Full natural memory stability and decisive dense core/foreground visual combinations remain partial.', 'Normal target-player 10–15 minute pacing, fun, spontaneous replay and incubation value require real observation.'],
  oldEvidence: { version: '0.7.4', preserved: true, scope: 'Old full browser, formal 1000-session and ten-minute results retain their original version and were not relabelled as v0.7.5.' },
  testOutputProtection: { path: 'artifacts/readability-v075/unit-side-effects/restoration.json', scope: 'Two legacy tests initially refreshed fixed artifact paths. Their fresh outputs were moved into this version, old files restored byte-for-byte from the initial Git blobs, and defaults redirected to generated outputs before the final unit run.' },
};
for (const item of summary.visualReview.images) item.sha256 = await fileHash(item.path);
summary.pass = sourcePass && Object.values(summary.qualifications).every(item => item.pass) && unit.numFailedTests === 0 && browser.stats.unexpected === 0
  && perf.pass && render.pass && smoke.pass && release.sha256 === summary.release.currentZipSha256;
await writeFile(resolve(import.meta.dirname, 'verification-summary.json'), JSON.stringify(summary, null, 2));
const inventory = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) { if (!entry.name.endsWith('-html')) await scan(path); }
    else if (!['evidence-inventory.json'].includes(entry.name) && !/\.(webm|log)$/.test(entry.name) && !entry.name.startsWith('.')) {
      const bytes = await readFile(path); inventory.push({ path: label(path), bytes: bytes.length, sha256: hash(bytes), ...(/\/fixture\.(js|html)$/.test(label(path)) ? { localOnlyGeneratedFixture: true } : {}) });
    }
  }
}
await scan(import.meta.dirname);
await writeFile(resolve(import.meta.dirname, 'evidence-inventory.json'), JSON.stringify({ createdAt: new Date().toISOString(), files: inventory.sort((a,b) => a.path.localeCompare(b.path)) }, null, 2));
console.log(JSON.stringify({ pass: summary.pass, sourcePass, unit: summary.unit.tests, browser: summary.browser.expected, metrics: perf.metrics, bundleSha256: summary.release.bundleSha256 }));
if (!summary.pass) process.exitCode = 1;
