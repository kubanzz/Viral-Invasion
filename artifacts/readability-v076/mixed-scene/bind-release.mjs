import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Parent calls this only after v076 production sources and build are frozen.
// It writes a new identity document, never source, build, profile or old data.
const base = 'artifacts/readability-v076/mixed-scene', args = process.argv.slice(2), flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--parent-frozen') flags.parentFrozen = true;
  else if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) flags[args[i].slice(2)] = args[++i];
  else throw Error('Invalid flag: ' + args[i]);
}
if (!flags.parentFrozen || flags.version !== '0.7.6' || !/^[a-f0-9]{40}$/.test(flags['expected-head'] ?? '') || !/^[a-f0-9]{64}$/.test(flags['expected-game'] ?? ''))
  throw Error('Explicit --parent-frozen --version 0.7.6 --expected-head <full HEAD> --expected-game <SHA256> required. v075 is preparation only.');
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const identityPath = `${base}/release-identity.json`;
try { await stat(identityPath); throw Error('Identity already exists; do not overwrite a frozen capture identity.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const build = JSON.parse(await readFile('dist/build-meta.json', 'utf8'));
const prepared = JSON.parse(await readFile(`${base}/prepared.json`, 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== flags['expected-head'] || build.version !== flags.version || await hash('dist/game.js') !== flags['expected-game']) throw Error('Explicit v076 release identity does not match.');
for (const [path, expected] of Object.entries({ ...build.sourceManifest, ...prepared.inputs })) if (await hash(path) !== expected) throw Error('Frozen input changed: ' + path);
await writeFile(identityPath, JSON.stringify({ schemaVersion: 1, status: 'parent-bound-frozen-v076', boundAt: new Date().toISOString(),
  version: flags.version, head, gameSha256: flags['expected-game'], buildMetaSha256: await hash('dist/build-meta.json'),
  preparedSha256: await hash(`${base}/prepared.json`), sourceInputCount: Object.keys(build.sourceManifest).length,
  scope: 'Parent-provided release identity, not capture execution, automatic readability or whole-row acceptance.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ bound: true, identityPath, browserStarted: false }));
