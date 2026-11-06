import { distance, normalized, wallHit, moveWithCollision } from '../actors/collision';
import { SeedRng } from '../core/rng';
import type { OrganId } from './battleTypes';
import { activeWorld, isDiagnosticTarget, type GameEvent, type GameState, type Target, type Vec, type WorldGeometry } from './types';
import { GROWTH_BALANCE as B, makeDraftOption, PROTOCOL_IDS, PROTOCOLS, TUNINGS, getBeaconConfig, getChainConfig, getPulseConfig, getTraceConfig, PATROL_CONFIG, protocolRank, PROTOCOL_ACTIONS, chainRicochetPeriod } from './protocols';
import type { DamageOrigin, DraftIntent, DraftOption, DraftResolution, EquippedProtocol, GrowthCommand, GrowthContext, GrowthState, GrowthHistoryEntry, ProtocolDraft, ProtocolId, ProtocolRank, ResearchResult, ResearchDirectionId, ResearchConfirmIntent, ResearchRequestIntent, ResearchRequestResult, ResearchConfirmResult, ResearchCancelResult } from './growthTypes';
import { advanceImmuneCells, redirectImmuneCells, summonImmuneCells, livingImmuneCells, ANTIBODY_BALANCE, IMMUNE_CELL_BALANCE, ENDLESS_IMMUNE_CELL_BALANCE } from './immuneCells';
import { activeImmuneGuard, IMMUNE_FOCUS_BALANCE, IMMUNE_GUARD_BALANCE, selectImmuneGuardCommand, selectImmuneFocusTarget } from './immuneFocus';
import { endlessCombatStats } from './endlessGrowth';
import { availableResearchDirections, RESEARCH_DIRECTIONS } from './research';
import { parsePreparation, preparationForPlan, type RunPreparation } from './preparation';
import { territoryBeaconRank } from './territory';

export type { GrowthCommand, GrowthContext, GrowthState, DamageOrigin, DraftIntent, DraftResolution } from './growthTypes';

export function growthContext(state: GameState): GrowthContext {
  const combat = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth) : undefined;
  return { mission: !!state.expedition?.missionId, hostEvents: state.hostEvents, endless: !!state.endless, territory: state.territory, tick: state.tick, elapsed: state.elapsed, active: state.phase === 'playing', organId: state.battle?.organId ?? 'heart',
    ...(combat ? { immuneRank: state.endlessGrowth!.ranks.immune ?? 0, cellDamageMultiplier: combat.damageMultiplier * combat.cellDamageMultiplier } : {}),
    rhythm: state.battle?.pulse.phase ?? 'rest', deviceOrigin: state.battle?.pulse.origin ?? state.terminal,
    player: state.player, aim: state.battle?.lastAim ?? state.player, tissue: state.tissue, targets: state.targets, tool: state.tool, geometry: activeWorld(state), rhythmCycle: state.battle?.pulse.cycleIndex,
    acceptedMetrics: state.runMetrics, acceptedEvents: state.events };
}

/** Requested protocol logs are not damage receipts. Join the real host hit. */
export function acceptedProtocolHit(event: GameEvent, events: readonly GameEvent[], organId: OrganId): GameEvent | undefined {
  const protocolId = event.type === 'PROTOCOL_RESONANCE_HIT' ? 'PULSE_BREAK'
    : event.type === 'PROTOCOL_CHAIN_HIT' || event.type === 'PROTOCOL_RICOCHET_HIT' ? 'PURIFY_CHAIN' : null;
  const { rootId, targetId, hop } = event.data;
  if (!protocolId || event.data.protocolId !== protocolId || typeof rootId !== 'string' || !rootId
    || typeof targetId !== 'string' || !targetId || event.type === 'PROTOCOL_CHAIN_HIT' && (!Number.isInteger(hop) || Number(hop) < 1 || Number(hop) > 3)) return;
  return events.find(hit => hit.type === 'TARGET_HIT' && hit.tick === event.tick && hit.data.cause === 'protocol'
    && hit.data.protocolId === protocolId && hit.data.rootId === rootId && hit.data.id === targetId && hit.data.organId === organId
    && typeof hit.data.damage === 'number' && Number.isFinite(hit.data.damage) && hit.data.damage > 0);
}
const hashString = (value: string, start = 2166136261): number => {
  let hash = start >>> 0; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0; return hash;
};
const point = (value: Vec): Vec => ({ x: value.x, y: value.y });
const unobstructed = (from: Vec, to: Target, geometry?: WorldGeometry): boolean => {
  const length = distance(from, to), direction = normalized(to.x-from.x,to.y-from.y);
  const wall = wallHit(from,direction,length,geometry); return wall === null || wall >= length-to.radius;
};
const stableNearest = (from: Vec, targets: readonly Target[]): Target[] => [...targets].sort((a,b)=>distance(from,a)-distance(from,b)||(a.id<b.id?-1:a.id>b.id?1:0));
function beaconPosition(context: GrowthContext): Vec {
  if (context.territory) return point(moveWithCollision(context.player, { x: 0, y: 0 }, 12, context.geometry));
  const direction=normalized(context.aim.x-context.player.x,context.aim.y-context.player.y),length=Math.min(B.beaconPlacementRange,distance(context.player,context.aim));
  const wall=wallHit(context.player,direction,length,context.geometry);
  const travel=Math.max(0,Math.min(length,wall===null?length:wall-18));
  return point(moveWithCollision(context.player,{x:direction.x*travel,y:direction.y*travel},12,context.geometry));
}
const SYNERGY_PARTNER: Record<ProtocolId, ProtocolId> = {
  PULSE_BREAK: 'PURIFY_CHAIN', PURIFY_CHAIN: 'PULSE_BREAK', IMMUNE_BEACON: 'EXPOSE_TRACE', EXPOSE_TRACE: 'IMMUNE_BEACON',
};
function calibrationTradeoff(current: EquippedProtocol, next: DraftOption): string {
  const rank=protocolRank(current),change=(name:string,a:number,b:number)=>`${name} ${a} → ${b}`;
  if(current.id==='PULSE_BREAK'){
    const a=getPulseConfig(current.tuning,rank),b=getPulseConfig(next.tuning,rank);
    return [change('装置范围',a.deviceRange,b.deviceRange),change('共振伤害',a.bonusDamage,b.bonusDamage),change('破绽秒数',a.exposeSeconds,b.exposeSeconds)].join('；');
  }
  if(current.id==='PURIFY_CHAIN'){
    const a=getChainConfig(current.tuning,rank),b=getChainConfig(next.tuning,rank);
    return [change('连锁范围',a.range,b.range),change('每跳伤害',a.damage,b.damage)].join('；');
  }
  if(current.id==='IMMUNE_BEACON'){
    const a=getBeaconConfig(current.tuning,rank),b=getBeaconConfig(next.tuning,rank);
    return ['军团常驻至阵亡',change('活动范围',a.radius,b.radius),change('咬击间隔',a.interval,b.interval),change('组织承压',a.tissueCost,b.tissueCost)].join('；');
  }
  const a=getTraceConfig(current.tuning,rank),b=getTraceConfig(next.tuning,rank);
  return [change('显影秒数',a.duration,b.duration),change('减速秒数',a.slowDuration,b.slowDuration),change('敌人移速倍率',a.factor,b.factor)].join('；');
}

