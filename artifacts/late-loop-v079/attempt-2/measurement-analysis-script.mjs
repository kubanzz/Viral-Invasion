import { readFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const baseDir = resolve('artifacts/late-loop-v079/attempt-1');
const currentDir = resolve('artifacts/late-loop-v079/attempt-2');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const shaFile = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const writeNew = async (name, value) => {
  const file = await open(resolve(currentDir, name), 'wx');
  try { await file.writeFile(value); } finally { await file.close(); }
};
const sum = (values, f = value => value) => values.reduce((total, value) => total + f(value), 0);
function bands(run) {
  return [[1, 10], [11, 20], [21, 30]].map(([fromWave, throughWave]) => {
    const waves = run.waves.filter(wave => wave.wave >= fromWave && wave.wave <= throughWave);
    const elapsedSeconds = sum(waves, wave => sum(Object.values(wave.phaseSeconds)));
    const phases = Object.fromEntries(['warning', 'intermission', 'combat'].map(phase => [phase, sum(waves, wave => wave.phaseSeconds[phase])]));
    const active = sum(waves, wave => wave.combatWithLiveEnemiesSeconds);
    const casts = run.casts.filter(cast => cast.wave >= fromWave && cast.wave <= throughWave);
    const pursuits = (run.pursuits ?? []).filter(receipt => receipt.wave >= fromWave && receipt.wave <= throughWave);
    return { fromWave, throughWave, elapsedSeconds, phaseSeconds: phases, combatWithLiveEnemiesSeconds: active,
      emptyAwaitingScheduledSpawnSeconds: sum(waves, wave => wave.emptyAwaitingScheduledSpawnSeconds),
      emptyPendingFissionSeconds: sum(waves, wave => wave.emptyPendingFissionSeconds),
      emptyCombatOtherSeconds: sum(waves, wave => wave.emptyCombatOtherSeconds),
      mandatoryPhaseAndEmptyCombatRatio: (elapsedSeconds - active) / elapsedSeconds,
      pursuitCount: pursuits.length, scheduledWaitReductionSeconds: sum(pursuits, receipt => receipt.reducedBy),
      telegraphs: casts.length, castOutcomes: Object.fromEntries([...new Set(casts.map(cast => cast.outcome))]
        .map(outcome => [outcome, casts.filter(cast => cast.outcome === outcome).length])),
      playerDamage: sum(waves, wave => wave.damageTaken),
      maxLiving: Math.max(...waves.map(wave => wave.maxLiving)), maxConcurrent: Math.max(...waves.map(wave => wave.maxConcurrent)),
    };
  });
}
const baselineReport = await readJson(resolve(baseDir, 'report.json'));
const currentReport = await readJson(resolve(currentDir, 'report.json'));
const runs = [];
for (const seed of [7, 71]) for (const build of ['shooting', 'area', 'immune']) {
  const baseline = await readJson(resolve(baseDir, `seed-${seed}-${build}.json`));
  const current = await readJson(resolve(currentDir, `seed-${seed}-${build}.json`));
  runs.push({ seed, build, stop: current.stop, clearedWaves: current.clearedWaves,
    baselineElapsed: baseline.elapsed, currentElapsed: current.elapsed,
    elapsedReductionRatio: 1 - current.elapsed / baseline.elapsed,
    pursuitCount: current.pursuits.length, scheduledWaitReductionSeconds: sum(current.pursuits, receipt => receipt.reducedBy),
    maxLiving: current.maxLiving, maxConcurrent: current.maxConcurrent, maxCells: current.maxCells,
    playerDamage: current.cumulativePlayerDamage, playerDamageByReason: current.playerDamageByReason,
    tissueLossByReason: current.tissueLossByReason, castOutcomes: current.castOutcomes,
    baselineBands: bands(baseline), currentBands: bands(current),
  });
}
const changedFiles = baselineReport.fingerprints.flatMap((before, index) => {
  const after = currentReport.fingerprints[index]; return before.sha256 === after.sha256 ? [] : [{ before, after }];
});
const mapping = {
  schemaVersion: 1,
  baselineReportSha256: await shaFile(resolve(baseDir, 'report.json')),
  currentReportSha256: await shaFile(resolve(currentDir, 'report.json')),
  baselineBundleSha256: await shaFile(resolve(baseDir, 'simulation-bundle.mjs')),
  currentBundleSha256: await shaFile(resolve(currentDir, 'simulation-bundle.mjs')),
  currentSourcesUnchangedDuringMeasurement: currentReport.sourceFilesUnchangedDuringMeasurement,
  inputFunctionUnchanged: baselineReport.strategyCompatibility.inputFunctionSha256 === currentReport.strategyCompatibility.inputFunctionSha256,
  changedFiles,
  attribution: 'The current revision includes pursuit pacing, root ordinary-melee recovery/LOS fixes, and fixed-60Hz haste upgrade corrections. Same public-input strategy and priorities, not identical input frames. Paired time changes are combined-revision observations, not a single-variable causal experiment. Pursuit receipts directly record accepted scheduled time cuts.',
};
const comparison = { schemaVersion: 1, scope: currentReport.scope, mapping, runs,
  waitingDefinition: 'Warning/intermission plus combat ticks with no living target. Pending fission and awaiting scheduled spawn are disjoint. Movement/repair remain possible; modal decision time is excluded.',
  checks: { focusedDirectorFormationAndRealSessionTests: '33/33 passed',
    previousGlobalTypecheck: 'Failed only at separately-owned src/render/phaserRenderer.ts:99: LungFlowState.airwayClosed; root owns final global validation.' },
};
await writeNew('measurement-analysis-script.mjs', await readFile(new URL(import.meta.url)));
await writeNew('source-map.json', JSON.stringify(mapping, null, 2));
await writeNew('comparison.json', JSON.stringify(comparison, null, 2));
const percent = value => `${(value * 100).toFixed(1)}%`;
const lines = ['# 清场追猎：同策略30波前后观察', '',
  '当前六局全部通过公开输入/选择自然清到30波，未强制赢、受伤、协同或出招。没有失败、150秒单波超时、1200秒总预算超时、24人口或3攻击并发违规。', '',
  '| seed | 策略 | 基线秒 → 当前秒 | 时间缩短 | 21–30波排程空场秒：基线 → 当前 | 清场加速受理次数 |',
  '|---|---|---:|---:|---:|---:|'];
for (const run of runs) lines.push(`| ${run.seed} | ${run.build} | ${run.baselineElapsed.toFixed(2)} → ${run.currentElapsed.toFixed(2)} | ${percent(run.elapsedReductionRatio)} | ${run.baselineBands[2].emptyAwaitingScheduledSpawnSeconds.toFixed(2)} → ${run.currentBands[2].emptyAwaitingScheduledSpawnSeconds.toFixed(2)} | ${run.pursuitCount} |`);
lines.push('', '清场追猎只在仍有有限批次、没有任何活敌且无待裂殖时，将下一批剩余等待收紧至最多0.5模拟秒。较近的deadline不被推迟，后续tick不重置倒计时；每次实际减时仅发一条ENDLESS_PURSUIT_ACCELERATED。恢复出生后仍以相对间隔排下一批，没有补发积压。原出生距离/LOS、普通体1.5秒宽限、首次特殊体8秒预警、裂殖预约、24人口与并发3全部保留。', '',
  '33项director/formation/实际GameSession测试通过。专门用未注入状态的公开基础射击实际击杀首6体，再核对下一批真实0.5秒到达；覆盖低输出存活、待裂殖、不推迟早deadline、暂停前后、玩家/组织死亡、无积压追赶和同seed确定性。', '',
  'seed71免疫策略自然受到一次crystal-charge的16点实际损伤，并有一次完整冲锋；其余五局累计受伤0。峰值活敌6–10、攻击并发1–2、细胞3。组织损失仍只有玩家协议/冲流代价，未观察到敌方成功侵蚀。这些数据不能证明真人难度已经合适，也不把受伤当必须达到的指标。', '',
  '## 仍未解决的中后期缺口', '',
  '| seed/策略 | 21–30波预警+休整+无活敌占比：基线 → 当前 | 当前等裂殖秒 | 当前有活敌秒 |',
  '|---|---:|---:|---:|');
for (const run of runs) {
  const before = run.baselineBands[2], after = run.currentBands[2];
  lines.push(`| ${run.seed}/${run.build} | ${percent(before.mandatoryPhaseAndEmptyCombatRatio)} → ${percent(after.mandatoryPhaseAndEmptyCombatRatio)} | ${after.emptyPendingFissionSeconds.toFixed(2)} | ${after.combatWithLiveEnemiesSeconds.toFixed(2)} |`);
}
lines.push('', '绝对排程等待已明显减少，但固定相位和真实裂殖预告仍占较大比例。该比例包含仍可走位/修复的时间，并不等于绝对无动作；玩家暂停选卡的真实思考时间也不在模拟时间内。射击/AoE后10波仍能压倒绝大多数敌人，新招式、编队和成长层级的后段同质化仍是后续可验证问题。本轮没有加新支援招式，没有增加HP，也没有削弱玩家成长。50波没有实测；其封顶配置推演见attempt-1/analysis.md。', '',
  '## 版本归属', '',
  'attempt-1保持原样，原报告的源码变更false保留；其运行bundle与v078冻结bundle逐字节相同，归属已另存source-map.json。attempt-2的生产源前后指纹全部一致，运行bundle和脚本均已冻结。', '',
  mapping.attribution, '',
  `当前Node模拟bundle SHA256：${mapping.currentBundleSha256}。`,
  `当前report.json SHA256：${mapping.currentReportSha256}。`, '',
  '这仍是Node GameSession模拟，包含测试侧只读导航策略，不是浏览器发行包，也不是性能、内存、真人趣味性或留存验收。最终全局类型检查和发行构建由父代理统一记录；本代理此前检查遇到另一个美术会话正在修改的renderer字段错误，未越界修改。', '');
await writeNew('comparison.md', lines.join('\n'));
console.log(JSON.stringify({ comparison: resolve(currentDir, 'comparison.md'), currentSourcesUnchanged: mapping.currentSourcesUnchangedDuringMeasurement,
  inputFunctionUnchanged: mapping.inputFunctionUnchanged, changedFiles: changedFiles.map(value => value.after.path) }));
