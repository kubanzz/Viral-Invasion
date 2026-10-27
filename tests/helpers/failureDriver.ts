import{distance,normalized}from'../../src/actors/collision';
import{type GameState,type InputFrame}from'../../src/game/types';
import{waypoint}from'./g3Driver';

export type FailureRoute='collapse'|'infection';
const corners=[{x:580,y:1100},{x:980,y:1050},{x:1150,y:1350},{x:650,y:1360}];

/** Read-only route planning. The caller applies these through public simulation or actual DOM input. */
export function failureRouteInput(state:GameState,route:FailureRoute,corner:number):{input:InputFrame,corner:number}{
  if(route==='infection'&&distance(state.player,corners[corner])<28)corner=(corner+1)%corners.length;
  const destination=route==='collapse'?{x:400,y:400}:corners[corner];
  const next=waypoint(state,destination),direction=normalized(next.x-state.player.x,next.y-state.player.y);
  const moving=distance(state.player,destination)>18;
  const repair=route==='infection'&&state.battle!.pressure.infection<100&&(state.tissue.hp<60||state.player.hp<75&&state.tissue.hp<95);
  return{corner,input:{moveX:moving&&Math.abs(direction.x)>.383?Math.sign(direction.x):0,
    moveY:moving&&Math.abs(direction.y)>.383?Math.sign(direction.y):0,aim:repair?state.tissue:destination,tool:3,fire:repair,scan:false,interact:false}};
}
