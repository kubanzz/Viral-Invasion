import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const directory = 'asserts/ViralInvasion_Weapons3D_v1/';
const manifest = JSON.parse(await readFile(directory + 'manifest.json', 'utf8')) as {
  models: Record<'steady' | 'piercing', { path: string; sha256: string; bytes: number; triangles: number; meshCount: number;
    materials: string[]; bounds: { size: number[] }; nodes: Record<string, number[]> }>;
};

describe('portable rigid held weapon assets', () => {
  it.each(['steady', 'piercing'] as const)('round-trips the actual %s GLB with complete sockets and bounded geometry', async id => {
    const expected = manifest.models[id], bytes = await readFile(directory + expected.path);
    expect(bytes.length).toBe(expected.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected.sha256);
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67); expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length); expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
    const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as {
      buffers: { uri?: string }[]; images?: unknown[]; skins?: unknown[]; animations?: unknown[];
    };
    expect(document.buffers).toHaveLength(1); expect(document.buffers[0].uri).toBeUndefined();
    expect(document.images ?? []).toEqual([]); expect(document.skins ?? []).toEqual([]); expect(document.animations ?? []).toEqual([]);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const gltf = await new GLTFLoader().parseAsync(buffer, ''), root = gltf.scene;
    root.updateMatrixWorld(true);
    let triangles = 0, meshes = 0;
    const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      expect(node instanceof THREE.SkinnedMesh).toBe(false); meshes++;
      const geometry = node.geometry, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
      geometries.add(geometry);
      expect(position.count).toBeGreaterThan(0); expect(normal.count).toBe(position.count);
      for (const attribute of [position, normal]) for (const value of attribute.array) expect(Number.isFinite(value)).toBe(true);
      const index = geometry.index;
      if (!index) throw new Error('Expected compact indexed weapon geometry');
      expect(index.count % 3).toBe(0); triangles += index.count / 3;
      for (const value of index.array) { expect(Number.isSafeInteger(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThan(position.count); }
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    });
    expect(meshes).toBe(expected.meshCount); expect(meshes).toBeGreaterThan(0); expect(meshes).toBeLessThanOrEqual(6);
    expect(triangles).toBe(expected.triangles); expect(triangles).toBeGreaterThan(300); expect(triangles).toBeLessThanOrEqual(2500);
    expect([...materials].map(material => material.name).sort()).toEqual([...expected.materials].sort());
    expect(materials.size).toBeLessThanOrEqual(6);
    for (const [name, coordinates] of Object.entries(expected.nodes)) {
      const socket = root.getObjectByName(name); expect(socket, 'Missing actual GLB node ' + name).toBeDefined();
      const actual = socket!.getWorldPosition(new THREE.Vector3()).toArray();
      actual.forEach((value, index) => expect(value).toBeCloseTo(coordinates[index], 6));
    }
    const grip = root.getObjectByName('grip')!.getWorldPosition(new THREE.Vector3());
    const muzzle = root.getObjectByName('muzzle')!.getWorldPosition(new THREE.Vector3());
    expect(grip.length()).toBeLessThan(1e-7); expect(muzzle.z).toBeGreaterThan(.04);
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    size.toArray().forEach((value, index) => expect(value).toBeCloseTo(expected.bounds.size[index], 6));
    if (id === 'steady') {
      // Catch model-unit mistakes that recreate a head-sized, face-covering gun.
      expect(size.z).toBeGreaterThan(.19); expect(size.z).toBeLessThan(.29); expect(size.x).toBeLessThan(.1); expect(size.y).toBeLessThan(.14);
    } else {
      expect(size.y).toBeGreaterThan(.4); expect(size.y).toBeLessThan(.55); expect(size.x).toBeLessThan(.06);
      const top = root.getObjectByName('stringTop')!.getWorldPosition(new THREE.Vector3());
      const bottom = root.getObjectByName('stringBottom')!.getWorldPosition(new THREE.Vector3());
      const center = root.getObjectByName('stringCenter')!.getWorldPosition(new THREE.Vector3());
      expect(top.y).toBeGreaterThan(.18); expect(bottom.y).toBeLessThan(-.18); expect(center.z).toBeLessThan(-.03);
    }
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
  });
});
