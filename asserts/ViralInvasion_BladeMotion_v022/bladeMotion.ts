import * as THREE from 'three';
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';
import { createBladeMotionV020Clips, createBladeReadyReferenceV020 } from '../ViralInvasion_BladeMotion_v020/bladeMotion';

/** Metadata expresses synchronization intent only; gameplay and the screen close-up own all effects. */
export const BLADE_MOTION_V022 = {
  version: '0.22.0', fps: 60, rig: 'accepted medic / mixamorig / 53 skin joints',
  eyeCapability: { eyeBones: false, eyelidBones: false, morphTargets: false,
    available: ['mixamorigNeck', 'mixamorigHead'],
    limitation: 'Neck/head pitch conveys intention only. Closed/open eyes must be rendered by the separate screen close-up; no eyelid deformation is authored.' },
  sequence: { drawingSeconds: 3, chargeSeconds: .65, dashSeconds: [.72, 1.2], finishSeconds: .30,
    dashClip: 'Blade_FourfoldDash_v020', chargeToDashAt: .65, additionalLaunchTransition: false },
  clips: [
    { name: 'Blade_ChargeDraw_v022', label: '收刀蓄势 · 抬眼拔刀', duration: .65, layer: 'full', loop: false, playback: 'once',
      windows: [{ id: 'eyes-close-intent', start: 0, end: .32 }, { id: 'eyes-open-intent', start: .32, end: .48 }, { id: 'unsheath-flash', start: .48, end: .65 }],
      markers: [{ time: 0, id: 'windup-start', label: '绘线结束 / 蓄势开始' }, { time: .18, id: 'sheathed-brace', label: '腰侧扶刀 / 躯干压低' },
        { time: .32, id: 'eye-open-intent', label: '闭眼意图结束 / 开始抬眼（特写同步）' },
        { time: .48, id: 'unsheath-flash', label: '睁眼意图结束 / 拔刀闪开始' },
        { time: .65, id: 'launch', label: '拔刀完成 / 穿刺发射起点' }] },
    { name: 'Blade_FinishSettle_v022', label: '终结收刀 · 沉势定格', duration: .30, layer: 'full', loop: false, playback: 'once-clamp',
      windows: [{ id: 'finisher-sync', start: .08, end: .14 }, { id: 'settled-hold', start: .24, end: .30 }],
      markers: [{ time: 0, id: 'finish-start', label: '穿刺结束 / 终结回斩' }, { time: .11, id: 'hit', label: '终结表现命中同步点' },
        { time: .19, id: 'blade-waist', label: '刀归腰侧 / 左手扶刀' }, { time: .24, id: 'settle', label: '重心沉稳 / 收势定格' },
        { time: .30, id: 'finish-end', label: '终结收势结束' }] },
  ],
} as const;
export const BLADE_V022_CLIP_NAMES = BLADE_MOTION_V022.clips.map(clip => clip.name);
export const createBladeReadyReferenceV022 = createBladeReadyReferenceV020;

