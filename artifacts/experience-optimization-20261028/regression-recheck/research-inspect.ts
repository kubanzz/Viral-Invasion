import{GameSession}from'../../../src/game/session';import{g3Input,waypoint}from'../../../tests/helpers/g3Driver';import{distance,normalized}from'../../../src/actors/collision';
const s=new GameSession(13,{campaign:true,milestone:'G3'});s.start();
const resolve=()=>{while(s.state.growth?.draft)s.discardDraft(s.state.growth.draft.id)};
for(let i=0;i<1800;i++){resolve();if(s.state.growth!.research>=3)break;if(s.state.phase!=='playing')throw Error('failed');s.step(g3Input(s.state,'block'));}
const node=s.state.battle!.graph.nodes.find(n=>n.kind==='research')!;for(let i=0;i<1800;i++){resolve();if(distance(s.state.player,node)<=50)break;const next=waypoint(s.state,node),v=normalized(next.x-s.state.player.x,next.y-s.state.player.y);s.step({moveX:v.x,moveY:v.y,fire:false,aim:node});}
s.step({moveX:0,moveY:0,fire:false,aim:node,interact:true});console.log(JSON.stringify({tick:s.state.tick,research:s.state.growth!.research,directions:s.state.growth!.pendingResearch?.directions,rewardedKeys:s.state.growth!.rewardedKeys,events:s.state.events.filter(e=>/SCAN|DIAGNOS/.test(e.type))}));
