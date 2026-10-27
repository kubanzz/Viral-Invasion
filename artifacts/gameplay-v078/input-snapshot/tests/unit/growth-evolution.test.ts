import { describe, expect, it } from 'vitest';
import { GrowthController } from '../../src/game/growth';
import { chainRicochetPeriod, describeProtocol, getBeaconConfig, getChainConfig, getPulseConfig, getTraceConfig, PROTOCOL_IDS, protocolRank, TUNINGS } from '../../src/game/protocols';
import type { GrowthCommand, GrowthContext, ProtocolId, ProtocolRank } from '../../src/game/growthTypes';
import type { Target } from '../../src/game/types';

const actor=(id:string,x=700,y=400):Target=>({id,x,y,role:'virus',kind:'single',hp:1000,maxHp:1000,radius:22,hitUntil:0,scanned:false,traits:[],generation:0});
const context=(targets:Target[]=[]):GrowthContext=>({tick:60,elapsed:1,active:true,organId:'heart',rhythm:'surge',player:{x:600,y:400},aim:{x:700,y:400},deviceOrigin:{x:600,y:400},tissue:{x:780,y:610,hp:60,maxHp:100,radius:43},targets,tool:1});
const damage=(commands:GrowthCommand[])=>commands.filter((c):c is Extract<GrowthCommand,{kind:'damage'}>=>c.kind==='damage');
function advance(c:GrowthController,ctx:GrowthContext,seconds:number):GrowthCommand[]{
  const commands:GrowthCommand[]=[];
  for(let step=1;step<=Math.ceil(seconds*60);step++)commands.push(...c.afterInput({...ctx,tick:ctx.tick+step,elapsed:ctx.elapsed+step/60}));
  return commands;
}

