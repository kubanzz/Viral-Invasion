import { readFile, writeFile, mkdir } from 'node:fs/promises';

// Preserve v073 evidence verbatim. Emit a separate v074 tool, never a report.
const folder = 'artifacts/completion-v074/performance';
const original = 'artifacts/completion-v073/performance/attempt-1/measurement-script.mjs';
let source = await readFile(original, 'utf8');
function change(before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one source adaptation occurrence, found${count}: ${before.slice(0, 80)}`);
  source = source.replace(before, after);
}
change("import os from 'node:os';", "import os from 'node:os';\nimport { verifyFrozen074, inspectWork074, acquireExclusive074 } from '../runtime-guards.mjs';");
change("const folder = process.env.VI_PERF_OUTPUT ?? 'artifacts/research-v071/performance';", `const runRequested = process.argv.includes('--run-exclusive');
const attempt = runRequested ? process.argv[process.argv.indexOf('--run-exclusive') + 1] : undefined;
if (runRequested && (!attempt || !/^[a-zA-Z0-9_-]+$/.test(attempt))) throw Error('Provide a new attempt name after --run-exclusive.');
const folder = 'artifacts/completion-v074/performance/' + (attempt ?? 'not-started');
const frozen = await verifyFrozen074();
const guardReadiness = await inspectWork074(folder);
const postMemory = process.env.VI_PERF_POST_MEMORY !== '0';`);
change("if (process.argv.includes('--check')) {", "if (!runRequested) {");
change("version: buildMetadata.version, gameHash, measurementScriptSha256: hash(source), helperSourceFiles: Object.keys(helperManifest).length }));", "version: buildMetadata.version, gameHash, frozen: { version: frozen.version, gameSha256: frozen.gameSha256, buildInputCount: frozen.buildInputCount }, guardReadiness, measurementScriptSha256: hash(source), helperSourceFiles: Object.keys(helperManifest).length, postMemory, executionStarted: false }));");
change("await mkdir(folder, { recursive: true });", "const exclusive = await acquireExclusive074(folder, 'formal600-second-pressure');\ntry {\nawait mkdir(folder); // Preserve all earlier attempts.");
change("const report = { version: buildMetadata.version,", "const report = { schemaVersion: 1, startedAt: new Date().toISOString(), frozen, exclusiveGuard: exclusive.record, runtimeGuardSha256: hash(await readFile('artifacts/completion-v074/runtime-guards.mjs')), version: buildMetadata.version,");
change("cellHitCountScope: 'Lower bound of distinct recent accepted hit events observed during read-only polling, not an exact total damage counter.',", "cellHitCountScope: 'Distinct recent PROTOCOL_BEACON_HIT logs observed by polling. These logs are requests, not accepted damage receipts; actual accepted hits are reported separately from the production cumulative runMetrics reducer.',");
change("const browser = await chromium.launch({ channel: 'chrome', headless: true });", `await writeFile(folder + '/pre-run.json', JSON.stringify({ startedAt: report.startedAt, frozen, exclusiveGuard: exclusive.record, seed,
  measurementScriptSha256: hash(source), driverHelperSha256: hash(helper.outputFiles[0].contents), driverSourceManifest: helperManifest,
  method: report.method, postMemory }, null, 2), { flag: 'wx' });
let browser;`);
change("try {\n  const context = await browser.newContext", "try {\n  await exclusive.assertExclusive();\n  await verifyFrozen074();\n  browser = await chromium.launch({ channel: 'chrome', headless: true });\n  const context = await browser.newContext");
change("report.warmState = state; pressureStartedAt = state.elapsed; report.measurementWallStartedAt = Date.now(); break;", "report.warmState = state; report.acceptedMetricsAtMeasurementStart = structuredClone(state.runMetrics.summary); pressureStartedAt = state.elapsed; report.measurementWallStartedAt = Date.now(); break;");
change("if (active >= nextSample) {\n      report.samples.push", "if (active >= nextSample) {\n      await exclusive.assertExclusive();\n      report.samples.push");
change("report.sourceUnchanged = gameHash === hash(await readFile('dist/game.js'));", `report.frozenAtEnd = await verifyFrozen074();
  report.driverSourceChecks = await Promise.all(Object.entries(helperManifest).map(async ([path, expected]) => ({ path, expected, current: hash(await readFile(path)) })));
  report.sourceUnchanged = gameHash === hash(await readFile('dist/game.js')) && report.driverSourceChecks.every(item => item.expected === item.current);
  report.acceptedControlDuringMeasurement = Object.fromEntries(['beaconBites', 'patrolBites', 'chainHops', 'ricochetHits', 'resonanceHits'].map(key => [key, report.finalState.runMetrics.summary.control[key] - report.acceptedMetricsAtMeasurementStart.control[key]]));`);
change("report.cellHits > 0\n    && !report.errors.length", "report.acceptedControlDuringMeasurement.beaconBites > 0\n    && !report.errors.length");
change("if (process.env.VI_PERF_POST_MEMORY === '1') {", "if (postMemory) {");
change("report.status = 'failed'; report.error = error.stack ?? String(error);", "report.status = 'failed'; report.pass = false; report.error = error.stack ?? String(error);");
change("} finally { await writeFile(`${folder}/frame-times.json`, JSON.stringify(frames)); await save(); await release().catch(() => {}); await browser.close(); }", `} finally {
  await writeFile(folder + '/frame-times.json', JSON.stringify(frames));
  await release().catch(() => {});
  let browserCloseSucceeded = false;
  try { if (browser) await browser.close(); browserCloseSucceeded = true; }
  catch (error) { report.status = 'failed'; report.pass = false; report.browserCloseError = String(error); process.exitCode = 1; }
  report.finishedAt = new Date().toISOString(); report.browserCloseSucceeded = browserCloseSucceeded;
  await save();
  await writeFile(folder + '/execution.json', JSON.stringify({ startedAt: report.startedAt, finishedAt: report.finishedAt,
    exitCode: report.pass ? 0 : 1, status: report.pass ? 'passed' : 'failed', browserCloseSucceeded,
    gameSha256: gameHash, sourceUnchanged: report.sourceUnchanged ?? null, activeSimulationSeconds: report.activeSimulationSeconds ?? null }, null, 2), { flag: 'wx' });
}
} finally { await exclusive.release(); }`);
await mkdir(folder, { recursive: true });
await writeFile(`${folder}/measurement-script.mjs`, source);
console.log(JSON.stringify({ prepared: true, browserStarted: false, inheritedSource: original, outputTool: `${folder}/measurement-script.mjs` }));
