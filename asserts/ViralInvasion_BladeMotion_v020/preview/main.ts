import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import heroUrl from '../../ViralInvasion_Hero3D_v1/model/medic-hero-v1-animated.glb';
import bladeUrl from '../../ViralInvasion_WeaponUltimates_v1/model/redblade.glb';
import { createBladeMotionV020Clips, createBladeReadyReferenceV020, BLADE_MOTION_V020 } from '../bladeMotion';

type Marker = { time: number; label: string; raw: unknown };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
const canvas = $<HTMLCanvasElement>('canvas'), container = $('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setClearColor(0xeaf2ed);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(), turn = new THREE.Group(); scene.add(turn);
scene.add(new THREE.HemisphereLight(0xf6fff6, 0x829b88, 2));
const key = new THREE.DirectionalLight(0xfff4df, 2.8); key.position.set(-3, 7, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xb1d8ce, 1.25); fill.position.set(4, 3, -4); scene.add(fill);
const floor = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .008, 72), new THREE.MeshStandardMaterial({ color: 0xc3d7c9, roughness: 1 }));
floor.position.y = -.009; scene.add(floor);
const grid = new THREE.GridHelper(2.4, 24, 0xa6bdb0, 0xdce7dd); grid.position.y = -.014; (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = .65; scene.add(grid);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 20); camera.position.set(1.65, 3.38, 2.23); camera.lookAt(0, .5, 0);
const controls = new OrbitControls(camera, canvas); controls.target.set(0, .50, 0); controls.enablePan = false; controls.minZoom = .6; controls.maxZoom = 2.2; controls.update();
let model: THREE.Group, skeleton: THREE.SkeletonHelper, socket: THREE.Group, mixer: THREE.AnimationMixer, current: THREE.AnimationAction;
let lowerIdle: THREE.AnimationAction | undefined, clips: THREE.AnimationClip[] = [], active = '', time = 0, playing = true, previous = performance.now(), metadata: unknown, markers: Marker[] = [];
let drawnFrames = 0, bones = 0, skinJoints = 0;
const metadataRoot: any = BLADE_MOTION_V020;
const upper = (track: THREE.KeyframeTrack) => /mixamorig(?:Spine|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)/.test(THREE.PropertyBinding.parseTrackName(track.name).nodeName);

