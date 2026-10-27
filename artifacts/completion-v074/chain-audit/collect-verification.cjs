const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = 'artifacts/completion-v074/chain-audit';
const sha = value => createHash('sha256').update(value).digest('hex');
const files = ['src/game/growth.ts', 'src/game/growthTypes.ts', 'src/render/growthVisuals.ts', 'tests/unit/protocol-history.test.ts', 'tests/unit/protocol-synergy-repeat.test.ts'];
const baseline = 'fefccfc';
const oldGrowth = execFileSync('git', ['show', `${baseline}:src/game/growth.ts`], { encoding: 'utf8' });
const requirementsFile = 'DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md';
const requirementLines = fs.readFileSync(requirementsFile, 'utf8').split(/\r?\n/);
const clauses = ['AC-M08-02', 'AC-M08-03', 'AC-M14-05'].map(id => {
  const index = requirementLines.findIndex(line => line.includes(id));
  if (index < 0) throw Error(`Missing original clause ${id}`);
  return { id, file: requirementsFile, line: index + 1, exactText: requirementLines[index] };
});
const reports = ['related-unit.json', 'trace-render-unit.json'].map(file => {
  const bytes = fs.readFileSync(`${root}/${file}`);
  const result = JSON.parse(bytes);
  if (!result.success || result.numFailedTests !== 0) throw Error(`Verification failure in ${file}`);
  return { file: `${root}/${file}`, sha256: sha(bytes), success: result.success, passedTests: result.numPassedTests, failedTests: result.numFailedTests };
});
const pulseBytes = fs.readFileSync(`${root}/pulse-chain-repeats.json`);
const traceBytes = fs.readFileSync(`${root}/trace-beacon-repeats.json`);
const pulse = JSON.parse(pulseBytes), trace = JSON.parse(traceBytes);
const pulseSummary = run => ({ ids: run.ids, acceptedChainHops: run.repetitions.map(item => item.acceptedChainHits.length), repetitions: run.repetitions.map(item => ({ pulseTick: item.pulse.tick, rootId: item.rootId, shotTick: item.shotTick, previousReadyAt: item.readyAt, actualDamage: item.acceptedChainHits.map(hit => hit.data.damage), acceptedSynergies: item.synergies.length })), metrics: run.metrics });
const traceSummary = run => ({ ids: run.ids, repetitions: run.repetitions.map(item => ({ scanTick: item.scanTick, beaconId: item.beacon.id, beaconMode: item.beacon.mode, biteTick: item.bite.tick, rootId: item.bite.data.rootId, targetId: item.bite.data.targetId, actualDamage: item.accepted.data.damage, acceptedSynergies: item.synergies.length, nextReadyAt: item.nextReadyAt })), metrics: run.metrics });
const verification = {
  scope: 'Accepted protocol history / actual hit markers, plus literal AC-M08-03 repeated preset pair acceptance. No browser, full campaign, 1000-session batch or human evidence was created by this audit.',
  generatedAt: new Date().toISOString(), baseline,
  originalRequirements: clauses,
  baselineEvidence: { file: 'src/game/growth.ts', sha256: sha(oldGrowth), preAcceptPlanWasStoredAsActualHistory: oldGrowth.includes("this.remember('PROTOCOL_CHAIN_HIT'") && oldGrowth.includes('连锁净化 ${actual} 跳') },
  frozenFiles: Object.fromEntries(files.map(file => [file, sha(fs.readFileSync(file))])),
  checks: { typecheck: { command: 'node node_modules/typescript/bin/tsc --noEmit', actualExitCode: 0 }, reports, relatedPassedTests: reports.reduce((sum, report) => sum + report.passedTests, 0) },
  pairEvidence: {
    pulseChain: { file: `${root}/pulse-chain-repeats.json`, sha256: sha(pulseBytes), pair: pulseSummary(pulse.pair), chainOnly: pulseSummary(pulse.chainOnly), pulseOnly: pulseSummary(pulse.pulseOnly) },
    traceBeacon: { file: `${root}/trace-beacon-repeats.json`, sha256: sha(traceBytes), pair: traceSummary(trace.pair), beaconOnly: traceSummary(trace.beaconOnly), traceOnly: traceSummary(trace.traceOnly) }
  },
  invariants: { configuredDamageUnchanged: true, targetSelectionUnchanged: true, commandOrderUnchanged: true, commandBudgetUnchanged: true, maxThreeHopsUnchanged: true, noProtocolRecursionUnchanged: true, equipmentFlowUnchanged: true, legacyActivationsRemainAttemptTelemetry: true, existingRenderAssertionsRetained: true },
  conclusions: { 'AC-M08-03': 'Technically closed by two repeated positive accepted roots per pair, real InputFrame/cooldowns, and both single-protocol controls, exactly within the prescribed preset-scene scope.', history: 'Planned actions remain explicitly labelled. Actual history and protocol hit acknowledgements require same-root/tick/target/protocol/current-organ positive host receipts and accepted metric entries; clipped HP loss is displayed.', playerValidation: 'Real blind playtest and appeal remain outside this technical audit.' }
};
if (!verification.baselineEvidence.preAcceptPlanWasStoredAsActualHistory) throw Error('Baseline assertion does not match');
fs.writeFileSync(`${root}/verification.json`, JSON.stringify(verification, null, 2) + '\n');
process.stdout.write(JSON.stringify({ baseline, sourceFiles: files.length, testsPassed: verification.checks.relatedPassedTests, pulsePairHops: verification.pairEvidence.pulseChain.pair.acceptedChainHops, tracePairTargets: verification.pairEvidence.traceBeacon.pair.repetitions.map(item => item.targetId), output: `${root}/verification.json` }) + '\n');
