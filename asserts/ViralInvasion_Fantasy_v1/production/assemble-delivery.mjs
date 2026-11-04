/** Candidate delivery assembly. No generation, pixel edits, runtime sync, or visual approval. */
import { readFile, readdir, lstat, realpath, mkdir, open, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, basename, resolve, relative, isAbsolute, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectImage, inspectSeams } from './fantasy-art-process.mjs';

export const FANTASY_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PRODUCTION = join(FANTASY_ROOT, 'production');
const slash = value => value.replaceAll('\\', '/');
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isMissing = error => error?.code === 'ENOENT';

async function optionalBytes(path) {
  try { return await readFile(path); } catch (error) { if (isMissing(error)) return null; throw error; }
}

async function json(path) {
  const value = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  if (value === null || typeof value !== 'object') throw new Error(`JSON object/array required: ${slash(relative(FANTASY_ROOT, path))}`);
  return value;
}

export function insideRoot(path, { writing = false, allowRoot = false } = {}) {
  if (typeof path !== 'string' || !path.trim()) throw new Error('A nonempty local path is required');
  const absolute = resolve(FANTASY_ROOT, path), rel = relative(FANTASY_ROOT, absolute);
  if ((!allowRoot && !rel) || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error('Path escapes the Fantasy_v1 delivery root');
  }
  if (writing && rel.split(/[\\/]/).some(part => part.toLowerCase() === 'references')) {
    throw new Error('The references directory is read-only and is never a delivery target');
  }
  return absolute;
}

/** Refuse symlinks/junctions in the root-relative chain, including targets not created yet. */
async function guarded(path, options = {}) {
  const absolute = insideRoot(path, options);
  let current = absolute;
  while (current !== FANTASY_ROOT) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlink/junction paths are not supported inside Fantasy_v1');
    } catch (error) { if (!isMissing(error)) throw error; }
    const parent = dirname(current);
    if (parent === current) throw new Error('Could not resolve a path inside Fantasy_v1');
    current = parent;
  }
  const rootReal = await realpath(FANTASY_ROOT);
  let exists = false;
  try { await lstat(absolute); exists = true; } catch (error) { if (!isMissing(error)) throw error; }
  if (exists) {
    const actual = await realpath(absolute), rel = relative(rootReal, actual);
    if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) throw new Error('Resolved input escaped Fantasy_v1');
  }
  return absolute;
}

async function localInput(value, base = FANTASY_ROOT) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('An input path is required');
  if (/^[a-z]+:\/\//i.test(value)) throw new Error('Input paths must be local files, never URLs');
  const candidates = [...new Set([resolve(base, value), resolve(FANTASY_ROOT, value), resolve(PRODUCTION, value)])];
  const found = [];
  for (const candidate of candidates) {
    try {
      const path = await guarded(candidate);
      if ((await lstat(path)).isFile()) found.push(path);
    } catch (error) {
      if (!isMissing(error) && candidates.length === 1) throw error;
    }
  }
  if (found.length !== 1) throw new Error(`Input is missing, outside Fantasy_v1, or ambiguous: ${value}`);
  return found[0];
}

function assertClean(value, label = 'metadata') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertClean(item, `${label}[${index}]`));
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/^(authorization|cookie|password|secret|secretKey|accessKey|access_key|token|credentials|signature)$/i.test(key)) throw new Error(`Credential field is forbidden in ${label}`);
      assertClean(item, `${label}.${key}`);
    }
  } else if (typeof value === 'string') {
    for (const match of value.matchAll(/https?:\/\/[^\s"<>]+/g)) {
      const url = new URL(match[0]);
      if (url.username || url.password || url.search || url.hash) throw new Error(`Credential-bearing, signed, or temporary URL is forbidden in ${label}`);
    }
    if (/\bBearer\s+[A-Za-z0-9._~+\/-]+/i.test(value)) throw new Error(`Authorization value is forbidden in ${label}`);
  }
}

function arrayOf(value, label) {
  const rows = Array.isArray(value) ? value : value?.assets ?? value?.entries ?? value?.outputs;
  if (!Array.isArray(rows)) throw new Error(`${label} must be an array or contain assets/entries`);
  return rows;
}

async function discoverReports(directory) {
  const root = insideRoot(directory);
  try { if (!(await lstat(root)).isDirectory()) throw new Error('Processed input must be a directory'); }
  catch (error) { if (isMissing(error)) return []; throw error; }
  const result = [];
  const walk = async current => {
    await guarded(current);
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('A processed input contains a symlink/junction');
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith('.report.json')) result.push(path);
    }
  };
  await walk(root);
  return result.sort();
}

