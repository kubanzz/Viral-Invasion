import sharp from'sharp';import{readFile,writeFile,mkdir}from'node:fs/promises';import{resolve,dirname,relative}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import{makeReviewedSourceCutout}from'./process-source-masters.mjs';
import{prepareParts,bakeLayeredFrame,analyzeFrame}from'./actor-animation-baker.mjs';
const prod=dirname(fileURLToPath(import.meta.url)),root=dirname(prod),sha=b=>createHash('sha256').update(b).digest('hex');
const registry=JSON.parse(await readFile(resolve(prod,'runs.json'),'utf8')),records=[];
const png=i=>sharp(i.data,{raw:{width:1024,height:1024,channels:4}}).png({compressionLevel:9}).toBuffer();
const write=async(name,b)=>{const p=resolve(prod,name);await mkdir(dirname(p),{recursive:true});await writeFile(p,b);return{path:relative(root,p).replaceAll('\\','/'),sha256:sha(b),bytes:b.length};};
// Explicit centres/scales were selected after viewing the actual generated attachment art.
const profiles={membrane:{sourceAnchor:[1024,1050],target:[515,430],scale:.36,hole:[1024,1024]},carapace:{sourceAnchor:[1024,1024],target:[515,445],scale:.34},fission:{sourceAnchor:[1024,1200],target:[512,620],scale:.5},mimic:{sourceAnchor:[1024,760],target:[512,304],scale:.32}};
for(const[name,p]of Object.entries(profiles)){
 const sourceId=`fantasy.actor.mother.${name}.layer.master`,run=registry.runs[sourceId];if(run?.status!=='succeeded')throw Error('Layer source not ready');
 const raw=await readFile(resolve(root,run.raw[0].path));if(sha(raw)!==run.raw[0].sha256)throw Error('Raw hash changed');
 const cut=await makeReviewedSourceCutout(raw,{whiteMin:240,chromaMax:18,edgeWidth:2,negativeSpaceSeeds:p.hole?[p.hole]:[]});
 const parts=await prepareParts([{id:'attachment',image:cut.buffer,sourceJoint:p.sourceAnchor,targetJoint:p.target,scale:[p.scale,p.scale],z:0}]);
 const image=bakeLayeredFrame(parts,{}, {parts:{attachment:{scale:[p.scale,p.scale]}}},{actorType:'mother'});
 if(name==='membrane')for(let i=0;i<image.data.length;i+=4){image.data[i+3]=Math.round(image.data[i+3]*.48);if(!image.data[i+3])image.data.fill(0,i,i+3);}
 const qa=analyzeFrame(image);if(qa.borderPixels||qa.alpha.hiddenRgbPixels||!qa.bbox)throw Error('Layer alpha/border failed');
 const out=await write(`mother-layers-v02/fantasy.actor.mother.${name}.png`,await png(image));
 records.push({id:'fantasy.actor.mother.'+name,...out,dimensions:[1024,1024],trim:false,foot:[512,870.4],pivot:[.5,.85],overlay:true,kind:'mother-overlay',mode:'maliang-generated-registered-layer',generationRunId:run.runId,
  source:{path:run.raw[0].path,sha256:sha(raw),sourceRunId:run.runId},actualImageInputs:run.actualImageInputs,
  registration:{group:'fantasy.actor.mother',sourceCanvas:[2048,2048],targetCanvas:[1024,1024],sourceAnchor:p.sourceAnchor,targetAnchor:p.target,uniformScale:p.scale,translation:[p.target[0]-p.sourceAnchor[0]*p.scale,p.target[1]-p.sourceAnchor[1]*p.scale],perFrameFitAllowed:false},
  removal:cut.report,qa});
}
const base=await readFile(resolve(root,'production/frames/fantasy.actor.mother.base.00.png')),layers=[];
for(let i=0;i<records.length;i++){const r=records[i],b=await readFile(resolve(root,r.path));
 const alone=await sharp(b).resize(384,384).flatten({background:'#36403b'}).png().toBuffer();
 const combinedBytes=await sharp(base).composite([{input:b}]).png().toBuffer();
 const combined=await sharp(combinedBytes).resize(384,384).flatten({background:'#b3beb7'}).png().toBuffer();
 layers.push({input:alone,left:0,top:i*414},{input:combined,left:384,top:i*414});
 layers.push({input:Buffer.from(`<svg width="768" height="30"><text x="8" y="21" font-size="16" fill="#eee">${r.id}: layer / over base</text></svg>`),left:0,top:i*414+384});
}
const contact=await write('qa/mother-layers-v02-contact.png',await sharp({create:{width:768,height:1656,channels:4,background:'#27322e'}}).composite(layers).png().toBuffer());
await write('mother-layers-v02.fragment.json',Buffer.from(JSON.stringify({schemaVersion:1,status:'rendered-awaiting-self-visual-review',expectedCount:4,assets:records,clips:[],contactSheet:contact,visualReview:{status:'pending-actual-view',approved:false}},null,2)+'\n'));
console.log(JSON.stringify({count:records.length,contact}));
