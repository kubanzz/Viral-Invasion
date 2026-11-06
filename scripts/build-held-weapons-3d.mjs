import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// The exporter uses the browser FileReader interface for its binary container.
// Node's Blob supplies the same byte operation; no image, browser or network is used.
globalThis.FileReader ??= class FileReader {
  result = null;
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};

const output = 'asserts/ViralInvasion_Weapons3D_v1';
const materials = {
  ceramic: new THREE.MeshStandardMaterial({ name: 'warm-ivory-ceramic', color: '#e7dfc9', roughness: .74, metalness: .04 }),
  mint: new THREE.MeshStandardMaterial({ name: 'mint-energy-enamel', color: '#69bda5', roughness: .48, metalness: .12 }),
  slate: new THREE.MeshStandardMaterial({ name: 'slate-grip-and-bore', color: '#25474b', roughness: .78, metalness: .12 }),
  edge: new THREE.MeshStandardMaterial({ name: 'warm-satin-edge', color: '#ad9972', roughness: .65, metalness: .24 }),
  glow: new THREE.MeshStandardMaterial({ name: 'soft-mint-indicator', color: '#b9f0cd', emissive: '#6ebc96', emissiveIntensity: .3, roughness: .48 }),
  amber: new THREE.MeshStandardMaterial({ name: 'amber-focus', color: '#e6a34d', emissive: '#bd6d1d', emissiveIntensity: .16, roughness: .4, metalness: .15 }),
};

class Authoring {
  root;
  bins = new Map();
  constructor(name) { this.root = new THREE.Group(); this.root.name = name; }
  put(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    geometry.applyMatrix4(matrix);
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    const list = this.bins.get(material) ?? []; list.push(plain); this.bins.set(material, list);
    if (plain !== geometry) geometry.dispose();
  }
  marker(name, position) { const marker = new THREE.Object3D(); marker.name = name; marker.position.set(...position); this.root.add(marker); }
  finish() {
    for (const [material, geometries] of this.bins) {
      const merged = mergeGeometries(geometries, false);
      if (!merged) throw new Error('Could not merge ' + material);
      const geometry = mergeVertices(merged); merged.dispose();
      // Lathe pole rows contain coincident vertices. Drop their zero-area faces.
      const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], edge = new THREE.Vector3(), across = new THREE.Vector3(), cleanIndex = [];
      for (let i = 0; i < geometry.index.count; i += 3) {
        const ids = [geometry.index.getX(i), geometry.index.getX(i + 1), geometry.index.getX(i + 2)];
        ids.forEach((id, j) => points[j].fromBufferAttribute(geometry.attributes.position, id));
        if (edge.subVectors(points[1], points[0]).cross(across.subVectors(points[2], points[0])).lengthSq() > 1e-20) cleanIndex.push(...ids);
      }
      geometry.setIndex(cleanIndex);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, materials[material]); mesh.name = material + '-mesh'; this.root.add(mesh);
      for (const item of geometries) item.dispose();
    }
    return this.root;
  }
}

const lathe = profile => new THREE.LatheGeometry(profile.map(([radius, axis]) => new THREE.Vector2(radius, axis)), 16);
const sleeve = (front, back, radius, lip = .003) => lathe([
  [radius - lip, back], [radius, back + lip], [radius, front - lip], [radius - lip, front],
]);
const receiver = profile => lathe(profile);
const box = (x, y, z, radius = .002) => new RoundedBoxGeometry(x, y, z, 1, radius);
const sphere = (radius, width = 10, height = 5) => new THREE.SphereGeometry(radius, width, height);
function tube(points, radius, segments = 14, sides = 6) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, sides, false);
}
function profileMesh(shape, thickness, bevel = .003, curveSegments = 4) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments, steps: 1 });
  geometry.translate(0, 0, -thickness / 2 + bevel);
  // Authored shape X represents weapon Z. The thickness becomes weapon X.
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

