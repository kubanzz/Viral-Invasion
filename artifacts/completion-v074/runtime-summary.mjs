import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectWork074, verifyFrozen074 } from './runtime-guards.mjs';

const root = 'artifacts/completion-v074';
const sha = raw => createHash('sha256').update(raw).digest('hex');
const read = async path => { const raw = await readFile(path); return { path, sha256: sha(raw), value: JSON.parse(raw.toString('utf8')) }; };
const burstReport = await read(`${root}/chain-burst/attempt-1/report.json`), burstExecution = await read(`${root}/chain-burst/attempt-1/execution.json`), burstReview = await read(`${root}/chain-burst/attempt-1/review.json`);
const pressureReport = await read(`${root}/performance/attempt-1/report.json`), pressureExecution = await read(`${root}/performance/attempt-1/execution.json`), memoryReview = await read(`${root}/performance/attempt-1/memory-review.json`);
const frozen = await verifyFrozen074(), guards = await inspectWork074();
const burst = burstReport.value, bRun = burstExecution.value, p = pressureReport.value, pRun = pressureExecution.value;
const sourceFiles = {};
for (const file of [burstReport, burstExecution, burstReview, pressureReport, pressureExecution, memoryReview]) sourceFiles[file.path] = file.sha256;
const checks = {
  burstPass: burst.pass === true && burst.completedMechanismChecks === true && burst.diagnosticTimingTargetsMet === true,
  burstTerminal: bRun.exitCode === 0 && bRun.browserCloseSucceeded === true && bRun.sourceUnchanged === true,
  burstIndependentReadReviewPass: burstReview.value.allChecksPassed === true,
  pressurePass: p.pass === true && p.status === 'passed',
  pressureTerminal: pRun.exitCode === 0 && pRun.browserCloseSucceeded === true && pRun.sourceUnchanged === true,
  pressureActive600: p.activeSimulationSeconds >= 600,
  sameFinalCandidate: p.releaseGameJsSha256 === frozen.gameSha256 && burst.frozen.gameSha256 === frozen.gameSha256 && memoryReview.value.sameCaseBundle === true,
  recorded60BuildInputs: p.frozen.buildInputCount === 60 && burst.frozen.buildInputCount === 60,
  pressureNoPageErrorOrRemoteRequest: p.errors.length === 0 && p.requests.length === 0,
  measurementAcceptedBeaconHits: p.acceptedControlDuringMeasurement.beaconBites > 0,
  realTwoQuality24Plus3Snapshots: !!p.dense_standard && !!p.dense_low && p.maxActors === 24 && p.maxCells === 3,
  allCooperativeJobsTerminalAndLockReleased: guards.exclusiveReady && guards.lock === null,
};
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), mode: 'Read-only terminal consolidation of already-completed isolated burst and real formal600-second pressure. No new browser, test or game execution.',
  frozenGameSha256: frozen.gameSha256, checks, allChecksPassed: Object.values(checks).every(Boolean), sourceFiles,
  burst: { reportPath: burstReport.path, executionPath: burstExecution.path, rawPath: `${root}/chain-burst/attempt-1/raw-samples.json`, reviewPath: burstReview.path,
    pass: burst.pass, completedMechanismChecks: burst.completedMechanismChecks, diagnosticTimingTargetsMet: burst.diagnosticTimingTargetsMet,
    measuredSamples: burstReview.value.measuredSamples, positiveBasicHitInputs: burstReview.value.measuredPositiveBasicHitInputs,
    maximumTotalSyncP95Ms: Math.max(...burst.timingSummary.map(row => row.timing.totalSyncCpuMs.p95)),
    maximumNextRafP95Ms: Math.max(...burst.timingSummary.map(row => row.timing.nextRafIntervalMs.p95)),
    scope: burst.acceptanceScope },
  pressure: { reportPath: pressureReport.path, executionPath: pressureExecution.path, memoryReviewPath: memoryReview.path,
    frameTimesPath: `${root}/performance/attempt-1/frame-times.json`, pass: p.pass, activeSimulationSeconds: p.activeSimulationSeconds,
    metrics: p.metrics, coverage: p.coverage, acceptedControlDuringMeasurement: p.acceptedControlDuringMeasurement,
    finalAcceptedControlIncludingSetupAndWarmup: p.runMetrics.finalSummary.control,
    pollRequestedBeaconLogCount: p.cellHits, naturalSamples: p.samples.length, metricSnapshots: p.runMetrics.observedSnapshots,
    maximumObservedMetricFrameEntries: p.runMetrics.maxFrameEntries, metricFrameEntryLimit: p.runMetrics.frameLimit,
    finalMetricsLimited: p.runMetrics.finalSummary.limited, sourceUnchanged: p.sourceUnchanged,
    driverSourceInputCount: p.driverSourceChecks.length,
    denseStandard: p.dense_standard, denseLow: p.dense_low,
    browserCloseSucceeded: pRun.browserCloseSucceeded, executionExitCode: pRun.exitCode,
    memory: { windowMedianChanges: memoryReview.value.natural.windowMedianChanges,
      menuTenRestartsDelta: memoryReview.value.postMeasurement.menuTenRestartsDelta,
      menuNodeCounts: memoryReview.value.postMeasurement.menuNodeCounts, menuListenerCounts: memoryReview.value.postMeasurement.menuListenerCounts },
  },
  cooperativeGuardTerminalReview: guards,
  limitations: ['The burst uses actual private production-method delegation in isolated explicit fixtures. The100-target clear fixture exceeds the normal24-actor cap and is not a supported ordinary combat density claim.',
    'The pressure is one real retained-production strategy, not a victory or human blind play.24+3 screenshots and polled density/metric maxima are observations rather than every-tick universal claims.',
    'Synchronous canvas CPU and RAF intervals do not establish GPU completion or all-device/native foreground performance.',
    'Natural used/capacity growth and later forced-GC retained-size differences are finite observations. They neither prove absence of leaks nor establish a leak diagnosis.',
    'No additional browser was started by this summary. Browser close success and cooperative lock release refer only to these tools; no user browser inventory or process termination is performed.'],
};
await writeFile(`${root}/runtime-summary.json`, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ allChecksPassed: report.allChecksPassed, failedChecks: Object.entries(checks).filter(([, value]) => !value).map(([key]) => key),
  burst: report.burst, pressure: { activeSimulationSeconds: p.activeSimulationSeconds, metrics: p.metrics, acceptedControlDuringMeasurement: p.acceptedControlDuringMeasurement,
    finalBeaconBites: p.runMetrics.finalSummary.control.beaconBites, polledRequestLogs: p.cellHits, naturalSamples: p.samples.length,
    metricSnapshots: p.runMetrics.observedSnapshots, maxObservedFrameEntries: p.runMetrics.maxFrameEntries, sourceUnchanged: p.sourceUnchanged,
    executionExitCode: pRun.exitCode, browserCloseSucceeded: pRun.browserCloseSucceeded }, guards: { exclusiveReady: guards.exclusiveReady, lock: guards.lock } }));
if (!report.allChecksPassed) process.exitCode = 1;
