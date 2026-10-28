import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { syncArt } from '../../scripts/art-sync.mjs';

const root = resolve('.');
const preview = resolve('artifacts/experience-optimization-20261028/idle-preview');
await mkdir(preview); // Refuse to overwrite an existing preview.
await cp(join(root, 'src'), join(preview, 'src'), { recursive: true, errorOnExist: true });
await cp(join(root, 'index.html'), join(preview, 'index.html'), { errorOnExist: true });
const selection = JSON.parse(await readFile(join(root, 'asserts/art-selection.json'), 'utf8'));
for (let index = 0; index < 4; index++) {
  const frame = String(index).padStart(2, '0');
  const source = `ViralInvasion_Art_v1/batch10_hero_sequences/idle/v1/${frame}.png`;
  const bytes = await readFile(join(root, 'asserts', source));
  selection.sprites.push({
    id: `hero.front_right.idle.${frame}`, source, size: 512, status: 'preview-only',
    pivotSource: [512 / 1024, 850 / 1024],
    expectedSha256: createHash('sha256').update(bytes).digest('hex'),
    flags: ['preview-only'],
    animation: { group: 'hero.front_right.idle', index, fps: 4, frameCount: 4, approved: true },
  });
}
const selectionPath = join(preview, 'preview-selection.json');
await writeFile(selectionPath, JSON.stringify(selection, null, 2));
const result = await syncArt({ workspaceRoot: root, localRoot: join(root, 'asserts'), selectionPath,
  outputDirectory: join(preview, '.art-generated') });
console.log(JSON.stringify({ preview, selectedFrames: 4, sprites: Object.keys(result.runtime.assets).length,
  inputSignature: result.runtime.inputSignature }));
