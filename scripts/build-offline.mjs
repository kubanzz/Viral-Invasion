import { build } from 'esbuild';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { syncArt } from './art-sync.mjs';
import { syncPrologueMedia } from './prologue-v3/sync_media.mjs';

// Direct invocation also synchronizes and validates the embedded artwork.
const { runtime: artRuntime, runtimePath } = await syncArt();
const prologueSync = await syncPrologueMedia();
const outputDirectory = process.env.VI_DIST_DIR ?? 'dist';
await mkdir(outputDirectory, { recursive: true });
const browserTargets = ['chrome110', 'edge110', 'safari17.6'];
const vfxRoot='asserts/ViralInvasion_CombatVfx_v1';
async function vfxSources(folder){
  const output=[];for(const entry of await readdir(folder,{withFileTypes:true})){const file=join(folder,entry.name).replaceAll('\\','/');
    if(entry.isDirectory()){if(['source','production','textures'].includes(entry.name))output.push(...await vfxSources(file));}
    else if(/\.(?:json|efkefc|efkproj|xml|png|svg|txt|md)$/i.test(entry.name))output.push(file);}
  return output;
}
const vfxSourcePaths=await vfxSources(vfxRoot);
const result = await build({ entryPoints: ['src/main.ts'], bundle: true, format: 'iife', target: browserTargets, outfile: join(outputDirectory, 'game.js'), minify: true, metafile: true, legalComments: 'none', loader: { '.glb': 'dataurl', '.jpg': 'dataurl', '.mp4': 'dataurl' } });
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
  'scripts/build-legendary-weapons-3d.mjs', 'asserts/ViralInvasion_WeaponUltimates_v1/model-report.json',
  'asserts/ViralInvasion_BladeMotion_v022/delivery.json',
  'asserts/ViralInvasion_LivingWorld_v023/delivery.json',
  'asserts/ViralInvasion_Seraph_v024/delivery.json',
  'asserts/ViralInvasion_ThunderRework_v025/delivery.json',
  ...prologueSync.sources,
  'scripts/prologue-v3/sync_media.mjs', 'scripts/prologue-v3/render_all.mjs',
  'asserts/ViralInvasion_Prologue_v3/preview/organ-overview-style-match.png',
  'asserts/ViralInvasion_Prologue_v3/plates/body-overview.png',
  'asserts/ViralInvasion_Prologue_v3/plates/bloodflow-route.png',
  'scripts/prologue-v3/render_prologue.py', 'scripts/prologue-v3/assemble_movie.py', 'scripts/prologue-v3/make_score.py',
  'src/game/motherCoreTypes.ts', 'src/game/weaponSkillsTypes.ts', 'src/game/growthTypes.ts',
  'node_modules/phaser/package.json',
  ...noticePaths,
  ...vfxSourcePaths,
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
const legendaryManifest = JSON.parse(await readFile('asserts/ViralInvasion_WeaponUltimates_v1/model-report.json', 'utf8'));
for (const [id, model] of Object.entries(legendaryManifest.models)) {
  const source = 'asserts/ViralInvasion_WeaponUltimates_v1/' + model.path;
  if (!Object.keys(result.metafile.inputs).some(path => path.replaceAll('\\', '/') === source)) throw new Error('Legendary model not embedded: ' + id);
  const bytes = await readFile(source), sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== model.sha256) throw new Error('Legendary model hash mismatch: ' + id);
  heldWeapons3D.push({ id, source, sha256, bytes: bytes.length, triangles: model.triangles, meshes: model.materials.length,
    embedding: 'data URI in classic game.js', attachment: 'rigid child of calibrated hand bone in the same Three scene' });
}
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
  runtimeBudgetBytes:32*1024*1024,
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
player3D.authoredBladeClips = ['Blade_Ready','Blade_Slash_Right','Blade_Slash_Left','Blade_Finish','Blade_Dash',
  'Blade_Guard_v020','Blade_Counter_v020','Blade_FourfoldDash_v020','Blade_FinishSheath_v020','Blade_ChargeDraw_v022','Blade_FinishSettle_v022'];
const outputManifest = Object.fromEntries(await Promise.all(['index.html', 'game.js', 'game.css'].map(async name => [name, hash(await readFile(join(outputDirectory, name)))])));
const prologueMedia = prologueSync.sources;
const prologue = { durationSeconds: 33, shotCount: 6, ready: prologueSync.ready, runtime: prologueSync.ready ? 'HTMLVideoElement' : 'Phaser legacy opening', renderer: prologueSync.ready ? 'Blender 4.5 LTS / Eevee' : 'previous buildable opening',
  embedding: prologueSync.ready ? 'H.264/AAC film and approved poster embedded as data URIs; no external media requests.' : 'Previous opening retained while the new film is rendering.',
  provenance: prologueSync.ready ? 'asserts/ViralInvasion_Prologue_v3/manifest.json' : 'asserts/ViralInvasion_Prologue_v1/manifest.json',
  media: await Promise.all(prologueMedia.map(async path => ({ path, bytes: (await readFile(path)).length, sha256: sourceManifest[path.replaceAll('\\', '/')] }))) };
await writeFile(join(outputDirectory, 'build-meta.json'), JSON.stringify({ game: 'viral-invasion', version, stage, format: 'iife', browserTargets, engine: { name: 'Phaser', version: engineVersion }, art, player3D, prologue, sourceManifest, outputManifest, ...result.metafile }, null, 2));
console.log(`Offline release ready: ${outputDirectory}/index.html + game.js (classic IIFE; Phaser ${engineVersion}; ${art.spriteIdCount} sprite IDs and ${art.environmentCount} environments embedded locally).`);
