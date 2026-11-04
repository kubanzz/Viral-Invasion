import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

// A computed URL lets the build-only .mjs implementation stay outside game TypeScript.
const pipelineUrl = pathToFileURL(resolve('scripts/art-sync.mjs')).href;
const { syncArt, packShelves, artToneFor, finishArtImage } = await import(pipelineUrl);
const temporaryRoots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'viral-art-pipeline-'));
  temporaryRoots.push(root);
  const sourceRoot = join(root, 'incoming'), workspaceRoot = join(root, 'workspace');
  const localRoot = join(workspaceRoot, 'asserts'), outputDirectory = join(workspaceRoot, '.art-generated');
  await mkdir(sourceRoot, { recursive: true }); await mkdir(localRoot, { recursive: true });
  const image = await sharp({ create: { width: 48, height: 64, channels: 4, background: '#00000000' } }).composite([{ input: await sharp({ create: { width: 24, height: 48, channels: 4, background: '#63cbd8ff' } }).png().toBuffer(), left: 12, top: 8 }]).png().toBuffer();
  await writeFile(join(sourceRoot, 'hero.png'), image);
  await writeFile(join(localRoot, 'art-selection.json'), JSON.stringify({ schemaVersion: 1, catalogue: ['hero.png'], sprites: [{ id: 'hero.clean', aliases: ['hero.idle'], source: 'hero.png', size: 64, pivotSource: [.5, .875], flags: ['single-key-pose'] }], environments: [] }));
  const options = { workspaceRoot, sourceRoot, outputDirectory };
  return { root, sourceRoot, localRoot, outputDirectory, image, options };
}

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    const absolute = resolve(root), parent = resolve(tmpdir());
    if (!absolute.startsWith(parent + sep) || !basename(absolute).startsWith('viral-art-pipeline-')) throw new Error(`Unexpected temporary cleanup path: ${absolute}`);
    await rm(absolute, { recursive: true, force: true });
  }
});

