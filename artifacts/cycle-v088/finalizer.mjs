import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const folder = 'artifacts/cycle-v088', work = resolve('.tools/cycle-v088-release');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const build = read(`${folder}/release-attempt-1/summary.json`), meta = read(`${folder}/release-attempt-1/tested-build-meta.json`);
const compared = read(`${folder}/measurement-attempt-1/derived/comparison.json`), archive = read(`${folder}/measurement-attempt-1/measurement-records.index.json`);
const browser = read(`${folder}/browser-attempt-1/report.json`), inspected = read(`${folder}/release-inspection-2/inspection.json`), smoke = read(`${folder}/offline-smoke-1/report.json`);
const frozenSimulation = read(`${folder}/measurement-attempt-1/candidate/source-fingerprints.before.json`);
const checks = {
  isolatedBuildAnd947Rules: build.pass && build.tests.files === 100 && build.tests.passed === 947 && build.tests.failed === 0,
  all143BuildInputsStillMatch: Object.keys(meta.sourceManifest).length === 143 && Object.entries(meta.sourceManifest).every(([path, sha]) => hash(join(work, path)) === sha),
  measuredSimulationMatchesBuiltAndCurrent: frozenSimulation.every(entry => hash(entry.path) === entry.sha256 && hash(join(work, entry.path)) === entry.sha256),
  fixed21PolicyAndSourceIntegrity: compared.rawCaseCount === 21 && compared.sourcesUnchanged && compared.sharedPublicPolicyIdentical && compared.technicalChecks.observerIssues === 0 && compared.technicalChecks.acceptedCellDuplicates === 0,
  predeterminedReplayEqual: compared.replay.exactRawBytesEqual,
  measurementArchiveMatches: archive.crcPassed && archive.allUncompressedPayloadHashesMatch && hash(archive.archive) === archive.archiveSha256,
  naturalBrowserTwoPassed: browser.stats.expected === 2 && browser.stats.unexpected === 0 && browser.stats.skipped === 0,
  independentZipVerified: inspected.pass && inspected.files.length === 5 && hash(inspected.archive) === inspected.sha256,
  fourExtractedOfflineModesPassed: smoke.pass && smoke.cases.length === 4 && smoke.cases.every(row => row.pass && row.errors.length === 0 && row.remote.length === 0),
  testedAndPackagedGameIdentical: build.gameSha256 === smoke.gameSha256 && build.gameSha256 === hash(join(work, 'dist/game.js')) && inspected.files.find(file => file.name === 'game.js')?.sha256 === build.gameSha256,
  mainProductionBuildUnchanged: hash('dist/game.js') === build.mainDistBefore,
};
const references = [
  'Docs/ViralInvasion_Cycle_v0.8.8.md', `${folder}/integration/frozen-source.json`, `${folder}/integration/test-fixture-update-1.json`, `${folder}/integration/install-receipts.json`,
  `${folder}/release-attempt-1/summary.json`, `${folder}/release-attempt-1/tested-build-meta.json`, `${folder}/release-attempt-1/package-report.json`,
  `${folder}/browser-attempt-1/report.json`, `${folder}/offline-smoke-1/report.json`, `${folder}/release-inspection-2/inspection.json`,
  `${folder}/measurement-attempt-1/derived/comparison.json`, `${folder}/measurement-attempt-1/derived/contribution-share-addendum.json`, `${folder}/measurement-attempt-1/measurement-records.index.json`,
  `${folder}/measurement-attempt-1/candidate/observer-amendment.json`, `${folder}/nonseed-attempt-1.json`,
  `${folder}/visual-review.json`,
];
const summary = { schemaVersion: 1, version: '0.8.8', at: new Date().toISOString(), pass: Object.values(checks).every(Boolean), checks,
  previousGoalTurn: 'progress', currentGoalTurn: 'progress', goalComplete: false,
  change: 'Repeat fixed pressure/release/pressure/release/elite cycles, earned up-to-two-rank elite breakthroughs, and actual directed immune-cell rally/chase with contact-only damage.',
  build: { inputs: 143, gameSha256: build.gameSha256, source: work, renderingAndArt: 'Verified v0.8.7 snapshot; in-flight art-session changes excluded', mainProductionBuildUnchanged: checks.mainProductionBuildUnchanged },
  release: { zip: inspected.archive, bytes: inspected.bytes, sha256: inspected.sha256, independentEntryCount: inspected.files.length },
  regression: build.tests, measurement: { totalCases: 21, independentNormalCases: 18, negativeCases: 2, predeterminedReplay: 1, seeds: [7, 71, 19], strategies: ['shooting', 'area', 'immune'], allNormalCasesCleared35: compared.groups.every(group => group.allCleared35), noRetriesOrReplacementSeeds: true,
    baselineMeasuredReleaseContrasts: compared.groups[0].measuredReleaseContrasts, candidateMeasuredReleaseContrasts: compared.groups[1].measuredReleaseContrasts,
    baselineDistantBiteCommands: `${compared.groups[0].distantCommandsWithPositiveHits}/${compared.groups[0].distantCommands}`,
    candidateDistantBiteCommands: `${compared.groups[1].distantCommandsWithPositiveHits}/${compared.groups[1].distantCommands}` },
  browser: { naturalSixWavePassed: 2, naturalFailed: 0, extractedOfflineModeGroups: 4, scope: 'Real DOM input, early six-wave loop and natural earned breakthrough; not late35-wave browser or human acceptance.' },
  preservedFailures: ['First integrated rules: three failures; real trace-priority regression fixed, outdated speed/HP fixtures corrected without dropping safety assertions.', 'First ZIP inspection setup used the old package-report path and did not enter payload verification; subsequent independent inspection is separate.', 'Original baseline observer cell zero fields retained; uniform actual-positive-root derivation is supplemental, with baseline contact/LOS sampling explicitly absent.'],
  limits: ['Not every release pair or next generation meets the proxy; next-generation renewal25/54, elite renewal55/63.', 'All nine selected strategies still clear35; this does not establish universal difficulty or build balance.', 'Actual immune damage share4.94%->6.25%; rising enemy HP also increases absolute contribution.', 'No new1000-session campaign batch,10-minute device performance, complete memory, human fun, voluntary replay or retention acceptance.', 'Challenge remains centered on tissue/valve, separate from campaign exploration/migration/core.'],
  humanNewPlayers: { observed: 0, required: 5 }, references: Object.fromEntries(references.map(path => [path, hash(path)])) };
writeFileSync(`${folder}/verification-summary.json`, JSON.stringify(summary, null, 2));
copyFileSync(new URL(import.meta.url), `${folder}/finalizer.mjs`);
console.log(JSON.stringify({ pass: summary.pass, checks, release: summary.release }));
if (!summary.pass) process.exitCode = 1;
