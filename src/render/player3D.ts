import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import playerModelUrl from '../../asserts/ViralInvasion_Hero3D_v1/model/medic-hero-v1-animated.glb';
import { HeldWeapons3D, type HeldWeapon3DFrame } from './heldWeapons3D';
import { createBladeClips, BLADE_CLIP_NAMES, bladeHipTwist } from './bladeAnimationClips';
import { createBladeMotionV020Clips, BLADE_V020_CLIP_NAMES } from '../../asserts/ViralInvasion_BladeMotion_v020/bladeMotion';
import { createBladeMotionV022Clips, BLADE_V022_CLIP_NAMES } from '../../asserts/ViralInvasion_BladeMotion_v022/bladeMotion';
import type { GameState, Vec } from '../game/types';
import { Player3DMotionController, type Player3DMotionFrame, type Player3DAnimationEvent,
  BOW_READY_TIME, type Player3DLocomotionClip, type Player3DUpperClip } from './player3DMotion';

const EXPECTED_SHA256 = '048ab89b2d724282fa8e36547e208b684c3df53c41558f3f53b58274c35feb5d';
const ELEVATION = Math.asin(.72);
const VIEW_SIZE = 1.6;
const GROUND_OFFSET = .023;
const BASE_CLIPS: readonly Player3DLocomotionClip[] = ['Idle_Subtle', 'Jog', 'Walk_Backwards', 'Strafe_left', 'Strafe_right', 'Sprint'];
const UPPER_CLIPS: readonly Player3DUpperClip[] = ['Pistol_Idle', 'Pistol_Shoot', 'Bow_Ready', 'Bow Pull Back', 'Bow Pull Hold', 'Bow Release', ...BLADE_CLIP_NAMES, ...BLADE_V020_CLIP_NAMES];
const upperBone = (name: string): boolean => /mixamorig(?:Spine|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)/.test(name);

export interface Player3DFrame {
  canvas: HTMLCanvasElement;
  /** All geometry below is in projected world pixels, never framebuffer pixels. */
  width: number;
  height: number;
  foot: Vec;
  bounds: { left: number; right: number; top: number; bottom: number };
  grip: Vec;
  leftGrip: Vec;
  weapon?: HeldWeapon3DFrame;
  facing: number;
  dirty: boolean;
  version: number;
}

interface ActionSlot { action: THREE.AnimationAction; weight: number; source: string }
interface BaseSlots { lower: ActionSlot; upper: ActionSlot }
interface TextureImage { width?: number; height?: number; close?: () => void }

