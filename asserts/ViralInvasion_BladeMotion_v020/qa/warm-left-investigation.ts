import * as THREE from 'three';
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';

/** All times are presentation seconds. Gameplay remains the authority for damage and perfect blocks. */
export const BLADE_MOTION_V020 = {
  version: '0.20.0', fps: 60, rig: 'medic-hero-v1 / mixamorig / 53 skin joints',
  reference: 'Idle_Subtle lower body + original Blade_Ready upper body; redblade grip at RightHand→Middle1 45%',
  clips: [
    { name: 'Blade_Guard_v020', label: '架势格挡', duration: .45, layer: 'upper', loop: false, playback: 'once-clamp',
      perfectWindow: { start: 0, end: .18 }, windows: [{ id: 'perfect', start: 0, end: .18 }, { id: 'late-block', start: .18, end: .45 }],
      markers: [{ time: 0, id: 'guard-open', label: '格挡开始 / 完美窗开启' }, { time: .035, id: 'guard-braced', label: '架刀到位' },
        { time: .18, id: 'perfect-close', label: '完美窗结束' }, { time: .45, id: 'guard-close', label: '格挡结束' }] },
    { name: 'Blade_Counter_v020', label: '拔刀反击', duration: .34, layer: 'upper', loop: false, playback: 'once',
      windows: [{ id: 'counter-impact', start: .10, end: .17 }],
      markers: [{ time: 0, id: 'counter-start', label: '反击接架势' }, { time: .055, id: 'unsheath', label: '拔刀加速' },
        { time: .115, id: 'hit', label: '反击命中同步点' }, { time: .17, id: 'hit-close', label: '斩击有效段结束' },
        { time: .34, id: 'recover', label: '回到持刀准备' }] },
    { name: 'Blade_FourfoldDash_v020', label: '四曜穿刺 · 冲刺循环', duration: .32, layer: 'full', loop: true, playback: 'loop',
      windows: [{ id: 'dash-contact', start: .08, end: .24 }],
      markers: [{ time: 0, id: 'cycle-open', label: '穿刺循环起点' }, { time: .08, id: 'contact-open', label: '穿刺接触段开始' },
        { time: .16, id: 'hit', label: '单次穿刺同步点' }, { time: .24, id: 'contact-close', label: '接触段结束' },
        { time: .32, id: 'cycle-close', label: '姿态闭环 / 由游戏切换下一曜' }] },
    { name: 'Blade_FinishSheath_v020', label: '终结收刀', duration: .18, layer: 'upper', loop: false, playback: 'once-clamp',
      windows: [{ id: 'finisher-sync', start: .06, end: .10 }],
      markers: [{ time: 0, id: 'sheath-start', label: '终结收刀起势' }, { time: .08, id: 'hit', label: '收刀终结判定同步点' },
        { time: .14, id: 'blade-rest', label: '刀归腰侧' }, { time: .18, id: 'sheath-complete', label: '收刀动作结束' }] },
  ],
} as const;

export const BLADE_V020_CLIP_NAMES = BLADE_MOTION_V020.clips.map(clip => clip.name);
export const isBladeV020UpperBone = (name: string): boolean => /mixamorig(?:Spine|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)/.test(name);
const READY_OFFSETS: Record<string, [number, number, number]> = {
  mixamorigRightArm: [-.12, -.22, -.18], mixamorigRightForeArm: [.05, .35, .05],
  mixamorigRightHand: [.04, .12, .12], mixamorigLeftArm: [.15, -.35, -.18],
  mixamorigLeftForeArm: [0, -.45, 0], mixamorigSpine2: [0, -.08, 0],
};

/** Numerically matches the v0.19 Blade_Ready socket reference; optional for loaders without the old generator. */
export function createBladeReadyReferenceV020(sourceClips: readonly THREE.AnimationClip[]): THREE.AnimationClip {
  const existing = sourceClips.find(clip => clip.name === 'Blade_Ready');
  if (existing) return existing.clone();
  const pistol = sourceClips.find(clip => clip.name === 'Pistol_Idle');
  if (!pistol) throw new Error('Blade v0.20 requires the accepted medic Pistol_Idle source.');
  const tracks = pistol.tracks.map(track => {
    const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    const sampled = Array.from(track.InterpolantFactoryMethodLinear().evaluate(0));
    if (track.name.endsWith('.quaternion')) {
      const offset = READY_OFFSETS[name], q = new THREE.Quaternion().fromArray(sampled);
      if (offset) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...offset)));
      q.normalize(); return new THREE.QuaternionKeyframeTrack(track.name, [0, 1], [...q.toArray(), ...q.toArray()]);
    }
    const copy = track.clone(); copy.times = new Float32Array([0, 1]); copy.values = new Float32Array([...sampled, ...sampled]); return copy;
  });
  return new THREE.AnimationClip('Blade_Ready', 1, tracks);
}

