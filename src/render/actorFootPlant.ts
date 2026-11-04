import type { Vec } from '../game/types';
import type { ActorFrame } from './actorAnimation';
import type { HeroRig } from './heroRig';
import type { VisualBounds } from './raisedObstacleGeometry';

/** Sole landmarks measured from all 16 original RGBA frames (alpha >100),
 * then inspected at full size. They are not inferred from the whole-body box. */
export const HERO_WALK_SOLES = {
  front_right: [{ x:214.5,y:435 },{ x:207.5,y:435 },{ x:200.5,y:435 },{ x:193.5,y:435 },
    { x:186.5,y:435 },{ x:190,y:419 },{ x:203.5,y:410 },{ x:211.5,y:419 }],
  back_right: [{ x:307.5,y:434 },{ x:300.5,y:434 },{ x:293.5,y:434 },{ x:286.5,y:434 },
    { x:279.5,y:434 },{ x:330,y:423 },{ x:298,y:410 },{ x:307.5,y:419 }],
} as const;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (a: number,b: number,n: number) => { const p=clamp((n-a)/(b-a)); return p*p*(3-2*p); };

export function heroSoleContact(frame?: ActorFrame): Vec | undefined {
  if (!frame || frame.identity !== 'hero' || frame.clip !== 'walk') return;
  const direction = frame.authoredDirection as keyof typeof HERO_WALK_SOLES;
  const sole = HERO_WALK_SOLES[direction]?.[frame.index]; if (!sole) return;
  return { x: (sole.x-frame.registration.foot.x)*frame.sourceScale*(frame.flipX?-1:1), y:0 };
}

export function actorFootPlantPoint(frame:ActorFrame,sourcePoint:Vec):Vec {
  const sole=frame.identity==='hero'&&frame.clip==='walk'
    ?HERO_WALK_SOLES[frame.authoredDirection as keyof typeof HERO_WALK_SOLES]?.[frame.index]:undefined;
  const shift=sole?Math.max(0,frame.registration.foot.y-sole.y):0;
  const local=sole?1-smooth(34,76,Math.abs(sourcePoint.x-sole.x)):0;
  const kneeStart=Math.max(334,(frame.registration.grip?.y??0)+12);
  const dy=sole?shift*local*smooth(kneeStart,sole.y-3,sourcePoint.y):0;
  return {x:(sourcePoint.x-frame.registration.foot.x)*frame.sourceScale*(frame.flipX?-1:1),
    y:(sourcePoint.y-frame.registration.foot.y+dy)*frame.sourceScale};
}

/** Only the support leg below its knee is extended by at most 6.3 world px.
 * Head, body, hands, emitter, canvas and common foot registration stay fixed. */
export function createActorFootPlant(frame: ActorFrame, point: Vec): HeroRig | undefined {
  const sole=frame.identity==='hero'&&frame.clip==='walk'
    ?HERO_WALK_SOLES[frame.authoredDirection as keyof typeof HERO_WALK_SOLES]?.[frame.index]:undefined;
  const asset=frame.asset,b=asset.sourceBounds,v=asset.visibleBounds;
  if(!sole||!b||b.x===undefined||b.y===undefined||b.width===undefined)return;
  const vertices:number[]=[],indices:number[]=[],columns=18,rows=30;
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
    const u=col/columns,w=row/rows,ax=u*asset.width,ay=w*asset.height;
    const sx=b.x+(ax-v.x)*b.width/v.width,sy=b.y+(ay-v.y)*b.height/v.height;
    const {x,y}=actorFootPlantPoint(frame,{x:sx,y:sy});
    vertices.push(x,y,u,w); left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const a=row*(columns+1)+col,c=a+columns+1;indices.push(a,c,a+1,0,c,a+1,c+1,0);}
  const bounds:VisualBounds={left:point.x+left-2,right:point.x+right+2,top:point.y*.72+top-2,bottom:point.y*.72+bottom+2};
  return {mesh:{vertices,indices},bounds,wrist:{x:point.x,y:point.y*.72}};
}

export function drawHeroContactShadow(ctx:CanvasRenderingContext2D,point:Vec,contact?:Vec):void{
  ctx.save();ctx.fillStyle='#203f3c88';ctx.beginPath();
  ctx.ellipse(point.x+(contact?.x??0),point.y+(contact?.y??0),contact?9:15,contact?3.5:5,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
