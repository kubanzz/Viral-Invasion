import { BALANCE, type GameState, type Vec } from '../game/types';
import { TERRITORY_CANNON_BALANCE, territoryCannonView } from '../game/territoryCannon';
import type { SceneLabelSink } from './sceneLabels';

const TAU=Math.PI*2;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export function territoryCannonCameraFocus(state:GameState):{aim:Vec;aimRadius:number}|undefined{
  if(!state.territory||state.phase==='menu'||state.phase==='result'||state.territory.stage==='victory')return;
  const shot=state.playerFlight;
  if(shot)return {aim:shot.to,aimRadius:shot.radius??TERRITORY_CANNON_BALANCE.radius};
  for(let i=state.events.length-1;i>=0;i--){
    const event=state.events[i];
    if(event.type!=='TERRITORY_CANNON_EXPLODED')continue;
    const age=state.elapsed-event.tick*BALANCE.step;
    return age>=0&&age<=.35?{aim:{x:Number(event.data.x),y:Number(event.data.y)},aimRadius:Number(event.data.radius)||TERRITORY_CANNON_BALANCE.radius}:undefined;
  }
}
export function territoryCannonBodyOpacity(state:GameState):number{
  const p=territoryCannonView(state).origin,dx=Math.abs(state.player.x-p.x),dy=p.y-state.player.y;
  return state.player.hp>0&&dx<58&&dy>=-12&&dy<110?.24:1;
}
function circle(ctx:CanvasRenderingContext2D,p:Vec,r:number,fill:string,stroke:string,width=2){
  ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();
}
export function drawTerritoryCannon(ctx:CanvasRenderingContext2D,state:GameState,_aim:Vec,labels?:SceneLabelSink,drawBody=true):void{
  if(!state.territory)return;
  const view=territoryCannonView(state),p=view.origin;
  if(!view.exists)return;
  if(drawBody){ctx.save();ctx.globalAlpha*=territoryCannonBodyOpacity(state);ctx.translate(p.x,p.y);ctx.scale(1,1/.72);
    ctx.beginPath();ctx.ellipse(0,2,37,12,0,0,TAU);ctx.fillStyle='#698e7888';ctx.fill();
    // A fixed, upright living pod: no barrel and no continuous aim rotation.
    for(const side of [-1,1]){
      ctx.beginPath();ctx.moveTo(0,-4);ctx.bezierCurveTo(side*45,-7,side*(view.ready?59:25),-50,side*(view.ready?43:5),-64);
      ctx.bezierCurveTo(side*26,-52,side*10,-21,0,-4);ctx.fillStyle=view.ready?'#bcdac1':'#94bca8';ctx.fill();ctx.strokeStyle='#527c69';ctx.lineWidth=2;ctx.stroke();
    }
    ctx.beginPath();ctx.ellipse(0,-24,view.ready?24:12,view.ready?12:29,0,0,TAU);ctx.fillStyle=view.ready?'#f6edca':'#c6d9b7';ctx.fill();ctx.strokeStyle='#75997e';ctx.lineWidth=2;ctx.stroke();
    if(view.ready){ctx.beginPath();ctx.ellipse(0,-25,13,6,0,0,TAU);ctx.fillStyle='#527e70';ctx.fill();}
    ctx.beginPath();ctx.arc(0,0,43,-Math.PI/2,-Math.PI/2+TAU*Math.max(.01,view.progress));ctx.strokeStyle=view.ready?'#e3e9b8':'#96c9ad';ctx.lineWidth=3;ctx.stroke();ctx.restore();}
  labels?.add({id:'territory-cannon',anchor:p,offset:{x:0,y:view.nearby?-82:34},priority:view.nearby?79:35,essential:view.nearby,
    lines:[{text:view.blueprintId==='rapid-launch-pod'?'速装弹射荚':'基础弹射荚',color:'#e1e9cb',size:12},{text:!view.enabled?'所在区域失守 · 先夺回':view.ready?view.nearby?'E / 弹射 · 选择落点':'复苏完成 · 靠近使用':`装填 ${view.remaining.toFixed(1)}秒`,color:view.ready?'#f1e4af':'#b3c5b6',size:10}]});
}
export function drawTerritoryCannonPreview(ctx:CanvasRenderingContext2D,state:GameState,preview?:{aim:Vec;cancelled:boolean}):void{
  if(!state.territory||!preview)return;
  const view=territoryCannonView(state),color=preview.cancelled?'#b96e7d':'#f4e5ac';
  ctx.save();ctx.setLineDash([9,7]);ctx.strokeStyle=color;ctx.lineWidth=2;
  ctx.setLineDash([]);
  circle(ctx,preview.aim,view.radius,preview.cancelled?'#9a527616':'#d5e9bb18',color,3);
  circle(ctx,preview.aim,12,'#284c4677',color,2);
  ctx.beginPath();ctx.moveTo(preview.aim.x-22,preview.aim.y);ctx.lineTo(preview.aim.x+22,preview.aim.y);
  ctx.moveTo(preview.aim.x,preview.aim.y-22);ctx.lineTo(preview.aim.x,preview.aim.y+22);ctx.stroke();ctx.restore();
}
/** Arcing shell and the exact footprint remain visible in reduced effects. */
export function drawTerritoryCannonShots(ctx:CanvasRenderingContext2D,state:GameState,low=false):void{
  if(!state.territory)return;
  const shot=state.playerFlight;
  if(shot){
    // The player is the only flying body. Ground marks never create a second
    // shell or character; the ordinary hero pass owns its lifted sprite.
    ctx.save();circle(ctx,shot.to,shot.radius??TERRITORY_CANNON_BALANCE.radius,'#cde5b008','#b9d8b4',2);ctx.restore();
  }
  for(const event of state.events){
    const age=state.elapsed-event.tick*BALANCE.step;
    if(event.type!=='TERRITORY_CANNON_EXPLODED'||age<0||age>=.5)continue;
    const p={x:Number(event.data.x),y:Number(event.data.y)},radius=Number(event.data.radius),progress=age/.5;
    ctx.save();ctx.globalAlpha=1-progress;
    circle(ctx,p,radius,'#d3e5ac22','#f6e9b4',2);
    circle(ctx,p,Math.max(5,radius*Math.min(1,progress*2.8)),'#e4eabb10','#345a50',8*(1-progress)+2);
    circle(ctx,p,Math.max(6,55*(1-progress)),'#fff5c7','#fcffdf',2);
    if(!low)for(let i=0;i<10;i++){const angle=i/10*TAU;circle(ctx,{x:p.x+Math.cos(angle)*radius*progress,y:p.y+Math.sin(angle)*radius*progress},3*(1-progress)+1,'#fff4ca','#668b70',1);}
    ctx.restore();
  }
}
