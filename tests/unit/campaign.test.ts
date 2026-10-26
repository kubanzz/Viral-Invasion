import { describe, expect, it } from 'vitest';
import { CampaignDirector } from '../../src/game/campaign';
import type { CampaignCommand, MigrationChoice } from '../../src/game/campaignTypes';
import { CAMPAIGN_BALANCE as B, getOrganDefinition, sourceTarget } from '../../src/game/organConfig';
import { GameSession } from '../../src/game/session';
import { clamp, distance, moveWithCollision, normalized } from '../../src/actors/collision';
import type { GameEvent, GameState } from '../../src/game/types';

/** Mechanism fixture and command consumer, separate from full legal-input/browser runs. */
function fixture(seed=91){
  const session=new GameSession(seed,{campaign:true,milestone:'G2'});session.start();const game=session.state;
  game.battle!.milestone='G3';const director=new CampaignDirector(seed,game);
  const now=(elapsed:number)=>{game.tick=Math.round(elapsed*60);game.elapsed=game.tick/60;};
  const emit=(type:string,data:GameEvent['data'])=>{const event={type,data,tick:game.tick};game.events.push(event);director.recordEvent(event,game);};
  const apply=(commands:CampaignCommand[])=>{
    for(const command of commands){
      if(command.kind==='moveActor'){
        const arena=director.state.arenas[command.organId],target=arena.targets.find(target=>target.id===command.targetId&&target.hp>0);if(target)Object.assign(target,moveWithCollision(target,command.delta,target.radius,arena.geometry));
      }else if(command.kind==='spawnActor')director.state.arenas[command.organId].targets.push(command.target);
      else if(command.kind==='spawnSource'){
        const arena=director.state.arenas[command.organId];if(arena.graph.nodes.some(node=>node.id===command.id))continue;
        arena.graph.nodes.push({id:command.id,kind:'source',...command.position,active:true,infected:true});
        arena.targets.push(sourceTarget(command.id,command.position,command.hp));
        const destination=arena.graph.nodes.find(node=>node.id===command.connectTo)!;
        arena.graph.edges.push({id:`${command.id}:${command.connectTo}`,from:command.id,to:command.connectTo,open:destination.active,nextSpread:game.elapsed+6,flowDirection:normalized(destination.x-command.position.x,destination.y-command.position.y)});
        arena.nextSpawnAt[command.id]=game.elapsed+8;
      }else if(command.kind==='organDamage'){const tissue=director.state.arenas[command.organId].tissue;tissue.hp=Math.max(0,tissue.hp-command.amount);}
      else if(command.kind==='infectionDelta')game.battle!.pressure.infection=clamp(game.battle!.pressure.infection+command.amount,0,100);
      else if(command.kind==='setRoute'){
        const arena=director.state.arenas[command.organId],node=arena.graph.nodes.find(node=>node.id===command.nodeId)!;node.active=command.open;node.infected=false;
        for(const edge of arena.graph.edges)if(edge.from===node.id||edge.to===node.id){edge.open=command.open;edge.nextSpread=game.elapsed+6;}
      }else if(command.kind==='travel')director.applyTravel(command,game);
      else if(command.kind==='spawnCore'){
        const arena=director.state.arenas[command.organId];arena.targets.push({...sourceTarget(command.coreId,command.position,680),role:'core',radius:45,traits:command.traits});
        director.acknowledgeCoreSpawn(command.coreId,true);
      }else if(command.kind==='log')emit(command.type,command.data);
    }
  };
  const update=(elapsed:number)=>{now(elapsed);const commands=director.afterInput(game);apply(commands);return commands;};
  const warning=()=>{game.battle!.traits=['CARAPACE','FISSION'];game.battle!.stats.eliteClears=1;update(40);expect(director.state.migration.status).toBe('warning');};
  return{session,game,director,now,emit,apply,update,warning};
}

