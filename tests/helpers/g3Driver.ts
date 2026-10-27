import { distance, moveWithCollision, normalized, rayCircle, wallHit } from '../../src/actors/collision';
import { activeWorld, type GameState, type InputFrame, type Target, type Vec, type WorldGeometry } from '../../src/game/types';
import type { MigrationChoice } from '../../src/game/campaignTypes';

// Positions derive from the active organ, so the strategy actually travels to
// the repair site after a layout change instead of firing across the old room.
function carePosition(s: GameState, retreat = false): Vec {
  return moveWithCollision(s.tissue, retreat ? { x: -210, y: -130 } : { x: -110, y: -60 }, s.player.radius, activeWorld(s));
}

const clearSegment = (a: Vec, b: Vec, world: WorldGeometry) => world.obstacles.every(o => {
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const t=Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/(length||1)));
    return Math.hypot(a.x+dx*t-o.x,a.y+dy*t-o.y)>o.radius+25;
});
const navigationGraphs = new WeakMap<WorldGeometry, { nodes: Vec[]; edges: number[][] }>();
/** Test-side navigation reads visible footprints; all progression uses public inputs. */
export function waypoint(s: GameState, target: Vec): Vec {
  const world = activeWorld(s), from = s.player;
  if(clearSegment(from,target,world))return target;
  let graph = navigationGraphs.get(world);
  if (!graph) {
    const nodes = world.obstacles.flatMap(o=>Array.from({length:12},(_,i)=>({x:o.x+Math.cos(i*Math.PI/6)*(o.radius+62),y:o.y+Math.sin(i*Math.PI/6)*(o.radius+62)})))
      .filter(node=>node.x>=world.bounds.left+19&&node.x<=world.bounds.right-19&&node.y>=world.bounds.top+19&&node.y<=world.bounds.bottom-19);
    graph={nodes,edges:nodes.map(a=>nodes.map(b=>clearSegment(a,b,world)?distance(a,b):Infinity))};
    navigationGraphs.set(world,graph);
  }
  const {nodes,edges}=graph,costs=nodes.map(node=>clearSegment(target,node,world)?distance(target,node):Infinity),visited=new Set<number>();
  for(let n=0;n<nodes.length;n++){
    let cur=-1;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(cur<0||costs[i]<costs[cur]))cur=i;
    if(cur<0||!Number.isFinite(costs[cur]))break;visited.add(cur);
    for(let i=0;i<nodes.length;i++)if(!visited.has(i))costs[i]=Math.min(costs[i],costs[cur]+edges[cur][i]);
  }
  let best=-1,bestCost=Infinity;
  for(let i=0;i<nodes.length;i++)if(clearSegment(from,nodes[i],world)){
    const cost=distance(from,nodes[i])+costs[i];if(cost<bestCost){bestCost=cost;best=i;}
  }
  return best>=0?nodes[best]:target;
}

