import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';
import steadyUrl from '../../asserts/ViralInvasion_Weapons3D_v1/model/steady.glb';
import piercingUrl from '../../asserts/ViralInvasion_Weapons3D_v1/model/piercing.glb';
import thunderUrl from '../../asserts/ViralInvasion_WeaponUltimates_v1/model/thunder.glb';
import redbladeUrl from '../../asserts/ViralInvasion_WeaponUltimates_v1/model/redblade.glb';
import { WEAPON_IDS } from '../game/expedition';
import type { WeaponId } from '../game/expedition';
import type { GameState, Vec } from '../game/types';
import type { Player3DMotionFrame } from './player3DMotion';

type Bounds = { left: number; right: number; top: number; bottom: number };
export interface HeldWeapon3DFrame {
  id: WeaponId;
  grip: Vec;
  muzzle: Vec;
  /** A projected direction, not an absolute position. */
  forward: Vec;
  bounds: Bounds;
}
interface HeldModel {
  root: THREE.Group;
  hand: THREE.Object3D;
  socket: THREE.Group;
  grip: THREE.Object3D;
  muzzle: THREE.Object3D;
  box: THREE.Box3;
  triangles: number;
  meshes: number;
  sha256: string | null;
}
const URLS: Record<WeaponId, string> = { steady: steadyUrl, piercing: piercingUrl, thunder: thunderUrl, redblade: redbladeUrl };
const EXPECTED: Record<WeaponId, string> = {
  steady: 'c5c5628bf0bd47493b79223218fc1a0c4a97bab45fae24739e68f2d80e44559e',
  piercing: 'd24643e0e719ddf693605e82066928eb9b48e642b167a29aebe2f6073d65d104',
  thunder: '1c38700016cd42ab8dd4a27a6525afa6c4f0989329424fa1207d410854806a3a',
  redblade: '6d6f4d155b60ae6106efcaa4d682cebf0cfb940ee0574a76cfde38cd94a6e961',
};

async function loadRigid(id: WeaponId): Promise<{ root: THREE.Group; sha256: string | null }> {
  const url = URLS[id], embedded = /^data:[^,]*;base64,([\s\S]+)$/.exec(url);
  let bytes: ArrayBuffer;
  if (embedded) {
    const source = atob(embedded[1]), data = new Uint8Array(source.length);
    for (let i = 0; i < source.length; i++) data[i] = source.charCodeAt(i);
    bytes = data.buffer;
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error('武器 GLB HTTP ' + response.status);
    bytes = await response.arrayBuffer();
  }
  let sha256: string | null = null;
  if (globalThis.crypto?.subtle) {
    sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
    if (sha256 !== EXPECTED[id]) throw new Error(id + ' 三维武器校验失败');
  }
  const asset = await new GLTFLoader().parseAsync(bytes, '');
  return { root: asset.scene, sha256 };
}

