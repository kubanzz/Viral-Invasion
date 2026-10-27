import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline derivation only. Never imports the game, starts a browser or asks CDP
// to collect. Incomplete inputs are rejected before any derived output is made.
const scriptPath = fileURLToPath(import.meta.url);
const workspace = resolve(dirname(scriptPath), '../../..');
const reportPath = resolve(process.argv[2] ?? fileURLToPath(new URL('attempt-1/report.json', import.meta.url)));
const executionPath = resolve(dirname(reportPath), 'execution.json');
const jsonPath = resolve(process.argv[3] ?? resolve(dirname(reportPath), 'memory-review.json'));
const mdPath = jsonPath.replace(/\.json$/i, '') + '.md';
const writtenOutputs = [];
const sha = value => createHash('sha256').update(value).digest('hex');
const label = path => relative(workspace, path).replaceAll('\\', '/');
const invariant = (condition, message) => { if (!condition) throw Error(message); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nonnegative = value => finite(value) && value >= 0;
const quantile = (sorted, fraction) => {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * fraction, lo = Math.floor(index), hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
};
function stats(values) {
  invariant(values.every(nonnegative), 'A requested metric contains an invalid value.');
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, min: null, p10: null, p25: null, median: null, p75: null, p90: null, p95: null, max: null, first: null, last: null };
  return { count: values.length, min: sorted[0], p10: quantile(sorted, .1), p25: quantile(sorted, .25), median: quantile(sorted, .5),
    p75: quantile(sorted, .75), p90: quantile(sorted, .9), p95: quantile(sorted, .95), max: sorted.at(-1), first: values[0], last: values.at(-1) };
}
const fields = {
  usedBytes: sample => sample.heap.usedSize,
  allocatedCapacityBytes: sample => sample.heap.totalSize,
  embedderUsedBytes: sample => sample.heap.embedderHeapUsedSize,
  backingStorageBytes: sample => sample.heap.backingStorageSize,
  domNodes: sample => sample.dom.nodes,
  listeners: sample => sample.dom.jsEventListeners,
};
const summarize = samples => ({ samples: samples.length,
  ...Object.fromEntries(Object.entries(fields).map(([key, get]) => [key, stats(samples.map(get))])),
  documents: [...new Set(samples.map(sample => sample.dom.documents))].sort((a, b) => a - b),
});
const delta = (before, after) => ({ before, after, amount: after - before, percent: before ? (after - before) / before * 100 : null });
const checkpointDelta = (before, after) => ({ from: before.name, to: after.name,
  usedBytes: delta(before.collected.usedSize, after.collected.usedSize),
  allocatedCapacityBytes: delta(before.collected.totalSize, after.collected.totalSize),
  embedderUsedBytes: delta(before.collected.embedderHeapUsedSize, after.collected.embedderHeapUsedSize),
  backingStorageBytes: delta(before.collected.backingStorageSize, after.collected.backingStorageSize),
  domNodes: delta(before.dom.nodes, after.dom.nodes), listeners: delta(before.dom.jsEventListeners, after.dom.jsEventListeners),
});
const n = value => value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });

