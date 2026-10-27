import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const git = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceCommit = (await git('git', ['rev-parse','HEAD'])).stdout.trim();
const branch = (await git('git',['branch','--show-current'])).stdout.trim();
const remotes = (await git('git',['remote','-v'])).stdout.trim();
const meta = JSON.parse(await readFile('dist/build-meta.json','utf8'));
const checks=[];
for(const [path,expected] of Object.entries(meta.sourceManifest)) {
  const blob=(await git('git',['-c','core.longpaths=true','cat-file','blob',`${sourceCommit}:${path}`],{encoding:'buffer',maxBuffer:8*1024*1024})).stdout;
  checks.push({path,expected,gitBlobSha256:hash(blob),worktreeSha256:hash(await readFile(path)),match:hash(blob)===expected});
}
const oldDiff=(await git('git',['diff','--name-only','7b86eb482115f8e2118ed5597225448ef6e95c4b',sourceCommit,'--','DesignDoc_v1.3','artifacts/completion-v074'])).stdout.trim();
const report={version:meta.version,sourceCommit,branch,remotes:remotes||null,pushStatus:remotes?'Not pushed by this script.':'No Git remote configured; local commits retained.',buildInputCount:checks.length,checks,oldDesignAndV074EvidenceUnchangedByCommit:oldDiff==='',oldDiff,pass:checks.every(check=>check.match&&check.worktreeSha256===check.expected)&&oldDiff===''};
await writeFile('artifacts/readability-v075/source-commit-provenance.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,sourceCommit,branch,buildInputCount:checks.length,remoteConfigured:!!remotes}));
if(!report.pass)process.exitCode=1;
