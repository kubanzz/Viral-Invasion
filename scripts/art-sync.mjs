import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir, stat, rename } from 'node:fs/promises';
import { resolve, relative, dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_WORKSPACE = resolve(dirname(SCRIPT_PATH), '..');
const PIPELINE_VERSION = 1;
const MAX_ATLAS_SIZE = 2048;
const ATLAS_GUTTER = 4;
const MAX_GENERATED_BYTES = 20 * 1024 * 1024;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const slash = value => value.split(sep).join('/');
const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

function within(root, path) {
  const absolute = resolve(root, path);
  const rel = relative(resolve(root), absolute);
  if (!rel || rel.startsWith('..') || resolve(root, rel) !== absolute) throw new Error(`Unsafe asset path: ${path}`);
  return absolute;
}

async function optionalRead(path) {
  try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

async function existsDirectory(path) {
  try { return (await stat(path)).isDirectory(); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function inventory(root) {
  const files = new Map();
  async function visit(directory) {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Asset symlinks are not supported: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const name = slash(relative(root, path));
        // This curated registry belongs to the project, never to the incoming pack.
        if (name === 'art-selection.json') continue;
        const bytes = await readFile(path);
        files.set(name, { bytes, sha256: sha256(bytes) });
      }
    }
  }
  if (await existsDirectory(root)) await visit(root);
  return files;
}

async function writeChanged(path, bytes) {
  const old = await optionalRead(path);
  if (old?.equals(Buffer.from(bytes))) return false;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.art-sync-${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
  return true;
}

export function alphaBounds(data, width, height, channels = 4) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * channels + channels - 1] < 8) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < 0) throw new Error('A selected sprite contains no visible pixels');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function validateSelection(selection) {
  if (selection.schemaVersion !== 1 || !Array.isArray(selection.sprites) || !Array.isArray(selection.environments)) throw new Error('Unsupported art-selection.json schema');
  const ids = new Set();
  for (const asset of [...selection.sprites, ...selection.environments]) {
    for (const id of [asset.id, ...(asset.aliases ?? [])]) {
      if (!id || ids.has(id)) throw new Error(`Duplicate or empty art ID: ${id}`);
      ids.add(id);
    }
    if (!asset.source || !Number.isInteger(asset.size) || asset.size < 16 || asset.size > MAX_ATLAS_SIZE - ATLAS_GUTTER * 2) throw new Error(`Invalid source/size for ${asset.id}`);
    if (asset.pivotSource && (asset.pivotSource.length !== 2 || asset.pivotSource.some(v => !Number.isFinite(v) || v < 0 || v > 1))) throw new Error(`Invalid source pivot for ${asset.id}`);
    if (asset.expectedSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(asset.expectedSha256)) throw new Error(`Invalid expected source SHA-256 for ${asset.id}`);
    if (asset.sourceMuzzle !== undefined && (!asset.sourceMuzzle || !Number.isFinite(asset.sourceMuzzle.x) || !Number.isFinite(asset.sourceMuzzle.y) || asset.sourceMuzzle.x < 0 || asset.sourceMuzzle.y < 0)) throw new Error(`Invalid source muzzle for ${asset.id}`);
  }
}

async function renderSprite(sharp, bytes, spec) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (spec.sourceMuzzle && (spec.sourceMuzzle.x >= info.width || spec.sourceMuzzle.y >= info.height)) throw new Error(`Source muzzle outside original canvas for ${spec.id}`);
  const bounds = alphaBounds(data, info.width, info.height, info.channels);
  const crop = spec.trim === false ? { x: 0, y: 0, width: info.width, height: info.height } : bounds;
  const margin = spec.padding ?? 8;
  const scale = (spec.size - margin * 2) / Math.max(crop.width, crop.height);
  const width = Math.max(1, Math.round(crop.width * scale)), height = Math.max(1, Math.round(crop.height * scale));
  const sourceAnchor = spec.pivotSource ?? [.5, .9];
  const anchorX = (info.width * sourceAnchor[0] - crop.x) * width / crop.width;
  const anchorY = (info.height * sourceAnchor[1] - crop.y) * height / crop.height;
  const targetPivot = spec.centered ? [.5, .5] : [.5, .92];
  const left = Math.ceil(Math.max(spec.size * targetPivot[0], anchorX + margin));
  const top = Math.ceil(Math.max(spec.size * targetPivot[1], anchorY + margin));
  const right = Math.ceil(Math.max(spec.size * (1 - targetPivot[0]), width - anchorX + margin));
  const bottom = Math.ceil(Math.max(spec.size * (1 - targetPivot[1]), height - anchorY + margin));
  const outputWidth = left + right, outputHeight = top + bottom;
  const offsetX = Math.round(left - anchorX), offsetY = Math.round(top - anchorY);
  const content = await sharp(bytes).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).resize(width, height, { kernel: 'lanczos3' }).ensureAlpha().png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  const output = await sharp({ create: { width: outputWidth, height: outputHeight, channels: 4, background: '#00000000' } }).composite([{ input: content, left: offsetX, top: offsetY }]).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  return {
    spec, bytes: output, width: outputWidth, height: outputHeight,
    pivot: { x: left / outputWidth, y: top / outputHeight },
    visibleBounds: { x: offsetX + (bounds.x - crop.x) * width / crop.width, y: offsetY + (bounds.y - crop.y) * height / crop.height, width: bounds.width * width / crop.width, height: bounds.height * height / crop.height },
    sourceSize: { width: info.width, height: info.height }, sourceBounds: bounds,
    touchesSourceEdge: bounds.x === 0 || bounds.y === 0 || bounds.x + bounds.width === info.width || bounds.y + bounds.height === info.height,
  };
}

