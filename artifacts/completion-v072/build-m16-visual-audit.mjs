import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const load = async path => JSON.parse(await readFile(path, 'utf8'));
const acceptancePath = 'DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md';
const artPath = 'DesignDoc_v1.3/ViralInvasion_ArtDirection_VisualAcceptance_v1.3.md';
const acceptance = await readFile(acceptancePath, 'utf8'), art = await readFile(artPath, 'utf8');
const requirements = {};
for (const line of acceptance.split(/\r?\n/)) {
  const ac = line.match(/^- `(AC-M16-\d+)`：(.+)$/);
  if (ac) requirements[ac[1]] = { text: ac[2], source: acceptancePath, line: acceptance.split(/\r?\n/).indexOf(line) + 1 };
  const run = line.match(/^12\. `(RUN-12)` (.+)$/);
  if (run) requirements[run[1]] = { text: run[2], source: acceptancePath, line: acceptance.split(/\r?\n/).indexOf(line) + 1 };
}
for (const [index, line] of art.split(/\r?\n/).entries()) {
  const fields = line.split('|').map(value => value.trim());
  const match = fields[1]?.match(/^`(VIS-\d+)`$/);
  if (match) requirements[match[1]] = { text: fields[3], expectedEvidence: fields[4], source: artPath, line: index + 1 };
}
const paths = {
  unit: 'artifacts/preparation-v072/unit-candidate-c.json',
  browser: 'artifacts/preparation-v072/browser/functional-final-summary.json',
  preparationRaw: 'artifacts/preparation-v072/browser/preparation-final.json',
  researchRaw: 'artifacts/preparation-v072/browser/research-final.json',
  simulation: 'artifacts/preparation-v072/simulation-final/full-system-audit.json',
  simulationRaw: 'artifacts/preparation-v072/simulation-final/full-system-seeds.json',
  performance: 'artifacts/preparation-v072/performance/attempt-1/report.json',
  memory: 'artifacts/preparation-v072/performance/attempt-1/memory-review.json',
  memoryWindows: 'artifacts/preparation-v072/performance/attempt-1/memory-window-audit.json',
  release: 'artifacts/preparation-v072/release-smoke/report.json',
  visual: 'artifacts/preparation-v072/visual-review.json',
  provenance: 'artifacts/preparation-v072/provenance-final.json',
  playtest: 'Docs/ViralInvasion_Playtest.md',
  historicalMatrix: 'Docs/ViralInvasion_TestMatrix.md',
  historicalG3: 'artifacts/G3/verification-summary.json',
  historicalG4Browser: 'artifacts/g4-final-browser-report.json',
  historicalG4Render: 'artifacts/G4/render-invariance-final/report.json',
  historicalObstacle: 'artifacts/feedback-v064/visual-review.json',
  silhouettes: 'artifacts/g1-visual/silhouettes.png',
  currentPressureImage: 'artifacts/preparation-v072/performance/attempt-1/dense-standard-three-cells.png',
  currentLowImage: 'artifacts/preparation-v072/performance/attempt-1/dense-low-three-cells.png',
  currentResultImage: 'artifacts/preparation-v072/browser/research-final/research-v071-Directed-res-fd38f-and-complete-formal-victory-edge/research-victory.png',
};
const evidenceIndex = {};
for (const [id, path] of Object.entries(paths)) {
  const raw = await readFile(path); evidenceIndex[id] = { path, sha256: sha(raw), bytes: raw.length };
}
const unit = await load(paths.unit), browser = await load(paths.browser), simulation = await load(paths.simulation), performance = await load(paths.performance);
const realWins = browser.cases.flatMap(item => item.realVictories);
const distinctWinSeeds = [...new Set(realWins.map(item => item.seed))];
const rows = [];
const add = (id, status, evidence, actual, applicability, next) => rows.push({ id, originalRequirement: requirements[id], status, evidence, actualEvidence: actual, currentApplicability: applicability, nextEvidenceNeeded: next });
add('AC-M16-01', 'partial', ['unit', 'browser', 'preparationRaw', 'researchRaw', 'historicalG4Browser'],
  'C非批次366/366通过；C仅4功能用例通过、2分配skip，内部6胜。历史全套属于旧包，不能作为C全套通过。当前明确分列真实输入、TS模拟、只读审查与真人0/5。',
  '本审计时间点的C完整E2E资格未齐；测试文本出现陈旧正式研究契约，root正在另行维护/计划复跑，不计为已执行。',
  '维护确证陈旧的正式研究/HUD用例后，在不改玩法的C包运行全部当前核心E2E；归档每项结果、fixture范围、skip和首失败/窄复跑来源，不能只合计本轮4专项。');
