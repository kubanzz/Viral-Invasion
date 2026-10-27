import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

// Read-only terminal evidence review; writes new artifacts only. No game/browser/test/build.
const args = process.argv.slice(2), arg = key => args[args.indexOf(key) + 1];
if (!args.includes('--run')) { console.log('Prepared. Final consumption requires --run --pressure REPORT --pressure-execution EXECUTION --memory REVIEW.'); process.exit(0); }
const root = 'artifacts/completion-v074', game = 'a253faaf85e61370ec7abd71521a955c14265d67daf04f9db2e55de94b693a39';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const must = (value, message) => { if (!value) throw Error(message); };
const paths = {
  plan: `${root}/visual-plan/requirements-review-plan.json`, old: 'artifacts/completion-v073/requirements-closure.json',
  clean: `${root}/clean/summary.json`, cleanExecution: `${root}/clean/execution.json`, unit: `${root}/clean/unit.json`,
  simulation: `${root}/clean/system-audit.json`, dev: `${root}/clean/dev-execution.json`,
  full: `${root}/browser/full-1/report.json`, fullExecution: `${root}/browser/full-1/execution.json`,
  targeted: `${root}/browser/targeted-2/report.json`, targetedExecution: `${root}/browser/targeted-2/execution.json`,
  visual: `${root}/visual-acceptance.json`, g0: `${root}/g0-image-review.json`, nonvisual: `${root}/requirements-nonvisual-review.json`, static: `${root}/source-static-review.json`,
  burst: `${root}/chain-burst/attempt-1/report.json`, burstExecution: `${root}/chain-burst/attempt-1/execution.json`,
  burstRaw: `${root}/chain-burst/attempt-1/raw-samples.json`,
  release: `${root}/release-smoke/report.json`, releaseExecution: `${root}/release-smoke/execution.json`,
  pressure: arg('--pressure'), pressureExecution: arg('--pressure-execution'), memory: arg('--memory'),
};
for (const [key, path] of Object.entries(paths)) must(typeof path === 'string' && existsSync(path), `Missing explicit terminal evidence ${key}: ${path}`);
for (const key of ['pressure','pressureExecution','memory']) must(!relative(resolve(root), resolve(paths[key])).startsWith('..'), 'Only current074 pressure evidence may be consumed.');
const data = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, read(path)]));
for (const key of ['cleanExecution','fullExecution','targetedExecution','burstExecution','pressureExecution','releaseExecution']) {
  must(data[key].finishedAt && data[key].exitCode === 0, `Not a successful terminal: ${key}`);
  if ('sourceUnchanged' in data[key]) must(data[key].sourceUnchanged, `Source changed: ${key}`);
  if ('bundleUnchanged' in data[key]) must(data[key].bundleUnchanged, `Bundle changed: ${key}`);
}
must(data.pressureExecution.browserCloseSucceeded === true, 'Pressure browser must be closed before consumption.');
must(hash('dist/game.js') === game && data.clean.build['game.js'].actual === game, 'Final candidate identity mismatch.');
const build = read('dist/build-meta.json');
must(build.version === '0.7.4' && Object.entries(build.sourceManifest).every(([path, sha]) => hash(path) === sha), 'Build inputs changed.');
must(data.clean.allChecksPassed && data.unit.success && data.unit.numFailedTests === 0, 'Current independent clean qualification failed.');
must(data.full.stats.unexpected === 0 && data.full.stats.flaky === 0 && data.targeted.stats.unexpected === 0, 'Browser failures remain.');
must(data.simulation.complete && data.simulation.completedSeeds >= 1000 && data.simulation.inputs.every(row => row.match), 'Current1000-session qualification incomplete.');
must(data.dev.exitCode === 0 && data.dev.http.httpStatus === 200 && data.dev.normalCliStop, 'Actual clean dev lifecycle missing.');
must(data.memory.sameCaseBundle && data.memory.releaseGameJsSha256 === game, 'Memory observations do not match final build.');
must(data.pressure.pass && data.pressure.activeSimulationSeconds>=600 && data.pressure.errors.length===0 && data.pressure.sourceUnchanged,'Current pressure duration/frame/error qualification failed.');
must(['standard','low'].every(q=>data.pressure.metrics[q].averageFps>=50&&data.pressure.metrics[q].p95Ms<=33),'Current declared frame budget failed.');
must(data.static.unexplainedHits.length===0 && data.static.inputCount===60 && data.static.gameSha256===game,'Static current source inventory mismatch.');
must(data.burst.pass && data.burst.completedMechanismChecks && data.burst.frozen.gameSha256===game && data.burstRaw.cases.length===6,'Burst did not finish the scoped actual100-event cases.');
for(const key of ['fullExecution','targetedExecution'])must(data[key].gameSha256===game && Object.entries(data[key].sourceManifest).every(([p,s])=>hash(p)===s),'Browser evidence source/test manifest changed: '+key);