/** Independent run-local state. All world mutations return through the host's common damage path. */
export class GrowthController {
  readonly state: GrowthState;
  private acceptedHistoryTick = -1;
  private acceptedHistory = new Map<string, { entry: GrowthHistoryEntry; targets: Set<string>; damage: number; synergy: boolean }>();
  private ricochetTick = -1;
  private acceptedRicochets = 0;
  constructor(seed: number, runId = `${seed >>> 0}:growth`, preparation?: RunPreparation, mode: 'campaign' | 'endless' = 'campaign') {
    const initialPreparation = parsePreparation(preparation) ?? preparationForPlan('field');
    const starter = initialPreparation.starterProtocolId;
    this.state = { runId, seed: seed >>> 0, lastElapsed: 0, xp: 0, level: 0, nextXp: mode === 'endless' ? null : B.xpThresholds[0], research: 0,
      preparation: initialPreparation, starterDebt: starter && mode !== 'endless' ? 1 : 0, carriedProtocols: starter ? [starter] : [],
      equipped: starter ? [{ id: starter, tuning: 'balanced' }] : [], draft: null, pendingLevels: [], consumedDraftIds: [], rewardedKeys: [], sourceKillCounts: {},
      lastMilestoneWave: 0, nextMilestoneWave: null,
      damageTakenByOrgan: { heart: 0, lung: 0 }, protectionNeeded: { heart: false, lung: false },
      draftSerial: 0, historyHash: 2166136261, ended: false, pendingResearch: null, researchSerial: 0,
      beacon: null, beacons: [], beaconReadyAt: 0, cells: [], antibodyCharges: ANTIBODY_BALANCE.charges, antibodySerial: 0,
      activations: {}, marks: [], resonance: [], chainRoots: [], protocolHistory: [], pendingLogs: [],
      budgetTick: -1, budgetUsed: 0, skippedCommands: 0 };
    if (starter) {
      if (mode === 'endless') {
        this.log('PROTOCOL_EQUIPPED', { source: 'preparation', protocolId: starter, tuning: 'balanced', rank: 1, slots: 1, actionHint: PROTOCOL_ACTIONS[starter] });
        this.remember('PROTOCOL_EQUIPPED', `${PROTOCOLS[starter].name}：初始预装 Ⅰ · 均衡。`);
        return;
      }
      const title = `${PROTOCOLS[starter].name} Ⅰ · 初始预装`;
      const hint = `${PROTOCOL_ACTIONS[starter]}已预支首份成长，${B.xpThresholds[0]} XP 仅结清；下一份草案 ${B.xpThresholds[1]} XP。`;
      this.state.lastEvolution = { protocolId: starter, rank: 1, until: 8, title, hint };
      this.log('PROTOCOL_EQUIPPED', { source: 'preparation', protocolId: starter, tuning: 'balanced', rank: 1, slots: 1, actionHint: PROTOCOL_ACTIONS[starter] });
      this.log('PREPARATION_APPLIED', { version: initialPreparation.version, starterProtocolId: starter, prepaidChoices: 1, repaymentXp: B.xpThresholds[0], nextDraftXp: B.xpThresholds[1] });
      this.remember('PROTOCOL_EQUIPPED', `${PROTOCOLS[starter].name}：初始预装 Ⅰ · 均衡。`);
      this.remember('PREPARATION_APPLIED', hint);
    }
  }

  private observeTime(elapsed: number): void {
    if(Number.isFinite(elapsed))this.state.lastElapsed=Math.max(this.state.lastElapsed,elapsed);
  }
  private remember(type: string, text: string, at = this.state.lastElapsed): GrowthHistoryEntry {
    const entry = { at, type, text };
    this.state.protocolHistory.push(entry);
    if (this.state.protocolHistory.length > 128) this.state.protocolHistory.shift();
    return entry;
  }
  private recordAcceptedEffect(event: GameEvent, context: GrowthContext | undefined, elapsed: number): void {
    const frame = context?.acceptedMetrics?.frame;
    if (!context || !frame || frame.tick !== event.tick || event.tick < this.acceptedHistoryTick) return;
    if (event.tick !== this.acceptedHistoryTick) { this.acceptedHistoryTick = event.tick; this.acceptedHistory.clear(); }
    const rootId = event.data.rootId;
    if (typeof rootId !== 'string' || !rootId) return;
    if (event.type === 'PROTOCOL_SYNERGY' && event.data.pair === 'PULSE_BREAK+PURIFY_CHAIN') {
      const accepted = this.acceptedHistory.get(`PROTOCOL_CHAIN_HIT:${rootId}`);
      if (accepted && frame.entries.some(entry => entry.kind === 'pulse-chain' && entry.rootId === rootId)) {
        accepted.synergy = true;
        accepted.entry.text = this.actualEffectText('PROTOCOL_CHAIN_HIT', accepted);
      }
      return;
    }
    const hit = acceptedProtocolHit(event, context.acceptedEvents ?? [], context.organId);
    if (!hit) return;
    const kind = event.type === 'PROTOCOL_CHAIN_HIT' ? 'chain' : event.type === 'PROTOCOL_RICOCHET_HIT' ? 'ricochet' : 'resonance';
    if (!frame.entries.some(entry => entry.kind === kind && entry.rootId === rootId && entry.targetId === event.data.targetId && entry.protocolId === hit.data.protocolId)) return;
    const key = `${event.type}:${rootId}`;
    let accepted = this.acceptedHistory.get(key);
    if (!accepted) {
      // The host proof frame is bounded; this map contains at most its accepted roots.
      accepted = { entry: this.remember(event.type, '', elapsed), targets: new Set(), damage: 0, synergy: false };
      this.acceptedHistory.set(key, accepted);
    }
    const targetId = String(event.data.targetId);
    if (accepted.targets.has(targetId)) return;
    accepted.targets.add(targetId); accepted.damage += Number(hit.data.damage);
    if (!this.state.protocolHistory.includes(accepted.entry)) accepted.entry = this.remember(event.type, '', elapsed);
    accepted.entry.text = this.actualEffectText(event.type, accepted);
  }
  private actualEffectText(type: string, accepted: { targets: Set<string>; damage: number; synergy: boolean }): string {
    const damage = Number(accepted.damage.toFixed(2)), count = accepted.targets.size;
    if (type === 'PROTOCOL_CHAIN_HIT') return `${accepted.synergy ? '共振联动 · ' : ''}连锁净化：实际命中 ${count} 跳，共 ${damage} 点伤害。`;
    if (type === 'PROTOCOL_RICOCHET_HIT') return `连锁进阶：实际折射 ${count} 体，共 ${damage} 点伤害。`;
    return `节律共振：实际追加 ${damage} 点伤害（${count} 体）。`;
  }
  private log(type: string, data: GameEvent['data']): void { this.state.pendingLogs.push({ type, data }); }
  private equipped(id: ProtocolId): EquippedProtocol | undefined { return this.state.equipped.find(slot=>slot.id===id); }
  private ensureTerritoryBeacon(context: GrowthContext): void {
    if(!context.territory||context.mission)return;
    const s=this.state;s.territoryBeaconRequired=true;
    const slot=this.equipped('IMMUNE_BEACON');
    // Production heart sessions pre-equip this slot. Missing-slot unit fixtures
    // retain their explicit one-cell patrol rather than inventing hidden gear.
    if(slot)slot.rank=territoryBeaconRank({territory:context.territory,growth:s});
  }
  private activated(id: ProtocolId): void {
    this.state.activations ??= {};
    this.state.activations[id] = (this.state.activations[id] ?? 0) + 1;
  }
  private award(key: string, xp: number, research: number, elapsed: number): void {
    const s=this.state; if(s.rewardedKeys.includes(key))return;
    s.rewardedKeys.push(key);s.xp+=xp;s.research+=research;
    this.log('GROWTH_REWARD',{key,xp,research,totalXp:s.xp,totalResearch:s.research});
    this.remember('GROWTH_REWARD',`研究证据 +${research}，经验 +${xp}。`,elapsed);
    while(s.level<B.xpThresholds.length&&s.xp>=B.xpThresholds[s.level]) {
      ++s.level;this.log('GROWTH_LEVEL_GAINED',{level:s.level,xp:s.xp});
      if (s.starterDebt === 1) {
        s.starterDebt = 0;
        const nextDraftXp = B.xpThresholds[s.level] ?? null;
        this.log('PREPARATION_REPAID', { level: s.level, xp: s.xp, nextDraftXp });
        this.remember('PREPARATION_REPAID', `已用本次成长结清初始预装；经验保留 ${s.xp}。${nextDraftXp === null ? '本局经验成长已全部完成。' : s.xp >= nextDraftXp ? `下一份草案阈值 ${nextDraftXp} XP 已达到，将照常排队。` : `下一份草案 ${nextDraftXp} XP。`}`, elapsed);
      } else s.pendingLevels.push(s.level);
    }
    s.nextXp=B.xpThresholds[s.level]??null;
  }