add('AC-M16-02', 'proven', ['simulation', 'simulationRaw', 'unit'],
  'C独立seed1–1000公开输入GameSession固定步长模拟：1000胜、0败/菜单退出/不变量错误；六trait顺序、500基础空装/500协议、guided/adaptive各500、三迁移路线，两个重放hash一致。31输入前后匹配。',
  '仅快速无UI模拟资格；非1000浏览器局/研究事务/档案解锁，不证明真人通关、时长或好玩。',
  '本项快速模拟已具备；生产或驱动变化后重新冻结和审计，勿用额外模拟替代仍缺的浏览器/真人。');
add('AC-M16-03', 'partial', ['browser', 'preparationRaw', 'researchRaw', 'historicalG4Browser'],
  `C共${realWins.length}真实胜局、${distinctWinSeeds.length}个不同胜利seed（${distinctWinSeeds.join('、')}），没有C五异常seed真实失败/重试批次；旧G4的10胜5败留存为历史。`,
  'C专项实际输入合法，但不足“至少10不同可通关seed＋5异常seed失败重试”；同seed两用例不增加独立seed数。',
  '当前冻结C至少10不同seed真实完整胜利、5不同异常seed真实失败并同seed干净重试；保留母巢/最终阈值/唯一RUN_ENDED/档案及输入证据。');
add('AC-M16-04', 'partial', ['performance', 'memory', 'memoryWindows', 'currentPressureImage', 'currentLowImage'],
  '本机Windows/i7-10700K/Chrome155 headless独占600.167有效秒：标准59.9979/低效60.0013FPS，p95均16.8ms，pageerror/远程请求0。116自然堆/DOM样本；两档采样24活体＋3细胞，不是全程24或全部屏内可辨。终后另行3GC/10重开。',
  '帧预算在此设备/案例proven；完整内存无持续增长未关闭。首末分钟used中位11.514/13.966MB、预留41.751/66.986MB；菜单GC后4.660→4.830MB(+3.657%)是有限诊断。未记录全部console消息，也非原生显示/GPU/RSS普遍设备证明。',
  '明确实际目标设备与内存观察口径；需要有预热基线、自然回收窗口、长时趋势/生命周期 retained 对象及必要heap/RSS/GPU诊断的可复核证据。先分析分配来源，不能通过强GC掺入测帧或重复同一短跑宣布无泄漏。');
add('AC-M16-05', 'missing', ['playtest'],
  'P01–P05均未开始，标准真人盲测0/5；一份用户反馈未按五人流程采集，不计入。',
  '用户已授权先技术候选、真人随后补；不能重分类成通过，也不能由代理/脚本生成原始记录。',
  '由用户后续安排5位首次接触玩家，保存匿名时间线、原话、反制辨识、自发复玩和两局策略变化；此审计不联系/伪造参与者。');
add('AC-M16-06', 'partial', ['release', 'browser', 'historicalG3', 'unit'],
  'C解压发行Chrome155/Edge156断网file入口实测开始、移动、暂停冻结/继续/Q，无pageerror或HTTP请求；本轮准备流程含刷新档案回放。当前unit有DPR/投影反变换，历史真实三窗口DPR截图/输入。',
  '物理OS失焦/最小化与真实Ctrl缩放没有资格；此前工具拒绝继续生效，不能用synthetic blur、viewport、CSS、DPR或其他通道变相替代。当前C也未重做所有DPR实际命中。',
  '在已允许工具范围内补C多DPR/窗口命中冒烟；受拒绝物理操作保留blocked，由有权限的人后续提供真实设备记录，不再次尝试或绕过。');
