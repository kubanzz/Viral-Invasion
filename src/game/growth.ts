import { distance, normalized, wallHit, moveWithCollision } from '../actors/collision';
import { SeedRng } from '../core/rng';
import type { OrganId } from './battleTypes';
import { activeWorld, type GameEvent, type GameState, type Target, type Vec, type WorldGeometry } from './types';
import { GROWTH_BALANCE as B, makeDraftOption, PROTOCOL_IDS, PROTOCOLS, TUNINGS, getBeaconConfig, getChainConfig, getPulseConfig, getTraceConfig, PATROL_CONFIG, protocolRank, PROTOCOL_ACTIONS, chainRicochetPeriod } from './protocols';
import type { DamageOrigin, DraftIntent, DraftOption, DraftResolution, EquippedProtocol, GrowthCommand, GrowthContext, GrowthState, ProtocolDraft, ProtocolId, ProtocolRank, ResearchResult, ResearchDirectionId, ResearchConfirmIntent, ResearchRequestIntent, ResearchRequestResult, ResearchConfirmResult, ResearchCancelResult } from './growthTypes';
import { advanceImmuneCells, summonImmuneCells } from './immuneCells';
import { availableResearchDirections, RESEARCH_DIRECTIONS } from './research';

export type { GrowthCommand, GrowthContext, GrowthState, DamageOrigin, DraftIntent, DraftResolution } from './growthTypes';