  /** Accept only real accepted events. Keys live independently of the bounded diagnostic event log. */
  recordEvent(event: GameEvent, context?: GrowthContext): void {
    const s=this.state, data=event.data, elapsed=context?.elapsed??event.tick/60;
    if(context?.territory)this.ensureTerritoryBeacon(context);
    this.observeTime(elapsed);
    if(event.type==='RUN_ENDED') { s.ended=true;s.draft=null;s.pendingResearch=null;s.pendingLevels=[];s.nextMilestoneWave=null;s.beacon=null;s.beacons=[];s.cells=[];s.marks=[];s.resonance=[];this.acceptedHistory.clear();return; }
    if(s.ended)return;
    this.recordAcceptedEffect(event, context, elapsed);
    if (data.suppressRewards === true) return;
    // Continuous challenges reward completed waves. Per-actor reward ledgers
    // belong to the finite campaign and must not grow with an endless run.
    if (context?.endless) return;
    const organ:OrganId=data.organId==='lung'?'lung':data.organId==='heart'?'heart':context?.organId??'heart';
    if(event.type==='INFECTION_SOURCE_CLEARED') {
      const id=String(data.nodeId??data.id??'');if(id)this.award(`source:${organ}:${id}`,20,2,elapsed);
    } else if(event.type==='ELITE_CLEARED') {
      const id=String(data.id??'');if(id)this.award(`elite:${organ}:${id}`,30,2,elapsed);
    } else if(event.type==='TARGET_CLEARED') {
      const id=String(data.id??'');if(!id)return;
      const target=context?.targets.find(t=>t.id===id);
      const role=data.role??target?.role;
      if(role==='source'||role==='elite'||role==='core'||role==='event'||Number(data.generation??target?.generation??0)>0)return;
      const key=`ordinary:${organ}:${id}`;
      if(s.rewardedKeys.includes(key))return;
      const source=`${organ}:${String(data.sourceId??target?.sourceId??'ambient')}`;
      const count=s.sourceKillCounts[source]??0;if(count>=3)return;
      s.sourceKillCounts[source]=count+1;this.award(key,[4,2,1][count],0,elapsed);
    } else if(event.type==='BATTLE_DIAGNOSED') {
      const found=context?.targets.filter(t=>isDiagnosticTarget(t)&&t.hp>0&&distance(context.player,t)<=B.scanRadius)??[];
      // Live context is authoritative: a stale event count cannot turn an event
      // objective into virus discovery evidence. Context-free historical callers
      // retain their existing count-based baseline reward.
      if(context?found.length>0:Number(data.count)>0)this.award('diagnose:baseline',6,1,elapsed);
      for(const trait of new Set(found.flatMap(t=>t.traits??[])))this.award(`diagnose:${trait}`,8,2,elapsed);
    } else if(event.type==='ORGAN_INTEGRITY_CHANGED') {
      const before=Number(data.before),after=Number(data.after);
      if(!Number.isFinite(before)||!Number.isFinite(after))return;
      if(data.reason==='enemy-attack'||data.reason==='infection') {
        s.damageTakenByOrgan[organ]+=Math.max(0,before-after);
        if(after<30)s.protectionNeeded[organ]=true;
      }
      if(data.reason==='repair'&&after>before&&after>=50&&s.protectionNeeded[organ]&&s.damageTakenByOrgan[organ]>=15) {
        s.protectionNeeded[organ]=false;this.award(`protect:${organ}`,15,1,elapsed);
      }
    }
  }

  rewardEndlessWave(wave: number, elapsed: number): void {
    // Kept as a compatibility entry point. Combat growth owns every clear;
    // protocols now arrive only from explicit fifth-wave milestone rewards.
    void wave; void elapsed;
  }

  /** The host calls once per fifth clear. Pending consecutive milestones use two numbers. */
  rewardEndlessMilestone(wave: number, context: GrowthContext): void {
    const s=this.state, last=s.lastMilestoneWave??0;
    if(s.ended||context.mission||!context.active||!context.endless||!Number.isSafeInteger(wave)||wave<5||wave%5!==0||wave<=last)return;
    // A paused run cannot earn another wave. While a reward is waiting, only the
    // next consecutive milestone can extend its compact queue; gaps are not invented.
    if(s.nextMilestoneWave!=null&&wave!==last+5)return;
    this.observeTime(context.elapsed);
    s.nextMilestoneWave??=wave;s.lastMilestoneWave=wave;
    this.log('ENDLESS_PROTOCOL_REWARD_QUEUED',{wave,cost:0});
    this.openNextLevel();
  }

