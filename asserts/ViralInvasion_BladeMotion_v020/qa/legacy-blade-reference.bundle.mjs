// src/render/bladeAnimationClips.ts
import * as THREE from "three";
var BLADE_CLIP_NAMES = ["Blade_Ready", "Blade_Slash_Right", "Blade_Slash_Left", "Blade_Finish", "Blade_Dash"];
function createBladeClips(reference) {
  const readyOffsets = {
    mixamorigRightArm: [-0.12, -0.22, -0.18],
    mixamorigRightForeArm: [0.05, 0.35, 0.05],
    mixamorigRightHand: [0.04, 0.12, 0.12],
    mixamorigLeftArm: [0.15, -0.35, -0.18],
    mixamorigLeftForeArm: [0, -0.45, 0],
    mixamorigSpine2: [0, -0.08, 0]
  };
  return BLADE_CLIP_NAMES.map((name) => {
    const duration = name === "Blade_Ready" ? 1 : name === "Blade_Finish" ? 20 / 60 : 0.18;
    const times = name === "Blade_Ready" ? [0, duration] : [0, 1 / 60, duration];
    const tracks = reference.tracks.map((track) => {
      const sampled = Array.from(track.InterpolantFactoryMethodLinear().evaluate(0));
      const bone = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
      const offset = readyOffsets[bone];
      if (!track.name.endsWith(".quaternion")) {
        const copy = track.clone();
        copy.times = new Float32Array(times);
        copy.values = new Float32Array(times.flatMap(() => sampled));
        return copy;
      }
      const base = new THREE.Quaternion().fromArray(sampled), values = [];
      for (let i = 0; i < times.length; i++) {
        const angles = offset ? [...offset] : [0, 0, 0];
        if (bone === "mixamorigRightArm" || bone === "mixamorigRightForeArm" || bone === "mixamorigSpine2") {
          const power = bone === "mixamorigRightArm" ? 1 : bone === "mixamorigRightForeArm" ? 0.55 : 0.16;
          const right = name === "Blade_Slash_Left" ? -1 : 1;
          const swing = name === "Blade_Ready" ? 0 : name === "Blade_Dash" ? -0.3 : [0, 1, 0.12][i];
          angles[1] += swing * right * power * (name === "Blade_Finish" ? 1.8 : 1.3);
          angles[2] += swing * power * (name === "Blade_Finish" ? -0.85 : 0.28);
          angles[0] += name === "Blade_Dash" ? -0.35 * power : 0;
        }
        values.push(...base.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(angles[0], angles[1], angles[2]))).normalize().toArray());
      }
      return new THREE.QuaternionKeyframeTrack(track.name, times, values);
    });
    return new THREE.AnimationClip(name, duration, tracks);
  });
}
export {
  BLADE_CLIP_NAMES,
  createBladeClips
};
