import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectArtPng } from './inspect-art-png.mjs';

const workspaceDefault = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticAnimation = { isSequence: false, frameCount: 1, fullAnimationClaimed: false };
const reserved = new Set(['id', 'runtimeId', 'path', 'originalFileName', 'sha256', 'bytes', 'canvas', 'alpha', 'source', 'animation', 'review', 'importedAt']);

function relativeParts(value, name) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || win32.isAbsolute(value)) throw new Error(`${name} must be a relative path`);
  const parts = value.split(/[\\/]/);
  if (parts.some(part => !part || part === '.' || part === '..' || /[:\0]/.test(part) || /[.\s]$/.test(part)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part))) throw new Error(`${name} must stay inside its local art directory`);
  return parts;
}
function within(root, path) {
  const rel = relative(root, path);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`Path escapes local asserts: ${path}`);
}
async function directoryChain(root, parts, create = false) {
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if (create) await mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Art directory must be a real local directory: ${current}`);
  }
  return current;
}
async function plainFile(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Expected a regular local file: ${path}`);
}
async function changedJson(path, before, value) {
  const after = JSON.stringify(value, null, 2) + '\n';
  if (after === before) return false;
  // Refuse to replace a manifest/selection somebody changed during this intake.
  if (await readFile(path, 'utf8') !== before) throw new Error(`Art metadata changed during intake; read it again before retrying: ${path}`);
  await writeFile(path, after);
  return true;
}

