import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { qaDirectory, packageDirectory, hash, loadTexturelessHero, loadTsModule } from './rig-tools.mjs';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const module = await loadTsModule(resolve(packageDirectory, 'bladeMotion.ts'), 'blade-motion.bundle.mjs');
const gltf = await loadTexturelessHero(), clips = module.createBladeMotionV020Clips(gltf.scene, gltf.animations);
const rig = gltf.scene.clone(true), meshNodes = [];
rig.name = 'ViralInvasion_BladeMotion_v020_AnimationLibrary';
rig.traverse(node => { if (node instanceof THREE.Mesh) meshNodes.push(node); });
for (const node of meshNodes) node.removeFromParent();
rig.updateMatrixWorld(true);
const bytes = Buffer.from(await new GLTFExporter().parseAsync(rig, { animations: clips, binary: true, trs: true, onlyVisible: false }));
const name = 'blade-motion-animation-library.glb'; await writeFile(resolve(qaDirectory, name), bytes);
// UUIDs are runtime identities, not part of the authored motion. Omit them so
// the portable numeric library has a stable content hash on reproduction.
const json = clips.map(clip => { const { uuid, ...authored } = THREE.AnimationClip.toJSON(clip); return authored; });
const jsonBytes = Buffer.from(JSON.stringify({ sourceHeroSha256: gltf.sourceSha256, metadata: module.BLADE_MOTION_V020, clips: json }, null, 2) + '\n');
await writeFile(resolve(qaDirectory, 'blade-motion-clips.json'), jsonBytes);
const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
let meshes = 0, bones = 0; loaded.scene.traverse(node => { if (node instanceof THREE.Mesh) meshes++; if (node instanceof THREE.Bone) bones++; });
if (meshes !== 0 || loaded.animations.length !== 4) throw new Error('Animation-only roundtrip failed');
const roundtrip = [];
for (const original of clips) {
  const restored = loaded.animations.find(clip => clip.name === original.name);
  if (!restored || restored.tracks.length !== original.tracks.length) throw new Error('Animation-only clip/track mismatch');
  let maximumQuaternionDegrees = 0;
  const tracks = new Map(restored.tracks.map(track => [track.name, track]));
  for (const track of original.tracks) {
    const recovered = tracks.get(track.name);
    if (!recovered) throw new Error('Animation-only bone binding changed: ' + track.name);
    for (const phase of [0, .25, .5, .75, 1]) {
      const t = phase * Math.min(original.duration, restored.duration);
      const a = new THREE.Quaternion().fromArray(track.InterpolantFactoryMethodLinear().evaluate(t)).normalize();
      const b = new THREE.Quaternion().fromArray(recovered.InterpolantFactoryMethodLinear().evaluate(t)).normalize();
      maximumQuaternionDegrees = Math.max(maximumQuaternionDegrees, a.angleTo(b) * 180 / Math.PI);
    }
  }
  if (maximumQuaternionDegrees > .0001) throw new Error('Animation-only quaternion roundtrip changed');
  roundtrip.push({ name: original.name, maximumQuaternionDegrees, boneBindingsUnchanged: true });
}
const report = { status: 'passed', sourceHeroSha256: gltf.sourceSha256, generatorSha256: hash(await readFile(resolve(packageDirectory, 'bladeMotion.ts'))),
  json: { path: 'qa/blade-motion-clips.json', bytes: jsonBytes.length, sha256: hash(jsonBytes), loader: 'THREE.AnimationClip.parse(entry)' },
  animationLibrary: { path: 'qa/' + name, bytes: bytes.length, sha256: hash(bytes), clips: loaded.animations.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })),
    meshes, skinCount: 0, roundtrip, note: 'Animation-only scene graph with named rig nodes, no copied body mesh/skin/textures. Import its clips and bind by bone name onto the accepted original medic rig. Nodes may decode as Object3D because this library contains no skin; this does not change clip bone bindings.' } };
await writeFile(resolve(qaDirectory, 'export-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
