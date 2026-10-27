import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = 'artifacts/completion-v075/performance/analyze-memory.mjs', target = 'artifacts/readability-v076/performance/analyze-memory.mjs';
const raw = await readFile(source), current = raw.toString('utf8').replace('# v075 finite memory observations', '# v076 finite memory observations');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
if (raw.toString('utf8') === current) throw Error('Expected only the report heading adjustment.');
await writeFile(target, current, { flag: 'wx' });
await writeFile('artifacts/readability-v076/performance/memory-analyzer-derivation.json', JSON.stringify({ source, sourceSha256: sha(raw), target, targetSha256: sha(current),
  changes: ['Generated Markdown heading version only'], scope: 'Static analyzer preparation; no browser/GC or memory verdict. Actual completed current-version report must pass all runtime-input guards.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ prepared: true, browserStarted: false, sourceSha256: sha(raw), targetSha256: sha(current) }));
