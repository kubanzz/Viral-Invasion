import{describe,it,expect}from'vitest';
import{GameSession}from'../../src/game/session';
import{failureRouteInput,type FailureRoute}from'../helpers/failureDriver';

describe('formal campaign natural independent failure routes',()=>{
  for(const route of['collapse','infection']as FailureRoute[])it(`reaches ${route} by public actions, pauses its warning and retries cleanly`,()=>{
    const game=new GameSession(13,{campaign:true,milestone:'G3',counterGuide:'adaptive',firstTrait:route==='collapse'?'MIMIC':'CARAPACE'});game.start();
    let corner=0,paused=false,criticalTick:number|undefined;
    for(let action=0;action<360*60&&game.state.phase!=='result';action++){
      const state=game.state;
      if(state.phase==='paused'&&state.growth?.draft){game.discardDraft(state.growth.draft.id);continue;}
      if(!paused&&(route==='collapse'?state.battle!.pressure.organAlarm:state.battle!.pressure.criticalSince!==null)){
        game.pause();const before=game.snapshot();for(let i=0;i<120;i++)game.step({fire:true,moveX:1,moveY:0,aim:before.tissue});
        expect(game.snapshot()).toEqual(before);game.resume();paused=true;
      }
      const planned=failureRouteInput(game.state,route,corner);corner=planned.corner;game.step(planned.input);
      if(game.state.battle!.pressure.criticalSince!==null&&criticalTick===undefined)criticalTick=game.state.tick;
    }
    const final=game.snapshot();expect(paused).toBe(true);expect(final.phase).toBe('result');expect(final.result?.success).toBe(false);
    expect(final.battle!.encounter!.configId).toBe('campaign-1');expect(final.world?.width).toBe(2400);expect(final.player.hp).toBeGreaterThan(0);
    expect(final.events.filter(event=>event.type==='RUN_ENDED')).toHaveLength(1);
    if(route==='collapse'){
      expect(final.result!.reason).toContain('身体崩溃');expect(final.battle!.pressure.vitality).toBe(0);expect(final.battle!.pressure.infection).toBeLessThan(100);
    }else{
      expect(final.result!.reason).toContain('感染失控');expect(final.battle!.pressure.vitality).toBeGreaterThan(0);expect(final.battle!.pressure.infection).toBe(100);
      expect(final.tick-criticalTick!).toBe(15*60);
    }
    for(let i=0;i<60;i++)game.step({fire:true,moveX:1,moveY:0,aim:final.tissue});expect(game.snapshot()).toEqual(final);
    game.restart();const fresh=game.snapshot();expect(fresh.phase).toBe('playing');expect(fresh.player.hp).toBe(100);expect(fresh.growth!.xp).toBe(0);
    expect(fresh.growth!.equipped).toEqual([]);expect(fresh.battle!.pressure.vitality).toBe(100);expect(fresh.battle!.pressure.criticalSince).toBeNull();expect(fresh.events.some(event=>event.type==='RUN_ENDED')).toBe(false);
  });
});
