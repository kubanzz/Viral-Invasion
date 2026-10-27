import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';
import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
if(process.argv[2]!=='--apply')throw Error('Explicit apply after all candidateA runners terminate.');
const folder='artifacts/completion-v074/candidate-b-corrections';if(existsSync(folder))throw Error('Preserve prior patch record.');
execFileSync(process.execPath,['.tools/fix-menu-driver-v074.mjs','--apply'],{stdio:'inherit',windowsHide:true});
const hash=b=>createHash('sha256').update(b).digest('hex');mkdirSync(folder,{recursive:true});
const changes=[];
function change(path,old,replacement){const before=readFileSync(path,'utf8');if(!before.includes(old))throw Error('Unexpected source: '+path);const after=before.replace(old,replacement);writeFileSync(path,after);changes.push({path,beforeSha256:hash(before),afterSha256:hash(after),from:old,to:replacement});}
change('src/game/battle.ts','组织抢修成功：器官警报解除，全身稳定缓慢恢复。','器官警报解除；完整度达到 50% 后，全身稳定才会缓慢恢复。');
change('src/game/battleConfig.ts','3 修复组织同时清除附近潜伏体','3 修复组织，同时伤害并显露附近潜伏体');
const path='tests/unit/protocol-synergy-repeat.test.ts';let before=readFileSync(path,'utf8');
if(!before.includes("mkdirSync('artifacts/completion-v074/chain-audit', { recursive: true });")||before.includes('VI_SYNERGY_REPORT_DIR'))throw Error('Unexpected synergy test');
let after=before.replace('// Explicit isolated preset arena',"const evidenceDirectory = process.env.VI_SYNERGY_REPORT_DIR ?? 'artifacts/completion-v074/chain-audit';\n\n// Explicit isolated preset arena")
 .replaceAll("mkdirSync('artifacts/completion-v074/chain-audit', { recursive: true });","mkdirSync(evidenceDirectory, { recursive: true });")
 .replaceAll("writeFileSync('artifacts/completion-v074/chain-audit/pulse-chain-repeats.json'","writeFileSync(evidenceDirectory + '/pulse-chain-repeats.json'")
 .replaceAll("writeFileSync('artifacts/completion-v074/chain-audit/trace-beacon-repeats.json'","writeFileSync(evidenceDirectory + '/trace-beacon-repeats.json'");
writeFileSync(path,after);changes.push({path,beforeSha256:hash(before),afterSha256:hash(after),scope:'Only report destination made configurable to preserve earlier and independent-clean observations. All assertions and gameplay fixtures unchanged.'});
writeFileSync(folder+'/changes.json',JSON.stringify({at:new Date().toISOString(),changes,scope:'Two truthful player hints, one actual keyboard UI driver correction, and isolated unit report locations. No balance, damage, timing or geometry rule changes.'},null,2));
console.log('CandidateB source/test corrections applied after candidateA termination.');
