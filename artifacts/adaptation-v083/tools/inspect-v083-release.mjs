import { lstat, mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';

// Verification only: no build, packaging, browser, network, or old-evidence writes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '0.8.3', STAGE = 'G4', SOURCE_COUNT = 133;
const GAME_SHA256 = '20164abf5551375ea44a5d45eb7926527db29c9554c7882a94cdfd8ff994e330';
const names = ['index.html', 'game.js', 'build-meta.json', 'Open-Game.cmd', 'README.txt'];
const distNames = new Set(['index.html', 'game.js', 'build-meta.json']);
const releaseFolder = resolve(root, `releases/Viral-Invasion-${STAGE}-v${VERSION}`);
const zipPath = `${releaseFolder}.zip`;
const packageReportPath = resolve(root, `artifacts/releases/v${VERSION}/release-package.json`);
const expectedVerifiedFolder = resolve(root, `.tools/release-v${VERSION}-verified`);
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--run' && !/^--attempt=[1-9][0-9]*$/.test(arg))
  || args.filter(arg => arg === '--run').length > 1 || args.filter(arg => arg.startsWith('--attempt=')).length > 1) {
  throw Error('Usage: node .tools/inspect-v083-release.mjs [--run] [--attempt=1]');
}
const attempt = Number(args.find(arg => arg.startsWith('--attempt='))?.split('=')[1] ?? 1);
if (!Number.isSafeInteger(attempt)) throw Error('Invalid attempt number');
const output = resolve(root, `artifacts/adaptation-v083/release/inspection-${attempt}`);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const inRoot = path => path.startsWith(root + '\\') || path.startsWith(root + '/');
const pathInRoot = path => { const absolute = resolve(root, path); assert(inRoot(absolute), `Path escapes workspace: ${path}`); return absolute; };
async function regularFile(path) { const info = await lstat(path); assert(info.isFile() && !info.isSymbolicLink(), `Expected regular file: ${path}`); return info; }
async function writeNew(path, bytes) {
  assert(path.startsWith(output + '\\') || path.startsWith(output + '/'), `Output escapes inspection: ${path}`);
  const handle = await open(path, 'wx');
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
}

