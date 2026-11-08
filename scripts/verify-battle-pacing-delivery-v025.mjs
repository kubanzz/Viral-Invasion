import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { checkWorkspaceBuild } from './start-local.mjs';
import { readVerifiedMobileBuild, composeMobileHtml } from './package-mobile.mjs';

const out=resolve('artifacts/battle-pacing-v025');
await mkdir(out,{recursive:true});
const {metadata,outputs}=await readVerifiedMobileBuild();
assert.equal(metadata.version,'0.25.0');
const current=await checkWorkspaceBuild();assert.equal(current.current,true,JSON.stringify(current));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=resolve('.');
const expectedPhone=Buffer.from(composeMobileHtml(outputs.get('index.html').toString(),outputs.get('game.js').toString()));
const report={version:metadata.version,pass:false,sourceValidation:current,desktop:[],mobile:[],archiveReports:[]};
for(const name of ['index.html','game.js','build-meta.json']){
  const expected=await readFile(join(root,'dist',name));
  for(const folder of ['releases/Viral-Invasion-G4-v0.25.0','.tools/release-v0.25.0-verified']){
    const path=join(root,folder,name),actual=await readFile(path);assert(actual.equals(expected),path);
    report.desktop.push({path,bytes:actual.length,sha256:sha(actual),matchesDist:true});
  }
}
for(const folder of ['releases','releases/Viral-Invasion-Mobile-v0.25.0']){
  const path=join(root,folder,'Viral-Invasion-Mobile.html'),actual=await readFile(path);
  assert(actual.equals(expectedPhone),path);report.mobile.push({path,bytes:actual.length,sha256:sha(actual),matchesCurrentBuild:true});
}
for(const path of ['artifacts/releases/v0.25.0/release-package.json','artifacts/battle-pacing-v025/mobile-versioned-package.json','artifacts/mobile-release/package-report.json']){
  const proof=JSON.parse(await readFile(path,'utf8'));assert.equal(proof.version,'0.25.0');assert.equal(proof.sourceValidation.pass,true);
  const zip=proof.zip,bytes=await readFile(zip);assert.equal(sha(bytes),proof.sha256??proof.zipSha256);
  report.archiveReports.push({path,zip,bytes:bytes.length,sha256:sha(bytes),decodedFiles:proof.files.length});
}
report.pass=true;
await writeFile(join(out,'delivery-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,desktopFiles:report.desktop.length,mobileFiles:report.mobile.length,archives:report.archiveReports.length}));
