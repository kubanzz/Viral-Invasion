import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const qaDirectory = dirname(fileURLToPath(import.meta.url));
export const packageDirectory = resolve(qaDirectory, '..');
export const workspace = resolve(packageDirectory, '../..');
export const heroPath = resolve(workspace, 'asserts/ViralInvasion_Hero3D_v1/model/medic-hero-v1-animated.glb');
export const bladePath = resolve(workspace, 'asserts/ViralInvasion_WeaponUltimates_v1/model/redblade.glb');
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const isUpper = track => /mixamorig(?:Spine|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)/.test(THREE.PropertyBinding.parseTrackName(track.name).nodeName);

/** Keep original animation/geometry bytes. Only disconnect image materials for Node QA. */
export async function loadTexturelessHero(path = heroPath) {
  const original = await readFile(path), jsonSize = original.readUInt32LE(12);
  const source = JSON.parse(original.subarray(20, 20 + jsonSize).toString());
  source.materials = [{ pbrMetallicRoughness: { baseColorFactor: [.8, .85, .8, 1] } }];
  for (const mesh of source.meshes) for (const primitive of mesh.primitives) primitive.material = 0;
  const json = Buffer.from(JSON.stringify(source)), padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const binary = original.subarray(20 + jsonSize), rebuilt = Buffer.alloc(20 + padded.length + binary.length);
  rebuilt.writeUInt32LE(0x46546c67, 0); rebuilt.writeUInt32LE(2, 4); rebuilt.writeUInt32LE(rebuilt.length, 8);
  rebuilt.writeUInt32LE(padded.length, 12); rebuilt.writeUInt32LE(0x4e4f534a, 16); padded.copy(rebuilt, 20); binary.copy(rebuilt, 20 + padded.length);
  const gltf = await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset, rebuilt.byteOffset + rebuilt.byteLength), '');
  gltf.scene.position.y += .023; gltf.scene.updateMatrixWorld(true);
  return { ...gltf, sourceSha256: hash(original), sourceBytes: original.length };
}

export async function loadRigidBlade() {
  const bytes = await readFile(bladePath);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { ...gltf, sourceSha256: hash(bytes), sourceBytes: bytes.length };
}

export async function loadTsModule(path, outputName) {
  const result = await build({ entryPoints: [path], bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node22', write: false });
  const output = resolve(qaDirectory, outputName);
  await writeFile(output, result.outputFiles[0].text);
  return import(pathToFileURL(output).href + '?sha=' + hash(result.outputFiles[0].contents));
}

export function snapshotRig(model) {
  const result = [];
  model.traverse(node => { if (node instanceof THREE.Bone) result.push({ node, p: node.position.clone(), q: node.quaternion.clone(), s: node.scale.clone() }); });
  return result;
}
export function restoreRig(snapshot) {
  for (const { node, p, q, s } of snapshot) { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(s); }
}

/** Reproduce the current production socket calibration, without changing source files. */
export async function calibratedBladeSocket(model, sourceClips) {
  const legacy = await loadTsModule(resolve(workspace, 'src/render/bladeAnimationClips.ts'), 'legacy-blade-reference.bundle.mjs');
  const pistol = sourceClips.find(clip => clip.name === 'Pistol_Idle');
  const ready = legacy.createBladeClips(pistol).find(clip => clip.name === 'Blade_Ready');
  const idle = sourceClips.find(clip => clip.name === 'Idle_Subtle');
  const lower = idle.clone(); lower.tracks = lower.tracks.filter(track => !isUpper(track));
  const upper = ready.clone(); upper.tracks = upper.tracks.filter(isUpper);
  const before = snapshotRig(model), mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(lower).play(); mixer.clipAction(upper).play(); mixer.setTime(0); model.updateMatrixWorld(true);
  const hand = model.getObjectByName('mixamorigRightHand'), finger = model.getObjectByName('mixamorigRightHandMiddle1');
  const palm = hand.getWorldPosition(new THREE.Vector3()).lerp(finger.getWorldPosition(new THREE.Vector3()), .45);
  const socket = new THREE.Group(); socket.name = 'v020-qa-same-production-blade-socket'; socket.position.copy(palm);
  hand.attach(socket);
  const blade = await loadRigidBlade(); socket.add(blade.scene);
  const tip = blade.scene.getObjectByName('bladeTip') ?? blade.scene.getObjectByName('muzzle');
  const grip = blade.scene.getObjectByName('grip');
  if (!tip || !grip) throw new Error('Actual redblade lacks grip or blade tip node');
  const localQuaternion = socket.quaternion.toArray(), localPosition = socket.position.toArray();
  mixer.stopAllAction(); mixer.uncacheRoot(model); restoreRig(before); model.updateMatrixWorld(true);
  return { socket, tip, grip, hand, finger, blade, ready, lower, localQuaternion, localPosition, referenceWorldGrip: palm.toArray() };
}
