import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(root, 'artifacts/cycle-v088/measurement-attempt-1'), derived = resolve(output, 'derived');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeNew = async (path, value) => { const handle = await open(path, 'wx'); try { await handle.writeFile(value); } finally { await handle.close(); } };
const sum = values => values.reduce((total, value) => total + value, 0);
const median = values => { const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.ceil(sorted.length / 2) - 1] : null; };
const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const assert = (condition, message) => { if (!condition) throw Error(message); };
const plan = await readJson(resolve(here, 'plan.json'));
const reports = { baseline: await readJson(resolve(output, 'baseline/report.json')), candidate: await readJson(resolve(output, 'candidate/report.json')) };
assert(reports.baseline.cases.length + reports.candidate.cases.length === 21, 'Preserve the predeclared 21-case matrix');
assert(reports.baseline.compatibility.executedSharedPolicySha256 === reports.candidate.compatibility.executedSharedPolicySha256, 'Different public policy');
await mkdir(derived);
await writeNew(resolve(derived, 'analysis-script.mjs'), await readFile(fileURLToPath(import.meta.url)));
const runs = [];
for (const [version, report] of Object.entries(reports)) for (const task of report.cases) {
  const path = resolve(output, version, task.file), bytes = await readFile(path), raw = JSON.parse(bytes), obs = raw.cycleObservation;
  assert(sha(bytes) === task.rawSha256, `Raw case changed: ${version}/${task.file}`);
  const cellHits = [], duplicateKeys = [], seen = new Set(), commandHits = new Map();
  for (const hit of obs.acceptedDamageReceipts) {
    const match = hit.protocolId === 'IMMUNE_BEACON' && hit.damage > 0 && typeof hit.rootId === 'string' ? hit.rootId.match(/^(.+:cell:\d+):bite:(\d+)$/) : null;
    if (!match || Number(match[2]) !== hit.tick) continue;
    const key = `${hit.tick}:${hit.rootId}:${hit.id}`;
    if (seen.has(key)) { duplicateKeys.push(key); continue; } seen.add(key);
    const cellId = match[1], beaconId = cellId.slice(0, cellId.lastIndexOf(':cell:'));
    const command = obs.commands.findLast(row => row.focusTargetId === hit.id && row.beaconId === beaconId && row.at <= hit.at && row.focusUntil + 1e-9 >= hit.at);
    if (command) { if (!commandHits.has(command.sequence)) commandHits.set(command.sequence, []); commandHits.get(command.sequence).push(hit); }
    cellHits.push({ tick: hit.tick, sequence: hit.sequence, wave: hit.wave, at: hit.at, id: hit.id, rootId: hit.rootId, cellId, beaconId, damage: hit.damage,
      commandSequence: command?.sequence ?? null, targetDistanceAtCommand: command?.targetDistance ?? null,
      commandToHitSeconds: command ? hit.at - command.at : null, runtimeContactLosProof: version === 'candidate' ? hit.cellProof ?? null : null });
  }
  const amount = sum(cellHits.map(hit => hit.damage)), oldAmount = raw.damage?.immuneSubset ?? 0, oldCount = raw.damageHits?.immuneSubset ?? 0;
  assert(near(amount, oldAmount) && cellHits.length === oldCount, `Accepted root receipts disagree with the original actual-damage counter: ${version}/${task.file}`);
  const focused = obs.commands.filter(command => command.focusTargetId), distant = focused.filter(command => command.targetDistance >= 360);
  const distantHits = cellHits.filter(hit => hit.targetDistanceAtCommand >= 360);
  const terminalCellKills = obs.actors.filter(actor => actor.deathAt !== null && actor.lastHit?.tick === actor.deathTick
    && actor.lastHit?.protocolId === 'IMMUNE_BEACON' && typeof actor.lastHit?.rootId === 'string' && /:cell:\d+:bite:\d+$/.test(actor.lastHit.rootId));
  const growth = obs.choices.filter(choice => choice.accepted), breakthroughs = growth.filter(choice => choice.draft.wave % 5 === 0);
  const groupRanks = choices => Object.fromEntries([...new Set(choices.map(choice => choice.actualRankDelta))].sort().map(delta => [String(delta), choices.filter(choice => choice.actualRankDelta === delta).length]));
  const row = { version, ...task, rawSha256Verified: sha(bytes), independent: !task.replay, normalStrategy: task.strategy !== 'noncounter',
    actualPlayerDamage: sum(obs.actualPlayerAndOrganLoss.filter(receipt => receipt.type === 'PLAYER_HURT').map(receipt => receipt.actualLoss)),
    organLossByReason: Object.fromEntries([...new Set(obs.actualPlayerAndOrganLoss.filter(receipt => receipt.type === 'ORGAN_INTEGRITY_CHANGED').map(receipt => receipt.data.reason))]
      .map(reason => [reason, sum(obs.actualPlayerAndOrganLoss.filter(receipt => receipt.type === 'ORGAN_INTEGRITY_CHANGED' && receipt.data.reason === reason).map(receipt => receipt.actualLoss))])),
    actualDamage: sum(obs.acceptedDamageReceipts.map(hit => hit.damage)), actualImmune: { hits: cellHits.length, damage: amount, uniqueTargets: new Set(cellHits.map(hit => hit.id)).size,
      killReceipts: terminalCellKills.length, focusedCommands: focused.length, focusedCommandsWithPositiveHits: focused.filter(command => commandHits.has(command.sequence)).length,
      distantCommandMinimumDistance: 360, distantCommands: distant.length, distantCommandsWithPositiveHits: distant.filter(command => commandHits.has(command.sequence)).length,
      distantAcceptedHits: distantHits.length, distantAcceptedDamage: sum(distantHits.map(hit => hit.damage)),
      distantCommandToFirstHitMedian: median(distant.filter(command => commandHits.has(command.sequence)).map(command => commandHits.get(command.sequence)[0].at - command.at)),
      actualContactLosRuntimeScope: version === 'baseline' ? 'Not sampled by the old observer. Root identity plus actual positive HP loss only; no claim of baseline contact/LOS runtime verification.' : 'Sampled at accepted damage; proof fields and same-tick bite-log joins are present in candidate raw and checked by its observer.',
      duplicateRootTargetKeys: duplicateKeys, originalAcceptedCounterMatches: near(amount, oldAmount) && cellHits.length === oldCount },
    growth: { choices: growth.length, ordinaryActualRankDeltaCounts: groupRanks(growth.filter(choice => choice.draft.wave % 5 !== 0)), eliteActualRankDeltaCounts: groupRanks(breakthroughs),
      eliteChoices: breakthroughs.map(choice => ({ wave: choice.draft.wave, id: choice.args[1], before: choice.ranksBefore[choice.args[1]] ?? 0, after: choice.ranksAfter[choice.args[1]],
        delta: choice.actualRankDelta, cap: choice.maxRank, changedStats: choice.changedStats })) },
    waves: obs.waves.map(wave => ({ ...wave, actualImmuneDamageDerived: sum(cellHits.filter(hit => hit.wave === wave.wave).map(hit => hit.damage)), actualImmuneHitsDerived: cellHits.filter(hit => hit.wave === wave.wave).length })),
    cycleWindows: obs.cycleWindows, cycleEvidence: obs.cycleEvidence, failure: obs.terminal, cellHits };
  runs.push(row);
  await writeNew(resolve(derived, `${version}-seed-${task.seed}-${task.strategy}${task.replay ? '-replay-1' : ''}.json`), JSON.stringify(row, null, 2) + '\n');
}
const paired = plan.seeds.flatMap(seed => plan.strategies.map(strategy => {
  const before = runs.find(row => row.version === 'baseline' && row.seed === seed && row.strategy === strategy), after = runs.find(row => row.version === 'candidate' && row.seed === seed && row.strategy === strategy && !row.replay);
  return { seed, strategy, baseline: before, candidate: after };
}));
const groups = Object.entries(reports).map(([version, report]) => {
  const normal = runs.filter(row => row.version === version && row.normalStrategy && !row.replay), waves = normal.flatMap(run => run.waves.filter(wave => wave.clearAt !== null));
  return { version, independentNormalCases: normal.length, allCleared35: normal.every(run => run.clearedWaves === 35), observerIssues: sum(normal.map(run => run.issues ?? 0)),
    phaseClasses: ['pressure', 'release', 'elite'].map(kind => {
      const group = waves.filter(wave => wave.plannedCadenceClass === kind);
      return { kind, waves: group.length, ordinaryMedianBirthHp: median(group.map(wave => wave.ordinary.meanBirthHp)), medianCombatSeconds: median(group.map(wave => wave.combatSeconds)),
        medianLiveCombatSeconds: median(group.map(wave => wave.liveSeconds)), medianOrdinaryEngagedTtk: median(group.map(wave => wave.ordinary.medianEngagedTtk)),
        medianMaxKillsInTwoSeconds: median(group.map(wave => wave.maxKillsInTwoSeconds)), maximumLive: Math.max(...group.map(wave => wave.maxLive)),
        actualCommitments: sum(group.map(wave => wave.commits)), frozenPlayerOrTissueDangerSeconds: sum(group.map(wave => wave.playerOrTissueDangerSeconds)),
        actualPlayerDamage: sum(group.map(wave => wave.playerDamage)), actualEnemyTissueDamage: sum(group.map(wave => wave.organLossByReason['enemy-attack'] ?? 0)) };
    }),
    releasePairsMeasured: sum(normal.map(run => run.cycleWindows.filter(row => row.kind.endsWith('pressure-to-release')).length)),
    measuredReleaseContrasts: sum(normal.map(run => run.cycleEvidence.releaseContrasts)),
    renewalByClass: ['step4->step5:release-to-elite', 'step5->next-step1:next-generation-pressure'].map(kind => ({ kind,
      windows: normal.flatMap(run => run.cycleWindows).filter(row => row.kind === kind).length,
      renewalObservations: normal.flatMap(run => run.cycleWindows).filter(row => row.kind === kind && row.renewalObservation).length })),
    baselineStyleProxySupportCases: normal.filter(run => run.cycleEvidence.supportsDeclaredMechanicalCycleProxy).length,
    actualImmuneDamage: sum(normal.map(run => run.actualImmune.damage)), actualImmuneHits: sum(normal.map(run => run.actualImmune.hits)),
    distantCommands: sum(normal.map(run => run.actualImmune.distantCommands)), distantCommandsWithPositiveHits: sum(normal.map(run => run.actualImmune.distantCommandsWithPositiveHits)),
    distantAcceptedDamage: sum(normal.map(run => run.actualImmune.distantAcceptedDamage)),
    sourcesUnchanged: report.sourcesUnchanged, mechanicalValidityAsReported: report.mechanicalValidity };
});
const sourceOrigin = await readJson(resolve(here, 'candidate-v088/origin.json')), currentSourceChecks = [];
for (const [path, entry] of Object.entries(sourceOrigin.files)) currentSourceChecks.push({ path, frozenSha256: entry.sha256, currentSha256: sha(await readFile(resolve(root, path))) });
const corrections = {
  finding: 'The original baseline observer incorrectly used the catalysis-only TARGET_HIT immuneCellId field as a mandatory cell-hit discriminator. Its zero immune subset is an instrumentation omission, not evidence of zero cell contribution. Original raw files/reports are retained unchanged.',
  authorization: 'Coordinator approved no-rerun derivation, a candidate identity-only root fallback and explicit per-version runtime-proof limits before candidate execution.',
  uniformFinalAuthority: 'Both versions: positive accepted TARGET_HIT protocolId=IMMUNE_BEACON, cell/:bite root identity and matching event tick, de-duplicated by tick/rootId/targetId. Aggregates independently match the old actual-damage counter in every case.',
  contactLos: 'Baseline contact/LOS and individual bite logs were not retained by its observer; they remain unobserved. Candidate includes runtime contact/LOS snapshots and matching same-tick bite logs. No cross-version contact/LOS equivalence is inferred.',
  amendment: 'candidate/observer-amendment.json',
};
const summary = { schemaVersion: 1, scope: plan.scope, rawCaseCount: runs.length, independentNormalCases: 18, independentNegativeCases: 2, predeterminedReplayCases: 1,
  sourcesUnchanged: Object.values(reports).every(report => report.sourcesUnchanged), sharedPublicPolicyIdentical: reports.baseline.compatibility.executedSharedPolicySha256 === reports.candidate.compatibility.executedSharedPolicySha256,
  candidateFrozenSourcesStillMatchWorkspace: currentSourceChecks.every(row => row.frozenSha256 === row.currentSha256), currentSourceChecks,
  replay: reports.candidate.replay, corrections, groups,
  pairs: paired.map(({ seed, strategy, baseline, candidate }) => ({ seed, strategy, baseline: { elapsed: baseline.elapsed, playerDamage: baseline.actualPlayerDamage, organLossByReason: baseline.organLossByReason,
    cycle: baseline.cycleEvidence, immune: baseline.actualImmune, growth: baseline.growth }, candidate: { elapsed: candidate.elapsed, playerDamage: candidate.actualPlayerDamage, organLossByReason: candidate.organLossByReason,
    cycle: candidate.cycleEvidence, immune: candidate.actualImmune, growth: candidate.growth } })),
  negatives: runs.filter(run => run.strategy === 'noncounter').map(run => ({ version: run.version, seed: run.seed, stop: run.stop, elapsed: run.elapsed, clearedWaves: run.clearedWaves,
    actualPlayerDamage: run.actualPlayerDamage, failure: run.failure })),
  technicalChecks: { actualImmuneRootCountersAllMatch: runs.every(run => run.actualImmune.originalAcceptedCounterMatches), acceptedCellDuplicates: sum(runs.map(run => run.actualImmune.duplicateRootTargetKeys.length)),
    observerIssues: sum(runs.map(run => run.issues ?? 0)), actualReplayEqual: reports.candidate.replay.exactRawBytesEqual },
  interpretationLimits: [
    'The coarse predeclared cycle proxy already supports all nine baseline cases. It cannot distinguish the desired improvement by itself; use paired raw commitment/danger/TTK/clear-window values and actual release contrast counts.',
    'Class labels describe v088 planning; v087 is retrospectively grouped by the same wave numbers only. These are three fixed historical seeds and scripted policies, not random-player difficulty or human fun estimates.',
    'The candidate combines director cadence, health progression, elite breakthrough ranks and immune pursuit. Paired differences cannot be attributed to one independent variable.',
    'No minimum damage taken, mandatory2/Q use, forced enemy survival, retry, replacement seed, injected position/HP/time/wave/population or browser test was used.',
    'Mechanical cycle readouts, slower clear times and a natural passive defeat are not human satisfaction, failure comprehension, retention or product-market evidence. Standard five-new-player observation remains separate.'
  ] };
