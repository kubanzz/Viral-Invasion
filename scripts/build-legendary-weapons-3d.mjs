import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const output = 'asserts/ViralInvasion_WeaponUltimates_v1';
const materials = {
  ivory: new THREE.MeshStandardMaterial({ name: 'painted-ivory', color: '#eee4cc', roughness: .72 }),
  grip: new THREE.MeshStandardMaterial({ name: 'ink-teal', color: '#294c56', roughness: .8 }),
  gold: new THREE.MeshStandardMaterial({ name: 'warm-satin-gold', color: '#c39c58', roughness: .48, metalness: .25 }),
  mint: new THREE.MeshStandardMaterial({ name: 'mint-conductor', color: '#8ee4d5', emissive: '#46a995', emissiveIntensity: .25 }),
  violet: new THREE.MeshStandardMaterial({ name: 'violet-thunder-core', color: '#aa93dd', emissive: '#7060a9', emissiveIntensity: .32 }),
  coral: new THREE.MeshStandardMaterial({ name: 'coral-blade-edge', color: '#ef8d80', emissive: '#a94a41', emissiveIntensity: .15 }),
};
class Authoring {
  root = new THREE.Group(); bins = new Map();
  add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    const bin = this.bins.get(material) ?? []; bin.push(plain); this.bins.set(material, bin);
  }
  mark(name, position) { const point = new THREE.Object3D(); point.name = name; point.position.set(...position); this.root.add(point); }
  finish() {
    for (const [key, geometries] of this.bins) {
      const merged = mergeGeometries(geometries), geometry = mergeVertices(merged);
      const mesh = new THREE.Mesh(geometry, materials[key]); mesh.name = key + '-surface'; this.root.add(mesh);
      merged.dispose(); for (const part of geometries) part.dispose();
    }
    return this.root;
  }
}
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const sphere = (radius) => new THREE.IcosahedronGeometry(radius, 1);
const ring = (radius, tube = .004) => new THREE.TorusGeometry(radius, tube, 4, 14);

function thunder() {
  const a = new Authoring(); a.root.name = 'thunder-trident-coil-gun';
  a.add(box(.053, .056, .115), 'ivory', [0, .038, .035]);
  a.add(box(.026, .07, .027), 'grip', [0, -.011, -.006], [.25, 0, 0]);
  a.add(box(.063, .009, .09), 'gold', [0, .072, .033]);
  a.add(sphere(.031), 'violet', [0, .045, .113], [0, 0, 0], [1, 1, 1.2]);
  a.add(ring(.039), 'gold', [0, .045, .113]);
  a.add(ring(.036), 'mint', [0, .045, .12], [0, Math.PI / 2, .4]);
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3, x = Math.cos(angle) * .035, y = .045 + Math.sin(angle) * .035;
    a.add(box(.013, .014, .105), 'ivory', [x, y, .145]);
    a.add(box(.016, .017, .011), 'gold', [x, y, .19]);
    a.add(box(.007, .008, .058), 'mint', [x, y, .156]);
  }
  a.add(box(.015, .014, .03), 'gold', [0, .091, -.005]);
  a.add(sphere(.008), 'violet', [0, .091, .018]);
  a.mark('grip', [0, 0, 0]); a.mark('muzzle', [0, .045, .205]); a.mark('offhandGrip', [0, .013, .069]);
  return a.finish();
}
function redblade() {
  const a = new Authoring(); a.root.name = 'redblade-long-cleaver';
  a.add(box(.024, .024, .105), 'grip', [0, 0, .024]);
  for (const z of [-.02, .002, .024, .046, .068]) a.add(box(.026, .027, .006), 'coral', [0, 0, z]);
  a.add(sphere(.018), 'gold', [0, 0, -.037], [0, 0, 0], [.9, .9, .6]);
  a.add(ring(.039, .006), 'gold', [0, 0, .087]);
  a.add(box(.035, .019, .023), 'ivory', [0, 0, .102]);
  const shape = new THREE.Shape();
  shape.moveTo(-.023, .105); shape.lineTo(.022, .105); shape.quadraticCurveTo(.031, .29, .019, .395);
  shape.lineTo(-.012, .46); shape.quadraticCurveTo(-.003, .28, -.023, .105);
  const blade = new THREE.ExtrudeGeometry(shape, { depth: .012, bevelEnabled: false, steps: 1, curveSegments: 5 });
  // Shape X is lateral Y, Shape Y is forward Z. Flat edge is easy to read in the angled camera.
  blade.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1)); blade.translate(-.006, 0, 0);
  a.add(blade, 'ivory');
  const inset=new THREE.Shape();inset.moveTo(-.014,.13);inset.lineTo(.015,.13);
  inset.quadraticCurveTo(.023,.29,.012,.389);inset.lineTo(-.008,.431);inset.quadraticCurveTo(.003,.28,-.014,.13);
  const coloredFace=new THREE.ExtrudeGeometry(inset,{depth:.013,bevelEnabled:false,steps:1,curveSegments:5});
  coloredFace.applyMatrix4(new THREE.Matrix4().set(0,0,1,0,1,0,0,0,0,1,0,0,0,0,0,1));coloredFace.translate(-.0065,0,0);
  a.add(coloredFace,'coral');
  a.add(box(.014, .007, .25), 'coral', [0, -.021, .245], [.035, 0, 0]);
  a.add(box(.015, .005, .12), 'gold', [0, .018, .169], [-.035, 0, 0]);
  a.mark('grip', [0, 0, 0]); a.mark('muzzle', [0, 0, .46]); a.mark('bladeTip', [0, 0, .46]);
  a.mark('offhandGrip', [0, 0, .04]); return a.finish();
}
await mkdir(output + '/model', { recursive: true });
const exporter = new GLTFExporter(), report = { schemaVersion: 1, authoring: 'Project-authored Three.js rigid geometry; no change to the original hero GLB.', coordinateSystem: { forward: '+Z', up: '+Y', grip: 'origin' }, models: {} };
for (const [id, model] of [['thunder', thunder()], ['redblade', redblade()]]) {
  model.userData = { weaponId: id, role: 'held-weapon', authoring: report.authoring }; model.updateMatrixWorld(true);
  let triangles = 0; const used = new Set(), nodes = {};
  model.traverse(node => {
    if (node instanceof THREE.Mesh) { triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; used.add(node.material.name); }
    else if (node !== model) nodes[node.name] = node.position.toArray();
  });
  if (triangles > 2500 || used.size > 6) throw new Error('Legendary model exceeded budget: ' + id);
  const bytes = Buffer.from(await exporter.parseAsync(model, { binary: true, onlyVisible: false }));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  if (!loaded.scene.getObjectByName('grip') || !loaded.scene.getObjectByName('muzzle')) throw new Error('Missing anchors');
  await writeFile(output + '/model/' + id + '.glb', bytes);
  const bounds = new THREE.Box3().setFromObject(loaded.scene);
  report.models[id] = { path: 'model/' + id + '.glb', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, triangles, materials: [...used], nodes, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
}
await writeFile(output + '/model-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.models, null, 2));