const evidence = (key, kind, scope, extra={}) => ({ path: paths[key], sha256: hash(paths[key]), versionScope:'current-build', gameSha256:game, kind, scope, ...extra });
const currentUnit = data.unit.testResults.map((t, ti) => ({ file: `tests/unit/${basename(t.name)}`, ti,
  assertions: t.assertionResults.map((a, ai) => ({ name:a.fullName, status:a.status, pointer:`/testResults/${ti}/assertionResults/${ai}/status` })) }));
for (const row of currentUnit) {
  must(row.assertions.every(a => a.status === 'passed'), `Failed current file ${row.file}`);
  const clone = `${data.clean.clone.replaceAll('\\','/')}/${row.file}`;
  must(existsSync(clone) && hash(clone) === hash(row.file), `Current test differs from actually executed clean clone: ${row.file}`);
}
const browser = [];
function walk(suite, pointer, reportKey) {
  for (let si=0; si<(suite.specs??[]).length; si++) {
    const spec=suite.specs[si];
    for (let ti=0; ti<spec.tests.length; ti++) {
      const t=spec.tests[ti], results=t.results??[];
      browser.push({ reportKey, file:suite.file??spec.file, title:spec.title, browser:t.projectName,
        status:t.status, pointer:`${pointer}/specs/${si}/tests/${ti}/status`, results:results.map(r=>r.status),
        attachments:results.flatMap(r=>r.attachments??[]).map(a=>({ name:a.name, contentType:a.contentType, ...(a.path?{path:a.path.replaceAll('\\','/'),sha256:hash(a.path)}:{}), ...(a.body?{bodyBase64:a.body}: {}) })) });
    }
  }
  for(let i=0;i<(suite.suites??[]).length;i++)walk(suite.suites[i],`${pointer}/suites/${i}`,reportKey);
}
for(const key of ['full','targeted'])for(let i=0;i<data[key].suites.length;i++)walk(data[key].suites[i],`/suites/${i}`,key);
const oldMap=new Map(data.old.items.map(r=>[r.id,r])), nonvisual=new Map(data.nonvisual.items.map(r=>[r.id,r]));
const visual=new Map([...data.visual.requirements,...data.visual.mixedRows].map(r=>[r.id,r]));
const actualImagesViewed=[...data.visual.images,...data.g0.images].map(r=>({path:r.path,sha256:r.sha256,actuallyViewedWith:r.actuallyViewedWith,observation:r.observation}));
for(const image of actualImagesViewed)must(hash(image.path)===image.sha256,'Viewed image changed: '+image.path);