// Independent ZIP decoder: classic single-disk ZIP, store/deflate, flat allowlist.
// ZIP64/encryption are deliberately rejected: this release has five small files.
function decodeZip(bytes) {
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) { end = at; break; }
  }
  assert(end >= 0, 'ZIP end-of-central-directory missing');
  const disk = bytes.readUInt16LE(end + 4), centralDisk = bytes.readUInt16LE(end + 6);
  const diskEntries = bytes.readUInt16LE(end + 8), entryCount = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12), centralAt = bytes.readUInt32LE(end + 16);
  assert(disk === 0 && centralDisk === 0 && diskEntries === entryCount, 'Multi-disk ZIP unsupported');
  assert(entryCount !== 65535 && centralSize !== 0xffffffff && centralAt !== 0xffffffff, 'ZIP64 unsupported');
  assert(entryCount === names.length && centralAt + centralSize === end, 'ZIP directory count/extent mismatch');
  const entries = [], seen = new Set(), ranges = [];
  let cursor = centralAt;
  for (let index = 0; index < entryCount; index++) {
    assert(cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50, 'Invalid central-directory entry');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16), compressedSize = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extraLength = bytes.readUInt16LE(cursor + 30), commentLength = bytes.readUInt16LE(cursor + 32);
    const entryDisk = bytes.readUInt16LE(cursor + 34), attributes = bytes.readUInt32LE(cursor + 38), localAt = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    assert(next <= end && entryDisk === 0, 'Central entry exceeds directory or changes disk');
    assert(compressedSize !== 0xffffffff && size !== 0xffffffff && localAt !== 0xffffffff, 'ZIP64 entry unsupported');
    assert((flags & ~0x080e) === 0 && (method === 0 || method === 8), 'Unsupported ZIP flags/compression');
    assert(((attributes >>> 16) & 0xf000) !== 0xa000, 'ZIP symlink rejected');
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength), name = rawName.toString('utf8');
    assert(names.includes(name) && rawName.equals(Buffer.from(name, 'ascii')) && !seen.has(name), `Unexpected/duplicate ZIP name: ${name}`);
    seen.add(name);
    assert(size <= 64 * 1024 * 1024 && localAt + 30 <= centralAt && bytes.readUInt32LE(localAt) === 0x04034b50, `Invalid local header: ${name}`);
    const localFlags = bytes.readUInt16LE(localAt + 6), localMethod = bytes.readUInt16LE(localAt + 8);
    const localCrc = bytes.readUInt32LE(localAt + 14), localCompressed = bytes.readUInt32LE(localAt + 18), localSize = bytes.readUInt32LE(localAt + 22);
    const localNameLength = bytes.readUInt16LE(localAt + 26), localExtraLength = bytes.readUInt16LE(localAt + 28);
    const payloadAt = localAt + 30 + localNameLength + localExtraLength, payloadEnd = payloadAt + compressedSize;
    assert(localFlags === flags && localMethod === method && localNameLength === nameLength
      && bytes.subarray(localAt + 30, localAt + 30 + localNameLength).equals(rawName), `Central/local header mismatch: ${name}`);
    assert(payloadAt <= centralAt && payloadEnd <= centralAt, `ZIP payload exceeds body: ${name}`);
    let rangeEnd = payloadEnd;
    if (flags & 8) {
      assert((localCrc === 0 || localCrc === crc) && (localCompressed === 0 || localCompressed === compressedSize)
        && (localSize === 0 || localSize === size), `Inconsistent deferred local sizes: ${name}`);
      const hasSignature = payloadEnd + 4 <= centralAt && bytes.readUInt32LE(payloadEnd) === 0x08074b50;
      const descriptor = payloadEnd + (hasSignature ? 4 : 0); rangeEnd = descriptor + 12;
      assert(rangeEnd <= centralAt && bytes.readUInt32LE(descriptor) === crc && bytes.readUInt32LE(descriptor + 4) === compressedSize
        && bytes.readUInt32LE(descriptor + 8) === size, `Invalid data descriptor: ${name}`);
    } else assert(localCrc === crc && localCompressed === compressedSize && localSize === size, `Local sizes/CRC differ: ${name}`);
    assert(ranges.every(range => rangeEnd <= range.start || localAt >= range.end), `Overlapping ZIP records: ${name}`);
    ranges.push({ start: localAt, end: rangeEnd });
    const payload = bytes.subarray(payloadAt, payloadEnd);
    const decoded = method === 0 ? Buffer.from(payload) : inflateRawSync(payload, { maxOutputLength: Math.max(1, size) });
    assert(decoded.length === size && crc32(decoded) === crc, `Decoded size/CRC mismatch: ${name}`);
    entries.push({ name, bytes: decoded, compressedBytes: compressedSize, method, crc32: crc.toString(16).padStart(8, '0') });
    cursor = next;
  }
  assert(cursor === centralAt + centralSize && seen.size === names.length, 'Incomplete ZIP directory');
  ranges.sort((a, b) => a.start - b.start);
  assert(ranges[0].start === 0 && ranges.every((range, index) => index === 0 || range.start === ranges[index - 1].end)
    && ranges.at(-1).end === centralAt, 'Unexpected gaps or prefixed data in ZIP body');
  return entries;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function run() {
  // Missing ZIP/report and reused output refuse before creating any evidence.
  await regularFile(zipPath); await regularFile(packageReportPath);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  const report = { schemaVersion: 1, version: VERSION, stage: STAGE, startedAtUtc: new Date().toISOString(),
    method: 'Node built-in zlib independent classic ZIP decode plus CRC32 and exact decoded byte comparisons; no Playwright ZIP reader reused.',
    expectedGameSha256: GAME_SHA256, expectedSourceInputs: SOURCE_COUNT, zip: zipPath, packageReport: packageReportPath,
    sourceChecks: [], files: [], pass: false };
  try {
    const scriptBytes = await readFile(fileURLToPath(import.meta.url));
    report.inspector = { path: '.tools/inspect-v083-release.mjs', sha256: sha(scriptBytes) };
    const metadataBytes = await readFile(resolve(root, 'dist/build-meta.json'));
    const packageBytes = await readFile(packageReportPath);
    await writeNew(resolve(output, 'build-meta.input.json'), metadataBytes);
    await writeNew(resolve(output, 'release-package.input.json'), packageBytes);
    const metadata = JSON.parse(metadataBytes), packaged = JSON.parse(packageBytes);
    report.inputHashes = { buildMeta: sha(metadataBytes), packageReport: sha(packageBytes) };
    assert(metadata.version === VERSION && metadata.stage === STAGE && packaged.version === VERSION && packaged.stage === STAGE, 'Release version/stage mismatch');
    assert(resolve(packaged.zip) === zipPath && resolve(packaged.verifiedFolder) === expectedVerifiedFolder, 'Unexpected report ZIP/verified paths');
    assert(packaged.staticPass === true && packaged.sourceValidation?.count === SOURCE_COUNT && packaged.sourceValidation?.pass === true, 'Packaging source validation missing');
    assert(isDeepStrictEqual(packaged.engine, metadata.engine) && isDeepStrictEqual(packaged.art, metadata.art), 'Report and tested build engine/art differ');
    const manifest = metadata.sourceManifest;
    assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest) && Object.keys(manifest).length === SOURCE_COUNT, 'Expected exactly 133 build inputs');
    for (const [path, expected] of Object.entries(manifest)) {
      assert(typeof expected === 'string' && /^[0-9a-f]{64}$/.test(expected), `Invalid source digest: ${path}`);
      const absolute = pathInRoot(path); await regularFile(absolute);
      const bytes = await readFile(absolute), actual = sha(bytes);
      report.sourceChecks.push({ path, expectedSha256: expected, actualSha256: actual, bytes: bytes.length, match: actual === expected });
    }
    assert(report.sourceChecks.every(source => source.match), 'Build inputs changed since tested dist');
    const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    assert(packageJson.version === VERSION && packageJson.viralInvasionStage === STAGE, 'Current package version/stage mismatch');
    const dist = new Map();
    for (const name of distNames) { const path = resolve(root, 'dist', name); await regularFile(path); dist.set(name, await readFile(path)); }
    assert(dist.get('build-meta.json').equals(metadataBytes), 'Dist metadata changed while inspecting');
    assert(sha(dist.get('game.js')) === GAME_SHA256, 'Tested dist/game.js differs from fixed tested SHA256');
    assert(Array.isArray(packaged.files) && packaged.files.length === names.length
      && new Set(packaged.files.map(file => file.name)).size === names.length
      && packaged.files.every(file => names.includes(file.name) && Number.isSafeInteger(file.bytes) && file.bytes >= 0
        && typeof file.sha256 === 'string' && /^[0-9a-f]{64}$/.test(file.sha256)), 'Unexpected package file manifest');
    const zip = await readFile(zipPath), zipSha256 = sha(zip);
    assert(zip.length === packaged.bytes && zipSha256 === packaged.sha256, 'ZIP size/SHA256 differs from release report');
    report.zipBytes = zip.length; report.zipSha256 = zipSha256;
    const entries = decodeZip(zip);
    await mkdir(resolve(output, 'independently-decoded'));
    for (const entry of entries) {
      const expected = packaged.files.find(file => file.name === entry.name);
      const releasedPath = resolve(releaseFolder, entry.name), verifiedPath = resolve(expectedVerifiedFolder, entry.name);
      await regularFile(releasedPath); await regularFile(verifiedPath);
      const released = await readFile(releasedPath), previousDecoded = await readFile(verifiedPath);
      const digest = sha(entry.bytes);
      assert(entry.bytes.length === expected.bytes && digest === expected.sha256, `Decoded bytes differ from package manifest: ${entry.name}`);
      assert(entry.bytes.equals(released) && entry.bytes.equals(previousDecoded), `ZIP/release/previous decoded bytes differ: ${entry.name}`);
      if (dist.has(entry.name)) assert(entry.bytes.equals(dist.get(entry.name)), `ZIP differs from tested dist: ${entry.name}`);
      if (entry.name === 'game.js') assert(digest === GAME_SHA256, 'Independent ZIP game.js differs from fixed tested hash');
      await writeNew(resolve(output, 'independently-decoded', entry.name), entry.bytes);
      report.files.push({ name: entry.name, bytes: entry.bytes.length, sha256: digest, compressedBytes: entry.compressedBytes,
        compressionMethod: entry.method, crc32: entry.crc32, matchesPackageManifest: true, matchesRelease: true,
        matchesPreviousDecoded: true, matchesTestedDist: dist.has(entry.name) ? true : null });
    }
    // A successful inspection also attests that its inputs stayed unchanged.
    for (const source of report.sourceChecks) assert(sha(await readFile(pathInRoot(source.path))) === source.actualSha256, `Source changed during inspection: ${source.path}`);
    assert((await readFile(packageReportPath)).equals(packageBytes) && (await readFile(zipPath)).equals(zip), 'Package report/ZIP changed during inspection');
    for (const file of report.files) {
      assert(sha(await readFile(resolve(releaseFolder, file.name))) === file.sha256
        && sha(await readFile(resolve(expectedVerifiedFolder, file.name))) === file.sha256, `Release/verified output changed during inspection: ${file.name}`);
      if (dist.has(file.name)) assert((await readFile(resolve(root, 'dist', file.name))).equals(dist.get(file.name)), `Tested dist changed during inspection: ${file.name}`);
    }
    report.pass = true;
  } catch (error) {
    report.error = String(error?.stack ?? error);
    process.exitCode = 1;
  }
  report.finishedAtUtc = new Date().toISOString();
  await writeNew(resolve(output, 'inspection.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass, report: resolve(output, 'inspection.json'), sourceCount: report.sourceChecks.length,
    decodedFiles: report.files.length, gameSha256: report.files.find(file => file.name === 'game.js')?.sha256, error: report.error ?? null }));
}

if (!args.includes('--run')) {
  console.log(JSON.stringify({ executed: false, required: '--run and an existing v0.8.3 ZIP/report',
    command: 'node .tools/inspect-v083-release.mjs --run --attempt=1', output,
    checks: ['fixed tested game.js SHA256', '133 current build inputs', 'report ZIP SHA256/size',
      'independent central/local ZIP parse, zlib decode and CRC32', 'all five decoded bytes versus report/release/verified',
      'three build files versus tested dist', 'inputs unchanged through inspection'] }));
} else await run();