  private shuffled<T>(values: readonly T[], rng: SeedRng): T[] {
    const result=[...values];for(let i=result.length-1;i>0;i--){const j=rng.int(0,i);[result[i],result[j]]=[result[j],result[i]];}return result;
  }
  private createDraft(source: ProtocolDraft['source'], level?: number, researchDirection?: ResearchDirectionId, requestId?: string, endlessWave?: number): ProtocolDraft {
    const s=this.state, serial=++s.draftSerial;
    const equipment=s.equipped.map(slot=>`${slot.id}:${slot.tuning}:${protocolRank(slot)}`).sort().join('|');
    const focusHash=source==='endless'?hashString(`endless:${endlessWave}`):source==='research'&&researchDirection&&researchDirection!=='general'?hashString(`research:${researchDirection}`):0;
    const rng=new SeedRng((s.seed^Math.imul(serial,0x9e3779b1)^hashString(equipment,s.historyHash)^focusHash)>>>0);
    const newOptions:DraftOption[]=[],retunes:DraftOption[]=[];
    for(const id of PROTOCOL_IDS) {
      const current=this.equipped(id);
      if(!current)newOptions.push(makeDraftOption(id,'balanced','equip'));
      else if (protocolRank(current) < B.maxRank) retunes.push(makeDraftOption(id,current.tuning,'retune',(protocolRank(current)+1) as ProtocolRank,current));
      else {
        const options=TUNINGS.filter(tuning=>tuning!==current.tuning),index=source==='endless'?(Math.floor((endlessWave??5)/5)+s.seed)%options.length:rng.int(0,options.length-1);
        const option=makeDraftOption(id,options[index],'retune',protocolRank(current),current);
        if(source==='endless')option.change+=` 取舍：${calibrationTradeoff(current,option)}。`;
        retunes.push(option);
      }
    }
    const shuffledNew=this.shuffled(newOptions,rng);
    // The opening presents different attack loops, including an immediately usable summon.
    const opening=s.equipped.length===0&&serial===1;
    const firstChoices=opening?[shuffledNew.find(o=>o.protocolId==='IMMUNE_BEACON')!,shuffledNew.find(o=>o.protocolId==='PURIFY_CHAIN')!,shuffledNew.find(o=>o.protocolId!=='IMMUNE_BEACON'&&o.protocolId!=='PURIFY_CHAIN')!]:shuffledNew;
    let ordered:DraftOption[];
    const upgrades=retunes.filter(option=>(option.rank??1)>protocolRank(this.equipped(option.protocolId)));
    if(source==='endless'){
      const pool=[...newOptions,...retunes];
      const missing=[...new Set(s.equipped.map(slot=>SYNERGY_PARTNER[slot.id]).filter(id=>!this.equipped(id)))];
      const partners=this.shuffled(missing,rng).map(id=>pool.find(option=>option.protocolId===id)!);
      const selected=new Set(partners.map(option=>option.protocolId));
      const upgrade=this.shuffled(upgrades.filter(option=>!selected.has(option.protocolId)),rng)[0];
      if(upgrade&&partners.length<3){partners.push(upgrade);selected.add(upgrade.protocolId);}
      ordered=[...partners,...this.shuffled(pool.filter(option=>!selected.has(option.protocolId)),rng)].slice(0,3);
    }else if(source==='research'&&researchDirection&&researchDirection!=='general'){
      const info=RESEARCH_DIRECTIONS[researchDirection],pool=[...newOptions,...retunes];
      const guaranteed=[info.primary!,info.partner!].map(id=>pool.find(option=>option.protocolId===id)!);
      const ids=new Set(guaranteed.map(option=>option.protocolId));
      ordered=[...guaranteed,...this.shuffled(pool.filter(option=>!ids.has(option.protocolId)),rng).slice(0,1)];
    }else if(!opening&&upgrades.length){
      // After the first acquisition, every draft teaches that an existing route
      // can evolve. Keep a new route alongside it whenever one remains available.
      const guaranteed=[this.shuffled(upgrades,rng)[0],...(shuffledNew.length?[shuffledNew[0]]:[])];
      const selected=new Set(guaranteed.map(option=>option.protocolId));
      ordered=[...guaranteed,...this.shuffled([...newOptions,...retunes].filter(option=>!selected.has(option.protocolId)),rng)].slice(0,3);
    }else ordered=[...firstChoices,...this.shuffled(retunes,rng)].slice(0,3);
    if(ordered.length!==3)throw new Error('Protocol candidate pool must provide three legal distinct choices');
    const options=this.shuffled(ordered,rng) as ProtocolDraft['options'];
    const draft:ProtocolDraft={id:`${s.runId}:draft:${serial}`,source,serial,level,options,status:'choosing',...(source==='endless'?{endlessWave}:{}),...(source==='research'&&researchDirection?{researchDirection}:{})};
    s.draft=draft;this.log('PROTOCOL_DRAFT_OPENED',{draftId:draft.id,source,serial,level:level??0,...(source==='endless'?{wave:endlessWave??0,cost:0}:{}),...(source==='research'?{researchDirection:researchDirection??'general',...(requestId?{requestId}:{})}:{})});
    if(source==='research')this.remember('PROTOCOL_DRAFT_OPENED',`${RESEARCH_DIRECTIONS[researchDirection??'general'].title}：三种不同协议候选已就绪，可新装、进阶或改造。`);
    if(source==='endless')this.remember('PROTOCOL_DRAFT_OPENED',`第 ${endlessWave} 波联动重配：免样本，可放弃；三槽内补齐联动、进阶或改变取向，战斗进化照常获得。`);
    return draft;
  }
  private openNextLevel(): void {
    const s=this.state;
    if(s.draft||s.pendingResearch||s.ended)return;
    if(s.pendingLevels.length){this.createDraft('xp',s.pendingLevels.shift()!);return;}
    if(s.nextMilestoneWave!=null){
      const wave=s.nextMilestoneWave;
      s.nextMilestoneWave=wave<(s.lastMilestoneWave??0)?wave+5:null;
      this.createDraft('endless',undefined,undefined,undefined,wave);
    }
  }
  requestResearch(nodeId: string, context: GrowthContext): ResearchRequestResult {
    this.observeTime(context.elapsed);
    const s=this.state;
    if(s.ended||context.mission||!context.active)return{kind:'rejected',reason:'run-inactive'};
    this.openNextLevel();
    if(s.draft)return{kind:'rejected',reason:'draft-active'};
    if(s.pendingResearch)return{kind:'rejected',reason:'research-pending'};
    if(!Number.isFinite(s.research)||s.research<B.researchCost)return{kind:'rejected',reason:'insufficient-samples',missing:B.researchCost-s.research};
    const serial=(s.researchSerial??0)+1;s.researchSerial=serial;
    const offer={id:`${s.runId}:research:${serial}`,runId:s.runId,nodeId,organId:context.organId,directions:availableResearchDirections(s.rewardedKeys)};
    s.pendingResearch=offer;
    this.log('RESEARCH_REQUESTED',{requestId:offer.id,nodeId,organId:offer.organId,directions:offer.directions.join(','),cost:B.researchCost});
    this.remember('RESEARCH_REQUESTED','研究方向待确认：仅实际诊断的变异可作定向依据，确认前不消耗样本。');
    return{kind:'requested',requestId:offer.id};
  }
  confirmResearch(intent: ResearchConfirmIntent): ResearchConfirmResult {
    const s=this.state,offer=s.pendingResearch;
    if(s.ended)return{kind:'rejected',reason:'run-inactive'};
    if(intent.runId!==s.runId||!offer||offer.runId!==intent.runId||offer.id!==intent.requestId)return{kind:'rejected',reason:'stale-request-or-run'};
    if(s.draft)return{kind:'rejected',reason:'draft-active'};
    if(!offer.directions.includes(intent.direction))return{kind:'rejected',reason:'invalid-direction'};
    if(!Number.isFinite(s.research)||s.research<B.researchCost)return{kind:'rejected',reason:'insufficient-samples',missing:B.researchCost-s.research};
    s.research-=B.researchCost;s.pendingResearch=null;
    this.log('RESEARCH_CONFIRMED',{requestId:offer.id,nodeId:offer.nodeId,organId:offer.organId,researchDirection:intent.direction,cost:B.researchCost});
    const draft=this.createDraft('research',undefined,intent.direction,offer.id);
    this.log('RESEARCH_SPENT',{requestId:offer.id,nodeId:offer.nodeId,organId:offer.organId,researchDirection:intent.direction,cost:B.researchCost,draftId:draft.id,remaining:s.research});
    this.remember('RESEARCH_CONFIRMED',`选择${RESEARCH_DIRECTIONS[intent.direction].title}，消耗 ${B.researchCost} 样本；生成后放弃不返还。`);
    this.remember('RESEARCH_SPENT',`样本 −${B.researchCost}，剩余 ${s.research}；${RESEARCH_DIRECTIONS[intent.direction].title}草案已生成。`);
    return{kind:'opened',draftId:draft.id,cost:B.researchCost,requestId:offer.id};
  }
  cancelResearch(intent: ResearchRequestIntent): ResearchCancelResult {
    const s=this.state,offer=s.pendingResearch;
    if(s.ended)return{kind:'rejected',reason:'run-inactive'};
    if(intent.runId!==s.runId||!offer||offer.runId!==intent.runId||offer.id!==intent.requestId)return{kind:'rejected',reason:'stale-request-or-run'};
    s.pendingResearch=null;
    this.log('RESEARCH_CANCELLED',{requestId:offer.id,nodeId:offer.nodeId,organId:offer.organId,cost:0});
    this.remember('RESEARCH_CANCELLED','已取消研究方向确认，未消耗样本。');
    this.openNextLevel();
    return{kind:'cancelled',requestId:offer.id,...(s.draft?{nextDraftId:s.draft.id}:{})};
  }
  openResearch(nodeId: string, context: GrowthContext): ResearchResult {
    this.observeTime(context.elapsed);
    const s=this.state;
    if(s.ended||context.mission||!context.active)return{kind:'rejected',reason:'run-inactive'};
    this.openNextLevel();
    if(s.draft||s.pendingResearch)return{kind:'rejected',reason:'draft-active'};
    if(s.research<B.researchCost)return{kind:'rejected',reason:'insufficient-samples',missing:B.researchCost-s.research};
    s.research-=B.researchCost;const draft=this.createDraft('research');
    this.log('RESEARCH_SPENT',{nodeId,cost:B.researchCost,draftId:draft.id,remaining:s.research});
    return{kind:'opened',draftId:draft.id,cost:B.researchCost};
  }
  private currentDraft(draftId: string, runId?: string): ProtocolDraft | undefined {
    const s=this.state;if(s.ended||(runId!==undefined&&runId!==s.runId)||s.consumedDraftIds.includes(draftId)||s.draft?.id!==draftId)return;
    return s.draft;
  }
  private finishDraft(kind:'committed'|'discarded',draft:ProtocolDraft): DraftResolution {
    const s=this.state;s.consumedDraftIds.push(draft.id);s.draft=null;
    if(s.consumedDraftIds.length>128)s.consumedDraftIds.splice(0,s.consumedDraftIds.length-128);
    s.historyHash=hashString(`${kind}:${draft.serial}:${s.equipped.map(e=>`${e.id}:${e.tuning}:${protocolRank(e)}`).join('|')}`,s.historyHash);
    this.log(kind==='committed'?'PROTOCOL_DRAFT_COMMITTED':'PROTOCOL_DRAFT_DISCARDED',{draftId:draft.id,source:draft.source});
    this.openNextLevel();const nextDraft=s.draft as ProtocolDraft|null;return{kind,draftId:draft.id,nextDraftId:nextDraft?.id};
  }
  private cleanupChanged(previous:EquippedProtocol[],next:EquippedProtocol[]): void {
    const changed=(id:ProtocolId)=>{const a=previous.find(p=>p.id===id),b=next.find(p=>p.id===id);return a?.tuning!==b?.tuning||!!a!==!!b||protocolRank(a)!==protocolRank(b);};
    if(changed('EXPOSE_TRACE'))this.state.marks=[];
    if(changed('PULSE_BREAK'))this.state.resonance=[];
    if(changed('PURIFY_CHAIN'))this.state.chainCharge=0;
  }
  chooseDraft(intent:DraftIntent):DraftResolution {
    const draft=this.currentDraft(intent.draftId,intent.runId);
    if(!draft)return{kind:'rejected',reason:'stale-draft-or-run'};
    const option=draft.options.find(item=>item.id===intent.optionId);
    if(!option)return{kind:'rejected',reason:'invalid-option'};
    const s=this.state,previous=s.equipped.map(slot=>({...slot}));
    if(option.kind==='retune') {
      if(draft.status!=='choosing')return{kind:'rejected',reason:'replacement-pending'};
      const index=s.equipped.findIndex(slot=>slot.id===option.protocolId);
      const current=s.equipped[index],rank=option.rank??1;
      if(index<0||rank<protocolRank(current)||rank>Math.min(B.maxRank,protocolRank(current)+1)||current.tuning===option.tuning&&protocolRank(current)===rank)return{kind:'rejected',reason:'option-no-longer-legal'};
      s.equipped[index]={id:option.protocolId,tuning:option.tuning,...(rank>1?{rank}:{})};
    } else if(s.equipped.some(slot=>slot.id===option.protocolId))return{kind:'rejected',reason:'duplicate-protocol'};
    else if(s.equipped.length<B.slots) {
      if(draft.status!=='choosing')return{kind:'rejected',reason:'replacement-pending'};
      s.equipped.push({id:option.protocolId,tuning:option.tuning});
    } else {
      if(draft.status==='choosing') {
        if(intent.slotIndex!==undefined)return{kind:'rejected',reason:'replacement-must-be-confirmed'};
        draft.status='replacing';draft.selectedOptionId=option.id;return{kind:'replace-required',draftId:draft.id};
      }
      if(draft.selectedOptionId!==option.id)return{kind:'rejected',reason:'different-replacement-option'};
      const index=intent.slotIndex;
      if(index===undefined||!Number.isInteger(index)||index<0||index>=B.slots||s.equipped[index]?.id!==intent.expectedPreviousProtocolId)return{kind:'rejected',reason:'invalid-or-stale-slot'};
      if(s.territoryBeaconRequired&&s.equipped[index]?.id==='IMMUNE_BEACON')return{kind:'rejected',reason:'required-territory-protocol'};
      s.equipped[index]={id:option.protocolId,tuning:option.tuning};
    }
    this.cleanupChanged(previous,s.equipped);
    s.carriedProtocols = PROTOCOL_IDS.filter(id => id === option.protocolId || s.carriedProtocols?.includes(id));
    s.lastEvolution={protocolId:option.protocolId,rank:option.rank??1,until:s.lastElapsed+8,title:option.title,hint:option.actionHint??PROTOCOL_ACTIONS[option.protocolId]};
    // Newly evolved Q protocols can be demonstrated on the next accepted scan.
    if(option.protocolId==='IMMUNE_BEACON'||option.protocolId==='EXPOSE_TRACE')s.beaconReadyAt=Math.min(s.beaconReadyAt,s.lastElapsed);
    this.log('PROTOCOL_EQUIPPED',{draftId:draft.id,protocolId:option.protocolId,tuning:option.tuning,rank:option.rank??1,kind:option.kind,slots:s.equipped.length,actionHint:option.actionHint??PROTOCOL_ACTIONS[option.protocolId]});
    this.remember('PROTOCOL_EQUIPPED',`${PROTOCOLS[option.protocolId].name}：${option.title}。`);
    return this.finishDraft('committed',draft);
  }
  discardDraft(draftId:string,runId?:string):DraftResolution {
    const draft=this.currentDraft(draftId,runId);return draft?this.finishDraft('discarded',draft):{kind:'rejected',reason:'stale-draft-or-run'};
  }
  backToDraft(draftId:string,runId?:string):DraftResolution {
    const draft=this.currentDraft(draftId,runId);if(!draft||draft.status!=='replacing')return{kind:'rejected',reason:'no-replacement'};
    draft.status='choosing';delete draft.selectedOptionId;return{kind:'returned',draftId};
  }

