import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncArt } from './art-sync.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_WORKSPACE = resolve(dirname(SCRIPT_PATH), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function optionalRead(path) { try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } }
async function populatedFile(path) { try { const info = await stat(path); return info.isFile() && info.size > 0; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }

/** Read-only inspection. A missing/stale build is a result, not permission to open it. */
export async function checkWorkspaceBuild({ workspaceRoot = DEFAULT_WORKSPACE, artInputSignature } = {}) {
  const root = resolve(workspaceRoot), output = join(root, 'dist'), reasons = [];
  for (const name of ['index.html', 'game.js']) if (!await populatedFile(join(output, name))) reasons.push({ code: 'missing-output', path: `dist/${name}` });
  const metadataBytes = await optionalRead(join(output, 'build-meta.json'));
  if (!metadataBytes) return { current: false, needsBuild: true, sourceCount: 0, reasons: [...reasons, { code: 'missing-build-metadata', path: 'dist/build-meta.json' }] };
  let metadata;
  try { metadata = JSON.parse(metadataBytes.toString('utf8')); } catch { return { current: false, needsBuild: true, sourceCount: 0, reasons: [...reasons, { code: 'invalid-build-metadata', path: 'dist/build-meta.json' }] }; }
  const packageData = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (metadata.version !== packageData.version || metadata.stage !== packageData.viralInvasionStage) reasons.push({ code: 'version-changed', path: 'package.json' });
  if (metadata.format !== 'iife') reasons.push({ code: 'unexpected-build-format', path: 'dist/build-meta.json' });
  const manifest = metadata.sourceManifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Object.keys(manifest).length) reasons.push({ code: 'missing-source-manifest', path: 'dist/build-meta.json' });
  else for (const [path, expected] of Object.entries(manifest)) {
    const absolute = resolve(root, path), localPath = relative(root, absolute);
    if (!localPath || localPath === '..' || localPath.startsWith(`..${sep}`) || isAbsolute(localPath) || typeof expected !== 'string' || !/^[a-f0-9]{64}$/i.test(expected)) {
      reasons.push({ code: 'invalid-source-entry', path }); continue;
    }
    const bytes = await optionalRead(absolute);
    if (!bytes) reasons.push({ code: 'missing-source', path });
    else if (hash(bytes) !== expected) reasons.push({ code: 'source-changed', path });
  }
  if (artInputSignature === undefined) {
    const runtimeBytes = await optionalRead(join(root, '.art-generated', 'art-runtime.json'));
    try { artInputSignature = runtimeBytes ? JSON.parse(runtimeBytes.toString('utf8')).inputSignature : undefined; } catch { /* Missing/broken generation is stale. */ }
  }
  if (!artInputSignature || metadata.art?.inputSignature !== artInputSignature) reasons.push({ code: 'art-generation-changed', path: '.art-generated/art-runtime.json' });
  return { current: reasons.length === 0, needsBuild: reasons.length > 0, sourceCount: manifest && typeof manifest === 'object' ? Object.keys(manifest).length : 0, reasons };
}

function runCommand(command, args, options = {}) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? done() : reject(new Error(`Command failed (${signal ?? code}): ${command}`)));
  });
}
async function buildOffline({ workspaceRoot }) {
  const environment = { ...process.env };
  // Workspace launches always prepare their own dist, independent of a shell's
  // output override used by earlier evidence or packaging commands.
  delete environment.VI_DIST_DIR;
  await runCommand(process.execPath, [join(workspaceRoot, 'scripts', 'build-offline.mjs')], { cwd: workspaceRoot, env: environment, stdio: 'inherit' });
}
async function openBuild({ entryPath, workspaceRoot }) {
  const url = pathToFileURL(entryPath).href;
  if (process.platform === 'win32') await runCommand('rundll32.exe', ['url.dll,FileProtocolHandler', url], { cwd: workspaceRoot, stdio: 'ignore' });
  else if (process.platform === 'darwin') await runCommand('open', [url], { cwd: workspaceRoot, stdio: 'ignore' });
  else await runCommand('xdg-open', [url], { cwd: workspaceRoot, stdio: 'ignore' });
}

/** Dependencies are injectable so verification never needs a browser or real build. */
export async function launchWorkspace({ workspaceRoot = DEFAULT_WORKSPACE, checkOnly = false, noOpen = false,
  synchronize = syncArt, build = buildOffline, open = openBuild, log = console.log } = {}) {
  const root = resolve(workspaceRoot);
  const synced = await synchronize({ workspaceRoot: root, checkOnly });
  const options = { workspaceRoot: root, artInputSignature: synced.runtime?.inputSignature };
  const before = await checkWorkspaceBuild(options);
  if (checkOnly) return { ...before, checked: true, rebuilt: false, opened: false };
  let after = before, rebuilt = false;
  if (before.needsBuild) {
    log(`Preparing current game build (${before.reasons.length} stale/missing item(s)).`);
    await build({ workspaceRoot: root });
    after = await checkWorkspaceBuild(options);
    if (!after.current) throw new Error(`Build completed without matching current sources: ${after.reasons.slice(0, 5).map(reason => `${reason.code}: ${reason.path}`).join('; ')}`);
    rebuilt = true;
  }
  if (!noOpen) await open({ entryPath: join(root, 'dist', 'index.html'), workspaceRoot: root });
  return { ...after, checked: false, rebuilt, opened: !noOpen, reasonsBeforeBuild: before.reasons };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--check', '--no-open'].includes(arg))) throw new Error('Usage: node scripts/start-local.mjs [--check] [--no-open]');
  const result = await launchWorkspace({ checkOnly: args.includes('--check'), noOpen: args.includes('--no-open') });
  console.log(JSON.stringify(result));
  if (!result.current) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => {
  console.error(`Workspace launch failed; the previous build was not opened: ${error.message}`);
  process.exitCode = 1;
});
