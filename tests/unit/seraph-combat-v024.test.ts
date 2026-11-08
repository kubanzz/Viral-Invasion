import { describe,expect,it } from 'vitest';
import { advanceImmuneCells,summonImmuneCells,type ImmuneCellState } from '../../src/game/immuneCells';
import { GrowthController,growthContext } from '../../src/game/growth';
import { GameSession } from '../../src/game/session';
import type { BeaconState,GrowthCommand,GrowthContext } from '../../src/game/growthTypes';
import { seraphCellIndex,seraphStrikeHits,type SeraphAction } from '../../src/game/seraphCombat';
import { isLegalPosition,distance } from '../../src/actors/collision';
import { measureLegion } from '../../scripts/measure-seraph-v024';
import type { GameEvent,Target } from '../../src/game/types';
import type { LegionId } from '../../src/game/legionCatalog';

function fixture(core=false) {
  const target:Target={id:'target',x:700,y:500,radius:28,hp:10000,maxHp:10000,kind:'single',role:core?'core':'source',hitUntil:0,scanned:false};
  const context:GrowthContext={tick:0,elapsed:0,organId:'heart',active:true,endless:true,mission:true,rhythm:'rest',player:{x:500,y:500},aim:target,
    deviceOrigin:{x:500,y:500},tissue:{x:300,y:700,radius:40,hp:100,maxHp:100},targets:[target],tool:1,
    geometry:{width:1800,height:1200,bounds:{left:20,right:1780,top:20,bottom:1180},obstacles:[],foreground:{x:0,y:0,width:0,height:0}}};
  const beacon:BeaconState={id:'seraph',organId:'heart',x:500,y:500,born:0,until:Infinity,radius:250,damage:24,interval:.8,nextAttackAt:0,
    mode:'protocol',tuning:'balanced',rank:1,cellCount:4,legionId:'seraph',fed:true,focus:{targetId:target.id,until:20}};
  let cells=summonImmuneCells(beacon,context,4),commands:GrowthCommand[]=[];
  const step=(ticks=1)=>{const current:GrowthCommand[]=[];for(let i=0;i<ticks;i++){
    context.tick++;context.elapsed=context.tick/60;
    const result=advanceImmuneCells(cells,beacon,context);cells=result.cells;commands.push(...result.commands);current.push(...result.commands);
  }return current;};
  return {target,context,beacon,get cells(){return cells;},set cells(value:ImmuneCellState[]){cells=value;},commands,step};
}
const releases=(commands:GrowthCommand[])=>commands.filter(command=>command.kind==='log'&&command.type==='LEGION_SERAPH_RELEASED');
const damage=(commands:GrowthCommand[])=>commands.filter(command=>command.kind==='damage');