/** A single transparent, depth-sortable actor image. Phaser remains the sole frame-loop owner. */
export class Player3D {
  /** Startup completion, including a diagnosed sprite fallback when WebGL2/GLB is unavailable. */
  readonly ready: Promise<void>;
  readonly canvas = document.createElement('canvas');
  available = false;
  private renderer?: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-VIEW_SIZE / 2, VIEW_SIZE / 2, VIEW_SIZE / 2, -VIEW_SIZE / 2, .01, 20);
  private readonly turn = new THREE.Group();
  private readonly motion = new Player3DMotionController();
  private model?: THREE.Group;
  private weapons?: HeldWeapons3D;
  private mixer?: THREE.AnimationMixer;
  private readonly bases = new Map<Player3DLocomotionClip, BaseSlots>();
  private readonly uppers = new Map<Player3DUpperClip, ActionSlot>();
  private hit?: ActionSlot;
  private bladeFull?: ActionSlot;
  private bladeCharge?: ActionSlot;
  private bladeFinish?: ActionSlot;
  private readonly joints: THREE.Bone[] = [];
  private rightHand?: THREE.Object3D;
  private rightFinger?: THREE.Object3D;
  private leftHand?: THREE.Object3D;
  private leftFinger?: THREE.Object3D;
  private hips?: THREE.Object3D;
  private readonly unmixedHips = new THREE.Quaternion();
  private readonly hipRotation = new THREE.Quaternion();
  private hipTwist = 0;
  private projectedBindHeight = .8;
  private resolution = 0;
  private runKey = '';
  private armWeight = 0;
  private hurtWeight = 0;
  private upperEventId = '';
  private fullEventId = '';
  private pose?: Player3DMotionFrame;
  private frame?: Player3DFrame;
  private cacheKey = '';
  private destroyed = false;
  private error?: string;
  private sha256: string | null = null;
  private clipNames: string[] = [];
  private authoredClipNames: string[] = [];
  private triangles = 0;
  private meshCount = 0;
  private skinnedMeshCount = 0;
  private textureSizes: { width: number; height: number }[] = [];
  private drawCount = 0;
  private readonly temp = new THREE.Vector3();
  private readonly second = new THREE.Vector3();
  private readonly desiredRotation = new THREE.Quaternion();
  private readonly forward = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly lost = (event: Event): void => {
    if (this.destroyed) return;
    event.preventDefault(); this.available = false; this.error = '三维玩家的 WebGL2 上下文已丢失，等待浏览器恢复。';
  };
  private readonly restored = (): void => {
    if (this.destroyed || !this.model) return;
    this.available = true; this.error = undefined; this.cacheKey = '';
  };

  constructor() {
    this.canvas.addEventListener('webglcontextlost', this.lost);
    this.canvas.addEventListener('webglcontextrestored', this.restored);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(1); this.renderer.setClearColor(0x000000, 0);
      this.renderer.setSize(384, 384, false); this.resolution = 384;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
      this.scene.add(new THREE.HemisphereLight(0xf6fff6, 0x829b88, 2));
      const key = new THREE.DirectionalLight(0xfff4df, 2.8); key.position.set(-3, 7, 5); this.scene.add(key);
      const fill = new THREE.DirectionalLight(0xb1d8ce, 1.25); fill.position.set(4, 3, -4); this.scene.add(fill);
      this.scene.add(this.turn);
      this.camera.position.set(0, .45 + Math.sin(ELEVATION) * 4, Math.cos(ELEVATION) * 4);
      this.camera.lookAt(0, .45, 0); this.camera.updateMatrixWorld(true); this.camera.updateProjectionMatrix();
      this.ready = this.load().catch(reason => {
        // A late loader/compile rejection after an intentional teardown must not
        // revive the actor or turn normal disposal into an application failure.
        if (this.destroyed) return;
        this.available = false; this.error = '三维玩家加载失败：' + (reason instanceof Error ? reason.message : String(reason));
        this.destroy();
      });
    } catch (reason) {
      this.error = '无法创建三维玩家 WebGL2 画面：' + (reason instanceof Error ? reason.message : String(reason));
      this.destroy();
      this.ready = Promise.resolve();
    }
  }

  get currentFrame(): Player3DFrame | undefined { return this.frame; }
  observe(state: GameState): void { if (!this.destroyed) this.motion.observe(state); }

  private async load(): Promise<void> {
    let bytes: ArrayBuffer;
    // esbuild embeds the production GLB. Decode it without any file:// fetch.
    const embedded = /^data:[^,]*;base64,([\s\S]+)$/.exec(playerModelUrl);
    if (embedded) {
      const binary = atob(embedded[1]), buffer = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
      bytes = buffer.buffer;
    } else {
      const response = await fetch(playerModelUrl);
      if (!response.ok) throw new Error('角色文件 HTTP ' + response.status);
      bytes = await response.arrayBuffer();
    }
    if (globalThis.crypto?.subtle) {
      this.sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (this.sha256 !== EXPECTED_SHA256) throw new Error('角色文件校验不一致，请重新构建资源。');
    }
    const gltf = await new GLTFLoader().parseAsync(bytes, '');
    if (this.destroyed) { this.releaseModel(gltf.scene); return; }
    this.model = gltf.scene; this.model.position.y += GROUND_OFFSET; this.turn.add(this.model);
    this.model.updateMatrixWorld(true);
    const jointSet = new Set<THREE.Bone>(), textures = new Set<THREE.Texture>();
    let minY = Infinity, maxY = -Infinity;
    this.model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.frustumCulled = false; this.meshCount++;
      this.triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
      if (node instanceof THREE.SkinnedMesh) { this.skinnedMeshCount++; for (const bone of node.skeleton.bones) jointSet.add(bone); }
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
      // One startup sample defines stable scale. Per-frame bounds use the real skeleton, not CPU skinning of 20k vertices.
      for (let i = 0; i < node.geometry.attributes.position.count; i++) {
        node.getVertexPosition(i, this.temp).applyMatrix4(node.matrixWorld).project(this.camera);
        minY = Math.min(minY, this.temp.y); maxY = Math.max(maxY, this.temp.y);
      }
    });
    this.joints.push(...jointSet);
    this.projectedBindHeight = Math.max(.1, (maxY - minY) * VIEW_SIZE / 2);
    this.textureSizes = [...textures].map(texture => {
      const image = texture.image as TextureImage | undefined;
      return { width: image?.width ?? 0, height: image?.height ?? 0 };
    });
    this.clipNames = gltf.animations.map(clip => clip.name);
    if (this.joints.length !== 53 || this.clipNames.length !== 17) throw new Error('角色骨架或动作数量不符合已验收资产。');
    this.rightHand = this.model.getObjectByName('mixamorigRightHand'); this.rightFinger = this.model.getObjectByName('mixamorigRightHandMiddle1');
    this.leftHand = this.model.getObjectByName('mixamorigLeftHand'); this.leftFinger = this.model.getObjectByName('mixamorigLeftHandMiddle1');
    this.hips = this.model.getObjectByName('mixamorigHips');
    if (!this.rightHand || !this.leftHand) throw new Error('角色缺少可用手骨，无法附着武器。');
    const pistolReference = gltf.animations.find(clip => clip.name === 'Pistol_Idle');
    if (!pistolReference) throw new Error('缺少刀动作参考骨架。');
    const oldBladeClips = createBladeClips(pistolReference);
    const previousBladeClips = [...oldBladeClips, ...createBladeMotionV020Clips(this.model, [...gltf.animations, ...oldBladeClips])];
    const bladeClips = [...previousBladeClips, ...createBladeMotionV022Clips(this.model, [...gltf.animations, ...previousBladeClips])];
    this.authoredClipNames = bladeClips.map(clip => clip.name);
    const weapons = await HeldWeapons3D.load(this.model, [...gltf.animations, ...bladeClips]);
    if (this.destroyed) { weapons.dispose(); return; }
    this.weapons = weapons;
    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = new Map([...gltf.animations, ...bladeClips].map(clip => [clip.name, clip]));
    const draw = clips.get('Bow Pull Back');
    if (!draw) throw new Error('缺少持弓校准动作。');
    const ready = draw.clone(); ready.name = 'Bow_Ready'; ready.duration = 1;
    for (const track of ready.tracks) {
      const value = Array.from(track.InterpolantFactoryMethodLinear().evaluate(BOW_READY_TIME));
      track.times = new Float32Array([0, 1]); track.values = new Float32Array([...value, ...value]);
    }
    clips.set('Bow_Ready', ready);
    for (const name of BASE_CLIPS) {
      const clip = clips.get(name); if (!clip) throw new Error('缺少移动动作：' + name);
      this.bases.set(name, { lower: this.slot(this.mask(clip, false, 'lower'), name), upper: this.slot(this.mask(clip, true, 'upper'), name) });
    }
    for (const name of UPPER_CLIPS) {
      const clip = clips.get(name); if (!clip) throw new Error('缺少上身动作：' + name);
      this.uppers.set(name, this.slot(this.mask(clip, true, 'weapon'), name));
    }
    const hurt = clips.get('Hit_Chest'); if (!hurt) throw new Error('缺少受击动作。');
    this.hit = this.slot(hurt.clone(), hurt.name);
    this.bladeFull = this.slot(clips.get('Blade_FourfoldDash_v020')!.clone(), 'Blade_FourfoldDash_v020');
    this.bladeCharge = this.slot(clips.get('Blade_ChargeDraw_v022')!.clone(), 'Blade_ChargeDraw_v022');
    this.bladeFinish = this.slot(clips.get('Blade_FinishSettle_v022')!.clone(), 'Blade_FinishSettle_v022');
    await this.renderer!.compileAsync(this.scene, this.camera);
    if (this.destroyed) return;
    this.available = true;
  }

  private mask(clip: THREE.AnimationClip, upper: boolean, suffix: string): THREE.AnimationClip {
    return new THREE.AnimationClip(clip.name + ':' + suffix, clip.duration,
      clip.tracks.filter(track => upperBone(THREE.PropertyBinding.parseTrackName(track.name).nodeName) === upper).map(track => track.clone()), clip.blendMode);
  }
  private slot(clip: THREE.AnimationClip, source: string): ActionSlot {
    const action = this.mixer!.clipAction(clip).setEffectiveWeight(0).play();
    return { action, weight: 0, source };
  }
  private setWeight(slot: ActionSlot, target: number, delta: number, immediate: boolean): void {
    slot.weight = immediate ? target : THREE.MathUtils.damp(slot.weight, target, 24, delta);
    if (slot.weight < 1e-5) slot.weight = 0;
    slot.action.enabled = slot.weight > 0; slot.action.setEffectiveWeight(slot.weight);
  }
  private event(slot: ActionSlot, event: Player3DAnimationEvent): void {
    slot.action.enabled = true; slot.action.paused = false; slot.action.setEffectiveTimeScale(0);
    slot.action.setLoop(THREE.LoopOnce, 1); slot.action.clampWhenFinished = true;
    slot.action.time = Math.min(slot.action.getClip().duration, Math.max(0, (event.timeOffset ?? 0) + event.age * event.timeScale));
  }

  render(state: GameState, options: { height: number; facing?: number }): Player3DFrame | undefined {
    if (!this.available || !this.renderer || !this.model || !this.mixer || this.destroyed) return;
    const motion = this.motion.sample(state, options.facing), height = Math.max(12, Number.isFinite(options.height) ? options.height : 86);
    const key = JSON.stringify([motion.runKey, motion.time, height, motion.bodyYaw, motion.armed, state.weaponCombat?.loadout.weaponId ?? state.expedition?.loadout.weaponId, motion.upperEvent, motion.fullBodyEvent, motion.locomotionWeights]);
    this.pose = motion;
    if (this.frame && key === this.cacheKey) { this.frame.dirty = false; return this.frame; }
    this.cacheKey = key;
    const initial = this.runKey !== motion.runKey || !this.frame;
    if (initial) {
      this.runKey = motion.runKey; this.upperEventId = ''; this.fullEventId = ''; this.armWeight = motion.upperClip ? 1 : 0;
      this.hurtWeight = motion.fullBodyEvent ? 1 : 0;
      for (const slots of this.bases.values()) for (const slot of [slots.lower, slots.upper]) slot.action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      for (const slot of this.uppers.values()) slot.action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      this.hit?.action.reset().play();
      this.bladeFull?.action.reset().play();
      this.bladeCharge?.action.reset().play(); this.bladeFinish?.action.reset().play();
    }
    const delta = Math.min(.1, motion.delta);
    this.armWeight = initial ? (motion.upperClip ? 1 : 0) : THREE.MathUtils.damp(this.armWeight, motion.upperClip ? 1 : 0, 24, delta);
    this.hurtWeight = initial ? (motion.fullBodyEvent ? 1 : 0) : THREE.MathUtils.damp(this.hurtWeight, motion.fullBodyEvent ? 1 : 0, motion.fullBodyEvent ? 45 : 24, delta);
    for (const [name, slots] of this.bases) {
      const target = motion.locomotionWeights[name] * (1 - this.hurtWeight);
      this.setWeight(slots.lower, target, delta, initial);
      this.setWeight(slots.upper, target * (1 - this.armWeight), delta, initial);
      for (const slot of [slots.lower, slots.upper]) {
        if (name !== 'Idle_Subtle') {
          slot.action.setEffectiveTimeScale(0);
          const phase = motion.dashing ? motion.time * 3.8 % 1 : motion.stridePhase;
          slot.action.time = phase * slot.action.getClip().duration;
        } else slot.action.setEffectiveTimeScale(1);
      }
    }
    for (const [name, slot] of this.uppers) {
      this.setWeight(slot, name === motion.upperClip ? this.armWeight * (1 - this.hurtWeight) : 0, delta, initial);
      if (motion.upperEvent?.clip === name) {
        if (this.upperEventId !== motion.upperEvent.id) { slot.action.reset().play(); this.upperEventId = motion.upperEvent.id; }
        this.event(slot, motion.upperEvent);
      } else if (name === motion.upperClip) {
        slot.action.setLoop(THREE.LoopRepeat, Infinity); slot.action.clampWhenFinished = false; slot.action.setEffectiveTimeScale(1);
      }
    }
    if (this.hit) {
      this.setWeight(this.hit, motion.fullBodyEvent?.clip === 'Hit_Chest' ? this.hurtWeight : 0, delta, initial);
      if (motion.fullBodyEvent?.clip === 'Hit_Chest') {
        if (this.fullEventId !== motion.fullBodyEvent.id) { this.hit.action.reset().play(); this.fullEventId = motion.fullBodyEvent.id; }
        this.event(this.hit, motion.fullBodyEvent);
      }
    }
    for (const slot of [this.bladeFull, this.bladeCharge, this.bladeFinish]) if (slot) {
      this.setWeight(slot, motion.fullBodyEvent?.clip === slot.source ? this.hurtWeight : 0, delta, initial);
      if (motion.fullBodyEvent?.clip === slot.source) this.event(slot, motion.fullBodyEvent);
    }
    this.desiredRotation.setFromAxisAngle(this.up, motion.bodyYaw);
    if (initial) this.turn.quaternion.copy(this.desiredRotation);
    else if (!motion.paused) this.turn.quaternion.slerp(this.desiredRotation, 1 - Math.exp(-24 * delta));
    // Remove the last presentation-only yaw before evaluating the mixer, so a
    // paused/repeated draw cannot accumulate torsion into the rig.
    if (this.hips && this.hipTwist !== 0) this.hips.quaternion.copy(this.unmixedHips);
    this.mixer.update(motion.paused ? 0 : delta);
    const event = motion.upperEvent;
    this.hipTwist = motion.fullBodyEvent ? 0 : bladeHipTwist(event?.clip, event?.age ?? 0, event?.duration ?? 0, motion.moving);
    if (this.hips) {
      this.unmixedHips.copy(this.hips.quaternion);
      if (this.hipTwist !== 0) this.hips.quaternion.multiply(this.hipRotation.setFromAxisAngle(this.up, this.hipTwist));
    }
    this.scene.updateMatrixWorld(true);
    this.weapons?.update(state, motion); this.scene.updateMatrixWorld(true);
    const resolution = Math.min(height > 180 ? 768 : 384, Math.max(256, Math.ceil(height * Math.min(2, devicePixelRatio || 1) * 2.8 / 64) * 64));
    if (resolution !== this.resolution) { this.resolution = resolution; this.renderer.setSize(resolution, resolution, false); }
    this.renderer.render(this.scene, this.camera); this.drawCount++;
    const pixelsPerUnit = height / this.projectedBindHeight, width = VIEW_SIZE * pixelsPerUnit;
    const foot = this.project(this.temp.set(0, 0, 0), width);
    const grip = this.hand(this.rightHand!, this.rightFinger, width, foot), leftGrip = this.hand(this.leftHand!, this.leftFinger, width, foot);
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const bone of this.joints) {
      const point = this.project(bone.getWorldPosition(this.temp), width);
      const radius = (/Head$/.test(bone.name) ? .235 : /Foot$|Toe/.test(bone.name) ? .115 : /UpLeg$|Leg$|Arm$|ForeArm$|Shoulder$/.test(bone.name) ? .09 : /Hand$/.test(bone.name) ? .07 : .045) * pixelsPerUnit;
      bounds.left = Math.min(bounds.left, point.x - foot.x - radius); bounds.right = Math.max(bounds.right, point.x - foot.x + radius);
      bounds.top = Math.min(bounds.top, point.y - foot.y - radius); bounds.bottom = Math.max(bounds.bottom, point.y - foot.y + radius);
    }
    const weapon = this.weapons?.project(this.camera, width, foot);
    if (weapon) { bounds.left = Math.min(bounds.left, weapon.bounds.left); bounds.right = Math.max(bounds.right, weapon.bounds.right);
      bounds.top = Math.min(bounds.top, weapon.bounds.top); bounds.bottom = Math.max(bounds.bottom, weapon.bounds.bottom); }
    this.forward.set(0, 0, 1).applyQuaternion(this.turn.quaternion);
    const yaw = Math.atan2(this.forward.x, this.forward.z), facing = Math.PI / 2 - yaw;
    this.frame = { canvas: this.canvas, width, height: width, foot, bounds, grip, leftGrip, weapon, facing, dirty: true, version: this.drawCount };
    return this.frame;
  }

  private project(world: THREE.Vector3, size: number): Vec {
    world.project(this.camera); return { x: (world.x + 1) * size / 2, y: (1 - world.y) * size / 2 };
  }
  private hand(hand: THREE.Object3D, finger: THREE.Object3D | undefined, size: number, foot: Vec): Vec {
    hand.getWorldPosition(this.temp);
    if (finger) { finger.getWorldPosition(this.second); this.temp.lerp(this.second, .45); }
    const point = this.project(this.temp, size); return { x: point.x - foot.x, y: point.y - foot.y };
  }

  diagnostics() {
    const motion = this.pose, frame = this.frame;
    return { enabled: true, ready: this.available, error: this.error ?? null, threeVersion: THREE.REVISION,
      expectedSha256: EXPECTED_SHA256, sha256: this.sha256, hashVerified: this.sha256 ? this.sha256 === EXPECTED_SHA256 : null,
      jointCount: this.joints.length, clipNames: [...this.clipNames], triangles: this.triangles, meshCount: this.meshCount,
        authoredBladeClips: [...this.authoredClipNames],
      skinnedMeshCount: this.skinnedMeshCount, textureSizes: this.textureSizes, drawCount: this.drawCount,
      canvas: { width: this.canvas.width, height: this.canvas.height },
      weapon3D: this.weapons?.diagnostics() ?? { ready: false, active: false },
      frame: frame && motion ? { bodyFacing: frame.facing, bodyYaw: Math.PI / 2 - frame.facing, paused: motion.paused, poseTime: motion.time,
        moving: motion.moving, dashing: motion.dashing, speed: motion.speed, stridePhase: motion.stridePhase,
        locomotionWeights: Object.fromEntries([...this.bases].map(([name, slots]) => [name, slots.lower.weight])),
        upperClip: motion.upperClip ?? null, fullBodyClip: motion.fullBodyEvent?.clip ?? null, hipTwist: this.hipTwist,
        upperWeights: Object.fromEntries([...this.uppers].map(([name, slot]) => [name, slot.weight])), hurtWeight: this.hit?.weight ?? 0,
        width: frame.width, height: frame.height, foot: frame.foot, grip: frame.grip, leftGrip: frame.leftGrip, weapon: frame.weapon, bounds: frame.bounds, version: frame.version } : null };
  }

  private releaseModel(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
      if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose();
    });
    for (const texture of textures) {
      texture.dispose(); const image = texture.image as TextureImage | undefined;
      if (typeof image?.close === 'function') image.close();
    }
    for (const material of materials) material.dispose(); for (const geometry of geometries) geometry.dispose();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true; this.available = false; this.frame = undefined; this.motion.reset();
    this.canvas.removeEventListener('webglcontextlost', this.lost); this.canvas.removeEventListener('webglcontextrestored', this.restored);
    this.weapons?.dispose(); this.weapons = undefined;
    if (this.model) { this.mixer?.stopAllAction(); this.mixer?.uncacheRoot(this.model); this.releaseModel(this.model); this.turn.remove(this.model); }
    this.bases.clear(); this.uppers.clear(); this.joints.length = 0;
    this.authoredClipNames = [];
    this.hit = undefined; this.bladeFull = undefined; this.bladeCharge = undefined; this.bladeFinish = undefined; this.rightHand = undefined; this.rightFinger = undefined; this.leftHand = undefined; this.leftFinger = undefined;
    this.pose = undefined; this.scene.clear();
    this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer = undefined; this.model = undefined; this.mixer = undefined;
  }
}
