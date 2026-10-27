import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const out = 'artifacts/duet-v087', read = path => JSON.parse(readFileSync(path, 'utf8'));
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const check = (ok, why) => { if (!ok) throw Error(why); };
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2), { flag: 'wx' });
check(!existsSync(`${out}/verification-summary.json`), 'Preserve verification summary');
const rules = read(`${out}/regression/nonseed-results-final.json`), seeds = read(`${out}/regression/full-system-seeds.json`);
const meta = read('dist/build-meta.json'), release = read('artifacts/releases/v0.8.7/release-package.json');
const inspection = read(`${out}/release/inspection-2/inspection.json`), offline = read(`${out}/release/offline-smoke-2/report.json`);
check(meta.version === '0.8.7' && meta.stage === 'G4', 'Unexpected build');
check(rules.numPassedTests === 920 && rules.numFailedTests === 0 && rules.testResults.length === 97, 'Rules incomplete');
for (const mode of ['rules', 'build']) check(read(`${out}/regression/${mode}-commands-final.json`).checks.every(c => c.exitCode === 0), `Final ${mode} command failed`);
check(read(`${out}/regression/campaign-commands.json`).checks.every(c => c.exitCode === 0), 'Campaign command failed');
check(seeds.complete && seeds.completedSeeds === 1000 && seeds.runs.length === 1000 && seeds.runs.every(r => r.outcome === 'win')
  && seeds.replay.equal && seeds.preparedReplay.equal && seeds.simulationSourceUnchanged, 'Campaign incomplete');
for (const [path, hash] of Object.entries(seeds.simulationSourceManifest)) check(sha(path) === hash, `Campaign input changed: ${path}`);
const owned = read(`${out}/integration/frozen-owned-source-v2.json`);
const labelPrep = read(`${out}/render-label-v3/preparation.json`), labelLineage = read(`${out}/render-label-v3/source-lineage.json`);
check(labelLineage.pass && labelLineage.changedInputs.length === 1 && labelLineage.changedInputs[0] === labelPrep.sourcePath, 'Unexpected V3 source changes');
const labelChecks = read(`${out}/render-label-v3/v3-checks-commands.json`), labelTests = read(`${out}/render-label-v3/presentation14.json`);
check(labelChecks.pass && labelChecks.checks.every(c => c.exitCode === 0) && labelTests.numPassedTests === 14
  && labelTests.numFailedTests === 0, 'V3 checks incomplete');
const finalOwned = owned.rows.map(row => row.path === labelPrep.sourcePath ? { ...row, sha256: labelPrep.candidateSha256 } : row);
for (const row of finalOwned) check(sha(row.path) === row.sha256, `Owned V3 input changed: ${row.path}`);
for (const [path, hash] of Object.entries(meta.sourceManifest)) check(sha(path) === hash, `Delivery input changed: ${path}`);
const parsed = read(`${out}/comparison-attempt-1/candidate/parsed-source-fingerprints.json`);
for (const row of parsed) if (row.path.startsWith('src/')) check(sha(row.path) === row.sha256, `Measured input changed: ${row.path}`);
const measured = read(`${out}/comparison-attempt-1/report.json`);
check(measured.plan.totalCases === 7 && measured.plan.retries === 0, 'Comparison plan changed');
check(measured.completedRuns === 7 && measured.plan.goalWaves === 35 && measured.plan.simulationSeconds === 900
  && measured.plan.simulationSecondsPerWave === 120, 'Comparison budget differs');
const caseKeys = measured.results.map(r => `${r.version}:${r.seed}:${r.replay}`).sort();
check(JSON.stringify(caseKeys) === JSON.stringify(['baseline:7:false', 'baseline:71:false', 'baseline:19:false',
  'candidate:7:false', 'candidate:71:false', 'candidate:19:false', 'candidate:71:true'].sort()), 'Fixed case identities differ');
