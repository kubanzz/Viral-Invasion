import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const { intakeChatgptArt } = await import(pathToFileURL(resolve('scripts/intake-chatgpt-art.mjs')).href);
const roots: string[] = [];
async function fixture() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'viral-art-intake-')); roots.push(workspaceRoot);
  const batch = 'art/batch09', batchRoot = join(workspaceRoot, 'asserts', batch);
  await mkdir(batchRoot, { recursive: true });
  const source = { provider: 'ChatGPT web', project: 'Fixture', conversationTitle: 'Art', conversationUrl: 'https://chatgpt.com/c/fixture' };
  const manifestPath = join(batchRoot, 'manifest.json'), selectionPath = join(workspaceRoot, 'asserts', 'art-selection.json');
  await writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, source, customBatchField: 'retain', assets: [] }, null, 2) + '\n');
  await writeFile(selectionPath, JSON.stringify({ schemaVersion: 1, sprites: [], environments: [], catalogue: [], customSelectionField: 'retain' }, null, 2) + '\n');
  const image = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#00000000' } }).composite([
    { input: await sharp({ create: { width: 16, height: 20, channels: 4, background: '#69cdeaff' } }).png().toBuffer(), left: 8, top: 6 },
  ]).png().toBuffer();
  const input = join(workspaceRoot, 'original download.png'); await writeFile(input, image);
  const options = { workspaceRoot, batch, input, id: 'immune.beacon', path: 'immune/beacon_v1.png',
    expectedSha256: createHash('sha256').update(image).digest('hex'), visualReview: 'One full object reviewed manually.',
    visualAccepted: true, select: true, size: 96, pivotSource: [.5, .82], intendedUse: 'Static independent beacon.' };
  return { workspaceRoot, batchRoot, input, image, manifestPath, selectionPath, source, options };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const absolute = resolve(root), parent = resolve(tmpdir());
    if (!absolute.startsWith(parent + sep) || !basename(absolute).startsWith('viral-art-intake-')) throw new Error('Unexpected intake cleanup path');
    await rm(absolute, { recursive: true, force: true });
  }
});

describe('explicit ChatGPT PNG intake', () => {
  it('preserves original bytes and provenance, selects only on explicit review, and is idempotent', async () => {
    const f = await fixture(), first = await intakeChatgptArt(f.options);
    expect(await readFile(first.path)).toEqual(f.image);
    const manifest = JSON.parse(await readFile(f.manifestPath, 'utf8')), selected = JSON.parse(await readFile(f.selectionPath, 'utf8'));
    expect(manifest.customBatchField).toBe('retain'); expect(selected.customSelectionField).toBe('retain');
    expect(manifest.assets[0]).toMatchObject({ originalFileName: 'original download.png', source: f.source,
      canvas: { width: 32, height: 32, hasAlpha: true }, animation: { isSequence: false, frameCount: 1, fullAnimationClaimed: false } });
    expect(selected.sprites[0]).toMatchObject({ id: f.options.id, expectedSha256: f.options.expectedSha256, pivotSource: [.5, .82] });
    expect(selected.catalogue).toEqual(['art/batch09/immune/beacon_v1.png']);
    const manifestBefore = await readFile(f.manifestPath), selectionBefore = await readFile(f.selectionPath);
    const repeat = await intakeChatgptArt(f.options);
    expect(repeat).toMatchObject({ copied: false, recordAdded: false, manifestChanged: false, selectionChanged: false });
    expect(await readFile(f.manifestPath)).toEqual(manifestBefore); expect(await readFile(f.selectionPath)).toEqual(selectionBefore);
  });

  it('retains unselected candidates without promoting them or altering existing metadata on retries', async () => {
    const f = await fixture(), selectionBefore = await readFile(f.selectionPath);
    const options = { ...f.options, select: false, visualAccepted: false, visualReview: 'Needs registration.', status: 'requires-registration' };
    await intakeChatgptArt(options);
    const manifest = JSON.parse(await readFile(f.manifestPath, 'utf8'));
    manifest.assets[0].customArtistField = { keep: true }; manifest.assets[0].review.runtime = 'later-inspected';
    await writeFile(f.manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    const before = await readFile(f.manifestPath); await intakeChatgptArt(options);
    expect(await readFile(f.selectionPath)).toEqual(selectionBefore); expect(await readFile(f.manifestPath)).toEqual(before);
    expect(manifest.assets[0].review.visual).toBe('pending');
  });

  it('refuses wrong download hashes and a different existing destination without overwriting either', async () => {
    const f = await fixture(), manifestBefore = await readFile(f.manifestPath);
    await expect(intakeChatgptArt({ ...f.options, expectedSha256: '0'.repeat(64) })).rejects.toThrow('does not match');
    await mkdir(join(f.batchRoot, 'immune'));
    const destination = join(f.batchRoot, 'immune', 'beacon_v1.png'), other = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#ff5577ff' } }).png().toBuffer();
    await writeFile(destination, other);
    await expect(intakeChatgptArt(f.options)).rejects.toThrow('refusing to overwrite');
    expect(await readFile(destination)).toEqual(other); expect(await readFile(f.manifestPath)).toEqual(manifestBefore);
  });

  it('requires manual acceptance and refuses conflicting selection ids or manifest identities', async () => {
    const f = await fixture();
    await expect(intakeChatgptArt({ ...f.options, visualAccepted: false })).rejects.toThrow('explicit visualAccepted');
    const selection = JSON.parse(await readFile(f.selectionPath, 'utf8'));
    selection.sprites.push({ id: 'old', aliases: [f.options.id], source: 'old.png' });
    await writeFile(f.selectionPath, JSON.stringify(selection));
    await expect(intakeChatgptArt(f.options)).rejects.toThrow('different source');
    const manifest = JSON.parse(await readFile(f.manifestPath, 'utf8'));
    manifest.assets.push({ id: f.options.id, path: 'other.png', sha256: f.options.expectedSha256 });
    await writeFile(f.manifestPath, JSON.stringify(manifest));
    await expect(intakeChatgptArt({ ...f.options, select: false })).rejects.toThrow('different original');
  });

  it('rejects traversal, absolute paths and junction destinations outside the local batch', async () => {
    const f = await fixture();
    for (const path of ['../escape.png', 'immune/../../escape.png', '.. /escape.png', 'D:\\escape.png', '/escape.png']) {
      await expect(intakeChatgptArt({ ...f.options, path })).rejects.toThrow(/relative path|inside its local art directory/);
    }
    await expect(intakeChatgptArt({ ...f.options, batch: '../outside' })).rejects.toThrow('inside its local art directory');
    const outside = join(f.workspaceRoot, 'outside'); await mkdir(outside);
    await symlink(outside, join(f.batchRoot, 'linked'), 'junction');
    await expect(intakeChatgptArt({ ...f.options, path: 'linked/escaped.png' })).rejects.toThrow('real local directory');
  });
});