describe('v0.24 seraph distinct, physical classes',()=>{
  it('uses real commander alternation, two side charges and a split-budget three-ray volley',()=>{
    const f=fixture();f.step(240);
    expect(f.cells.map(cell=>cell.seraphRole)).toEqual(['commander','lancer','lancer','prism']);
    const events=releases(f.commands).map(command=>command.kind==='log'?command.data:{});
    expect(new Set(events.map(event=>event.attack))).toEqual(new Set(['thrust','cleave','flank','prism']));
    const prismEvents=events.filter(event=>event.role==='prism');
    const first=prismEvents.filter(event=>event.actionId===prismEvents[0].actionId);
    expect(first.map(event=>event.part)).toEqual([0,1,2]);
    const rayDamage=damage(f.commands).filter(command=>command.kind==='damage'&&command.seraphStrike?.actionId===first[0].actionId);
    expect(rayDamage).toHaveLength(3);
    expect(rayDamage.reduce((sum,command)=>sum+(command.kind==='damage'?command.amount:0),0)).toBeCloseTo(f.cells[3].damage);
    expect(f.target.hp).toBe(10000); // planners never write enemy HP
    expect(events.filter(event=>event.attack==='flank').some(event=>Math.hypot(Number(event.x)-Number(event.fromX),Number(event.y)-Number(event.fromY))>20)).toBe(true);
  });

  it('keeps prism at midrange, freezes aim and actually misses a target that moves during windup',()=>{
    const f=fixture();f.cells=[f.cells[3]];
    for(let i=0;i<120&&!f.cells[0].seraphAction;i++)f.step();
    const action=structuredClone(f.cells[0].seraphAction!);
    expect(action.kind).toBe('prism');expect(distance(f.cells[0],f.target)).toBeGreaterThanOrEqual(130);
    expect(distance(f.cells[0],f.target)).toBeLessThanOrEqual(230);
    f.target.y+=110;f.commands.length=0;f.step(40);
    const first=damage(f.commands).filter(command=>command.kind==='damage'&&command.seraphStrike?.actionId===action.actionId);
    expect(first).toHaveLength(0);
    expect(releases(f.commands).filter(command=>command.kind==='log'&&command.data.actionId===action.actionId)).toHaveLength(3);
  });

  it('clips prism rays to cover and constrains each dash to real legal displacement',()=>{
    const f=fixture();f.cells=[f.cells[3]];
    for(let i=0;i<120&&!f.cells[0].seraphAction;i++)f.step();
    const from={...f.cells[0]},id=f.cells[0].seraphAction!.actionId;
    f.context.geometry!.obstacles=[{id:'new-cover',x:(from.x+f.target.x)/2,y:(from.y+f.target.y)/2,radius:35}];
    f.commands.length=0;f.step(38);
    expect(damage(f.commands).filter(command=>command.kind==='damage'&&command.seraphStrike?.actionId===id)).toHaveLength(0);
    const ray=releases(f.commands).find(command=>command.kind==='log'&&command.data.actionId===id)!;
    expect(ray.kind==='log'&&distance({x:Number(ray.data.fromX),y:Number(ray.data.fromY)},{x:Number(ray.data.x),y:Number(ray.data.y)})).toBeLessThan(120);
    const g=fixture();g.context.geometry!.obstacles=[{id:'fold',x:600,y:500,radius:28}];
    for(let i=0;i<300;i++) {
      const previous=g.cells.map(cell=>({...cell}));g.step();
      for(const cell of g.cells){expect(isLegalPosition(cell,cell.radius,g.context.geometry)).toBe(true);
        expect(distance(cell,previous.find(old=>old.id===cell.id)!)).toBeLessThanOrEqual(640/60+1e-6);}
    }
  });

  it('pauses without action advancement, deep clones rejected planning state and never catches up a volley',()=>{
    const f=fixture();f.cells=[f.cells[3]];
    for(let i=0;i<120&&!f.cells[0].seraphAction;i++)f.step();
    const before=structuredClone(f.cells),paused=advanceImmuneCells(f.cells,f.beacon,{...f.context,active:false});
    expect(paused.cells).toEqual(before);expect(paused.commands).toEqual([]);
    const next=advanceImmuneCells(f.cells,f.beacon,{...f.context,tick:f.context.tick+600,elapsed:f.context.elapsed+10});
    expect(f.cells).toEqual(before);expect(releases(next.commands)).toHaveLength(1);
    expect(damage(next.commands)).toHaveLength(1);
  });

  it('hits the earliest actual ray intersection instead of the nearest center',()=>{
    const f=fixture();f.cells=[f.cells[3]];Object.assign(f.cells[0],{x:500,y:500,attackReadyAt:0});
    Object.assign(f.target,{x:690,y:500,radius:18});
    const large={...f.target,id:'large-front',x:700,radius:45};f.context.targets=[f.target,large];
    f.beacon.focus={targetId:f.target.id,until:20};f.step(1);
    const actionId=f.cells[0].seraphAction!.actionId;f.step(35);
    const center=damage(f.commands).find(command=>command.kind==='damage'&&command.seraphStrike?.actionId===actionId&&command.seraphStrike.part===1);
    expect(center&&center.kind==='damage'&&center.targetId).toBe(large.id);
  });

  it('blocks finite-width grazing rays when a thin fold precedes the real body',()=>{
    const f=fixture();const cell=f.cells[3];Object.assign(cell,{x:500,y:500});
    Object.assign(f.target,{x:700,y:500,radius:20});f.context.geometry!.obstacles=[{id:'thin-cover',x:680,y:500,radius:5}];
    const action:SeraphAction={actionId:'cover',kind:'prism',phase:'release',startedAt:0,phaseStartedAt:0,until:1,targetId:f.target.id,
      origin:{x:500,y:500},aim:f.target,direction:{x:1,y:0},part:1,sequence:1,strong:false,damage:9.6,traveled:0,
      releaseFrom:{x:500,y:500},releaseTo:{x:675,y:500}};
    expect(seraphStrikeHits(cell,f.target,action,f.context.geometry!)).toBe(false);
    f.context.geometry!.obstacles=[];expect(seraphStrikeHits(cell,f.target,action,f.context.geometry!)).toBe(true);
  });

  it('preserves all R class seats and cooldowns without cloning an in-flight action',()=>{
    const f=fixture(),growth=new GrowthController(241,'r-classes');
    Object.assign(growth.state,{beacon:f.beacon,beacons:[f.beacon],cells:f.cells});
    for(let i=0;i<120&&!f.cells[3].seraphAction;i++)f.step();growth.state.cells=f.cells;
    const clocks=f.cells.map(cell=>cell.attackReadyAt);
    expect(growth.injectAntibody(f.context).kind).toBe('used');
    const echoes=growth.state.cells!.filter(cell=>cell.echo);
    expect(echoes.map(cell=>seraphCellIndex(cell))).toEqual([0,1,2,3]);
    expect(echoes.map(cell=>cell.seraphRole)).toEqual(['commander','lancer','lancer','prism']);
    expect(echoes.map(cell=>cell.attackReadyAt)).toEqual(clocks);
    expect(echoes.every(cell=>!cell.seraphAction)).toBe(true);
  });

  it('retains Q rollback and emits accepted focus without resetting cooldowns',()=>{
    const f=fixture(),growth=new GrowthController(241,'q-rollback');
    f.beacon.legionSlot=0;Object.assign(growth.state,{beacon:f.beacon,beacons:[f.beacon],cells:f.cells,beaconReadyAt:99});
    const context={...f.context,legions:[{legionId:'seraph' as const,slot:0 as const,fed:true}]};
    const before=structuredClone(growth.state.cells);
    growth.state.budgetTick=context.tick;growth.state.budgetUsed=128;
    expect(growth.onScan(context)).toHaveLength(0);expect(growth.state.beacon!.seraphOrder).toBeUndefined();expect(growth.state.cells).toEqual(before);
    growth.state.budgetUsed=0;
    expect(growth.onScan(context).some(command=>command.kind==='log'&&command.type==='LEGION_SERAPH_FOCUS')).toBe(true);
    expect(growth.state.cells!.map(cell=>cell.attackReadyAt)).toEqual(before!.map(cell=>cell.attackReadyAt));
  });

  it('sustains measured whiteboard output through windups, both naturally and after one Q',()=>{
    for(const q of [false,true]) {
      const normal=measureLegion('phagocyte',q),seraph=measureLegion('seraph',q);
      expect(seraph.damage/normal.damage).toBeGreaterThan(1.75);expect(seraph.damage/normal.damage).toBeLessThan(1.95);
      expect(seraph.roles.every(role=>role.releases>30&&role.empty===0)).toBe(true);
      expect(seraph.pursuit).toBe(q?1:0);expect(seraph.bodies).toBe(4);expect(seraph.phase).toBe('playing');
      expect(normal.maxTargets).toBe(1);expect(seraph.maxTargets).toBe(1);expect(normal.unexpectedTargets+seraph.unexpectedTargets).toBe(0);
    }
  });
});

