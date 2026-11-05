import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';
import sharp from 'sharp';

// Inspection is the default. Only --select plus a separate main review may
// change the shared selection; producer declarations are never approvals.
const root = resolve(import.meta.dirname, '..'), folder = 'asserts/ViralInvasion_Expedition_v1';
const args = process.argv.slice(2), argument = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const selecting = args.includes('--select');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const slash = path => path.split(sep).join('/');
const pair = value => Array.isArray(value) ? value : value && typeof value === 'object' ? [value.width ?? value.x, value.height ?? value.y] : [];
const near = (a, b) => a.length === b.length && a.every((v, i) => Number.isFinite(v) && Math.abs(v - b[i]) < 1e-6);
function inside(parent, path) { const rel = relative(parent, path); return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep); }
async function writeJson(path, data) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(data, null, 2) + '\n'); }
const widths = { basePod: 128, rapidPod: 128, ritualMatron: 148, ritualPriest: 104, heartDevourer: 224,
  campTentWarehouse: 144, campForge: 128, campSupply: 112, campSortie: 144 };
const deliveryPath = resolve(root, argument('--delivery', `${folder}/delivery.json`));
const selectionPath = resolve(root, 'asserts/art-selection.json');
const reviewPath = resolve(root, argument('--review', 'artifacts/expedition-v015/art/main-review.json'));
const [contract, deliveryBytes, selectionBytes] = await Promise.all([
  json(resolve(root, folder, 'production/asset-contract.json')), readFile(deliveryPath), readFile(selectionPath),
]);
const delivery = JSON.parse(deliveryBytes.toString('utf8')), selection = JSON.parse(selectionBytes.toString('utf8'));
const p0 = delivery.phase === 'p0' && !selecting, expectedCount = p0 ? 50 : 74;
if ((!p0 && (delivery.canonical !== true || delivery.phase !== 'all')) || delivery.completedRuntimeCount !== expectedCount || delivery.assets?.length !== expectedCount)
  throw Error('Inspection supports an explicit P0 delivery; selection requires the complete canonical 74-frame Expedition delivery');
const expected = [];
for (const entity of contract.entities.filter(entity => !p0 || entity.phase === 'p0')) for (const direction of entity.directions) for (const [action, count] of Object.entries(entity.states))
  for (let index = 0; index < count; index++) expected.push({ entity, direction, action, index, count,
    id: `${entity.idPrefix}.${direction}.${action}.${String(index).padStart(2, '0')}` });