describe('G3 campaign arenas and decisions',()=>{
  it('preserves cleared actors, organ damage, player health and every global ability cooldown across return travel',()=>{
    const f=fixture(),{game,director}=f;
    const removed=game.targets[0];removed.hp=0;game.targets=game.targets.filter(target=>target.id!==removed.id);game.tissue.hp=55;
    game.player.hp=72;game.cooldowns[1]=50;game.scanReady=60;game.player.dashReady=70;director.captureCurrent(game);
    director.state.migration.status='resolved';director.state.migration.choice='block';
    f.now(10);expect(director.applyTravel({kind:'travel',from:'heart',to:'lung',entry:getOrganDefinition('lung').entry,eventId:'test-out'},game)).toBe(true);
    expect(game.world).toBe(director.state.arenas.lung.geometry);expect(game.world!.obstacles.map(item=>item.id)).not.toContain('fold-a');
    game.tissue.hp=33;game.targets[1].hp=12;game.targets[1].attackAt=10.1;game.targets[1].attackAim={...game.player};director.captureCurrent(game);
    f.now(20);director.applyTravel({kind:'travel',from:'lung',to:'heart',entry:getOrganDefinition('heart').entry,eventId:'test-back'},game);
    expect(game.tissue.hp).toBe(55);expect(game.targets.some(target=>target.id===removed.id)).toBe(false);
    expect(game.player.hp).toBe(72);expect(game.cooldowns[1]).toBe(50);expect(game.scanReady).toBe(60);expect(game.player.dashReady).toBe(70);
    f.now(25);director.applyTravel({kind:'travel',from:'heart',to:'lung',entry:getOrganDefinition('lung').entry,eventId:'test-out-again'},game);
    expect(game.tissue.hp).toBe(33);expect(game.targets[1].hp).toBe(12);expect(game.targets[1].attackAt).toBeUndefined();expect(game.targets[1].attackReady).toBeGreaterThanOrEqual(26);
    expect(director.applyTravel({kind:'travel',from:'lung',to:'heart',entry:getOrganDefinition('heart').entry,eventId:'test-back'},game)).toBe(false);
  });

  it('commits a block completed exactly at the deadline once and keeps the viral gate closed under repeated E',()=>{
    const f=fixture();f.warning();const {game,director}=f,gate=game.battle!.graph.nodes.find(node=>node.id==='gate')!;
    Object.assign(game.player,{x:gate.x,y:gate.y});f.now(50);
    f.apply(director.interact(gate,game).commands);expect(director.state.migration.status).toBe('blocking');
    const resolved=f.update(52);expect(director.state.migration.choice).toBe('block');expect(director.state.arenas.lung.activated).toBe(false);
    expect(resolved.filter(command=>command.kind==='spawnSource')).toHaveLength(1);
    expect(director.state.arenas.heart.targets.some(target=>target.id==='heart-retained-source')).toBe(true);
    expect(gate.active).toBe(false);expect(director.interact(gate,game).handled).toBe(true);
    expect(director.interact(gate,game).commands.some(command=>command.kind==='setRoute'&&command.open)).toBe(false);
    expect(f.update(53).filter(command=>command.kind==='spawnSource')).toHaveLength(0);
    expect(director.chooseMigration('ignore',director.state.migration.id,game)).toEqual([]);
  });

  it('cancels a block when leaving its radius and rejects a block that cannot complete before expiry',()=>{
    const f=fixture();f.warning();const gate=f.game.battle!.graph.nodes.find(node=>node.id==='gate')!;
    Object.assign(f.game.player,{x:gate.x,y:gate.y});f.now(49);f.apply(f.director.interact(gate,f.game).commands);
    f.game.player.x=600;f.update(49.5);expect(f.director.state.migration.status).toBe('warning');
    Object.assign(f.game.player,{x:gate.x,y:gate.y});f.now(51);
    const rejected=f.director.interact(gate,f.game).commands;
    expect(rejected.some(command=>command.kind==='notice'&&command.text.includes('时间不足'))).toBe(true);
    f.update(52);expect(f.director.state.migration.choice).toBe('ignore');
  });

  it('accepts pursuit input on the exact deadline before timeout and remembers kills after carrier corpses disappear',()=>{
    const f=fixture();f.warning();const exit=f.game.battle!.graph.nodes.find(node=>node.kind==='exit')!;
    Object.assign(f.game.player,{x:exit.x,y:exit.y});f.now(52);
    f.apply(f.director.interact(exit,f.game).commands);f.update(52);
    expect(f.director.state.migration.choice).toBe('pursue');expect(f.game.battle!.organId).toBe('lung');
    expect(f.director.state.arenas.lung.activated).toBe(true);expect(f.director.state.migration.carrierIds).toHaveLength(3);
    for(const id of f.director.state.migration.carrierIds){
      const target=f.game.targets.find(target=>target.id===id)!;target.hp=0;f.emit('TARGET_CLEARED',{id});
      f.game.targets=f.game.targets.filter(target=>target.id!==id);f.director.captureCurrent(f.game);
    }
    const resolved=f.update(54);
    expect(f.director.state.migration.interceptSucceeded).toBe(true);expect(f.director.state.migration.status).toBe('resolved');
    expect(resolved.some(command=>command.kind==='spawnSource')).toBe(false);
    expect(f.director.state.requiredSourceIds.lung).toEqual(['lung-source-a']);
  });

  it('ignoring migration activates and damages the unvisited lung, creates one real source and remains recoverable',()=>{
    const f=fixture();f.warning();const before=f.director.state.arenas.lung.tissue.hp;const load=f.game.battle!.pressure.infection;
    f.update(52);f.update(53);
    expect(f.director.state.migration.choice).toBe('ignore');expect(f.game.battle!.organId).toBe('heart');
    expect(f.director.state.arenas.lung.activated).toBe(true);expect(f.director.state.arenas.lung.tissue.hp).toBe(before-B.ignoreOrganCost);
    expect(f.game.battle!.pressure.infection).toBe(load+B.ignoreInfection);
    expect(f.director.state.arenas.lung.targets.filter(target=>target.id==='lung-migrated-source')).toHaveLength(1);
    expect(f.director.state.requiredSourceIds.lung).toEqual(['lung-source-a','lung-migrated-source']);
    expect(f.game.phase).toBe('playing');
  });

  it('pursuit expiry creates a source once, while an actually closed pulmonary airway prevents establishment',()=>{
    for(const close of[false,true]){
      const f=fixture(close?93:92);f.warning();const exit=f.game.battle!.graph.nodes.find(node=>node.kind==='exit')!;
      Object.assign(f.game.player,{x:exit.x,y:exit.y});f.now(45);f.apply(f.director.interact(exit,f.game).commands);
      if(close){const airway=f.game.battle!.graph.nodes.find(node=>node.id==='airway')!;Object.assign(f.game.player,{x:airway.x,y:airway.y});f.apply(f.director.interact(airway,f.game).commands);}
      const commands=f.update(57);f.update(58);
      expect(f.director.state.migration.interceptSucceeded).toBe(close);
      expect(commands.filter(command=>command.kind==='spawnSource')).toHaveLength(close?0:1);
      expect(f.director.state.arenas.lung.targets.filter(target=>target.id==='lung-migrated-source')).toHaveLength(close?0:1);
      expect(f.director.isMigratingActor('migration-carrier-0')).toBe(false);
      expect(f.game.targets.filter(target=>target.id.startsWith('migration-carrier')&&target.hp>0)).toHaveLength(3);
    }
  });

  it('does not show a nonexistent exit warning and compensates a preemptive block instead of stalling the phase',()=>{
    const missing=fixture();missing.game.battle!.graph.nodes=missing.game.battle!.graph.nodes.filter(node=>node.kind!=='exit');
    missing.game.battle!.traits=['CARAPACE','MIMIC'];missing.game.battle!.stats.eliteClears=1;
    expect(missing.update(40).some(command=>command.kind==='log'&&command.type==='MIGRATION_WARNING')).toBe(false);
    expect(missing.director.state.migration.status).toBe('locked');
    const blocked=fixture();blocked.game.battle!.graph.nodes.find(node=>node.id==='gate')!.active=false;
    blocked.game.battle!.traits=['CARAPACE','MIMIC'];blocked.game.battle!.stats.eliteClears=1;
    const commands=blocked.update(40);
    expect(blocked.director.state.migration.choice).toBe('block');expect(commands.some(command=>command.kind==='log'&&command.type==='MIGRATION_PREEMPTIVELY_BLOCKED')).toBe(true);
    expect(blocked.director.state.requiredSourceIds.heart).toContain('heart-retained-source');
  });

  it('uses one bounded background batch after a long gap, honors grace/closure and caps damage per trip',()=>{
    const f=fixture();f.warning();f.update(52);f.now(55);
    const exit=f.game.battle!.graph.nodes.find(node=>node.kind==='exit')!;Object.assign(f.game.player,{x:exit.x,y:exit.y});f.apply(f.director.interact(exit,f.game).commands);
    const heart=f.director.state.arenas.heart,before=heart.tissue.hp;
    expect(f.update(60).filter(command=>command.kind==='organDamage'&&command.organId==='heart')).toHaveLength(0);
    const batch=f.update(200).filter(command=>command.kind==='organDamage'&&command.organId==='heart');
    expect(batch).toHaveLength(1);expect(batch[0]).toMatchObject({amount:.7});expect(before-heart.tissue.hp).toBeCloseTo(.7);
    expect(f.update(201).filter(command=>command.kind==='organDamage'&&command.organId==='heart')).toHaveLength(0);
    for(let now=205;now<500;now+=5)f.update(now);
    expect(heart.backgroundLoss).toBeCloseTo(B.backgroundTripBudget);expect(before-heart.tissue.hp).toBeCloseTo(B.backgroundTripBudget);
    const after=heart.tissue.hp;for(const edge of heart.graph.edges)edge.open=false;
    expect(f.update(1000).filter(command=>command.kind==='infectionDelta'||command.kind==='organDamage')).toHaveLength(0);expect(heart.tissue.hp).toBe(after);
    const paused=structuredClone(f.director.state);f.game.phase='paused';expect(f.director.afterInput(f.game)).toEqual([]);expect(f.director.state).toEqual(paused);
  });

  it('90 seconds of three-second return trips cannot reset cumulative offscreen grace or erase damage',()=>{
    const f=fixture();f.warning();f.update(52);
    const heartBefore=f.director.state.arenas.heart.tissue.hp,lungBefore=f.director.state.arenas.lung.tissue.hp;
    for(let second=55;second<=145;second++){
      f.now(second);
      if((second-55)%3===0){
        const exit=f.game.battle!.graph.nodes.find(node=>node.kind==='exit')!;Object.assign(f.game.player,{x:exit.x,y:exit.y});
        f.apply(f.director.interact(exit,f.game).commands);
      }
      f.apply(f.director.afterInput(f.game));
    }
    const{heart,lung}=f.director.state.arenas;
    expect(f.director.state.stats.travels).toBeGreaterThanOrEqual(25);
    expect(heart.offscreenElapsed).toBeGreaterThan(35);expect(lung.offscreenElapsed).toBeGreaterThan(35);
    expect(heart.totalBackgroundLoss).toBeGreaterThan(3);expect(lung.totalBackgroundLoss).toBeGreaterThan(3);
    expect(heartBefore-heart.tissue.hp).toBeCloseTo(heart.totalBackgroundLoss);expect(lungBefore-lung.tissue.hp).toBeCloseTo(lung.totalBackgroundLoss);
    expect(heart.backgroundLoss).toBeLessThanOrEqual(B.backgroundTripBudget);expect(lung.backgroundLoss).toBeLessThanOrEqual(B.backgroundTripBudget);
  });

  it('intercepts all retest inputs, unlocks one real two-trait core only after every required source and checks every victory threshold',()=>{
    const f=fixture(),{game,director}=f;const terminal=game.battle!.graph.nodes.find(node=>node.kind==='retest')!;Object.assign(game.player,point(terminal));
    expect(director.interact(terminal,game).handled).toBe(true);expect(director.interact(terminal,game).commands.some(command=>command.kind==='retest')).toBe(false);
    f.warning();const gate=game.battle!.graph.nodes.find(node=>node.id==='gate')!;Object.assign(game.player,point(gate));f.now(45);f.apply(director.interact(gate,game).commands);f.update(47);
    for(const arena of Object.values(director.state.arenas))if(arena.activated)for(const id of director.state.requiredSourceIds[arena.organId]){
      arena.graph.nodes.find(node=>node.id===id)!.active=false;const target=arena.targets.find(target=>target.id===id);if(target)target.hp=0;
      f.emit('INFECTION_SOURCE_CLEARED',{organId:arena.organId,nodeId:id});
    }
    f.emit('ELITE_CLEARED',{id:'elite-a',organId:'heart'});f.emit('ELITE_CLEARED',{id:'elite-b',organId:'heart'});f.update(48);
    expect(director.state.core.status).toBe('ready');Object.assign(game.player,point(terminal));
    const spawn=director.interact(terminal,game).commands;expect(spawn.filter(command=>command.kind==='spawnCore')).toHaveLength(1);f.apply(spawn);
    expect(director.interact(terminal,game).commands.some(command=>command.kind==='spawnCore')).toBe(false);
    const core=game.targets.find(target=>target.role==='core')!;expect(core.traits).toEqual(['CARAPACE','FISSION']);core.hp=0;f.emit('CORE_CLEARED',{coreId:'mother-core',organId:'heart'});f.update(49);
    expect(director.canRetest(game)).toBe(true);expect(director.interact(terminal,game).commands).toContainEqual(expect.objectContaining({kind:'retest',success:true}));
    director.state.arenas.lung.activated=true;director.state.arenas.lung.tissue.hp=49;expect(director.canRetest(game)).toBe(false);
    director.state.arenas.lung.tissue.hp=50;game.battle!.pressure.infection=35;expect(director.canRetest(game)).toBe(false);
    game.battle!.pressure.infection=34.9;game.player.hp=0;expect(director.canRetest(game)).toBe(false);
    game.player.hp=1;game.battle!.pressure.vitality=0;expect(director.canRetest(game)).toBe(false);
  });
});

const point=(value:{x:number;y:number})=>({x:value.x,y:value.y});
