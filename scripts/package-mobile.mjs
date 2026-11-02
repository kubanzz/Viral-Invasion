import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_WORKSPACE = resolve(dirname(SCRIPT_PATH), '..');
const MOBILE_HTML = 'Viral-Invasion-Mobile.html';
const MOBILE_ZIP = 'Viral-Invasion-Mobile.zip';
const INSTRUCTIONS = '手机试玩说明.txt';
const SOURCE_REQUIREMENTS = ['scripts/package-mobile.mjs', 'Docs/ViralInvasion_Mobile_Playtest.md'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function within(root, path) {
  const absolute = resolve(root, path), local = relative(root, absolute);
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error(`Package path escapes its root: ${path}`);
  return absolute;
}

/** Keep browser file imports self-contained; notices remain inside the classic script. */
export function composeMobileHtml(html, javascript) {
  const entry = /<script\b[^>]*\bsrc\s*=\s*(['"])\.\/game\.js\1[^>]*>\s*<\/script\s*>/gi;
  const entries = [...html.matchAll(entry)];
  if (entries.length !== 1 || (html.match(/<script\b[^>]*\bsrc\s*=/gi) ?? []).length !== 1) throw new Error('Expected one classic ./game.js entry and no other external scripts.');
  if (/\btype\s*=\s*(['"])module\1/i.test(entries[0][0])) throw new Error('Mobile file imports require a classic script.');
  if (!/<html\b[^>]*>/i.test(html)) throw new Error('Build HTML is missing its root element.');
  if (!/<style(?:\s|>)/i.test(html)) throw new Error('Build HTML is missing its embedded stylesheet.');
  for (const link of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = /\bhref\s*=\s*(['"])(.*?)\1/i.exec(link[0]);
    if (!href || !/^data:/i.test(href[2])) throw new Error('Mobile HTML must not depend on linked stylesheets or other files.');
  }
  // A literal closing tag would terminate the HTML script element, even inside
  // a JavaScript string or a retained license comment. Use a callback so '$&'
  // and related replacement tokens in bundled source are preserved exactly.
  const inline = javascript.replace(/<\/script/gi, match => `<\\/${match.slice(2)}`);
  return html.replace(/<html\b[^>]*>/i, tag => `${tag.replace(/\sdata-mobile\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '').slice(0, -1)} data-mobile="true">`)
    .replace(entry, () => `<script>${inline}</script>`);
}

/** A stale source or altered dist file must never be presented as the current phone package. */
export async function readVerifiedMobileBuild({ workspaceRoot = DEFAULT_WORKSPACE, distDirectory = 'dist' } = {}) {
  const root = resolve(workspaceRoot), dist = within(root, distDirectory);
  const metadata = JSON.parse(await readFile(join(dist, 'build-meta.json'), 'utf8'));
  const packageData = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (metadata.version !== packageData.version || metadata.stage !== packageData.viralInvasionStage || metadata.format !== 'iife') throw new Error('Mobile package requires the matching classic/IIFE workspace build.');
  if (!metadata.browserTargets?.includes('safari17.6')) throw new Error('Rebuild with the Safari 17.6 target before making the mobile package.');
  if (!metadata.sourceManifest || typeof metadata.sourceManifest !== 'object' || Array.isArray(metadata.sourceManifest)) throw new Error('Build source manifest is missing.');
  for (const path of SOURCE_REQUIREMENTS) if (!Object.hasOwn(metadata.sourceManifest, path)) throw new Error(`Build does not attest the mobile packaging input: ${path}`);
  for (const [path, expected] of Object.entries(metadata.sourceManifest)) {
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/i.test(expected)) throw new Error(`Invalid source hash: ${path}`);
    if (sha256(await readFile(within(root, path))) !== expected) throw new Error(`Build source changed before mobile packaging: ${path}`);
  }
  const outputs = new Map();
  for (const name of ['index.html', 'game.js', 'game.css']) {
    const bytes = await readFile(join(dist, name));
    if (metadata.outputManifest?.[name] !== sha256(bytes)) throw new Error(`Build output changed or is unattested: ${name}`);
    outputs.set(name, bytes);
  }
  const instructions = await readFile(join(root, 'Docs', 'ViralInvasion_Mobile_Playtest.md'));
  return { root, metadata, outputs, instructions };
}

function zipTools() {
  // Reuse the pinned Playwright dependency, as package-release.mjs already does.
  const require = createRequire(import.meta.url);
  return require(join(dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
}

async function verifyArchive(path, expected, yauzl) {
  return new Promise((done, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, archive) => {
      if (error) { reject(error); return; }
      const files = [], seen = new Set();
      archive.on('error', reject);
      archive.on('entry', entry => {
        (async () => {
          if (!expected.has(entry.fileName) || seen.has(entry.fileName)) throw new Error(`Unexpected mobile ZIP entry: ${entry.fileName}`);
          seen.add(entry.fileName);
          const stream = await new Promise((resolveStream, rejectStream) => archive.openReadStream(entry, (error, stream) => error ? rejectStream(error) : resolveStream(stream)));
          const parts = []; for await (const part of stream) parts.push(part);
          const bytes = Buffer.concat(parts);
          if (!bytes.equals(expected.get(entry.fileName))) throw new Error(`Decoded mobile ZIP bytes differ: ${entry.fileName}`);
          files.push({ name: entry.fileName, bytes: bytes.length, sha256: sha256(bytes) });
          archive.readEntry();
        })().catch(error => { archive.close(); reject(error); });
      });
      archive.on('end', () => files.length === expected.size ? done(files) : reject(new Error('Mobile ZIP entries are missing.')));
      archive.readEntry();
    });
  });
}

export async function packageMobile({ workspaceRoot = DEFAULT_WORKSPACE, distDirectory = 'dist', releaseDirectory = 'releases', reportPath = 'artifacts/mobile-release/package-report.json' } = {}) {
  const { root, metadata, outputs, instructions } = await readVerifiedMobileBuild({ workspaceRoot, distDirectory });
  const release = within(root, releaseDirectory), reportFile = within(root, reportPath);
  const htmlBytes = Buffer.from(composeMobileHtml(outputs.get('index.html').toString('utf8'), outputs.get('game.js').toString('utf8')));
  const expected = new Map([[MOBILE_HTML, htmlBytes], [INSTRUCTIONS, instructions]]);
  const htmlPath = join(release, MOBILE_HTML), zipPath = join(release, MOBILE_ZIP);
  const pendingHtml = `${htmlPath}.pending`, pendingZip = `${zipPath}.pending`;
  await mkdir(release, { recursive: true });
  const { yazl, yauzl } = zipTools();
  try {
    await writeFile(pendingHtml, htmlBytes, { flag: 'wx' });
    const zip = new yazl.ZipFile();
    const output = pipeline(zip.outputStream, createWriteStream(pendingZip, { flags: 'wx' }));
    for (const [name, bytes] of expected) zip.addBuffer(bytes, name);
    zip.end(); await output;
    const files = await verifyArchive(pendingZip, expected, yauzl);
    const zipBytes = await readFile(pendingZip);
    // Fixed candidate names are intentionally refreshed only after validation.
    await rename(pendingHtml, htmlPath);
    await rename(pendingZip, zipPath);
    const report = { version: metadata.version, stage: metadata.stage, html: htmlPath, zip: zipPath, htmlBytes: htmlBytes.length,
      htmlSha256: sha256(htmlBytes), zipBytes: zipBytes.length, zipSha256: sha256(zipBytes), files,
      browserTargets: metadata.browserTargets, sourceValidation: { count: Object.keys(metadata.sourceManifest).length, pass: true },
      outputValidation: { count: outputs.size, pass: true },
      mobileMarker: 'document.documentElement.dataset.mobile === "true"',
      verification: 'Current source and output hashes; independent ZIP decoding and exact bytes. iPhone/Sitecase real-device play is not implied.' };
    await mkdir(dirname(reportFile), { recursive: true });
    await writeFile(reportFile, JSON.stringify(report, null, 2));
    return report;
  } finally {
    // Only our two explicitly named, non-recursive temporary files are removed.
    await Promise.all([pendingHtml, pendingZip].map(path => rm(path, { force: true })));
  }
}

async function main() {
  if (process.argv.length > 2) throw new Error('Usage: node scripts/package-mobile.mjs (build first with npm run build)');
  const report = await packageMobile();
  console.log(JSON.stringify(report));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => {
  console.error(`Mobile packaging failed: ${error.message}`); process.exitCode = 1;
});
