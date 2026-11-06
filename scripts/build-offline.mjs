import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { syncArt } from './art-sync.mjs';

// Direct invocation also synchronizes and validates the embedded artwork.
const { runtime: artRuntime, runtimePath } = await syncArt();
const outputDirectory = process.env.VI_DIST_DIR ?? 'dist';
await mkdir(outputDirectory, { recursive: true });
const browserTargets = ['chrome110', 'edge110', 'safari17.6'];
const result = await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: browserTargets, outfile: join(outputDirectory, 'game.js'), minify: true, metafile: true, legalComments: 'none', loader: { '.glb': 'dataurl' } });
// Keep the notices with the offline JavaScript, including the emitter bundled by Phaser.
const noticePaths = ['node_modules/phaser/LICENSE.md', 'node_modules/eventemitter3/LICENSE', 'node_modules/three/LICENSE'];
const notices = await Promise.all(noticePaths.map(async path => `${path}\n${await readFile(path, 'utf8')}`));
const gamePath = join(outputDirectory, 'game.js');
await writeFile(gamePath, `${await readFile(gamePath, 'utf8')}\n/*!\n${notices.join('\n\n').replaceAll('*/', '* /')}\n*/\n`);
const inputPaths = [...new Set([
  ...Object.keys(result.metafile.inputs),
  ...Object.keys(artRuntime.sourceManifest).map(path => `asserts/${path}`),
  'asserts/art-selection.json', 'scripts/art-sync.mjs', 'src/style.css',
  'index.html', 'package.json', 'package-lock.json', 'scripts/build-offline.mjs', 'scripts/package-release.mjs',
  'scripts/package-mobile.mjs', 'Docs/ViralInvasion_Mobile_Playtest.md',
  'scripts/build-held-weapons-3d.mjs', 'asserts/ViralInvasion_Weapons3D_v1/manifest.json',
  'asserts/ViralInvasion_Weapons3D_v1/README.md',
  'node_modules/phaser/package.json',
  ...noticePaths,
])].sort();
if (!Object.keys(result.metafile.inputs).some(path => path.replaceAll('\\', '/').endsWith('.art-generated/art-runtime.json'))) throw new Error('The generated artwork was not bundled into the game. Import art-runtime.json from the renderer before releasing.');
const css = await readFile(join(outputDirectory, 'game.css'), 'utf8');
const { version, viralInvasionStage: stage } = JSON.parse(await readFile('package.json', 'utf8'));
const { version: engineVersion } = JSON.parse(await readFile('node_modules/phaser/package.json', 'utf8'));
const { version: threeVersion } = JSON.parse(await readFile('node_modules/three/package.json', 'utf8'));
const player3DPath = 'asserts/ViralInvasion_Hero3D_v1/model/medic-hero-v1-animated.glb';
if (!Object.keys(result.metafile.inputs).some(path => path.replaceAll('\\', '/') === player3DPath)) throw new Error('The skinned player GLB was not embedded in the offline game.');
const player3DBytes = await readFile(player3DPath);
const heldWeaponManifest = JSON.parse(await readFile('asserts/ViralInvasion_Weapons3D_v1/manifest.json', 'utf8'));
const heldWeapons3D = await Promise.all(Object.entries(heldWeaponManifest.models).map(async ([id, model]) => {
  const source = 'asserts/ViralInvasion_Weapons3D_v1/' + model.path;
  if (!Object.keys(result.metafile.inputs).some(path => path.replaceAll('\\', '/') === source)) throw new Error('Three-dimensional weapon not embedded: ' + id);
  const bytes = await readFile(source), sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== model.sha256) throw new Error('Three-dimensional weapon manifest mismatch: ' + id);
  return { id, source, sha256, bytes: bytes.length, triangles: model.triangles, meshes: model.meshCount,
    embedding: 'data URI in classic game.js', attachment: 'rigid child of calibrated hand bone in the same Three scene' };
}));
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
  embedding: 'PNG, skinned-player and rigid held-weapon GLB data URIs in classic game.js; no external asset paths or image fetches',
};
const player3D = { source: player3DPath, sha256: hash(player3DBytes), bytes: player3DBytes.length,
  format: 'glTF 2.0 GLB', runtime: { name: 'Three.js', version: threeVersion }, joints: 53, clips: 17,
  bodyLicense: 'Tripo Free: non-commercial evaluation', animationLicense: 'Mesh2Motion source motions: CC0', embedding: 'data URI in classic game.js' };
player3D.heldWeapons = heldWeapons3D;
const outputManifest = Object.fromEntries(await Promise.all(['index.html', 'game.js', 'game.css'].map(async name => [name, hash(await readFile(join(outputDirectory, name)))])));
await writeFile(join(outputDirectory, 'build-meta.json'), JSON.stringify({ game: 'viral-invasion', version, stage, format: 'iife', browserTargets, engine: { name: 'Phaser', version: engineVersion }, art, player3D, sourceManifest, outputManifest, ...result.metafile }, null, 2));
console.log(`Offline release ready: ${outputDirectory}/index.html + game.js (classic IIFE; Phaser ${engineVersion}; ${art.spriteIdCount} sprite IDs and ${art.environmentCount} environments embedded locally).`);