describe('curated offline art pipeline', () => {
  it('softens painted colour and highlights without changing alpha, dimensions, icons or effects', async () => {
    const pixels = Buffer.from([250, 86, 59, 255, 255, 255, 255, 180, 42, 74, 91, 8, 0, 0, 0, 0]);
    const image = () => sharp(pixels, { raw: { width: 4, height: 1, channels: 4 } });
    const original = await image().raw().toBuffer();
    for (const tone of [artToneFor('heart.floor', 'environment'), artToneFor('lung.wall', 'environment'), artToneFor('hero.clean')]) {
      const { data, info } = await finishArtImage(image(), tone).raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([4, 1, 4]);
      expect([data[3], data[7], data[11], data[15]]).toEqual([255, 180, 8, 0]);
      expect(Math.max(...data.subarray(0, 3)) - Math.min(...data.subarray(0, 3))).toBeLessThan(250 - 59);
      expect(Math.max(...data.subarray(4, 7))).toBeLessThan(255);
      expect(Math.min(...data.subarray(8, 11))).toBeGreaterThanOrEqual(35);
    }
    for (const id of ['fx.heal.00', 'fx.scan.00', 'icon.chain', 'icon.dash', 'fantasy.tree.healthy', 'fantasy.tree.infected', 'fantasy.floor.healthy']) {
      expect(artToneFor(id)).toBeNull();
      expect(await finishArtImage(image(), artToneFor(id)).raw().toBuffer()).toEqual(original);
    }
  });

  it('preserves every 8-bit alpha value through colour grading and encoded PNG round trips', async () => {
    const rgba = Buffer.from(Array.from({ length: 256 }, (_, alpha) => [216, 106, 72, alpha]).flat());
    for (const id of ['heart.floor', 'lung.wall', 'hero.clean', 'scenery.alveoli']) {
      const tone = artToneFor(id, id.endsWith('.floor') || id === 'lung.wall' ? 'environment' : 'sprite');
      const png = await finishArtImage(sharp(rgba, { raw: { width: 256, height: 1, channels: 4 } }), tone).png().toBuffer();
      const result = await sharp(png).ensureAlpha().raw().toBuffer();
      const actualAlpha = Buffer.from(Array.from({ length: 256 }, (_, i) => result[i * 4 + 3]));
      expect(actualAlpha).toEqual(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
    }
  });

  it('pins every selected workspace original to its currently chosen bytes', async () => {
    const root = resolve('asserts');
    const selection = JSON.parse(await readFile(join(root, 'art-selection.json'), 'utf8'));
    for (const asset of [...selection.sprites, ...selection.environments]) {
      expect(asset.expectedSha256, `${asset.id} must explicitly pin its selected source`).toMatch(/^[a-f0-9]{64}$/);
      const bytes = await readFile(join(root, asset.source));
      expect(createHash('sha256').update(bytes).digest('hex'), `${asset.id} source changed without review`).toBe(asset.expectedSha256);
    }
  });

  it('extracts reviewed sheet cells into frame-local shared canvases, preserves raw colour and local grip/muzzle registration', async () => {
    const f = await fixture();
    const block = await sharp({ create: { width: 128, height: 256, channels: 4, background: '#bf7194ff' } }).png().toBuffer();
    const sheet = await sharp({ create: { width: 1024, height: 512, channels: 4, background: '#00000000' } })
      .composite([{ input: block, left: 180, top: 100 }, { input: block, left: 692, top: 160 }]).png().toBuffer();
    await writeFile(join(f.sourceRoot, 'sheet.png'), sheet);
    const sprites = [0, 1].map(index => ({ id: `fantasy.actor.test.walk.0${index}`, source: 'sheet.png',
      expectedSha256: createHash('sha256').update(sheet).digest('hex'), sourceFrame: { x: index * 512, y: 0, width: 512, height: 512 },
      size: 256, trim: false, pivotSource: [.5, .85], actorRegistration: { canvas: { width: 512, height: 512 },
        foot: { x: 256, y: 435.2 }, grip: { x: 300, y: 340 }, muzzle: { x: 410, y: 320 }, commonCanvasScale: 1 },
      animation: { group: 'fantasy.actor.test.walk', index, fps: 8, frameCount: 2, approved: true } }));
    const selection = { schemaVersion: 1, sprites, environments: [], actorContract: { version: 2 } };
    await writeFile(join(f.localRoot, 'art-selection.json'), JSON.stringify(selection));
    const { runtime } = await syncArt(f.options), first = runtime.assets[sprites[0].id], second = runtime.assets[sprites[1].id];
    expect(runtime.actorContract).toEqual({ version: 2 });
    for (const frame of [first, second]) {
      expect(frame.sourceSize).toEqual({ width: 512, height: 512 }); expect(frame.tone).toBeNull();
      expect(frame.actorRegistration).toEqual(sprites[0].actorRegistration);
      expect(frame.sourceMuzzle).toEqual({ x: 410, y: 320 });
      expect(frame.sourceBounds.x).toBe(180); expect(frame.sourceBounds.width).toBe(128);
    }
    expect(first.sourceBounds.y).toBe(100); expect(second.sourceBounds.y).toBe(160);
    expect(first.width).toBe(second.width); expect(first.height).toBe(second.height); expect(first.pivot).toEqual(second.pivot);
    expect(first.sourceFrame).toEqual(sprites[0].sourceFrame); expect(second.sourceFrame).toEqual(sprites[1].sourceFrame);
    const atlas = runtime.atlases.find((page: { key: string }) => page.key === first.atlas);
    const rgba = await sharp(Buffer.from(atlas.dataUri.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer();
    expect(rgba.includes(Buffer.from([191, 113, 148, 255]))).toBe(true);
    sprites[1].sourceFrame.x = 513;
    await writeFile(join(f.localRoot, 'art-selection.json'), JSON.stringify(selection));
    await expect(syncArt(f.options)).rejects.toThrow('Source frame outside sheet');
  });

  it('rejects repeated sheet cells and independent alpha fitting in new actor groups', async () => {
    const f = await fixture(), id = 'fantasy.actor.test.walk';
    const first = { id: `${id}.00`, source: 'hero.png', size: 64, trim: false,
      animation: { group: id, index: 0, fps: 8, frameCount: 2, approved: true } };
    const selection = { schemaVersion: 1, sprites: [first, { ...first, id: `${id}.01`, animation: { ...first.animation, index: 1 } }], environments: [] };
    await writeFile(join(f.localRoot, 'art-selection.json'), JSON.stringify(selection));
    await expect(syncArt(f.options)).rejects.toThrow('Repeated source cell');
    selection.sprites.pop(); first.trim = true;
    await writeFile(join(f.localRoot, 'art-selection.json'), JSON.stringify(selection));
    await expect(syncArt(f.options)).rejects.toThrow('complete shared canvas');
  });

  it('rejects a generic candidate animation group before it silently falls back to only frame zero', async () => {
    const f=await fixture(),id='fantasy.actor.test.walk.00';
    const selection={schemaVersion:1,sprites:[{id,source:'hero.png',size:64,trim:false,
      animation:{group:'fantasy.actor.walk',index:0,fps:8,frameCount:1,approved:false}}],environments:[]};
    await writeFile(join(f.localRoot,'art-selection.json'),JSON.stringify(selection));
    await expect(syncArt(f.options)).rejects.toThrow('Actor animation group must match its identity and clip');
    selection.sprites[0].animation.group='fantasy.actor.test.walk';
    await writeFile(join(f.localRoot,'art-selection.json'),JSON.stringify(selection));
    const result=await syncArt(f.options);
    expect(result.runtime.assets[id].animation).toEqual(selection.sprites[0].animation);
  });

  it('uses workspace assets by default even when a legacy source environment variable is set', async () => {
    const f = await fixture();
    const localOriginal = await sharp({ create: { width: 48, height: 64, channels: 4, background: '#92e4b8ff' } }).png().toBuffer();
    await writeFile(join(f.localRoot, 'hero.png'), localOriginal);
    const oldSource = process.env.VI_ART_SOURCE;
    process.env.VI_ART_SOURCE = f.sourceRoot;
    try {
      const first = await syncArt({ workspaceRoot: f.options.workspaceRoot, outputDirectory: f.outputDirectory });
      expect(first.report.sourceMode).toBe('local-snapshot');
      expect(first.report.changedSourcePaths).toEqual([]);
      expect(await readFile(join(f.localRoot, 'hero.png'))).toEqual(localOriginal);
      expect(first.runtime.assets['hero.clean'].sourceSha256).toBe(createHash('sha256').update(localOriginal).digest('hex'));
      await writeFile(join(f.localRoot, 'new-candidate.png'), f.image);
      await expect(syncArt({ workspaceRoot: f.options.workspaceRoot, outputDirectory: f.outputDirectory, checkOnly: true })).rejects.toThrow('stale');
      const second = await syncArt({ workspaceRoot: f.options.workspaceRoot, outputDirectory: f.outputDirectory });
      expect(second.report.unknownCandidates).toContain('new-candidate.png');
      expect(second.runtime.assets).not.toHaveProperty('new-candidate');
      expect((await syncArt({ workspaceRoot: f.options.workspaceRoot, outputDirectory: f.outputDirectory })).changed).toBe(false);
    } finally {
      if (oldSource === undefined) delete process.env.VI_ART_SOURCE;
      else process.env.VI_ART_SOURCE = oldSource;
    }
  });

  it('retains an inspected muzzle in original pixels and rejects a point outside its PNG canvas', async () => {
    const f = await fixture(), path = join(f.localRoot, 'art-selection.json');
    const selection = JSON.parse(await readFile(path, 'utf8'));
    selection.sprites[0].sourceMuzzle = { x: 35, y: 30 };
    await writeFile(path, JSON.stringify(selection));
    const first = await syncArt(f.options);
    expect(first.runtime.assets['hero.clean'].sourceMuzzle).toEqual({ x: 35, y: 30 });
    expect(first.runtime.assets['hero.idle'].sourceMuzzle).toEqual({ x: 35, y: 30 });
    selection.sprites[0].sourceMuzzle.x = 48;
    await writeFile(path, JSON.stringify(selection));
    await expect(syncArt(f.options)).rejects.toThrow('Source muzzle outside original canvas for hero.clean');
  });

  it('refuses an unreviewed replacement before overwriting a pinned accepted original', async () => {
    const f = await fixture();
    const selectionPath = join(f.localRoot, 'art-selection.json');
    const selection = JSON.parse(await readFile(selectionPath, 'utf8'));
    selection.sprites[0].expectedSha256 = createHash('sha256').update(f.image).digest('hex');
    await writeFile(selectionPath, JSON.stringify(selection));
    const accepted = await syncArt(f.options);
    expect(accepted.runtime.assets['hero.clean'].sourceSha256).toBe(selection.sprites[0].expectedSha256);
    const replacement = await sharp({ create: { width: 48, height: 64, channels: 4, background: '#fcb268ff' } }).png().toBuffer();
    await writeFile(join(f.sourceRoot, 'hero.png'), replacement);
    await expect(syncArt(f.options)).rejects.toThrow('Selected art source identity mismatch (incoming): hero.clean');
    expect(await readFile(join(f.localRoot, 'hero.png'))).toEqual(f.image);
    await writeFile(join(f.sourceRoot, 'hero.png'), f.image);
    await writeFile(join(f.localRoot, 'hero.png'), replacement);
    await expect(syncArt({ ...f.options, sourceRoot: join(f.root, 'unavailable') })).rejects.toThrow('Selected art source identity mismatch (local): hero.clean');
  });

  it('synchronizes changed files while retaining deleted upstream originals and reporting new candidates', async () => {
    const f = await fixture();
    await writeFile(join(f.localRoot, 'preserved.png'), f.image);
    const first = await syncArt(f.options);
    expect(first.report.newSourcePaths).toEqual(['hero.png']);
    expect(first.report.missingUpstreamPaths).toEqual(['preserved.png']);
    expect(await readFile(join(f.localRoot, 'preserved.png'))).toEqual(f.image);
    const updated = await sharp({ create: { width: 48, height: 64, channels: 4, background: '#92e4b8ff' } }).png().toBuffer();
    await writeFile(join(f.sourceRoot, 'hero.png'), updated);
    await writeFile(join(f.sourceRoot, 'unreviewed.png'), f.image);
    const second = await syncArt(f.options);
    expect(second.report.changedSourcePaths).toEqual(['hero.png']);
    expect(second.report.unknownCandidates).toContain('unreviewed.png');
    expect(second.runtime.report.unknownCandidates).toContain('unreviewed.png');
    expect(second.runtime.assets).not.toHaveProperty('unreviewed');
    expect(second.runtime.sourceManifest['hero.png']).not.toEqual(first.runtime.sourceManifest['hero.png']);
    expect(await readFile(join(f.sourceRoot, 'hero.png'))).toEqual(updated);
  });

  it('pads sprites without clipping, retains feet anchors, and produces valid Phaser atlas aliases', async () => {
    const f = await fixture();
    const { runtime } = await syncArt(f.options);
    const hero = runtime.assets['hero.clean'], alias = runtime.assets['hero.idle'];
    expect(alias.frame).toBe(hero.frame);
    expect(alias.aliasOf).toBe('hero.clean');
    expect(hero.visibleBounds.x).toBeGreaterThanOrEqual(8);
    expect(hero.visibleBounds.y).toBeGreaterThanOrEqual(8);
    expect(hero.visibleBounds.x + hero.visibleBounds.width).toBeLessThanOrEqual(hero.width - 7);
    expect(hero.visibleBounds.y + hero.visibleBounds.height).toBeLessThanOrEqual(hero.height - 7);
    expect(hero.pivot.x).toBe(.5);
    expect(hero.pivot.y).toBeGreaterThan(.85);
    const atlas = runtime.atlases[0];
    const meta = await sharp(Buffer.from(atlas.dataUri.split(',')[1], 'base64')).metadata();
    expect(meta.width).toBeLessThanOrEqual(2048);
    expect(meta.height).toBeLessThanOrEqual(2048);
    expect(atlas.data.frames[hero.frame].trimmed).toBe(false);
  });

  it('validates without writing and refuses changed incoming sources until synchronization', async () => {
    const f = await fixture();
    await syncArt(f.options);
    const paths = await readdir(f.outputDirectory);
    const before = await Promise.all(paths.map(path => readFile(join(f.outputDirectory, path))));
    await syncArt({ ...f.options, checkOnly: true });
    const after = await Promise.all(paths.map(path => readFile(join(f.outputDirectory, path))));
    expect(after).toEqual(before);
    await writeFile(join(f.sourceRoot, 'new.png'), f.image);
    await expect(syncArt({ ...f.options, checkOnly: true })).rejects.toThrow('need synchronization');
    await expect(readFile(join(f.localRoot, 'new.png'))).rejects.toThrow();
  });

  it('rebuilds deterministically and falls back to a complete local snapshot when the external directory is absent', async () => {
    const f = await fixture();
    const first = await syncArt(f.options);
    const firstBytes = await readFile(first.runtimePath);
    await rm(first.runtimePath);
    const second = await syncArt(f.options);
    expect(await readFile(second.runtimePath)).toEqual(firstBytes);
    const local = await syncArt({ ...f.options, sourceRoot: join(f.root, 'unavailable'), checkOnly: true });
    expect(local.report.sourceMode).toBe('local-snapshot');
    expect(local.runtime.inputSignature).toBe(first.runtime.inputSignature);
  });

  it('fails clearly for a missing selected source and packs large collections into bounded nonoverlapping atlas pages', async () => {
    const f = await fixture();
    await expect(syncArt({ ...f.options, sourceRoot: join(f.root, 'unavailable') })).rejects.toThrow('Required art sources missing: hero.clean');
    const sprites = Array.from({ length: 20 }, (_, i) => ({ spec: { id: `sprite-${i}` }, width: 60, height: 60 }));
    const pages = packShelves(sprites, 128, 4);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.width).toBeLessThanOrEqual(128); expect(page.height).toBeLessThanOrEqual(128);
      for (const [i, a] of page.sprites.entries()) for (const b of page.sprites.slice(i + 1)) expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
  });
});
