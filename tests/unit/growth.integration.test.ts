import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { distance } from '../../src/actors/collision';
import type { Target } from '../../src/game/types';

const actor=(id:string,x:number,y:number):Target=>({id,x,y,role:'virus',kind:'single',hp:30,maxHp:68,radius:22,hitUntil:0,scanned:false,traits:['CARAPACE'],generation:0,sourceId:'fixture-source',facing:Math.PI,attackReady:100});
function session():GameSession {const s=new GameSession(771,{campaign:true,milestone:'G2'});s.start();return s;}

describe('G2 shared-session protocol integration',()=>{
  it('timestamps a real research choice at its nonzero simulation time and ignores time spent in the paused draft',()=>{
    const s=session();
    s.step({moveX:0,moveY:0,aim:s.state.player,fire:false,scan:true});
    const source=s.state.targets.find(target=>target.id==='source-a')!;
    for(let tick=0;tick<1200&&source.hp>0&&s.state.phase==='playing';tick++)s.step({moveX:0,moveY:0,aim:source,fire:true,tool:1});
    expect(source.hp).toBe(0);expect(s.state.phase).toBe('paused');
    const first=s.state.growth!.draft!;
    expect(s.chooseDraft({runId:s.state.growth!.runId,draftId:first.id,optionId:first.options[0].id}).kind).toBe('committed');
    const node=s.state.battle!.graph.nodes.find(node=>node.kind==='research')!;
    for(let tick=0;tick<600&&distance(s.state.player,node)>8&&s.state.phase==='playing';tick++)s.step({moveX:node.x-s.state.player.x,moveY:node.y-s.state.player.y,aim:node,fire:false});
    expect(distance(s.state.player,node)).toBeLessThanOrEqual(8);
    s.step({moveX:0,moveY:0,aim:node,fire:false,interact:true});
    const draft=s.state.growth!.draft!,selectedAt=s.state.elapsed;
    expect(draft.source).toBe('research');expect(selectedAt).toBeGreaterThan(1);
    for(let tick=0;tick<600;tick++)s.step({moveX:0,moveY:0,aim:node,fire:false});
    expect(s.state.elapsed).toBe(selectedAt);
    expect(s.chooseDraft({runId:s.state.growth!.runId,draftId:draft.id,optionId:draft.options[0].id}).kind).toBe('committed');
    expect(s.state.growth!.protocolHistory.filter(entry=>entry.type==='PROTOCOL_EQUIPPED').at(-1)!.at).toBe(selectedAt);
  });

  it('accepted Q pays actual tissue cost and trace multiplies actual mimic movement through the common enemy update',()=>{
    const marked=session(),plain=session();
    const position={x:650,y:430},template=actor('fixture-mimic',position.x,position.y);template.hp=68;template.traits=['MIMIC'];
    for(const s of[marked,plain]){Object.assign(s.state.player,{x:500,y:430});s.state.targets=[structuredClone(template)];}
    marked.state.growth!.equipped=[{id:'IMMUNE_BEACON',tuning:'balanced'},{id:'EXPOSE_TRACE',tuning:'balanced'}];
    const before=marked.state.tissue.hp;
    const input={moveX:0,moveY:0,aim:position,fire:false,scan:true};
    marked.step(input);plain.step(input);
    expect(marked.state.tissue.hp).toBe(before-3);
    expect(marked.state.growth!.beacon).not.toBeNull();expect(marked.state.growth!.marks).toHaveLength(1);
    expect(distance(marked.state.targets[0],position)).toBeCloseTo(BATTLE_BALANCE.enemySpeed*BATTLE_BALANCE.mimicSpeed*.7/60);
    expect(distance(plain.state.targets[0],position)).toBeCloseTo(BATTLE_BALANCE.enemySpeed*BATTLE_BALANCE.mimicSpeed/60);
    const hpAfter=marked.state.tissue.hp;marked.step(input);
    expect(marked.state.tissue.hp).toBe(hpAfter);expect(marked.state.events.filter(event=>event.type==='PROTOCOL_BEACON_CREATED')).toHaveLength(1);
  });

  it('atomic replacement immediately restores trace speed or cancels the old beacons scheduled attack',()=>{
    for(const removed of['IMMUNE_BEACON','EXPOSE_TRACE'] as const){
      const s=session(),position={x:650,y:430},target=actor('fixture-mimic',position.x,position.y);target.hp=68;target.traits=['MIMIC'];
      // Mechanism setup only; acquisition and full runs have separate legal-input tests.
      Object.assign(s.state.player,{x:500,y:430});s.state.targets=[target];
      s.state.growth!.equipped=[{id:'PULSE_BREAK',tuning:'balanced'},{id:'EXPOSE_TRACE',tuning:'balanced'},{id:'IMMUNE_BEACON',tuning:'balanced'}];
      s.step({moveX:0,moveY:0,aim:position,fire:false,scan:true});
      expect(s.state.growth!.research).toBe(3);expect(s.slowFactor(target.id)).toBe(.7);expect(s.state.growth!.beacon).not.toBeNull();
      Object.assign(s.state.player,{x:475,y:610});
      s.step({moveX:0,moveY:0,aim:target,fire:false,interact:true});
      const draft=s.state.growth!.draft!,option=draft.options.find(option=>option.protocolId==='PURIFY_CHAIN')!;
      const intent={runId:s.state.growth!.runId,draftId:draft.id,optionId:option.id};
      expect(s.chooseDraft(intent).kind).toBe('replace-required');
      const slotIndex=s.state.growth!.equipped.findIndex(slot=>slot.id===removed);
      expect(s.chooseDraft({...intent,slotIndex,expectedPreviousProtocolId:removed}).kind).toBe('committed');
      if(removed==='IMMUNE_BEACON'){
        expect(s.state.growth!.beacon).toBeNull();
        for(let i=0;i<15;i++)s.step({moveX:0,moveY:0,aim:target,fire:false});
        expect(s.state.events.filter(event=>event.type==='PROTOCOL_BEACON_HIT')).toHaveLength(0);
      }else{
        expect(s.state.growth!.marks).toEqual([]);expect(s.slowFactor(target.id)).toBe(1);
        const before={x:target.x,y:target.y};s.step({moveX:0,moveY:0,aim:target,fire:false});
        expect(distance(target,before)).toBeCloseTo(BATTLE_BALANCE.enemySpeed*BATTLE_BALANCE.mimicSpeed/60);
      }
    }
  });
});
