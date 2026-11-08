import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBladeClips, BLADE_CLIP_NAMES } from '../../src/render/bladeAnimationClips';
import { Player3DMotionController } from '../../src/render/player3DMotion';
import { GameSession } from '../../src/game/session';
import { createWeaponCombat } from '../../src/game/weaponSkills';

const directory = 'asserts/ViralInvasion_WeaponUltimates_v1/';
describe('legendary weapon presentation assets', () => {
  it.each(['thunder', 'redblade'] as const)('loads the embedded %s model with genuine anchors and compact geometry', async id => {
    const report = JSON.parse(await readFile(directory + 'model-report.json', 'utf8'));
    const record = report.models[id], bytes = await readFile(directory + record.path);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
    const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
    loaded.scene.updateMatrixWorld(true);
    const grip = loaded.scene.getObjectByName('grip')!, tip = loaded.scene.getObjectByName('muzzle')!;
    expect(grip.getWorldPosition(new THREE.Vector3()).length()).toBeLessThan(1e-8);
    expect(tip.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(id === 'redblade' ? .4 : .19);
    let triangles = 0; const materials = new Set<THREE.Material>();
    loaded.scene.traverse(node => { if (node instanceof THREE.Mesh) {
      const geometry = node.geometry; triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      for (const attribute of Object.values(geometry.attributes) as THREE.BufferAttribute[]) expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) materials.add(m);
      geometry.dispose();
    } });
    expect(triangles).toBe(record.triangles); expect(triangles).toBeLessThanOrEqual(2500); expect(materials.size).toBeLessThanOrEqual(6);
    for (const material of materials) material.dispose();
  });
  it('authors five normalized bone clips with contact already visible in the first simulation step and a later follow-through', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, .2, .3));
    const reference = new THREE.AnimationClip('Pistol_Idle', 1, ['mixamorigRightArm', 'mixamorigSpine2'].map(name =>
      new THREE.QuaternionKeyframeTrack(name + '.quaternion', [0, 1], [...q.toArray(), ...q.toArray()])));
    const clips = createBladeClips(reference);
    expect(clips.map(clip => clip.name)).toEqual([...BLADE_CLIP_NAMES]);
    for (const clip of clips) for (const track of clip.tracks) {
      for (let n = 0; n < track.values.length; n += 4) expect(new THREE.Quaternion().fromArray(track.values, n).length()).toBeCloseTo(1, 6);
      expect(track.times[0]).toBe(0); expect(track.times.at(-1)).toBeCloseTo(clip.duration);
    }
    const readyArm = new THREE.Quaternion().fromArray(clips[0].tracks[0].InterpolantFactoryMethodLinear().evaluate(0));
    for (const clip of clips.slice(1)) {
      const arm = clip.tracks[0].InterpolantFactoryMethodLinear();
      // A hit must not wait for a newly inserted wind-up after the damage receipt.
      const contact = new THREE.Quaternion().fromArray(arm.evaluate(0));
      const firstStep = new THREE.Quaternion().fromArray(arm.evaluate(1 / 60));
      expect(readyArm.angleTo(contact)).toBeGreaterThan(.12);
      expect(readyArm.angleTo(firstStep)).toBeGreaterThan(.12);
      expect(clip.tracks[0].times.length).toBeGreaterThan(3);
      const settled = new THREE.Quaternion().fromArray(arm.evaluate(clip.duration));
      expect(settled.angleTo(readyArm)).toBeLessThan(contact.angleTo(readyArm));
    }
    expect(clips[1].tracks[0].values).not.toEqual(clips[2].tracks[0].values);
  });
  it.each([1, 2, 3])('selects a real blade animation for combo %s and freezes its age on pause', combo => {
    const session = new GameSession(71); session.start(); const s = session.state;
    s.weaponCombat = createWeaponCombat({ weaponId: 'redblade', rarity: 'gold', upgrade: 0 });
    s.events = [{ type: 'WEAPON_MELEE_SWING', tick: s.tick, data: { weaponId: 'redblade', combo, castId: 'presentation-test' } }];
    const motion = new Player3DMotionController(); motion.observe(s);
    const view = motion.sample(s); expect(view.upperClip).toBe(combo === 1 ? 'Blade_Slash_Right' : combo === 2 ? 'Blade_Slash_Left' : 'Blade_Finish');
    s.phase = 'paused'; s.visualTime = s.elapsed + 99;
    expect(motion.sample(s).upperEvent?.age).toBe(view.upperEvent?.age);
    expect(motion.sample(s).upperClip).not.toContain('Pistol');
  });
});