  private budget(context:GrowthContext,commands:GrowthCommand[]):GrowthCommand[] {
    const s=this.state;
    if(s.budgetTick!==context.tick){s.budgetTick=context.tick;s.budgetUsed=0;s.skippedCommands=0;}
    if(s.budgetUsed+commands.length>B.commandBudget){s.skippedCommands+=commands.length;return[];}
    s.budgetUsed+=commands.length;return commands;
  }
  slowFactor(targetId:string,organId:OrganId,elapsed:number):number {
    if(!this.equipped('EXPOSE_TRACE'))return 1;
    return this.state.marks.find(mark=>mark.targetId===targetId&&mark.organId===organId&&mark.slowUntil>elapsed)?.factor??1;
  }
  /** Reconcile the selected legacy alias without ever replacing another legion. */
  private immuneBeacons(elapsed: number): NonNullable<GrowthState['beacons']> {
    const s = this.state, values = [...(s.beacons ?? [])];
    if (s.beacon) {
      const index = values.findIndex(value => value.id === s.beacon!.id);
      if (index < 0) values.push(s.beacon); else values[index] = s.beacon;
    }
    const live = livingImmuneCells(s.cells ?? [], elapsed);
    s.cells = live;
    s.beacons = values.filter(value => value.until > elapsed && live.some(cell => cell.beaconId === value.id))
      .slice(0, IMMUNE_CELL_BALANCE.maximumLegions);
    s.cells = live.filter(cell => s.beacons!.some(value => value.id === cell.beaconId));
    s.beacon = s.beacons.find(value => value.id === s.beacon?.id) ?? s.beacons.at(-1) ?? null;
    return s.beacons;
  }