/** Copies original PNG bytes and records explicit review. Never edits pixels or proves visual quality. */
export async function intakeChatgptArt(options) {
  const { input, id, path: assetPath, expectedSha256, select = false, visualAccepted = false,
    visualReview = '', intendedUse = '', size, pivotSource, flags = ['single-key-pose', 'missing-continuous-animation'],
    status = 'static-candidate', metadata = {} } = options;
  if (typeof id !== 'string' || !id.trim()) throw new Error('An explicit logical id is required');
  if (typeof input !== 'string' || !input) throw new Error('An input PNG path is required');
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedSha256)) throw new Error('An explicit expectedSha256 is required');
  if (typeof select !== 'boolean' || typeof visualAccepted !== 'boolean') throw new Error('select and visualAccepted must be booleans');
  if (typeof visualReview !== 'string' || typeof intendedUse !== 'string') throw new Error('Review and intended use must be text');
  if (typeof status !== 'string' || !status.trim()) throw new Error('status must be nonempty text');
  if (select && (!visualAccepted || !visualReview.trim())) throw new Error('Selecting artwork requires explicit visualAccepted:true and visualReview');
  if (select && (!Number.isInteger(size) || size < 16 || size > 2040 || !Array.isArray(pivotSource) || pivotSource.length !== 2 || pivotSource.some(n => !Number.isFinite(n) || n < 0 || n > 1))) throw new Error('Selecting artwork requires a size and normalized pivotSource');
  if (!Array.isArray(flags) || flags.some(flag => typeof flag !== 'string')) throw new Error('flags must be an array of strings');
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || Object.keys(metadata).some(key => reserved.has(key))) throw new Error('metadata must not replace inspected identity, provenance, review or animation fields');

  const workspace = await realpath(resolve(options.workspaceRoot ?? workspaceDefault));
  const localRoot = await directoryChain(workspace, ['asserts']);
  const batchParts = relativeParts(options.batch ?? 'ViralInvasion_Art_v1/batch09_runtime_completion', 'batch');
  const batchRoot = await directoryChain(localRoot, batchParts);
  const parts = relativeParts(assetPath, 'path'), filename = parts.at(-1);
  if (!/\.png$/i.test(filename)) throw new Error('The destination must be a PNG filename');
  const destination = resolve(batchRoot, ...parts);
  within(batchRoot, destination);
  const manifestPath = join(batchRoot, 'manifest.json');
  await plainFile(manifestPath);
  const manifestBefore = await readFile(manifestPath, 'utf8'), manifest = JSON.parse(manifestBefore);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets) || !manifest.source || typeof manifest.source !== 'object') throw new Error('An existing batch manifest with source provenance is required');
  const inspection = await inspectArtPng(input);
  if (inspection.sha256 !== expectedSha256.toLowerCase()) throw new Error('Input PNG does not match expectedSha256');
  if (!inspection.alpha.bounds) throw new Error('The input PNG has no visible pixels');
  if (select && (!inspection.canvas.hasAlpha || !inspection.alpha.transparentPixels)) throw new Error('Selected sprite must have real transparent pixels');
  const normalizedPath = parts.join('/'), source = [...batchParts, ...parts].join('/');
  const collision = manifest.assets.find(asset => asset.id === id || asset.path?.replaceAll('\\', '/').toLowerCase() === normalizedPath.toLowerCase());
  if (collision && (collision.id !== id || collision.path.replaceAll('\\', '/') !== normalizedPath || collision.sha256 !== inspection.sha256)) throw new Error('Manifest id/path already belongs to a different original; use a versioned id and filename');

  let selection, selectionBefore, selectionPath, spec;
  if (select) {
    selectionPath = join(localRoot, 'art-selection.json');
    await plainFile(selectionPath);
    selectionBefore = await readFile(selectionPath, 'utf8'); selection = JSON.parse(selectionBefore);
    if (selection.schemaVersion !== 1 || !Array.isArray(selection.sprites) || !Array.isArray(selection.environments)) throw new Error('Unsupported art selection schema');
    spec = selection.sprites.find(asset => asset.id === id);
    const aliasCollision = [...selection.sprites, ...selection.environments].find(asset => asset !== spec && (asset.id === id || asset.aliases?.includes(id)));
    if (aliasCollision || spec && (spec.source !== source || spec.expectedSha256 && spec.expectedSha256.toLowerCase() !== inspection.sha256)) throw new Error('Selected id already refers to a different source; review that replacement explicitly');
    const wanted = { id, source, size, pivotSource, expectedSha256: inspection.sha256, status: 'candidate', flags,
      visualAccepted: true, visualReview };
    if (spec) Object.assign(spec, wanted); else selection.sprites.push(wanted);
    if (selection.catalogue !== undefined && !Array.isArray(selection.catalogue)) throw new Error('Selection catalogue must be an array');
    selection.catalogue ??= [];
    if (!selection.catalogue.includes(source)) selection.catalogue.push(source);
  }

  await directoryChain(batchRoot, parts.slice(0, -1), true);
  let copied = false;
  try {
    // Recheck the source after copying too: a concurrently changed download is never accepted.
    await copyFile(resolve(input), destination, constants.COPYFILE_EXCL); copied = true;
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await plainFile(destination);
  if ((await inspectArtPng(destination)).sha256 !== inspection.sha256) throw new Error('Destination contains a different original; refusing to overwrite it');
  let recordAdded = false;
  if (!collision) {
    manifest.assets.push({ ...metadata, id, ...(select ? { runtimeId: id } : {}), path: normalizedPath,
      originalFileName: basename(resolve(input)), sha256: inspection.sha256, bytes: inspection.bytes,
      canvas: inspection.canvas, alpha: inspection.alpha, source: structuredClone(manifest.source), status,
      delivery: 'generated-and-downloaded', animation: { ...staticAnimation },
      review: { visual: visualAccepted ? 'accepted-by-root' : 'pending', visualNote: visualReview, runtime: 'pending' },
      intendedUse, importedAt: new Date().toISOString() });
    recordAdded = true;
  }
  // Existing records, including historical review/runtime fields, remain intact on retries.
  const manifestChanged = recordAdded && await changedJson(manifestPath, manifestBefore, manifest);
  const selectionChanged = select && await changedJson(selectionPath, selectionBefore, selection);
  return { id, path: destination, sha256: inspection.sha256, copied, recordAdded, manifestChanged: !!manifestChanged,
    selected: select, selectionChanged: !!selectionChanged, manifestPath, ...(select ? { selectionPath } : {}), source: manifest.source };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/intake-chatgpt-art.mjs --spec <intake.json>\n'
      + 'JSON fields: input, id, path (relative to batch), expectedSha256; optional batch (relative to local asserts), workspaceRoot, intendedUse, status, metadata.\n'
      + 'To select: select:true, visualAccepted:true, visualReview, size, pivotSource:[x,y], optional flags.\n'
      + 'Requires an existing batch manifest with provenance. Copies bytes only; does not generate art, prove visual acceptance, run art-sync or build.');
    return;
  }
  if (args.length !== 2 || args[0] !== '--spec') throw new Error('Usage: node scripts/intake-chatgpt-art.mjs --spec <intake.json>');
  console.log(JSON.stringify(await intakeChatgptArt(JSON.parse(await readFile(resolve(args[1]), 'utf8'))), null, 2));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => {
  console.error(`Art intake failed: ${error.message}`); process.exitCode = 1;
});
