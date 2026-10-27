import { distance, moveWithCollision, normalized } from '../actors/collision';
import { BALANCE, activeWorld, type GameEvent, type GameState, type MessagePriority, type Target, type Vec } from './types';
import type { OrganId, OrganNode } from './battleTypes';
import { CAMPAIGN_BALANCE as B, createOrganArena, getOrganDefinition } from './organConfig';
import { advanceLungFlow, toggleAirway } from './organRules';
import type { CampaignCommand, CampaignInteraction, CampaignNode, CampaignState, MigrationChoice, OrganArena } from './campaignTypes';
import { advanceCampaignEncounters, campaignEncounterObjective, createCampaignEncounters, recordCampaignEncounterEvent } from './campaignEncounters';

export type { CampaignCommand, CampaignState, OrganArena } from './campaignTypes';

const point=(value:Vec):Vec=>({x:value.x,y:value.y});
const sourceKey=(organ:OrganId,id:string):string=>`${organ}:${id}`;
const findExit=(arena:OrganArena):OrganNode|undefined=>arena.graph.nodes.find(node=>node.kind==='exit');

/** Stores local arenas; global health, adaptation and growth stay in the one GameSession. */
export class CampaignDirector {
  readonly state:CampaignState;

  constructor(seed:number,game:GameState){
    if(!game.battle)throw new Error('A campaign requires an initialized shared battle');
    const heart=createOrganArena('heart',seed);
    heart.targets=game.targets;heart.tissue=game.tissue;heart.terminal=game.terminal;heart.graph=game.battle.graph;heart.pulse=game.battle.pulse;
    heart.nextSpawnAt=game.battle.nextSpawnAt;heart.gateChangedAt=game.battle.gateChangedAt;heart.organLowSince=game.battle.organLowSince;
    if(!findExit(heart))heart.graph.nodes.push({id:'exit',kind:'exit',...getOrganDefinition('heart').exit,active:false,infected:false});
    else findExit(heart)!.active=false;
    const lung=createOrganArena('lung',seed);
    this.state={seed:seed>>>0,activeOrganId:'heart',arenas:{heart,lung},phase:'contain',travelReadyAt:0,
      migration:{id:`migration:${seed>>>0}:1`,status:'locked',from:'heart',to:'lung',warnedAt:0,deadline:0,choice:null,resolvedAt:null,blockStartedAt:null,carrierIds:[],clearedCarrierIds:[],interceptUntil:null,interceptSucceeded:null,interceptResolvedAt:null},
      core:{status:'locked',organId:'heart',actorId:'mother-core',traits:[],clearedAt:null},
      requiredSourceIds:{heart:heart.graph.nodes.filter(node=>node.kind==='source').map(node=>node.id),lung:lung.graph.nodes.filter(node=>node.kind==='source').map(node=>node.id)},
      clearedSourceIds:[],clearedEliteIds:[],transactionIds:[],pendingCommands:[],history:[],
      progress:{sourceClears:0,sourceTotal:2,eliteClears:0,coreCleared:false,organConditions:true,infectionCondition:game.battle.pressure.infection<35},
      stats:{travels:0,airwayUses:0,backgroundDamage:0,migrationChoice:null}};
    if(game.battle.encounter?.configId==='campaign-1'){
      this.state.encounters=createCampaignEncounters(game.elapsed);
      this.state.encounters.currentObjective=campaignEncounterObjective(this.state,game);
      this.state.pendingCommands.push(this.log('CAMPAIGN_STAGE_ENTERED',{stage:'I',at:game.elapsed,targetId:''}));
    }
    game.world=heart.geometry;game.battle.organId='heart';
  }

  private notice(text:string,game:GameState,seconds=5,priority:MessagePriority=1):CampaignCommand {
    this.state.history.push({at:game.elapsed,text});if(this.state.history.length>128)this.state.history.shift();
    return{kind:'notice',text,seconds,priority};
  }
  private log(type:string,data:GameEvent['data']):CampaignCommand{return{kind:'log',type,data};}