type V3 = [number, number, number];
interface Pose { t: number; right: V3; blade: V3; torso: V3; head: V3; left: V3; sink: number }
const p = (t: number, right: V3, blade: V3, torso: V3, head: V3, left: V3, sink = 0): Pose => ({ t, right, blade, torso, head, left, sink });
const WAIST_R: V3 = [.14, -.21, -.12], WAIST_L: V3 = [.18, -.225, -.13], SHEATH: V3 = [-.25, 2.2, -.05];
const CHARGE_KEYS: Pose[] = [
  p(0, [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [.0, -.09, -.02]),
  p(.18, WAIST_R, SHEATH, [.16, .12, -.02], [.16, 0, 0], WAIST_L, .026),
  p(.32, [.145, -.215, -.125], SHEATH, [.23, .13, -.025], [.28, -.02, 0], WAIST_L, .038),
  p(.48, [.125, -.20, -.11], [-.18, 2.05, -.04], [.16, .10, -.02], [-.14, 0, 0], WAIST_L, .030),
  p(.56, [.06, -.105, -.04], [-.04, .78, -.02], [.06, .015, 0], [-.08, 0, 0], [.12, -.16, -.07], .010),
  p(.65, [.012, -.055, -.015], [.05, -.015, .015], [-.14, 0, .015], [0, 0, 0], [0, 0, 0]),
];
const FINISH_KEYS: Pose[] = [
  p(0, [.012, -.055, -.015], [.05, -.015, .015], [-.14, 0, .015], [0, 0, 0], [.02, -.10, -.03]),
  p(.065, [-.025, -.065, -.05], [.07, -1.0, .09], [-.08, -.24, -.05], [-.09, 0, 0], [.03, -.13, -.04], .010),
  p(.11, [.075, -.14, -.08], [-.13, 1.10, -.07], [.1, .19, .03], [.03, 0, 0], [.13, -.19, -.10], .020),
  p(.19, WAIST_R, SHEATH, [.15, .12, .02], [.1, 0, 0], WAIST_L, .028),
  p(.24, WAIST_R, SHEATH, [.10, .10, .015], [0, 0, 0], WAIST_L, .025),
  p(.30, WAIST_R, SHEATH, [.10, .10, .015], [0, 0, 0], WAIST_L, .025),
];
function interpolate(keys: Pose[], time: number): Pose {
  const i = keys.findIndex(key => key.t >= time); if (i <= 0) return keys[0];
  const a = keys[i - 1], b = keys[i], u = THREE.MathUtils.smoothstep(time, a.t, b.t);
  const mix = (field: 'right' | 'blade' | 'torso' | 'head' | 'left'): V3 => a[field].map((v, axis) => THREE.MathUtils.lerp(v, b[field][axis], u)) as V3;
  return { t: time, right: mix('right'), blade: mix('blade'), torso: mix('torso'), head: mix('head'), left: mix('left'), sink: THREE.MathUtils.lerp(a.sink, b.sink, u) };
}
interface Saved { bone: THREE.Bone; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }
const upper = (name: string): boolean => /mixamorig(?:Spine|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)/.test(name);

/**
 * Bake once after GLTFLoader parses the existing medic. No new mesh, skin or GLB.
 * Real shoulder/elbow/head/leg tracks plus bounded vertical hips compression;
 * temporary official CCD chains are removed and the input pose is restored.
 */
export function createBladeMotionV022Clips(model: THREE.Object3D, referenceClips: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  const bones: THREE.Bone[] = []; model.traverse(node => { if (node instanceof THREE.Bone) bones.push(node); });
  if (bones.length !== 53) throw new Error('Blade v0.22 requires the accepted medic 53-bone rig.');
  const named = new Map(bones.map(bone => [bone.name, bone]));
  const bone = (name: string): THREE.Bone => { const b = named.get('mixamorig' + name); if (!b) throw new Error('Missing medic bone: ' + name); return b; };
  const hips = bone('Hips'), spine = [bone('Spine'), bone('Spine1'), bone('Spine2')], neck = bone('Neck'), head = bone('Head');
  const rh = bone('RightHand'), rm = bone('RightHandMiddle1'), lh = bone('LeftHand'), lm = bone('LeftHandMiddle1');
  const ra = bone('RightArm'), rf = bone('RightForeArm'), la = bone('LeftArm'), lf = bone('LeftForeArm');
  const feet = [bone('LeftFoot'), bone('RightFoot')], legs = [bone('LeftLeg'), bone('RightLeg')], thighs = [bone('LeftUpLeg'), bone('RightUpLeg')];
  const saved: Saved[] = bones.map(b => ({ bone: b, p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
  const restore = (pose: Saved[]): void => { for (const item of pose) { item.bone.position.copy(item.p); item.bone.quaternion.copy(item.q); item.bone.scale.copy(item.s); } model.updateMatrixWorld(true); };
  // Resolve the inherited dash before adding temporary authoring targets so
  // that the old generator sees only the original 53-bone character.
  const inheritedDash = referenceClips.find(clip => clip.name === 'Blade_FourfoldDash_v020')
    ?? createBladeMotionV020Clips(model, referenceClips).find(clip => clip.name === 'Blade_FourfoldDash_v020')!;
  const targets = Array.from({ length: 4 }, (_, i) => { const b = new THREE.Bone(); b.name = 'BladeV022BakeTarget' + i; model.add(b); return b; });
  const proxy = new THREE.SkinnedMesh(); proxy.skeleton = new THREE.Skeleton([...bones, ...targets]);
  const armChain = (hand: THREE.Bone, fore: THREE.Bone, arm: THREE.Bone, index: number) => ({ target: bones.length + index, effector: bones.indexOf(hand),
    links: [{ index: bones.indexOf(fore) }, { index: bones.indexOf(arm) }], iteration: 18, maxAngle: .18 });
  const rightIK = new CCDIKSolver(proxy, [armChain(rh, rf, ra, 0)]), leftIK = new CCDIKSolver(proxy, [armChain(lh, lf, la, 1)]);
  const legIK = new CCDIKSolver(proxy, feet.map((foot, i) => ({ target: bones.length + i + 2, effector: bones.indexOf(foot),
    links: [{ index: bones.indexOf(legs[i]) }, { index: bones.indexOf(thighs[i]) }], iteration: 12, maxAngle: .12 })));
  const mixer = new THREE.AnimationMixer(model);
  try {
    const dash = inheritedDash;
    const idle = referenceClips.find(clip => clip.name === 'Idle_Subtle'); if (!idle) throw new Error('Idle_Subtle reference missing.');
    const lower = idle.clone(); lower.tracks = lower.tracks.filter(track => !upper(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
    const ready = createBladeReadyReferenceV022(referenceClips); ready.tracks = ready.tracks.filter(track => upper(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
    mixer.clipAction(lower).play(); mixer.clipAction(ready).play(); mixer.setTime(0); model.updateMatrixWorld(true);
    const reference = bones.map(b => ({ bone: b, p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() })), refs = new Map(reference.map(item => [item.bone.name, item]));
    const contact = (hand: THREE.Bone, finger: THREE.Bone): THREE.Vector3 => hand.getWorldPosition(new THREE.Vector3()).lerp(finger.getWorldPosition(new THREE.Vector3()), .45);
    const readyRight = contact(rh, rm), readyLeft = contact(lh, lm), rq = rh.getWorldQuaternion(new THREE.Quaternion()), lq = lh.getWorldQuaternion(new THREE.Quaternion());
    const rp = rh.worldToLocal(readyRight.clone()), lp = lh.worldToLocal(readyLeft.clone());
    const fixedFeet = feet.map(f => ({ p: f.getWorldPosition(new THREE.Vector3()), q: f.getWorldQuaternion(new THREE.Quaternion()) }));
    mixer.stopAllAction(); mixer.uncacheRoot(model);
    const dashPose = new Map<string, THREE.Quaternion>();
    for (const track of dash.tracks) if (track.name.endsWith('.quaternion')) dashPose.set(THREE.PropertyBinding.parseTrackName(track.name).nodeName, new THREE.Quaternion().fromArray(track.InterpolantFactoryMethodLinear().evaluate(0)).normalize());
    const eulerQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), worldQ = new THREE.Quaternion(), wrist = new THREE.Vector3();
    const setOffset = (b: THREE.Bone, angles: V3): void => {
      // Imported Mixamo local axes are not the helmet's forward/up axes. Apply
      // the authored pitch in rig space, then convert back to the bone parent,
      // so a low-head cue nods forward instead of becoming a sideways head roll.
      b.quaternion.copy(refs.get(b.name)!.q); b.updateWorldMatrix(true, false);
      b.getWorldQuaternion(worldQ); worldQ.premultiply(eulerQ.setFromEuler(new THREE.Euler(...angles))).normalize();
      b.parent!.getWorldQuaternion(parentQ).invert(); b.quaternion.copy(parentQ.multiply(worldQ)).normalize(); b.updateMatrixWorld(true);
    };
    const setTarget = (target: THREE.Bone, world: THREE.Vector3): void => { target.position.copy(model.worldToLocal(world.clone())); target.updateMatrixWorld(true); };
    const handOrientation = (hand: THREE.Bone, desired: THREE.Quaternion): void => { hand.parent!.getWorldQuaternion(parentQ).invert(); hand.quaternion.copy(parentQ.multiply(desired)).normalize(); };
    const results: THREE.AnimationClip[] = [];
    for (const meta of BLADE_MOTION_V022.clips) {
      const charge = meta.name === 'Blade_ChargeDraw_v022', keys = charge ? CHARGE_KEYS : FINISH_KEYS;
      const count = Math.ceil(meta.duration * 90), times = Array.from({ length: count + 1 }, (_, i) => i / count * meta.duration);
      for (const key of keys) if (!times.some(time => Math.abs(time - key.t) < 1e-7)) times.push(key.t); times.sort((a, b) => a - b);
      const values = new Map(bones.map(b => [b.name, [] as number[]])), positionValues: number[] = [];
      const warm = new Map([ra, rf, la, lf, ...thighs, ...legs].map(b => [b.name, refs.get(b.name)!.q.clone()]));
      for (const time of times) {
        restore(reference); const pose = interpolate(keys, time);
        hips.position.y -= pose.sink;
        for (let i = 0; i < 3; i++) setOffset(spine[i], pose.torso.map(a => a * [.25, .35, .4][i]) as V3);
        setOffset(neck, pose.head.map(a => a * .4) as V3); setOffset(head, pose.head.map(a => a * .6) as V3);
        for (const b of [ra, rf, la, lf, ...thighs, ...legs]) b.quaternion.copy(warm.get(b.name)!);
        model.updateMatrixWorld(true);
        for (let i = 0; i < 2; i++) setTarget(targets[i + 2], fixedFeet[i].p);
        legIK.update(); model.updateMatrixWorld(true);
        for (let i = 0; i < 2; i++) handOrientation(feet[i], fixedFeet[i].q);
        worldQ.copy(eulerQ.setFromEuler(new THREE.Euler(...pose.blade))).multiply(rq).normalize();
        wrist.copy(rp).applyQuaternion(worldQ); wrist.subVectors(readyRight.clone().add(new THREE.Vector3(...pose.right)), wrist);
        setTarget(targets[0], wrist); rightIK.update(); handOrientation(rh, worldQ); model.updateMatrixWorld(true);
        const leftGoal = charge && time < .18 ? readyLeft.clone().lerp(readyRight.clone().add(new THREE.Vector3(...WAIST_L)), THREE.MathUtils.smoothstep(time, 0, .18))
          : readyRight.clone().add(new THREE.Vector3(...pose.left));
        wrist.copy(lp).applyQuaternion(lq); wrist.subVectors(leftGoal, wrist); setTarget(targets[1], wrist); leftIK.update(); handOrientation(lh, lq);
        model.updateMatrixWorld(true);
        for (const b of [ra, rf, la, lf, ...thighs, ...legs]) warm.get(b.name)!.copy(b.quaternion);
        // Exact existing full-pose hand-off: no root teleport or extra launch clip.
        const dashBlend = charge ? THREE.MathUtils.smoothstep(time, .56, .65) : 1 - THREE.MathUtils.smoothstep(time, 0, .055);
        if (dashBlend > 0) {
          for (const b of bones) if (dashPose.has(b.name)) b.quaternion.slerp(dashPose.get(b.name)!, dashBlend).normalize();
          hips.position.lerp(refs.get(hips.name)!.p, dashBlend);
        }
        for (const b of bones) {
          const out = values.get(b.name)!, q = b.quaternion.clone().normalize();
          if (out.length && q.dot(new THREE.Quaternion().fromArray(out, out.length - 4)) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
          out.push(...q.toArray());
        }
        positionValues.push(...hips.position.toArray());
      }
      const tracks: THREE.KeyframeTrack[] = bones.map(b => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, values.get(b.name)!));
      tracks.push(new THREE.VectorKeyframeTrack(hips.name + '.position', times, positionValues));
      const clip = new THREE.AnimationClip(meta.name, meta.duration, tracks); Object.assign(clip, { userData: { bladeV022: meta } }); results.push(clip);
    }
    return results;
  } finally {
    mixer.stopAllAction(); mixer.uncacheRoot(model); for (const target of targets) target.removeFromParent();
    proxy.skeleton.dispose(); proxy.geometry.dispose(); for (const material of Array.isArray(proxy.material) ? proxy.material : [proxy.material]) material.dispose(); restore(saved);
  }
}