type V3 = [number, number, number];
interface Pose { t: number; grip: V3; blade: V3; torso: V3; leftArm: V3; leftFore: V3 }
const pose = (t: number, grip: V3 = [0, 0, 0], blade: V3 = [0, 0, 0], torso: V3 = [0, 0, 0], leftArm: V3 = [0, 0, 0], leftFore: V3 = [0, 0, 0]): Pose => ({ t, grip, blade, torso, leftArm, leftFore });
const GUARD = pose(0, [-.035, -.035, -.035], [-1.0, -.42, .10], [-.08, -.12, .04], [-.08, -.08, .07], [.02, -.12, -.06]);
const READY = pose(0);
const KEYS: Record<string, Pose[]> = {
  Blade_Guard_v020: [READY, { ...GUARD, t: .035 }, { ...GUARD, t: .18 }, { ...GUARD, t: .36 }, { ...GUARD, t: .45 }],
  Blade_Counter_v020: [{ ...GUARD, t: 0 },
    pose(.055, [.15, -.16, -.10], [-.18, 1.95, -.08], [-.08, .18, .06], [.32, -.15, .09], [.05, -.15, .04]),
    pose(.10, [.075, -.08, -.02], [-.12, .75, -.08], [-.08, .08, -.03], [.24, -.18, .06], [.08, -.12, .03]),
    pose(.135, [-.005, -.035, -.015], [-.06, -.67, .08], [-.08, -.23, -.10], [.2, -.16, .08], [.08, -.12, .04]),
    pose(.19, [-.045, -.085, -.07], [.25, -1.08, .04], [-.04, -.28, -.05], [.28, -.18, .09], [.06, -.12, .03]),
    pose(.27, [-.015, -.028, -.015], [-.03, -.22, .02], [-.02, -.05, -.02]), { ...READY, t: .34 }],
  Blade_FourfoldDash_v020: [
    pose(0, [.012, -.055, -.015], [.05, -.015, .015], [-.14, 0, .015], [.38, -.16, .14], [-.16, -.12, .06]),
    pose(.08, [.018, -.063, -.006], [.035, .025, .01], [-.16, .018, -.005], [.30, -.14, .1], [-.12, -.1, .03]),
    pose(.16, [.012, -.055, -.015], [.05, -.015, .015], [-.14, 0, .015], [.38, -.16, .14], [-.16, -.12, .06]),
    pose(.24, [.018, -.063, -.006], [.035, .025, .01], [-.16, -.018, -.005], [.46, -.16, .18], [-.20, -.13, .08]),
    pose(.32, [.012, -.055, -.015], [.05, -.015, .015], [-.14, 0, .015], [.38, -.16, .14], [-.16, -.12, .06])],
  Blade_FinishSheath_v020: [
    pose(0, [.05, -.085, -.07], [.25, 1.08, .04], [-.04, .28, -.05], [.28, -.18, .09], [.06, -.12, .03]),
    pose(.045, [.07, -.14, -.10], [-.12, 1.45, -.08], [-.06, .06, .02]),
    pose(.08, [.12, -.19, -.12], [-.20, 1.95, -.05], [-.03, .15, .04]),
    pose(.14, [.14, -.21, -.12], [-.25, 2.20, -.05], [0, .12, .02]),
    pose(.18, [.14, -.21, -.12], [-.25, 2.20, -.05], [0, .12, .02])],
};

function blendPose(keys: readonly Pose[], t: number): Pose {
  const after = keys.findIndex(key => key.t >= t);
  if (after <= 0) return keys[0];
  const a = keys[after - 1], b = keys[after], u = THREE.MathUtils.smoothstep(t, a.t, b.t);
  const triple = (field: Exclude<keyof Pose, 't'>): V3 => a[field].map((v, i) => THREE.MathUtils.lerp(v, b[field][i], u)) as V3;
  return { t, grip: triple('grip'), blade: triple('blade'), torso: triple('torso'), leftArm: triple('leftArm'), leftFore: triple('leftFore') };
}

/**
 * Bake real medic-joint quaternion tracks with the official AnimationMixer and
 * CCDIKSolver. Call once during asset loading, before starting the live mixer.
 * Existing transforms are restored; source clips, mesh, skin and bind matrices are never changed.
 */
