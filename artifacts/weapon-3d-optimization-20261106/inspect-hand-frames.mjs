import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Geometry/animation-only loader for offline coordinate inspection, not a game loader.
const bytes = await readFile('asserts/ViralInvasion_Hero3D_v1/model/medic-hero-v1-animated.glb');
const jsonSize = bytes.readUInt32LE(12), source = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
source.materials = [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }];
for (const mesh of source.meshes) for (const primitive of mesh.primitives) primitive.material = 0;
const text = Buffer.from(JSON.stringify(source)), padded = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
const binaryChunk = bytes.subarray(20 + jsonSize), rebuilt = Buffer.alloc(20 + padded.length + binaryChunk.length);
rebuilt.writeUInt32LE(0x46546c67, 0); rebuilt.writeUInt32LE(2, 4); rebuilt.writeUInt32LE(rebuilt.length, 8);
rebuilt.writeUInt32LE(padded.length, 12); rebuilt.writeUInt32LE(0x4e4f534a, 16); padded.copy(rebuilt, 20); binaryChunk.copy(rebuilt, 20 + padded.length);
const loaded = await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset, rebuilt.byteOffset + rebuilt.byteLength), '');
const model = loaded.scene, mixer = new THREE.AnimationMixer(model), result = [];
for (const clipName of ['Pistol_Idle', 'Pistol_Shoot', 'Bow Pull Back', 'Bow Pull Hold', 'Bow Release']) {
  const clip = loaded.animations.find(clip => clip.name === clipName);
  for (const phase of [0, .5, .999]) {
    mixer.stopAllAction(); const action = mixer.clipAction(clip).reset().play(); mixer.setTime(clip.duration * phase); model.updateMatrixWorld(true);
    const bones = {};
    for (const name of ['RightHand', 'RightHandMiddle1', 'LeftHand', 'LeftHandMiddle1', 'RightForeArm', 'RightArm']) {
      const bone = model.getObjectByName('mixamorig' + name), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      bone.matrixWorld.decompose(p, q, s); bones[name] = { p: p.toArray(), q: q.toArray(), scale: s.toArray() };
    }
    result.push({ clipName, phase, bones }); action.stop();
  }
}
await writeFile('artifacts/weapon-3d-optimization-20261106/hand-frames.json', JSON.stringify(result, null, 2));
for (const item of result) console.log(item.clipName, item.phase, JSON.stringify({ R: item.bones.RightHand, L: item.bones.LeftHand }));
