import {describe,it,expect} from 'vitest';
import {GameSession} from '../../src/game/session';
import {prepareCampScene,advanceCampScene,campStations,nearbyCampStation} from '../../src/game/campScene';
import {campLayout,isCampPositionLegal} from '../../src/game/campLayout';
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
    const forge=campStations(state).find(s=>s.id==='forge')!;state.player.x=forge.interactionPosition.x;state.player.y=forge.interactionPosition.y;expect(nearbyCampStation(state)?.id).toBe('forge');
  });
  it('replaces the eight construction workers with six permanent peaceful residents after the introduction',()=>{
    const game=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();const state=game.state;
    prepareCampScene(state,false);expect(state.growth!.cells).toHaveLength(8);
    state.camp!.introComplete=true;advanceCampScene(state,{moveX:0,moveY:0,aim:state.player,fire:false},1/60);
    expect(state.growth!.cells).toHaveLength(6);const ids=state.growth!.cells!.map(cell=>cell.id),before=structuredClone(state.growth!.cells!);
    for(let i=0;i<900;i++)advanceCampScene(state,{moveX:0,moveY:0,aim:state.player,fire:true,antibody:true,weaponSkill:{slot:1,aim:state.player}},1/60);
    expect(state.growth!.cells!.map(cell=>cell.id)).toEqual(ids);
    expect(state.growth!.cells!.some((cell,index)=>Math.hypot(cell.x-before[index].x,cell.y-before[index].y)>1)).toBe(true);
    expect(state.growth!.cells!.every(cell=>cell.until>state.elapsed&&cell.damage===0&&cell.targetId===null&&cell.attackUntil===0)).toBe(true);
    expect(state.targets).toHaveLength(0);expect(state.events).toHaveLength(0);expect(state.playerProjectiles).toHaveLength(0);
  });
  it('does not mutate expedition rewards, loadout or action counters during peaceful camp simulation',()=>{
    const game=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();const state=game.state;
    const expedition=structuredClone(state.expedition),metrics=structuredClone(state.runMetrics);
    const counters={shots:state.shots,hits:state.hits,scans:state.scans,dashes:state.dashes};
    prepareCampScene(state,true);
    for(let i=0;i<600;i++)advanceCampScene(state,{moveX:0,moveY:0,aim:state.player,fire:true,scan:true,dash:true,antibody:true,interact:true},1/60);
    expect(state.expedition).toEqual(expedition);expect(state.runMetrics).toEqual(metrics);
    expect({shots:state.shots,hits:state.hits,scans:state.scans,dashes:state.dashes}).toEqual(counters);
    expect(state.targets).toHaveLength(0);expect(state.events).toHaveLength(0);
  });
  it('freezes every resident and the camp clock while each facility modal pauses the scene',()=>{
    const game=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();const state=game.state;prepareCampScene(state,true);
    for(const station of campStations(state)){
      state.player.x=station.interactionPosition.x;state.player.y=station.interactionPosition.y;state.phase='paused';
      const before=structuredClone({player:state.player,cells:state.growth!.cells,camp:state.camp,tick:state.tick,elapsed:state.elapsed});
      advanceCampScene(state,{moveX:1,moveY:1,aim:state.player,fire:true},3);
      expect({player:state.player,cells:state.growth!.cells,camp:state.camp,tick:state.tick,elapsed:state.elapsed}).toEqual(before);
    }
  });
  it('supports an empty established camp and moves builders between individual construction sites',()=>{
    const game=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();const state=game.state;
    prepareCampScene(state,false,'building',[]);
    expect(campStations(state)).toHaveLength(0);expect(campLayout(state).sites).toHaveLength(5);
    expect(state.growth!.cells).toHaveLength(6);
    for(const id of ['departure','warehouse','forge'] as const){
      state.camp!.activeConstruction=id;
      advanceCampScene(state,{moveX:0,moveY:0,aim:state.player,fire:false},1/60);
      expect(state.growth!.cells!.every(cell=>cell.id.startsWith(`camp-builder:${id}:`))).toBe(true);
      expect(state.growth!.cells!.every(cell=>isCampPositionLegal(cell,cell.radius,campLayout(state)))).toBe(true);
      state.camp!.builtFacilities!.push(id);delete state.camp!.activeConstruction;
    }
    state.camp!.introComplete=true;state.camp!.prologue='ready';
    advanceCampScene(state,{moveX:0,moveY:0,aim:state.player,fire:false},1/60);
    expect(state.growth!.cells).toHaveLength(6);
    expect(state.growth!.cells!.every(cell=>cell.id.startsWith('camp-resident:'))).toBe(true);
  });
});
