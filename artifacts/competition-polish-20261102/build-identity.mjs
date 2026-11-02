import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildIdentity(){
  const metadata=JSON.parse(await readFile(resolve('dist/build-meta.json'),'utf8'));
  const sourceMismatches=[],outputMismatches=[];
  for(const [path,expected]of Object.entries(metadata.sourceManifest))if(hash(await readFile(resolve(path)))!==expected)sourceMismatches.push(path);
  const outputs={};
  for(const [path,expected]of Object.entries(metadata.outputManifest)){const actual=hash(await readFile(resolve('dist',path)));outputs[path]=actual;if(actual!==expected)outputMismatches.push(path);}
  if(sourceMismatches.length||outputMismatches.length)throw new Error(`Build drift: ${JSON.stringify({sourceMismatches,outputMismatches})}`);
  return{outputs,sourceCount:Object.keys(metadata.sourceManifest).length,sourceManifestSha256:hash(JSON.stringify(metadata.sourceManifest)),sourceValidation:true,outputValidation:true,mobileHtmlSha256:hash(await readFile(resolve('releases/Viral-Invasion-Mobile.html')))};
}
