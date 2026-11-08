import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist'); await mkdir(output, { recursive: true });
const modulePath = join(root, '../bladeMotion.ts');
const moduleSha256 = createHash('sha256').update(await readFile(modulePath)).digest('hex');
const result = await build({ entryPoints: [join(root, 'main.ts')], bundle: true, format: 'iife', minify: false, legalComments: 'none', target: ['chrome110', 'safari17.6'], outfile: join(output, 'viewer.js'), loader: { '.glb': 'dataurl' }, metafile: true });
if (createHash('sha256').update(await readFile(modulePath)).digest('hex') !== moduleSha256) throw new Error('Motion module changed during preview build; rebuild the candidate.');
const license = await readFile(join(root, '../../../node_modules/three/LICENSE'), 'utf8');
await writeFile(join(output, 'viewer.js'), (await readFile(join(output, 'viewer.js'), 'utf8')) + '\n/*! Three.js MIT license\n' + license.replaceAll('*/', '* /') + '\n*/\n');
await copyFile(join(root, 'index.html'), join(output, 'index.html'));
const hashes = {};
for (const name of ['index.html', 'viewer.js']) hashes[name] = createHash('sha256').update(await readFile(join(output, name))).digest('hex');
await writeFile(join(output, 'build-meta.json'), JSON.stringify({ description: 'Blade v0.22 genuine rig preview; original GLBs and Three bundled locally, no new GLB or CDN', moduleSha256, outputManifest: hashes, inputs: Object.keys(result.metafile.inputs), builtAt: new Date().toISOString() }, null, 2) + '\n');
console.log('Preview built: ' + output);