export function packShelves(sprites, maximumSize = MAX_ATLAS_SIZE, gutter = ATLAS_GUTTER) {
  const pages = [];
  let page;
  for (const sprite of [...sprites].sort((a, b) => b.height - a.height || b.width - a.width || a.spec.id.localeCompare(b.spec.id, 'en'))) {
    if (sprite.width + gutter * 2 > maximumSize || sprite.height + gutter * 2 > maximumSize) throw new Error(`Sprite ${sprite.spec.id} exceeds atlas limit ${maximumSize}`);
    if (!page) { page = { sprites: [], cursorX: gutter, cursorY: gutter, rowHeight: 0, width: 0, height: 0 }; pages.push(page); }
    if (page.cursorX + sprite.width + gutter > maximumSize) { page.cursorX = gutter; page.cursorY += page.rowHeight + gutter; page.rowHeight = 0; }
    if (page.cursorY + sprite.height + gutter > maximumSize) { page = { sprites: [], cursorX: gutter, cursorY: gutter, rowHeight: 0, width: 0, height: 0 }; pages.push(page); }
    page.sprites.push({ ...sprite, x: page.cursorX, y: page.cursorY });
    page.cursorX += sprite.width + gutter;
    page.rowHeight = Math.max(page.rowHeight, sprite.height);
    page.width = Math.max(page.width, page.cursorX);
    page.height = Math.max(page.height, page.cursorY + sprite.height + gutter);
  }
  return pages;
}

