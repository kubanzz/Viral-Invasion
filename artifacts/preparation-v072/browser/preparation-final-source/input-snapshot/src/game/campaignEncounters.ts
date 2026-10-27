import { distance, moveWithCollision, normalized, wallHit } from '../actors/collision';
import { BATTLE_BALANCE } from './battleConfig';
import type { OrganId } from './battleTypes';
import type { CampaignCommand, CampaignEncounters, CampaignStageId, CampaignState } from './campaignTypes';
import type { GameEvent, GameState, Target, Vec } from './types';

export const ORGAN_CRISIS_BALANCE = { hp: 68, chargeSeconds: 8, damage: 6, maximumImpacts: 3, maximumGuards: 2 } as const;
export const ORGAN_CRISIS_POSITIONS: Record<OrganId, Vec> = { heart: { x: 1570, y: 790 }, lung: { x: 1210, y: 610 } };
const log = (type: string, data: GameEvent['data']): CampaignCommand => ({ kind: 'log', type, data });
const notice = (text: string, seconds = 6): CampaignCommand => ({ kind: 'notice', text, seconds, priority: 2 });

export function createCampaignEncounters(elapsed: number): CampaignEncounters {
  return { configId: 'campaign-1', stage: 'I', branch: null, currentObjective: '',
    stages: { I: { enteredAt: elapsed, completedAt: null, targetId: null }, II: { enteredAt: null, completedAt: null, targetId: null },
      III: { enteredAt: null, completedAt: null, targetId: null }, IV: { enteredAt: null, completedAt: null, targetId: null }, V: { enteredAt: null, completedAt: null, targetId: 'mother-core' } },
    crisis: { status: 'locked', organId: 'heart', sourceId: 'heart-crisis-source', position: { ...ORGAN_CRISIS_POSITIONS.heart },
      armedAt: null, startedAt: null, clearedAt: null, chargeRemaining: ORGAN_CRISIS_BALANCE.chargeSeconds,
      nextImpactAt: null, lastActiveAt: null, impacts: 0, guardsRequested: false, blockedByAirway: false,
      interruptions: 0, lastInterruptedAt: null, lastInterruptReason: null, acceptedEventKeys: [] } };
}

function completeStage(encounter: CampaignEncounters, stage: CampaignStageId, game: GameState, commands: CampaignCommand[]): void {
  const record = encounter.stages[stage]; if (record.completedAt !== null) return;
  record.completedAt = game.elapsed;
  commands.push(log('CAMPAIGN_STAGE_COMPLETED', { stage, at: game.elapsed, targetId: record.targetId ?? '' }));
}
function enterStage(encounter: CampaignEncounters, stage: CampaignStageId, game: GameState, commands: CampaignCommand[]): void {
  const record = encounter.stages[stage]; if (record.enteredAt !== null) return;
  record.enteredAt = game.elapsed; encounter.stage = stage;
  commands.push(log('CAMPAIGN_STAGE_ENTERED', { stage, at: game.elapsed, targetId: record.targetId ?? '' }));
}
function viable(game: GameState): boolean { return game.phase === 'playing' && game.player.hp > 0 && (game.battle?.pressure.vitality ?? 0) > 0; }

