import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const starterUrl = pathToFileURL(resolve('scripts/start-local.mjs')).href;
const { checkWorkspaceBuild, launchWorkspace } = await import(starterUrl);
const temporaryRoots: string[] = [];
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'viral-workspace-start-')); temporaryRoots.push(root);
  for (const directory of ['src', 'dist', '.art-generated']) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.2.3', viralInvasionStage: 'G4' }));
  await writeFile(join(root, 'src/main.ts'), 'original source');
  await writeFile(join(root, '.art-generated/art-runtime.json'), JSON.stringify({ inputSignature: 'fixture-art' }));
  async function writeBuild() {
    const paths = ['package.json', 'src/main.ts', '.art-generated/art-runtime.json'];
    const sourceManifest = Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(join(root, path)))])));
    await writeFile(join(root, 'dist/index.html'), '<html>fixture build</html>');
    await writeFile(join(root, 'dist/game.js'), 'fixture game');
    await writeFile(join(root, 'dist/build-meta.json'), JSON.stringify({ version: '1.2.3', stage: 'G4', format: 'iife', sourceManifest, art: { inputSignature: 'fixture-art' } }));
  }
  await writeBuild();
  return { root, writeBuild, synchronize: async () => ({ runtime: { inputSignature: 'fixture-art' } }) };
}

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    const absolute = resolve(root);
    if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('viral-workspace-start-')) throw new Error(`Unexpected temporary cleanup target: ${absolute}`);
    await rm(absolute, { recursive: true, force: true });
  }
});

describe('source-workspace launcher', () => {
  it('reads a matching build and detects changed source hashes and missing output files', async () => {
    const f = await fixture();
    expect(await checkWorkspaceBuild({ workspaceRoot: f.root })).toMatchObject({ current: true, needsBuild: false, sourceCount: 3 });
    await writeFile(join(f.root, 'src/main.ts'), 'changed source');
    await rm(join(f.root, 'dist/game.js'));
    const stale = await checkWorkspaceBuild({ workspaceRoot: f.root });
    expect(stale.current).toBe(false);
    expect(stale.reasons).toContainEqual({ code: 'source-changed', path: 'src/main.ts' });
    expect(stale.reasons).toContainEqual({ code: 'missing-output', path: 'dist/game.js' });
  });

  it('synchronizes before inspecting, rebuilds stale sources, verifies them, then opens only the new build', async () => {
    const f = await fixture(), calls: string[] = [];
    const result = await launchWorkspace({ workspaceRoot: f.root, log: () => {},
      synchronize: async () => { calls.push('sync'); await writeFile(join(f.root, 'src/main.ts'), 'synchronized artwork integration'); return f.synchronize(); },
      build: async () => { calls.push('build'); await f.writeBuild(); await writeFile(join(f.root, 'dist/index.html'), '<html>new build</html>'); },
      open: async ({ entryPath }: { entryPath: string }) => { calls.push('open'); expect(await readFile(entryPath, 'utf8')).toContain('new build'); },
    });
    expect(calls).toEqual(['sync', 'build', 'open']);
    expect(result).toMatchObject({ current: true, rebuilt: true, opened: true });
  });

  it('does not open an old package after a failed or incomplete rebuild', async () => {
    const f = await fixture(); let opened = false;
    await writeFile(join(f.root, 'src/main.ts'), 'changed source');
    const base = { workspaceRoot: f.root, synchronize: f.synchronize, log: () => {}, open: async () => { opened = true; } };
    await expect(launchWorkspace({ ...base, build: async () => { throw new Error('fixture compiler failure'); } })).rejects.toThrow('fixture compiler failure');
    expect(opened).toBe(false);
    await expect(launchWorkspace({ ...base, build: async () => {} })).rejects.toThrow('without matching current sources');
    expect(opened).toBe(false);
  });

  it('keeps --check read-only and skips opening for a successful --no-open preparation', async () => {
    const f = await fixture(), calls: string[] = [];
    const before = await readFile(join(f.root, 'dist/build-meta.json'));
    await writeFile(join(f.root, 'src/main.ts'), 'stale source');
    const checked = await launchWorkspace({ workspaceRoot: f.root, checkOnly: true,
      synchronize: async ({ checkOnly }: { checkOnly: boolean }) => { expect(checkOnly).toBe(true); return f.synchronize(); },
      build: async () => { calls.push('build'); }, open: async () => { calls.push('open'); },
    });
    expect(checked).toMatchObject({ current: false, checked: true, rebuilt: false, opened: false });
    expect(calls).toEqual([]);
    expect(await readFile(join(f.root, 'dist/build-meta.json'))).toEqual(before);
    const prepared = await launchWorkspace({ workspaceRoot: f.root, noOpen: true, synchronize: f.synchronize, log: () => {},
      build: async () => { calls.push('build'); await f.writeBuild(); }, open: async () => { calls.push('open'); },
    });
    expect(prepared).toMatchObject({ current: true, rebuilt: true, opened: false });
    expect(calls).toEqual(['build']);
  });

  it('rejects source-manifest paths outside the workspace without reading them', async () => {
    const f = await fixture(), metadataPath = join(f.root, 'dist/build-meta.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    metadata.sourceManifest['../outside.txt'] = '0'.repeat(64);
    await writeFile(metadataPath, JSON.stringify(metadata));
    const result = await checkWorkspaceBuild({ workspaceRoot: f.root });
    expect(result.reasons).toContainEqual({ code: 'invalid-source-entry', path: '../outside.txt' });
    expect(result.current).toBe(false);
  });

  it('stops before build or open when artwork synchronization fails', async () => {
    const f = await fixture(), calls: string[] = [];
    await expect(launchWorkspace({ workspaceRoot: f.root,
      synchronize: async () => { throw new Error('required artwork missing'); },
      build: async () => { calls.push('build'); }, open: async () => { calls.push('open'); },
    })).rejects.toThrow('required artwork missing');
    expect(calls).toEqual([]);
  });
});
