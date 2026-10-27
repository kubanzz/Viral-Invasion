import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const out = 'artifacts/qualification-v087', perfDir = `${out}/performance-attempt-1`, nativeDir = `${out}/native-attempt-1`;
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const check = (condition, message) => { if (!condition) throw Error(message); };
check(!existsSync(`${out}/qualification-summary.json`), 'Preserve qualification summary');
const meta = read('dist/build-meta.json'), release = read('artifacts/releases/v0.8.7/release-package.json');
const pressure = read(`${perfDir}/report.json`), runner = read(`${perfDir}/runner-summary.json`);
const memory = read(`${perfDir}/memory-review.json`), independent = read(`${perfDir}/independent-memory-review.json`);
const native = read(`${nativeDir}/report.json`), nativeCommand = read(`${out}/native-command.json`);
check(meta.version === '0.8.7' && Object.keys(meta.sourceManifest).length === 142, 'Frozen build differs');
check(sha('dist/game.js') === '27a37e8a83be3b077037991e05826970629cfca01d83ce07dee5cd30e6e8b4ae'
  && sha(release.zip) === release.sha256, 'Release changed');
for (const [path, hash] of Object.entries(meta.sourceManifest)) check(sha(path) === hash, `Build input changed: ${path}`);
check(runner.pass && runner.exitCode === 0 && runner.sourceUnchanged && runner.sourceReportMatches && runner.naturalOnly, 'Performance runner incomplete');
check(pressure.pass && pressure.activeSimulationSeconds >= 600 && pressure.releaseGameJsSha256 === sha('dist/game.js')
  && !pressure.errors.length && !pressure.requests.length && !pressure.observerDroppedFrames && !pressure.postMeasurementMemory, 'Performance scope failed');
check(pressure.samples.length === 116 && pressure.samples.every(sample => sample.forcedGc === false), 'Natural provenance differs');
check(Object.values(pressure.metrics).every(mode => mode.averageFps >= 50 && mode.p95Ms <= 33 && mode.activeDurationMs >= 295000), 'Frame budget failed');
check(pressure.maxActors === 24 && pressure.maxCells === 3 && pressure.dense_standard && pressure.dense_low && pressure.cellHits === 961, 'Density/contact coverage differs');
check(memory.input.reportSha256 === sha(`${perfDir}/report.json`), 'Memory input changed');
check(independent.input.reportSha256 === sha(`${perfDir}/report.json`)
  && independent.input.derivedSha256 === sha(`${perfDir}/memory-review.json`)
  && independent.arithmeticVerification.pass && independent.arithmeticVerification.mismatches.length === 0, 'Independent arithmetic differs');
check(nativeCommand.exitCode === 0 && nativeCommand.sourceUnchanged && native.status === 'passed-finite-scope'
  && native.actualBuildAfterSha256 === sha('dist/game.js') && native.inputBindingAfter.unchanged
  && native.inputBindingAfter.sourceInputCount === 142, 'Native terminal/source proof incomplete');
check(native.channels.length === 2 && new Set(native.channels.map(item => item.channel)).size === 2, 'Native channel coverage differs');
for (const item of native.channels) {
  check(item.passed && !item.closeError && !item.pageErrors.length && !item.consoleErrors.length && !item.remoteRequests.length, 'Native observation failed');
  check(item.cases.nativeThirtySecondFreeze.passed && item.cases.naturalCampaignXpDraft.passed
    && item.cases.naturalCampaignXpDraft.source === 'xp'
    && JSON.stringify(item.cases.naturalCampaignXpDraft.zooms.map(z => z.factor)) === JSON.stringify([1.25, 1.5])
    && item.cases.naturalCampaignXpDraft.zooms.every(z => z.passed)
    && JSON.stringify(item.cases.trainingZoom.map(z => z.factor)) === JSON.stringify([1.25, 1.5, 1])
    && item.cases.trainingZoom.every(z => z.passed), 'Native case coverage incomplete');
}
const docs = ['Docs/ViralInvasion_ProductReadiness_v0.8.7.md', 'Docs/ViralInvasion_TestMatrix.md'];
for (const path of docs) check(!readFileSync(path, 'utf8').includes('_PENDING'), 'Document incomplete');
mkdirSync(`${out}/tools`, { recursive: true });
const tools = [
  ['.tools/run-qualification-v087-performance-attempt-1.mjs', 'run-qualification-v087-performance-attempt-1.mjs'],
  ['.tools/run-qualification-v087-native-attempt-1.mjs', 'run-qualification-v087-native-attempt-1.mjs'],
  ['.tools/native-qualification-feasibility/qualify-v087-receipt.mjs', 'qualify-v087-receipt.mjs'],
  ['scripts/analyze-art-performance.mjs', 'analyze-art-performance.mjs'],
  ['.tools/finalize-qualification-v087.mjs', 'finalize-qualification-v087.mjs'],
];
for (const [from, name] of tools) cpSync(from, `${out}/tools/${name}`, { errorOnExist: true, force: false });
const references = [...docs, `${perfDir}/runner-summary.json`, `${perfDir}/report.json`, `${perfDir}/frame-times.json`,
  `${perfDir}/memory-review.json`, `${perfDir}/independent-memory-review.json`, `${perfDir}/heap-trend.svg`,
  `${perfDir}/input-binding.before.json`, `${perfDir}/input-binding.after.json`, `${out}/native-command.json`,
  `${nativeDir}/report.json`, `${nativeDir}/input-binding.before.json`, `${nativeDir}/input-binding.after.json`,
  'artifacts/duet-v087/verification-summary.json', 'artifacts/releases/v0.8.7/release-package.json'];
