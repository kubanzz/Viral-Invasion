import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const metadataBytes = await readFile(join(directory, 'build-meta.json')), metadata = JSON.parse(metadataBytes);
const types = { 'index.html': 'text/html; charset=utf-8', 'viewer.js': 'text/javascript; charset=utf-8', 'build-meta.json': 'application/json; charset=utf-8' };
const assets = new Map();
for (const name of ['index.html', 'viewer.js', 'build-meta.json']) {
  const bytes = name === 'build-meta.json' ? metadataBytes : await readFile(join(directory, name));
  if (name !== 'build-meta.json' && createHash('sha256').update(bytes).digest('hex') !== metadata.outputManifest[name]) throw new Error('Preview output mismatch: ' + name);
  assets.set('/' + name, { bytes, type: types[name] });
}
let origin;
const server = createServer((request, response) => {
  if (request.headers.host !== new URL(origin).host || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(403).end(); return; }
  let path; try { path = new URL(request.url, origin).pathname; } catch { response.writeHead(400).end(); return; }
  const asset = assets.get(path === '/' ? '/index.html' : path);
  if (!asset) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': asset.bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  response.end(request.method === 'HEAD' ? undefined : asset.bytes);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
console.log(origin + '/index.html');
