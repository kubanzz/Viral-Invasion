import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { syncArt } from './art-sync.mjs';

// The source PNG has been visually reviewed; producer files remain untouched.
const receiptPath = 'asserts/ViralInvasion_CampFeedback_v1/delivery.json';
const receiptBytes = await readFile(receiptPath), delivery = JSON.parse(receiptBytes);
const audit = JSON.parse(await readFile('asserts/ViralInvasion_CampFeedback_v1/delivery.audit.json'));
const source = delivery.asset, bytes = await readFile(source.absolutePath);
const sha = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha(bytes), source.sha256); assert.equal(audit.outputSha256, source.sha256); assert.equal(audit.status, 'passed');
const metadata = await sharp(bytes).metadata();
assert.deepEqual([metadata.width, metadata.height, metadata.channels], [1024, 1024, 4]);
assert.equal(source.trueAlpha, true); assert.equal(source.alpha.borderVisible, 0);
const selectionPath = 'asserts/art-selection.json', selection = JSON.parse(await readFile(selectionPath));
const id = 'microfront.camp.summon', index = selection.sprites.findIndex(asset => asset.id === id);
assert.ok(index >= 0, 'Replace the existing summon identity without adding another entry point');
const previous = selection.sprites[index];
const spec = { id, source: `ViralInvasion_CampFeedback_v1/${source.path}`, expectedSha256: source.sha256, size: 384,
  status: 'reviewed-source', flags: ['camp-feedback-20261106', 'registered-source-canvas', 'runtime-original-colours'],
  trim: false, centered: false, pivotSource: source.pivot, sourceFrame: { x: 0, y: 0, width: 1024, height: 1024 },
  actorRegistration: { canvas: { width: 1024, height: 1024 }, foot: { x: source.logicalGround[0], y: source.logicalGround[1] }, commonCanvasScale: 1 },
  producer: { theme: delivery.theme, key: source.key, receipt: receiptPath, receiptSha256: sha(receiptBytes),
    producerStatus: delivery.status, runId: source.source.runId, sourceNodeId: source.source.nodeId, mainRendererApproved: false } };
selection.sprites[index] = spec;
if (Array.isArray(selection.catalogue) && !selection.catalogue.includes(spec.source)) selection.catalogue.push(spec.source);
await writeFile(selectionPath, JSON.stringify(selection, null, 2) + '\n');
const synced = await syncArt();
const output = 'artifacts/feedback-fixes-20261106'; await mkdir(output, { recursive: true });
await writeFile(`${output}/art-intake.json`, JSON.stringify({ id, source: spec.source, sha256: source.sha256,
  previousSource: previous.source, receipt: receiptPath, receiptSha256: sha(receiptBytes), sourceVisualReview: true,
  inputSignature: synced.runtime.inputSignature, finalRendererReview: 'Recorded separately after browser acceptance.' }, null, 2));
console.log(JSON.stringify({ id, source: spec.source, inputSignature: synced.runtime.inputSignature }));