function prismBossFixture(nearBreak=false) {
  const game=new GameSession(241,{mode:'endless',territory:true});game.start();
  game.configureExpedition({runId:'prism-core',seed:241,missionId:'boundary',loadout:{weaponId:'steady',rarity:'purple',upgrade:0},
    blueprints:[],extraAntibodies:0,firstClear:false,legions:[{legionId:'seraph',slot:0,fed:true}]});
  const state=game.state,territory=state.territory!;
  state.world={...state.world!,obstacles:[]};
  for(const node of territory.nodes)Object.assign(node,{owner:'healthy',infectionProgress:0,purificationProgress:0});
  for(const source of Object.values(territory.sources))Object.assign(source,{destroyed:true,spawned:true});
  territory.stage='bossPending';state.targets=[];
  Object.assign(state.endless!,{wave:5,clearedWaves:5,phase:'intermission',phaseUntil:Infinity,remainingToSpawn:0,nextSpawnAt:Infinity,
    batchIndex:state.endless!.batchSchedule.length,batchMemberIndex:0,territoryTasks:{wave:5,reservedSlots:[],squads:[]},smartSupport:{wave:5,reservedSlots:[],plans:[]}});
  game.step({moveX:0,moveY:0,fire:false,aim:state.player});
  const core=state.targets.find(target=>target.id===territory.bossId)!;
  Object.assign(core,{x:1000,y:700,...(nearBreak?{hp:core.maxHp*2/3+1}:{})});
  Object.assign(state.player,{x:760,y:700});
  const beacon:BeaconState={id:'prism-fixture',x:825,y:700,organId:'heart',born:state.elapsed,until:Infinity,radius:250,damage:24,interval:.8,nextAttackAt:0,
    tuning:'balanced',mode:'protocol',rank:1,cellCount:4,legionId:'seraph',legionSlot:0,fed:true,focus:{targetId:core.id,until:20}};
  const prism=summonImmuneCells(beacon,growthContext(state),4)[3];Object.assign(prism,{x:825,y:700,updatedAt:state.elapsed,attackReadyAt:state.elapsed});
  Object.assign(state.growth!,{beacon,beacons:[beacon],cells:[prism],equipped:[{id:'IMMUNE_BEACON',tuning:'balanced',rank:1}]});
  const events:GameEvent[]=[];game.bus.on('event',event=>events.push(structuredClone(event)));
  const step=(frames:number)=>{for(let i=0;i<frames;i++)game.step({moveX:0,moveY:0,fire:false,aim:core});};
  return {game,state,core,prism,events,step};
}

