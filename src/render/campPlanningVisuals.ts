import { CAMP_LIFE_GARDEN_BOUNDS, CAMP_LIFE_PATHS, CAMP_PLANNED_AREAS, campLayout, type CampRect } from '../game/campLayout';
import type { GameState } from '../game/types';
import type { SceneLabel } from './sceneLabels';

const TAU=Math.PI*2;
function rounded(ctx:CanvasRenderingContext2D,r:CampRect,radius:number){ctx.beginPath();ctx.roundRect(r.left,r.top,r.right-r.left,r.bottom-r.top,radius);}
function road(ctx:CanvasRenderingContext2D,path:()=>void,width=58){
  for(const [extra,color] of [[6,'#b4ab8b50'],[2,'#c9bda0'],[0,'#efe2c5']] as const){ctx.beginPath();path();ctx.lineWidth=width+extra;ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
  ctx.beginPath();path();ctx.lineWidth=1;ctx.setLineDash([2,18]);ctx.strokeStyle='#fff8df66';ctx.stroke();ctx.setLineDash([]);
}
/** Direct living-area routes join both heart-side paths; the outer loop is optional. */
export function drawCampLifeGardenGround(ctx:CanvasRenderingContext2D):void{
  ctx.save();
  const garden=CAMP_LIFE_GARDEN_BOUNDS;
  const wash=ctx.createRadialGradient(0,-480,100,0,-480,650);wash.addColorStop(0,'#cbd9b72b');wash.addColorStop(1,'#e8e4c000');
  ctx.fillStyle=wash;ctx.fillRect(garden.left-80,garden.top-80,garden.right-garden.left+160,garden.bottom-garden.top+160);
  // Low ceramic edging contains the living yards without inventing solid walls.
  for(const r of [{left:-535,top:-620,right:-130,bottom:-330},{left:120,top:-650,right:550,bottom:-305}]){
    rounded(ctx,r,44);ctx.fillStyle='#e4e5cda6';ctx.fill();ctx.strokeStyle='#bdc8a37a';ctx.lineWidth=3;ctx.stroke();
    rounded(ctx,{left:r.left+7,top:r.top+7,right:r.right-7,bottom:r.bottom-7},38);ctx.strokeStyle='#fff3d577';ctx.lineWidth=2;ctx.stroke();
  }
  road(ctx,()=>ctx.ellipse(0,-490,555,205,0,0,TAU),50);
  // The four-way junction and farm aisle are explicitly open; no central island forces a circuit.
  for (const rect of Object.values(CAMP_LIFE_PATHS)) {
    const horizontal=rect.right-rect.left>rect.bottom-rect.top;
    road(ctx,()=>{if(horizontal){ctx.moveTo(rect.left,(rect.top+rect.bottom)/2);ctx.lineTo(rect.right,(rect.top+rect.bottom)/2);}
      else{ctx.moveTo((rect.left+rect.right)/2,rect.top);ctx.lineTo((rect.left+rect.right)/2,rect.bottom);}},horizontal?rect.bottom-rect.top:rect.right-rect.left);
  }
  road(ctx,()=>{ctx.moveTo(-555,-490);ctx.lineTo(-655,-490);},50);
  road(ctx,()=>{ctx.moveTo(555,-490);ctx.lineTo(655,-490);},50);
  for(const area of CAMP_PLANNED_AREAS){
    const r=area.rect,cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
    rounded(ctx,r,30);ctx.fillStyle='#b8c4ad30';ctx.fill();ctx.strokeStyle='#92a5938c';ctx.lineWidth=2;ctx.setLineDash([9,8]);ctx.stroke();ctx.setLineDash([]);
    // Quiet future structures sit behind the barrier, with no active service icon.
    ctx.strokeStyle='#91a79b66';ctx.fillStyle='#e9ead34d';ctx.lineWidth=3;
    for(const side of [-1,1]){
      const x=cx+side*(area.id==='breeding'?92:44),y=cy+side*25;
      if(area.id==='healing'){ctx.beginPath();ctx.ellipse(x,y,25,40,-.25,0,TAU);ctx.fill();ctx.stroke();}
      else{ctx.beginPath();ctx.roundRect(x-25,y-30,50,52,15);ctx.fill();ctx.stroke();ctx.beginPath();ctx.ellipse(x,y-28,25,11,0,0,TAU);ctx.stroke();}
    }
    // A visible low closure follows the same full inner edge as the collision barrier.
    const b=area.barrier,horizontal=area.id==='breeding',mid=horizontal?(b.top+b.bottom)/2:(b.left+b.right)/2;
    ctx.strokeStyle='#9b9a7a';ctx.lineWidth=7;ctx.beginPath();
    if(horizontal){ctx.moveTo(b.left,mid);ctx.lineTo(b.right,mid);}else{ctx.moveTo(mid,b.top);ctx.lineTo(mid,b.bottom);}ctx.stroke();
    ctx.strokeStyle='#e8d4a3';ctx.lineWidth=3;ctx.setLineDash([14,11]);ctx.stroke();ctx.setLineDash([]);
    for(let i=0;i<5;i++){
      const t=i/4,x=horizontal?b.left+(b.right-b.left)*t:mid,y=horizontal?mid:b.top+(b.bottom-b.top)*t;
      ctx.fillStyle='#e1d6b5';ctx.strokeStyle='#959d80';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x-5,y-9,10,18,3);ctx.fill();ctx.stroke();
    }
  }
  ctx.restore();
}

export function campPlanningLabels(state:GameState):SceneLabel[]{
  if(state.camp?.prologue!=='ready')return[];
  const overview=!!state.camp.overview;
  return campLayout(state).plannedAreas.filter(area=>overview||!!state.player&&Math.hypot(state.player.x-area.entrance.x,state.player.y-area.entrance.y)<220)
    .map(area=>({id:`camp-planned:${area.id}`,anchor:overview?{x:(area.rect.left+area.rect.right)/2,y:(area.rect.top+area.rect.bottom)/2}:area.entrance,
    offset:{x:0,y:overview?0:-18},priority:overview?76:84,essential:true,theme:'camp' as const,
    lines:[{text:area.name,size:15,color:'#516c60'},{text:area.status,size:11,color:'#8b7955'}]}));
}