try {
  invariant(jsonPath !== reportPath && mdPath !== reportPath && jsonPath !== executionPath && mdPath !== executionPath,
    'Derived paths must not replace report/execution inputs.');
  const [reportRaw, executionRaw, scriptRaw] = await Promise.all([readFile(reportPath), readFile(executionPath), readFile(scriptPath)]);
  const report = JSON.parse(reportRaw), execution = JSON.parse(executionRaw);
  invariant(report.finishedAt && execution.finishedAt, 'Attempt is unfinished: finishedAt/execution evidence is absent.');
  invariant(report.status === 'passed' && report.pass === true && execution.status === 'passed' && execution.exitCode === 0,
    'Runtime attempt did not finish successfully. No finite-acceptance derivation will be assigned.');
  invariant(report.browserCloseSucceeded === true && execution.browserCloseSucceeded === true,
    'Attempt is not fully closed; browser-close completion must be recorded.');
  invariant(report.sourceUnchanged === true && execution.sourceUnchanged === true,
    'Source identity was not verified across the attempt.');
  invariant(typeof report.releaseGameJsSha256 === 'string' && report.releaseGameJsSha256 === execution.gameSha256
    && report.releaseGameJsSha256 === report.frozen?.gameSha256 && report.releaseGameJsSha256 === report.frozenAtEnd?.gameSha256,
    'Bundle identity is inconsistent.');
  invariant(finite(report.activeSimulationSeconds) && report.activeSimulationSeconds >= 600,
    'This is not a completed 600-active-second attempt; preparation/warmup cannot fill the gap.');
  invariant(Array.isArray(report.samples) && report.samples.length >= 100, 'Too few natural observations for the declared five-second ten-minute method.');
  const samples = report.samples;
  invariant(samples.every(sample => sample.forcedGc === false && finite(sample.activeSimulationSeconds)
    && sample.activeSimulationSeconds >= 0 && Number.isInteger(sample.tick) && sample.heap && sample.dom),
    'Natural sample provenance/coordinates are invalid or include forced GC.');
  for (let index = 1; index < samples.length; index++) invariant(samples[index].activeSimulationSeconds >= samples[index - 1].activeSimulationSeconds
    && samples[index].tick >= samples[index - 1].tick, 'Natural samples are out of chronological order.');
  const terminal = samples.at(-1);
  invariant(terminal.name === 'terminal' && terminal.activeSimulationSeconds >= 600, 'Terminal natural sample is missing.');
  invariant(samples[0].activeSimulationSeconds < 10 && terminal.activeSimulationSeconds <= report.activeSimulationSeconds + 1e-7,
    'Natural samples do not bracket the declared measurement.');
  const post = report.postMeasurementMemory;
  const names = ['finished-pressure-paused', 'returned-menu', 'menu-after-5-restarts', 'menu-after-10-restarts'];
  invariant(post && Array.isArray(post.checkpoints) && names.every(name => post.checkpoints.some(point => point.name === name)),
    'Post-measurement paused/menu/restart collection checkpoints are unfinished or absent.');
  const checkpoints = names.map(name => post.checkpoints.find(point => point.name === name));
  for (const point of checkpoints) {
    invariant(point.forcedGc === true && point.natural && point.collected && point.dom, `Invalid collection provenance at ${point.name}.`);
    invariant((point.name === names[0] ? point.phase === 'paused' : point.phase === 'menu'), `Wrong matched view at ${point.name}.`);
    for (const key of ['usedSize', 'totalSize', 'embedderHeapUsedSize', 'backingStorageSize']) {
      invariant(nonnegative(point.natural[key]) && nonnegative(point.collected[key]), `Invalid heap metric at ${point.name}/${key}.`);
    }
    invariant([point.dom.nodes, point.dom.jsEventListeners, point.dom.documents].every(nonnegative), `Invalid DOM metric at ${point.name}.`);
  }
  const first60 = samples.filter(sample => sample.activeSimulationSeconds < 60);
  const last60 = samples.filter(sample => sample.activeSimulationSeconds >= report.activeSimulationSeconds - 60);
  const minuteWindows = [];
  for (let start = 0; start <= Math.floor(report.activeSimulationSeconds / 60) * 60; start += 60) {
    const inWindow = samples.filter(sample => sample.activeSimulationSeconds >= start && sample.activeSimulationSeconds < start + 60);
    if (inWindow.length) minuteWindows.push({ start, end: Math.min(start + 60, report.activeSimulationSeconds),
      partialWindow: start + 60 > report.activeSimulationSeconds, ...summarize(inWindow) });
  }
  const drops = [];
  for (let index = 1; index < samples.length; index++) {
    const before = samples[index - 1], after = samples[index], drop = before.heap.usedSize - after.heap.usedSize;
    if (drop > 0) drops.push({ beforeActive: before.activeSimulationSeconds, afterActive: after.activeSimulationSeconds,
      beforeTick: before.tick, afterTick: after.tick, beforeUsedBytes: before.heap.usedSize, afterUsedBytes: after.heap.usedSize,
      dropBytes: drop, dropPercent: drop / before.heap.usedSize * 100,
      candidateLargeReclamation: drop >= Math.max(1024 * 1024, before.heap.usedSize * .1) });
  }
  const first = summarize(first60), last = summarize(last60);
  const menu = checkpoints.slice(1), steps = [checkpointDelta(menu[0], menu[1]), checkpointDelta(menu[1], menu[2])];
  const coverage = {
    finalPhase: report.finalState?.phase ?? null,
    finalLungActivated: report.finalState?.campaign?.arenas?.lung?.activated ?? null,
    finalTravels: report.finalState?.campaign?.stats?.travels ?? null,
    finalBackgroundDamage: report.finalState?.campaign?.stats?.backgroundDamage ?? null,
    finalExposedTransactionIds: report.finalState?.campaign?.transactionIds ?? null,
    finalGrowthEnded: report.finalState?.growth?.ended ?? null,
    postMemoryMethod: post.scope,
    offscreenBranchEvidence: report.finalState?.campaign?.arenas?.lung?.activated === false
      ? 'Lung remained unactivated; this stationary-heart attempt did not exercise the activated offscreen-organ background ledger branch.'
      : 'Lung activation is recorded, but activation alone does not establish all-route/background accounting retention coverage.',
    trueSettlementEvidence: 'The driver performs start/Q/pause/menu restarts after unfinished pressure; it is not repeated true RUN_ENDED settlement memory evidence. Profile recordedRunIds growth must be assessed separately.',
  };
  const result = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'derived-finite-runtime-observations-memory-acceptance-not-automatically-assigned',
    method: 'Offline arithmetic from a completed existing attempt. No browser, game state mutation, new simulation, test, forced GC or performance measurement is performed by this analyzer.',
    input: { reportPath: label(reportPath), reportSha256: sha(reportRaw), executionPath: label(executionPath), executionSha256: sha(executionRaw),
      reviewScriptPath: label(scriptPath), reviewScriptSha256: sha(scriptRaw), version: report.version, releaseGameJsSha256: report.releaseGameJsSha256,
      runtimePass: report.pass, startedAt: report.startedAt, finishedAt: report.finishedAt, device: report.device },
    timing: { activeSimulationSeconds: report.activeSimulationSeconds, measurementWallMilliseconds: report.measurementWallDurationMs,
      preMeasurementWallMilliseconds: report.measurementWallStartedAt - report.wallStartedAt,
      wallBeforePostMemoryMilliseconds: report.wallDurationMs, activeSampleRange: [samples[0].activeSimulationSeconds, terminal.activeSimulationSeconds],
      preparationAndWarmupExcluded: true, forcedGcDuringNaturalMeasurement: false },
    natural: { samples: samples.length, quantileMethod: 'Linear interpolation at (n-1)*q. Minima are sampled natural occupied size, not measured post-GC live-object floors.',
      overall: summarize(samples), first60Seconds: first, last60Seconds: last,
      windowDefinitions: 'First active<60. Last active>=finalActive-60, including terminal. Minute windows are [start,start+60); a final partial window is labelled.',
      firstLast60MedianChanges: Object.fromEntries(Object.keys(fields).map(key => [key, delta(first[key].median, last[key].median)])),
      firstLastCapacity: delta(samples[0].heap.totalSize, terminal.heap.totalSize),
      minuteWindows,
      byQuality: Object.fromEntries([...new Set(samples.map(sample => sample.mode))].map(mode => [mode, summarize(samples.filter(sample => sample.mode === mode))])),
      decreases: { count: drops.length, largeReclamationCandidateRule: 'Decrease>=max(1 MiB,10% of preceding used size). This is a sampling heuristic, not GC event instrumentation.',
        largeCandidateCount: drops.filter(drop => drop.candidateLargeReclamation).length, samples: drops },
    },
    postMeasurement: { scope: post.scope, forcedGcSeparateFromNaturalThroughput: true, checkpoints,
      menuStepDeltas: steps, menuTenRestartDelta: checkpointDelta(menu[0], menu[2]),
      increaseAtBothMenuSteps: { usedBytes: steps.every(step => step.usedBytes.amount > 0),
        domNodes: steps.every(step => step.domNodes.amount > 0), listeners: steps.every(step => step.listeners.amount > 0) },
      interpretation: 'Same-view collected changes are reported exactly. Both positive step deltas flag retention for source/heap-path review, not an automatic leak finding; one-time caches, profile updates and view identity must be considered. No numeric pass threshold is invented.' },
    coverage,
    finiteScopeInterpretation: [
      'This supplies a completed current-version ten-active-minute natural V8/DOM observation on the recorded machine and method. Runtime pass is a frame/pressure/input/source result and is not a memory verdict.',
      'Used, allocated capacity, embedder and backing sizes remain separate. A capacity expansion alone does not prove retained object growth; a lone low terminal used value alone does not prove stability.',
      'Read every-minute medians and minima with sampled decreases and matched post-GC menu checkpoints before making the finite AC-M16-04 memory conclusion. Report every actual positive delta and deliberate accounting root.',
      coverage.offscreenBranchEvidence, coverage.trueSettlementEvidence,
      'V8/DOM counters do not measure total process RSS or GPU/native canvas allocation. They support the declared finite stationary-headless software scope; no indefinite or all-device claim is assigned.',
    ],
  };
  const table = minuteWindows.map(window => `| ${window.start}–${n(window.end)}${window.partialWindow ? ' (partial)' : ''} | ${window.samples} | ${n(window.usedBytes.min)} | ${n(window.usedBytes.median)} | ${n(window.usedBytes.p95)} | ${n(window.allocatedCapacityBytes.median)} | ${n(window.domNodes.min)} | ${n(window.listeners.min)} |`).join('\n');
  const postTable = checkpoints.map(point => `| ${point.name} | ${n(point.collected.usedSize)} | ${n(point.collected.totalSize)} | ${n(point.dom.nodes)} | ${n(point.dom.jsEventListeners)} |`).join('\n');
  const markdown = `# v075 finite memory observations\n\nOffline derivation from [report.json](${label(reportPath)}) (SHA256 ${sha(reportRaw)}), after a completed closed runtime attempt. No browser or GC was executed by this analyzer. **Memory acceptance is not automatically assigned.**\n\nMeasured active duration: ${n(report.activeSimulationSeconds)} s; preparation/warmup: ${n(result.timing.preMeasurementWallMilliseconds)} ms, excluded. ${samples.length} natural samples, no forced GC during natural/frame measurement. Bundle: ${report.releaseGameJsSha256}.\n\nUsed first/last 60-second medians: ${n(first.usedBytes.median)} → ${n(last.usedBytes.median)} B (${n(result.natural.firstLast60MedianChanges.usedBytes.percent)}%). Capacity medians: ${n(first.allocatedCapacityBytes.median)} → ${n(last.allocatedCapacityBytes.median)} B. ${drops.length} sampled used decreases, ${result.natural.decreases.largeCandidateCount} meeting the explicitly heuristic large-reclamation rule. Sample minima are not post-GC live-object floors.\n\n| Active seconds | Samples | Used min B | Used median B | Used p95 B | Capacity median B | Nodes min | Listeners min |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\n## Later forced-GC checkpoints\n\nThese are outside natural/frame arrays: ${post.scope}\n\n| Checkpoint | Collected used B | Collected capacity B | Nodes | Listeners |\n|---|---:|---:|---:|---:|\n${postTable}\n\nReturned-menu → ten restarts collected used delta: ${n(result.postMeasurement.menuTenRestartDelta.usedBytes.amount)} B (${n(result.postMeasurement.menuTenRestartDelta.usedBytes.percent)}%). Inspect both 0→5 and 5→10 deltas in JSON. Equal nodes/listeners or a small byte delta alone is not an automatic result; neither is capacity growth an automatic leak.\n\n## Supported scope and remaining coverage\n\n${result.finiteScopeInterpretation.map(line => '- ' + line).join('\n')}\n`;
  for (const path of [jsonPath, mdPath]) {
    let exists = false;
    try { await access(path); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    invariant(!exists, `Refusing to overwrite existing derived evidence: ${path}`);
  }
  await writeFile(jsonPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  writtenOutputs.push(jsonPath);
  await writeFile(mdPath, markdown, { flag: 'wx' });
  writtenOutputs.push(mdPath);
  console.log(JSON.stringify({ status: result.status, report: label(reportPath), json: label(jsonPath), markdown: label(mdPath),
    activeSeconds: report.activeSimulationSeconds, naturalSamples: samples.length, sampledDecreases: drops.length,
    memoryAcceptanceAutomaticallyAssigned: false }));
} catch (error) {
  console.error(JSON.stringify({ status: 'refused-no-memory-judgment', reason: error.message, report: label(reportPath), outputsWritten: writtenOutputs.map(label) }));
  process.exitCode = 2;
}
