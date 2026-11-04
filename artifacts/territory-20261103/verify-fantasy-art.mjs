import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const artRoot = resolve(root, 'asserts/ViralInvasion_Fantasy_v1');
const output = resolve(root, 'artifacts/territory-20261103/fantasy-art-preflight.json');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const optional = async path => { try { return await json(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const mappings = {
  'heart.ground.healthy': ['fantasy.floor.healthy', 'Heart healthy ownership; menu/training common theme; shared fallback for lung until P1 arrives'],
  'heart.ground.infected': ['fantasy.floor.infected', 'Only actual infected heart territory polygons'],
  'scenery.pulseTree.healthy': ['fantasy.tree.healthy', 'Heart/training tree collider whose actual visual region is healthy'],
  'scenery.pulseTree.infected': ['fantasy.tree.infected', 'Same heart tree collider and source canvas, actual region infected'],
  'scenery.crystal.healthy': ['fantasy.rock.healthy', 'Heart/training rock collider whose actual visual region is healthy'],
  'scenery.crystal.infected': ['fantasy.rock.infected', 'Same heart rock collider and source canvas, actual region infected'],
  'infection.patch.a': ['fantasy.infection.patch.a', 'Ground-only non-source infected region, clipped to real ownership'],
  'infection.patch.b': ['fantasy.infection.patch.b', 'Ground-only source infected region, clipped to real ownership'],
  'infection.edge.a': ['fantasy.infection.edge.a', 'Alternating ground border segment where adjacent actual owners differ'],
  'infection.edge.b': ['fantasy.infection.edge.b', 'Alternate authored ground border segment; no collision geometry'],
  'healingNode.healthy': ['fantasy.healing.healthy', 'Healthy healing node, including contested-but-not-captured points'],
  'healingNode.infected': ['fantasy.healing.infected', 'Fully infected healing node; no active purification'],
  'healingNode.recovering': ['fantasy.healing.recovering', 'Still infected, actual active purification node with progress >0'],
  'infection.source': ['fantasy.source.active', 'Actual live source target; independent from ordinary viruses and mother actor'],
  'heart.core.base': ['fantasy.core.healthy', 'Independent core facility; HP damage does not falsely change ownership'],
  'heart.valve.closed': ['fantasy.valve.closed', 'Heart valve pulse phase is not surge'],
  'heart.valve.open': ['fantasy.valve.open', 'Actual heart valve pulse phase is surge'],
  'lung.ground.healthy': ['fantasy.lung.floor.healthy', 'Lung healthy polygons derived read-only from stable legacy graph sites'],
  'lung.ground.infected': ['fantasy.lung.floor.infected', 'Lung graph site infected; source remains a site after active=false and becomes healthy'],
  'lung.plant.healthy': ['fantasy.lung.tree.healthy', 'Lung vegetation collider in an actual healthy graph-derived region'],
  'lung.plant.infected': ['fantasy.lung.tree.infected', 'Same lung vegetation collider and authored registration; region infected'],
  'lung.rock.healthy': ['fantasy.lung.rock.healthy', 'Lung rock collider in actual healthy graph-derived region'],
  'lung.rock.infected': ['fantasy.lung.rock.infected', 'Same lung rock collider and authored registration; region infected'],
  'lung.airway.closed': ['fantasy.lung.airway.closed', 'Actual lung flow.airwayOpen is false'],
  'lung.airway.open': ['fantasy.lung.airway.open', 'Actual lung flow.airwayOpen is true'],
};

async function pixels(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, partial = 0, borderVisible = 0, nearWhitePartial = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const at = (y * info.width + x) * 4, alpha = data[at + 3];
    if (!alpha) transparent++; else if (alpha < 255) partial++;
    if (alpha >= 8 && (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1)) borderVisible++;
    if (alpha > 0 && alpha < 192 && data[at] >= 245 && data[at + 1] >= 245 && data[at + 2] >= 245) nearWhitePartial++;
  }
  let edgeSquare = 0, edgeMax = 0, samples = 0;
  const compare = (a, b) => { for (let c = 0; c < 4; c++) { const d = Math.abs(data[a + c] - data[b + c]); edgeSquare += d * d; edgeMax = Math.max(edgeMax, d); samples++; } };
  for (let y = 0; y < info.height; y++) compare(y * info.width * 4, (y * info.width + info.width - 1) * 4);
  for (let x = 0; x < info.width; x++) compare(x * 4, ((info.height - 1) * info.width + x) * 4);
  return { width: info.width, height: info.height, transparent, partial, borderVisible, nearWhitePartial,
    periodicEdges: { maximumDifference: edgeMax, rms: Math.sqrt(edgeSquare / samples) } };
}

function registration(asset) {
  const b = asset?.sourceBounds, v = asset?.visibleBounds;
  if (!b || !v || !asset.sourceSize || !v.width || !v.height) return null;
  const sx = b.width / v.width, sy = b.height / v.height;
  const sourceAnchor = { x: b.x + (asset.pivot.x * asset.width - v.x) * sx,
    y: b.y + (asset.pivot.y * asset.height - v.y) * sy };
  return { sourceCanvas: asset.sourceSize, sourceAnchor, sourceUnitsPerAtlasPixel: [sx, sy],
    valid: asset.sourceSize.width === 1024 && asset.sourceSize.height === 1024
      && Math.abs(sourceAnchor.x - 512) <= sx * .51 + 1e-6 && Math.abs(sourceAnchor.y - 870.4) <= sy * .51 + 1e-6 };
}

const plan = await json(resolve(artRoot, 'production/asset-plan.json'));
const delivery = await json(resolve(artRoot, 'delivery.json'));
const selection = await json(resolve(root, 'asserts/art-selection.json'));
const runtimePath = resolve(root, '.art-generated/art-runtime.json'), runtimeBytes = await readFile(runtimePath), runtime = JSON.parse(runtimeBytes);
const reviews = await optional(resolve(root, 'artifacts/territory-20261103/fantasy-art-visual-review.json'));
const scenePath = resolve(root, process.env.VI_FANTASY_FINAL_SCENES ?? 'artifacts/territory-20261103/fantasy-final-scenes/report.json');
const sceneReport = await optional(scenePath);
const sceneMatchesRuntime = !!sceneReport && sceneReport.runtimeSha256 === hash(runtimeBytes) && sceneReport.sameRuntimeBytes === true;
const coverage = [];
for (const planned of plan.assets) {
  const [runtimeId, trigger] = mappings[planned.id] ?? [];
  const delivered = delivery.assets.find(asset => asset.id === planned.id);
  const selected = [...selection.sprites, ...selection.environments].find(asset => asset.id === runtimeId);
  const actual = runtime.assets[runtimeId] ?? runtime.environments[runtimeId];
  const issues = [];
  let measurement = null, sourceHash = null, exists = false;
  const candidatePath = delivered?.path ?? planned.path;
  try {
    const path = resolve(artRoot, candidatePath), bytes = await readFile(path); exists = true; sourceHash = hash(bytes); measurement = await pixels(path);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!delivered) issues.push('not-in-delivery');
  if (!exists) issues.push('source-file-missing');
  if (!selected) issues.push('runtime-selection-missing');
  if (!actual) issues.push('generated-runtime-missing');
  if (exists && delivered && delivered.sha256 !== sourceHash) issues.push('delivery-source-hash-mismatch');
  if (exists && selected && selected.expectedSha256 !== sourceHash) issues.push('selection-source-hash-mismatch');
  if (selected && selected.source !== `ViralInvasion_Fantasy_v1/${candidatePath}`) issues.push('selection-not-official-delivery-path');
  if (exists && actual && actual.sourceSha256 !== sourceHash) issues.push('generated-source-hash-mismatch');
  if (measurement && (measurement.width !== 1024 || measurement.height !== 1024)) issues.push('not-1024-shared-source-canvas');
  if (measurement && planned.kind === 'ground' && measurement.transparent + measurement.partial !== 0) issues.push('ground-not-opaque');
  if (measurement && planned.kind === 'ground' && measurement.periodicEdges.maximumDifference !== 0) issues.push('ground-edge-seam');
  if (measurement && planned.kind === 'object' && (measurement.transparent === 0 || measurement.borderVisible > 0)) issues.push('object-alpha-or-source-edge');
  const registered = planned.kind === 'object' ? registration(actual) : null;
  if (planned.kind === 'object' && selected && (selected.trim !== false || selected.pivotSource?.join(',') !== '0.5,0.85')) issues.push('state-pair-selection-registration');
  if (planned.kind === 'object' && actual && !registered?.valid) issues.push('runtime-registration-invalid');
  if (actual && actual.tone !== null) issues.push('fantasy-palette-graded-again');
  const review = reviews?.assets?.find(item => item.semanticId === planned.id && item.sourceSha256 === sourceHash);
  const observedCases = sceneMatchesRuntime ? sceneReport.reports.filter(scene => scene.stateUnchanged && scene.errors.length === 0
    && (scene.diagnostics.art.fantasyGround.imageIds.includes(runtimeId)
      || scene.diagnostics.phaser.nativeSprites.some(sprite => sprite.visible && sprite.frame === runtimeId)))
    .map(scene => ({ scene: scene.scene, variant: scene.variant, focus: scene.focus, screenshot: scene.file })) : [];
  coverage.push({ semanticId: planned.id, batch: planned.batch, kind: planned.kind, runtimeId, trigger,
    path: candidatePath, sourceSha256: sourceHash, deliveryStatus: delivered?.status ?? 'missing',
    selectedSource: selected?.source ?? null, runtimeSource: actual?.source ?? null,
    authoredCanvas: measurement, runtimeRegistration: registered,
    runtimeVisibleReview: review ?? null, observedInCurrentRuntimeScene: observedCases,
    numericReady: issues.length === 0, issues });
}
const groups = [...new Set(plan.assets.filter(asset => asset.kind === 'object').map(asset => asset.stateGroup))]
  .map(group => {
    const members = plan.assets.filter(asset => asset.stateGroup === group), items = coverage.filter(item => members.some(member => member.id === item.semanticId));
    const geometries = items.map(item => item.runtimeRegistration);
    const comparable = items.length > 1 && geometries.every(Boolean);
    const review = reviews?.pairs?.find(pair => pair.group === group
      && items.every(item => pair.sourceSha256s?.includes(item.sourceSha256)));
    return { group, members: members.map(member => member.id), present: items.filter(item => item.numericReady).length,
      sameCanvasAndScale: comparable ? geometries.every(item => item.valid && item.sourceCanvas.width === geometries[0].sourceCanvas.width
        && Math.abs(item.sourceUnitsPerAtlasPixel[0] - geometries[0].sourceUnitsPerAtlasPixel[0]) < .02
        && Math.abs(item.sourceUnitsPerAtlasPixel[1] - geometries[0].sourceUnitsPerAtlasPixel[1]) < .02) : null,
      groundContactReview: review ?? null,
      note: 'Metadata cannot prove roots/feet are visually aligned. Pair review must compare actual matching support structure at one shared scale.' };
  });
const scenes = {
  menu: { floor: 'fantasy.floor.healthy', props: 'No simulated territory or fake gameplay actors baked into terrain' },
  training: { floor: 'fantasy.floor.healthy', props: 'Shared heart tree/rock/core theme; existing collision geometry' },
  heartRescue: { ownership: 'GameState.territory.nodes committed owner, cached polygons; progress is a separate live signal',
    props: 'Tree/rock pair selected at actual collider anchor; healing/source/core/valve selected by real node and pulse state' },
  heartHiddenCampaign: { ownership: 'Actual stable legacy graph sites; source remains after deactivation and becomes healthy' },
  lungHiddenCampaign: { ownership: 'Actual stable lung graph sites; uses P1 floor/tree/rock/airway IDs',
    missingP1: coverage.filter(item => item.batch === 'P1' && !item.numericReady).map(item => item.semanticId),
    currentFallback: coverage.some(item => item.batch === 'P1' && !item.numericReady)
      ? 'Shared heart theme when a requested P1 image is absent; explicitly incomplete, not P1 coverage' : null },
  canvasFallback: { style: 'Quiet fantasy ground/stone/core geometry; no old anatomical backdrop or giant foreground fronds',
    readiness: 'Procedural fallback is not evidence that an authored asset has been integrated' },
};
const budget = { runtimeBytes: runtimeBytes.length, limitBytes: 20 * 1024 * 1024, pass: runtimeBytes.length <= 20 * 1024 * 1024,
  atlasCount: runtime.atlases.length, maximumAtlasSize: Math.max(...runtime.atlases.map(atlas => Math.max(atlas.data.meta.size.w, atlas.data.meta.size.h))) };
const missing = coverage.filter(item => !item.numericReady).map(item => ({ id: item.semanticId, issues: item.issues }));
const unreviewed = coverage.filter(item => item.runtimeVisibleReview?.approvedForRuntime !== true).map(item => item.semanticId);
const notObserved = coverage.filter(item => item.observedInCurrentRuntimeScene.length === 0).map(item => item.semanticId);
const screenshotProof = [];
if (sceneMatchesRuntime) for (const scene of sceneReport.reports) {
  const path = resolve(dirname(scenePath), scene.file);
  try { const bytes = await readFile(path); screenshotProof.push({ path, bytes: bytes.length, sha256: hash(bytes) }); }
  catch (error) { if (error.code === 'ENOENT') screenshotProof.push({ path, missing: true }); else throw error; }
}
const sceneCoverage = { report: scenePath, sameRuntime: sceneMatchesRuntime, missingIds: notObserved, screenshots: screenshotProof,
  pass: sceneMatchesRuntime && notObserved.length === 0 && screenshotProof.length > 0 && screenshotProof.every(item => !item.missing) };
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), buildSignature: runtime.inputSignature,
  scope: 'Read-only source/delivery/selection/generated-runtime audit; numeric checks do not claim aesthetic quality or human readability.',
  counts: { planned: plan.assets.length, delivered: delivery.assets.length, numericallyIntegrated: coverage.filter(item => item.numericReady).length,
    visuallyReviewedInRuntime: coverage.length - unreviewed.length },
  budget, scenes, sceneCoverage, coverage, statePairs: groups, missing, unreviewed,
  pass: missing.length === 0 && unreviewed.length === 0 && budget.pass && sceneCoverage.pass && groups.every(group => group.members.length === 1
    || group.sameCanvasAndScale && group.groundContactReview?.sameGroundContactApproved === true) };
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report.counts, runtimeBytes: budget.runtimeBytes, budgetPass: budget.pass, missing: missing.map(item => item.id), visuallyUnreviewed: unreviewed.length, unobservedInFinalScene: notObserved.length, pass: report.pass }));
if (process.argv.includes('--strict') && !report.pass) process.exitCode = 1;