/** Consume only accepted host events. No input intent, label or counter shortcut completes a stage. */
export function recordCampaignEncounterEvent(campaign: CampaignState, event: GameEvent, game: GameState): CampaignCommand[] {
  const encounter = campaign.encounters;
  if (!encounter || !viable(game) || event.tick !== game.tick) return [];
  const commands: CampaignCommand[] = [], crisis = encounter.crisis, data = event.data;
  const organ = data.organId === 'lung' ? 'lung' : data.organId === 'heart' ? 'heart' : game.battle!.organId;
  const id = String(data.nodeId ?? data.id ?? '');
  if (event.type === 'INFECTION_SOURCE_CLEARED' && encounter.stage === 'I' && organ === 'heart' && campaign.requiredSourceIds.heart.includes(id)) {
    encounter.stages.I.targetId = id; completeStage(encounter, 'I', game, commands); enterStage(encounter, 'II', game, commands);
  }
  if (event.type === 'ACTOR_SPAWNED' && id === crisis.sourceId && organ === crisis.organId && crisis.status === 'arming') {
    const actor = campaign.arenas[organ].targets.find(target => target.id === id && target.hp > 0);
    if (actor && campaign.arenas[organ].graph.nodes.some(node => node.id === id && node.active)) {
      crisis.status = 'charging'; crisis.startedAt = game.elapsed; crisis.position = { x: actor.x, y: actor.y };
      crisis.lastActiveAt = game.elapsed; crisis.blockedByAirway = organ === 'lung' && !campaign.arenas.lung.flow!.airwayOpen;
      crisis.nextImpactAt = crisis.blockedByAirway ? null : game.elapsed + crisis.chargeRemaining;
      const tissue = campaign.arenas[organ].tissue;
      commands.push(log('ORGAN_CRISIS_STARTED', { organId: organ, sourceId: id, x: actor.x, y: actor.y, targetX: tissue.x, targetY: tissue.y, chargeSeconds: ORGAN_CRISIS_BALANCE.chargeSeconds, maximumImpacts: ORGAN_CRISIS_BALANCE.maximumImpacts, blockedByAirway: crisis.blockedByAirway }),
        notice(crisis.blockedByAirway ? '肺部传播支点已出现，气道保持关闭，冲击充能暂停。可先用 3 抢修，再用 1/2 净化支点；重新开放气道后充能将继续。'
          : `传播支点正在蓄能：8 秒后冲击${organ === 'heart' ? '心脏' : '肺部'}组织 −6，最多三次。1 远程拆除；${organ === 'heart' ? 'E 定向冲流命中支点可打断蓄能' : 'E 关闭气道可截断蓄能'}。组织危急时可先用 3 抢修。`, 9));
    }
  }
  if (event.type === 'INFECTION_SOURCE_CLEARED' && id === crisis.sourceId && organ === crisis.organId && !['locked', 'cleared'].includes(crisis.status)) {
    crisis.status = 'cleared'; crisis.clearedAt = game.elapsed; crisis.nextImpactAt = null; crisis.lastActiveAt = null;
    commands.push(log('ORGAN_CRISIS_CLEARED', { sourceId: id, organId: organ, impacts: crisis.impacts, interruptions: crisis.interruptions }),
      notice('危机源已净化，组织冲击已停止。继续清理主要感染与精英，准备定位母巢。', 5));
    completeStage(encounter, 'IV', game, commands); enterStage(encounter, 'V', game, commands);
  }
  if (event.type === 'RETEST_COMPLETED' && encounter.stage === 'V' && campaign.core.status === 'cleared') completeStage(encounter, 'V', game, commands);
  if (crisis.status !== 'charging' || game.battle!.organId !== crisis.organId || organ !== crisis.organId) return commands;
  let reason: 'pulse' | 'airway' | null = null;
  if (event.type === 'PULSE_TRIGGERED' && organ === 'heart') {
    const origin = game.battle!.pulse.origin, toward = normalized(crisis.position.x - origin.x, crisis.position.y - origin.y), length = distance(origin, crisis.position);
    const direction = typeof data.direction === 'number' ? data.direction : game.battle!.pulse.direction;
    const range = typeof data.range === 'number' ? data.range : BATTLE_BALANCE.pulseRange;
    const halfAngle = typeof data.halfAngle === 'number' ? data.halfAngle : BATTLE_BALANCE.pulseHalfAngle;
    const block = wallHit(origin, toward, length, campaign.arenas.heart.geometry);
    if (length <= range + 34 && (length <= 34 || toward.x * Math.cos(direction) + toward.y * Math.sin(direction) >= Math.cos(halfAngle)) && (block === null || block >= length - 34)) reason = 'pulse';
  } else if (event.type === 'AIRWAY_CHANGED' && organ === 'lung') {
    crisis.blockedByAirway = !campaign.arenas.lung.flow!.airwayOpen;
    if (data.open === false && crisis.blockedByAirway) reason = 'airway';
    else if (data.open === true && !crisis.blockedByAirway) { crisis.lastActiveAt = game.elapsed; crisis.nextImpactAt = game.elapsed + crisis.chargeRemaining; }
  }
  const key = `${event.type}:${event.tick}`;
  if (reason && !crisis.acceptedEventKeys.includes(key)) {
    crisis.acceptedEventKeys.push(key); if (crisis.acceptedEventKeys.length > 16) crisis.acceptedEventKeys.shift();
    crisis.interruptions++; crisis.lastInterruptedAt = game.elapsed; crisis.lastInterruptReason = reason;
    crisis.chargeRemaining = ORGAN_CRISIS_BALANCE.chargeSeconds; crisis.lastActiveAt = game.elapsed;
    crisis.nextImpactAt = crisis.blockedByAirway ? null : game.elapsed + crisis.chargeRemaining;
    commands.push(log('ORGAN_CRISIS_INTERRUPTED', { sourceId: crisis.sourceId, organId: organ, reason, interruptions: crisis.interruptions, chargeSeconds: crisis.chargeRemaining }),
      notice(reason === 'pulse' ? '冲流已打断支点蓄能，获得完整 8 秒拆除窗口；支点仍需真实净化。' : '气道已截断支点蓄能。保持关闭可先抢修，随后用 1/2 拆除支点。'));
  }
  return commands;
}

