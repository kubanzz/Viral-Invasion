import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..'), pack = resolve(root, 'asserts/ViralInvasion_Seraph_v024');
assert(process.argv.includes('--reviewed-by-main'), 'Inspect the final animation and game-size previews before explicitly binding the reviewed delivery');
const out = resolve(root, 'artifacts/seraph-v024'); await mkdir(out, { recursive: true });
const evidencePath = resolve(out, 'art-integration.json');
const prior = await readFile(evidencePath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
const deliveryBytes = await readFile(resolve(pack, 'delivery.json'));
const delivery = JSON.parse(deliveryBytes.toString('utf8'));
const selectionPath = resolve(root, 'asserts/art-selection.json'), selection = JSON.parse(await readFile(selectionPath, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = [];
for (const role of ['commander', 'lancer', 'prism']) for (const direction of ['front', 'back'])
  for (const [action, count] of Object.entries({ idle: 2, move: 4, attack: 4 })) for (let index = 0; index < count; index++)
    expected.push({ id: `seraph24.${role}.${direction}.${action}.${String(index).padStart(2, '0')}`, role, direction, action, count, index });
assert.equal(expected.length, 60);
const deliveredId = asset => asset.id ?? asset.runtimeId ?? asset.key;
const entries = delivery.assets.filter(asset => asset.runtime !== false);
const retired = selection.sprites.filter(asset => /^sanctum\.seraph\.(leader|wing)\./.test(asset.id));
const retirement = retired.length ? retired.map(asset => ({ id: asset.id, source: asset.source, sha256: asset.expectedSha256 })) : prior?.retired;
assert.equal(retirement?.length, 58, 'Retire the 56 selected animation frames and two selected front static views, preserving originals');
const integrated = [];
async function checkedSource(asset) {
  assert(asset?.path && /^[a-f\d]{64}$/i.test(asset.sha256), 'Missing delivered source identity');
  const path = resolve(pack, asset.path), local = relative(pack, path);
  assert(local && !local.startsWith('..') && !isAbsolute(local), 'Delivery path escapes package');
  const bytes = await readFile(path); assert.equal(sha(bytes), asset.sha256, 'Delivered PNG drift: ' + asset.path);
  const metadata = await sharp(bytes).metadata(); assert.equal(metadata.width, 512); assert.equal(metadata.height, 512); assert(metadata.hasAlpha);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let index = 3; index < data.length; index += info.channels) if (data[index] === 0) transparent++;
  assert(transparent > 512 * 512 * .1, 'A registered sprite must have a real transparent background');
  return { local: local.replaceAll('\\', '/'), bytes: bytes.length, sha256: asset.sha256 };
}
for (const spec of expected) {
  const asset = entries.find(item => deliveredId(item) === spec.id || item.key === spec.id.replace('seraph24.', ''));
  assert(asset, 'Missing independent authored frame: ' + spec.id);
  assert.deepEqual(asset.foot, [256, 435.2], 'Each authored frame must declare the shared source foot');
  assert.equal(asset.trim, false);
  assert.equal(asset.animation?.index, spec.index);
  assert.equal(asset.animation?.frameCount, spec.count);
  assert.equal(asset.animation?.fps, spec.action === 'idle' ? 4 : spec.action === 'move' ? 10 : 12);
  const source = await checkedSource(asset), group = spec.id.replace(/\.\d\d$/, '');
  const entry = { id: spec.id, source: `ViralInvasion_Seraph_v024/${source.local}`, expectedSha256: source.sha256,
    size: spec.role === 'commander' ? 160 : 128, trim: false, pivotSource: [.5, .85], status: 'ui-reviewed',
    flags: ['seraph-v024-reviewed', 'registered-source-canvas'],
    actorRegistration: { canvas: { width: 512, height: 512 }, foot: { x: 256, y: 435.2 }, commonCanvasScale: 1 },
    animation: { group, index: spec.index, frameCount: spec.count, fps: spec.action === 'idle' ? 4 : spec.action === 'move' ? 10 : 12,
      approved: true, motionMethod: 'authored-pose-sheet' },
    producer: { theme: 'ViralInvasion_Seraph_v024', key: asset.key ?? spec.id, receipt: 'asserts/ViralInvasion_Seraph_v024/delivery.json', sourceSha256: source.sha256 } };
  const previous = selection.sprites.findIndex(item => item.id === spec.id);
  if (previous < 0) selection.sprites.push(entry); else selection.sprites[previous] = entry;
  integrated.push({ id: spec.id, ...source, source: entry.source, group, index: spec.index, count: spec.count });
}
const portrait = entries.find(asset => /portrait/.test(deliveredId(asset) ?? '') || asset.kind === 'portrait');
assert(portrait, 'Missing four-person squad portrait'); const source = await checkedSource(portrait);
const portraitIndex = selection.sprites.findIndex(asset => asset.id === 'sanctum.portrait.seraph'); assert(portraitIndex >= 0);
const previousPortrait = selection.sprites[portraitIndex];
selection.sprites[portraitIndex] = { id: 'sanctum.portrait.seraph', source: `ViralInvasion_Seraph_v024/${source.local}`,
  expectedSha256: source.sha256, size: 384, trim: false, pivotSource: [.5, .5], status: 'ui-reviewed',
  flags: ['seraph-v024-reviewed'], producer: { theme: 'ViralInvasion_Seraph_v024', key: portrait.key,
    receipt: 'asserts/ViralInvasion_Seraph_v024/delivery.json', sourceSha256: source.sha256 } };
integrated.push({ id: 'sanctum.portrait.seraph', ...source, source: selection.sprites[portraitIndex].source });
selection.sprites = selection.sprites.filter(asset => !/^sanctum\.seraph\.(leader|wing)\./.test(asset.id));
await writeFile(selectionPath, JSON.stringify(selection, null, 2) + '\n');
await writeFile(evidencePath, JSON.stringify({ version: '0.24.0', frames: 60, portraitCount: 1, runtimeCount: 61,
  reviewedByMain: true,
  delivery: 'asserts/ViralInvasion_Seraph_v024/delivery.json', deliverySha256: sha(deliveryBytes),
  review: 'Three role identities and actual authored animation/contact-sheet previews inspected by main before binding. Existing role art is retired rather than layered under new bodies.',
  integrated, retired: retirement, previousPortrait: prior?.previousPortrait ?? { source: previousPortrait.source, sha256: previousPortrait.expectedSha256 } }, null, 2));
console.log(JSON.stringify({ integrated: integrated.length, retired: retirement.length, bytes: integrated.reduce((sum, item) => sum + item.bytes, 0) }));
