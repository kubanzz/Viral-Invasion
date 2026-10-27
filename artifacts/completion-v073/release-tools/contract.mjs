import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const VERSION='0.7.3';
export const EXPECTED_GAME='71615abc92b3f5878f8b199ed0d5bd319d7f9dfe0e1f21d8baf595783b65ca54';
export const SOURCE_REVISION='4da30026696c99b6ad936a9fcd60911cc4f59770';
export const FILES=['index.html','game.js','build-meta.json','README.txt','Open-Game.cmd'];
export const RELEASE_FOLDER=`releases/Viral-Invasion-G4-v${VERSION}`;
export const ZIP_PATH=`${RELEASE_FOLDER}.zip`;
export const ARTIFACT_ROOT='artifacts/completion-v073';
export const FILE_MANIFEST=`${ARTIFACT_ROOT}/release-files.json`;
export const PACKAGE_PROVENANCE=`${ARTIFACT_ROOT}/release-package-provenance.json`;
export const hash=raw=>createHash('sha256').update(raw).digest('hex');
export const hashFile=async path=>hash(await readFile(path));
export async function assertAbsent(paths){
  for(const path of paths){try{await access(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}throw Error(`Preserve historical output; already exists: ${path}`);}
}
export async function verifyFrozenInputs(){
  const buildRaw=await readFile('dist/build-meta.json'),build=JSON.parse(buildRaw.toString('utf8'));
  const gameHash=await hashFile('dist/game.js');
  if(build.version!==VERSION||gameHash!==EXPECTED_GAME)throw Error('Current dist is not the frozen v0.7.3 qualification bundle.');
  const sourceInputs=[];
  for(const [path,sha256] of Object.entries(build.sourceManifest)){
    const currentSha256=await hashFile(path);
    const committedSha256=hash(execFileSync('git',['show',`${SOURCE_REVISION}:${path}`],{maxBuffer:16*1024*1024}));
    if(currentSha256!==sha256||committedSha256!==sha256)throw Error(`Frozen build source differs in working tree or source revision: ${path}`);
    sourceInputs.push({path,sha256,currentMatches:true,sourceRevisionMatches:true});
  }
  const html=(await readFile('dist/index.html','utf8'));
  // The offline builder inlines CSS. A stale unreferenced dist/game.css is not
  // one of the five delivered files, and this check never deletes it.
  const links=[...html.matchAll(/<link\b[^>]*>/gi)].map(match=>match[0]);
  const unsupportedLink=links.some(tag=>{const href=tag.match(/\bhref\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];return !/\brel\s*=\s*["']icon["']/i.test(tag)||!href?.startsWith('data:image/svg+xml,');});
  if(unsupportedLink||/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html)||/<script\b[^>]*\btype\s*=\s*["']module/i.test(html))throw Error('Offline index has external resources or an unsupported module entry.');
  const scriptSources=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(match=>match[1]);
  if(scriptSources.length!==1||scriptSources[0]!=='./game.js'&&scriptSources[0]!=='game.js')throw Error(`Unexpected script resources: ${JSON.stringify(scriptSources)}`);
  return{version:VERSION,sourceRevision:SOURCE_REVISION,packagingHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),gameHash,build,buildMetaSha256:hash(buildRaw),sourceInputs,
    scope:'Read-only frozen input validation. Source revision is verified per build input; packaging HEAD is recorded independently. No build, browser, tests, publish or Git push.'};
}
