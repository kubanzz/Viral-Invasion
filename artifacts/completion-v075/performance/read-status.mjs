import { readFile } from 'node:fs/promises';

const folder = process.argv[2] ?? 'artifacts/completion-v075/performance/attempt-1';
try {
  const report = JSON.parse(await readFile(folder + '/report.json', 'utf8'));
  console.log(JSON.stringify({
    startedAt: report.startedAt, status: report.status, activeSimulationSeconds: report.activeSimulationSeconds ?? null,
    samples: report.samples?.length ?? 0, latestSample: report.samples?.at(-1) ? {
      tick: report.samples.at(-1).tick, mode: report.samples.at(-1).mode,
      usedBytes: report.samples.at(-1).naturalV8?.usedBytes, dom: report.samples.at(-1).dom
    } : null,
    maxActors: report.maxActors, maxCells: report.maxCells,
    metrics: report.metrics, acceptedControlDuringMeasurement: report.acceptedControlDuringMeasurement,
    error: report.error ?? null, browserCloseSucceeded: report.browserCloseSucceeded ?? null
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ folder, unreadable: String(error) }));
  process.exitCode = 1;
}