  /** Refreshes array references after shared corpse filtering; it never clones or respawns a world. */
  captureCurrent(game:GameState):void {
    const battle=game.battle;if(!battle)return;
    const arena=this.state.arenas[battle.organId];
    arena.targets=game.targets;arena.tissue=game.tissue;arena.terminal=game.terminal;arena.graph=battle.graph;arena.pulse=battle.pulse;
    arena.nextSpawnAt=battle.nextSpawnAt;arena.gateChangedAt=battle.gateChangedAt;arena.organLowSince=battle.organLowSince;arena.geometry=activeWorld(game);
    this.state.activeOrganId=battle.organId;
  }

  recordEvent(event:GameEvent,game:GameState):void {
    if(!game.battle)return;
    if(event.type==='RUN_ENDED'){this.state.pendingCommands=[];return;}
    const data=event.data,organ:OrganId=data.organId==='lung'?'lung':data.organId==='heart'?'heart':game.battle.organId;
    if(event.type==='TARGET_CLEARED'&&this.state.migration.carrierIds.includes(String(data.id))&&!this.state.migration.clearedCarrierIds.includes(String(data.id)))this.state.migration.clearedCarrierIds.push(String(data.id));
    if(event.type==='INFECTION_SOURCE_CLEARED'){
      const id=String(data.nodeId??data.id??'');const key=sourceKey(organ,id);
      if(id&&!this.state.clearedSourceIds.includes(key))this.state.clearedSourceIds.push(key);
    }else if(event.type==='ELITE_CLEARED'){
      const id=String(data.id??'');const key=sourceKey(organ,id);
      if(id&&!this.state.clearedEliteIds.includes(key))this.state.clearedEliteIds.push(key);
    }else if((event.type==='TARGET_CLEARED'&&data.id===this.state.core.actorId)||event.type==='CORE_CLEARED'&&(data.coreId===this.state.core.actorId||data.actorId===this.state.core.actorId)){
      if(this.state.core.status==='cleared')return;
      this.state.core.status='cleared';this.state.core.clearedAt=game.elapsed;this.state.phase='retest';
      this.state.pendingCommands.push(this.log('CAMPAIGN_CORE_CLEARED',{coreId:this.state.core.actorId,organId:organ}),this.notice('母巢已净化。检查所有激活器官 ≥50%、感染 <35，再到复测终端按 E。',game,7));
    }
    this.state.pendingCommands.push(...recordCampaignEncounterEvent(this.state,event,game));
  }

  beforeInput(game:GameState):CampaignCommand[] {
    if(game.phase!=='playing'||game.battle?.organId!=='lung')return[];
    const flow=this.state.arenas.lung.flow!;
    const commands=advanceLungFlow(flow,game);
    game.battle.pulse.phase=flow.phase==='inhale'?'charge':'surge';
    game.battle.pulse.phaseRemaining=flow.phaseRemaining;
    game.battle.pulse.cycleIndex=Math.floor(game.elapsed/(B.inhaleDuration+B.exhaleDuration));
    return commands;
  }

  isMigratingActor(id:string):boolean {
    return this.state.migration.status==='pursuing'&&this.state.migration.carrierIds.includes(id);
  }

  private reserveSource(organId:OrganId,id:string,position:Vec,eventId:string):CampaignCommand {
    if(!this.state.requiredSourceIds[organId].includes(id))this.state.requiredSourceIds[organId].push(id);
    return{kind:'spawnSource',organId,id,position:point(position),hp:B.migratedSourceHp,connectTo:organId==='heart'?'valve':'airway',eventId};
  }

  private planTravel(to:OrganId,game:GameState,eventId:string):CampaignCommand[] {
    const from=game.battle!.organId;
    if(from===to)return[];
    if(game.elapsed+1e-9<this.state.travelReadyAt)return[this.notice(`器官通行冷却还需 ${(this.state.travelReadyAt-game.elapsed).toFixed(1)} 秒。`,game,2)];
    this.state.travelReadyAt=game.elapsed+B.travelCooldown;
    return[{kind:'travel',from,to,entry:point(getOrganDefinition(to).entry),eventId}];
  }

