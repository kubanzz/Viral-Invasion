import { describe, expect, it } from 'vitest';
import { GrowthController } from '../../src/game/growth';
import type { GrowthContext, ProtocolId } from '../../src/game/growthTypes';
import type { GameEvent, Target } from '../../src/game/types';
import { protocolRank } from '../../src/game/protocols';

const actor=(id:string,x=700,y=400,role:Target['role']='virus'):Target=>({id,x,y,role,kind:'single',hp:68,maxHp:68,radius:22,hitUntil:0,scanned:false,traits:[],generation:0,sourceId:'source-a'});
const context=(targets:Target[]=[]):GrowthContext=>({tick:60,elapsed:1,active:true,organId:'heart',rhythm:'rest',player:{x:600,y:400},aim:{x:700,y:400},deviceOrigin:{x:730,y:230},tissue:{x:780,y:610,hp:60,maxHp:100,radius:43},targets,tool:1});
const event=(type:string,data:GameEvent['data']):GameEvent=>({type,tick:60,data});
const source=(id:string)=>event('INFECTION_SOURCE_CLEARED',{nodeId:id,organId:'heart'});
function chooseFirst(controller:GrowthController):void {
  const draft=controller.state.draft!;
  const option=draft.options.find(option=>option.kind==='equip')??draft.options[0];
  const result=controller.chooseDraft({runId:controller.state.runId,draftId:draft.id,optionId:option.id});
  expect(result.kind).toBe('committed');
}

