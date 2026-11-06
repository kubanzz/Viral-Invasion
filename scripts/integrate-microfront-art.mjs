import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { syncArt } from './art-sync.mjs';

// Source adoption only. Producer receipts/originals remain immutable, and this
// script establishes no Main Renderer approval. Run after the root's inspection.
const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = 'ViralInvasion_Microfront_v1';
const STATUS = 'producer-ready-pending-main-renderer';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = path => path.split(sep).join('/');
const parseJson = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const near = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && actual.every((value, i) => Number.isFinite(value) && Math.abs(value - expected[i]) < 1e-6);
const MAPPINGS = {
  'ground.healthy': ['environments', ['fantasy.floor.healthy']],
  'ground.infected': ['environments', ['fantasy.floor.infected']],
  'obstacle.protein-fibers': ['sprites', ['fantasy.tree.healthy', 'fantasy.tree.infected', 'fantasy.lung.tree.healthy', 'fantasy.lung.tree.infected']],
  'obstacle.membrane-folds': ['sprites', ['fantasy.rock.healthy', 'fantasy.rock.infected', 'fantasy.lung.rock.healthy', 'fantasy.lung.rock.infected']],
  'anchor.healthy': ['sprites', ['fantasy.core.healthy']],
  'anchor.infected': ['sprites', ['fantasy.core.infected']],
  'nutrient.healthy': ['sprites', ['fantasy.healing.healthy', 'fantasy.healing.recovering']],
  'nutrient.infected': ['sprites', ['fantasy.healing.infected']],
  'summon.bloodstream-platform': ['sprites', ['microfront.camp.summon']],
  'summon.golden-antibody': ['sprites', ['microfront.gold-antibody']],
  'icon.model-fragment': ['sprites', ['microfront.fragment']],
  'icon.divine-forge-core': ['sprites', ['microfront.forge-core']],
  'camp.warehouse': ['sprites', ['microfront.camp.warehouse']],
  'camp.workshop': ['sprites', ['microfront.camp.forge']],
  'camp.supply': ['sprites', ['microfront.camp.shop']],
  'camp.departure': ['sprites', ['microfront.camp.departure']],
  'camp.ground.workshop': ['environments', ['fantasy.camp.ground.workshop']],
  'camp.ground.supply': ['environments', ['fantasy.camp.ground.supply']],
  'camp.ground.departure': ['environments', ['fantasy.camp.ground.departure']],
};

function inside(root, path) {
  const rel = relative(root, path);
  return !!rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}