export function growthContext(state: GameState): GrowthContext {
  return { tick: state.tick, elapsed: state.elapsed, active: state.phase === 'playing', organId: state.battle?.organId ?? 'heart',
    rhythm: state.battle?.pulse.phase ?? 'rest', deviceOrigin: state.battle?.pulse.origin ?? state.terminal,
    player: state.player, aim: state.battle?.lastAim ?? state.player, tissue: state.tissue, targets: state.targets, tool: state.tool, geometry: activeWorld(state), rhythmCycle: state.battle?.pulse.cycleIndex };
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

/** Independent run-local state. All world mutations return through the host's common damage path. */
export class GrowthController {
  readonly state: GrowthState;
  constructor(seed: number, runId = `${seed >>> 0}:growth`) {
    this.state = { runId, seed: seed >>> 0, lastElapsed: 0, xp: 0, level: 0, nextXp: B.xpThresholds[0], research: 0,
      equipped: [], draft: null, pendingLevels: [], consumedDraftIds: [], rewardedKeys: [], sourceKillCounts: {},
      damageTakenByOrgan: { heart: 0, lung: 0 }, protectionNeeded: { heart: false, lung: false },
      draftSerial: 0, historyHash: 2166136261, ended: false, pendingResearch: null, researchSerial: 0,
      beacon: null, beaconReadyAt: 0, cells: [], activations: {}, marks: [], resonance: [], chainRoots: [], protocolHistory: [], pendingLogs: [],
      budgetTick: -1, budgetUsed: 0, skippedCommands: 0 };
  }

  private observeTime(elapsed: number): void {
    if(Number.isFinite(elapsed))this.state.lastElapsed=Math.max(this.state.lastElapsed,elapsed);
  }
  private remember(type: string, text: string, at = this.state.lastElapsed): void {
    this.state.protocolHistory.push({ at, type, text });
    if (this.state.protocolHistory.length > 128) this.state.protocolHistory.shift();
  }
  private log(type: string, data: GameEvent['data']): void { this.state.pendingLogs.push({ type, data }); }
  private equipped(id: ProtocolId): EquippedProtocol | undefined { return this.state.equipped.find(slot=>slot.id===id); }
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
      s.pendingLevels.push(++s.level);this.log('GROWTH_LEVEL_GAINED',{level:s.level,xp:s.xp});
    }
    s.nextXp=B.xpThresholds[s.level]??null;
  }

  /** Accept only real accepted events. Keys live independently of the bounded diagnostic event log. */
  recordEvent(event: GameEvent, context?: GrowthContext): void {
    const s=this.state, data=event.data, elapsed=context?.elapsed??event.tick/60;
    this.observeTime(elapsed);
    if(event.type==='RUN_ENDED') { s.ended=true;s.draft=null;s.pendingResearch=null;s.pendingLevels=[];s.beacon=null;s.cells=[];s.marks=[];s.resonance=[];return; }
    if(s.ended)return;
    const organ:OrganId=data.organId==='lung'?'lung':data.organId==='heart'?'heart':context?.organId??'heart';
    if(event.type==='INFECTION_SOURCE_CLEARED') {
      const id=String(data.nodeId??data.id??'');if(id)this.award(`source:${organ}:${id}`,20,2,elapsed);
    } else if(event.type==='ELITE_CLEARED') {
      const id=String(data.id??'');if(id)this.award(`elite:${organ}:${id}`,30,2,elapsed);
    } else if(event.type==='TARGET_CLEARED') {
      const id=String(data.id??'');if(!id)return;
      const target=context?.targets.find(t=>t.id===id);
      const role=data.role??target?.role;
      if(role==='source'||role==='elite'||role==='core'||Number(data.generation??target?.generation??0)>0)return;
      const key=`ordinary:${organ}:${id}`;
      if(s.rewardedKeys.includes(key))return;
      const source=`${organ}:${String(data.sourceId??target?.sourceId??'ambient')}`;
      const count=s.sourceKillCounts[source]??0;if(count>=3)return;
      s.sourceKillCounts[source]=count+1;this.award(key,[4,2,1][count],0,elapsed);
    } else if(event.type==='BATTLE_DIAGNOSED') {
      const found=context?.targets.filter(t=>t.hp>0&&distance(context.player,t)<=B.scanRadius)??[];
      if(found.length||Number(data.count)>0)this.award('diagnose:baseline',6,1,elapsed);
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

  private shuffled<T>(values: readonly T[], rng: SeedRng): T[] {
    const result=[...values];for(let i=result.length-1;i>0;i--){const j=rng.int(0,i);[result[i],result[j]]=[result[j],result[i]];}return result;
  }
  private createDraft(source: ProtocolDraft['source'], level?: number, researchDirection?: ResearchDirectionId, requestId?: string): ProtocolDraft {
    const s=this.state, serial=++s.draftSerial;
    const equipment=s.equipped.map(slot=>`${slot.id}:${slot.tuning}:${protocolRank(slot)}`).sort().join('|');
    const focusHash=source==='research'&&researchDirection&&researchDirection!=='general'?hashString(`research:${researchDirection}`):0;
    const rng=new SeedRng((s.seed^Math.imul(serial,0x9e3779b1)^hashString(equipment,s.historyHash)^focusHash)>>>0);
    const newOptions:DraftOption[]=[],retunes:DraftOption[]=[];
    for(const id of PROTOCOL_IDS) {
      const current=this.equipped(id);
      if(!current)newOptions.push(makeDraftOption(id,'balanced','equip'));
      else if (protocolRank(current) < B.maxRank) retunes.push(makeDraftOption(id,current.tuning,'retune',(protocolRank(current)+1) as ProtocolRank,current));
      else {const options=TUNINGS.filter(tuning=>tuning!==current.tuning);retunes.push(makeDraftOption(id,options[rng.int(0,options.length-1)],'retune',protocolRank(current),current));}
    }
    const shuffledNew=this.shuffled(newOptions,rng);
    // The opening presents different attack loops, including an immediately usable summon.
    const opening=s.equipped.length===0&&serial===1;
    const firstChoices=opening?[shuffledNew.find(o=>o.protocolId==='IMMUNE_BEACON')!,shuffledNew.find(o=>o.protocolId==='PURIFY_CHAIN')!,shuffledNew.find(o=>o.protocolId!=='IMMUNE_BEACON'&&o.protocolId!=='PURIFY_CHAIN')!]:shuffledNew;
    let ordered:DraftOption[];
    const upgrades=retunes.filter(option=>(option.rank??1)>protocolRank(this.equipped(option.protocolId)));
    if(source==='research'&&researchDirection&&researchDirection!=='general'){
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
    const draft:ProtocolDraft={id:`${s.runId}:draft:${serial}`,source,serial,level,options,status:'choosing',...(source==='research'&&researchDirection?{researchDirection}:{})};
    s.draft=draft;this.log('PROTOCOL_DRAFT_OPENED',{draftId:draft.id,source,serial,level:level??0,...(source==='research'?{researchDirection:researchDirection??'general',...(requestId?{requestId}:{})}:{})});
    if(source==='research')this.remember('PROTOCOL_DRAFT_OPENED',`${RESEARCH_DIRECTIONS[researchDirection??'general'].title}：三种不同协议候选已就绪，可新装、进阶或改造。`);
    return draft;
  }
  private openNextLevel(): void {
    if(!this.state.draft&&!this.state.pendingResearch&&!this.state.ended&&this.state.pendingLevels.length)this.createDraft('xp',this.state.pendingLevels.shift()!);
  }
  requestResearch(nodeId: string, context: GrowthContext): ResearchRequestResult {
    this.observeTime(context.elapsed);
    const s=this.state;
    if(s.ended||!context.active)return{kind:'rejected',reason:'run-inactive'};
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
    if(s.ended||!context.active)return{kind:'rejected',reason:'run-inactive'};
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
    s.historyHash=hashString(`${kind}:${draft.serial}:${s.equipped.map(e=>`${e.id}:${e.tuning}:${protocolRank(e)}`).join('|')}`,s.historyHash);
    this.log(kind==='committed'?'PROTOCOL_DRAFT_COMMITTED':'PROTOCOL_DRAFT_DISCARDED',{draftId:draft.id,source:draft.source});
    this.openNextLevel();const nextDraft=s.draft as ProtocolDraft|null;return{kind,draftId:draft.id,nextDraftId:nextDraft?.id};
  }
  private cleanupChanged(previous:EquippedProtocol[],next:EquippedProtocol[]): void {
    const changed=(id:ProtocolId)=>{const a=previous.find(p=>p.id===id),b=next.find(p=>p.id===id);return a?.tuning!==b?.tuning||!!a!==!!b||protocolRank(a)!==protocolRank(b);};
    if(changed('IMMUNE_BEACON')&&this.state.beacon?.mode!=='patrol'){this.state.beacon=null;this.state.cells=[];}
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
      s.equipped[index]={id:option.protocolId,tuning:option.tuning};
    }
    this.cleanupChanged(previous,s.equipped);
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
  onScan(context:GrowthContext):GrowthCommand[] {
    this.observeTime(context.elapsed);
    if(this.state.ended||!context.active)return[];
    const previous={marks:this.state.marks.map(mark=>({...mark})),beacon:this.state.beacon,cells:this.state.cells,readyAt:this.state.beaconReadyAt,history:this.state.protocolHistory.slice()};
    const commands:GrowthCommand[]=[],trace=this.equipped('EXPOSE_TRACE'),beacon=this.equipped('IMMUNE_BEACON');
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
    if(!beacon||context.elapsed+1e-9>=this.state.beaconReadyAt) {
      const config=beacon?getBeaconConfig(beacon.tuning,protocolRank(beacon)):{...PATROL_CONFIG,tissueCost:0};
      const direction=normalized(context.aim.x-context.player.x,context.aim.y-context.player.y),length=Math.min(B.beaconPlacementRange,distance(context.player,context.aim));
      const wall=wallHit(context.player,direction,length,context.geometry);
      const travel=Math.max(0,Math.min(length,wall===null?length:wall-18));
      const position=moveWithCollision(context.player,{x:direction.x*travel,y:direction.y*travel},12,context.geometry);
      this.state.beacon={...point(position),id:`${rootId}:beacon`,organId:context.organId,born:context.elapsed,until:context.elapsed+config.duration,
        radius:config.radius,damage:config.damage,interval:config.interval,nextAttackAt:context.elapsed+.1,tuning:beacon?.tuning??'balanced',mode:beacon?'protocol':'patrol'};
      this.state.cells=summonImmuneCells(this.state.beacon,context,beacon?3:1);
      this.state.beaconReadyAt=context.elapsed+config.cooldown;
      const base={protocolId:'IMMUNE_BEACON' as const,rootId,organId:context.organId};
      if(beacon)commands.push({...base,kind:'organCost',amount:config.tissueCost});
      commands.push({...base,kind:'effect',effect:'scan',from:point(position),to:point(position),radius:config.radius,duration:.6},
        {kind:'log',type:beacon?'PROTOCOL_BEACON_CREATED':'IMMUNE_PATROL_CREATED',data:{...(beacon?{protocolId:'IMMUNE_BEACON'}:{}),rootId,x:position.x,y:position.y,duration:config.duration,cost:config.tissueCost,cooldown:config.cooldown,cells:beacon?3:1}});
      this.remember(beacon?'PROTOCOL_BEACON_CREATED':'IMMUNE_PATROL_CREATED',beacon?`三只免疫细胞出击，组织承压 −${config.tissueCost}。`:'Q 召来一只免疫侦巡细胞，短时协助清理。',context.elapsed);
    }
    const accepted=this.budget(context,commands);
    if(commands.length&&!accepted.length){this.state.marks=previous.marks;this.state.beacon=previous.beacon;this.state.cells=previous.cells;this.state.beaconReadyAt=previous.readyAt;this.state.protocolHistory=previous.history;}
    else if(trace&&this.state.marks.some(mark=>mark.organId===context.organId))this.activated('EXPOSE_TRACE');
    return accepted;
  }
  onHit(context:GrowthContext,target:Target,origin:DamageOrigin={cause:'basic'}):GrowthCommand[] {
    this.observeTime(context.elapsed);
    if(this.state.ended||!context.active||origin.cause!=='basic'||target.hp<=0||context.tool===3)return[];
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
    this.remember('PROTOCOL_RESONANCE_HIT',`节律共振：追加 ${config.bonusDamage}，破绽 ${config.exposeSeconds} 秒。`,context.elapsed);
    return [...ricochet,...accepted];
  }
  private ricochetOnHit(context:GrowthContext,target:Target,origin:DamageOrigin):GrowthCommand[] {
    const slot=this.equipped('PURIFY_CHAIN');if(!slot)return[];
    const rank=protocolRank(slot),period=chainRicochetPeriod(rank);if(!period)return[];
    this.state.chainCharge=Math.min(period,(this.state.chainCharge??0)+1);
    if(this.state.chainCharge<period)return[];
    const config=getChainConfig(slot.tuning,rank);
    const next=stableNearest(target,context.targets.filter(candidate=>candidate.hp>0&&candidate.id!==target.id&&distance(target,candidate)<=config.range&&unobstructed(target,candidate,context.geometry)))[0];
    if(!next)return[];
    const rootId=origin.rootId??`${this.state.runId}:ricochet:${context.tick}:${target.id}`,base={protocolId:'PURIFY_CHAIN' as const,rootId,organId:context.organId};
    const commands:GrowthCommand[]=[{...base,kind:'effect',effect:'chain',from:point(target),to:point(next),radius:12,duration:.35},
      {...base,kind:'damage',targetId:next.id,amount:config.damage,cause:'protocol',hop:1},
      {kind:'log',type:'PROTOCOL_RICOCHET_HIT',data:{protocolId:'PURIFY_CHAIN',rootId,targetId:next.id,damage:config.damage,period,rank}}];
    const accepted=this.budget(context,commands);if(!accepted.length)return[];
    this.state.chainCharge=0;this.activated('PURIFY_CHAIN');
    this.remember('PROTOCOL_RICOCHET_HIT',`连锁进阶：${period}次命中蓄能，折射 ${config.damage}。`,context.elapsed);
    return accepted;
  }
  onKill(context:GrowthContext,target:Target,origin:DamageOrigin={cause:'basic'}):GrowthCommand[] {
    this.observeTime(context.elapsed);
    if(this.state.ended||!context.active||origin.cause==='protocol'&&!(origin.protocolId==='PULSE_BREAK'&&origin.allowChain))return[];
    const slot=this.equipped('PURIFY_CHAIN');if(!slot)return[];
    const rootId=origin.rootId??`${this.state.runId}:hit:${context.tick}:${target.id}`;
    if(this.state.chainRoots.includes(rootId))return[];
    const synergy=!!this.equipped('PULSE_BREAK')&&!!origin.wasPulseExposed;
    const config=getChainConfig(slot.tuning,protocolRank(slot)),hops=Math.min(B.chainCap,config.jumps+(synergy?1:0));
    const visited=new Set([target.id]),commands:GrowthCommand[]=[];
    let from:Vec=target,actual=0;
    for(let hop=1;hop<=hops;hop++) {
      const next=stableNearest(from,context.targets.filter(t=>t.hp>0&&!visited.has(t.id)&&distance(from,t)<=config.range&&unobstructed(from,t,context.geometry)))[0];
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
    this.remember('PROTOCOL_CHAIN_HIT',`${synergy?'共振联动 · ':''}连锁净化 ${actual} 跳。`,context.elapsed);
    return accepted;
  }

  afterInput(context:GrowthContext):GrowthCommand[] {
    this.observeTime(context.elapsed);
    const s=this.state;if(s.ended)return[];
    const logs:GrowthCommand[]=s.pendingLogs.splice(0).map(log=>({kind:'log',...log}));
    if(!context.active)return logs;
    const liveIds=new Set(context.targets.filter(target=>target.hp>0).map(target=>target.id));
    s.marks=s.marks.filter(mark=>mark.until>context.elapsed&&(mark.organId!==context.organId||liveIds.has(mark.targetId)));
    s.resonance=s.resonance.filter(hit=>hit.organId===context.organId&&hit.cycle===(context.rhythmCycle??Math.floor(context.elapsed/6))&&liveIds.has(hit.targetId));
    if(!this.equipped('EXPOSE_TRACE'))s.marks=[];
    if(!this.equipped('IMMUNE_BEACON')&&s.beacon?.mode!=='patrol')s.beacon=null;
    if(s.beacon&&(s.beacon.until<=context.elapsed||s.beacon.organId!==context.organId))s.beacon=null;
    const traced=this.equipped('EXPOSE_TRACE')?s.marks.filter(mark=>mark.organId===context.organId&&mark.until>context.elapsed).map(mark=>mark.targetId):[];
    const advanced=advanceImmuneCells(s.cells??[],s.beacon,context,s.beacon?.mode==='patrol'?[]:traced);
    const cellCommands=this.budget(context,advanced.commands);
    // Rejected combat commands cannot consume an ally attack or advance its cooldown.
    if(!advanced.commands.length||cellCommands.length)s.cells=advanced.cells;
    if(!s.beacon)s.cells=[];
    for(const command of cellCommands)if(command.kind==='log'&&command.type==='PROTOCOL_BEACON_HIT')this.activated('IMMUNE_BEACON');
    logs.push(...cellCommands);
    if(s.skippedCommands){logs.push({kind:'log',type:'PROTOCOL_BUDGET_SKIPPED',data:{tick:context.tick,skipped:s.skippedCommands,budget:B.commandBudget}});s.skippedCommands=0;}
    this.openNextLevel();
    // Draft-open logs are emitted in the same frame, before the host pauses for the draft.
    logs.push(...s.pendingLogs.splice(0).map(log=>({kind:'log' as const,...log})));
    return logs;
  }
}