  private resolveChoice(choice:MigrationChoice,game:GameState):CampaignCommand[] {
    const migration=this.state.migration;
    if(migration.choice!==null)return[];
    migration.choice=choice;migration.resolvedAt=game.elapsed;migration.blockStartedAt=null;
    this.state.stats.migrationChoice=choice;this.state.phase='counterattack';
    const commands:CampaignCommand[]=[this.log('MIGRATION_DECIDED',{eventId:migration.id,choice,from:'heart',to:'lung',at:game.elapsed})];
    if(choice==='block'){
      migration.status='resolved';migration.interceptSucceeded=true;migration.interceptResolvedAt=game.elapsed;
      this.state.core.organId='heart';
      commands.push({kind:'setRoute',organId:'heart',nodeId:'gate',open:false,eventId:`${migration.id}:block-route`},
        this.reserveSource('heart','heart-retained-source',getOrganDefinition('heart').retainedSource,`${migration.id}:retained-source`),
        {kind:'organDamage',organId:'heart',amount:B.blockOrganCost,reason:'migration-block-pressure',eventId:`${migration.id}:block-cost`},
        {kind:'infectionDelta',amount:B.blockInfection,reason:'migration-retained',eventId:`${migration.id}:retained-load`},
        this.notice('迁移已封锁：肺部未被激活。病毒滞留为心脏新感染源，组织承压 −4；清除它后在心脏迎战母巢。',game,8));
    }else{
      const lung=this.state.arenas.lung;if(!lung.activated)lung.lastPressureAt=game.elapsed;lung.activated=true;lung.nextBackgroundAt=game.elapsed+Math.max(0,lung.nextBackgroundElapsed-lung.offscreenElapsed);lung.departedAt=game.elapsed;
      this.state.core.organId='lung';
      if(choice==='ignore'){
        migration.status='resolved';migration.interceptSucceeded=false;migration.interceptResolvedAt=game.elapsed;
        commands.push(this.reserveSource('lung','lung-migrated-source',getOrganDefinition('lung').migratedSource,`${migration.id}:migrated-source`),
          {kind:'organDamage',organId:'lung',amount:B.ignoreOrganCost,reason:'migration-established',eventId:`${migration.id}:ignore-cost`},
          {kind:'infectionDelta',amount:B.ignoreInfection,reason:'migration-established',eventId:`${migration.id}:ignore-load`},
          this.notice('迁移群在肺部建立感染源：肺部完整度 −10，感染 +8。出口保持开放，及时前往救援仍可挽回。',game,8));
      }else{
        migration.status='pursuing';migration.interceptUntil=game.elapsed+B.interceptDuration;
        migration.carrierIds=Array.from({length:3},(_,index)=>`migration-carrier-${index}`);
        const positions=getOrganDefinition('lung').carrierStarts;
        for(let index=0;index<3;index++){
          const position=moveWithCollision(positions[index],{x:0,y:0},18,lung.geometry);
          const target:Target={...point(position),id:migration.carrierIds[index],kind:'single',role:'virus',radius:18,hp:B.carrierHp,maxHp:B.carrierHp,
            hitUntil:0,scanned:false,traits:[...(game.battle!.traits.slice(-1))],facing:0,born:game.elapsed,generation:1,sourceId:'migration',attackReady:game.elapsed+B.interceptDuration+1};
          commands.push({kind:'spawnActor',organId:'lung',target,eventId:`${migration.id}:carrier:${index}`});
        }
        commands.push(...this.planTravel('lung',game,`${migration.id}:pursue-travel`),this.notice('追击进入肺部：12 秒内清除 3 个迁移小体可阻止新源。气流会改变它们的位置；心脏残留风险继续低频结算。',game,8));
      }
    }
    return commands;
  }