/** Builds offline-ready PNG atlases from the workspace; an incoming source is opt-in. */
export async function syncArt(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot ?? DEFAULT_WORKSPACE);
  const localRoot = resolve(options.localRoot ?? join(workspaceRoot, 'asserts'));
  // The workspace is authoritative. A machine-specific legacy directory or
  // environment variable must never silently overwrite its originals.
  const sourceRoot = resolve(options.sourceRoot ?? localRoot);
  const outputDirectory = resolve(options.outputDirectory ?? join(workspaceRoot, '.art-generated'));
  const selectionPath = resolve(options.selectionPath ?? join(localRoot, 'art-selection.json'));
  const checkOnly = options.checkOnly ?? false;
  const selectionBytes = await readFile(selectionPath);
  const selection = JSON.parse(selectionBytes.toString('utf8'));
  validateSelection(selection);
  const sourceAvailable = await existsDirectory(sourceRoot);
  const source = sourceAvailable ? await inventory(sourceRoot) : new Map();
  const local = await inventory(localRoot);
  const required = [...selection.sprites, ...selection.environments];
  const verifyPinnedSources = (files, scope) => {
    const changed = required.filter(asset => asset.expectedSha256 && files.has(asset.source) && files.get(asset.source).sha256 !== asset.expectedSha256.toLowerCase());
    if (changed.length) throw new Error(`Selected art source identity mismatch (${scope}): ${changed.map(asset => asset.id).join(', ')}. Review the new original before updating its expectedSha256.`);
  };
  // A replacement incoming file must not overwrite an accepted pinned original.
  verifyPinnedSources(source, 'incoming');
  const newSourcePaths = [], changedSourcePaths = [], missingUpstreamPaths = [];
  if (sourceAvailable && !samePath(sourceRoot, localRoot)) {
    for (const [name, file] of source) {
      const previous = local.get(name);
      if (previous?.sha256 === file.sha256) continue;
      (previous ? changedSourcePaths : newSourcePaths).push(name);
      if (!checkOnly) { await writeChanged(within(localRoot, name), file.bytes); local.set(name, file); }
    }
    for (const name of local.keys()) if (!source.has(name)) missingUpstreamPaths.push(name);
  }
  const missing = required.filter(asset => !local.has(asset.source)).map(asset => ({ id: asset.id, source: asset.source }));
  if (missing.length) throw new Error(`Required art sources missing: ${missing.map(asset => `${asset.id} (${asset.source})`).join(', ')}`);
  verifyPinnedSources(local, 'local');
  const sourceManifest = Object.fromEntries([...new Set(required.map(asset => asset.source))].sort().map(path => [path, local.get(path).sha256]));
  const knownCandidates = new Set(selection.catalogue ?? required.map(asset => asset.source));
  const unknownCandidates = [...local.keys()].filter(path => /\.(png|jpg|jpeg|webp|kra|aseprite)$/i.test(path) && !/\/preview\//i.test(path) && !knownCandidates.has(path)).sort();
  const pending = required.filter(asset => asset.flags?.length).map(asset => ({ id: asset.id, status: asset.status, flags: asset.flags }));
  const selectionSha256 = sha256(selectionBytes), pipelineSha256 = sha256(await readFile(SCRIPT_PATH));
  // Candidate changes also invalidate review reports, even before an artist's
  // new file is selected for gameplay. Nothing is promoted automatically.
  const candidateSignature = sha256(JSON.stringify([...local].filter(([path]) => /\.(png|jpg|jpeg|webp|kra|aseprite)$/i.test(path)).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([path, file]) => [path, file.sha256])));
  const inputSignature = sha256(JSON.stringify({ pipelineVersion: PIPELINE_VERSION, selectionSha256, pipelineSha256, sourceManifest, candidateSignature }));
  const runtimePath = join(outputDirectory, 'art-runtime.json');
  const previousBytes = await optionalRead(runtimePath);
  let previous;
  try { previous = previousBytes ? JSON.parse(previousBytes.toString('utf8')) : undefined; } catch { /* A damaged generation is rebuilt, never silently accepted. */ }
  const report = { sourceAvailable, sourceMode: sourceAvailable && !samePath(sourceRoot, localRoot) ? 'external' : 'local-snapshot', newSourcePaths, changedSourcePaths, missingUpstreamPaths, unknownCandidates, missing, pending, selectedAssetCount: required.length, selectedSourceCount: Object.keys(sourceManifest).length };
  if (checkOnly) {
    if (newSourcePaths.length || changedSourcePaths.length) throw new Error(`Art sources need synchronization (${newSourcePaths.length} new, ${changedSourcePaths.length} changed); run node scripts/art-sync.mjs`);
    if (previous?.inputSignature !== inputSignature) throw new Error('Generated art is missing or stale; run node scripts/art-sync.mjs');
    validateRuntime(previous);
    return { runtime: previous, report, runtimePath, changed: false };
  }
  if (previous?.inputSignature === inputSignature) {
    validateRuntime(previous);
    await writeChanged(join(outputDirectory, 'art-sync-report.json'), JSON.stringify({ ...report, inputSignature, runtimeBytes: previousBytes.length, atlasBytes: previous.atlases.reduce((sum, atlas) => sum + atlas.bytes, 0) }, null, 2));
    return { runtime: previous, report, runtimePath, changed: false };
  }
  const { default: sharp } = await import('sharp');
  const sprites = [];
  for (const spec of selection.sprites) sprites.push(await renderSprite(sharp, local.get(spec.source).bytes, spec));
  const atlases = [], assets = {};
  for (const [pageIndex, page] of packShelves(sprites).entries()) {
    const key = `viral-art-${pageIndex}`;
    const png = await sharp({ create: { width: page.width, height: page.height, channels: 4, background: '#00000000' } }).composite(page.sprites.map(sprite => ({ input: sprite.bytes, left: sprite.x, top: sprite.y }))).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
    const frames = {};
    for (const sprite of page.sprites) {
      const { spec } = sprite;
      frames[spec.id] = { frame: { x: sprite.x, y: sprite.y, w: sprite.width, h: sprite.height }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: sprite.width, h: sprite.height }, sourceSize: { w: sprite.width, h: sprite.height } };
      const descriptor = { atlas: key, frame: spec.id, width: sprite.width, height: sprite.height, pivot: sprite.pivot, visibleBounds: sprite.visibleBounds, source: spec.source, sourceSha256: local.get(spec.source).sha256, sourceSize: sprite.sourceSize, sourceBounds: sprite.sourceBounds, touchesSourceEdge: sprite.touchesSourceEdge, status: spec.status ?? 'prototype', flags: spec.flags ?? [], ...(spec.animation ? { animation: spec.animation } : {}) };
      if (spec.sourceMuzzle) descriptor.sourceMuzzle = { ...spec.sourceMuzzle };
      assets[spec.id] = descriptor;
      for (const alias of spec.aliases ?? []) assets[alias] = { ...descriptor, aliasOf: spec.id };
    }
    const data = { frames, meta: { app: 'Viral Invasion art-sync', version: '1', image: `${key}.png`, format: 'RGBA8888', size: { w: page.width, h: page.height }, scale: '1' } };
    atlases.push({ key, dataUri: `data:image/png;base64,${png.toString('base64')}`, data, sha256: sha256(png), bytes: png.length });
    await writeChanged(join(outputDirectory, `${key}.png`), png);
    await writeChanged(join(outputDirectory, `${key}.json`), JSON.stringify(data, null, 2));
  }
  const environments = {};
  for (const spec of selection.environments) {
    let image = sharp(local.get(spec.source).bytes);
    const metadata = await image.metadata();
    if (spec.crop) image = image.extract(spec.crop);
    const { data: png, info } = await image.resize({ width: spec.size, withoutEnlargement: true, kernel: 'lanczos3' }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer({ resolveWithObject: true });
    environments[spec.id] = { dataUri: `data:image/png;base64,${png.toString('base64')}`, width: info.width, height: info.height, source: spec.source, sourceSha256: local.get(spec.source).sha256, sourceSize: { width: metadata.width, height: metadata.height }, crop: spec.crop ?? null, status: spec.status ?? 'prototype', flags: spec.flags ?? [], bytes: png.length, sha256: sha256(png) };
    await writeChanged(join(outputDirectory, `${spec.id}.png`), png);
  }
  const runtime = { schemaVersion: 1, pipelineVersion: PIPELINE_VERSION, inputSignature, selectionSha256, pipelineSha256, candidateSignature, sourceManifest, atlases, assets, environments, report: { unknownCandidates, missing, pending, selectedAssetCount: required.length, selectedSourceCount: Object.keys(sourceManifest).length } };
  validateRuntime(runtime);
  const runtimeBytes = Buffer.from(JSON.stringify(runtime));
  if (runtimeBytes.length > MAX_GENERATED_BYTES) throw new Error(`Generated runtime exceeds 20MB budget: ${runtimeBytes.length}`);
  await writeChanged(runtimePath, runtimeBytes);
  await writeChanged(join(outputDirectory, 'art-sync-report.json'), JSON.stringify({ ...report, inputSignature, runtimeBytes: runtimeBytes.length, atlasBytes: atlases.reduce((sum, atlas) => sum + atlas.bytes, 0) }, null, 2));
  return { runtime, report, runtimePath, changed: true };
}

