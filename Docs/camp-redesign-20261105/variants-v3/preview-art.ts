// Drawing helpers for a disposable layout fixture. Existing sprite art is reused.
// Small ceramic seats, low tables, lamps and planting trays are native canvas proposals.
export function installCampArt(runtime:any) {
  const g:any=globalThis;
  const ids:Record<string,string>={tree:'fantasy.tree.healthy',bush:'fantasy.lung.tree.healthy',rock:'fantasy.lung.rock.healthy',crystal:'fantasy.rock.healthy',flower:'fantasy.healing.healthy',bag:'fantasy.expedition.lootBag.fixed.ready.00',biomass:'fantasy.expedition.repairBiomass.fixed.ready.00',blueprint:'fantasy.expedition.blueprintBasePod.fixed.ready.00',weapon:'fantasy.expedition.iconSteadyFlowGun.fixed.normal.00',broken:'fantasy.expedition.iconSteadyFlowGun.fixed.broken.00'};
  const ell=(ctx:any,x:number,y:number,rx:number,ry:number,fill:string,stroke?:string)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.4;ctx.stroke();}};
  const curve=(ctx:any,points:number[],width:number,color:string)=>{ctx.beginPath();ctx.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=6)ctx.bezierCurveTo(...points.slice(i,i+6));ctx.lineWidth=width;ctx.lineCap='round';ctx.strokeStyle=color;ctx.stroke();};
  const patch=(ctx:any,x:number,y:number,rx:number,ry:number,color:string)=>{
    ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.moveTo(-rx,-ry*.1);
    ctx.bezierCurveTo(-rx*.98,-ry*.8,-rx*.3,-ry*1.07,rx*.22,-ry*.9);
    ctx.bezierCurveTo(rx*.9,-ry*.85,rx*1.05,-ry*.2,rx*.95,ry*.25);
    ctx.bezierCurveTo(rx*.85,ry*.95,rx*.15,ry*1.07,-rx*.45,ry*.85);
    ctx.bezierCurveTo(-rx*.95,ry*.72,-rx*1.05,ry*.25,-rx,-ry*.1);ctx.closePath();
    ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#b6bd9d55';ctx.lineWidth=2;ctx.stroke();ctx.restore();
  };
  g.__campGround=(ctx:any,state:any)=>{
    const d=g.__campDesign;if(!d)return;const c=state.territory.nodes.find((n:any)=>n.id==='core');
    ctx.save();ctx.translate(c.x,c.y);ctx.filter='blur(1.8px)';
    if(d.letter==='A'){
      patch(ctx,0,85,358,300,'#efddc474');
      ell(ctx,0,82,200,152,'#f6e9d578','#bdc9a54f');
      ell(ctx,0,82,177,129,'#f7e8d447','#faf2db91');
      curve(ctx,[-38,376,-35,311,8,257,0,183],82,'#f5e8ca9c');
      for(const [,x,y] of d.stations){ell(ctx,x,y+16,110,88,'#d3dbbd3e');}
    }else if(d.letter==='B'){
      patch(ctx,-14,24,139,172,'#d5dfc48c');
      curve(ctx,[18,75,172,58,378,67,656,96],102,'#e4d4b485');
      curve(ctx,[18,75,172,58,378,67,656,96],77,'#f9edcfaa');
      for(const [,x,y] of d.stations){patch(ctx,x,y+21,114,98,'#e2d9ba7a');curve(ctx,[x+75,y+55,x+111,y+79,x+90,99,x+44,99],43,'#f5e8cb90');}
    }else{
      patch(ctx,-246,-141,231,156,'#ded7ba77');
      patch(ctx,-24,139,212,201,'#e8ddbf7d');
      patch(ctx,341,78,143,153,'#ccdabc78');
      curve(ctx,[-122,-64,-100,3,-142,50,-84,96],45,'#f7e9cda8');
      curve(ctx,[103,151,176,173,236,136,335,110],53,'#f7e9cda8');
      curve(ctx,[146,361,167,299,170,259,210,209],67,'#f7e9cda8');
    }
    ctx.filter='none';
    // The heart receives a modest, readable garden base in all alternatives.
    ell(ctx,0,8,77,57,'#dbcba58a','#aaa98770');
    ell(ctx,0,2,70,50,'#efe2bfcb','#f9efd2bf');
    ell(ctx,0,-1,59,41,'#becfa678');
    // Tiny stones at the outside, rather than a continuous fence.
    for(const p of d.plants.filter((v:any)=>v[0]==='bush')){
      const x=p[1],y=p[2];ell(ctx,x-13,y+10,7,4,'#dfd4b5ab','#b7b0926b');ell(ctx,x+16,y+13,5,3,'#e8ddc5c0');
    }
    ctx.restore();
  };
  const cache=new Map<string,HTMLCanvasElement>();
  function propCanvas(kind:string){
    if(cache.has(kind))return cache.get(kind)!;
    const canvas=document.createElement('canvas');canvas.width=140;canvas.height=120;const ctx=canvas.getContext('2d')!;
    ctx.translate(70,94);ctx.lineJoin='round';ctx.lineCap='round';
    ell(ctx,0,3,kind==='lamp'?13:34,kind==='lamp'?4:9,'#6d72532b');
    const surface=ctx.createLinearGradient(0,-30,0,0);surface.addColorStop(0,'#fcf2d8');surface.addColorStop(1,'#d8cbb2');
    ctx.fillStyle=surface;ctx.strokeStyle='#9b9d81';ctx.lineWidth=1.5;
    if(kind==='bench'||kind==='table'){
      for(const x of [-21,21]){ctx.beginPath();ctx.roundRect(x-4,-7,8,13,3);ctx.fillStyle='#98ae93';ctx.fill();ctx.stroke();}
      ctx.beginPath();ctx.moveTo(-33,-17);ctx.quadraticCurveTo(0,-29,33,-17);ctx.lineTo(33,-7);ctx.quadraticCurveTo(0,3,-33,-7);ctx.closePath();ctx.fillStyle=surface;ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(-30,-16);ctx.quadraticCurveTo(0,-24,30,-16);ctx.strokeStyle='#fff9e7';ctx.stroke();
      if(kind==='table'){ctx.beginPath();ctx.moveTo(-25,-16);ctx.lineTo(-25,-41);ctx.moveTo(25,-16);ctx.lineTo(25,-41);ctx.moveTo(-25,-35);ctx.lineTo(25,-35);ctx.strokeStyle='#7d9b82';ctx.lineWidth=3;ctx.stroke();}
    }else if(kind==='lamp'){
      ell(ctx,0,1,11,5,'#cfceb1','#9ba68b');ctx.strokeStyle='#71937a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-8,-23,0,-42);ctx.stroke();
      const glow=ctx.createRadialGradient(0,-43,2,0,-43,20);glow.addColorStop(0,'#ffe5a96e');glow.addColorStop(1,'#ffe5a900');ctx.fillStyle=glow;ctx.fillRect(-23,-67,46,46);
      ctx.beginPath();ctx.moveTo(0,-32);ctx.bezierCurveTo(-15,-39,-10,-52,0,-58);ctx.bezierCurveTo(11,-50,14,-39,0,-32);ctx.fillStyle='#f2d49c';ctx.fill();ctx.strokeStyle='#aa9c72';ctx.lineWidth=1.4;ctx.stroke();
      ell(ctx,0,-45,4,8,'#fff0bb');
    }else if(kind==='planter'){
      ctx.beginPath();ctx.roundRect(-32,-15,64,19,8);ctx.fillStyle=surface;ctx.fill();ctx.stroke();ell(ctx,0,-15,30,10,'#b1bea0','#a8ad8c');
      for(const x of [-20,-7,7,20]){ctx.beginPath();ctx.moveTo(x,-15);ctx.bezierCurveTo(x-17,-27,x-12,-36,x,-25);ctx.bezierCurveTo(x+13,-43,x+17,-23,x,-15);ctx.fillStyle=x%2?'#90b395':'#a7c49b';ctx.fill();ctx.strokeStyle='#789a7d';ctx.lineWidth=1;ctx.stroke();}
    }
    cache.set(kind,canvas);return canvas;
  }
  g.__campProp=(renderer:any,entity:any,state:any,ctx:any,depth:number)=>{
    const p=g.__campProps[entity.index],point=renderer.camera.worldToScreen(p),scale=renderer.camera.scale;
    if(['bench','table','lamp','planter'].includes(p.kind)){
      const canvas=propCanvas(p.kind);renderer.seenRasters.add(p.id);renderer.rasterKeys.add(p.id);
      renderer.host.setRasterLayer(p.id,canvas,depth,140*scale,120*scale,point.x-70*scale,point.y-94*scale);return true;
    }
    const asset=runtime.assets[ids[p.kind]];if(!asset)throw Error('Missing preview prop '+p.kind);
    const b=asset.visibleBounds,k=p.height/b.height;
    renderer.host.sprite(p.id,{texture:asset.atlas,frame:asset.frame,x:point.x,y:point.y,width:asset.width*k*scale,height:asset.height*k*scale,depth,
      originX:(b.x+b.width/2)/asset.width,originY:(b.y+b.height)/asset.height,alpha:1});
    return true;
  };
}
