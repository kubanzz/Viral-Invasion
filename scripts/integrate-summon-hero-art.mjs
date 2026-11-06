import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { syncArt } from './art-sync.mjs';

// UI-only atlas variants. Sources and character/held registrations stay intact.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const selectionPath = resolve(root, 'asserts/art-selection.json');
const reportPath = resolve(root, 'artifacts/summon-ui-20261106/hero-art-report.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mappings = {
  'weapon-steady': 'fantasy.weapon.steady.held',
  'weapon-piercing': 'fantasy.weapon.piercing.held',
  'module-PULSE_BREAK': 'microfront.reward.module.PULSE_BREAK',
  'module-PURIFY_CHAIN': 'microfront.reward.module.PURIFY_CHAIN',
  'module-IMMUNE_BEACON': 'microfront.reward.module.IMMUNE_BEACON',
  'module-EXPOSE_TRACE': 'microfront.reward.module.EXPOSE_TRACE',
  'forge-core': 'microfront.forge-core',
  biomass: 'fantasy.expedition.repairBiomass.fixed.ready.00',
  'gold-antibody': 'microfront.gold-antibody',
};
const beforeBytes = await readFile(selectionPath), selected = JSON.parse(beforeBytes);
const originalSpecs = new Map(Object.values(mappings).map(id => [id, structuredClone(selected.sprites.find(spec => spec.id === id))]));
const oldRuntime = JSON.parse(await readFile(resolve(root, '.art-generated/art-runtime.json')));
const entries = await Promise.all(Object.entries(mappings).map(async ([name, originalId]) => {
  const original = originalSpecs.get(originalId); assert.ok(original, `Selected source ${originalId}`);
  const path = resolve(root, 'asserts', original.source), bytes = await readFile(path), sourceSha256 = sha(bytes);
  assert.equal(sourceSha256, original.expectedSha256, `Original identity ${name}`);
  let image = sharp(bytes);
  if (original.sourceFrame) { const f = original.sourceFrame; image = image.extract({ left: f.x, top: f.y, width: f.width, height: f.height }); }
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * info.channels + info.channels - 1] > 0) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  assert.ok(right >= left && bottom >= top, `Nonempty source ${name}`);
  const bounds = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  const spec = { id: `microfront.summon.hero.${name}`, source: original.source, expectedSha256: sourceSha256,
    ...(original.sourceFrame ? { sourceFrame: structuredClone(original.sourceFrame) } : {}),
    size: 384, trim: true, centered: true, padding: 0,
    pivotSource: [(bounds.x + bounds.width / 2) / info.width, (bounds.y + bounds.height / 2) / info.height],
    status: 'ui-reviewed', flags: ['summon-hero-art-v1'],
    uiSource: { originalId, purpose: 'Visible-bound-centered summon presentation; original PNG unchanged' } };
  const index = selected.sprites.findIndex(entry => entry.id === spec.id);
  if (index < 0) selected.sprites.push(spec); else selected.sprites[index] = spec;
  return { name, originalId, path, sourceSha256, sourceFrame: original.sourceFrame ?? null,
    nativeVisible: bounds, originalVisible: oldRuntime.assets[originalId]?.visibleBounds, spec };
}));
assert.equal(sha(await readFile(selectionPath)), sha(beforeBytes), 'Selection changed during preparation; retry without overwriting concurrent edits');
await writeFile(selectionPath, JSON.stringify(selected, null, 2) + '\n');
let generated, size = 384;
try { generated = await syncArt(); }
catch (error) {
  if (!String(error.message).includes('exceeds 20MB budget')) throw error;
  size = 256;
  for (const entry of entries) entry.spec.size = size;
  await writeFile(selectionPath, JSON.stringify(selected, null, 2) + '\n');
  generated = await syncArt();
}
await syncArt({ checkOnly: true });
const afterSelection = JSON.parse(await readFile(selectionPath));
for (const [id, spec] of originalSpecs) assert.deepEqual(afterSelection.sprites.find(entry => entry.id === id), spec, `Original registration preserved ${id}`);
const assets = await Promise.all(entries.map(async entry => {
  assert.equal(sha(await readFile(entry.path)), entry.sourceSha256, `Original PNG unchanged ${entry.name}`);
  const hero = generated.runtime.assets[entry.spec.id];
  assert.ok(hero && Math.max(hero.visibleBounds.width, hero.visibleBounds.height) >= size - 1, `Hero visible resolution ${entry.name}`);
  return { name: entry.name, source: entry.spec.source, sha256: entry.sourceSha256, sourceFrame: entry.sourceFrame,
    originalId: entry.originalId, originalVisible: entry.originalVisible, nativeVisible: entry.nativeVisible,
    heroId: entry.spec.id, heroFrame: { width: hero.width, height: hero.height }, heroVisible: hero.visibleBounds };
}));
const report = { scope: 'Nine UI atlas variants of the same selected original PNGs. No generation, source-image edits, character registration changes or budget increase.',
  size, runtimeBytes: Buffer.byteLength(JSON.stringify(generated.runtime)), runtimeBudget: 20 * 1024 * 1024, sourcePngsUnchanged: true, originalRegistrationsUnchanged: true, assets };
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ size, runtimeBytes: report.runtimeBytes, assets: assets.length, report: reportPath }));
