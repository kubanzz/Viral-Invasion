import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const git = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const folder = 'artifacts/readability-v075/unit-side-effects'; await mkdir(folder, { recursive: true });
const report = { reason: 'Two existing unit tests write artifact paths directly. Preserve their new test output here and restore the previously committed evidence bytes; initial worktree had no modifications to these files.', files: [] };
for (const [path, name] of [['artifacts/completion-v074/priority-audit/category-coverage-first.json','category-coverage-first.json'],['artifacts/g2-noncounter-routes.json','g2-noncounter-routes.json']]) {
  const current = await readFile(path);
  const original = (await git('git', ['-c','core.longpaths=true','cat-file','blob',`HEAD:${path}`], { encoding: 'buffer', maxBuffer: 8*1024*1024 })).stdout;
  await writeFile(`${folder}/${name}`, current, { flag: 'wx' });
  await writeFile(path, original);
  report.files.push({ path, freshOutput: `${folder}/${name}`, freshSha256: hash(current), originalSha256: hash(original), restoredSha256: hash(await readFile(path)), restored: (await readFile(path)).equals(original) });
}
await writeFile(`${folder}/restoration.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
