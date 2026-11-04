import{readFile}from'node:fs/promises';import{resolve,dirname,relative,isAbsolute}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import sharp from'sharp';
const prod=dirname(fileURLToPath(import.meta.url)),root=dirname(prod),sha=b=>createHash('sha256').update(b).digest('hex');
const d=JSON.parse(await readFile(resolve(root,'delivery.json'),'utf8')),p=JSON.parse(await readFile(resolve(prod,'asset-plan.json'),'utf8')),ids=new Map(p.assets.map(v=>[v.id,v])),seen=new Set(),errors=[],stats={};
function inside(v){const a=resolve(root,v),r=relative(root,a);if(r.startsWith('..')||isAbsolute(r))throw Error('Outside actor root');return a;}
for(const a of d.assets){try{if(seen.has(a.id)||!ids.has(a.id))throw Error('Duplicate or unexpected ID');seen.add(a.id);const bytes=await readFile(inside(a.path)),meta=await sharp(bytes).metadata(),plan=ids.get(a.id);if(sha(bytes)!==a.sha256)throw Error('PNG hash mismatch');if(meta.format!=='png'||!meta.hasAlpha||meta.width!==plan.dimensions[0]||meta.height!==plan.dimensions[1]||a.trim!==false)throw Error('Canvas/alpha/trim mismatch');if(a.sourceRect.width!==meta.width||a.sourceRect.height!==meta.height||a.sourceRect.x!==0||a.sourceRect.y!==0)throw Error('Wrong full-frame sourceRect');if(a.mode?.includes('rig')&&!a.source?.sha256)throw Error('Derived frame missing exact source SHA');stats[plan.family]=(stats[plan.family]??0)+1;}catch(e){errors.push({id:a.id,error:e.message});}}
if(d.completedRuntimeCount!==seen.size)errors.push({error:'completedRuntimeCount mismatch'});
if(!process.argv.includes('--allow-incomplete')&&seen.size!==115)errors.push({error:'115 runtime items required'});
for(const c of d.animationGroups??[]){if(c.ids.some(v=>!seen.has(v)))errors.push({clip:c.name,error:'Missing logical frame'});if(c.kind==='rig-baked-sequence'&&(!c.localGeometryChanged||c.uniqueFrames!==c.frameCount))errors.push({clip:c.name,error:'No distinct local motion evidence'});}
const hero=d.samples.find(v=>v.id==='fantasy.actor.hero.front_right.master');if(hero.badgeRevision?.name?.includes('v02')||hero.path.includes('v02'))errors.push({error:'Hero final sample reverted to small cross'});
const pending=p.assets.filter(v=>!seen.has(v.id)).map(v=>v.id);
for(const a of d.assets.filter(v=>v.family==='hero')){
 const sample=d.heroHeldSamples?.[a.direction],grip=a.handGrip;
 if(!Array.isArray(grip)||grip.length!==2||grip.some(v=>!Number.isFinite(v)||v<0||v>512))errors.push({id:a.id,error:'Missing/invalid per-frame actual handGrip'});
 if(sample&&a.source?.sha256!==sample.sha256)errors.push({id:a.id,error:'Hero frame does not derive from the current approved held PNG'});
 const point=a.handGripSource,m=a.upperBodyMatrix;
 if(sample&&Array.isArray(point)&&Math.hypot(point[0]-sample.primaryHandGrip[0],point[1]-sample.primaryHandGrip[1])>1e-6)errors.push({id:a.id,error:'Per-frame rig uses a different C-hand source point'});
 if(Array.isArray(point)&&Array.isArray(m)&&m.length===6&&Array.isArray(grip)){
  const expected=[m[0]*point[0]+m[2]*point[1]+m[4],m[1]*point[0]+m[3]*point[1]+m[5]];
  if(Math.hypot(expected[0]-grip[0],expected[1]-grip[1])>1e-6)errors.push({id:a.id,error:'Hand grip does not match its actual upper-body rig transform'});
 }
}
console.log(JSON.stringify({passed:errors.length===0,count:seen.size,expected:115,acceptedRuntimeCount:d.acceptedRuntimeCount??0,stats,groups:d.animationGroups?.length??0,pendingCount:pending.length,pendingIds:pending,errors},null,2));if(errors.length)process.exitCode=1;