add('AC-M16-07', 'partial', ['visual', 'performance', 'historicalG4Render', 'historicalMatrix', 'playtest'],
  'C15原始PNG的代理审阅和双档性能有完整来源；旧VIS01–09/11实机和派生渲染证据保留，C未完整复跑同场景三trait/心肺/相同状态两档。VIS10缩放、VIS12真人仍缺。',
  '原矩阵“通过”必须读取对应旧版本栏，不能整体迁移成C全部视觉完成；机器技术图/代理审阅与真人分开。',
  '按以下12条补当前技术来源迁移/实机覆盖，物理缩放和真人受限独立留待真人，不借概念图或旧图冒充当前运行。');

add('VIS-01', 'proven', ['currentPressureImage', 'visual', 'historicalG3'],
  '本次审计view_image目视C原始压力PNG：角色显露头顶/正侧面、脚底阴影、隆起侧壁与多层器官地形，有3/4深度；camera.yScale=.72且规则为XY平面。',
  '技术视角标准由当前真实截图和代码成立；仅代理图像判断，非新玩家美术喜好或全局场景验收。历史视频属于其版本，本轮未新录视频。',
  '完整E2E复跑时可保留当前真实移动视频补齐推荐媒体，勿把历史录像标为C。');
add('VIS-02', 'partial', ['unit', 'historicalG3', 'browser', 'release'],
  '当前camera/碰撞/八向输入机制与366单元、C真实移动/瞄准/命中相符；旧g0实机保存eight-way-and-360-input-log，代码无跳跃/重力/Z规则。',
  'C本轮未重放完整八向同路线/360多角度日志；历史源与当前camera/碰撞有变化，不自动迁移所有实机结论。',
  '运行当前g0 VIS02真实逐键/多角度输入与位置命中日志，保留跟随镜头下的逻辑不变断言。');
add('VIS-03', 'partial', ['unit', 'historicalG3', 'browser'],
  '当前render/camera-follow单元覆盖CSS坐标与DPR/resize反变换；C方案/研究有1366×768、1100×560、800×600弹窗图，但这些不是三DPR枪口/弹道真实命中测试。',
  '历史g0三窗口/DPR实机命中有记录；C空间镜头相关源码已演进，单元不替代全部实机输入。真实Ctrl缩放另受限。',
  '在允许的浏览器自动化中重新运行当前g0三条件鼠标投影/命中与resize，归档实际截图及日志；不声称等于物理Ctrl缩放。');
add('VIS-04', 'partial', ['unit', 'historicalG3', 'historicalObstacle', 'currentPressureImage'],
  '当前renderer按groundY排序并用raisedObstacleOcclusion对玩家/目标/immune淡化，render及raised-obstacle单元通过。旧前后Y像素/前景边界和v064fold-b原图可追溯。',
  'C当前截图显示前景/接地层次，未专门保存全部当前遮挡边界实机；身体/圈线局部重叠仍存在，不能保证每帧全体可辨。',
  '复跑当前g0 Y切换与foreground边界，以及现行fold-b高部遮挡回归；保存当前来源/实际PNG。');
add('VIS-05', 'partial', ['silhouettes', 'historicalMatrix', 'unit', 'currentPressureImage'],
  '存在G1等比例黑白剪影图；当前battleVisuals持续按晶壳棱冠/裂殖分体/潜伏伪态绘制，机制单元覆盖形态关联。C图可辨玩家和两精英，非完整三分支黑白图。',
  '旧剪影未逐字节证明适用于当前所有演员/缩放；代理审阅不等于首玩者辨识。',
  '用当前绘制源和实战尺度保存玩家/普通/三分支黑白对照及实际场景对应，标明派生图与实机来源。');
add('VIS-06', 'partial', ['unit', 'browser', 'historicalG3', 'historicalMatrix'],
  'C晶壳研究真实冲流中断危机/暴露/共振有accepted事件；current pulsePreview共享几何，历史阀门预览/实际冲流原图/录像存在。',
  'C专项已证明部分实际规则，未重新形成预览→范围内外→实际影响对照全套；生产日志pushed不单独证明真实位移。',
  '当前g1/G3实机保存阀门流向预览、范围边界和真实位移/暴露，保留事件与几何断言，不把日志意图当实际位移。');
