import { readFile, writeFile } from 'node:fs/promises';
const summary = JSON.parse(await readFile('artifacts/readability-v076/verification-summary.json', 'utf8'));
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), turnClassification: 'progress', goalStatus: 'active',
  version: summary.version, sourceCommit: summary.sourceCommit, gameSha256: summary.gameSha256, technicalCandidate: 'packaged-and-offline-smoke-passed',
  newProductionChanges: ['Bounded deterministic enemy body spacing and shallow tangential pursuit; already committed attacks keep their real pose/aim/time.',
    'Core fission/brood warning captions use real landing anchors and outside-circle offsets; nearby protected-region edges precede screen rails.'],
  finiteCurrentChecks: { unit: summary.unit, formalSessions: summary.formalSessions, browser: summary.browser, pressure: summary.pressure, package: summary.package },
  finiteACM1604: 'Supported on the recorded Windows/i7-10700K/Chrome155 headless/1366x768 stationary-heart scope, including ten measured minutes and finite V8/DOM review. All actual positive deltas retained; no zero-growth/RSS/GPU/all-device claim.',
  mixedSampling: summary.mixedScenes.map(attempt => ({ directory: attempt.directory, status: attempt.status, pass: attempt.pass, missing: attempt.missing,
    browserClosed: attempt.browserClosed, sourceAndBuildUnchanged: attempt.sourceAndBuildUnchanged })),
  knownRemaining: { representativeMixedVisuals: ['AC-M14-06', 'AC-M14-07', 'VIS-07', 'VIS-11', 'RUN-12'],
    nativeZoomOrFocus: ['AC-M01-02', 'AC-M09-03', 'AC-M14-01', 'AC-M16-06', 'RUN-11', 'VIS-10'],
    normalPacing: ['AC-M13-01'], realFirstPlayers: ['AC-M14-02', 'AC-M16-05', 'VIS-12'], visualAggregate: ['AC-M16-07'], firstPlayers: '0/5; user deferred until after technical candidate.' },
  concreteVisualLimitations: ['High-density enemy bodies and overlapping actual attack rings can still cover the player; HUD edge and tissue captions can cover peripheral enemies.',
    'The third immune cell can be partly behind an elite. One-enemy cooperation images are not dense-combat acceptance.',
    'No qualified representative mixed weakness/low-effects pair was closed. Raw rejected captures remain rejected.'],
  nextWork: ['Address player identification when dense actors occlude it, then verify the changed render path with a finite representative scene.',
    'Repair the observed mixed weakpoint sampling route and timing without changing live game state or removing genuine visual criteria.',
    'Obtain supported real zoom/native-focus and real normal first-play/5-player observations when available.'],
  noFreshAll112Reclassification: true, repetitionPolicy: 'Repeat frozen checks only for a new relevant source change, failure or specific unresolved concern.' };
await writeFile('artifacts/readability-v076/completion-status.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ version: report.version, technicalCandidate: report.technicalCandidate, goalStatus: report.goalStatus, turnClassification: report.turnClassification }));
