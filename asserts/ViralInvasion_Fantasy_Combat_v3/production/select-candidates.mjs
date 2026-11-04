import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('asserts/ViralInvasion_Fantasy_Combat_v3');
const runs=JSON.parse(await readFile(root+'/production/runs.json','utf8')).runs;
const choices={slimeMage:{side:'left',reason:'Pointed leaning cap and staff give the clearest ranged silhouette.',height:330},nestBuilder:{side:'right',reason:'Paired broad brood sacs and central strap read as a purposeful carrier.',height:320},miniNest:{side:'right',reason:'Low closed four-lobe form differs from the final open mother crown.',height:290},swiftLarva:{side:'left',reason:'Long low three-segment silhouette and swept tail read as swift pursuer.',height:285}};
const sources=[];
const candidates=[];
for(const [key,c] of Object.entries(choices)){
 const r=runs[key+'.candidates'],raw=r.raw[0],m=await sharp(root+'/'+raw.path).metadata();
 const half=Math.floor(m.width/2),crop={left:c.side==='left'?0:half,top:0,width:half,height:m.height};
 sources.push({key:key+'/'+(key==='miniNest'?'fixed':'front_right'),rawPath:raw.path,crop,targetHeightPx:c.height,whiteMin:185,chromaMax:27,runId:r.runId,prompt:r.prompt,candidateSide:c.side,candidateStatus:'selected-by-producer-awaiting-main-renderer',selectionReason:c.reason});
 candidates.push({entity:key,runId:r.runId,selected:c.side,rejected:c.side==='left'?'right':'left',reason:c.reason,selectionScope:'producer-source-design-review',rawPath:raw.path,sha256:raw.sha256});
}
await writeFile(root+'/production/source-spec.json',JSON.stringify({schemaVersion:1,sources},null,2)+'\n');
await writeFile(root+'/production/candidate-selection.json',JSON.stringify({schemaVersion:1,candidates,cannonStatus:'both initial variants rejected for a projectile-like central sphere; empty-cradle revision requested'},null,2)+'\n');
const cr=runs['immuneCannon.candidates'];
const cp=root+'/production/references/immuneCannon-left-selected.png';
await mkdir(path.dirname(cp),{recursive:true});
await sharp(root+'/'+cr.raw[0].path).extract({left:0,top:250,width:1024,height:1350}).png().toFile(cp);
const catalog=JSON.parse(await readFile(root+'/production/prompt-catalog.json','utf8'));
catalog.sources['immuneCannon.emptyCradle']={entity:'immuneCannon',role:'selected-revised-master',reference:[cp],prompt:'基于上传的左款奶白生命荚+灰蓝晶岩炮座，保持一模一样的软哑光水彩画法、暖棕细轮廓、配色、瓣数与视角，输出单个完整设施，正方形居中，脚点约[50%,85%]。必须移除摇篮正中央那颗薄荷绿色圆球/种子/球形突起，那里应是空置的凹陷深薄荷绿叶片槽，凹槽底部是一片与外壳连接的平整弹性叶托，任何位置都不能有独立球体或蛋。这个设施实际弹射玩家本体，因此绝不画玩家、人物、独立炮弹、球、蛋、弹丸、光束、光效或范围圈。让三瓣厚奶白壳形成清楚的空置摇篮，开口固定朝画面右上。保留低矮粗圆灰蓝晶岩底座，总体紧凑，底部地面直径不大于整体可见高度。只画这一只主体，不画左右候选，不画文字。纯白#FFFFFF背景，完全不画地面和投影，不画透明棋盘格，边缘清楚闭合方便精确抠图。'};
await writeFile(root+'/production/prompt-catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({selected:sources.map(s=>s.key),cannonRevision:'immuneCannon.emptyCradle'}));
