import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const root = resolve('asserts/ViralInvasion_CombatVfx_v1');
const toolRoot = resolve('artifacts/tools/effekseer-1.80.8/Effekseer1.80.8Win');
const tool = join(toolRoot, 'Tool/bin/Effekseer.exe');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rel = path => relative(root, path).replaceAll('\\', '/');
const definitions = [
  { group:'hit-light', tint:[154,238,210], life:18, sparkCount:7, force:.08, size:128, width:54, height:54, blendMode:'add' },
  { group:'hit-heavy', tint:[255,215,145], life:26, sparkCount:12, force:.13, size:192, width:94, height:94, blendMode:'add' },
  { group:'kill', tint:[188,234,190], life:34, sparkCount:15, force:.1, size:192, width:108, height:108, blendMode:'add' },
  { group:'cleanse', tint:[139,228,190], life:34, sparkCount:11, force:.045, size:192, width:118, height:118, blendMode:'add' },
  { group:'slash', tint:[255,194,139], life:18, sparkCount:4, force:.09, size:256, width:145, height:94, blendMode:'add' },
  { group:'thunder-pillar', tint:[185,210,255], life:30, sparkCount:7, force:.02, size:256, width:168, height:360, blendMode:'add', pivot:[.5,.85] },
  { group:'ground-ring', tint:[144,208,185], life:32, sparkCount:3, force:.035, size:192, width:150, height:86, blendMode:'add' },
];
const settings = { width:256, height:256, startFrame:1, endFrame:36, frequency:2, fps:30, xCount:6,
  expectedFrameCount:18, exporter:'Sprite', transparency:'GenerateAlpha', storage:'Local',
  viewpoint:{focus:[0,0,0],angle:[0,0],distance:20,projection:'orthographic',note:'Recorder framing must be inspected in the editor before recording.'} };
