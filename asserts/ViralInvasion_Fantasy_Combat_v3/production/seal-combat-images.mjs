/** Record exact reviewed image bytes. Does not modify any image. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve('asserts/ViralInvasion_Fantasy_Combat_v3');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const deliveryBuffer=await readFile(root+'/delivery.json'),delivery=JSON.parse(deliveryBuffer);
if(delivery.completedRuntimeCount!==72)throw new Error('Complete 72-frame delivery required');
const assets=new Map(delivery.assets.map(x=>[x.path,x]));
const images=[];
async function visit(dir){
 for(const e of await readdir(dir,{withFileTypes:true})){
  const absolute=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error('No image symlinks');
  if(e.isDirectory())await visit(absolute);
  else if(/\.(png|gif|webp)$/i.test(e.name)){
   const relative=path.relative(root,absolute).replaceAll('\\','/'),bytes=await readFile(absolute);
   images.push({path:relative,sha256:hash(bytes),bytes:bytes.length,runtime:assets.has(relative),assetId:assets.get(relative)?.id??null});
  }
 }
}
await visit(root);images.sort((a,b)=>a.path.localeCompare(b.path));
const runtimeImages=images.filter(x=>x.runtime);
if(runtimeImages.length!==72)throw new Error('Runtime file coverage differs from delivery');
for(const x of runtimeImages)if(assets.get(x.path).sha256!==x.sha256)throw new Error('Delivery image hash mismatch '+x.path);
const signature=hash(Buffer.from(images.map(x=>x.path+'\t'+x.sha256).join('\n')));
const freeze={schemaVersion:1,scope:'Fantasy_Combat_v3-only',status:'producer-reviewed-images-sealed-pending-main-renderer',mainRendererApproved:false,allImageWritesStopped:true,imageCount:images.length,runtimeImageCount:72,imageSignature:signature,policy:'Preserve every listed image byte. Any requested revision uses a new version path; never overwrite a reviewed PNG/GIF. New versions require a new handoff receipt.',images};
await writeFile(root+'/production/image-freeze.json',JSON.stringify(freeze,null,2)+'\n',{flag:'wx'});
const handoff={schemaVersion:1,version:'v0.14',status:delivery.status,assetRoot:'asserts/ViralInvasion_Fantasy_Combat_v3',runtimeCount:72,animationGroups:26,delivery:{path:'delivery.json',sha256:hash(deliveryBuffer)},imageFreeze:{path:'production/image-freeze.json',imageSignature:signature,imageCount:images.length},sourceVisualReview:'production/source-visual-review.json',technicalAudit:'production/delivery-audit.json',preview:'production/qa/design-overview.png',allFramesPreview:'production/qa/all72.contact.png',mainRendererReview:'pending',imagesWrittenBySeal:0,allImageWritesStopped:true};
await writeFile(root+'/production/handoff.json',JSON.stringify(handoff,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({runtimeFrames:72,imageCount:images.length,imageSignature:signature,deliverySha256:handoff.delivery.sha256}));