function relativeParts(path, label) {
  assert.equal(typeof path, 'string', `${label} needs a relative path`);
  assert.ok(path && !isAbsolute(path) && !win32.isAbsolute(path), `${label} must be relative`);
  const parts = path.split(/[\\/]/);
  assert.ok(parts.every(part => part && part !== '.' && part !== '..' && !/[:\0]/.test(part)), `${label} escapes its source directory`);
  return parts;
}
async function guardedFile(root, path, { allowAbsolute = false } = {}) {
  const target = allowAbsolute && (isAbsolute(path) || win32.isAbsolute(path)) ? resolve(path) : resolve(root, ...relativeParts(path, 'Asset path'));
  assert.ok(inside(root, target), `Source is outside Microfront: ${path}`);
  let current = target;
  while (current !== root) {
    const metadata = await lstat(current);
    assert.ok(!metadata.isSymbolicLink(), `Symlink/junction is not allowed: ${current}`);
    if (current === target) assert.ok(metadata.isFile(), `Not a regular source file: ${current}`);
    else assert.ok(metadata.isDirectory(), `Not a source directory: ${current}`);
    current = dirname(current);
  }
  const canonical = await realpath(target);
  assert.ok(inside(root, canonical), `Resolved source escapes Microfront: ${path}`);
  return canonical;
}
async function inspectPng(bytes) {
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, 'png', 'Delivery must be PNG');
  const { data, info } = await sharp(bytes).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1, transparent = 0, partial = 0, opaque = 0, borderVisible = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * info.channels + info.channels - 1];
    if (!alpha) { transparent++; continue; }
    if (alpha === 255) opaque++; else partial++;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    if (!x || !y || x === info.width - 1 || y === info.height - 1) borderVisible++;
  }
  return { dimensions: [info.width, info.height], hasAlpha: !!metadata.hasAlpha,
    alpha: { transparent, partial, opaque, borderVisible, bbox: right < 0 ? null : [left, top, right + 1, bottom + 1],
      minimumMargin: right < 0 ? null : Math.min(left, top, info.width - right - 1, info.height - bottom - 1) } };
}
function validateRegistration(item, definition, contract, inspected) {
  const registration = item.registration;
  assert.ok(registration && typeof registration === 'object', `Missing registration: ${item.key}`);
  assert.ok(near(registration.targetCanvas, definition.targetCanvas), `Registration canvas mismatch: ${item.key}`);
  assert.equal(item.trim, false, `Producer full-canvas registration missing: ${item.key}`);
  if (definition.kind === 'tile') {
    assert.equal(inspected.hasAlpha, false, `Tile must be opaque RGB: ${item.key}`);
    assert.equal(inspected.alpha.transparent + inspected.alpha.partial, 0, `Tile contains transparency: ${item.key}`);
    assert.equal(item.tileability?.passed, true, `Producer tileability review missing: ${item.key}`);
    assert.equal(item.finalVisualReview?.tileability?.passed, true, `Hash-bound tile visual review missing: ${item.key}`);
    return;
  }
  assert.ok(inspected.hasAlpha && inspected.alpha.transparent > 0 && inspected.alpha.bbox, `Real transparent nonempty sprite required: ${item.key}`);
  assert.equal(inspected.alpha.borderVisible, 0, `Subject touches canvas border: ${item.key}`);
  assert.ok(inspected.alpha.minimumMargin >= 8, `Transparent safety margin below 8 pixels: ${item.key}`);
  assert.deepEqual(item.alphaBounds, inspected.alpha.bbox, `Producer alpha bounds mismatch: ${item.key}`);
  if (definition.kind === 'camp-ground') {
    for (const name of ['targetCenter', 'contentRect', 'worldCanvasSize']) assert.deepEqual(registration[name], definition[name], `Camp ${name} mismatch: ${item.key}`);
    const [left, top, width, height] = registration.contentRect;
    assert.ok([left, top, width, height].every(Number.isInteger) && left >= 0 && top >= 0 && width > 0 && height > 0
      && left + width <= inspected.dimensions[0] && top + height <= inspected.dimensions[1], `Invalid registered crop: ${item.key}`);
    assert.equal(registration.nonUniformStretch, false, `Camp source was stretched: ${item.key}`);
    assert.equal(registration.sourceYCompressed, false, `Camp source already compressed: ${item.key}`);
    assert.equal(registration.applyWorldYScaleToArt, true, `Camp runtime projection missing: ${item.key}`);
    assert.equal(registration.runtimeWorldYScale, .72, `Camp projection scale mismatch: ${item.key}`);
    assert.equal(registration.sourceProjection, 'orthographic-top-down-world-xy', `Camp projection mismatch: ${item.key}`);
    assert.equal(registration.boundaryMode, 'code-owned', `Camp boundary policy mismatch: ${item.key}`);
    assert.equal(item.finalVisualReview?.checks?.legacyLayoutPreserved, true, `Camp layout visual review missing: ${item.key}`);
    return;
  }
  if (definition.kind === 'icon') {
    assert.ok(near(item.pivot, [.5, .5]) && near(registration.pivot, [.5, .5]), `Icon pivot mismatch: ${item.key}`);
    assert.ok(near(registration.targetCenter, definition.targetCanvas.map(value => value / 2)), `Icon center mismatch: ${item.key}`);
    return;
  }
  assert.equal(definition.kind, 'sprite', `Unsupported contract kind: ${definition.kind}`);
  assert.ok(near(item.foot, definition.targetGround) && near(registration.targetGround, definition.targetGround), `Foot registration mismatch: ${item.key}`);
  const pivot = definition.targetGround.map((value, index) => value / definition.targetCanvas[index]);
  assert.ok(near(item.pivot, pivot) && near(registration.pivot, pivot), `Source pivot mismatch: ${item.key}`);
  assert.equal(registration.trim, false, `Registered object was trimmed: ${item.key}`);
  assert.ok(Number.isFinite(registration.uniformScale) && registration.uniformScale > 0, `Invalid registration scale: ${item.key}`);
  const bounds = inspected.alpha.bbox, fraction = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]) / Math.max(...inspected.dimensions);
  const [minimum, maximum] = definition.visibleMaxAxisFraction ?? contract.objectContract.visibleMaxAxisFraction;
  assert.ok(fraction >= minimum && fraction <= maximum, `Visible subject fraction violates contract: ${item.key}`);
}
function selectionSpecs(item, source, receipt, definition) {
  const [collection, ids] = MAPPINGS[item.key], icon = definition.kind === 'icon';
  const provenance = { theme: PACK, key: item.key, producerStatus: STATUS, receipt: receipt.path, receiptSha256: receipt.sha256,
    runId: item.runId, sourceNodeId: item.sourceNodeId ?? null, rawSource: structuredClone(item.source),
    finalVisualReview: structuredClone(item.finalVisualReview), mainRendererApproved: false };
  return ids.map(id => {
    const common = { id, source, expectedSha256: item.sha256.toLowerCase(), size: collection === 'environments' ? 512 : icon ? 128 : 384,
      status: STATUS, flags: ['microfront-v1', STATUS, ...(definition.kind === 'tile' ? ['producer-tileability-reviewed'] : ['registered-source-canvas'])],
      producer: provenance, registration: structuredClone(item.registration) };
    if (collection === 'environments') {
      const rect = item.registration.contentRect;
      return { collection, spec: definition.kind === 'camp-ground' ? { ...common, crop: { left: rect[0], top: rect[1], width: rect[2], height: rect[3] } } : common };
    }
    const foot = icon ? definition.targetCanvas.map(value => value / 2) : item.foot;
    return { collection, spec: { ...common, trim: false, centered: icon, pivotSource: icon ? [.5, .5] : [.5, .85],
      sourceFrame: { x: 0, y: 0, width: definition.targetCanvas[0], height: definition.targetCanvas[1] },
      actorRegistration: { canvas: { width: definition.targetCanvas[0], height: definition.targetCanvas[1] }, foot: { x: foot[0], y: foot[1] }, commonCanvasScale: 1 } } };
  });
}
function mergeSelection(bytes, entries) {
  const selected = parseJson(bytes);
  assert.equal(selected.schemaVersion, 1, 'Unsupported art selection');
  assert.ok(Array.isArray(selected.sprites) && Array.isArray(selected.environments), 'Missing art selection collections');
  if (selected.catalogue !== undefined) assert.ok(Array.isArray(selected.catalogue), 'Selection catalogue must remain an array');
  const replacements = [];
  for (const { collection, spec } of entries) {
    const list = selected[collection], index = list.findIndex(entry => entry.id === spec.id);
    const old = index < 0 ? undefined : list[index];
    const replacement = { ...spec, ...(old?.aliases ? { aliases: [...old.aliases] } : {}) };
    if (index < 0) list.push(replacement); else list[index] = replacement;
    if (Array.isArray(selected.catalogue) && !selected.catalogue.includes(spec.source)) selected.catalogue.push(spec.source);
    replacements.push({ id: spec.id, collection, previous: old ? { source: old.source, expectedSha256: old.expectedSha256 ?? null } : null });
  }
  const ids = new Set();
  for (const item of [...selected.sprites, ...selected.environments]) for (const id of [item.id, ...(item.aliases ?? [])]) {
    assert.ok(typeof id === 'string' && id && !ids.has(id), `Duplicate selected ID or alias: ${id}`); ids.add(id);
  }
  return { bytes: Buffer.from(JSON.stringify(selected, null, 2) + '\n'), replacements };
}
async function mergeWithoutClobber(selectionPath, entries) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const before = await readFile(selectionPath), result = mergeSelection(before, entries);
    // Another art chat may have selected unrelated assets while PNGs were read.
    // Re-read and re-merge rather than replacing its newer selection snapshot.
    if (sha(await readFile(selectionPath)) !== sha(before)) continue;
    if (result.bytes.equals(before)) return { beforeSha256: sha(before), afterSha256: sha(before), changed: false, retries: attempt, replacements: result.replacements };
    const temporary = `${selectionPath}.microfront-${process.pid}-${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, result.bytes, { flag: 'wx' });
      if (sha(await readFile(selectionPath)) !== sha(before)) continue;
      await rename(temporary, selectionPath);
      return { beforeSha256: sha(before), afterSha256: sha(result.bytes), changed: true, retries: attempt, replacements: result.replacements };
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  throw Error('art-selection.json kept changing; no stale snapshot was adopted. Retry after the other art chat finishes.');
}
async function optionalFile(path) { try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function writeReport(path, report) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(report, null, 2) + '\n'); }

export async function integrateMicrofrontArt(options = {}) {
  const workspace = await realpath(resolve(options.workspaceRoot ?? WORKSPACE)), packRoot = await realpath(join(workspace, 'asserts', PACK));
  const selectionPath = join(workspace, 'asserts', 'art-selection.json'), reportPath = join(workspace, 'artifacts', 'microfront-20261106', 'art-intake.json');
  const contractPath = await guardedFile(packRoot, 'production/asset-contract.json'), contractBytes = await readFile(contractPath), contract = parseJson(contractBytes);
  assert.equal(contract.schemaVersion, 1); assert.equal(contract.theme, PACK);
  assert.equal(contract.assets?.length, 12, 'The required A/B contract must contain all 12 assets');
  const definitions = [...contract.assets, ...(contract.optionalAssets ?? [])], byKey = new Map(definitions.map(item => [item.key, item]));
  assert.equal(byKey.size, definitions.length, 'Duplicate contract keys');
  for (const definition of definitions) assert.ok(MAPPINGS[definition.key], `Unknown runtime mapping: ${definition.key}`);
  let deliveries = options.deliveries;
  if (!deliveries?.length) {
    deliveries = ['delivery.json'];
    if (await optionalFile(join(packRoot, 'delivery-c.json'))) deliveries.push('delivery-c.json');
  }
  const receipts = [], sources = new Map(), pins = [{ path: contractPath, sha256: sha(contractBytes) }], receiptKeys = new Map();
  for (const requested of deliveries) {
    const repositoryPrefix = `asserts/${PACK}/`;
    const deliveryArgument = requested.replaceAll('\\', '/').startsWith(repositoryPrefix) ? resolve(workspace, requested) : requested;
    const deliveryPath = await guardedFile(packRoot, deliveryArgument, { allowAbsolute: true }), bytes = await readFile(deliveryPath), delivery = parseJson(bytes);
    assert.equal(delivery.schemaVersion, 1); assert.equal(delivery.theme, PACK); assert.equal(delivery.status, STATUS);
    assert.ok(Array.isArray(delivery.assets) && delivery.assets.length, 'Producer receipt has no delivered assets');
    assert.equal(delivery.deliveredRuntimeCount, delivery.assets.length, 'Producer delivery count mismatch');
    assert.equal(new Set(delivery.assets.map(item => item.key)).size, delivery.assets.length, 'Duplicate producer asset keys');
    const receipt = { path: slash(relative(workspace, deliveryPath)), sha256: sha(bytes), batch: delivery.batch ?? null,
      deliveredCount: delivery.assets.length, producerStatus: STATUS, mainRendererApproved: false };
    receipts.push(receipt); pins.push({ path: deliveryPath, sha256: receipt.sha256 });
    for (const item of delivery.assets) {
      const definition = byKey.get(item.key); assert.ok(definition, `Uncontracted delivered asset: ${item.key}`);
      assert.equal(item.kind, definition.kind, `Producer kind mismatch: ${item.key}`);
      assert.equal(item.path.replaceAll('\\', '/'), definition.path.replaceAll('\\', '/'), `Unexpected output path: ${item.key}`);
      const identity = JSON.stringify([item.path, item.sha256, item.registration, item.pivot, item.foot, item.trim]);
      if (sources.has(item.key)) { assert.equal(receiptKeys.get(item.key), identity, `Conflicting receipts for ${item.key}`); continue; }
      assert.match(item.sha256, /^[a-f\d]{64}$/i, `Missing output SHA-256: ${item.key}`);
      assert.ok(typeof item.runId === 'string' && item.runId.trim(), `Missing generation run provenance: ${item.key}`);
      assert.equal(item.finalVisualReview?.key, item.key); assert.equal(item.finalVisualReview?.passed, true, `Producer final review missing: ${item.key}`);
      assert.equal(item.finalVisualReview?.outputSha256?.toLowerCase(), item.sha256.toLowerCase(), `Review refers to different pixels: ${item.key}`);
      assert.ok(typeof item.finalVisualReview?.reviewer === 'string' && item.finalVisualReview.reviewer.trim(), `Producer reviewer missing: ${item.key}`);
      const absolute = await guardedFile(packRoot, item.path), outputBytes = await readFile(absolute), inspected = await inspectPng(outputBytes);
      assert.equal(sha(outputBytes), item.sha256.toLowerCase(), `Delivered source changed: ${item.key}`);
      assert.deepEqual(inspected.dimensions, definition.targetCanvas, `Contract dimensions mismatch: ${item.key}`);
      assert.deepEqual(item.dimensions, inspected.dimensions, `Receipt dimensions mismatch: ${item.key}`);
      if (item.bytes !== undefined) assert.equal(item.bytes, outputBytes.length, `Receipt byte count mismatch: ${item.key}`);
      for (const name of ['transparent', 'partial', 'opaque', 'borderVisible']) assert.equal(item.actualAlpha?.[name], inspected.alpha[name], `Receipt alpha count mismatch (${name}): ${item.key}`);
      validateRegistration(item, definition, contract, inspected);
      const raw = item.source;
      assert.ok(raw && typeof raw.path === 'string' && /^[a-f\d]{64}$/i.test(raw.sha256), `Raw source provenance missing: ${item.key}`);
      const rawPath = await guardedFile(packRoot, raw.path), rawBytes = await readFile(rawPath);
      assert.equal(sha(rawBytes), raw.sha256.toLowerCase(), `Original source drifted: ${item.key}`);
      pins.push({ path: absolute, sha256: item.sha256.toLowerCase() }, { path: rawPath, sha256: raw.sha256.toLowerCase() });
      assert.ok(item.qa && typeof item.qa === 'object' && Object.keys(item.qa).length, `Producer QA evidence missing: ${item.key}`);
      for (const [name, proof] of Object.entries(item.qa)) {
        const proofPath = await guardedFile(packRoot, proof.path), proofBytes = await readFile(proofPath);
        assert.equal(sha(proofBytes), proof.sha256?.toLowerCase(), `QA evidence drift (${name}): ${item.key}`);
        pins.push({ path: proofPath, sha256: sha(proofBytes) });
      }
      const source = `${PACK}/${slash(relative(packRoot, absolute))}`;
      sources.set(item.key, { item, definition, source, inspected, receipt, bytes: outputBytes.length }); receiptKeys.set(item.key, identity);
    }
  }
  const missingRequired = contract.assets.filter(item => !sources.has(item.key)).map(item => item.key);
  if (!options.partial) assert.equal(missingRequired.length, 0, `A/B delivery incomplete: ${missingRequired.join(', ')}. Use --partial only for an explicitly partial adoption.`);
  const entries = [...sources.values()].flatMap(value => selectionSpecs(value.item, value.source, value.receipt, value.definition));
  assert.ok(entries.length, 'Nothing eligible for runtime selection');
  for (const pin of pins) assert.equal(sha(await readFile(pin.path)), pin.sha256, `Receipt/source changed during verification: ${pin.path}`);
  const merged = await mergeWithoutClobber(selectionPath, entries);
  const report = { schemaVersion: 1, theme: PACK, createdAt: new Date().toISOString(), status: options.partial ? 'partial-source-intake-pending-main-renderer' : STATUS,
    partial: !!options.partial, completed: false, mainRendererApproved: false, contract: { path: slash(relative(workspace, contractPath)), sha256: sha(contractBytes) },
    producerReceipts: receipts, requiredRuntimeCount: contract.assets.length, adoptedRequiredRuntimeCount: contract.assets.filter(item => sources.has(item.key)).length,
    adoptedOptionalRuntimeCount: [...sources.values()].filter(value => !contract.assets.some(item => item.key === value.item.key)).length,
    missingRequired, missingOptional: (contract.optionalAssets ?? []).filter(item => !sources.has(item.key)).map(item => item.key), selection: merged,
    assets: [...sources.values()].map(value => ({ key: value.item.key, path: value.source, sha256: value.item.sha256, bytes: value.bytes,
      dimensions: value.inspected.dimensions, actualAlpha: value.inspected.alpha, registration: value.item.registration,
      rawSource: value.item.source, producerReceipt: value.receipt.path, runtimeIds: MAPPINGS[value.item.key][1] })),
    sync: { status: 'pending' }, approvalBoundary: 'Identity, alpha, registration and producer review verified. Source adoption and art-sync do not establish actual scene-scale, overlap or Main Renderer visual approval.' };
  await writeReport(reportPath, report);
  try {
    const synced = await syncArt({ workspaceRoot: workspace, selectionPath });
    report.sync = { status: 'succeeded', inputSignature: synced.runtime.inputSignature, selectedSprites: Object.keys(synced.runtime.assets).length,
      environments: Object.keys(synced.runtime.environments).length, adoptedTones: Object.fromEntries(entries.map(({ collection, spec }) => [spec.id,
        (collection === 'environments' ? synced.runtime.environments[spec.id] : synced.runtime.assets[spec.id])?.tone ?? null])) };
    await writeReport(reportPath, report); return report;
  } catch (error) { report.sync = { status: 'failed', error: error.message }; await writeReport(reportPath, report); throw error; }
}

async function main() {
  const args = process.argv.slice(2), deliveries = []; let partial = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--partial') partial = true;
    else if (args[i].startsWith('--delivery=')) deliveries.push(args[i].slice('--delivery='.length));
    else if (args[i] === '--delivery') { assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), '--delivery needs a path'); deliveries.push(args[++i]); }
    else if (args[i] === '--help') {
      console.log('node scripts/integrate-microfront-art.mjs [--partial] [--delivery=path ...]\nDefault: require all 12 A/B assets from delivery.json, additionally adopt delivery-c.json if present. Explicit receipt paths are relative to the Microfront pack (or absolute inside it). --partial never claims completion. This command changes selection, runs art-sync, and writes artifacts/microfront-20261106/art-intake.json; inspect sources before running.');
      return;
    } else throw Error(`Unknown argument: ${args[i]}`);
  }
  const report = await integrateMicrofrontArt({ partial, deliveries });
  console.log(JSON.stringify({ status: report.status, partial: report.partial, completed: false, mainRendererApproved: false,
    adoptedRequired: report.adoptedRequiredRuntimeCount, adoptedOptional: report.adoptedOptionalRuntimeCount, missingRequired: report.missingRequired,
    inputSignature: report.sync.inputSignature, report: 'artifacts/microfront-20261106/art-intake.json' }));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => {
  console.error(`Microfront source intake failed: ${error.message}`); process.exitCode = 1;
});
