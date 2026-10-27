import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = process.cwd(), out = resolve(root, 'artifacts/tactics-v082');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const sha = path => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const check = (value, message) => { if (!value) throw new Error(message); };
const nonseed = read('artifacts/tactics-v082/regression/nonseed-results.json');
const seeds = read('artifacts/tactics-v082/regression/full-system-seeds.json');
const browser = read('artifacts/tactics-v082/browser-final-1/summary.json');
const comparison = read('artifacts/tactics-v082/final-attempt-1/report.json');
const lineage = read('artifacts/tactics-v082/integration/final-source-lineage.json');
const inspection = read('artifacts/tactics-v082/release/inspection-2/inspection.json');
const offline = read('artifacts/tactics-v082/release/offline-smoke-1/report.json');
const release = read('artifacts/releases/v0.8.2/release-package.json');
const meta = read('dist/build-meta.json');
check(nonseed.numPassedTests === 669 && nonseed.numFailedTests === 0 && nonseed.testResults.length === 83, 'Nonseed regression incomplete');
check(seeds.complete && seeds.completedSeeds === 1000 && seeds.runs.length === 1000 && seeds.runs.every(run => run.outcome === 'win'), '1000-session audit incomplete');
check(seeds.replay.equal && seeds.preparedReplay.equal, 'Replay equality failed');
check(browser.checks.length === 2 && browser.checks.every(row => row.exitCode === 0), 'Browser tests incomplete');
check(comparison.results.length === 10 && comparison.results.every(run => !run.measurementError), 'Ten-run comparison incomplete');
check(lineage.pass && inspection.pass && offline.pass, 'Source, ZIP or offline qualification incomplete');
check(release.sha256 === sha('releases/Viral-Invasion-G4-v0.8.2.zip') && meta.version === '0.8.2', 'Release differs');
check(sha('dist/game.js') === '048f26c174c329d2abfddff51ced6c25350e128e87b90c4905a69396934701c9', 'Tested game changed');
for (const [file, expected] of Object.entries(meta.sourceManifest)) check(sha(file) === expected, `Build input changed: ${file}`);
const tools = ['init-tactics-v082.mjs', 'copy-tactics-fixtures-v082.mjs', 'integrate-tactics-v082.mjs', 'version-tactics-v082.mjs',
  'compare-tactics-v082.mjs', 'run-tactics-v082-browser.mjs', 'verify-offline-v082.mjs', 'prepare-inspector-v082.mjs',
  'inspect-v082-release.mjs', 'inspect-v082-final-release.mjs', 'finalize-evidence-v082.mjs'];
mkdirSync(resolve(out, 'tools'), { recursive: true });
for (const name of tools) cpSync(resolve(root, '.tools', name), resolve(out, 'tools', name));
for (const [source, dest] of [['prototype-unit-results.json', 'prototype-initial-results.json'], ['prototype-repair-results.json', 'prototype-repair-results.json'], ['prototype-final-results.json', 'prototype-pre-final-results.json']]) {
  cpSync(resolve(root, '.tools/tactics-v082-source/artifacts', source), resolve(out, 'regression', dest));
}
cpSync(resolve(root, '.tools/tactics-v082-source/baseline-manifest.json'), resolve(out, 'integration/isolation-baseline.json'));
cpSync(resolve(root, '.tools/tactics-v082-source/fixture-manifest.json'), resolve(out, 'integration/fixture-inputs.json'));
const references = ['Docs/ViralInvasion_Combat_v0.8.2.md', 'Docs/ViralInvasion_Playtest.md',
  'artifacts/tactics-v082/final-attempt-1/report.json', 'artifacts/tactics-v082/final-attempt-1/review.json',
  'artifacts/tactics-v082/integration/final-source-lineage.json', 'artifacts/tactics-v082/regression/nonseed-results.json',
  'artifacts/tactics-v082/regression/full-system-seeds.json', 'artifacts/tactics-v082/browser-final-1/summary.json',
  'artifacts/tactics-v082/release/inspection-1/inspection.json', 'artifacts/tactics-v082/release/inspection-2/inspection.json',
  'artifacts/tactics-v082/release/offline-smoke-1/report.json', 'artifacts/releases/v0.8.2/release-package.json', 'dist/game.js', 'dist/build-meta.json'];
const report = { schemaVersion: 1, version: '0.8.2', at: new Date().toISOString(), technicalCandidate: true,
  source: { runtimeInputLineagePass: true, deliveryBuildInputs: Object.keys(meta.sourceManifest).length },
  regression: { nonseedFiles: 83, nonseedPassed: 669, fullCampaignSessions: 1000, campaignWins: 1000, replayPairsEqual: 2, strictTypecheckExitCode: 0 },
  comparison: { executedRuns: 10, seeds: [7, 71], resultScope: 'Original only1 is countered in these seeds; active movement and targeted Q each complete30. No claim about all strategies or seeds.', results: comparison.results },
  browser: { installed: ['chrome', 'edge'], naturalFiveWaveAndModeTestsPassed: 4, independentZipOfflineModeGroupsPassed: 4 },
  release: { zip: 'releases/Viral-Invasion-G4-v0.8.2.zip', bytes: release.bytes, sha256: release.sha256, independentZipCrc32Pass: true, decodedEntries: 5 },
  humanBlindPlaytests: { completed: 0, required: 5 },
  limitations: ['Deterministic public-world-input simulations are not human playtests or mouse reachability proof.',
    'Natural active comparison kills ranged supports before their windup; sidestep transactions are independently fixture-tested.',
    'No new600-second device performance or universal memory claim; previous v081 evidence remains attributed to its build.',
    'Finite birth search and288 sparse map fixtures do not prove all state combinations.',
    'Initial isolated regression lacked archived fixtures and had an obsolete LOS witness expectation; all raw failures preserved, final main regression passes.',
    'First independent ZIP inspector accidentally replaced digits inside its fixed hash; corrected inspector passes on unchanged build.'],
  scripts: tools.map(name => ({ path: `artifacts/tactics-v082/tools/${name}`, sha256: sha(`artifacts/tactics-v082/tools/${name}`) })),
  references: references.map(path => ({ path, sha256: sha(path) })) };
writeFileSync(resolve(out, 'verification-summary.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ technicalPass: true, nonseed: report.regression.nonseedPassed, campaignWins: 1000, release: report.release }));