add('VIS-07', 'partial', ['visual', 'currentPressureImage', 'currentLowImage', 'unit', 'historicalObstacle'],
  'C实机危险、弱点、扫描/治疗使用图标、轮廓、文字/圈线；两档压力图玩家/组织/设施/小图可辨。view_image确认右侧精英与细胞身体/圈线局部叠合。',
  '证明采样时刻技术可读子项，不证明每个对象/预警在所有密集状态无遮挡，24活体不等于24屏内可辨；真人理解另列VIS12。',
  '完整技术回归保存危机/母巢致命前摇与密集前景下的当前双档图及实际边界；保留已见局部重叠，不用代理结论替代真人。');
add('VIS-08', 'partial', ['browser', 'visual', 'historicalMatrix', 'unit'],
  'C晶壳/潜伏定向研究有实际诊断/首次反制、形态/弱点文字和事件；旧G2同场景before/warning/after三图存在。',
  'C专项不是三分支同场景三状态全套；“玩家能辨识”不能由脚本读文本自动推出。',
  '当前三分支各保留前/预警/后及反制破绽实机连贯来源；五新玩家原话与误认留真人记录。');
add('VIS-09', 'partial', ['historicalG3', 'historicalMatrix', 'simulation', 'unit'],
  '当前lungVisuals/organLandscape与心脏图层不同，肺泡/气道/气流规则仍在；C1000模拟走三迁移路线并有关闭气道等accepted事实。历史G3同等尺度心肺实机/位移成本可追溯。',
  'C四专项都封锁路线，未产生当前完整肺部实机画面/交互；模拟不是浏览器气流可见性或不看标签的真人辨识。',
  '当前真实浏览器追击/放任并跨器官、保存相同比例心肺图及吸呼气/气道实际影响；不看标签辨识留真人观察。');
add('VIS-10', 'partial', ['browser', 'visual', 'currentResultImage', 'historicalMatrix'],
  'C1366×768结果原图目视动作/事实面板可达，方案/研究1100×560和800×600固定footer/中滚动图有实际DOM断言；历史1920×1080核心HUD存在。',
  'C当前1920×1080关键战斗HUD未完整新验；紧凑viewport不等于真实浏览器缩放。物理Ctrl受拒绝，未尝试。',
  '在允许浏览器中补当前标准两尺寸关键战斗HUD/面板，实际Ctrl缩放由有权限人工后续提供；保留未验边界。');
add('VIS-11', 'partial', ['performance', 'visual', 'currentPressureImage', 'currentLowImage', 'historicalG4Render', 'unit'],
  'C双档帧预算通过；renderer致命drawBattleDangers/drawMotherCoreDangers不受lowEffects关闭，源规则/碰撞共用。历史同tick派生render-invariance证明其旧源绘制不改状态。',
  'C压力两图是不同真实tick，不是同状态A/B；本次无C同tick两档全状态派生不变性/全部致命警示集合重新证明。内存问题属M16-04另列。',
  '对C真实快照用当前渲染源独立同tick两档绘制并比较全状态/伤害/碰撞，保留所有致命警示图；注明派生，不冒称额外实时游戏局。');
add('VIS-12', 'missing', ['playtest'],
  '实际首次玩家0/5，玩家/两类病毒/当前器官危险逐条原始辨识记录为空。',
  '截图/代理目视/自动脚本均不进入真人数量；此项不能由额外技术跑分关闭。',
  '用户后续5人盲测中逐条记录认出/未认出对象和原话，不编造分数，不在此轮自行联系或代填。');
add('RUN-12', 'partial', ['visual', 'currentPressureImage', 'currentLowImage', 'historicalMatrix', 'historicalG3', 'playtest'],
  '当前密集/低特效真实图与机制在，旧同场景三trait三状态、心跳/肺气流技术图保留；C本轮未重新串联三分支→心肺环境→密集低效全过程。',
  '历史技术来源分版本；C实际可辨范围为保存画面中的玩家/组织/设施/部分精英和反馈，不能扩展为全屏所有个体或真人理解。',
  '补C同源三分支、心肺主动环境交互和密集双档的可回溯截图/输入/实际判定；真人视觉认知独立VIS12。');