  chooseMigration(choice:MigrationChoice,eventId:string,game:GameState):CampaignCommand[] {
    const migration=this.state.migration;
    if(game.phase!=='playing'||eventId!==migration.id||migration.choice!==null||!['warning','blocking'].includes(migration.status))return[];
    if(choice==='ignore')return this.resolveChoice('ignore',game);
    if(game.elapsed>migration.deadline+1e-9)return[];
    if(choice==='pursue'){
      const exit=findExit(this.state.arenas.heart);
      if(game.battle!.organId!=='heart'||!exit?.active||distance(game.player,exit)>BALANCE.interactionRange)return[];
      return this.resolveChoice('pursue',game);
    }
    const gate=this.state.arenas.heart.graph.nodes.find(node=>node.id==='gate');
    if(game.battle!.organId!=='heart'||!gate||distance(game.player,gate)>BALANCE.interactionRange)return[];
    if(migration.status==='blocking')return[];
    if(game.elapsed+B.blockDuration>migration.deadline+1e-9)return[this.notice('封锁需要 2 秒，当前时间不足；可以追击或准备肺部救援。',game,3)];
    migration.status='blocking';migration.blockStartedAt=game.elapsed;
    return[this.log('MIGRATION_BLOCK_STARTED',{eventId:migration.id,completeAt:game.elapsed+B.blockDuration}),this.notice('保持在隔离闸附近 2 秒完成封锁。离开范围会取消；战斗仍在进行。',game,3)];
  }

  interact(node:CampaignNode,game:GameState):CampaignInteraction {
    if(game.phase!=='playing'||!game.battle)return{handled:true,commands:[]};
    if(distance(game.player,node)>BALANCE.interactionRange)return{handled:true,commands:[this.notice('请靠近器官装置再按 E。',game,2)]};
    const migration=this.state.migration;
    if(node.kind==='retest'){
      if(this.state.core.status==='ready'){
        if(game.battle.organId!==this.state.core.organId)return{handled:true,commands:[this.notice(`母巢位于${this.state.core.organId==='lung'?'肺部':'心脏'}，前往该器官的复测台启动最终诊断。`,game,5)]};
        this.state.core.status='active';this.state.phase='core';this.state.core.traits=[...game.battle.traits.slice(0,2)];
        return{handled:true,commands:[{kind:'spawnCore',organId:this.state.core.organId,coreId:this.state.core.actorId,position:point(getOrganDefinition(this.state.core.organId).corePosition),traits:[...this.state.core.traits],eventId:`core-spawn:${this.state.seed}`},
          this.log('CORE_AWAKEN_REQUESTED',{coreId:this.state.core.actorId,organId:this.state.core.organId,traits:this.state.core.traits.join('+')}),this.notice('母巢被唤醒：它将交替使用本局两种特性。读清前摇，利用基础弱点与器官环境。',game,7)]};
      }
      if(this.canRetest(game))return{handled:true,commands:[{kind:'retest',success:true,reason:'母巢已清除，所有激活器官完整度 ≥50%，感染负荷 <35%，主动复测通过。'}]};
      return{handled:true,commands:[this.notice(`复测未通过：${this.retestReasons(game).join('；')}。`,game,6)]};
    }
    if(node.kind==='exit'){
      if(!node.active||migration.status==='locked')return{handled:true,commands:[this.notice('器官出口将在第二次变异后开放。先处理感染源与进化精英。',game,4)]};
      if(game.battle.organId==='heart'&&migration.choice===null)return{handled:true,commands:this.chooseMigration('pursue',migration.id,game)};
      return{handled:true,commands:this.planTravel(game.battle.organId==='heart'?'lung':'heart',game,`travel:${this.state.seed}:${game.tick}`)};
    }
    if(game.battle.organId==='heart'&&node.id==='gate'&&migration.choice===null&&['warning','blocking'].includes(migration.status))return{handled:true,commands:this.chooseMigration('block',migration.id,game)};
    if(game.battle.organId==='heart'&&node.id==='gate'&&migration.choice==='block')return{handled:true,commands:[this.notice('迁移封锁已完成，隔离闸维持关闭；器官旅行出口仍可通行。',game,3)]};
    if(game.battle.organId==='lung'&&(node.id==='airway'||node.kind==='valve'||node.kind==='gate')){
      const commands=toggleAirway(this.state.arenas.lung.flow!,game);
      if(commands.some(command=>command.kind==='setRoute'))this.state.stats.airwayUses++;
      return{handled:true,commands};
    }
    return{handled:false,commands:[]};
  }

