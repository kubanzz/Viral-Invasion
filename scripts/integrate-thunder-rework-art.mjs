import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import sharp from 'sharp';

const directory = resolve('asserts/ViralInvasion_ThunderRework_v025');
const delivery = JSON.parse(await readFile(resolve(directory, 'delivery.json'), 'utf8'));
const selectionPath = 'asserts/art-selection.json';
const selection = JSON.parse(await readFile(selectionPath, 'utf8'));
const definitions = [
  ['objects/electrode.png', 'thunder-rod', 256],
  ['fx/electrified-cracks.png', 'thunder-mark', 128],
  ['fx/thunder-trail.png', 'thunder-trail', 512],
  ['fx/crown.png', 'thunder-crown', 256],
  ['fx/finisher-column.png', 'thunder-pillar', 512],
];
const additions = [];
for (const [path, key, size] of definitions) {
  const asset = delivery.assets.find(a => a.path === path);
  assert(asset, `Missing approved thunder image: ${path}`);
  const source = resolve(directory, path);
  assert(!relative(directory, source).startsWith('..'));
  const bytes = await readFile(source);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  const metadata = await sharp(bytes).metadata();
  assert(metadata.hasAlpha && metadata.width === asset.dimensions[0] && metadata.height === asset.dimensions[1]);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, partial = 0, borderVisible = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const alpha = data[i * 4 + 3], x = i % info.width, y = Math.floor(i / info.width);
    if (alpha === 0) transparent++; else if (alpha < 255) partial++;
    if (alpha && (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1)) borderVisible++;
  }
  assert(transparent > 0 && partial > 0 && borderVisible === 0, `Invalid transparent border: ${path}`);
  const id = `fantasy.weapon.fx.${key}`;
  additions.push({ id, source: relative(resolve('asserts'), source).replaceAll('\\', '/'),
    expectedSha256: asset.sha256, sourceFrame: { x: 0, y: 0, width: metadata.width, height: metadata.height },
    size, trim: false, pivotSource: asset.pivot ?? [.5, .5], status: 'reviewed-integration', flags: ['thunder-rework-v025'],
    animation: { group: id, index: 0, fps: 1, frameCount: 1, approved: true, loop: false,
      kind: 'registered-static-layer', motionMethod: 'maliang-generated-static-art-with-simulation-driven-electric-motion',
      review: { reviewer: 'root', date: '2026-11-08', scope: 'Actual black/cream and small-size previews inspected; runtime geometry and animation are authored in code.',
        evidence: 'asserts/ViralInvasion_ThunderRework_v025/delivery.json' } } });
}
const ids = new Set(additions.map(a => a.id));
selection.sprites = [...selection.sprites.filter(a => !ids.has(a.id)), ...additions];
await writeFile(selectionPath, JSON.stringify(selection, null, 2) + '\n');
await mkdir('artifacts/thunder-rework-v025', { recursive: true });
const report = { assets: additions.map(a => ({ id: a.id, source: a.source, sha256: a.expectedSha256 })),
  sourcePngBytes: delivery.assets.filter(a => definitions.some(([p]) => p === a.path)).reduce((sum, a) => sum + a.bytes, 0),
  sourceDelivery: 'asserts/ViralInvasion_ThunderRework_v025/delivery.json',
  previewReviewed: true, runtimeReview: 'final-verification/report.json' };
await writeFile('artifacts/thunder-rework-v025/art-integration.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ integrated: additions.length, sourcePngBytes: report.sourcePngBytes }));
