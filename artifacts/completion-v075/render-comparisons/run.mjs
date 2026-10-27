import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { BASE,GAME,SCRIPT,hash,jsonHash,read,label,write,newChild } from './shared.mjs';
const args=process.argv.slice(2),options={};
if(!args.includes('--run')||!args.includes('--parent-sequenced'))throw Error('Preparation only. Parent must close all performance/functional browsers, then supply --run --parent-sequenced.');
for(let i=0;i<args.length;i++){if(['--run','--parent-sequenced'].includes(args[i]))continue;if(!args[i].startsWith('--')||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid argument '+args[i]);options[args[i].slice(2)]=args[++i];}
const prepared=options.prepared??BASE+'/prepared-base/manifest.json',manifest=read(prepared),output=newChild(options.output??''),suite=options.suite??'all',channel=options.channel??'chrome';
if(!options.output||!['base','core','all'].includes(suite)||!['chrome','msedge'].includes(channel))throw Error('Explicit new output and valid suite/channel required');
if(manifest.version!=='0.7.5'||manifest.gameSha256!==GAME||hash('dist/game.js')!==GAME||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==manifest.head)throw Error('Frozen release/HEAD drift');
const changed=()=>Object.entries(manifest.inputs).filter(([p,s])=>!existsSync(p)||hash(p)!==s).map(([p])=>p);
if(changed().length)throw Error('Prepared sources changed: '+changed().join(','));
const jobs=manifest.jobs.filter(j=>suite==='all'||j.suite===suite);if(!jobs.length)throw Error('No qualified jobs for suite '+suite+'; missing='+manifest.missing.join(','));
for(const j of jobs)if(jsonHash(read(j.state.path))!==j.state.canonicalSha256)throw Error('State copy no longer matches original canonical JSON');
mkdirSync(output);const startedAt=new Date().toISOString(),results=[];
write(output+'/command.json',{prepared:label(prepared),preparedSha256:hash(prepared),suite,channel,gameSha256:GAME,head:manifest.head,scheduling:'Parent explicitly sequenced this after all performance/functional browsers closed; no OS-global exclusion is claimed.',missing:manifest.missing,scope:manifest.scope});
for(const job of jobs){
 const folder=output+'/'+job.id;mkdirSync(folder);
 const argv=[SCRIPT,'--input',job.state.path,'--output',folder,'--frames','12','--width','1366','--height','768','--dpr','1','--channel',channel];
 write(folder+'/command.json',{executable:process.execPath,args:argv,source:job.source,state:job.state,scope:manifest.scope});
 const began=new Date().toISOString(),child=spawnSync(process.execPath,argv,{encoding:'utf8',maxBuffer:4*1024*1024,windowsHide:true}),finishedAt=new Date().toISOString();
 writeFileSync(folder+'/stdout.txt',child.stdout??'',{flag:'wx'});writeFileSync(folder+'/stderr.txt',child.stderr??'',{flag:'wx'});
 const path=folder+'/report.json',report=existsSync(path)?read(path):null,pass=child.status===0&&report?.pass===true&&report?.complete===true&&report?.input?.unchanged===true&&report?.sourceUnchanged===true;
 results.push({id:job.id,suite:job.suite,startedAt:began,finishedAt,exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,pass,report:report?{path:label(path),sha256:hash(path)}:null,source:job.source,state:job.state});
 console.log(JSON.stringify({id:job.id,exitCode:child.status,pass}));
}
const mismatches=changed(),pass=results.every(r=>r.pass)&&!mismatches.length;
write(output+'/execution.json',{schemaVersion:1,startedAt,finishedAt:new Date().toISOString(),exitCode:pass?0:1,pass,selectedChecksPassed:pass,processesSequential:true,childProcessesTerminal:results.every(r=>r.exitCode!==null),sourceAndBuildUnchanged:!mismatches.length,changed:mismatches,gameSha256:GAME,suite,missing:manifest.missing,coverageComplete:!manifest.missing.length,results,scope:manifest.scope,requirementVerdict:'No automatic promotion; derived Canvas images need actual review and do not cover DOM fatal HUD.'});
console.log(JSON.stringify({output:label(output),pass,jobs:results.length,missing:manifest.missing}));process.exitCode=pass?0:1;
