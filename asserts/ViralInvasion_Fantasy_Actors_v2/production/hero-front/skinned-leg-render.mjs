/** Continuous source-texture skinning. Joint folds overlap by painter order; no inverse-field fold claim. */
import {transformPoint} from '../actor-animation-baker.mjs';
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>(n=clamp(n),n*n*(3-2*n));
function sample(im,x,y){const xx=x-.5,yy=y-.5,ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy;let a=0,r=0,g=0,b=0;for(let j=0;j<2;j++)for(let i=0;i<2;i++){const sx=ix+i,sy=iy+j;if(sx<0||sy<0||sx>=512||sy>=512)continue;const p=(sy*512+sx)*4,w=(i?fx:1-fx)*(j?fy:1-fy)*im.data[p+3]/255;a+=w;r+=im.data[p]*w;g+=im.data[p+1]*w;b+=im.data[p+2]*w;}return a>1e-9?[r/a,g/a,b/a,a]:[0,0,0,0];}
export function overPixel(data,p,c){const a=c[3],b=data[p+3]/255,out=a+b*(1-a);if(out<=1e-9)return;for(let k=0;k<3;k++)data[p+k]=Math.round((c[k]*a+data[p+k]*b*(1-a))/out);data[p+3]=Math.round(out*255);if(!data[p+3])data.fill(0,p,p+3);}
export function overImage(target,image){for(let p=0;p<target.data.length;p+=4)if(image.data[p+3])overPixel(target.data,p,[image.data[p],image.data[p+1],image.data[p+2],image.data[p+3]/255]);}
function cross(a,b,p){return(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);}
const topLeft=(a,b)=>b[1]<a[1]||(b[1]===a[1]&&b[0]>a[0]);
/** Fixed512 RGBA leg texture. Pass measured sourceRect for another source/direction. */
export function legSource(source,side,sourceRect){
 const r=sourceRect?{...sourceRect}:side==='near'?{left:145,top:345,width:103,height:100}:{left:257,top:338,width:93,height:68};
 if(source.width!==512||source.height!==512||source.data.length!==512*512*4)throw Error('legSource requires fixed512 RGBA source');
 if(!['left','top','width','height'].every(k=>Number.isInteger(r[k]))||r.left<0||r.top<0||r.width<=0||r.height<=0||r.left+r.width>512||r.top+r.height>512)throw Error('legSource rectangle must be positive integer dimensions inside512 source: '+JSON.stringify(r));
 const data=Buffer.alloc(source.data.length);for(let y=r.top;y<r.top+r.height;y++)for(let x=r.left;x<r.left+r.width;x++){const p=(y*512+x)*4;source.data.copy(data,p,p,p+4);}return{data,width:512,height:512,rect:r};
}
export function renderSkinnedLeg(target,source,bones,matrices,{step=3,rootMatrix=null,rootBand=0,rootRigidRows=3,rootTopByX=null,footStartByX=null}={}){
 const r=source.rect,xs=[],ys=[];for(let x=r.left;x<r.left+r.width;x+=step)xs.push(x);xs.push(r.left+r.width);for(let y=r.top;y<r.top+r.height;y+=step)ys.push(y);ys.push(r.top+r.height);
 if(rootMatrix&&(!Array.isArray(rootMatrix)||rootMatrix.length!==6||!rootMatrix.every(Number.isFinite)||rootBand<=rootRigidRows||rootBand>r.height))throw Error('Invalid source-root binding');
 const vertices=ys.map(y=>xs.map(x=>{const footStart=footStartByX?footStartByX(x):bones.ankle[1]-8,foot=smooth((y-footStart)/16),thigh=(1-foot)*(1-smooth((y-bones.knee[1]+13)/26)),shin=1-foot-thigh,weights=[thigh,shin,foot],p=[x,y],q=[0,0];for(let i=0;i<3;i++){const v=transformPoint(matrices[i],p);q[0]+=v[0]*weights[i];q[1]+=v[1]*weights[i];}if(rootMatrix){const rootTop=rootTopByX?rootTopByX(x):r.top,rootWeight=1-smooth((y-rootTop-rootRigidRows)/(rootBand-rootRigidRows)),v=transformPoint(rootMatrix,p);q[0]=q[0]*(1-rootWeight)+v[0]*rootWeight;q[1]=q[1]*(1-rootWeight)+v[1]*rootWeight;}return{source:p,dest:q};}));
 let triangles=0,visibleFoldTriangles=0,degenerateTriangles=0;
 function raster(aa,bb,cc){let a=aa,b=bb,c=cc,det=cross(a.dest,b.dest,c.dest);if(Math.abs(det)<1e-8){degenerateTriangles++;return;}if(det<0){const mid=[(a.source[0]+b.source[0]+c.source[0])/3,(a.source[1]+b.source[1]+c.source[1])/3];if(sample(source,...mid)[3]>.1)visibleFoldTriangles++;[b,c]=[c,b];det=-det;}triangles++;
  const l=Math.max(0,Math.floor(Math.min(a.dest[0],b.dest[0],c.dest[0]))),rr=Math.min(512,Math.ceil(Math.max(a.dest[0],b.dest[0],c.dest[0]))),t=Math.max(0,Math.floor(Math.min(a.dest[1],b.dest[1],c.dest[1]))),bot=Math.min(512,Math.ceil(Math.max(a.dest[1],b.dest[1],c.dest[1])));
  for(let y=t;y<bot;y++)for(let x=l;x<rr;x++){const p=[x+.5,y+.5],ea=cross(b.dest,c.dest,p),eb=cross(c.dest,a.dest,p),ec=cross(a.dest,b.dest,p);if(ea<0||eb<0||ec<0||(ea===0&&!topLeft(b.dest,c.dest))||(eb===0&&!topLeft(c.dest,a.dest))||(ec===0&&!topLeft(a.dest,b.dest)))continue;const u=ea/det,v=eb/det,w=ec/det,sx=u*a.source[0]+v*b.source[0]+w*c.source[0],sy=u*a.source[1]+v*b.source[1]+w*c.source[1],colour=sample(source,sx,sy);if(colour[3])overPixel(target.data,(y*512+x)*4,colour);}
 }
 // Thigh first, then shin and shoe. Folded inner joint skin is explicitly occluded by later rows.
 for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++){const a=vertices[y][x],b=vertices[y][x+1],c=vertices[y+1][x],d=vertices[y+1][x+1];raster(a,b,d);raster(a,d,c);}
 return{method:rootMatrix?'forward-triangulated-source-root-and-three-bone-texture-skinning':'forward-triangulated-three-bone-source-texture-skinning',step,triangles,visibleFoldTriangles,degenerateTriangles,foldHandling:'inner joint self-occlusion rendered thigh-to-shoe; not an invertible local image warp',sourceRect:r,...(rootMatrix?{rootBinding:{matrix:rootMatrix,sourceBandPx:rootBand,rigidSourceRows:rootRigidRows,method:'same-upperBody-affine-at-shared-source-boundary-then-continuous-source-leg-blend'}}:{})};
}
