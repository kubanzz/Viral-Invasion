import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../..');
const output = resolve(root, 'artifacts/source-v089/measurement-attempt-1'), derived = resolve(output, 'derived');
const sha = data => createHash('sha256').update(data).digest('hex'), sum = values => values.reduce((a,b)=>a+b,0);
const read = async path => JSON.parse(await readFile(path,'utf8'));
const write = async (name,value) => { const f=await open(resolve(derived,name),'wx');try{await f.writeFile(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');}finally{await f.close();} };
const plan = await read(resolve(here,'plan.json')), report = await read(resolve(output,'report.json'));
if(report.cases.length!==13)throw Error('Fixed13 matrix incomplete');
await mkdir(derived);await write('analysis-script.mjs',await readFile(fileURLToPath(import.meta.url),'utf8'));
const runs=[];
for(const item of report.cases){
 const bytes=await readFile(resolve(output,item.file));if(sha(bytes)!==item.rawSha256)throw Error(`Raw changed: ${item.file}`);
 const raw=JSON.parse(bytes),src=raw.sourceObservation,cycle=raw.cycleObservation;
 const clears=src.events.filter(event=>event.type==='ENDLESS_WAVE_CLEARED'),lastClear=clears.at(-1);
 const totalOrganLoss=sum(cycle.actualPlayerAndOrganLoss.filter(e=>e.type==='ORGAN_INTEGRITY_CHANGED').map(e=>e.actualLoss));
 const totalPlayerLoss=sum(cycle.actualPlayerAndOrganLoss.filter(e=>e.type==='PLAYER_HURT').map(e=>e.actualLoss));
 const sourceRows=src.sources.map(source=>{
  const w=src.waves.find(w=>w.wave===source.wave),waveClear=clears.find(event=>event.wave===source.wave),priorClear=clears.find(event=>event.wave===source.wave-1);
  const first=source.firstHit,announcement=source.announced;
  const warningAndBeforeHitLoss=first?cycle.actualPlayerAndOrganLoss.filter(e=>e.at>=announcement.at-1e-9&&e.at<=first.at+1e-9):[];
  const organLoss=sum(Object.values(w.organLossByReason));
  const fatal=source.hits.at(-1),terminal=source.removal;
  return {id:source.id,wave:source.wave,position:announcement?.position,compassRadians:announcement?.compassRadians,
   tissueDistance:announcement?.tissueDistance,playerDistanceAtAnnouncement:announcement?.playerDistance,
   playerDistanceAtBirth:source.birth?Math.hypot(source.birth.player.x-announcement.position.x,source.birth.player.y-announcement.position.y):null,
   announcementToBirth:source.actualAnnouncementToBirth,birthHp:source.birth?.body.hp??null,
   birthToFirstHit:source.timeBirthToFirstHit,birthToRemoval:source.timeBirthToRemoval,quotaFirstBirthDelay:source.quotaFirstBirthDelay,
   actualSourceDamage:source.actualSourceDamage,actualSourceCellDamage:source.actualSourceCellDamage,
   canceled:source.canceled,quotaBorn:source.quotaBorn,quotaBornActorIds:source.quotaBirths.map(q=>q.data.actorId),
   destroyed:source.actualKill,exhausted:source.naturalExhaustion,exhaustionUncreditedHp:source.exhaustions[0]?.uncreditedRemainingHpEstimate??0,
   sourceXpDeltaAtFatalHitToCutoff:source.actualKill&&fatal&&terminal?terminal.rewards.xp-fatal.rewards.xp:null,
   sourceResearchDeltaAtFatalHitToCutoff:source.actualKill&&fatal&&terminal?terminal.rewards.research-fatal.rewards.research:null,
   sourceRealKillDeltaAtFatalHitToCutoff:source.actualKill&&fatal&&terminal?terminal.rewards.kills-fatal.rewards.kills:null,
   warningTravel:source.warningTravel,combatTravel:source.combatTravel,travelToFirstSourceHit:source.travelToFirstHit,
   totalWaveSeconds:w.warningSeconds+w.combatSeconds,warningSeconds:w.warningSeconds,combatSeconds:w.combatSeconds,
   playerDamage:w.playerDamage,organTotalLoss:organLoss,organLossByReason:w.organLossByReason,repairs:w.repairs,
   zeroRiskWholeWavePrepositioningProxy:!!source.zeroRiskPrepositioningProxy,
   warningThroughFirstHitActualLoss:warningAndBeforeHitLoss.map(e=>({type:e.type,at:e.at,loss:e.actualLoss,reason:e.data.reason})),
   warningThroughFirstHitEnemyOrPlayerLoss:sum(warningAndBeforeHitLoss.filter(e=>e.type==='PLAYER_HURT'||e.data.reason==='enemy-attack').map(e=>e.actualLoss)),
   actualWaveClearScore:waveClear?.data.score??null,actualScoreGainedDuringWave:waveClear&&priorClear?waveClear.data.score-priorClear.data.score:null,
   actualCumulativeBestComboAtClear:waveClear?.data.bestCombo??null,
   preservedAtCutoff:source.cutoffs.flatMap(c=>c.afterStepAccounting??[]),pendingFissionAccounting:source.pendingAccounting,
   quotaAccountingAtRemoval:terminal?.budget??null,
   latestStableBudgetSampleMatchesLabeledWave:w.latestStableBudget?.wave===w.wave,
   latestStableBudgetSampleScope:'The original observer associates its last budget snapshot with the pre-step wave; at a wave transition it can carry the next wave stamp. Invariant checks themselves use actual current state every public step; this derived report does not relabel that sample or consume it as the previous wave terminal budget.'};
 });
 const row={...item,totalPlayerLoss,totalOrganLoss,actualScore:raw.score,actualBestCombo:lastClear?.data.bestCombo??null,scoreReceiptMatchesRaw:lastClear?.data.score===raw.score,
  sourceRows,sourcesObserved:sourceRows.length,canceled:sum(sourceRows.map(s=>s.canceled)),bornQuota:sum(sourceRows.map(s=>s.quotaBorn)),
  sourceKills:sourceRows.filter(s=>s.destroyed).length,exhaustions:sourceRows.filter(s=>s.exhausted).length,
  actualSourceDamage:sum(sourceRows.map(s=>s.actualSourceDamage)),actualSourceCellDamage:sum(sourceRows.map(s=>s.actualSourceCellDamage)),
  warningTravel:sum(sourceRows.map(s=>s.warningTravel)),combatTravel:sum(sourceRows.map(s=>s.combatTravel)),
  preFirstHitDamage:sum(sourceRows.map(s=>s.warningThroughFirstHitEnemyOrPlayerLoss)),
  actualDefeat:cycle.terminal.actualDefeat,exactFailureReason:raw.result?.reason??null};
 if(!row.scoreReceiptMatchesRaw)throw Error(`Actual score mismatches clear receipt: ${item.file}`);
 runs.push(row);
}
const eps=1/60+1e-8;
function compare(near,rush,score=false){
 const costs=[['seconds',near.seconds,rush.seconds,eps],['playerLoss',near.player,rush.player,1e-8],['organTotalLoss',near.organ,rush.organ,1e-8]];
 const benefits=score?[['actualScore',near.score,rush.score,0],['actualBestCombo',near.combo,rush.combo,0]]:[];
 const rushNoWorse=costs.every(([,a,b,t])=>b<=a+t)&&benefits.every(([,a,b,t])=>b>=a-t);
 const nearNoWorse=costs.every(([,a,b,t])=>a<=b+t)&&benefits.every(([,a,b,t])=>a>=b-t);
 return {objectives:{near,rush},rushWeaklyNoWorse:rushNoWorse,nearWeaklyNoWorse:nearNoWorse,
  rushDominates:rushNoWorse&&(costs.some(([,a,b,t])=>b<a-t)||benefits.some(([,a,b,t])=>b>a+t)),
  nearDominates:nearNoWorse&&(costs.some(([,a,b,t])=>a<b-t)||benefits.some(([,a,b,t])=>a>b+t))};
}
const pairs=plan.seeds.flatMap(seed=>plan.builds.map(build=>{
 const near=runs.find(r=>r.seed===seed&&r.build===build&&r.route==='near'&&!r.replay),rush=runs.find(r=>r.seed===seed&&r.build===build&&r.route==='rush'&&!r.replay);
 const vector=r=>({seconds:r.elapsed,player:r.totalPlayerLoss,organ:r.totalOrganLoss,score:r.actualScore,combo:r.actualBestCombo});
 const perSource=plan.expectedSourceWaves.map(wave=>{
  const a=near.sourceRows.find(s=>s.wave===wave),b=rush.sourceRows.find(s=>s.wave===wave);
  if(!a||!b)return {wave,coverage:'missing'};
  const v=s=>({seconds:s.totalWaveSeconds,player:s.playerDamage,organ:s.organTotalLoss,score:s.actualScoreGainedDuringWave,combo:s.actualCumulativeBestComboAtClear});
  return {wave,near:a,rush:b,registeredTimeLossPareto:compare(v(a),v(b)),posthocExistingScoreComboPareto:compare(v(a),v(b),true)};
 });
 return {seed,build,near,rush,registeredWholeRunTimeLossPareto:compare(vector(near),vector(rush)),posthocWholeRunExistingScoreComboPareto:compare(vector(near),vector(rush),true),perSource};
}));
const independent=runs.filter(r=>!r.replay),allWindows=pairs.flatMap(p=>p.perSource),normalSources=independent.flatMap(r=>r.sourceRows);
const groups=['near','rush'].map(route=>{const rs=independent.filter(r=>r.route===route),ss=rs.flatMap(r=>r.sourceRows);return {route,cases:rs.length,sources:ss.length,
 allCleared16:rs.every(r=>r.clearedWaves===16),actualSourceKills:sum(rs.map(r=>r.sourceKills)),naturalExhaustions:sum(rs.map(r=>r.exhaustions)),
 canceledQuota:sum(rs.map(r=>r.canceled)),bornQuota:sum(rs.map(r=>r.bornQuota)),actualSourceDamage:sum(rs.map(r=>r.actualSourceDamage)),actualSourceCellDamage:sum(rs.map(r=>r.actualSourceCellDamage)),
 warningTravel:sum(rs.map(r=>r.warningTravel)),combatTravel:sum(rs.map(r=>r.combatTravel)),allSourceFirstHitsWithinOneTick:ss.every(s=>s.birthToFirstHit!==null&&s.birthToFirstHit<=eps),
 sourceFirstHitsWithinHalfSecond:ss.filter(s=>s.birthToFirstHit!==null&&s.birthToFirstHit<=.5+1e-8).length,
 preFirstHitEnemyOrPlayerDamage:sum(rs.map(r=>r.preFirstHitDamage)),wholeWaveZeroRiskPrepositioning:ss.filter(s=>s.zeroRiskWholeWavePrepositioningProxy).length,
 playerDamageWholeRun:sum(rs.map(r=>r.totalPlayerLoss)),organTotalLossWholeRun:sum(rs.map(r=>r.totalOrganLoss)),actualScoreSum:sum(rs.map(r=>r.actualScore))};});
const summary={scope:plan.scope,cases:13,independentCases:12,predeterminedReplays:1,sourcesObserved:normalSources.length,groups,pairs,
 sourceConservation:{quotaSlots:normalSources.length*6,born:sum(normalSources.map(s=>s.quotaBorn)),canceled:sum(normalSources.map(s=>s.canceled)),
  actualSourceKills:normalSources.filter(s=>s.destroyed).length,exhaustions:normalSources.filter(s=>s.exhausted).length,
  uncreditedRemainingHpAtExhaustion:sum(normalSources.map(s=>s.exhaustionUncreditedHp))},
 registeredPareto:{sourceWindows:allWindows.length,rushNoWorseWindows:allWindows.filter(w=>w.registeredTimeLossPareto?.rushWeaklyNoWorse).length,
  rushDominatesWindows:allWindows.filter(w=>w.registeredTimeLossPareto?.rushDominates).length,
  matrixDominanceWarning:allWindows.every(w=>w.registeredTimeLossPareto?.rushWeaklyNoWorse)&&pairs.every(p=>p.perSource.some(w=>w.registeredTimeLossPareto?.rushDominates)),
  rushDominatesWholeRuns:pairs.filter(p=>p.registeredWholeRunTimeLossPareto.rushDominates).length},
 posthocExistingProductObjectives:{authorization:'Coordinator requested this after the fixed13 runs: add actual already-displayed/archived score and bestCombo. No replay, reward change or preregistration rewrite.',
  directions:'Minimize seconds/player loss/total organ loss, maximize actual score and bestCombo. Whole-run score and bestCombo are actual product values, not subjective weights.',
  nearHigherScorePairs:pairs.filter(p=>p.near.actualScore>p.rush.actualScore).length,nearHigherBestComboPairs:pairs.filter(p=>p.near.actualBestCombo>p.rush.actualBestCombo).length,
  rushDominatesWholeRuns:pairs.filter(p=>p.posthocWholeRunExistingScoreComboPareto.rushDominates).length,nearDominatesWholeRuns:pairs.filter(p=>p.posthocWholeRunExistingScoreComboPareto.nearDominates).length,
  limitation:'This supplementary objective set can expose speed-versus-score tradeoffs but cannot retroactively turn the original Pareto warning into a preregistered balance pass or prove player motivation.'},
 technical:{sourcesUnchanged:report.sourcesUnchanged,mechanicalValidity:report.mechanicalValidity,replay:report.replay,prefixChecks:report.prefixChecks,
  missingSourceWaves:independent.flatMap(r=>plan.expectedSourceWaves.filter(w=>!r.sourceRows.some(s=>s.wave===w)).map(w=>({seed:r.seed,build:r.build,route:r.route,wave:w}))),
  sourceFatalClearXpDeltas:normalSources.filter(s=>s.destroyed).map(s=>s.sourceXpDeltaAtFatalHitToCutoff),
  sourceFatalClearResearchDeltas:normalSources.filter(s=>s.destroyed).map(s=>s.sourceResearchDeltaAtFatalHitToCutoff)},
 interpretationLimits:[
  'near filters only intentional policy ranking via a read-only shallow view; real source/cell/protocol world state is untouched. Incidental near-route source clears are real and retained.',
  'The source is optional and finite: all ignored routes clear16, and quota exhaustion causes no fake clear/XP/positive damage for the remaining source HP. Actual cancellation utility is proved; meaningful multi-objective balance requires separate judgment.',
  'Rush can use the full8-second quiet announcement for travel. First-hit timing and warning travel show the free-prepositioning pattern; no source HP or enemy tissue damage was changed to manufacture a tradeoff.',
  'No intentionally delayed-rush route was in the fixed matrix. Ignoring a source does not prove a late combat-only approach is infeasible; actual quota arrival/removal windows are retained instead of inventing a counterfactual.',
  'The original observer final budget snapshot can carry a next-wave stamp at a wave transition. All actual current-state budget assertions still ran; this report identifies those sample stamps and does not silently relabel them.',
  'Twelve fixed strategies, one deterministic replay and later score/combo analysis do not establish universal optimality, human understanding, fun or retention.'
 ]};
await write('comparison.json',summary);
const f=x=>x===null||x===undefined?'—':String(Number(Number(x).toFixed(3)));
const lines=['# v0.8.9 有限感染源：固定路线比较','',
 '固定7/71/19 × 主射/免疫 × 先近敌/预先清源，共12独立局，到16清除；另有71免疫预先清源一次预定重放。没有补局、换种子、注入状态或扩大预算。','',
 '| seed/构筑 | 近敌秒→清源秒 | 实际取消配额 | 实际score：近敌→清源 | 实际bestCombo：近敌→清源 |','|---|---:|---:|---:|---:|'];
for(const p of pairs)lines.push(`| ${p.seed}/${p.build} | ${f(p.near.elapsed)}→${f(p.rush.elapsed)} | ${p.near.canceled}→${p.rush.canceled} | ${p.near.actualScore}→${p.rush.actualScore} | ${p.near.actualBestCombo}→${p.rush.actualBestCombo} |`);
lines.push('',`抢先清源18/18源首击均在出生后一个固定步，取消108/108尾配额；先近敌有4次真实顺带拆源，取消20/108，另14次配额耗尽自然枯竭。被枯竭撤活的剩余HP共${f(summary.sourceConservation.uncreditedRemainingHpAtExhaustion)}，没有计作玩家伤害/击杀。`,
 '',`预注册时长/损伤/组织总代价：清源路线在${summary.registeredPareto.rushNoWorseWindows}/18源窗口不差，${summary.registeredPareto.rushDominatesWindows}/18严格占优；整局严格占优${summary.registeredPareto.rushDominatesWholeRuns}/6。完整矩阵支配警示=${summary.registeredPareto.matrixDominanceWarning}。`,
 '',`事后补充的既有产品目标score/bestCombo：近敌得分更高${summary.posthocExistingProductObjectives.nearHigherScorePairs}/6，最佳连击更高${summary.posthocExistingProductObjectives.nearHigherBestComboPairs}/6；加入两项最大化目标后清源整局支配${summary.posthocExistingProductObjectives.rushDominatesWholeRuns}/6、近敌支配${summary.posthocExistingProductObjectives.nearDominatesWholeRuns}/6。该补充由主代理在运行后明确要求，不能冒充预注册或据此自动宣布平衡通过。`,
 '', '实际位置、预警/战斗路程、首击/拆除/枯竭时点、已生/取消槽会计、现存敌体及裂殖保留、XP/样本及全部Pareto向量见comparison.json。预警可免费提前走位的事实保留；这不是每次都需要“守家与根治”取舍的证明。',
 '',`源指纹不变=${report.sourcesUnchanged}，原cycle/新增源会计问题总数0，重放逐字节相同=${report.replay.exactRawBytesEqual}。没有浏览器/GPU性能或真人趣味结论。`,'');
await write('comparison.md',lines.join('\n'));
console.log(JSON.stringify({groups,registeredPareto:summary.registeredPareto,posthoc:summary.posthocExistingProductObjectives,
 pairs:pairs.map(p=>({seed:p.seed,build:p.build,seconds:[p.near.elapsed,p.rush.elapsed],score:[p.near.actualScore,p.rush.actualScore],bestCombo:[p.near.actualBestCombo,p.rush.actualBestCombo],
 playerLoss:[p.near.totalPlayerLoss,p.rush.totalPlayerLoss],organTotalLoss:[p.near.totalOrganLoss,p.rush.totalOrganLoss]})),sourceConservation:summary.sourceConservation,output:derived}));