check(measured.results.length === 7 && measured.results.filter(r => !r.replay).length === 6
  && measured.results.every(r => r.stop === 'thirty-five-waves-cleared' && r.clearedWaves === 35
    && r.measurementError === null && r.observerViolationKinds === 0 && r.originalAndObserverInputHashesEqual), 'Fixed case outcome differs');
check(measured.replayCheck.exactRawFileBytesEqual && measured.measurementFilesUnchanged, 'Replay/source proof incomplete');
const replayOriginal = `${out}/comparison-attempt-1/candidate/seed-71.json`, replayCopy = `${out}/comparison-attempt-1/candidate/seed-71-replay-1.json`;
check(readFileSync(replayOriginal).equals(readFileSync(replayCopy))
  && sha(replayOriginal) === measured.replayCheck.originalFileSha256 && sha(replayCopy) === measured.replayCheck.replayFileSha256, 'Replay bytes differ');
const normalCandidate = measured.results.filter(r => r.version === 'candidate' && !r.replay);
check(normalCandidate.length === 3 && normalCandidate.reduce((n, r) => n + r.duetBodies, 0) === 12
  && normalCandidate.every(r => r.bodiesWithCompanionCommitted === 0), 'Normal companion coverage differs');
for (const result of measured.results) check(sha(`${out}/comparison-attempt-1/${result.file}`) === result.rawFileSha256, 'Measured raw changed');
check(inspection.pass && offline.pass && sha('dist/game.js') === inspection.expectedGameSha256 && sha(release.zip) === release.sha256, 'Release incomplete');
check(Object.keys(meta.sourceManifest).length === 142, 'Unexpected delivery count');
const tested = read(`${out}/browser-attempt-2/tested-game-hash.json`);
check(tested.gameSha256 === labelLineage.v2GameSha256 && sha('dist/game.js') === labelLineage.v3GameSha256
  && tested.testSha256 === sha('tests/e2e/duet-v087.spec.ts'), 'Natural/render lineage changed');
const testedMeta = read(`${out}/browser-attempt-2/tested-build-meta.json`);
const browserInputDifferences = Object.keys(meta.sourceManifest).filter(path => meta.sourceManifest[path] !== testedMeta.sourceManifest[path]);
check(browserInputDifferences.length === 1 && browserInputDifferences[0] === labelPrep.sourcePath, 'Natural-tested gameplay changed');
const browser = read(`${out}/browser-attempt-2/summary.json`);
check(browser.checks.length === 2 && browser.checks.find(c => c.project === 'chrome')?.exitCode === 0
  && browser.checks.find(c => c.project === 'edge')?.exitCode === 1, 'Preserve actual browser outcomes');
