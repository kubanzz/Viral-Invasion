// Static source selection/provenance only. Never imports a browser or executes the renderer.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { BASE,GAME,PLAN,SCRIPT,BASE_COVERAGE,CORE_COVERAGE,hash,jsonHash,read,label,write,pointer,newChild,stateFacts } from './shared.mjs';
const args=process.argv.slice(2),reports=[];let output=BASE+'/prepared-base';
for(let i=0;i<args.length;i+=2){if(!args[i+1])throw Error('Missing value '+args[i]);if(args[i]==='--output')output=args[i+1];else if(args[i]==='--capture-report')reports.push(args[i+1]);else throw Error('Invalid argument '+args[i]);}
output=newChild(output);
const build=read('dist/build-meta.json');if(build.version!=='0.7.5'||hash('dist/game.js')!==GAME)throw Error('Wrong frozen release');
for(const[p,s]of Object.entries(build.sourceManifest))if(hash(p)!==s)throw Error('Build source drift '+p);
const plan=read(PLAN),sources=plan.newReadOnlyCensus.selectedReusableSources;
const refs=new Map(),addRef=(p,expected)=>{const path=label(p),sha256=hash(p);if(expected&&expected!==sha256)throw Error('Source SHA mismatch '+path);refs.set(path,sha256);return path;};
const baseCandidates=sources.map(source=>{addRef(source.path,source.sha256);const state=pointer(read(source.path),source.pointer),facts=stateFacts(state);return{suite:'base',source:{path:source.path,sha256:source.sha256,pointer:source.pointer},state,facts};});
// Exact smallest subset of the six current real sources, not an approximate greedy census.
let selected=[];for(let size=1;size<=baseCandidates.length&&!selected.length;size++)for(let mask=1;mask<(1<<baseCandidates.length);mask++){const group=baseCandidates.filter((_,i)=>mask&(1<<i));if(group.length!==size)continue;const covers=new Set(group.flatMap(x=>x.facts.coverage));if(BASE_COVERAGE.every(k=>covers.has(k))){selected=group;break;}}
if(!selected.length)throw Error('Current six sources no longer cover the six baseline branches');
const captureRoot='artifacts/completion-v075/visual-capture';
if(existsSync(captureRoot))for(const d of readdirSync(captureRoot,{withFileTypes:true}))if(d.isDirectory()&&existsSync(captureRoot+'/'+d.name+'/report.json'))reports.push(captureRoot+'/'+d.name+'/report.json');
const captureAudit=[],coreCandidates=[];
const resolveRef=(folder,path)=>existsSync(path)?resolve(path):resolve(folder,path);
for(const path of [...new Set(reports.map(label))].sort()){
 const audit={path,status:'excluded',reasons:[]};captureAudit.push(audit);
 try{
  const report=read(path),folder=dirname(path),terminalPath=folder+'/execution.json';audit.observedReportSha256=hash(path);
  if(!existsSync(terminalPath))throw Error('No terminal execution.json; running/missing source is not qualified');
  const terminal=read(terminalPath);audit.observedExecutionSha256=hash(terminalPath);
  if(terminal.pass!==true||terminal.browserClosed!==true||!(terminal.sourceAndBuildUnchanged===true||terminal.sourceUnchanged===true&&terminal.bundleUnchanged===true))throw Error('Execution must pass, close browser and preserve sources/build');
  if(report.pass!==true||!(report.sourceAndBuildUnchanged===true||report.sourceUnchanged===true&&report.bundleUnchanged===true))throw Error('Report did not pass unchanged');
  const game=report.frozen?.build?.['dist/game.js']??report.frozen?.gameSha256;if(game!==GAME)throw Error('Capture game hash differs from current v075');
  addRef(path);addRef(terminalPath);audit.status='qualified-terminal';audit.accepted=[];
  for(const capture of report.captures??[]){
   const desired=capture.kind==='recovery'?'core-recovery':'core-'+capture.kind;if(!CORE_COVERAGE.includes(desired)||capture.bracketValid!==true)continue;
   const sidecarPath=resolveRef(folder,capture.path),sidecar=read(sidecarPath);if(sidecar.bracketValid!==true)continue;
   const before=sidecar.before?.state,after=sidecar.after?.state,bf=stateFacts(before),af=stateFacts(after);
   if(!bf.coverage.includes(desired)||!af.coverage.includes(desired))continue;
   if(desired!=='core-recovery'&&(bf.core.attack.id!==af.core.attack.id||bf.core.attack.kind!==af.core.attack.kind))continue;
   if(desired==='core-recovery'&&bf.core.coreId!==af.core.coreId)continue;
   const sourcePath=addRef(sidecarPath),sourceSha=hash(sidecarPath),pngPath=resolveRef(folder,capture.png);addRef(pngPath,capture.pngSha256??sidecar.pngSha256);
   const provenance={report:label(path),reportSha256:hash(path),execution:label(terminalPath),executionSha256:hash(terminalPath),sidecar:sourcePath,sidecarSha256:sourceSha,png:label(pngPath),pngSha256:hash(pngPath),bracketValid:true};
   coreCandidates.push({suite:'core',source:{path:sourcePath,sha256:sourceSha,pointer:'/before/state'},state:before,facts:bf,qualifiedCapture:provenance});audit.accepted.push(desired);
  }
 }catch(error){audit.status='excluded';audit.reasons.push(String(error));}
}
const found=new Set();for(const kind of CORE_COVERAGE){const candidate=coreCandidates.find(c=>c.facts.coverage.includes(kind));if(candidate&&!found.has(candidate)){selected.push(candidate);found.add(candidate);}}
const selectedCore=new Set(selected.filter(x=>x.suite==='core').flatMap(x=>x.facts.coverage)),missing=CORE_COVERAGE.filter(k=>!selectedCore.has(k));
mkdirSync(output);mkdirSync(output+'/states');
const jobs=selected.map((entry,i)=>{const key=entry.suite==='core'?entry.facts.coverage.find(x=>CORE_COVERAGE.includes(x)):entry.facts.coverage.filter(x=>BASE_COVERAGE.includes(x)).join('-'),id=String(i+1).padStart(2,'0')+'-'+key,statePath=label(output+'/states/'+id+'.json');write(statePath,entry.state);if(JSON.stringify(read(statePath))!==JSON.stringify(entry.state))throw Error('State copy changed');return{id,suite:entry.suite,source:entry.source,state:{path:statePath,sha256:hash(statePath),canonicalSha256:jsonHash(entry.state),logicalJsonUnchanged:true},facts:entry.facts,...(entry.qualifiedCapture?{qualifiedCapture:entry.qualifiedCapture}:{} )};});
for(const p of [PLAN,SCRIPT,'tests/fixtures/renderProbe.ts',BASE+'/shared.mjs',BASE+'/prepare.mjs',BASE+'/run.mjs','dist/index.html','dist/game.js','dist/build-meta.json',...Object.keys(build.sourceManifest)])addRef(p);
for(const j of jobs)addRef(j.state.path,j.state.sha256);
const manifest={schemaVersion:1,preparedAt:new Date().toISOString(),browserStarted:false,method:'Static selection and unchanged full-state serialization copies only. No browser/game/build/renderer executed.',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),version:build.version,gameSha256:GAME,plan:{path:PLAN,sha256:hash(PLAN)},baseRequired:BASE_COVERAGE,coreRequired:CORE_COVERAGE,baseMinimumStateCount:jobs.filter(j=>j.suite==='base').length,jobs,missing,captureAudit,inputs:Object.fromEntries(refs),scope:'Independent Canvas2D state-invariance drawing only; no HUD, simulation progression, live injection, actual damage execution, readability/row promotion or performance/human result.'};
write(output+'/manifest.json',manifest);console.log(JSON.stringify({prepared:label(output+'/manifest.json'),jobs:jobs.length,base:manifest.baseMinimumStateCount,core:jobs.filter(j=>j.suite==='core').length,missing,browserStarted:false}));
