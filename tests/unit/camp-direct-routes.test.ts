import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { advanceCampScene, canInteractCampStation, prepareCampScene } from '../../src/game/campScene';
import { campLayout, isCampPositionLegal, type CampStationId } from '../../src/game/campLayout';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { campFarmPlots } from '../../src/game/campFarm';
import { BALANCE, type GameState, type Vec } from '../../src/game/types';

function ready(): GameState {
  const session=new GameSession(230023,{mode:'endless',territory:true});session.start();
  prepareCampScene(session.state,true,'ready',[...INTRO_FACILITY_IDS,'farm','house']);return session.state;
}
/** Walk using the same normalized input and collision as keyboard/touch play. */
function walk(state: GameState, relative: Vec): number {
  const layout=campLayout(state),target={x:layout.origin.x+relative.x,y:layout.origin.y+relative.y};let travelled=0;
  for(let tick=0;tick<800;tick++){
    const dx=target.x-state.player.x,dy=target.y-state.player.y,gap=Math.hypot(dx,dy);if(gap<.6)return travelled;
    const from={x:state.player.x,y:state.player.y};
    advanceCampScene(state,{moveX:dx,moveY:dy,aim:target,fire:false},Math.min(BALANCE.step,gap/BALANCE.speed));
    travelled+=Math.hypot(state.player.x-from.x,state.player.y-from.y);
    expect(isCampPositionLegal(state.player,state.player.radius,layout)).toBe(true);
  }
  throw Error(`Direct camp route stopped at ${state.player.x-layout.origin.x},${state.player.y-layout.origin.y} before ${relative.x},${relative.y}`);
}
const routes: Record<Exclude<CampStationId,'farm'|'house'>,Record<'farm'|'house',Vec[]>>={
  warehouse:{farm:[{x:-220,y:-20}],house:[{x:-220,y:-20}]},
  forge:{farm:[{x:-220,y:222},{x:-220,y:-270}],house:[{x:-220,y:222},{x:-110,y:-210}]},
  shop:{farm:[{x:250,y:0}],house:[{x:250,y:0},{x:250,y:-120}]},
  departure:{farm:[{x:240,y:340},{x:-110,y:110},{x:-110,y:-270}],house:[{x:240,y:340},{x:220,y:110},{x:220,y:-200}]},
  summon:{farm:[{x:100,y:-200}],house:[{x:220,y:90},{x:220,y:-200}]},
};
describe('open camp service routes',()=>{
  for(const source of Object.keys(routes) as (keyof typeof routes)[])for(const destination of ['farm','house'] as const){
    it(`walks ${source} → ${destination} along a short connection without a courtyard circuit`,()=>{
      const state=ready(),layout=campLayout(state),from=layout.facilities.find(f=>f.id===source)!,to=layout.facilities.find(f=>f.id===destination)!;
      Object.assign(state.player,from.interactionPosition);let length=0;
      for(const p of [...routes[source][destination],{x:to.interactionPosition.x-layout.origin.x,y:to.interactionPosition.y-layout.origin.y}])length+=walk(state,p);
      const direct=Math.hypot(to.interactionPosition.x-from.interactionPosition.x,to.interactionPosition.y-from.interactionPosition.y);
      expect(length/direct).toBeLessThan(1.55);
      expect(canInteractCampStation(state,destination)).toBe(true);
    });
  }
  it('walks the life-area crossroad directly between the farm and houses in both directions',()=>{
    const state=ready(),layout=campLayout(state),farm=layout.facilities.find(f=>f.id==='farm')!,house=layout.facilities.find(f=>f.id==='house')!;
    Object.assign(state.player,farm.interactionPosition);
    const length=walk(state,{x:house.interactionPosition.x-layout.origin.x,y:house.interactionPosition.y-layout.origin.y});
    expect(length).toBeLessThan(570);expect(canInteractCampStation(state,'house')).toBe(true);
    walk(state,{x:farm.interactionPosition.x-layout.origin.x,y:farm.interactionPosition.y-layout.origin.y});expect(canInteractCampStation(state,'farm')).toBe(true);
  });
  it('reaches every real crop approach from the north-south farm aisle without circling the garden',()=>{
    for(const plot of campFarmPlots(ready())){
      const state=ready(),layout=campLayout(state),origin=layout.origin;
      walk(state,{x:100,y:270});walk(state,{x:100,y:-300});walk(state,{x:-330,y:-300});
      const target={x:plot.interactionPosition.x-origin.x,y:plot.interactionPosition.y-origin.y};
      walk(state,target);
      expect(isCampPositionLegal(state.player,state.player.radius,layout)).toBe(true);
      const actual=campFarmPlots(state).find(p=>p.index===plot.index)!;
      expect(actual.eligible).toBe(true);
    }
  });
});