/** Active-organ simulation only. Departure and airway closure preserve the remaining charge. */
export function advanceCampaignEncounters(campaign: CampaignState, game: GameState): CampaignCommand[] {
  const encounter = campaign.encounters; if (!encounter || !viable(game)) return [];
  const commands: CampaignCommand[] = [], first = game.battle!.encounter?.firstCounter, crisis = encounter.crisis;
  if (encounter.stage === 'II') {
    encounter.stages.II.targetId = first?.targetId ?? null;
    if (first?.status === 'resolved' && first.targetId && campaign.clearedEliteIds.includes(`heart:${first.targetId}`)) {
      encounter.stages.III.targetId = campaign.migration.id;
      completeStage(encounter, 'II', game, commands); enterStage(encounter, 'III', game, commands);
    }
  }
  if (encounter.stage === 'III' && campaign.migration.status === 'resolved' && campaign.migration.choice !== null) {
    encounter.branch = campaign.migration.choice;
    completeStage(encounter, 'III', game, commands); enterStage(encounter, 'IV', game, commands);
    crisis.status = 'arming'; crisis.organId = campaign.core.organId; crisis.sourceId = `${crisis.organId}-crisis-source`;
    crisis.position = { ...ORGAN_CRISIS_POSITIONS[crisis.organId] }; crisis.armedAt = game.elapsed;
    encounter.stages.IV.targetId = crisis.sourceId;
    if (!campaign.requiredSourceIds[crisis.organId].includes(crisis.sourceId)) campaign.requiredSourceIds[crisis.organId].push(crisis.sourceId);
    commands.push(log('ORGAN_CRISIS_ARMED', { sourceId: crisis.sourceId, organId: crisis.organId, branch: encounter.branch, x: crisis.position.x, y: crisis.position.y }));
  }
  if (crisis.status === 'arming' && crisis.organId === game.battle!.organId) {
    const eventId = `crisis-source:${campaign.seed}:${crisis.organId}`;
    if (!campaign.transactionIds.includes(eventId)) {
      campaign.transactionIds.push(eventId);
      commands.push({ kind: 'spawnSource', organId: crisis.organId, id: crisis.sourceId, position: { ...crisis.position }, hp: ORGAN_CRISIS_BALANCE.hp,
        connectTo: 'tissue', disableSpawn: true, spreadEnabled: false, eventId });
    }
  }
  if (crisis.status !== 'charging') return commands;
  if (game.battle!.organId !== crisis.organId) { crisis.lastActiveAt = null; crisis.nextImpactAt = null; return commands; }
  const actor = campaign.arenas[crisis.organId].targets.find(target => target.id === crisis.sourceId && target.hp > 0);
  if (!actor) { crisis.lastActiveAt = game.elapsed; crisis.nextImpactAt = null; return commands; }
  const delta = crisis.lastActiveAt === null ? 0 : Math.max(0, game.elapsed - crisis.lastActiveAt); crisis.lastActiveAt = game.elapsed;
  crisis.blockedByAirway = crisis.organId === 'lung' && !campaign.arenas.lung.flow!.airwayOpen;
  if (crisis.blockedByAirway) { crisis.nextImpactAt = null; return commands; }
  crisis.chargeRemaining = Math.max(0, crisis.chargeRemaining - delta); crisis.nextImpactAt = game.elapsed + crisis.chargeRemaining;
  if (crisis.chargeRemaining > 1e-9) return commands;
  crisis.impacts++;
  const impactId = `crisis-impact:${campaign.seed}:${crisis.organId}:${crisis.impacts}`;
  commands.push({ kind: 'organDamage', organId: crisis.organId, amount: ORGAN_CRISIS_BALANCE.damage, reason: 'organ-crisis-impact', eventId: impactId },
    log('ORGAN_CRISIS_IMPACT', { sourceId: crisis.sourceId, organId: crisis.organId, impact: crisis.impacts, amount: ORGAN_CRISIS_BALANCE.damage, eventId: impactId }));
  if (!crisis.guardsRequested) {
    crisis.guardsRequested = true;
    const arena = campaign.arenas[crisis.organId], slots = Math.max(0, BATTLE_BALANCE.maxActors - arena.targets.filter(target => target.hp > 0).length);
    for (let index = 0; index < Math.min(ORGAN_CRISIS_BALANCE.maximumGuards, slots); index++) {
      const position = moveWithCollision(crisis.position, { x: index ? 85 : -85, y: 62 }, 22, arena.geometry);
      const guard: Target = { ...position, id: `${crisis.sourceId}:guard:${index}`, kind: 'single', role: 'virus', radius: 22,
        hp: 68, maxHp: 68, traits: [], generation: 0, sourceId: crisis.sourceId, born: game.elapsed, facing: 0,
        hitUntil: 0, scanned: false, attackReady: game.elapsed + 1.5 };
      commands.push({ kind: 'spawnActor', organId: crisis.organId, target: guard, eventId: `${impactId}:guard:${index}` });
    }
  }
  if (crisis.impacts >= ORGAN_CRISIS_BALANCE.maximumImpacts) { crisis.status = 'exhausted'; crisis.nextImpactAt = null; crisis.lastActiveAt = null; }
  else { crisis.chargeRemaining = ORGAN_CRISIS_BALANCE.chargeSeconds; crisis.nextImpactAt = game.elapsed + crisis.chargeRemaining; }
  return commands;
}

