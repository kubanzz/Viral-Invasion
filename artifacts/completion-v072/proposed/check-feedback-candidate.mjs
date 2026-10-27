import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const original='tests/e2e/feedback-v060.spec.ts';
const candidate='artifacts/completion-v072/proposed/feedback-v060.spec.ts';
const rawOriginal=await readFile(original),rawCandidate=await readFile(candidate);
const ast=ts.createSourceFile(candidate,rawCandidate.toString('utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const result={original,originalSha256:hash(rawOriginal),candidate,candidateSha256:hash(rawCandidate),
  syntaxDiagnostics:ast.parseDiagnostics.map(item=>ts.flattenDiagnosticMessageText(item.messageText,' ')),
  executed:false,validation:'TypeScript syntax parse only. No type resolution, browser, test or production execution. Imports preserve the intended tests/e2e destination.'};
await writeFile('artifacts/completion-v072/proposed/feedback-v060-meta.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
if(result.syntaxDiagnostics.length)process.exitCode=1;
