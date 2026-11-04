import {build} from 'esbuild';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const out=resolve(process.argv[2]??'artifacts/combat-v014/cannon-browser/framing-candidate');await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),before={};
async function scan(folder){for(const item of await readdir(folder,{withFileTypes:true})){const path=join(folder,item.name);if(item.isDirectory())await scan(path);else before[path.replaceAll('\\','/')]=hash(await readFile(path));}}
await scan('src');before['.art-generated/art-runtime.json']=hash(await readFile('.art-generated/art-runtime.json'));
const result=await build({entryPoints:['src/main.ts'],outfile:join(out,'game.js'),bundle:true,format:'iife',target:['chrome110'],minify:true,metafile:true,legalComments:'none'});
const inputs={};for(const path of Object.keys(result.metafile.inputs)){inputs[path]=hash(await readFile(path));if(before[path]&&before[path]!==inputs[path])throw Error('Source changed while freezing private candidate: '+path);}
const css=await readFile(join(out,'game.css'),'utf8');await writeFile(join(out,'index.html'),(await readFile('index.html','utf8')).replace('<!-- STYLES -->',`<style>${css}</style>`).replace('<script type="module" src="/src/main.ts"></script>','<script src="./game.js"></script>'));
const outputs=Object.fromEntries(await Promise.all(['index.html','game.js','game.css'].map(async p=>[p,hash(await readFile(join(out,p)))])));
await writeFile(join(out,'private-build.json'),JSON.stringify({scope:'Private static input-test candidate. Existing generated art only; no art-sync or shared selection writes. Not a release package.',inputs,outputs},null,2));
console.log(JSON.stringify({out,gameSha256:outputs['game.js'],inputs:Object.keys(inputs).length}));