export function createBladeMotionV020Clips(model: THREE.Object3D, sourceClips: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  const bones: THREE.Bone[] = []; model.traverse(node => { if (node instanceof THREE.Bone) bones.push(node); });
  const byName = new Map(bones.map(bone => [bone.name, bone]));
  const required = (suffix: string): THREE.Bone => { const b = byName.get('mixamorig' + suffix); if (!b) throw new Error('Blade v0.20 missing bone: mixamorig' + suffix); return b; };
  const hand = required('RightHand'), middle = required('RightHandMiddle1'), forearm = required('RightForeArm'), arm = required('RightArm');
  const spine = required('Spine'), spine1 = required('Spine1'), spine2 = required('Spine2');
  const leftArm = required('LeftArm'), leftFore = required('LeftForeArm'), leftHand = required('LeftHand'), leftMiddle = required('LeftHandMiddle1');
  const saved = bones.map(bone => ({ bone, p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() }));
  const target = new THREE.Bone(); target.name = 'BladeV020AuthoringTarget'; model.add(target);
  const leftTarget = new THREE.Bone(); leftTarget.name = 'BladeV020SheathHandTarget'; model.add(leftTarget);
  const proxy = new THREE.SkinnedMesh(); proxy.skeleton = new THREE.Skeleton([...bones, target, leftTarget]);
  const solver = new CCDIKSolver(proxy, [{ target: bones.length, effector: bones.indexOf(hand),
    links: [{ index: bones.indexOf(forearm) }, { index: bones.indexOf(arm) }], iteration: 16, maxAngle: .20 }]);
  const leftSolver = new CCDIKSolver(proxy, [{ target: bones.length + 1, effector: bones.indexOf(leftHand),
    links: [{ index: bones.indexOf(leftFore) }, { index: bones.indexOf(leftArm) }], iteration: 16, maxAngle: .20 }]);
  const mixer = new THREE.AnimationMixer(model), result: THREE.AnimationClip[] = [];
  try {
    const idle = sourceClips.find(clip => clip.name === 'Idle_Subtle'), sprint = sourceClips.find(clip => clip.name === 'Sprint');
    if (!idle || !sprint) throw new Error('Blade v0.20 requires accepted Idle_Subtle and Sprint source clips.');
    const lower = idle.clone(); lower.tracks = lower.tracks.filter(track => !isBladeV020UpperBone(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
    const ready = createBladeReadyReferenceV020(sourceClips); ready.tracks = ready.tracks.filter(track => isBladeV020UpperBone(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
    mixer.clipAction(lower).play(); mixer.clipAction(ready).play(); mixer.setTime(0); model.updateMatrixWorld(true);
    const reference = bones.map(bone => ({ bone, p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() }));
    const qMap = new Map(reference.map(item => [item.bone.name, item.q]));
    const referenceHandQ = hand.getWorldQuaternion(new THREE.Quaternion());
    const readyGrip = hand.getWorldPosition(new THREE.Vector3()).lerp(middle.getWorldPosition(new THREE.Vector3()), .45);
    const palmLocal = hand.worldToLocal(readyGrip.clone());
    const leftReferenceQ = leftHand.getWorldQuaternion(new THREE.Quaternion());
    const leftReadyGrip = leftHand.getWorldPosition(new THREE.Vector3()).lerp(leftMiddle.getWorldPosition(new THREE.Vector3()), .45);
    const leftPalmLocal = leftHand.worldToLocal(leftReadyGrip.clone());
    mixer.stopAllAction(); mixer.uncacheRoot(model);
    const v = new THREE.Vector3(), wantedGrip = new THREE.Vector3(), wrist = new THREE.Vector3();
    const q = new THREE.Quaternion(), desiredHandQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion();
    const delta = (bone: THREE.Bone, angles: V3): void => { bone.quaternion.copy(qMap.get(bone.name)!).multiply(q.setFromEuler(new THREE.Euler(...angles))).normalize(); };
    const sprintTracks = sprint.tracks.filter(track => track.name.endsWith('.quaternion') && !isBladeV020UpperBone(THREE.PropertyBinding.parseTrackName(track.name).nodeName))
      .map(track => ({ bone: byName.get(THREE.PropertyBinding.parseTrackName(track.name).nodeName), interpolant: track.InterpolantFactoryMethodLinear() }));
    for (const meta of BLADE_MOTION_V020.clips) {
      let warmLeftArm: THREE.Quaternion | undefined, warmLeftFore: THREE.Quaternion | undefined;
      const frames = Math.ceil(meta.duration * 60), times = Array.from({ length: frames + 1 }, (_, i) => Math.min(meta.duration, i / frames * meta.duration));
      for (const key of KEYS[meta.name]) if (!times.some(t => Math.abs(t - key.t) < 1e-7)) times.push(key.t);
      times.sort((a, b) => a - b);
      const outputBones = meta.layer === 'full' ? bones : bones.filter(bone => isBladeV020UpperBone(bone.name));
      const values = new Map(outputBones.map(bone => [bone.name, [] as number[]]));
      for (const t of times) {
        for (const item of reference) { item.bone.position.copy(item.p); item.bone.quaternion.copy(item.q); item.bone.scale.copy(item.s); }
        if (meta.layer === 'full') for (const track of sprintTracks) if (track.bone) {
          // Compact the sprint's leg swing for repeated short thrust dashes.
          q.fromArray(track.interpolant.evaluate((t === meta.duration ? 0 : t / meta.duration) * sprint.duration)).normalize();
          track.bone.quaternion.copy(qMap.get(track.bone.name)!).slerp(q, .55).normalize();
        }
        const authored = blendPose(KEYS[meta.name], t);
        delta(spine, authored.torso.map(a => a * .25) as V3); delta(spine1, authored.torso.map(a => a * .35) as V3); delta(spine2, authored.torso.map(a => a * .4) as V3);
        delta(leftArm, authored.leftArm); delta(leftFore, authored.leftFore);
        if (meta.name === "Blade_FinishSheath_v020" && warmLeftArm && warmLeftFore) { leftArm.quaternion.copy(warmLeftArm); leftFore.quaternion.copy(warmLeftFore); }
        model.updateMatrixWorld(true);
        wantedGrip.copy(readyGrip).add(v.fromArray(authored.grip));
        desiredHandQ.copy(q.setFromEuler(new THREE.Euler(...authored.blade))).multiply(referenceHandQ).normalize();
        wrist.copy(palmLocal).applyQuaternion(desiredHandQ); wrist.subVectors(wantedGrip, wrist);
        target.position.copy(model.worldToLocal(wrist.clone())); target.updateMatrixWorld(true); solver.update();
        hand.parent!.getWorldQuaternion(parentQ).invert(); hand.quaternion.copy(parentQ.multiply(desiredHandQ)).normalize();
        model.updateMatrixWorld(true);
        if (meta.name === 'Blade_FinishSheath_v020') {
          // The free hand actually travels to the waist-side hilt instead of
          // keeping the inherited pistol support hand high on the chest.
          const amount = THREE.MathUtils.smoothstep(t, 0, .14);
          wantedGrip.copy(readyGrip).add(v.set(.18, -.225, -.13)); wantedGrip.lerpVectors(leftReadyGrip, wantedGrip.clone(), amount);
          wrist.copy(leftPalmLocal).applyQuaternion(leftReferenceQ); wrist.subVectors(wantedGrip, wrist);
          leftTarget.position.copy(model.worldToLocal(wrist.clone())); leftTarget.updateMatrixWorld(true); leftSolver.update();
          leftHand.parent!.getWorldQuaternion(parentQ).invert(); leftHand.quaternion.copy(parentQ.multiply(leftReferenceQ)).normalize();
          warmLeftArm = leftArm.quaternion.clone(); warmLeftFore = leftFore.quaternion.clone();
          model.updateMatrixWorld(true);
        }
        for (const bone of outputBones) {
          const output = values.get(bone.name)!, rotation = bone.quaternion.clone().normalize();
          // Keep quaternion signs on one hemisphere so interpolation never takes an accidental long turn.
          if (output.length && rotation.dot(new THREE.Quaternion().fromArray(output, output.length - 4)) < 0) rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
          output.push(...rotation.toArray());
        }
      }
      if (meta.loop) for (const value of values.values()) for (let i = 0; i < 4; i++) value[value.length - 4 + i] = value[i];
      const clip = new THREE.AnimationClip(meta.name, meta.duration, outputBones.map(bone => new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', times, values.get(bone.name)!)));
      Object.assign(clip, { userData: { bladeV020: meta } }); result.push(clip);
    }
    return result;
  } finally {
    mixer.stopAllAction(); mixer.uncacheRoot(model); target.removeFromParent(); leftTarget.removeFromParent(); proxy.skeleton.dispose(); proxy.geometry.dispose();
    for (const material of Array.isArray(proxy.material) ? proxy.material : [proxy.material]) material.dispose();
    for (const item of saved) { item.bone.position.copy(item.p); item.bone.quaternion.copy(item.q); item.bone.scale.copy(item.s); }
    model.updateMatrixWorld(true);
  }
}
