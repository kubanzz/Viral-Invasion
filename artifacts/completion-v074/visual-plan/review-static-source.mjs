import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const out='artifacts/completion-v074/source-static-review.json';
if(existsSync(out))throw Error('Preserve existing review.');
const build=JSON.parse(readFileSync('dist/build-meta.json','utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const input=Object.entries(build.sourceManifest).map(([path,sha256])=>({path,sha256,current:hash(path)}));
if(input.some(r=>r.sha256!==r.current))throw Error('Build inputs changed.');
const rules=[['network-request',/\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/i],['external-url',/https?:\/\//i],['old-game-brand',/心脏巡游|heart-tour/i],['windows-absolute-path',/[A-Z]:[\\/]/],['private-key-header',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]];
const hits=[];
for(const {path}of input)if(path.startsWith('src/')||['index.html','scripts/build-offline.mjs'].includes(path)){
 const lines=readFileSync(path,'utf8').split(/\r?\n/);
 lines.forEach((line,i)=>{for(const [rule,re]of rules)if(re.test(line))hits.push({path,line:i+1,rule,exception:rule==='external-url'&&path==='index.html'&&line.includes("xmlns='http://www.w3.org/2000/svg'")?'Inline data:image SVG namespace identifier; not a fetch or remote asset.':null});});
}
const requiredPaths=['package.json','package-lock.json','src','tests','Docs','.gitignore','README.md'];
const result={schemaVersion:1,generatedAt:new Date().toISOString(),gameSha256:hash('dist/game.js'),method:'Read-only current frozen60buildinput hash check and finite static regex review; no browser/test/build/network call.',inputCount:input.length,inputManifest:input,patterns:rules.map(([name,re])=>({name,pattern:re.source})),hits,unexplainedHits:hits.filter(r=>!r.exception),requiredPaths:requiredPaths.map(path=>({path,exists:existsSync(path)})),scope:'This finite source review supports absence of old local/runtime external dependencies and reviewed private-key headers. It is not a complete secret scanner or arbitrary-resource legal audit; actual build/offline requests are independently tested.'};
writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({out,inputs:input.length,unexplained:result.unexplainedHits.length}));