await writeNew(resolve(derived, 'comparison.json'), JSON.stringify(summary, null, 2) + '\n');
const f = value => value === null || value === undefined ? '—' : typeof value === 'number' ? String(Number(value.toFixed(3))) : String(value);
const lines = ['# v0.8.8 固定21局：压力、成长与清场的可测变化', '',
  '基线9局、候选9局、两版各一条seed71不反制负例，以及候选71免疫一次预定重放。没有重跑、换种子或扩大预算。全部结论仅限公开GameSession输入的Node模拟。', '',
  '**统计更正：** 基线旧observer的细胞0字段漏用了仅催化时存在的immuneCellId。本派生报告统一从两版真实正伤的细胞bite根身份统计，并与原有正伤累计逐局核对。原始文件不改；基线接触/LOS未采样，候选新增采样范围单独保留。', '',
  '| seed/构筑 | 基线秒→候选秒 | 释放对照数（各最多14） | 真实细胞伤害：基线→候选 | 远距命令实际咬中：基线→候选 |',
  '|---|---:|---:|---:|---:|'];
for (const { seed, strategy, baseline, candidate } of paired) lines.push(`| ${seed}/${strategy} | ${f(baseline.elapsed)}→${f(candidate.elapsed)} | ${baseline.cycleEvidence.releaseContrasts}→${candidate.cycleEvidence.releaseContrasts} | ${f(baseline.actualImmune.damage)}→${f(candidate.actualImmune.damage)} | ${baseline.actualImmune.distantCommandsWithPositiveHits}/${baseline.actualImmune.distantCommands}→${candidate.actualImmune.distantCommandsWithPositiveHits}/${candidate.actualImmune.distantCommands} |`);
lines.push('', '固定三种子中九个正常策略两版均清至35波。该结果只确认所选策略可达，并不单独通过循环体验。粗周期proxy在九个基线中也已通过，不能作为候选新增乐趣的证据。', '',
  '| 版本/计划波型 | 波数 | 中位清波秒 | 中位普通体交战TTK秒 | 实际敌人承诺 | 玩家/组织冻结危险覆盖秒 | 实际玩家损伤 | 敌对组织损伤 |', '|---|---:|---:|---:|---:|---:|---:|---:|');