/** Standard bone children, rigid GLBs and the official CCD solver; no second frame loop. */
export class HeldWeapons3D {
  private readonly models = new Map<WeaponId, HeldModel>();
  private active?: WeaponId;
  private readonly stringMaterial = new THREE.MeshStandardMaterial({ color: 0xf7dfae, roughness: .7, metalness: .05 });
  private readonly stringGeometry = new THREE.CylinderGeometry(.0016, .0016, 1, 6);
  private readonly strings = [new THREE.Mesh(this.stringGeometry, this.stringMaterial), new THREE.Mesh(this.stringGeometry, this.stringMaterial)];
  private readonly stringCenter = new THREE.Object3D();
  private readonly target = new THREE.Bone();
  private solver?: CCDIKSolver;
  private solverMesh?: THREE.SkinnedMesh;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly flashMaterial = new THREE.MeshBasicMaterial({ color: 0xd8ffed, transparent: true, opacity: 0, depthWrite: false });
  private readonly flash = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 5), this.flashMaterial);
  private rightHand!: THREE.Object3D;
  private rightFinger?: THREE.Object3D;
  private drawAmount = 0;
  private rightHandGap = 0;
  private frame?: HeldWeapon3DFrame;

  static async load(model: THREE.Group, clips: readonly THREE.AnimationClip[]): Promise<HeldWeapons3D> {
    const instance = new HeldWeapons3D();
    try { await instance.initialize(model, clips); return instance; }
    catch (error) { instance.dispose(); throw error; }
  }

  private async initialize(model: THREE.Group, clips: readonly THREE.AnimationClip[]): Promise<void> {
    // Load sequentially so a failure cannot strand a successful parallel GLB after disposal.
    for (const id of WEAPON_IDS) {
      const loaded = await loadRigid(id), hand = model.getObjectByName(id === 'piercing' ? 'mixamorigLeftHand' : 'mixamorigRightHand');
      if (!hand) { this.release(loaded.root); throw new Error('三维武器缺少手骨'); }
      const socket = new THREE.Group(); socket.name = 'weaponSocket:' + id;
      const grip = loaded.root.getObjectByName('grip'), muzzle = loaded.root.getObjectByName('muzzle');
      if (!grip || !muzzle) { this.release(loaded.root); throw new Error('三维武器缺少握柄或枪口节点'); }
      let triangles = 0, meshes = 0;
      loaded.root.traverse(node => { if (node instanceof THREE.Mesh) {
        node.frustumCulled = false; meshes++; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
      } });
      const box = new THREE.Box3().setFromObject(loaded.root);
      socket.add(loaded.root); socket.visible = false;
      this.models.set(id, { ...loaded, hand, socket, grip, muzzle, box, triangles, meshes });
    }
    this.rightHand = model.getObjectByName('mixamorigRightHand')!;
    this.rightFinger = model.getObjectByName('mixamorigRightHandMiddle1');
    const saved: { bone: THREE.Bone; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }[] = [];
    model.traverse(node => { if (node instanceof THREE.Bone) saved.push({ bone: node, p: node.position.clone(), q: node.quaternion.clone(), s: node.scale.clone() }); });
    const mixer = new THREE.AnimationMixer(model);
    const upper = (track: THREE.KeyframeTrack): boolean => /mixamorig(?:Spine|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)/.test(THREE.PropertyBinding.parseTrackName(track.name).nodeName);
    const lowerReference = clips.find(clip => clip.name === 'Idle_Subtle');
    if (!lowerReference) throw new Error('三维武器缺少下身校准动作');
    const lower = lowerReference.clone(); lower.tracks = lower.tracks.filter(track => !upper(track));
    mixer.clipAction(lower).play();
    for (const [id, item] of this.models) {
      const reference = clips.find(clip => clip.name === (id === 'piercing' ? 'Bow Pull Hold' : id === 'redblade' ? 'Blade_Ready' : 'Pistol_Idle'));
      if (!reference) throw new Error('三维武器缺少校准动作');
      // Use exactly the game's lower-idle + upper-weapon masks. Calibrating a
      // full-body pistol clip would bake its different hip yaw into the socket.
      const upperReference = reference.clone(); upperReference.tracks = upperReference.tracks.filter(upper);
      const action = mixer.clipAction(upperReference).reset().play(); mixer.setTime(0); model.updateMatrixWorld(true);
      const finger = model.getObjectByName(id === 'piercing' ? 'mixamorigLeftHandMiddle1' : 'mixamorigRightHandMiddle1');
      this.contact(item.hand, finger, this.a);
      item.socket.position.copy(this.a); item.socket.quaternion.identity(); item.socket.scale.setScalar(1);
      item.hand.attach(item.socket); // Keep the calibrated reference-world orientation as a fixed local bone transform.
      action.stop();
    }
    mixer.stopAllAction(); mixer.uncacheRoot(model);
    for (const { bone, p, q, s } of saved) { bone.position.copy(p); bone.quaternion.copy(q); bone.scale.copy(s); }
    model.updateMatrixWorld(true);
    const bow = this.models.get('piercing')!;
    this.stringCenter.name = 'animatedStringCenter'; bow.root.add(this.stringCenter);
    for (const [index, strand] of this.strings.entries()) { strand.name = 'bowString:' + index; strand.frustumCulled = false; bow.root.add(strand); }
    this.flash.name = 'weaponMuzzleFlash'; this.flash.frustumCulled = false;
    this.target.name = 'bowContactIKTarget'; model.add(this.target);
    const skinned = saved.map(item => item.bone), arm = model.getObjectByName('mixamorigRightArm') as THREE.Bone;
    const forearm = model.getObjectByName('mixamorigRightForeArm') as THREE.Bone;
    // The solver shares existing arm objects through a private skeleton view. It
    // does not append targets to the 53-joint GPU skin or change bind matrices.
    this.solverMesh = new THREE.SkinnedMesh(); this.solverMesh.skeleton = new THREE.Skeleton([...skinned, this.target]);
    this.solver = new CCDIKSolver(this.solverMesh, [{ target: skinned.length, effector: skinned.indexOf(this.rightHand as THREE.Bone),
      links: [{ index: skinned.indexOf(forearm) }, { index: skinned.indexOf(arm) }], iteration: 8, maxAngle: .16 }]);
  }

  private contact(hand: THREE.Object3D, finger: THREE.Object3D | undefined, out: THREE.Vector3): THREE.Vector3 {
    hand.getWorldPosition(out);
    if (finger) out.lerp(finger.getWorldPosition(this.d), .45);
    return out;
  }

  update(state: GameState, motion: Player3DMotionFrame): void {
    const selected = state.weaponCombat?.loadout.weaponId ?? state.expedition?.loadout.weaponId ?? 'steady';
    this.active = state.phase === 'menu' ? undefined : selected;
    for (const [id, item] of this.models) item.socket.visible = id === this.active;
    if (!this.active) { this.frame = undefined; this.flash.visible = false; return; }
    const item = this.models.get(this.active)!;
    this.flash.parent?.remove(this.flash); item.muzzle.add(this.flash);
    const event = motion.upperEvent;
    const fired = event?.clip === 'Pistol_Shoot' || event?.clip === 'Bow Release';
    const flash = fired ? Math.max(0, 1 - event.age / .055) : 0;
    this.flash.visible = flash > 0; this.flashMaterial.opacity = flash * .85; this.flash.scale.setScalar(1 + flash * .5);
    if (this.active !== 'piercing') { this.drawAmount = 0; this.rightHandGap = 0; return; }
    const bow = item.root, top = bow.getObjectByName('stringTop')!, bottom = bow.getObjectByName('stringBottom')!, rest = bow.getObjectByName('stringCenter')!;
    let draw = event?.clip === 'Bow Pull Hold' ? 1 : event?.clip === 'Bow Pull Back' ? Math.min(1, event.age / Math.max(.01, event.duration))
      : event?.clip === 'Bow Release' ? Math.max(0, 1 - event.age / .08) : 0;
    if (motion.dashing) draw = 0;
    this.drawAmount = draw;
    const contact = !motion.dashing && !motion.fullBodyEvent && (motion.upperClip === 'Bow_Ready' || event?.clip === 'Bow Pull Back' || event?.clip === 'Bow Pull Hold');
    // A small ready preload keeps the nock inside this compact character's
    // reachable arm length. Full draw stays at .30; release returns to the rest string.
    this.stringCenter.position.copy(rest.position); this.stringCenter.position.z -= .30 * draw + (contact ? .03 * (1 - draw) : 0);
    bow.updateWorldMatrix(true, true);
    if (contact && this.solver && this.target.parent) {
      this.stringCenter.getWorldPosition(this.c);
      for (let pass = 0; pass < 3; pass++) {
        this.contact(this.rightHand, this.rightFinger, this.a); this.rightHand.getWorldPosition(this.b);
        this.b.add(this.c).sub(this.a); this.target.position.copy(this.target.parent.worldToLocal(this.b)); this.target.updateMatrixWorld(true);
        this.solver.update();
      }
    }
    bow.updateWorldMatrix(true, true);
    this.contact(this.rightHand, this.rightFinger, this.a); this.stringCenter.getWorldPosition(this.b);
    this.rightHandGap = this.a.distanceTo(this.b);
    for (const [index, anchor] of [top, bottom].entries()) {
      this.a.copy(anchor.position); this.b.copy(this.stringCenter.position); const strand = this.strings[index];
      strand.position.copy(this.a).add(this.b).multiplyScalar(.5);
      this.b.sub(this.a); strand.scale.set(1, this.b.length(), 1); strand.quaternion.setFromUnitVectors(this.yAxis, this.b.normalize());
    }
  }

  project(camera: THREE.Camera, size: number, foot: Vec): HeldWeapon3DFrame | undefined {
    if (!this.active) return;
    const item = this.models.get(this.active)!;
    const projected = (point: THREE.Vector3): Vec => { point.project(camera); return { x: (point.x + 1) * size / 2 - foot.x, y: (1 - point.y) * size / 2 - foot.y }; };
    const grip = projected(item.grip.getWorldPosition(this.a)), muzzle = projected(item.muzzle.getWorldPosition(this.a));
    item.muzzle.getWorldPosition(this.a); this.b.set(0, 0, 1).transformDirection(item.root.matrixWorld).multiplyScalar(.1).add(this.a);
    const ahead = projected(this.b), forward = { x: ahead.x - muzzle.x, y: ahead.y - muzzle.y };
    const bounds: Bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const x of [item.box.min.x, item.box.max.x]) for (const y of [item.box.min.y, item.box.max.y]) for (const z of [item.box.min.z, item.box.max.z]) {
      const p = projected(item.root.localToWorld(this.a.set(x, y, z)));
      bounds.left = Math.min(bounds.left, p.x); bounds.right = Math.max(bounds.right, p.x); bounds.top = Math.min(bounds.top, p.y); bounds.bottom = Math.max(bounds.bottom, p.y);
    }
    // The nock travels outside the rigid bow's box; include it in the same
    // occlusion bounds. A conservative flash radius covers its short-lived sphere.
    const include = (point: Vec, radius: number): void => {
      bounds.left = Math.min(bounds.left, point.x - radius); bounds.right = Math.max(bounds.right, point.x + radius);
      bounds.top = Math.min(bounds.top, point.y - radius); bounds.bottom = Math.max(bounds.bottom, point.y + radius);
    };
    if (this.active === 'piercing') include(projected(this.stringCenter.getWorldPosition(this.a)), size * .003);
    if (this.flash.visible) include(muzzle, size * .017);
    return this.frame = { id: this.active, grip, muzzle, forward, bounds };
  }

  diagnostics() {
    if (!this.active) return { ready: true, active: false };
    const item = this.models.get(this.active)!, handQ = new THREE.Quaternion(), weaponQ = new THREE.Quaternion();
    return { ready: true, active: true, id: this.active, assetId: 'weapon3d:' + this.active, assetSha256: item.sha256,
      expectedSha256: EXPECTED[this.active], parentBone: item.hand.name, triangles: item.triangles, meshes: item.meshes,
      rotationInherited: true, handWorldQuaternion: item.hand.getWorldQuaternion(handQ).toArray(),
      weaponWorldQuaternion: item.socket.getWorldQuaternion(weaponQ).toArray(), socketLocalQuaternion: item.socket.quaternion.toArray(),
      drawAmount: this.drawAmount, rightHandGap: this.rightHandGap,
      stringCenter: this.active === 'piercing' ? this.stringCenter.position.toArray() : null, ...this.frame };
  }

  private release(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    root.traverse(node => { if (node instanceof THREE.Mesh) { geometries.add(node.geometry); for (const m of Array.isArray(node.material) ? node.material : [node.material]) materials.add(m); } });
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
  }
  dispose(): void {
    this.flash.removeFromParent(); for (const strand of this.strings) strand.removeFromParent();
    for (const item of this.models.values()) { item.socket.removeFromParent(); this.release(item.root); }
    this.models.clear(); this.target.removeFromParent(); this.solverMesh?.skeleton.dispose(); this.solverMesh?.geometry.dispose();
    if (this.solverMesh) for (const material of Array.isArray(this.solverMesh.material) ? this.solverMesh.material : [this.solverMesh.material]) material.dispose();
    this.stringGeometry.dispose(); this.stringMaterial.dispose(); this.flash.geometry.dispose(); this.flashMaterial.dispose(); this.flash.removeFromParent();
    this.frame = undefined; this.active = undefined;
  }
}
