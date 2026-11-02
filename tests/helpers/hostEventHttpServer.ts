import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const resources = [
  ['index.html', 'text/html; charset=utf-8'],
  ['game.js', 'application/javascript; charset=utf-8'],
  ['game.css', 'text/css; charset=utf-8'],
] as const;

/** Serve one immutable built game for this worker; never reuse a running app. */
export async function startHostEventHttpServer(directory = resolve('dist')): Promise<{ entryURL: string; close(): Promise<void> }> {
  const files = new Map<string, { body: Buffer; contentType: string }>();
  try {
    for (const [name, contentType] of resources) {
      files.set(`/${name}`, { body: await readFile(join(directory, name)), contentType });
    }
  } catch (cause) {
    throw new Error('宿主事件浏览器测试缺少完整 dist 构建；请先运行 npm run build。', { cause });
  }
  const server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    let pathname: string;
    try { pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname; }
    catch { response.writeHead(400); response.end(); return; }
    const file = files.get(pathname === '/' ? '/index.html' : pathname);
    if (!file) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': file.contentType, 'Content-Length': file.body.length, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : file.body);
  });
  try {
    await new Promise<void>((resolveListening, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveListening);
    });
  } catch (cause) {
    server.closeAllConnections(); server.close(); throw cause;
  }
  const address = server.address() as AddressInfo;
  let closing: Promise<void> | undefined;
  return {
    entryURL: `http://127.0.0.1:${address.port}/`,
    close: () => closing ??= new Promise<void>((resolveClosed, reject) => {
      server.close(error => error ? reject(error) : resolveClosed());
      server.closeAllConnections();
    }),
  };
}