const currentSources = ['src/render/camera.ts', 'src/render/depthSort.ts', 'src/render/occlusion.ts', 'src/render/renderer.ts', 'src/render/battleVisuals.ts', 'src/render/lungVisuals.ts', 'src/render/pulsePreview.ts', 'src/render/raisedObstacleOcclusion.ts', 'src/input/controller.ts', 'src/game/session.ts', 'tests/e2e/g0.spec.ts', 'tests/unit/render.test.ts'];
const old = await load(paths.historicalG3), sourceApplicability = [];
for (const path of currentSources) {
  const currentSha256 = sha(await readFile(path)), historicalSha256 = old.sourceManifest?.[path] ?? null;
  sourceApplicability.push({ path, currentSha256, comparedTo: paths.historicalG3, historicalSha256,
    identicalToHistoricalSource: historicalSha256 ? historicalSha256 === currentSha256 : null,
    limit: 'Single-file identity is narrow reusable code evidence, not automatic requalification of the whole browser build or transitive inputs.' });
}
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), auditMode: 'Read-only documents/source/raw-artifact audit. No production/test edits, browser launch, pressure run, physical OS or Ctrl operation. Two existing PNGs viewed directly; other visual claims cite their recorded source review.',
  candidate: { version: '0.7.2', name: 'C', gameJsSha256: sha(await readFile('dist/game.js')), expectedGameJsSha256: '6b5396f6b09c123dd2cbe5f6feacff1641f0f7c41a92b6ac1e55883dd8d1d9e3', sourceCommit: 'dee94391012b08103d5443e23a361cfd08eae75e' },
  statusMeaning: { proven: '原要求在明确技术范围内已有足够当前证据，不扩展到真人或全部设备。', partial: '存在真实子项/历史证据，但当前完整要求仍有缺口。', missing: '必需的当前验收材料不存在。', contradicted: '明确原始结果与声称通过矛盾；本表不把证据不足等同玩法失败。' },
  frozenQualification: { nonBatchUnit: { total: unit.numTotalTests, passed: unit.numPassedTests, failed: unit.numFailedTests }, currentFunctionalCases: browser.actualCases,
    currentRealVictories: realWins.length, currentDistinctVictorySeeds: distinctWinSeeds, currentAbnormalDefeatRetryBatch: 0, assignmentSkips: browser.assignmentSkips,
    fastSimulation: simulation.outcomes, measuredActiveSeconds: performance.activeSimulationSeconds, humanFirstPlayers: { actual: 0, required: 5 },
    note: 'Snapshot at audit time. Any later complete E2E rerun needs a separate dated report; planned work is not retroactively counted.' },
  prohibitedRetryBoundary: '此前原生OS失焦/最小化和真实Ctrl缩放工具拒绝保持有效；本轮不重试、不换通道、不用synthetic blur/viewport/CSS/DPR伪装物理验收。缺口保留待有权限人工实测。',
  evidenceIndex, sourceApplicability,
  staleContractReview: { confirmedFormalCandidates: ['tests/e2e/feedback-v061-growth-details.spec.ts:85-86', 'tests/e2e/feedback-growth-hud-stability.spec.ts:59-60'],
    legalFixtureException: 'tests/e2e/g2.spec.ts:49明确fixture=G2；session.ts:629-631仅campaign-1 requestResearch，其余openResearch即时草案，因此该spec:108直接E→draft仍合法。先前只看E形态的疑点已更正，不需按正式流程改写。' },
  entries: rows,
  counts: Object.fromEntries(['proven', 'partial', 'missing', 'contradicted'].map(status => [status, rows.filter(row => row.status === status).length])),
  conclusion: '技术候选已交付且可玩不等于全部原始G4验收关闭；不推测趣味/复玩/孵化潜力，不建议无证据的新功能。当前可独立推进的是完整现行E2E及技术视觉来源补齐；真人与受拒绝物理操作保持独立边界。',
};
if (rows.length !== 20 || rows.some(row => !row.originalRequirement)) throw Error('Expected all seven M16 ACs, twelve VIS criteria and RUN-12 exactly once');
await mkdir('artifacts/completion-v072', { recursive: true });
await writeFile('artifacts/completion-v072/m16-visual-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ entries: rows.length, counts: report.counts, candidate: report.candidate.gameJsSha256, currentFunctionalCases: browser.actualCases, currentDistinctVictorySeeds: distinctWinSeeds }));
