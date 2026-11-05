import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { composeMobileHtml } from './package-mobile.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Use the same large-buffer CDP session for capture and body retrieval. */
export async function observeServedResponses(cdp, report, origin) {
  await cdp.send('Network.enable', { maxTotalBufferSize: 128 * 1024 * 1024, maxResourceBufferSize: 48 * 1024 * 1024 });
  const responses = new Map(), jobs = [];
  cdp.on('Network.responseReceived', event => {
    if (event.response.status === 200 && new URL(event.response.url).origin === origin)
      responses.set(event.requestId, new URL(event.response.url).pathname.slice(1));
  });
  cdp.on('Network.loadingFinished', event => {
    const path = responses.get(event.requestId); if (!path) return;
    jobs.push(cdp.send('Network.getResponseBody', { requestId: event.requestId }).then(result => {
      report.responseHashes[path] = sha256(Buffer.from(result.body, result.base64Encoded ? 'base64' : 'utf8'));
    }).catch(error => report.errors.push('Response attestation: ' + String(error))));
  });
  return () => Promise.all(jobs);
}

/**
 * A loopback-only, immutable, explicitly allowlisted build server. It never
 * translates request paths into filesystem paths or exposes a directory listing.
 * The mobile HTML must be the exact composition of the attested desktop build.
 */
export async function startServedCandidate({ metadataPath, mobileHtml, expectedVersion = '0.15.1' } = {}) {
  assert.ok(metadataPath, 'VI_BUILD_META must identify the frozen final build');
  const metadataFile = resolve(metadataPath), candidateRoot = dirname(metadataFile);
  const metadataBytes = await readFile(metadataFile), metadata = JSON.parse(metadataBytes);
  assert.equal(metadata.version, expectedVersion);
  const assets = new Map(), requests = [];
  const types = { 'index.html': 'text/html; charset=utf-8', 'game.js': 'text/javascript; charset=utf-8',
    'game.css': 'text/css; charset=utf-8', 'build-meta.json': 'application/json; charset=utf-8' };
  for (const name of ['index.html', 'game.js', 'game.css']) {
    const path = resolve(candidateRoot, name), bytes = await readFile(path), expected = metadata.outputManifest?.[name];
    assert.equal(sha256(bytes), expected, `Unattested build bytes: ${name}`);
    assets.set(`/${name}`, { bytes, type: types[name], path, sha256: expected, name });
  }
  assets.set('/build-meta.json', { bytes: metadataBytes, type: types['build-meta.json'], path: metadataFile,
    sha256: sha256(metadataBytes), name: 'build-meta.json' });
  let mobilePath;
  if (mobileHtml) {
    mobilePath = resolve(mobileHtml); const bytes = await readFile(mobilePath);
    const composed = Buffer.from(composeMobileHtml(assets.get('/index.html').bytes.toString(), assets.get('/game.js').bytes.toString()));
    assert.ok(bytes.equals(composed), 'Mobile HTML must exactly compose this candidate index and game.js');
    assets.set('/mobile.html', { bytes, type: types['index.html'], path: mobilePath, sha256: sha256(bytes), name: 'mobile.html' });
  }
  let origin;
  const server = createServer((request, response) => {
    const reject = status => { requests.push({ path: request.url, status }); response.writeHead(status).end(); };
    if (request.headers.host !== new URL(origin).host) return reject(403);
    if (!['GET', 'HEAD'].includes(request.method)) return reject(405);
    let path;
    try { path = decodeURIComponent(new URL(request.url, origin).pathname); } catch { return reject(400); }
    const asset = assets.get(path === '/' ? '/index.html' : path);
    if (!asset) return reject(404);
    requests.push({ path, status: 200, sha256: asset.sha256, bytes: asset.bytes.length });
    response.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': asset.bytes.length,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    response.end(request.method === 'HEAD' ? undefined : asset.bytes);
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    entry: `${origin}/${mobilePath ? 'mobile.html' : 'index.html'}`,
    metadata,
    snapshot: () => ({ transport: 'immutable-allowlisted-loopback-http', candidateRoot,
      metadataPath: metadataFile, metadataSha256: sha256(metadataBytes), entryKind: mobilePath ? 'mobile' : 'desktop', origin,
      assets: [...assets.entries()].map(([urlPath, asset]) => ({ urlPath, path: asset.path, name: asset.name, bytes: asset.bytes.length, sha256: asset.sha256 })),
      requests: [...requests] }),
    diskHashes: async () => Object.fromEntries(await Promise.all([...assets.values()].map(async asset => [asset.path, sha256(await readFile(asset.path))]))),
    close: () => new Promise((done, fail) => server.close(error => error ? fail(error) : done())),
  };
}
