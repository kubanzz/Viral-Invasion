// asserts/ViralInvasion_BladeMotion_v020/qa/warm-left-investigation.ts
import * as THREE from "three";
import { CCDIKSolver } from "three/addons/animation/CCDIKSolver.js";
var BLADE_MOTION_V020 = {
  version: "0.20.0",
  fps: 60,
  rig: "medic-hero-v1 / mixamorig / 53 skin joints",
  reference: "Idle_Subtle lower body + original Blade_Ready upper body; redblade grip at RightHand\u2192Middle1 45%",
  clips: [
    {
      name: "Blade_Guard_v020",
      label: "\u67B6\u52BF\u683C\u6321",
      duration: 0.45,
      layer: "upper",
      loop: false,
      playback: "once-clamp",
      perfectWindow: { start: 0, end: 0.18 },
      windows: [{ id: "perfect", start: 0, end: 0.18 }, { id: "late-block", start: 0.18, end: 0.45 }],
      markers: [
        { time: 0, id: "guard-open", label: "\u683C\u6321\u5F00\u59CB / \u5B8C\u7F8E\u7A97\u5F00\u542F" },
        { time: 0.035, id: "guard-braced", label: "\u67B6\u5200\u5230\u4F4D" },
        { time: 0.18, id: "perfect-close", label: "\u5B8C\u7F8E\u7A97\u7ED3\u675F" },
        { time: 0.45, id: "guard-close", label: "\u683C\u6321\u7ED3\u675F" }
      ]
    },
    {
      name: "Blade_Counter_v020",
      label: "\u62D4\u5200\u53CD\u51FB",
      duration: 0.34,
      layer: "upper",
      loop: false,
      playback: "once",
      windows: [{ id: "counter-impact", start: 0.1, end: 0.17 }],
      markers: [
        { time: 0, id: "counter-start", label: "\u53CD\u51FB\u63A5\u67B6\u52BF" },
        { time: 0.055, id: "unsheath", label: "\u62D4\u5200\u52A0\u901F" },
        { time: 0.115, id: "hit", label: "\u53CD\u51FB\u547D\u4E2D\u540C\u6B65\u70B9" },
        { time: 0.17, id: "hit-close", label: "\u65A9\u51FB\u6709\u6548\u6BB5\u7ED3\u675F" },
        { time: 0.34, id: "recover", label: "\u56DE\u5230\u6301\u5200\u51C6\u5907" }
      ]
    },
    {
      name: "Blade_FourfoldDash_v020",
      label: "\u56DB\u66DC\u7A7F\u523A \xB7 \u51B2\u523A\u5FAA\u73AF",
      duration: 0.32,
      layer: "full",
      loop: true,
      playback: "loop",
      windows: [{ id: "dash-contact", start: 0.08, end: 0.24 }],
      markers: [
        { time: 0, id: "cycle-open", label: "\u7A7F\u523A\u5FAA\u73AF\u8D77\u70B9" },
        { time: 0.08, id: "contact-open", label: "\u7A7F\u523A\u63A5\u89E6\u6BB5\u5F00\u59CB" },
        { time: 0.16, id: "hit", label: "\u5355\u6B21\u7A7F\u523A\u540C\u6B65\u70B9" },
        { time: 0.24, id: "contact-close", label: "\u63A5\u89E6\u6BB5\u7ED3\u675F" },
        { time: 0.32, id: "cycle-close", label: "\u59FF\u6001\u95ED\u73AF / \u7531\u6E38\u620F\u5207\u6362\u4E0B\u4E00\u66DC" }
      ]
    },
    {
      name: "Blade_FinishSheath_v020",
      label: "\u7EC8\u7ED3\u6536\u5200",
      duration: 0.18,
      layer: "upper",
      loop: false,
      playback: "once-clamp",
      windows: [{ id: "finisher-sync", start: 0.06, end: 0.1 }],
      markers: [
        { time: 0, id: "sheath-start", label: "\u7EC8\u7ED3\u6536\u5200\u8D77\u52BF" },
        { time: 0.08, id: "hit", label: "\u6536\u5200\u7EC8\u7ED3\u5224\u5B9A\u540C\u6B65\u70B9" },
        { time: 0.14, id: "blade-rest", label: "\u5200\u5F52\u8170\u4FA7" },
        { time: 0.18, id: "sheath-complete", label: "\u6536\u5200\u52A8\u4F5C\u7ED3\u675F" }
      ]
    }
  ]
};
var BLADE_V020_CLIP_NAMES = BLADE_MOTION_V020.clips.map((clip) => clip.name);
var isBladeV020UpperBone = (name) => /mixamorig(?:Spine|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)/.test(name);
var READY_OFFSETS = {
  mixamorigRightArm: [-0.12, -0.22, -0.18],
  mixamorigRightForeArm: [0.05, 0.35, 0.05],
  mixamorigRightHand: [0.04, 0.12, 0.12],
  mixamorigLeftArm: [0.15, -0.35, -0.18],
  mixamorigLeftForeArm: [0, -0.45, 0],
  mixamorigSpine2: [0, -0.08, 0]
};
function createBladeReadyReferenceV020(sourceClips) {
  const existing = sourceClips.find((clip) => clip.name === "Blade_Ready");
  if (existing) return existing.clone();
  const pistol = sourceClips.find((clip) => clip.name === "Pistol_Idle");
  if (!pistol) throw new Error("Blade v0.20 requires the accepted medic Pistol_Idle source.");
  const tracks = pistol.tracks.map((track) => {
    const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    const sampled = Array.from(track.InterpolantFactoryMethodLinear().evaluate(0));
    if (track.name.endsWith(".quaternion")) {
      const offset = READY_OFFSETS[name], q = new THREE.Quaternion().fromArray(sampled);
      if (offset) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...offset)));
      q.normalize();
      return new THREE.QuaternionKeyframeTrack(track.name, [0, 1], [...q.toArray(), ...q.toArray()]);
    }
    const copy = track.clone();
    copy.times = new Float32Array([0, 1]);
    copy.values = new Float32Array([...sampled, ...sampled]);
    return copy;
  });
  return new THREE.AnimationClip("Blade_Ready", 1, tracks);
}
var pose = (t, grip = [0, 0, 0], blade = [0, 0, 0], torso = [0, 0, 0], leftArm = [0, 0, 0], leftFore = [0, 0, 0]) => ({ t, grip, blade, torso, leftArm, leftFore });
var GUARD = pose(0, [-0.035, -0.035, -0.035], [-1, -0.42, 0.1], [-0.08, -0.12, 0.04], [-0.08, -0.08, 0.07], [0.02, -0.12, -0.06]);
var READY = pose(0);
var KEYS = {
  Blade_Guard_v020: [READY, { ...GUARD, t: 0.035 }, { ...GUARD, t: 0.18 }, { ...GUARD, t: 0.36 }, { ...GUARD, t: 0.45 }],
  Blade_Counter_v020: [
    { ...GUARD, t: 0 },
    pose(0.055, [0.15, -0.16, -0.1], [-0.18, 1.95, -0.08], [-0.08, 0.18, 0.06], [0.32, -0.15, 0.09], [0.05, -0.15, 0.04]),
    pose(0.1, [0.075, -0.08, -0.02], [-0.12, 0.75, -0.08], [-0.08, 0.08, -0.03], [0.24, -0.18, 0.06], [0.08, -0.12, 0.03]),
    pose(0.135, [-5e-3, -0.035, -0.015], [-0.06, -0.67, 0.08], [-0.08, -0.23, -0.1], [0.2, -0.16, 0.08], [0.08, -0.12, 0.04]),
    pose(0.19, [-0.045, -0.085, -0.07], [0.25, -1.08, 0.04], [-0.04, -0.28, -0.05], [0.28, -0.18, 0.09], [0.06, -0.12, 0.03]),
    pose(0.27, [-0.015, -0.028, -0.015], [-0.03, -0.22, 0.02], [-0.02, -0.05, -0.02]),
    { ...READY, t: 0.34 }
  ],
  Blade_FourfoldDash_v020: [
    pose(0, [0.012, -0.055, -0.015], [0.05, -0.015, 0.015], [-0.14, 0, 0.015], [0.38, -0.16, 0.14], [-0.16, -0.12, 0.06]),
    pose(0.08, [0.018, -0.063, -6e-3], [0.035, 0.025, 0.01], [-0.16, 0.018, -5e-3], [0.3, -0.14, 0.1], [-0.12, -0.1, 0.03]),
    pose(0.16, [0.012, -0.055, -0.015], [0.05, -0.015, 0.015], [-0.14, 0, 0.015], [0.38, -0.16, 0.14], [-0.16, -0.12, 0.06]),
    pose(0.24, [0.018, -0.063, -6e-3], [0.035, 0.025, 0.01], [-0.16, -0.018, -5e-3], [0.46, -0.16, 0.18], [-0.2, -0.13, 0.08]),
    pose(0.32, [0.012, -0.055, -0.015], [0.05, -0.015, 0.015], [-0.14, 0, 0.015], [0.38, -0.16, 0.14], [-0.16, -0.12, 0.06])
  ],
  Blade_FinishSheath_v020: [
    pose(0, [0.05, -0.085, -0.07], [0.25, 1.08, 0.04], [-0.04, 0.28, -0.05], [0.28, -0.18, 0.09], [0.06, -0.12, 0.03]),
    pose(0.045, [0.07, -0.14, -0.1], [-0.12, 1.45, -0.08], [-0.06, 0.06, 0.02]),
    pose(0.08, [0.12, -0.19, -0.12], [-0.2, 1.95, -0.05], [-0.03, 0.15, 0.04]),
    pose(0.14, [0.14, -0.21, -0.12], [-0.25, 2.2, -0.05], [0, 0.12, 0.02]),
    pose(0.18, [0.14, -0.21, -0.12], [-0.25, 2.2, -0.05], [0, 0.12, 0.02])
  ]
};
function blendPose(keys, t) {
  const after = keys.findIndex((key) => key.t >= t);
  if (after <= 0) return keys[0];
  const a = keys[after - 1], b = keys[after], u = THREE.MathUtils.smoothstep(t, a.t, b.t);
  const triple = (field) => a[field].map((v, i) => THREE.MathUtils.lerp(v, b[field][i], u));
  return { t, grip: triple("grip"), blade: triple("blade"), torso: triple("torso"), leftArm: triple("leftArm"), leftFore: triple("leftFore") };
}
function createBladeMotionV020Clips(model, sourceClips) {
  const bones = [];
  model.traverse((node) => {
    if (node instanceof THREE.Bone) bones.push(node);
  });
  const byName = new Map(bones.map((bone) => [bone.name, bone]));
  const required = (suffix) => {
    const b = byName.get("mixamorig" + suffix);
    if (!b) throw new Error("Blade v0.20 missing bone: mixamorig" + suffix);
    return b;
  };
  const hand = required("RightHand"), middle = required("RightHandMiddle1"), forearm = required("RightForeArm"), arm = required("RightArm");
  const spine = required("Spine"), spine1 = required("Spine1"), spine2 = required("Spine2");
  const leftArm = required("LeftArm"), leftFore = required("LeftForeArm"), leftHand = required("LeftHand"), leftMiddle = required("LeftHandMiddle1");
  const saved = bones.map((bone) => ({ bone, p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() }));
  const target = new THREE.Bone();
  target.name = "BladeV020AuthoringTarget";
  model.add(target);
  const leftTarget = new THREE.Bone();
  leftTarget.name = "BladeV020SheathHandTarget";
  model.add(leftTarget);
  const proxy = new THREE.SkinnedMesh();
  proxy.skeleton = new THREE.Skeleton([...bones, target, leftTarget]);
  const solver = new CCDIKSolver(proxy, [{
    target: bones.length,
    effector: bones.indexOf(hand),
    links: [{ index: bones.indexOf(forearm) }, { index: bones.indexOf(arm) }],
    iteration: 16,
    maxAngle: 0.2
  }]);
  const leftSolver = new CCDIKSolver(proxy, [{
    target: bones.length + 1,
    effector: bones.indexOf(leftHand),
    links: [{ index: bones.indexOf(leftFore) }, { index: bones.indexOf(leftArm) }],
    iteration: 16,
    maxAngle: 0.2
  }]);
  const mixer = new THREE.AnimationMixer(model), result = [];
  try {
    const idle = sourceClips.find((clip) => clip.name === "Idle_Subtle"), sprint = sourceClips.find((clip) => clip.name === "Sprint");
    if (!idle || !sprint) throw new Error("Blade v0.20 requires accepted Idle_Subtle and Sprint source clips.");
    const lower = idle.clone();
    lower.tracks = lower.tracks.filter((track) => !isBladeV020UpperBone(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
    const ready = createBladeReadyReferenceV020(sourceClips);
    ready.tracks = ready.tracks.filter((track) => isBladeV020UpperBone(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
    mixer.clipAction(lower).play();
    mixer.clipAction(ready).play();
    mixer.setTime(0);
    model.updateMatrixWorld(true);
    const reference = bones.map((bone) => ({ bone, p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() }));
    const qMap = new Map(reference.map((item) => [item.bone.name, item.q]));
    const referenceHandQ = hand.getWorldQuaternion(new THREE.Quaternion());
    const readyGrip = hand.getWorldPosition(new THREE.Vector3()).lerp(middle.getWorldPosition(new THREE.Vector3()), 0.45);
    const palmLocal = hand.worldToLocal(readyGrip.clone());
    const leftReferenceQ = leftHand.getWorldQuaternion(new THREE.Quaternion());
    const leftReadyGrip = leftHand.getWorldPosition(new THREE.Vector3()).lerp(leftMiddle.getWorldPosition(new THREE.Vector3()), 0.45);
    const leftPalmLocal = leftHand.worldToLocal(leftReadyGrip.clone());
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    const v = new THREE.Vector3(), wantedGrip = new THREE.Vector3(), wrist = new THREE.Vector3();
    const q = new THREE.Quaternion(), desiredHandQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion();
    const delta = (bone, angles) => {
      bone.quaternion.copy(qMap.get(bone.name)).multiply(q.setFromEuler(new THREE.Euler(...angles))).normalize();
    };
    const sprintTracks = sprint.tracks.filter((track) => track.name.endsWith(".quaternion") && !isBladeV020UpperBone(THREE.PropertyBinding.parseTrackName(track.name).nodeName)).map((track) => ({ bone: byName.get(THREE.PropertyBinding.parseTrackName(track.name).nodeName), interpolant: track.InterpolantFactoryMethodLinear() }));
    for (const meta of BLADE_MOTION_V020.clips) {
      let warmLeftArm, warmLeftFore;
      const frames = Math.ceil(meta.duration * 60), times = Array.from({ length: frames + 1 }, (_, i) => Math.min(meta.duration, i / frames * meta.duration));
      for (const key of KEYS[meta.name]) if (!times.some((t) => Math.abs(t - key.t) < 1e-7)) times.push(key.t);
      times.sort((a, b) => a - b);
      const outputBones = meta.layer === "full" ? bones : bones.filter((bone) => isBladeV020UpperBone(bone.name));
      const values = new Map(outputBones.map((bone) => [bone.name, []]));
      for (const t of times) {
        for (const item of reference) {
          item.bone.position.copy(item.p);
          item.bone.quaternion.copy(item.q);
          item.bone.scale.copy(item.s);
        }
        if (meta.layer === "full") {
          for (const track of sprintTracks) if (track.bone) {
            q.fromArray(track.interpolant.evaluate((t === meta.duration ? 0 : t / meta.duration) * sprint.duration)).normalize();
            track.bone.quaternion.copy(qMap.get(track.bone.name)).slerp(q, 0.55).normalize();
          }
        }
        const authored = blendPose(KEYS[meta.name], t);
        delta(spine, authored.torso.map((a) => a * 0.25));
        delta(spine1, authored.torso.map((a) => a * 0.35));
        delta(spine2, authored.torso.map((a) => a * 0.4));
        delta(leftArm, authored.leftArm);
        delta(leftFore, authored.leftFore);
        if (meta.name === "Blade_FinishSheath_v020" && warmLeftArm && warmLeftFore) {
          leftArm.quaternion.copy(warmLeftArm);
          leftFore.quaternion.copy(warmLeftFore);
        }
        model.updateMatrixWorld(true);
        wantedGrip.copy(readyGrip).add(v.fromArray(authored.grip));
        desiredHandQ.copy(q.setFromEuler(new THREE.Euler(...authored.blade))).multiply(referenceHandQ).normalize();
        wrist.copy(palmLocal).applyQuaternion(desiredHandQ);
        wrist.subVectors(wantedGrip, wrist);
        target.position.copy(model.worldToLocal(wrist.clone()));
        target.updateMatrixWorld(true);
        solver.update();
        hand.parent.getWorldQuaternion(parentQ).invert();
        hand.quaternion.copy(parentQ.multiply(desiredHandQ)).normalize();
        model.updateMatrixWorld(true);
        if (meta.name === "Blade_FinishSheath_v020") {
          const amount = THREE.MathUtils.smoothstep(t, 0, 0.14);
          wantedGrip.copy(readyGrip).add(v.set(0.18, -0.225, -0.13));
          wantedGrip.lerpVectors(leftReadyGrip, wantedGrip.clone(), amount);
          wrist.copy(leftPalmLocal).applyQuaternion(leftReferenceQ);
          wrist.subVectors(wantedGrip, wrist);
          leftTarget.position.copy(model.worldToLocal(wrist.clone()));
          leftTarget.updateMatrixWorld(true);
          leftSolver.update();
          leftHand.parent.getWorldQuaternion(parentQ).invert();
          leftHand.quaternion.copy(parentQ.multiply(leftReferenceQ)).normalize();
          warmLeftArm = leftArm.quaternion.clone();
          warmLeftFore = leftFore.quaternion.clone();
          model.updateMatrixWorld(true);
        }
        for (const bone of outputBones) {
          const output = values.get(bone.name), rotation = bone.quaternion.clone().normalize();
          if (output.length && rotation.dot(new THREE.Quaternion().fromArray(output, output.length - 4)) < 0) rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
          output.push(...rotation.toArray());
        }
      }
      if (meta.loop) for (const value of values.values()) for (let i = 0; i < 4; i++) value[value.length - 4 + i] = value[i];
      const clip = new THREE.AnimationClip(meta.name, meta.duration, outputBones.map((bone) => new THREE.QuaternionKeyframeTrack(bone.name + ".quaternion", times, values.get(bone.name))));
      Object.assign(clip, { userData: { bladeV020: meta } });
      result.push(clip);
    }
    return result;
  } finally {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    target.removeFromParent();
    leftTarget.removeFromParent();
    proxy.skeleton.dispose();
    proxy.geometry.dispose();
    for (const material of Array.isArray(proxy.material) ? proxy.material : [proxy.material]) material.dispose();
    for (const item of saved) {
      item.bone.position.copy(item.p);
      item.bone.quaternion.copy(item.q);
      item.bone.scale.copy(item.s);
    }
    model.updateMatrixWorld(true);
  }
}
export {
  BLADE_MOTION_V020,
  BLADE_V020_CLIP_NAMES,
  createBladeMotionV020Clips,
  createBladeReadyReferenceV020,
  isBladeV020UpperBone
};
