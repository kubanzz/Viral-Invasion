// Read-only evidence audit, then create a new index. No game execution or build.
import fs from 'node:fs';
import crypto from 'node:crypto';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert = (ok, message) => { if (!ok) throw Error(message); };
const base = 'artifacts/art-v081/';
const paths = {
  build: base + 'final-build.json', source: base + 'final-source-audit.json', checks: base + 'final-checks.json',
  unit: base + 'unit-final-no-seeds.json', browser1366: base + 'clean-browser-1366/report.json', browser1920: base + 'clean-browser-1920/report.json',
  readability: base + 'readability-clean-body/report.json', visualReview: base + 'visual-review.json',
  native: 'artifacts/cadence-v081/native/run-2026-10-27T18-24-57-713Z/report.json',
  simulation: 'artifacts/cadence-v081/regression/full-system-seeds.json', lineage: 'artifacts/cadence-v081/regression/final-source-lineage.json',
  performance: base + 'performance/report.json', memory: base + 'performance/memory-review.json', invariance: base + 'render-invariance/report.json',
  route: base + 'live-route-final-report.json', fiveWaves: base + 'five-wave-report.json', liveBefore: base + 'live-build-before.json', liveAfter: base + 'live-build-after.json',
  package: 'artifacts/releases/v0.8.1/release-package.json', campaignSmoke: base + 'release-smoke-campaign/report.json', endlessSmoke: base + 'release-smoke-endless/report.json',
};
const r = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, read(p)]));
const game = sha('dist/game.js'), metaHash = sha('dist/build-meta.json'), meta = read('dist/build-meta.json');
assert(game === '4d245ac6bf8d766538cad1602515f1475e24c42db2277fc010eca66e1cff4a4d', 'Final game changed');
assert(metaHash === '877508bd655e3ebad920bbf1ee90e7a797d04d771f27d4ef3c02b9a2ba129543', 'Final metadata changed');
assert(r.build.gameSha256 === game && r.source.pass && r.source.production.gameJsSha256 === game && r.checks.pass, 'Source/check qualification failed');
assert(Object.keys(meta.sourceManifest).length === 128, 'Unexpected source count');
for (const [p, h] of Object.entries(meta.sourceManifest)) assert(sha(p) === h, 'Changed production input: ' + p);
assert(r.unit.success && r.unit.numTotalTests === 635 && r.unit.numFailedTests === 0 && r.unit.testResults.length === 79, 'Final unit qualification mismatch');
const launcher = r.unit.testResults.find(x => x.name.replaceAll('\\', '/').endsWith('/start-local.test.ts'));
assert(launcher?.assertionResults.length === 6 && launcher.assertionResults.every(x => x.status === 'passed'), 'Launcher fixture qualification mismatch');
for (const k of ['browser1366', 'browser1920']) assert(r[k].pass && r[k].complete && r[k].buildUnchanged && r[k].build.gameSha256 === game && r[k].build.metadataSha256 === metaHash && r[k].cases.length === 4 && r[k].cases.every(x => x.pass), 'Presentation qualification failed: ' + k);
assert(r.readability.pass && r.readability.production.gameJsSha256 === game && r.readability.production.buildMetaSha256 === metaHash && r.readability.occlusion.length === 4 && r.readability.dangers.length === 8 && r.readability.silhouettes.length === 5, 'Derived qualification mismatch');
assert(r.readability.requiredProductionSources.every(x => x.exists && x.match), 'Derived production source mismatch');
assert(r.visualReview.passForInspectedTechnicalScope && r.visualReview.gameJsSha256 === game, 'Visual review mismatch');
assert(r.native.status === 'passed-finite-scope' && r.native.expectedBuildSha256 === game && r.native.actualBuildAfterSha256 === game && r.native.channels.length === 2 && r.native.channels.every(x => x.passed), 'Native finite qualification mismatch');
assert(r.simulation.complete && r.simulation.completedSeeds === 1000 && r.simulation.outcomes.wins === 1000 && r.simulation.replay.equal && r.simulation.preparedReplay.equal && r.simulation.simulationSourceUnchanged, '1000-session evidence mismatch');
assert(r.lineage.all40MatchDisk && r.lineage.all29BundledRuntimeSourcesMatch && r.lineage.buildInputsMatchDisk && r.lineage.gameJsSha256 === game, 'Simulation source lineage mismatch');
assert(r.performance.pass && r.performance.releaseGameJsSha256 === game && r.performance.activeSimulationSeconds >= 600 && r.performance.sourceUnchanged, 'Performance qualification mismatch');
for (const [p, h] of Object.entries(r.performance.buildSourceManifest)) assert(meta.sourceManifest[p] === h, 'Performance source mismatch: ' + p);
assert(r.invariance.pass && r.invariance.complete && r.invariance.sourceUnchanged, 'Render invariance qualification failed');
for (const [k, count] of [['route', 1], ['fiveWaves', 2]]) assert(r[k].stats.expected === count && r[k].stats.unexpected === 0 && r[k].stats.flaky === 0 && r[k].errors.length === 0, 'Live qualification failed: ' + k);
assert(r.liveAfter.unchanged && r.liveAfter.files['dist/game.js'] === game, 'Live build identity mismatch');
assert(r.package.staticPass && r.package.sourceValidation.pass && r.package.sourceValidation.count === 128 && r.package.files.find(x => x.name === 'game.js').sha256 === game && r.package.files.find(x => x.name === 'build-meta.json').sha256 === metaHash, 'Package qualification failed');
assert(sha(r.package.zip) === r.package.sha256, 'ZIP checksum mismatch');
for (const k of ['campaignSmoke', 'endlessSmoke']) assert(r[k].pass && r[k].browsers.length === 2 && r[k].browsers.every(x => x.pass) && r[k].hashes['game.js'].packaged === game && r[k].hashes['build-meta.json'].packaged === metaHash, 'Release smoke mismatch: ' + k);
const oldZip = 'releases/Viral-Invasion-G4-v0.8.0.zip', oldHash = sha(oldZip);
assert(oldHash === 'e46edeef4356d39bcc2f49ed56c585bd6e0604fd5623c9937d262400de9346b1', 'Historical ZIP changed');
const index = {
  schemaVersion: 2, generatedAt: new Date().toISOString(), version: '0.8.1', stage: 'G4', pass: true, status: 'verified-technical-candidate',
  scope: 'Current compatible artwork integration, update/build workflow, finite desktop browser presentation, current gameplay regression, 600 active seconds and offline ZIP delivery. No completed-animation or human-incubation acceptance claim.',
  build: { gameJsSha256: game, gameBytes: fs.statSync('dist/game.js').size, buildMetaSha256: metaHash, gameplayCommit: r.build.gameplayCommit, engine: meta.engine, sourceCount: 128, artSignature: meta.art.inputSignature },
  artwork: { externalRoot: r.source.artwork.externalRoot, snapshotFiles: r.source.artwork.external.files, snapshotBytes: r.source.artwork.external.bytes, upstreamByteIdentical: r.source.artwork.identical, newOrChanged: 0, unreviewedCandidates: 0, selectedSources: meta.art.selectedSourceCount, spriteLogicalIds: meta.art.spriteIdCount, environments: meta.art.environmentCount, selectedPoseCandidatesAreNotAllPlayed: true },
  workflow: { sourceLauncher: 'Start-Game.cmd', checkOnly: 'node scripts/start-local.mjs --check', prepareWithoutOpening: 'node scripts/start-local.mjs --no-open', launcherFixtureTests: 6, autoSync: 'Development startup and build; source launcher checks all build inputs and rebuilds if stale. Sync/build errors stop opening.', newCategories: 'Candidate review required; new numbered files do not silently replace an accepted binding.', runningDev: 'Restart after external changes or manually art:sync then refresh.', releaseLauncher: 'Open-Game.cmd opens only the packaged fixed snapshot.' },
  qualifications: {
    unit: { files: 79, tests: 635, passed: 635, separateThousandSessionTestExcluded: true },
    simulation: { formalSessions: 1000, allCompleted: true, replayFingerprintsMatch: true, sourceLineage: '40 current-disk simulation inputs; 29 bundled runtime sources match final metadata, 9 type-only and 2 test inputs are not claimed as bundled production inputs. No repeated 1000-run of the final presentation bundle.' },
    presentation: { cases: 8, browsers: ['chrome', 'msedge'], viewports: [[1366, 768], [1920, 1080]], dprs: [1, 2], pass: true },
    derived: { occlusion: 4, danger: 8, silhouettes: 5, pass: true, scope: 'Artificially positioned clones rendered by current Renderer without simulation advance; AI visual review, no natural reachability or human recognition claim.' },
    native: { pass: true, scope: 'Chrome/Edge real minimize 30 seconds and restore; one naturally earned XP draft each; real settings 125/150% and training shot/repair 125/150/100%.', limitations: r.native.limitations, additionalLimits: ['document.hidden stayed false; no visibilitychange coverage.', 'Zoom PNG capture cropping prevents treating it as whole-UI readability proof.'] },
    performance: { pass: true, activeSeconds: r.performance.activeSimulationSeconds, device: r.performance.device, metrics: r.performance.metrics, maxAlive: 24, maxCells: 3, observedAcceptedCellHitsLowerBound: r.performance.cellHits, densityCoverage: r.performance.coverage, errors: r.performance.errors, remoteRequests: r.performance.requests },
    memory: { verdict: 'observations-only', naturalSamples: r.performance.samples.length, naturalUsedBytes: r.memory.natural.overall.usedBytes, firstLast60Changes: r.memory.natural.firstLast60Changes.usedBytes, forcedGcOnlyAfterMeasurement: true, scope: 'No RSS/VRAM, long-duration leak or native-device conclusion.' },
    renderInvariance: { pass: true, framesPerQuality: 12, aliveActors: 24 }, live: { routePassed: 1, fiveWavesPassed: 2, buildUnchanged: true }, releaseSmoke: { pass: true, modes: ['campaign', 'endless'], browsers: ['chrome', 'msedge'], combinations: 4 },
  },
  release: { path: r.package.zip.replaceAll('\\', '/'), bytes: r.package.bytes, sha256: r.package.sha256, files: r.package.files, verifiedFolder: r.package.verifiedFolder.replaceAll('\\', '/') },
  evidence: Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, { path: p, sha256: sha(p) }])),
  history: { v080: { zip: oldZip, sha256: oldHash, scope: 'All original 0.8.0 evidence remains bound to its original game hash.' }, supersededCandidates: [base + 'candidate-1-build.json', base + 'candidate-2-build.json'], noTestSelectionAttempt: { path: base + 'live-route-report.json', scope: 'Over-anchored title grep selected zero tests; retained as invocation failure, not gameplay failure. Actual final run is indexed separately.' }, failedNativeCandidate: 'Original c6 native attempt remains in artifacts/cadence-v081/native; only final 4d report credited here.' },
  limitations: ['Complete multi-direction continuous animation and finished mother core, FISSION and immune-squad assets remain pending; procedural representations retained.', 'Baked shot/heal poses are candidates pending layer separation; combat uses clean idle/walk and a single independent true-aim tool.', 'Synthetic mimic/tissue same-point case covers part of the hero torso; head/tool/foot ring remain visible. Not every foreground/HUD combination is qualified.', 'Five-new-player blind test remains 0/5; comprehension, retention, replay interest, balance and market incubation are not established by automation.'],
  completionAssessment: { currentUsableArtIntegrated: true, originalsPreserved: true, updateWorkflowVerified: true, finiteDesktopPresentationVerified: true, currentBuildSmoothnessVerified: true, offlineReleaseVerified: true, remainingMandatoryTechnicalWork: [], futureArtAndHumanValidationTracked: true },
};
fs.writeFileSync(base + 'verification-summary.json', JSON.stringify(index, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ pass: true, status: index.status, game, zip: index.release.path, zipSha: index.release.sha256, tests: 635, activeSeconds: index.qualifications.performance.activeSeconds, evidenceFiles: Object.keys(paths).length }));
