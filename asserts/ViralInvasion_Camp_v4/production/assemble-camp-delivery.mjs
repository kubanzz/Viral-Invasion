/**
 * Camp v4 text-only handoff. Never changes image bytes or shared game files.
 *   node asserts/ViralInvasion_Camp_v4/production/assemble-camp-delivery.mjs --phase first
 *   node asserts/ViralInvasion_Camp_v4/production/assemble-camp-delivery.mjs
 *
 * Inputs: asset-contract.json; source-processing.json {sources:[{key,output,runId,prompt,...}]};
 * runs.json; source-visual-review.json {sources:[{key|path,sha256,reviewed:true,
 * orthographicTopDown:true,boundaryMode:'code-owned'|'image-baked-exact',...}]}.
 * Ground metadata is validated against the fixed world/source contract. A code-owned
 * boundary does not license a wrong baked wall: actual source review must say the base
 * is open/has no mismatched baked boundary. Sources/candidates get zero runtime credit.
 * --phase first snapshots only workshop ground + forge; does not wait on other grounds.
 * Existing successful receipt/audit/HANDOFF files are refused, preserving released hashes.
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD = dirname(fileURLToPath(import.meta.url)), ROOT = dirname(PROD), REPO = resolve(ROOT, '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = value => value.replaceAll('\\', '/');
const array = (value, field) => Array.isArray(value) ? value : Array.isArray(value?.[field]) ? value[field] : [];
const equal = (a,b,eps=1e-6) => Array.isArray(a) && Array.isArray(b) && a.length===b.length && a.every((x,i)=>
  Array.isArray(x) ? equal(x,b[i],eps) : Number.isFinite(x) && Number.isFinite(b[i]) && Math.abs(x-b[i])<=eps);
const point = (matrix,p) => [matrix[0][0]*p[0]+matrix[0][1]*p[1]+matrix[0][2], matrix[1][0]*p[0]+matrix[1][1]*p[1]+matrix[1][2]];

async function guard(file) {
  const absolute=resolve(ROOT,file),rel=relative(ROOT,absolute);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('Read/write asset must remain in Camp_v4: '+file);
  let cursor=absolute;
  for(;;){
    try{if((await lstat(cursor)).isSymbolicLink())throw new Error('No symlink/junction outputs: '+file);}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(cursor===ROOT)break;cursor=dirname(cursor);
  }
  return absolute;
}
async function json(file,fallback){
  try{return JSON.parse((await readFile(await guard(file),'utf8')).replace(/^\uFEFF/,''));}
  catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}
}
async function absent(file){
  const path=await guard(file);
  try{await lstat(path);}catch(e){if(e.code==='ENOENT')return path;throw e;}
  throw new Error('Refusing to rewrite released text artifact: '+file);
}
async function writeNew(file,value){
  const path=await absent(file);await mkdir(dirname(path),{recursive:true});
  await writeFile(path,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
}
async function inspect(file){
  const path=await guard(file),bytes=await readFile(path),meta=await sharp(bytes).metadata();
  const {data,info}=await sharp(bytes).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparent=0,partial=0,opaque=0,hiddenRgb=0,left=info.width,top=info.height,right=-1,bottom=-1;
  const borders={top:0,right:0,bottom:0,left:0};
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const p=(y*info.width+x)*4,a=data[p+3];
    if(!a){transparent++;if(data[p]||data[p+1]||data[p+2])hiddenRgb++;}
    else if(a===255)opaque++;else partial++;
    if(a){
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
      if(!y)borders.top++;if(!x)borders.left++;if(y===info.height-1)borders.bottom++;if(x===info.width-1)borders.right++;
    }
  }
  const bounds=right<0?null:[left,top,right+1,bottom+1];
  const margins=bounds?{left,top,right:info.width-right-1,bottom:info.height-bottom-1}:null;
  return {path:slash(relative(ROOT,path)),repositoryPath:slash(relative(REPO,path)),absolutePath:slash(path),
    sha256:sha(bytes),bytes:bytes.length,dimensions:[meta.width,meta.height],format:meta.format,channels:meta.channels,
    hasAlphaChannel:meta.hasAlpha===true,visibleBounds:bounds,alphaBounds:bounds,boundsConvention:'[left,top,rightExclusive,bottomExclusive]; alpha>0',margins,
    alpha:{transparent,partial,opaque,visible:opaque+partial,transparentFraction:transparent/(info.width*info.height),hiddenRgb,
      border:borders,borderVisible:Object.values(borders).reduce((a,b)=>a+b,0)}};
}
function processingPath(source){return source?.output?.path??source?.path??null;}
function visualRecord(visual,key,path){return array(visual,'sources').find(v=>v.key===key||v.path===path||v.output?.path===path)??null;}
function actualVisualPass(review,source){return review?.reviewed===true||review?.actualImageReview===true||review?.selfChecks?.actualVisualReview===true||source?.selfChecks?.actualImageReview===true;}
function sourceGround(source){
  const r=source?.registration??{};
  const value=r.targetGround??r.targetAnchor??r.targetAnchorPx??source?.foot??source?.sourceAnchor;
  return Array.isArray(value)?value:null;
}
async function provenance(source,run){
  const original=source?.raw??source?.source??{};
  const runRaw=Array.isArray(run?.raw)?run.raw[0]:null;
  const rawPath=original.path??original.rawPath??source?.rawPath??runRaw?.path;
  const expected=original.sha256??original.rawSha256??source?.rawSha256??runRaw?.sha256;
  if(!rawPath)return {raw:null,expectedSha256:expected??null,matches:false};
  const bytes=await readFile(await guard(rawPath));
  const actual=sha(bytes);
  return {raw:{path:slash(relative(ROOT,await guard(rawPath))),sha256:actual,bytes:bytes.length},expectedSha256:expected??null,matches:!expected||actual===expected};
}

const phaseFlag=process.argv.indexOf('--phase');
const phase=phaseFlag<0?'complete':process.argv[phaseFlag+1];
if(!['first','complete'].includes(phase))throw new Error('--phase must be first or complete');
const [contract,processing,runsDoc,visual,selection]=await Promise.all([
  json('production/asset-contract.json'),json('production/source-processing.json'),json('production/runs.json'),
  json('production/source-visual-review.json',null),json('production/candidate-selection.json',{candidates:[]})]);
const wanted=contract.phases[phase].keys,expected=contract.assets.filter(a=>wanted.includes(a.key));
const sources=array(processing,'sources'),runs=Object.values(runsDoc.runs??{}),assets=[],checks=[],errors=[],warnings=[];
const check=(name,pass,details={})=>{checks.push({name,pass,...details});if(!pass)errors.push({name,...details});};
check('expected-phase-count',expected.length===wanted.length&&expected.length===(phase==='first'?2:4),{phase,actual:expected.length});

for(const def of expected){
  const source=sources.find(s=>s.key===def.key||processingPath(s)===def.path);
  check('source-processing-entry-present',Boolean(source),{key:def.key});
  if(!source)continue;
  const file=processingPath(source)??def.path,image=await inspect(file),review=visualRecord(visual,def.key,file);
  const runId=source.runId??source.sourceRunId??source.generationRunId;
  const run=runs.find(r=>r.runId===runId),prompt=source.prompt??run?.prompt;
  const chain=await provenance(source,run);
  check('png-true-alpha',image.format==='png'&&image.hasAlphaChannel&&image.alpha.transparent>0&&image.alpha.visible>0,{key:def.key});
  check('target-canvas',equal(image.dimensions,def.targetCanvas),{key:def.key,actual:image.dimensions,expected:def.targetCanvas});
  check('four-clear-borders',image.alpha.borderVisible===0,{key:def.key,border:image.alpha.border});
  check('safe-transparent-margin',image.margins&&Object.values(image.margins).every(v=>v>=(def.minimumTransparentMarginPx??contract.groundContract.minimumTransparentMarginPx)),{key:def.key,margins:image.margins});
  check('processed-file-sha',!source.output?.sha256||source.output.sha256===image.sha256,{key:def.key});
  check('actual-visual-inspection',actualVisualPass(review,source),{key:def.key});
  check('review-sha-matches-current-image',!review?.sha256||review.sha256===image.sha256,{key:def.key});
  check('source-run-and-prompt',Boolean(runId)&&Boolean(run)&&typeof prompt==='string'&&prompt.length>0,{key:def.key,runId});
  check('source-raw-sha-chain',chain.matches&&Boolean(chain.raw),{key:def.key});
  if(image.alpha.hiddenRgb)warnings.push({name:'alpha-zero-hidden-rgb',key:def.key,pixels:image.alpha.hiddenRgb,
    explanation:'These pixels are fully transparent (alpha0). A palette entry may retain RGB; preserve reviewed image bytes. Main owns final Renderer filtering review.'});
  const asset={...def,...image,runtime:true,runtimeFrameCredit:1,trim:false,
    approvalStatus:'producer-reviewed-pending-main-renderer',mainRendererApproved:false,runId,prompt,
    source:{...chain,processing:source,actualVisualReview:review??{selfChecks:source.selfChecks??{}}},
    animation:{group:def.id,index:0,frameCount:1,fps:1},
    noCharacterOrUiBaked:true};
  if(def.kind==='ground'){
    const mode=source.boundaryMode??source.worldMapping?.boundaryMode??source.registration?.boundaryMode??review?.boundaryMode??'code-owned';
    const topDown=review?.orthographicTopDown===true||review?.projection==='orthographic-top-down-world-xy'||source?.selfChecks?.orthographicTopDown===true;
    check('actual-orthographic-top-down-review',topDown,{key:def.key});
    check('boundary-mode-explicit',contract.groundContract.boundaryModes.includes(mode),{key:def.key,mode});
    if(mode==='image-baked-exact')check('baked-single-entry-verified',review?.entranceAlignmentVerified===true&&review?.onlyOneEntranceVerified===true,{key:def.key});
    else check('open-base-no-wrong-baked-wall',review?.noMismatchedBakedWall===true||review?.bakedBoundaryAbsent===true||source?.selfChecks?.noMismatchedBakedWall===true,{key:def.key});
    check('source-content-world-size-mapping',equal([def.contentRect[2]/def.worldPixelsPerUnit,def.contentRect[3]/def.worldPixelsPerUnit],def.worldSize),{key:def.key});
    check('center-map',equal(point(def.worldToSourceMatrix,def.worldCenter),def.sourceAnchor),{key:def.key});
    check('entry-center-map',equal(point(def.worldToSourceMatrix,def.entrance.centerWorld),def.entrance.centerSource),{key:def.key});
    check('entry-segment-map',def.entrance.worldSegment.every((p,i)=>equal(point(def.worldToSourceMatrix,p),def.entrance.sourceSegment[i])),{key:def.key});
    check('entry-width92',Math.abs(Math.hypot(def.entrance.worldSegment[1][0]-def.entrance.worldSegment[0][0],def.entrance.worldSegment[1][1]-def.entrance.worldSegment[0][1])-92)<1e-6,{key:def.key});
    const map=source.worldMapping??source.registration??{};
    if(Array.isArray(map.worldRect))check('processing-world-rect-matches',equal(map.worldRect,def.worldRect),{key:def.key});
    if(Array.isArray(map.contentRect))check('processing-content-rect-matches',equal(map.contentRect,def.contentRect),{key:def.key});
    const entrance=source.entrance??map.entrance;
    if(entrance?.centerSource)check('processing-entry-source-matches',equal(entrance.centerSource,def.entrance.centerSource),{key:def.key});
    Object.assign(asset,{boundaryMode:mode,boundaryOwnedByMain:mode==='code-owned',projection:'orthographic-top-down-world-xy',
      sourceYCompressed:false,runtimeWorldYScale:.72,applyWorldYScaleToArt:true,
      sourceRect:{x:0,y:0,width:def.targetCanvas[0],height:def.targetCanvas[1]},
      worldMapping:{worldRect:def.worldRect,worldCanvasRect:def.worldCanvasRect,worldCanvasSize:def.worldCanvasSize,
        worldCenter:def.worldCenter,worldPixelsPerUnit:def.worldPixelsPerUnit,contentRect:def.contentRect,
        worldToSourceMatrix:def.worldToSourceMatrix,sourceToWorldMatrix:def.sourceToWorldMatrix,sourceAnchor:def.sourceAnchor,pivot:def.pivot},
      entrance:def.entrance,codeBoundaryPolylineWorld:def.codeBoundaryPolylineWorld,codeBoundaryPolylineSource:def.codeBoundaryPolylineSource,
      renderInstructions:contract.groundContract.rendering});
  }else{
    const foot=sourceGround(source);
    check('forge-fixed-foot-registration',equal(foot,def.foot),{key:def.key,actual:foot,expected:def.foot});
    Object.assign(asset,{sourceRect:{x:0,y:0,width:512,height:512},foot:def.foot,
      actorRegistration:{canvas:[512,512],foot:def.foot,pivot:def.pivot,pivotSource:def.pivot,commonCanvasScale:1,trim:false},
      projection:'front-right-upright-facility',sourceYCompressed:false,runtimeWorldYScale:.72,applyWorldYScaleToArt:false,
      renderInstructions:def.projectionPolicy});
  }
  assets.push(asset);
}

const ground=assets.filter(a=>a.kind==='ground'),groundBytes=ground.reduce((n,a)=>n+a.bytes,0);
check('runtime-count',assets.length===wanted.length,{actual:assets.length,expected:wanted.length});
check('unique-ids',new Set(assets.map(a=>a.id)).size===assets.length);
check('unique-paths',new Set(assets.map(a=>a.path)).size===assets.length);
check('ground-png-budget',groundBytes<=contract.groundContract.compressedPngBudgetBytes,{actualBytes:groundBytes,limitBytes:1572864,groundCount:ground.length,expectedFinalGroundCount:3});
if(phase==='complete')check('three-ground-components',ground.length===3,{actual:ground.length});
const audit={schemaVersion:1,scope:'Camp_v4-only-read-only-image-audit',phase,status:errors.length?'failed':'passed-producer-technical-checks-pending-main-renderer',
  runtimeCount:assets.length,imageWrites:0,errorCount:errors.length,warningCount:warnings.length,errors,warnings,checks,
  groundBudget:{groundCount:ground.length,pngBytes:groundBytes,pngMiB:groundBytes/1048576,limitBytes:1572864,
    finalThreeGroundBudgetVerified:phase==='complete'&&ground.length===3&&groundBytes<=1572864},
  mainRendererApproval:false,approvalBoundary:'Source art/geometry checks only; real scene proportions, paths, collisions and mobile framing remain with main.'};
if(errors.length){
  const failed='production/delivery-'+phase+'-failed-'+Date.now()+'.audit.json';await writeNew(failed,audit);
  console.error(JSON.stringify({status:'failed',phase,errors,audit:failed},null,2));process.exitCode=1;
}else{
  const receipt=contract.phases[phase].receipt,auditPath=phase==='first'?'production/delivery-p0-first-audit.json':'production/delivery-audit.json',
    handoffPath=phase==='first'?'HANDOFF-P0-FIRST.md':'HANDOFF.md';
  await Promise.all([absent(receipt),absent(auditPath),absent(handoffPath)]);
  const referencePath=resolve(REPO,contract.approvedReference),referenceBytes=await readFile(referencePath);
  const delivery={schemaVersion:1,theme:contract.theme,phase,status:'producer-ready-pending-main-renderer',
    completedRuntimeCount:assets.length,expectedRuntimeCount:4,approvedRuntimeCount:0,mainRendererApproved:false,
    approvedReference:{repositoryPath:contract.approvedReference,sha256:sha(referenceBytes)},layoutEvidence:contract.layoutEvidence,
    assets,groundBudget:audit.groundBudget,sourceMethod:'Actual image-generation sources, producer selection and declared local alpha/planar registration. No per-frame animation claim.',
    sourceMastersAndCandidatesCountAsRuntime:false,candidates:selection.candidates??selection,
    producerVisualReview:{scope:'Embedded snapshot of selected asset reviews; source table may gain other phase entries without changing this receipt.',
      sourceFile:'production/source-visual-review.json',records:assets.map(a=>a.source.actualVisualReview)},
    contract,technicalAudit:{path:auditPath,errorCount:0,warningCount:warnings.length},
    writeBoundary:contract.writeBoundary,imagesWrittenByAssembler:0};
  const md='# Camp v4 '+(phase==='first'?'首批 P0':'完整 P0')+'交付\n\n'+
    '状态：制作端检查通过，待主会话实际 Renderer 审查。'+assets.length+'/4 张运行 PNG；本脚本没有写图。\n\n'+
    assets.map(a=>'- `'+a.id+'` → `'+a.path+'`；'+a.dimensions.join('×')+'；SHA256 `'+a.sha256+'`。').join('\n')+'\n\n'+
    '地表为未压缩的世界 XY 正上方素材，按完整画布 `worldCanvasSize` 放置，中心为 `worldCenter`，运行时仅地表图片 Y 乘0.72一次。三院世界矩形、contentRect、入口 source/world 坐标和边界 polyline 均在 delivery JSON 中。不得根据 alpha bbox 重新fit。\n\n'+
    '默认 `boundaryMode=code-owned` 表示美术开放基底；主会话用精确 polyline 画连续低矮奶油组织边界，仅留下92世界单位入口。只有实际审查过唯一正确入口的墙可标 `image-baked-exact`。\n\n'+
    '工坊为512² front-right完整设施，foot=(256,435.2)、pivot=(.5,.85)。只投影其世界脚点，不把工坊竖向图片再次压扁。只有ready，不把淡入施工算成新增动画帧。\n\n'+
    '本批地表 PNG '+(groundBytes/1048576).toFixed(3)+' MiB / 1.5 MiB；'+(phase==='first'?'这是首批预算，三张完整预算需最终批次复核。':'三张合计预算已实际检查。')+'\n\n'+
    '参考只使用已批准 concept。源码、共享 art-selection、.art-generated、旧素材未由本组装器修改。成功交付文本拒绝重写；任何图像修改需新路径和新回执。\n';
  await writeNew(receipt,delivery);await writeNew(auditPath,audit);await writeNew(handoffPath,md);
  console.log(JSON.stringify({status:audit.status,phase,delivery:slash(relative(REPO,resolve(ROOT,receipt))),
    deliverySha256:sha(await readFile(resolve(ROOT,receipt))),runtimeCount:assets.length,groundBytes,errors:0,warnings:warnings.length},null,2));
}
