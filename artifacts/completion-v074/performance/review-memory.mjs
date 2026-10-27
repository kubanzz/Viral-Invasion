import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ prepared: true, browserStarted: false, evidenceRead: false, method: 'Read-only finite natural/terminal-GC derivation; no new game execution.' }));
  process.exit(0);
}
const folder = process.argv[2];
const inside = folder && relative(resolve('artifacts/completion-v074/performance'), resolve(folder));
if (!inside || inside.startsWith('..') || /^[A-Za-z]:/.test(inside)) throw new Error('Provide one completed attempt directory inside completion-v074/performance.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reportRaw = await readFile(`${folder}/report.json`), executionRaw = await readFile(`${folder}/execution.json`);
const report = JSON.parse(reportRaw.toString('utf8')), execution = JSON.parse(executionRaw.toString('utf8'));
if (!execution.finishedAt || !Number.isInteger(execution.exitCode) || execution.browserCloseSucceeded !== true) throw new Error('A closed-browser execution terminal is required before memory review.');
const samples = report.samples;
if (!Array.isArray(samples) || !samples.length || samples.some(row => row.forcedGc !== false)) throw new Error('Expected nonempty explicitly natural samples.');
const numeric = values => {
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid natural numeric sample.');
  const sorted = values.slice().sort((a, b) => a - b), middle = sorted.length / 2;
  return { count: values.length, min: sorted[0], median: sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2,
    max: sorted.at(-1), first: values[0], last: values.at(-1) };
};
const accessors = {
  usedBytes: row => row.naturalV8.usedBytes, allocatedCapacityBytes: row => row.naturalV8.allocatedCapacityBytes,
  embedderUsedBytes: row => row.naturalV8.embedderUsedBytes, backingStorageBytes: row => row.naturalV8.backingStorageBytes,
  domNodes: row => row.dom.nodes, listeners: row => row.dom.jsEventListeners,
};
const describe = rows => ({ samples: rows.length, ...Object.fromEntries(Object.entries(accessors).map(([key, accessor]) => [key, rows.length ? numeric(rows.map(accessor)) : null])),
  documents: [...new Set(rows.map(row => row.dom.documents))] });
const activeEnd = report.activeSimulationSeconds;
const first60 = samples.filter(row => row.activeSimulationSeconds >= 0 && row.activeSimulationSeconds < 60);
const last60 = samples.filter(row => row.activeSimulationSeconds >= Math.max(0, activeEnd - 60) && row.activeSimulationSeconds <= activeEnd);
const windows = Array.from({ length: Math.max(1, Math.ceil(activeEnd / 60)) }, (_, index) => {
  const start = index * 60, end = Math.min((index + 1) * 60, activeEnd);
  const selected = samples.filter(row => row.activeSimulationSeconds >= start && (index === Math.ceil(activeEnd / 60) - 1 ? row.activeSimulationSeconds <= end : row.activeSimulationSeconds < end));
  return { start, end, ...describe(selected) };
});
const first = describe(first60), last = describe(last60), overall = describe(samples);
const delta = (before, after) => ({ before, after, bytes: after - before, percent: before ? (after - before) * 100 / before : null });
const windowMedianChanges = Object.fromEntries(['usedBytes', 'allocatedCapacityBytes', 'embedderUsedBytes', 'backingStorageBytes'].map(key => [key,
  first[key] && last[key] ? delta(first[key].median, last[key].median) : null]));
const windowMedianTrend = Object.fromEntries(Object.keys(accessors).map(key => [key, windows.map(window => ({ start: window.start, samples: window.samples, median: window[key]?.median ?? null }))]));
const post = report.postMeasurementMemory;
const checkpoints = (post?.checkpoints ?? []).map(row => ({ name: row.name, phase: row.phase, tick: row.tick, forcedGc: row.forcedGc,
  usedBytesAfterThreeGc: row.collected.usedSize, allocatedCapacityBytesAfterThreeGc: row.collected.totalSize,
  embedderUsedBytesAfterThreeGc: row.collected.embedderHeapUsedSize, backingStorageBytesAfterThreeGc: row.collected.backingStorageSize, dom: row.dom }));
const menu = checkpoints.filter(row => row.phase === 'menu'), initialMenu = menu.find(row => row.name === 'returned-menu'), finalMenu = menu.find(row => row.name === 'menu-after-10-restarts');
const sameCaseBundle = report.releaseGameJsSha256 === execution.gameSha256 && report.frozen?.gameSha256 === execution.gameSha256;
const review = { schemaVersion: 1, generatedAt: new Date().toISOString(), reportPath: `${folder}/report.json`, reportSha256: hash(reportRaw),
  executionPath: `${folder}/execution.json`, executionSha256: hash(executionRaw), reviewScriptSha256: hash(await readFile(new URL(import.meta.url))),
  releaseGameJsSha256: report.releaseGameJsSha256, sameCaseBundle,
  method: 'Read-only derivation from an already-completed local Chrome headless pressure attempt. No browser, forced GC, test, state write or new simulation is executed by this script.',
  natural: { sampleCount: samples.length, observedActiveRange: [samples[0].activeSimulationSeconds, samples.at(-1).activeSimulationSeconds],
    forcedGcDuringMeasurement: false, overall, first60Seconds: first, last60Seconds: last, minuteWindows: windows, windowMedianChanges, windowMedianTrend,
    allocatedCapacityFirstLast: delta(samples[0].naturalV8.allocatedCapacityBytes, samples.at(-1).naturalV8.allocatedCapacityBytes),
    sampledUsedHeapFalls: samples.slice(1).filter((row, index) => row.naturalV8.usedBytes < samples[index].naturalV8.usedBytes).length,
    trendInterpretation: 'Window medians, sampled falls and allocated-capacity expansion are finite observations. A rising median is reported without relabelling it an established leak; sampled falls are not GC event instrumentation, and a bounded ten-minute series cannot establish indefinite stability.' },
  postMeasurement: { available: checkpoints.length > 0, scope: post?.scope ?? null, checkpoints,
    menuTenRestartsDelta: initialMenu && finalMenu ? delta(initialMenu.usedBytesAfterThreeGc, finalMenu.usedBytesAfterThreeGc) : null,
    menuNodeCounts: menu.map(row => ({ name: row.name, nodes: row.dom.nodes })), menuListenerCounts: menu.map(row => ({ name: row.name, listeners: row.dom.jsEventListeners })),
    interpretation: 'Forced GC belongs only to these later paused/menu checkpoints. Retained-size and DOM/listener differences are reported exactly; no assertion of identical values or zero memory leak follows.' },
  runMetrics: { observedSnapshots: report.runMetrics?.observedSnapshots, maxObservedFrameEntries: report.runMetrics?.maxFrameEntries, frameEntryLimit: report.runMetrics?.frameLimit,
    finalLimited: report.runMetrics?.finalSummary?.limited, finalAcceptedBeaconBitesIncludingSetup: report.runMetrics?.finalSummary?.control?.beaconBites,
    acceptedDuringMeasurement: report.acceptedControlDuringMeasurement, polledRequestedBeaconLogs: report.cellHits,
    scope: 'Production cumulative accepted counters are distinct from requested protocol logs. Ephemeral frame occupancy is a polling maximum, not observation of every simulation tick.' },
  timing: { activeSimulationSeconds: activeEnd, frameMetrics: report.metrics, measurementWallMs: report.measurementWallDurationMs,
    wallMsBeforePostMemory: report.wallDurationMs, wrapperTerminalStart: execution.startedAt, wrapperTerminalEnd: execution.finishedAt,
    browserCloseSucceeded: execution.browserCloseSucceeded, executionExitCode: execution.exitCode },
  limitations: ['One finite local headless run does not close all-device/native-memory or leak qualification.',
    'V8 used/capacity/embedder/backing sizes and CDP DOM counters omit total browser process RSS and GPU allocations.',
    'Natural and forced-GC measurements remain separate. Ten UI restarts are finite retained-size observations, not an indefinite soak.',
    'Standard and low quality use sequential live states, and24+3 snapshots do not establish continuous cap density or identical visual states.',
    'This report supplies observed fields and arithmetic, not a human playtest or fun/retention conclusion.'],
};
await writeFile(`${folder}/memory-review.json`, JSON.stringify(review, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output: `${folder}/memory-review.json`, sameCaseBundle, naturalSamples: samples.length,
  usedWindowMedianChange: windowMedianChanges.usedBytes, capacityWindowMedianChange: windowMedianChanges.allocatedCapacityBytes,
  menuTenRestartsDelta: review.postMeasurement.menuTenRestartsDelta, menuNodeCounts: review.postMeasurement.menuNodeCounts,
  menuListenerCounts: review.postMeasurement.menuListenerCounts, executionExitCode: execution.exitCode }));
