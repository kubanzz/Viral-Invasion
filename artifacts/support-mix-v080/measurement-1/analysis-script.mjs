import { readFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';

const outputDir = resolve('artifacts/support-mix/measurement-1');
const baselinePath = resolve('../../artifacts/late-loop-v079/attempt-2/report.json');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const writeNew = async (name, value) => {
  const file = await open(resolve(outputDir, name), 'wx');
  try { await file.writeFile(value); } finally { await file.close(); }
};
const counts = values => Object.fromEntries([...new Set(values)].map(value => [value, values.filter(item => item === value).length]));
const sum = (values, selector = value => value) => values.reduce((total, value) => total + selector(value), 0);
const report = await readJson(resolve(outputDir, 'report.json'));
const baseline = await readJson(baselinePath);
const currentScript = await readFile(resolve(outputDir, 'measurement-script.mjs'));
const baselineScript = await readFile(resolve(dirname(baselinePath), 'measurement-script.mjs'));
const functionHash = (source, begin, end) => {
  const start = source.indexOf(begin), stop = source.indexOf(end);
  if (start < 0 || stop <= start) throw new Error(`Cannot locate ${begin}`);
  return sha(source.subarray(start, stop));
};
const inputHash = functionHash(currentScript, 'function inputFor(', 'function protocolScore(');
const protocolScoreHash = functionHash(currentScript, 'function protocolScore(', 'function run(');
const mapping = {
  reportSha256: sha(await readFile(resolve(outputDir, 'report.json'))), bundleSha256: sha(await readFile(resolve(outputDir, 'simulation-bundle.mjs'))),
  measurementScriptSha256: sha(currentScript), baselineReportPath: baselinePath, baselineReportSha256: sha(await readFile(baselinePath)),
  inputFunctionSha256: inputHash,
  baselineInputFunctionSha256: functionHash(baselineScript, 'function inputFor(', 'function protocolScore('),
  inputFunctionUnchanged: inputHash === functionHash(baselineScript, 'function inputFor(', 'function protocolScore('),
  protocolScoreFunctionUnchanged: protocolScoreHash === functionHash(baselineScript, 'function protocolScore(', 'function run('),
  upgradePrioritiesUnchanged: JSON.stringify(report.strategy.combatUpgradePriorities) === JSON.stringify(baseline.strategy.combatUpgradePriorities),
  measuredSourceFileCount: report.fingerprints.length, measuredSourcesUnchanged: report.sourceFilesUnchangedDuringMeasurement,
  fingerprintCoverage: 'The original supplied script fingerprints15 paths. enemyTacticInfo.ts, now imported by endless.ts for names, is outside that before/after list. Every run nevertheless executes the same saved simulation bundle. This is not a claim that all repository files were frozen.',
};
const runs = [];
for (const seed of [7, 71]) for (const build of ['shooting', 'area', 'immune']) {
  const run = await readJson(resolve(outputDir, `seed-${seed}-${build}.json`));
  const actors = new Map(run.waves.flatMap(wave => wave.actors.map(actor => [actor.id, { ...actor, wave: wave.wave }])));
  const supports = [...actors.values()].filter(actor => actor.role === 'virus' && actor.generation === 0 && actor.tactic !== 'melee');
  const supportIds = new Set(supports.map(actor => actor.id));
  const supportCasts = run.casts.filter(cast => supportIds.has(cast.actorId));
  const mixedCasts = supportCasts.filter(cast => cast.tactic !== 'thin-ray');
  const lateCasts = supportCasts.filter(cast => cast.wave >= 16);
  const violations = supports.flatMap(actor => actor.maxHp !== 68 || actor.traits.length > 0 ? [{ actorId: actor.id, maxHp: actor.maxHp, traits: actor.traits }] : []);
  const actualDamage = sum(['basic', 'protocol', 'ability'], cause => run.damage[cause] ?? 0);
  const selectedWaves = run.waves.filter(wave => wave.wave >= 16 && wave.wave <= 30);
  const phaseSeconds = Object.fromEntries(['warning', 'intermission', 'combat'].map(phase => [phase, sum(selectedWaves, wave => wave.phaseSeconds[phase])]));
  runs.push({ seed, build, stop: run.stop, clearedWaves: run.clearedWaves, elapsedSeconds: run.elapsed,
    playerDamage: run.cumulativePlayerDamage, playerDamageByReason: run.playerDamageByReason, tissueLossByReason: run.tissueLossByReason,
    maxLiving: run.maxLiving, maxConcurrent: run.maxConcurrent, maxCells: run.maxCells,
    actualDamageByCause: run.damage, immuneDamageSubset: run.damage.immuneSubset, immuneDamageShare: run.damage.immuneSubset / actualDamage,
    acceptedMarkedImmuneBites: run.acceptedMarkedImmuneBites, supportsSpawned: supports.length, supportsByTactic: counts(supports.map(actor => actor.tactic)),
    supportInvariantViolations: violations, supportCastCount: supportCasts.length, supportCastOutcomes: counts(supportCasts.map(cast => cast.outcome)),
    supportCastsByTactic: counts(supportCasts.map(cast => cast.tactic)),
    mixedSupportCastCount: mixedCasts.length, mixedSupportCastsByTactic: counts(mixedCasts.map(cast => cast.tactic)),
    mixedSupportCastOutcomes: counts(mixedCasts.map(cast => cast.outcome)), lateSupportCastCount: lateCasts.length,
    actualMixedSupportResolutions: mixedCasts.filter(cast => ['resolved', 'charge-finished', 'interrupted-by-scan', 'killed-during-charge'].includes(cast.outcome)),
    allCastOutcomes: run.castOutcomes, liveTargetsAtStop: run.liveAtStop.length,
    latePhaseSeconds: phaseSeconds, lateAwaitingScheduledSpawnSeconds: sum(selectedWaves, wave => wave.emptyAwaitingScheduledSpawnSeconds),
    latePendingFissionEmptySeconds: sum(selectedWaves, wave => wave.emptyPendingFissionSeconds),
    maxObservedWaveCombatSeconds: Math.max(...run.waves.filter(wave => wave.combatDurationSeconds !== null).map(wave => wave.combatDurationSeconds)),
  });
}
const allResolutions = runs.flatMap(run => run.actualMixedSupportResolutions.map(cast => ({ seed: run.seed, build: run.build, ...cast })));
const analysis = { schemaVersion: 1, mapping,
  scope: 'Six fixed public-input GameSession runs to30waves, real failure or1200seconds. No state injection or forced success/damage. This is a frozen Node simulation, not browser, performance, memory or human-fun acceptance.',
  runs, totals: { supportActors: sum(runs, run => run.supportsSpawned), mixedSupportActors: sum(runs, run => sum(Object.entries(run.supportsByTactic), ([tactic, count]) => tactic === 'thin-ray' ? 0 : count)),
    supportCasts: sum(runs, run => run.supportCastCount), mixedSupportCasts: sum(runs, run => run.mixedSupportCastCount),
    mixedSupportCastOutcomes: Object.fromEntries([...new Set(runs.flatMap(run => Object.keys(run.mixedSupportCastOutcomes)))].map(outcome => [outcome, sum(runs, run => run.mixedSupportCastOutcomes[outcome] ?? 0)])),
    allMixedSupportResolutions: allResolutions },
};
await writeNew('analysis-script.mjs', await readFile(new URL(import.meta.url)));
await writeNew('source-coverage.json', JSON.stringify(mapping, null, 2));
await writeNew('analysis.json', JSON.stringify(analysis, null, 2));
const percent = value => `${(value * 100).toFixed(1)}%`;
const lines = ['# 隔离支援混编：六局公开输入30波观察', '',
  '六局均自然完成30波，没有真实失败、单波150秒停机、总1200秒预算超限、24人口或3攻击并发违规。玩家累计受伤均为0；保留该事实，没有修改策略、生产状态或随机种子来制造胜利/受伤。', '',
  '| seed | 策略 | 30波模拟秒 | 活敌/攻击并发峰值 | 免疫实际伤害子集 | 占全部实际伤害 | 已匹配正伤的显影啮击 |',
  '|---|---|---:|---:|---:|---:|---:|'];
for (const run of runs) lines.push(`| ${run.seed} | ${run.build} | ${run.elapsedSeconds.toFixed(2)} | ${run.maxLiving}/${run.maxConcurrent} | ${run.immuneDamageSubset.toFixed(2)} | ${percent(run.immuneDamageShare)} | ${run.acceptedMarkedImmuneBites} |`);
lines.push('', '免疫伤害属于protocol总伤害的子集，不能再次加入总伤害；分母只加basic/protocol/ability。显影啮击只计同tick/root/target实际正伤害匹配，不把请求或单独联动日志当伤害。基础工具、主动扫描和免疫细胞各自归因仍保存在原始JSON。', '',
  '## 支援实际出生、起手和取消', '',
  '每局实际生成69只支援：点射39、冲锋10、双点爆发10、组织侵蚀10。所有支援均为真实预算内virus、generation0、68HP、空traits，没有偷偷叠加变异被动；检查未发现违规。六局共有180只新增非点射支援，真实起手35次：33次在前摇中被击杀、1次被Q打断、1次双点爆发正常结算。', '',
  '| seed/策略 | 全部支援起手 | 新非点射起手 | 新非点射结果 |', '|---|---:|---:|---|');
for (const run of runs) lines.push(`| ${run.seed}/${run.build} | ${run.supportCastCount} | ${run.mixedSupportCastCount} | ${JSON.stringify(run.mixedSupportCastOutcomes)} |`);
lines.push('', '两项自然过程有明确回执：seed7 shooting第18波对支援侵蚀执行Q打断（ENDLESS_CORROSION_INTERRUPTED）；seed71 immune第26波双点爆发完成ENEMY_TACTIC_RESOLVED，hitPlayer/ hitTissue均false。其余新冲锋支援没有自然完成冲锋，不能拿局部夹具补写这些正常对局记录。', '',
  '前摇击杀是合法反制，不是必须消除的失败。自动策略会精确瞄准已起手威胁，且可读取冻结危险并避让，因此这六局不能等同新玩家，也不能因为起手次数增加便宣称长期压力、玩家学习或趣味性已通过。两条area路线合计仅1次新非点射起手，强构筑仍可迅速压倒这些轻型支援。', '',
  '## 队列与贡献的边界', '',
  '六局末尾均无活敌，每波都完成有限队列及真实待裂殖；峰值人口6–10、攻击并发1–2、细胞3，没有逼近24体，所以不是高人口性能验收。组织累计损失仍只有玩家协议/冲流代价，没有观察到敌方成功侵蚀。固定相位和裂殖空场在原始逐波数据中保留，不把队列未卡死当作长期节奏已成熟。', '',
  '免疫优先策略取得约16%–17%的实际伤害贡献，射击/area为约1%–3%。这证明正常对局里存在真实助手伤害和联动，也表明是否让细胞接敌、抽取路线及强主武器的清除速度会明显影响贡献；它不是对真人“是否看得见”的视觉验收。', '',
  '## 版本与策略核对', '',
  `inputFor函数SHA256为${mapping.inputFunctionSha256}，与3b前测冻结脚本逐字节一致。protocolScore函数及升级优先表也一致。同策略会依据新状态生成不同输入帧，不应称为完全相同输入轨迹。`, '',
  `脚本覆盖的${mapping.measuredSourceFileCount}份文件前后指纹一致；实际执行同一份冻结Node bundle，SHA256 ${mapping.bundleSha256}。`,
  `原始report.json SHA256 ${mapping.reportSha256}。`, '',
  '指纹覆盖限制：给定采集脚本的15路径未列新增名称依赖enemyTacticInfo.ts，因此不泛称整个仓库均做过前后冻结核对。六局实际代码仍来自同一个已保存bundle；完整覆盖说明和旧报告引用在source-coverage.json。旧证据未改，所有新证据在本隔离measurement-1目录。', '');
await writeNew('analysis.md', lines.join('\n'));
console.log(JSON.stringify({ analysis: resolve(outputDir, 'analysis.md'), inputFunctionUnchanged: mapping.inputFunctionUnchanged,
  protocolScoreFunctionUnchanged: mapping.protocolScoreFunctionUnchanged, upgradePrioritiesUnchanged: mapping.upgradePrioritiesUnchanged,
  mixedSupportCasts: analysis.totals.mixedSupportCasts, outcomes: analysis.totals.mixedSupportCastOutcomes }));
