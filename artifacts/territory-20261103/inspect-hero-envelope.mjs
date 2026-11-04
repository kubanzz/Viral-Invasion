import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bytes=await readFile('.art-generated/art-runtime.json'),runtime=JSON.parse(bytes),expected=[];
for(const direction of ['front_right','back_right'])for(const [clip,count]of Object.entries({idle:4,walk:8,hurt:2,dash:4}))for(let index=0;index<count;index++)expected.push(`fantasy.actor.hero.${direction}.${clip}.${String(index).padStart(2,'0')}`);
const bound=expected.filter(id=>runtime.assets[id]),missing=expected.filter(id=>!runtime.assets[id]),emitter=runtime.assets['fantasy.actor.weapon.emitter'],r=emitter.actorRegistration,
  es=96/r.canvas.width*r.commonCanvasScale,b=emitter.sourceBounds,v=emitter.visibleBounds;
// Recover the actual source pivot from native atlas metadata independently of the production helper.
const sourceGrip={x:b.x+(emitter.pivot.x*emitter.width-v.x)*b.width/v.width,y:b.y+(emitter.pivot.y*emitter.height-v.y)*b.height/v.height},
  toolBounds={left:(b.x-sourceGrip.x)*es-2,right:(b.x+b.width-sourceGrip.x)*es+2,top:(b.y-sourceGrip.y)*es-2,bottom:(b.y+b.height-sourceGrip.y)*es+2};
const extrema={left:{value:Infinity},right:{value:-Infinity},top:{value:Infinity},bottom:{value:-Infinity}};
function include(bounds,details){for(const edge of ['left','right','top','bottom'])if(['left','top'].includes(edge)?bounds[edge]<extrema[edge].value:bounds[edge]>extrema[edge].value)extrema[edge]={value:bounds[edge],...details};}
for(const id of bound){
  const asset=runtime.assets[id],reg=asset.actorRegistration,scale=128/reg.canvas.height*reg.commonCanvasScale,s=asset.sourceBounds,
    raw={left:(s.x-reg.foot.x)*scale-2,right:(s.x+s.width-reg.foot.x)*scale+2,top:(s.y-reg.foot.y)*scale-2,bottom:(s.y+s.height-reg.foot.y)*scale+2};
  for(let degrees=0;degrees<360;degrees+=.25){
    const facing=degrees*Math.PI/180,back=Math.sin(facing)<0;if(id.includes('.back_right.')!==back)continue;
    const flipX=Math.cos(facing)<0,grip={x:(reg.grip.x-reg.foot.x)*scale*(flipX?-1:1),y:(reg.grip.y-reg.foot.y)*scale};
    include({...raw,left:flipX?-raw.right:raw.left,right:flipX?-raw.left:raw.right},{id,source:'body',worldAngle:degrees});
    for(const recoil of [-.075,0,.075]){
      const angle=Math.atan2(Math.sin(facing)*.72,Math.cos(facing))+recoil,c=Math.cos(angle),s=Math.sin(angle),corners=[];
      for(const x of [toolBounds.left,toolBounds.right])for(const rawY of [toolBounds.top,toolBounds.bottom]){const y=flipX?-rawY:rawY;corners.push({x:grip.x+x*c-y*s,y:grip.y+x*s+y*c});}
      include({left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))},
        {id,source:'tool',worldAngle:degrees,recoil});
    }
  }
}
const report={scope:'Independent source/atlas metadata geometry envelope,128 hero canvas/96 emitter, actual per-pose grips, upright body, two authored directions+X mirror. Quarter-degree half-plane sweep plus actual recoil extrema;2world padding agrees with visible-body protection. Complements actual native screenshot checks; not natural-play/final acceptance.',
  runtimeSha256:createHash('sha256').update(bytes).digest('hex'),expectedCount:36,boundCount:bound.length,approvedCount:bound.filter(id=>runtime.assets[id].animation.approved).length,
  completeFrames:missing.length===0,missingExpectedIds:missing,envelope:Object.fromEntries(Object.entries(extrema).map(([key,value])=>[key,value.value])),extrema};
await writeFile('artifacts/territory-20261103/hero-geometry-envelope.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
