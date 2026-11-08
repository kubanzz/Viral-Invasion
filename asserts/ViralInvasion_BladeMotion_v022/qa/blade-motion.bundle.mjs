// asserts/ViralInvasion_BladeMotion_v022/bladeMotion.ts
import * as THREE2 from "three";
import { CCDIKSolver as CCDIKSolver2 } from "three/addons/animation/CCDIKSolver.js";

// asserts/ViralInvasion_BladeMotion_v020/bladeMotion.ts
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
      const frames = Math.ceil(meta.duration * 60), times = Array.from({ length: frames + 1 }, (_, i) => Math.min(meta.duration, i / frames * meta.duration));
      for (const key of KEYS[meta.name]) if (!times.some((t) => Math.abs(t - key.t) < 1e-7)) times.push(key.t);
      times.sort((a, b) => a - b);
      const outputBones = meta.layer === "full" ? bones : bones.filter((bone) => isBladeV020UpperBone(bone.name));
      const values = new Map(outputBones.map((bone) => [bone.name, []]));
      const warmLeftArm = qMap.get(leftArm.name).clone(), warmLeftFore = qMap.get(leftFore.name).clone();
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
          leftArm.quaternion.copy(warmLeftArm);
          leftFore.quaternion.copy(warmLeftFore);
          model.updateMatrixWorld(true);
          wrist.copy(leftPalmLocal).applyQuaternion(leftReferenceQ);
          wrist.subVectors(wantedGrip, wrist);
          leftTarget.position.copy(model.worldToLocal(wrist.clone()));
          leftTarget.updateMatrixWorld(true);
          leftSolver.update();
          leftHand.parent.getWorldQuaternion(parentQ).invert();
          leftHand.quaternion.copy(parentQ.multiply(leftReferenceQ)).normalize();
          warmLeftArm.copy(leftArm.quaternion);
          warmLeftFore.copy(leftFore.quaternion);
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