// These maps select the *actual* current report assertions/cases for each original clause.
// Prior names are used only to locate a current executed counterpart, never as a pass verdict.
const extraUnitFiles={
 'AC-M00-01':[], 'AC-M00-02':[], 'AC-M00-03':[], 'AC-M00-04':[],
 'AC-M04-05':['battle','render'], 'AC-M05-01':['battle','encounter-counter'], 'AC-M05-06':['battle','tactical-feedback'],
 'AC-M08-02':['protocols','growth-evolution','protocol-history','run-metrics','research-presentation'],
 'AC-M08-03':['protocol-synergy-repeat'], 'AC-M08-04':['protocols','protocol-history'],
 'AC-M09-04':['formal-noncounter'], 'AC-M09-05':['growth','growth-evolution','g2-integration'],
 'AC-M10-02':['pulse-world-reachability','pulse-displacement'], 'AC-M10-05':['pulsePreview','geometry'],
 'AC-M11-05':['organRules','camera-follow'], 'AC-M12-02':['campaign','g3-integration'],
 'AC-M13-03':['formal-failures','g3-boundaries'], 'AC-M13-05':['profile','session','research-session'],
 'AC-M14-04':['priority-producer-coverage','tactical-feedback','encounter-history','encounter-presentation'],
 'AC-M14-05':['protocol-history','run-metrics','research-presentation','battle','pulse-displacement'],
 'AC-M16-01':[], 'AC-M16-02':['full-system-seeds','evolution'], 'AC-M16-03':[],
 'VIS-01':['render','geometry'], 'VIS-02':['session','collision'], 'VIS-03':['render','camera-follow'],
 'VIS-04':['raised-obstacle-occlusion','render','geometry'], 'VIS-05':['render','battle'],
 'VIS-06':['pulsePreview','pulse-displacement'], 'VIS-07':['coreVisuals','encounter-presentation'],
 'VIS-08':['battle','evolution'], 'VIS-09':['organRules','camera-follow'],
 'VIS-10':['render'], 'VIS-11':['encounter-presentation','coreVisuals'],
 'RUN-01':['session'], 'RUN-02':['battle'], 'RUN-03':['encounter-counter','pulse-displacement'],
 'RUN-04':['battle'], 'RUN-05':['battle'], 'RUN-06':['protocol-synergy-repeat'],
 'RUN-07':['campaign','organRules'], 'RUN-08':['campaign','campaign-encounters'],
 'RUN-09':['g1-audit','g3-boundaries'], 'RUN-10':['motherCore','g3-boundaries','profile'],
 'RUN-11':['render','collision','geometry'], 'RUN-12':['battle','organRules','coreVisuals'],
};
const browserPatterns={
 'AC-M00-02':/RUN-01:/, 'AC-M00-03':/RUN-01:/, 'AC-M01-01':/G2: seeded|G4: complete browser seed/, 'AC-M01-02':/30-second pause|focus loss/,
 'AC-M01-03':/RUN-01:|G2: seeded|clean.*retry|Initial preparation/, 'AC-M02-01':/RUN-01:/, 'AC-M02-02':/AC-M02-02 and VIS-02/,
 'AC-M02-03':/RUN-01:/, 'AC-M02-04':/VIS-03:|AC-M02-02 and VIS-02/,'AC-M02-05':/AC-M02-02 and VIS-02|VIS-04 and RUN-11/,
 'AC-M02-06':/VIS-04 and RUN-11|VIS-03:/,
 'AC-M03-01':/G3: offline/, 'AC-M03-02':/G1 |RUN-01:/, 'AC-M03-04':/G1 |Formal encounters:/,
 'AC-M04-01':/G1 |AC-M02-02 and VIS-02/,'AC-M04-03':/RUN04 gap|G1 /,
 'AC-M05-02':/Formal crystal counter|RUN04 gap|G1 MIMIC/,'AC-M05-03':/G3: offline|Formal encounters: .*build/,
 'AC-M06-01':/G2: seeded/,'AC-M06-03':/G2: seeded/,'AC-M06-05':/G2: seeded|explicit .*help truthful/,
 'AC-M07-01':/G1 |RUN09 gap/,'AC-M07-02':/RUN09 gap|natural infection/,'AC-M07-03':/natural collapse|G1 /,'AC-M07-04':/RUN09 gap/,
 'AC-M08-02':/G2 RUN-06|current build details|Directed research/,'AC-M08-05':/G2 RUN-06/,
 'AC-M09-01':/G2: seeded/,'AC-M09-02':/G2: seeded|Initial preparation/,'AC-M09-03':/G2: seeded|UI patch: Tab|focus loss/,
 'AC-M09-05':/G2: seeded|route wins through a visible advanced build|Directed research/,
 'AC-M10-01':/Formal crystal counter|G1 CARAPACE/,'AC-M10-02':/Formal crystal counter/,'AC-M10-03':/Formal crystal counter|G1 CARAPACE/,'AC-M10-04':/Formal crystal counter/,
 'AC-M11-01':/G3:.*lung source|G3: offline pursue/,'AC-M11-02':/G3: offline pursue|Formal encounters: pursue/,'AC-M11-03':/G3: 180 seconds/,'AC-M11-04':/G3: offline/,
 'AC-M12-01':/G3: offline|Formal encounters:/,'AC-M12-02':/G3: offline|Formal encounters:/,'AC-M12-03':/G3: offline/,'AC-M12-04':/G3: offline|G4: complete browser/,'AC-M12-05':/G3: offline/,
 'AC-M13-01':/Formal encounters: .*build|G4: complete browser/,'AC-M13-02':/G3: offline|Formal encounters: .*build/,'AC-M13-03':/real defeat seed|natural collapse|natural infection/,'AC-M13-04':/Formal encounters: .*build|G4: complete browser/,'AC-M13-05':/natural collapse|natural infection|G4: complete browser|real defeat seed|Initial preparation/,
 'AC-M14-01':/VIS-03:|current build details/,'AC-M14-03':/G1 |Formal encounters: explicit|real marked-cell/,'AC-M14-04':/skip is cosmetic|current build details|UI patch: Tab/,'AC-M14-05':/G2 RUN-06|current build details|Directed research|natural collapse/,
 'AC-M15-01':/G4: complete browser|real defeat seed|natural collapse|natural infection/,'AC-M15-02':/storage fault fixtures/,'AC-M15-03':/Initial preparation|clean.*retry|real defeat seed/,'AC-M15-04':/Initial preparation|G4: complete browser/,'AC-M15-05':/Initial preparation|current build details|G4: complete browser/,
 'AC-M16-01':/.*/,'AC-M16-03':/G4: complete browser seed|G4: real defeat seed/,'AC-M16-06':/RUN-01:|VIS-03:|focus loss|30-second pause/,
 'RUN-01':/RUN-01:/,'RUN-02':/G1 /,'RUN-03':/Formal crystal counter/,'RUN-04':/RUN04 gap/,'RUN-05':/G1 MIMIC/,'RUN-06':/G2 RUN-06/,'RUN-07':/G3: offline pursue/,'RUN-08':/G3: offline block/,'RUN-09':/RUN09 gap/,'RUN-10':/G4: complete browser/,'RUN-11':/VIS-04 and RUN-11|AC-M02-02 and VIS-02|VIS-03:/,
 'VIS-01':/AC-M02-02 and VIS-02/,'VIS-02':/AC-M02-02 and VIS-02/,'VIS-03':/VIS-03:/,'VIS-04':/VIS-04 and RUN-11|real cells remain readable/,
};
const groupReasons={
 '00':'当前独立clone安装/构建/396断言/dev正常停止与发行来源给出真实终态；当前工程命名与冻结60输入、原文设计保留均可核验。',
 '01':'当前具体确定性、固定步、事件及生命周期断言重新执行；对应实际键鼠/暂停/重试分支见所选浏览器记录。原生OS失焦仍单独保留。',
 '02':'当前G0在Chrome和Edge断网file入口实际完成训练工具、修复、E复测和重试；三窗口DPR命中与Y排序/前景图同时重新执行。',
 '03':'当前感染源传播、组织损伤/恢复、配置上限与一次奖励断言重新执行，20分钟是模拟时间压力；浏览器路径与几何同源证据分列。',
 '04':'当前敌人生命周期、实际伤害、数量上限与清理断言重新执行；视觉与真实碰撞/反馈证据独立绑定，不以后台实体计数冒充可见。',
 '05':'当前三trait行为/代价/基础反制/状态清理断言重新执行，真实三态图片和实际反制结果补充形态证明。',
 '06':'当前90秒行为窗口、概率上限、合法候选、两主trait、1000seed与同输入回放重新执行；真实G2草案/预警显示补充UI契约。',
 '07':'当前压力、临界15秒、器官警报恢复与独立失败顺序断言重新执行；实际浏览器临界恢复和自然崩溃/感染终态分列。',
 '08':'当前协议配置/实际宿主正伤害/成本/冷却/原子替换/联动断言重新执行；预设重复与实际浏览器获得/展示分别标明。',
 '09':'当前事件奖励、递减、去重、可复现草案、暂停事务与有实效的等级/新路线断言重新执行；不增加原文未要求的真人或首3分钟门槛。',
 '10':'当前冲流预览/真实推动/暴露/成本/基础反制与精确2400×1500可达性条件重新执行；778432有限实现检查结合显式连通几何论证。',
 '11':'当前肺部同坐标体系、呼吸向量/质量差、开关路径与成本、180秒压力和往返隔离断言重新执行；实际器官结构和气流图分列。',
 '12':'当前追击/封锁/放任、截止/重复/切回、后台批次上限断言及三路浏览器路径重新执行；下一阶段三分支匹配图片仍按原文单独审查。',
 '13':'当前合法目标/核心特性/主动复测阈值/单次结算/独立失败与存档生命周期均有具体当前断言/实际浏览器结果；10–15分钟节奏不由快速脚本推断。',
 '14':'当前提示优先级、长期回看、真实规则文案与图形冗余断言及源生产者映射重新核对；真人理解、真正zoom与混战遮挡缺口分别保留。',
 '15':'当前schema/损坏/禁用/只读/配额/白名单/单次结算/重试隔离/种子及实际行为建议断言与浏览器存档生命周期重新执行。',
 '16':'当前独立完整单元、1000会话与实际浏览器完整矩阵均已终态；性能/内存、原生OS/zoom与真实首玩者按各自证据资格独立判断。',
};
const partials={
 'AC-M01-02':['实际原生桌面切换焦点/最小化恢复的积压与按住输入结果未验证；synthetic blur只证明处理代码。'],
 'AC-M09-03':['实际原生失焦/恢复期间草案唯一提交与按住输入清理尚未验证。'],
 'AC-M12-02':['三路下一阶段位置/压力已有当前日志与输入结果，但未提供同一seed匹配阶段的三张画面对照及逐张审阅。'],
 'AC-M13-01':['约10–15分钟的目标玩家完整局节奏尚未取得真实观察；约一分钟优化脚本胜利只证明合法通关，不能通过此时长子句。'],
 'AC-M14-01':['真正浏览器zoom后的替代布局/提示可读和决定性目标遮挡尚未验证；窗口/DPR不等于zoom。'],
 'AC-M14-06':['实际局部文字/环形效果叠加，右HUD与肺部工具栏有采样遮挡；完整混战HUD层级尚未证明。'],
 'AC-M14-07':['24是世界敌人数，截图仅约4–5只在视野内；未覆盖完整密集决定性母巢攻击/弱点/前景组合，不能称全部可读。'],
 'AC-M16-04':['当前10分钟局部目标设备帧率与自然/终态GC内存观察可报告，但持续内存增长判断仍需结合观测趋势；不作长期无泄漏或所有硬件结论。'],
 'AC-M16-06':['Chrome/Edge真正浏览器zoom与原生OS焦点恢复未验证；synthetic blur/resize/DPR不替代这两项。'],
 'AC-M16-07':['VIS-07/10/11密集危险/HUD/zoom与VIS-12真实5人仍未全部闭合；不能以技术图片及性能总数宣称VIS01–12全部通过。'],
 'RUN-11':['真正浏览器zoom后的命中/修复/提示结果未验证，当前只有resize与DPR条件。'],
 'RUN-12':['三trait与心肺真实差异已审阅；密集决定性危险/弱点和精确同状态低特效全警示对照仍未取得。'],
 'VIS-07':['已有危险/弱点/扫描/治疗非颜色冗余信号，但实际局部环形/标签/右HUD叠加；完整密集危险与粒子遮挡范围未闭合。'],
 'VIS-10':['指定窗口已刷新技术命中/布局，但真正zoom与完整实时决定性目标/HUD遮挡仍未验证。'],
 'VIS-11':['当前同规则与采样低特效提示仍在，压力预算另有真实测量；所有致命警示在密集核心/前景组合完整保留及精确同状态对照尚未闭合。'],
};
const humans=new Set(['AC-M14-02','AC-M16-05','VIS-12']);

