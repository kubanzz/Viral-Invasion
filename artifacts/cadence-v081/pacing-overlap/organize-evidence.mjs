import { mkdir, open, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// Archive and inspect existing evidence only. This script never runs a game,
// test runner, browser, build, or modifies any original source/report.
const destination = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(destination, '../../..');
const source = resolve(workspace, '.tools/cadence-v081-source/artifacts/cadence-experiment');
const baselineSource = resolve(workspace, '.tools/late-support-source');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const relativePath = path => relative(workspace, path).replaceAll('\\', '/');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(destination === resolve(workspace, 'artifacts/cadence-v081/pacing-overlap'), 'Unexpected archive target');

async function writeNew(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  let handle;
  try { handle = await open(path, 'wx'); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assert((await readFile(path)).equals(Buffer.from(bytes)), `Refusing to overwrite differing existing file: ${path}`);
    return;
  }
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
}
const copiedFiles = [];
async function archive(original, target) {
  const bytes = await readFile(original), output = resolve(destination, target);
  assert(output.startsWith(destination + '\\') || output.startsWith(destination + '/'), 'Archive escaped its target');
  await writeNew(output, bytes);
  assert((await readFile(output)).equals(bytes), `Copy verification failed: ${target}`);
  copiedFiles.push({ path: target, origin: relativePath(original), bytes: bytes.length, sha256: sha(bytes) });
}
for (const attempt of ['attempt-1', 'attempt-2']) {
  for (const filename of ['report.json', 'measurement-script.mjs', 'simulation-bundle.mjs',
    'seed-7-shooting.json', 'seed-7-area.json', 'seed-7-immune.json',
    'seed-71-shooting.json', 'seed-71-area.json', 'seed-71-immune.json']) {
    await archive(resolve(source, attempt, filename), `${attempt}/${filename}`);
  }
}
for (const filename of ['comparison.json', 'comparison.md', 'focused-final.json']) await archive(resolve(source, filename), filename);
await archive(resolve(baselineSource, 'artifacts/cadence-baseline/fission-before.json'), 'baseline/fission-before.json');
await archive(resolve(baselineSource, 'tests/unit/fission-pursuit-overlap-baseline.test.ts'), 'baseline/fission-pursuit-overlap-baseline.test.ts');
await archive(resolve(workspace, '.tools/cadence-v081-source/tests/unit/fission-pursuit-overlap.test.ts'), 'fixtures/fission-pursuit-overlap.test.ts');

const first = await readJson(resolve(destination, 'attempt-1/report.json'));
const second = await readJson(resolve(destination, 'attempt-2/report.json'));
const baseline = await readJson(resolve(destination, 'baseline/fission-before.json'));
const focused = await readJson(resolve(destination, 'focused-final.json'));
const originalComparison = await readJson(resolve(destination, 'comparison.json'));
assert(baseline.numTotalTests === 8 && baseline.numPassedTests === 5 && baseline.numFailedTests === 3, 'Unexpected baseline result');
const sourceDifferences = first.fingerprints.map(before => ({ path: before.path, attempt1: before.sha256,
  attempt2: second.fingerprints.find(after => after.path === before.path)?.sha256 })).filter(item => item.attempt1 !== item.attempt2);
const bundle1 = await readFile(resolve(destination, 'attempt-1/simulation-bundle.mjs'), 'utf8');
const bundle2 = await readFile(resolve(destination, 'attempt-2/simulation-bundle.mjs'), 'utf8');
const terminalGuard = '      if (s.endless && (s.player.hp <= 0 || s.tissue.hp <= 0)) break;\n';
const guardOccurrences = bundle2.split(terminalGuard).length - 1;
const bundleDifferenceIsExactlyTerminalGuard = guardOccurrences === 1 && bundle2.replace(terminalGuard, '') === bundle1;
assert(bundleDifferenceIsExactlyTerminalGuard, 'Unexpected frozen bundle changes');
assert(sourceDifferences.length === 1 && sourceDifferences[0].path === 'src/game/battle.ts', 'Unexpected fingerprint changes');

const resultRows = [];
for (const a of first.results) {
  const b = second.results.find(item => item.seed === a.seed && item.build === a.build);
  const filename = `seed-${a.seed}-${a.build}.json`;
  const bytes1 = await readFile(resolve(destination, 'attempt-1', filename));
  const bytes2 = await readFile(resolve(destination, 'attempt-2', filename));
  const raw1 = JSON.parse(bytes1), raw2 = JSON.parse(bytes2);
  // report.json intentionally omits choices/casts/liveAtStop; compare every
  // retained summary field with its raw origin, then compare complete raws.
  assert(Object.keys(a).every(key => isDeepStrictEqual(raw1[key], a[key]))
    && Object.keys(b).every(key => isDeepStrictEqual(raw2[key], b[key])), `Per-run/report summary mismatch: ${filename}`);
  const row = { seed: a.seed, build: a.build, fullResultObjectEqual: isDeepStrictEqual(raw1, raw2),
    reportResultSummaryEqual: isDeepStrictEqual(a, b), rawOnlyFields: Object.keys(raw1).filter(key => !Object.hasOwn(a, key)),
    rawResultFileBytesEqual: bytes1.equals(bytes2), rawResultFileSha256: sha(bytes1),
    inputSha256Equal: a.inputSha256 === b.inputSha256, inputSha256: a.inputSha256,
    inputFramesEqual: a.inputFrames === b.inputFrames, inputFrames: a.inputFrames,
    inputCountsEqual: isDeepStrictEqual(a.inputCounts, b.inputCounts), choicesEqual: isDeepStrictEqual(raw1.choices, raw2.choices), choicesCount: raw1.choices.length,
    stop: b.stop, clearedWaves: b.clearedWaves, elapsed: b.elapsed, cumulativePlayerDamage: b.cumulativePlayerDamage,
    maxLiving: b.maxLiving, maxConcurrent: b.maxConcurrent };
  assert(row.fullResultObjectEqual && row.rawResultFileBytesEqual && row.inputSha256Equal && row.inputFramesEqual && row.inputCountsEqual && row.choicesEqual,
    `Attempt mismatch: ${filename}`);
  resultRows.push(row);
}
assert(resultRows.length === 6 && second.results.length === 6, 'Expected exactly six runs per attempt');
const metadataDifferenceKeys = Object.keys(first).filter(key => key !== 'results' && !isDeepStrictEqual(first[key], second[key]));
const attemptChecks = [];
for (const [name, report] of [['attempt-1', first], ['attempt-2', second]]) {
  const scriptHash = sha(await readFile(resolve(destination, name, 'measurement-script.mjs')));
  const bundleHash = sha(await readFile(resolve(destination, name, 'simulation-bundle.mjs')));
  assert(scriptHash === report.measurementScript.sha256 && bundleHash === report.bundle.sha256, `Frozen artifact fingerprint mismatch: ${name}`);
  const fingerprintEquality = isDeepStrictEqual(report.fingerprints, report.fingerprintsAfter);
  assert(fingerprintEquality && report.sourceFilesUnchangedDuringMeasurement, `Sources changed during ${name}`);
  attemptChecks.push({ attempt: name, measuredAtUtc: report.measuredAtUtc, reportSha256: sha(await readFile(resolve(destination, name, 'report.json'))),
    scriptSha256: scriptHash, bundleSha256: bundleHash, reportedSourceCount: report.fingerprints.length,
    preAndPostFingerprintsExactlyEqual: fingerprintEquality });
}
const v080ReportPath = resolve(workspace, originalComparison.baseline.report);
assert(sha(await readFile(v080ReportPath)) === originalComparison.baseline.sha256, 'Original v080 report reference changed');
assert(attemptChecks[0].reportSha256 === originalComparison.candidate.sha256, 'Original comparison no longer points to attempt-1');
const consistency = {
  schemaVersion: 1, generatedAtUtc: new Date().toISOString(),
  scope: 'Offline comparison/archive of pre-existing files. No simulation or tests rerun. Full recorded per-run JSON compared byte-for-byte; input digest/counts/choices compared exactly. Full per-frame input text is not stored.',
  allSixRecordedResultsAndInputDigestsExactlyEqual: true, resultRows, attemptChecks,
  reportMetadataDifferenceKeys: metadataDifferenceKeys, sourceFingerprintDifferences: sourceDifferences,
  bundleDifferenceIsExactlyTerminalGuard, terminalGuard,
  originalComparison: { baseline: originalComparison.baseline, candidate: originalComparison.candidate,
    note: 'Original comparison.json/md preserved unchanged: v080 versus attempt-1 scheduling predicate only. Attempt-2 additionally contains the terminal guard; its six normal-survival records equal attempt-1 exactly.' },
  baselineFixture: { total: baseline.numTotalTests, passed: baseline.numPassedTests, failed: baseline.numFailedTests,
    failedAssertions: baseline.testResults.flatMap(file => file.assertionResults).filter(test => test.status === 'failed')
      .map(test => ({ title: test.title, firstFailureLine: test.failureMessages[0]?.split('\n')[0] })),
    originReport: relativePath(resolve(baselineSource, 'artifacts/cadence-baseline/fission-before.json')),
    note: 'Existing retained baseline raw: 5 passed, 3 failed. Not the earlier unsaved 6-pass/2-fail console run. Fixture-only trait/deadline/density/terminal injections are documented in the original test; not natural full-run evidence. This Vitest raw does not include source-at-run fingerprints.' },
  focusedRegression: { total: focused.numTotalTests, passed: focused.numPassedTests, failed: focused.numFailedTests,
    testFiles: focused.testResults.map(file => file.name),
    note: 'Copied existing root focused-final.json. Do not equate it with the earlier agent console-only 61-test run.' },
  limits: [
    'Fifteen explicitly listed source fingerprints are frozen per attempt; enemyTacticInfo.ts and other transitive dependencies are not included in that source list. Saved bundles retain the actual executed code.',
    'Attempt-2 normal-survival equality does not itself exercise lethal same-tick terminal ordering. Independent retained evidence is ../terminal-boundary-1/analysis.md.',
    'Measured seeds 7 and 71 with shooting/area/immune public-input policies only. No high-population performance, human fun, anti-stationary pass, or long-term retention claim.'
  ]
};
await writeNew(resolve(destination, 'attempt-consistency.json'), JSON.stringify(consistency, null, 2) + '\n');

const rows = resultRows.map(row => `| ${row.seed}/${row.build} | ${row.elapsed.toFixed(2)} | ${row.inputFrames} | 相同 | 相同 |`).join('\n');
const fileList = copiedFiles.map(file => `- \`${file.path}\``).join('\n');
const readme = `# 裂殖预告与有限追猎重叠：既有证据归档\n\n本目录只复制和比对已完成的测量、回归及夹具，没有重新运行模拟、测试或浏览器。原隔离目录、v080 证据、生产代码、Docs 与 Git index 均未修改。逐文件来源、字节数和 SHA256 见 manifest.json。\n\n## attempt-1 与 attempt-2 的精确一致性\n\n六局的完整结果对象深比较相同，六份逐局原始 JSON 文件逐字节相同；记录的输入 SHA256、输入帧数、输入计数和全部公开选择也完全一致。测量脚本通过连续 JSON.stringify(input) 更新输入摘要；原始逐帧输入文本没有另存，不把摘要核对描述为逐帧文本比对。\n\n| seed/策略 | 两次均用时（模拟秒） | 两次均输入帧数 | 完整结果 JSON 字节 | 输入摘要/计数/选择 |\n|---|---:|---:|---|---|\n${rows}\n\n两次报告的元数据差异为：${metadataDifferenceKeys.map(key => '\x60' + key + '\x60').join('、')}。两次各自的 15 份前后源码指纹均一致；跨 attempt 只有 battle.ts 指纹变化。冻结 bundle 的精确差异仅为敌人循环中的 terminal guard：\n\n\x60\x60\x60ts\nif (s.endless && (s.player.hp <= 0 || s.tissue.hp <= 0)) break;\n\x60\x60\x60\n\n因此 attempt-2 不是与 attempt-1 源码相同的重跑。它纳入了终局同 tick 停止后续处理的修复；六条正常存活路线的已记录结果不受该差异影响。致死顺序专项证据单独见 [terminal-boundary-1](../terminal-boundary-1/analysis.md)。明确指纹清单未覆盖 enemyTacticInfo.ts 等全部传递依赖，不能称作全仓库冻结核对；实际执行代码由各自保存的 bundle 留存。\n\n## 与 v080 的节奏对照\n\ncomparison.json 与 comparison.md 原样保留，比较的是 v080 与 attempt-1；其中“只改变追猎排程条件”只适用于这组对照。attempt-2 还包含 terminal guard，需结合 attempt-consistency.json 解释来源。六局均清除 30 波，相比 v080 快 34.63–57.27 模拟秒；没有玩家受伤或人口/攻击并发违规。正常路线峰值活体 7–11、攻击并发 1–2，不能替代 24 人口性能验收。v080 报告仍在原路径，本次只验证其哈希，没有覆盖。\n\n## 基线回归与现有定向回归\n\nbaseline/fission-before.json 实际为 **8 项：5 passed / 3 failed**。三个失败分别是下一批 .5 秒到达、暂停恢复后 .5 秒到达，以及强化后的 24 预约用例中 .5 秒截止时间前置断言；原规则实际仍需 1.7166666666666668 秒。不是“预约溢出”或“提前发奖”失败。原 baseline fixture 同目录保存，内容按其注释含受控性状、较早截止时间、人口和终局边界夹具；不是六局自然通关证据。原始 Vitest JSON 未带运行时源码指纹，不补造该字段。\n\n此前代理控制台曾报告较早测试状态下 6 pass/2 fail，但未保存独立 raw；本归档采用实际现存 JSON 的 **5 pass/3 fail**，不重造旧报告。\n\nfocused-final.json 为父代理既有定向回归：${focused.numPassedTests}/${focused.numTotalTests} 通过、${focused.numFailedTests} 失败，文件名和完整断言保留在原 JSON；不冒充此前另一组只留控制台的 61 项回归。fixtures/fission-pursuit-overlap.test.ts 同时留存当前隔离候选夹具，便于核对。\n\n这些证据只支持已测策略下等待减少、受测规则边界保持及两次记录一致，不证明真人爽快、站桩问题解决、难度成熟或长期复玩。\n\n## 归档文件\n\n${fileList}\n- \x60attempt-consistency.json\x60：本次离线比对结果与来源边界。\n- \x60manifest.json\x60：复制校验及本次生成文件哈希（清单自身不含自身哈希）。\n- \x60organize-evidence.mjs\x60：本次整理脚本；只以 wx 新建，不覆盖原资料或既有归档。\n- \x60README.md\x60：本说明。\n`;
await writeNew(resolve(destination, 'README.md'), readme);
const generatedFiles = [];
for (const filename of ['attempt-consistency.json', 'README.md', 'organize-evidence.mjs']) {
  const bytes = await readFile(resolve(destination, filename));
  generatedFiles.push({ path: filename, bytes: (await stat(resolve(destination, filename))).size, sha256: sha(bytes) });
}
await writeNew(resolve(destination, 'manifest.json'), JSON.stringify({ schemaVersion: 1, copiedFiles, generatedFiles,
  note: 'Copies verified byte-for-byte at archive time. Original files retained. Manifest excludes its own digest.' }, null, 2) + '\n');
console.log(JSON.stringify({ destination: relativePath(destination), copiedFiles: copiedFiles.length, generatedFiles: generatedFiles.length + 1,
  sixRawResultsByteIdentical: true, onlyFingerprintChange: sourceDifferences, baseline: '5 passed / 3 failed', focused: `${focused.numPassedTests}/${focused.numTotalTests}` }, null, 2));