describe('v0.24 authoritative prism acceptance',()=>{
  it('never emits an old strike receipt into a new run after a real TARGET_HIT callback restarts it',()=>{
    const f=prismBossFixture();let restarted=false;
    f.game.bus.on('event',event=>{if(!restarted&&event.type==='TARGET_HIT'&&event.data.legionId==='seraph'){restarted=true;f.game.start();}});
    for(let frame=0;frame<40&&!restarted;frame++)f.game.step({moveX:0,moveY:0,fire:false,aim:f.core});
    expect(restarted).toBe(true);expect(f.game.state).not.toBe(f.state);expect(f.game.state.tick).toBe(0);
    expect(f.game.state.events.filter(event=>event.type==='LEGION_SERAPH_HIT'||event.type==='LEGION_SACRED_PURSUIT')).toHaveLength(0);
  });
  it('accepts three true rays as one budget and applies the core 50% rule',()=>{
    const f=prismBossFixture();f.step(40);
    const hits=f.events.filter(event=>event.type==='LEGION_SERAPH_HIT');
    expect(hits).toHaveLength(3);expect(hits.map(event=>event.data.part)).toEqual([0,1,2]);
    expect(hits.reduce((sum,event)=>sum+Number(event.data.damage),0)).toBeCloseTo(4.8);
    const targetHits=f.events.filter(event=>event.type==='TARGET_HIT'&&event.data.legionId==='seraph');
    expect(new Set(targetHits.map(event=>event.data.castId)).size).toBe(1);
    expect(targetHits.every(event=>event.data.immuneCellId===f.prism.id)).toBe(true);
  });
  it('shares the cast across a real bar break, suppresses remaining rays and never duplicates clear rewards',()=>{
    const f=prismBossFixture(true),floor=f.core.maxHp*2/3;f.step(40);
    expect(f.state.territory!.bossCombat!.heartBoss!.stage).toBe(2);
    expect(f.core.hp).toBeCloseTo(floor);
    expect(f.events.filter(event=>event.type==='LEGION_SERAPH_RELEASED')).toHaveLength(3);
    expect(f.events.filter(event=>event.type==='LEGION_SERAPH_HIT')).toHaveLength(1);
    expect(f.events.filter(event=>event.type==='HEART_BOSS_BAR_BROKEN')).toHaveLength(1);
    expect(f.events.filter(event=>event.type==='TARGET_CLEARED'||event.type==='CORE_CLEARED')).toHaveLength(0);
  });
});