async function inputEntries(options) {
  const rows = [];
  for (const input of options.entries) {
    const path = await localInput(input), data = await json(path);
    rows.push(...arrayOf(data, 'Entries fragment').map(row => ({ ...row, _inputBase: dirname(path) })));
  }
  const reports = options.reports.length ? await Promise.all(options.reports.map(path => localInput(path)))
    : options.entries.length ? [] : await discoverReports(options.processed);
  for (const path of reports) {
    const report = await json(path);
    rows.push({ ...report, id: report.id ?? basename(path, '.report.json'), reportPath: path, _inputBase: dirname(path) });
  }
  const selected = options.ids.length ? rows.filter(row => options.ids.includes(row.id)) : rows;
  const ids = new Set();
  for (const row of selected) {
    if (typeof row.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(row.id) || row.id.includes('..')) throw new Error('Every processed entry needs a valid asset id');
    if (ids.has(row.id)) throw new Error(`Duplicate processed ID; select an explicit fragment/version: ${row.id}`);
    ids.add(row.id);
  }
  if (options.ids.some(id => !ids.has(id))) throw new Error('At least one requested ID has no processed entry');
  return selected;
}

async function measuredQa(values, base) {
  const array = [];
  const visit = value => {
    if (typeof value === 'string' || value?.path) array.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(values);
  const result = [];
  for (const value of array) {
    const path = await localInput(typeof value === 'string' ? value : value?.path, base);
    const bytes = await readFile(path);
    if (value?.sha256 && value.sha256 !== sha256(bytes)) throw new Error('A QA artifact hash differs from its report');
    if (!result.some(item => item.path === slash(relative(FANTASY_ROOT, path)))) result.push({ path: slash(relative(FANTASY_ROOT, path)), sha256: sha256(bytes) });
  }
  return result;
}

async function makeCandidate(fragment, planned, registry) {
  const base = fragment._inputBase ?? FANTASY_ROOT;
  const reportPath = fragment.reportPath ? await localInput(fragment.reportPath, base) : null;
  const report = reportPath ? await json(reportPath) : {};
  const entry = { ...(fragment.technical ?? {}), ...report, ...fragment };
  const input = await localInput(entry.outputPath ?? entry.output ?? entry.processedPath, base);
  const target = await guarded(planned.path, { writing: true });
  if (extname(target).toLowerCase() !== '.png') throw new Error(`Planned delivery is not PNG: ${planned.id}`);
  const bytes = await readFile(input), image = await inspectImage(bytes);
  if (image.format !== 'png') throw new Error(`Processed source must be an actual PNG: ${planned.id}`);
  if (entry.sha256 && entry.sha256 !== image.sha256) throw new Error(`Processed file does not match fragment SHA256: ${planned.id}`);
  const runKey = entry.runAssetId ?? entry.sourceId ?? planned.id;
  const runs = Array.isArray(registry.runs) ? Object.fromEntries(registry.runs.map(row => [row.id, row])) : registry.runs ?? {};
  const run = runs[runKey] ?? Object.values(runs).find(row => row.runId && row.runId === entry.runId);
  const runId = entry.runId ?? run?.runId;
  if (typeof runId !== 'string' || !runId) throw new Error(`Missing generation runId: ${planned.id}`);
  if (run && run.status !== 'succeeded') throw new Error(`Run is not completed: ${planned.id}`);
  const rawPath = await localInput(entry.source?.rawPath ?? entry.rawPath ?? run?.raw?.[0]?.path, base);
  const rawHash = sha256(await readFile(rawPath));
  const promptPath = await localInput(entry.source?.promptPath ?? entry.promptPath ?? `production/requests/${runKey}${run?.revision > 1 ? `.r${String(run.revision).padStart(2,'0')}` : ''}.json`);
  const referenceHash = entry.source?.referenceHash ?? registry.reference?.sha256;
  if (!/^[a-f0-9]{64}$/i.test(referenceHash ?? '')) throw new Error(`Missing valid reference SHA256: ${planned.id}`);
  const canvasURL = entry.source?.canvasURL ?? entry.canvasURL ?? run?.canvas?.url ?? null;
  const qa = await measuredQa(entry.qaPaths ?? entry.previews ?? entry.qa ?? {}, base);
  const dimensions = [image.width, image.height], dimensionPass = equal(dimensions, planned.dimensions);
  const alphaPass = planned.alphaRequirements?.required
    ? image.hasAlphaChannel && image.alpha.transparent > 0 && image.alpha.visible > 0
    : !planned.alphaRequirements?.fullyOpaque || image.alpha.transparent === 0 && image.alpha.partial === 0;
  const seams = planned.worldPlane && planned.kind === 'ground' ? await inspectSeams(bytes) : null;
  const reportSourceHash = entry.sourceSha256 ?? null;
  const sourceHashPass = reportSourceHash ? reportSourceHash === rawHash : null;
  const providedImageHashPass = entry.image?.sha256 ? entry.image.sha256 === image.sha256 : null;
  const issues = [];
  if (!dimensionPass) issues.push('dimensions-differ-from-plan');
  if (!alphaPass) issues.push('alpha-requirement-failed');
  if (seams && !seams.exactlyPeriodic) issues.push('ground-opposite-edges-differ');
  if (sourceHashPass === false) issues.push('report-source-sha256-mismatch');
  if (providedImageHashPass === false) issues.push('report-output-sha256-mismatch');
  const registration = { ...(planned.registration ?? {}),
    ...(entry.registration && typeof entry.registration === 'object' ? entry.registration : {}),
    transform: entry.transform ?? entry.registration?.transform ?? null,
    description: typeof entry.registration === 'string' ? entry.registration : null,
    actualGroundContactVisuallyVerified: false,
    independentAlphaRecropAllowed: false };
  const asset = {
    id: planned.id, path: slash(relative(FANTASY_ROOT, target)), batch: planned.batch,
    state: planned.state, stateGroup: planned.stateGroup, kind: planned.kind,
    pivot: planned.pivot, dimensions, worldPlane: planned.worldPlane,
    trim: false, status: 'candidate', visualApproval: false,
    productionVisualReview: entry.visualReview ?? null,
    source: { rawPath: slash(relative(FANTASY_ROOT, rawPath)), rawSha256: rawHash,
      promptPath: slash(relative(FANTASY_ROOT, promptPath)), promptAssetId: runKey,
      referenceHash: referenceHash.toLowerCase(), processing: entry.source?.processing ?? entry.processing ?? null,
      processingReportPath: reportPath ? slash(relative(FANTASY_ROOT, reportPath)) : null, canvasURL },
    runId, sha256: image.sha256,
    alpha: { hasAlphaChannel: image.hasAlphaChannel, ...image.alpha, bbox: image.bbox },
    registration,
    tileability: seams ? { ...(entry.tileability ?? {}), status: seams.exactlyPeriodic ? 'numeric-pass-visual-pending' : 'numeric-fail',
      ...seams, visualRepetitionApproved: false } : { status: 'not-applicable' },
    qaPaths: qa.map(item => item.path), qaArtifacts: qa,
    technicalValidation: { status: issues.length ? 'failed' : 'measured-visual-pending',
      dimensions: { expected: planned.dimensions, actual: dimensions, passed: dimensionPass },
      alphaRequirementPassed: alphaPass, reportSourceHashMatched: sourceHashPass,
      reportOutputHashMatched: providedImageHashPass, qaArtifactsPresent: qa.length > 0,
      issues, semanticReviewRequired: ['no-actors-text-ui-or-baked-effects', 'no-false-collision-or-shield',
        ...(planned.kind === 'object' ? ['ground-contact-and-state-registration'] : []),
        ...(seams ? ['unobtrusive-3x3-repetition'] : [])] }
  };
  assertClean(asset);
  const existing = await optionalBytes(target);
  if (existing && sha256(existing) !== image.sha256) throw new Error(`Refusing to overwrite a different existing PNG version: ${asset.path}`);
  return { asset, input, target, bytes, action: existing ? 'reuse-identical' : 'copy-new' };
}

async function existingDelivery(path) {
  const bytes = await optionalBytes(path);
  if (!bytes) return { bytes: null, value: { schemaVersion: 1, theme: 'ViralInvasion_Fantasy_v1', assets: [] } };
  const value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const seen = new Set();
  for (const asset of arrayOf(value, 'Existing delivery')) {
    if (seen.has(asset.id)) throw new Error('Existing delivery has duplicate IDs');
    seen.add(asset.id);
    const file = await guarded(asset.path, { writing: true }), actual = await readFile(file);
    if (sha256(actual) !== asset.sha256) throw new Error(`Existing delivery is missing or changed: ${asset.id}`);
  }
  assertClean(value);
  return { bytes, value };
}

export async function assemble(options = {}) {
  const flags = { entries: [], reports: [], ids: [], processed: 'production/processed', write: false, ...options };
  const plan = await json(await localInput(flags.plan ?? 'production/asset-plan.json'));
  const registry = await json(await localInput(flags.runs ?? 'production/runs.json'));
  const planned = new Map(arrayOf(plan, 'Asset plan').map(asset => [asset.id, asset]));
  const entries = await inputEntries(flags), candidates = [];
  for (const entry of entries) {
    if (!planned.has(entry.id)) throw new Error(`Processed ID is absent from asset-plan.json: ${entry.id}`);
    candidates.push(await makeCandidate(entry, planned.get(entry.id), registry));
  }
  const deliveryPath = await guarded('delivery.json', { writing: true });
  const previous = await existingDelivery(deliveryPath), assets = new Map(arrayOf(previous.value, 'Existing delivery').map(asset => [asset.id, asset]));
  for (const item of candidates) assets.set(item.asset.id, item.asset);
  const outputAssets = [...assets.values()].sort((a, b) => (planned.get(a.id)?.productionOrder ?? 9999) - (planned.get(b.id)?.productionOrder ?? 9999));
  for (const asset of outputAssets) {
    if (asset.kind !== 'object') continue;
    const peers = outputAssets.filter(peer => peer.stateGroup === asset.stateGroup && peer.kind === 'object');
    const recorded = peers.filter(peer => peer.registration?.transform);
    const sameTransform = recorded.length === peers.length && peers.length > 1
      ? recorded.every(peer => equal(peer.registration.transform, recorded[0].registration.transform)) : null;
    asset.registration = { ...asset.registration, groupMemberCount: peers.length, sameRecordedTransformWithinGroup: sameTransform };
    if (sameTransform === false && asset.technicalValidation) {
      asset.technicalValidation.status = 'failed';
      asset.technicalValidation.issues = [...new Set([...asset.technicalValidation.issues, 'state-group-transforms-differ'])];
    }
  }
  const next = { ...previous.value, schemaVersion: 1, updatedAt: new Date().toISOString(),
    approvalPolicy: 'Every imported asset is a candidate; numerical checks do not grant visual or runtime approval.',
    counts: { total: outputAssets.length, P0: outputAssets.filter(asset => asset.batch === 'P0').length,
      P1: outputAssets.filter(asset => asset.batch === 'P1').length }, assets: outputAssets };
  assertClean(next);
  const summary = { mode: flags.write ? 'write' : 'dry-run', deliveryPath: 'delivery.json',
    imported: candidates.map(item => ({ id: item.asset.id, path: item.asset.path, sha256: item.asset.sha256,
      action: item.action, technicalStatus: item.asset.technicalValidation.status })), totalAssets: outputAssets.length };
  if (!flags.write || !candidates.length) return { ...summary, wrote: false };
  const lockPath = await guarded('.delivery-assembly.lock', { writing: true });
  const lock = await open(lockPath, 'wx');
  let temporary;
  try {
    const current = await optionalBytes(deliveryPath);
    if ((current === null) !== (previous.bytes === null) || current && !current.equals(previous.bytes)) throw new Error('delivery.json changed during preflight; rerun assembly');
    for (const item of candidates) {
      await guarded(item.target, { writing: true });
      await mkdir(dirname(item.target), { recursive: true });
      // Copy the bytes measured during preflight, even if a worker updates its processed file meanwhile.
      let output;
      try { output = await open(item.target, 'wx'); }
      catch (error) { if (error.code !== 'EEXIST' || sha256(await readFile(item.target)) !== item.asset.sha256) throw error; }
      if (output) {
        try { await output.writeFile(item.bytes); await output.sync(); }
        finally { await output.close(); }
      }
      if (sha256(await readFile(item.target)) !== item.asset.sha256) throw new Error('Copied PNG failed SHA256 verification');
    }
    temporary = await guarded(`.delivery-${randomUUID()}.tmp`, { writing: true });
    const handle = await open(temporary, 'wx');
    try { await handle.writeFile(JSON.stringify(next, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, deliveryPath); temporary = null;
    return { ...summary, wrote: true };
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await lock.close(); await unlink(lockPath);
  }
}

const HELP = `Usage: node production/assemble-delivery.mjs [--entries <fragment.json>] [--report <report.json>] [--processed <directory>] [--ids <id,id>] [--write]

Default is dry-run. With no explicit entries/reports, discovers production/processed/**/*.report.json.
Fragments may be an array or {assets:[...]} / {entries:[...]}; each row needs id and outputPath.
Optional row fields: reportPath, runAssetId, runId, rawPath, promptPath, qaPaths, processing,
source:{rawPath,promptPath,referenceHash,processing,canvasURL}, registration, tileability.
Input paths must be inside Fantasy_v1. Relative paths resolve from the fragment directory or Fantasy_v1 (ambiguity is rejected).
Target paths always come from asset-plan.json. Different existing PNG bytes are never overwritten.
--write copies candidate PNGs and atomically merges delivery.json. It never modifies references, source art, runtime selection, or generated runtime artifacts.
`;

export async function cli(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: HELP };
  const options = { entries: [], reports: [], ids: [] };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--write') { options.write = true; continue; }
    if (!['--entries', '--report', '--processed', '--ids', '--plan', '--runs'].includes(flag) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete argument: ${flag}`);
    const value = argv[++i];
    if (flag === '--entries') options.entries.push(value);
    else if (flag === '--report') options.reports.push(value);
    else if (flag === '--ids') options.ids.push(...value.split(',').filter(Boolean));
    else options[flag.slice(2)] = value;
  }
  return assemble(options);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  cli().then(result => console.log(result.help ?? JSON.stringify(result, null, 2))).catch(error => {
    console.error(`Delivery assembly stopped: ${error.message}`); process.exitCode = 1;
  });
}