export function g3Input(s: GameState, choice: MigrationChoice): InputFrame {
  const b=s.battle!,c=s.campaign!,m=c.migration,live=s.targets.filter(t=>t.hp>0);
  const encounter=c.encounters,lesson=b.encounter?.firstCounter;
  const rank=(t:Target)=>encounter?.stage==='IV'&&t.id===encounter.crisis.sourceId?-5:m.carrierIds.includes(t.id)?-4:t.role==='source'?-3:t.role==='elite'?-2:t.role==='core'?-1:0;
  const targets=live.slice().sort((a,d)=>rank(a)-rank(d)||distance(a,s.player)-distance(d,s.player));
  const target=targets[0];
  const healing=s.tissue.hp<65 || (s.player.hp<70&&s.tissue.hp<99);
  // The formal guided encounter is an actual combat task. Reach the visible
  // valve, aim its real pulse at the guardian, then land a basic precision hit
  // during that accepted exposure. No pose, HP or lesson field is written.
  const guardian=lesson?.status==='active'&&!lesson.counterHit&&b.encounter?.guideVariant==='guided'?live.find(t=>t.id===lesson.targetId):undefined;
  if(guardian&&!healing){
    const valve=b.graph.nodes.find(node=>node.kind==='valve')!,next=waypoint(s,valve);
    const move=distance(s.player,valve)>18?normalized(next.x-s.player.x,next.y-s.player.y):{x:0,y:0};
    const exposed=(guardian.exposedUntil??0)>s.elapsed;
    return{moveX:move.x,moveY:move.y,aim:guardian,tool:1,fire:exposed,scan:s.tick%190===0,
      interact:!exposed&&distance(s.player,valve)<85&&b.pulse.readyAt<=s.elapsed};
  }
  let destination:Vec=carePosition(s, !healing);
  let interaction:Vec|undefined;
  if(b.organId==='lung'&&c.stats.airwayUses===0)interaction=b.graph.nodes.find(n=>n.id==='airway');
  else if((m.status==='warning'||m.status==='blocking')&&choice!=='ignore')interaction=b.graph.nodes.find(n=>choice==='block'?n.id==='gate':n.kind==='exit');
  else if(m.choice!==null&&m.status!=='pursuing'){
    const other=c.arenas[b.organId==='heart'?'lung':'heart'];
    const otherNeedsWork=other.activated&&(other.targets.some(t=>t.hp>0&&(t.role==='source'||t.role==='elite'))||(c.core.status==='cleared'&&other.tissue.hp<50&&s.tissue.hp>=65));
    const localNeedsWork=live.some(t=>t.role==='source'||t.role==='elite');
    if(!localNeedsWork&&(otherNeedsWork||c.core.organId!==b.organId&&['ready','active'].includes(c.core.status)))interaction=b.graph.nodes.find(n=>n.kind==='exit');
  }
  if((c.core.status==='ready'&&c.core.organId===b.organId&&(b.organId!=='lung'||c.stats.airwayUses>0))||b.readyToRetest)interaction=s.terminal;
  if(interaction)destination=interaction;
  else if(target&&!healing){const d=distance(s.player,target),line=normalized(target.x-s.player.x,target.y-s.player.y),wall=wallHit(s.player,line,d,activeWorld(s));if(d>390||wall!==null&&wall<d-target.radius)destination=target;}
  const next=waypoint(s,destination),move=distance(s.player,destination)>18?normalized(next.x-s.player.x,next.y-s.player.y):{x:0,y:0};
  const repairLine=normalized(s.tissue.x-s.player.x,s.tissue.y-s.player.y),repairDistance=distance(s.player,s.tissue);
  const repairWall=wallHit(s.player,repairLine,repairDistance,activeWorld(s));
  const canRepair=healing&&repairDistance<=530&&(repairWall===null||repairWall>=repairDistance-s.tissue.radius);
  return {moveX:move.x,moveY:move.y,aim:canRepair?s.tissue:target??destination,tool:canRepair?3:s.cooldowns[2]<=s.elapsed?2:1,
    fire:canRepair||!!target,scan:s.tick%190===0,interact:!!interaction&&distance(s.player,interaction)<85};
}

/** Keeps a real source producing pressure; only clears its mobile defenders. */
export function g3EnduranceInput(s:GameState):InputFrame {
  const sources=s.targets.filter(t=>t.hp>0&&t.role==='source');
  const target=s.targets.filter(t=>t.hp>0&&t.role!=='source'&&t.role!=='core').filter(t=>{
    const dir=normalized(t.x-s.player.x,t.y-s.player.y),hit=rayCircle(s.player,dir,t,t.radius,530);
    return hit!==null&&!sources.some(source=>{const obstruction=rayCircle(s.player,dir,source,source.radius,530);return obstruction!==null&&obstruction<hit;});
  }).sort((a,b)=>distance(a,s.player)-distance(b,s.player))[0];
  const heal=s.tissue.hp<70||(s.player.hp<80&&s.tissue.hp<99);
  const destination=carePosition(s,!heal),next=waypoint(s,destination);
  const move=distance(s.player,destination)>20?normalized(next.x-s.player.x,next.y-s.player.y):{x:0,y:0};
  return{moveX:move.x,moveY:move.y,aim:heal?s.tissue:target??s.tissue,fire:heal||!!target,tool:heal?3:1,scan:s.tick%190===0};
}