function territoryOrderFixture(role:'virus'|'source'='source',legions:LegionId[]=['seraph']) {
  const game=new GameSession(241,{mode:'endless',territory:true});game.start();
  game.configureExpedition({runId:'territory-seraph-command',seed:241,missionId:'membrane',loadout:{weaponId:'steady',rarity:'purple',upgrade:0},
    blueprints:[],extraAntibodies:0,firstClear:false,legions:legions.map((legionId,slot)=>({legionId,slot:slot as 0|1,fed:true}))});
  const state=game.state;state.world={width:2200,height:1500,bounds:{left:20,right:2180,top:20,bottom:1480},obstacles:[],foreground:{x:0,y:0,width:0,height:0}};
  Object.assign(state.player,{x:850,y:800,hp:10000});Object.assign(state.tissue,{x:650,y:1100,hp:10000,maxHp:10000});
  state.territory!.stage='guard';for(const source of Object.values(state.territory!.sources))source.spawned=true;
  Object.assign(state.endless!,{phase:'intermission',phaseUntil:Infinity,remainingToSpawn:0,nextSpawnAt:Infinity,pendingChildren:0,
    batchIndex:state.endless!.batchSchedule.length,batchMemberIndex:0});
  state.battle!.nextSpawnAt={};for(const node of state.battle!.graph.nodes)if(node.kind==='source')node.active=false;
  const target:Target={id:'territory-order-target',x:1010,y:800,radius:28,hp:10000,maxHp:10000,kind:'single',role,traits:[],hitUntil:0,scanned:false};
  state.targets=[target];const events:GameEvent[]=[];game.bus.on('event',event=>events.push(structuredClone(event)));
  const step=(frames=1)=>{for(let i=0;i<frames;i++)game.step({moveX:0,moveY:0,fire:false,aim:target});};
  const q=(aim={x:target.x,y:target.y})=>game.step({moveX:0,moveY:0,fire:false,aim,scan:true,scanAim:aim});
  return{game,state,target,events,step,q};
}

