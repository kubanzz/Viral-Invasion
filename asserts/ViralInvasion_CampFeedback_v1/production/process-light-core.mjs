/**
 * One-asset CampFeedback intake; no generation, no existing-package writes.
 * node .../process-light-core.mjs production/source-spec.json
 * Input: {rawPath,rawSha256?,runId,nodeId,canvasId,model,prompt,storage,receiptPath,
 *         whiteMin:210,chromaMax:45,edgeUnmatte:true,alphaMinComponentPixels:32,
 *         protectedPolygons:[],holes:[],sourceReview:{passed:true,reviewer,note}}
 * sourceReview must inspect the real source and confirm no baked floor/shadow/effects.
 */
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
// Imported functions only return buffers/reports. Its CLI is guarded and never invoked.
import {neutralConnectedCutout,smallComponentCleanup,inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
async function guard(file){const p=resolve(ROOT,file),r=relative(ROOT,p);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Write outside CampFeedback_v1');let q=p;for(;;){try{if((await lstat(q)).isSymbolicLink())throw Error('Output symlink/junction unsupported');}catch(e){if(e.code!=='ENOENT')throw e;}if(q===ROOT)break;q=dirname(q);}return p;}
async function writeNew(file,b){const p=await guard(file);await mkdir(dirname(p),{recursive:true});await writeFile(p,b,{flag:'wx'});return{path:relative(ROOT,p).replaceAll('\\','/'),absolutePath:p,sha256:hash(b),bytes:b.length};}
async function rgba(input){const{data,info}=await sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});return{data,width:info.width,height:info.height};}
const png=im=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({compressionLevel:9}).toBuffer();
function clearInvisibleRGB(im){for(let p=0;p<im.data.length;p+=4)if(!im.data[p+3])im.data.fill(0,p,p+3);}
const input=process.argv[2]??'production/source-spec.json';
const spec=JSON.parse((await readFile(isAbsolute(input)?input:resolve(ROOT,input),'utf8')).replace(/^\uFEFF/,''));
if(!spec.runId||!spec.nodeId||!spec.canvasId||!spec.model||spec.sourceReview?.passed!==true||!spec.sourceReview.reviewer)throw Error('Confirmed generation identity and actual source review required');
const originalPath=isAbsolute(spec.rawPath)?resolve(spec.rawPath):resolve(ROOT,spec.rawPath),original=await readFile(originalPath),md=await sharp(original).metadata();if(spec.rawSha256&&spec.rawSha256!==hash(original))throw Error('Source SHA mismatch');
let source=await rgba(original);if(source.width!==1024||source.height!==1024)throw Error('Expected real1024 square source');const sourceAlpha=inspectAlpha(source,1);let transparency;
if(spec.alphaMode==='preserve'){if(!md.hasAlpha||!sourceAlpha.alpha.transparent)throw Error('Source is not actually transparent');transparency={method:'preserve-native-alpha',nativeTransparency:true};}
else{const cut=neutralConnectedCutout(source,spec);source=cut.image;transparency=cut.report;}
if(spec.alphaMinComponentPixels!==undefined){const clean=smallComponentCleanup(source,spec.alphaMinComponentPixels);source=clean.image;transparency.componentCleanup=clean.report;}
clearInvisibleRGB(source);const measured=inspectAlpha(source,8),full=inspectAlpha(source,1),b=full.bbox;if(!b||measured.alpha.borderVisible||full.alpha.borderVisible)throw Error('Empty or clipped source contour');
// Keep all nonzero source alpha while fitting the effective visible entity to640px.
const scale=640/measured.visibleMaxPx,crop={left:b[0],top:b[1],width:b[2]-b[0],height:b[3]-b[1]},resized=await sharp(await png(source)).extract(crop).resize({width:Math.round(crop.width*scale),height:Math.round(crop.height*scale),fit:'fill'}).png().toBuffer(),rm=await sharp(resized).metadata();
const left=Math.round(512-rm.width/2),top=Math.round(450-rm.height/2);if(left<8||top<8||left+rm.width>1016||top+rm.height>1016)throw Error('Registered complete entity would clip');
let image=await rgba(await sharp({create:{width:1024,height:1024,channels:4,background:'#00000000'}}).composite([{input:resized,left,top}]).png().toBuffer());clearInvisibleRGB(image);
const alpha=inspectAlpha(image,1),effective=inspectAlpha(image,8),solid=inspectAlpha(image,33);if(!alpha.alpha.transparent||alpha.alpha.borderVisible||alpha.alpha.hiddenRGB||effective.visibleMaxPx<638||effective.visibleMaxPx>642)throw Error('Final alpha or visible640px fit failed');
const encoded=await png(image),output=await writeNew('summon-light-core.png',encoded),qa={};
for(const[name,bg]of [['black','#151c1a'],['cream','#fff7e5']])qa[name]=await writeNew('production/qa/light-core.'+name+'.png',await sharp(encoded).flatten({background:bg}).png().toBuffer());
qa.alpha=await writeNew('production/qa/light-core.alpha.png',await sharp(encoded).extractChannel(3).png().toBuffer());
const visibleWidth=alpha.bbox[2]-alpha.bbox[0],recommendations=[];
for(const width of [80,96,110]){const canvasWidth=1024*width/visibleWidth,logicalScale=width/visibleWidth,canvasHeight=Math.round(canvasWidth),sized=await sharp(encoded).resize(Math.round(canvasWidth),canvasHeight,{fit:'fill'}).png().toBuffer(),m=await sharp(sized).metadata();for(const[name,bg]of [['black','#151c1a'],['cream','#fff7e5']])qa[width+'px-visible-'+name]=await writeNew('production/qa/light-core.'+width+'px-visible.'+name+'.png',await sharp(sized).flatten({background:bg}).png().toBuffer());recommendations.push({targetVisibleEntityWidth:width,logicalCanvasWidth:canvasWidth,logicalCanvasHeight:canvasWidth,logicalPixelsPerSourcePixel:logicalScale,hoverGapLogical: (870-alpha.bbox[3])*logicalScale,actualQaCanvas:[m.width,m.height],formula:'canvasWidth=targetVisibleEntityWidth*1024/actualAlphaBBoxWidth',notAppliedToGame:true});}
let rawRecord;const rawPath='raw/'+spec.runId+extname(originalPath).toLowerCase();try{const b=await readFile(resolve(ROOT,rawPath));if(hash(b)!==hash(original))throw Error('Existing raw copy differs');rawRecord={path:rawPath,absolutePath:resolve(ROOT,rawPath),sha256:hash(b),bytes:b.length};}catch(e){if(e.code!=='ENOENT')throw e;rawRecord=await writeNew(rawPath,original);}
const record={schemaVersion:1,theme:'ViralInvasion_CampFeedback_v1',status:'processed-awaiting-actual-black-cream-visual-review',asset:{key:'summon-light-core',...output,dimensions:[1024,1024],channels:4,trueAlpha:true,pivot:[.5,.849609375],trim:false,logicalGround:[512,870],registration:{entityCenter:[512,450],targetVisibleMaxPx:640,sourceAlphaContentRect:crop,sourceEffectiveAlphaThreshold:8,uniformScale:scale,resizedSize:[rm.width,rm.height],translation:[left,top],sourceEntityClipped:false},alphaBounds:alpha.bbox,alphaBoundsThreshold:1,solidAlphaBounds:solid.bbox,solidAlphaThreshold:33,effectiveAlphaBounds:effective.bbox,effectiveVisibleMaxPx:effective.visibleMaxPx,alpha:alpha.alpha,hoverGapPx:870-alpha.bbox[3],hoverGapConvention:'logicalGroundY minus actual nonzero-alpha bottom-exclusive boundary',logicalSizeRecommendations:recommendations,source:{...rawRecord,originalAbsolutePath:originalPath,dimensions:[md.width,md.height],runId:spec.runId,nodeId:spec.nodeId,canvasId:spec.canvasId,model:spec.model,prompt:spec.prompt,storage:spec.storage,receiptPath:spec.receiptPath,review:spec.sourceReview},transparency,qa,effectsOwnership:{shadow:'runtime',breathingHalo:'runtime',lightColumn:'runtime',particles:'runtime'},mainRendererApproved:false},writeBoundary:'Only ViralInvasion_CampFeedback_v1; no old frozen package/code/public selection writes'};
await writeNew('production/source-processing.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({status:record.status,file:output.absolutePath,sha256:output.sha256,alphaBBox:alpha.bbox,solidBBox:solid.bbox,hoverGapPx:record.asset.hoverGapPx,recommendations},null,2));
