import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const raw = await readFile(new URL('./report.json', import.meta.url));
const report = JSON.parse(raw);
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, min: sorted[0], max: sorted.at(-1), median: sorted[Math.floor(sorted.length / 2)], first: values[0], last: values.at(-1) };
};
const natural = report.samples.filter(sample => sample.forcedGc === false);
const windows = Array.from({ length: 10 }, (_, index) => {
  const samples = natural.filter(sample => Math.min(9, Math.floor(sample.activeSimulationSeconds / 60)) === index);
  return { activeStart: index * 60, activeEnd: (index + 1) * 60, usedBytes: stats(samples.map(sample => sample.heap.usedSize)),
    allocatedCapacityBytes: stats(samples.map(sample => sample.heap.totalSize)), domNodes: stats(samples.map(sample => sample.dom.nodes)) };
});
const checkpoints = report.postMeasurementMemory.checkpoints;
const menus = checkpoints.filter(checkpoint => checkpoint.phase === 'menu');
const delta = menus.at(-1).collected.usedSize - menus[0].collected.usedSize;
const review = {
  reportSha256: createHash('sha256').update(raw).digest('hex'),
  releaseGameJsSha256: report.releaseGameJsSha256,
  scope: 'Finite headless Chrome observation. Natural samples and frame measurement precede every forced GC. Checkpoints after measurement use three forced GCs each and real menu/restart actions; these checkpoints are not natural throughput evidence.',
  natural: { samples: natural.length, forcedGcDuringMeasurement: false, usedBytes: stats(natural.map(sample => sample.heap.usedSize)),
    allocatedCapacityBytes: stats(natural.map(sample => sample.heap.totalSize)),
    sampledHeapFalls: natural.slice(1).filter((sample, index) => sample.heap.usedSize < natural[index].heap.usedSize).length, windows },
  postMeasurement: { checkpoints: checkpoints.map(checkpoint => ({ name: checkpoint.name, phase: checkpoint.phase,
    usedBytesAfterThreeGc: checkpoint.collected.usedSize, allocatedCapacityBytesAfterThreeGc: checkpoint.collected.totalSize,
    embedderUsedBytesAfterThreeGc: checkpoint.collected.embedderHeapUsedSize, dom: checkpoint.dom })),
    tenRestartsMenuDeltaBytes: delta, tenRestartsMenuDeltaPercent: delta / menus[0].collected.usedSize * 100 },
  runMetrics: { observedSnapshots: report.runMetrics.observedSnapshots, maxObservedFrameEntries: report.runMetrics.maxFrameEntries,
    frameEntryLimit: report.runMetrics.frameLimit, limited: report.runMetrics.finalSummary.limited,
    finalAcceptedBeaconBites: report.runMetrics.finalSummary.control.beaconBites,
    caveat: 'The maximum comes from read-only polling, not inspection of every simulation tick. This run exercises the immune route; it does not prove every other metric branch was exercised.' },
  interpretation: 'Natural heap use repeatedly falls, and the post-measurement menu retained heap grows modestly across ten short restarts. Menu DOM nodes are 424, 453, then 424; listeners stay 37. The transient middle DOM increase must not be described as identical DOM counts at every checkpoint. This finite result does not prove absence of leaks or close native-device memory or human-playtest acceptance.',
};
await writeFile(new URL('./memory-review.json', import.meta.url), JSON.stringify(review, null, 2));
console.log(JSON.stringify({ natural: review.natural.usedBytes, postMeasurement: review.postMeasurement, runMetrics: review.runMetrics }));