const summary = {
  schemaVersion: 1, version: '0.8.7', at: new Date().toISOString(), sourceCommit: 'ebea008', gameplayChanged: false,
  previousGoalTurn: 'progress', productGoalComplete: false,
  build: { gameSha256: sha('dist/game.js'), sourceInputs: 142, currentSourceMatches: true,
    zip: release.zip, zipBytes: release.bytes, zipSha256: release.sha256 },
  pressure: { pass: pressure.pass, activeSeconds: pressure.activeSimulationSeconds, seed: 13, modes: pressure.metrics,
    device: pressure.device, maximumLiveActors: pressure.maxActors, maximumCells: pressure.maxCells,
    observedDistinctCellHitsLowerBound: pressure.cellHits, runMetricsMaxFrameEntries: pressure.runMetrics.maxFrameEntries,
    coverage: pressure.coverage, naturalSamples: pressure.samples.length, forcedGcRequests: 0,
    scope: 'One formal FISSION/adaptive retained-producer pressure strategy, not a win, endless dual-elite coverage, or human playtest.' },
  memory: { arithmeticVerified: independent.arithmeticVerification.pass, fullMemoryAcceptanceClosed: false,
    laterMinuteBaseline: memory.natural.laterMinuteBaseline, naturalSampledDecreases: memory.natural.sampledDecreases.count,
    dom: memory.natural.overall.dom,
    verdict: 'Finite observation only. Used-heap sequence is nonmonotonic; DOM/listeners fluctuate with an early/late level difference. No leak-free, total RSS, GPU/VRAM or complete native-memory claim.' },
  native: { passedFiniteScope: true, channels: native.channels.map(item => ({ channel: item.channel, passed: item.passed, cases: item.cases })),
    scope: native.scope, limitations: [...native.limitations,
      'Observed hidden=false and no visibilitychange; no synthetic fallback. Screenshots include capture cropping and do not prove all UI text is readable.',
      'Each browser used a fresh isolated test profile; all contexts were closed before the next browser or subsequent work.'] },
  productGaps: { humanNewPlayers: { observed: 0, required: 5 },
    unverified: ['First-three-minute comprehension', 'Actual10–15min first-session pacing', 'Growth/strategy differences in real play', 'Voluntary replay and fun', 'Incubation/long-term value', 'Complete memory qualification'],
    decision: 'Keep candidate gameplay frozen;0/12 normal companion actions alone is not grounds for forced survival or HP tuning. Gather natural player observations before the next gameplay change.' },
  visualInspection: { pressure: 'Root viewed both actual dense pressure PNGs; different ticks and partial cap occupancy, no same-tick or human-recognition claim.',
    nativeZoom: 'Root viewed the Edge150% training capture. Capture cropping remains; real click/receipt and geometry checks are the acceptance evidence.' },
  tools: tools.map(([, name]) => ({ path: `${out}/tools/${name}`, sha256: sha(`${out}/tools/${name}`) })),
  references: references.map(path => ({ path, sha256: sha(path) })),
};
writeFileSync(`${out}/qualification-summary.json`, JSON.stringify(summary, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ version: summary.version, pressureSeconds: summary.pressure.activeSeconds,
  pressurePass: summary.pressure.pass, nativeChannels: summary.native.channels.map(item => ({ channel: item.channel, passed: item.passed })),
  fullMemoryAcceptanceClosed: false, humanPlayers: 0, gameplayChanged: false }));