  injectAntibody(context: GrowthContext): { kind: 'used' | 'rejected'; reason?: string } {
    const s = this.state;
    if (s.ended || !context.active || s.draft || s.pendingResearch) return { kind: 'rejected', reason: 'run-inactive' };
    if ((s.antibodyCharges ?? 0) <= 0) return { kind: 'rejected', reason: 'empty' };
    const beacons = this.immuneBeacons(context.elapsed), live = livingImmuneCells(s.cells ?? [], context.elapsed);
    if (!live.length) return { kind: 'rejected', reason: 'no-cells' };
    if (live.some(cell => (cell.antibodyUntil ?? 0) > context.elapsed)) return { kind: 'rejected', reason: 'active' };
    if (beacons.some(beacon => live.filter(cell => cell.beaconId === beacon.id).length * 2
      > Math.min(IMMUNE_CELL_BALANCE.maximum, (beacon.cellCount ?? (beacon.mode === 'patrol' ? 1 : 3)) * 4))) {
      return { kind: 'rejected', reason: 'fission-cap' };
    }
    const serial = (s.antibodySerial ?? 0) + 1, until = context.elapsed + ANTIBODY_BALANCE.duration;
    const children = live.map(cell => {
      const hp = (cell.hp ?? cell.maxHp ?? IMMUNE_CELL_BALANCE.health) * ANTIBODY_BALANCE.healthRetained;
      cell.hp = hp; cell.maxHp ??= IMMUNE_CELL_BALANCE.health; cell.antibodyUntil = until;
      return { ...cell, id: `${cell.id}:antibody:${serial}`, born: context.elapsed,
        waypoint: null, navigationAt: 0, updatedAt: context.elapsed };
    });
    s.cells = [...live, ...children]; s.antibodyCharges = (s.antibodyCharges ?? 0) - 1; s.antibodySerial = serial;
    this.log('ANTIBODY_INJECTED', { cellsBefore: live.length, cellsAfter: s.cells.length, duration: ANTIBODY_BALANCE.duration,
      speedMultiplier: ANTIBODY_BALANCE.speedMultiplier, damageMultiplier: ANTIBODY_BALANCE.damageMultiplier,
      healthRetained: ANTIBODY_BALANCE.healthRetained, remaining: s.antibodyCharges });
    this.remember('ANTIBODY_INJECTED', `注射抗体：${live.length} → ${s.cells.length} 只细胞；当前生命减少三分之一，8 秒加速强攻并吸引病毒。`, context.elapsed);
    return { kind: 'used' };
  }

