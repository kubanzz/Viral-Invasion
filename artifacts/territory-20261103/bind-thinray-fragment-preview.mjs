import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,sep} from 'node:path';
const fragmentPath=process.argv[2];if(!fragmentPath)throw Error('Pass exact neutral thinRay8 fragment');
const f=JSON.parse(await readFile(fragmentPath,'utf8')),root=resolve('asserts/ViralInvasion_Fantasy_Actors_v2'),path='asserts/art-selection.json',selection=JSON.parse(await readFile(path,'utf8'));
if(!Array.isArray(f.assets)||f.assets.length!==8)throw Error('Expected8 neutral thinRay frames');
for(const a of f.assets){
  if(!/^fantasy\.actor\.enemy\.thinRay\.(walk|windup|hurt|dissolve)\.\d\d$/.test(a.id))throw Error(`Unexpected frame ${a.id}`);
  const source=resolve(root,a.path),rel=relative(root,source);if(rel.startsWith('..')||!rel)throw Error('Unsafe actor source');
  const bytes=await readFile(source),sha=createHash('sha256').update(bytes).digest('hex');if(sha!==a.sha256)throw Error(`Source hash differs ${a.id}`);
  const asset=selection.sprites.find(item=>item.id===a.id);if(!asset||asset.animation.approved)throw Error(`Missing or still approved frame ${a.id}`);
  const count=a.frameCount??a.animation?.frameCount,index=a.frameIndex??a.animation?.index,fps=a.fps??count*1000/a.animation?.durationMs;
  if(!Number.isFinite(fps)||fps<=0||!Number.isInteger(index)||!Number.isInteger(count))throw Error(`Invalid action timing ${a.id}`);
  asset.source=`ViralInvasion_Fantasy_Actors_v2/${rel.split(sep).join('/')}`;asset.expectedSha256=sha;asset.status='candidate-neutral-mouth-review';
  asset.flags=['candidate-not-runtime-approved','shared-source-canvas','zero-approved-animation-credit','neutral-mouth-source-revision'];
  asset.animation={group:a.id.replace(/\.\d\d$/,''),index,fps,frameCount:count,approved:false,loop:a.loop??a.animation?.loop??false,motionMethod:a.mode,kind:a.kind};
}
await writeFile(path,JSON.stringify(selection,null,2)+'\n');console.log(JSON.stringify({bound:8,approved:0,fragmentPath}));
