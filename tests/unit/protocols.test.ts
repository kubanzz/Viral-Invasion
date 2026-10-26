import { describe, expect, it } from 'vitest';
import { GrowthController } from '../../src/game/growth';
import type { GrowthCommand, GrowthContext, ProtocolId } from '../../src/game/growthTypes';
import { BEACON_CONFIG, CHAIN_CONFIG, GROWTH_BALANCE as B, PULSE_CONFIG, TRACE_CONFIG, describeProtocol } from '../../src/game/protocols';
import type { Target } from '../../src/game/types';

const actor=(id:string,x=700,y=400):Target=>({id,x,y,role:'virus',kind:'single',hp:68,maxHp:68,radius:22,hitUntil:0,scanned:false,traits:[],generation:0});
const context=(targets:Target[]=[]):GrowthContext=>({tick:132,elapsed:2.2,active:true,organId:'heart',rhythm:'surge',player:{x:730,y:230},aim:{x:700,y:400},deviceOrigin:{x:730,y:230},tissue:{x:780,y:610,hp:60,maxHp:100,radius:43},targets,tool:1});
function controller(ids:ProtocolId[]):GrowthController {const c=new GrowthController(55,'protocol-fixture');c.state.equipped=ids.map(id=>({id,tuning:'balanced'}));return c;}
const damage=(commands:GrowthCommand[])=>commands.filter((command):command is Extract<GrowthCommand,{kind:'damage'}>=>command.kind==='damage');