  /** Called by the host only after same-tick damage/failure checks accept the travel intent. */
  applyTravel(command:Extract<CampaignCommand,{kind:'travel'}>,game:GameState):boolean {
    if(game.phase!=='playing'||!game.battle||game.battle.organId!==command.from||game.player.hp<=0||game.battle.pressure.vitality<=0)return false;
    const key=`applied:${command.eventId}`;if(this.state.transactionIds.includes(key))return false;
    this.accrueOffscreen(game.elapsed,command.from);
    this.captureCurrent(game);
    const previous=this.state.arenas[command.from];previous.departedAt=game.elapsed;previous.nextBackgroundAt=game.elapsed+Math.max(0,previous.nextBackgroundElapsed-previous.offscreenElapsed);previous.backgroundLoss=0;
    const arena=this.state.arenas[command.to],wasActivated=arena.activated,departedAt=arena.departedAt;
    arena.activated=true;arena.departedAt=null;
    for(const target of arena.targets){
      if(target.hp>0){target.attackAt=undefined;target.attackAim=undefined;target.attackTarget=undefined;target.attackReady=Math.max(target.attackReady??0,game.elapsed+B.returnAttackGrace);}
      if(target.splitAt!==undefined&&departedAt!==null){target.splitAt=game.elapsed+Math.max(.3,target.splitAt-departedAt);target.deadAt=game.elapsed;}
      if(!wasActivated&&target.role==='virus'&&!(target.traits?.length)){target.traits=game.battle.traits.length?[game.battle.traits.at(-1)!]:[];target.kind=target.traits.includes('FISSION')?'cluster':'single';}
    }
    for(const id of Object.keys(arena.nextSpawnAt))arena.nextSpawnAt[id]=Math.max(arena.nextSpawnAt[id],game.elapsed+.75);
    for(const edge of arena.graph.edges)edge.nextSpread=Math.max(edge.nextSpread,game.elapsed+.75);
    game.targets=arena.targets;game.tissue=arena.tissue;game.terminal=arena.terminal;game.world=arena.geometry;
    game.battle.organId=command.to;game.battle.graph=arena.graph;game.battle.pulse=arena.pulse;game.battle.nextSpawnAt=arena.nextSpawnAt;game.battle.gateChangedAt=arena.gateChangedAt;game.battle.organLowSince=arena.organLowSince;
    const entry=moveWithCollision(command.entry,{x:0,y:0},game.player.radius,arena.geometry);
    game.player.x=entry.x;game.player.y=entry.y;game.player.moving=false;game.player.dashUntil=game.elapsed;
    game.effects=[];game.scanUntil=Math.min(game.scanUntil,game.elapsed);
    // Temporary cells belong to the departed chamber. Remove them in the same
    // accepted travel transaction while preserving the global summon cooldown.
    if(game.growth){game.growth.beacon=null;game.growth.cells=[];}
    this.state.activeOrganId=command.to;this.state.stats.travels++;this.state.transactionIds.push(key);
    const crisis=this.state.encounters?.crisis;
    if(crisis?.status==='charging'){crisis.lastActiveAt=null;crisis.nextImpactAt=null;}
    this.state.pendingCommands.push(this.log('ORGAN_TRAVELLED',{from:command.from,to:command.to,eventId:command.eventId,backgroundLoss:arena.backgroundLoss}),this.notice(`进入${command.to==='lung'?'肺部：吸气聚拢、呼气分散；E 气道会实际截流':'心脏：定向冲流可破开晶壳'}。${arena.backgroundLoss>0?`离场损伤 ${arena.backgroundLoss.toFixed(1)}，原因：${arena.backgroundReason}。`:''}`,game,6));
    return true;
  }

  acknowledgeCoreSpawn(coreId:string,accepted:boolean):void {
    if(coreId===this.state.core.actorId&&this.state.core.status==='active'&&!accepted){this.state.core.status='ready';this.state.phase='core-ready';}
  }

