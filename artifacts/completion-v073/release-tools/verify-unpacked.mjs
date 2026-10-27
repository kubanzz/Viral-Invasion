import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { FILES,RELEASE_FOLDER,ZIP_PATH,FILE_MANIFEST,ARTIFACT_ROOT,EXPECTED_GAME,hash,assertAbsent,verifyFrozenInputs } from './contract.mjs';
import { readZip } from './zip.mjs';

const directory=process.env.VI_RELEASE_UNPACK_DIR??'.tools/release-v073-verify';
const reportPath=process.env.VI_RELEASE_VERIFY_OUTPUT??`${ARTIFACT_ROOT}/release-unpack-validation.json`;
await assertAbsent([directory,reportPath]);
if(!process.argv.includes('--extract')){
  const frozen=await verifyFrozenInputs();
  console.log(JSON.stringify({checked:true,extracted:false,browserStarted:false,gameHash:frozen.gameHash,planned:{zip:ZIP_PATH,directory,reportPath},scope:'Read-only setup check; package may not exist yet. No archive creation/extraction or browser execution.'}));
  process.exit(0);
}
const report={generatedAt:new Date().toISOString(),scope:'Static ZIP/CRC and five-file extraction validation only. No files executed, no browser smoke or qualification performed.',directory,zip:ZIP_PATH,pass:false,files:{}};
try{
  const frozen=await verifyFrozenInputs(),manifest=JSON.parse(await readFile(FILE_MANIFEST,'utf8')),zip=await readFile(ZIP_PATH);
  if(manifest.gameHash!==EXPECTED_GAME||manifest.revision!==frozen.sourceRevision||manifest.zip.sha256!==hash(zip))throw Error('Release manifest/bundle/ZIP provenance mismatch.');
  const entries=readZip(zip,FILES);
  await mkdir(directory,{recursive:false});
  for(const name of FILES){
    const raw=entries.get(name),packaged=await readFile(`${RELEASE_FOLDER}/${name}`);
    if(hash(raw)!==manifest.files[name]||!packaged.equals(raw))throw Error(`Manifest or package-folder mismatch: ${name}`);
    await writeFile(`${directory}/${name}`,raw,{flag:'wx'});
    const extracted=await readFile(`${directory}/${name}`);
    if(!extracted.equals(raw))throw Error(`Unpacked file mismatch: ${name}`);
    const matchesDist=['index.html','game.js','build-meta.json'].includes(name)?extracted.equals(await readFile(`dist/${name}`)):null;
    if(matchesDist===false)throw Error(`Unpacked file differs from frozen dist: ${name}`);
    report.files[name]={sha256:hash(extracted),bytes:extracted.length,matchesManifest:true,matchesPackage:true,matchesDist};
  }
  report.pass=true;report.sourceRevision=frozen.sourceRevision;report.packagingHead=frozen.packagingHead;report.gameHash=frozen.gameHash;report.zipSha256=hash(zip);
}catch(error){report.error=error.stack??String(error);process.exitCode=1;}
await writeFile(reportPath,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({pass:report.pass,directory,reportPath,browserStarted:false,error:report.error??null}));
