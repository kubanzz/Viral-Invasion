import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { packageDirectory, qaDirectory, hash, loadTexturelessHero, loadTsModule } from './rig-tools.mjs';

const source = resolve(packageDirectory, 'bladeMotion.ts'), module = await loadTsModule(source, 'blade-motion.bundle.mjs');
const gltf = await loadTexturelessHero(), clips = module.createBladeMotionV022Clips(gltf.scene, gltf.animations);
const authored = clips.map(clip => { const { uuid, ...entry } = THREE.AnimationClip.toJSON(clip); return entry; });
const output = Buffer.from(JSON.stringify({ sourceHeroSha256: gltf.sourceSha256, metadata: module.BLADE_MOTION_V022, clips: authored }, null, 2) + '\n');
await writeFile(resolve(qaDirectory, 'blade-motion-clips.json'), output);
const decoded = JSON.parse(output), restoredClips = decoded.clips.map(entry => THREE.AnimationClip.parse(entry));
const roundtrip = [];
for (const original of clips) {
  const recovered = restoredClips.find(clip => clip.name === original.name);
  if (!recovered || original.duration !== recovered.duration || original.tracks.length !== recovered.tracks.length) throw new Error('Animation JSON clip shape changed.');
  const restoredTracks = new Map(recovered.tracks.map(track => [track.name, track]));
  let maximumQuaternionDegrees = 0, maximumScalarDifference = 0;
  for (const track of original.tracks) {
    const actual = restoredTracks.get(track.name);
    if (!actual) throw new Error('JSON bone binding changed: ' + track.name);
    for (const phase of [0, .2, .4, .5, .8, 1]) {
      const t = original.duration * phase, a = track.InterpolantFactoryMethodLinear().evaluate(t), b = actual.InterpolantFactoryMethodLinear().evaluate(t);
      if (track.name.endsWith('.quaternion')) maximumQuaternionDegrees = Math.max(maximumQuaternionDegrees, new THREE.Quaternion().fromArray(a).normalize().angleTo(new THREE.Quaternion().fromArray(b).normalize()) * 180 / Math.PI);
      else for (let i = 0; i < a.length; i++) maximumScalarDifference = Math.max(maximumScalarDifference, Math.abs(a[i] - b[i]));
    }
  }
  if (maximumQuaternionDegrees > .0001 || maximumScalarDifference > 1e-7) throw new Error('Animation JSON changed sampled transforms.');
  roundtrip.push({ name: original.name, duration: original.duration, tracks: original.tracks.length, boneBindingsUnchanged: true, maximumQuaternionDegrees, maximumScalarDifference });
}
const report = { status: 'passed', generatorSha256: hash(await readFile(source)), sourceHeroSha256: gltf.sourceSha256,
  json: { path: 'qa/blade-motion-clips.json', bytes: output.length, sha256: hash(output), loader: 'THREE.AnimationClip.parse(entry)' },
  newGlbCreated: false, newMeshCreated: false, roundtrip,
  note: 'Only portable JSON animation data is exported. Existing source medic and redblade GLBs are read, never rewritten or copied into this increment.' };
await writeFile(resolve(qaDirectory, 'export-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
