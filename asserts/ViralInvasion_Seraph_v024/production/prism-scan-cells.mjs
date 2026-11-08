import sharp from 'sharp';import {readFile,writeFile,mkdir}from'node:fs/promises';import{dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';
import{neutralConnectedCutout}from'../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),spec=JSON.parse(await readFile(resolve(ROOT,'production/prism-frame-spec.json'),'utf8')),rows=[];
for(const s of spec.sources){
 const receipt=JSON.parse(await readFile(resolve(ROOT,`production/receipts/${s.receiptKey}.json`),'utf8'));if(receipt.status!=='succeeded')continue;
 const raw=receipt.raw[0].path,md=await sharp(raw).metadata(),cw=md.width/s.cols,ch=md.height/s.rows;
 for(const f of s.frames){const rect={left:Math.round(f.col*cw),top:Math.round(f.row*ch),width:Math.round((f.col+1)*cw)-Math.round(f.col*cw),height:Math.round((f.row+1)*ch)-Math.round(f.row*ch)};
 const{data,info}=await sharp(raw).extract(rect).ensureAlpha().raw().toBuffer({resolveWithObject:true});const cut=neutralConnectedCutout({data,width:info.width,height:info.height},{whiteMin:244,chromaMax:16,edgeUnmatte:false}),d=cut.image.data,W=info.width,H=info.height,N=W*H,seen=new Uint8Array(N),q=new Uint32Array(N),components=[];
 const cand=i=>{const p=i*4,r=d[p],g=d[p+1],b=d[p+2];return d[p+3]>0&&Math.min(r,g,b)>=244&&Math.max(r,g,b)-Math.min(r,g,b)<=16;};
 for(let i=0;i<N;i++){if(seen[i]||!cand(i))continue;let h=0,t=1,l=W,top=H,r=-1,b=-1,sum=0;seen[i]=1;q[0]=i;
 while(h<t){const k=q[h++],x=k%W,y=Math.floor(k/W);l=Math.min(l,x);top=Math.min(top,y);r=Math.max(r,x);b=Math.max(b,y);sum+=(d[k*4]+d[k*4+1]+d[k*4+2])/3;
 for(const [xx,yy]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(xx<0||xx>=W||yy<0||yy>=H)continue;const j=yy*W+xx;if(!seen[j]&&cand(j)){seen[j]=1;q[t++]=j;}}}
 if(t>=80)components.push({pixels:t,bbox:[l,top,r+1,b+1],mean:Math.round(sum/t*10)/10,seed:[i%W,Math.floor(i/W)]});}
 rows.push({key:`${s.direction}.${f.action}.${f.index}`,receiptKey:s.receiptKey,rect,components});
 }
}
await mkdir(resolve(ROOT,'production'),{recursive:true});await writeFile(resolve(ROOT,'production/prism-neutral-components.json'),JSON.stringify({rows},null,2)+'\n');console.log(JSON.stringify(rows,null,2));