function makeSteady() {
  const a = new Authoring('steady-hive-injector');
  const y = .039;
  // A short tapered energy cylinder, held low enough to leave the visor readable.
  a.put(receiver([[0, -.081], [.018, -.08], [.029, -.07], [.032, -.052], [.032, .071], [.028, .088], [0, .091]]), 'mint', [0, y, 0], [Math.PI / 2, 0, 0]);
  a.put(sleeve(-.052, -.083, .034, .005), 'ceramic', [0, y, 0], [Math.PI / 2, 0, 0]);
  a.put(sleeve(-.047, -.053, .0345, .001), 'edge', [0, y, 0], [Math.PI / 2, 0, 0]);
  a.put(sleeve(.128, .075, .036, .004), 'ceramic', [0, y, 0], [Math.PI / 2, 0, 0]);
  a.put(sleeve(.102, .095, .037, .001), 'slate', [0, y, 0], [Math.PI / 2, 0, 0]);
  a.put(sleeve(.136, .126, .034, .002), 'edge', [0, y, 0], [Math.PI / 2, 0, 0]);
  a.put(new THREE.CylinderGeometry(.029, .029, .004, 16), 'ceramic', [0, y, .135], [Math.PI / 2, 0, 0]);
  // Seven inset bores retain the inspected hive identity without a giant drum.
  const bores = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3) * .0182, Math.sin(i * Math.PI / 3) * .0182])];
  for (const [x, offsetY] of bores) {
    a.put(new THREE.CylinderGeometry(.0065, .0065, .0015, 8), 'slate', [x, y + offsetY, .138], [Math.PI / 2, 0, 0]);
    a.put(new THREE.RingGeometry(.0064, .0075, 8), 'edge', [x, y + offsetY, .139]);
  }
  const grip = new THREE.Shape();
  grip.moveTo(-.022, .034); grip.lineTo(.017, .034); grip.quadraticCurveTo(.014, .012, .007, -.027);
  grip.quadraticCurveTo(.004, -.035, -.006, -.034); grip.lineTo(-.019, -.03); grip.quadraticCurveTo(-.025, -.027, -.022, -.014); grip.closePath();
  a.put(profileMesh(grip, .022, .003, 3), 'slate');
  a.put(box(.023, .008, .031, .002), 'edge', [0, -.031, -.003]);
  a.put(tube([[0, .027, .02], [0, .016, .029], [0, .001, .024], [0, -.002, .011]], .0032, 8), 'ceramic');
  // Raised ceramic spine, inset status strip and restrained rear capsule cap.
  a.put(box(.014, .005, .106), 'ceramic', [0, .071, .007]);
  a.put(box(.008, .003, .047, .001), 'glow', [0, .075, -.003]);
  for (const side of [-1, 1]) {
    a.put(box(.003, .018, .042, .001), 'ceramic', [side * .0315, .039, -.011]);
    a.put(box(.0033, .008, .022, .001), 'mint', [side * .033, .04, -.009]);
  }
  a.marker('grip', [0, 0, 0]);
  a.marker('muzzle', [0, y, .141]);
  a.marker('offhandGrip', [0, .013, .067]);
  return a.finish();
}

function armShape() {
  const s = new THREE.Shape();
  s.moveTo(-.023, .018);
  s.bezierCurveTo(-.063, .049, -.088, .088, -.097, .127);
  s.bezierCurveTo(-.108, .181, -.094, .218, -.066, .239);
  // Recurved blade tip and inner cutting curve; the wide base tapers steadily.
  s.bezierCurveTo(-.071, .201, -.059, .174, -.028, .158);
  s.bezierCurveTo(.018, .135, .032, .1, .016, .065);
  s.bezierCurveTo(.007, .045, .024, .031, .025, .021);
  s.quadraticCurveTo(.008, .007, -.023, .018);
  s.closePath(); return s;
}
function makePiercing() {
  const a = new Authoring('piercing-recurve-blade');
  const shape = armShape();
  a.put(profileMesh(shape, .019, .003, 4), 'ceramic');
  a.put(profileMesh(shape, .019, .003, 4), 'ceramic', [0, 0, 0], [0, 0, Math.PI]);
  // Thin satin bevel accents trace the outer blade; amber veins echo the core.
  for (const sign of [-1, 1]) {
    a.put(tube([[0, sign * .039, -.033], [0, sign * .096, -.079], [0, sign * .16, -.091], [0, sign * .217, -.073]], .0038, 10, 6), 'edge');
    a.put(tube([[.0105, sign * .046, -.011], [.0105, sign * .09, -.012], [.0105, sign * .128, -.032], [.0105, sign * .16, -.063]], .0023, 9, 5), 'amber');
    a.put(tube([[-.0105, sign * .046, -.011], [-.0105, sign * .09, -.012], [-.0105, sign * .128, -.032], [-.0105, sign * .16, -.063]], .0023, 9, 5), 'amber');
    a.put(sphere(.009, 8, 4), 'slate', [0, sign * .221, -.073], [0, 0, 0], [1.05, .7, .7]);
  }
  a.put(box(.026, .069, .034, .004), 'slate', [0, 0, 0]);
  a.put(box(.031, .012, .044, .003), 'ceramic', [0, .034, .002]);
  a.put(box(.031, .012, .044, .003), 'ceramic', [0, -.034, .002]);
  a.put(sphere(.026, 12, 6), 'ceramic', [0, 0, .022], [0, 0, 0], [.66, 1.2, 1]);
  a.put(sphere(.018, 12, 6), 'amber', [0, 0, .044], [0, 0, 0], [.7, 1, .4]);
  a.put(tube([[0, .035, .029], [0, .027, .054], [0, 0, .061], [0, -.027, .054], [0, -.035, .029]], .0028, 12, 5), 'edge');
  a.marker('grip', [0, 0, 0]);
  a.marker('muzzle', [0, 0, .067]);
  a.marker('stringTop', [0, .221, -.073]);
  a.marker('stringBottom', [0, -.221, -.073]);
  a.marker('stringCenter', [0, 0, -.073]);
  a.marker('offhandGrip', [0, 0, -.073]);
  return a.finish();
}

