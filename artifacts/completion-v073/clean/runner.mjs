import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
const workspace=process.cwd(), revision='4da30026696c99b6ad936a9fcd60911cc4f59770';
const folder=resolve('artifacts/completion-v073/clean'), clone=resolve('.tools/completion-clean-v073');
if(existsSync(folder)||existsSync(clone))throw Error('Preserve prior clean clone attempt.');
mkdirSync(folder,{recursive:true});
writeFileSync(join(folder,'runner.mjs'),readFileSync(new URL(import.meta.url)));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const expected=Object.fromEntries(['game.js','index.html','build-meta.json'].map(p=>[p,hash('dist/'+p)]));
const env={...process.env};const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')??'PATH';
env[pathKey]=[dirname(process.execPath),resolve('.tools/node_modules/npm/bin'),env[pathKey]].join(';');
const npmCli=resolve('.tools/node_modules/npm/bin/npm-cli.js');
const commands=[];
async function run(label,exe,args,cwd){
 const startedAt=new Date().toISOString();let log='';
 const child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 for(const stream of[child.stdout,child.stderr])stream.on('data',b=>{log+=b.toString();process.stdout.write(b);});
 const exitCode=await new Promise((r,j)=>{child.once('error',j);child.once('close',r);});
 writeFileSync(join(folder,label+'.log'),log);
 const entry={command:[exe,...args],startedAt,endedAt:new Date().toISOString(),exitCode,log:label+'.log'};
 commands.push(entry);writeFileSync(join(folder,'commands.json'),JSON.stringify(commands,null,2));
 if(exitCode!==0)throw Error(label+' failed: '+exitCode);
}
await run('01-clone','git',['clone','--no-hardlinks','--no-checkout',workspace,clone],workspace);
await run('02-longpaths','git',['config','core.longpaths','true'],clone);
await run('03-checkout','git',['checkout','--detach',revision],clone);
const git=(...args)=>execFileSync('git',args,{cwd:clone,encoding:'utf8',windowsHide:true}).trim();
if(git('rev-parse','HEAD')!==revision||git('status','--porcelain'))throw Error('Fresh checkout not clean at expected revision.');
await run('04-npm-ci',process.execPath,[npmCli,'ci'],clone);
await run('05-npm-build',process.execPath,[npmCli,'run','build'],clone);
const cloneMeta=JSON.parse(readFileSync(join(clone,'dist/build-meta.json')));
const build=Object.fromEntries(Object.entries(expected).map(([p,sha256])=>[p,{expected:sha256,actual:hash(join(clone,'dist',p)),equal:sha256===hash(join(clone,'dist',p))}]));
if(cloneMeta.version!=='0.7.3'||Object.values(build).some(v=>!v.equal))throw Error('Fresh build mismatch.');
Object.assign(env,{VI_SYSTEM_REPORT:join(folder,'full-system-seeds.json'),VI_G2_REPORT:join(folder,'g2-noncounter-routes.json'),VI_TRACE_CUE_EVIDENCE:join(folder,'trace-cue-derived.json')});
await run('06-npm-test',process.execPath,[npmCli,'test','--','--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+join(folder,'unit.json')],clone);
const unit=JSON.parse(readFileSync(join(folder,'unit.json'))),sessions=JSON.parse(readFileSync(join(folder,'full-system-seeds.json')));
const result={completedAt:new Date().toISOString(),revision,clone,commands,node:process.version,
 method:'Independent local clone, clone-local longpaths configured before checkout; fresh npm ci/build/full npm test. Current working dependencies and dist are not reused. No main source, tests or dist mutation. Functional browser concurrency is not an FPS qualification.',
 build,buildInputCount:Object.keys(cloneMeta.sourceManifest).length,
 inputs:Object.fromEntries(Object.entries(cloneMeta.sourceManifest).map(([p,sha])=>[p,{expected:sha,clone:hash(join(clone,p)),workspace:hash(join(workspace,p)),equal:hash(join(clone,p))===sha&&hash(join(workspace,p))===sha}])),
 tests:{success:unit.success,files:unit.testResults.length,passed:unit.numPassedTests,failed:unit.numFailedTests,nonBatch:unit.numPassedTests-1},
 sessions:{complete:sessions.complete,completed:sessions.completedSeeds,outcomes:sessions.outcomes},
 trackedStatus:git('status','--porcelain'),originalDesignChanges:git('diff','--name-only','HEAD','--','DesignDoc_v1.3'),
 scope:'The batch is one test containing1000 formal TypeScript sessions, not1000 browsers. Dev HTTP and normal stop remain separate until actually executed.'};
result.allChecksPassed=result.tests.success&&result.tests.files===44&&result.tests.passed===369&&result.tests.failed===0&&result.trackedStatus===''&&Object.values(result.inputs).every(v=>v.equal)&&Object.values(build).every(v=>v.equal);
writeFileSync(join(folder,'summary.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({clean:result.allChecksPassed,tests:result.tests,sessions:result.sessions}));
if(!result.allChecksPassed)process.exitCode=1;