  private updateMigration(game:GameState):CampaignCommand[] {
    const migration=this.state.migration,commands:CampaignCommand[]=[];
    const firstCounter=game.battle!.encounter?.firstCounter;
    const counterAccepted=this.state.encounters?firstCounter?.status==='resolved'&&!!firstCounter.targetId&&this.state.clearedEliteIds.includes(`heart:${firstCounter.targetId}`):game.battle!.stats.eliteClears>=1;
    if(migration.status==='locked'&&game.battle!.traits.length>=2&&counterAccepted){
      const exit=findExit(this.state.arenas.heart);if(!exit)return[];
      exit.active=true;migration.warnedAt=game.elapsed;migration.deadline=game.elapsed+B.migrationWarning;
      const gate=this.state.arenas.heart.graph.nodes.find(node=>node.id==='gate');
      if(gate&&!gate.active){commands.push(this.log('MIGRATION_PREEMPTIVELY_BLOCKED',{eventId:migration.id}),...this.resolveChoice('block',game));}
      else{migration.status='warning';this.state.phase='migration';commands.push(this.log('MIGRATION_WARNING',{eventId:migration.id,from:'heart',to:'lung',deadline:migration.deadline}),this.notice('病毒向肺部迁移：12 秒。出口 E 追击；心脏隔离闸 E 保持 2 秒封锁；不响应则肺部建立新源。',game,12));}
    }
    if(migration.status==='blocking'){
      const gate=this.state.arenas.heart.graph.nodes.find(node=>node.id==='gate');
      if(game.battle!.organId!=='heart'||!gate||distance(game.player,gate)>BALANCE.interactionRange){migration.status='warning';migration.blockStartedAt=null;commands.push(this.log('MIGRATION_BLOCK_CANCELLED',{eventId:migration.id}),this.notice('已离开隔离闸，封锁取消；迁移倒数继续。',game,3,2));}
      else if(migration.blockStartedAt!==null&&game.elapsed+1e-9>=migration.blockStartedAt+B.blockDuration&&migration.blockStartedAt+B.blockDuration<=migration.deadline+1e-9)commands.push(...this.resolveChoice('block',game));
    }
    if(['warning','blocking'].includes(migration.status)&&migration.choice===null&&game.elapsed+1e-9>=migration.deadline)commands.push(...this.resolveChoice('ignore',game));
    if(migration.status==='pursuing'){
      const lung=this.state.arenas.lung,carriers=lung.targets.filter(target=>migration.carrierIds.includes(target.id));
      const alive=carriers.filter(target=>target.hp>0);
      const atGoal=alive.some(target=>distance(target,getOrganDefinition('lung').migrationGoal)<42)&&lung.flow!.airwayOpen;
      const expired=game.elapsed+1e-9>=(migration.interceptUntil??Infinity);
      const removed=migration.carrierIds.length>0&&migration.carrierIds.every(id=>migration.clearedCarrierIds.includes(id));
      if(removed||expired||atGoal){
        migration.status='resolved';migration.interceptResolvedAt=game.elapsed;migration.interceptSucceeded=removed||!lung.flow!.airwayOpen;
        if(migration.interceptSucceeded)commands.push(this.log('MIGRATION_INTERCEPTED',{eventId:migration.id,by:removed?'clear':'closed-airway'}),this.notice('迁移被拦截，肺部未建立额外感染源。继续净化已有感染源并保护器官。',game,6));
        else commands.push(this.reserveSource('lung','lung-migrated-source',getOrganDefinition('lung').migratedSource,`${migration.id}:pursuit-missed-source`),{kind:'infectionDelta',amount:5,reason:'migration-intercept-missed',eventId:`${migration.id}:pursuit-missed-load`},this.log('MIGRATION_ESTABLISHED',{eventId:migration.id,reason:atGoal?'arrived':'intercept-expired'}),this.notice('未能及时拦截，迁移群在肺部建立新源。仍可净化该源挽回。',game,6));
      }else if(game.battle!.organId==='lung'&&lung.flow!.airwayOpen){
        const goal=getOrganDefinition('lung').migrationGoal;
        for(const target of alive){const direction=normalized(goal.x-target.x,goal.y-target.y);commands.push({kind:'moveActor',organId:'lung',targetId:target.id,delta:{x:direction.x*B.carrierSpeed*BALANCE.step,y:direction.y*B.carrierSpeed*BALANCE.step}});}
      }
    }
    return commands;
  }

