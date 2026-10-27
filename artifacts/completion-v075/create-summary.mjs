import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = 'artifacts/completion-v075';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const references = [
  'migration-three-way/attempt-1/execution.json', 'migration-three-way/review.json',
  'performance/attempt-1/execution.json', 'performance/attempt-1/memory-verdict.json',
  'visual-capture/core-cf-attempt-3/execution.json', 'visual-capture/core-mc-attempt-2/execution.json',
  'visual-capture/fatal-infection-attempt-1/execution.json', 'visual-capture/fatal-collapse-attempt-1/execution.json',
  'visual-capture/review.json', 'render-comparisons/base-attempt-1/execution.json',
  'render-comparisons/core-attempt-1/execution.json', 'render-comparisons/base-review.json', 'render-comparisons/core-review.json',
];
const evidence = [];
for (const path of references) {
  const raw = await readFile(base + '/' + path);
  const value = JSON.parse(raw);
  if (path.endsWith('/execution.json')) {
    const closed = value.browserClosed === true || value.browserCloseSucceeded === true || value.childProcessesTerminal === true;
    if ((value.pass !== true && value.exitCode !== 0) || !closed) throw Error('Expected successful, closed execution: ' + path);
  }
  evidence.push({ path: base + '/' + path, sha256: sha(raw) });
}
const performance = await read(base + '/performance/attempt-1/report.json');
const summary = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), turnClassification: 'progress', goalStatus: 'active',
  version: '0.7.5', gameSha256: performance.releaseGameJsSha256,
  sourceCommit: '474db0dbebc3ee49e2db304613c72871801c97fc',
  previousEvidenceCommit: '85dd6cc9f1a1fd8e9b967545d12923de65503f2b',
  productionChange: 'No production source, gameplay rule, build or release-package changes in this completion turn. New evidence and its bounded capture tools only.',
  newFiniteRequirementVerdicts: {
    'AC-M12-02': 'proven: fixed seed91/campaign-1/guided/field initial case, three actual IV outcomes, accepted costs and four reviewed native images.',
    'AC-M16-04': 'proven within the recorded Windows/i7-10700K/Chrome-headless/1366x768 stationary-heart finite ten-minute scope; actual positive memory deltas retained.',
  },
  runtime: {
    activeSeconds: performance.activeSimulationSeconds, modes: performance.metrics,
    naturalSamples: performance.samples.length,
    acceptedBeaconBites: performance.acceptedControlDuringMeasurement.beaconBites,
    observedRequestLogs: performance.cellHits,
    naturalAndForcedGcSeparated: true,
    naturalFirstLastMinuteUsedMedianIncreasePercent: 20.29,
    tenMenuRestartCollectedUsedIncreaseBytes: 183708,
    tenMenuRestartCollectedUsedIncreasePercent: 3.42,
    memoryScope: 'Finite observed V8/DOM retention, not zero growth, total RSS/GPU or repeated true settlements. Lung stayed unactivated in the pressure case.',
  },
  nativeCapture: {
    migrationCases: 3, migrationImagesReviewed: 4,
    coreCases: 2, coreImagesReviewed: 8, fatalCases: 2, fatalImagesReviewed: 2,
    infectionCritical: 'Actual100% at1000x560/low with visible14.9s recovery warning.',
    organAlarm: 'Actual heart30% at1366x768/low with visible organ-danger warning.',
    scope: 'Real DOM input cases. Images bracketed by two true states, not exact native tick or same-state native quality A/B. Root viewed the native images separately from independent agent review.',
  },
  isolatedCanvas: {
    baseStates: 4, coreStates: 5, independentModes: 2, framesPerModePerState: 12,
    outcome: 'Complete state/HP/damage-log/collision-geometry checks unchanged at render boundaries.',
    scope: 'Pure drawing from unmodified real snapshots; no production DOM HUD, game step, actual new damage execution, performance measurement or human result.',
  },
  inheritedCurrentVersionChecksNotRepeated: { unit: '53 files /436 pass', browser: '26 targeted Chrome/Edge allocations pass', full1000FormalSessions: 'Not rerun in this turn.' },
  retainedFailures: [
    'performance/preflight-failure.json: wrapper expected-hash transcription rejected before browser launch.',
    'visual-capture/core-cf-attempt-1: host drift, original bytes/notes retained; offscreen image is not qualified visibility evidence.',
    'visual-capture/core-cf-attempt-2: capture-host held-key mismatch, real safety margin exhausted; no qualified images.',
    'visual-capture/core-mc-attempt-1: actual quality UI update was not awaited; rejected before a qualified capture.',
  ],
  remainingKnownOpen: {
    representativeMixedVisuals: ['AC-M14-06', 'AC-M14-07', 'VIS-07', 'VIS-11', 'RUN-12'],
    actualBrowserZoomOrNativeFocus: ['AC-M01-02', 'AC-M09-03', 'AC-M14-01', 'AC-M16-06', 'RUN-11', 'VIS-10'],
    actualNormalPacing: ['AC-M13-01'],
    realFirstPlayerObservation: ['AC-M14-02', 'AC-M16-05', 'VIS-12'],
    visualAggregate: ['AC-M16-07'],
    firstPlayers: '0/5; user deferred real blind playtests after the technical candidate. Personal prior feedback is separate.',
    scope: 'This is the known remaining subset from the earlier audit after two finite rows gained new evidence. It is not a fresh all112 reclassification.',
  },
  concreteVisualLimitations: [
    'CF3 first native recovery body clipped at right edge/HUD; MC2 has a separate full-body recovery at another actual tick.',
    'Corrosion target tissue/radius is below the native viewport; visible dashed segment, Q instruction and core panel remain. No whole target-region claim.',
    'Base crisis tissue/countdown is out of camera; heal signals overlap same-point ordinary attacks; selected scan source is only0.0167s old.',
    'Some essential fission/brood countdown labels fall back to the top screen rail far from their actual landing; inspect local placement preferences before broad visual promotion.',
    'World24, on-screen centers and independently distinguishable silhouettes are different quantities. No representative dense-particle-foreground decisive mix was closed.',
  ],
  nextWork: [
    'Resolve concrete mixed-body/ring/HUD readability issues with representative real scenes and proportionate fixes/verification, without inventing an exhaustive all-combination gate.',
    'Obtain actual browser zoom/native focus through supported capability or original user observations; never relabel resize/DPR/synthetic blur as those actions.',
    'Collect genuine normal10-15minute session and five-first-player observations when available; do not simulate subjective comprehension, fun or commercial potential.',
  ],
  repetitionPolicy: 'Do not repeat the frozen600s run, nine Canvas states,26-browser suite or1000 sessions without a new change, failure or unresolved concern that justifies it.',
  evidence,
};
await writeFile(base + '/completion-status.json', JSON.stringify(summary, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ written: base + '/completion-status.json', evidenceReferences: evidence.length,
  finiteRows: Object.keys(summary.newFiniteRequirementVerdicts), goalStatus: summary.goalStatus }));
