const targets = await (await fetch('http://127.0.0.1:9229/json')).json();
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const value = JSON.parse(event.data);
  if (value.id) { pending.get(value.id)?.(value); pending.delete(value.id); }
});
const call = (method, params = {}) => new Promise(resolve => {
  pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params }));
});
const state = await call('Runtime.evaluate', { expression: `JSON.stringify({
  keys: Object.keys(globalThis).filter(key => key.includes('vitest')),
  current: globalThis.__vitest_worker__?.current?.name,
  filepath: globalThis.__vitest_worker__?.filepath
})`, returnByValue: true });
console.log(JSON.stringify(state));
await call('Profiler.enable');
await call('Profiler.start');
await new Promise(resolve => setTimeout(resolve, 300));
const stopped = await call('Profiler.stop');
console.log(JSON.stringify(stopped.result?.profile?.nodes?.filter(node => node.hitCount)
  .sort((a, b) => b.hitCount - a.hitCount).slice(0, 15)
  .map(node => ({ frame: node.callFrame, hits: node.hitCount }))));
ws.close();
