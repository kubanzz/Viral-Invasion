import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { syncArt } from './art-sync.mjs';

// Direct invocation also synchronizes and validates the embedded artwork.
const { runtime: artRuntime, runtimePath } = await syncArt();
const outputDirectory = process.env.VI_DIST_DIR ?? 'dist';
await mkdir(outputDirectory, { recursive: true });
const result = await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: ['chrome110', 'edge110'], outfile: join(outputDirectory, 'game.js'), minify: true, metafile: true, legalComments: 'none' });
// Keep the notices with the offline JavaScript, including the emitter bundled by Phaser.
const noticePaths = ['node_modules/phaser/LICENSE.md', 'node_modules/eventemitter3/LICENSE'];
const notices = await Promise.all(noticePaths.map(async path => `${path}\n${await readFile(path, 'utf8')}`));
const gamePath = join(outputDirectory, 'game.js');
await writeFile(gamePath, `${await readFile(gamePath, 'utf8')}\n/*!\n${notices.join('\n\n').replaceAll('*/', '* /')}\n*/\n`);
const inputPaths = [...new Set([
  ...Object.keys(result.metafile.inputs),
  ...Object.keys(artRuntime.sourceManifest).map(path => `asserts/${path}`),
  'asserts/art-selection.json', 'scripts/art-sync.mjs', 'src/style.css',
  'index.html', 'package.json', 'package-lock.json', 'scripts/build-offline.mjs', 'scripts/package-release.mjs',
  'node_modules/phaser/package.json',
  ...noticePaths,
])].sort();
if (!Object.keys(result.metafile.inputs).some(path => path.replaceAll('\\', '/').endsWith('.art-generated/art-runtime.json'))) throw new Error('The generated artwork was not bundled into the game. Import art-runtime.json from the renderer before releasing.');
const css = await readFile(join(outputDirectory, 'game.css'), 'utf8');
const { version, viralInvasionStage: stage } = JSON.parse(await readFile('package.json', 'utf8'));
const { version: engineVersion } = JSON.parse(await readFile('node_modules/phaser/package.json', 'utf8'));
const html = (await readFile('index.html', 'utf8')).replace('<!-- STYLES -->', `<style>${css}</style>`).replace('<script type="module" src="/src/main.ts"></script>', '<script src="./game.js"></script>');
await writeFile(join(outputDirectory, 'index.html'), html);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceManifest = Object.fromEntries(await Promise.all(inputPaths.map(async path => [path.replaceAll('\\', '/'), hash(await readFile(path))])));
for (const [path, expected] of Object.entries(artRuntime.sourceManifest)) if (sourceManifest[`asserts/${path}`] !== expected) throw new Error(`Selected artwork changed during the build: ${path}`);
const art = {
  schemaVersion: artRuntime.schemaVersion,
  inputSignature: artRuntime.inputSignature,
  selectionSha256: artRuntime.selectionSha256,
  pipelineSha256: artRuntime.pipelineSha256,
  selectedSourceCount: Object.keys(artRuntime.sourceManifest).length,
  spriteIdCount: Object.keys(artRuntime.assets).length,
  environmentCount: Object.keys(artRuntime.environments).length,
  runtimeBytes: (await readFile(runtimePath)).length,
  atlases: artRuntime.atlases.map(atlas => ({ key: atlas.key, ...atlas.data.meta.size, bytes: atlas.bytes, sha256: atlas.sha256 })),
  environments: Object.fromEntries(Object.entries(artRuntime.environments).map(([id, environment]) => [id, { width: environment.width, height: environment.height, bytes: environment.bytes, sha256: environment.sha256 }])),
  pendingAssetCount: artRuntime.report.pending.length,
  unreviewedCandidateCount: artRuntime.report.unknownCandidates.length,
  embedding: 'PNG data URIs in classic game.js; no external asset paths or image fetches',
};
await writeFile(join(outputDirectory, 'build-meta.json'), JSON.stringify({ game: 'viral-invasion', version, stage, format: 'iife', engine: { name: 'Phaser', version: engineVersion }, art, sourceManifest, ...result.metafile }, null, 2));
console.log(`Offline release ready: ${outputDirectory}/index.html + game.js (classic IIFE; Phaser ${engineVersion}; ${art.spriteIdCount} sprite IDs and ${art.environmentCount} environments embedded locally).`);
