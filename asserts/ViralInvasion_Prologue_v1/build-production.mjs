import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
await mkdir(join(root, 'production'), { recursive: true });
const assets = [];
for (const id of ['body', 'lung', 'heart', 'vessel']) {
  const source = await readFile(join(root, 'source', `${id}.png`));
  const metadata = await sharp(source).metadata();
  const production = await sharp(source).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  await writeFile(join(root, 'production', `${id}.jpg`), production);
  const derivedMetadata = await sharp(production).metadata();
  assets.push({
    id, source: `source/${id}.png`, production: `production/${id}.jpg`,
    sourceWidth: metadata.width, sourceHeight: metadata.height, sourceBytes: source.byteLength, sourceSha256: hash(source),
    productionWidth: derivedMetadata.width, productionHeight: derivedMetadata.height, productionBytes: production.byteLength, productionSha256: hash(production),
    derivation: 'Proportional resize to width 1600, no content edits; JPEG quality 85 with mozjpeg.',
    prompt: (await readFile(join(root, `${id}.prompt.txt`), 'utf8')).trim(),
  });
}
const manifest = {
  version: 1,
  title: 'Viral Invasion opening cinematic background plates',
  createdOn: '2026-11-08',
  origin: { tool: 'OpenAI built-in image_gen.imagegen', mode: 'generate', imagesGeneratedSeparately: true, externalApiOrCli: false },
  use: 'In-game opening cinematic. Characters, battle, infection progression, camera motion and text are authored separately at runtime.',
  visualReference: 'Existing project screenshots inspected before generation; reference style described in prompts. No source image was edited or composited.',
  bodyAnchors: { coordinateSpace: 'normalized source image', throat: { x: .655, y: .213 }, heart: { x: .673, y: .399 }, leftOnScreenLung: { x: .601, y: .404 }, rightOnScreenLung: { x: .715, y: .399 }, abdomen: { x: .652, y: .680 } },
  assets,
};
await writeFile(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ assets: assets.map(({ id, productionWidth, productionHeight, productionBytes }) => ({ id, width: productionWidth, height: productionHeight, bytes: productionBytes })), totalRuntimeBytes: assets.reduce((sum, asset) => sum + asset.productionBytes, 0) }, null, 2));
