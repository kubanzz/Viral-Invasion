import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
const base='artifacts/experience-v0151';
const meta=JSON.parse(await readFile(`${base}/${process.env.VI_POLISH_CANDIDATE??'candidate-2'}/build-meta.json`,'utf8'));
const hashes=async()=>Object.fromEntries(await Promise.all(Object.keys(meta.sourceManifest).map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const before=await hashes();
async function command(name,args,env={}) {
 const start=new Date().toISOString();
 const processChild=spawn(process.execPath,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 const output=[];processChild.stdout.on('data',data=>output.push(data));processChild.stderr.on('data',data=>output.push(data));
 const exitCode=await new Promise((resolve,reject)=>{processChild.on('error',reject);processChild.on('close',resolve);});
 await writeFile(`${base}/${name}.log`,Buffer.concat(output));
 const result={version:'0.15.1',command:[process.execPath,...args],startedAt:start,finishedAt:new Date().toISOString(),exitCode};
 await writeFile(`${base}/${name}-command.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({name,exitCode}));return exitCode;
}
const results=await Promise.all([
 command('typecheck',['node_modules/typescript/bin/tsc','--noEmit']),
 command('unit',['node_modules/vitest/vitest.mjs','run','--maxWorkers=2','--reporter=json',`--outputFile=${base}/unit-final.json`],{VI_SYSTEM_SEED_COUNT:'6',VI_SYSTEM_REPORT:`${base}/system-six-seeds.json`}),
]);
const after=await hashes();
const identity={version:'0.15.1',sourceBefore:before,sourceAfter:after,sourcesUnchanged:JSON.stringify(before)===JSON.stringify(after),reports:[`${base}/unit-final.json`],commands:[`${base}/typecheck-command.json`,`${base}/unit-command.json`]};
await writeFile(`${base}/test-identity.json`,JSON.stringify(identity,null,2));
if(results.some(code=>code!==0)||!identity.sourcesUnchanged)process.exitCode=1;