  onScan(context:GrowthContext):GrowthCommand[] {
    this.observeTime(context.elapsed);
    if(this.state.ended||!context.active)return[];
    this.ensureTerritoryBeacon(context);
    const beacons=this.immuneBeacons(context.elapsed);
    const previous={marks:this.state.marks.map(mark=>({...mark})),beacon:this.state.beacon,beacons:[...beacons],cells:this.state.cells,readyAt:this.state.beaconReadyAt,history:this.state.protocolHistory.slice()};
    const commands:GrowthCommand[]=[],trace=this.equipped('EXPOSE_TRACE'),beacon=this.equipped('IMMUNE_BEACON')
      ??(context.mission?{id:'IMMUNE_BEACON' as const,tuning:'balanced' as const,rank:1 as const}:undefined);
    const guardOrder = beacon ? selectImmuneGuardCommand(context) : undefined, guard = !!guardOrder;
    const rootId=`${this.state.runId}:scan:${context.tick}`;
    if(trace) {
      const config=getTraceConfig(trace.tuning,protocolRank(trace));let count=0;
      for(const target of context.targets)if(target.hp>0&&distance(context.player,target)<=B.scanRadius) {
        const mark={targetId:target.id,organId:context.organId,until:context.elapsed+config.duration,slowUntil:context.elapsed+config.slowDuration,factor:config.factor};
        this.state.marks=this.state.marks.filter(old=>old.targetId!==target.id||old.organId!==context.organId);this.state.marks.push(mark);count++;
      }
      commands.push({kind:'log',type:'PROTOCOL_TRACE_APPLIED',data:{protocolId:'EXPOSE_TRACE',rootId,count,duration:config.duration,slow:config.factor}});
      this.remember('PROTOCOL_TRACE_APPLIED',`显影追踪 ${count} 体，持续 ${config.duration} 秒。`,context.elapsed);
    }
    if(beacons.length<IMMUNE_CELL_BALANCE.maximumLegions&&context.elapsed+1e-9>=this.state.beaconReadyAt) {
      const config=beacon?getBeaconConfig(beacon.tuning,protocolRank(beacon)):{...PATROL_CONFIG,tissueCost:0};
      const rank=protocolRank(beacon), count=beacon?Math.min(5,Math.max(rank+2,3+Math.floor(context.immuneRank??0))):1;
      const position=beaconPosition(context);
      this.state.beacon={...point(guardOrder?.anchor ?? position),id:`${rootId}:beacon`,organId:context.organId,born:context.elapsed,until:Infinity,
        radius:config.radius,damage:config.damage,interval:config.interval,nextAttackAt:context.elapsed+.1,tuning:beacon?.tuning??'balanced',mode:beacon?'protocol':'patrol',cellCount:count,rank};
      if(guardOrder) { this.state.beacon.guard={...guardOrder.guard}; this.state.beacon.deploymentOrigin=point(position); }
      const focus=guard?undefined:selectImmuneFocusTarget(context,this.state.beacon);
      if(focus)this.state.beacon.focus={targetId:focus.id,until:Math.min(context.elapsed+IMMUNE_FOCUS_BALANCE.duration,this.state.beacon.until)};
      this.state.cells=[...(this.state.cells??[]),...summonImmuneCells(this.state.beacon,context,count)];
      this.state.beacons=[...beacons,this.state.beacon];
      this.state.beaconReadyAt=context.elapsed+config.cooldown;
      const base={protocolId:'IMMUNE_BEACON' as const,rootId,organId:context.organId};
      if(beacon)commands.push({...base,kind:'organCost',amount:config.tissueCost});
      commands.push({...base,kind:'effect',effect:'scan',from:point(position),to:point(position),radius:config.radius,duration:.6},
        {kind:'log',type:beacon?'PROTOCOL_BEACON_CREATED':'IMMUNE_PATROL_CREATED',data:{...(beacon?{protocolId:'IMMUNE_BEACON'}:{}),rootId,x:position.x,y:position.y,duration:0,persistent:true,cost:config.tissueCost,cooldown:config.cooldown,cells:count,
          ...(this.state.beacon.focus?{focusTargetId:this.state.beacon.focus.targetId,focusUntil:this.state.beacon.focus.until}:{}),
          ...(guard?{guard:true,guardX:this.state.beacon.x,guardY:this.state.beacon.y,guardRadius:IMMUNE_GUARD_BALANCE.radius,...(guardOrder?.guard.kind==='territory'?{regionId:guardOrder.guard.regionId}:{})}:{}),
          ...(context.endless&&beacon&&this.state.beacon.focus?{rallyUntil:this.state.cells[0]?.rallyUntil??context.elapsed,rallySpeed:ENDLESS_IMMUNE_CELL_BALANCE.rallySpeed}:{})}});
      // The host may add the existing combat-growth lifetime after creation.
      // This is the controller's order snapshot; read beacon.until for expiry.
      if(guard)commands.push({kind:'log',type:'IMMUNE_GUARD_ASSIGNED',data:{rootId,beaconId:this.state.beacon.id,organId:context.organId,
        x:this.state.beacon.x,y:this.state.beacon.y,radius:IMMUNE_GUARD_BALANCE.radius,plannedUntil:this.state.beacon.until,newSquad:true,...(guardOrder?.guard.kind==='territory'?{regionId:guardOrder.guard.regionId}:{})}});
      this.remember(beacon?'PROTOCOL_BEACON_CREATED':'IMMUNE_PATROL_CREATED',beacon?`${count} 只免疫细胞驻守，组织承压 −${config.tissueCost}；阵亡后空出军团位。`:'Q 召来一只常驻免疫侦巡细胞，可被病毒击杀。',context.elapsed);
    }else if(beacons.some(value=>value.organId===context.organId)) {
      const position=beaconPosition(context),old=beacons.filter(value=>value.organId===context.organId)
        .sort((a,b)=>distance(a,position)-distance(b,position)||a.id.localeCompare(b.id))[0];
      const previousRegionId = old.guard?.kind === 'territory' ? old.guard.regionId : '';
      const withdrewFront = !!context.territory && ['front-north','front-south'].includes(previousRegionId)
        && (guardOrder?.guard.kind !== 'territory' || guardOrder.guard.regionId !== previousRegionId);
      // Repoint the zone, never the bodies. Preserve every unit's independent
      // bite clock and lifetime; normal fixed updates perform the actual travel.
      this.state.beacon={...old,...point(guardOrder?.anchor ?? position)};
      // Explicit Q owns the next order. A paused building must never restore
      // this squad's superseded defense command after the player redirects it.
      delete this.state.beacon.constructionTaskId;
      if(guardOrder)this.state.beacon.guard={...guardOrder.guard};else delete this.state.beacon.guard;
      const focus=guard?undefined:selectImmuneFocusTarget(context,this.state.beacon);
      if(focus)this.state.beacon.focus={targetId:focus.id,until:Math.min(context.elapsed+IMMUNE_FOCUS_BALANCE.duration,old.until)};
      else delete this.state.beacon.focus;
      this.state.cells=redirectImmuneCells(this.state.cells??[],this.state.beacon,context);
      this.state.beacons=beacons.map(value=>value.id===old.id?this.state.beacon!:value);
      const base={protocolId:'IMMUNE_BEACON' as const,rootId,organId:context.organId};
      commands.push({...base,kind:'effect',effect:'scan',from:point(position),to:point(position),radius:old.radius,duration:.6},
        {kind:'log',type:'IMMUNE_SQUAD_REDIRECTED',data:{protocolId:'IMMUNE_BEACON',rootId,beaconId:old.id,
          fromX:old.x,fromY:old.y,x:position.x,y:position.y,cells:this.state.cells.filter(cell=>cell.beaconId===old.id).length,until:old.until,readyAt:this.state.beaconReadyAt,cost:0,
          ...(context.territory ? { footDeployment: true, previousRegionId, withdrewFront } : {}),
          ...(this.state.beacon.focus?{focusTargetId:this.state.beacon.focus.targetId,focusUntil:this.state.beacon.focus.until}:{}),
          ...(guard?{guard:true,guardX:this.state.beacon.x,guardY:this.state.beacon.y,guardRadius:IMMUNE_GUARD_BALANCE.radius,...(guardOrder?.guard.kind==='territory'?{regionId:guardOrder.guard.regionId}:{})}:{}),
          ...(context.endless&&this.state.beacon.focus?{rallyUntil:this.state.cells[0]?.rallyUntil??context.elapsed,rallySpeed:ENDLESS_IMMUNE_CELL_BALANCE.rallySpeed}:{})}});
      if(guard)commands.push({kind:'log',type:'IMMUNE_GUARD_ASSIGNED',data:{rootId,beaconId:old.id,organId:context.organId,
        x:this.state.beacon.x,y:this.state.beacon.y,radius:IMMUNE_GUARD_BALANCE.radius,plannedUntil:old.until,newSquad:false,...(guardOrder?.guard.kind==='territory'?{regionId:guardOrder.guard.regionId}:{})}});
      this.remember('IMMUNE_SQUAD_REDIRECTED',context.territory
        ? withdrewFront
          ? '最近军团向脚下行军；留意原前线，节点失守会恢复感染源护膜。生命与攻击冷却保留。'
          : '最近军团向脚下行军并留守；生命、人数与攻击冷却保留。'
        : '免疫军团转向新战线；保留当前生命与吞噬冷却，不消耗组织。',context.elapsed);
    }
    const accepted=this.budget(context,commands);
    if(commands.length&&!accepted.length){this.state.marks=previous.marks;this.state.beacon=previous.beacon;this.state.beacons=previous.beacons;this.state.cells=previous.cells;this.state.beaconReadyAt=previous.readyAt;this.state.protocolHistory=previous.history;}
    else if(trace&&this.state.marks.some(mark=>mark.organId===context.organId))this.activated('EXPOSE_TRACE');
    return accepted;
  }
  onHit(context:GrowthContext,target:Target,origin:DamageOrigin={cause:'basic'}):GrowthCommand[] {
    this.observeTime(context.elapsed);
    if(this.state.ended||!context.active||target.role==='capsule'||origin.cause!=='basic'||target.hp<=0||context.tool===3)return[];
    const ricochet=this.ricochetOnHit(context,target,origin);
    const slot=this.equipped('PULSE_BREAK');if(!slot||context.rhythm!=='surge')return ricochet;
    const config=getPulseConfig(slot.tuning,protocolRank(slot));if(distance(context.player,context.deviceOrigin)>config.deviceRange)return ricochet;
    const cycle=context.rhythmCycle??Math.floor(context.elapsed/6);
    if(this.state.resonance.some(hit=>hit.targetId===target.id&&hit.organId===context.organId&&hit.cycle===cycle))return ricochet;
    const rootId=origin.rootId??`${this.state.runId}:hit:${context.tick}:${target.id}`,base={protocolId:'PULSE_BREAK' as const,rootId,organId:context.organId};
    const commands:GrowthCommand[]=[{...base,kind:'expose',targetId:target.id,until:context.elapsed+config.exposeSeconds,revealUntil:context.elapsed+config.exposeSeconds},
      {...base,kind:'effect',effect:'evolution',from:point(target),to:point(target),radius:target.radius+12,duration:.35},
      {...base,kind:'damage',targetId:target.id,amount:config.bonusDamage,cause:'protocol',hop:0,allowChain:true},
      {kind:'log',type:'PROTOCOL_RESONANCE_HIT',data:{protocolId:'PULSE_BREAK',rootId,targetId:target.id,bonus:config.bonusDamage,exposeSeconds:config.exposeSeconds,cycle}}];
    const accepted=this.budget(context,commands);if(!accepted.length)return ricochet;
    this.state.resonance.push({targetId:target.id,organId:context.organId,cycle});
    this.activated('PULSE_BREAK');
    this.remember('PROTOCOL_RESONANCE_PLANNED',`节律共振计划：尝试追加 ${config.bonusDamage} 点伤害、破绽 ${config.exposeSeconds} 秒；实际命中另行记录。`,context.elapsed);
    return [...ricochet,...accepted];
  }
  private ricochetOnHit(context:GrowthContext,target:Target,origin:DamageOrigin):GrowthCommand[] {
    const slot=this.equipped('PURIFY_CHAIN');if(!slot)return[];
    const rank=protocolRank(slot),period=chainRicochetPeriod(rank);if(!period)return[];
    this.state.chainCharge=Math.min(period,(this.state.chainCharge??0)+1);
    if(this.state.chainCharge<period)return[];
    const config=getChainConfig(slot.tuning,rank);
    const next=stableNearest(target,context.targets.filter(candidate=>candidate.role!=='capsule'&&candidate.hp>0&&candidate.id!==target.id&&distance(target,candidate)<=config.range&&unobstructed(target,candidate,context.geometry)))[0];
    if(!next)return[];
    // Each accepted fold is its own transaction, even when several rays share
    // a source and tick. The command budget bounds this tick-local ordinal.
    const ordinal=this.ricochetTick===context.tick?this.acceptedRicochets+1:1;
    const rootId=`${this.state.runId}:ricochet:${context.tick}:${ordinal}`,base={protocolId:'PURIFY_CHAIN' as const,rootId,organId:context.organId};
    const commands:GrowthCommand[]=[{...base,kind:'effect',effect:'chain',from:point(target),to:point(next),radius:12,duration:.35},
      {...base,kind:'damage',targetId:next.id,amount:config.damage,cause:'protocol',hop:1},
      {kind:'log',type:'PROTOCOL_RICOCHET_HIT',data:{protocolId:'PURIFY_CHAIN',rootId,targetId:next.id,damage:config.damage,period,rank,
        ...(origin.rootId?{sourceRootId:origin.rootId}:{})}}];
    const accepted=this.budget(context,commands);if(!accepted.length)return[];
    this.ricochetTick=context.tick;this.acceptedRicochets=ordinal;
    this.state.chainCharge=0;this.activated('PURIFY_CHAIN');
    this.remember('PROTOCOL_RICOCHET_PLANNED',`连锁进阶计划：${period} 次命中蓄能，尝试折射 ${config.damage} 点伤害；实际命中另行记录。`,context.elapsed);
    return accepted;
  }
  onKill(context:GrowthContext,target:Target,origin:DamageOrigin={cause:'basic'}):GrowthCommand[] {
    this.observeTime(context.elapsed);
    if(this.state.ended||!context.active||target.role==='capsule'||origin.ability==='catalysis'||origin.cause==='protocol'&&!(origin.protocolId==='PULSE_BREAK'&&origin.allowChain))return[];
    const slot=this.equipped('PURIFY_CHAIN');if(!slot)return[];
    const rootId=origin.rootId??`${this.state.runId}:hit:${context.tick}:${target.id}`;
    if(this.state.chainRoots.includes(rootId))return[];
    const synergy=!!this.equipped('PULSE_BREAK')&&!!origin.wasPulseExposed;
    const config=getChainConfig(slot.tuning,protocolRank(slot)),hops=Math.min(B.chainCap,config.jumps+(synergy?1:0));
    const visited=new Set([target.id]),commands:GrowthCommand[]=[];
    let from:Vec=target,actual=0;
    for(let hop=1;hop<=hops;hop++) {
      const next=stableNearest(from,context.targets.filter(t=>t.role!=='capsule'&&t.hp>0&&!visited.has(t.id)&&distance(from,t)<=config.range&&unobstructed(from,t,context.geometry)))[0];
      if(!next)break;
      visited.add(next.id);actual++;
      const base={protocolId:'PURIFY_CHAIN' as const,rootId,organId:context.organId};
      commands.push({...base,kind:'effect',effect:'chain',from:point(from),to:point(next),radius:12,duration:.35},
        {...base,kind:'damage',targetId:next.id,amount:config.damage,cause:'protocol',hop},
        {kind:'log',type:'PROTOCOL_CHAIN_HIT',data:{protocolId:'PURIFY_CHAIN',rootId,targetId:next.id,hop,damage:config.damage}});
      from=next;
    }
    if(!actual)return[];
    if(synergy)commands.push({kind:'log',type:'PROTOCOL_SYNERGY',data:{pair:'PULSE_BREAK+PURIFY_CHAIN',rootId,hops:actual,cap:B.chainCap}});
    const accepted=this.budget(context,commands);if(!accepted.length)return[];
    this.state.chainRoots.push(rootId);if(this.state.chainRoots.length>256)this.state.chainRoots.shift();
    this.activated('PURIFY_CHAIN');
    this.remember('PROTOCOL_CHAIN_PLANNED',`${synergy?'共振联动 · ':''}连锁净化计划：尝试 ${actual} 跳；实际命中另行记录。`,context.elapsed);
    return accepted;
  }

