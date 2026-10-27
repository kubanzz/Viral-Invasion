import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
const output='artifacts/completion-v073/raw-evidence-index-check.json',runner='artifacts/completion-v073/runners/check-raw-evidence.mjs';
if(existsSync(output))throw Error('Preserve prior raw-index audit.');
writeFileSync(runner,readFileSync(new URL(import.meta.url)));
execFileSync('git',['-c','core.longpaths=true','add','--',runner],{windowsHide:true});
const algorithm=execFileSync('git',['rev-parse','--show-object-format'],{encoding:'utf8',windowsHide:true}).trim();
const listing=execFileSync('git',['-c','core.longpaths=true','ls-files','--stage','-z','--','artifacts/completion-v072','artifacts/completion-v073'],{encoding:'utf8',maxBuffer:4*1024*1024,windowsHide:true});
const checks=listing.split('\0').filter(Boolean).map(line=>{
 const[metadata,path]=line.split('\t'),[,indexedOid,stage]=metadata.split(' ');if(stage!=='0')throw Error('Unmerged index: '+path);
 const bytes=readFileSync(path),rawOid=createHash(algorithm).update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 return{path,bytes:bytes.length,indexedOid,rawOid,rawBytesPreserved:rawOid===indexedOid};
});
const mismatches=checks.filter(c=>!c.rawBytesPreserved);
const result={completedAt:new Date().toISOString(),method:'Compare every staged completion-evidence Git blob OID with the object hash of the exact on-disk raw bytes (blob header + raw data). No report content rewritten. Directory-specific -text attributes override global JSON newline normalization; historical CRLF remains exact.',algorithm,checkedFiles:checks.length,pass:mismatches.length===0,mismatches,checks,scope:'Checks the staged audit/evidence trees before evidence commit; excludes this newly generated audit itself. Game production/test/build and original design files are untouched.'};
writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify({pass:result.pass,checkedFiles:checks.length,mismatches:mismatches.length}));if(!result.pass)process.exitCode=1;
