import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

const folder = process.argv[2];
const inside = folder && relative(resolve('artifacts/completion-v074/chain-burst'), resolve(folder));
if (!inside || inside.startsWith('..') || /^[A-Za-z]:/.test(inside)) throw new Error('Provide a completed chain-burst attempt folder.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async name => { const bytes = await readFile(`${folder}/${name}`); return { bytes, data: JSON.parse(bytes.toString('utf8')) }; };
const report = await read('report.json'), raw = await read('raw-samples.json'), execution = await read('execution.json');
if (!execution.data.finishedAt || execution.data.browserCloseSucceeded !== true) throw new Error('The execution must have a real closed-browser terminal.');
const ranges = rows => Object.fromEntries(Object.keys(rows[0].counts).map(key => [key,
  typeof rows[0].counts[key] === 'number' ? { minimum: Math.min(...rows.map(row => row.counts[key])), maximum: Math.max(...rows.map(row => row.counts[key])) }
    : [...new Set(rows.map(row => row.counts[key]))]]));
const cases = raw.data.cases.map(record => ({ scenario: record.scenario, quality: record.quality, actorFixture: record.actorFixture,
  measuredSamples: record.rows.length, warmups: record.warmupCount, observedCounterRanges: ranges(record.rows),
  baselineRenderCpuMs: record.baselineRenderCpuMs, baselineRafIntervalMs: record.baselineRafIntervalMs, timing: record.timing,
  diagnosticTimingTargets: record.provisionalTimingAssessment,
  firstSampleDetail: record.rows[0].firstSampleDetail,
}));
const checks = { terminalExitZero: execution.data.exitCode === 0 && execution.data.status === 'passed', browserClosed: execution.data.browserCloseSucceeded === true,
  sourceUnchanged: execution.data.sourceUnchanged === true, mechanismChecksPassed: report.data.completedMechanismChecks === true,
  diagnosticTimingTargetsMet: report.data.diagnosticTimingTargetsMet === true, exactSixCases60Each: cases.length === 6 && cases.every(record => record.measuredSamples === 60),
  all100BasicHitsAccepted: cases.every(record => record.observedCounterRanges.acceptedBasicHits.minimum === 100 && record.observedCounterRanges.acceptedBasicHits.maximum === 100),
  allBudgetsBounded: cases.every(record => record.observedCounterRanges.generatedCommands.maximum <= raw.data.productionCommandBudget && record.observedCounterRanges.budgetUsed.maximum <= raw.data.productionCommandBudget),
  allHopsAtMost3: cases.every(record => record.observedCounterRanges.maxHop.maximum <= 3),
  realRecursiveKillCallbacksNoNewChain: cases.filter(record => record.scenario === 'cap24-resonance-recursion100').every(record => record.observedCounterRanges.chainKillCallbacks.minimum > 0 && record.observedCounterRanges.protocolClears.minimum > 0 && record.observedCounterRanges.observedThreeHopRoots.minimum > 0 && record.observedCounterRanges.chainKillReturnedCommands.maximum === 0),
  overcapCasesExplicitAndBudgetSkipped: cases.filter(record => record.scenario === 'overcap100-clears100').every(record => record.observedCounterRanges.actorsBefore.minimum === 100 && record.observedCounterRanges.acceptedBasicClears.minimum === 100 && record.observedCounterRanges.skippedBeforeFlush.minimum > 0 && record.observedCounterRanges.budgetSkippedEvents.minimum > 0),
};
const summary = { schemaVersion: 1, generatedAt: new Date().toISOString(), mode: 'Read-only derivation of the completed isolated real-production-method benchmark; no new browser or gameplay execution.',
  rawInputs: Object.fromEntries([['report.json', report], ['raw-samples.json', raw], ['execution.json', execution]].map(([name, value]) => [name, { path: `${folder}/${name}`, sha256: sha(value.bytes) }])),
  frozenGameSha256: report.data.frozen.gameSha256, consumedBundleSha256: report.data.bundleSha256,
  checks, allChecksPassed: Object.values(checks).every(Boolean), measuredSamples: cases.reduce((total, record) => total + record.measuredSamples, 0),
  measuredPositiveBasicHitInputs: cases.reduce((total, record) => total + record.measuredSamples * 100, 0),
  scope: '360 isolated measured samples, each100 events in a single tick/JS turn/RAF callback.100-object clear fixtures are over-cap mechanism cases; cap24 cases issue100 events on24 objects. Setup, progression, normal spawning, real input cooldown, all-device FPS and GPU completion are outside scope.',
  cases, limitations: raw.data.limitations,
};
await writeFile(`${folder}/review.json`, JSON.stringify(summary, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output: `${folder}/review.json`, checks, measuredSamples: summary.measuredSamples,
  measuredPositiveBasicHitInputs: summary.measuredPositiveBasicHitInputs, cases: cases.map(record => ({ scenario: record.scenario, quality: record.quality,
    counterRanges: record.observedCounterRanges, totalSyncCpuMs: record.timing.totalSyncCpuMs, nextRafIntervalMs: record.timing.nextRafIntervalMs })) }));
if (!summary.allChecksPassed) process.exitCode = 1;
