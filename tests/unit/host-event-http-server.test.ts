import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { once } from 'node:events';
import { startHostEventHttpServer } from '../helpers/hostEventHttpServer';

const directories: string[] = [];
const servers: Awaited<ReturnType<typeof startHostEventHttpServer>>[] = [];
const filenames = ['index.html', 'game.js', 'game.css'] as const;

async function builtGame() {
  const directory = await mkdtemp(join(tmpdir(), 'viral-host-event-http-')); directories.push(directory);
  await Promise.all(filenames.map((filename, index) => writeFile(join(directory, filename), `build-${index}`)));
  return directory;
}
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const directory of directories.splice(0)) {
    for (const filename of filenames) await unlink(join(directory, filename)).catch(() => {});
    await rmdir(directory);
  }
});

describe('host-event browser worker HTTP server', () => {
  it('serves only the built resource whitelist with correct MIME types and an immutable in-memory build', async () => {
    const directory = await builtGame(), server = await startHostEventHttpServer(directory); servers.push(server);
    expect(server.entryURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await fetch(`${server.entryURL}?seed=41&hostEvent=REST`);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await page.text()).toBe('build-0');
    const script = await fetch(`${server.entryURL}game.js`);
    expect(script.headers.get('content-type')).toBe('application/javascript; charset=utf-8');
    expect(await script.text()).toBe('build-1');
    const css = await fetch(`${server.entryURL}game.css`);
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8'); expect(await css.text()).toBe('build-2');
    await writeFile(join(directory, 'game.js'), 'changed-on-disk');
    expect(await (await fetch(`${server.entryURL}game.js`)).text()).toBe('build-1');
    expect((await fetch(`${server.entryURL}build-meta.json`)).status).toBe(404);
    expect((await fetch(`${server.entryURL}../package.json`)).status).toBe(404);
    expect((await fetch(server.entryURL, { method: 'POST' })).status).toBe(405);
  });

  it('allocates independent ephemeral ports and closes live connections idempotently', async () => {
    const directory = await builtGame();
    const first = await startHostEventHttpServer(directory), second = await startHostEventHttpServer(directory);
    servers.push(first, second); expect(first.entryURL).not.toBe(second.entryURL);
    const socket = connect({ host: '127.0.0.1', port: Number(new URL(first.entryURL).port) });
    await once(socket, 'connect'); const socketClosed = once(socket, 'close');
    await first.close(); await first.close(); await socketClosed;
    expect(socket.destroyed).toBe(true);
    await expect(fetch(first.entryURL, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
    expect(await (await fetch(second.entryURL)).text()).toBe('build-0');
  });

  it('reports a missing build before opening its listening socket', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'viral-host-event-http-')); directories.push(directory);
    await expect(startHostEventHttpServer(directory)).rejects.toThrow('请先运行 npm run build');
  });
});
