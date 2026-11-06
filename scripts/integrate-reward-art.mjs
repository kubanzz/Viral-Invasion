import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Adopt only the four new reward icons after reviewing the delivered previews.
// Existing selections and frozen Microfront sources retain their original bytes.
const selectionPath = 'asserts/art-selection.json';
const before = await readFile(selectionPath, 'utf8');
const selection = JSON.parse(before);
const adopted = [];
for (const id of ['PULSE_BREAK', 'PURIFY_CHAIN', 'IMMUNE_BEACON', 'EXPOSE_TRACE']) {
  const source = `ViralInvasion_Rewards_v1/icons/module-${id}.png`;
  const bytes = await readFile(`asserts/${source}`);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 256); assert.equal(metadata.height, 256);
  assert.equal(metadata.hasAlpha, true);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, visible = 0, edge = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3];
    if (!alpha) transparent++; else visible++;
    if ((!x || !y || x === info.width - 1 || y === info.height - 1) && alpha) edge++;
  }
  assert.ok(transparent > info.width * info.height * .3, `${id}: true transparent margin`);
  assert.ok(visible > info.width * info.height * .06, `${id}: nonempty subject`);
  assert.equal(edge, 0, `${id}: no clipped alpha at the canvas border`);
  const spec = { id: `microfront.reward.module.${id}`, source, expectedSha256: createHash('sha256').update(bytes).digest('hex'),
    size: 128, trim: false, centered: true, pivotSource: [.5, .5], padding: 0,
    status: 'ui-reviewed', flags: ['reward-icons-v1'] };
  const previous = selection.sprites.findIndex(item => item.id === spec.id);
  if (previous < 0) selection.sprites.push(spec); else selection.sprites[previous] = spec;
  if (Array.isArray(selection.catalogue) && !selection.catalogue.includes(source)) selection.catalogue.push(source);
  adopted.push({ id: spec.id, source, sha256: spec.expectedSha256, transparent, visible, edge });
}
// Refuse to overwrite a concurrent selection edit made during PNG inspection.
assert.equal(await readFile(selectionPath, 'utf8'), before, 'Art selection changed during integration; rerun to merge current contents.');
await writeFile(selectionPath, JSON.stringify(selection, null, 2) + '\n');
console.log(JSON.stringify({ adopted }, null, 2));
