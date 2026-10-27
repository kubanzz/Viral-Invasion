import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const BASE = 'artifacts/completion-v075/migration-three-way';
export const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export const read = path => JSON.parse(readFileSync(path, 'utf8'));
const tree = dir => readdirSync(dir).sort().flatMap(name => { const path = `${dir}/${name}`; return statSync(path).isDirectory() ? tree(path) : [path]; });
export function parseArgs(argv = process.argv.slice(2)) {
  if (!argv.includes('--run') || !argv.includes('--parent-sequenced')) throw Error('Prepared host only. Parent must schedule a browser window and provide --run --parent-sequenced.');
  const flags = {};
  for(let i=0;i<argv.length;i++){
    const key=argv[i]; if(['--run','--parent-sequenced'].includes(key))continue;
    if(!key.startsWith('--')||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Invalid flag '+key);
    flags[key.slice(2)]=argv[++i];
  }
  if(flags.version!=='0.7.5'||!/^[a-f0-9]{64}$/.test(flags['expected-game']??'')||!/^[a-f0-9]{40}$/.test(flags['expected-head']??''))throw Error('Explicit075 version, full HEAD and game SHA required.');
  if(!['chrome','msedge'].includes(flags.channel??'chrome'))throw Error('Use installed chrome or msedge.');
  const output=resolve(flags.output??''),inside=relative(resolve(BASE),output);
  if(!flags.output||!inside||inside.startsWith('..')||/^[A-Za-z]:/.test(inside)||existsSync(output))throw Error('Output must be a new child directory; preserve every attempt.');
  const prepared=flags.prepared??`${BASE}/prepared/manifest.json`;
  if(!existsSync(prepared))throw Error('Run prepare.mjs first; this does not start a browser.');
  return {...flags,channel:flags.channel??'chrome',output,prepared};
}
export function freeze(options){
  const build=read('dist/build-meta.json'),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(build.version!==options.version||hash('dist/game.js')!==options['expected-game']||head!==options['expected-head'])throw Error('Current frozen release/HEAD differs from explicit run identity.');
  const prepared=read(options.prepared);
  for(const [path,sha]of Object.entries(prepared.inputs))if(!existsSync(path)||hash(path)!==sha)throw Error('Prepared host dependency changed: '+path);
  if(hash(prepared.bundle.path)!==prepared.bundle.sha256)throw Error('Prepared host bundle changed.');
  for(const [path,sha]of Object.entries(build.sourceManifest))if(hash(path)!==sha)throw Error('Release build input changed: '+path);
  const paths=[...tree('src'),'index.html','package.json','package-lock.json','scripts/build-offline.mjs',...Object.keys(prepared.inputs)];
  const sourceManifest=Object.fromEntries([...new Set(paths)].map(path=>[path,hash(path)]));
  const buildFiles=Object.fromEntries(['dist/game.js','dist/index.html','dist/build-meta.json'].map(path=>[path,hash(path)]));
  mkdirSync(options.output,{recursive:true});
  return {head,version:build.version,gameSha256:options['expected-game'],buildInputCount:Object.keys(build.sourceManifest).length,sourceManifest,buildFiles,
    prepared:{path:options.prepared,sha256:hash(options.prepared)},scheduling:'Parent sequenced this functional capture after its exclusive performance terminal. This host does not claim OS-global process exclusion.'};
}
export function unchanged(before){
  const sources=Object.entries(before.sourceManifest).filter(([p,s])=>!existsSync(p)||hash(p)!==s).map(([p])=>p);
  const builds=Object.entries(before.buildFiles).filter(([p,s])=>!existsSync(p)||hash(p)!==s).map(([p])=>p);
  return {sourceUnchanged:sources.length===0,bundleUnchanged:builds.length===0,sourceMismatches:sources,buildMismatches:builds};
}
