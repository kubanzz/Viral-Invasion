import {describe,it,expect} from 'vitest';
import {GameSession} from '../../src/game/session';
import {prepareCampScene,advanceCampScene,campStations,nearbyCampStation} from '../../src/game/campScene';
describe('safe camp transition from a completed battle',()=>{
  it('clears expired battle clocks before resetting the camp clock and preserves departure equipment',()=>{
    const game=new GameSession(19,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();
    const state=game.state;state.elapsed=200;state.player.hurtUntil=150;state.player.actionUntil=175;state.player.dashReady=201;state.player.dashUntil=199;state.scanUntil=190;state.cooldowns[2]=201;
    const loadout=structuredClone(state.expedition!.loadout);prepareCampScene(state,false);
    expect(state.elapsed).toBe(0);expect(state.player.hurtUntil).toBe(0);expect(state.player.actionUntil).toBe(0);expect(state.player.dashReady).toBe(0);expect(state.scanUntil).toBe(0);expect(state.cooldowns[2]).toBe(0);
    expect(state.expedition!.loadout).toEqual(loadout);expect(state.targets).toHaveLength(0);expect(state.growth!.cells).toHaveLength(8);
  });
  it('freezes camp introduction and movement under a facility modal, then supports walking interaction',()=>{
    const game=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();const state=game.state;prepareCampScene(state,true);
    const before={...state.player};state.phase='paused';advanceCampScene(state,{moveX:1,moveY:0,aim:state.player,fire:true},1);expect(state.elapsed).toBe(0);expect(state.player.x).toBe(before.x);
    state.phase='playing';advanceCampScene(state,{moveX:1,moveY:0,aim:state.player,fire:true},.05);expect(state.player.x).toBeGreaterThan(before.x);expect(state.targets).toHaveLength(0);
    const forge=campStations(state).find(s=>s.id==='forge')!;state.player.x=forge.position.x;state.player.y=forge.position.y+70;expect(nearbyCampStation(state)?.id).toBe('forge');
  });
});