const range = (name, min, max=min) => `<${name}><Center>${(min+max)/2}</Center><Max>${max}</Max><Min>${min}</Min></${name}>`;
const colour = rgb => `<R>${rgb[0]}</R><G>${rgb[1]}</G><B>${rgb[2]}</B><A>255</A>`;
function node({name,texture='spark',life=20,count=1,delay=0,scale=.7,grow=0,velocity=0,tint=[255,255,255],rotate,x=0,y=0,alpha=255}) {
  return `<Node><Name>${name}</Name><CommonValues><MaxGeneration><Value>${count}</Value></MaxGeneration>${range('Life',life)}${range('GenerationTime',.01)}${range('GenerationTimeOffset',delay)}</CommonValues>
  <LocationValues><Type>1</Type><PVA><Location>${range('X',x)}${range('Y',y)}</Location><Velocity>${range('X',-velocity,velocity)}${range('Y',-velocity,velocity)}</Velocity></PVA></LocationValues>
  <RotationValues><Type>1</Type><PVA><Rotation>${range('Z',rotate??0,rotate??360)}</Rotation><Velocity>${range('Z',rotate===undefined?-2:0,rotate===undefined?2:0)}</Velocity></PVA></RotationValues>
  <ScalingValues><Type>3</Type><SinglePVA>${range('Scale',scale*.8,scale*1.2)}${range('Velocity',grow)}</SinglePVA></ScalingValues>
  <RendererCommonValues><ColorTexture>textures/${texture}.png</ColorTexture><AlphaBlend>2</AlphaBlend><FadeInType>1</FadeInType><FadeIn><Frame>1</Frame></FadeIn><FadeOutType>1</FadeOutType><FadeOut><Frame>${Math.max(4,Math.round(life*.55))}</Frame></FadeOut></RendererCommonValues>
  <DrawingValues><Sprite><Billboard>2</Billboard><ColorAll>0</ColorAll><ColorAll_Fixed>${colour(tint).replace('<A>255</A>',`<A>${alpha}</A>`)}</ColorAll_Fixed></Sprite></DrawingValues><Children /></Node>`;
}
function project(d) {
  const {group,tint,life,sparkCount,force}=d;
  let nodes = node({name:'01 contact flash',texture:'flash',life:6,scale:group==='thunder-pillar'?.8:1.8,y:group==='thunder-pillar'?.3:0,tint,alpha:230});
  if(group!=='thunder-pillar')nodes += node({name:'02 expanding soft shock',texture:group==='slash'?'slash':'ring',life,scale:.45,grow:group==='slash'?.12:.095,tint,alpha:180,delay:1});
  nodes += node({name:'03 tapered drifting petals',texture:'spark',life:group==='thunder-pillar'?14:Math.round(life*.8),count:sparkCount,scale:group==='thunder-pillar'?.14:.32,y:group==='thunder-pillar'?.3:0,grow:-.003,velocity:force,tint,delay:2});
  if(group==='kill'||group==='cleanse')nodes+=node({name:'04 drifting membrane motes',texture:'mote',life:life+2,count:6,scale:.55,grow:.015,velocity:.035,tint,delay:4,alpha:110});
  if(group==='slash')nodes+=node({name:'04 hooked brush release',texture:'slash',life:13,scale:3.4,grow:.04,tint,delay:0,rotate:-25});
  if(group==='thunder-pillar')nodes+=node({name:'04 descending discharge',texture:'pillar',life:24,scale:4,grow:-.035,tint,delay:2,y:1.75,alpha:240,rotate:0});
  if(group==='ground-ring')nodes+=node({name:'04 grounding sweep',texture:'ring',life:28,scale:1.2,grow:.11,tint,delay:2,alpha:110});
  return `<?xml version="1.0" encoding="utf-8"?><EffekseerProject><Root><Name>Viral Invasion / ${group}</Name><Children>${nodes}</Children></Root><Behavior><Distance>1</Distance></Behavior><Recording><RecordingWidth>256</RecordingWidth><RecordingHeight>256</RecordingHeight><IsRecordingGuideShown>True</IsRecordingGuideShown><RecordingScale>1</RecordingScale><RecordingStartingFrame>1</RecordingStartingFrame><RecordingEndingFrame>36</RecordingEndingFrame><RecordingFrequency>2</RecordingFrequency><RecordingHorizontalCount>6</RecordingHorizontalCount><RecordingExporter>0</RecordingExporter><RecordingTransparentMethod>2</RecordingTransparentMethod><RecordingStorageTarget>1</RecordingStorageTarget></Recording><ToolVersion>1.43</ToolVersion><Version>3</Version><StartFrame>0</StartFrame><EndFrame>42</EndFrame><IsLoop>True</IsLoop></EffekseerProject>`;
}
const textures = {
  flash:'<ellipse cx="64" cy="64" rx="25" ry="18" fill="white" opacity=".25" filter="url(#blur)"/><path d="M64 12 Q65 54 84 48 L113 31 Q86 60 81 66 L124 78 Q88 75 78 82 L89 114 Q68 81 61 82 L39 120 Q54 82 49 75 L9 66 Q48 61 52 52 L37 22 Q56 48 64 12 Z" fill="url(#soft)"/><ellipse cx="64" cy="64" rx="9" ry="7" fill="white"/>',
  ring:'<g fill="none" stroke="white" stroke-linecap="round"><path d="M26 54 C34 27 64 17 85 29 M101 50 C116 78 85 109 58 105 M39 96 C24 85 19 70 26 54" stroke-width="11" opacity=".12" filter="url(#blur)"/><path d="M28 52 C35 31 61 21 83 30" stroke-width="4" opacity=".8"/><path d="M99 51 C113 80 84 106 57 102" stroke-width="2.8" opacity=".72"/><path d="M39 94 C28 84 24 72 27 60" stroke-width="2" opacity=".55"/><path d="M37 43 C47 30 61 27 76 29" stroke-width="1" opacity=".6"/></g>',
  spark:'<path d="M48 17 C89 34 78 77 53 113 C63 72 68 42 48 17 Z" fill="url(#soft)"/><path d="M56 30 C72 55 64 79 57 94" stroke="white" fill="none" stroke-width="1" opacity=".5"/>',
  mote:'<path d="M64 18 C110 22 113 91 74 108 C29 122 8 64 31 35 Z" fill="url(#soft)" opacity=".65"/>',
  slash:'<path d="M15 94 Q26 13 114 24 Q72 21 44 61 Q31 80 15 94 Z" fill="url(#soft)"/><path d="M17 92 Q41 30 108 25" fill="none" stroke="white" stroke-width="2" opacity=".9"/>',
  pillar:'<g fill="none" stroke="white" stroke-linejoin="round"><path d="M67 8 C51 31 78 36 60 56 C48 70 77 80 63 119" stroke-width="13" opacity=".22" filter="url(#blur)"/><path d="M67 8 L57 31 L68 45 L55 65 L68 83 L63 119" stroke-width="4.5"/><path d="M67 8 L57 31 L68 45 L55 65 L68 83 L63 119" stroke-width="1.3"/><path d="M58 32 L36 47 L39 67 M68 82 L89 89 L86 105 M61 16 L82 30 L78 44" stroke-width="1.5" opacity=".6"/></g>',
};
async function prepare() {
  for(const folder of ['source/textures','production/recordings','baked','qa'])await mkdir(join(root,folder),{recursive:true});
  for(const [name,body]of Object.entries(textures)) {
    const svg=`<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg"><defs><filter id="blur"><feGaussianBlur stdDeviation="2.5"/></filter><radialGradient id="soft"><stop offset="0" stop-color="white"/><stop offset=".65" stop-color="white" stop-opacity=".7"/><stop offset="1" stop-color="white" stop-opacity=".02"/></radialGradient></defs>${body}</svg>`;
    await writeFile(join(root,'source/textures',name+'.svg'),svg);
    await sharp(Buffer.from(svg)).png().toFile(join(root,'source/textures',name+'.png'));
  }
  for(const d of definitions) {
    const path=join(root,'source',d.group+'.efkproj');await writeFile(path,project(d));
    const output=join(root,'source',d.group+'.efkefc');
    const result=spawnSync(tool,['-cui','-in',path,'-o',output],{cwd:join(toolRoot,'Tool/bin'),encoding:'utf8',windowsHide:true,timeout:30000});
    if(result.error||result.status!==0)throw new Error(`Effekseer save failed for ${d.group}: ${result.error??result.stderr}`);
    const bytes=await readFile(output);if(bytes.length<32)throw Error('Empty native effect '+d.group);
    console.log(`Native Effekseer project saved: ${d.group}, ${bytes.length} bytes`);
  }
  await writeFile(join(root,'production','bake-settings.json'),JSON.stringify({tool:'Effekseer',version:'1.80.8',settings,definitions,method:'Native Effekseer project generation; editor Recorder output is required before ingestion. Texture masks are original SVG primitives, not baked animation frames.'},null,2));
  await writeFile(join(root,'source','combat.efkcamera'),JSON.stringify({FocusX:0,FocusY:0,FocusZ:0,AngleX:0,AngleY:0,Distance:20,RateOfMagnification:3,ClippingStart:1,ClippingEnd:500,CameraMode:1},null,2));
  await writeFile(join(root,'runtime-catalog.json'),JSON.stringify({schemaVersion:1,status:'awaiting-native-recording',groups:definitions.map(d=>({group:d.group,frameIds:[],fps:settings.fps,duration:0,startOffsetSeconds:0,pivot:{x:d.pivot?.[0]??.5,y:d.pivot?.[1]??.5},blendMode:d.blendMode,width:d.width,height:d.height}))},null,2)+'\n');
  await writeFile(join(root,'LICENSE.txt'),'Original node recipes and SVG texture masks: created for Viral Invasion, 2026-11-08.\nEffekseer tool: MIT, Copyright (c) 2011 Effekseer Project. No third-party sample artwork is copied.\n');
}
async function ingest() {
  const receipts=JSON.parse(await readFile(join(root,'production/recording-receipts.json'),'utf8'));
  const groups=[];const assets=[];const selection=JSON.parse(await readFile('asserts/art-selection.json','utf8'));
  for(const d of definitions) {
    const receipt=receipts.find(r=>r.group===d.group);if(!receipt||!['Effekseer editor Recorder','EffekseerForWebGL 1.80.8 native runtime bake'].includes(receipt.method))throw Error('Missing native Effekseer recording receipt '+d.group);
    const raw=join(root,receipt.path);const input=await readFile(raw);const meta=await sharp(input).metadata();
    if(!meta.hasAlpha||meta.width!==settings.width*settings.xCount||meta.height!==settings.height*3)throw Error('Unexpected native recording dimensions '+d.group);
    const frames=[];let first=-1,last=-1;const analysed=[];
    for(let i=0;i<settings.expectedFrameCount;i++) {
      const bytes=await sharp(input).extract({left:i%6*256,top:Math.floor(i/6)*256,width:256,height:256}).ensureAlpha().png().toBuffer();
      const {data}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});let opaque=0,partial=0,border=0,left=256,top=256,right=-1,bottom=-1;
      for(let p=0;p<256*256;p++){const a=data[p*4+3],x=p%256,y=Math.floor(p/256);if(a>=8)opaque++;if(a>0&&a<255)partial++;if(a){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);if(x===0||x===255||y===0||y===255)border++;}}
      analysed.push({i,bytes,visiblePixels:opaque,partialPixels:partial,borderPixels:border,bounds:right<0?null:{left,top,right,bottom}});if(opaque){if(first<0)first=i;last=i;}
    }
    if(first<0)throw Error('Native recording has no visible frames '+d.group);
    const visible=analysed.slice(first,last+1),union={left:Math.min(...visible.map(f=>f.bounds.left)),top:Math.min(...visible.map(f=>f.bounds.top)),right:Math.max(...visible.map(f=>f.bounds.right)),bottom:Math.max(...visible.map(f=>f.bounds.bottom))};
    const pivot=d.pivot??[.5,.5],anchor={x:256*pivot[0],y:256*pivot[1]},pad=12;
    const scale=Math.min((anchor.x-pad)/Math.max(1,128-union.left),(256-anchor.x-pad)/Math.max(1,union.right-128),(anchor.y-pad)/Math.max(1,128-union.top),(256-anchor.y-pad)/Math.max(1,union.bottom-128));
    const crop={left:union.left,top:union.top,width:union.right-union.left+1,height:union.bottom-union.top+1};
    const normalizedSize={width:Math.max(1,Math.round(crop.width*scale)),height:Math.max(1,Math.round(crop.height*scale))};
    const placement={left:Math.round(anchor.x+(crop.left-128)*scale),top:Math.round(anchor.y+(crop.top-128)*scale)};
    for(let i=first;i<=last;i++){
      const f=analysed[i];if(!f.visiblePixels)throw Error('Interior fully transparent frame '+d.group+':'+i);if(f.borderPixels)throw Error('Recorder clipped effect '+d.group+':'+i);
      const frameIndex=i-first;const id=`fantasy.vfx.${d.group}.${String(frameIndex).padStart(2,'0')}`;
      const path=join(root,'baked',d.group,String(frameIndex).padStart(2,'0')+'.png');await mkdir(resolve(path,'..'),{recursive:true});
      const content=await sharp(f.bytes).extract(crop).resize(normalizedSize).png().toBuffer();
      const normalized=await sharp({create:{width:256,height:256,channels:4,background:'#00000000'}}).composite([{input:content,...placement}]).png().toBuffer();await writeFile(path,normalized);
      const asset={id,source:relative(resolve('asserts'),path).replaceAll('\\','/'),expectedSha256:hash(normalized),sourceFrame:{x:0,y:0,width:256,height:256},size:d.size,padding:0,trim:false,centered:true,pivotSource:pivot,status:'reviewed-integration',flags:[],animation:{group:`fantasy.vfx.${d.group}`,index:frameIndex,fps:settings.fps,frameCount:last-first+1,loop:false,approved:true,motionMethod:receipt.method==='Effekseer editor Recorder'?'native-effekseer-editor-recorder':'native-effekseer-webgl-runtime-bake',kind:'baked-particle-sequence'},vfx:{group:d.group,blendMode:d.blendMode,pivot,startOffsetSeconds:first/settings.fps,width:d.width,height:d.height}};
      frames.push(id);assets.push(asset);
    }
    groups.push({group:d.group,method:receipt.method,frameIds:frames,fps:settings.fps,duration:frames.length/settings.fps,startOffsetSeconds:first/settings.fps,pivot:{x:pivot[0],y:pivot[1]},blendMode:d.blendMode,width:d.width,height:d.height,sourceEffect:`source/${d.group}.efkefc`,rawRecording:receipt.path,rawSha256:hash(input),recordedFrames:settings.expectedFrameCount,removedLeadingFrames:first,removedTrailingFrames:settings.expectedFrameCount-1-last,registration:{sourceAnchor:{x:128,y:128},targetAnchor:anchor,union,crop,uniformScale:scale,placement,normalizedSize,method:'A single common affine registration for the whole native sequence, preserving the simulated trajectories and all temporal differences.'},frames:analysed.map(({bytes,...a})=>a)});
  }
  selection.sprites=[...selection.sprites.filter(a=>!a.id.startsWith('fantasy.vfx.')),...assets];
  selection.catalogue=[...new Set([...(selection.catalogue??[]),...assets.map(a=>a.source)])];
  await writeFile('asserts/art-selection.json',JSON.stringify(selection,null,2)+'\n');
  await writeFile(join(root,'runtime-catalog.json'),JSON.stringify({schemaVersion:1,groups:groups.map(({frames,...g})=>g)},null,2)+'\n');
  const sourceFiles=[];async function visit(dir){for(const file of await readdir(dir,{withFileTypes:true})){const p=join(dir,file.name);if(file.isDirectory())await visit(p);else {const b=await readFile(p);sourceFiles.push({path:rel(p),sha256:hash(b),bytes:b.length});}}}await visit(join(root,'source'));
  const editorProof=await readFile(join(root,'qa/hit-heavy-editor-recorder.png'));
  await writeFile(join(root,'delivery.json'),JSON.stringify({schemaVersion:1,tool:{name:'Effekseer',version:'1.80.8',url:'https://github.com/effekseer/Effekseer/releases/tag/1808',archiveSha256:'99a61cd6dae02a63a2025e615e73f0c8f63683e9c141539bc0ab25b6f0b64c45'},method:'Seven actual native EffekseerForWebGL WASM simulation bakes, sliced and registered into transparent frames. A separate desktop editor Recorder proof validates the same hit-heavy project. SVGs supply texture masks only; no AI images or fabricated animation frames.',editorRecorderProof:{path:'qa/hit-heavy-editor-recorder.png',sha256:hash(editorProof),bytes:editorProof.length,dimensions:[1536,768],settings:{...settings,view:'Effekseer 2D orthographic default',note:'Independent editor proof; framing and random stream differ from the deterministic production WebGL bake.'}},settings,sourceFiles,groups,assets:assets.map(a=>({id:a.id,path:a.source,sha256:a.expectedSha256,animation:a.animation,vfx:a.vfx}))},null,2)+'\n');
  console.log(JSON.stringify({groups:groups.length,frames:assets.length}));
}
const action=process.argv[2]??'prepare';
if(action==='prepare')await prepare();else if(action==='ingest')await ingest();else throw Error('Use prepare or ingest');
