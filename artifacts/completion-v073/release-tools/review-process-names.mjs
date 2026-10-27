import {execFileSync} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
const directory='artifacts/completion-v073/performance/attempt-1';
const raw=execFileSync('tasklist.exe',['/fo','csv','/nh'],{encoding:'utf8'});
const names=raw.split(/\r?\n/).map(line=>line.match(/^"([^"]+)"/)?.[1]?.toLowerCase()).filter(Boolean);
const execution=JSON.parse(await readFile(`${directory}/execution.json`,'utf8'));
const result={checkedAt:new Date().toISOString(),method:'Read-only native Windows tasklist executable-name counts; no command-line attribution.',
  chromeProcesses:names.filter(name=>name==='chrome.exe').length,edgeProcesses:names.filter(name=>name==='msedge.exe').length,
  pressureWrapperExitCode:execution.exitCode,pressureWrapperPass:execution.pass,
  priorCimScript:{completed:false,reason:'Local PowerShell execution policy blocked the .ps1 launch. No execution-policy change or bypass flag was used.'},
  scope:'Zero Chrome/Edge image counts prove none were running at this snapshot. Wrapper child returned after its browser.close finally. Other Node processes are not identified as test processes by this name-only check.'};
await writeFile(`${directory}/process-review.json`,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify(result));