  private accrueOffscreen(elapsed:number,activeOrganId:OrganId):void {
    for(const arena of Object.values(this.state.arenas)){
      const delta=Math.max(0,elapsed-arena.lastPressureAt);
      if(arena.activated&&arena.organId!==activeOrganId)arena.offscreenElapsed+=delta;
      arena.lastPressureAt=elapsed;
    }
  }

  private background(game:GameState):CampaignCommand[] {
    const commands:CampaignCommand[]=[];
    this.accrueOffscreen(game.elapsed,game.battle!.organId);
    for(const arena of Object.values(this.state.arenas)){
      if(!arena.activated||arena.organId===game.battle!.organId)continue;
      arena.nextBackgroundAt=game.elapsed+Math.max(0,arena.nextBackgroundElapsed-arena.offscreenElapsed);
      if(arena.offscreenElapsed+1e-9<arena.nextBackgroundElapsed)continue;
      arena.nextBackgroundElapsed=arena.offscreenElapsed+B.backgroundInterval;
      arena.nextBackgroundAt=game.elapsed+B.backgroundInterval;
      const openSources=arena.graph.nodes.filter(node=>node.kind==='source'&&node.active&&arena.graph.edges.some(edge=>edge.from===node.id&&edge.open)).length;
      if(!openSources)continue;
      const amount=Math.min(B.backgroundDamage,openSources*.35,Math.max(0,B.backgroundTripBudget-arena.backgroundLoss),Math.max(0,arena.tissue.hp));
      const eventId=`background:${arena.organId}:${game.tick}`;
      if(amount>0){arena.backgroundLoss+=amount;arena.totalBackgroundLoss+=amount;arena.backgroundReason='残留感染源沿开放通路侵蚀';this.state.stats.backgroundDamage+=amount;commands.push({kind:'organDamage',organId:arena.organId,amount,reason:'offscreen-open-sources',eventId});}
      commands.push({kind:'infectionDelta',amount:Math.min(B.backgroundInfection,openSources*.35),reason:`offscreen-${arena.organId}`,eventId:`${eventId}:load`},this.log('BACKGROUND_PRESSURE',{organId:arena.organId,openSources,integrityLoss:amount,tripLoss:arena.backgroundLoss,totalLoss:arena.totalBackgroundLoss,reason:arena.backgroundReason}));
    }
    return commands;
  }

  private sourcesComplete():boolean {
    return Object.values(this.state.arenas).filter(arena=>arena.activated).every(arena=>this.state.requiredSourceIds[arena.organId].every(id=>this.state.clearedSourceIds.includes(sourceKey(arena.organId,id))));
  }

  retestReasons(game:GameState):string[] {
    const reasons:string[]=[];
    if(this.state.core.status!=='cleared')reasons.push('尚未清除母巢');
    for(const arena of Object.values(this.state.arenas))if(arena.activated&&arena.tissue.hp<50)reasons.push(`${arena.organId==='heart'?'心脏':'肺部'}完整度 ${Math.ceil(arena.tissue.hp)}%，需 ≥50%`);
    if(game.battle!.pressure.infection>=35)reasons.push(`感染 ${Math.ceil(game.battle!.pressure.infection)}%，需 <35%`);
    if(game.player.hp<=0)reasons.push('战士耐久已耗尽');if(game.battle!.pressure.vitality<=0)reasons.push('全身稳定已耗尽');
    return reasons;
  }
  canRetest(game:GameState):boolean{return this.retestReasons(game).length===0;}

