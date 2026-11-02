import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const packageUrl = pathToFileURL(resolve('scripts/package-mobile.mjs')).href;
const { composeMobileHtml, readVerifiedMobileBuild, packageMobile } = await import(packageUrl);
const temporaryRoots: string[] = [];
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const page = '<!doctype html><html lang="zh-CN"><head><style>body{margin:0}</style><link rel="icon" href="data:image/svg+xml,fixture"></head><body><script src="./game.js"></script></body></html>';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'viral-mobile-package-')); temporaryRoots.push(root);
  for (const directory of ['src', 'scripts', 'Docs', 'dist']) await mkdir(join(root, directory), { recursive: true });
  const sources = new Map([
    ['package.json', JSON.stringify({ version: '0.9.0', viralInvasionStage: 'G4' })],
    ['src/main.ts', 'fixture source'],
    ['scripts/package-mobile.mjs', 'fixture packaging source'],
    ['Docs/ViralInvasion_Mobile_Playtest.md', '# 手机试玩说明\n从文件导入 Sitecase。真机待验。'],
  ]);
  for (const [path, value] of sources) await writeFile(join(root, path), value);
  const outputs = new Map([['index.html', page], ['game.js', 'globalThis.gameStarted=true;\n/*! fixture Phaser license */'], ['game.css', 'body{margin:0}']]);
  for (const [path, value] of outputs) await writeFile(join(root, 'dist', path), value);
  const metadata = { version: '0.9.0', stage: 'G4', format: 'iife', browserTargets: ['chrome110', 'edge110', 'safari17.6'],
    sourceManifest: Object.fromEntries([...sources].map(([path, value]) => [path, sha256(value)])),
    outputManifest: Object.fromEntries([...outputs].map(([path, value]) => [path, sha256(value)])),
  };
  const metadataPath = join(root, 'dist', 'build-meta.json');
  await writeFile(metadataPath, JSON.stringify(metadata));
  return { root, metadata, metadataPath };
}

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    const absolute = resolve(root);
    if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('viral-mobile-package-')) throw new Error(`Unexpected temporary cleanup target: ${absolute}`);
    await rm(absolute, { recursive: true, force: true });
  }
});

describe('single HTML phone release', () => {
  it('keeps classic script semantics, replacement tokens and license notices while escaping HTML closing tags', () => {
    const javascript = 'globalThis.payload="</ScRiPt><script>bad()</script>";globalThis.tokens="$& $$ $\'";\n/*! fixture Phaser license */';
    const html = composeMobileHtml(page, javascript);
    expect(html).toContain('<html lang="zh-CN" data-mobile="true">');
    expect(html).not.toContain('src="./game.js"');
    expect(html).toContain('<style>body{margin:0}</style>');
    expect(html).toContain('/*! fixture Phaser license */');
    const inline = /<script>([\s\S]*)<\/script>/.exec(html)![1];
    expect(inline.toLowerCase()).not.toContain('</script');
    const context: Record<string, unknown> = {};
    runInNewContext(inline, context);
    expect(context.payload).toBe('</ScRiPt><script>bad()</script>');
    expect(context.tokens).toBe("$& $$ $'");
  });

  it('rejects imports that would need an external file or an ES module', () => {
    expect(() => composeMobileHtml(page.replace('<script src=', '<script type="module" src='), 'fixture')).toThrow('classic');
    expect(() => composeMobileHtml(page.replace('</head>', '<link rel="stylesheet" href="./game.css"></head>'), 'fixture')).toThrow('linked');
    expect(() => composeMobileHtml(page.replace('</body>', '<script src="https://cdn.invalid/game.js"></script></body>'), 'fixture')).toThrow('no other external');
  });

  it('refreshes the mobile marker without duplicating it', () => {
    const html = composeMobileHtml(page.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-mobile="false">'), 'fixture');
    expect(html.match(/data-mobile=/g)).toHaveLength(1);
    expect(html).toContain('data-mobile="true"');
  });

  it('refuses changed game sources, packaging instructions and modified build output', async () => {
    const source = await fixture();
    await writeFile(join(source.root, 'src/main.ts'), 'new source');
    await expect(readVerifiedMobileBuild({ workspaceRoot: source.root })).rejects.toThrow('source changed');
    const docs = await fixture();
    await writeFile(join(docs.root, 'Docs/ViralInvasion_Mobile_Playtest.md'), 'changed instructions');
    await expect(readVerifiedMobileBuild({ workspaceRoot: docs.root })).rejects.toThrow('source changed');
    const output = await fixture();
    await writeFile(join(output.root, 'dist/game.js'), 'wrong bundle');
    await expect(readVerifiedMobileBuild({ workspaceRoot: output.root })).rejects.toThrow('output changed');
  });

  it('requires the Safari build and packaging provenance and rejects paths outside the workspace', async () => {
    const safari = await fixture();
    safari.metadata.browserTargets = ['chrome110'];
    await writeFile(safari.metadataPath, JSON.stringify(safari.metadata));
    await expect(readVerifiedMobileBuild({ workspaceRoot: safari.root })).rejects.toThrow('Safari 17.6');
    const provenance = await fixture();
    delete provenance.metadata.sourceManifest['scripts/package-mobile.mjs'];
    await writeFile(provenance.metadataPath, JSON.stringify(provenance.metadata));
    await expect(readVerifiedMobileBuild({ workspaceRoot: provenance.root })).rejects.toThrow('does not attest');
    const escape = await fixture();
    escape.metadata.sourceManifest['../outside.txt'] = '0'.repeat(64);
    await writeFile(escape.metadataPath, JSON.stringify(escape.metadata));
    await expect(readVerifiedMobileBuild({ workspaceRoot: escape.root })).rejects.toThrow('escapes');
  });

  it('creates a verified two-file ZIP and leaves the desktop entry unchanged', async () => {
    const f = await fixture(), desktopBefore = await readFile(join(f.root, 'dist/index.html'));
    const report = await packageMobile({ workspaceRoot: f.root });
    const html = await readFile(join(f.root, 'releases/Viral-Invasion-Mobile.html'), 'utf8');
    expect(html).toContain('data-mobile="true"');
    expect(html).toContain('globalThis.gameStarted=true;');
    expect(html).not.toContain('src="./game.js"');
    expect(report.files.map((file: { name: string }) => file.name).sort()).toEqual(['Viral-Invasion-Mobile.html', '手机试玩说明.txt'].sort());
    expect(report.htmlSha256).toBe(sha256(html));
    expect(report.sourceValidation).toEqual({ count: 4, pass: true });
    expect(report.outputValidation).toEqual({ count: 3, pass: true });
    expect(await readFile(join(f.root, 'dist/index.html'))).toEqual(desktopBefore);
    const saved = JSON.parse(await readFile(join(f.root, 'artifacts/mobile-release/package-report.json'), 'utf8'));
    expect(saved.zipSha256).toBe(sha256(await readFile(join(f.root, 'releases/Viral-Invasion-Mobile.zip'))));
  });
});