describe('G2 protocol effects and bounded synergies',()=>{
  it('resonates on ordinary targets only near the device, during surge, once per target and rhythm',()=>{
    const c=controller(['PULSE_BREAK']),t=actor('ordinary',785,390),ctx=context([t]);
    const commands=c.onHit(ctx,t,{cause:'basic'});
    expect(damage(commands).map(command=>command.amount)).toEqual([PULSE_CONFIG.balanced.bonusDamage]);
    expect(commands.some(command=>command.kind==='expose'&&command.until===ctx.elapsed+4)).toBe(true);
    expect(c.onHit(ctx,t,{cause:'basic'})).toEqual([]);
    expect(c.onHit({...ctx,tick:133,rhythm:'rest'},actor('rest'),{cause:'basic'})).toEqual([]);
    expect(c.onHit({...ctx,player:{x:100,y:600}},actor('far'),{cause:'basic'})).toEqual([]);
    expect(c.onHit(ctx,actor('protocol'),{cause:'protocol'})).toEqual([]);
    expect(c.onHit({...ctx,tool:3},actor('repair'),{cause:'basic'})).toEqual([]);
    const next=c.onHit({...ctx,tick:492,elapsed:8.2},t,{cause:'basic'});
    expect(damage(next)).toHaveLength(1);
  });

  it('chain has ordinary usefulness, a stable nearest route, wall checks and no protocol recursion',()=>{
    const c=controller(['PURIFY_CHAIN']),origin=actor('dead',500,400);origin.hp=0;
    const a=actor('a',600,400),b=actor('b',700,400),third=actor('c',800,400),ctx=context([origin,third,b,a]);
    const result=c.onKill(ctx,origin,{cause:'basic'});
    expect(damage(result).map(command=>command.targetId)).toEqual(['a','b']);
    expect(damage(result).every(command=>command.amount===CHAIN_CONFIG.balanced.damage)).toBe(true);
    expect(c.onKill(ctx,origin,{cause:'basic'})).toEqual([]);
    expect(c.onKill(ctx,a,{cause:'protocol',protocolId:'PURIFY_CHAIN'})).toEqual([]);
    const blocked=actor('behind-fold',440,380),dead=actor('fold-root',440,210);dead.hp=0;
    expect(damage(c.onKill({...ctx,tick:133,targets:[dead,blocked]},dead,{cause:'basic'}))).toHaveLength(0);
  });

  it('the pulse-break chain synergy adds exactly one third hop to a real exposed basic kill',()=>{
    const c=controller(['PULSE_BREAK','PURIFY_CHAIN']),dead=actor('dead',500,400);dead.hp=0;
    const targets=[dead,...Array.from({length:5},(_,i)=>actor(`near-${i}`,600+i*85,400))],ctx=context(targets);
    const commands=c.onKill(ctx,dead,{cause:'basic',wasPulseExposed:true});
    expect(damage(commands)).toHaveLength(3);expect(damage(commands).map(command=>command.hop)).toEqual([1,2,3]);
    expect(commands.find(command=>command.kind==='log'&&command.type==='PROTOCOL_SYNERGY')).toMatchObject({data:{pair:'PULSE_BREAK+PURIFY_CHAIN',hops:3,cap:3}});
    const plain=controller(['PULSE_BREAK','PURIFY_CHAIN']);
    expect(damage(plain.onKill(ctx,dead,{cause:'basic',wasPulseExposed:false}))).toHaveLength(2);
  });

  it('a resonance last hit continues only its original basic chain root and cannot create an extra chain',()=>{
    const c=controller(['PULSE_BREAK','PURIFY_CHAIN']),target=actor('resonant',785,390);target.hp=10;
    const targets=[target,actor('a',800,450),actor('b',870,450),actor('c',940,450),actor('d',940,520)],ctx=context(targets);
    const root=c.onHit(ctx,target,{cause:'basic',rootId:'original-basic'}),bonus=damage(root)[0];
    expect(bonus).toMatchObject({protocolId:'PULSE_BREAK',allowChain:true,rootId:'original-basic'});
    target.exposedUntil=ctx.elapsed+4;target.hp=0;
    const chain=c.onKill(ctx,target,{cause:'protocol',protocolId:bonus.protocolId,allowChain:bonus.allowChain,rootId:bonus.rootId,wasPulseExposed:true});
    expect(damage(chain)).toHaveLength(3);
    for(const command of damage(chain)) {
      const killed=targets.find(t=>t.id===command.targetId)!;killed.hp=0;
      expect(c.onKill(ctx,killed,{cause:'protocol',protocolId:command.protocolId,rootId:command.rootId})).toEqual([]);
    }
    expect(c.onKill(ctx,target,{cause:'basic',rootId:'original-basic',wasPulseExposed:true})).toEqual([]);
  });

  it('100 simultaneous basic clears stay under the command budget and each chain is at most three hops',()=>{
    const c=controller(['PULSE_BREAK','PURIFY_CHAIN']),neighbors=Array.from({length:10},(_,i)=>actor(`neighbor-${i}`,600+i*25,400)),ctx=context(neighbors);
    const all:GrowthCommand[]=[];
    for(let i=0;i<100;i++){
      const dead=actor(`dead-${i}`,500,400);dead.hp=0;
      all.push(...c.onKill(ctx,dead,{cause:'basic',wasPulseExposed:true,rootId:`simultaneous-${i}`}));
    }
    expect(all.length).toBeLessThanOrEqual(B.commandBudget);
    expect(damage(all).every(command=>command.hop<=3)).toBe(true);
    expect(c.state.skippedCommands).toBeGreaterThan(0);
    expect(c.afterInput(ctx).some(command=>command.kind==='log'&&command.type==='PROTOCOL_BUDGET_SKIPPED')).toBe(true);
    const next=c.onKill({...ctx,tick:133},actor('later',500,400),{cause:'basic',rootId:'later'});
    expect(damage(next)).toHaveLength(2);
  });

  it('a beacon damages ordinary enemies, pays tissue cost once, has its own cooldown and expires',()=>{
    const c=controller(['IMMUNE_BEACON']),t=actor('ordinary',730,420),ctx=context([t]);
    ctx.player={x:600,y:400};ctx.aim={x:700,y:400};
    const created=c.onScan(ctx);
    expect(created.filter(command=>command.kind==='organCost')).toEqual([expect.objectContaining({amount:BEACON_CONFIG.balanced.tissueCost})]);
    expect(c.state.beacon).toMatchObject({y:400,radius:190,until:8.2});expect(c.state.beacon!.x).toBeCloseTo(700);
    const ready=c.state.beaconReadyAt;expect(c.onScan({...ctx,tick:133,elapsed:2.22}).filter(command=>command.kind==='organCost')).toHaveLength(0);
    expect(c.state.beaconReadyAt).toBe(ready);
    const fired=c.afterInput({...ctx,tick:145,elapsed:2.42});
    expect(damage(fired)).toEqual([expect.objectContaining({targetId:t.id,amount:24,protocolId:'IMMUNE_BEACON'})]);
    expect(damage(c.afterInput({...ctx,tick:146,elapsed:2.44}))).toHaveLength(0);
    c.afterInput({...ctx,tick:600,elapsed:10});expect(c.state.beacon).toBeNull();
  });

  it('trace controls ordinary enemies without direct damage and naturally expires',()=>{
    const c=controller(['EXPOSE_TRACE']),t=actor('ordinary'),ctx=context([t]);
    const commands=c.onScan(ctx);expect(damage(commands)).toHaveLength(0);
    expect(c.state.marks[0]).toMatchObject({targetId:t.id,until:ctx.elapsed+TRACE_CONFIG.balanced.duration});
    expect(c.slowFactor(t.id,'heart',ctx.elapsed+1)).toBe(.7);
    expect(c.slowFactor(t.id,'lung',ctx.elapsed+1)).toBe(1);
    expect(c.slowFactor(t.id,'heart',ctx.elapsed+4)).toBe(1);
    c.afterInput({...ctx,tick:1000,elapsed:20});expect(c.state.marks).toEqual([]);
  });

  it('trace and beacon synergy prioritizes a marked reachable enemy over a nearer unmarked spawn',()=>{
    const far=actor('marked',850,400),near=actor('new-unmarked',730,420),ctx=context([far]);ctx.player={x:600,y:400};ctx.aim={x:700,y:400};
    const c=controller(['EXPOSE_TRACE','IMMUNE_BEACON']);c.onScan(ctx);
    const shot=c.afterInput({...ctx,tick:145,elapsed:2.42,targets:[near,far]});
    expect(damage(shot)[0].targetId).toBe('marked');
    expect(shot.find(command=>command.kind==='log'&&command.type==='PROTOCOL_BEACON_HIT')).toMatchObject({data:{prioritizedTrace:true,targetId:'marked'}});
    expect(shot.some(command=>command.kind==='log'&&command.type==='PROTOCOL_SYNERGY')).toBe(true);
    const plain=controller(['IMMUNE_BEACON']);plain.onScan({...ctx,targets:[near,far]});
    expect(damage(plain.afterInput({...ctx,tick:145,elapsed:2.42,targets:[near,far]}))[0].targetId).toBe('new-unmarked');
  });

  it('removing beacon or trace atomically cancels their future temporary effects',()=>{
    for(const removed of['IMMUNE_BEACON','EXPOSE_TRACE'] as const){
      const c=controller(['PULSE_BREAK','EXPOSE_TRACE','IMMUNE_BEACON']),ctx=context([actor('ordinary')]);
      c.onScan(ctx);expect(c.state.beacon).not.toBeNull();expect(c.state.marks).toHaveLength(1);
      c.state.research=3;c.openResearch('research',ctx);const draft=c.state.draft!,option=draft.options.find(o=>o.protocolId==='PURIFY_CHAIN')!;
      c.chooseDraft({runId:c.state.runId,draftId:draft.id,optionId:option.id});const slotIndex=c.state.equipped.findIndex(slot=>slot.id===removed);
      const result=c.chooseDraft({runId:c.state.runId,draftId:draft.id,optionId:option.id,slotIndex,expectedPreviousProtocolId:removed});
      expect(result.kind).toBe('committed');
      if(removed==='IMMUNE_BEACON'){expect(c.state.beacon).toBeNull();expect(damage(c.afterInput({...ctx,tick:145,elapsed:2.42}))).toHaveLength(0);}
      else {expect(c.state.marks).toEqual([]);expect(c.slowFactor('ordinary','heart',ctx.elapsed)).toBe(1);}
    }
  });

  it('budget exhaustion cannot create a free beacon or false trace state',()=>{
    const c=controller(['IMMUNE_BEACON','EXPOSE_TRACE']),ctx=context([actor('ordinary')]);
    c.state.budgetTick=ctx.tick;c.state.budgetUsed=B.commandBudget;
    expect(c.onScan(ctx)).toEqual([]);expect(c.state.beacon).toBeNull();expect(c.state.marks).toEqual([]);
    expect(c.state.beaconReadyAt).toBe(0);expect(c.state.protocolHistory).toEqual([]);
  });

  it('all calibration text follows the actual radius, damage, duration and tissue cost tables',()=>{
    for(const tuning of['balanced','focused','extended'] as const){
      expect(describeProtocol('PULSE_BREAK',tuning).effect).toContain(String(PULSE_CONFIG[tuning].bonusDamage));
      expect(describeProtocol('PURIFY_CHAIN',tuning).effect).toContain(String(CHAIN_CONFIG[tuning].range));
      expect(describeProtocol('IMMUNE_BEACON',tuning).effect).toContain(String(BEACON_CONFIG[tuning].duration));
      expect(describeProtocol('IMMUNE_BEACON',tuning).cost).toContain(String(BEACON_CONFIG[tuning].tissueCost));
      expect(describeProtocol('EXPOSE_TRACE',tuning).effect).toContain(String(TRACE_CONFIG[tuning].factor));
    }
  });
});