  afterInput(context:GrowthContext):GrowthCommand[] {
    this.observeTime(context.elapsed);
    const s=this.state;if(s.ended)return[];
    const logs:GrowthCommand[]=s.pendingLogs.splice(0).map(log=>({kind:'log',...log}));
    if(!context.active)return logs;
    this.ensureTerritoryBeacon(context);
    const liveIds=new Set(context.targets.filter(target=>target.hp>0).map(target=>target.id));
    s.marks=s.marks.filter(mark=>mark.until>context.elapsed&&(mark.organId!==context.organId||liveIds.has(mark.targetId)));
    s.resonance=s.resonance.filter(hit=>hit.organId===context.organId&&hit.cycle===(context.rhythmCycle??Math.floor(context.elapsed/6))&&liveIds.has(hit.targetId));
    if(!this.equipped('EXPOSE_TRACE'))s.marks=[];
    const beacons=this.immuneBeacons(context.elapsed),slot=this.equipped('IMMUNE_BEACON');
    // A newly earned rank reinforces each surviving legion once. It never
    // replenishes casualties at an unchanged rank or removes veteran bodies.
    for(const beacon of beacons)if(beacon.organId===context.organId) {
      if(beacon.guard&&!activeImmuneGuard(beacon,context))delete beacon.guard;
      if(slot) {
        const rank=protocolRank(slot),count=Math.min(5,Math.max(rank+2,3+Math.floor(context.immuneRank??0)));
        const previousCount=beacon.cellCount??(beacon.mode==='patrol'?1:3),config=getBeaconConfig(slot.tuning,rank);
        const wasPatrol=beacon.mode==='patrol';
        beacon.mode='protocol';beacon.tuning=slot.tuning;beacon.radius=config.radius;beacon.damage=config.damage;
        beacon.interval=config.interval;beacon.rank=rank;beacon.cellCount=Math.max(previousCount,count);
        for(const cell of s.cells??[])if(cell.beaconId===beacon.id) {
          cell.damage=config.damage/beacon.cellCount;cell.interval=config.interval;
          const maxHp=IMMUNE_CELL_BALANCE.health+(rank-1)*12;
          if(maxHp>(cell.maxHp??IMMUNE_CELL_BALANCE.health)) {
            cell.hp??=IMMUNE_CELL_BALANCE.health;cell.maxHp=maxHp;
          }
        }
        if(count>previousCount) {
          const reinforcements=summonImmuneCells(beacon,context,count).slice(previousCount);
          s.cells=[...(s.cells??[]),...reinforcements];
          logs.push({kind:'log',type:'IMMUNE_LEGION_REINFORCED',data:{beaconId:beacon.id,organId:beacon.organId,previousCount,cells:count,added:count-previousCount}});
        }else if(wasPatrol)logs.push({kind:'log',type:'IMMUNE_LEGION_REINFORCED',data:{beaconId:beacon.id,organId:beacon.organId,previousCount,cells:count,added:0}});
      }
    }
    const traced=this.equipped('EXPOSE_TRACE')?s.marks.filter(mark=>mark.organId===context.organId&&mark.until>context.elapsed).map(mark=>mark.targetId):[];
    for(const beacon of beacons.filter(value=>value.organId===context.organId)) {
      const advanced=advanceImmuneCells(s.cells??[],beacon,context,beacon.mode==='patrol'?[]:traced);
      const cellCommands=this.budget(context,advanced.commands);
      // Rejected combat commands cannot consume an ally attack or advance its cooldown.
      if(!advanced.commands.length||cellCommands.length)s.cells=[...(s.cells??[]).filter(cell=>cell.beaconId!==beacon.id),...advanced.cells];
      for(const command of cellCommands)if(command.kind==='log'&&command.type==='PROTOCOL_BEACON_HIT')this.activated('IMMUNE_BEACON');
      logs.push(...cellCommands);
    }
    s.beacon=beacons.filter(value=>value.organId===context.organId).find(value=>value.id===s.beacon?.id)
      ??beacons.find(value=>value.organId===context.organId)??null;
    if(s.skippedCommands){logs.push({kind:'log',type:'PROTOCOL_BUDGET_SKIPPED',data:{tick:context.tick,skipped:s.skippedCommands,budget:B.commandBudget}});s.skippedCommands=0;}
    if(!context.mission)this.openNextLevel();
    // Draft-open logs are emitted in the same frame, before the host pauses for the draft.
    logs.push(...s.pendingLogs.splice(0).map(log=>({kind:'log' as const,...log})));
    return logs;
  }
}