const visual = read(`${out}/browser-attempt-2/visual-review.json`); check(visual.pass, 'Visual inspection incomplete');
const rendered = read(`${out}/render-label-v3/replay-attempt-1/summary.json`);
check(rendered.pass && rendered.results.length === 4 && rendered.v3GameSha256 === sha('dist/game.js'), 'Final presentation replay incomplete');
const browsers = [];
for (const project of ['chrome', 'edge']) {
  const files = [];
  const walk = dir => { for (const item of readdirSync(dir, { withFileTypes: true })) { const path = `${dir}/${item.name}`; if (item.isDirectory()) walk(path); else if (item.name === 'natural-duet.json') files.push(path); } };
  walk(`${out}/browser-attempt-2/${project}/output`); check(files.length === 1, `Ambiguous raw browser: ${project}`);
  const raw = read(files[0]); check(raw.warningChecked && !raw.gaps.length && !raw.errors.length && !raw.remote.length, `Browser scope incomplete: ${project}`);
  if (project === 'chrome') check(raw.complete, 'Chrome natural observation incomplete');
  else check(!raw.complete && raw.final.phase === 'result' && raw.final.tissue.hp === 0 && raw.final.result?.success === false
    && raw.final.result.reason.includes('核心组织失守'), 'Edge failure must remain the actual terminal tissue loss');
  const commits = raw.events.filter(e => e.type === 'ELITE_TACTIC_COMMITTED' && e.data.actorId === raw.eliteId);
  const advances = raw.events.filter(e => e.type === 'ELITE_TACTIC_ADVANCED' && e.data.actorId === raw.eliteId);
  check(commits.length >= 2 && advances.length >= 2 && commits[0].data.tactic !== commits[1].data.tactic, 'Two actions not observed');
  for (const commit of commits.slice(0, 2)) {
    check(raw.events.some(e => e.type === 'ENEMY_TACTIC_COMMITTED' && e.tick === commit.tick && e.data.actorId === raw.eliteId && e.data.tactic === commit.data.tactic), 'Commit lacks real frozen plan');
    check(advances.filter(e => e.data.committedTick === commit.data.committedTick).length === 1, 'Advance count differs');
  }
  check(commits[1].tick / 60 + 1e-7 >= Number(advances[0].data.recoverUntil), 'Recovery skipped');
  const warning = raw.events.find(e => e.type === 'ENDLESS_EVOLUTION_WARNING' && e.data.wave === 20);
  const applied = raw.events.find(e => e.type === 'ENDLESS_EVOLUTION_APPLIED' && e.data.wave === 20);
  check(warning && applied && applied.tick - warning.tick === 480, 'Warning not eight seconds');
  const shown = raw.observations.find(o => o.warning), scrolled = raw.observations.find(o => o.scrolledWarning);
  check(shown?.layout && shown?.box, 'Missing warning layout evidence');
  if (shown.layout.scrollHeight > shown.layout.clientHeight) check(scrolled?.scrolledWarning.scrollTop > 0, 'Overflow inaccessible');
  browsers.push({ project, raw: files[0], viewport: raw.viewport, eliteId: raw.eliteId, warningTicks: applied.tick - warning.tick,
    tactics: commits.slice(0, 2).map(e => e.data.tactic), advances: advances.slice(0, 2).map(e => ({ tick: e.tick, reason: e.data.reason, recoverUntil: e.data.recoverUntil })),
    warningLayout: shown.layout, scrolled: scrolled?.scrolledWarning ?? null, observationPolicy: 'Hold fire from20 and orbit actual tissue; no HP/position/time/birth/rank injection. This is not the normal sustained-fire balance strategy.',
    twoActualActionsVerified: true, testPassed: raw.complete, finalPhase: raw.final.phase, tissueHp: raw.final.tissue.hp,
    preservedFailure: project === 'edge' ? 'The second action actually resolved on the terminal tissue-loss tick; the test fails before accepting completion. No replacement run.' : null });
}
write(`${out}/browser-attempt-2/actual-actions-review.json`, { pass: true, scope: 'Read-only derivation of original V2 browser records.', results: browsers });
const archives = read(`${out}/comparison-attempt-1/raw-evidence-archives.json`);
check(archives.pass && archives.files?.length === 7, 'Raw evidence archives incomplete');
const derived = read(`${out}/comparison-attempt-1/derived-review.json`);
check(archives.derivedReviewSha256 === sha(`${out}/comparison-attempt-1/derived-review.json`)
  && derived.aggregates.candidate.duetBirths === 12 && derived.aggregates.candidate.companionCommittedBodies === 0
  && derived.aggregates.candidate.failedDerivedChecks === 0 && derived.aggregates.baseline.failedDerivedChecks === 0
  && derived.replay.exactOriginalFileBytesEqual, 'Derived review differs');
