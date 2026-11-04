import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const paths=['src/render/phaserRenderer.ts','src/render/actorAnimation.ts','src/render/heroAnimation.ts','src/render/spriteGeometry.ts','src/render/phaserHost.ts','scripts/art-sync.mjs',
  'tests/fixtures/actorAnimationAssets.ts','tests/unit/actor-animation.test.ts','tests/unit/native-art-dispatch.test.ts','tests/unit/art-pipeline.test.ts'];
const files=await Promise.all(paths.map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
const report={schemaVersion:1,status:'code-frozen-waiting-stable115-art-handoff',createdAt:new Date().toISOString(),scope:'Owned actor renderer, animation/registration library, offline art pipeline and meaningful dispatch fixtures. Selection and generated runtime are deliberately not frozen until the parent hands off stable115 assets.',
  verification:{latestActorNativeHeroTests:'109/109 passed2026-11-03 09:31 local',latestTypecheck:'passed2026-11-03 09:31 local',artPipelineTests:'14/14 passed after canonical group validation change; production image pins must be rechecked after stable art handoff'},
  remaining:['Bind stable115 handoff and retain only specifically reviewed SHA approvals','Review latest back18 and neutral thinRay8 actual Renderer output','Remove all4 preview masters after final asset approval','Final normal-mode exact115 ready/no fallback/no old-source verification remains with parent release workflow'],files};
await writeFile('artifacts/territory-20261103/actor-code-freeze.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,files}));