describe('playtest-driven evolution and visible immune support',()=>{
  it('opening drafts guarantee an immediately usable squad and a different chain route from a four-protocol pool',()=>{
    const observed=new Set<ProtocolId>();
    for(let seed=0;seed<80;seed++){
      const c=new GrowthController(seed),ctx=context();
      c.recordEvent({type:'INFECTION_SOURCE_CLEARED',tick:60,data:{nodeId:'a',organId:'heart'}},ctx);c.afterInput(ctx);
      const options=c.state.draft!.options;
      expect(options).toHaveLength(3);expect(new Set(options.map(o=>o.protocolId)).size).toBe(3);
      expect(options.some(o=>o.protocolId==='IMMUNE_BEACON')).toBe(true);expect(options.some(o=>o.protocolId==='PURIFY_CHAIN')).toBe(true);
      for(const option of options){observed.add(option.protocolId);expect(option.change).toContain('解锁新打法');expect(option.actionHint).toBeTruthy();}
    }
    expect([...observed].sort()).toEqual([...PROTOCOL_IDS].sort());
  });

  it('research advances the same tuning to II then III before offering a clearly labelled sidegrade',()=>{
    const c=new GrowthController(77);c.state.equipped=[{id:'PURIFY_CHAIN',tuning:'focused'},{id:'IMMUNE_BEACON',tuning:'balanced'},{id:'EXPOSE_TRACE',tuning:'balanced'}];
    for(const rank of[2,3] as const){
      for(let attempt=0;attempt<16;attempt++){
        c.state.research=3;c.openResearch('research',context());
        if(c.state.draft!.options.some(o=>o.protocolId==='PURIFY_CHAIN'))break;
        c.discardDraft(c.state.draft!.id);
      }
      const draft=c.state.draft!,option=draft.options.find(o=>o.protocolId==='PURIFY_CHAIN')!;
      expect(option.rank).toBe(rank);expect(option.tuning).toBe('focused');expect(option.change).toContain('→');
      expect(c.chooseDraft({runId:c.state.runId,draftId:draft.id,optionId:option.id}).kind).toBe('committed');
      expect(c.state.equipped.find(p=>p.id==='PURIFY_CHAIN')).toMatchObject({rank,tuning:'focused'});
      expect(c.state.lastEvolution).toMatchObject({protocolId:'PURIFY_CHAIN',rank,until:9});
    }
    for(let attempt=0;attempt<16;attempt++){
      c.state.research=3;c.openResearch('research',context());
      if(c.state.draft!.options.some(o=>o.protocolId==='PURIFY_CHAIN'))break;
      c.discardDraft(c.state.draft!.id);
    }
    const sidegrade=c.state.draft!.options.find(o=>o.protocolId==='PURIFY_CHAIN')!;
    expect(sidegrade).toBeDefined();expect(sidegrade.rank).toBe(3);expect(sidegrade.tuning).not.toBe('focused');expect(sidegrade.change).toContain('不额外升级');
    expect(c.state.equipped).toHaveLength(3);
  });

  it('every early follow-up draft mixes a real owned-route upgrade with a new route across seeds',()=>{
    for(let seed=0;seed<300;seed++)for(const count of[1,2,3]){
      const c=new GrowthController(seed);
      c.state.equipped=PROTOCOL_IDS.slice(0,count).map(id=>({id,tuning:'balanced'}));
      c.state.research=3;c.openResearch('research',context());
      const options=c.state.draft!.options;
      expect(options).toHaveLength(3);expect(new Set(options.map(o=>o.protocolId)).size).toBe(3);
      expect(options.some(o=>o.kind==='retune'&&(o.rank??1)>protocolRank(c.state.equipped.find(s=>s.id===o.protocolId)))).toBe(true);
      expect(options.some(o=>o.kind==='equip')).toBe(true);
      for(const upgrade of options.filter(o=>o.kind==='retune'))expect(upgrade.tuning).toBe('balanced');
    }
  });

  it('each rank actually strengthens its protocol for every tuning, with matching generated text',()=>{
    for(const tuning of TUNINGS)for(const rank of[2,3] as const){
      expect(getPulseConfig(tuning,rank).bonusDamage).toBeGreaterThan(getPulseConfig(tuning,(rank-1) as ProtocolRank).bonusDamage);
      expect(getChainConfig(tuning,rank).damage).toBeGreaterThan(getChainConfig(tuning,(rank-1) as ProtocolRank).damage);
      expect(getBeaconConfig(tuning,rank).duration).toBeGreaterThan(getBeaconConfig(tuning,(rank-1) as ProtocolRank).duration);
      expect(getTraceConfig(tuning,rank).factor).toBeLessThan(getTraceConfig(tuning,(rank-1) as ProtocolRank).factor);
      expect(describeProtocol('PULSE_BREAK',tuning,rank).effect).toContain(String(getPulseConfig(tuning,rank).bonusDamage));
      expect(describeProtocol('PURIFY_CHAIN',tuning,rank).effect).toContain(String(getChainConfig(tuning,rank).damage));
      expect(describeProtocol('IMMUNE_BEACON',tuning,rank).effect).toContain(String(getBeaconConfig(tuning,rank).duration));
      expect(describeProtocol('EXPOSE_TRACE',tuning,rank).effect).toContain(String(getTraceConfig(tuning,rank).factor));
    }
    const target=actor('durable'),ctx=context([target]),low=new GrowthController(1),high=new GrowthController(1);
    low.state.equipped=[{id:'PULSE_BREAK',tuning:'balanced'}];high.state.equipped=[{id:'PULSE_BREAK',tuning:'balanced',rank:3}];
    expect(damage(high.onHit(ctx,target))[0].amount).toBeGreaterThan(damage(low.onHit(ctx,target))[0].amount);
    high.state.equipped=[{id:'EXPOSE_TRACE',tuning:'balanced',rank:3}];high.onScan(ctx);
    expect(high.slowFactor(target.id,'heart',1.1)).toBe(getTraceConfig('balanced',3).factor);
  });

  it('chain II and III add a bounded ricochet attack after three or two surviving basic hits, never on protocol recursion',()=>{
    const source=actor('durable'),neighbor=actor('neighbor',800,400),ctx=context([source,neighbor]);
    for(const rank of[2,3] as const){
      const c=new GrowthController(rank);c.state.equipped=[{id:'PURIFY_CHAIN',tuning:'balanced',rank}];
      const period=chainRicochetPeriod(rank)!;
      for(let hit=1;hit<period;hit++)expect(damage(c.onHit({...ctx,tick:60+hit},source))).toHaveLength(0);
      const commands=c.onHit({...ctx,tick:70},source),hit=damage(commands);
      expect(hit).toHaveLength(1);expect(hit[0]).toMatchObject({targetId:'neighbor',amount:getChainConfig('balanced',rank).damage,hop:1});
      expect(commands.some(c=>c.kind==='log'&&c.type==='PROTOCOL_RICOCHET_HIT')).toBe(true);
      expect(c.state.activations?.PURIFY_CHAIN).toBe(1);expect(c.state.chainCharge).toBe(0);
      expect(c.onHit(ctx,neighbor,{cause:'protocol',protocolId:'PURIFY_CHAIN'})).toEqual([]);expect(c.state.chainCharge).toBe(0);
    }
  });

  it('baseline Q creates one real short-lived helper without a slot or tissue cost, and its actual bites do damage',()=>{
    const c=new GrowthController(11),ctx=context([actor('small',720,400)]);
    const created=c.onScan(ctx);
    expect(c.state.equipped).toEqual([]);expect(c.state.cells).toHaveLength(1);expect(c.state.beacon?.mode).toBe('patrol');
    expect(created.some(c=>c.kind==='organCost')).toBe(false);
    const commands=advance(c,ctx,1);
    expect(damage(commands).length).toBeGreaterThan(0);
    expect(commands.some(c=>c.kind==='log'&&c.type==='IMMUNE_PATROL_HIT')).toBe(true);
    expect(commands.some(c=>c.kind==='log'&&c.type==='PROTOCOL_BEACON_HIT')).toBe(false);
    const cells=structuredClone(c.state.cells);c.afterInput({...ctx,tick:120,elapsed:2,active:false});expect(c.state.cells).toEqual(cells);
    c.afterInput({...ctx,tick:121,elapsed:2.1,organId:'lung'});expect(c.state.cells).toEqual([]);expect(c.state.beacon).toBeNull();
  });

  it('a real acquired beacon changes the next Q from one patrol to a three-cell squad and pays exactly one cost',()=>{
    const c=new GrowthController(12),ctx=context([actor('target')]);c.onScan(ctx);expect(c.state.cells).toHaveLength(1);
    c.recordEvent({type:'INFECTION_SOURCE_CLEARED',tick:60,data:{nodeId:'source',organId:'heart'}},ctx);c.afterInput(ctx);
    const draft=c.state.draft!,option=draft.options.find(o=>o.protocolId==='IMMUNE_BEACON')!;
    expect(c.chooseDraft({runId:c.state.runId,draftId:draft.id,optionId:option.id}).kind).toBe('committed');
    const changed=c.onScan({...ctx,tick:61,elapsed:1.1});
    expect(c.state.cells).toHaveLength(3);expect(c.state.beacon?.mode).toBe('protocol');expect(c.state.equipped).toHaveLength(1);
    expect(changed.filter(c=>c.kind==='organCost')).toEqual([expect.objectContaining({amount:3})]);
    expect(c.onScan({...ctx,tick:62,elapsed:1.2}).some(c=>c.kind==='organCost')).toBe(false);
    expect(protocolRank(c.state.equipped[0])).toBe(1);
    c.recordEvent({type:'RUN_ENDED',tick:90,data:{success:false}},ctx);expect(c.state.cells).toEqual([]);expect(c.state.beacon).toBeNull();
  });
});
