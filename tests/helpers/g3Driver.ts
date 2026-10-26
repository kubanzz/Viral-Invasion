import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld, type GameState, type InputFrame, type Target, type Vec } from '../../src/game/types';
import type { MigrationChoice } from '../../src/game/campaignTypes';

/** Test-side navigation reads visible footprints; all progression uses public inputs. */
export function waypoint(s: GameState, target: Vec): Vec {
  const world = activeWorld(s), from = s.player;
  const clear = (a: Vec, b: Vec) => world.obstacles.every(o => {
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const t=Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/(length||1)));
    return Math.hypot(a.x+dx*t-o.x,a.y+dy*t-o.y)>o.radius+25;
  });
  if(clear(from,target))return target;
  const nodes=[from,target,...world.obstacles.flatMap(o=>Array.from({length:12},(_,i)=>({x:o.x+Math.cos(i*Math.PI/6)*(o.radius+62),y:o.y+Math.sin(i*Math.PI/6)*(o.radius+62)})))];
  const costs=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),visited=new Set<number>();costs[0]=0;
  for(let n=0;n<nodes.length;n++){
    let cur=-1;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(cur<0||costs[i]<costs[cur]))cur=i;
    if(cur<0||!Number.isFinite(costs[cur])||cur===1)break;visited.add(cur);
    for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&clear(nodes[cur],nodes[i])){const c=costs[cur]+distance(nodes[cur],nodes[i]);if(c<costs[i]){costs[i]=c;prev[i]=cur;}}
  }
  let i=1;while(prev[i]>0)i=prev[i];return prev[i]===0?nodes[i]:target;
}

export function g3Input(s: GameState, choice: MigrationChoice): InputFrame {
  const b=s.battle!,c=s.campaign!,m=c.migration,live=s.targets.filter(t=>t.hp>0);
  const rank=(t:Target)=>m.carrierIds.includes(t.id)?-4:t.role==='source'?-3:t.role==='elite'?-2:t.role==='core'?-1:0;
  const targets=live.slice().sort((a,d)=>rank(a)-rank(d)||distance(a,s.player)-distance(d,s.player));
  const target=targets[0];
  const healing=s.tissue.hp<65 || (s.player.hp<70&&s.tissue.hp<99);
  let destination:Vec=healing?{x:690,y:560}:{x:620,y:520};
  let interaction:Vec|undefined;
  if(b.organId==='lung'&&c.stats.airwayUses===0)interaction=b.graph.nodes.find(n=>n.id==='airway');
  else if((m.status==='warning'||m.status==='blocking')&&choice!=='ignore')interaction=b.graph.nodes.find(n=>choice==='block'?n.id==='gate':n.kind==='exit');
  else if(m.choice!==null&&m.status!=='pursuing'){
    const other=c.arenas[b.organId==='heart'?'lung':'heart'];
    const otherNeedsWork=other.activated&&other.targets.some(t=>t.hp>0&&(t.role==='source'||t.role==='elite'));
    const localNeedsWork=live.some(t=>t.role==='source'||t.role==='elite');
    if(!localNeedsWork&&(otherNeedsWork||c.core.organId!==b.organId&&c.core.status!=='locked'))interaction=b.graph.nodes.find(n=>n.kind==='exit');
  }
  if((c.core.status==='ready'&&c.core.organId===b.organId)||b.readyToRetest)interaction=s.terminal;
  if(interaction)destination=interaction;
  else if(target&&!healing){const d=distance(s.player,target),line=normalized(target.x-s.player.x,target.y-s.player.y),wall=wallHit(s.player,line,d,activeWorld(s));if(d>390||wall!==null&&wall<d-target.radius)destination=target;}
  const next=waypoint(s,destination),move=distance(s.player,destination)>18?normalized(next.x-s.player.x,next.y-s.player.y):{x:0,y:0};
  return {moveX:move.x,moveY:move.y,aim:healing?s.tissue:target??destination,tool:healing?3:s.cooldowns[2]<=s.elapsed?2:1,
    fire:healing||!!target,scan:s.tick%190===0,interact:!!interaction&&distance(s.player,interaction)<85&&s.tick%15===0};
}

/** Keeps a real source producing pressure; only clears its mobile defenders. */
export function g3EnduranceInput(s:GameState):InputFrame {
  const target=s.targets.filter(t=>t.hp>0&&t.role!=='source'&&t.role!=='core').sort((a,b)=>distance(a,s.player)-distance(b,s.player))[0];
  const heal=s.tissue.hp<70||(s.player.hp<80&&s.tissue.hp<99);
  const destination=heal?{x:690,y:560}:{x:620,y:520},next=waypoint(s,destination);
  const move=distance(s.player,destination)>20?normalized(next.x-s.player.x,next.y-s.player.y):{x:0,y:0};
  return{moveX:move.x,moveY:move.y,aim:heal?s.tissue:target??s.tissue,fire:heal||!!target,tool:heal?3:1,scan:s.tick%190===0};
}
