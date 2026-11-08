import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..'), folder = resolve(root, 'asserts/ViralInvasion_LivingWorld_v023');
const deliveryPath = resolve(folder, 'delivery.json');
const delivery = JSON.parse(await readFile(deliveryPath, 'utf8'));
const selectionPath = resolve(root, 'asserts/art-selection.json');
const selection = JSON.parse(await readFile(selectionPath, 'utf8'));
const priorEvidence = await readFile(resolve(root, 'artifacts/living-world-v023/art-integration.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
const expectedIds = ['sanctum.crop.seed', 'sanctum.crop.grow', 'sanctum.crop.ripe', 'sanctum.boss.crystal', 'sanctum.boss.fission', 'sanctum.boss.devourer'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const integrated = [];
for (const id of expectedIds) {
  const suffix = id.split('.').at(-1), crop = id.includes('.crop.');
  const asset = delivery.assets.find(item => (crop ? /plant|crop/.test(item.key ?? item.id) : /boss/.test(item.key ?? item.id)) && (item.key ?? item.id).endsWith('.' + suffix));
  assert(asset, 'Missing independent delivered asset: ' + id);
  const sourcePath = resolve(folder, asset.path), local = relative(folder, sourcePath);
  assert(local && !local.startsWith('..') && !isAbsolute(local), 'Asset path escapes delivered folder');
  const bytes = await readFile(sourcePath), sha256 = hash(bytes);
  assert.equal(sha256, asset.sha256, 'Delivered source drift: ' + id);
  const meta = await sharp(bytes).metadata(), expectedSize = crop ? 256 : 512;
  assert.equal(meta.width, expectedSize); assert.equal(meta.height, expectedSize); assert(meta.hasAlpha);
  const foot = asset.foot ?? asset.anchor ?? [expectedSize / 2, expectedSize * .849609375];
  assert(Array.isArray(foot)); assert.equal(foot[0], expectedSize / 2); assert.equal(foot[1], expectedSize * .849609375);
  const previous = selection.sprites.findIndex(sprite => sprite.id === id);
  assert(previous >= 0, 'This change must replace an existing selected ID: ' + id);
  const entry = { id, source: 'ViralInvasion_LivingWorld_v023/' + local.replaceAll('\\', '/'), expectedSha256: sha256,
    size: expectedSize, trim: false, pivotSource: foot.map(value => value / expectedSize), status: 'ui-reviewed',
    flags: ['living-world-v023-reviewed', 'registered-source-canvas', ...(crop ? [] : ['complete-boss-body'])],
    producer: { theme: 'ViralInvasion_LivingWorld_v023', key: asset.key, receipt: 'asserts/ViralInvasion_LivingWorld_v023/delivery.json', sourceSha256: sha256 } };
  const old = selection.sprites[previous]; selection.sprites[previous] = entry;
  integrated.push({ id, source: entry.source, sha256, bytes: bytes.length, foot,
    replacedSource: old.source === entry.source ? `ViralInvasion_Sanctum_v020/${crop ? 'crops' : 'boss/layers'}/${suffix}.png` : old.source });
}
assert.equal(integrated.length, 6);
// The complete staged body replaces these older expedition clips. Retain all
// source originals for history, but do not ship a second unused boss body.
const retired = selection.sprites.filter(sprite => sprite.id.startsWith('fantasy.expedition.heartDevourer.'));
const retiredEvidence = retired.length ? retired.map(item => ({ id: item.id, source: item.source, sha256: item.expectedSha256 })) : priorEvidence?.retired;
assert.equal(retiredEvidence?.length, 8, 'Expected the complete prior eight-frame boss family or its preserved retirement receipt');
selection.sprites = selection.sprites.filter(sprite => !sprite.id.startsWith('fantasy.expedition.heartDevourer.'));
await writeFile(selectionPath, JSON.stringify(selection, null, 2) + '\n');
const out = resolve(root, 'artifacts/living-world-v023'); await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'art-integration.json'), JSON.stringify({ version: '0.23.0', reviewedByMain: true,
  review: 'Main inspected independent black/cream and actual-size previews before binding. Six existing IDs replaced; no duplicate old boss base under the new complete body.',
  deliverySha256: hash(await readFile(deliveryPath)), integrated, retired: retiredEvidence }, null, 2));
console.log(JSON.stringify({ integrated: integrated.length, bytes: integrated.reduce((sum, item) => sum + item.bytes, 0) }));