describe('G2 event rewards and protocol drafts',()=>{
  it('guarantees two meaningful choices from objective events without advancing time',()=>{
    const c=new GrowthController(800,'run-a'),ctx=context();
    c.recordEvent(source('a'),ctx);c.afterInput(ctx);
    expect(c.state.xp).toBe(20);expect(c.state.draft?.source).toBe('xp');
    expect(new Set(c.state.draft!.options.map(o=>o.protocolId)).size).toBe(3);
    chooseFirst(c);c.recordEvent(source('b'),ctx);c.recordEvent(event('ELITE_CLEARED',{id:'elite-1'}),ctx);c.afterInput(ctx);
    expect(c.state.xp).toBe(70);expect(c.state.level).toBe(2);expect(c.state.draft?.source).toBe('xp');
    expect(c.state.equipped).toHaveLength(1);chooseFirst(c);expect(c.state.equipped).toHaveLength(2);
    expect(ctx.elapsed).toBe(1);
  });

  it('source, elite and discovery rewards are stable after diagnostic logs are discarded',()=>{
    const c=new GrowthController(901),elite=actor('elite',710,410,'elite');elite.traits=['MIMIC'];
    const ctx=context([elite]);
    for(let i=0;i<1000;i++){
      c.recordEvent(source('a'),ctx);c.recordEvent(event('ELITE_CLEARED',{id:'elite'}),ctx);
      c.recordEvent(event('BATTLE_DIAGNOSED',{count:1}),ctx);c.state.pendingLogs=[];
    }
    expect(c.state.xp).toBe(64);expect(c.state.research).toBe(7);expect(c.state.rewardedKeys).toHaveLength(4);
    expect(c.state.pendingLevels).toEqual([1,2]);
  });

  it('ordinary rewards diminish by source and children or duplicate clears cannot farm XP',()=>{
    const c=new GrowthController(902);
    for(let i=0;i<100;i++){
      const t=actor(`virus-${i}`);const ctx=context([t]);
      c.recordEvent(event('TARGET_CLEARED',{id:t.id,kind:'single'}),ctx);
      c.recordEvent(event('TARGET_CLEARED',{id:t.id,kind:'single'}),ctx);
      const child=actor(`child-${i}`);child.generation=1;
      c.recordEvent(event('TARGET_CLEARED',{id:child.id}),context([child]));
    }
    expect(c.state.xp).toBe(7);expect(c.state.research).toBe(0);
    expect(c.state.sourceKillCounts['heart:source-a']).toBe(3);expect(c.state.rewardedKeys).toHaveLength(3);
  });

  it('awards organ protection once only after actual enemy damage and a valid recovery',()=>{
    const c=new GrowthController(903),ctx=context();
    for(let i=0;i<10;i++){
      c.recordEvent(event('ORGAN_INTEGRITY_CHANGED',{organId:'heart',before:60,after:20,reason:'pulse-pressure'}),ctx);
      c.recordEvent(event('ORGAN_INTEGRITY_CHANGED',{organId:'heart',before:20,after:70,reason:'repair'}),ctx);
    }
    expect(c.state.xp).toBe(0);
    c.recordEvent(event('ORGAN_INTEGRITY_CHANGED',{organId:'heart',before:60,after:20,reason:'enemy-attack'}),ctx);
    for(let i=0;i<10;i++)c.recordEvent(event('ORGAN_INTEGRITY_CHANGED',{organId:'heart',before:20,after:70,reason:'repair'}),ctx);
    expect(c.state.xp).toBe(15);expect(c.state.research).toBe(1);
  });

  it('reproduces drafts from the same seed and history across 1000 seeds and distinct run identities',()=>{
    for(let seed=0;seed<1000;seed++){
      const a=new GrowthController(seed,'a'),b=new GrowthController(seed,'b'),ctx=context();
      for(const c of[a,b]){c.recordEvent(source('source'),ctx);c.afterInput(ctx);}
      expect(a.state.draft!.options).toEqual(b.state.draft!.options);
      expect(new Set(a.state.draft!.options.map(o=>o.protocolId)).size).toBe(3);
      expect(a.state.draft!.options.every(o=>o.trigger&&o.effect&&o.cost)).toBe(true);
    }
  });

  it('queues multiple levels and opens the next draft immediately on valid resolution',()=>{
    const c=new GrowthController(906),ctx=context();
    c.recordEvent(source('a'),ctx);c.recordEvent(source('b'),ctx);
    c.recordEvent(event('ELITE_CLEARED',{id:'elite-a'}),ctx);c.recordEvent(event('ELITE_CLEARED',{id:'elite-b'}),ctx);
    c.afterInput(ctx);expect(c.state.level).toBe(3);expect(c.state.pendingLevels).toEqual([2,3]);
    const first=c.state.draft!;const resolution=c.discardDraft(first.id,c.state.runId);
    expect(resolution.kind).toBe('discarded');expect(c.state.draft!.id).not.toBe(first.id);expect(c.state.pendingLevels).toEqual([3]);
    expect(c.discardDraft(first.id,c.state.runId).kind).toBe('rejected');
  });

  it('requires a second atomic choice for the fourth protocol and rejects stale slot confirmations',()=>{
    const c=new GrowthController(907,'run-907');c.state.equipped=[{id:'PULSE_BREAK',tuning:'balanced'},{id:'EXPOSE_TRACE',tuning:'balanced'},{id:'IMMUNE_BEACON',tuning:'balanced'}];
    c.state.research=6;const ctx=context();
    expect(c.openResearch('research',ctx).kind).toBe('opened');const draft=c.state.draft!,option=draft.options.find(o=>o.kind==='equip')!;
    const intent={runId:c.state.runId,draftId:draft.id,optionId:option.id};
    const original=structuredClone(c.state.equipped);
    expect(c.chooseDraft({...intent,slotIndex:1,expectedPreviousProtocolId:'EXPOSE_TRACE'}).kind).toBe('rejected');
    expect(c.chooseDraft(intent).kind).toBe('replace-required');expect(c.state.equipped).toEqual(original);
    expect(c.chooseDraft({...intent,slotIndex:1,expectedPreviousProtocolId:'PULSE_BREAK'}).kind).toBe('rejected');
    expect(c.state.equipped).toEqual(original);
    expect(c.chooseDraft({...intent,slotIndex:1,expectedPreviousProtocolId:'EXPOSE_TRACE'}).kind).toBe('committed');
    expect(c.state.equipped).toHaveLength(3);expect(c.state.equipped[1].id).toBe('PURIFY_CHAIN');
    expect(c.chooseDraft({...intent,slotIndex:1,expectedPreviousProtocolId:'PURIFY_CHAIN'}).kind).toBe('rejected');
  });

  it('charges research once, permits returning from replacement, and discards without free rerolls',()=>{
    const c=new GrowthController(908);c.state.equipped=[{id:'PULSE_BREAK',tuning:'balanced'},{id:'EXPOSE_TRACE',tuning:'balanced'},{id:'IMMUNE_BEACON',tuning:'balanced'}];
    c.state.research=3;const ctx=context();
    expect(c.openResearch('research',ctx).kind).toBe('opened');const draft=c.state.draft!;
    for(let i=0;i<10;i++)expect(c.openResearch('research',ctx).kind).toBe('rejected');
    expect(c.state.research).toBe(0);expect(c.state.draft?.id).toBe(draft.id);
    const option=draft.options.find(o=>o.kind==='equip')!;
    expect(c.chooseDraft({runId:c.state.runId,draftId:draft.id,optionId:option.id}).kind).toBe('replace-required');
    expect(c.backToDraft(draft.id,c.state.runId).kind).toBe('returned');expect(draft.status).toBe('choosing');
    expect(c.discardDraft(draft.id,c.state.runId).kind).toBe('discarded');expect(c.state.equipped).toHaveLength(3);
    expect(c.openResearch('research',ctx)).toMatchObject({kind:'rejected',reason:'insufficient-samples',missing:3});
  });

  it('keeps three distinct legal choices, advancing rank before offering calibration changes',()=>{
    const c=new GrowthController(909);c.state.equipped=[{id:'PULSE_BREAK',tuning:'balanced'},{id:'PURIFY_CHAIN',tuning:'focused'},{id:'IMMUNE_BEACON',tuning:'extended'}];
    for(let i=0;i<30;i++){
      c.state.research=3;c.openResearch('research',context());const draft=c.state.draft!;
      expect(new Set(draft.options.map(o=>o.protocolId)).size).toBe(3);
      expect(draft.options.every(o=>{const old=c.state.equipped.find(slot=>slot.id===o.protocolId);return o.kind==='equip'||(o.rank??1)>protocolRank(old)||old?.tuning!==o.tuning;})).toBe(true);
      const retune=draft.options.find(o=>o.kind==='retune')!;
      expect(c.chooseDraft({runId:c.state.runId,draftId:draft.id,optionId:retune.id}).kind).toBe('committed');
      expect(c.state.equipped).toHaveLength(3);
    }
  });

  it('rejects an old run intent, and run end closes temporary growth without accepting later rewards',()=>{
    const old=new GrowthController(910,'run-old'),next=new GrowthController(910,'run-next'),ctx=context();
    for(const c of[old,next]){c.recordEvent(source('a'),ctx);c.afterInput(ctx);}
    expect(next.chooseDraft({runId:old.state.runId,draftId:old.state.draft!.id,optionId:old.state.draft!.options[0].id}).kind).toBe('rejected');
    const xp=next.state.xp;next.recordEvent(event('RUN_ENDED',{success:false}),ctx);next.recordEvent(source('b'),ctx);next.afterInput(ctx);
    expect(next.state.xp).toBe(xp);expect(next.state.draft).toBeNull();expect(next.state.ended).toBe(true);
  });
});