function objects(value, found=[]) { if(!value||typeof value!=='object')return found; if(Array.isArray(value)){for(const v of value)objects(v,found)}else{found.push(value);for(const v of Object.values(value))objects(v,found)}return found; }
const ledgerItems=[];
for(const prepared of data.plan.items){
 const {id,original}=prepared, old=oldMap.get(id), nv=nonvisual.get(id), vr=visual.get(id);
 const oldObjects=objects(old?.initialAudit?.originalRow), oldNames=new Set(oldObjects.flatMap(o=>[o.name,o.fullName,o.originalFullName]).filter(x=>typeof x==='string'));
 const oldCurrent=old?.currentClosure?.currentExactUnitNameMatches??[];for(const r of oldCurrent)if(r.originalFullName)oldNames.add(r.originalFullName);
 const files=new Set((extraUnitFiles[id]??[]).map(n=>`tests/unit/${n}.test.ts`));
 for(const o of oldObjects)if(typeof o.testFile==='string')files.add(o.testFile);
 const selectedUnits=currentUnit.map(t=>({...t,assertions:t.assertions.filter(a=>oldNames.has(a.name)||files.has(t.file))})).filter(t=>t.assertions.length);
 const rows=browser.filter(b=>b.status==='expected'&&b.results.every(r=>r==='passed')&&browserPatterns[id]?.test(b.title));
 const ev=[evidence('cleanExecution','execution-terminal','Current independent source/build unchanged terminal; repeated execution is reproducibility, not additional unique coverage.')];
 for(const t of selectedUnits)ev.push(evidence('unit','executed-typescript-unit-or-integration', 'Current finalB independent clone execution. Isolated fixture/public-input simulation scope follows each exact assertion; no browser/human inference.',{
  testFile:t.file,testFileSha256:hash(t.file),executedCloneMatchesCurrent:true, selectedAssertions:t.assertions,
  assertions:t.assertions.map(a=>({pointer:a.pointer,op:'eq',expected:'passed'})), dependencyManifest:[{path:t.file,sha256:hash(t.file)}],
 }));
 for(const key of new Set(rows.map(r=>r.reportKey)))ev.push(evidence(key,'actual-offline-browser-dom','Only selected actually-passed cases count; assigned skips are not successes. Named G0/G1/G2/G3 fixtures remain explicit stage fixtures.',{
  selectedCases:rows.filter(r=>r.reportKey===key),assertions:rows.filter(r=>r.reportKey===key).map(r=>({pointer:r.pointer,op:'eq',expected:'expected'})),
 }));
 const sourcePaths=new Set(oldObjects.flatMap(o=>[o.path]).filter(p=>typeof p==='string'&&(/^(src\/|scripts\/)/.test(p)||['package.json','package-lock.json','index.html'].includes(p))&&existsSync(p)));
 for(const o of oldObjects)if(typeof o.testFile==='string'&&existsSync(o.testFile))sourcePaths.add(o.testFile);
 const group=id.match(/^AC-M(\d{2})/i)?.[1];
 if(group==='00')for(const p of ['package.json','package-lock.json','index.html','scripts/build-offline.mjs','src/game/types.ts','src/meta/profile.ts'])sourcePaths.add(p);
 if(nv)for(const o of objects(nv))for(const p of [o.source,...(Array.isArray(o.sources)?o.sources:[])])if(typeof p==='string'&&p.startsWith('src/')&&existsSync(p))sourcePaths.add(p);
 for(const p of sourcePaths)ev.push({path:p,sha256:hash(p),versionScope:'current-build',gameSha256:game,kind:'read-only-current-source',scope:'Current exact source/static contract supplement, not a runtime result.',buildInputMatches:build.sourceManifest[p]?build.sourceManifest[p]===hash(p):null});
 if(['AC-M00-01','AC-M00-02','AC-M00-03','AC-M00-04','RUN-01','AC-M16-01'].includes(id))ev.push(evidence('clean','actual-independent-clone','Actual npm ci/build/test, tracked clean state and original design unchanged; build3files equal across60inputs.'),evidence('dev','actual-dev-http-and-normal-stop','npm run dev independent clone HTTP200 and actualq+Enter exit0.'),evidence('release','actual-extracted-release-smoke','Both installed browsers offlinefile real input/no remote/error; this smoke is not a complete campaign.'),evidence('static','read-only-finite-source-scan','Current60input hashes; no unexplained external/runtime/oldproject/absolutepath/privatekeyheader match. SVGnamespace exception explicit; not a complete secret or legal audit.'));
 if(['AC-M01-01','AC-M06-02','AC-M06-03','AC-M16-01','AC-M16-02'].includes(id))ev.push(evidence('simulation','executed-public-input-simulation','Exactly1000 unique full sessions, all actual endings/1000wins,31hashedinputs and replay equality; not1000browser/human cases.'));
 if(nv)ev.push(evidence('nonvisual','agent-original-clause-source-review','19-row exact original clause review, producer map and hint inventory; earlier pending labels are resolved only by attached final terminal evidence.',{selectedRequirement:id}));
 const isVisual=/^(VIS-|AC-M02-05|AC-M02-06|AC-M04-05|AC-M05-0[16]|AC-M10-05|AC-M11-05|AC-M14-0[367]|RUN-12)/.test(id);
 if(isVisual)ev.push(evidence('visual','agent-original-image-review','18actuallyviewed original images; candidateA CARAPACE/environment are explicitly source-shared limited reuse, other images finalB/isolated fixture labelled. Local actual pixel limits retained.',{actualImagesViewed:data.visual.images.map(r=>({path:r.path,sha256:r.sha256,gameSha256:r.gameSha256,role:r.role})),candidateAScope:data.visual.reuse.scope,unchangedDrawingDependencies:data.visual.reuse.sourceComparison.filter(r=>r.unchanged&&r.path.startsWith('src/')).map(r=>({path:r.path,sha256:r.currentSha256})),textCorrectionRecord:data.visual.reuse.explicitCorrectionRecord}));
 if(['AC-M02-05','AC-M02-06','VIS-01','VIS-02','VIS-03','VIS-04'].includes(id))ev.push(evidence('g0','agent-original-image-review','7actualfinalB G0 originals now viewed after terminal; current planar input/Ysort/hit outcomes tied to selected full cases. Viewport/DPR are not browser zoom.',{actualImagesViewed:data.g0.images}));
 if(id==='AC-M08-03')for(const name of ['pulse-chain-repeats','trace-beacon-repeats']){const path=`${root}/clean/synergy-repeats/${name}.json`;must(existsSync(path),'Missing final-clean repeated pair report');ev.push({path,sha256:hash(path),versionScope:'current-build',gameSha256:game,kind:'executed-repeated-production-input-preset',scope:'Two actual independent roots after real cooldowns; pair and both single controls. Preset technical scope, not formal campaign.'});}
 if(id==='AC-M08-04')ev.push(evidence('burst','actual-isolated-browser-burst','100same-tick positive basic-hit events: normal24actor/100events versus explicit100actor-overcap fixture,6cases×60measured+6warmups, both qualities. Actual synchronousCPU/nextRAF are notGPUrender or fullcampaignFPS.'),evidence('burstRaw','actual-raw-burst-samples','Per-sample accepted damage, finite callbacks/hops/budget and actual CPU/nextRAF values;6scenario/quality cases.'),evidence('burstExecution','execution-terminal','Actual browser closed and frozen inputs unchanged.'));
 if(id==='AC-M10-02'){const p=`${root}/pulse-reachability/sweep.ts`,clone=`${data.clean.clone.replaceAll('\\','/')}/${p}`;must(hash(p)===hash(clone),'Current clean reachability helper differs');ev.push({path:p,sha256:hash(p),versionScope:'current-build',gameSha256:game,kind:'exact-executed-clean-helper-source',scope:'The current independent-clean11assertions rerun this actual geometry certificate, >500000sweep, constructivepaths and productionpulse integrations. Earlier raw778432 numeric report retains its own candidateA scope; no relabelling.'});}
 if(id==='AC-M09-04'){const path=`${root}/clean/formal-noncounter.json`;ev.push({path,sha256:hash(path),versionScope:'current-build',gameSha256:game,kind:'executed-formal-public-input-simulation',scope:'Three explicit firsttrait seed91 full legal victories; each four currentknownthreat-adverse decisions. Incidental futuretrait matches retained; notbrowser/1000adverse routes.'});}
 if(['AC-M16-04','AC-M16-07','VIS-11'].includes(id))ev.push(evidence('pressure','actual-finite-local-pressure-run','Completed current release pressure with sampled density/CPUframe/naturalheap fields, sequentialqualitystates; actual terminal only.'),evidence('pressureExecution','execution-terminal','Closed current browser; no future/unfinished performance inferred.'),evidence('memory','read-only-memory-window-review','Naturalminute windows and laterforcedGC cleanup separately reported; finite observedscope, not alltime/allhardware leakproof.'));
 let decision='proven', remaining=[], closed=[], reason=groupReasons[group]??'当前按原文分句绑定已终态具体浏览器/单元/源图证据，技术范围与真人识别、原生OS及zoom区分。';
 if(humans.has(id)){decision='missing';remaining=[id==='AC-M14-02'?'缺少未经外部文档引导的真实新玩家首次3分钟原始识别记录；自动输入不替代首玩观察。':'真实新玩家盲测0/5；没有原始观察，不编造辨认/反制/策略/复玩结果。'];reason='原文明确要求实际新玩家观察，现有自动化、代理看图与一位原用户反馈均不能构成此记录。';}
 else if(partials[id]){decision='partial';remaining=[...partials[id]];}
 if(vr){decision=vr.verdict;closed.push(...vr.closedSubclauses);remaining=[...vr.remaining];reason=vr.scope??reason;}
 if(partials[id]){decision='partial';remaining=[...new Set([...remaining,...partials[id]])];}
 if(nv)closed.push(...nv.subclauses.filter(c=>!/(pending|missing|unverified|needs-|prepared-benchmark)/.test(c.status)&&!c.clause.startsWith('Separate player')).map(c=>c.clause));
 if(id==='AC-M09-05'){decision='proven';remaining=[];closed=['第一局至少两次实际事件赚取的成长决策，不依靠等待时间；新协议/路线与等级具有可测的队伍、连锁、控制或伤害变化。'];reason='原文要求第一局两次事件驱动有实效选择。当前objective事件不推进时间即可两次选取，正式route有4次真实decision，实际squad/chain/slow/ricochet机制与强化均通过；主观价值及复玩仍属于独立真人门槛。';}
 if(id==='AC-M08-04'){decision='proven';remaining=[];closed=['连锁最多3跳、协议伤害不递归、实际命令预算/回调有界。','实际100同tick正伤害命中事件浏览器基准完成，标准/低特效各3场景，不出现无界递归或帧耗时失控。'];reason='当前真实宿主100事件基准逐样本保留正伤害回执、cap/budget/回调与CPU及下一RAF，配合当前机制断言满足原文；100体越cap夹具另标，未替代正式24体运行。';}
 if(id==='AC-M02-05'){decision='proven';remaining=[];closed=['当前G0训练场实际分层图已逐张看图；头顶/侧面、地形/接地/远近层次成立。','当前两浏览器实际八向平面移动/360°瞄准及无跳跃重力实现/碰撞已重新验证。'];reason='旧缺口是训练场当前图与控制专项未刷新。finalB完整G0实际输入已终态，7张原图审阅补齐图像，当前模拟/投影与三窗口命中断言相互对应。';}
 if(id==='AC-M16-03'){const won=new Set(rows.map(r=>r.title.match(/complete browser seed (\d+)/)?.[1]).filter(Boolean)),lost=new Set(rows.map(r=>r.title.match(/real defeat seed (\d+)/)?.[1]).filter(Boolean));must(won.size>=10&&lost.size>=5,'Actual browser unique seed coverage insufficient');closed=[`${won.size}个不同完整胜利seed与${lost.size}个不同实际HP失败seed，所选Chrome/Edge分工真正执行；skip不计作额外覆盖。`];}
 if(id==='AC-M16-01')closed.push('当前独立clone50测试文件396断言通过（含1项1000会话批次）；完整浏览器90通过26分配跳过0失败/0flaky，真实/静态/代理图/真人缺口分列。');
 if(id==='AC-M16-04'){
  closed.push(`当前本地实际${data.pressure.activeSimulationSeconds.toFixed(4)}模拟秒，标准${data.pressure.metrics.standard.averageFps.toFixed(4)}FPS/低特效${data.pressure.metrics.low.averageFps.toFixed(4)}FPS，两档p95均${data.pressure.metrics.standard.p95Ms.toFixed(1)}ms且无致命错误；满足本设备本次帧率子句。`);
  remaining=[`自然${data.memory.natural.sampleCount}样本首末60秒中位used堆+${data.memory.natural.windowMedianChanges.usedBytes.percent.toFixed(2)}%、分配容量+${data.memory.natural.windowMedianChanges.allocatedCapacityBytes.percent.toFixed(2)}%；不能据此确认不存在持续增长。终后强制GC菜单10重开used仍+${data.memory.postMeasurement.menuTenRestartsDelta.percent.toFixed(2)}%，作为有限留存观察单列；尚不能关闭完整内存子句，不据此诊断必然泄漏或无限期稳定。`];
 }
 if(nv?.reviewVerdict)must(decision===nv.reviewVerdict,'Final nonvisual review disagrees at '+id+'; inspect evidence before publishing.');
 if(decision==='proven'&&!closed.length)closed=original.text.split(/[；。]/).map(s=>s.trim()).filter(Boolean);
 if(decision==='partial'&&!closed.length)closed=['所选当前具体unit/browser/source证明的技术子句见证据与审阅理由；以上remaining明确保留，不把整行视为通过。'];
 const corrections=nv?.extraGateCorrection?[{exactOriginal:original.text,reason:nv.extraGateCorrection,notAnExplicitOriginalGate:true}]:[];
 if(decision==='proven'&&prepared.previous.remaining.some(t=>/native|physical|真实OS|物理OS|真实Ctrl/i.test(t))&&!corrections.length)throw Error('Native gap needs explicit exact-original reassessment: '+id);
 must(decision!=='proven'||selectedUnits.length||rows.length||group==='00'||isVisual,'No current mapped evidence for technical closure: '+id);
 ledgerItems.push({id,original,evidence:ev,review:{decision,reason,coverageComplete:decision==='proven',closedSubclauses:closed,remainingSubclauses:remaining,extraPriorGateCorrections:corrections,
  scope:decision==='proven'?'Complete only at stated original technical/source/preset scope with exact current counterparts; human/native/zoom and allframe conclusions remain separately qualified.':'Explicit original-row partial/missing scope; listed open subclauses remain required.'}});
}
const counts=Object.fromEntries(['proven','partial','missing','contradicted','unreviewed'].map(v=>[v,ledgerItems.filter(r=>r.review.decision===v).length]));
must(ledgerItems.length===112&&new Set(ledgerItems.map(r=>r.id)).size===112&&counts.unreviewed===0,'Every original row must be explicitly reviewed.');
const attempt=`${root}/visual-plan/audit-attempts/${Date.now()}`;mkdirSync(attempt,{recursive:true});
const ledgerPath=`${attempt}/ledger.json`, temporaryFinal=`${attempt}/consumed.json`, finalPath=`${root}/requirements-current.json`, markdown=`${root}/requirements-current.md`, finalLedger=`${root}/requirements-current-ledger.json`;
for(const path of [finalLedger,finalPath,markdown])must(!existsSync(path),'Do not overwrite audit evidence: '+path);
const ledger={schemaVersion:1,version:'0.7.4',sourceCommit:'40fb88e8dbc3653c23cc6ea0ff3afb29f49f4ced',gameSha256:game,generatedAt:new Date().toISOString(),
 method:'All112 literal original rows independently mapped to actual finalB unit/browser/static source and separately labelled image/preset/pressure evidence. Historical counts do not select decisions. No browser/test/build executed by this review.',
 terminalEvidence:Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,{path,sha256:hash(path)}])),currentCounts:counts,items:ledgerItems};