for (const group of groups) for (const row of group.phaseClasses) lines.push(`| ${group.version}/${row.kind} | ${row.waves} | ${f(row.medianCombatSeconds)} | ${f(row.medianOrdinaryEngagedTtk)} | ${row.actualCommitments} | ${f(row.frozenPlayerOrTissueDangerSeconds)} | ${f(row.actualPlayerDamage)} | ${f(row.actualEnemyTissueDamage)} |`);
lines.push('', '1→2与3→4按释放分别记录；4→5为精英挑战，5→6为下一代压力。危险覆盖是玩家或组织进入已冻结的可躲攻击几何的时间，不是计划伤害，更不是必须受伤。逐波DPS、峰值人口、积压HP、两秒击杀、角色TTK和四类窗口均见派生JSON。', '', '候选每五波的已选突破实际阶数、上限和前后参数均在各局growth中；普通升级仍按实际一阶记录，不把卡片文字当生效证明。', '', '两条不反制负例：');
for (const row of summary.negatives) lines.push(`- ${row.version}：${f(row.elapsed)}秒，${row.stop}；${row.failure.result?.reason ?? '没有自然失败'}。实际前摇和损伤回执保留。`);
lines.push('', `候选71免疫预定重放逐字节相同：${summary.replay.exactRawBytesEqual}。源指纹和公开策略绑定、实际伤害核对、重复/预算等见comparison.json；不含浏览器、性能、真人趣味或长期留存验收。`, '');
await writeNew(resolve(derived, 'comparison.md'), lines.join('\n'));
console.log(JSON.stringify({ output: derived, groups, technicalChecks: summary.technicalChecks, replay: summary.replay, candidateSourceStillMatches: summary.candidateFrozenSourcesStillMatchWorkspace }));