export function validateRuntime(runtime) {
  if (runtime.schemaVersion !== 1 || !Array.isArray(runtime.atlases) || !runtime.assets || !runtime.environments) throw new Error('Invalid generated art schema');
  const atlasMap = new Map(runtime.atlases.map(atlas => [atlas.key, atlas]));
  for (const atlas of runtime.atlases) {
    if (atlas.data.meta.size.w > MAX_ATLAS_SIZE || atlas.data.meta.size.h > MAX_ATLAS_SIZE) throw new Error(`Atlas ${atlas.key} exceeds maximum texture size`);
    if (!atlas.dataUri.startsWith('data:image/png;base64,') || sha256(Buffer.from(atlas.dataUri.split(',')[1], 'base64')) !== atlas.sha256) throw new Error(`Atlas ${atlas.key} has invalid image data`);
  }
  for (const [id, asset] of Object.entries(runtime.assets)) {
    const atlas = atlasMap.get(asset.atlas), frame = atlas?.data.frames[asset.frame]?.frame;
    if (!frame || frame.x < 0 || frame.y < 0 || frame.x + frame.w > atlas.data.meta.size.w || frame.y + frame.h > atlas.data.meta.size.h) throw new Error(`Invalid atlas frame for ${id}`);
    if (asset.pivot.x < 0 || asset.pivot.x > 1 || asset.pivot.y < 0 || asset.pivot.y > 1) throw new Error(`Invalid pivot for ${id}`);
  }
  for (const [id, environment] of Object.entries(runtime.environments)) if (!environment.dataUri.startsWith('data:image/png;base64,') || sha256(Buffer.from(environment.dataUri.split(',')[1], 'base64')) !== environment.sha256) throw new Error(`Environment ${id} has invalid image data`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await syncArt({ checkOnly: process.argv.includes('--check') });
    console.log(`Art ${process.argv.includes('--check') ? 'verified' : result.changed ? 'generated' : 'unchanged'}: ${result.runtime.atlases.length} atlas(es), ${Object.keys(result.runtime.assets).length} sprite IDs, ${Object.keys(result.runtime.environments).length} environments. Source: ${result.report.sourceMode}; +${result.report.newSourcePaths.length}/~${result.report.changedSourcePaths.length}, ${result.report.unknownCandidates.length} unreviewed candidate(s).`);
  } catch (error) { console.error(`Art pipeline failed: ${error.message}`); process.exitCode = 1; }
}