check(new Set(archives.files.map(r => r.rawPath)).size === 7 && new Set(archives.files.map(r => r.gzipPath)).size === 7, 'Duplicate archive paths');
for (const row of archives.files) {
  const compressed = readFileSync(row.gzipPath), raw = readFileSync(row.rawPath);
  const expanded = gunzipSync(compressed), result = measured.results.find(r => `${out}/comparison-attempt-1/${r.file}` === row.rawPath);
  check(result && row.gzipPath === row.rawPath + '.gz' && expanded.equals(raw)
    && raw.length === row.rawBytes && compressed.length === row.gzipBytes && expanded.length === row.decompressedBytes
    && sha(row.rawPath) === row.rawSha256 && sha(row.gzipPath) === row.gzipSha256
    && row.decompressedSha256 === row.rawSha256 && row.rawSha256 === result.rawFileSha256, `Archive differs: ${row.rawPath}`);
}
const source = { pass: true, version: '0.8.7', parentCommit: 'c307353', ownedInputs: finalOwned,
  parsedMeasuredRuntimeInputs: parsed.filter(r => r.path.startsWith('src/')), campaignInputCount: Object.keys(seeds.simulationSourceManifest).length,
  deliveryInputs: Object.keys(meta.sourceManifest).length, packagingReadmeSha256: sha('scripts/package-release.mjs'),
  note: 'V2 revises five UI/test files; V3 changes exactly two scene-label colors in one renderer. Gameplay in campaigns/comparison/natural browsers matches final main/build. Shared art/build work remains unstaged; final runtime is attested by all build hashes.' };
write(`${out}/integration/frozen-owned-source-v3.json`, { version: '0.8.7', revision: 3, rows: finalOwned });
write(`${out}/integration/final-source-lineage.json`, source);
mkdirSync(`${out}/tools`, { recursive: true });
const scripts = ['init-duet-v087.mjs', 'init-duet-v086-baseline.mjs', 'integrate-duet-v087.mjs', 'finalize-duet-v087.mjs',
  'run-duet-v087-checks.mjs', 'run-duet-v087-browser.mjs', 'run-duet-v087-browser-final.mjs', 'compare-duet-v087.mjs',
  'prepare-delivery-v087.mjs', 'inspect-v087-release.mjs', 'verify-offline-v087.mjs', 'finalize-evidence-v087.mjs', 'review-duet-v087-browser2.mjs',
  'integrate-duet-v087-label-v3.mjs', 'verify-duet-v087-label-v3-lineage.mjs', 'replay-duet-v087-label-v3.mjs',
  'preserve-duet-v087-ui-v2.mjs', 'prepare-delivery-v087-v3.mjs', 'inspect-v087-release-v3.mjs', 'verify-offline-v087-v3.mjs',
  'prepare-duet-v087-label-v3.mjs', 'run-duet-v087-v3.mjs'];
for (const name of scripts) cpSync(`.tools/${name}`, `${out}/tools/${name}`, { errorOnExist: true, force: false });
cpSync('.tools/duet-v087-source/isolation-manifest.json', `${out}/integration/isolation-baseline.json`, { errorOnExist: true, force: false });
cpSync('.tools/duet-v087-source/artifacts/duet-core-implementation-report.json', `${out}/regression/core-implementation-report.json`, { errorOnExist: true, force: false });
cpSync('.tools/duet-v087-source/artifacts/duet-ui-repair.json', `${out}/regression/ui-v2-targeted.json`, { errorOnExist: true, force: false });
const docPath = 'Docs/ViralInvasion_DualElite_v0.8.7.md';
check(!readFileSync(docPath, 'utf8').includes('_PENDING'), 'Document unfinished');
const references = [docPath, 'Docs/ViralInvasion_Playtest.md', `${out}/regression/nonseed-results-final.json`, `${out}/regression/nonseed-results.json`,
  `${out}/regression/full-system-seeds.json`, `${out}/regression/core-implementation-report.json`, `${out}/regression/birth-implementation-report.json`,
  `${out}/comparison-attempt-1/report.json`, `${out}/comparison-attempt-1/derived-review.json`, `${out}/comparison-attempt-1/raw-evidence-archives.json`,
  `${out}/browser-attempt-2/summary.json`, `${out}/browser-attempt-2/actual-actions-review.json`, `${out}/browser-attempt-2/visual-review.json`,
  `${out}/integration/final-source-lineage.json`, `${out}/render-label-v3/source-lineage.json`, `${out}/render-label-v3/replay-attempt-1/summary.json`,
  `${out}/release/inspection-2/inspection.json`, `${out}/release/offline-smoke-2/report.json`,
  'artifacts/releases/v0.8.7/release-package.json', 'dist/game.js', 'dist/build-meta.json'];