// asserts/ViralInvasion_BladeMotion_v022/bladeMotion.ts
var BLADE_MOTION_V022 = {
  version: "0.22.0",
  fps: 60,
  rig: "accepted medic / mixamorig / 53 skin joints",
  eyeCapability: {
    eyeBones: false,
    eyelidBones: false,
    morphTargets: false,
    available: ["mixamorigNeck", "mixamorigHead"],
    limitation: "Neck/head pitch conveys intention only. Closed/open eyes must be rendered by the separate screen close-up; no eyelid deformation is authored."
  },
  sequence: {
    drawingSeconds: 3,
    chargeSeconds: 0.65,
    dashSeconds: [0.72, 1.2],
    finishSeconds: 0.3,
    dashClip: "Blade_FourfoldDash_v020",
    chargeToDashAt: 0.65,
    additionalLaunchTransition: false
  },
  clips: [
    {
      name: "Blade_ChargeDraw_v022",
      label: "\u6536\u5200\u84C4\u52BF \xB7 \u62AC\u773C\u62D4\u5200",
      duration: 0.65,
      layer: "full",
      loop: false,
      playback: "once",
      windows: [{ id: "eyes-close-intent", start: 0, end: 0.32 }, { id: "eyes-open-intent", start: 0.32, end: 0.48 }, { id: "unsheath-flash", start: 0.48, end: 0.65 }],
      markers: [
        { time: 0, id: "windup-start", label: "\u7ED8\u7EBF\u7ED3\u675F / \u84C4\u52BF\u5F00\u59CB" },
        { time: 0.18, id: "sheathed-brace", label: "\u8170\u4FA7\u6276\u5200 / \u8EAF\u5E72\u538B\u4F4E" },
        { time: 0.32, id: "eye-open-intent", label: "\u95ED\u773C\u610F\u56FE\u7ED3\u675F / \u5F00\u59CB\u62AC\u773C\uFF08\u7279\u5199\u540C\u6B65\uFF09" },
        { time: 0.48, id: "unsheath-flash", label: "\u7741\u773C\u610F\u56FE\u7ED3\u675F / \u62D4\u5200\u95EA\u5F00\u59CB" },
        { time: 0.65, id: "launch", label: "\u62D4\u5200\u5B8C\u6210 / \u7A7F\u523A\u53D1\u5C04\u8D77\u70B9" }
      ]
    },
    {
      name: "Blade_FinishSettle_v022",
      label: "\u7EC8\u7ED3\u6536\u5200 \xB7 \u6C89\u52BF\u5B9A\u683C",
      duration: 0.3,
      layer: "full",
      loop: false,
      playback: "once-clamp",
      windows: [{ id: "finisher-sync", start: 0.08, end: 0.14 }, { id: "settled-hold", start: 0.24, end: 0.3 }],
      markers: [
        { time: 0, id: "finish-start", label: "\u7A7F\u523A\u7ED3\u675F / \u7EC8\u7ED3\u56DE\u65A9" },
        { time: 0.11, id: "hit", label: "\u7EC8\u7ED3\u8868\u73B0\u547D\u4E2D\u540C\u6B65\u70B9" },
        { time: 0.19, id: "blade-waist", label: "\u5200\u5F52\u8170\u4FA7 / \u5DE6\u624B\u6276\u5200" },
        { time: 0.24, id: "settle", label: "\u91CD\u5FC3\u6C89\u7A33 / \u6536\u52BF\u5B9A\u683C" },
        { time: 0.3, id: "finish-end", label: "\u7EC8\u7ED3\u6536\u52BF\u7ED3\u675F" }
      ]
    }
  ]
};
var BLADE_V022_CLIP_NAMES = BLADE_MOTION_V022.clips.map((clip) => clip.name);
var createBladeReadyReferenceV022 = createBladeReadyReferenceV020;
var p = (t, right, blade, torso, head, left, sink = 0) => ({ t, right, blade, torso, head, left, sink });
var WAIST_R = [0.14, -0.21, -0.12];
var WAIST_L = [0.18, -0.225, -0.13];
var SHEATH = [-0.25, 2.2, -0.05];
var CHARGE_KEYS = [
  p(0, [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, -0.09, -0.02]),
  p(0.18, WAIST_R, SHEATH, [0.16, 0.12, -0.02], [0.16, 0, 0], WAIST_L, 0.026),
  p(0.32, [0.145, -0.215, -0.125], SHEATH, [0.23, 0.13, -0.025], [0.28, -0.02, 0], WAIST_L, 0.038),
  p(0.48, [0.125, -0.2, -0.11], [-0.18, 2.05, -0.04], [0.16, 0.1, -0.02], [-0.14, 0, 0], WAIST_L, 0.03),
  p(0.56, [0.06, -0.105, -0.04], [-0.04, 0.78, -0.02], [0.06, 0.015, 0], [-0.08, 0, 0], [0.12, -0.16, -0.07], 0.01),
  p(0.65, [0.012, -0.055, -0.015], [0.05, -0.015, 0.015], [-0.14, 0, 0.015], [0, 0, 0], [0, 0, 0])
];
var FINISH_KEYS = [
  p(0, [0.012, -0.055, -0.015], [0.05, -0.015, 0.015], [-0.14, 0, 0.015], [0, 0, 0], [0.02, -0.1, -0.03]),
  p(0.065, [-0.025, -0.065, -0.05], [0.07, -1, 0.09], [-0.08, -0.24, -0.05], [-0.09, 0, 0], [0.03, -0.13, -0.04], 0.01),
  p(0.11, [0.075, -0.14, -0.08], [-0.13, 1.1, -0.07], [0.1, 0.19, 0.03], [0.03, 0, 0], [0.13, -0.19, -0.1], 0.02),
  p(0.19, WAIST_R, SHEATH, [0.15, 0.12, 0.02], [0.1, 0, 0], WAIST_L, 0.028),
  p(0.24, WAIST_R, SHEATH, [0.1, 0.1, 0.015], [0, 0, 0], WAIST_L, 0.025),
  p(0.3, WAIST_R, SHEATH, [0.1, 0.1, 0.015], [0, 0, 0], WAIST_L, 0.025)
];
function interpolate(keys, time) {
  const i = keys.findIndex((key) => key.t >= time);
  if (i <= 0) return keys[0];
  const a = keys[i - 1], b = keys[i], u = THREE2.MathUtils.smoothstep(time, a.t, b.t);
  const mix = (field) => a[field].map((v, axis) => THREE2.MathUtils.lerp(v, b[field][axis], u));
  return { t: time, right: mix("right"), blade: mix("blade"), torso: mix("torso"), head: mix("head"), left: mix("left"), sink: THREE2.MathUtils.lerp(a.sink, b.sink, u) };
}
var upper = (name) => /mixamorig(?:Spine|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)/.test(name);
function createBladeMotionV022Clips(model, referenceClips) {
  const bones = [];
  model.traverse((node) => {
    if (node instanceof THREE2.Bone) bones.push(node);
  });
  if (bones.length !== 53) throw new Error("Blade v0.22 requires the accepted medic 53-bone rig.");
  const named = new Map(bones.map((bone2) => [bone2.name, bone2]));
  const bone = (name) => {
    const b = named.get("mixamorig" + name);
    if (!b) throw new Error("Missing medic bone: " + name);
    return b;
  };
  const hips = bone("Hips"), spine = [bone("Spine"), bone("Spine1"), bone("Spine2")], neck = bone("Neck"), head = bone("Head");
  const rh = bone("RightHand"), rm = bone("RightHandMiddle1"), lh = bone("LeftHand"), lm = bone("LeftHandMiddle1");
  const ra = bone("RightArm"), rf = bone("RightForeArm"), la = bone("LeftArm"), lf = bone("LeftForeArm");
  const feet = [bone("LeftFoot"), bone("RightFoot")], legs = [bone("LeftLeg"), bone("RightLeg")], thighs = [bone("LeftUpLeg"), bone("RightUpLeg")];
  const saved = bones.map((b) => ({ bone: b, p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
  const restore = (pose2) => {
    for (const item of pose2) {
      item.bone.position.copy(item.p);
      item.bone.quaternion.copy(item.q);
      item.bone.scale.copy(item.s);
    }
    model.updateMatrixWorld(true);
  };
  const inheritedDash = referenceClips.find((clip) => clip.name === "Blade_FourfoldDash_v020") ?? createBladeMotionV020Clips(model, referenceClips).find((clip) => clip.name === "Blade_FourfoldDash_v020");
  const targets = Array.from({ length: 4 }, (_, i) => {
    const b = new THREE2.Bone();
    b.name = "BladeV022BakeTarget" + i;
    model.add(b);
    return b;
  });
  const proxy = new THREE2.SkinnedMesh();
  proxy.skeleton = new THREE2.Skeleton([...bones, ...targets]);
  const armChain = (hand, fore, arm, index) => ({
    target: bones.length + index,
    effector: bones.indexOf(hand),
    links: [{ index: bones.indexOf(fore) }, { index: bones.indexOf(arm) }],
    iteration: 18,
    maxAngle: 0.18
  });
  const rightIK = new CCDIKSolver2(proxy, [armChain(rh, rf, ra, 0)]), leftIK = new CCDIKSolver2(proxy, [armChain(lh, lf, la, 1)]);
  const legIK = new CCDIKSolver2(proxy, feet.map((foot, i) => ({
    target: bones.length + i + 2,
    effector: bones.indexOf(foot),
    links: [{ index: bones.indexOf(legs[i]) }, { index: bones.indexOf(thighs[i]) }],
    iteration: 12,
    maxAngle: 0.12
  })));
  const mixer = new THREE2.AnimationMixer(model);
  try {
    const dash = inheritedDash;
    const idle = referenceClips.find((clip) => clip.name === "Idle_Subtle");
    if (!idle) throw new Error("Idle_Subtle reference missing.");
    const lower = idle.clone();
    lower.tracks = lower.tracks.filter((track) => !upper(THREE2.PropertyBinding.parseTrackName(track.name).nodeName));
    const ready = createBladeReadyReferenceV022(referenceClips);
    ready.tracks = ready.tracks.filter((track) => upper(THREE2.PropertyBinding.parseTrackName(track.name).nodeName));
    mixer.clipAction(lower).play();
    mixer.clipAction(ready).play();
    mixer.setTime(0);
    model.updateMatrixWorld(true);
    const reference = bones.map((b) => ({ bone: b, p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() })), refs = new Map(reference.map((item) => [item.bone.name, item]));
    const contact = (hand, finger) => hand.getWorldPosition(new THREE2.Vector3()).lerp(finger.getWorldPosition(new THREE2.Vector3()), 0.45);
    const readyRight = contact(rh, rm), readyLeft = contact(lh, lm), rq = rh.getWorldQuaternion(new THREE2.Quaternion()), lq = lh.getWorldQuaternion(new THREE2.Quaternion());
    const rp = rh.worldToLocal(readyRight.clone()), lp = lh.worldToLocal(readyLeft.clone());
    const fixedFeet = feet.map((f) => ({ p: f.getWorldPosition(new THREE2.Vector3()), q: f.getWorldQuaternion(new THREE2.Quaternion()) }));
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    const dashPose = /* @__PURE__ */ new Map();
    for (const track of dash.tracks) if (track.name.endsWith(".quaternion")) dashPose.set(THREE2.PropertyBinding.parseTrackName(track.name).nodeName, new THREE2.Quaternion().fromArray(track.InterpolantFactoryMethodLinear().evaluate(0)).normalize());
    const eulerQ = new THREE2.Quaternion(), parentQ = new THREE2.Quaternion(), worldQ = new THREE2.Quaternion(), wrist = new THREE2.Vector3();
    const setOffset = (b, angles) => {
      b.quaternion.copy(refs.get(b.name).q);
      b.updateWorldMatrix(true, false);
      b.getWorldQuaternion(worldQ);
      worldQ.premultiply(eulerQ.setFromEuler(new THREE2.Euler(...angles))).normalize();
      b.parent.getWorldQuaternion(parentQ).invert();
      b.quaternion.copy(parentQ.multiply(worldQ)).normalize();
      b.updateMatrixWorld(true);
    };
    const setTarget = (target, world) => {
      target.position.copy(model.worldToLocal(world.clone()));
      target.updateMatrixWorld(true);
    };
    const handOrientation = (hand, desired) => {
      hand.parent.getWorldQuaternion(parentQ).invert();
      hand.quaternion.copy(parentQ.multiply(desired)).normalize();
    };
    const results = [];
    for (const meta of BLADE_MOTION_V022.clips) {
      const charge = meta.name === "Blade_ChargeDraw_v022", keys = charge ? CHARGE_KEYS : FINISH_KEYS;
      const count = Math.ceil(meta.duration * 90), times = Array.from({ length: count + 1 }, (_, i) => i / count * meta.duration);
      for (const key of keys) if (!times.some((time) => Math.abs(time - key.t) < 1e-7)) times.push(key.t);
      times.sort((a, b) => a - b);
      const values = new Map(bones.map((b) => [b.name, []])), positionValues = [];
      const warm = new Map([ra, rf, la, lf, ...thighs, ...legs].map((b) => [b.name, refs.get(b.name).q.clone()]));
      for (const time of times) {
        restore(reference);
        const pose2 = interpolate(keys, time);
        hips.position.y -= pose2.sink;
        for (let i = 0; i < 3; i++) setOffset(spine[i], pose2.torso.map((a) => a * [0.25, 0.35, 0.4][i]));
        setOffset(neck, pose2.head.map((a) => a * 0.4));
        setOffset(head, pose2.head.map((a) => a * 0.6));
        for (const b of [ra, rf, la, lf, ...thighs, ...legs]) b.quaternion.copy(warm.get(b.name));
        model.updateMatrixWorld(true);
        for (let i = 0; i < 2; i++) setTarget(targets[i + 2], fixedFeet[i].p);
        legIK.update();
        model.updateMatrixWorld(true);
        for (let i = 0; i < 2; i++) handOrientation(feet[i], fixedFeet[i].q);
        worldQ.copy(eulerQ.setFromEuler(new THREE2.Euler(...pose2.blade))).multiply(rq).normalize();
        wrist.copy(rp).applyQuaternion(worldQ);
        wrist.subVectors(readyRight.clone().add(new THREE2.Vector3(...pose2.right)), wrist);
        setTarget(targets[0], wrist);
        rightIK.update();
        handOrientation(rh, worldQ);
        model.updateMatrixWorld(true);
        const leftGoal = charge && time < 0.18 ? readyLeft.clone().lerp(readyRight.clone().add(new THREE2.Vector3(...WAIST_L)), THREE2.MathUtils.smoothstep(time, 0, 0.18)) : readyRight.clone().add(new THREE2.Vector3(...pose2.left));
        wrist.copy(lp).applyQuaternion(lq);
        wrist.subVectors(leftGoal, wrist);
        setTarget(targets[1], wrist);
        leftIK.update();
        handOrientation(lh, lq);
        model.updateMatrixWorld(true);
        for (const b of [ra, rf, la, lf, ...thighs, ...legs]) warm.get(b.name).copy(b.quaternion);
        const dashBlend = charge ? THREE2.MathUtils.smoothstep(time, 0.56, 0.65) : 1 - THREE2.MathUtils.smoothstep(time, 0, 0.055);
        if (dashBlend > 0) {
          for (const b of bones) if (dashPose.has(b.name)) b.quaternion.slerp(dashPose.get(b.name), dashBlend).normalize();
          hips.position.lerp(refs.get(hips.name).p, dashBlend);
        }
        for (const b of bones) {
          const out = values.get(b.name), q = b.quaternion.clone().normalize();
          if (out.length && q.dot(new THREE2.Quaternion().fromArray(out, out.length - 4)) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
          out.push(...q.toArray());
        }
        positionValues.push(...hips.position.toArray());
      }
      const tracks = bones.map((b) => new THREE2.QuaternionKeyframeTrack(b.name + ".quaternion", times, values.get(b.name)));
      tracks.push(new THREE2.VectorKeyframeTrack(hips.name + ".position", times, positionValues));
      const clip = new THREE2.AnimationClip(meta.name, meta.duration, tracks);
      Object.assign(clip, { userData: { bladeV022: meta } });
      results.push(clip);
    }
    return results;
  } finally {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    for (const target of targets) target.removeFromParent();
    proxy.skeleton.dispose();
    proxy.geometry.dispose();
    for (const material of Array.isArray(proxy.material) ? proxy.material : [proxy.material]) material.dispose();
    restore(saved);
  }
}
export {
  BLADE_MOTION_V022,
  BLADE_V022_CLIP_NAMES,
  createBladeMotionV022Clips,
  createBladeReadyReferenceV022
};