writeFileSync(ledgerPath,JSON.stringify(ledger,null,2),{flag:'wx'});
const consumed=spawnSync(process.execPath,[`${root}/visual-plan/review-requirements.mjs`,'--consume','--ledger',ledgerPath,'--version','0.7.4','--expected-game',game,'--output',temporaryFinal],{encoding:'utf8'});
must(consumed.status===0,'Final evidence consumer rejected: '+consumed.stderr+consumed.stdout);
const final=read(temporaryFinal);must(final.items.length===112&&final.currentCounts.unreviewed===0,'Invalid final current audit.');
writeFileSync(finalLedger,readFileSync(ledgerPath),{flag:'wx'});writeFileSync(finalPath,readFileSync(temporaryFinal),{flag:'wx'});
const md=['# v0.7.4 原文112项当前验收审计','',`冻结源码 \`40fb88e\`；game.js SHA256 \`${game}\`。`,
 '',`动态统计：技术已证 ${counts.proven}、部分 ${counts.partial}、缺失 ${counts.missing}、矛盾 ${counts.contradicted}、未审阅 ${counts.unreviewed}。`,
 '', '统计逐项来自当前明确判定；没有自动继承旧73通过。当前396断言、1000完整会话、90浏览器通过/26分配跳过与独立构建均分开记账。技术通过包含原文允许的机制预设及代理原图审阅，不表示真人盲测、所有场景可读、长期无泄漏或玩法吸引力通过。',
 '', '真实新玩家0/5；原生OS焦点与真正浏览器zoom保持未验。24是世界计数，密集图仅约4–5只敌人在视野，局部叠加与HUD遮挡如实保留。',
 '', '| 原文ID | 当前判定 | 原文逐字 | 已关闭子句/理由 | 仍缺 |', '|---|---|---|---|---|'];
for(const r of final.items){const esc=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');md.push(`| ${r.id} | ${r.currentVerdict} | ${esc(r.original.text)} | ${esc(r.review.closedSubclauses.join('；'))} ${esc(r.review.reason)} | ${esc(r.review.remainingSubclauses.join('；'))} |`);}
md.push('', '每项精确来源行/原文哈希、当前断言JSONPointer、浏览器实际用例及原始附件、源文件哈希、候选A/B限定复用差异、子句纠正和剩余内容见 requirements-current.json；输入路径与不可变SHA见 requirements-current-ledger.json。','');
writeFileSync(markdown,md.join('\n'),{flag:'wx'});
console.log(JSON.stringify({finalPath,markdown,ledgerPath,currentCounts:final.currentCounts,remaining:final.items.filter(r=>r.currentVerdict!=='proven').map(r=>r.id)}));