describe('v0.24 production territory seraph enemy orders',()=>{
  it.each(['virus','source'] as const)('accepts a real territory Q against %s and resolves actual commanded melee',role=>{
    const f=territoryOrderFixture(role);f.q();
    expect(f.state.territory).toBeDefined();expect(f.state.growth!.beacon!.focus?.targetId).toBe(f.target.id);
    expect(f.state.growth!.beacon!.guard).toBeUndefined();expect(f.events.filter(event=>event.type==='LEGION_SERAPH_FOCUS')).toHaveLength(1);
    f.step(135);
    expect(f.events.some(event=>event.type==='LEGION_SERAPH_HIT'&&event.data.targetId===f.target.id&&Number(event.data.damage)>0)).toBe(true);
    expect(f.events.filter(event=>event.type==='LEGION_SACRED_PURSUIT')).toHaveLength(1);
  });
  it('retains territory defense for empty ground and dead, distant or physically illegal actors',()=>{
    for(const condition of ['ground','dead','distant','illegal'] as const){const f=territoryOrderFixture();
      if(condition==='dead')f.target.hp=0;
      if(condition==='distant')f.target.x=1600;
      if(condition==='illegal')f.state.world!.obstacles=[{id:'embedded-fold',x:f.target.x,y:f.target.y,radius:45}];
      f.q(condition==='ground'?{x:1300,y:1100}:f.target);
      expect(f.state.growth!.beacon!.guard,condition).toBeDefined();expect(f.state.growth!.beacon!.focus,condition).toBeUndefined();
      expect(f.events.filter(event=>event.type==='LEGION_SERAPH_FOCUS'),condition).toHaveLength(0);
    }
  });
  it('redirects the existing seraph before filling an empty ordinary slot without resetting its bodies or clocks',()=>{
    const f=territoryOrderFixture('source',['seraph','phagocyte']);f.target.x=1300;f.q({x:850,y:800});f.step(735);
    const beaconId=f.state.growth!.beacon!.id,ids=f.state.growth!.cells!.map(cell=>cell.id),clocks=f.state.growth!.cells!.map(cell=>cell.attackReadyAt);
    const readyAt=f.state.growth!.beaconReadyAt,costs=f.events.filter(event=>event.type==='ORGAN_INTEGRITY_CHANGED'&&event.data.reason==='protocol-pressure').length;
    f.q();expect(f.state.growth!.beacons).toHaveLength(1);expect(f.state.growth!.beacon!.id).toBe(beaconId);
    expect(f.state.growth!.beacon!.focus?.targetId).toBe(f.target.id);expect(f.state.growth!.beacon!.guard).toBeUndefined();
    expect(f.state.growth!.cells!.map(cell=>cell.id)).toEqual(ids);expect(f.state.growth!.cells!.map(cell=>cell.attackReadyAt)).toEqual(clocks);
    expect(f.state.growth!.beaconReadyAt).toBe(readyAt);expect(f.events.filter(event=>event.type==='PROTOCOL_BEACON_CREATED')).toHaveLength(1);
    expect(f.events.filter(event=>event.type==='ORGAN_INTEGRITY_CHANGED'&&event.data.reason==='protocol-pressure')).toHaveLength(costs);
  });
  it('selects the seraph in a full mixed roster while ordinary legions retain their defense order',()=>{
    const f=territoryOrderFixture('source',['phagocyte','seraph']);f.target.x=1300;f.q({x:850,y:800});f.step(735);f.q({x:850,y:800});f.step(185);
    expect(f.state.growth!.beacons).toHaveLength(2);const ordinary=structuredClone(f.state.growth!.beacons!.find(beacon=>beacon.legionId==='phagocyte'));
    f.q();expect(f.state.growth!.beacon!.legionId).toBe('seraph');expect(f.state.growth!.beacon!.focus?.targetId).toBe(f.target.id);
    expect(f.state.growth!.beacons!.find(beacon=>beacon.legionId==='phagocyte')).toEqual(ordinary);
    expect(f.state.growth!.beacons!.find(beacon=>beacon.legionId==='seraph')!.guard).toBeUndefined();
  });
  it('keeps the ordinary legion territory Q behavior when no seraph can be commanded',()=>{
    const f=territoryOrderFixture('source',['phagocyte']);f.q();expect(f.state.growth!.beacon!.legionId).toBe('phagocyte');
    expect(f.state.growth!.beacon!.guard).toBeDefined();expect(f.state.growth!.beacon!.focus).toBeUndefined();
    expect(f.events.filter(event=>event.type==='LEGION_SERAPH_FOCUS')).toHaveLength(0);
  });
});