write(`${out}/verification-summary.json`, { schemaVersion: 1, version: '0.8.7', at: new Date().toISOString(), technicalCandidate: true,
  change: 'From20, first elite of each elite wave alternates the two announced tactics, preserving recovery, counterplay, finite queue and fission reservations.',
  regression: { files: 97, passed: 920, strictTypecheckExitCode: 0, completeCampaignSessions: 1000, campaignWins: 1000, replayPairsEqual: 2,
    finalColorOnlyRevision: { strictTypecheckExitCode: 0, targetedPresentationPassed: 14, unchangedBuildInputs: 141 } },
  source: { pass: true, deliveryInputs: 142, ownedV2Inputs: owned.rows.length, measuredRuntimeFiles: source.parsedMeasuredRuntimeInputs.length },
  comparison: { independentCases: 6, predeterminedReplay: 1, allCleared35: measured.results.every(r => r.clearedWaves === 35), replayEqual: measured.replayCheck.exactRawFileBytesEqual,
    dualEliteBirths: normalCandidate.reduce((n, r) => n + r.duetBodies, 0), companionCommitted: normalCandidate.reduce((n, r) => n + r.bodiesWithCompanionCommitted, 0),
    limitation: 'All12 normal sustained-fire elites died before a companion commitment; no artificial survival, tuning, replacement seeds or retries.' },
  browser: { testsPassed: browser.checks.filter(c => c.exitCode === 0).length, testsFailed: browser.checks.filter(c => c.exitCode !== 0).length,
    reviewedNaturalRuns: browsers.length, naturalBuild: tested.gameSha256, finalBuild: sha('dist/game.js'),
    results: browsers, offlineModeGroups: 4, finalOfflinePass: offline.pass, finalPresentationReplayGroups: rendered.results.length, visualReview: visual },
  release: { zip: release.zip, bytes: release.bytes, sha256: release.sha256, gameSha256: inspection.expectedGameSha256, independentCrc32Pass: true, files: 5 },
  humanBlindPlaytests: { completed: 0, required: 5 },
  preservedFailures: ['Initial main rules919 pass/1 fail: obsolete single-elite copy assertion; inspection also found missing full two-action counters. V2 repairs both and final920 passes.',
    'Early birth-test assertion/type-narrowing failures remain in original isolated reports; no retroactive relabeling.',
    'Normal sustained-fire comparison does not reach companion attacks (0/12). Browser deliberately holds fire to observe behavior and is disclosed separately.',
    'V2 Edge natural observation failed on real terminal tissue loss even though raw receipts record its second action resolved at that tick; not counted as a passed test.',
    'V2 screenshots exposed dark scene-label text; final V3 changes exactly two color literals and is checked by read-only snapshot presentation replay.'],
  limitations: ['No new human fun, comprehension, replay intent, first-session duration, retention or incubation-value evidence.', 'No new600s performance, physical OS focus or real browser zoom validation.',
    'Continuous challenge keeps central tissue/valve objectives; the two-organ district exploration belongs to campaign.', 'No promise that every elite lives to its companion or every Q cell reaches contact.',
    'Final build includes preserved unrelated art/build inputs; local focused commit alone does not reconstruct those unstaged inputs.'],
  scripts: scripts.map(name => ({ path: `${out}/tools/${name}`, sha256: sha(`${out}/tools/${name}`) })),
  references: references.map(path => ({ path, sha256: sha(path) })) });
console.log(JSON.stringify({ technicalCandidateReady: true, rules: 920, campaignWins: 1000,
  browsers: browsers.map(b => ({ project: b.project, tactics: b.tactics, testPassed: b.testPassed, finalPhase: b.finalPhase })),
  release: { bytes: release.bytes, sha256: release.sha256 } }));