if (expected.length !== expectedCount || new Set(delivery.assets.map(a => a.id)).size !== expectedCount) throw Error('Wrong unique delivery/contract count');
const realFolder = await realpath(resolve(root, folder));
const assets = new Map(delivery.assets.map(item => [item.id, item])), specs = [], audit = [];
for (const exp of expected) {
  const item = assets.get(exp.id); if (!item) throw Error(`Missing ${exp.id}`);
  const source = item.repositoryPath ?? item.path;
  if (typeof source !== 'string') throw Error(`Missing source path ${exp.id}`);
  const absolute = resolve(root, source.startsWith('asserts/') ? source : `${folder}/${source}`), actualPath = await realpath(absolute);
  if (!inside(realFolder, actualPath)) throw Error(`Source escapes Expedition directory: ${source}`);
  const bytes = await readFile(actualPath), sha256 = hash(bytes), meta = await sharp(bytes).metadata();
  const isIcon = exp.entity.kind === 'icon', allowed = isIcon ? [[256, 256], [512, 512]] : [[512, 512]];
  if (sha256 !== item.sha256 || meta.format !== 'png' || !meta.hasAlpha || !allowed.some(size => near(size, [meta.width, meta.height])))
    throw Error(`Source hash, dimensions or alpha mismatch: ${exp.id}`);
  const { data, info } = await sharp(bytes).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, visible = 0, border = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3]; if (alpha === 0) transparent++; else { visible++; if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) border++; }
  }
  if (!transparent || !visible || border) throw Error(`Nonempty subject and transparent four borders required: ${exp.id}`);
  const canvas = [meta.width, meta.height], anchor = isIcon ? canvas.map(v => v * .5) : [256, 435.2], pivot = isIcon ? [.5, .5] : [.5, .85];
  const registration = item.actorRegistration;
  if (!near(pair(item.pivot), pivot) || !near(pair(item.foot), anchor) || !registration
    || !near(pair(registration.canvas), canvas) || !near(pair(registration.foot ?? registration.anchor), anchor) || registration.commonCanvasScale !== 1
    || item.trim !== false) throw Error(`Registration mismatch: ${exp.id}`);
  const animation = item.animation, group = exp.id.slice(0, exp.id.lastIndexOf('.'));
  if (!animation || ![group, group.replace('fantasy.expedition.', '')].includes(animation.group) || animation.index !== exp.index
    || animation.frameCount !== exp.count || !Number.isFinite(animation.fps) || (exp.count > 1 ? animation.fps <= 0 : animation.fps < 0))
    throw Error(`Animation contract mismatch: ${exp.id}`);
  const width = widths[exp.entity.key];
  if (!isIcon && item.worldLogicalCanvasWidth !== width) throw Error(`Unapproved logical width: ${exp.id}`);
  let groundFootprint = null;
  if (exp.entity.groundWorldDiameterMax) {
    const region = item.groundFootprint?.baseRegionPx;
    if (!Array.isArray(region) || region.length !== 4 || !region.every(Number.isInteger) || region[0] < 0 || region[1] < 0 || region[2] <= 0 || region[3] <= 0
      || region[0] + region[2] > info.width || region[1] + region[3] > info.height) throw Error(`Missing real base footprint: ${exp.id}`);
    let left = info.width, right = -1;
    for (let y = region[1]; y < region[1] + region[3]; y++) for (let x = region[0]; x < region[0] + region[2]; x++)
      if (data[(y * info.width + x) * 4 + 3] >= 8) { left = Math.min(left, x); right = Math.max(right, x); }
    const pixels = right < 0 ? 0 : right - left + 1, worldDiameter = pixels * width / info.width;
    if (pixels <= 0 || worldDiameter > 80 + 1e-6) throw Error(`Pod base exceeds 80 world units: ${exp.id}`);
    groundFootprint = { baseRegionPx: region, pixels, worldDiameter };
  }
  const sourcePath = slash(relative(resolve(root, 'asserts'), actualPath));
  const runtimeSize = exp.entity.recommendedRuntimeTexture;
  if (!Number.isInteger(runtimeSize) || runtimeSize < 64 || runtimeSize > 256) throw Error(`Unsupported runtime sample: ${exp.id}`);
  specs.push({ id: exp.id, source: sourcePath, expectedSha256: sha256, size: runtimeSize, trim: false, pivotSource: pivot,
    status: 'candidate', flags: ['approved-fantasy-style', 'expedition-main-contact-sheet-review', 'full-canvas-state-registration', 'runtime-original-colours'],
    animation: { ...animation, group, fps: Math.max(1, animation.fps), approved: true },
    actorRegistration: { canvas: { width: canvas[0], height: canvas[1] }, foot: { x: anchor[0], y: anchor[1] }, commonCanvasScale: 1 } });
  audit.push({ id: exp.id, path: slash(relative(root, actualPath)), sha256, bytes: bytes.length, dimensions: canvas,
    transparentPixels: transparent, visiblePixels: visible, borderVisiblePixels: border, group, index: exp.index, fps: animation.fps, groundFootprint });
}
const oldSprites = selection.sprites.filter(item => !item.id.startsWith('fantasy.expedition.'));
const frozen = [];
for (const item of oldSprites) {
  const bytes = await readFile(resolve(root, 'asserts', item.source)), sha256 = hash(bytes);
  if (item.expectedSha256 && item.expectedSha256 !== sha256) throw Error(`Frozen existing source drift: ${item.id}`);
  frozen.push({ id: item.id, sourceSha256: sha256, selectionEntrySha256: hash(JSON.stringify(item)) });
}
const evidenceTemplate = argument('--review-template', undefined);
if (evidenceTemplate) await writeJson(resolve(root, evidenceTemplate), { reviewer: null, scope: 'main-contact-sheet-and-registration-review',
  deliverySha256: hash(deliveryBytes), evidence: [], assets: audit.map(item => ({ id: item.id, sha256: item.sha256, approved: false })) });
let selected = false;
if (selecting) {
  if (inside(realFolder, resolve(reviewPath))) throw Error('Main approval must be outside the producer art folder');
  const review = await json(reviewPath);
  if (typeof review.reviewer !== 'string' || !review.reviewer.trim() || review.scope !== 'main-contact-sheet-and-registration-review'
    || review.deliverySha256 !== hash(deliveryBytes) || !Array.isArray(review.evidence) || !review.evidence.length
    || !Array.isArray(review.assets) || review.assets.length !== 74 || new Set(review.assets.map(a => a.id)).size !== 74)
    throw Error('A complete, current main visual review with evidence is required before selection');
  for (const path of review.evidence) await readFile(resolve(root, path));
  for (const item of audit) if (!review.assets.some(a => a.id === item.id && a.sha256 === item.sha256 && a.approved === true))
    throw Error(`Main review has not approved current pixels: ${item.id}`);
  const before = hash(JSON.stringify({ ...selection, sprites: oldSprites }));
  const next = { ...selection, sprites: [...oldSprites, ...specs] };
  if (before !== hash(JSON.stringify({ ...next, sprites: next.sprites.filter(a => !a.id.startsWith('fantasy.expedition.')) }))) throw Error('Existing selection changed');
  const output = JSON.stringify(next, null, 2) + '\n';
  if (output !== selectionBytes.toString('utf8')) await writeFile(selectionPath, output);
  selected = true;
}
const result = { scope: 'Expedition source verification and explicit main-approved integration', selected, deliverySha256: hash(deliveryBytes),
  deliveryPhase: delivery.phase, inspectedFrames: audit.length, sourceWorldCanvas: 512, sampledWorldSizes: [192, 256], sampledIconSize: 128, preservedExistingSprites: oldSprites.length,
  assets: audit, frozenExisting: frozen, note: 'Source contact-sheet approval does not replace actual native Renderer and natural gameplay QA.' };
const reportPath = argument('--report', selecting ? 'artifacts/expedition-v015/art/integration.json' : undefined);
if (reportPath) await writeJson(resolve(root, reportPath), result);
console.log(JSON.stringify({ inspectedFrames: audit.length, preservedExistingSprites: oldSprites.length, selected, report: reportPath ?? null }));
