import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,sep} from 'node:path';
const fragmentPath=process.argv[2];if(!fragmentPath)throw Error('Pass exact hero fragment path');
const replaceReviewed=process.argv.includes('--replace-reviewed');
const fragment=JSON.parse(await readFile(fragmentPath,'utf8')),root=resolve('asserts/ViralInvasion_Fantasy_Actors_v2'),selectionPath='asserts/art-selection.json';
const selection=JSON.parse(await readFile(selectionPath,'utf8')),assets=fragment.assets;
if(!Array.isArray(assets)||assets.length!==18)throw Error('Expected18 frames in one authored hero direction');
for(const asset of assets){
  if(!/^fantasy\.actor\.hero\.(front_right|back_right)\.(idle|walk|hurt|dash)\.\d\d$/.test(asset.id)||!asset.handGrip||asset.trim!==false)throw Error(`Invalid hero frame ${asset.id}`);
  const path=resolve(root,asset.path),rel=relative(root,path);if(rel.startsWith('..')||rel==='')throw Error('Unsafe hero source');
  const bytes=await readFile(path),sha=createHash('sha256').update(bytes).digest('hex');if(sha!==asset.sha256)throw Error(`Hero source changed ${asset.id}`);
  const current=selection.sprites.find(item=>item.id===asset.id);if(current?.animation?.approved&&!replaceReviewed)throw Error(`Already reviewed hero frame ${asset.id}; explicit parent replacement authorization required`);
  const [width,height]=asset.dimensions,frame={id:asset.id,source:`ViralInvasion_Fantasy_Actors_v2/${rel.split(sep).join('/')}`,expectedSha256:sha,
    sourceFrame:{x:0,y:0,width,height},size:256,trim:false,pivotSource:[.5,.85],status:'candidate-animation-review',flags:['candidate-not-runtime-approved','shared-source-canvas','zero-approved-animation-credit'],
    actorRegistration:{canvas:{width,height},foot:{x:asset.foot[0],y:asset.foot[1]},grip:{x:asset.handGrip[0],y:asset.handGrip[1]},commonCanvasScale:1},
    animation:{group:asset.id.replace(/\.\d\d$/,''),index:asset.frameIndex,fps:asset.fps,frameCount:asset.frameCount,approved:false,loop:asset.loop,
      motionMethod:asset.mode,kind:asset.kind,gripMethod:asset.handGripMethod}};
  if(current)Object.assign(current,frame);else selection.sprites.push(frame);
}
await writeFile(selectionPath,JSON.stringify(selection,null,2)+'\n');
console.log(JSON.stringify({bound:assets.length,source:fragmentPath,heroApproved:selection.sprites.filter(a=>a.id.startsWith('fantasy.actor.hero.')&&a.animation?.approved).length}));