const exporter = new GLTFExporter();
await mkdir(output + '/model', { recursive: true });
const report = { schemaVersion: 1, coordinateSystem: { up: '+Y', forward: '+Z', units: 'hero bind height is approximately 1.0001', grip: 'origin', stringDraw: '-Z' },
  authoring: 'Project-authored rigid low-poly meshes using Three.js standard geometry and GLTFExporter 0.187.0; no third-party weapon model or generated bitmap.',
  sourceReferences: ['asserts/ViralInvasion_Weapons_v2/weapons/steady_v02.png', 'asserts/ViralInvasion_Weapons_v2/weapons/piercing_v02.png'], models: {} };
const validation = { loader: 'Three.js GLTFLoader 0.187.0', results: {} };
for (const [id, model] of [['steady', makeSteady()], ['piercing', makePiercing()]]) {
  model.userData = { role: 'held-weapon', weaponId: id, forward: '+Z', up: '+Y', grip: 'origin', authoring: 'Viral Invasion project-authored mesh' };
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), nodes = {}, materialNames = new Set(); let triangles = 0, meshCount = 0;
  model.traverse(node => {
    if (node instanceof THREE.Mesh) { triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; meshCount++; materialNames.add(node.material.name); }
    else if (node !== model) nodes[node.name] = node.position.toArray();
  });
  if (triangles > 2500 || materialNames.size > 6) throw new Error(id + ' exceeded the lightweight weapon budget: ' + triangles);
  const bytes = Buffer.from(await exporter.parseAsync(model, { binary: true, onlyVisible: false }));
  const sha256 = createHash('sha256').update(bytes).digest('hex'); await writeFile(output + '/model/' + id + '.glb', bytes);
  report.models[id] = { path: 'model/' + id + '.glb', sha256, bytes: bytes.length, triangles, meshCount, materials: [...materialNames],
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() }, nodes, animations: 0, skins: 0 };
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  let loadedTriangles = 0, loadedMeshes = 0, vertices = 0, finite = true, normalMin = Infinity, normalMax = 0;
  loaded.scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    loadedMeshes++; loadedTriangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    vertices += node.geometry.attributes.position.count;
    for (const attribute of Object.values(node.geometry.attributes)) for (const value of attribute.array) finite &&= Number.isFinite(value);
    const normal = node.geometry.attributes.normal;
    for (let i = 0; i < normal.count; i++) {
      const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)); normalMin = Math.min(normalMin, length); normalMax = Math.max(normalMax, length);
    }
  });
  for (const [name, point] of Object.entries(nodes)) {
    const node = loaded.scene.getObjectByName(name);
    if (!node || node.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...point)) > 1e-7) throw new Error(id + ': marker changed during export: ' + name);
  }
  if (!finite || loadedTriangles !== triangles || loadedMeshes !== meshCount || normalMin < .999 || normalMax > 1.001 || loaded.animations.length) throw new Error(id + ': GLTFLoader roundtrip failed');
  validation.results[id] = { sha256, loadedTriangles, loadedMeshes, vertices, finite, normalMin, normalMax, markersMatch: true, animations: 0, skins: 0 };
}
await writeFile(output + '/manifest.json', JSON.stringify(report, null, 2) + '\n');
await writeFile(output + '/validation.json', JSON.stringify(validation, null, 2) + '\n');
console.log(JSON.stringify(report.models, null, 2));
