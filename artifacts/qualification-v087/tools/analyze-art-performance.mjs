import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Arithmetic over recorded CDP counters only. This file never imports the game,
// launches a browser, samples a process, or requests collection.
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const WORKSPACE = resolve(dirname(SCRIPT_PATH), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nonnegative = value => finite(value) && value >= 0;
const label = path => relative(WORKSPACE, path).replaceAll('\\', '/');
const HEAP_FIELDS = { usedBytes: 'usedSize', allocatedCapacityBytes: 'totalSize', embedderUsedBytes: 'embedderHeapUsedSize', backingStorageBytes: 'backingStorageSize' };

function invariant(condition, message) { if (!condition) throw new Error(message); }
function stats(values) {
  const valid = values.filter(nonnegative), sorted = [...valid].sort((a, b) => a - b), middle = (sorted.length - 1) / 2;
  return { count: valid.length, missing: values.length - valid.length,
    min: sorted[0] ?? null, median: sorted.length ? (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2 : null,
    max: sorted.at(-1) ?? null, first: valid[0] ?? null, last: valid.at(-1) ?? null };
}
function delta(before, after) {
  return { before: before ?? null, after: after ?? null, bytesOrCount: finite(before) && finite(after) ? after - before : null,
    percent: finite(before) && finite(after) && before !== 0 ? (after - before) / before * 100 : null };
}
function heapValues(heap = {}) { return Object.fromEntries(Object.entries(HEAP_FIELDS).map(([id, key]) => [id, nonnegative(heap[key]) ? heap[key] : null])); }
function domValues(dom = {}) { return { documents: dom.documents ?? null, nodes: dom.nodes ?? null, listeners: dom.jsEventListeners ?? null }; }
function summarize(rows) {
  return { sampleCount: rows.length,
    ...Object.fromEntries(Object.keys(HEAP_FIELDS).map(key => [key, stats(rows.map(row => row.heap[key]))])),
    dom: Object.fromEntries(['documents', 'nodes', 'listeners'].map(key => [key, stats(rows.map(row => row.dom[key]))])),
    populations: Object.fromEntries(['alive', 'cells', 'retainedActors', 'events', 'effects'].map(key => [key, stats(rows.map(row => row[key]))])) };
}
function direction(values) {
  const valid = values.filter(finite);
  if (valid.length < 2) return 'insufficient-observations';
  const differences = valid.slice(1).map((value, i) => value - valid[i]);
  if (differences.every(value => value === 0)) return 'constant';
  if (differences.every(value => value > 0)) return 'strictly-increasing';
  if (differences.every(value => value >= 0)) return 'nondecreasing';
  if (differences.every(value => value < 0)) return 'strictly-decreasing';
  if (differences.every(value => value <= 0)) return 'nonincreasing';
  return 'nonmonotonic';
}
function slope(points) {
  const valid = points.filter(point => finite(point.x) && finite(point.y));
  if (valid.length < 2) return null;
  const meanX = valid.reduce((n, point) => n + point.x, 0) / valid.length, meanY = valid.reduce((n, point) => n + point.y, 0) / valid.length;
  const denominator = valid.reduce((n, point) => n + (point.x - meanX) ** 2, 0);
  return denominator ? valid.reduce((n, point) => n + (point.x - meanX) * (point.y - meanY), 0) / denominator : null;
}
function checkpointDelta(before, after) {
  return { from: before.name, to: after.name, bothMenuPhase: before.phase === 'menu' && after.phase === 'menu',
    collected: Object.fromEntries(Object.keys(HEAP_FIELDS).map(key => [key, delta(before.afterForcedGc[key], after.afterForcedGc[key])])),
    dom: Object.fromEntries(['documents', 'nodes', 'listeners'].map(key => [key, delta(before.dom[key], after.dom[key])])) };
}

export function analyzeReport(report, provenance = {}) {
  invariant(!['preparing', 'warming', 'measuring'].includes(report.status), 'The measurement is still running. Analyze its saved terminal report after the browser run ends.');
  invariant(Array.isArray(report.samples) && report.samples.length > 0, 'No recorded natural CDP samples are present.');
  const rows = report.samples.map((sample, index) => {
    invariant(sample.forcedGc === false, `Sample ${index} is not explicitly labelled natural (forcedGc:false).`);
    invariant(nonnegative(sample.activeSimulationSeconds) && nonnegative(sample.tick), `Sample ${index} has invalid measurement coordinates.`);
    invariant(nonnegative(sample.heap?.usedSize) && nonnegative(sample.heap?.totalSize), `Sample ${index} has invalid V8 heap counters.`);
    invariant(['documents', 'nodes', 'jsEventListeners'].every(key => nonnegative(sample.dom?.[key])), `Sample ${index} has invalid DOM counters.`);
    return { name: sample.name, activeSeconds: sample.activeSimulationSeconds, wallSeconds: sample.wallSeconds ?? null, tick: sample.tick, mode: sample.mode ?? 'unknown',
      heap: heapValues(sample.heap), dom: domValues(sample.dom), alive: sample.alive, cells: sample.cells, retainedActors: sample.retainedActors, events: sample.events, effects: sample.effects };
  });
  for (let i = 1; i < rows.length; i++) invariant(rows[i].activeSeconds >= rows[i - 1].activeSeconds && rows[i].tick >= rows[i - 1].tick, 'Natural samples are not chronologically ordered.');
  const firstRow = rows[0], finalRow = rows.at(-1);
  const activeSeconds = nonnegative(report.activeSimulationSeconds) ? report.activeSimulationSeconds : finalRow.activeSeconds;
  invariant(finalRow.activeSeconds <= activeSeconds + .001, 'A natural sample lies beyond the declared active duration.');
  const intervals = rows.slice(1).map((row, i) => row.activeSeconds - rows[i].activeSeconds);
  const minuteWindows = [];
  for (let start = 0; start <= finalRow.activeSeconds; start += 60) {
    const members = rows.filter(row => row.activeSeconds >= start && row.activeSeconds < start + 60);
    if (members.length) minuteWindows.push({ startActiveSeconds: start, endActiveSeconds: Math.min(start + 60, activeSeconds), partialWindow: start + 60 > activeSeconds,
      ...summarize(members) });
  }
  const fullMinutes = minuteWindows.filter(window => !window.partialWindow);
  const first60 = summarize(rows.filter(row => row.activeSeconds < 60));
  const last60 = summarize(rows.filter(row => row.activeSeconds >= Math.max(0, activeSeconds - 60)));
  const laterBaselineWindows = fullMinutes.filter(window => window.startActiveSeconds >= 60);
  const baselineFrom = laterBaselineWindows[0], baselineTo = laterBaselineWindows.at(-1);
  const sampledDecreases = [];
  for (let i = 1; i < rows.length; i++) {
    const before = rows[i - 1], after = rows[i], amount = before.heap.usedBytes - after.heap.usedBytes;
    if (amount > 0) sampledDecreases.push({ beforeActiveSeconds: before.activeSeconds, afterActiveSeconds: after.activeSeconds, beforeTick: before.tick, afterTick: after.tick,
      beforeUsedBytes: before.heap.usedBytes, afterUsedBytes: after.heap.usedBytes, decreaseBytes: amount, decreasePercent: amount / before.heap.usedBytes * 100 });
  }
  const checkpoints = (report.postMeasurementMemory?.checkpoints ?? []).map((point, i) => {
    invariant(point.forcedGc === true && point.natural && point.collected && point.dom, `Post-measurement checkpoint ${i} has incomplete forced-GC provenance.`);
    return { name: point.name, phase: point.phase, tick: point.tick, forcedGc: true, beforeForcedGc: heapValues(point.natural), afterForcedGc: heapValues(point.collected), dom: domValues(point.dom),
      textureCounters: null };
  });
  const menuNames = ['returned-menu', 'menu-after-5-restarts', 'menu-after-10-restarts'];
  const menu = menuNames.map(name => checkpoints.find(point => point.name === name));
  const menuSteps = [[menu[0], menu[1]], [menu[1], menu[2]]].filter(pair => pair.every(Boolean)).map(([before, after]) => checkpointDelta(before, after));
  const observedSpan = finalRow.activeSeconds - firstRow.activeSeconds;
  return {
    schemaVersion: 1, status: 'observations-only-no-automatic-leak-verdict', generatedAt: new Date().toISOString(),
    method: 'Offline arithmetic over saved natural Runtime.getHeapUsage and Memory.getDOMCounters rows. No browser, game execution, process sampling or garbage collection is performed by this analyzer.',
    input: { ...provenance, version: report.version ?? null, releaseGameJsSha256: report.releaseGameJsSha256 ?? null,
      measurementScriptSha256: report.measurementScriptSha256 ?? null, runtimeStatus: report.status, runtimePass: report.pass ?? null,
      sourceUnchangedDuringRun: report.sourceUnchanged ?? null, device: report.device ?? null },
    timing: { declaredActiveSimulationSeconds: activeSeconds, observedNaturalSampleSpanSeconds: observedSpan,
      firstSampleActiveSeconds: firstRow.activeSeconds, lastSampleActiveSeconds: finalRow.activeSeconds, terminalSamplePresent: finalRow.name === 'terminal',
      naturalSamplesBracketTenMinutes: activeSeconds >= 600 && firstRow.activeSeconds < 10 && finalRow.activeSeconds >= 600 && finalRow.name === 'terminal',
      measurementWallDurationMs: report.measurementWallDurationMs ?? null, sampleIntervalsActiveSeconds: stats(intervals),
      preparationAndWarmupExcluded: true, forcedGcExcludedFromNaturalRows: true },
    performance: { metrics: report.metrics ?? null, observerDroppedFrames: report.observerDroppedFrames ?? null, errors: report.errors ?? [], remoteRequests: report.requests ?? [],
      note: 'These are recorded frame/pressure results. A runtime pass does not assign a memory or human-playtest verdict.' },
    natural: {
      unit: 'bytes for heap counters; counts for DOM/populations; seconds for time', overall: summarize(rows), first60Seconds: first60, last60Seconds: last60,
      firstLast60Changes: Object.fromEntries(Object.keys(HEAP_FIELDS).map(key => [key, { sampledMinimum: delta(first60[key].min, last60[key].min), median: delta(first60[key].median, last60[key].median) }])),
      minuteWindowDefinition: '[start,start+60) active simulation seconds. A final remainder, including a lone terminal sample after 600 seconds, is labelled partial and excluded from full-minute trends.',
      minuteWindows,
      laterMinuteBaseline: {
        definition: 'First complete minute beginning at or after 60 active seconds versus the last complete minute. These sampled minima are not post-GC retained-live-object floors.',
        fromStartActiveSeconds: baselineFrom?.startActiveSeconds ?? null, toStartActiveSeconds: baselineTo?.startActiveSeconds ?? null,
        changes: Object.fromEntries(Object.keys(HEAP_FIELDS).map(key => [key, { sampledMinimum: delta(baselineFrom?.[key].min, baselineTo?.[key].min), median: delta(baselineFrom?.[key].median, baselineTo?.[key].median) }])),
      },
      fullMinuteTrends: Object.fromEntries(Object.keys(HEAP_FIELDS).map(key => [key, {
        medianSequenceDirection: direction(fullMinutes.map(window => window[key].median)), minimumSequenceDirection: direction(fullMinutes.map(window => window[key].min)),
        medianLinearSlopeBytesPerMinute: slope(fullMinutes.map(window => ({ x: window.startActiveSeconds / 60, y: window[key].median }))),
        minimumLinearSlopeBytesPerMinute: slope(fullMinutes.map(window => ({ x: window.startActiveSeconds / 60, y: window[key].min }))),
      }])),
      byQuality: Object.fromEntries([...new Set(rows.map(row => row.mode))].map(mode => [mode, summarize(rows.filter(row => row.mode === mode))])),
      sampledDecreases: { count: sampledDecreases.length, totalDecreaseBytes: sampledDecreases.reduce((n, drop) => n + drop.decreaseBytes, 0),
        largestDecreaseBytes: sampledDecreases.length ? Math.max(...sampledDecreases.map(drop => drop.decreaseBytes)) : 0,
        interpretation: 'A sampled fall shows lower occupied size between observations. GC events were not instrumented, so this is not an exact GC count or allocation-throughput measurement.', rows: sampledDecreases },
    },
    postMeasurement: {
      present: checkpoints.length > 0, scope: report.postMeasurementMemory?.scope ?? null,
      forcedGcSeparateFromNaturalMeasurement: true, checkpoints, missingMenuCheckpoints: menuNames.filter((name, i) => !menu[i]),
      menuStepDeltas: menuSteps, menuTenRestartDelta: menu[0] && menu[2] ? checkpointDelta(menu[0], menu[2]) : null,
      usedBytesIncreaseAtBothMenuSteps: menuSteps.length === 2 ? menuSteps.every(step => step.collected.usedBytes.bytesOrCount > 0) : null,
      nodesIncreaseAtBothMenuSteps: menuSteps.length === 2 ? menuSteps.every(step => step.dom.nodes.bytesOrCount > 0) : null,
      listenersIncreaseAtBothMenuSteps: menuSteps.length === 2 ? menuSteps.every(step => step.dom.listeners.bytesOrCount > 0) : null,
      interpretation: 'Exact same-menu-phase retained deltas are reported separately from natural observations. Both positive steps call for allocation/source-path review; they do not by themselves prove a leak. Start/Q/pause/menu cycles are not completed-game settlement cycles.',
    },
    presentationEvidence: {
      denseStandard: report.dense_standard ?? null, denseLow: report.dense_low ?? null,
      savedDenseGameStates: provenance.denseStates ?? [],
      phaserTextureAndLayerCountersAvailable: false,
      note: 'This measurement schema records gameplay snapshots at dense captures, not Phaser diagnostics. Texture, pooled-sprite and raster-layer counts cannot be inferred from actor counts.',
    },
    interpretationLimits: [
      `The evidence covers only the recorded ${activeSeconds.toFixed(3)} active seconds, device, browser, route and two quality settings; no indefinite plateau, all-route or all-device claim is assigned.`,
      'Read minute medians and sampled minima together; neither one low terminal sample nor an allocated-capacity increase alone establishes retained-object stability or a leak.',
      'Used V8 heap, allocated capacity, embedder heap and backing storage are separate counters. None is total browser/process RSS, GPU/VRAM use or the complete native Canvas/WebGL allocation.',
      'Natural five-second occupied-size observations include temporary objects awaiting collection. Later forced-GC values describe different, explicitly collected checkpoints and must not be mixed into natural timing or trend arrays.',
      'Slope/direction labels are arithmetic descriptions of recorded samples, with no invented leak threshold or automatic acceptance verdict.',
    ],
    plotRows: rows.map(row => ({ activeSeconds: row.activeSeconds, ...row.heap })),
  };
}

function xml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
export function heapTrendSvg(review) {
  const width = 980, height = 650, left = 78, right = 28, bottom = 38, plotWidth = width - left - right;
  const duration = Math.max(1, review.timing.lastSampleActiveSeconds), x = seconds => left + seconds / duration * plotWidth;
  const panels = [
    { y: 91, h: 220, label: 'Natural V8 heap (MiB)', fields: [['usedBytes', '#2269a5'], ['allocatedCapacityBytes', '#b36b19']], minimum: true },
    { y: 359, h: 100, label: 'Embedder heap (MiB)', fields: [['embedderUsedBytes', '#7b4e9d']] },
    { y: 509, h: 90, label: 'Backing storage (MiB)', fields: [['backingStorageBytes', '#1d8177']] },
  ];
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${xml(review.input.version)} natural heap observations</title><desc id="desc">Recorded CDP counters over ${duration.toFixed(2)} active seconds. Forced collection excluded; RSS and VRAM are not measured.</desc>`,
    '<rect width="100%" height="100%" fill="#f7fafc"/>', '<g font-family="Segoe UI,Arial,sans-serif" fill="#243b49">',
    `<text x="${left}" y="29" font-size="20" font-weight="600">${xml(review.input.version)} · natural CDP memory observations</text>`,
    `<text x="${left}" y="51" font-size="12">${review.natural.overall.sampleCount} samples · ${duration.toFixed(2)} active seconds · game ${xml((review.input.releaseGameJsSha256 ?? 'unknown').slice(0, 12))}</text>`,
    `<text x="${left}" y="72" font-size="11">Blue: used · amber: capacity · dashed: per-minute sampled minimum · forced GC excluded</text>`];
  for (const panel of panels) {
    const values = review.plotRows.flatMap(row => panel.fields.map(([field]) => row[field])).filter(nonnegative);
    const maximum = Math.max(1, ...values) * 1.08, y = value => panel.y + panel.h - value / maximum * panel.h;
    out.push(`<text x="${left}" y="${panel.y - 9}" font-size="12" font-weight="600">${panel.label}</text>`);
    for (let i = 0; i <= 4; i++) {
      const value = maximum * i / 4, at = y(value);
      out.push(`<path d="M${left} ${at.toFixed(2)}H${width - right}" stroke="#dce6ec"/><text x="${left - 9}" y="${(at + 4).toFixed(2)}" font-size="10" text-anchor="end">${(value / 1048576).toFixed(maximum < 1048576 ? 3 : 1)}</text>`);
    }
    for (let minute = 0; minute <= Math.floor(duration / 60); minute++) {
      const at = x(minute * 60);
      out.push(`<path d="M${at.toFixed(2)} ${panel.y}v${panel.h}" stroke="#e8eef2"/><text x="${at.toFixed(2)}" y="${panel.y + panel.h + 16}" font-size="10" text-anchor="middle">${minute}</text>`);
    }
    for (const [field, color] of panel.fields) {
      const points = review.plotRows.filter(row => nonnegative(row[field])).map(row => `${x(row.activeSeconds).toFixed(2)},${y(row[field]).toFixed(2)}`).join(' ');
      if (points) out.push(`<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.7"/>`);
    }
    if (panel.minimum) {
      const points = review.natural.minuteWindows.filter(window => !window.partialWindow).map(window => `${x(window.startActiveSeconds + 30).toFixed(2)},${y(window.usedBytes.min).toFixed(2)}`).join(' ');
      if (points) out.push(`<polyline points="${points}" fill="none" stroke="#356b87" stroke-width="1.5" stroke-dasharray="5 4"/>`);
    }
  }
  out.push(`<text x="${left + plotWidth / 2}" y="${height - bottom + 7}" text-anchor="middle" font-size="11">Active simulation minutes</text>`,
    `<text x="${left}" y="${height - 13}" font-size="10">Observed finite window only · V8 counters do not measure process RSS, native surfaces or GPU/VRAM · no automatic leak verdict</text>`, '</g></svg>');
  return out.join('\n');
}

