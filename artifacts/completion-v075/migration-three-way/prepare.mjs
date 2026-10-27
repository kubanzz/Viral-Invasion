import { build } from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { BASE, hash } from './guards.mjs';

// Compilation/static provenance only. No browser/test/game/build is executed.
const output=`${BASE}/prepared`;
if(existsSync(output))throw Error('Preserve prepared bundle; choose a new reviewed preparation rather than silently overwriting.');
mkdirSync(output,{recursive:true});
const bundle=`${output}/capture.mjs`;
const result=await build({entryPoints:[`${BASE}/capture.ts`],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node24',external:['@playwright/test'],metafile:true,logLevel:'warning'});
const inputs=Object.fromEntries([...new Set([...Object.keys(result.metafile.inputs),`${BASE}/prepare.mjs`,`${BASE}/guards.mjs`])].filter(p=>!p.includes('node_modules')).map(path=>[path,hash(path)]));
const manifest={schemaVersion:1,preparedAt:new Date().toISOString(),method:'esbuild host compilation and input hashing only; browserStarted:false; no production release rebuild.',inputs,bundle:{path:bundle,sha256:hash(bundle)},browserStarted:false};
writeFileSync(`${output}/manifest.json`,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({prepared:`${output}/manifest.json`,bundle,inputs:Object.keys(inputs).length,browserStarted:false}));
