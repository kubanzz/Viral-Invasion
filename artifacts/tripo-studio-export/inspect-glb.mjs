import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Read-only structural audit, not a substitute for glTF Validator or visual playback.
const filename = process.argv[2];
if (!filename) {
  console.error('Usage: node artifacts/tripo-studio-export/inspect-glb.mjs <model.glb>');
  process.exit(2);
}

const file = path.resolve(filename);
const data = await fs.readFile(file);
const errors = [], warnings = [];
const fail = message => errors.push(message);
const warn = message => warnings.push(message);
const isIndex = (value, list) => Number.isInteger(value) && value >= 0 && value < list.length;
if (data.length < 20 || data.toString('ascii', 0, 4) !== 'glTF') throw new Error('Not a binary glTF (GLB) file');
if (data.readUInt32LE(4) !== 2) fail('GLB version is not 2');
if (data.readUInt32LE(8) !== data.length) fail('Declared GLB length differs from actual file size');
const chunks = [];
for (let offset = 12; offset < data.length;) {
  if (offset + 8 > data.length) { fail('Truncated chunk header'); break; }
  const length = data.readUInt32LE(offset), type = data.readUInt32LE(offset + 4);
  if (length % 4) fail('Chunk byte length is not aligned to 4');
  if (offset + 8 + length > data.length) { fail('Chunk extends beyond file'); break; }
  chunks.push({ type, bytes: data.subarray(offset + 8, offset + 8 + length) });
  offset += 8 + length;
}
if (chunks[0]?.type !== 0x4e4f534a) throw new Error('First GLB chunk is not JSON');
const gltf = JSON.parse(chunks[0].bytes.toString('utf8').replace(/[\x00\s]+$/, ''));
if (gltf.asset?.version !== '2.0') fail('JSON asset.version is not 2.0');
const bin = chunks.find(chunk => chunk.type === 0x004e4942)?.bytes;
const nodes = gltf.nodes ?? [], meshes = gltf.meshes ?? [], skins = gltf.skins ?? [];
const accessors = gltf.accessors ?? [], views = gltf.bufferViews ?? [];
const buffers = gltf.buffers ?? [], images = gltf.images ?? [];
const externalResources = [];
const decodedBuffers = [];
const readUri = async (uri, label) => {
  if (uri.startsWith('data:')) {
    const comma = uri.indexOf(',');
    if (comma < 0) throw new Error(`${label}: malformed data URI`);
    return /;base64/i.test(uri.slice(0, comma))
      ? Buffer.from(uri.slice(comma + 1), 'base64')
      : Buffer.from(decodeURIComponent(uri.slice(comma + 1)));
  }
  externalResources.push({ label, uri });
  if (/^[a-z][a-z\d+.-]*:/i.test(uri)) throw new Error(`${label}: external URL; not fetched`);
  const resolved = path.resolve(path.dirname(file), decodeURIComponent(uri));
  const relative = path.relative(path.dirname(file), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label}: URI leaves model folder; not read`);
  return fs.readFile(resolved);
};
for (let i = 0; i < buffers.length; i++) {
  try {
    const bytes = buffers[i].uri ? await readUri(buffers[i].uri, `buffer[${i}]`) : i === 0 ? bin : undefined;
    decodedBuffers.push(bytes);
    if (!bytes || bytes.length < buffers[i].byteLength) fail(`buffer[${i}]: missing or shorter than declared`);
  } catch (error) { decodedBuffers.push(undefined); fail(error.message); }
}
for (let i = 0; i < views.length; i++) {
  const v = views[i], bytes = decodedBuffers[v.buffer];
  if (!bytes || (v.byteOffset ?? 0) + v.byteLength > bytes.length) fail(`bufferView[${i}]: missing buffer or invalid range`);
}
const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const readComponent = (b, offset, type) => {
  if (type === 5120) return b.readInt8(offset);
  if (type === 5121) return b.readUInt8(offset);
  if (type === 5122) return b.readInt16LE(offset);
  if (type === 5123) return b.readUInt16LE(offset);
  if (type === 5125) return b.readUInt32LE(offset);
  if (type === 5126) return b.readFloatLE(offset);
  throw new Error('Unsupported accessor component type');
};
const valuesAt = (index, element) => {
  const a = accessors[index], v = a && views[a.bufferView];
  if (!a || !v || a.sparse || v.extensions?.EXT_meshopt_compression) return undefined;
  const b = decodedBuffers[v.buffer], size = sizes[a.componentType], count = components[a.type];
  if (!b || !size || !count || element < 0 || element >= a.count) return undefined;
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + element * (v.byteStride ?? size * count);
  if (start + size * count > b.length) return undefined;
  return Array.from({ length: count }, (_, i) => readComponent(b, start + size * i, a.componentType));
};
const primitiveSummaries = meshes.flatMap((mesh, meshIndex) => (mesh.primitives ?? []).map((p, primitiveIndex) => {
  const position = accessors[p.attributes?.POSITION], indices = accessors[p.indices];
  if (!position && !p.extensions?.KHR_draco_mesh_compression) fail(`mesh[${meshIndex}].primitive[${primitiveIndex}] has no POSITION accessor`);
  const joints = accessors[p.attributes?.JOINTS_0], weights = accessors[p.attributes?.WEIGHTS_0];
  if (joints && joints.count !== position?.count || weights && weights.count !== position?.count) fail(`mesh[${meshIndex}].primitive[${primitiveIndex}]: skin attribute count mismatch`);
  const mode = p.mode ?? 4, count = indices?.count ?? position?.count ?? 0;
  return { meshIndex, primitiveIndex, vertices: position?.count ?? null, triangles: mode === 4 ? count / 3 : null,
    mode, material: p.material ?? null, hasJoints: !!joints, hasWeights: !!weights,
    compressed: Object.keys(p.extensions ?? {}), positionMin: position?.min, positionMax: position?.max };
}));
const skinnedNodes = nodes.flatMap((node, index) => Number.isInteger(node.skin) ? [{ index, name: node.name ?? null, skin: node.skin, mesh: node.mesh }] : []);
for (const n of skinnedNodes) {
  if (!isIndex(n.skin, skins) || !isIndex(n.mesh, meshes)) { fail(`node[${n.index}]: invalid skin or mesh reference`); continue; }
  if (primitiveSummaries.some(p => p.meshIndex === n.mesh && (!p.hasJoints || !p.hasWeights))) fail(`node[${n.index}]: skinned mesh lacks JOINTS_0 or WEIGHTS_0`);
}
const skinSummaries = skins.map((skin, index) => {
  const joints = skin.joints ?? [];
  if (!joints.length || joints.some(j => !isIndex(j, nodes))) fail(`skin[${index}]: missing/invalid joint nodes`);
  const binds = accessors[skin.inverseBindMatrices];
  if (skin.inverseBindMatrices !== undefined && (!binds || binds.type !== 'MAT4' || binds.count < joints.length)) fail(`skin[${index}]: invalid inverse-bind accessor`);
  return { index, name: skin.name ?? null, jointCount: joints.length, jointNames: joints.map(j => nodes[j]?.name ?? `node-${j}`),
    hasInverseBindMatrices: !!binds, linkedMeshNodes: skinnedNodes.filter(n => n.skin === index).map(n => n.index) };
});
const jointSet = new Set(skins.flatMap(s => s.joints ?? []));
const animationSummaries = (gltf.animations ?? []).map((animation, index) => {
  const channels = animation.channels ?? [], samplers = animation.samplers ?? [];
  let maxDuration = 0;
  const tracks = channels.map(channel => {
    const sampler = samplers[channel.sampler], input = accessors[sampler?.input], output = accessors[sampler?.output];
    if (!sampler || !input || !output || !isIndex(channel.target?.node, nodes)) fail(`animation[${index}]: invalid channel/accessor reference`);
    const first = input ? valuesAt(sampler.input, 0)?.[0] ?? input.min?.[0] : undefined;
    const last = input ? valuesAt(sampler.input, input.count - 1)?.[0] ?? input.max?.[0] : undefined;
    const duration = typeof first === 'number' && typeof last === 'number' ? last - first : null;
    if (duration !== null && Number.isFinite(duration)) maxDuration = Math.max(maxDuration, duration);
    return { node: channel.target?.node, nodeName: nodes[channel.target?.node]?.name ?? null, path: channel.target?.path,
      targetsJoint: jointSet.has(channel.target?.node), keyframes: input?.count ?? null, duration, interpolation: sampler?.interpolation ?? 'LINEAR' };
  });
  return { index, name: animation.name ?? `animation-${index}`, duration: maxDuration, channelCount: channels.length,
    jointChannelCount: tracks.filter(t => t.targetsJoint).length, tracks };
});
const imageSummaries = [];
for (let i = 0; i < images.length; i++) {
  const image = images[i];
  try {
    const v = views[image.bufferView];
    const bytes = image.uri ? await readUri(image.uri, `image[${i}]`) : v && decodedBuffers[v.buffer]?.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    if (!bytes) throw new Error(`image[${i}]: bytes missing`);
    let metadata;
    try { metadata = await sharp(bytes).metadata(); }
    catch { warn(`image[${i}]: image codec not decoded by local sharp; confirm in a viewer`); }
    imageSummaries.push({ index: i, name: image.name ?? null, bytes: bytes.length, embedded: !image.uri || image.uri.startsWith('data:'),
      mimeType: image.mimeType ?? null, format: metadata?.format ?? null, width: metadata?.width ?? null, height: metadata?.height ?? null });
  } catch (error) { fail(error.message); imageSummaries.push({ index: i, error: error.message }); }
}
const hasGeometry = primitiveSummaries.some(p => (p.vertices ?? 0) > 0);
const hasLinkedSkin = skinSummaries.some(s => s.jointCount > 0 && s.linkedMeshNodes.length > 0);
const hasJointAnimation = animationSummaries.some(a => a.duration > 0 && a.jointChannelCount > 0);
if (!hasLinkedSkin) warn('No mesh-linked skeleton: this is not a rigged character');
if (!hasJointAnimation) warn('No nonzero-duration animation targeting skeleton joints');
if (externalResources.length) warn('External resources exist: keep them with the GLB; not a self-contained single asset');
if (gltf.extensionsRequired?.length) warn('Required extensions need matching decoder/runtime support');
const classification = errors.length ? 'structural-errors' : !hasGeometry ? 'no-readable-geometry' : !hasLinkedSkin ? 'static-or-unskinned-model'
  : !hasJointAnimation ? 'rigged-model-without-confirmed-joint-animation' : 'rigged-model-with-joint-animation';
console.log(JSON.stringify({ file, sha256: crypto.createHash('sha256').update(data).digest('hex'), bytes: data.length,
  classification, containerValid: errors.length === 0, asset: gltf.asset, extensionsUsed: gltf.extensionsUsed ?? [], extensionsRequired: gltf.extensionsRequired ?? [],
  meshCount: meshes.length, primitiveSummaries, nodeCount: nodes.length, skinSummaries, animationSummaries,
  materialCount: gltf.materials?.length ?? 0, textureCount: gltf.textures?.length ?? 0, imageSummaries, externalResources,
  errors, warnings, verificationLimit: 'Structural inventory only. Visual texture appearance, skin deformation, clip quality and renderer playback still require inspection.' }, null, 2));
if (errors.length) process.exitCode = 1;