export function campaignEncounterObjective(campaign: CampaignState, game: GameState): string {
  const encounter = campaign.encounters!, crisis = encounter.crisis, organ = crisis.organId === 'heart' ? '心脏' : '肺部';
  if (encounter.stage === 'I') return 'Q 诊断感染，1 精确净化首个感染源；组织受损时用 3 修复。首次清源后进入真实变异反制。';
  if (encounter.stage === 'II') return game.battle!.encounter?.firstCounter.status === 'active' ? '清除首次变异精英；读取其特性代价，用基础工具或器官环境完成反制。' : '保持诊断与组织修复，观察首次变异预警；必须清除该次精英才能推进。';
  if (encounter.stage === 'III') return campaign.migration.status === 'pursuing' ? '迁移追击：肺部清除迁移小体或关闭气道截流；这次抉择的结果决定后续危机所在器官。' : ['warning', 'blocking'].includes(campaign.migration.status) ? '12 秒迁移抉择：出口 E 追击；隔离闸 E 停留 2 秒封锁；放任会在肺部立源。' : '诊断第二次变异预警并保护组织，准备跨器官迁移抉择。';
  if (encounter.stage === 'IV') {
    if (game.battle!.organId !== crisis.organId) return `前往${organ}处理传播支点；未进入时蓄能冻结。可先修复当前器官，再从出口 E 前往。`;
    if (crisis.status === 'arming') return `${organ}传播支点正在出现：准备 1 远程净化，或先用 3 抢修组织。`;
    if (crisis.status === 'exhausted') return '支点已耗尽三次冲击，仍需清除才能定位母巢。可先修复，再用 1/2 净化；协议可协助围猎。';
    return `${organ}传播支点 → 组织：${crisis.blockedByAirway ? '气道截流，蓄能暂停' : `${Math.max(0, crisis.chargeRemaining).toFixed(1)} 秒后 −6`}（${crisis.impacts}/3）。1 远程拆除；${crisis.organId === 'heart' ? 'E 冲流对准支点打断' : 'E 关闭气道截流'}，3 可先抢修。`;
  }
  return campaign.core.status === 'cleared' ? '母巢已净化。将所有激活器官恢复至 ≥50%、感染降至 <35%，再到复测终端主动按 E。' : campaign.core.status === 'active' ? '清除本局双特性母巢，观察交替特性与前摇；器官环境和基础工具仍可破解。' : campaign.core.status === 'ready' ? `前往${campaign.core.organId === 'heart' ? '心脏' : '肺部'}复测台按 E，启动双特性母巢诊断。` : `清除其余主要感染源 ${campaign.progress.sourceClears}/${campaign.progress.sourceTotal}、变异精英 ${campaign.progress.eliteClears}/2，定位双特性母巢。`;
}
