import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = process.cwd(), artRoot = resolve(root, 'asserts'), weaponRoot = resolve(artRoot, 'ViralInvasion_Weapons_v2');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fromProcessing = process.argv.includes('--reviewed-processing');
const receiptPath = fromProcessing ? 'production/source-processing.json' : 'delivery.json';
const deliveryBytes = await readFile(resolve(weaponRoot, receiptPath));
const receipt = JSON.parse(deliveryBytes);
const delivery = fromProcessing ? {
  status: 'two-held-weapons-ready-for-main-renderer-review',
  assets: receipt.sources.map(asset => ({ ...asset.output, id: `fantasy.weapon.${asset.key}.held`, grip: asset.grip, muzzle: asset.muzzle })),
} : receipt;
const selectionPath = resolve(artRoot, 'art-selection.json');
const original = await readFile(selectionPath), selection = JSON.parse(original);
assert.ok(['two-held-weapons-ready-for-main-renderer-review', 'two-v02-held-weapons-main-renderer-accepted'].includes(delivery.status));
assert.equal(delivery.assets.length, 2);
const ids = new Set(['fantasy.weapon.steady.held', 'fantasy.weapon.piercing.held']);
const retained = selection.sprites.filter(sprite => !ids.has(sprite.id));
const additions = [];
for (const key of ['steady', 'piercing']) {
  const id = `fantasy.weapon.${key}.held`, asset = delivery.assets.find(item => item.id === id);
  assert.ok(asset, `Missing ${id}`); assert.deepEqual(asset.dimensions, [512, 512]);
  assert.equal(asset.hasAlphaChannel, true); assert.equal(asset.alpha.borderVisible, 0);
  const absolute = resolve(weaponRoot, asset.path), local = relative(weaponRoot, absolute);
  assert.ok(local && !local.startsWith(`..${sep}`) && local !== '..', 'Asset must stay in Weapons_v2');
  assert.equal(sha(await readFile(absolute)), asset.sha256, 'Frozen source SHA differs');
  const source = relative(artRoot, absolute).replaceAll('\\', '/');
  const [gx, gy] = asset.grip, [mx, my] = asset.muzzle;
  assert.ok([gx, gy, mx, my].every(value => Number.isFinite(value) && value >= 0 && value <= 512));
  additions.push({ id, source, expectedSha256: asset.sha256,
    sourceFrame: { x: 0, y: 0, width: 512, height: 512 }, size: 192, trim: false,
    pivotSource: [gx / 512, gy / 512], status: 'reviewed-integration',
    flags: ['distinct-held-weapon-20261105', 'shared-source-canvas'],
    actorRegistration: { canvas: { width: 512, height: 512 }, foot: { x: gx, y: gy },
      grip: { x: gx, y: gy }, muzzle: { x: mx, y: my }, commonCanvasScale: 1 }, sourceMuzzle: { x: mx, y: my },
    animation: { group: id, index: 0, fps: 1, frameCount: 1, approved: true, loop: false,
      motionMethod: 'maliang-source-static-registered-weapon', kind: 'registered-static-layer',
      review: { reviewer: 'root', date: '2026-11-05', scope: 'Inspected source silhouette, genuine transparency and producer registration. Actual Renderer review recorded separately.',
        evidence: `asserts/ViralInvasion_Weapons_v2/${receiptPath}` } } });
}
selection.sprites = [...retained, ...additions];
const selected = Buffer.from(JSON.stringify(selection, null, 2) + '\n');
await writeFile(selectionPath, selected);
const output = resolve(root, 'artifacts/weapon-identity-v017'); await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'art-integration.json'), JSON.stringify({
  sourceReceipt: receiptPath, sourceReceiptSha256: sha(deliveryBytes), previousSelectionSha256: sha(original), selectionSha256: sha(selected),
  sourceReview: 'root inspected the two v02 transparent PNGs with view_image before selecting these exact frozen bytes.',
  retainedSpriteCount: retained.length, appended: additions.map(({ id, source, expectedSha256, actorRegistration }) => ({ id, source, expectedSha256, actorRegistration })),
  preservedOriginalAssets: true, runtimeReview: 'See world-fixture and browser QA reports.' }, null, 2));
console.log(JSON.stringify({ sprites: selection.sprites.length, added: additions.map(asset => asset.id) }));
