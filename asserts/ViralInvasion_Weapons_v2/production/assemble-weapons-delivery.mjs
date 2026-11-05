/**
 * Weapons v2 JSON/Markdown handoff only. No image writes, art selection or game changes.
 * Execute once after actual selected image / registration review:
 *   node asserts/ViralInvasion_Weapons_v2/production/assemble-weapons-delivery.mjs
 *
 * Required production/weapon-registration.json:
 * { assets: [{ key:'steady'|'piercing', id, path, sourceKey?, runId?,
 *   grip:[x,y], muzzle:[x,y], muzzleKind:'physical-bore-center'|'virtual-launch-exit',
 *   launchAxis:[1,0], axisOrigin?:[x,y], gripAnnotation, muzzleAnnotation,
 *   sourceReviewed:true, recommendedRuntimeTexture?:192, suggestedDisplayCanvasSize?:64 }] }
 * Source processing uses {sources:[{key,raw,output,registration,...}]}; output.path links
 * to the exact selected asset. Runs use the standard {runs:{requestKey:{runId,prompt,raw,...}}}.
 * Existing canonical output files are refused. Revisions require new versioned image paths.
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(PRODUCTION), REPO = resolve(ROOT, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = p => p.replaceAll('\\', '/');
const rootRel = p => slash(relative(ROOT, p));
const repoRel = p => slash(relative(REPO, p));
const pair = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const insideCanvas = p => pair(p) && p.every(v => v >= 0 && v <= 512);
const vecRight = p => pair(p) && Math.abs(p[0] - 1) < 1e-9 && Math.abs(p[1]) < 1e-9;

async function guard(file) {
  const absolute = resolve(ROOT, file), rel = relative(ROOT, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Output/read asset must stay inside Weapons_v2: ' + file);
  let cursor = absolute;
  for (;;) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Symlink paths are unsupported: ' + file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (cursor === ROOT) break; cursor = dirname(cursor);
  }
  return absolute;
}
async function readJson(file, fallback) {
  try { return JSON.parse((await readFile(await guard(file), 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
async function writeNew(file, value) {
  const absolute = await guard(file); await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
async function inspect(file, grip, sampleSize) {
  const absolute = await guard(file), buffer = await readFile(absolute), metadata = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, partial = 0, opaque = 0, hiddenRgb = 0, borderVisible = 0;
  let left = info.width, top = info.height, right = -1, bottom = -1, gripInkPixels = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const p = (y * info.width + x) * 4, a = data[p + 3];
    if (!a) { transparent++; if (data[p] || data[p + 1] || data[p + 2]) hiddenRgb++; }
    else if (a === 255) opaque++; else partial++;
    if (a && (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1)) borderVisible++;
    if (a < 8) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    if (pair(grip) && Math.hypot(x + .5 - grip[0], y + .5 - grip[1]) <= 6) gripInkPixels++;
  }
  const bbox = right < 0 ? null : [left, top, right + 1, bottom + 1];
  const sampled = await sharp(buffer).resize(sampleSize, sampleSize, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 }).toBuffer();
  return { path: rootRel(absolute), repositoryPath: repoRel(absolute), sha256: hash(buffer), bytes: buffer.length,
    dimensions: [metadata.width, metadata.height], format: metadata.format, channels: metadata.channels,
    hasAlphaChannel: metadata.hasAlpha === true, visibleBounds: bbox,
    margins: bbox ? { left, top, right: info.width - right - 1, bottom: info.height - bottom - 1 } : null,
    alpha: { transparent, partial, opaque, visible: partial + opaque, hiddenRgb, borderVisible,
      transparentFraction: transparent / (info.width * info.height) },
    gripInkPixelsWithin6px: gripInkPixels,
    sampledRuntime: { dimensions: [sampleSize, sampleSize], pngBytes: sampled.length, sha256: hash(sampled),
      method: 'in-memory full-canvas Lanczos3 resize, PNG9 encode; no sampled file written' } };
}

const [registration, processing, runsDocument, selection, visual] = await Promise.all([
  readJson('production/weapon-registration.json'), readJson('production/source-processing.json'),
  readJson('production/runs.json'), readJson('production/candidate-selection.json', { candidates: [] }),
  readJson('production/source-visual-review.json', null),
]);
const annotations = registration.assets ?? [];
const sources = processing.sources ?? processing.assets ?? [];
const runs = Object.values(runsDocument.runs ?? {});
const errors = [], warnings = [], checks = [], assets = [];
const check = (name, pass, details = {}) => { checks.push({ name, pass, ...details }); if (!pass) errors.push({ name, ...details }); };
check('two-runtime-weapons', annotations.length === 2 && new Set(annotations.map(a => a.key)).size === 2
  && ['steady', 'piercing'].every(key => annotations.some(a => a.key === key)));
check('unique-runtime-paths', new Set(annotations.map(a => a.path)).size === annotations.length);
check('unique-runtime-ids', new Set(annotations.map(a => a.id)).size === annotations.length);
check('main-fixed-runtime-ids', annotations.every(a => a.id === 'fantasy.weapon.' + a.key + '.held'));
for (const row of annotations) {
  const source = sources.find(s => s.key === row.sourceKey || s.key === row.key || s.output?.path === row.path || s.path === row.path);
  const runId = row.runId ?? source?.runId;
  const run = runs.find(r => r.runId === runId);
  const prompt = row.prompt ?? source?.prompt ?? run?.prompt;
  const image = await inspect(row.path, row.grip, row.recommendedRuntimeTexture ?? 192);
  check('runtime-png512-rgba', image.format === 'png' && image.dimensions[0] === 512 && image.dimensions[1] === 512 && image.hasAlphaChannel, { key: row.key });
  check('true-transparent-clear-border', image.alpha.transparent > 0 && image.alpha.visible > 0 && image.alpha.borderVisible === 0, { key: row.key });
  check('safe-visible-margins', image.margins && Object.values(image.margins).every(value => value >= 8), { key: row.key, margins: image.margins });
  check('grip-in-canvas-and-over-visible-handle', insideCanvas(row.grip) && image.gripInkPixelsWithin6px > 0, { key: row.key, grip: row.grip });
  check('muzzle-in-canvas', insideCanvas(row.muzzle), { key: row.key, muzzle: row.muzzle });
  check('explicit-rightward-launch-axis', vecRight(row.launchAxis), { key: row.key });
  check('actual-source-registration-review', row.sourceReviewed === true && Boolean(row.gripAnnotation) && Boolean(row.muzzleAnnotation), { key: row.key });
  check('actual-source-run-prompt-present', Boolean(source) && Boolean(runId) && typeof prompt === 'string' && prompt.length > 0 && Boolean(run), { key: row.key });
  check('current-processed-sha-matches', !source?.output?.sha256 || source.output.sha256 === image.sha256, { key: row.key });
  check('main-selected-final-v02', source?.sourceVersion === 'v02' && row.path.endsWith('_v02.png'), { key: row.key });
  if (image.alpha.hiddenRgb) warnings.push({ name: 'alpha-zero-hidden-rgb', key: row.key, pixels: image.alpha.hiddenRgb,
    explanation: 'Fully transparent palette pixels may retain RGB; alpha remains zero. Preserve reviewed PNG bytes; final Renderer filtering review belongs to main.' });
  assets.push({ key: row.key, id: row.id, kind: 'held-weapon', runtime: true, ...image,
    trim: false, sourceRect: { x: 0, y: 0, width: 512, height: 512 },
    grip: row.grip, muzzle: row.muzzle, sourceMuzzle: row.muzzle, sourceGrip: row.grip,
    pivot: row.grip?.map(v => v / 512), pivotSource: row.grip?.map(v => v / 512),
    actorRegistration: { canvas: [512, 512], foot: row.grip, grip: row.grip,
      commonCanvasScale: 1, trim: false, anchorKind: 'weapon-grip', pivotSource: row.grip?.map(v => v / 512) },
    animation: { group: row.id, index: 0, frameCount: 1, fps: 1, approved: true,
      approvalMeaning: 'Main-requested static integration flag; not final Renderer pixel approval.' },
    registration: { canvas: [512, 512], grip: row.grip, gripNormalized: row.grip?.map(v => v / 512),
      muzzle: row.muzzle, muzzleNormalized: row.muzzle?.map(v => v / 512), muzzleKind: row.muzzleKind,
      sourceMuzzle: row.muzzle,
      launchAxis: row.launchAxis, barrelAxis: row.launchAxis, axisAngleDeg: 0,
      axisOrigin: row.axisOrigin ?? source?.registration?.axisRear ?? null,
      gripToMuzzleIsNotAimAxis: true, gripToMuzzleIsNotBarrelAxis: true, commonCanvasScale: 1, trim: false,
      gripAnnotation: row.gripAnnotation, muzzleAnnotation: row.muzzleAnnotation,
      coordinateSystem: 'Untrimmed 512-square source pixels; continuous mirrorX = 512 - x.' },
    recommendedRuntimeTexture: row.recommendedRuntimeTexture ?? 192,
    suggestedDisplayCanvasSize: row.suggestedDisplayCanvasSize ?? null,
    worldLogicalCanvasWidth: row.worldLogicalCanvasWidth ?? row.suggestedDisplayCanvasSize ?? null,
    worldWidthAuthority: 'main-approved-64-steady-80-piercing',
    iconReuse: { samePngAllowed: true, noAdditionalRuntimeAssetRequired: true, iconPivot: [.5, .5],
      note: 'Inventory icon may draw the same complete PNG at center; held rendering pivots at measured grip.' },
    provenance: { runId, prompt, sourceKey: source?.key, raw: source?.raw ?? source?.source ?? null,
      sourceRegistration: source?.registration ?? source?.transform ?? null, sourceMethod: 'Maliang source design, selected candidate, transparent extraction and fixed registration; no fabricated animation frames.' },
    candidateStatus: row.candidateStatus ?? 'main-selected-v02-renderer-accepted', approved: registration.rendererAccepted === true,
    rendererAccepted: registration.rendererAccepted === true,
    approvalScope: 'Main reports actual Renderer held-weapon8/8 review passed. Final game build acceptance remains main-owned.',
    approvalEvidence: registration.rendererReviewEvidence ?? null });
}
const generatedAt = new Date().toISOString();
const sourceBytes = assets.reduce((n, a) => n + a.bytes, 0);
const sampledBytes = assets.reduce((n, a) => n + a.sampledRuntime.pngBytes, 0);
const audit = { schemaVersion: 1, generatedAt, scope: 'Weapons_v2-read-only-image-audit', imageWrites: 0,
    status: errors.length ? 'failed' : 'passed-technical-checks-main-reports-renderer-accepted', checks, errors, warnings,
  errorCount: errors.length, warningCount: warnings.length,
  geometryLimit: 'Coordinates/axis annotations are accepted only after producer image review; this audit checks bounds and metadata, not automatic semantic inference of gun ports or bow release points.',
  sourcePngBytes: sourceBytes, sampledRuntimePngBytes: sampledBytes };
if (errors.length) {
  await writeNew('production/delivery-audit-failed-' + Date.now() + '.json', audit);
  throw new Error('Weapons delivery audit failed: ' + JSON.stringify(errors));
}
const delivery = { schemaVersion: 1, theme: 'ViralInvasion_Weapons_v2', generatedAt,
  status: registration.rendererAccepted ? 'two-v02-held-weapons-main-renderer-accepted' : 'two-held-weapons-ready-for-main-renderer-review', expectedRuntimeCount: 2, completedRuntimeCount: 2,
  approvedRuntimeCount: registration.rendererAccepted ? 2 : 0,
  rendererAccepted: registration.rendererAccepted === true,
  rendererReviewEvidence: registration.rendererReviewEvidence ?? null,
  runtimeIntegrationPerformed: registration.rendererAccepted === true, assetRoot: repoRel(ROOT),
  contract: { canvas: [512, 512], direction: '+X, side view slightly from above', trim: false,
    aimAxis: [1, 0], coordinateSystem: 'Full untrimmed source pixels',
    placement: 'Rotate around measured grip; align grip to actual body-frame C-hand. Do not interpret grip-to-muzzle slope as weapon aim.',
    mirrorX: '512 - x for continuous grip/muzzle coordinates; mirror axis vector too when applicable.',
    displayScale: 'New silhouettes fill more of the512 canvas than old emitter.png. Main must select display scale using visible bounds; do not blindly reuse the old96-canvas scale.' },
  productionMethod: 'Maliang selected source art plus local transparency cleanup and fixed registration.',
  assets, candidates: selection.candidates ?? selection, producerVisualReview: visual,
  budget: { sourcePngBytes: sourceBytes, recommendedSampledPngBytes: sampledBytes,
    conservativeAddedEncodedBytes: Math.ceil(sampledBytes * 4 / 3 * 1.2) + 8192,
    totalRuntimeLimitBytes: 20 * 1024 * 1024, finalPackageMeasurement: 'owned-by-main-build',
    sourceQaHistoryAndManifestsCountTowardRuntime: false },
  selfCheck: { audit: 'production/delivery-audit.json', errorCount: 0, warningCount: warnings.length },
  writeBoundary: 'Only asserts/ViralInvasion_Weapons_v2; no old images, source code, shared art-selection or atlas outputs changed.' };
await writeNew('delivery.json', delivery);
await writeNew('production/delivery-audit.json', audit);
await writeNew('production/art-selection-fragment.json', { schemaVersion: 1,
  status: registration.rendererAccepted ? 'main-renderer-accepted-v02-static-frame-metadata' : 'main-requested-static-frame-metadata-pending-renderer-pixel-review',
  assetRoot: repoRel(ROOT), sharedArtSelectionWritten: false,
  note: 'Independent fragment only. Main owns merging into shared art-selection; animation.approved is the explicitly requested integration flag.',
  assets: assets.map(a => ({ id: a.id, path: a.repositoryPath, sha256: a.sha256, dimensions: a.dimensions,
    trim: false, sourceRect: a.sourceRect, pivot: a.pivot, pivotSource: a.pivotSource,
    sourceGrip: a.grip, sourceMuzzle: a.muzzle, actorRegistration: a.actorRegistration,
    animation: a.animation, registration: a.registration, worldLogicalCanvasWidth: a.worldLogicalCanvasWidth,
    worldWidthAuthority: a.worldWidthAuthority, sourceRunId: a.provenance.runId })) });
await writeNew('HANDOFF.md', '# Weapons v2 P0\n\nTwo held512×512 transparent PNGs, steady and piercing. Full paths, raw/run/prompt/SHA, visible bounds and exact measured grip/muzzle are in delivery.json.\n\nUse the measured grip as held pivot. Aim is explicitly+X; grip→muzzle is an attachment offset, not the aim axis. The bow release point may be a virtual point inside the open gap. Preserve the full canvas and trim:false. Reuse the same PNG for inventory icons; no extra icon asset is required. Main owns gameplay integration and final Renderer review.\n\nThe old emitter occupies much less of its512 canvas than the new weapons. Set world display scale from visible bounds and the hero hand; do not copy the old96-canvas scale blindly. Suggested runtime texture is192², with optional lower-quality128² sampling. No person, hand, projectile, muzzle glow or background is part of the asset.\n\nAll existing images and shared selection remain unchanged. Canonical manifest is written once; any revision uses a new version path and a separate receipt.\n');
textOutput();
function textOutput() { console.log(JSON.stringify({ status: delivery.status, delivery: repoRel(resolve(ROOT, 'delivery.json')),
  runtimeWeapons: 2, sourcePngBytes: sourceBytes, sampledRuntimePngBytes: sampledBytes, errors: 0, warnings: warnings.length }, null, 2)); }
