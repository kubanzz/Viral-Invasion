import { distance, normalized, wallHit, moveWithCollision } from '../actors/collision';
import { SeedRng } from '../core/rng';
import type { OrganId } from './battleTypes';
import type { GameEvent, GameState, Target, Vec } from './types';
import { BEACON_CONFIG, CHAIN_CONFIG, GROWTH_BALANCE as B, makeDraftOption, PROTOCOL_IDS, PROTOCOLS, PULSE_CONFIG, TRACE_CONFIG, TUNINGS } from './protocols';
import type { DamageOrigin, DraftIntent, DraftOption, DraftResolution, EquippedProtocol, GrowthCommand, GrowthContext, GrowthState, ProtocolDraft, ProtocolId, ResearchResult } from './growthTypes';

export type { GrowthCommand, GrowthContext, GrowthState, DamageOrigin, DraftIntent, DraftResolution } from './growthTypes';

export function growthContext(state: GameState): GrowthContext {
  return { tick: state.tick, elapsed: state.elapsed, active: state.phase === 'playing', organId: state.battle?.organId ?? 'heart',
    rhythm: state.battle?.pulse.phase ?? 'rest', deviceOrigin: state.battle?.pulse.origin ?? state.terminal,
    player: state.player, aim: state.battle?.lastAim ?? state.player, tissue: state.tissue, targets: state.targets, tool: state.tool };
}
const hashString = (value: string, start = 2166136261): number => {
  let hash = start >>> 0; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0; return hash;
};
const point = (value: Vec): Vec => ({ x: value.x, y: value.y });
const unobstructed = (from: Vec, to: Target): boolean => {
  const length = distance(from, to), direction = normalized(to.x-from.x,to.y-from.y);
  const wall = wallHit(from,direction,length); return wall === null || wall >= length-to.radius;
};
const stableNearest = (from: Vec, targets: readonly Target[]): Target[] => [...targets].sort((a,b)=>distance(from,a)-distance(from,b)||(a.id<b.id?-1:a.id>b.id?1:0));

