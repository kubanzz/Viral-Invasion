import {installCampArt as installProps} from '../variants-v3/preview-art';
export function installCampArt(runtime:any){
 installProps(runtime);const g:any=globalThis;
 const ellipse=(ctx:any,x:number,y:number,rx:number,ry:number,fill:string,stroke?:string)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.4;ctx.stroke();}};
 const round=(ctx:any,x:number,y:number,w:number,h:number,r:number,fill:string)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();};
 const seed=(i:number)=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};
 function terrace(ctx:any,x:number,y:number,w:number,h:number,fill:string,gateSide:string,gate:number){
  // Raised floor, a continuous low curb, and ONE opening define each real yard.
  round(ctx,x+2,y+14,w,h,31,'#796c5e23');round(ctx,x,y+10,w,h,29,'#b7baa2');
  const top=ctx.createLinearGradient(x,y,x+w,y+h);top.addColorStop(0,fill);top.addColorStop(1,fill);
  ctx.beginPath();ctx.roundRect(x,y,w,h,28);ctx.fillStyle=top;ctx.fill();
  ctx.save();ctx.clip();
  for(let i=0;i<420;i++){const px=x+seed(i+11)*w,py=y+seed(i+1900)*h;ellipse(ctx,px,py,1+seed(i)*2.5,.7+seed(i+40),'#fff9e32a');}
  ctx.restore();
  const trace=()=>{const r=28;ctx.beginPath();
   if(gateSide==='right'){
    ctx.moveTo(x+w,gate+46);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,gate-46);
   }else{
    ctx.moveTo(x,gate-46);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,gate+46);
   }
  };
  ctx.lineJoin='round';ctx.lineCap='round';trace();ctx.strokeStyle='#7e9a827a';ctx.lineWidth=16;ctx.stroke();trace();ctx.strokeStyle='#e8dfc8';ctx.lineWidth=11;ctx.stroke();trace();ctx.strokeStyle='#fbf2dc';ctx.lineWidth=3;ctx.stroke();
  const edge=gateSide==='right'?x+w:x;round(ctx,edge-18,gate-44,36,88,6,'#e5d7bc');
  for(const dy of [-27,0,27]){ctx.beginPath();ctx.moveTo(edge-15,gate+dy);ctx.lineTo(edge+15,gate+dy);ctx.strokeStyle='#b3b49a99';ctx.lineWidth=1;ctx.stroke();}
 }
 function plantedStrip(ctx:any,x:number,y:number,w:number,h:number){
  round(ctx,x,y,w,h,12,'#a0b598');
  for(let i=0;i<Math.ceil((w+h)/17);i++){
   const px=x+7+seed(i+700)*(w-14),py=y+5+seed(i+900)*(h-10);
   ellipse(ctx,px,py,4+seed(i+17)*4,3+seed(i+45)*3,i%2?'#bed0ac':'#8eac8f');
  }
 }
 g.__campGround=(ctx:any,state:any)=>{
  const core=state.territory.nodes.find((n:any)=>n.id==='core');ctx.save();ctx.translate(core.x,core.y);
  // One main axis; three clearly separated compounds, never overlapping blobs.
  round(ctx,-69,76,138,356,38,'#d8c8a799');round(ctx,-63,76,126,353,35,'#f5e5c6');
  round(ctx,-169,55,175,90,18,'#f3e2c3');round(ctx,0,205,170,90,18,'#f3e2c3');
  ctx.beginPath();ctx.moveTo(55,115);ctx.bezierCurveTo(115,110,81,-40,168,-40);ctx.lineWidth=80;ctx.lineCap='round';ctx.strokeStyle='#f3e2c3';ctx.stroke();
  terrace(ctx,-535,-235,385,495,'#cbd2bd','right',100);
  terrace(ctx,150,-235,370,265,'#e9dfc8','left',-40);
  terrace(ctx,150,150,370,225,'#c8d7cc','left',250);
  // Each accessory group attaches to a single continuous strip along an outer edge.
  plantedStrip(ctx,-511,-213,327,30);plantedStrip(ctx,-512,-160,25,145);
  plantedStrip(ctx,178,-213,316,30);plantedStrip(ctx,475,174,23,172);
  round(ctx,-492,-81,69,67,8,'#e6ddc4');round(ctx,-483,-73,52,49,6,'#bcc4a8');
  round(ctx,-490,142,80,63,8,'#e5dac0');round(ctx,-483,150,66,46,5,'#bac1a5');
  round(ctx,416,-145,59,137,9,'#d8ceb3');plantedStrip(ctx,421,-139,49,122);
  round(ctx,440,245,53,69,7,'#e2d8bf');round(ctx,446,252,41,52,5,'#b0c1b0');
  // Two low steps give the heart a single focal base.
  ellipse(ctx,0,32,105,75,'#c6baa2','#9fac94');ellipse(ctx,0,22,99,70,'#e8dcc1','#faf1d9');ellipse(ctx,0,13,87,60,'#d2dcbb','#f5ebcf');
  ctx.restore();
 };
}
