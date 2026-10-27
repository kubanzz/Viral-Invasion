import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { g3Input, g3EnduranceInput, waypoint } from '../helpers/g3Driver';
import { distance } from '../../src/actors/collision';
import type { MigrationChoice } from '../../src/game/campaignTypes';

describe('G3 shared-session campaign',()=>{
  it('survives 180s of actual lung-source pressure and can legally retreat with the same controls',()=>{
    const game=new GameSession(91,{campaign:true,milestone:'G3'});game.start();
    while(game.state.battle!.organId!=='lung'&&game.state.tick<6000){
      if(game.state.growth?.draft)game.discardDraft(game.state.growth.draft.id);
      else game.step(g3Input(game.state,'pursue'));
    }
    expect(game.state.battle!.organId).toBe('lung');
    const start=game.state.elapsed,phases=new Set<string>();let spawned=0;
    game.bus.on('event',e=>{if(e.type==='ACTOR_SPAWNED')spawned++;});
    while(game.state.elapsed-start<180&&game.state.phase!=='result'){
      if(game.state.growth?.draft)game.discardDraft(game.state.growth.draft.id);
      else game.step(g3EnduranceInput(game.state));
      phases.add(game.state.campaign!.arenas.lung.flow!.phase);
    }
    expect(game.state.phase).toBe('playing');expect(phases.size).toBe(2);expect(spawned).toBeGreaterThan(15);
    expect(game.state.targets.some(t=>t.role==='source'&&t.hp>0)).toBe(true);
    const exit=game.state.battle!.graph.nodes.find(n=>n.kind==='exit')!;
    for(let i=0;i<1500&&game.state.battle!.organId==='lung';i++){
      if(game.state.growth?.draft){game.discardDraft(game.state.growth.draft.id);continue;}
      const next=waypoint(game.state,exit),p=game.state.player;
      game.step({...g3EnduranceInput(game.state),moveX:next.x-p.x,moveY:next.y-p.y,interact:distance(p,exit)<85});
    }
    expect(game.state.battle!.organId).toBe('heart');expect(game.state.phase).toBe('playing');
  });
  it.each<MigrationChoice>(['pursue','block','ignore'])('wins through public input after %s migration, real core phases and retest',choice=>{
    const game=new GameSession(91,{campaign:true,milestone:'G3'});game.start();
    const events:string[]=[];game.bus.on('event',e=>events.push(e.type));
    for(let i=0;i<24000&&game.state.phase!=='result';i++){
      const draft=game.state.growth?.draft;
      if(draft){game.discardDraft(draft.id);continue;}
      game.step(g3Input(game.state,choice));
    }
    const s=game.state;
    console.log('G3_INPUT_ROUTE',JSON.stringify({choice,phase:s.phase,result:s.result,elapsed:s.elapsed,migration:s.campaign!.migration,core:s.campaign!.core.status,progress:s.campaign!.progress,player:s.player.hp,organs:Object.values(s.campaign!.arenas).map(a=>({id:a.organId,hp:a.tissue.hp,activated:a.activated,alive:a.targets.filter(t=>t.hp>0).map(t=>[t.id,t.hp])}))}));
    expect(s.result).toMatchObject({success:true});
    expect(s.campaign!.stats.migrationChoice).toBe(choice);
    expect(s.campaign!.core.combat?.seenTraits).toHaveLength(2);
    expect(s.campaign!.core.combat?.membrane.remaining).toBe(0);
    expect(events).toContain('CORE_CLEARED');expect(events).toContain('RETEST_COMPLETED');
    if(choice!=='block'){expect(s.campaign!.arenas.lung.activated).toBe(true);expect(s.campaign!.stats.travels).toBeGreaterThanOrEqual(1);}
  });
});