/** Independent run-local state. All world mutations return through the host's common damage path. */
export class GrowthController {
  readonly state: GrowthState;
  constructor(seed: number, runId = `${seed >>> 0}:growth`) {
    this.state = { runId, seed: seed >>> 0, lastElapsed: 0, xp: 0, level: 0, nextXp: B.xpThresholds[0], research: 0,
      equipped: [], draft: null, pendingLevels: [], consumedDraftIds: [], rewardedKeys: [], sourceKillCounts: {},
      damageTakenByOrgan: { heart: 0, lung: 0 }, protectionNeeded: { heart: false, lung: false },
      draftSerial: 0, historyHash: 2166136261, ended: false,
      beacon: null, beaconReadyAt: 0, marks: [], resonance: [], chainRoots: [], protocolHistory: [], pendingLogs: [],
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
    if(event.type==='RUN_ENDED') { s.ended=true;s.draft=null;s.pendingLevels=[];s.beacon=null;s.marks=[];s.resonance=[];return; }
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
  private createDraft(source: ProtocolDraft['source'], level?: number): ProtocolDraft {
    const s=this.state, serial=++s.draftSerial;
    const equipment=s.equipped.map(slot=>`${slot.id}:${slot.tuning}`).sort().join('|');
    const rng=new SeedRng((s.seed^Math.imul(serial,0x9e3779b1)^hashString(equipment,s.historyHash))>>>0);
    const newOptions:DraftOption[]=[],retunes:DraftOption[]=[];
    for(const id of PROTOCOL_IDS) {
      const current=this.equipped(id);
      if(!current)newOptions.push(makeDraftOption(id,'balanced','equip'));
      else {const options=TUNINGS.filter(tuning=>tuning!==current.tuning);retunes.push(makeDraftOption(id,options[rng.int(0,options.length-1)],'retune'));}
    }
    const ordered=[...this.shuffled(newOptions,rng),...this.shuffled(retunes,rng)].slice(0,3);
    if(ordered.length!==3)throw new Error('Protocol candidate pool must provide three legal distinct choices');
    const options=this.shuffled(ordered,rng) as ProtocolDraft['options'];
    const draft:ProtocolDraft={id:`${s.runId}:draft:${serial}`,source,serial,level,options,status:'choosing'};
    s.draft=draft;this.log('PROTOCOL_DRAFT_OPENED',{draftId:draft.id,source,serial,level:level??0});
    return draft;
  }
  private openNextLevel(): void {
    if(!this.state.draft&&!this.state.ended&&this.state.pendingLevels.length)this.createDraft('xp',this.state.pendingLevels.shift()!);
  }
  openResearch(nodeId: string, context: GrowthContext): ResearchResult {
    this.observeTime(context.elapsed);
    const s=this.state;
    if(s.ended||!context.active)return{kind:'rejected',reason:'run-inactive'};
    this.openNextLevel();
    if(s.draft)return{kind:'rejected',reason:'draft-active'};
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
    s.historyHash=hashString(`${kind}:${draft.serial}:${s.equipped.map(e=>`${e.id}:${e.tuning}`).join('|')}`,s.historyHash);
    this.log(kind==='committed'?'PROTOCOL_DRAFT_COMMITTED':'PROTOCOL_DRAFT_DISCARDED',{draftId:draft.id,source:draft.source});
    this.openNextLevel();const nextDraft=s.draft as ProtocolDraft|null;return{kind,draftId:draft.id,nextDraftId:nextDraft?.id};
  }
  private cleanupChanged(previous:EquippedProtocol[],next:EquippedProtocol[]): void {
    const changed=(id:ProtocolId)=>previous.find(p=>p.id===id)?.tuning!==next.find(p=>p.id===id)?.tuning;
    if(changed('IMMUNE_BEACON'))this.state.beacon=null;
    if(changed('EXPOSE_TRACE'))this.state.marks=[];
    if(changed('PULSE_BREAK'))this.state.resonance=[];
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
      if(index<0||s.equipped[index].tuning===option.tuning)return{kind:'rejected',reason:'option-no-longer-legal'};
      s.equipped[index]={id:option.protocolId,tuning:option.tuning};
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
    this.log('PROTOCOL_EQUIPPED',{draftId:draft.id,protocolId:option.protocolId,tuning:option.tuning,kind:option.kind,slots:s.equipped.length});
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
    const previous={marks:this.state.marks.map(mark=>({...mark})),beacon:this.state.beacon,readyAt:this.state.beaconReadyAt,history:this.state.protocolHistory.slice()};
    const commands:GrowthCommand[]=[],trace=this.equipped('EXPOSE_TRACE'),beacon=this.equipped('IMMUNE_BEACON');
    const rootId=`${this.state.runId}:scan:${context.tick}`;
    if(trace) {
      const config=TRACE_CONFIG[trace.tuning];let count=0;
      for(const target of context.targets)if(target.hp>0&&distance(context.player,target)<=B.scanRadius) {
        const mark={targetId:target.id,organId:context.organId,until:context.elapsed+config.duration,slowUntil:context.elapsed+config.slowDuration,factor:config.factor};
        this.state.marks=this.state.marks.filter(old=>old.targetId!==target.id||old.organId!==context.organId);this.state.marks.push(mark);count++;
      }
      commands.push({kind:'log',type:'PROTOCOL_TRACE_APPLIED',data:{protocolId:'EXPOSE_TRACE',rootId,count,duration:config.duration,slow:config.factor}});
      this.remember('PROTOCOL_TRACE_APPLIED',`显影追踪 ${count} 体，持续 ${config.duration} 秒。`,context.elapsed);
    }
    if(beacon&&context.elapsed+1e-9>=this.state.beaconReadyAt) {
      const config=BEACON_CONFIG[beacon.tuning];
      const direction=normalized(context.aim.x-context.player.x,context.aim.y-context.player.y),length=Math.min(B.beaconPlacementRange,distance(context.player,context.aim));
      const wall=wallHit(context.player,direction,length);
      const travel=Math.max(0,Math.min(length,wall===null?length:wall-18));
      const position=moveWithCollision(context.player,{x:direction.x*travel,y:direction.y*travel},12);
      this.state.beacon={...point(position),id:`${rootId}:beacon`,organId:context.organId,born:context.elapsed,until:context.elapsed+config.duration,
        radius:config.radius,damage:config.damage,interval:config.interval,nextAttackAt:context.elapsed+.1,tuning:beacon.tuning};
      this.state.beaconReadyAt=context.elapsed+config.cooldown;
      const base={protocolId:'IMMUNE_BEACON' as const,rootId,organId:context.organId};
      commands.push({...base,kind:'organCost',amount:config.tissueCost},{...base,kind:'effect',effect:'scan',from:point(position),to:point(position),radius:config.radius,duration:.6},
        {kind:'log',type:'PROTOCOL_BEACON_CREATED',data:{protocolId:'IMMUNE_BEACON',rootId,x:position.x,y:position.y,duration:config.duration,cost:config.tissueCost,cooldown:config.cooldown}});
      this.remember('PROTOCOL_BEACON_CREATED',`免疫灯塔召集，组织承压 −${config.tissueCost}。`,context.elapsed);
    }
    const accepted=this.budget(context,commands);
    if(commands.length&&!accepted.length){this.state.marks=previous.marks;this.state.beacon=previous.beacon;this.state.beaconReadyAt=previous.readyAt;this.state.protocolHistory=previous.history;}
    return accepted;
  }
  onHit(context:GrowthContext,target:Target,origin:DamageOrigin={cause:'basic'}):GrowthCommand[] {
    this.observeTime(context.elapsed);
    if(this.state.ended||!context.active||origin.cause!=='basic'||target.hp<=0||context.tool===3)return[];
    const slot=this.equipped('PULSE_BREAK');if(!slot||context.rhythm!=='surge')return[];
    const config=PULSE_CONFIG[slot.tuning];if(distance(context.player,context.deviceOrigin)>config.deviceRange)return[];
    const cycle=Math.floor(context.elapsed/6);
    if(this.state.resonance.some(hit=>hit.targetId===target.id&&hit.organId===context.organId&&hit.cycle===cycle))return[];
    const rootId=origin.rootId??`${this.state.runId}:hit:${context.tick}:${target.id}`,base={protocolId:'PULSE_BREAK' as const,rootId,organId:context.organId};
    const commands:GrowthCommand[]=[{...base,kind:'expose',targetId:target.id,until:context.elapsed+config.exposeSeconds,revealUntil:context.elapsed+config.exposeSeconds},
      {...base,kind:'effect',effect:'evolution',from:point(target),to:point(target),radius:target.radius+12,duration:.35},
      {...base,kind:'damage',targetId:target.id,amount:config.bonusDamage,cause:'protocol',hop:0,allowChain:true},
      {kind:'log',type:'PROTOCOL_RESONANCE_HIT',data:{protocolId:'PULSE_BREAK',rootId,targetId:target.id,bonus:config.bonusDamage,exposeSeconds:config.exposeSeconds,cycle}}];
    const accepted=this.budget(context,commands);if(!accepted.length)return[];
    this.state.resonance.push({targetId:target.id,organId:context.organId,cycle});
    this.remember('PROTOCOL_RESONANCE_HIT',`节律共振：追加 ${config.bonusDamage}，破绽 ${config.exposeSeconds} 秒。`,context.elapsed);
    return accepted;
  }
  onKill(context:GrowthContext,target:Target,origin:DamageOrigin={cause:'basic'}):GrowthCommand[] {
    this.observeTime(context.elapsed);
    if(this.state.ended||!context.active||origin.cause==='protocol'&&!(origin.protocolId==='PULSE_BREAK'&&origin.allowChain))return[];
    const slot=this.equipped('PURIFY_CHAIN');if(!slot)return[];
    const rootId=origin.rootId??`${this.state.runId}:hit:${context.tick}:${target.id}`;
    if(this.state.chainRoots.includes(rootId))return[];
    const synergy=!!this.equipped('PULSE_BREAK')&&!!origin.wasPulseExposed;
    const config=CHAIN_CONFIG[slot.tuning],hops=Math.min(B.chainCap,config.jumps+(synergy?1:0));
    const visited=new Set([target.id]),commands:GrowthCommand[]=[];
    let from:Vec=target,actual=0;
    for(let hop=1;hop<=hops;hop++) {
      const next=stableNearest(from,context.targets.filter(t=>t.hp>0&&!visited.has(t.id)&&distance(from,t)<=config.range&&unobstructed(from,t)))[0];
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
    s.resonance=s.resonance.filter(hit=>hit.organId===context.organId&&hit.cycle===Math.floor(context.elapsed/6)&&liveIds.has(hit.targetId));
    if(!this.equipped('EXPOSE_TRACE'))s.marks=[];
    if(!this.equipped('IMMUNE_BEACON'))s.beacon=null;
    if(s.beacon&&(s.beacon.until<=context.elapsed||s.beacon.organId!==context.organId))s.beacon=null;
    const beacon=s.beacon;
    if(beacon&&context.elapsed+1e-9>=beacon.nextAttackAt) {
      // At most one attack per fixed update. No catch-up burst after pause or organ travel.
      beacon.nextAttackAt=context.elapsed+beacon.interval;
      const eligible=context.targets.filter(target=>target.hp>0&&distance(beacon,target)<=beacon.radius&&unobstructed(beacon,target));
      const traced=this.equipped('EXPOSE_TRACE')?eligible.filter(target=>s.marks.some(mark=>mark.targetId===target.id&&mark.organId===context.organId&&mark.until>context.elapsed)):[];
      const target=stableNearest(beacon,traced.length?traced:eligible)[0];
      if(target) {
        const rootId=`${beacon.id}:attack:${context.tick}`,base={protocolId:'IMMUNE_BEACON' as const,rootId,organId:context.organId};
        const commands:GrowthCommand[]=[{...base,kind:'effect',effect:'beam',from:point(beacon),to:point(target),radius:0,duration:.2},
          {...base,kind:'damage',targetId:target.id,amount:beacon.damage,cause:'protocol',hop:0},
          {kind:'log',type:'PROTOCOL_BEACON_HIT',data:{protocolId:'IMMUNE_BEACON',rootId,targetId:target.id,damage:beacon.damage,prioritizedTrace:traced.length>0}}];
        if(traced.length)commands.push({kind:'log',type:'PROTOCOL_SYNERGY',data:{pair:'EXPOSE_TRACE+IMMUNE_BEACON',rootId,targetId:target.id}});
        logs.push(...this.budget(context,commands));
      }
    }
    if(s.skippedCommands){logs.push({kind:'log',type:'PROTOCOL_BUDGET_SKIPPED',data:{tick:context.tick,skipped:s.skippedCommands,budget:B.commandBudget}});s.skippedCommands=0;}
    this.openNextLevel();
    // Draft-open logs are emitted in the same frame, before the host pauses for the draft.
    logs.push(...s.pendingLogs.splice(0).map(log=>({kind:'log' as const,...log})));
    return logs;
  }
}
