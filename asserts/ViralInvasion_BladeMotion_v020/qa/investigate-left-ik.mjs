import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { packageDirectory, qaDirectory, hash, loadTsModule, loadTexturelessHero, calibratedBladeSocket, isUpper } from './rig-tools.mjs';

const path = resolve(packageDirectory, 'bladeMotion.ts'), original = await readFile(path, 'utf8');
const begin = 'for (const meta of BLADE_MOTION_V020.clips) {';
const seed = 'delta(leftArm, authored.leftArm); delta(leftFore, authored.leftFore);';
const after = 'leftHand.quaternion.copy(parentQ.multiply(leftReferenceQ)).normalize();';
if (![begin, seed, after].every(pattern => original.includes(pattern))) throw new Error('Module changed; review the experiment adaptation before running');
const code = original.replace(begin, begin + '\n      let warmLeftArm: THREE.Quaternion | undefined, warmLeftFore: THREE.Quaternion | undefined;')
  .replace(seed, seed + '\n        if (meta.name === "Blade_FinishSheath_v020" && warmLeftArm && warmLeftFore) { leftArm.quaternion.copy(warmLeftArm); leftFore.quaternion.copy(warmLeftFore); }')
  .replace(after, after + '\n          warmLeftArm = leftArm.quaternion.clone(); warmLeftFore = leftFore.quaternion.clone();');
const experimental = resolve(qaDirectory, 'warm-left-investigation.ts'); await writeFile(experimental, code);
const module = await loadTsModule(experimental, 'warm-left-investigation.bundle.mjs');
const hero = await loadTexturelessHero(), clips = module.createBladeMotionV020Clips(hero.scene, hero.animations);
const clip = clips.find(clip => clip.name === 'Blade_FinishSheath_v020');
let max = { degrees: 0, bone: '', time: 0 };
for (const track of clip.tracks) for (let i = 4; i < track.values.length; i += 4) {
  const step = new THREE.Quaternion().fromArray(track.values, i - 4).normalize().angleTo(new THREE.Quaternion().fromArray(track.values, i).normalize()) * 180 / Math.PI;
  if (step > max.degrees) max = { degrees: step, bone: track.name, time: track.times[i / 4] };
}
const calibrated = await calibratedBladeSocket(hero.scene, hero.animations), mixer = new THREE.AnimationMixer(hero.scene);
mixer.clipAction(calibrated.lower).setEffectiveTimeScale(0).play();
const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play(); action.clampWhenFinished = true;
mixer.setTime(clip.duration); hero.scene.updateMatrixWorld(true);
const rightPalm = calibrated.grip.getWorldPosition(new THREE.Vector3());
const leftPalm = hero.scene.getObjectByName('mixamorigLeftHand').getWorldPosition(new THREE.Vector3()).lerp(hero.scene.getObjectByName('mixamorigLeftHandMiddle1').getWorldPosition(new THREE.Vector3()), .45);
const report = { methodology: 'In-memory source copy warm-starts the left arm/forearm only during the sheath bake; production module is not modified.', sourceSha256: hash(original),
  maximumAdjacentJointStep: max, finalRightPalm: rightPalm.toArray(), finalLeftPalm: leftPalm.toArray(), finalPalmGap: rightPalm.distanceTo(leftPalm) };
await writeFile(resolve(qaDirectory, 'warm-left-investigation.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
