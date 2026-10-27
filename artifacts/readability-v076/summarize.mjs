import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = 'artifacts/readability-v076';
const json = async path => JSON.parse(await readFile(`${base}/${path}`, 'utf8'));
const files = { frozen: 'frozen-provenance.json', unit: 'unit/attempt-1/vitest.json', seeds: 'seeds/attempt-1/full-system-seeds.json',
  seedUnit: 'seeds/attempt-1/vitest.json', browser: 'browser/attempt-1/report.json',
  pressure: 'performance/attempt-1/report.json', pressureExecution: 'performance/attempt-1/execution.json',
  package: 'release/package.json', smoke: 'release/smoke/report.json', render: 'render-comparisons/review.json',
  memory: 'performance/attempt-1/memory-verdict.json' };
const raw = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await json(path)])));
const mixed = [];
for (const toolkit of ['mixed-scene', 'mixed-scene-v2']) for (const dir of await readdir(`${base}/${toolkit}`, { withFileTypes: true })) if (dir.isDirectory() && /attempt-/.test(dir.name)) {
  try { const report = await json(`${toolkit}/${dir.name}/report.json`); mixed.push({ directory: `${toolkit}/${dir.name}`, status: report.status, pass: report.pass,
    actualCase: report.options.case, quality: report.options.quality, captures: report.captures, missing: report.missing,
    errors: report.errors, sourceAndBuildUnchanged: report.sourceAndBuildUnchanged, browserClosed: report.browserClosed }); }
  catch (error) { mixed.push({ directory: `${toolkit}/${dir.name}`, error: String(error) }); }
}
const inputHashes = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, { path: `${base}/${path}`, sha256: createHash('sha256').update(await readFile(`${base}/${path}`)).digest('hex') }])));
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), turnClassification: 'progress', goalStatus: 'active',
  version: '0.7.6', sourceCommit: raw.frozen.sourceCommit, gameSha256: raw.frozen.gameSha256,
  buildInputs: { count: raw.frozen.inputCount, committedAndWorkingMatch: raw.frozen.pass, protectedTrackedDiff: raw.frozen.protectedTrackedDiff },
  unit: { uniqueFiles: raw.unit.testResults.length + raw.seedUnit.testResults.length, assertions: raw.unit.numTotalTests + raw.seedUnit.numTotalTests,
    pass: raw.unit.success && raw.seedUnit.success },
  formalSessions: { completedSeeds: raw.seeds.completedSeeds, complete: raw.seeds.complete, outcomes: raw.seeds.outcomes,
    simulationSourceUnchanged: raw.seeds.simulationSourceUnchanged, replay: raw.seeds.replay.equal, preparedReplay: raw.seeds.preparedReplay.equal },
  browser: { stats: raw.browser.stats, scope: 'Current-source targeted Chrome/Edge real DOM tests. Intentional case allocation skips are reported separately.' },
  pressure: { pass: raw.pressure.pass, browserCloseSucceeded: raw.pressureExecution.browserCloseSucceeded,
    activeSimulationSeconds: raw.pressure.activeSimulationSeconds, modes: raw.pressure.metrics, maxActors: raw.pressure.maxActors, maxCells: raw.pressure.maxCells,
    acceptedControlDuringMeasurement: raw.pressure.acceptedControlDuringMeasurement, observedRequestLogs: raw.pressure.cellHits,
    scope: raw.pressure.passScope },
  mixedScenes: mixed,
  package: { pass: raw.package.staticPass && raw.smoke.pass, zip: raw.package.zip, sha256: raw.package.sha256, bytes: raw.package.bytes,
    entryCount: raw.package.files.length, offlineBrowsers: raw.smoke.browsers.map(item => item.channel) },
  knownOpen: { realFirstPlayers: '0/5; user deferred the five-player observation after the technical candidate.',
    actualBrowserZoomAndNativeFocus: 'Open; resize/DPR/synthetic blur are not replacements.',
    normalFirstRunPacingAndFun: 'Open; deterministic strategy and deliberate pressure accumulation do not establish normal 10–15min play or subjective value.',
    visualAggregate: 'Mixed images require their own human technical review and only support the actual scene. No all112 or allVIS reclassification.' },
  inputHashes };
await writeFile(`${base}/verification-summary.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ version: report.version, sourceCommit: report.sourceCommit, unit: report.unit, formalSessions: report.formalSessions.outcomes,
  browser: report.browser.stats, pressurePass: report.pressure.pass, mixedCases: mixed.length, packagePass: report.package.pass }));