async function optionalRead(path) { try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } }

async function main() {
  const argument = process.argv.slice(2).find(value => !value.startsWith('--'));
  invariant(argument, 'Usage: node scripts/analyze-art-performance.mjs <measurement-folder> [--stdout]');
  const folder = resolve(argument), reportPath = resolve(folder, 'report.json');
  const raw = await readFile(reportPath), report = JSON.parse(raw.toString('utf8'));
  const measurementScript = await optionalRead(resolve(folder, 'measurement-script.mjs'));
  const denseStates = [];
  for (const quality of ['standard', 'low']) {
    const path = resolve(folder, `dense-${quality}-state.json`), bytes = await optionalRead(path);
    if (!bytes) continue;
    const state = JSON.parse(bytes.toString('utf8'));
    denseStates.push({ quality, source: label(path), sha256: sha256(bytes), phase: state.phase, tick: state.tick,
      aliveActors: state.targets?.filter(target => target.hp > 0).length ?? null, retainedActors: state.targets?.length ?? null,
      cells: state.growth?.cells?.length ?? null, events: state.events?.length ?? null, effects: state.effects?.length ?? null,
      phaserDiagnosticsPresent: false });
  }
  const review = analyzeReport(report, {
    reportPath: label(reportPath), reportSha256: sha256(raw), analyzerScriptPath: label(SCRIPT_PATH), analyzerScriptSha256: sha256(await readFile(SCRIPT_PATH)),
    savedMeasurementScriptSha256: measurementScript ? sha256(measurementScript) : null,
    savedMeasurementScriptMatchesDeclared: measurementScript ? sha256(measurementScript) === report.measurementScriptSha256 : null,
    denseStates,
  });
  if (process.argv.includes('--stdout')) { console.log(JSON.stringify(review, null, 2)); return; }
  const reviewPath = resolve(folder, 'memory-review.json'), svgPath = resolve(folder, 'heap-trend.svg');
  await writeFile(reviewPath, JSON.stringify(review, null, 2));
  await writeFile(svgPath, heapTrendSvg(review));
  console.log(JSON.stringify({ version: review.input.version, naturalSamples: review.natural.overall.sampleCount,
    observedActiveSeconds: review.timing.lastSampleActiveSeconds, usedBytes: review.natural.overall.usedBytes,
    sampledDecreases: review.natural.sampledDecreases.count, postGcCheckpoints: review.postMeasurement.checkpoints.length,
    memoryVerdict: 'observations-only', outputs: [label(reviewPath), label(svgPath)] }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(`Memory analysis failed: ${error.message}`); process.exitCode = 1; });
