import * as THREE from 'three';

export const BLADE_CLIP_NAMES = ['Blade_Ready', 'Blade_Slash_Right', 'Blade_Slash_Left', 'Blade_Finish', 'Blade_Dash'] as const;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Contact is already visible at receipt time. The following keys add follow-through
 * and a soft recoil; they never postpone the authoritative hit for a wind-up. */
export function bladeActionEnvelope(progress: number): number {
  const p = clamp(progress), keys = [[0, .78], [.13, 1.06], [.4, .42], [.72, -.06], [1, 0]];
  for (let i = 1; i < keys.length; i++) if (p <= keys[i][0]) {
    const t = (p - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]);
    const smooth = t * t * (3 - 2 * t);
    return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * smooth;
  }
  return 0;
}
/** Small additive yaw only: the locomotion mixer retains hip translation and leg tracks. */
export function bladeHipTwist(clip: string | undefined, age: number, duration: number, moving = false): number {
  if (!clip || !Number.isFinite(age) || !Number.isFinite(duration) || duration <= 0 || age < 0 || age >= duration) return 0;
  if (!['Blade_Slash_Right', 'Blade_Slash_Left', 'Blade_Finish', 'Blade_Dash'].includes(clip)) return 0;
  const direction = clip === 'Blade_Slash_Left' ? -1 : 1;
  return bladeActionEnvelope(age / duration) * direction * (clip === 'Blade_Finish' ? .24 : clip === 'Blade_Dash' ? .07 : .17) * (moving ? .45 : 1);
}
/** Authored on the existing medic rig. These are real bone clips, not a rotated weapon sprite. */
export function createBladeClips(reference: THREE.AnimationClip): THREE.AnimationClip[] {
  const readyOffsets: Record<string, [number, number, number]> = {
    mixamorigRightArm: [-.12, -.22, -.18], mixamorigRightForeArm: [.05, .35, .05],
    mixamorigRightHand: [.04, .12, .12], mixamorigLeftArm: [.15, -.35, -.18],
    mixamorigLeftForeArm: [0, -.45, 0], mixamorigSpine2: [.025, -.1, -.015],
    mixamorigSpine: [0, .035, 0], mixamorigRightShoulder: [0, -.065, -.025],
    mixamorigLeftShoulder: [0, .04, .025],
  };
  return BLADE_CLIP_NAMES.map(name => {
    const duration = name === 'Blade_Ready' ? 1 : name === 'Blade_Finish' ? 20 / 60 : .18;
    const fractions = name === 'Blade_Ready' ? [0, .25, .5, .75, 1] : [0, .13, .4, .72, 1];
    const times = fractions.map(p => p * duration);
    const tracks = reference.tracks.map(track => {
      const interpolant = track.InterpolantFactoryMethodLinear();
      const sampled = Array.from(interpolant.evaluate(0));
      const bone = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
      const offset = readyOffsets[bone];
      if (!track.name.endsWith('.quaternion')) {
        const copy = track.clone(); copy.times = new Float32Array(times); copy.values = new Float32Array(times.flatMap(() => sampled)); return copy;
      }
      const values: number[] = [];
      for (let i = 0; i < times.length; i++) {
        const p = fractions[i];
        // Preserve the source idle's breathing rather than freezing every joint
        // on its first frame for a full second.
        const base = new THREE.Quaternion().fromArray(name === 'Blade_Ready'
          ? Array.from(interpolant.evaluate(p === 1 ? 0 : p * Math.max(.001, reference.duration))) : sampled);
        const angles = offset ? [...offset] : [0, 0, 0];
        const powers: Record<string, number> = { mixamorigRightArm: 1, mixamorigRightForeArm: .55, mixamorigRightHand: .16,
          mixamorigSpine2: .19, mixamorigSpine: .1, mixamorigRightShoulder: .22, mixamorigLeftShoulder: -.12,
          mixamorigLeftArm: -.14, mixamorigHips: -.09 };
        const power = powers[bone];
        if (power !== undefined) {
          const right = name === 'Blade_Slash_Left' ? -1 : 1;
          const swing = name === 'Blade_Ready' ? 0 : name === 'Blade_Dash' ? -.3 * (1 - p) : bladeActionEnvelope(p);
          angles[1] += swing * right * power * (name === 'Blade_Finish' ? 1.8 : 1.3);
          angles[2] += swing * power * (name === 'Blade_Finish' ? -.85 : .28);
          angles[0] += name === 'Blade_Dash' ? -.35 * power * (1 - p) : -.09 * swing * power;
        }
        values.push(...base.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(angles[0], angles[1], angles[2]))).normalize().toArray());
      }
      return new THREE.QuaternionKeyframeTrack(track.name, times, values);
    });
    return new THREE.AnimationClip(name, duration, tracks);
  });
}