  private objectives(game:GameState):CampaignCommand[] {
    const s=this.state,battle=game.battle!,commands:CampaignCommand[]=[];
    const active=Object.values(s.arenas).filter(arena=>arena.activated);
    const sourceTotal=active.reduce((sum,arena)=>sum+s.requiredSourceIds[arena.organId].length,0);
    const sourceClears=active.reduce((sum,arena)=>sum+s.requiredSourceIds[arena.organId].filter(id=>s.clearedSourceIds.includes(sourceKey(arena.organId,id))).length,0);
    s.progress={sourceClears,sourceTotal,eliteClears:s.clearedEliteIds.length,coreCleared:s.core.status==='cleared',organConditions:active.every(arena=>arena.tissue.hp>=50),infectionCondition:battle.pressure.infection<35};
    if(s.core.status==='locked'&&s.migration.status==='resolved'&&battle.traits.length===2&&s.clearedEliteIds.length>=2&&this.sourcesComplete()&&(!s.encounters||s.encounters.stages.IV.completedAt!==null)){
      s.core.status='ready';s.core.traits=[...battle.traits];s.phase='core-ready';
      commands.push(this.log('CORE_LOCATED',{coreId:s.core.actorId,organId:s.core.organId,traits:s.core.traits.join('+')}),this.notice(`主要感染源已净化。前往${s.core.organId==='lung'?'肺部':'心脏'}复测台按 E，唤醒本局双特性母巢。`,game,8));
    }
    battle.readyToRetest=this.canRetest(game);
    if(s.encounters){
      const stage=s.encounters.stage;
      s.phase=stage==='I'?'contain':stage==='II'?'first-counter':stage==='III'?'migration':stage==='IV'?'organ-crisis':s.core.status==='cleared'?'retest':s.core.status==='active'?'core':s.core.status==='ready'?'core-ready':'counterattack';
      battle.stage=({I:0,II:1,III:2,IV:3,V:4} as const)[stage];
      battle.stageLabel=({I:'Ⅰ · 建立防线',II:'Ⅱ · 首次反制',III:'Ⅲ · 跨器官危机',IV:'Ⅳ · 支点反击',V:s.core.status==='cleared'?'Ⅴ · 稳定复测':'Ⅴ · 母巢决战'} as const)[stage];
      s.encounters.currentObjective=campaignEncounterObjective(s,game);
      battle.objective=s.encounters.currentObjective;
      return commands;
    }
    battle.stage=s.phase==='contain'?0:s.phase==='migration'?2:s.phase==='counterattack'?3:s.phase==='core-ready'||s.phase==='core'?4:5;
    battle.stageLabel=({contain:'Ⅰ · 建立防线','first-counter':'Ⅱ · 首次反制',migration:'Ⅲ · 跨器官危机','organ-crisis':'Ⅳ · 支点反击',counterattack:'Ⅳ · 联动反击','core-ready':'Ⅴ · 母巢定位',core:'Ⅴ · 核心决战',retest:'Ⅵ · 稳定复测'} as const)[s.phase];
    battle.objective=battle.readyToRetest?'母巢与器官指标达标。靠近当前器官复测终端按 E，完成本局。':s.core.status==='cleared'?`稳定器官后复测：${this.retestReasons(game).join('；')}`:s.core.status==='ready'?`前往${s.core.organId==='lung'?'肺部':'心脏'}复测台按 E，启动母巢诊断。`:s.core.status==='active'?`清除${s.core.organId==='lung'?'肺部':'心脏'}母巢；留意本局 ${battle.traits.join(' + ')} 的组合与破绽。`:s.migration.status==='warning'||s.migration.status==='blocking'?'12 秒迁移抉择：出口 E 追击；隔离闸 E 停留 2 秒封锁；放任会感染肺部。':s.migration.status==='pursuing'?'在肺部拦截迁移小体，或关闭气道阻止立源；随后清除主要感染源。':`净化主要感染源 ${sourceClears}/${sourceTotal}，变异精英 ${s.clearedEliteIds.length}/2；保护所有激活器官。`;
    return commands;
  }

  afterInput(game:GameState):CampaignCommand[] {
    if(game.phase!=='playing'||!game.battle||game.player.hp<=0||game.battle.pressure.vitality<=0)return[];
    this.captureCurrent(game);
    const commands=this.state.pendingCommands.splice(0);
    commands.push(...this.updateMigration(game),...this.background(game),...advanceCampaignEncounters(this.state,game),...this.objectives(game));
    return commands;
  }
}
