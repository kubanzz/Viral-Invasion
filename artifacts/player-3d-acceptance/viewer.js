import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const $=id=>document.getElementById(id);
const urlParameters=new URLSearchParams(location.search),requestedYaw=Number(urlParameters.get('yaw'));
const initialYaw=urlParameters.has('yaw')&&Number.isFinite(requestedYaw)?((requestedYaw%360)+360)%360:45;
const stage=$('stage'),scene=new THREE.Scene();scene.background=new THREE.Color('#edf3ef');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;stage.prepend(renderer.domElement);
const camera=new THREE.OrthographicCamera(-3,3,3,-3,.01,200),controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.1;controls.minZoom=.4;controls.maxZoom=4;controls.maxPolarAngle=Math.PI*.9;
scene.add(new THREE.HemisphereLight(0xf6fff6,0x8ca58f,2.2));
const keyLight=new THREE.DirectionalLight(0xfff7e7,3.2);keyLight.position.set(4,8,5);scene.add(keyLight);
const fillLight=new THREE.DirectionalLight(0xa9d9cb,1.5);fillLight.position.set(-5,4,-3);scene.add(fillLight);
const grid=new THREE.GridHelper(60,60,0xc3d4c5,0xdce7da);grid.material.transparent=true;grid.material.opacity=.65;grid.position.y=-.002;scene.add(grid);
const contact=new THREE.Mesh(new THREE.CircleGeometry(.7,64),new THREE.MeshBasicMaterial({color:0xa5bcaa,transparent:true,opacity:.12,depthWrite:false}));contact.rotation.x=-Math.PI/2;contact.position.y=-.001;scene.add(contact);
const turntable=new THREE.Group();scene.add(turntable);turntable.rotation.y=initialYaw*Math.PI/180;
const normalization=new THREE.Group();turntable.add(normalization);
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),exporter=new GLTFExporter();
let model=null,mixer=null,activeAction=null,skeletonHelper=null,base=null,clips=[],paused=false,busy=false,lastTime=performance.now(),lastReadout=0,freeCamera=false,recording=null;
$('yaw').value=String(initialYaw);$('yaw-value').textContent=Math.round(initialYaw)+'°';
const history=[],problems=[];
const fmt=n=>Number(n).toLocaleString('zh-CN');
const sizeText=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KiB`:`${(n/1048576).toFixed(2)} MiB`;
function status(text,kind=''){ $('status').textContent=text;$('status').className=`status ${kind}`; }
function setBusy(value){busy=value;$('import-base').disabled=value||!!recording;$('import-clips').disabled=value||!!recording||!base;$('export').disabled=value||!base||!base.exportable||!clips.length;$('report').disabled=value||!base;$('record').disabled=value||!base||typeof MediaRecorder!=='function'||typeof renderer.domElement.captureStream!=='function';}
function namedIndex(root){const names=new Map();root.traverse(node=>{if(!node.name)return;const old=names.get(node.name)||[];old.push(node);names.set(node.name,old);});return names;}
async function declaredSkins(gltf){return Promise.all((gltf.parser?.json?.skins||[]).map((_,i)=>gltf.parser.getDependency('skin',i)));}
function rigSignature(root,declared=[]){
  const bones=new Map(),inverses=new Map(),issues=[],skins=[];
  const used=new Set();
  function consume(s,meshName){used.add(s);skins.push({mesh:meshName,joints:s.bones.map(b=>b.name)});
    s.bones.forEach((bone,index)=>{if(!bone.name){issues.push('存在未命名关节');return;}if(bones.has(bone.name)&&bones.get(bone.name)!==bone)issues.push(`重复关节名称：${bone.name}`);bones.set(bone.name,bone);
      const values=s.boneInverses[index]?.elements;if(!values){issues.push(`缺少绑定矩阵：${bone.name}`);return;}
      if(inverses.has(bone.name)&&!matrixNear(inverses.get(bone.name),values))issues.push(`同名关节在不同蒙皮中绑定不一致：${bone.name}`);else inverses.set(bone.name,[...values]);});
  }
  root.traverse(node=>{if(node.isSkinnedMesh)consume(node.skeleton,node.name);});
  declared.forEach((s,i)=>{if(!used.has(s))consume(s,`(animation-only declared skin ${i})`);});
  const parents={};for(const [name,bone] of bones){let parent=bone.parent;while(parent&&!parent.isBone)parent=parent.parent;parents[name]=parent?.name||'$ROOT';}
  return {bones,inverses,parents,skins,issues:[...new Set(issues)]};
}
function matrixNear(a,b,tol=1e-4){return a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=tol*Math.max(1,Math.abs(v),Math.abs(b[i])));}
function assertCompatible(reference,incoming){
  if(reference.issues.length)throw new Error(`主角色骨架不可合并：${reference.issues.join('；')}`);
  if(incoming.issues.length)throw new Error(`动作文件骨架不可合并：${incoming.issues.join('；')}`);
  if(!reference.bones.size||!incoming.bones.size)throw new Error('动作合并要求两个文件都含真实蒙皮骨架；静态模型不能合并为骨骼角色。');
  const missing=[...reference.bones.keys()].filter(n=>!incoming.bones.has(n)),extra=[...incoming.bones.keys()].filter(n=>!reference.bones.has(n));
  if(missing.length||extra.length)throw new Error(`关节名称不一致。缺少：${missing.slice(0,8).join('、')||'无'}；新增：${extra.slice(0,8).join('、')||'无'}`);
  for(const name of reference.bones.keys()){
    if(reference.parents[name]!==incoming.parents[name])throw new Error(`关节父级不一致：${name}（主角色 ${reference.parents[name]} / 动作文件 ${incoming.parents[name]}）`);
    if(!matrixNear(reference.inverses.get(name),incoming.inverses.get(name)))throw new Error(`关节绑定姿态不一致：${name}。不自动缩放、重定向或强行拼接。`);
  }
}
function canonicalClip(clip,sourceRoot,targetRoot,{incoming=false}={}){
  const sourceNames=namedIndex(sourceRoot),targetNames=namedIndex(targetRoot),mapped=[];
  for(const track of clip.tracks){
    const parsed=THREE.PropertyBinding.parseTrackName(track.name);
    if(parsed.objectName||parsed.objectIndex!==undefined||parsed.propertyIndex!==undefined)throw new Error(`不支持安全映射的轨道：${track.name}`);
    const node=THREE.PropertyBinding.findNode(sourceRoot,parsed.nodeName);
    if(!node||!node.name||sourceNames.get(node.name)?.length!==1||targetNames.get(node.name)?.length!==1)throw new Error(`轨道目标缺失或名称不唯一：${track.name}`);
    const target=targetNames.get(node.name)[0];
    if(!!node.isBone!==!!target.isBone)throw new Error(`轨道目标类型不一致：${node.name}`);
    if(!['position','quaternion','scale','morphTargetInfluences'].includes(parsed.propertyName))throw new Error(`不支持的动画属性：${track.name}`);
    if(incoming&&!node.isBone){
      if(parsed.propertyName==='morphTargetInfluences')throw new Error(`附加动作包含表情/变形轨道，未验证形态映射：${track.name}`);
      if(node.parent?.name!==target.parent?.name||!matrixNear(node.matrix.elements,target.matrix.elements))throw new Error(`非骨骼轨道的节点变换不一致：${track.name}`);
    }
    const copy=track.clone();copy.name=`${target.name}.${parsed.propertyName}`;mapped.push(copy);
  }
  return new THREE.AnimationClip(clip.name||'未命名动作',clip.duration,mapped,clip.blendMode);
}
function restTransforms(root){const values=new Map();root.traverse(node=>values.set(node.uuid,{name:node.name,position:node.position.toArray(),quaternion:node.quaternion.toArray(),scale:node.scale.toArray()}));return values;}
function statsFor(root,fileBytes){
  let triangles=0,meshCount=0,skinnedMeshCount=0;const materials=new Set(),textures=new Set(),geometries=new Set();
  root.traverse(node=>{if(!node.isMesh)return;meshCount++;if(node.isSkinnedMesh)skinnedMeshCount++;geometries.add(node.geometry);triangles+=(node.geometry.index?.count||node.geometry.attributes.position?.count||0)/3;
    for(const mat of Array.isArray(node.material)?node.material:[node.material]){if(!mat)continue;materials.add(mat);for(const v of Object.values(mat))if(v?.isTexture)textures.add(v);}
  });
  const bounds=new THREE.Box3().setFromObject(root,true),dimensions=bounds.getSize(new THREE.Vector3());
  return {fileBytes,triangles:Math.round(triangles),meshCount,skinnedMeshCount,uniqueGeometryCount:geometries.size,materialCount:materials.size,
    dimensions:dimensions.toArray(),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},textures:[...textures].map(t=>({name:t.name||'未命名贴图',width:t.image?.width||t.image?.naturalWidth||0,height:t.image?.height||t.image?.naturalHeight||0,colorSpace:t.colorSpace}))};
}
function trackChanges(track){const count=track.getValueSize();return track.values.some((v,i)=>i>=count&&Math.abs(v-track.values[i%count])>1e-6);}
function clipDetails(clip){
  let boneTracks=0,changingBoneTracks=0;for(const t of clip.tracks){const p=THREE.PropertyBinding.parseTrackName(t.name),node=THREE.PropertyBinding.findNode(model,p.nodeName);if(node?.isBone){boneTracks++;if(trackChanges(t))changingBoneTracks++;}}
  const rootTravel=[];for(const t of clip.tracks){const p=THREE.PropertyBinding.parseTrackName(t.name),node=THREE.PropertyBinding.findNode(model,p.nodeName);if(p.propertyName!=='position'||node?.isBone&&base.rig.parents[node.name]!=='$ROOT')continue;if(t.getValueSize()!==3)continue;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(let i=0;i<t.values.length;i+=3){minX=Math.min(minX,t.values[i]);maxX=Math.max(maxX,t.values[i]);minZ=Math.min(minZ,t.values[i+2]);maxZ=Math.max(maxZ,t.values[i+2]);}const last=t.values.length-3;rootTravel.push({node:node?.name||p.nodeName,xSpan:maxX-minX,zSpan:maxZ-minZ,endX:t.values[last]-t.values[0],endZ:t.values[last+2]-t.values[2]});
  }
  const motionKind=changingBoneTracks>0?'dynamic':/hold|pose/i.test(clip.name)?'held-pose':'static';
  return {name:clip.name,duration:clip.duration,tracks:clip.tracks.length,boneTracks,changingBoneTracks,motionKind,rootTravel};
}
function warnings(){
  if(!base)return[];const out=[...base.rig.issues,...problems];
  if(!base.rig.bones.size)out.push('未找到蒙皮骨架。该文件不能作为完整骨骼角色通过验收。');
  if(!clips.length)out.push('无动画片段：只可检查外观、静态加载和转向，不能验收自然移动。');
  if(clips.length&&!clips.some(c=>/idle|stand|待机/i.test(c.name)))out.push('未按名称识别到 Idle / 待机，请核对动作内容和命名。');
  if(clips.length&&!clips.some(c=>/run|walk|跑|走/i.test(c.name)))out.push('未按名称识别到 Run / Walk，请核对跑步动作。');
  for(const c of clips){const d=clipDetails(c);if(!d.changingBoneTracks&&d.motionKind!=='held-pose')out.push(`“${c.name}”没有检测到变化的骨骼轨道，不能仅凭动作名称认定为骨骼动作。`);const drift=d.rootTravel.find(t=>Math.hypot(t.endX,t.endZ)>Math.max(base.stats.dimensions[1]*.03,.001));if(drift)out.push(`“${c.name}”的根部 ${drift.node} 首尾有水平位移差，请核对是否为 in-place 动作。`);}
  if(base.stats.triangles>20000)out.push('三角形超过本轮建议的 20,000 起始预算，需结合游戏实测。');
  if(base.stats.textures.some(t=>t.width>2048||t.height>2048))out.push('存在大于 2048² 的贴图，请核对移动端内存预算。');
  return [...new Set(out)];
}
function disposeScene(root){if(!root)return;const materials=new Set(),textures=new Set(),geometries=new Set();root.traverse(n=>{if(!n.isMesh)return;geometries.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material]){if(!m)continue;materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const x of textures){x.dispose();if(x.image?.close)x.image.close();}for(const x of materials)x.dispose();for(const x of geometries)x.dispose();}
function updateUI(){
  if(!base)return;
  $('empty').classList.add('hidden');$('file-tag').textContent=base.name;
  const clipKinds=clips.map(clipDetails),dynamicCount=clipKinds.filter(c=>c.motionKind==='dynamic').length,heldCount=clipKinds.filter(c=>c.motionKind==='held-pose').length;
  $('asset-kind').textContent=base.rig.bones.size?clips.length?`骨骼角色 · ${dynamicCount}动态 / ${heldCount}保持`:'骨骼模型 · 无动作':'静态模型 · 无蒙皮骨架';
  $('triangles').textContent=fmt(base.stats.triangles);$('bones').textContent=fmt(base.rig.bones.size);$('animations').textContent=fmt(clips.length);$('materials').textContent=fmt(base.stats.materialCount);
  const s=base.stats,dim=s.dimensions.map(n=>Number(n.toFixed(3))).join(' × ');$('details').replaceChildren();
  for(const line of [`文件 ${sizeText(s.fileBytes)} · ${s.meshCount} 个网格 / ${s.skinnedMeshCount} 个蒙皮网格`,`原始尺寸 ${dim}（文件单位）`,`贴图 ${s.textures.length} 张：${s.textures.map(t=>`${t.width}×${t.height}`).join(' / ')||'无内嵌贴图'}`,`片段 ${clips.length}：${dynamicCount} 个动态 + ${heldCount} 个保持姿势`,`预览归一化：角色高 1.70；导出保留原始单位`,`当前动作：${activeAction?.getClip().name||'无'}`]){const el=document.createElement('div');el.textContent=line;$('details').append(el);}
  $('clip-list').replaceChildren();for(const clip of clips){const el=document.createElement('div');el.className='clip-item';const label=document.createElement('span'),duration=document.createElement('b');label.textContent=clip.name;label.title=clip.name;duration.textContent=clipDetails(clip).motionKind==='held-pose'?'保持姿势':`${clip.duration.toFixed(2)}s`;el.append(label,duration);$('clip-list').append(el);}
  $('warnings').replaceChildren();const warningsList=warnings();if(!warningsList.length){const el=document.createElement('div');el.className='warning good';el.textContent='文件结构与轨道检查通过；动作自然度、持握与风格仍需在画面中验收。';$('warnings').append(el);}for(const warning of warningsList){const el=document.createElement('div');el.className='warning';el.textContent=warning;$('warnings').append(el);}
  $('history').replaceChildren();for(const item of history){const el=document.createElement('li');el.textContent=item;$('history').append(el);}
  $('clip-select').disabled=!clips.length;$('play-pause').disabled=!clips.length;$('step').disabled=!clips.length;$('seek').disabled=!clips.length;setBusy(busy);
}
function populateClips(selected){const select=$('clip-select');select.replaceChildren();if(!clips.length){select.add(new Option('文件无动画 · 静态预览',''));return;}for(let i=0;i<clips.length;i++)select.add(new Option(`${clips[i].name} · ${clipDetails(clips[i]).motionKind==='held-pose'?'保持姿势':clips[i].duration.toFixed(2)+'s'}`,String(i)));select.value=String(selected??0);}
function playClip(index){if(!mixer||!clips[index])return;const next=mixer.clipAction(clips[index]);if(activeAction===next)return;const previous=activeAction;if(paused)mixer.stopAllAction();next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();if(previous&&!paused)previous.crossFadeTo(next,Number($('fade').value),false);activeAction=next;mixer.timeScale=paused?0:Number($('speed').value);if(paused)mixer.update(0);$('seek').max=String(clips[index].duration);$('seek').value='0';$('seek-value').textContent=`0.000 / ${clips[index].duration.toFixed(3)} 秒`;updateUI();}
function seekCurrentClip(time){if(!mixer||!activeAction)return;const clip=activeAction.getClip(),desired=Math.max(0,Math.min(clip.duration,time));mixer.stopAllAction();const action=mixer.clipAction(clip);action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();action.time=desired;activeAction=action;mixer.timeScale=1;mixer.update(0);mixer.timeScale=0;paused=true;$('play-pause').textContent='继续';$('seek').value=String(desired);$('seek-value').textContent=`${desired.toFixed(3)} / ${clip.duration.toFixed(3)} 秒`;}
function resetCamera(){controls.target.set(0,.85,0);const elevation=46*Math.PI/180;camera.position.set(0,.85+Math.sin(elevation)*8,Math.cos(elevation)*8);camera.zoom=1;camera.updateProjectionMatrix();controls.update();}
function setCamera(free){freeCamera=free;controls.enableRotate=free;controls.enablePan=free;$('camera-free').classList.toggle('active',free);$('camera-fixed').classList.toggle('active',!free);$('mode-tag').textContent=free?'自由相机':'固定 3/4 俯视';if(!free)resetCamera();}
async function loadBase(file){
  setBusy(true);status(`正在读取 ${file.name} …`);
  let gltf;try{
    const buffer=await file.arrayBuffer();gltf=await loader.parseAsync(buffer,'');
    if(!gltf.scene)throw new Error('GLB 中没有可显示场景。');gltf.scene.updateMatrixWorld(true);
    const stats=statsFor(gltf.scene,buffer.byteLength),height=stats.dimensions[1];if(!Number.isFinite(height)||height<=1e-8)throw new Error('模型高度为零或无有效几何体。');
    const rig=rigSignature(gltf.scene,await declaredSkins(gltf)),rest=restTransforms(gltf.scene);let canonical=[],exportable=true,canonicalError='';
    try{canonical=gltf.animations.map(c=>canonicalClip(c,gltf.scene,gltf.scene));}catch(error){canonical=gltf.animations.map(c=>c.clone());exportable=false;canonicalError=`可播放原动画，但暂停合并导出：${error.message}`;}
    if(mixer){mixer.stopAllAction();mixer.uncacheRoot(model);}if(skeletonHelper){scene.remove(skeletonHelper);skeletonHelper.dispose();skeletonHelper=null;}if(model){normalization.remove(model);disposeScene(model);}
    model=gltf.scene;normalization.add(model);normalization.scale.setScalar(1.7/height);const center=new THREE.Vector3(...stats.bounds.min).add(new THREE.Vector3(...stats.bounds.max)).multiplyScalar(.5);normalization.position.set(-center.x*normalization.scale.x,-stats.bounds.min[1]*normalization.scale.y,-center.z*normalization.scale.z);normalization.updateMatrixWorld(true);
    base={name:file.name,stats,rig,rest,exportable,originalAnimationCount:gltf.animations.length,bytes:buffer.byteLength};clips=canonical;mixer=new THREE.AnimationMixer(model);activeAction=null;paused=false;history.length=0;problems.length=0;if(canonicalError)problems.push(canonicalError);
    skeletonHelper=new THREE.SkeletonHelper(model);skeletonHelper.visible=$('skeleton').checked;skeletonHelper.material.depthTest=false;skeletonHelper.material.transparent=true;skeletonHelper.material.opacity=.7;scene.add(skeletonHelper);
    turntable.rotation.y=Number($('yaw').value)*Math.PI/180;grid.position.set(0,-.002,0);resetCamera();const subtle=clips.findIndex(c=>/idle[_ -]?subtle/i.test(c.name)),fallback=clips.findIndex(c=>/idle|stand|待机/i.test(c.name));populateClips(subtle>=0?subtle:Math.max(0,fallback));if(clips.length)playClip(Number($('clip-select').value));$('play-pause').textContent='暂停';history.push(`主角色：${file.name}（${clips.length} 个动画片段）`);updateUI();
    status(clips.length?`已导入 ${file.name}；${rig.bones.size} 个蒙皮关节、${clips.length} 个动画片段。请检查跑停、转向和持握。`:`已导入 ${file.name}。该文件无动画，仅作静态加载/外观检查，不能作为完整移动角色交付。`,clips.length?'success':'');
  }catch(error){if(gltf&&gltf.scene!==model)disposeScene(gltf.scene);status(`导入失败：${error.message}`,'error');}finally{setBusy(false);}
}
async function addClipFiles(files){
  if(!base)return;setBusy(true);let count=0;const rejected=[];
  // Compare against the stored bind signature; the live display may be mid-animation.
  for(const file of files){let imported;try{
    status(`正在验证 ${file.name} 的关节映射 …`);imported=await loader.parseAsync(await file.arrayBuffer(),'');imported.scene.updateMatrixWorld(true);
    if(!imported.animations.length)throw new Error('文件没有动画，未添加任何动作。');const rig=rigSignature(imported.scene,await declaredSkins(imported));assertCompatible(base.rig,rig);
    // Restore the base rest transforms only for the compatibility comparison of non-bone nodes.
    const current=[];model.traverse(node=>{current.push([node,node.position.clone(),node.quaternion.clone(),node.scale.clone()]);const r=base.rest.get(node.uuid);if(r){node.position.fromArray(r.position);node.quaternion.fromArray(r.quaternion);node.scale.fromArray(r.scale);node.updateMatrix();}});
    let mapped;try{mapped=imported.animations.map(c=>canonicalClip(c,imported.scene,model,{incoming:true}));}finally{for(const [node,p,q,s] of current){node.position.copy(p);node.quaternion.copy(q);node.scale.copy(s);node.updateMatrix();}model.updateMatrixWorld(true);}
    const existing=new Set(clips.map(c=>c.name));for(const clip of mapped){const original=clip.name;let name=original,i=2;while(existing.has(name))name=`${original} · ${file.name.replace(/\.glb$/i,'')} ${i++}`;clip.name=name;existing.add(name);}clips.push(...mapped);count+=mapped.length;history.push(`兼容：${file.name} → 添加 ${mapped.length} 个动作（关节名称/父级/绑定姿态一致）`);
  }catch(error){const text=`${file.name}：${error.message}`;rejected.push(text);history.push(`拒绝：${text}`);}finally{if(imported)disposeScene(imported.scene);}}
  const old=activeAction?.getClip();populateClips(Math.max(0,clips.indexOf(old)));updateUI();setBusy(false);status(`添加 ${count} 个动画片段。${rejected.length?`拒绝 ${rejected.length} 个文件：${rejected.join('；')}`:'所有动作文件均通过同骨架检查。'}`,rejected.length?'error':'success');
}
function report(){return {tool:'Viral Invasion player 3D acceptance',threeVersion:THREE.REVISION,generatedAt:new Date().toISOString(),file:base?.name||null,
  statistics:base?.stats||null,rig:base?{jointCount:base.rig.bones.size,skins:base.rig.skins,jointParents:base.rig.parents,issues:base.rig.issues}:null,
  animations:clips.map(clipDetails),animationSummary:{total:clips.length,dynamic:clips.map(clipDetails).filter(c=>c.motionKind==='dynamic').length,heldPoses:clips.map(clipDetails).filter(c=>c.motionKind==='held-pose').length},warnings:warnings(),mergeHistory:[...history],exportable:!!base?.exportable&&clips.length>0,
  current:{clip:activeAction?.getClip().name||null,time:activeAction?.time||0,paused,yawDegrees:(turntable.rotation.y*180/Math.PI)%360,freeCamera},
  acceptance:'Structural diagnostics only. Visual style, natural gait, foot contact and weapon grip require review. No synthetic skeletal animations are generated.'};}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function recordPreview(){
  if(recording){if(recording.recorder.state!=='inactive')recording.recorder.stop();return;}
  if(!base)return;
  try{const stream=renderer.domElement.captureStream(30),mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));if(!mimeType){stream.getTracks().forEach(track=>track.stop());throw new Error('当前浏览器未提供 WebM 录制编码器。');}
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:5000000}),chunks=[],started=performance.now(),clipName=(activeAction?.getClip().name||'static').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
    const update=()=>{$('record').textContent=`停止录制 · ${Math.max(0,10-(performance.now()-started)/1000).toFixed(1)}秒`};
    const interval=setInterval(update,100),timeout=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},10000);recording={recorder,stream};update();setBusy(busy);
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onerror=event=>status(`录制失败：${event.error?.message||'浏览器编码错误'}`,'error');
    recorder.onstop=()=>{clearInterval(interval);clearTimeout(timeout);stream.getTracks().forEach(track=>track.stop());recording=null;$('record').textContent='录制当前预览（10秒）';setBusy(busy);if(chunks.length){const blob=new Blob(chunks,{type:mimeType}),name=`player-preview-${clipName}-${Date.now()}.webm`;download(blob,name);status(`已下载真实预览录像 ${name}（${sizeText(blob.size)}）；内容直接来自当前 Three.js 画布。`,'success');}else status('录制未产生有效视频数据。','error');};recorder.start(250);status('正在录制当前真实画布，10 秒后自动下载 WebM。可切换实际动画或朝向。');
  }catch(error){status(`无法开始录制：${error.message}`,'error');}
}
async function exportMerged(){if(!base||!base.exportable||!clips.length)return;setBusy(true);status('正在使用官方 GLTFExporter 导出原始比例的角色和动画片段 …');let clone;try{
  clone=cloneSkeleton(model);const sourceNames=namedIndex(model),cloneNames=namedIndex(clone);model.traverse(node=>{const r=base.rest.get(node.uuid);if(!r||!node.name||sourceNames.get(node.name)?.length!==1||cloneNames.get(node.name)?.length!==1)return;const target=cloneNames.get(node.name)[0];target.position.fromArray(r.position);target.quaternion.fromArray(r.quaternion);target.scale.fromArray(r.scale);target.updateMatrix();});clone.updateMatrixWorld(true);
  const binary=await exporter.parseAsync(clone,{binary:true,animations:clips,onlyVisible:false,trs:true});
  if(!(binary instanceof ArrayBuffer))throw new Error('GLTFExporter 未生成 GLB。');const filename=base.name.replace(/\.glb$/i,'')+'-with-animations.glb';download(new Blob([binary],{type:'model/gltf-binary'}),filename);history.push(`已导出 ${filename} · ${clips.length} 个动画片段 · ${sizeText(binary.byteLength)}`);status(`已导出 ${filename}，包含 ${clips.length} 个动画片段。请重新导入交付文件检查。`,'success');updateUI();
  }catch(error){status(`导出失败：${error.message}`,'error');}finally{setBusy(false);}}
function resize(){const w=stage.clientWidth,h=stage.clientHeight,aspect=w/h;renderer.setSize(w,h,false);const halfHeight=1.8;camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);
$('import-base').onclick=()=>$('base-file').click();$('import-clips').onclick=()=>$('clip-files').click();$('base-file').onchange=event=>{if(event.target.files[0])void loadBase(event.target.files[0]);event.target.value='';};$('clip-files').onchange=event=>{const files=[...event.target.files];if(files.length)void addClipFiles(files);event.target.value='';};
$('clip-select').onchange=()=>playClip(Number($('clip-select').value));$('seek').oninput=()=>seekCurrentClip(Number($('seek').value));$('speed').oninput=()=>{$('speed-value').textContent=Number($('speed').value).toFixed(2)+'×';if(mixer)mixer.timeScale=paused?0:Number($('speed').value);};$('fade').oninput=()=>$('fade-value').textContent=Number($('fade').value).toFixed(2)+' 秒';$('yaw').oninput=()=>{turntable.rotation.y=Number($('yaw').value)*Math.PI/180;$('yaw-value').textContent=Math.round(Number($('yaw').value))+'°';};$('skeleton').onchange=()=>{if(skeletonHelper)skeletonHelper.visible=$('skeleton').checked;};
$('camera-fixed').onclick=()=>setCamera(false);$('camera-free').onclick=()=>setCamera(true);$('reset-view').onclick=()=>{resetCamera();turntable.rotation.y=initialYaw*Math.PI/180;$('yaw').value=String(initialYaw);$('yaw-value').textContent=Math.round(initialYaw)+'°';grid.position.set(0,-.002,0);};$('play-pause').onclick=()=>{paused=!paused;mixer.timeScale=paused?0:Number($('speed').value);$('play-pause').textContent=paused?'继续':'暂停';};$('step').onclick=()=>{if(!mixer)return;paused=true;$('play-pause').textContent='继续';mixer.timeScale=1;mixer.update(1/30);mixer.timeScale=0;};$('record').onclick=recordPreview;$('export').onclick=()=>void exportMerged();$('report').onclick=()=>download(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}),'player-asset-inspection.json');
setCamera(false);resize();
function frame(time){const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;if(mixer)mixer.update(dt);if($('auto-turn').checked){turntable.rotation.y=(turntable.rotation.y+dt*Math.PI/8)%(Math.PI*2);$('yaw').value=String(turntable.rotation.y*180/Math.PI);$('yaw-value').textContent=Math.round(turntable.rotation.y*180/Math.PI)+'°';}if($('move-preview').checked){grid.position.x=(grid.position.x-Math.sin(turntable.rotation.y)*dt*1.7)%1;grid.position.z=(grid.position.z-Math.cos(turntable.rotation.y)*dt*1.7)%1;}controls.update();renderer.render(scene,camera);if(time-lastReadout>150){lastReadout=time;$('live-readout').textContent=`${freeCamera?'自由相机':'正交相机 · 46° 俯视'}${activeAction?` / ${activeAction.getClip().name} ${activeAction.time.toFixed(2)}s`:''}`;if(activeAction){$('seek').value=String(activeAction.time);$('seek-value').textContent=`${activeAction.time.toFixed(3)} / ${activeAction.getClip().duration.toFixed(3)} 秒`;}}requestAnimationFrame(frame);}requestAnimationFrame(frame);
window.__playerViewer=Object.freeze({snapshot:report,loadBase,addClipFiles,exportMerged});
const params=new URLSearchParams(location.search);const startup=params.get('asset')||(params.has('probe')?'/probe.glb':null);
if(startup){(async()=>{try{const response=await fetch(startup);if(!response.ok)throw new Error(`HTTP ${response.status}`);const bytes=await response.arrayBuffer(),name=params.has('probe')?'技术探针 · h25 机器人（静态样本，不是最终玩家）.glb':decodeURIComponent(startup.split('/').pop());await loadBase(new File([bytes],name,{type:'model/gltf-binary'}));}catch(error){status(`预览文件读取失败：${error.message}`,'error');}})();}