async function glb(url: string) {
  const match = /^data:[^,]*;base64,([\s\S]+)$/.exec(url);
  const data = match ? Uint8Array.from(atob(match[1]), c => c.charCodeAt(0)).buffer : await (await fetch(url)).arrayBuffer();
  return new GLTFLoader().parseAsync(data, '');
}
function findMetadata(name: string): any {
  const candidates = metadataRoot.clips ?? metadataRoot.motions ?? metadataRoot;
  if (Array.isArray(candidates)) return candidates.find(item => item.name === name || item.clipName === name || item.clip === name) ?? {};
  return candidates[name] ?? Object.values(candidates).find((item: any) => item && (item.name === name || item.clipName === name || item.clip === name)) ?? {};
}
function readMarkers(meta: any): Marker[] {
  const raw = meta.markers ?? meta.events ?? meta.timingMarkers ?? [];
  const entries = Array.isArray(raw) ? raw.map((item, i) => [String(i), item]) : Object.entries(raw);
  return entries.flatMap(([id, item]: any) => {
    const value = typeof item === 'number' ? item : item.time ?? item.at ?? item.seconds ?? item.t;
    if (!Number.isFinite(value)) return [];
    return [{ time: value, label: typeof item === 'number' ? id : item.label ?? item.name ?? item.id ?? item.type ?? id, raw: item }];
  }).sort((a, b) => a.time - b.time);
}
function setCamera(view: string) {
  $<HTMLInputElement>('turn').checked = false; turn.rotation.y = 0;
  const positions: Record<string, number[]> = { three: [1.65, 3.38, 2.23], side: [3.8, .5, 0], front: [0, .5, 3.8], back: [0, .5, -3.8] };
  camera.position.fromArray(positions[view] ?? positions.three); controls.target.set(0, .5, 0); camera.lookAt(controls.target); controls.update();
  $('view-label').textContent = view === 'three' ? '固定3/4 · 46°俯视' : view === 'side' ? '正侧面' : view === 'front' ? '正面' : '背面';
}
function sample() {
  if (!current) return;
  current.enabled = true; current.paused = false; current.time = time; current.setEffectiveTimeScale(0);
  if (lowerIdle) { lowerIdle.enabled = true; lowerIdle.time = 0; lowerIdle.setEffectiveTimeScale(0); }
  mixer.update(0); model.updateMatrixWorld(true);
  $<HTMLInputElement>('scrub').value = String(time); $('time').textContent = time.toFixed(3) + ' 秒';
  $('playhead').style.left = (100 * time / current.getClip().duration) + '%';
  const nearby = markers.filter(marker => Math.abs(marker.time - time) < .035);
  for (const node of [...document.querySelectorAll<HTMLButtonElement>('[data-marker-time]')]) node.classList.toggle('active', Math.abs(Number(node.dataset.markerTime) - time) < .035);
  const perfectEnd = (metadata as any)?.perfectWindow?.end ?? (metadata as any)?.perfectWindowEnd ?? (/guard|parry|stance/i.test(active) ? .18 : undefined);
  const perfect = Number.isFinite(perfectEnd) && time <= perfectEnd;
  $('state').textContent = perfect ? '完美格挡窗口 · ' + time.toFixed(3) + '秒（仅动作标记）' : nearby.length ? nearby.map(marker => marker.label).join(' / ') : playing ? '正在播放真实骨骼动作' : '已暂停 / 可逐帧检查';
  $('pose-label').textContent = active + ' · ' + time.toFixed(3) + ' / ' + current.getClip().duration.toFixed(3) + ' 秒';
}
function select(name: string) {
  mixer.stopAllAction(); const clip = clips.find(item => item.name === name)!; active = name;
  const lowerTracks = clip.tracks.some(track => /mixamorig(?:Hips|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg)/.test(track.name));
  if (!lowerTracks && lowerIdle) lowerIdle.reset().play();
  current = mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).play(); current.clampWhenFinished = true;
  current.setEffectiveWeight(1); time = 0; playing = true;
  metadata = findMetadata(name); markers = readMarkers(metadata);
  $('clip-title').textContent = (metadata as any)?.label ?? (metadata as any)?.displayName ?? name;
  $('clip-duration').textContent = clip.duration.toFixed(3) + '秒 · ' + clip.tracks.length + '条骨骼轨道';
  $<HTMLInputElement>('scrub').max = String(clip.duration); $('metadata').textContent = JSON.stringify(metadata, null, 2);
  const policy = (metadata as any)?.loop === true ? '循环片段' : (metadata as any)?.loop === false ? '单次片段' : (metadata as any)?.playback ?? (/loop|dash/i.test(name) ? '循环检查' : '单次动作');
  $('facts').innerHTML = `<dt>片段名</dt><dd>${name}</dd><dt>播放策略</dt><dd>${policy}</dd><dt>动作时长</dt><dd>${clip.duration.toFixed(3)}秒</dd><dt>判定说明</dt><dd>标记用于接入同步，本页不执行伤害。</dd>`;
  $('timeline').replaceChildren();
  const perfectEnd = (metadata as any)?.perfectWindow?.end ?? (metadata as any)?.perfectWindowEnd ?? (/guard|parry|stance/i.test(name) ? .18 : undefined);
  if (Number.isFinite(perfectEnd)) { const band = document.createElement('div'); band.className = 'window'; band.style.width = Math.min(100, 100 * perfectEnd / clip.duration) + '%'; $('timeline').append(band); }
  $('markers').replaceChildren();
  for (const marker of markers) {
    const line = document.createElement('div'); line.className = 'marker'; line.style.left = 100 * marker.time / clip.duration + '%'; $('timeline').append(line);
    const button = document.createElement('button'); button.textContent = marker.time.toFixed(3) + 's · ' + marker.label; button.dataset.markerTime = String(marker.time);
    button.onclick = () => { time = Math.max(0, Math.min(clip.duration, marker.time)); playing = false; $('play').textContent = '播放'; sample(); }; $('markers').append(button);
  }
  const playhead = document.createElement('div'); playhead.className = 'playhead'; playhead.id = 'playhead'; $('timeline').append(playhead);
  $('play').textContent = '暂停'; sample();
}
async function initialize() {
  const [hero, weapon] = await Promise.all([glb(heroUrl), glb(bladeUrl)]);
  model = hero.scene; model.position.y += .023; turn.add(model);
  const readyReference = createBladeReadyReferenceV020(hero.animations);
  const hand = model.getObjectByName('mixamorigRightHand')!, finger = model.getObjectByName('mixamorigRightHandMiddle1');
  const saved: { node: THREE.Bone; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }[] = [];
  const jointSet = new Set<THREE.Bone>();
  model.traverse(node => { if (node instanceof THREE.Bone) { bones++; saved.push({ node, p: node.position.clone(), q: node.quaternion.clone(), s: node.scale.clone() }); }
    if (node instanceof THREE.SkinnedMesh) { for (const bone of node.skeleton.bones) jointSet.add(bone); node.frustumCulled = false; }
  }); skinJoints = jointSet.size;
  const calibration = new THREE.AnimationMixer(model), lower = hero.animations.find(clip => clip.name === 'Idle_Subtle')!.clone(), ready = readyReference.clone();
  lower.tracks = lower.tracks.filter(track => !upper(track)); ready.tracks = ready.tracks.filter(upper);
  calibration.clipAction(lower).play(); calibration.clipAction(ready).play(); calibration.setTime(0); model.updateMatrixWorld(true);
  const grip = hand.getWorldPosition(new THREE.Vector3()); if (finger) grip.lerp(finger.getWorldPosition(new THREE.Vector3()), .45);
  socket = new THREE.Group(); socket.name = 'preview:redblade-socket'; socket.position.copy(grip); socket.quaternion.identity(); socket.add(weapon.scene); hand.attach(socket);
  calibration.stopAllAction(); calibration.uncacheRoot(model);
  for (const item of saved) { item.node.position.copy(item.p); item.node.quaternion.copy(item.q); item.node.scale.copy(item.s); }
  model.updateMatrixWorld(true);
  clips = createBladeMotionV020Clips(model, hero.animations); if (!clips.length) throw new Error('动作模块未返回任何片段');
  mixer = new THREE.AnimationMixer(model); const lowerClip = hero.animations.find(clip => clip.name === 'Idle_Subtle')!.clone(); lowerClip.tracks = lowerClip.tracks.filter(track => !upper(track)); lowerIdle = mixer.clipAction(lowerClip);
  skeleton = new THREE.SkeletonHelper(model); skeleton.visible = false; (skeleton.material as THREE.LineBasicMaterial).depthTest = false; (skeleton.material as THREE.LineBasicMaterial).transparent = true; (skeleton.material as THREE.LineBasicMaterial).opacity = .8; skeleton.renderOrder = 5; scene.add(skeleton);
  const selectElement = $<HTMLSelectElement>('clip'); for (const clip of clips) { const option = document.createElement('option'); option.value = clip.name; option.textContent = (findMetadata(clip.name)?.label ?? clip.name) + ' · ' + clip.duration.toFixed(3) + 's'; selectElement.append(option); }
  selectElement.onchange = () => select(selectElement.value);
  for (const id of ['clip', 'play', 'restart', 'back', 'step']) ($<HTMLButtonElement>(id)).disabled = false;
  $('rig').innerHTML = `<dt>真实蒙皮关节</dt><dd>${skinJoints}</dd><dt>骨节点</dt><dd>${bones}</dd><dt>持刀骨骼</dt><dd>mixamorigRightHand</dd><dt>握点</dt><dd>RightHand → RightHandMiddle1，45%</dd><dt>源动作数</dt><dd>${hero.animations.length}（未改人物GLB）</dd><dt>本包片段数</dt><dd>${clips.length}</dd>`;
  setCamera('three'); select(clips[0].name); $('loading').remove();
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  Object.defineProperty(window, 'bladePreview', { value: Object.freeze({ snapshot: () => ({ active, time, duration: current?.getClip().duration, playing, bones, skinJoints, clips: clips.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })), drawnFrames,
    rightHand: hand.getWorldPosition(new THREE.Vector3()).toArray(), socketLocalQuaternion: socket.quaternion.toArray(), markers: markers.map(marker => ({ ...marker, raw: structuredClone(marker.raw) })) }) }), writable: false });
}
function resize() { const width = container.clientWidth, height = Math.max(520, container.clientHeight); renderer.setSize(width, height, false); const aspect = width / height, view = Math.max(1.65, 2.15 / aspect); camera.left = -view * aspect / 2; camera.right = view * aspect / 2; camera.top = view / 2; camera.bottom = -view / 2; camera.updateProjectionMatrix(); }
$('play').onclick = () => { playing = !playing; $('play').textContent = playing ? '暂停' : '播放'; sample(); };
$('restart').onclick = () => select(active);
for (const [id, delta] of [['back', -1 / 60], ['step', 1 / 60]] as const) $(id).onclick = () => { time = Math.max(0, Math.min(current.getClip().duration, time + delta)); playing = false; $('play').textContent = '播放'; sample(); };
$<HTMLInputElement>('scrub').oninput = event => { time = Number((event.target as HTMLInputElement).value); playing = false; $('play').textContent = '播放'; sample(); };
$<HTMLInputElement>('skeleton').onchange = event => { skeleton.visible = (event.target as HTMLInputElement).checked; };
$<HTMLInputElement>('weapon').onchange = event => { socket.visible = (event.target as HTMLInputElement).checked; };
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.onclick = () => setCamera(button.dataset.view!);
function frame(now: number) {
  const delta = Math.min(.1, Math.max(0, (now - previous) / 1000)); previous = now;
  if (current && playing) { time += delta * Number($<HTMLSelectElement>('rate').value); const duration = current.getClip().duration;
    if (time >= duration) { if ($<HTMLInputElement>('loop').checked) time %= duration; else { time = duration; playing = false; $('play').textContent = '播放'; } } sample(); }
  if ($<HTMLInputElement>('turn').checked) turn.rotation.y += delta * .55;
  controls.update(); renderer.render(scene, camera); drawnFrames++; requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
initialize().catch(error => { $('loading').textContent = '预览加载失败'; $('error').textContent = error instanceof Error ? error.stack ?? error.message : String(error); });
